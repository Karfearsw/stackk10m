var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/db.ts
var db_exports = {};
__export(db_exports, {
  databaseUrl: () => databaseUrl,
  databaseUrlResolution: () => databaseUrlResolution,
  db: () => db,
  pool: () => pool,
  sanitizeDatabaseUrl: () => sanitizeDatabaseUrl
});
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";
import crypto from "node:crypto";
function sanitizeDatabaseUrl(input) {
  if (!input) return input;
  try {
    const u = new URL(input);
    const channelBinding = (u.searchParams.get("channel_binding") || "").toLowerCase();
    if (channelBinding === "require") {
      u.searchParams.delete("channel_binding");
      return u.toString();
    }
    return input;
  } catch {
    return void 0;
  }
}
function isValidPostgresUrl(input) {
  if (!input) return false;
  try {
    const u = new URL(input);
    return u.protocol === "postgres:" || u.protocol === "postgresql:";
  } catch {
    return false;
  }
}
function redactDbUrlForLogs(input) {
  try {
    const u = new URL(input);
    const db2 = u.pathname ? u.pathname.replace(/^\//, "") : "";
    return { host: u.host, db: db2 };
  } catch {
    return { host: null, db: null };
  }
}
function databaseUrlResolution() {
  if (cachedDbUrlResolution) return cachedDbUrlResolution;
  const candidates = [
    { name: "POSTGRES_URL_NON_POOLING", value: process.env.POSTGRES_URL_NON_POOLING },
    { name: "POSTGRES_URL", value: process.env.POSTGRES_URL },
    { name: "DATABASE_URL", value: process.env.DATABASE_URL },
    { name: "POSTGRES_PRISMA_URL", value: process.env.POSTGRES_PRISMA_URL }
  ];
  const issues = [];
  for (const c of candidates) {
    const raw = String(c.value ?? "").trim();
    if (!raw) continue;
    if (!isValidPostgresUrl(raw)) {
      issues.push({ name: c.name, reason: "invalid_url" });
      continue;
    }
    const sanitized = sanitizeDatabaseUrl(raw);
    if (!sanitized) {
      issues.push({ name: c.name, reason: "invalid_url" });
      continue;
    }
    const resolved = { url: sanitized, source: c.name, issues };
    cachedDbUrlResolution = resolved;
    const redacted = redactDbUrlForLogs(sanitized);
    console.log(
      JSON.stringify({
        ts: (/* @__PURE__ */ new Date()).toISOString(),
        event: "db_url",
        kind: "resolved",
        source: c.name,
        host: redacted.host,
        db: redacted.db,
        rejected: issues.length ? issues : void 0
      })
    );
    return resolved;
  }
  cachedDbUrlResolution = { url: void 0, source: null, issues };
  console.error(
    JSON.stringify({
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      event: "db_url",
      kind: "missing",
      rejected: issues.length ? issues : void 0
    })
  );
  return cachedDbUrlResolution;
}
function databaseUrl() {
  return databaseUrlResolution().url;
}
function getSqlText(input) {
  if (!input) return "";
  if (typeof input === "string") return input;
  if (typeof input === "object" && input.text) return String(input.text || "");
  return "";
}
function isRetryableDbError(err) {
  const code = String(err?.code || "").trim();
  if (!code) return false;
  return code === "57P01" || code === "57P02" || code === "57P03" || code === "53300" || code === "55000" || code === "08000" || code === "08003" || code === "08006" || code === "08001";
}
function isSelectSql(sqlText) {
  const s = String(sqlText || "").trimStart().toLowerCase();
  return s.startsWith("select") || s.startsWith("with");
}
function poolSnapshot(p) {
  return { total: p.totalCount, idle: p.idleCount, waiting: p.waitingCount };
}
function logDbEvent(level, payload) {
  const line = JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), event: "db", ...payload });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
var cachedDbUrlResolution, isVercel, poolMax, poolIdleTimeoutMs, poolConnTimeoutMs, statementTimeoutMs, idleInTxTimeoutMs, slowQueryMs, enableQueryTiming, enableSelectRetry, enableStartupTest, pool, originalQuery, db;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    cachedDbUrlResolution = null;
    isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
    poolMax = parseInt(process.env.DB_POOL_MAX || (isVercel ? "1" : "10"), 10);
    poolIdleTimeoutMs = parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS || "10000", 10);
    poolConnTimeoutMs = parseInt(
      process.env.DB_POOL_CONN_TIMEOUT_MS || process.env.DB_CONNECTION_TIMEOUT_MS || "20000",
      10
    );
    statementTimeoutMs = parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || "15000", 10);
    idleInTxTimeoutMs = parseInt(process.env.DB_IDLE_IN_TX_TIMEOUT_MS || "15000", 10);
    slowQueryMs = parseInt(process.env.DB_SLOW_QUERY_MS || "250", 10);
    enableQueryTiming = process.env.DB_QUERY_TIMING !== "false";
    enableSelectRetry = process.env.DB_RETRY_SELECTS !== "false";
    enableStartupTest = process.env.DB_STARTUP_TEST !== "false" && !isVercel;
    pool = new Pool({
      connectionString: databaseUrl(),
      max: poolMax,
      idleTimeoutMillis: poolIdleTimeoutMs,
      connectionTimeoutMillis: poolConnTimeoutMs
    });
    pool.on("error", (err) => {
      logDbEvent("error", { kind: "pool_error", message: String(err?.message || err), code: err?.code || null, pool: poolSnapshot(pool) });
    });
    pool.on("connect", (client2) => {
      const statements = [];
      if (statementTimeoutMs > 0) statements.push(`SET statement_timeout TO ${statementTimeoutMs}`);
      if (idleInTxTimeoutMs > 0) statements.push(`SET idle_in_transaction_session_timeout TO ${idleInTxTimeoutMs}`);
      const appName = String(process.env.DB_APPLICATION_NAME || "").trim();
      if (appName) statements.push(`SET application_name TO '${appName.replace(/'/g, "''")}'`);
      if (!statements.length) return;
      client2.query(statements.join("; ")).catch((err) => {
        logDbEvent("warn", { kind: "session_settings_failed", message: String(err?.message || err), code: err?.code || null });
      });
    });
    originalQuery = pool.query.bind(pool);
    pool.query = (async (...args) => {
      const sqlText = getSqlText(args[0]);
      const sqlHash = sqlText ? crypto.createHash("sha256").update(sqlText).digest("hex").slice(0, 16) : null;
      const started2 = enableQueryTiming ? performance.now() : 0;
      try {
        const result = await originalQuery(...args);
        if (enableQueryTiming) {
          const durationMs = performance.now() - started2;
          if (durationMs >= slowQueryMs) {
            logDbEvent("warn", {
              kind: "slow_query",
              durationMs: Math.round(durationMs),
              rowCount: Number(result?.rowCount ?? 0),
              sqlHash,
              pool: poolSnapshot(pool)
            });
          }
        }
        return result;
      } catch (err) {
        const durationMs = enableQueryTiming ? performance.now() - started2 : null;
        logDbEvent("error", {
          kind: "query_error",
          durationMs: durationMs != null ? Math.round(durationMs) : null,
          message: String(err?.message || err),
          code: err?.code || null,
          sqlHash,
          pool: poolSnapshot(pool)
        });
        if (enableSelectRetry && isRetryableDbError(err) && isSelectSql(sqlText)) {
          await new Promise((resolve2) => setTimeout(resolve2, 150));
          return await originalQuery(...args);
        }
        throw err;
      }
    });
    if (enableStartupTest) {
      pool.connect().then((client2) => {
        logDbEvent("info", { kind: "startup_connect_ok", pool: poolSnapshot(pool) });
        client2.release();
      }).catch((err) => {
        logDbEvent("error", { kind: "startup_connect_failed", message: String(err?.message || err), code: err?.code || null, pool: poolSnapshot(pool) });
      });
    }
    db = drizzle(pool);
  }
});

// server/scripts/apply-migrations.ts
var apply_migrations_exports = {};
__export(apply_migrations_exports, {
  applyMigrations: () => applyMigrations
});
import dotenv from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
function splitSqlStatements(input) {
  const out = [];
  let cur = "";
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag = null;
  const s = String(input || "");
  while (i < s.length) {
    const ch = s[i];
    const next = i + 1 < s.length ? s[i + 1] : "";
    if (inLineComment) {
      cur += ch;
      if (ch === "\n") inLineComment = false;
      i += 1;
      continue;
    }
    if (inBlockComment) {
      cur += ch;
      if (ch === "*" && next === "/") {
        cur += next;
        i += 2;
        inBlockComment = false;
        continue;
      }
      i += 1;
      continue;
    }
    if (!inSingle && !inDouble && !dollarTag) {
      if (ch === "-" && next === "-") {
        cur += ch + next;
        i += 2;
        inLineComment = true;
        continue;
      }
      if (ch === "/" && next === "*") {
        cur += ch + next;
        i += 2;
        inBlockComment = true;
        continue;
      }
    }
    if (!inDouble && !dollarTag && ch === "'") {
      cur += ch;
      if (inSingle && next === "'") {
        cur += next;
        i += 2;
        continue;
      }
      inSingle = !inSingle;
      i += 1;
      continue;
    }
    if (!inSingle && !dollarTag && ch === '"') {
      cur += ch;
      if (inDouble && next === '"') {
        cur += next;
        i += 2;
        continue;
      }
      inDouble = !inDouble;
      i += 1;
      continue;
    }
    if (!inSingle && !inDouble && ch === "$") {
      const tail2 = s.slice(i);
      const m = tail2.match(/^\$[A-Za-z0-9_]*\$/);
      if (m?.[0]) {
        const tag = m[0];
        cur += tag;
        i += tag.length;
        if (dollarTag === tag) dollarTag = null;
        else if (!dollarTag) dollarTag = tag;
        continue;
      }
    }
    if (!inSingle && !inDouble && !dollarTag && ch === ";") {
      const stmt = cur.trim();
      if (stmt) out.push(stmt);
      cur = "";
      i += 1;
      continue;
    }
    cur += ch;
    i += 1;
  }
  const tail = cur.trim();
  if (tail) out.push(tail);
  return out;
}
async function applyMigrations() {
  const dir = join(frameworkRoot, "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  console.log(`Migrations directory: ${dir} (${files.length} .sql files)`);
  const { pool: pool2 } = await Promise.resolve().then(() => (init_db(), db_exports));
  const vercelEnv = String(process.env.VERCEL_ENV || "").trim().toLowerCase();
  const tracked = vercelEnv === "production";
  if (tracked) {
    await pool2.query(
      "CREATE TABLE IF NOT EXISTS applied_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
    );
  }
  for (const f of files) {
    if (tracked) {
      const already = await pool2.query("select 1 as ok from applied_migrations where filename = $1 limit 1", [f]);
      if (already?.rows?.length) {
        console.log(`Skipping already applied migration: ${f}`);
        continue;
      }
    }
    const p = join(dir, f);
    const sql8 = readFileSync(p, "utf8");
    console.log(`Applying migration: ${f}`);
    try {
      const statements = splitSqlStatements(sql8);
      await pool2.query("BEGIN");
      for (let idx = 0; idx < statements.length; idx += 1) {
        const stmt = statements[idx];
        try {
          await pool2.query(stmt);
        } catch (e) {
          const code = String(e?.code || "");
          const msg = String(e?.message || "");
          const alreadyExists = code === "42710" || code === "42P07" || code === "42701" || /already exists/i.test(msg);
          if (alreadyExists) continue;
          const preview = stmt.replace(/\s+/g, " ").slice(0, 220);
          console.error(
            JSON.stringify({
              ts: (/* @__PURE__ */ new Date()).toISOString(),
              event: "migration_failed",
              file: f,
              statementIndex: idx,
              code: code || null,
              message: msg || null,
              preview
            })
          );
          throw e;
        }
      }
      await pool2.query("COMMIT");
      if (tracked) {
        await pool2.query("insert into applied_migrations(filename) values($1) on conflict (filename) do nothing", [f]);
      }
      console.log(`Applied: ${f}`);
    } catch (e) {
      try {
        await pool2.query("ROLLBACK");
      } catch {
      }
      const code = String(e?.code || "");
      const msg = String(e?.message || "");
      const alreadyExists = code === "42710" || code === "42P07" || code === "42701" || /already exists/i.test(msg);
      if (alreadyExists) {
        console.log(`Skipped: ${f}`);
        continue;
      }
      throw e;
    }
  }
}
function isMain() {
  const self = resolve(fileURLToPath(import.meta.url));
  const argv = process.argv[1] ? resolve(process.argv[1]) : "";
  return self === argv;
}
var frameworkRoot;
var init_apply_migrations = __esm({
  "server/scripts/apply-migrations.ts"() {
    "use strict";
    frameworkRoot = fileURLToPath(new URL("../..", import.meta.url));
    dotenv.config({ path: join(frameworkRoot, ".env") });
    if (isMain()) {
      applyMigrations().then(() => {
        console.log("All migrations applied");
      }).catch((e) => {
        console.error("Migration failed", e);
        process.exitCode = 1;
      });
    }
  }
});

// server/services/telecom/video.ts
var video_exports = {};
__export(video_exports, {
  telnyxVideo: () => telnyxVideo
});
var TelnyxVideoService, telnyxVideo;
var init_video = __esm({
  "server/services/telecom/video.ts"() {
    "use strict";
    TelnyxVideoService = class {
      videoBaseUrl = "https://api.telnyx.com/v1/video";
      headers() {
        const apiKey = process.env.TELNYX_API_KEY || "";
        return {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        };
      }
      requireConfigured() {
        if (!process.env.TELNYX_API_KEY) {
          throw new Error("TELNYX_API_KEY is required for Video rooms");
        }
        const enabled = (process.env.TELNYX_VIDEO_ENABLED || "").trim().toLowerCase();
        if (enabled !== "true" && enabled !== "1" && enabled !== "yes" && enabled !== "on") {
          throw new Error(
            "Telnyx Video is not enabled. Set TELNYX_VIDEO_ENABLED=true in your environment."
          );
        }
      }
      async createRoom(input) {
        this.requireConfigured();
        const body = {
          name: input.name,
          type: "group"
        };
        if (input.maxParticipants) {
          body.max_participants = input.maxParticipants;
        }
        const res = await fetch(`${this.videoBaseUrl}/rooms`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15e3)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = data?.errors?.[0]?.title || data?.error || data?.message || `Telnyx video room creation failed (${res.status})`;
          throw new Error(msg);
        }
        const room = data?.data || data;
        return {
          roomId: String(room?.id || ""),
          roomSid: String(room?.room_sid || room?.sid || ""),
          name: String(room?.name || input.name),
          maxParticipants: Number(room?.max_participants || input.maxParticipants || 2)
        };
      }
      async getJoinToken(roomId, identity) {
        this.requireConfigured();
        const body = {
          room_id: roomId,
          identity
        };
        const res = await fetch(`${this.videoBaseUrl}/rooms/${encodeURIComponent(roomId)}/tokens`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15e3)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = data?.errors?.[0]?.title || data?.error || data?.message || `Telnyx join token creation failed (${res.status})`;
          throw new Error(msg);
        }
        return {
          token: String(data?.data?.token || data?.token || ""),
          roomId,
          identity
        };
      }
      async endRoom(roomId) {
        this.requireConfigured();
        const res = await fetch(
          `${this.videoBaseUrl}/rooms/${encodeURIComponent(roomId)}`,
          {
            method: "DELETE",
            headers: this.headers(),
            signal: AbortSignal.timeout(1e4)
          }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const msg = data?.errors?.[0]?.title || data?.error || data?.message || `Telnyx room end failed (${res.status})`;
          throw new Error(msg);
        }
      }
      async getRoom(roomId) {
        this.requireConfigured();
        const res = await fetch(
          `${this.videoBaseUrl}/rooms/${encodeURIComponent(roomId)}`,
          {
            method: "GET",
            headers: this.headers(),
            signal: AbortSignal.timeout(1e4)
          }
        );
        if (!res.ok) return null;
        const data = await res.json().catch(() => ({}));
        return data?.data || data || null;
      }
      async healthCheck() {
        const apiKey = process.env.TELNYX_API_KEY || "";
        const enabled = (process.env.TELNYX_VIDEO_ENABLED || "").trim().toLowerCase();
        const isEnabled = enabled === "true" || enabled === "1" || enabled === "yes" || enabled === "on";
        if (!apiKey) {
          return {
            configured: false,
            reachable: false,
            roomsApiAvailable: false,
            blocker: "TELNYX_API_KEY is required for Video rooms."
          };
        }
        if (!isEnabled) {
          return {
            configured: false,
            reachable: false,
            roomsApiAvailable: false,
            blocker: "Telnyx Video is not enabled. Confirm Video API access in the Telnyx portal, then set TELNYX_VIDEO_ENABLED=true."
          };
        }
        try {
          const res = await fetch(`${this.videoBaseUrl}/rooms`, {
            method: "GET",
            headers: this.headers(),
            signal: AbortSignal.timeout(1e4)
          });
          if (res.status === 401 || res.status === 403) {
            return {
              configured: true,
              reachable: false,
              roomsApiAvailable: false,
              blocker: "Telnyx API key lacks Video API permissions."
            };
          }
          if (res.ok) {
            return {
              configured: true,
              reachable: true,
              roomsApiAvailable: true
            };
          }
          return {
            configured: true,
            reachable: false,
            roomsApiAvailable: false,
            blocker: `Telnyx Video API returned ${res.status}.`
          };
        } catch (err) {
          const msg = err?.message || String(err);
          return {
            configured: true,
            reachable: false,
            roomsApiAvailable: false,
            blocker: `Telnyx Video API unreachable: ${msg}`
          };
        }
      }
    };
    telnyxVideo = new TelnyxVideoService();
  }
});

// server/app.ts
init_db();
import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";

// server/routes.ts
import { createServer } from "http";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify as jwtVerify2 } from "jose";
import multer from "multer";
import { createRequire } from "node:module";

// server/storage.ts
init_db();
import { asc, desc, sql as sql2 } from "drizzle-orm";

// server/shared-schema.ts
import { sql } from "drizzle-orm";
import { pgTable, serial, text, varchar, integer, decimal, timestamp, boolean, date, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var leads = pgTable("leads", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  address: varchar("address", { length: 255 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  state: varchar("state", { length: 2 }).notNull(),
  zipCode: varchar("zip_code", { length: 10 }).notNull(),
  ownerName: varchar("owner_name", { length: 255 }).notNull(),
  ownerPhone: varchar("owner_phone", { length: 20 }),
  ownerEmail: varchar("owner_email", { length: 255 }),
  estimatedValue: decimal("estimated_value", { precision: 12, scale: 2 }),
  relasScore: integer("relas_score"),
  motivation: varchar("motivation", { length: 50 }),
  status: varchar("status", { length: 50 }).default("new"),
  notes: text("notes"),
  source: varchar("source", { length: 100 }),
  assignedTo: integer("assigned_to"),
  archivedAt: timestamp("archived_at"),
  statusChangedAt: timestamp("status_changed_at"),
  leadType: varchar("lead_type", { length: 50 }),
  county: varchar("county", { length: 100 }),
  ownerOccupied: boolean("owner_occupied"),
  doNotCall: boolean("do_not_call").notNull().default(false),
  doNotText: boolean("do_not_text").notNull().default(false),
  doNotEmail: boolean("do_not_email").notNull().default(false),
  lastTouchAt: timestamp("last_touch_at"),
  nextTouchAt: timestamp("next_touch_at"),
  nextFollowUpAt: timestamp("next_follow_up_at"),
  tags: text("tags").array(),
  dedupeKey: varchar("dedupe_key", { length: 400 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertLeadSchema = createInsertSchema(leads).omit({ id: true, createdAt: true, updatedAt: true });
var leadNotes = pgTable("lead_notes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  leadId: integer("lead_id").notNull(),
  createdBy: integer("created_by"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow()
});
var insertLeadNoteSchema = createInsertSchema(leadNotes).omit({ id: true, createdAt: true });
var savedViews = pgTable("saved_views", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  entityType: varchar("entity_type", { length: 32 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  ownerUserId: integer("owner_user_id").notNull(),
  teamId: integer("team_id"),
  visibility: varchar("visibility", { length: 20 }).notNull().default("private"),
  shareToken: varchar("share_token", { length: 64 }),
  configJson: jsonb("config_json").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertSavedViewSchema = createInsertSchema(savedViews).omit({ id: true, createdAt: true, updatedAt: true });
var leadBulkActionJobs = pgTable("lead_bulk_action_jobs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  createdBy: integer("created_by").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("queued"),
  action: varchar("action", { length: 50 }).notNull(),
  selectionScope: varchar("selection_scope", { length: 32 }).notNull(),
  leadIds: jsonb("lead_ids"),
  filterJson: jsonb("filter_json"),
  totalTargets: integer("total_targets").default(0),
  processed: integer("processed").default(0),
  succeeded: integer("succeeded").default(0),
  failed: integer("failed").default(0),
  resultJson: jsonb("result_json"),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertLeadBulkActionJobSchema = createInsertSchema(leadBulkActionJobs).omit({ id: true, createdAt: true, updatedAt: true });
var aiActionLogs = pgTable("ai_action_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  createdBy: integer("created_by").notNull(),
  entityType: varchar("entity_type", { length: 32 }).notNull(),
  transcript: text("transcript").notNull(),
  parsedJson: jsonb("parsed_json").notNull(),
  selectionJson: jsonb("selection_json").notNull(),
  appliedJson: jsonb("applied_json"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertAiActionLogSchema = createInsertSchema(aiActionLogs).omit({ id: true, createdAt: true });
var aiActionUndo = pgTable("ai_action_undo", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  aiActionLogId: integer("ai_action_log_id").notNull(),
  undoJson: jsonb("undo_json").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  undoneAt: timestamp("undone_at")
});
var insertAiActionUndoSchema = createInsertSchema(aiActionUndo).omit({ id: true });
var appAuditRuns = pgTable("app_audit_runs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  createdBy: integer("created_by").notNull(),
  scopeJson: jsonb("scope_json").notNull(),
  createdAt: timestamp("created_at").defaultNow()
});
var insertAppAuditRunSchema = createInsertSchema(appAuditRuns).omit({ id: true, createdAt: true });
var appAuditFindings = pgTable("app_audit_findings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  runId: integer("run_id").notNull(),
  severity: varchar("severity", { length: 20 }).notNull(),
  area: varchar("area", { length: 80 }).notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  description: text("description").notNull(),
  recommendation: text("recommendation"),
  technicalNotes: text("technical_notes"),
  affectedPages: jsonb("affected_pages").notNull().default(sql`'[]'::jsonb`),
  fixPlan: text("fix_plan"),
  ownerUserId: integer("owner_user_id"),
  prdSection: text("prd_section"),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertAppAuditFindingSchema = createInsertSchema(appAuditFindings).omit({ id: true, createdAt: true, updatedAt: true });
var properties = pgTable("properties", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  address: varchar("address", { length: 255 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  state: varchar("state", { length: 2 }).notNull(),
  zipCode: varchar("zip_code", { length: 10 }).notNull(),
  beds: integer("beds"),
  baths: integer("baths"),
  sqft: integer("sqft"),
  price: decimal("price", { precision: 12, scale: 2 }),
  status: varchar("status", { length: 50 }).default("active"),
  apn: varchar("apn", { length: 100 }),
  yearBuilt: integer("year_built"),
  propertyType: varchar("property_type", { length: 50 }),
  condition: varchar("condition", { length: 50 }),
  latitude: decimal("latitude", { precision: 9, scale: 6 }),
  longitude: decimal("longitude", { precision: 9, scale: 6 }),
  soldPrice: decimal("sold_price", { precision: 12, scale: 2 }),
  soldDate: date("sold_date"),
  rentPerMonth: decimal("rent_per_month", { precision: 12, scale: 2 }),
  rentedDate: date("rented_date"),
  lotSize: varchar("lot_size", { length: 50 }),
  occupancy: varchar("occupancy", { length: 50 }),
  images: text("images").array(),
  arv: decimal("arv", { precision: 12, scale: 2 }),
  repairCost: decimal("repair_cost", { precision: 12, scale: 2 }),
  assignedTo: integer("assigned_to"),
  sourceLeadId: integer("source_lead_id"),
  leadSource: varchar("lead_source", { length: 100 }),
  leadSourceDetail: varchar("lead_source_detail", { length: 255 }),
  notes: text("notes"),
  dedupeKey: varchar("dedupe_key", { length: 400 }),
  opportunityType: varchar("opportunity_type", { length: 50 }).default("acquisition"),
  stage: varchar("stage", { length: 50 }).default("lead"),
  opportunityStatus: varchar("opportunity_status", { length: 50 }).default("active"),
  internalSummary: text("internal_summary"),
  askingPrice: decimal("asking_price", { precision: 12, scale: 2 }),
  targetDispositionPrice: decimal("target_disposition_price", { precision: 12, scale: 2 }),
  earnestMoney: decimal("earnest_money", { precision: 12, scale: 2 }),
  closingDate: timestamp("closing_date"),
  inspectionDeadline: timestamp("inspection_deadline"),
  nextActionAt: timestamp("next_action_at"),
  lastActivityAt: timestamp("last_activity_at"),
  stageChangedAt: timestamp("stage_changed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var crmImportJobs = pgTable("crm_import_jobs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  entityType: varchar("entity_type", { length: 32 }).notNull(),
  createdBy: integer("created_by").notNull(),
  status: varchar("status", { length: 32 }).default("queued"),
  originalFilename: varchar("original_filename", { length: 255 }),
  fileMimeType: varchar("file_mime_type", { length: 100 }),
  fileBase64: text("file_base64").notNull(),
  mapping: text("mapping").notNull(),
  options: text("options").notNull(),
  totalRows: integer("total_rows"),
  processedRows: integer("processed_rows").default(0),
  createdCount: integer("created_count").default(0),
  updatedCount: integer("updated_count").default(0),
  skippedCount: integer("skipped_count").default(0),
  errorCount: integer("error_count").default(0),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertCrmImportJobSchema = createInsertSchema(crmImportJobs).omit({ id: true, createdAt: true, updatedAt: true });
var crmImportJobErrors = pgTable("crm_import_job_errors", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  jobId: integer("job_id").notNull(),
  rowNumber: integer("row_number").notNull(),
  errors: text("errors").notNull(),
  rawRow: text("raw_row"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertCrmImportJobErrorSchema = createInsertSchema(crmImportJobErrors).omit({ id: true, createdAt: true });
var crmExportFiles = pgTable("crm_export_files", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  entityType: varchar("entity_type", { length: 32 }).notNull(),
  createdBy: integer("created_by").notNull(),
  status: varchar("status", { length: 32 }).default("queued"),
  format: varchar("format", { length: 16 }).notNull(),
  filename: varchar("filename", { length: 255 }),
  mimeType: varchar("mime_type", { length: 100 }),
  contentBase64: text("content_base64"),
  tokenHash: varchar("token_hash", { length: 64 }),
  expiresAt: timestamp("expires_at"),
  filters: text("filters").notNull(),
  columns: text("columns").notNull(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertCrmExportFileSchema = createInsertSchema(crmExportFiles).omit({ id: true, createdAt: true, updatedAt: true });
var insertPropertySchema = createInsertSchema(properties).omit({ id: true, createdAt: true, updatedAt: true });
var skipTraceResults = pgTable("skip_trace_results", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  jobId: integer("job_id"),
  leadId: integer("lead_id"),
  propertyId: integer("property_id"),
  providerName: varchar("provider_name", { length: 100 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  phonesJson: text("phones_json").notNull().default("[]"),
  emailsJson: text("emails_json").notNull().default("[]"),
  costCents: integer("cost_cents"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  cacheKey: varchar("cache_key", { length: 400 }).notNull(),
  rawResponseJson: text("raw_response_json"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertSkipTraceResultSchema = createInsertSchema(skipTraceResults).omit({ id: true, createdAt: true });
var skipTraceJobs = pgTable("skip_trace_jobs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  entityType: varchar("entity_type", { length: 20 }).notNull(),
  entityId: integer("entity_id").notNull(),
  requestedByUserId: integer("requested_by_user_id"),
  mode: varchar("mode", { length: 20 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("queued"),
  providerName: varchar("provider_name", { length: 100 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  idempotencyKey: varchar("idempotency_key", { length: 400 })
});
var insertSkipTraceJobSchema = createInsertSchema(skipTraceJobs).omit(
  { id: true, createdAt: true, startedAt: true, completedAt: true }
);
var skipTraceJobEvents = pgTable("skip_trace_job_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  jobId: integer("job_id").notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  message: text("message"),
  metadataJson: jsonb("metadata_json").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").notNull().defaultNow()
});
var insertSkipTraceJobEventSchema = createInsertSchema(skipTraceJobEvents).omit({ id: true, createdAt: true });
var skipTraceEvidence = pgTable("skip_trace_evidence", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  jobId: integer("job_id").notNull(),
  entityType: varchar("entity_type", { length: 20 }).notNull(),
  entityId: integer("entity_id").notNull(),
  sourceType: varchar("source_type", { length: 50 }).notNull(),
  sourceUrl: text("source_url"),
  collectedAt: timestamp("collected_at").notNull().defaultNow(),
  extractedJson: jsonb("extracted_json").notNull().default(sql`'{}'::jsonb`),
  confidenceJson: jsonb("confidence_json").notNull().default(sql`'{}'::jsonb`),
  notes: text("notes"),
  screenshotRef: text("screenshot_ref")
});
var insertSkipTraceEvidenceSchema = createInsertSchema(skipTraceEvidence).omit({ id: true, collectedAt: true });
var leadScoreSnapshots = pgTable("lead_score_snapshots", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  entityType: varchar("entity_type", { length: 20 }).notNull(),
  entityId: integer("entity_id").notNull(),
  jobId: integer("job_id"),
  scoreTotal: integer("score_total").notNull(),
  confidence: varchar("confidence", { length: 20 }),
  urgencyTier: varchar("urgency_tier", { length: 20 }),
  reasonSummary: text("reason_summary"),
  factorsJson: jsonb("factors_json").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").notNull().defaultNow()
});
var insertLeadScoreSnapshotSchema = createInsertSchema(leadScoreSnapshots).omit({ id: true, createdAt: true });
var leadSourceOptions = pgTable("lead_source_options", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id"),
  value: varchar("value", { length: 100 }).notNull(),
  label: varchar("label", { length: 120 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertLeadSourceOptionSchema = createInsertSchema(leadSourceOptions).omit({ id: true, createdAt: true, updatedAt: true });
var campaigns = pgTable("campaigns", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertCampaignSchema = createInsertSchema(campaigns).omit({ id: true, createdAt: true, updatedAt: true });
var campaignSteps = pgTable("campaign_steps", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  campaignId: integer("campaign_id").notNull(),
  stepOrder: integer("step_order").notNull(),
  channel: varchar("channel", { length: 10 }).notNull(),
  offsetDays: integer("offset_days").notNull().default(0),
  sendWindowStart: varchar("send_window_start", { length: 5 }),
  sendWindowEnd: varchar("send_window_end", { length: 5 }),
  templateText: text("template_text").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertCampaignStepSchema = createInsertSchema(campaignSteps).omit({ id: true, createdAt: true, updatedAt: true });
var campaignEnrollments = pgTable("campaign_enrollments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  campaignId: integer("campaign_id").notNull(),
  leadId: integer("lead_id").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  nextStepOrder: integer("next_step_order").notNull().default(0),
  nextRunAt: timestamp("next_run_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertCampaignEnrollmentSchema = createInsertSchema(campaignEnrollments).omit({ id: true, createdAt: true, updatedAt: true });
var campaignDeliveries = pgTable("campaign_deliveries", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  enrollmentId: integer("enrollment_id").notNull(),
  campaignId: integer("campaign_id").notNull(),
  leadId: integer("lead_id").notNull(),
  stepId: integer("step_id"),
  channel: varchar("channel", { length: 10 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  providerId: varchar("provider_id", { length: 120 }),
  error: text("error"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertCampaignDeliverySchema = createInsertSchema(campaignDeliveries).omit({ id: true, createdAt: true });
var rvmAudioAssets = pgTable("rvm_audio_assets", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  mimeType: varchar("mime_type", { length: 120 }).notNull(),
  contentBase64: text("content_base64").notNull(),
  createdAt: timestamp("created_at").defaultNow()
});
var insertRvmAudioAssetSchema = createInsertSchema(rvmAudioAssets).omit({ id: true, createdAt: true });
var rvmCampaigns = pgTable("rvm_campaigns", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  sendWindowStart: varchar("send_window_start", { length: 5 }),
  sendWindowEnd: varchar("send_window_end", { length: 5 }),
  dailyCap: integer("daily_cap").notNull().default(500),
  audioAssetId: integer("audio_asset_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertRvmCampaignSchema = createInsertSchema(rvmCampaigns).omit({ id: true, createdAt: true, updatedAt: true });
var rvmDrops = pgTable("rvm_drops", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  campaignId: integer("campaign_id").notNull(),
  leadId: integer("lead_id").notNull(),
  toNumber: varchar("to_number", { length: 32 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("queued"),
  providerId: varchar("provider_id", { length: 120 }),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  error: text("error")
});
var insertRvmDropSchema = createInsertSchema(rvmDrops).omit({ id: true });
var contacts = pgTable("contacts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  type: varchar("type", { length: 50 }),
  company: varchar("company", { length: 255 }),
  notes: text("notes"),
  dedupeKey: varchar("dedupe_key", { length: 400 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertContactSchema = createInsertSchema(contacts).omit({ id: true, createdAt: true, updatedAt: true });
var contracts = pgTable("contracts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  propertyId: integer("property_id").notNull(),
  buyerId: integer("buyer_id"),
  sellerId: integer("seller_id"),
  amount: decimal("amount", { precision: 12, scale: 2 }),
  status: varchar("status", { length: 50 }).default("pending"),
  title: varchar("title", { length: 255 }),
  signDate: timestamp("sign_date"),
  closeDate: timestamp("close_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  leadId: integer("lead_id"),
  opportunityId: integer("opportunity_id"),
  sellerContactId: integer("seller_contact_id"),
  buyerContactId: integer("buyer_contact_id"),
  contractType: varchar("contract_type", { length: 50 }),
  templateId: integer("template_id"),
  templateVersion: integer("template_version"),
  generatedDocumentId: integer("generated_document_id"),
  executedDocumentId: integer("executed_document_id"),
  mergeDataSnapshot: jsonb("merge_data_snapshot").default(sql`'{}'::jsonb`),
  purchasePrice: decimal("purchase_price", { precision: 12, scale: 2 }),
  earnestMoney: decimal("earnest_money", { precision: 12, scale: 2 }),
  inspectionDeadline: timestamp("inspection_deadline"),
  sentAt: timestamp("sent_at"),
  viewedAt: timestamp("viewed_at"),
  signedAt: timestamp("signed_at"),
  executedAt: timestamp("executed_at"),
  expiresAt: timestamp("expires_at"),
  voidedAt: timestamp("voided_at"),
  voidedReason: text("voided_reason"),
  ownerUserId: integer("owner_user_id")
});
var insertContractSchema = createInsertSchema(contracts).omit({ id: true, createdAt: true, updatedAt: true });
var contractTemplates = pgTable("contract_templates", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  content: text("content").notNull(),
  mergeFields: text("merge_fields").array(),
  isActive: boolean("is_active").default(true),
  // Governance fields (must match live DB column set).
  jurisdiction: varchar("jurisdiction", { length: 100 }),
  status: varchar("status", { length: 50 }).default("draft"),
  ownerUserId: integer("owner_user_id"),
  version: integer("version").default(1),
  approvedByUserId: integer("approved_by_user_id"),
  approvedAt: timestamp("approved_at"),
  lastReviewedAt: timestamp("last_reviewed_at"),
  sourceFormat: varchar("source_format", { length: 50 }),
  parentTemplateId: integer("parent_template_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertContractTemplateSchema = createInsertSchema(contractTemplates).omit({ id: true, createdAt: true, updatedAt: true });
var contractDocuments = pgTable("contract_documents", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  templateId: integer("template_id"),
  propertyId: integer("property_id"),
  title: varchar("title", { length: 255 }).notNull(),
  documentType: varchar("document_type", { length: 50 }).default("contract"),
  status: varchar("status", { length: 50 }).default("draft"),
  content: text("content").notNull(),
  mergeData: text("merge_data"),
  pdfUrl: varchar("pdf_url", { length: 500 }),
  version: integer("version").default(1),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertContractDocumentSchema = createInsertSchema(contractDocuments).omit({ id: true, createdAt: true, updatedAt: true });
var contractEnvelopes = pgTable("contract_envelopes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  documentId: integer("document_id").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  signerName: varchar("signer_name", { length: 255 }),
  signerEmail: varchar("signer_email", { length: 255 }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at"),
  sentAt: timestamp("sent_at"),
  viewedAt: timestamp("viewed_at"),
  signedAt: timestamp("signed_at"),
  declinedAt: timestamp("declined_at"),
  signatureType: varchar("signature_type", { length: 20 }),
  signatureText: varchar("signature_text", { length: 255 }),
  signatureImageBase64: text("signature_image_base64"),
  auditJson: text("audit_json").notNull().default("[]"),
  signedPdfBase64: text("signed_pdf_base64"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertContractEnvelopeSchema = createInsertSchema(contractEnvelopes).omit({ id: true, createdAt: true, updatedAt: true });
var contractSigners = pgTable("contract_signers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  contractId: integer("contract_id").notNull(),
  contactId: integer("contact_id"),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  role: varchar("role", { length: 50 }).default("signer"),
  signingOrder: integer("signing_order").default(0),
  status: varchar("status", { length: 50 }).notNull().default("sent"),
  tokenHash: varchar("token_hash", { length: 128 }),
  expiresAt: timestamp("expires_at"),
  sentAt: timestamp("sent_at"),
  viewedAt: timestamp("viewed_at"),
  signedAt: timestamp("signed_at"),
  declinedAt: timestamp("declined_at"),
  reminderCount: integer("reminder_count").default(0),
  lastReminderAt: timestamp("last_reminder_at"),
  signatureMetadataJson: text("signature_metadata_json"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertContractSignerSchema = createInsertSchema(contractSigners).omit({ id: true, createdAt: true, updatedAt: true });
var contractEvents = pgTable("contract_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  contractId: integer("contract_id").notNull(),
  actorType: varchar("actor_type", { length: 50 }).notNull().default("system"),
  actorUserId: integer("actor_user_id"),
  actorContactId: integer("actor_contact_id"),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  payloadJson: text("payload_json").default("{}"),
  ip: varchar("ip", { length: 50 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertContractEventSchema = createInsertSchema(contractEvents).omit({ id: true, createdAt: true });
var contractFields = pgTable("contract_fields", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  contractId: integer("contract_id").notNull(),
  fieldKey: varchar("field_key", { length: 120 }).notNull(),
  fieldLabel: varchar("field_label", { length: 255 }),
  fieldValue: text("field_value"),
  required: boolean("required").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertContractFieldSchema = createInsertSchema(contractFields).omit({ id: true, createdAt: true, updatedAt: true });
var syncIdempotency = pgTable("sync_idempotency", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 120 }).notNull(),
  responseJson: text("response_json").notNull(),
  createdAt: timestamp("created_at").defaultNow()
});
var insertSyncIdempotencySchema = createInsertSchema(syncIdempotency).omit({ id: true, createdAt: true });
var fieldMediaAssets = pgTable("field_media_assets", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  leadId: integer("lead_id"),
  kind: varchar("kind", { length: 20 }).notNull(),
  mimeType: varchar("mime_type", { length: 120 }).notNull(),
  contentBase64: text("content_base64").notNull(),
  createdAt: timestamp("created_at").defaultNow()
});
var insertFieldMediaAssetSchema = createInsertSchema(fieldMediaAssets).omit({ id: true, createdAt: true });
var compSnapshots = pgTable("comp_snapshots", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  propertyId: integer("property_id").notNull(),
  providerName: varchar("provider_name", { length: 100 }).notNull(),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  compsJson: text("comps_json").notNull().default("[]"),
  rawResponseJson: text("raw_response_json"),
  arvSuggestion: decimal("arv_suggestion", { precision: 12, scale: 2 }),
  offerRangeMin: decimal("offer_range_min", { precision: 12, scale: 2 }),
  offerRangeMax: decimal("offer_range_max", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow()
});
var insertCompSnapshotSchema = createInsertSchema(compSnapshots).omit({ id: true, createdAt: true });
var compSnapshotRows = pgTable("comp_snapshot_rows", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  opportunityId: integer("opportunity_id").notNull(),
  compPropertyId: integer("comp_property_id").notNull(),
  distanceMiles: decimal("distance_miles", { precision: 8, scale: 3 }),
  soldPrice: decimal("sold_price", { precision: 12, scale: 2 }),
  soldDate: date("sold_date"),
  isRentalComp: boolean("is_rental_comp").notNull().default(false),
  rentPerMonth: decimal("rent_per_month", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow()
});
var insertCompSnapshotRowSchema = createInsertSchema(compSnapshotRows).omit({ id: true, createdAt: true });
var dealBuyerMatches = pgTable("deal_buyer_matches", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  propertyId: integer("property_id").notNull(),
  buyerId: integer("buyer_id").notNull(),
  score: integer("score").notNull(),
  reasons: jsonb("reasons").notNull().default(sql`'[]'::jsonb`),
  computedAt: timestamp("computed_at").notNull().defaultNow()
});
var insertDealBuyerMatchSchema = createInsertSchema(dealBuyerMatches).omit({ id: true });
var buyerProfiles = pgTable("buyer_profiles", {
  id: integer("id").primaryKey(),
  userId: integer("user_id").notNull(),
  targetStates: text("target_states").array(),
  targetZips: text("target_zips").array(),
  strategies: text("strategies").array(),
  minSpread: decimal("min_spread", { precision: 12, scale: 2 }),
  minYield: decimal("min_yield", { precision: 8, scale: 4 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertBuyerProfileSchema = createInsertSchema(buyerProfiles).omit({ createdAt: true, updatedAt: true });
var documentVersions = pgTable("document_versions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  documentId: integer("document_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  content: text("content").notNull(),
  changes: text("changes"),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow()
});
var insertDocumentVersionSchema = createInsertSchema(documentVersions).omit({ id: true, createdAt: true });
var lois = pgTable("lois", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  propertyId: integer("property_id").notNull(),
  buyerName: varchar("buyer_name", { length: 255 }).notNull(),
  sellerName: varchar("seller_name", { length: 255 }).notNull(),
  offerAmount: decimal("offer_amount", { precision: 12, scale: 2 }).notNull(),
  earnestMoney: decimal("earnest_money", { precision: 12, scale: 2 }),
  closingDate: timestamp("closing_date"),
  contingencies: text("contingencies").array(),
  specialTerms: text("special_terms"),
  status: varchar("status", { length: 50 }).default("draft"),
  sentDate: timestamp("sent_date"),
  responseDate: timestamp("response_date"),
  content: text("content"),
  pdfUrl: varchar("pdf_url", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertLoiSchema = createInsertSchema(lois).omit({ id: true, createdAt: true, updatedAt: true });
var users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  phone: varchar("phone", { length: 20 }),
  companyName: varchar("company_name", { length: 255 }),
  licenseNumber: varchar("license_number", { length: 100 }),
  role: varchar("role", { length: 50 }).default("user"),
  isSuperAdmin: boolean("is_super_admin").default(false),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  profilePicture: text("profile_picture"),
  showBannerQuotes: boolean("show_banner_quotes").default(true),
  customBannerImages: text("custom_banner_images").array(),
  bannerConfig: jsonb("banner_config"),
  skipTraceDefaultMode: varchar("skip_trace_default_mode", { length: 30 }).notNull().default("both"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
var userFeatureFlags = pgTable("user_feature_flags", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  flag: varchar("flag", { length: 80 }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertUserFeatureFlagSchema = createInsertSchema(userFeatureFlags).omit({ id: true, createdAt: true, updatedAt: true });
var twoFactorAuth = pgTable("two_factor_auth", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().unique(),
  secret: varchar("secret", { length: 255 }).notNull(),
  isEnabled: boolean("is_enabled").default(false),
  method: varchar("method", { length: 50 }).default("totp"),
  phoneNumber: varchar("phone_number", { length: 20 }),
  emailBackup: varchar("email_backup", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertTwoFactorAuthSchema = createInsertSchema(twoFactorAuth).omit({ id: true, createdAt: true, updatedAt: true });
var passwordResetTokens = pgTable("password_reset_tokens", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  requestIp: varchar("request_ip", { length: 64 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});
var authMagicLinks = pgTable("auth_magic_links", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  requestIp: varchar("request_ip", { length: 64 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});
var backupCodes = pgTable("backup_codes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  code: varchar("code", { length: 20 }).notNull(),
  isUsed: boolean("is_used").default(false),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertBackupCodeSchema = createInsertSchema(backupCodes).omit({ id: true, createdAt: true });
var teams = pgTable("teams", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  ownerId: integer("owner_id").notNull(),
  inviteCode: varchar("invite_code", { length: 32 }).notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertTeamSchema = createInsertSchema(teams).omit({ id: true, createdAt: true, updatedAt: true });
var teamMembers = pgTable("team_members", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  teamId: integer("team_id").notNull(),
  userId: integer("user_id").notNull(),
  role: varchar("role", { length: 50 }).default("member"),
  permissions: text("permissions").array(),
  invitedBy: integer("invited_by"),
  invitedAt: timestamp("invited_at").defaultNow(),
  joinedAt: timestamp("joined_at"),
  status: varchar("status", { length: 50 }).default("active")
});
var insertTeamMemberSchema = createInsertSchema(teamMembers).omit({ id: true, invitedAt: true });
var teamActivityLogs = pgTable("team_activity_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  teamId: integer("team_id").notNull(),
  userId: integer("user_id"),
  action: varchar("action", { length: 255 }).notNull(),
  description: text("description"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertTeamActivityLogSchema = createInsertSchema(teamActivityLogs).omit({ id: true, createdAt: true });
var xpExperiences = pgTable("xp_experiences", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  slug: varchar("slug", { length: 80 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  mode: varchar("mode", { length: 20 }).notNull().default("time_slot"),
  paymentMode: varchar("payment_mode", { length: 20 }).notNull().default("deposit"),
  currency: varchar("currency", { length: 10 }).notNull().default("USD"),
  priceTotal: decimal("price_total", { precision: 12, scale: 2 }),
  depositAmount: decimal("deposit_amount", { precision: 12, scale: 2 }).notNull(),
  capacity: integer("capacity").notNull().default(1),
  active: boolean("active").notNull().default(true),
  images: text("images").array(),
  itinerary: jsonb("itinerary"),
  location: text("location"),
  durationMinutes: integer("duration_minutes"),
  highlights: text("highlights").array(),
  inclusions: text("inclusions").array(),
  cancellationPolicy: text("cancellation_policy"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertXpExperienceSchema = createInsertSchema(xpExperiences).omit({ id: true, createdAt: true, updatedAt: true });
var xpTimeSlots = pgTable("xp_time_slots", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  experienceId: integer("experience_id").notNull(),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at").notNull(),
  capacity: integer("capacity").notNull().default(1),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertXpTimeSlotSchema = createInsertSchema(xpTimeSlots).omit({ id: true, createdAt: true, updatedAt: true });
var xpBlackouts = pgTable("xp_blackouts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  experienceId: integer("experience_id").notNull(),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertXpBlackoutSchema = createInsertSchema(xpBlackouts).omit({ id: true, createdAt: true, updatedAt: true });
var xpBookings = pgTable("xp_bookings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  experienceId: integer("experience_id").notNull(),
  kind: varchar("kind", { length: 20 }).notNull(),
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  customerEmail: varchar("customer_email", { length: 255 }).notNull(),
  customerPhone: varchar("customer_phone", { length: 40 }),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at").notNull(),
  status: varchar("status", { length: 40 }).notNull().default("pending_payment"),
  currency: varchar("currency", { length: 10 }).notNull().default("USD"),
  depositAmount: decimal("deposit_amount", { precision: 12, scale: 2 }).notNull(),
  stripeCheckoutSessionId: varchar("stripe_checkout_session_id", { length: 255 }),
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertXpBookingSchema = createInsertSchema(xpBookings).omit({ id: true, createdAt: true, updatedAt: true });
var xpStripeEvents = pgTable("xp_stripe_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  eventId: varchar("event_id", { length: 255 }).notNull(),
  type: varchar("type", { length: 120 }).notNull(),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertXpStripeEventSchema = createInsertSchema(xpStripeEvents).omit({ id: true, createdAt: true });
var xpLocations = pgTable("xp_locations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 40 }).notNull().default("resort"),
  address1: varchar("address1", { length: 255 }),
  address2: varchar("address2", { length: 255 }),
  city: varchar("city", { length: 120 }),
  state: varchar("state", { length: 40 }),
  zip: varchar("zip", { length: 20 }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertXpLocationSchema = createInsertSchema(xpLocations).omit({ id: true, createdAt: true, updatedAt: true });
var xpVehicles = pgTable("xp_vehicles", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 40 }).notNull().default("tesla"),
  licensePlate: varchar("license_plate", { length: 40 }),
  locationId: integer("location_id"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertXpVehicleSchema = createInsertSchema(xpVehicles).omit({ id: true, createdAt: true, updatedAt: true });
var xpBookingAssignments = pgTable("xp_booking_assignments", {
  bookingId: integer("booking_id").primaryKey(),
  locationId: integer("location_id"),
  vehicleId: integer("vehicle_id"),
  conciergeUserId: integer("concierge_user_id"),
  assignedAt: timestamp("assigned_at"),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertXpBookingAssignmentSchema = createInsertSchema(xpBookingAssignments);
var xpBookingNotes = pgTable("xp_booking_notes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  bookingId: integer("booking_id").notNull(),
  authorUserId: integer("author_user_id"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow()
});
var insertXpBookingNoteSchema = createInsertSchema(xpBookingNotes).omit({ id: true, createdAt: true });
var notificationPreferences = pgTable("notification_preferences", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().unique(),
  emailEnabled: boolean("email_enabled").default(true),
  pushEnabled: boolean("push_enabled").default(true),
  inAppEnabled: boolean("in_app_enabled").default(true),
  newLeads: boolean("new_leads").default(true),
  dealUpdates: boolean("deal_updates").default(true),
  contractAlerts: boolean("contract_alerts").default(true),
  weeklySummary: boolean("weekly_summary").default(true),
  frequency: varchar("frequency", { length: 50 }).default("instant"),
  dndEnabled: boolean("dnd_enabled").default(false),
  dndStartTime: varchar("dnd_start_time", { length: 10 }),
  dndEndTime: varchar("dnd_end_time", { length: 10 }),
  categories: jsonb("categories").notNull().default({}).$type(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertNotificationPreferenceSchema = createInsertSchema(notificationPreferences).omit({ id: true, createdAt: true, updatedAt: true });
var NOTIFICATION_CATEGORY_KEYS = [
  "task_assigned",
  "task_due",
  "task_overdue",
  "opportunity_stage_changed",
  "opportunity_assigned",
  "offer_received",
  "offer_accepted",
  "inquiry_received",
  "listing_expired",
  "contract_sent",
  "contract_viewed",
  "contract_signed",
  "contract_declined",
  "contract_expired",
  "missed_call",
  "inbound_sms",
  "internal_message",
  "voicemail",
  "meeting_invite",
  "system"
];
function defaultNotificationCategories() {
  const out = {};
  for (const key of NOTIFICATION_CATEGORY_KEYS) out[key] = true;
  return out;
}
var pipelineConfigs = pgTable("pipeline_configs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  entityType: varchar("entity_type", { length: 20 }).notNull(),
  columns: text("columns").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertPipelineConfigSchema = createInsertSchema(pipelineConfigs).omit({ id: true, createdAt: true, updatedAt: true });
var userGoals = pgTable("user_goals", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  targetValue: integer("target_value").notNull(),
  currentValue: integer("current_value").default(0),
  unit: varchar("unit", { length: 50 }).default("deals"),
  period: varchar("period", { length: 50 }).default("monthly"),
  startDate: timestamp("start_date").defaultNow(),
  endDate: timestamp("end_date"),
  status: varchar("status", { length: 50 }).default("active"),
  milestones: text("milestones").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertUserGoalSchema = createInsertSchema(userGoals).omit({ id: true, createdAt: true, updatedAt: true });
var userNotifications = pgTable("user_notifications", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  type: varchar("type", { length: 50 }).default("system"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  read: boolean("read").default(false),
  relatedId: integer("related_id"),
  relatedType: varchar("related_type", { length: 50 }),
  eventKey: varchar("event_key", { length: 200 }),
  createdAt: timestamp("created_at").defaultNow()
});
var insertUserNotificationSchema = createInsertSchema(userNotifications).omit({ id: true, createdAt: true });
var tasks = pgTable("tasks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  type: varchar("type", { length: 80 }).default("general"),
  legacyTaskId: integer("legacy_task_id"),
  sourceDb: varchar("source_db", { length: 50 }),
  migrationBatchId: varchar("migration_batch_id", { length: 100 }),
  relatedEntityType: varchar("related_entity_type", { length: 50 }),
  relatedEntityId: integer("related_entity_id"),
  dueAt: timestamp("due_at"),
  completedAt: timestamp("completed_at"),
  priority: varchar("priority", { length: 20 }).default("medium"),
  status: varchar("status", { length: 20 }).default("open"),
  assignedToUserId: integer("assigned_to_user_id"),
  isRecurring: boolean("is_recurring").notNull().default(false),
  recurrenceRule: text("recurrence_rule"),
  createdBy: integer("created_by").notNull(),
  isPrivate: boolean("is_private").notNull().default(false),
  reminderSentAt: timestamp("reminder_sent_at"),
  overdueAlertSentAt: timestamp("overdue_alert_sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  reminderSentAt: true,
  overdueAlertSentAt: true
}).extend({
  dueAt: z.coerce.date().nullable().optional()
});
var internalMessages = pgTable("internal_messages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  senderUserId: integer("sender_user_id").notNull(),
  recipientUserId: integer("recipient_user_id").notNull(),
  body: text("body").notNull(),
  relatedType: varchar("related_type", { length: 50 }),
  relatedId: integer("related_id"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertInternalMessageSchema = createInsertSchema(internalMessages).omit({ id: true, createdAt: true });
var calendarEvents = pgTable("calendar_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at"),
  meetingLink: text("meeting_link"),
  location: varchar("location", { length: 255 }),
  createdBy: integer("created_by").notNull(),
  relatedType: varchar("related_type", { length: 50 }),
  relatedId: integer("related_id"),
  inviteeUserIds: integer("invitee_user_ids").array().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertCalendarEventSchema = createInsertSchema(calendarEvents).omit({ id: true, createdAt: true, updatedAt: true }).extend({
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().nullable().optional()
});
var offers = pgTable("offers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  propertyId: integer("property_id").notNull(),
  userId: integer("user_id").notNull(),
  buyerName: varchar("buyer_name", { length: 255 }),
  sellerName: varchar("seller_name", { length: 255 }),
  offerAmount: decimal("offer_amount", { precision: 12, scale: 2 }).notNull(),
  status: varchar("status", { length: 50 }).default("pending"),
  sentDate: timestamp("sent_date"),
  responseDate: timestamp("response_date"),
  expirationDate: timestamp("expiration_date"),
  notes: text("notes"),
  documents: text("documents").array(),
  responseNotes: text("response_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertOfferSchema = createInsertSchema(offers).omit({ id: true, createdAt: true, updatedAt: true });
var workCategories = pgTable("work_categories", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  code: varchar("code", { length: 64 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  defaultHourlyRate: decimal("default_hourly_rate", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertWorkCategorySchema = createInsertSchema(workCategories).omit({ id: true, createdAt: true, updatedAt: true });
var timesheetEntries = pgTable("timesheet_entries", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  employee: varchar("employee", { length: 255 }).notNull(),
  task: varchar("task", { length: 255 }).notNull(),
  categoryId: integer("category_id"),
  linkedEntityType: varchar("linked_entity_type", { length: 32 }),
  linkedEntityId: integer("linked_entity_id"),
  startTime: varchar("start_time", { length: 10 }).notNull(),
  endTime: varchar("end_time", { length: 10 }).notNull(),
  hours: decimal("hours", { precision: 5, scale: 2 }).notNull(),
  payableHours: decimal("payable_hours", { precision: 5, scale: 2 }),
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }).default("50"),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  approvedByUserId: integer("approved_by_user_id"),
  approvedAt: timestamp("approved_at"),
  paidAt: timestamp("paid_at"),
  anomalyFlags: text("anomaly_flags").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertTimesheetEntrySchema = createInsertSchema(timesheetEntries).omit({ id: true, createdAt: true, updatedAt: true });
var timeClockSessions = pgTable("time_clock_sessions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  employee: varchar("employee", { length: 255 }).notNull(),
  task: varchar("task", { length: 255 }).default("General").notNull(),
  clockInAt: timestamp("clock_in_at").notNull(),
  clockOutAt: timestamp("clock_out_at"),
  tzOffsetMinutes: integer("tz_offset_minutes").notNull(),
  autoStarted: boolean("auto_started").default(true),
  autoClosed: boolean("auto_closed").notNull().default(false),
  autoClosedReason: text("auto_closed_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertTimeClockSessionSchema = createInsertSchema(timeClockSessions).omit({ id: true, createdAt: true, updatedAt: true });
var workerProfiles = pgTable("worker_profiles", {
  userId: integer("user_id").primaryKey(),
  workerType: varchar("worker_type", { length: 20 }).notNull().default("employee"),
  payType: varchar("pay_type", { length: 20 }).notNull().default("hourly"),
  defaultHourlyRate: decimal("default_hourly_rate", { precision: 10, scale: 2 }),
  salaryAmount: decimal("salary_amount", { precision: 12, scale: 2 }),
  isActive: boolean("is_active").notNull().default(true),
  effectiveFrom: date("effective_from"),
  effectiveTo: date("effective_to"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertWorkerProfileSchema = createInsertSchema(workerProfiles).omit({ createdAt: true, updatedAt: true });
var categoryRateOverrides = pgTable("category_rate_overrides", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  categoryId: integer("category_id").notNull(),
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }),
  costRate: decimal("cost_rate", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertCategoryRateOverrideSchema = createInsertSchema(categoryRateOverrides).omit({ id: true, createdAt: true, updatedAt: true });
var payPeriods = pgTable("pay_periods", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertPayPeriodSchema = createInsertSchema(payPeriods).omit({ id: true, createdAt: true, updatedAt: true });
var approvalEvents = pgTable("approval_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  entityType: varchar("entity_type", { length: 32 }).notNull(),
  entityId: integer("entity_id").notNull(),
  action: varchar("action", { length: 32 }).notNull(),
  byUserId: integer("by_user_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertApprovalEventSchema = createInsertSchema(approvalEvents).omit({ id: true, createdAt: true });
var commissionEvents = pgTable("commission_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  sourceType: varchar("source_type", { length: 20 }).notNull(),
  sourceId: integer("source_id").notNull(),
  milestone: varchar("milestone", { length: 40 }).notNull(),
  eventDate: date("event_date").notNull(),
  grossAmount: decimal("gross_amount", { precision: 12, scale: 2 }),
  currency: varchar("currency", { length: 8 }).notNull().default("USD"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertCommissionEventSchema = createInsertSchema(commissionEvents).omit({ id: true, createdAt: true, updatedAt: true });
var dealParticipants = pgTable("deal_participants", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  sourceType: varchar("source_type", { length: 20 }).notNull(),
  sourceId: integer("source_id").notNull(),
  userId: integer("user_id").notNull(),
  role: varchar("role", { length: 32 }).notNull(),
  splitPct: decimal("split_pct", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertDealParticipantSchema = createInsertSchema(dealParticipants).omit({ id: true, createdAt: true, updatedAt: true });
var commissionLedgerEntries = pgTable("commission_ledger_entries", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  eventId: integer("event_id").notNull(),
  userId: integer("user_id").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  ruleSnapshot: jsonb("rule_snapshot"),
  approvedByUserId: integer("approved_by_user_id"),
  approvedAt: timestamp("approved_at"),
  paidAt: timestamp("paid_at"),
  disputedReason: text("disputed_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertCommissionLedgerEntrySchema = createInsertSchema(commissionLedgerEntries).omit({ id: true, createdAt: true, updatedAt: true });
var globalActivityLogs = pgTable("global_activity_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  action: varchar("action", { length: 255 }).notNull(),
  description: text("description"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertGlobalActivityLogSchema = createInsertSchema(globalActivityLogs).omit({ id: true, createdAt: true });
var authAuditLogs = pgTable("auth_audit_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  action: varchar("action", { length: 100 }).notNull(),
  outcome: varchar("outcome", { length: 50 }).notNull(),
  userId: integer("user_id"),
  email: varchar("email", { length: 255 }),
  ip: varchar("ip", { length: 100 }),
  userAgent: text("user_agent"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertAuthAuditLogSchema = createInsertSchema(authAuditLogs).omit({ id: true, createdAt: true });
var buyers = pgTable("buyers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull(),
  company: varchar("company", { length: 255 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  preferredPropertyTypes: text("preferred_property_types").array(),
  preferredAreas: text("preferred_areas").array(),
  minBudget: decimal("min_budget", { precision: 12, scale: 2 }),
  maxBudget: decimal("max_budget", { precision: 12, scale: 2 }),
  zipCodes: text("zip_codes").array(),
  minPrice: decimal("min_price", { precision: 12, scale: 2 }),
  maxPrice: decimal("max_price", { precision: 12, scale: 2 }),
  minBeds: integer("min_beds"),
  maxBeds: integer("max_beds"),
  propertyTypes: text("property_types").array(),
  dealsPerMonth: integer("deals_per_month"),
  proofOfFunds: boolean("proof_of_funds").default(false),
  proofOfFundsVerifiedAt: timestamp("proof_of_funds_verified_at"),
  proofOfFundsNotes: text("proof_of_funds_notes"),
  isVip: boolean("is_vip").default(false),
  status: varchar("status", { length: 50 }).default("active"),
  totalDeals: integer("total_deals").default(0),
  totalRevenue: decimal("total_revenue", { precision: 12, scale: 2 }).default("0"),
  notes: text("notes"),
  tags: text("tags").array(),
  lastContactDate: timestamp("last_contact_date"),
  dedupeKey: varchar("dedupe_key", { length: 400 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertBuyerSchema = createInsertSchema(buyers).omit({ id: true, createdAt: true, updatedAt: true });
var buyerCommunications = pgTable("buyer_communications", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  buyerId: integer("buyer_id").notNull(),
  userId: integer("user_id").notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  subject: varchar("subject", { length: 255 }),
  content: text("content"),
  direction: varchar("direction", { length: 20 }).default("outbound"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertBuyerCommunicationSchema = createInsertSchema(buyerCommunications).omit({ id: true, createdAt: true });
var dealAssignments = pgTable("deal_assignments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  propertyId: integer("property_id").notNull(),
  buyerId: integer("buyer_id").notNull(),
  contractId: integer("contract_id"),
  assignmentFee: decimal("assignment_fee", { precision: 12, scale: 2 }),
  purchasePrice: decimal("purchase_price", { precision: 12, scale: 2 }),
  assignedPrice: decimal("assigned_price", { precision: 12, scale: 2 }),
  status: varchar("status", { length: 50 }).default("pending"),
  closingDate: timestamp("closing_date"),
  titleCompany: varchar("title_company", { length: 255 }),
  earnestMoneyReceived: boolean("earnest_money_received").default(false),
  titleCleared: boolean("title_cleared").default(false),
  closingScheduled: boolean("closing_scheduled").default(false),
  documentsComplete: boolean("documents_complete").default(false),
  payoutReceived: boolean("payout_received").default(false),
  payoutAmount: decimal("payout_amount", { precision: 12, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertDealAssignmentSchema = createInsertSchema(dealAssignments).omit({ id: true, createdAt: true, updatedAt: true });
var callLogs = pgTable("call_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  direction: varchar("direction", { length: 20 }).notNull(),
  number: varchar("number", { length: 20 }).notNull(),
  contactId: integer("contact_id"),
  leadId: integer("lead_id"),
  status: varchar("status", { length: 50 }).notNull(),
  disposition: varchar("disposition", { length: 50 }),
  note: text("note"),
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
  durationMs: integer("duration_ms"),
  errorCode: varchar("error_code", { length: 50 }),
  errorMessage: text("error_message"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertCallLogSchema = createInsertSchema(callLogs).omit({ id: true, createdAt: true });
var callMedia = pgTable("call_media", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  callLogId: integer("call_log_id"),
  kind: varchar("kind", { length: 20 }).notNull(),
  e164: varchar("e164", { length: 20 }),
  storageKey: text("storage_key"),
  providerUrl: text("provider_url"),
  providerSid: varchar("provider_sid", { length: 64 }),
  mimeType: varchar("mime_type", { length: 100 }),
  durationSeconds: integer("duration_seconds"),
  transcript: text("transcript"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertCallMediaSchema = createInsertSchema(callMedia).omit({ id: true, createdAt: true, updatedAt: true });
var numberReputation = pgTable("number_reputation", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  e164: varchar("e164", { length: 20 }).notNull(),
  label: varchar("label", { length: 20 }).notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertNumberReputationSchema = createInsertSchema(numberReputation).omit({ id: true, createdAt: true, updatedAt: true });
var callNotes = pgTable("call_notes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  callLogId: integer("call_log_id").notNull(),
  disposition: varchar("disposition", { length: 50 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertCallNotesSchema = createInsertSchema(callNotes).omit({ id: true, createdAt: true, updatedAt: true });
var underwritingTemplates = pgTable("underwriting_templates", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  configJson: text("config_json").notNull().default("{}"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertUnderwritingTemplateSchema = createInsertSchema(underwritingTemplates).omit({ id: true, createdAt: true, updatedAt: true });
var playgroundPropertySessions = pgTable("playground_property_sessions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  address: varchar("address", { length: 500 }).notNull(),
  addressKey: text("address_key").notNull(),
  propertyType: varchar("property_type", { length: 50 }),
  currentUrl: text("current_url"),
  tagsJson: text("tags_json").notNull().default("[]"),
  bookmarksJson: text("bookmarks_json").notNull().default("[]"),
  checklistJson: text("checklist_json").notNull().default("{}"),
  notesJson: text("notes_json").notNull().default("[]"),
  underwritingJson: text("underwriting_json").notNull().default("{}"),
  leadId: integer("lead_id"),
  propertyId: integer("property_id"),
  assignedTo: integer("assigned_to"),
  assignmentDueAt: timestamp("assignment_due_at"),
  assignmentStatus: varchar("assignment_status", { length: 50 }),
  createdBy: integer("created_by").notNull(),
  updatedBy: integer("updated_by"),
  lastOpenedBy: integer("last_opened_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  lastOpenedAt: timestamp("last_opened_at").defaultNow()
});
var insertPlaygroundPropertySessionSchema = createInsertSchema(playgroundPropertySessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var companies = pgTable("companies", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  teamId: integer("team_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  companyType: varchar("company_type", { length: 50 }),
  website: varchar("website", { length: 500 }),
  phone: varchar("phone", { length: 32 }),
  email: varchar("email", { length: 255 }),
  address: text("address"),
  notes: text("notes"),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertCompanySchema = createInsertSchema(companies).omit({ id: true, createdAt: true, updatedAt: true });
var companyPeople = pgTable("company_people", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  teamId: integer("team_id").notNull(),
  companyId: integer("company_id").notNull(),
  contactId: integer("contact_id").notNull(),
  title: varchar("title", { length: 120 }),
  isPrimary: boolean("is_primary").default(false),
  createdAt: timestamp("created_at").defaultNow()
});
var insertCompanyPersonSchema = createInsertSchema(companyPeople).omit({ id: true, createdAt: true });
var companyLinks = pgTable("company_links", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  teamId: integer("team_id").notNull(),
  companyId: integer("company_id").notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: integer("entity_id").notNull(),
  role: varchar("role", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow()
});
var insertCompanyLinkSchema = createInsertSchema(companyLinks).omit({ id: true, createdAt: true });
var documents = pgTable("documents", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  teamId: integer("team_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  kind: varchar("kind", { length: 50 }),
  mimeType: varchar("mime_type", { length: 120 }).notNull(),
  sizeBytes: integer("size_bytes"),
  storageKey: text("storage_key").notNull(),
  sha256: varchar("sha256", { length: 64 }),
  tags: text("tags").array(),
  isPrivate: boolean("is_private").default(false),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true, updatedAt: true });
var documentLinks = pgTable("document_links", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  teamId: integer("team_id").notNull(),
  documentId: integer("document_id").notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: integer("entity_id").notNull(),
  relation: varchar("relation", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow()
});
var insertDocumentLinkSchema = createInsertSchema(documentLinks).omit({ id: true, createdAt: true });
var vaultDocumentVersions = pgTable("vault_document_versions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  teamId: integer("team_id").notNull(),
  documentId: integer("document_id").notNull(),
  version: integer("version").notNull(),
  storageKey: text("storage_key").notNull(),
  mimeType: varchar("mime_type", { length: 120 }).notNull(),
  sizeBytes: integer("size_bytes"),
  sha256: varchar("sha256", { length: 64 }),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertVaultDocumentVersionSchema = createInsertSchema(vaultDocumentVersions).omit({ id: true, createdAt: true });
var automations = pgTable("automations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  teamId: integer("team_id").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertAutomationSchema = createInsertSchema(automations).omit({ id: true, createdAt: true, updatedAt: true });
var automationTriggers = pgTable("automation_triggers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  teamId: integer("team_id").notNull(),
  automationId: integer("automation_id").notNull(),
  eventType: varchar("event_type", { length: 80 }).notNull(),
  configJson: text("config_json").notNull().default("{}"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertAutomationTriggerSchema = createInsertSchema(automationTriggers).omit({ id: true, createdAt: true });
var automationConditions = pgTable("automation_conditions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  teamId: integer("team_id").notNull(),
  automationId: integer("automation_id").notNull(),
  configJson: text("config_json").notNull().default("{}"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertAutomationConditionSchema = createInsertSchema(automationConditions).omit({ id: true, createdAt: true });
var automationActions = pgTable("automation_actions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  teamId: integer("team_id").notNull(),
  automationId: integer("automation_id").notNull(),
  actionType: varchar("action_type", { length: 80 }).notNull(),
  configJson: text("config_json").notNull().default("{}"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow()
});
var insertAutomationActionSchema = createInsertSchema(automationActions).omit({ id: true, createdAt: true });
var automationRuns = pgTable("automation_runs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  teamId: integer("team_id").notNull(),
  automationId: integer("automation_id").notNull(),
  eventType: varchar("event_type", { length: 80 }).notNull(),
  eventJson: text("event_json").notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  error: text("error"),
  deliveryId: varchar("delivery_id", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow(),
  finishedAt: timestamp("finished_at")
});
var insertAutomationRunSchema = createInsertSchema(automationRuns).omit({ id: true, createdAt: true });
var auditEvents = pgTable("audit_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  teamId: integer("team_id").notNull(),
  actorUserId: integer("actor_user_id"),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: integer("entity_id"),
  action: varchar("action", { length: 80 }).notNull(),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  diffJson: text("diff_json"),
  ip: varchar("ip", { length: 64 }),
  userAgent: text("user_agent"),
  requestId: varchar("request_id", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow()
});
var insertAuditEventSchema = createInsertSchema(auditEvents).omit({ id: true, createdAt: true });
var opportunityParties = pgTable("opportunity_parties", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  opportunityId: integer("opportunity_id").notNull(),
  contactId: integer("contact_id"),
  role: varchar("role", { length: 32 }).notNull(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  company: varchar("company", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertOpportunityPartySchema = createInsertSchema(opportunityParties).omit({ id: true, createdAt: true, updatedAt: true });
var publicListings = pgTable("public_listings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  opportunityId: integer("opportunity_id").notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  status: varchar("status", { length: 50 }).default("draft").notNull(),
  visibility: varchar("visibility", { length: 20 }).default("link_only").notNull(),
  passwordHash: varchar("password_hash", { length: 255 }),
  title: varchar("title", { length: 255 }),
  description: text("description"),
  exposeAddress: boolean("expose_address").default(false).notNull(),
  exposeComps: boolean("expose_comps").default(false).notNull(),
  exposeFinancials: boolean("expose_financials").default(false).notNull(),
  exposeDocs: boolean("expose_docs").default(false).notNull(),
  contactName: varchar("contact_name", { length: 255 }),
  contactEmail: varchar("contact_email", { length: 255 }),
  contactPhone: varchar("contact_phone", { length: 20 }),
  viewCount: integer("view_count").default(0).notNull(),
  passwordAttempts: integer("password_attempts").default(0).notNull(),
  passwordLockedUntil: timestamp("password_locked_until"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  publishedAt: timestamp("published_at"),
  expiresAt: timestamp("expires_at")
});
var insertPublicListingSchema = createInsertSchema(publicListings).omit({ id: true, createdAt: true, updatedAt: true, viewCount: true, passwordAttempts: true });
var buyerInquiries = pgTable("buyer_inquiries", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  listingId: integer("listing_id").notNull(),
  opportunityId: integer("opportunity_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  company: varchar("company", { length: 255 }),
  buyerType: varchar("buyer_type", { length: 50 }),
  message: text("message"),
  offerAmount: decimal("offer_amount", { precision: 12, scale: 2 }),
  proofOfFundsUrl: varchar("pof_url", { length: 500 }),
  status: varchar("status", { length: 50 }).default("new").notNull(),
  assignedToUserId: integer("assigned_to_user_id"),
  notes: text("notes"),
  ip: varchar("ip", { length: 50 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertBuyerInquirySchema = createInsertSchema(buyerInquiries).omit({ id: true, createdAt: true, updatedAt: true, status: true, assignedToUserId: true, notes: true });
var opportunityEvents = pgTable("opportunity_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  opportunityId: integer("opportunity_id").notNull(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  actorType: varchar("actor_type", { length: 50 }).default("user"),
  actorUserId: integer("actor_user_id"),
  actorContactId: integer("actor_contact_id"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  metadataJson: text("metadata_json"),
  ip: varchar("ip", { length: 50 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertOpportunityEventSchema = createInsertSchema(opportunityEvents).omit({ id: true, createdAt: true });
var buyerOffers = pgTable("buyer_offers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  opportunityId: integer("opportunity_id").notNull(),
  buyerInquiryId: integer("buyer_inquiry_id"),
  buyerContactId: integer("buyer_contact_id"),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  earnestMoney: decimal("earnest_money", { precision: 12, scale: 2 }),
  financingType: varchar("financing_type", { length: 50 }),
  closeBy: timestamp("close_by"),
  terms: text("terms"),
  assignmentTerms: text("assignment_terms"),
  notes: text("notes"),
  status: varchar("status", { length: 50 }).default("received").notNull(),
  version: integer("version").default(1).notNull(),
  parentOfferId: integer("parent_offer_id"),
  superseded: boolean("superseded").default(false).notNull(),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertBuyerOfferSchema = createInsertSchema(buyerOffers).omit({ id: true, createdAt: true, updatedAt: true });
var videoMeetings = pgTable("video_meetings", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 20 }).notNull().default("scheduled"),
  // scheduled, live, ended, canceled
  hostUserId: integer("host_user_id").notNull(),
  externalRoomId: varchar("external_room_id", { length: 100 }),
  joinUrlHost: text("join_url_host"),
  joinUrlGuest: text("join_url_guest"),
  relatedEntityType: varchar("related_entity_type", { length: 50 }),
  relatedEntityId: integer("related_entity_id"),
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});
var videoMeetingParticipants = pgTable("video_meeting_participants", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull(),
  contactId: integer("contact_id"),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }),
  role: varchar("role", { length: 50 }).notNull().default("guest"),
  // host, guest, buyer, seller, investor, title, attorney
  inviteStatus: varchar("invite_status", { length: 20 }).notNull().default("pending"),
  // pending, accepted, declined, joined
  joinedAt: timestamp("joined_at"),
  leftAt: timestamp("left_at"),
  createdAt: timestamp("created_at").notNull().defaultNow()
});
var videoMeetingEvents = pgTable("video_meeting_events", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull(),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  // created, invite_sent, joined, left, ended, recording_ready
  participantId: integer("participant_id"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow()
});
var insertVideoMeetingSchema = createInsertSchema(videoMeetings).omit({ id: true, createdAt: true, updatedAt: true });
var insertVideoMeetingParticipantSchema = createInsertSchema(videoMeetingParticipants).omit({ id: true, createdAt: true });

// server/storage.ts
import { eq, and, gte, lte, isNull, inArray, or, ne, isNotNull, like } from "drizzle-orm";
function normalizeGlobalActivityAction(action) {
  const a = String(action || "").trim();
  if (!a) return a;
  const map = {
    call_started: "telephony.call.started",
    call_answered: "telephony.call.answered",
    call_missed: "telephony.call.missed",
    call_failed: "telephony.call.failed",
    call_inbound: "telephony.call.inbound",
    call_dispositioned: "telephony.call.dispositioned",
    followup_scheduled: "telephony.followup.scheduled",
    followup_task_created: "telephony.followup.task_created",
    sms_sent: "telephony.sms.sent",
    sms_received: "telephony.sms.received",
    voicemail_received: "telephony.voicemail.received",
    created_lead: "lead.created",
    deleted_lead: "lead.deleted",
    converted_lead_to_property: "lead.converted_to_opportunity",
    auto_converted_lead: "lead.auto_converted_to_opportunity",
    created_opportunity: "opportunity.created",
    deleted_opportunity: "opportunity.deleted",
    created_property: "opportunity.created",
    updated_property: "opportunity.updated",
    deleted_property: "opportunity.deleted",
    added_note: "note.added",
    playground_open_session: "playground.session.opened",
    playground_send_to_crm: "playground.sent_to_crm",
    playground_voice_append_note: "playground.note.appended_by_voice",
    lead_voice_add_note: "lead.note.added_by_voice",
    campaign_enrolled: "campaign.enrolled",
    rvm_campaign_launched: "rvm.campaign.launched",
    campaign_opt_out: "campaign.opt_out",
    skip_trace_cached: "skip_trace.cached",
    skip_trace_requested: "skip_trace.requested",
    skip_trace_success: "skip_trace.success",
    skip_trace_failed: "skip_trace.failed"
  };
  return map[a] || a;
}
var MAX_TIME_ENTRY_HOURS = 16;
var MIN_TIME_ENTRY_MINUTES = 5;
var DatabaseStorage = class {
  // Leads
  async getLeads(limit, offset = 0) {
    let q = db.select().from(leads);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async listLeads(input) {
    const limit = typeof input.limit === "number" ? input.limit : 200;
    const offset = typeof input.offset === "number" ? input.offset : 0;
    if (Array.isArray(input.allowedAssignedToUserIds)) {
      const ids = input.allowedAssignedToUserIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
      if (!ids.length) return { items: [], total: 0 };
    }
    const whereParts = [];
    const archivedMode = input.archived || "exclude";
    if (archivedMode === "exclude") whereParts.push(isNull(leads.archivedAt));
    if (archivedMode === "only") whereParts.push(isNotNull(leads.archivedAt));
    const statusInRaw = Array.isArray(input.statusIn) ? input.statusIn : [];
    const statusIn = statusInRaw.map((s) => String(s || "").trim()).filter(Boolean).slice(0, 10);
    if (statusIn.length) {
      whereParts.push(inArray(leads.status, statusIn));
    } else {
      const status = String(input.status || "").trim();
      if (status && status !== "all") whereParts.push(eq(leads.status, status));
    }
    const zip = String(input.zip || "").trim();
    if (zip) whereParts.push(eq(leads.zipCode, zip));
    const state = String(input.state || "").trim();
    if (state) whereParts.push(eq(leads.state, state));
    const city = String(input.city || "").trim();
    if (city) whereParts.push(eq(leads.city, city));
    const county = String(input.county || "").trim();
    if (county) whereParts.push(eq(leads.county, county));
    const leadType = String(input.leadType || "").trim();
    if (leadType) whereParts.push(eq(leads.leadType, leadType));
    const owner = String(input.owner || "").trim().toLowerCase();
    if (owner) {
      const needle = `%${owner}%`;
      whereParts.push(sql2`lower(${leads.ownerName}) LIKE ${needle}`);
    }
    const qRaw = String(input.q || "").trim().toLowerCase();
    if (qRaw) {
      const needle = `%${qRaw}%`;
      whereParts.push(
        or(
          sql2`lower(${leads.address}) LIKE ${needle}`,
          sql2`lower(${leads.city}) LIKE ${needle}`,
          sql2`lower(${leads.ownerName}) LIKE ${needle}`,
          sql2`lower(${leads.ownerPhone}) LIKE ${needle}`,
          sql2`lower(${leads.ownerEmail}) LIKE ${needle}`,
          sql2`lower(${leads.zipCode}) LIKE ${needle}`
        )
      );
    }
    if (typeof input.assignedTo === "number") whereParts.push(eq(leads.assignedTo, input.assignedTo));
    if (input.assignedTo === "unassigned") whereParts.push(isNull(leads.assignedTo));
    if (Array.isArray(input.tags) && input.tags.length) {
      const cleaned = input.tags.map((t) => String(t || "").trim()).filter(Boolean);
      if (cleaned.length) {
        const arr = sql2`ARRAY[${sql2.join(cleaned.map((t) => sql2`${t}`), sql2`,`)}]::text[]`;
        const mode = input.tagsMode || "any";
        if (mode === "all") whereParts.push(sql2`${leads.tags} @> ${arr}`);
        else whereParts.push(sql2`${leads.tags} && ${arr}`);
      }
    }
    if (typeof input.scoreMin === "number" && Number.isFinite(input.scoreMin)) whereParts.push(gte(leads.relasScore, input.scoreMin));
    if (typeof input.scoreMax === "number" && Number.isFinite(input.scoreMax)) whereParts.push(lte(leads.relasScore, input.scoreMax));
    const contactPresence = input.contactPresence;
    if (contactPresence) {
      const hasPhone = sql2`COALESCE(NULLIF(TRIM(${leads.ownerPhone}), ''), NULL) IS NOT NULL`;
      const hasEmail = sql2`COALESCE(NULLIF(TRIM(${leads.ownerEmail}), ''), NULL) IS NOT NULL`;
      if (contactPresence === "phone_only") whereParts.push(and(hasPhone, sql2`NOT (${hasEmail})`));
      if (contactPresence === "email_only") whereParts.push(and(hasEmail, sql2`NOT (${hasPhone})`));
      if (contactPresence === "both") whereParts.push(and(hasPhone, hasEmail));
      if (contactPresence === "none") whereParts.push(and(sql2`NOT (${hasPhone})`, sql2`NOT (${hasEmail})`));
    }
    if (typeof input.hasNotes === "boolean") {
      if (input.hasNotes) whereParts.push(sql2`EXISTS (SELECT 1 FROM lead_notes ln WHERE ln.lead_id = ${leads.id})`);
      else whereParts.push(sql2`NOT EXISTS (SELECT 1 FROM lead_notes ln WHERE ln.lead_id = ${leads.id})`);
    }
    if (typeof input.noteUpdatedWithinDays === "number" && Number.isFinite(input.noteUpdatedWithinDays) && input.noteUpdatedWithinDays > 0) {
      whereParts.push(
        sql2`EXISTS (SELECT 1 FROM lead_notes ln WHERE ln.lead_id = ${leads.id} AND ln.created_at >= NOW() - (${input.noteUpdatedWithinDays}::int * INTERVAL '1 day'))`
      );
    }
    if (input.createdFrom) whereParts.push(gte(leads.createdAt, input.createdFrom));
    if (input.createdTo) whereParts.push(lte(leads.createdAt, input.createdTo));
    if (input.lastTouchFrom) whereParts.push(gte(leads.lastTouchAt, input.lastTouchFrom));
    if (input.lastTouchTo) whereParts.push(lte(leads.lastTouchAt, input.lastTouchTo));
    if (input.nextFollowUpFrom) whereParts.push(gte(leads.nextFollowUpAt, input.nextFollowUpFrom));
    if (input.nextFollowUpTo) whereParts.push(lte(leads.nextFollowUpAt, input.nextFollowUpTo));
    if (Array.isArray(input.allowedAssignedToUserIds)) {
      const ids = input.allowedAssignedToUserIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
      whereParts.push(inArray(leads.assignedTo, ids));
    }
    const whereClause = whereParts.length ? and(...whereParts) : void 0;
    const dir = input.sortDir === "asc" ? "asc" : "desc";
    const dirSql = dir === "asc" ? sql2`ASC` : sql2`DESC`;
    const sortKey = input.sortKey || "newest_imported";
    const orderByParts = [];
    if (sortKey === "newest_imported") orderByParts.push(desc(leads.createdAt), desc(leads.id));
    else if (sortKey === "oldest_imported") orderByParts.push(asc(leads.createdAt), asc(leads.id));
    else if (sortKey === "highest_score") orderByParts.push(sql2`${leads.relasScore} DESC NULLS LAST`, desc(leads.createdAt), desc(leads.id));
    else if (sortKey === "lowest_score") orderByParts.push(sql2`${leads.relasScore} ASC NULLS LAST`, desc(leads.createdAt), desc(leads.id));
    else if (sortKey === "highest_value") orderByParts.push(sql2`${leads.estimatedValue} ${dirSql} NULLS LAST`, desc(leads.createdAt), desc(leads.id));
    else if (sortKey === "recently_updated") orderByParts.push(sql2`${leads.updatedAt} ${dirSql}`, desc(leads.id));
    else if (sortKey === "oldest_untouched") orderByParts.push(sql2`COALESCE(${leads.lastTouchAt}, ${leads.createdAt}) ASC`, asc(leads.id));
    else if (sortKey === "most_recent_contact") orderByParts.push(sql2`${leads.lastTouchAt} DESC NULLS LAST`, desc(leads.createdAt), desc(leads.id));
    else if (sortKey === "status_age") orderByParts.push(sql2`${leads.statusChangedAt} ${dirSql} NULLS LAST`, desc(leads.createdAt), desc(leads.id));
    else if (sortKey === "assigned_user") orderByParts.push(sql2`${leads.assignedTo} ${dirSql} NULLS LAST`, desc(leads.createdAt), desc(leads.id));
    else orderByParts.push(desc(leads.createdAt), desc(leads.id));
    let q = db.select().from(leads);
    if (whereClause) q = q.where(whereClause);
    q = q.orderBy(...orderByParts).limit(limit).offset(offset);
    const items = await q;
    let cq = db.select({ count: sql2`count(*)::int` }).from(leads);
    if (whereClause) cq = cq.where(whereClause);
    const countRows = await cq;
    const total = Number(countRows?.[0]?.count || 0);
    return { items, total };
  }
  async getLeadById(id) {
    const result = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
    return result[0];
  }
  async createLead(lead) {
    const result = await db.insert(leads).values(lead).returning();
    return result[0];
  }
  async updateLead(id, lead) {
    const result = await db.update(leads).set(lead).where(eq(leads.id, id)).returning();
    return result[0];
  }
  async deleteLead(id) {
    await db.delete(leads).where(eq(leads.id, id));
  }
  async listLeadNotes(leadId, limit = 50) {
    const n = Number.isFinite(limit) ? Math.max(1, Math.min(500, limit)) : 50;
    return db.select().from(leadNotes).where(eq(leadNotes.leadId, leadId)).orderBy(desc(leadNotes.createdAt), desc(leadNotes.id)).limit(n);
  }
  async createLeadNote(input) {
    const result = await db.insert(leadNotes).values(input).returning();
    return result[0];
  }
  async getLeadNotesAggByLeadIds(leadIds) {
    const ids = (leadIds || []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    if (!ids.length) return [];
    const rows = await db.select({
      leadId: leadNotes.leadId,
      notesCount: sql2`count(*)::int`,
      lastNoteAt: sql2`max(${leadNotes.createdAt})`
    }).from(leadNotes).where(inArray(leadNotes.leadId, ids)).groupBy(leadNotes.leadId);
    const latestRows = await db.execute(sql2`
      SELECT DISTINCT ON (lead_id)
        lead_id as "leadId",
        body as "body",
        created_at as "createdAt"
      FROM lead_notes
      WHERE lead_id IN (${sql2.join(ids.map((id) => sql2`${id}`), sql2`,`)})
      ORDER BY lead_id, created_at DESC, id DESC
    `);
    const latestByLeadId = /* @__PURE__ */ new Map();
    for (const r of latestRows.rows || []) {
      const lid = Number(r.leadId);
      if (!Number.isFinite(lid) || lid <= 0) continue;
      latestByLeadId.set(lid, { body: String(r.body || ""), createdAt: r.createdAt ? new Date(r.createdAt) : null });
    }
    return rows.map((r) => {
      const lid = Number(r.leadId);
      const latest = latestByLeadId.get(lid);
      return {
        leadId: lid,
        notesCount: Number(r.notesCount || 0),
        lastNoteAt: r.lastNoteAt ? new Date(r.lastNoteAt) : latest?.createdAt ?? null,
        lastNotePreview: latest ? String(latest.body || "").trim().slice(0, 280) || null : null
      };
    });
  }
  async listSavedViews(input) {
    const entityType = String(input.entityType || "").trim();
    const userId = Number(input.userId);
    const teamIds = (input.teamIds || []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    if (!entityType || !Number.isFinite(userId) || userId <= 0) return [];
    const whereParts = [eq(savedViews.entityType, entityType)];
    const scopes = [eq(savedViews.ownerUserId, userId)];
    if (teamIds.length) scopes.push(and(eq(savedViews.visibility, "team"), inArray(savedViews.teamId, teamIds)));
    scopes.push(and(eq(savedViews.visibility, "link"), eq(savedViews.ownerUserId, userId)));
    whereParts.push(or(...scopes));
    return db.select().from(savedViews).where(and(...whereParts)).orderBy(desc(savedViews.updatedAt), desc(savedViews.id));
  }
  async getSavedViewById(id) {
    const out = await db.select().from(savedViews).where(eq(savedViews.id, id)).limit(1);
    return out[0];
  }
  async getSavedViewByShareToken(token) {
    const t = String(token || "").trim();
    if (!t) return void 0;
    const out = await db.select().from(savedViews).where(and(eq(savedViews.shareToken, t), eq(savedViews.visibility, "link"))).limit(1);
    return out[0];
  }
  async createSavedView(input) {
    const result = await db.insert(savedViews).values(input).returning();
    return result[0];
  }
  async updateSavedView(id, patch) {
    const result = await db.update(savedViews).set({ ...patch, updatedAt: /* @__PURE__ */ new Date() }).where(eq(savedViews.id, id)).returning();
    return result[0];
  }
  async deleteSavedView(id) {
    await db.delete(savedViews).where(eq(savedViews.id, id));
  }
  async createLeadBulkActionJob(input) {
    const result = await db.insert(leadBulkActionJobs).values(input).returning();
    return result[0];
  }
  async getLeadBulkActionJobById(id) {
    const out = await db.select().from(leadBulkActionJobs).where(eq(leadBulkActionJobs.id, id)).limit(1);
    return out[0];
  }
  async updateLeadBulkActionJob(id, patch) {
    const result = await db.update(leadBulkActionJobs).set({ ...patch, updatedAt: /* @__PURE__ */ new Date() }).where(eq(leadBulkActionJobs.id, id)).returning();
    return result[0];
  }
  async createAiActionLog(input) {
    const result = await db.insert(aiActionLogs).values(input).returning();
    return result[0];
  }
  async createAiActionUndo(input) {
    const result = await db.insert(aiActionUndo).values(input).returning();
    return result[0];
  }
  async getAiActionUndoByActionId(aiActionLogId) {
    const out = await db.select().from(aiActionUndo).where(eq(aiActionUndo.aiActionLogId, aiActionLogId)).limit(1);
    return out[0];
  }
  async updateAiActionUndo(id, patch) {
    const result = await db.update(aiActionUndo).set(patch).where(eq(aiActionUndo.id, id)).returning();
    return result[0];
  }
  async createAppAuditRun(input) {
    const result = await db.insert(appAuditRuns).values(input).returning();
    return result[0];
  }
  async listAppAuditRuns(input) {
    const n = typeof input.limit === "number" ? Math.max(1, Math.min(200, input.limit)) : 50;
    return db.select().from(appAuditRuns).where(eq(appAuditRuns.createdBy, input.createdBy)).orderBy(desc(appAuditRuns.createdAt), desc(appAuditRuns.id)).limit(n);
  }
  async createAppAuditFinding(input) {
    const result = await db.insert(appAuditFindings).values(input).returning();
    return result[0];
  }
  async listAppAuditFindings(input) {
    const n = typeof input.limit === "number" ? Math.max(1, Math.min(1e3, input.limit)) : 200;
    return db.select().from(appAuditFindings).where(eq(appAuditFindings.runId, input.runId)).orderBy(desc(appAuditFindings.updatedAt), desc(appAuditFindings.id)).limit(n);
  }
  async updateAppAuditFinding(id, patch) {
    const result = await db.update(appAuditFindings).set({ ...patch, updatedAt: /* @__PURE__ */ new Date() }).where(eq(appAuditFindings.id, id)).returning();
    return result[0];
  }
  async getLatestSkipTraceForLead(leadId) {
    const result = await db.select().from(skipTraceResults).where(eq(skipTraceResults.leadId, leadId)).orderBy(desc(skipTraceResults.requestedAt)).limit(1);
    return result[0];
  }
  async getLatestSkipTraceForProperty(propertyId) {
    const result = await db.select().from(skipTraceResults).where(eq(skipTraceResults.propertyId, propertyId)).orderBy(desc(skipTraceResults.requestedAt)).limit(1);
    return result[0];
  }
  async getLatestSkipTraceByCacheKey(cacheKey) {
    const result = await db.select().from(skipTraceResults).where(eq(skipTraceResults.cacheKey, cacheKey)).orderBy(desc(skipTraceResults.requestedAt)).limit(1);
    return result[0];
  }
  async createSkipTraceResult(input) {
    const result = await db.insert(skipTraceResults).values(input).returning();
    return result[0];
  }
  async updateSkipTraceResult(id, patch) {
    const result = await db.update(skipTraceResults).set(patch).where(eq(skipTraceResults.id, id)).returning();
    return result[0];
  }
  async createSkipTraceJob(input) {
    const result = await db.insert(skipTraceJobs).values(input).returning();
    return result[0];
  }
  async updateSkipTraceJob(id, patch) {
    const result = await db.update(skipTraceJobs).set(patch).where(eq(skipTraceJobs.id, id)).returning();
    return result[0];
  }
  async getSkipTraceJobById(id) {
    const result = await db.select().from(skipTraceJobs).where(eq(skipTraceJobs.id, id)).limit(1);
    return result[0];
  }
  async listSkipTraceJobsForEntity(entityType, entityId, limit = 20) {
    return db.select().from(skipTraceJobs).where(and(eq(skipTraceJobs.entityType, entityType), eq(skipTraceJobs.entityId, entityId))).orderBy(desc(skipTraceJobs.createdAt), desc(skipTraceJobs.id)).limit(limit);
  }
  async listQueuedSkipTraceJobs(limit = 25) {
    return db.select().from(skipTraceJobs).where(eq(skipTraceJobs.status, "queued")).orderBy(asc(skipTraceJobs.createdAt), asc(skipTraceJobs.id)).limit(limit);
  }
  async claimSkipTraceJobForRun(id, startedAt) {
    const result = await db.update(skipTraceJobs).set({ status: "running", startedAt, errorMessage: null }).where(and(eq(skipTraceJobs.id, id), eq(skipTraceJobs.status, "queued"))).returning();
    return result[0];
  }
  async createSkipTraceJobEvent(input) {
    const result = await db.insert(skipTraceJobEvents).values(input).returning();
    return result[0];
  }
  async listSkipTraceJobEvents(jobId, limit = 200) {
    return db.select().from(skipTraceJobEvents).where(eq(skipTraceJobEvents.jobId, jobId)).orderBy(asc(skipTraceJobEvents.createdAt), asc(skipTraceJobEvents.id)).limit(limit);
  }
  async createSkipTraceEvidence(input) {
    const result = await db.insert(skipTraceEvidence).values(input).returning();
    return result[0];
  }
  async listSkipTraceEvidence(jobId, limit = 500) {
    return db.select().from(skipTraceEvidence).where(eq(skipTraceEvidence.jobId, jobId)).orderBy(desc(skipTraceEvidence.collectedAt), desc(skipTraceEvidence.id)).limit(limit);
  }
  async createLeadScoreSnapshot(input) {
    const result = await db.insert(leadScoreSnapshots).values(input).returning();
    return result[0];
  }
  async getLatestLeadScoreSnapshot(entityType, entityId) {
    const result = await db.select().from(leadScoreSnapshots).where(and(eq(leadScoreSnapshots.entityType, entityType), eq(leadScoreSnapshots.entityId, entityId))).orderBy(desc(leadScoreSnapshots.createdAt), desc(leadScoreSnapshots.id)).limit(1);
    return result[0];
  }
  async listLeadScoreSnapshotsByJobId(jobId) {
    return db.select().from(leadScoreSnapshots).where(eq(leadScoreSnapshots.jobId, jobId)).orderBy(desc(leadScoreSnapshots.createdAt), desc(leadScoreSnapshots.id));
  }
  async getLeadSourceOptions(userId) {
    return db.select().from(leadSourceOptions).where(and(eq(leadSourceOptions.isActive, true), or(isNull(leadSourceOptions.userId), eq(leadSourceOptions.userId, userId)))).orderBy(leadSourceOptions.sortOrder);
  }
  async upsertLeadSourceOption(input) {
    const v = input;
    const existing = await db.select().from(leadSourceOptions).where(and(eq(leadSourceOptions.userId, v.userId), eq(leadSourceOptions.value, v.value))).limit(1);
    if (existing[0]) {
      const result2 = await db.update(leadSourceOptions).set({ label: v.label, isActive: v.isActive, sortOrder: v.sortOrder, updatedAt: /* @__PURE__ */ new Date() }).where(eq(leadSourceOptions.id, existing[0].id)).returning();
      return result2[0];
    }
    const result = await db.insert(leadSourceOptions).values(input).returning();
    return result[0];
  }
  async getCampaigns(userId) {
    return db.select().from(campaigns).where(eq(campaigns.userId, userId)).orderBy(desc(campaigns.createdAt));
  }
  async createCampaign(input) {
    const result = await db.insert(campaigns).values(input).returning();
    return result[0];
  }
  async updateCampaign(id, patch) {
    const result = await db.update(campaigns).set({ ...patch, updatedAt: /* @__PURE__ */ new Date() }).where(eq(campaigns.id, id)).returning();
    return result[0];
  }
  async deleteCampaign(id) {
    await db.delete(campaignDeliveries).where(eq(campaignDeliveries.campaignId, id));
    await db.delete(campaignEnrollments).where(eq(campaignEnrollments.campaignId, id));
    await db.delete(campaignSteps).where(eq(campaignSteps.campaignId, id));
    await db.delete(campaigns).where(eq(campaigns.id, id));
  }
  async getCampaignSteps(campaignId) {
    return db.select().from(campaignSteps).where(eq(campaignSteps.campaignId, campaignId)).orderBy(campaignSteps.stepOrder);
  }
  async replaceCampaignSteps(campaignId, steps) {
    await db.delete(campaignSteps).where(eq(campaignSteps.campaignId, campaignId));
    if (!steps.length) return [];
    const result = await db.insert(campaignSteps).values(steps.map((s) => ({ ...s, campaignId }))).returning();
    return result;
  }
  async enrollCampaignLeads(campaignId, leadIds) {
    const deduped = Array.from(new Set((leadIds || []).filter((n) => Number.isFinite(n))));
    if (!deduped.length) return;
    for (const leadId of deduped) {
      await db.execute(sql2`
        INSERT INTO campaign_enrollments (campaign_id, lead_id, status, started_at, next_step_order, next_run_at)
        VALUES (${campaignId}, ${leadId}, 'active', NOW(), 0, NOW())
        ON CONFLICT DO NOTHING
      `);
    }
  }
  async getCampaignStats(campaignId) {
    const rows = await db.execute(sql2`
      SELECT
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END)::int AS sends,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::int AS failed
      FROM campaign_deliveries
      WHERE campaign_id = ${campaignId}
    `);
    const r = rows.rows?.[0] || {};
    return { sends: Number(r.sends || 0), failed: Number(r.failed || 0) };
  }
  async getRvmAudioAssets(userId) {
    return db.select().from(rvmAudioAssets).where(eq(rvmAudioAssets.userId, userId)).orderBy(desc(rvmAudioAssets.createdAt));
  }
  async createRvmAudioAsset(input) {
    const result = await db.insert(rvmAudioAssets).values(input).returning();
    return result[0];
  }
  async deleteRvmAudioAsset(id) {
    await db.delete(rvmAudioAssets).where(eq(rvmAudioAssets.id, id));
  }
  async getRvmCampaigns(userId) {
    return db.select().from(rvmCampaigns).where(eq(rvmCampaigns.userId, userId)).orderBy(desc(rvmCampaigns.createdAt));
  }
  async createRvmCampaign(input) {
    const result = await db.insert(rvmCampaigns).values(input).returning();
    return result[0];
  }
  async updateRvmCampaign(id, patch) {
    const result = await db.update(rvmCampaigns).set({ ...patch, updatedAt: /* @__PURE__ */ new Date() }).where(eq(rvmCampaigns.id, id)).returning();
    return result[0];
  }
  async deleteRvmCampaign(id) {
    await db.delete(rvmDrops).where(eq(rvmDrops.campaignId, id));
    await db.delete(rvmCampaigns).where(eq(rvmCampaigns.id, id));
  }
  async createRvmDrops(drops) {
    if (!drops.length) return;
    await db.insert(rvmDrops).values(drops);
  }
  async getPendingRvmDrops(limit = 100) {
    return db.select().from(rvmDrops).where(inArray(rvmDrops.status, ["queued", "sending"])).orderBy(desc(rvmDrops.requestedAt)).limit(limit);
  }
  async updateRvmDrop(id, patch) {
    const result = await db.update(rvmDrops).set(patch).where(eq(rvmDrops.id, id)).returning();
    return result[0];
  }
  async getRvmCampaignDrops(campaignId, limit = 200) {
    return db.select().from(rvmDrops).where(eq(rvmDrops.campaignId, campaignId)).orderBy(desc(rvmDrops.requestedAt)).limit(limit);
  }
  // Properties
  async getProperties(limit, offset = 0, assignedTo) {
    let q = db.select().from(properties);
    if (typeof assignedTo === "number" && Number.isFinite(assignedTo)) q = q.where(eq(properties.assignedTo, assignedTo));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getPropertyById(id) {
    const result = await db.select().from(properties).where(eq(properties.id, id)).limit(1);
    return result[0];
  }
  async getPropertyBySourceLeadId(sourceLeadId) {
    const result = await db.select().from(properties).where(eq(properties.sourceLeadId, sourceLeadId)).limit(1);
    return result[0];
  }
  async getPropertiesBySourceLeadIds(sourceLeadIds) {
    const unique = Array.from(new Set((sourceLeadIds || []).filter((v) => typeof v === "number" && Number.isFinite(v) && v > 0)));
    if (!unique.length) return [];
    const rows = await db.select({ id: properties.id, sourceLeadId: properties.sourceLeadId }).from(properties).where(inArray(properties.sourceLeadId, unique));
    return rows;
  }
  async createProperty(property) {
    const result = await db.insert(properties).values(property).returning();
    return result[0];
  }
  async updateProperty(id, property) {
    const result = await db.update(properties).set(property).where(eq(properties.id, id)).returning();
    return result[0];
  }
  async deleteProperty(id) {
    await db.delete(properties).where(eq(properties.id, id));
  }
  // Contacts
  async getContacts(limit, offset = 0) {
    let q = db.select().from(contacts);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getContactById(id) {
    const result = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
    return result[0];
  }
  async createContact(contact) {
    const result = await db.insert(contacts).values(contact).returning();
    return result[0];
  }
  async updateContact(id, contact) {
    const result = await db.update(contacts).set(contact).where(eq(contacts.id, id)).returning();
    return result[0];
  }
  async deleteContact(id) {
    await db.delete(contacts).where(eq(contacts.id, id));
  }
  // Companies
  async listCompanies(input) {
    const limit = typeof input.limit === "number" ? input.limit : 50;
    const offset = typeof input.offset === "number" ? input.offset : 0;
    const whereParts = [eq(companies.teamId, input.teamId)];
    const companyType = String(input.companyType || "").trim();
    if (companyType && companyType !== "all") whereParts.push(eq(companies.companyType, companyType));
    const qRaw = String(input.q || "").trim().toLowerCase();
    if (qRaw) {
      const needle = `%${qRaw}%`;
      whereParts.push(or(sql2`lower(${companies.name}) LIKE ${needle}`, sql2`lower(${companies.email}) LIKE ${needle}`));
    }
    const whereClause = and(...whereParts);
    const items = await db.select().from(companies).where(whereClause).orderBy(asc(companies.name), asc(companies.id)).limit(limit).offset(offset);
    const countRows = await db.select({ count: sql2`count(*)::int` }).from(companies).where(whereClause);
    const total = Number(countRows?.[0]?.count || 0);
    return { items, total };
  }
  async getCompanyById(id) {
    const result = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
    return result[0];
  }
  async createCompany(company) {
    const result = await db.insert(companies).values(company).returning();
    return result[0];
  }
  async updateCompany(id, patch) {
    const result = await db.update(companies).set(patch).where(eq(companies.id, id)).returning();
    return result[0];
  }
  async deleteCompany(id) {
    await db.delete(companies).where(eq(companies.id, id));
  }
  async getCompanyPeople(companyId) {
    const rows = await db.select({ companyPerson: companyPeople, contact: contacts }).from(companyPeople).innerJoin(contacts, eq(companyPeople.contactId, contacts.id)).where(eq(companyPeople.companyId, companyId)).orderBy(desc(companyPeople.isPrimary), asc(companyPeople.id));
    return rows;
  }
  async createCompanyPerson(input) {
    const result = await db.insert(companyPeople).values(input).returning();
    return result[0];
  }
  async deleteCompanyPerson(id) {
    await db.delete(companyPeople).where(eq(companyPeople.id, id));
  }
  async listCompanyLinksForEntity(input) {
    const rows = await db.select({ link: companyLinks, company: companies }).from(companyLinks).innerJoin(companies, eq(companyLinks.companyId, companies.id)).where(and(eq(companyLinks.teamId, input.teamId), eq(companyLinks.entityType, input.entityType), eq(companyLinks.entityId, input.entityId))).orderBy(asc(companies.name), asc(companyLinks.id));
    return rows;
  }
  async createCompanyLink(input) {
    const rows = await db.insert(companyLinks).values(input).returning();
    return rows[0];
  }
  async deleteCompanyLinkForTeam(teamId, id) {
    await db.delete(companyLinks).where(and(eq(companyLinks.id, id), eq(companyLinks.teamId, teamId)));
  }
  // Document Vault
  async listDocuments(input) {
    const limit = typeof input.limit === "number" ? input.limit : 50;
    const offset = typeof input.offset === "number" ? input.offset : 0;
    const whereParts = [eq(documents.teamId, input.teamId)];
    const qRaw = String(input.q || "").trim().toLowerCase();
    if (qRaw) {
      const needle = `%${qRaw}%`;
      whereParts.push(or(sql2`lower(${documents.title}) LIKE ${needle}`, sql2`lower(${documents.kind}) LIKE ${needle}`));
    }
    const tag = String(input.tag || "").trim();
    if (tag) {
      whereParts.push(sql2`coalesce(${documents.tags}, ARRAY[]::text[]) @> ARRAY[${tag}]::text[]`);
    }
    const entityType = String(input.entityType || "").trim();
    const entityId = typeof input.entityId === "number" ? input.entityId : void 0;
    const whereDocs = whereParts.length ? and(...whereParts) : void 0;
    if (entityType && typeof entityId === "number" && Number.isFinite(entityId)) {
      const whereLinks = and(eq(documentLinks.teamId, input.teamId), eq(documentLinks.entityType, entityType), eq(documentLinks.entityId, entityId));
      const joinWhere = whereDocs ? and(whereDocs, whereLinks) : whereLinks;
      const idRows = await db.select({ id: documents.id }).from(documents).innerJoin(documentLinks, eq(documentLinks.documentId, documents.id)).where(joinWhere).groupBy(documents.id).orderBy(desc(documents.createdAt), desc(documents.id)).limit(limit).offset(offset);
      const ids = idRows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n > 0);
      const items2 = ids.length > 0 ? await db.select().from(documents).where(inArray(documents.id, ids)).orderBy(desc(documents.createdAt), desc(documents.id)) : [];
      const countRows2 = await db.select({ count: sql2`count(distinct ${documents.id})::int` }).from(documents).innerJoin(documentLinks, eq(documentLinks.documentId, documents.id)).where(joinWhere);
      const total2 = Number(countRows2?.[0]?.count || 0);
      return { items: items2, total: total2 };
    }
    let q = db.select().from(documents);
    if (whereDocs) q = q.where(whereDocs);
    q = q.orderBy(desc(documents.createdAt), desc(documents.id)).limit(limit).offset(offset);
    const items = await q;
    let cq = db.select({ count: sql2`count(*)::int` }).from(documents);
    if (whereDocs) cq = cq.where(whereDocs);
    const countRows = await cq;
    const total = Number(countRows?.[0]?.count || 0);
    return { items, total };
  }
  async getDocumentById(id) {
    const result = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
    return result[0];
  }
  async createDocument(input) {
    const result = await db.insert(documents).values(input).returning();
    return result[0];
  }
  async updateDocument(id, patch) {
    const result = await db.update(documents).set(patch).where(eq(documents.id, id)).returning();
    return result[0];
  }
  async deleteDocument(id) {
    await db.delete(documents).where(eq(documents.id, id));
  }
  async getDocumentLinksByDocumentId(documentId) {
    const rows = await db.select().from(documentLinks).where(eq(documentLinks.documentId, documentId)).orderBy(desc(documentLinks.createdAt), desc(documentLinks.id));
    return rows;
  }
  async getDocumentLinkById(id) {
    const rows = await db.select().from(documentLinks).where(eq(documentLinks.id, id)).limit(1);
    return rows[0];
  }
  async createDocumentLink(input) {
    const result = await db.insert(documentLinks).values(input).returning();
    return result[0];
  }
  async deleteDocumentLink(id) {
    await db.delete(documentLinks).where(eq(documentLinks.id, id));
  }
  async deleteDocumentLinkForTeam(teamId, id) {
    await db.delete(documentLinks).where(and(eq(documentLinks.id, id), eq(documentLinks.teamId, teamId)));
  }
  async getVaultDocumentVersions(documentId) {
    const rows = await db.select().from(vaultDocumentVersions).where(eq(vaultDocumentVersions.documentId, documentId)).orderBy(desc(vaultDocumentVersions.version), desc(vaultDocumentVersions.id));
    return rows;
  }
  async createVaultDocumentVersion(input) {
    const result = await db.insert(vaultDocumentVersions).values(input).returning();
    return result[0];
  }
  // Automations
  async listAutomations(teamId, limit, offset = 0) {
    let q = db.select().from(automations).where(eq(automations.teamId, teamId)).orderBy(desc(automations.updatedAt), desc(automations.id));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getAutomationById(id) {
    const rows = await db.select().from(automations).where(eq(automations.id, id)).limit(1);
    return rows[0];
  }
  async createAutomation(input) {
    const rows = await db.insert(automations).values(input).returning();
    return rows[0];
  }
  async updateAutomation(id, patch) {
    const rows = await db.update(automations).set(patch).where(eq(automations.id, id)).returning();
    return rows[0];
  }
  async deleteAutomation(id) {
    await db.delete(automations).where(eq(automations.id, id));
  }
  async getAutomationTriggers(automationId) {
    const rows = await db.select().from(automationTriggers).where(eq(automationTriggers.automationId, automationId)).orderBy(asc(automationTriggers.id));
    return rows;
  }
  async replaceAutomationTriggers(teamId, automationId, triggers) {
    await db.delete(automationTriggers).where(eq(automationTriggers.automationId, automationId));
    if (!triggers.length) return [];
    const rows = await db.insert(automationTriggers).values(
      triggers.map((t) => ({
        teamId,
        automationId,
        eventType: String(t.eventType || "").trim(),
        configJson: String(t.configJson || "{}")
      }))
    ).returning();
    return rows;
  }
  async getAutomationCondition(automationId) {
    const rows = await db.select().from(automationConditions).where(eq(automationConditions.automationId, automationId)).limit(1);
    return rows[0];
  }
  async upsertAutomationCondition(teamId, automationId, configJson) {
    const existing = await this.getAutomationCondition(automationId);
    if (existing) {
      const rows2 = await db.update(automationConditions).set({ configJson: String(configJson || "{}") }).where(eq(automationConditions.id, existing.id)).returning();
      return rows2[0];
    }
    const rows = await db.insert(automationConditions).values({ teamId, automationId, configJson: String(configJson || "{}") }).returning();
    return rows[0];
  }
  async getAutomationActions(automationId) {
    const rows = await db.select().from(automationActions).where(eq(automationActions.automationId, automationId)).orderBy(asc(automationActions.sortOrder), asc(automationActions.id));
    return rows;
  }
  async replaceAutomationActions(teamId, automationId, actions) {
    await db.delete(automationActions).where(eq(automationActions.automationId, automationId));
    if (!actions.length) return [];
    const rows = await db.insert(automationActions).values(
      actions.map((a) => ({
        teamId,
        automationId,
        actionType: String(a.actionType || "").trim(),
        configJson: String(a.configJson || "{}"),
        sortOrder: typeof a.sortOrder === "number" ? a.sortOrder : 0
      }))
    ).returning();
    return rows;
  }
  async createAutomationRun(input) {
    const rows = await db.insert(automationRuns).values(input).returning();
    return rows[0];
  }
  async updateAutomationRun(id, patch) {
    const rows = await db.update(automationRuns).set(patch).where(eq(automationRuns.id, id)).returning();
    return rows[0];
  }
  async listAutomationRuns(teamId, automationId, limit, offset = 0) {
    let q = db.select().from(automationRuns).where(and(eq(automationRuns.teamId, teamId), eq(automationRuns.automationId, automationId))).orderBy(desc(automationRuns.createdAt), desc(automationRuns.id));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getEnabledAutomationsForEvent(teamId, eventType) {
    const rows = await db.select({ automation: automations, trigger: automationTriggers }).from(automations).innerJoin(automationTriggers, eq(automationTriggers.automationId, automations.id)).where(and(eq(automations.teamId, teamId), eq(automations.enabled, true), eq(automationTriggers.eventType, eventType)));
    const byAutomationId = /* @__PURE__ */ new Map();
    for (const r of rows) {
      const a = r.automation;
      const t = r.trigger;
      const id = Number(a.id);
      const existing = byAutomationId.get(id);
      if (existing) existing.triggers.push(t);
      else byAutomationId.set(id, { automation: a, triggers: [t] });
    }
    const out = [];
    for (const [id, bundle] of byAutomationId.entries()) {
      const condition = await this.getAutomationCondition(id) || null;
      const actions = await this.getAutomationActions(id);
      out.push({ automation: bundle.automation, triggers: bundle.triggers, condition, actions });
    }
    return out;
  }
  // Contracts
  async getContracts(limit, offset = 0) {
    let q = db.select().from(contracts);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getContractsByPropertyId(propertyId, limit, offset = 0) {
    let q = db.select().from(contracts).where(eq(contracts.propertyId, propertyId));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getContractById(id) {
    const result = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
    return result[0];
  }
  async createContract(contract) {
    const result = await db.insert(contracts).values(contract).returning();
    return result[0];
  }
  async updateContract(id, contract) {
    const result = await db.update(contracts).set(contract).where(eq(contracts.id, id)).returning();
    return result[0];
  }
  async deleteContract(id) {
    await db.delete(contracts).where(eq(contracts.id, id));
  }
  // Contract Templates
  async getContractTemplates(opts) {
    const conds = [];
    if (opts?.category) conds.push(eq(contractTemplates.category, opts.category));
    if (opts?.jurisdiction) conds.push(eq(contractTemplates.jurisdiction, opts.jurisdiction));
    if (opts?.status) conds.push(eq(contractTemplates.status, opts.status));
    if (typeof opts?.ownerUserId === "number") conds.push(eq(contractTemplates.ownerUserId, opts.ownerUserId));
    if (!opts?.includeArchived) conds.push(ne(contractTemplates.status, "archived"));
    if (opts?.q) {
      const pattern = `%${String(opts.q).toLowerCase()}%`;
      conds.push(or(like(contractTemplates.name, pattern), like(contractTemplates.category, pattern)));
    }
    let q = conds.length ? db.select().from(contractTemplates).where(and(...conds)) : db.select().from(contractTemplates);
    if (typeof opts?.limit === "number") q = q.limit(opts.limit).offset(opts.offset || 0);
    return q;
  }
  async getContractTemplateById(id) {
    const result = await db.select().from(contractTemplates).where(eq(contractTemplates.id, id)).limit(1);
    return result[0];
  }
  async createContractTemplate(template) {
    const result = await db.insert(contractTemplates).values(template).returning();
    return result[0];
  }
  async updateContractTemplate(id, template) {
    const result = await db.update(contractTemplates).set(template).where(eq(contractTemplates.id, id)).returning();
    return result[0];
  }
  async approveContractTemplate(id, userId) {
    const result = await db.update(contractTemplates).set({
      status: "approved",
      approvedByUserId: userId,
      approvedAt: /* @__PURE__ */ new Date(),
      lastReviewedAt: /* @__PURE__ */ new Date(),
      isActive: true
    }).where(eq(contractTemplates.id, id)).returning();
    return result[0];
  }
  async cloneContractTemplate(parentId, ownerUserId) {
    const parent = await this.getContractTemplateById(parentId);
    if (!parent) return void 0;
    const nextVersion = Number(parent.version || 1) + 1;
    const result = await db.insert(contractTemplates).values({
      name: parent.name,
      description: parent.description,
      category: parent.category,
      content: parent.content,
      mergeFields: parent.mergeFields,
      isActive: false,
      jurisdiction: parent.jurisdiction,
      status: "draft",
      ownerUserId,
      version: nextVersion,
      sourceFormat: parent.sourceFormat,
      parentTemplateId: parent.id
    }).returning();
    return result[0];
  }
  async deleteContractTemplate(id) {
    await db.delete(contractTemplates).where(eq(contractTemplates.id, id));
  }
  // Contract Documents
  async getContractDocuments(limit, offset = 0) {
    let q = db.select().from(contractDocuments);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getContractDocumentById(id) {
    const result = await db.select().from(contractDocuments).where(eq(contractDocuments.id, id)).limit(1);
    return result[0];
  }
  async createContractDocument(document) {
    const result = await db.insert(contractDocuments).values(document).returning();
    return result[0];
  }
  async updateContractDocument(id, document) {
    const result = await db.update(contractDocuments).set(document).where(eq(contractDocuments.id, id)).returning();
    return result[0];
  }
  async deleteContractDocument(id) {
    await db.delete(contractDocuments).where(eq(contractDocuments.id, id));
  }
  async getContractEnvelopesByDocument(documentId) {
    return db.select().from(contractEnvelopes).where(eq(contractEnvelopes.documentId, documentId)).orderBy(desc(contractEnvelopes.createdAt));
  }
  async getContractEnvelopeById(id) {
    const result = await db.select().from(contractEnvelopes).where(eq(contractEnvelopes.id, id)).limit(1);
    return result[0];
  }
  async getContractEnvelopeByTokenHash(tokenHash) {
    const result = await db.select().from(contractEnvelopes).where(eq(contractEnvelopes.tokenHash, tokenHash)).limit(1);
    return result[0];
  }
  async createContractEnvelope(input) {
    const result = await db.insert(contractEnvelopes).values(input).returning();
    return result[0];
  }
  async updateContractEnvelope(id, patch) {
    const result = await db.update(contractEnvelopes).set({ ...patch, updatedAt: /* @__PURE__ */ new Date() }).where(eq(contractEnvelopes.id, id)).returning();
    return result[0];
  }
  async getContractSignersByContract(contractId) {
    return db.select().from(contractSigners).where(eq(contractSigners.contractId, contractId)).orderBy(contractSigners.signingOrder);
  }
  async getContractSignerByTokenHash(tokenHash) {
    const result = await db.select().from(contractSigners).where(eq(contractSigners.tokenHash, tokenHash)).limit(1);
    return result[0];
  }
  async createContractSigner(input) {
    const result = await db.insert(contractSigners).values(input).returning();
    return result[0];
  }
  async updateContractSigner(id, patch) {
    const result = await db.update(contractSigners).set({ ...patch, updatedAt: /* @__PURE__ */ new Date() }).where(eq(contractSigners.id, id)).returning();
    return result[0];
  }
  async getContractEventsByContract(contractId) {
    return db.select().from(contractEvents).where(eq(contractEvents.contractId, contractId)).orderBy(desc(contractEvents.createdAt));
  }
  async createContractEvent(input) {
    const result = await db.insert(contractEvents).values(input).returning();
    return result[0];
  }
  async getContractFieldsByContract(contractId) {
    return db.select().from(contractFields).where(eq(contractFields.contractId, contractId));
  }
  async createContractField(input) {
    const result = await db.insert(contractFields).values(input).returning();
    return result[0];
  }
  async updateContractField(id, patch) {
    const result = await db.update(contractFields).set({ ...patch, updatedAt: /* @__PURE__ */ new Date() }).where(eq(contractFields.id, id)).returning();
    return result[0];
  }
  async deleteContractField(id) {
    await db.delete(contractFields).where(eq(contractFields.id, id));
  }
  async getSyncIdempotency(userId, key) {
    const result = await db.select().from(syncIdempotency).where(and(eq(syncIdempotency.userId, userId), eq(syncIdempotency.idempotencyKey, key))).limit(1);
    return result[0];
  }
  async createSyncIdempotency(input) {
    const result = await db.insert(syncIdempotency).values(input).returning();
    return result[0];
  }
  async createFieldMediaAsset(input) {
    const result = await db.insert(fieldMediaAssets).values(input).returning();
    return result[0];
  }
  async getFieldMediaAssetsByLead(leadId, limit = 50) {
    return db.select().from(fieldMediaAssets).where(eq(fieldMediaAssets.leadId, leadId)).orderBy(desc(fieldMediaAssets.createdAt)).limit(limit);
  }
  async createCompSnapshot(input) {
    const result = await db.insert(compSnapshots).values(input).returning();
    return result[0];
  }
  async getCompSnapshotsByProperty(propertyId, limit = 20) {
    return db.select().from(compSnapshots).where(eq(compSnapshots.propertyId, propertyId)).orderBy(desc(compSnapshots.requestedAt)).limit(limit);
  }
  async replaceCompSnapshotRows(opportunityId, rows) {
    await db.delete(compSnapshotRows).where(eq(compSnapshotRows.opportunityId, opportunityId));
    if (!rows.length) return;
    await db.insert(compSnapshotRows).values(rows.map((r) => ({ ...r, opportunityId })));
  }
  async getCompSnapshotRowsByOpportunity(opportunityId, limit = 200) {
    return db.select().from(compSnapshotRows).where(eq(compSnapshotRows.opportunityId, opportunityId)).orderBy(desc(compSnapshotRows.createdAt)).limit(limit);
  }
  async replaceDealBuyerMatches(propertyId, matches) {
    await db.delete(dealBuyerMatches).where(eq(dealBuyerMatches.propertyId, propertyId));
    if (!matches.length) return;
    await db.insert(dealBuyerMatches).values(matches.map((m) => ({ ...m, propertyId })));
  }
  async getDealBuyerMatches(propertyId, limit = 25) {
    return db.select().from(dealBuyerMatches).where(eq(dealBuyerMatches.propertyId, propertyId)).orderBy(desc(dealBuyerMatches.score)).limit(limit);
  }
  // Document Versions
  async getDocumentVersions(documentId, limit, offset = 0) {
    let q = db.select().from(documentVersions).where(eq(documentVersions.documentId, documentId));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async createDocumentVersion(version) {
    const result = await db.insert(documentVersions).values(version).returning();
    return result[0];
  }
  // LOIs
  async getLois(limit, offset = 0) {
    let q = db.select().from(lois);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getLoiById(id) {
    const result = await db.select().from(lois).where(eq(lois.id, id)).limit(1);
    return result[0];
  }
  async createLoi(loi) {
    const result = await db.insert(lois).values(loi).returning();
    return result[0];
  }
  async updateLoi(id, loi) {
    const result = await db.update(lois).set(loi).where(eq(lois.id, id)).returning();
    return result[0];
  }
  async deleteLoi(id) {
    await db.delete(lois).where(eq(lois.id, id));
  }
  // Users
  async getUsers(limit, offset = 0) {
    let q = db.select().from(users);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getUserById(id) {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }
  async getUserByEmail(email) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) return void 0;
    const result = await db.select().from(users).where(sql2`lower(${users.email}) = ${normalizedEmail}`).limit(2);
    if (result.length > 1) {
      throw new Error("Multiple users found for email");
    }
    return result[0];
  }
  async createUser(user) {
    const result = await db.insert(users).values(user).returning();
    return result[0];
  }
  async updateUser(id, user) {
    const result = await db.update(users).set(user).where(eq(users.id, id)).returning();
    return result[0];
  }
  async deleteUser(id) {
    await db.delete(users).where(eq(users.id, id));
  }
  async getUserFeatureFlag(userId, flag) {
    const result = await db.select().from(userFeatureFlags).where(and(eq(userFeatureFlags.userId, userId), eq(userFeatureFlags.flag, flag))).limit(1);
    return result[0];
  }
  async upsertUserFeatureFlag(input) {
    const v = input;
    const existing = await this.getUserFeatureFlag(v.userId, v.flag);
    if (existing) {
      const result2 = await db.update(userFeatureFlags).set({ enabled: v.enabled, updatedAt: /* @__PURE__ */ new Date() }).where(eq(userFeatureFlags.id, existing.id)).returning();
      return result2[0];
    }
    const result = await db.insert(userFeatureFlags).values(input).returning();
    return result[0];
  }
  // Two Factor Auth
  async getTwoFactorAuthByUserId(userId) {
    const result = await db.select().from(twoFactorAuth).where(eq(twoFactorAuth.userId, userId)).limit(1);
    return result[0];
  }
  async createTwoFactorAuth(auth) {
    const result = await db.insert(twoFactorAuth).values(auth).returning();
    return result[0];
  }
  async updateTwoFactorAuth(userId, auth) {
    const result = await db.update(twoFactorAuth).set(auth).where(eq(twoFactorAuth.userId, userId)).returning();
    return result[0];
  }
  async deleteTwoFactorAuth(userId) {
    await db.delete(twoFactorAuth).where(eq(twoFactorAuth.userId, userId));
  }
  // Backup Codes
  async getBackupCodesByUserId(userId) {
    return db.select().from(backupCodes).where(eq(backupCodes.userId, userId));
  }
  async createBackupCode(code) {
    const result = await db.insert(backupCodes).values(code).returning();
    return result[0];
  }
  async useBackupCode(userId, code) {
    const result = await db.update(backupCodes).set({ isUsed: true, usedAt: /* @__PURE__ */ new Date() }).where(and(
      eq(backupCodes.userId, userId),
      eq(backupCodes.code, code),
      eq(backupCodes.isUsed, false)
    )).returning();
    return result.length > 0;
  }
  async deleteBackupCodes(userId) {
    await db.delete(backupCodes).where(eq(backupCodes.userId, userId));
  }
  // Teams
  async getTeams() {
    return db.select().from(teams);
  }
  async getTeamById(id) {
    const result = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
    return result[0];
  }
  async getTeamsByOwnerId(ownerId) {
    return db.select().from(teams).where(eq(teams.ownerId, ownerId));
  }
  async getTeamsForUser(userId) {
    const rows = await db.select({ team: teams }).from(teamMembers).innerJoin(teams, eq(teamMembers.teamId, teams.id)).where(eq(teamMembers.userId, userId));
    return rows.map((r) => r.team);
  }
  async getTeamByInviteCode(inviteCode) {
    const code = String(inviteCode || "").trim();
    if (!code) return void 0;
    const result = await db.select().from(teams).where(eq(teams.inviteCode, code)).limit(1);
    return result[0];
  }
  async createTeam(team) {
    const result = await db.insert(teams).values(team).returning();
    return result[0];
  }
  async updateTeam(id, team) {
    const result = await db.update(teams).set(team).where(eq(teams.id, id)).returning();
    return result[0];
  }
  async deleteTeam(id) {
    await db.delete(teams).where(eq(teams.id, id));
  }
  // Team Members
  async getTeamMembers(teamId) {
    return db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId));
  }
  async getTeamMembersWithUsers(teamId) {
    const rows = await db.select({
      membership: teamMembers,
      user: users
    }).from(teamMembers).innerJoin(users, eq(teamMembers.userId, users.id)).where(eq(teamMembers.teamId, teamId));
    return rows.map((r) => ({ ...r.membership, user: r.user }));
  }
  async getTeamMemberByTeamAndUser(teamId, userId) {
    const result = await db.select().from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId))).limit(1);
    return result[0];
  }
  async getTeamMemberById(id) {
    const result = await db.select().from(teamMembers).where(eq(teamMembers.id, id)).limit(1);
    return result[0];
  }
  async createTeamMember(member) {
    const result = await db.insert(teamMembers).values(member).returning();
    return result[0];
  }
  async updateTeamMember(id, member) {
    const result = await db.update(teamMembers).set(member).where(eq(teamMembers.id, id)).returning();
    return result[0];
  }
  async deleteTeamMember(id) {
    await db.delete(teamMembers).where(eq(teamMembers.id, id));
  }
  // Team Activity Logs
  async getTeamActivityLogs(teamId, limit = 50) {
    return db.select().from(teamActivityLogs).where(eq(teamActivityLogs.teamId, teamId)).limit(limit);
  }
  async createTeamActivityLog(log3) {
    const result = await db.insert(teamActivityLogs).values(log3).returning();
    return result[0];
  }
  // Notification Preferences
  async getNotificationPreferencesByUserId(userId) {
    const result = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);
    return result[0];
  }
  async createNotificationPreferences(prefs) {
    const result = await db.insert(notificationPreferences).values(prefs).returning();
    return result[0];
  }
  async updateNotificationPreferences(userId, prefs) {
    const result = await db.update(notificationPreferences).set(prefs).where(eq(notificationPreferences.userId, userId)).returning();
    return result[0];
  }
  // User Notifications (actual notification messages)
  async getUserNotifications(userId, limit, offset = 0) {
    let q = db.select().from(userNotifications).where(eq(userNotifications.userId, userId));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getUserNotificationById(id) {
    const result = await db.select().from(userNotifications).where(eq(userNotifications.id, id)).limit(1);
    return result[0];
  }
  async createUserNotification(notification) {
    const result = await db.insert(userNotifications).values(notification).returning();
    return result[0];
  }
  async markNotificationAsRead(id) {
    const result = await db.update(userNotifications).set({ read: true }).where(eq(userNotifications.id, id)).returning();
    return result[0];
  }
  async deleteUserNotification(id) {
    await db.delete(userNotifications).where(eq(userNotifications.id, id));
  }
  async deleteAllUserNotifications(userId) {
    await db.delete(userNotifications).where(eq(userNotifications.userId, userId));
  }
  async markAllNotificationsAsRead(userId) {
    await db.update(userNotifications).set({ read: true }).where(eq(userNotifications.userId, userId));
  }
  async getUnreadNotificationCount(userId) {
    const rows = await db.execute(sql2`
      SELECT COUNT(*)::int AS count FROM user_notifications
      WHERE user_id = ${userId} AND read = false
    `);
    return Number(rows.rows?.[0]?.count ?? 0);
  }
  async createUserNotificationDedup(notification) {
    const result = await db.insert(userNotifications).values(notification).onConflictDoNothing().returning();
    return result[0] ?? null;
  }
  // Internal Messages
  async createInternalMessage(message) {
    const result = await db.insert(internalMessages).values(message).returning();
    return result[0];
  }
  async getInternalMessages(userId, withUserId, limit = 100, offset = 0) {
    if (withUserId) {
      return db.select().from(internalMessages).where(
        or(
          and(eq(internalMessages.senderUserId, userId), eq(internalMessages.recipientUserId, withUserId)),
          and(eq(internalMessages.senderUserId, withUserId), eq(internalMessages.recipientUserId, userId))
        )
      ).orderBy(asc(internalMessages.id)).limit(limit).offset(offset);
    }
    return db.select().from(internalMessages).where(or(eq(internalMessages.recipientUserId, userId), eq(internalMessages.senderUserId, userId))).orderBy(desc(internalMessages.id)).limit(limit).offset(offset);
  }
  async getInternalMessageUnreadCount(userId) {
    const rows = await db.execute(sql2`
      SELECT COUNT(*)::int AS count FROM internal_messages
      WHERE recipient_user_id = ${userId} AND read_at IS NULL
    `);
    return Number(rows.rows?.[0]?.count ?? 0);
  }
  async getInternalMessageConversations(userId) {
    const rows = await db.execute(sql2`
      WITH pairs AS (
        SELECT
          CASE WHEN sender_user_id = ${userId} THEN recipient_user_id ELSE sender_user_id END AS counterpart_id,
          id, body, read_at, created_at,
          CASE WHEN recipient_user_id = ${userId} AND read_at IS NULL THEN 1 ELSE 0 END AS unread_flag
        FROM internal_messages
        WHERE sender_user_id = ${userId} OR recipient_user_id = ${userId}
      ),
      ranked AS (
        SELECT counterpart_id, id, body, read_at, created_at, unread_flag,
               ROW_NUMBER() OVER (PARTITION BY counterpart_id ORDER BY id DESC) AS rn
        FROM pairs
      ),
      summary AS (
        SELECT counterpart_id, MAX(id) AS last_id,
               COUNT(*) FILTER (WHERE unread_flag = 1)::int AS unread_count
        FROM pairs GROUP BY counterpart_id
      )
      SELECT r.counterpart_id, r.body AS last_message, r.created_at AS last_at, s.unread_count
      FROM ranked r
      JOIN summary s ON s.counterpart_id = r.counterpart_id
      WHERE r.rn = 1
      ORDER BY r.created_at DESC
    `);
    return rows.rows ?? [];
  }
  async markInternalMessagesRead(userId, withUserId) {
    if (withUserId) {
      await db.update(internalMessages).set({ readAt: /* @__PURE__ */ new Date() }).where(
        and(
          eq(internalMessages.recipientUserId, userId),
          eq(internalMessages.senderUserId, withUserId)
        )
      );
      return;
    }
    await db.update(internalMessages).set({ readAt: /* @__PURE__ */ new Date() }).where(eq(internalMessages.recipientUserId, userId));
  }
  // Calendar Events
  async createCalendarEvent(event) {
    const result = await db.insert(calendarEvents).values(event).returning();
    return result[0];
  }
  async getCalendarEventsForUser(userId, from, to) {
    const conditions = [or(sql2`${userId} = ANY(calendar_events.invitee_user_ids)`, eq(calendarEvents.createdBy, userId))];
    if (from) conditions.push(gte(calendarEvents.startsAt, from));
    if (to) conditions.push(lte(calendarEvents.startsAt, to));
    return db.select().from(calendarEvents).where(and(...conditions)).orderBy(asc(calendarEvents.startsAt));
  }
  async updateCalendarEvent(id, patch) {
    const result = await db.update(calendarEvents).set(patch).where(eq(calendarEvents.id, id)).returning();
    return result[0];
  }
  async deleteCalendarEvent(id) {
    await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
  }
  async getCalendarEventById(id) {
    const rows = await db.select().from(calendarEvents).where(eq(calendarEvents.id, id)).limit(1);
    return rows[0];
  }
  // User Goals
  async getUserGoals(userId) {
    return db.select().from(userGoals).where(eq(userGoals.userId, userId));
  }
  async getUserGoalById(id) {
    const result = await db.select().from(userGoals).where(eq(userGoals.id, id)).limit(1);
    return result[0];
  }
  async createUserGoal(goal) {
    const result = await db.insert(userGoals).values(goal).returning();
    return result[0];
  }
  async updateUserGoal(id, goal) {
    const result = await db.update(userGoals).set(goal).where(eq(userGoals.id, id)).returning();
    return result[0];
  }
  async deleteUserGoal(id) {
    await db.delete(userGoals).where(eq(userGoals.id, id));
  }
  // Offers
  async getOffers(limit, offset = 0) {
    let q = db.select().from(offers);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getOfferById(id) {
    const result = await db.select().from(offers).where(eq(offers.id, id)).limit(1);
    return result[0];
  }
  async getOffersByUserId(userId, limit, offset = 0) {
    let q = db.select().from(offers).where(eq(offers.userId, userId));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getOffersByPropertyId(propertyId, limit, offset = 0) {
    let q = db.select().from(offers).where(eq(offers.propertyId, propertyId));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async createOffer(offer) {
    const result = await db.insert(offers).values(offer).returning();
    return result[0];
  }
  async updateOffer(id, offer) {
    const result = await db.update(offers).set(offer).where(eq(offers.id, id)).returning();
    return result[0];
  }
  async deleteOffer(id) {
    await db.delete(offers).where(eq(offers.id, id));
  }
  // Timesheet Entries
  async getTimesheetEntries(userId, limit, offset = 0) {
    let q = db.select().from(timesheetEntries).where(eq(timesheetEntries.userId, userId));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getTimesheetEntriesFiltered(input) {
    const conditions = [];
    if (typeof input.userId === "number") conditions.push(eq(timesheetEntries.userId, input.userId));
    if (input.from) conditions.push(gte(timesheetEntries.date, input.from));
    if (input.to) conditions.push(lte(timesheetEntries.date, input.to));
    let q = db.select().from(timesheetEntries);
    if (conditions.length > 0) q = q.where(and(...conditions));
    q = q.orderBy(desc(timesheetEntries.date), desc(timesheetEntries.id));
    if (typeof input.limit === "number") q = q.limit(input.limit).offset(input.offset || 0);
    return q;
  }
  async getTimesheetEntryById(id) {
    const result = await db.select().from(timesheetEntries).where(eq(timesheetEntries.id, id)).limit(1);
    return result[0];
  }
  async createTimesheetEntry(entry) {
    const result = await db.insert(timesheetEntries).values(entry).returning();
    return result[0];
  }
  async updateTimesheetEntry(id, entry) {
    const result = await db.update(timesheetEntries).set(entry).where(eq(timesheetEntries.id, id)).returning();
    return result[0];
  }
  async deleteTimesheetEntry(id) {
    await db.delete(timesheetEntries).where(eq(timesheetEntries.id, id));
  }
  async getOpenTimeClockSession(userId) {
    const result = await db.select().from(timeClockSessions).where(and(eq(timeClockSessions.userId, userId), isNull(timeClockSessions.clockOutAt))).limit(1);
    return result[0];
  }
  async createTimeClockSession(input) {
    const result = await db.insert(timeClockSessions).values(input).returning();
    return result[0];
  }
  async updateOpenTimeClockSession(userId, partial) {
    const open = await this.getOpenTimeClockSession(userId);
    if (!open) return void 0;
    const result = await db.update(timeClockSessions).set({ ...partial, updatedAt: /* @__PURE__ */ new Date() }).where(eq(timeClockSessions.id, open.id)).returning();
    return result[0];
  }
  async closeOpenTimeClockSessionAndCreateEntry(userId, input) {
    const open = await this.getOpenTimeClockSession(userId);
    if (!open) return void 0;
    const msRaw = input.clockOutAt.getTime() - new Date(open.clockInAt).getTime();
    const hoursRaw = msRaw > 0 ? msRaw / 36e5 : 0;
    const flags = [];
    let status = "draft";
    let payableHours = null;
    let autoClosed = false;
    let autoClosedReason = null;
    if (hoursRaw > MAX_TIME_ENTRY_HOURS) {
      flags.push("duration_over_max");
      status = "disputed";
      payableHours = 0;
      autoClosed = true;
      autoClosedReason = "duration_over_max";
    } else if (msRaw > 0 && msRaw < MIN_TIME_ENTRY_MINUTES * 6e4) {
      flags.push("too_short");
      status = "disputed";
      payableHours = 0;
    }
    const closedRows = await db.update(timeClockSessions).set({ clockOutAt: input.clockOutAt, updatedAt: /* @__PURE__ */ new Date(), autoClosed, autoClosedReason }).where(eq(timeClockSessions.id, open.id)).returning();
    const session2 = closedRows[0];
    if (!session2?.clockOutAt) return void 0;
    const toLocalIso = (d, tzOffsetMinutes) => {
      const localMs = d.getTime() - tzOffsetMinutes * 6e4;
      return new Date(localMs).toISOString();
    };
    const startIso = toLocalIso(new Date(session2.clockInAt), session2.tzOffsetMinutes);
    const endIso = toLocalIso(new Date(session2.clockOutAt), session2.tzOffsetMinutes);
    const date2 = startIso.slice(0, 10);
    const startTime = startIso.slice(11, 16);
    const endTime = endIso.slice(11, 16);
    const ms = new Date(session2.clockOutAt).getTime() - new Date(session2.clockInAt).getTime();
    const hours = Math.max(0, ms / 36e5);
    const entry = await this.createTimesheetEntry({
      userId: session2.userId,
      date: date2,
      employee: session2.employee,
      task: session2.task,
      startTime,
      endTime,
      hours: hours.toFixed(2),
      status,
      payableHours: payableHours === null ? null : Number(payableHours.toFixed(2)),
      anomalyFlags: flags.length ? flags : null
    });
    return { session: session2, entry };
  }
  async getWorkCategories(input) {
    const includeInactive = !!input?.includeInactive;
    let q = db.select().from(workCategories);
    if (!includeInactive) q = q.where(eq(workCategories.isActive, true));
    q = q.orderBy(asc(workCategories.name));
    return q;
  }
  async createWorkCategory(input) {
    const now = /* @__PURE__ */ new Date();
    const result = await db.insert(workCategories).values({ ...input, updatedAt: now }).returning();
    return result[0];
  }
  async updateWorkCategory(id, patch) {
    const result = await db.update(workCategories).set({ ...patch, updatedAt: /* @__PURE__ */ new Date() }).where(eq(workCategories.id, id)).returning();
    return result[0];
  }
  async listWorkerProfiles() {
    return db.select().from(workerProfiles).orderBy(asc(workerProfiles.userId));
  }
  async upsertWorkerProfile(userId, patch) {
    const now = /* @__PURE__ */ new Date();
    const v = patch;
    const result = await db.insert(workerProfiles).values({ userId, ...patch, updatedAt: now }).onConflictDoUpdate({
      target: [workerProfiles.userId],
      set: { ...v, updatedAt: now }
    }).returning();
    return result[0];
  }
  async getCategoryRateOverridesByUser(userId) {
    return db.select().from(categoryRateOverrides).where(eq(categoryRateOverrides.userId, userId)).orderBy(asc(categoryRateOverrides.categoryId));
  }
  async upsertCategoryRateOverride(userId, categoryId, patch) {
    const now = /* @__PURE__ */ new Date();
    const v = patch;
    const result = await db.insert(categoryRateOverrides).values({ userId, categoryId, ...patch, updatedAt: now }).onConflictDoUpdate({
      target: [categoryRateOverrides.userId, categoryRateOverrides.categoryId],
      set: { ...v, updatedAt: now }
    }).returning();
    return result[0];
  }
  async deleteCategoryRateOverride(userId, categoryId) {
    await db.delete(categoryRateOverrides).where(and(eq(categoryRateOverrides.userId, userId), eq(categoryRateOverrides.categoryId, categoryId)));
  }
  async upsertPayPeriod(input) {
    const now = /* @__PURE__ */ new Date();
    const v = input;
    const result = await db.insert(payPeriods).values({ ...input, updatedAt: now }).onConflictDoUpdate({
      target: [payPeriods.startDate, payPeriods.endDate],
      set: { status: v.status, createdByUserId: v.createdByUserId, updatedAt: now }
    }).returning();
    return result[0];
  }
  async createApprovalEvent(input) {
    const result = await db.insert(approvalEvents).values(input).returning();
    return result[0];
  }
  async upsertCommissionEvent(input) {
    const now = /* @__PURE__ */ new Date();
    const v = input;
    const result = await db.insert(commissionEvents).values({ ...input, updatedAt: now }).onConflictDoUpdate({
      target: [commissionEvents.sourceType, commissionEvents.sourceId, commissionEvents.milestone],
      set: { eventDate: v.eventDate, grossAmount: v.grossAmount, currency: v.currency, metadata: v.metadata, updatedAt: now }
    }).returning();
    return result[0];
  }
  async listCommissionEvents(input) {
    const whereParts = [];
    if (input.sourceType) whereParts.push(eq(commissionEvents.sourceType, input.sourceType));
    if (typeof input.sourceId === "number") whereParts.push(eq(commissionEvents.sourceId, input.sourceId));
    if (input.from) whereParts.push(gte(commissionEvents.eventDate, input.from));
    if (input.to) whereParts.push(lte(commissionEvents.eventDate, input.to));
    let q = db.select().from(commissionEvents);
    if (whereParts.length) q = q.where(and(...whereParts));
    q = q.orderBy(desc(commissionEvents.eventDate), desc(commissionEvents.id));
    if (typeof input.limit === "number") q = q.limit(input.limit).offset(input.offset || 0);
    return q;
  }
  async listDealParticipants(input) {
    return db.select().from(dealParticipants).where(and(eq(dealParticipants.sourceType, input.sourceType), eq(dealParticipants.sourceId, input.sourceId))).orderBy(asc(dealParticipants.id));
  }
  async upsertDealParticipant(input) {
    const now = /* @__PURE__ */ new Date();
    const v = input;
    const result = await db.insert(dealParticipants).values({ ...input, updatedAt: now }).onConflictDoUpdate({
      target: [dealParticipants.sourceType, dealParticipants.sourceId, dealParticipants.userId, dealParticipants.role],
      set: { splitPct: v.splitPct, updatedAt: now }
    }).returning();
    return result[0];
  }
  async deleteDealParticipant(id) {
    await db.delete(dealParticipants).where(eq(dealParticipants.id, id));
  }
  async listCommissionLedgerEntries(input) {
    const whereParts = [];
    if (typeof input.userId === "number") whereParts.push(eq(commissionLedgerEntries.userId, input.userId));
    if (typeof input.eventId === "number") whereParts.push(eq(commissionLedgerEntries.eventId, input.eventId));
    if (input.status) whereParts.push(eq(commissionLedgerEntries.status, input.status));
    let q = db.select().from(commissionLedgerEntries);
    if (whereParts.length) q = q.where(and(...whereParts));
    q = q.orderBy(desc(commissionLedgerEntries.updatedAt), desc(commissionLedgerEntries.id));
    if (typeof input.limit === "number") q = q.limit(input.limit).offset(input.offset || 0);
    return q;
  }
  async upsertCommissionLedgerEntry(input) {
    const now = /* @__PURE__ */ new Date();
    const v = input;
    const result = await db.insert(commissionLedgerEntries).values({ ...input, updatedAt: now }).onConflictDoUpdate({
      target: [commissionLedgerEntries.eventId, commissionLedgerEntries.userId],
      set: { amount: v.amount, status: v.status, ruleSnapshot: v.ruleSnapshot, updatedAt: now }
    }).returning();
    return result[0];
  }
  async updateCommissionLedgerEntry(id, patch) {
    const result = await db.update(commissionLedgerEntries).set({ ...patch, updatedAt: /* @__PURE__ */ new Date() }).where(eq(commissionLedgerEntries.id, id)).returning();
    return result[0];
  }
  async getPayrollSummary(input) {
    const conditions = [gte(timesheetEntries.date, input.from), lte(timesheetEntries.date, input.to)];
    if (typeof input.userId === "number") conditions.push(eq(timesheetEntries.userId, input.userId));
    const entries = await db.select().from(timesheetEntries).where(and(...conditions));
    const profiles = await db.select().from(workerProfiles);
    const overrides = await db.select().from(categoryRateOverrides);
    const categories = await db.select().from(workCategories);
    const profileByUserId = /* @__PURE__ */ new Map();
    for (const p of profiles) profileByUserId.set(p.userId, p);
    const overrideByUserCategory = /* @__PURE__ */ new Map();
    for (const o of overrides) overrideByUserCategory.set(`${o.userId}:${o.categoryId}`, o);
    const categoryById = /* @__PURE__ */ new Map();
    for (const c of categories) categoryById.set(c.id, c);
    const agg = /* @__PURE__ */ new Map();
    for (const e of entries) {
      const uid = Number(e.userId);
      if (!agg.has(uid)) {
        agg.set(uid, {
          userId: uid,
          trackedHours: 0,
          payableHours: 0,
          approvedPayableHours: 0,
          hourlyAmount: 0,
          hourlyApprovedAmount: 0,
          disputedHours: 0,
          pendingHours: 0
        });
      }
      const row = agg.get(uid);
      const tracked = Number.parseFloat(String(e.hours || 0));
      const payable = e.payableHours === null || typeof e.payableHours === "undefined" ? tracked : Number.parseFloat(String(e.payableHours || 0));
      const status = String(e.status || "draft");
      row.trackedHours += tracked;
      row.payableHours += payable;
      if (status === "approved" || status === "paid") row.approvedPayableHours += payable;
      if (status === "disputed") row.disputedHours += payable;
      if (status === "submitted" || status === "draft") row.pendingHours += payable;
      const profile = profileByUserId.get(uid);
      const payType = String(profile?.payType || "hourly");
      const baseRate = profile?.defaultHourlyRate !== null && typeof profile?.defaultHourlyRate !== "undefined" ? Number.parseFloat(String(profile.defaultHourlyRate)) : null;
      const categoryId = e.categoryId ? Number(e.categoryId) : null;
      const override = categoryId ? overrideByUserCategory.get(`${uid}:${categoryId}`) : null;
      const category = categoryId ? categoryById.get(categoryId) : null;
      const categoryRate = override?.hourlyRate !== null && typeof override?.hourlyRate !== "undefined" ? Number.parseFloat(String(override.hourlyRate)) : category?.defaultHourlyRate !== null && typeof category?.defaultHourlyRate !== "undefined" ? Number.parseFloat(String(category.defaultHourlyRate)) : null;
      const rate = categoryRate !== null && typeof categoryRate !== "undefined" ? categoryRate : baseRate;
      const payoutRate = payType === "salary_shadow" || payType === "commission" ? 0 : rate || 0;
      const amt = payable * payoutRate;
      row.hourlyAmount += amt;
      if (status === "approved" || status === "paid") row.hourlyApprovedAmount += amt;
    }
    return {
      from: input.from,
      to: input.to,
      rows: Array.from(agg.values()).sort((a, b) => a.userId - b.userId)
    };
  }
  // Global Activity Logs
  async getGlobalActivityLogs(limit = 50, offset = 0) {
    const rows = await db.select().from(globalActivityLogs).orderBy(desc(globalActivityLogs.createdAt)).offset(offset).limit(limit);
    return rows.map((r) => ({ ...r, action: normalizeGlobalActivityAction(r.action) }));
  }
  async createGlobalActivity(log3) {
    const normalized = { ...log3, action: normalizeGlobalActivityAction(log3.action) };
    const result = await db.insert(globalActivityLogs).values(normalized).returning();
    return result[0];
  }
  async getPlaygroundPropertySessionById(id) {
    const result = await db.select().from(playgroundPropertySessions).where(eq(playgroundPropertySessions.id, id)).limit(1);
    return result[0];
  }
  async getPlaygroundPropertySessionByAddressKey(userId, addressKey) {
    const result = await db.select().from(playgroundPropertySessions).where(and(eq(playgroundPropertySessions.createdBy, userId), eq(playgroundPropertySessions.addressKey, addressKey))).limit(1);
    return result[0];
  }
  async createPlaygroundPropertySession(input) {
    const result = await db.insert(playgroundPropertySessions).values(input).returning();
    return result[0];
  }
  async updatePlaygroundPropertySession(id, patch) {
    const result = await db.update(playgroundPropertySessions).set({ ...patch, updatedAt: /* @__PURE__ */ new Date() }).where(eq(playgroundPropertySessions.id, id)).returning();
    return result[0];
  }
  async deletePlaygroundPropertySession(id) {
    await db.delete(playgroundPropertySessions).where(eq(playgroundPropertySessions.id, id));
  }
  async listRecentPlaygroundPropertySessions(userId, limit = 20) {
    return db.select().from(playgroundPropertySessions).where(eq(playgroundPropertySessions.createdBy, userId)).orderBy(desc(playgroundPropertySessions.lastOpenedAt)).limit(limit);
  }
  async getPipelineConfig(userId, entityType) {
    const result = await db.select().from(pipelineConfigs).where(and(eq(pipelineConfigs.userId, userId), eq(pipelineConfigs.entityType, entityType))).limit(1);
    return result[0];
  }
  async upsertPipelineConfig(userId, entityType, columns) {
    const existing = await this.getPipelineConfig(userId, entityType);
    if (existing) {
      const result2 = await db.update(pipelineConfigs).set({ columns, updatedAt: /* @__PURE__ */ new Date() }).where(eq(pipelineConfigs.id, existing.id)).returning();
      return result2[0];
    }
    const result = await db.insert(pipelineConfigs).values({ userId, entityType, columns }).returning();
    return result[0];
  }
  async getUnderwritingTemplates(userId) {
    return db.select().from(underwritingTemplates).where(eq(underwritingTemplates.userId, userId)).orderBy(desc(underwritingTemplates.updatedAt));
  }
  async getUnderwritingTemplateById(id) {
    const result = await db.select().from(underwritingTemplates).where(eq(underwritingTemplates.id, id)).limit(1);
    return result[0];
  }
  async createUnderwritingTemplate(template) {
    const result = await db.insert(underwritingTemplates).values(template).returning();
    return result[0];
  }
  async updateUnderwritingTemplate(id, patch) {
    const result = await db.update(underwritingTemplates).set({ ...patch, updatedAt: /* @__PURE__ */ new Date() }).where(eq(underwritingTemplates.id, id)).returning();
    return result[0];
  }
  async deleteUnderwritingTemplate(id) {
    await db.delete(underwritingTemplates).where(eq(underwritingTemplates.id, id));
  }
  // Buyers
  async getBuyers(limit, offset = 0) {
    let q = db.select().from(buyers);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getBuyerById(id) {
    const result = await db.select().from(buyers).where(eq(buyers.id, id)).limit(1);
    return result[0];
  }
  async createBuyer(buyer) {
    const result = await db.insert(buyers).values(buyer).returning();
    return result[0];
  }
  async updateBuyer(id, buyer) {
    const result = await db.update(buyers).set(buyer).where(eq(buyers.id, id)).returning();
    return result[0];
  }
  async deleteBuyer(id) {
    await db.delete(buyers).where(eq(buyers.id, id));
  }
  // Buyer Communications
  async getBuyerCommunications(buyerId, limit, offset = 0) {
    let q = db.select().from(buyerCommunications).where(eq(buyerCommunications.buyerId, buyerId)).orderBy(desc(buyerCommunications.createdAt));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async createBuyerCommunication(comm) {
    const result = await db.insert(buyerCommunications).values(comm).returning();
    return result[0];
  }
  async deleteBuyerCommunication(id) {
    await db.delete(buyerCommunications).where(eq(buyerCommunications.id, id));
  }
  // Deal Assignments
  async getDealAssignments(limit, offset = 0) {
    let q = db.select().from(dealAssignments);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getDealAssignmentById(id) {
    const result = await db.select().from(dealAssignments).where(eq(dealAssignments.id, id)).limit(1);
    return result[0];
  }
  async getDealAssignmentsByPropertyId(propertyId, limit, offset = 0) {
    let q = db.select().from(dealAssignments).where(eq(dealAssignments.propertyId, propertyId));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getDealAssignmentsByBuyerId(buyerId, limit, offset = 0) {
    let q = db.select().from(dealAssignments).where(eq(dealAssignments.buyerId, buyerId));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async createDealAssignment(assignment) {
    const result = await db.insert(dealAssignments).values(assignment).returning();
    return result[0];
  }
  async updateDealAssignment(id, assignment) {
    const result = await db.update(dealAssignments).set(assignment).where(eq(dealAssignments.id, id)).returning();
    return result[0];
  }
  async deleteDealAssignment(id) {
    await db.delete(dealAssignments).where(eq(dealAssignments.id, id));
  }
  // Call Logs
  async getCallLogs(limit, offset = 0, status, contactId) {
    let q = db.select().from(callLogs);
    if (status) q = q.where(eq(callLogs.status, status));
    if (contactId) q = q.where(eq(callLogs.contactId, contactId));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async createCallLog(log3) {
    const result = await db.insert(callLogs).values(log3).returning();
    return result[0];
  }
  async updateCallLog(id, patch) {
    const result = await db.update(callLogs).set(patch).where(eq(callLogs.id, id)).returning();
    return result[0];
  }
  async getNumberReputationByE164s(userId, e164s) {
    const normalized = Array.from(new Set((e164s || []).map((v) => String(v || "").trim()).filter(Boolean)));
    if (!normalized.length) return [];
    return db.select().from(numberReputation).where(and(eq(numberReputation.userId, userId), inArray(numberReputation.e164, normalized)));
  }
  async upsertNumberReputation(input) {
    const now = /* @__PURE__ */ new Date();
    const v = input;
    const result = await db.insert(numberReputation).values({ ...input, updatedAt: now }).onConflictDoUpdate({
      target: [numberReputation.userId, numberReputation.e164],
      set: { label: v.label, reason: v.reason, updatedAt: now }
    }).returning();
    return result[0];
  }
  async deleteNumberReputation(userId, e164) {
    await db.delete(numberReputation).where(and(eq(numberReputation.userId, userId), eq(numberReputation.e164, e164)));
  }
  async listTasks(auth, input) {
    const limit = typeof input.limit === "number" ? input.limit : 50;
    const offset = typeof input.offset === "number" ? input.offset : 0;
    const whereParts = [];
    if (!auth.isManager) {
      whereParts.push(
        or(eq(tasks.isPrivate, false), eq(tasks.createdBy, auth.userId), eq(tasks.assignedToUserId, auth.userId))
      );
    }
    if (typeof input.assignedToUserId === "number") whereParts.push(eq(tasks.assignedToUserId, input.assignedToUserId));
    if (typeof input.createdByUserId === "number") whereParts.push(eq(tasks.createdBy, input.createdByUserId));
    if (input.status) whereParts.push(eq(tasks.status, input.status));
    if (input.type) whereParts.push(eq(tasks.type, input.type));
    if (input.priority) whereParts.push(eq(tasks.priority, input.priority));
    if (input.relatedEntityType) whereParts.push(eq(tasks.relatedEntityType, input.relatedEntityType));
    if (typeof input.relatedEntityId === "number") whereParts.push(eq(tasks.relatedEntityId, input.relatedEntityId));
    if (!input.status && !input.includeCompleted) {
      whereParts.push(ne(tasks.status, "completed"));
    }
    if (input.dueFrom) whereParts.push(and(isNotNull(tasks.dueAt), gte(tasks.dueAt, input.dueFrom)));
    if (input.dueTo) whereParts.push(and(isNotNull(tasks.dueAt), lte(tasks.dueAt, input.dueTo)));
    const whereClause = whereParts.length ? and(...whereParts) : void 0;
    let q = db.select().from(tasks);
    if (whereClause) q = q.where(whereClause);
    q = q.orderBy(sql2`due_at is null`, asc(tasks.dueAt), desc(tasks.createdAt)).limit(limit).offset(offset);
    const items = await q;
    let cq = db.select({ count: sql2`count(*)::int` }).from(tasks);
    if (whereClause) cq = cq.where(whereClause);
    const countRows = await cq;
    const total = Number(countRows?.[0]?.count || 0);
    return { items, total };
  }
  async getTaskById(id) {
    const result = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    return result[0];
  }
  async createTask(input) {
    const result = await db.insert(tasks).values(input).returning();
    return result[0];
  }
  async updateTask(id, patch) {
    const now = /* @__PURE__ */ new Date();
    const updates = { ...patch, updatedAt: now };
    if (Object.prototype.hasOwnProperty.call(patch, "dueAt")) {
      updates.reminderSentAt = null;
      updates.overdueAlertSentAt = null;
    }
    const result = await db.update(tasks).set(updates).where(eq(tasks.id, id)).returning();
    return result[0];
  }
  async deleteTask(id) {
    await db.delete(tasks).where(eq(tasks.id, id));
  }
  async completeTask(id, input) {
    const now = /* @__PURE__ */ new Date();
    const status = String(input.status || "completed");
    const result = await db.update(tasks).set({
      status,
      completedAt: input.completedAt,
      updatedAt: now,
      reminderSentAt: null,
      overdueAlertSentAt: null
    }).where(eq(tasks.id, id)).returning();
    return result[0];
  }
  async listTelephonyMedia(userId, kind, limit = 50) {
    let q = db.select().from(callMedia).where(and(eq(callMedia.kind, kind), or(eq(callMedia.userId, userId), eq(callMedia.userId, 0)))).orderBy(desc(callMedia.createdAt));
    q = q.limit(limit);
    return q;
  }
  async createCallMedia(input) {
    const result = await db.insert(callMedia).values(input).returning();
    return result[0];
  }
  async updateCallMedia(id, patch) {
    const result = await db.update(callMedia).set({ ...patch, updatedAt: /* @__PURE__ */ new Date() }).where(eq(callMedia.id, id)).returning();
    return result[0];
  }
  async listXpExperiences(input) {
    const activeOnly = !!input?.activeOnly;
    let q = db.select().from(xpExperiences);
    if (activeOnly) q = q.where(eq(xpExperiences.active, true));
    q = q.orderBy(asc(xpExperiences.title));
    return q;
  }
  async getXpExperienceBySlug(slug) {
    const s = String(slug || "").trim();
    if (!s) return void 0;
    const result = await db.select().from(xpExperiences).where(eq(xpExperiences.slug, s)).limit(1);
    return result[0];
  }
  async getXpExperienceById(id) {
    const result = await db.select().from(xpExperiences).where(eq(xpExperiences.id, id)).limit(1);
    return result[0];
  }
  async createXpExperience(input) {
    const now = /* @__PURE__ */ new Date();
    const result = await db.insert(xpExperiences).values({ ...input, createdAt: now, updatedAt: now }).returning();
    return result[0];
  }
  async updateXpExperience(id, patch) {
    const result = await db.update(xpExperiences).set({ ...patch, updatedAt: /* @__PURE__ */ new Date() }).where(eq(xpExperiences.id, id)).returning();
    return result[0];
  }
  async deactivateXpExperience(id) {
    const result = await db.update(xpExperiences).set({ active: false, updatedAt: /* @__PURE__ */ new Date() }).where(eq(xpExperiences.id, id)).returning();
    return result[0];
  }
  async listXpTimeSlots(experienceId, input) {
    const whereParts = [eq(xpTimeSlots.experienceId, experienceId)];
    const activeOnly = input?.activeOnly !== false;
    if (activeOnly) whereParts.push(eq(xpTimeSlots.active, true));
    if (input?.from) whereParts.push(gte(xpTimeSlots.startAt, input.from));
    if (input?.to) whereParts.push(lte(xpTimeSlots.startAt, input.to));
    let q = db.select().from(xpTimeSlots).where(and(...whereParts)).orderBy(asc(xpTimeSlots.startAt));
    return q;
  }
  async getXpTimeSlotById(id) {
    const result = await db.select().from(xpTimeSlots).where(eq(xpTimeSlots.id, id)).limit(1);
    return result[0];
  }
  async createXpTimeSlot(input) {
    const now = /* @__PURE__ */ new Date();
    const result = await db.insert(xpTimeSlots).values({ ...input, createdAt: now, updatedAt: now }).returning();
    return result[0];
  }
  async deleteXpTimeSlot(id) {
    await db.delete(xpTimeSlots).where(eq(xpTimeSlots.id, id));
  }
  async listXpBlackouts(experienceId, input) {
    const whereParts = [eq(xpBlackouts.experienceId, experienceId)];
    if (input?.from && input?.to) {
      whereParts.push(sql2`${xpBlackouts.startAt} < ${input.to} AND ${xpBlackouts.endAt} > ${input.from}`);
    } else if (input?.from) {
      whereParts.push(sql2`${xpBlackouts.endAt} > ${input.from}`);
    } else if (input?.to) {
      whereParts.push(sql2`${xpBlackouts.startAt} < ${input.to}`);
    }
    const q = db.select().from(xpBlackouts).where(and(...whereParts)).orderBy(asc(xpBlackouts.startAt));
    return q;
  }
  async createXpBlackout(input) {
    const now = /* @__PURE__ */ new Date();
    const result = await db.insert(xpBlackouts).values({ ...input, createdAt: now, updatedAt: now }).returning();
    return result[0];
  }
  async deleteXpBlackout(id) {
    await db.delete(xpBlackouts).where(eq(xpBlackouts.id, id));
  }
  async listXpLocations(input) {
    const whereParts = [];
    if (input?.activeOnly) whereParts.push(eq(xpLocations.active, true));
    const whereClause = whereParts.length ? and(...whereParts) : void 0;
    let q = db.select().from(xpLocations);
    if (whereClause) q = q.where(whereClause);
    q = q.orderBy(asc(xpLocations.name));
    return q;
  }
  async createXpLocation(input) {
    const now = /* @__PURE__ */ new Date();
    const result = await db.insert(xpLocations).values({ ...input, createdAt: now, updatedAt: now }).returning();
    return result[0];
  }
  async updateXpLocation(id, patch) {
    const result = await db.update(xpLocations).set({ ...patch, updatedAt: /* @__PURE__ */ new Date() }).where(eq(xpLocations.id, id)).returning();
    return result[0];
  }
  async deactivateXpLocation(id) {
    const result = await db.update(xpLocations).set({ active: false, updatedAt: /* @__PURE__ */ new Date() }).where(eq(xpLocations.id, id)).returning();
    return result[0];
  }
  async listXpVehicles(input) {
    const whereParts = [];
    if (input?.activeOnly) whereParts.push(eq(xpVehicles.active, true));
    if (typeof input?.locationId === "number") whereParts.push(eq(xpVehicles.locationId, input.locationId));
    const whereClause = whereParts.length ? and(...whereParts) : void 0;
    let q = db.select().from(xpVehicles);
    if (whereClause) q = q.where(whereClause);
    q = q.orderBy(asc(xpVehicles.name));
    return q;
  }
  async createXpVehicle(input) {
    const now = /* @__PURE__ */ new Date();
    const result = await db.insert(xpVehicles).values({ ...input, createdAt: now, updatedAt: now }).returning();
    return result[0];
  }
  async updateXpVehicle(id, patch) {
    const result = await db.update(xpVehicles).set({ ...patch, updatedAt: /* @__PURE__ */ new Date() }).where(eq(xpVehicles.id, id)).returning();
    return result[0];
  }
  async deactivateXpVehicle(id) {
    const result = await db.update(xpVehicles).set({ active: false, updatedAt: /* @__PURE__ */ new Date() }).where(eq(xpVehicles.id, id)).returning();
    return result[0];
  }
  async listXpConciergeUsers() {
    const q = db.select().from(users).where(and(eq(users.isActive, true), eq(users.role, "concierge"))).orderBy(asc(users.firstName));
    return q;
  }
  async upsertXpBookingAssignment(input) {
    const bookingId = Number(input.bookingId);
    if (!Number.isFinite(bookingId)) throw new Error("Invalid bookingId");
    const existing = await db.select().from(xpBookingAssignments).where(eq(xpBookingAssignments.bookingId, bookingId)).limit(1);
    const now = /* @__PURE__ */ new Date();
    const values = {
      bookingId,
      locationId: input.locationId ?? null,
      vehicleId: input.vehicleId ?? null,
      conciergeUserId: input.conciergeUserId ?? null,
      assignedAt: input.conciergeUserId ? now : null,
      updatedAt: now
    };
    if (existing[0]) {
      const result2 = await db.update(xpBookingAssignments).set(values).where(eq(xpBookingAssignments.bookingId, bookingId)).returning();
      return result2[0];
    }
    const result = await db.insert(xpBookingAssignments).values(values).returning();
    return result[0];
  }
  async listXpBookingNotes(bookingId) {
    const id = Number(bookingId);
    if (!Number.isFinite(id)) return [];
    const rows = await db.select({
      id: xpBookingNotes.id,
      bookingId: xpBookingNotes.bookingId,
      authorUserId: xpBookingNotes.authorUserId,
      body: xpBookingNotes.body,
      createdAt: xpBookingNotes.createdAt,
      authorId: users.id,
      authorEmail: users.email,
      authorFirstName: users.firstName,
      authorLastName: users.lastName
    }).from(xpBookingNotes).leftJoin(users, eq(users.id, xpBookingNotes.authorUserId)).where(eq(xpBookingNotes.bookingId, id)).orderBy(desc(xpBookingNotes.createdAt));
    return rows.map((r) => ({
      id: r.id,
      bookingId: r.bookingId,
      authorUserId: r.authorUserId,
      body: r.body,
      createdAt: r.createdAt,
      author: r.authorId ? { id: r.authorId, email: r.authorEmail, firstName: r.authorFirstName, lastName: r.authorLastName } : null
    }));
  }
  async createXpBookingNote(input) {
    const result = await db.insert(xpBookingNotes).values(input).returning();
    return result[0];
  }
  async listXpBookings(input) {
    const limit = typeof input?.limit === "number" ? input.limit : 50;
    const offset = typeof input?.offset === "number" ? input.offset : 0;
    const whereParts = [];
    if (typeof input?.experienceId === "number") whereParts.push(eq(xpBookings.experienceId, input.experienceId));
    if (input?.status) whereParts.push(eq(xpBookings.status, input.status));
    if (input?.kind) whereParts.push(eq(xpBookings.kind, input.kind));
    if (input?.from && input?.to) whereParts.push(sql2`${xpBookings.startAt} < ${input.to} AND ${xpBookings.endAt} > ${input.from}`);
    if (typeof input?.conciergeUserId === "number") whereParts.push(eq(xpBookingAssignments.conciergeUserId, input.conciergeUserId));
    if (typeof input?.locationId === "number") whereParts.push(eq(xpBookingAssignments.locationId, input.locationId));
    if (typeof input?.vehicleId === "number") whereParts.push(eq(xpBookingAssignments.vehicleId, input.vehicleId));
    const whereClause = whereParts.length ? and(...whereParts) : void 0;
    const rows = await db.select({
      id: xpBookings.id,
      experienceId: xpBookings.experienceId,
      kind: xpBookings.kind,
      customerName: xpBookings.customerName,
      customerEmail: xpBookings.customerEmail,
      customerPhone: xpBookings.customerPhone,
      startAt: xpBookings.startAt,
      endAt: xpBookings.endAt,
      status: xpBookings.status,
      currency: xpBookings.currency,
      depositAmount: xpBookings.depositAmount,
      stripeCheckoutSessionId: xpBookings.stripeCheckoutSessionId,
      stripePaymentIntentId: xpBookings.stripePaymentIntentId,
      stripeCustomerId: xpBookings.stripeCustomerId,
      createdAt: xpBookings.createdAt,
      updatedAt: xpBookings.updatedAt,
      assignmentLocationId: xpBookingAssignments.locationId,
      assignmentVehicleId: xpBookingAssignments.vehicleId,
      assignmentConciergeUserId: xpBookingAssignments.conciergeUserId,
      assignmentAssignedAt: xpBookingAssignments.assignedAt,
      locationName: xpLocations.name,
      vehicleName: xpVehicles.name,
      conciergeId: users.id,
      conciergeEmail: users.email,
      conciergeFirstName: users.firstName,
      conciergeLastName: users.lastName
    }).from(xpBookings).leftJoin(xpBookingAssignments, eq(xpBookingAssignments.bookingId, xpBookings.id)).leftJoin(xpLocations, eq(xpLocations.id, xpBookingAssignments.locationId)).leftJoin(xpVehicles, eq(xpVehicles.id, xpBookingAssignments.vehicleId)).leftJoin(users, eq(users.id, xpBookingAssignments.conciergeUserId)).where(whereClause).orderBy(desc(xpBookings.createdAt)).limit(limit).offset(offset);
    const totalRes = await db.select({ c: sql2`count(*)` }).from(xpBookings).leftJoin(xpBookingAssignments, eq(xpBookingAssignments.bookingId, xpBookings.id)).where(whereClause);
    const total = Number(totalRes?.[0]?.c || 0);
    const items = rows.map((r) => ({
      id: r.id,
      experienceId: r.experienceId,
      kind: r.kind,
      customerName: r.customerName,
      customerEmail: r.customerEmail,
      customerPhone: r.customerPhone,
      startAt: r.startAt,
      endAt: r.endAt,
      status: r.status,
      currency: r.currency,
      depositAmount: r.depositAmount,
      stripeCheckoutSessionId: r.stripeCheckoutSessionId,
      stripePaymentIntentId: r.stripePaymentIntentId,
      stripeCustomerId: r.stripeCustomerId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      assignment: r.assignmentLocationId || r.assignmentVehicleId || r.assignmentConciergeUserId ? {
        locationId: r.assignmentLocationId ?? null,
        locationName: r.locationName ?? null,
        vehicleId: r.assignmentVehicleId ?? null,
        vehicleName: r.vehicleName ?? null,
        conciergeUserId: r.assignmentConciergeUserId ?? null,
        conciergeName: r.conciergeId ? [r.conciergeFirstName, r.conciergeLastName].filter(Boolean).join(" ") || null : null,
        conciergeEmail: r.conciergeEmail ?? null,
        assignedAt: r.assignmentAssignedAt ?? null
      } : null
    }));
    return { items, total };
  }
  async getXpBookingById(id) {
    const rows = await db.select({
      id: xpBookings.id,
      experienceId: xpBookings.experienceId,
      kind: xpBookings.kind,
      customerName: xpBookings.customerName,
      customerEmail: xpBookings.customerEmail,
      customerPhone: xpBookings.customerPhone,
      startAt: xpBookings.startAt,
      endAt: xpBookings.endAt,
      status: xpBookings.status,
      currency: xpBookings.currency,
      depositAmount: xpBookings.depositAmount,
      stripeCheckoutSessionId: xpBookings.stripeCheckoutSessionId,
      stripePaymentIntentId: xpBookings.stripePaymentIntentId,
      stripeCustomerId: xpBookings.stripeCustomerId,
      createdAt: xpBookings.createdAt,
      updatedAt: xpBookings.updatedAt,
      assignmentLocationId: xpBookingAssignments.locationId,
      assignmentVehicleId: xpBookingAssignments.vehicleId,
      assignmentConciergeUserId: xpBookingAssignments.conciergeUserId,
      assignmentAssignedAt: xpBookingAssignments.assignedAt,
      locationId: xpLocations.id,
      locationName: xpLocations.name,
      vehicleId: xpVehicles.id,
      vehicleName: xpVehicles.name,
      conciergeId: users.id,
      conciergeEmail: users.email,
      conciergeFirstName: users.firstName,
      conciergeLastName: users.lastName
    }).from(xpBookings).leftJoin(xpBookingAssignments, eq(xpBookingAssignments.bookingId, xpBookings.id)).leftJoin(xpLocations, eq(xpLocations.id, xpBookingAssignments.locationId)).leftJoin(xpVehicles, eq(xpVehicles.id, xpBookingAssignments.vehicleId)).leftJoin(users, eq(users.id, xpBookingAssignments.conciergeUserId)).where(eq(xpBookings.id, id)).limit(1);
    const r = rows[0];
    if (!r) return void 0;
    const notes = await this.listXpBookingNotes(id);
    return {
      id: r.id,
      experienceId: r.experienceId,
      kind: r.kind,
      customerName: r.customerName,
      customerEmail: r.customerEmail,
      customerPhone: r.customerPhone,
      startAt: r.startAt,
      endAt: r.endAt,
      status: r.status,
      currency: r.currency,
      depositAmount: r.depositAmount,
      stripeCheckoutSessionId: r.stripeCheckoutSessionId,
      stripePaymentIntentId: r.stripePaymentIntentId,
      stripeCustomerId: r.stripeCustomerId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      assignment: r.assignmentLocationId || r.assignmentVehicleId || r.assignmentConciergeUserId ? {
        locationId: r.assignmentLocationId ?? null,
        locationName: r.locationName ?? null,
        vehicleId: r.assignmentVehicleId ?? null,
        vehicleName: r.vehicleName ?? null,
        conciergeUserId: r.assignmentConciergeUserId ?? null,
        conciergeName: r.conciergeId ? [r.conciergeFirstName, r.conciergeLastName].filter(Boolean).join(" ") || null : null,
        conciergeEmail: r.conciergeEmail ?? null,
        assignedAt: r.assignmentAssignedAt ?? null
      } : null,
      notes
    };
  }
  async createXpBookingPending(input) {
    const now = /* @__PURE__ */ new Date();
    const result = await db.insert(xpBookings).values({ ...input, createdAt: now, updatedAt: now }).returning();
    return result[0];
  }
  async updateXpBookingStripeSession(id, stripeCheckoutSessionId) {
    const sessionId = String(stripeCheckoutSessionId || "").trim();
    if (!sessionId) return void 0;
    const result = await db.update(xpBookings).set({ stripeCheckoutSessionId: sessionId, updatedAt: /* @__PURE__ */ new Date() }).where(eq(xpBookings.id, id)).returning();
    return result[0];
  }
  async getXpBookingByStripeSessionId(sessionId) {
    const s = String(sessionId || "").trim();
    if (!s) return void 0;
    const result = await db.select().from(xpBookings).where(eq(xpBookings.stripeCheckoutSessionId, s)).limit(1);
    return result[0];
  }
  async confirmXpBookingByStripeSessionId(input) {
    const s = String(input.sessionId || "").trim();
    if (!s) return void 0;
    const result = await db.update(xpBookings).set({
      status: "confirmed",
      stripePaymentIntentId: input.paymentIntentId ?? null,
      stripeCustomerId: input.stripeCustomerId ?? null,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(xpBookings.stripeCheckoutSessionId, s)).returning();
    return result[0];
  }
  async cancelXpBooking(id) {
    const result = await db.update(xpBookings).set({ status: "cancelled", updatedAt: /* @__PURE__ */ new Date() }).where(eq(xpBookings.id, id)).returning();
    return result[0];
  }
  async hasStripeEvent(eventId) {
    const e = String(eventId || "").trim();
    if (!e) return false;
    const result = await db.select().from(xpStripeEvents).where(eq(xpStripeEvents.eventId, e)).limit(1);
    return !!result[0];
  }
  async recordStripeEvent(input) {
    const result = await db.insert(xpStripeEvents).values(input).returning();
    return result[0];
  }
  async countXpActiveBookingsOverlapping(input) {
    const rows = await db.execute(sql2`
      SELECT COUNT(*)::int AS c
      FROM xp_bookings
      WHERE experience_id = ${input.experienceId}
        AND kind = ${input.kind}
        AND status IN ('pending_payment', 'confirmed')
        AND start_at < ${input.endAt}
        AND end_at > ${input.startAt}
    `);
    return Number(rows.rows?.[0]?.c || 0);
  }
  async hasXpBlackoutOverlap(input) {
    const rows = await db.execute(sql2`
      SELECT COUNT(*)::int AS c
      FROM xp_blackouts
      WHERE experience_id = ${input.experienceId}
        AND start_at < ${input.endAt}
        AND end_at > ${input.startAt}
    `);
    return Number(rows.rows?.[0]?.c || 0) > 0;
  }
  async getTelephonyAnalyticsSummary(userId, startDate) {
    const rows = await db.execute(sql2`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'answered')::int AS answered,
        COUNT(*) FILTER (WHERE status = 'missed')::int AS missed,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
        COALESCE(SUM(duration_ms) FILTER (WHERE status = 'answered'), 0)::bigint AS talk_ms
      FROM call_logs
      WHERE user_id = ${userId} AND started_at >= ${startDate}
    `);
    const row = rows.rows?.[0] || {};
    const talkMs = Number(row.talk_ms || 0);
    return {
      total: Number(row.total || 0),
      answered: Number(row.answered || 0),
      missed: Number(row.missed || 0),
      failed: Number(row.failed || 0),
      talkSeconds: Math.round(talkMs / 1e3)
    };
  }
  // Opportunity Parties
  async getOpportunityParties(opportunityId) {
    return db.select().from(opportunityParties).where(eq(opportunityParties.opportunityId, opportunityId)).orderBy(asc(opportunityParties.createdAt));
  }
  async getOpportunityPartyById(id) {
    const result = await db.select().from(opportunityParties).where(eq(opportunityParties.id, id)).limit(1);
    return result[0];
  }
  async createOpportunityParty(party) {
    const result = await db.insert(opportunityParties).values(party).returning();
    return result[0];
  }
  async updateOpportunityParty(id, patch) {
    const result = await db.update(opportunityParties).set(patch).where(eq(opportunityParties.id, id)).returning();
    return result[0];
  }
  async deleteOpportunityParty(id) {
    await db.delete(opportunityParties).where(eq(opportunityParties.id, id));
  }
  // Public Listings
  async getPublicListingBySlug(slug) {
    const result = await db.select().from(publicListings).where(eq(publicListings.slug, slug)).limit(1);
    return result[0];
  }
  async getPublicListingByToken(token) {
    const result = await db.select().from(publicListings).where(eq(publicListings.token, token)).limit(1);
    return result[0];
  }
  async getPublicListingById(id) {
    const result = await db.select().from(publicListings).where(eq(publicListings.id, id)).limit(1);
    return result[0];
  }
  async getPublicListingsByOpportunity(opportunityId) {
    return db.select().from(publicListings).where(eq(publicListings.opportunityId, opportunityId)).orderBy(desc(publicListings.createdAt));
  }
  async createPublicListing(listing) {
    const result = await db.insert(publicListings).values(listing).returning();
    return result[0];
  }
  async updatePublicListing(id, patch) {
    const result = await db.update(publicListings).set(patch).where(eq(publicListings.id, id)).returning();
    return result[0];
  }
  async incrementListingViews(id) {
    await db.update(publicListings).set({ viewCount: sql2`${publicListings.viewCount} + 1` }).where(eq(publicListings.id, id));
  }
  async deletePublicListing(id) {
    await db.delete(publicListings).where(eq(publicListings.id, id));
  }
  // Buyer Inquiries
  async getBuyerInquiries(opportunityId) {
    return db.select().from(buyerInquiries).where(eq(buyerInquiries.opportunityId, opportunityId)).orderBy(desc(buyerInquiries.createdAt));
  }
  async getBuyerInquiryById(id) {
    const result = await db.select().from(buyerInquiries).where(eq(buyerInquiries.id, id)).limit(1);
    return result[0];
  }
  async getBuyerInquiriesByListing(listingId) {
    return db.select().from(buyerInquiries).where(eq(buyerInquiries.listingId, listingId)).orderBy(desc(buyerInquiries.createdAt));
  }
  async createBuyerInquiry(inquiry) {
    const result = await db.insert(buyerInquiries).values(inquiry).returning();
    return result[0];
  }
  async updateBuyerInquiry(id, patch) {
    const result = await db.update(buyerInquiries).set(patch).where(eq(buyerInquiries.id, id)).returning();
    return result[0];
  }
  // Opportunity Events
  async getOpportunityEvents(opportunityId, limit = 100) {
    return db.select().from(opportunityEvents).where(eq(opportunityEvents.opportunityId, opportunityId)).orderBy(desc(opportunityEvents.createdAt)).limit(limit);
  }
  async createOpportunityEvent(event) {
    const result = await db.insert(opportunityEvents).values(event).returning();
    return result[0];
  }
  // Buyer Offers
  async getBuyerOffersByOpportunity(opportunityId) {
    return db.select().from(buyerOffers).where(eq(buyerOffers.opportunityId, opportunityId)).orderBy(desc(buyerOffers.createdAt));
  }
  async getBuyerOfferById(id) {
    const result = await db.select().from(buyerOffers).where(eq(buyerOffers.id, id)).limit(1);
    return result[0];
  }
  async createBuyerOffer(offer) {
    const result = await db.insert(buyerOffers).values(offer).returning();
    return result[0];
  }
  async updateBuyerOffer(id, patch) {
    const result = await db.update(buyerOffers).set({ ...patch, updatedAt: /* @__PURE__ */ new Date() }).where(eq(buyerOffers.id, id)).returning();
    return result[0];
  }
  // Tasks
  async getTasksByRelatedEntity(entityType, entityId) {
    return db.select().from(tasks).where(and(eq(tasks.relatedEntityType, entityType), eq(tasks.relatedEntityId, entityId))).orderBy(desc(tasks.createdAt));
  }
};
var storage = new DatabaseStorage();

// server/lib/time-entry-math.ts
var MAX_TIME_ENTRY_HOURS2 = 16;
var MIN_TIME_ENTRY_MINUTES2 = 5;
function parseTimeHm(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number.parseInt(m[1], 10);
  const min = Number.parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23) return null;
  if (min < 0 || min > 59) return null;
  return { h, m: min };
}
function computeManualTimeEntry(input) {
  const start = parseTimeHm(input.startTime);
  const end = parseTimeHm(input.endTime);
  if (!start || !end) {
    return { ok: false, error: "Invalid startTime/endTime" };
  }
  const startMinutes = start.h * 60 + start.m;
  const endMinutes = end.h * 60 + end.m;
  let durationMinutes = endMinutes - startMinutes;
  if (durationMinutes < 0) durationMinutes += 24 * 60;
  if (durationMinutes === 0) return { ok: false, error: "Start and end times are the same" };
  const hours = durationMinutes / 60;
  const flags = [];
  let status = "draft";
  let payableHours = null;
  if (durationMinutes > MAX_TIME_ENTRY_HOURS2 * 60) {
    flags.push("duration_over_max");
    status = "disputed";
    payableHours = 0;
  } else if (durationMinutes < MIN_TIME_ENTRY_MINUTES2) {
    flags.push("too_short");
    status = "disputed";
    payableHours = 0;
  }
  return { ok: true, hours, flags, status, payableHours };
}

// server/routes.ts
init_db();
import { and as and3, desc as desc2, eq as eq3, gte as gte3, inArray as inArray3, lte as lte3, sql as sql4 } from "drizzle-orm";

// server/telephony/ws.ts
import { WebSocketServer } from "ws";
import { jwtVerify } from "jose";
var started = false;
var wss = null;
var socketsByUserId = /* @__PURE__ */ new Map();
function getSecret() {
  const secret = process.env.SESSION_SECRET || "";
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}
async function authUserIdFromToken(token) {
  const secret = getSecret();
  if (!secret) return null;
  try {
    const verified = await jwtVerify(token, secret);
    const sub = verified.payload.sub;
    const userId = typeof sub === "string" ? parseInt(sub, 10) : NaN;
    if (!Number.isFinite(userId) || userId <= 0) return null;
    return userId;
  } catch {
    return null;
  }
}
function registerSocket({ userId, ws }) {
  const set = socketsByUserId.get(userId) || /* @__PURE__ */ new Set();
  set.add(ws);
  socketsByUserId.set(userId, set);
}
function unregisterSocket({ userId, ws }) {
  const set = socketsByUserId.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) socketsByUserId.delete(userId);
}
function initTelephonyWs(httpServer) {
  if (started) return;
  started = true;
  wss = new WebSocketServer({ server: httpServer, path: "/ws/telephony" });
  wss.on("connection", async (ws, req) => {
    try {
      const url = new URL(req.url || "", "http://localhost");
      const token = url.searchParams.get("token") || "";
      const userId = await authUserIdFromToken(token);
      if (!userId) {
        ws.close();
        return;
      }
      const userSocket = { userId, ws };
      registerSocket(userSocket);
      ws.on("close", () => unregisterSocket(userSocket));
      ws.on("error", () => unregisterSocket(userSocket));
    } catch {
      ws.close();
    }
  });
}
function emitTelephonyEventToAll(event) {
  const msg = JSON.stringify({ ...event, ts: Date.now() });
  for (const [, set] of socketsByUserId) {
    for (const ws of set) {
      try {
        ws.send(msg);
      } catch {
      }
    }
  }
}

// server/telephony/pubsub.ts
init_db();
var CHANNEL = "telephony_events";
async function publishTelephonyEvent(event) {
  const payload = JSON.stringify({ event, ts: Date.now() });
  await pool.query("select pg_notify($1, $2)", [CHANNEL, payload]);
}

// server/telephony/objectStorage.ts
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
function readStorageConfig() {
  const bucket = String(process.env.TELEPHONY_MEDIA_BUCKET || "").trim();
  const region = String(process.env.TELEPHONY_MEDIA_REGION || "auto").trim();
  const endpoint = String(process.env.TELEPHONY_MEDIA_ENDPOINT || "").trim() || void 0;
  const accessKeyId = String(process.env.TELEPHONY_MEDIA_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.TELEPHONY_MEDIA_SECRET_ACCESS_KEY || "").trim();
  if (!bucket || !region || !accessKeyId || !secretAccessKey) return null;
  return { bucket, region, endpoint, accessKeyId, secretAccessKey };
}
function getClient(cfg) {
  return new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: Boolean(cfg.endpoint),
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }
  });
}
async function getTelephonyMediaSignedUrl(input) {
  const cfg = readStorageConfig();
  if (!cfg) return null;
  const client2 = getClient(cfg);
  const cmd = new GetObjectCommand({ Bucket: cfg.bucket, Key: input.key });
  const url = await getSignedUrl(client2, cmd, { expiresIn: input.expiresInSeconds ?? 300 });
  return url;
}

// server/schema-readiness.ts
init_db();
import crypto2 from "node:crypto";
var cached = null;
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function isDbConnectivityError(error) {
  if (!error) return false;
  const code = error?.code;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ETIMEDOUT") return true;
  if (code === "57P01" || code === "57P02" || code === "57P03") return true;
  if (code === "53300" || code === "08000" || code === "08003" || code === "08006" || code === "08001") return true;
  if (code === "ENETUNREACH" || code === "EHOSTUNREACH") return true;
  const message = String(error?.message || "");
  if (/network error|non-101|socket hang up|connect econn|getaddrinfo|econnrefused|enotfound|etimedout/i.test(message)) return true;
  const cause = error?.cause;
  if (cause && cause !== error) return isDbConnectivityError(cause);
  const nested = error?.errors;
  if (Array.isArray(nested)) return nested.some(isDbConnectivityError);
  return false;
}
function log(level, payload) {
  const line = JSON.stringify({ ts: nowIso(), event: "schema", ...payload });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
async function checkSchemaOnce() {
  const checkedAt = nowIso();
  const missing = [];
  try {
    const dbUrl = databaseUrlResolution();
    if (!dbUrl.url) {
      missing.push("env:DATABASE_URL");
      missing.push("env:POSTGRES_URL_NON_POOLING");
      missing.push("env:POSTGRES_PRISMA_URL");
      missing.push("env:POSTGRES_URL");
      return {
        ok: false,
        checkedAt,
        kind: "db_unavailable",
        message: "No valid database URL configured",
        code: null,
        missing
      };
    }
    const reqId = crypto2.randomUUID();
    const tasksRes = await pool.query("select to_regclass('public.tasks') as reg", []);
    if (!String(tasksRes?.rows?.[0]?.reg || "").trim()) missing.push("table:tasks");
    const pcRes = await pool.query("select to_regclass('public.pipeline_configs') as reg", []);
    if (!String(pcRes?.rows?.[0]?.reg || "").trim()) missing.push("table:pipeline_configs");
    const dsRes = await pool.query("select to_regclass('public.dialer_scripts') as reg", []);
    if (!String(dsRes?.rows?.[0]?.reg || "").trim()) missing.push("table:dialer_scripts");
    const cmRes = await pool.query("select to_regclass('public.call_media') as reg", []);
    if (!String(cmRes?.rows?.[0]?.reg || "").trim()) missing.push("table:call_media");
    const dncRes = await pool.query(
      "select 1 as ok from information_schema.columns where table_schema = 'public' and table_name = 'leads' and column_name = 'do_not_call' limit 1",
      []
    );
    if (!dncRes?.rows?.length) missing.push("column:leads.do_not_call");
    const dneRes = await pool.query(
      "select 1 as ok from information_schema.columns where table_schema = 'public' and table_name = 'leads' and column_name = 'do_not_email' limit 1",
      []
    );
    if (!dneRes?.rows?.length) missing.push("column:leads.do_not_email");
    const plsRes = await pool.query(
      "select 1 as ok from information_schema.columns where table_schema = 'public' and table_name = 'properties' and column_name = 'lead_source' limit 1",
      []
    );
    if (!plsRes?.rows?.length) missing.push("column:properties.lead_source");
    const plsDetailRes = await pool.query(
      "select 1 as ok from information_schema.columns where table_schema = 'public' and table_name = 'properties' and column_name = 'lead_source_detail' limit 1",
      []
    );
    if (!plsDetailRes?.rows?.length) missing.push("column:properties.lead_source_detail");
    const lsoUpdatedRes = await pool.query(
      "select 1 as ok from information_schema.columns where table_schema = 'public' and table_name = 'lead_source_options' and column_name = 'updated_at' limit 1",
      []
    );
    if (!lsoUpdatedRes?.rows?.length) missing.push("column:lead_source_options.updated_at");
    if (missing.length) {
      log("error", { kind: "missing", missing, requestId: reqId });
      return {
        ok: false,
        checkedAt,
        kind: "schema_missing",
        message: "Database schema is not ready",
        code: null,
        missing
      };
    }
    return { ok: true, checkedAt };
  } catch (e) {
    const code = e?.code ? String(e.code) : null;
    const isConn = isDbConnectivityError(e);
    log("error", { kind: "check_failed", message: String(e?.message || e), code, connectivity: isConn });
    return {
      ok: false,
      checkedAt,
      kind: isConn ? "db_unavailable" : "schema_missing",
      message: isConn ? "Database is unavailable" : "Database schema check failed",
      code,
      missing
    };
  }
}
async function getSchemaReadiness() {
  const ttlOkMs = 3e5;
  const ttlFailMs = 18e4;
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  const value = await checkSchemaOnce();
  cached = { value, expiresAt: now + (value.ok ? ttlOkMs : ttlFailMs) };
  return value;
}
function schemaFixInstructions() {
  return {
    vercelBuildNote: "Vercel builds auto-apply migrations when DB env vars are set (set AUTO_APPLY_MIGRATIONS=false to force-disable).",
    applyMigrations: "npm run migrate",
    applyMigrationsFromRepoRoot: "npm --prefix FrameworkPlanner run migrate",
    drizzlePush: "npm run db:push",
    drizzlePushFromRepoRoot: "npm --prefix FrameworkPlanner run db:push"
  };
}

// server/crm/import-export.ts
init_db();
import crypto3 from "node:crypto";
import { parse as parseCsv } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { z as z2 } from "zod";
import { and as and2, eq as eq2, gte as gte2, inArray as inArray2, lte as lte2, sql as sql3 } from "drizzle-orm";
var leadFields = [
  { key: "fullAddress", label: "Full Address", type: "string" },
  { key: "address", label: "Address", required: true, type: "string" },
  { key: "city", label: "City", required: true, type: "string" },
  { key: "state", label: "State", required: true, type: "string" },
  { key: "zipCode", label: "Zip Code", required: true, type: "string" },
  { key: "ownerName", label: "Owner Name", required: true, type: "string" },
  { key: "ownerPhone", label: "Owner Phone", type: "string" },
  { key: "ownerEmail", label: "Owner Email", type: "email" },
  { key: "estimatedValue", label: "Estimated Value", type: "decimal" },
  { key: "relasScore", label: "Relas Score", type: "int" },
  { key: "motivation", label: "Motivation", type: "string" },
  { key: "status", label: "Status", type: "string" },
  { key: "source", label: "Source", required: true, type: "string" },
  { key: "assignedTo", label: "Assigned To (User ID)", type: "int" },
  { key: "notes", label: "Notes", type: "string" }
];
var opportunityFields = [
  { key: "address", label: "Address", required: true, type: "string" },
  { key: "city", label: "City", required: true, type: "string" },
  { key: "state", label: "State", required: true, type: "string" },
  { key: "zipCode", label: "Zip Code", required: true, type: "string" },
  { key: "beds", label: "Beds", type: "int" },
  { key: "baths", label: "Baths", type: "int" },
  { key: "sqft", label: "Square Feet", type: "int" },
  { key: "price", label: "Price", type: "decimal" },
  { key: "status", label: "Status", type: "string" },
  { key: "apn", label: "APN", type: "string" },
  { key: "yearBuilt", label: "Year Built", type: "int" },
  { key: "lotSize", label: "Lot Size", type: "string" },
  { key: "occupancy", label: "Occupancy", type: "string" },
  { key: "arv", label: "ARV", type: "decimal" },
  { key: "repairCost", label: "Repair Cost", type: "decimal" },
  { key: "assignedTo", label: "Assigned To (User ID)", type: "int" },
  { key: "leadSource", label: "Lead Source", type: "string" },
  { key: "leadSourceDetail", label: "Lead Source Detail", type: "string" },
  { key: "notes", label: "Notes", type: "string" }
];
var contactFields = [
  { key: "name", label: "Name", required: true, type: "string" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "string" },
  { key: "type", label: "Type", type: "string" },
  { key: "company", label: "Company", type: "string" },
  { key: "notes", label: "Notes", type: "string" }
];
var buyerFields = [
  { key: "name", label: "Name", required: true, type: "string" },
  { key: "company", label: "Company", type: "string" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "string" },
  { key: "preferredPropertyTypes", label: "Preferred Property Types", type: "string_array" },
  { key: "preferredAreas", label: "Preferred Areas", type: "string_array" },
  { key: "minBudget", label: "Min Budget", type: "decimal" },
  { key: "maxBudget", label: "Max Budget", type: "decimal" },
  { key: "dealsPerMonth", label: "Deals Per Month", type: "int" },
  { key: "proofOfFunds", label: "Proof Of Funds", type: "bool" },
  { key: "proofOfFundsNotes", label: "Proof Of Funds Notes", type: "string" },
  { key: "isVip", label: "VIP", type: "bool" },
  { key: "status", label: "Status", type: "string" },
  { key: "totalDeals", label: "Total Deals", type: "int" },
  { key: "totalRevenue", label: "Total Revenue", type: "decimal" },
  { key: "notes", label: "Notes", type: "string" },
  { key: "tags", label: "Tags", type: "string_array" },
  { key: "lastContactDate", label: "Last Contact Date", type: "date" }
];
var leadSynonyms = {
  fullAddress: ["full address", "address full", "property address full", "property full address", "mailing address", "property address"],
  address: ["address", "street", "street address", "property address"],
  city: ["city", "town"],
  state: ["state", "st"],
  zipCode: ["zip", "zip code", "zipcode", "postal", "postal code"],
  ownerName: ["owner", "owner name", "name", "seller", "seller name"],
  ownerPhone: ["phone", "owner phone", "seller phone", "mobile"],
  ownerEmail: ["email", "owner email", "seller email"],
  estimatedValue: ["estimated value", "est value", "value", "estimated"],
  relasScore: ["relas", "relas score", "score"],
  motivation: ["motivation"],
  status: ["status", "stage"],
  source: ["source", "lead source"],
  assignedTo: ["assigned to", "assigned", "assignee", "assigned user", "assigned user id"],
  notes: ["notes", "note", "comments", "comment"]
};
var opportunitySynonyms = {
  address: ["address", "street", "street address", "property address"],
  city: ["city", "town"],
  state: ["state", "st"],
  zipCode: ["zip", "zip code", "zipcode", "postal", "postal code"],
  beds: ["beds", "bedrooms", "br"],
  baths: ["baths", "bathrooms", "ba"],
  sqft: ["sqft", "square feet", "sf"],
  price: ["price", "ask", "asking", "list price"],
  status: ["status", "stage"],
  apn: ["apn", "parcel", "parcel number"],
  yearBuilt: ["year built", "yr built"],
  lotSize: ["lot size"],
  occupancy: ["occupancy"],
  arv: ["arv", "after repair value"],
  repairCost: ["repair cost", "repairs", "rehab", "rehab cost"],
  assignedTo: ["assigned to", "assigned", "assignee", "assigned user", "assigned user id"],
  leadSource: ["lead source", "source"],
  leadSourceDetail: ["lead source detail", "source detail", "source notes"],
  notes: ["notes", "note", "comments", "comment"]
};
var contactSynonyms = {
  name: ["name", "full name", "contact", "contact name"],
  email: ["email", "e-mail"],
  phone: ["phone", "mobile", "cell"],
  type: ["type", "category"],
  company: ["company", "organization", "org"],
  notes: ["notes", "note", "comments", "comment"]
};
var buyerSynonyms = {
  name: ["name", "buyer", "buyer name"],
  company: ["company", "organization", "org"],
  email: ["email", "e-mail"],
  phone: ["phone", "mobile", "cell"],
  preferredPropertyTypes: ["preferred property types", "property types", "types"],
  preferredAreas: ["preferred areas", "areas", "markets", "cities"],
  minBudget: ["min budget", "minimum budget", "min"],
  maxBudget: ["max budget", "maximum budget", "max"],
  dealsPerMonth: ["deals per month", "monthly deals"],
  proofOfFunds: ["proof of funds", "pof"],
  proofOfFundsNotes: ["proof of funds notes", "pof notes"],
  isVip: ["vip", "is vip"],
  status: ["status", "stage"],
  totalDeals: ["total deals", "deals"],
  totalRevenue: ["total revenue", "revenue"],
  notes: ["notes", "note", "comments", "comment"],
  tags: ["tags", "tag"],
  lastContactDate: ["last contact date", "last contacted"]
};
function normalizeHeader(v) {
  return v.trim().toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ");
}
function getCrmFieldDefs(entityType) {
  if (entityType === "lead") return leadFields;
  if (entityType === "opportunity") return opportunityFields;
  if (entityType === "contact") return contactFields;
  return buyerFields;
}
function suggestMapping(entityType, headers) {
  const normalizedHeaders = headers.map((h) => ({
    original: h,
    normalized: normalizeHeader(h)
  }));
  const synonyms = entityType === "lead" ? leadSynonyms : entityType === "opportunity" ? opportunitySynonyms : entityType === "contact" ? contactSynonyms : buyerSynonyms;
  const out = {};
  const usedHeaders = /* @__PURE__ */ new Set();
  const scoreMatch = (headerNorm, candNorm) => {
    if (headerNorm === candNorm) return 100;
    if (headerNorm.startsWith(candNorm)) return 75;
    if (candNorm.startsWith(headerNorm)) return 70;
    if (headerNorm.includes(candNorm)) return 60;
    if (candNorm.includes(headerNorm)) return 55;
    return 0;
  };
  for (const [field, candidates] of Object.entries(synonyms)) {
    let best = null;
    for (const c of candidates) {
      const candNorm = normalizeHeader(c);
      for (const h of normalizedHeaders) {
        if (usedHeaders.has(h.original)) continue;
        const score = scoreMatch(h.normalized, candNorm);
        if (score <= 0) continue;
        if (!best || score > best.score) best = { header: h.original, score };
      }
    }
    if (best) {
      out[field] = best.header;
      usedHeaders.add(best.header);
    }
  }
  return out;
}
function detectFormat(originalFilename, mimeType) {
  const name = String(originalFilename || "").toLowerCase();
  if (name.endsWith(".csv")) return "csv";
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "xlsx";
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("text/csv")) return "csv";
  if (mime.includes("spreadsheetml") || mime.includes("ms-excel")) return "xlsx";
  return null;
}
async function parseUpload(buffer, format) {
  if (format === "csv") {
    const text2 = buffer.toString("utf8");
    const rows2 = parseCsv(text2, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      relax_quotes: true,
      relax_column_count: true,
      trim: true
    });
    const headers2 = rows2.length ? Object.keys(rows2[0]) : [];
    return { headers: headers2, rows: rows2 };
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };
  const headerRow = sheet.getRow(1);
  const rawHeaders = [];
  for (let i = 1; i <= headerRow.cellCount; i++) {
    const h = String(headerRow.getCell(i).text || "").trim();
    rawHeaders.push(h || `Column ${i}`);
  }
  const seen = /* @__PURE__ */ new Map();
  const headers = rawHeaders.map((h) => {
    const base = h;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
  const rows = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const obj = {};
    let anyValue = false;
    for (let c = 1; c <= headers.length; c++) {
      const key = headers[c - 1];
      const cell = row.getCell(c);
      const value = cell.text;
      if (value !== "") anyValue = true;
      obj[key] = value;
    }
    if (anyValue) rows.push(obj);
  }
  return { headers, rows };
}
function isBlank(v) {
  return v === null || v === void 0 || typeof v === "string" && v.trim() === "";
}
function toStringOrNull(v) {
  if (v === null || v === void 0) return null;
  const s = String(v).trim();
  return s ? s : null;
}
function toIntOrNull(v) {
  const s = toStringOrNull(v);
  if (!s) return null;
  const n = Number.parseInt(s.replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}
function toDecimalOrNull(v) {
  const s = toStringOrNull(v);
  if (!s) return null;
  const raw = s.trim();
  const upper = raw.toUpperCase();
  if (upper === "N/A" || upper === "NA" || upper === "NULL" || upper === "NONE") return null;
  let sign = 1;
  let cleaned = raw.trim();
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
    sign = -1;
    cleaned = cleaned.slice(1, -1);
  }
  cleaned = cleaned.trim().replace(/\s+/g, "").replace(/USD/gi, "").replace(/[$,]/g, "");
  const suffix = cleaned.slice(-1).toLowerCase();
  const multiplier = suffix === "k" ? 1e3 : suffix === "m" ? 1e6 : 1;
  if (multiplier !== 1) cleaned = cleaned.slice(0, -1);
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return (sign * n * multiplier).toFixed(2);
}
function toBoolOrNull(v) {
  if (v === null || v === void 0) return null;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (s === "true" || s === "t" || s === "yes" || s === "y" || s === "1") return true;
  if (s === "false" || s === "f" || s === "no" || s === "n" || s === "0") return false;
  return null;
}
function toStringArrayOrNull(v) {
  const s = toStringOrNull(v);
  if (!s) return null;
  const items = s.split(/[;,]/g).map((x) => x.trim()).filter(Boolean);
  return items.length ? items : null;
}
function toDateOrNull(v) {
  if (v === null || v === void 0) return null;
  if (v instanceof Date) {
    const t2 = v.getTime();
    return Number.isFinite(t2) ? v : null;
  }
  const s = toStringOrNull(v);
  if (!s) return null;
  const d = new Date(s);
  const t = d.getTime();
  return Number.isFinite(t) ? d : null;
}
var usStateNameToCode = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
  "washington dc": "DC",
  "washington d c": "DC",
  "d c": "DC",
  "puerto rico": "PR",
  guam: "GU",
  "american samoa": "AS",
  "northern mariana islands": "MP",
  "u.s. virgin islands": "VI",
  "us virgin islands": "VI",
  "virgin islands": "VI"
};
var usStateVariantToCode = {
  ala: "AL",
  ariz: "AZ",
  ark: "AR",
  calif: "CA",
  colo: "CO",
  conn: "CT",
  del: "DE",
  fla: "FL",
  ga: "GA",
  ill: "IL",
  ind: "IN",
  kan: "KS",
  kans: "KS",
  ky: "KY",
  la: "LA",
  mass: "MA",
  mich: "MI",
  minn: "MN",
  miss: "MS",
  mo: "MO",
  mont: "MT",
  neb: "NE",
  nev: "NV",
  okla: "OK",
  ore: "OR",
  penn: "PA",
  pa: "PA",
  tenn: "TN",
  tex: "TX",
  va: "VA",
  wash: "WA",
  wv: "WV",
  wis: "WI"
};
function normalizeUsState(v) {
  if (!v) return null;
  const raw = String(v).trim();
  if (!raw) return null;
  const upper = raw.toUpperCase().replace(/\./g, "").trim();
  if (/^[A-Z]{2}$/.test(upper)) return upper;
  const cleaned = raw.trim().toLowerCase().replace(/\./g, "").replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  if (usStateNameToCode[cleaned]) return usStateNameToCode[cleaned];
  if (usStateVariantToCode[cleaned]) return usStateVariantToCode[cleaned];
  return upper;
}
function validateState(v) {
  if (!v) return null;
  const s = v.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(s))
    return 'State must be 2 letters (e.g. "FL"). Full names like "Florida" are accepted, or provide a valid US ZIP so it can be derived.';
  return null;
}
function validateZip(v) {
  if (!v) return null;
  const s = v.trim();
  if (!/^\d{5}(-\d{4})?$/.test(s)) return "Zip Code must be 5 digits (or ZIP+4)";
  return null;
}
var zip3Ranges = [
  [6, 7, "PR"],
  [8, 8, "VI"],
  [9, 9, "PR"],
  [10, 27, "MA"],
  [28, 29, "RI"],
  [30, 38, "NH"],
  [39, 49, "ME"],
  [50, 59, "VT"],
  [60, 69, "CT"],
  [70, 89, "NJ"],
  [90, 99, "AE"],
  [100, 149, "NY"],
  [150, 196, "PA"],
  [197, 199, "DE"],
  [200, 205, "DC"],
  [206, 219, "MD"],
  [220, 246, "VA"],
  [247, 268, "WV"],
  [270, 289, "NC"],
  [290, 299, "SC"],
  [300, 319, "GA"],
  [320, 349, "FL"],
  [350, 369, "AL"],
  [370, 385, "TN"],
  [386, 397, "MS"],
  [400, 427, "KY"],
  [430, 459, "OH"],
  [460, 479, "IN"],
  [480, 499, "MI"],
  [500, 528, "IA"],
  [530, 549, "WI"],
  [550, 567, "MN"],
  [570, 577, "SD"],
  [580, 588, "ND"],
  [590, 599, "MT"],
  [600, 629, "IL"],
  [630, 658, "MO"],
  [660, 679, "KS"],
  [680, 693, "NE"],
  [700, 715, "LA"],
  [716, 729, "AR"],
  [730, 749, "OK"],
  [750, 799, "TX"],
  [800, 816, "CO"],
  [820, 831, "WY"],
  [832, 838, "ID"],
  [840, 847, "UT"],
  [850, 865, "AZ"],
  [870, 884, "NM"],
  [889, 898, "NV"],
  [900, 961, "CA"],
  [967, 968, "HI"],
  [969, 969, "GU"],
  [970, 979, "OR"],
  [980, 994, "WA"],
  [995, 999, "AK"]
];
function extractZip5(v) {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{5})(?:-\d{4})?$/);
  return m ? m[1] : null;
}
function inferUsStateFromZip(v) {
  const zip5 = extractZip5(v);
  if (!zip5) return null;
  const zip3 = parseInt(zip5.slice(0, 3), 10);
  if (!Number.isFinite(zip3)) return null;
  let lo = 0;
  let hi = zip3Ranges.length - 1;
  while (lo <= hi) {
    const mid = lo + hi >> 1;
    const [start, end, st] = zip3Ranges[mid];
    if (zip3 < start) hi = mid - 1;
    else if (zip3 > end) lo = mid + 1;
    else return st;
  }
  return null;
}
function parseUsFullAddress(input) {
  const s = String(input || "").trim();
  if (!s) return null;
  const withCommas = s.match(/^(.+?),\s*([^,]+?),\s*([A-Za-z]{2})\s*(\d{5}(?:-\d{4})?)?$/);
  if (withCommas) {
    const street = withCommas[1]?.trim() || "";
    const city = withCommas[2]?.trim() || "";
    const state = withCommas[3]?.trim().toUpperCase() || "";
    const zipCode = (withCommas[4] || "").trim() || "";
    return { street, city, state, zipCode };
  }
  const withTrailing = s.match(/^(.+?)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (withTrailing) {
    const left = withTrailing[1]?.trim() || "";
    const state = withTrailing[2]?.trim().toUpperCase() || "";
    const zipCode = withTrailing[3]?.trim() || "";
    const parts = left.split(",").map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const street = parts.slice(0, -1).join(", ");
      const city = parts[parts.length - 1] || "";
      return { street, city, state, zipCode };
    }
    return null;
  }
  return null;
}
function computeNormalizedPart(v) {
  return String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
}
function computeLeadDedupeKey(input) {
  return [
    computeNormalizedPart(input.address),
    computeNormalizedPart(input.city),
    computeNormalizedPart(input.state),
    computeNormalizedPart(input.zipCode),
    computeNormalizedPart(input.ownerName)
  ].join("|");
}
function computeOpportunityDedupeKey(input) {
  return [
    computeNormalizedPart(input.apn || ""),
    computeNormalizedPart(input.address),
    computeNormalizedPart(input.city),
    computeNormalizedPart(input.state),
    computeNormalizedPart(input.zipCode)
  ].join("|");
}
function computeContactDedupeKey(input) {
  return [computeNormalizedPart(input.email || ""), computeNormalizedPart(input.phone || ""), computeNormalizedPart(input.name)].join("|");
}
function computeBuyerDedupeKey(input) {
  return [
    computeNormalizedPart(input.email || ""),
    computeNormalizedPart(input.phone || ""),
    computeNormalizedPart(input.name),
    computeNormalizedPart(input.company || "")
  ].join("|");
}
function mapAndValidateRow(entityType, row, mapping, ctx) {
  const defs = getCrmFieldDefs(entityType);
  const raw = {};
  for (const def of defs) {
    const col = mapping[def.key];
    if (!col) continue;
    if (def.key === "source" && typeof col === "string" && col.startsWith("static:")) {
      raw[def.key] = col.slice("static:".length);
    } else {
      raw[def.key] = row[col];
    }
  }
  const errors = [];
  const out = {};
  for (const def of defs) {
    const v = raw[def.key];
    if (!Object.prototype.hasOwnProperty.call(raw, def.key)) continue;
    if (def.type === "string" || def.type === "email") {
      out[def.key] = toStringOrNull(v);
    } else if (def.type === "int") {
      const iv = toIntOrNull(v);
      if (!isBlank(v) && iv === null) errors.push({ field: def.key, message: "Must be an integer" });
      out[def.key] = iv;
    } else if (def.type === "decimal") {
      const dv = toDecimalOrNull(v);
      const rawNum = typeof v === "string" ? v.trim().toUpperCase() : "";
      const blankishNum = rawNum === "N/A" || rawNum === "NA" || rawNum === "NULL" || rawNum === "NONE";
      if (!isBlank(v) && !blankishNum && dv === null) errors.push({ field: def.key, message: "Must be a number" });
      out[def.key] = dv;
    } else if (def.type === "bool") {
      const bv = toBoolOrNull(v);
      if (!isBlank(v) && bv === null) errors.push({ field: def.key, message: "Must be a boolean (true/false)" });
      out[def.key] = bv;
    } else if (def.type === "string_array") {
      out[def.key] = toStringArrayOrNull(v);
    } else if (def.type === "date") {
      const dv = toDateOrNull(v);
      if (!isBlank(v) && dv === null) errors.push({ field: def.key, message: "Must be a date" });
      out[def.key] = dv;
    }
  }
  if (entityType === "lead") {
    const candidate2 = toStringOrNull(out.fullAddress ?? null) || toStringOrNull(out.address ?? null);
    const needsDerive = !out.city || !out.state || !out.zipCode;
    if (candidate2 && needsDerive) {
      const parsed2 = parseUsFullAddress(candidate2);
      if (parsed2) {
        if (!out.city && parsed2.city) out.city = parsed2.city;
        if (!out.state && parsed2.state) out.state = parsed2.state;
        if (!out.zipCode && parsed2.zipCode) out.zipCode = parsed2.zipCode;
        if (!out.address && parsed2.street) out.address = parsed2.street;
        if (typeof out.address === "string" && out.address.includes(",") && parsed2.street) {
          out.address = parsed2.street;
        }
      } else if (toStringOrNull(out.fullAddress ?? null)) {
        if (!out.city) errors.push({ field: "city", message: "Unable to parse from Full Address" });
        if (!out.state) errors.push({ field: "state", message: "Unable to parse from Full Address" });
        if (!out.zipCode) errors.push({ field: "zipCode", message: "Unable to parse from Full Address" });
      }
    }
    delete out.fullAddress;
  }
  if (entityType === "lead" || entityType === "opportunity") {
    const zipLike = (v) => typeof v === "string" && /^\d{5}(?:-\d{4})?$/.test(v.trim());
    if (!out.zipCode && zipLike(out.state)) {
      out.zipCode = String(out.state || "").trim();
      out.state = null;
    }
    const deriveFromZip = ctx?.deriveStateFromZip !== false;
    if (deriveFromZip && (!out.state || typeof out.state === "string" && !out.state.trim() || zipLike(out.state)) && out.zipCode) {
      const inferred = inferUsStateFromZip(toStringOrNull(out.zipCode ?? null));
      if (inferred) out.state = inferred;
    }
    out.state = normalizeUsState(out.state ?? null);
  }
  if (entityType === "lead") {
    const src = toStringOrNull(out.source ?? null);
    const defaultSrc = toStringOrNull(ctx?.defaultLeadSource ?? null);
    if ((!src || !src.trim()) && defaultSrc) out.source = defaultSrc.trim();
  }
  for (const def of defs) {
    if (!def.required) continue;
    const value = out[def.key];
    if (value === null || value === void 0 || typeof value === "string" && value.trim() === "") {
      errors.push({ field: def.key, message: "Required" });
    }
  }
  for (const def of defs) {
    if (def.type !== "email") continue;
    const v = out[def.key];
    if (!v) continue;
    const r = z2.string().email().safeParse(v);
    if (!r.success) errors.push({ field: def.key, message: "Invalid email" });
  }
  if (entityType === "lead" || entityType === "opportunity") {
    let stateErr = validateState(out.state ?? null);
    const zipErr = validateZip(out.zipCode ?? null);
    const deriveFromZip = ctx?.deriveStateFromZip !== false;
    if (stateErr && deriveFromZip && !zipErr) {
      const inferred = inferUsStateFromZip(toStringOrNull(out.zipCode ?? null));
      if (inferred) {
        out.state = inferred;
        stateErr = validateState(out.state ?? null);
      }
    }
    if (stateErr) errors.push({ field: "state", message: stateErr });
    if (zipErr) errors.push({ field: "zipCode", message: zipErr });
  }
  if (errors.length) return { ok: false, errors, data: null, raw: out };
  if (entityType === "lead") {
    const candidate2 = out;
    const parsed2 = insertLeadSchema.safeParse(candidate2);
    if (!parsed2.success) {
      return {
        ok: false,
        errors: parsed2.error.issues.map((i) => ({ field: String(i.path[0] || ""), message: i.message })),
        data: null,
        raw: out
      };
    }
    return { ok: true, data: parsed2.data, errors: [], raw: out };
  }
  if (entityType === "opportunity") {
    const candidate2 = out;
    const parsed2 = insertPropertySchema.safeParse(candidate2);
    if (!parsed2.success) {
      return {
        ok: false,
        errors: parsed2.error.issues.map((i) => ({ field: String(i.path[0] || ""), message: i.message })),
        data: null,
        raw: out
      };
    }
    return { ok: true, data: parsed2.data, errors: [], raw: out };
  }
  if (entityType === "contact") {
    const candidate2 = out;
    const parsed2 = insertContactSchema.safeParse(candidate2);
    if (!parsed2.success) {
      return {
        ok: false,
        errors: parsed2.error.issues.map((i) => ({ field: String(i.path[0] || ""), message: i.message })),
        data: null,
        raw: out
      };
    }
    return { ok: true, data: parsed2.data, errors: [], raw: out };
  }
  const candidate = out;
  const parsed = insertBuyerSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] || ""), message: i.message })),
      data: null,
      raw: out
    };
  }
  return { ok: true, data: parsed.data, errors: [], raw: out };
}
function mergeScalar(existing, incoming) {
  if (existing === null || existing === void 0) return incoming;
  if (typeof existing === "string" && existing.trim() === "") return incoming;
  if (Array.isArray(existing) && existing.length === 0) return incoming;
  return existing;
}
function mergeNotes(existing, incoming) {
  const a = toStringOrNull(existing);
  const b = toStringOrNull(incoming);
  if (!b) return a;
  if (!a) return b;
  if (a.trim() === b.trim()) return a;
  return `${a}
${b}`;
}
function hashToken(token) {
  return crypto3.createHash("sha256").update(token).digest("hex");
}
function toDateMs(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}
async function withAdvisoryLock(ns, key, fn) {
  return await db.transaction(async (tx) => {
    const r = await tx.execute(sql3`SELECT pg_try_advisory_lock(${ns}, ${key}) AS ok`);
    const ok = Boolean(r?.rows?.[0]?.ok);
    if (!ok) return null;
    try {
      return await fn(tx);
    } finally {
      try {
        await tx.execute(sql3`SELECT pg_advisory_unlock(${ns}, ${key})`);
      } catch {
      }
    }
  });
}
async function createImportJob(params) {
  const result = await db.insert(crmImportJobs).values({
    entityType: params.entityType,
    createdBy: params.createdBy,
    status: "queued",
    originalFilename: params.originalFilename || null,
    fileMimeType: params.fileMimeType || null,
    fileBase64: params.fileBase64,
    mapping: JSON.stringify(params.mapping || {}),
    options: JSON.stringify(params.options || {}),
    processedRows: 0,
    createdCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    errorCount: 0
  }).returning();
  return result[0];
}
async function getImportJob(jobId) {
  const rows = await db.select().from(crmImportJobs).where(eq2(crmImportJobs.id, jobId)).limit(1);
  return rows[0];
}
async function listImportJobErrors(jobId, limit = 50) {
  return await db.select().from(crmImportJobErrors).where(eq2(crmImportJobErrors.jobId, jobId)).orderBy(crmImportJobErrors.rowNumber).limit(limit);
}
async function processImportJob(jobId, limits = {}) {
  const out = await withAdvisoryLock(1, jobId, async (tx) => {
    const jobRows = await tx.select().from(crmImportJobs).where(eq2(crmImportJobs.id, jobId)).limit(1);
    const job = jobRows[0];
    if (!job) throw new Error("Import job not found");
    const updatedAtMs = toDateMs(job.updatedAt);
    const activeWindowMs = limits.resume ? 5e3 : 9e4;
    const runnable = job.status === "queued" || job.status === "processing" && (updatedAtMs === null || Date.now() - updatedAtMs > activeWindowMs);
    if (!runnable) return job;
    const entityType = job.entityType;
    const mapping = JSON.parse(String(job.mapping || "{}"));
    const options = JSON.parse(String(job.options || "{}"));
    const dryRun = !!options.dryRun;
    const onDuplicate = options.onDuplicate || "merge";
    const defaultLeadSource = toStringOrNull(options.defaultLeadSource ?? null)?.trim() || "Import";
    const deriveStateFromZip = options.deriveStateFromZip !== false;
    const defaultBatchSize = limits.maxRows ? Math.min(limits.maxRows, 200) : 500;
    const batchSize = options.batchSize && options.batchSize > 0 ? Math.min(options.batchSize, 2e3) : defaultBatchSize;
    const startedAt = job.startedAt ? new Date(job.startedAt) : /* @__PURE__ */ new Date();
    await tx.update(crmImportJobs).set({ status: "processing", startedAt, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(crmImportJobs.id, jobId));
    try {
      const format = detectFormat(job.originalFilename || void 0, job.fileMimeType || void 0) || "csv";
      const buffer = Buffer.from(String(job.fileBase64), "base64");
      const parsed = await parseUpload(buffer, format);
      await tx.update(crmImportJobs).set({ totalRows: parsed.rows.length, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(crmImportJobs.id, jobId));
      let processedRows = Math.max(0, Math.min(Number(job.processedRows || 0), parsed.rows.length));
      let createdCount = Number(job.createdCount || 0);
      let updatedCount = Number(job.updatedCount || 0);
      let skippedCount = Number(job.skippedCount || 0);
      let errorCount = Number(job.errorCount || 0);
      const assignedIds = [];
      for (const r of parsed.rows.slice(processedRows)) {
        const v = mapping.assignedTo ? toIntOrNull(r[mapping.assignedTo]) : null;
        if (v) assignedIds.push(v);
      }
      const uniqueAssigneeIds = Array.from(new Set(assignedIds.filter((n) => Number.isFinite(n))));
      const assigneeRows = uniqueAssigneeIds.length ? await tx.select({ id: users.id }).from(users).where(inArray2(users.id, uniqueAssigneeIds)) : [];
      const validAssignees = new Set(assigneeRows.map((r) => r.id));
      const maxRows = limits.maxRows && limits.maxRows > 0 ? limits.maxRows : null;
      const maxBatches = limits.maxBatches && limits.maxBatches > 0 ? limits.maxBatches : null;
      let batchesRun = 0;
      let rowsRun = 0;
      for (let i = processedRows; i < parsed.rows.length; i += batchSize) {
        if (maxBatches !== null && batchesRun >= maxBatches) break;
        if (maxRows !== null && rowsRun >= maxRows) break;
        const remaining = maxRows !== null ? Math.max(0, maxRows - rowsRun) : null;
        const effectiveBatchSize = remaining !== null ? Math.min(batchSize, remaining) : batchSize;
        const slice = parsed.rows.slice(i, i + effectiveBatchSize);
        if (!slice.length) break;
        const prepared = slice.map(
          (rawRow) => mapAndValidateRow(entityType, rawRow, mapping, {
            defaultLeadSource: entityType === "lead" ? defaultLeadSource : void 0,
            deriveStateFromZip: entityType === "lead" || entityType === "opportunity" ? deriveStateFromZip : void 0
          })
        );
        const seenKeys = /* @__PURE__ */ new Set();
        const candidates = [];
        for (let j = 0; j < prepared.length; j++) {
          const rowNumber = i + j + 2;
          const prep = prepared[j];
          const rawRow = slice[j];
          if (!prep.ok) {
            errorCount += 1;
            await tx.insert(crmImportJobErrors).values({
              jobId,
              rowNumber,
              errors: JSON.stringify(prep.errors),
              rawRow: JSON.stringify(rawRow)
            });
            continue;
          }
          const assignedTo = prep.data.assignedTo;
          if (assignedTo && !validAssignees.has(assignedTo)) {
            errorCount += 1;
            await tx.insert(crmImportJobErrors).values({
              jobId,
              rowNumber,
              errors: JSON.stringify([{ field: "assignedTo", message: "Assigned user does not exist" }]),
              rawRow: JSON.stringify(rawRow)
            });
            continue;
          }
          const key = entityType === "lead" ? computeLeadDedupeKey(prep.data) : entityType === "opportunity" ? computeOpportunityDedupeKey(prep.data) : entityType === "contact" ? computeContactDedupeKey(prep.data) : computeBuyerDedupeKey(prep.data);
          if (seenKeys.has(key)) {
            errorCount += 1;
            await tx.insert(crmImportJobErrors).values({
              jobId,
              rowNumber,
              errors: JSON.stringify([{ message: "Duplicate row within import file" }]),
              rawRow: JSON.stringify(rawRow)
            });
            continue;
          }
          seenKeys.add(key);
          candidates.push({ rowNumber, rawRow, data: prep.data, key });
        }
        const keys = candidates.map((c) => c.key);
        const existingByKey = /* @__PURE__ */ new Map();
        if (keys.length) {
          if (entityType === "lead") {
            const existing = await tx.select().from(leads).where(inArray2(leads.dedupeKey, keys));
            for (const e of existing) existingByKey.set(String(e.dedupeKey || ""), e);
          } else if (entityType === "opportunity") {
            const existing = await tx.select().from(properties).where(inArray2(properties.dedupeKey, keys));
            for (const e of existing) existingByKey.set(String(e.dedupeKey || ""), e);
          } else if (entityType === "contact") {
            const existing = await tx.select().from(contacts).where(inArray2(contacts.dedupeKey, keys));
            for (const e of existing) existingByKey.set(String(e.dedupeKey || ""), e);
          } else {
            const existing = await tx.select().from(buyers).where(inArray2(buyers.dedupeKey, keys));
            for (const e of existing) existingByKey.set(String(e.dedupeKey || ""), e);
          }
        }
        for (const c of candidates) {
          const existing = existingByKey.get(c.key);
          if (!existing) {
            if (!dryRun) {
              if (entityType === "lead") {
                await tx.insert(leads).values({ ...c.data, dedupeKey: c.key });
              } else if (entityType === "opportunity") {
                await tx.insert(properties).values({ ...c.data, dedupeKey: c.key });
              } else if (entityType === "contact") {
                await tx.insert(contacts).values({ ...c.data, dedupeKey: c.key });
              } else {
                await tx.insert(buyers).values({ ...c.data, dedupeKey: c.key });
              }
            }
            createdCount += 1;
            continue;
          }
          if (onDuplicate === "skip") {
            skippedCount += 1;
            continue;
          }
          if (dryRun) {
            updatedCount += 1;
            continue;
          }
          const patch = { dedupeKey: c.key, updatedAt: /* @__PURE__ */ new Date() };
          for (const [k, v] of Object.entries(c.data)) {
            if (k === "createdAt" || k === "updatedAt" || k === "id") continue;
            const incoming = v;
            if (onDuplicate === "overwrite") {
              patch[k] = incoming ?? null;
              continue;
            }
            if (k === "notes") {
              patch.notes = mergeNotes(existing.notes, incoming);
              continue;
            }
            patch[k] = mergeScalar(existing[k], incoming);
          }
          if (entityType === "lead") {
            await tx.update(leads).set(patch).where(eq2(leads.id, existing.id));
          } else if (entityType === "opportunity") {
            await tx.update(properties).set(patch).where(eq2(properties.id, existing.id));
          } else if (entityType === "contact") {
            await tx.update(contacts).set(patch).where(eq2(contacts.id, existing.id));
          } else {
            await tx.update(buyers).set(patch).where(eq2(buyers.id, existing.id));
          }
          updatedCount += 1;
        }
        processedRows += slice.length;
        rowsRun += slice.length;
        batchesRun += 1;
        await tx.update(crmImportJobs).set({
          totalRows: parsed.rows.length,
          processedRows,
          createdCount,
          updatedCount,
          skippedCount,
          errorCount,
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq2(crmImportJobs.id, jobId));
      }
      if (processedRows >= parsed.rows.length) {
        await tx.update(crmImportJobs).set({
          status: "completed",
          totalRows: parsed.rows.length,
          processedRows,
          createdCount,
          updatedCount,
          skippedCount,
          errorCount,
          finishedAt: /* @__PURE__ */ new Date(),
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq2(crmImportJobs.id, jobId));
      }
      const endRows = await tx.select().from(crmImportJobs).where(eq2(crmImportJobs.id, jobId)).limit(1);
      return endRows[0];
    } catch (err) {
      const msg = String(err?.message || err);
      try {
        await tx.insert(crmImportJobErrors).values({
          jobId,
          rowNumber: 0,
          errors: JSON.stringify([{ message: msg }]),
          rawRow: null
        });
      } catch {
      }
      await tx.update(crmImportJobs).set({
        status: "failed",
        finishedAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq2(crmImportJobs.id, jobId));
      console.error(JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), event: "crm_import", kind: "job_failed", jobId, message: msg }));
      const endRows = await tx.select().from(crmImportJobs).where(eq2(crmImportJobs.id, jobId)).limit(1);
      return endRows[0];
    }
  });
  if (!out) return await getImportJob(jobId);
  return out;
}
async function createExportJob(params) {
  const expiresAt = new Date(Date.now() + (params.expiresInMinutes || 60) * 60 * 1e3);
  const token = crypto3.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const result = await db.insert(crmExportFiles).values({
    entityType: params.entityType,
    createdBy: params.createdBy,
    status: "queued",
    format: params.format,
    filters: JSON.stringify(params.filters || {}),
    columns: JSON.stringify(params.columns || []),
    tokenHash,
    expiresAt,
    createdAt: /* @__PURE__ */ new Date(),
    updatedAt: /* @__PURE__ */ new Date()
  }).returning();
  return { job: result[0], token };
}
async function renewExportToken(exportId, expiresInMinutes = 60) {
  const token = crypto3.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1e3);
  const updated = await db.update(crmExportFiles).set({ tokenHash, expiresAt, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(crmExportFiles.id, exportId)).returning();
  return { job: updated[0], token };
}
async function getExportJob(exportId) {
  const rows = await db.select().from(crmExportFiles).where(eq2(crmExportFiles.id, exportId)).limit(1);
  return rows[0];
}
async function processExportJob(exportId, limits = {}) {
  const out = await withAdvisoryLock(2, exportId, async (tx) => {
    const jobRows = await tx.select().from(crmExportFiles).where(eq2(crmExportFiles.id, exportId)).limit(1);
    const job = jobRows[0];
    if (!job) throw new Error("Export job not found");
    const updatedAtMs = toDateMs(job.updatedAt);
    const activeWindowMs = limits.resume ? 5e3 : 9e4;
    const runnable = job.status === "queued" || job.status === "processing" && (updatedAtMs === null || Date.now() - updatedAtMs > activeWindowMs);
    if (!runnable) return job;
    const startedAt = job.startedAt ? new Date(job.startedAt) : /* @__PURE__ */ new Date();
    await tx.update(crmExportFiles).set({ status: "processing", startedAt, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(crmExportFiles.id, exportId));
    try {
      const entityType = job.entityType;
      const format = job.format;
      const filters = JSON.parse(String(job.filters || "{}"));
      const columns = JSON.parse(String(job.columns || "[]"));
      const createdFrom = filters.createdFrom ? new Date(filters.createdFrom) : null;
      const createdTo = filters.createdTo ? new Date(filters.createdTo) : null;
      const status = filters.status ? String(filters.status) : null;
      const assignedTo = typeof filters.assignedTo === "number" ? filters.assignedTo : null;
      const ids = Array.isArray(filters.ids) ? filters.ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0) : null;
      const table = entityType === "lead" ? leads : entityType === "opportunity" ? properties : entityType === "contact" ? contacts : buyers;
      const where = [];
      if (createdFrom) where.push(gte2(table.createdAt, createdFrom));
      if (createdTo) where.push(lte2(table.createdAt, createdTo));
      if (status && (entityType === "lead" || entityType === "opportunity" || entityType === "buyer")) where.push(eq2(table.status, status));
      if (assignedTo !== null && (entityType === "lead" || entityType === "opportunity")) where.push(eq2(table.assignedTo, assignedTo));
      if (ids && ids.length) where.push(inArray2(table.id, ids));
      const rows = where.length ? await tx.select().from(table).where(and2(...where)) : await tx.select().from(table);
      const safeColumns = columns.length ? columns : Object.keys(rows[0] || {}).filter((k) => k !== "dedupeKey");
      const serializeCell = (value) => {
        if (value === null || value === void 0) return "";
        if (value instanceof Date) return value.toISOString();
        if (Array.isArray(value)) return value.join(", ");
        if (typeof value === "boolean") return value ? "true" : "false";
        return value;
      };
      const records = rows.map((r) => {
        const out2 = {};
        for (const c of safeColumns) out2[c] = serializeCell(r[c]);
        return out2;
      });
      const filename = `${entityType}-export-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.${format}`;
      const mimeType = format === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      let contentBase64 = "";
      if (format === "csv") {
        const { stringify } = await import("csv-stringify/sync");
        const csv = stringify(records, { header: true, columns: safeColumns });
        contentBase64 = Buffer.from(csv, "utf8").toString("base64");
      } else {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet("Export");
        ws.addRow(safeColumns);
        for (const r of records) ws.addRow(safeColumns.map((c) => r[c] ?? ""));
        const b = await wb.xlsx.writeBuffer();
        const buf = Buffer.isBuffer(b) ? b : Buffer.from(b);
        contentBase64 = buf.toString("base64");
      }
      await tx.update(crmExportFiles).set({
        status: "completed",
        filename,
        mimeType,
        contentBase64,
        finishedAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq2(crmExportFiles.id, exportId));
      const endRows = await tx.select().from(crmExportFiles).where(eq2(crmExportFiles.id, exportId)).limit(1);
      return endRows[0];
    } catch (err) {
      const msg = String(err?.message || err);
      await tx.update(crmExportFiles).set({ status: "failed", finishedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }).where(eq2(crmExportFiles.id, exportId));
      console.error(JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), event: "crm_export", kind: "job_failed", jobId: exportId, message: msg }));
      const endRows = await tx.select().from(crmExportFiles).where(eq2(crmExportFiles.id, exportId)).limit(1);
      return endRows[0];
    }
  });
  if (!out) return await getExportJob(exportId);
  return out;
}
function verifyExportToken(job, token) {
  if (!job.tokenHash || !token) return false;
  if (job.expiresAt) {
    const expiresAt = job.expiresAt instanceof Date ? job.expiresAt : new Date(job.expiresAt);
    const t = expiresAt.getTime();
    if (Number.isFinite(t) && t < Date.now()) return false;
  }
  return hashToken(token) === job.tokenHash;
}

// server/routes.ts
import { z as z4 } from "zod";

// shared/underwriting.ts
import { z as z3 } from "zod";
var underwritingCompSchema = z3.object({
  id: z3.string().min(1),
  address: z3.string().min(1),
  url: z3.string().url().optional().nullable(),
  distanceMi: z3.number().finite().nonnegative().optional().nullable(),
  domDays: z3.number().finite().nonnegative().optional().nullable(),
  soldPrice: z3.number().finite().nonnegative().optional().nullable(),
  sqft: z3.number().finite().nonnegative().optional().nullable(),
  beds: z3.number().finite().nonnegative().optional().nullable(),
  baths: z3.number().finite().nonnegative().optional().nullable(),
  included: z3.boolean().default(true),
  primary: z3.boolean().default(false),
  createdAt: z3.string().min(1)
});
var underwritingRepairCategorySchema = z3.object({
  key: z3.string().min(1),
  label: z3.string().min(1),
  level: z3.enum(["low", "med", "high", "custom"]).default("med"),
  estimate: z3.number().finite().nonnegative().optional().nullable()
});
var underwritingRepairSchema = z3.object({
  mode: z3.enum(["lite", "detailed"]).default("lite"),
  liteEstimate: z3.number().finite().nonnegative().optional().nullable(),
  categories: z3.array(underwritingRepairCategorySchema).default([])
});
var underwritingNotesSchema = z3.object({
  sellerSaid: z3.array(z3.string().min(1)).default([]),
  buyerFeedback: z3.array(z3.string().min(1)).default([]),
  inspection: z3.array(z3.string().min(1)).default([]),
  risks: z3.array(z3.string().min(1)).default([])
});
var underwritingAssumptionsSchema = z3.object({
  closingHoldingPct: z3.number().finite().nonnegative().max(50).default(10),
  targetProfitMode: z3.enum(["pct_arv", "flat"]).default("pct_arv"),
  targetProfitValue: z3.number().finite().nonnegative().default(10),
  assignmentFeeMode: z3.enum(["flat", "pct_arv"]).default("flat"),
  assignmentFeeValue: z3.number().finite().nonnegative().default(1e4),
  targetDiscountPctOverride: z3.number().finite().nonnegative().max(100).optional().nullable(),
  offerAggression: z3.enum(["conservative", "balanced", "aggressive"]).default("balanced")
});
var underwritingFinancingSchema = z3.object({
  loanType: z3.enum(["cash", "hard_money", "conventional"]).default("cash"),
  interestPctAnnual: z3.number().finite().nonnegative().max(100).default(12),
  pointsPct: z3.number().finite().nonnegative().max(20).default(2),
  loanToCostPct: z3.number().finite().nonnegative().max(100).default(90),
  downPaymentPct: z3.number().finite().nonnegative().max(100).default(20),
  termYears: z3.number().finite().nonnegative().max(40).default(30),
  lenderFeesFlat: z3.number().finite().nonnegative().default(0),
  includeRepairsInLoan: z3.boolean().default(true)
});
var underwritingHoldCostsSchema = z3.object({
  monthsHeld: z3.number().finite().nonnegative().max(60).default(4),
  taxesPerMonth: z3.number().finite().nonnegative().default(0),
  insurancePerMonth: z3.number().finite().nonnegative().default(0),
  utilitiesPerMonth: z3.number().finite().nonnegative().default(0),
  hoaPerMonth: z3.number().finite().nonnegative().default(0),
  miscPerMonth: z3.number().finite().nonnegative().default(0)
});
var underwritingSaleCostsSchema = z3.object({
  realtorPct: z3.number().finite().nonnegative().max(20).default(6),
  closingCostPct: z3.number().finite().nonnegative().max(20).default(2),
  miscFlat: z3.number().finite().nonnegative().default(0)
});
var underwritingCostsSchema = z3.object({
  purchaseClosingFlat: z3.number().finite().nonnegative().default(0),
  marketingFlat: z3.number().finite().nonnegative().default(0)
});
var underwritingRentalSchema = z3.object({
  rentPerMonth: z3.number().finite().nonnegative().optional().nullable(),
  otherIncomePerMonth: z3.number().finite().nonnegative().default(0),
  vacancyPct: z3.number().finite().nonnegative().max(50).default(5),
  managementPct: z3.number().finite().nonnegative().max(50).default(10),
  maintenancePct: z3.number().finite().nonnegative().max(50).default(8),
  capexPct: z3.number().finite().nonnegative().max(50).default(5)
});
var underwritingSnapshotSchema = z3.object({
  occupancy: z3.enum(["vacant", "occupied"]).optional().nullable(),
  strategy: z3.enum(["wholesale", "wholetail", "flip", "rental"]).optional().nullable(),
  sellerMotivation: z3.enum(["high", "medium", "low"]).optional().nullable(),
  condition: z3.enum(["turnkey", "light_cosmetic", "medium_rehab", "heavy_rehab", "teardown"]).optional().nullable(),
  timeline: z3.enum(["0_7", "7_30", "30_60", "60_plus"]).optional().nullable()
});
var underwritingArvSchema = z3.object({
  value: z3.number().finite().nonnegative().optional().nullable(),
  rangeLow: z3.number().finite().nonnegative().optional().nullable(),
  rangeHigh: z3.number().finite().nonnegative().optional().nullable(),
  method: z3.enum(["manual", "comps"]).default("manual")
});
var underwritingDealMathSchema = z3.object({
  mao: z3.number().finite().optional().nullable(),
  offerMin: z3.number().finite().optional().nullable(),
  offerMax: z3.number().finite().optional().nullable(),
  offerTarget: z3.number().finite().optional().nullable(),
  lineItemMao: z3.number().finite().optional().nullable(),
  discountMao: z3.number().finite().optional().nullable(),
  assignmentFee: z3.number().finite().optional().nullable(),
  projectedSpread: z3.number().finite().optional().nullable(),
  meetsCriteria: z3.boolean().default(false)
});
var underwritingOutputsSchema = z3.object({
  allInCost: z3.number().finite().optional().nullable(),
  profit: z3.number().finite().optional().nullable(),
  profitMarginPct: z3.number().finite().optional().nullable(),
  cashToClose: z3.number().finite().optional().nullable(),
  cashInvested: z3.number().finite().optional().nullable(),
  roiPct: z3.number().finite().optional().nullable(),
  noiMonthly: z3.number().finite().optional().nullable(),
  noiAnnual: z3.number().finite().optional().nullable(),
  capRatePct: z3.number().finite().optional().nullable(),
  debtServiceMonthly: z3.number().finite().optional().nullable(),
  dscr: z3.number().finite().optional().nullable(),
  cashflowAnnual: z3.number().finite().optional().nullable(),
  cashOnCashPct: z3.number().finite().optional().nullable()
});
var underwritingScenarioSchema = z3.object({
  id: z3.string().min(1),
  name: z3.string().min(1),
  createdAt: z3.string().min(1),
  strategy: z3.enum(["wholesale", "wholetail", "flip", "rental"]).optional().nullable(),
  arv: z3.number().finite().nonnegative(),
  repairs: z3.number().finite().nonnegative(),
  monthsHeld: z3.number().finite().nonnegative(),
  offerTarget: z3.number().finite().optional().nullable(),
  dealMath: underwritingDealMathSchema,
  outputs: underwritingOutputsSchema
});
var underwritingSchemaV1 = z3.object({
  version: z3.literal(1),
  templateId: z3.string().optional().nullable(),
  snapshot: underwritingSnapshotSchema.default({}),
  arv: underwritingArvSchema.default({ method: "manual" }),
  comps: z3.array(underwritingCompSchema).default([]),
  repairs: underwritingRepairSchema.default({ mode: "lite", categories: [] }),
  assumptions: underwritingAssumptionsSchema.default({}),
  financing: underwritingFinancingSchema.default({}),
  holdCosts: underwritingHoldCostsSchema.default({}),
  saleCosts: underwritingSaleCostsSchema.default({}),
  costs: underwritingCostsSchema.default({}),
  dealMath: underwritingDealMathSchema.default({ meetsCriteria: false }),
  outputs: underwritingOutputsSchema.default({}),
  rental: underwritingRentalSchema.default({}),
  scenarios: z3.array(underwritingScenarioSchema).default([]),
  notes: underwritingNotesSchema.default({}),
  updatedAt: z3.string().min(1)
});
function safeNumber(n) {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  if (typeof n === "string") {
    const v = parseFloat(n);
    return Number.isFinite(v) ? v : null;
  }
  return null;
}
function computeCompPricePerSqft(comp) {
  const p = safeNumber(comp.soldPrice);
  const s = safeNumber(comp.sqft);
  if (!p || !s || s <= 0) return null;
  return p / s;
}
function computeArvFromComps(input) {
  const included = input.comps.filter((c) => c.included);
  const primary = included.filter((c) => c.primary);
  const pool2 = primary.length ? primary : included;
  if (!pool2.length) return { low: null, high: null, value: null };
  const prices = [];
  const ppsf = [];
  for (const c of pool2) {
    const sp = safeNumber(c.soldPrice);
    if (sp) prices.push(sp);
    const v = computeCompPricePerSqft(c);
    if (v) ppsf.push(v);
  }
  const subjectSqft = safeNumber(input.subjectSqft);
  const fromPpsf = subjectSqft && ppsf.length ? ppsf.map((x) => x * subjectSqft) : [];
  const all = [...prices, ...fromPpsf].filter((x) => Number.isFinite(x) && x > 0);
  if (!all.length) return { low: null, high: null, value: null };
  all.sort((a, b) => a - b);
  const low = all[Math.floor(all.length * 0.2)];
  const high = all[Math.floor(all.length * 0.8)];
  const mid = all[Math.floor(all.length * 0.5)];
  return { low, high, value: mid };
}
function computeRepairTotal(repairs) {
  if (repairs.mode === "lite") return safeNumber(repairs.liteEstimate) || 0;
  return repairs.categories.reduce((sum, c) => sum + (safeNumber(c.estimate) || 0), 0);
}
function computeDealMath(input) {
  const closingHolding = input.assumptions.closingHoldingPct / 100 * input.arv;
  const targetProfit = input.assumptions.targetProfitMode === "flat" ? input.assumptions.targetProfitValue : input.assumptions.targetProfitValue / 100 * input.arv;
  const assignmentFee = input.assumptions.assignmentFeeMode === "flat" ? input.assumptions.assignmentFeeValue : input.assumptions.assignmentFeeValue / 100 * input.arv;
  const strategy = input.strategy || "wholesale";
  const hold = input.holdCosts ? underwritingHoldCostsSchema.parse(input.holdCosts) : underwritingHoldCostsSchema.parse({});
  const sale = input.saleCosts ? underwritingSaleCostsSchema.parse(input.saleCosts) : underwritingSaleCostsSchema.parse({});
  const costs = input.costs ? underwritingCostsSchema.parse(input.costs) : underwritingCostsSchema.parse({});
  const fin = input.financing ? underwritingFinancingSchema.parse(input.financing) : underwritingFinancingSchema.parse({});
  const holdMonthly = hold.taxesPerMonth + hold.insurancePerMonth + hold.utilitiesPerMonth + hold.hoaPerMonth + hold.miscPerMonth;
  const holdTotal = holdMonthly * hold.monthsHeld;
  const salePct = (sale.realtorPct + sale.closingCostPct) / 100;
  const saleTotal = input.arv * salePct + sale.miscFlat;
  const assignmentCost = strategy === "wholesale" ? assignmentFee : 0;
  const baseNoFin = input.arv - input.repairs - closingHolding - targetProfit - assignmentCost - holdTotal - saleTotal - costs.purchaseClosingFlat - costs.marketingFlat;
  const months = hold.monthsHeld;
  const kInterestOnly = fin.pointsPct / 100 + fin.interestPctAnnual / 100 * (months / 12);
  const paymentFactor = fin.loanType === "conventional" ? amortizingMonthlyPaymentFactor(fin.interestPctAnnual, fin.termYears * 12) * months : kInterestOnly;
  const { loanCoeffPurchase, loanCoeffRepairs, feesFlat } = (() => {
    if (fin.loanType === "hard_money") {
      const ltc = fin.loanToCostPct / 100;
      return { loanCoeffPurchase: ltc * paymentFactor, loanCoeffRepairs: (fin.includeRepairsInLoan ? ltc : 0) * paymentFactor, feesFlat: fin.lenderFeesFlat };
    }
    if (fin.loanType === "conventional") {
      const loanPct = 1 - fin.downPaymentPct / 100;
      return { loanCoeffPurchase: loanPct * paymentFactor, loanCoeffRepairs: 0, feesFlat: fin.lenderFeesFlat };
    }
    return { loanCoeffPurchase: 0, loanCoeffRepairs: 0, feesFlat: 0 };
  })();
  const denom = 1 + loanCoeffPurchase;
  const lineItemMaoRaw = denom > 0 ? (baseNoFin - feesFlat - loanCoeffRepairs * input.repairs) / denom : baseNoFin;
  const lineItemMao = Number.isFinite(lineItemMaoRaw) ? lineItemMaoRaw : baseNoFin;
  const discountMao = typeof input.targetDiscountPct === "number" && Number.isFinite(input.targetDiscountPct) ? input.arv * (1 - input.targetDiscountPct / 100) - input.repairs : null;
  const mao = discountMao !== null ? Math.min(lineItemMao, discountMao) : lineItemMao;
  const spread = assignmentFee;
  const aggression = input.assumptions.offerAggression;
  const wiggle = aggression === "conservative" ? 0.04 : aggression === "aggressive" ? 0.01 : 0.025;
  const offerMin = mao * (1 - wiggle);
  const offerMax = mao * (1 + wiggle);
  const meetsCriteria = mao > 0 && offerMax > 0;
  return {
    mao,
    offerMin,
    offerMax,
    lineItemMao,
    discountMao,
    assignmentFee,
    projectedSpread: spread,
    meetsCriteria
  };
}
function amortizingMonthlyPaymentFactor(annualRatePct, termMonths) {
  const n = Math.max(1, Math.round(termMonths));
  const r = annualRatePct > 0 ? annualRatePct / 100 / 12 : 0;
  if (r === 0) return 1 / n;
  const pow = Math.pow(1 + r, n);
  return r * pow / (pow - 1);
}
var underwritingTemplateConfigSchema = z3.object({
  targetDiscountPct: z3.number().finite().nonnegative().max(100).default(30),
  closingHoldingPct: z3.number().finite().nonnegative().max(50).default(10),
  defaultAssignmentFee: z3.number().finite().nonnegative().default(1e4),
  repairLitePresets: z3.object({
    low: z3.number().finite().nonnegative().default(5e3),
    med: z3.number().finite().nonnegative().default(15e3),
    high: z3.number().finite().nonnegative().default(3e4),
    heavy: z3.number().finite().nonnegative().default(5e4)
  }).default({ low: 5e3, med: 15e3, high: 3e4, heavy: 5e4 }),
  typicalRepairByCondition: z3.object({
    turnkey: z3.number().finite().nonnegative().default(5e3),
    light_cosmetic: z3.number().finite().nonnegative().default(15e3),
    medium_rehab: z3.number().finite().nonnegative().default(3e4),
    heavy_rehab: z3.number().finite().nonnegative().default(5e4),
    teardown: z3.number().finite().nonnegative().default(8e4)
  }).default({
    turnkey: 5e3,
    light_cosmetic: 15e3,
    medium_rehab: 3e4,
    heavy_rehab: 5e4,
    teardown: 8e4
  })
});

// server/services/skipTrace/provider.ts
import crypto4 from "node:crypto";

// server/services/skipTrace/enformiongo.ts
function requireEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`${name} is not configured`);
  return String(v).trim();
}
function parseCostCents() {
  const raw = process.env.ENFORMION_COST_CENTS;
  const n = raw === void 0 ? NaN : Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}
function splitName(full) {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", middleName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0] || "", middleName: "", lastName: "" };
  if (parts.length === 2) return { firstName: parts[0] || "", middleName: "", lastName: parts[1] || "" };
  return { firstName: parts[0] || "", middleName: parts.slice(1, -1).join(" "), lastName: parts[parts.length - 1] || "" };
}
function walkLeaves(node, path3, out) {
  if (node === null || node === void 0) return;
  if (typeof node !== "object") {
    out.push({ path: path3, value: node });
    return;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) walkLeaves(node[i], [...path3, String(i)], out);
    return;
  }
  for (const [k, v] of Object.entries(node)) walkLeaves(v, [...path3, k], out);
}
function uniq(arr) {
  return Array.from(new Set(arr));
}
function normalizeEmail(s) {
  return s.trim().toLowerCase();
}
function normalizePhone(raw) {
  const s = raw.trim();
  if (!s) return null;
  if (s.startsWith("+")) {
    const digits2 = "+" + s.slice(1).replace(/\D/g, "");
    return digits2.length >= 11 ? digits2 : null;
  }
  const digits = s.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 12 && digits.length <= 15) return `+${digits}`;
  return null;
}
function extractFromResponse(data) {
  const leaves = [];
  walkLeaves(data, [], leaves);
  const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const emailsFromEmailKeys = leaves.filter((l) => l.path.some((p) => /email/i.test(p)) && typeof l.value === "string").flatMap((l) => String(l.value).match(emailRe) || []).map(normalizeEmail);
  const emailsFallback = leaves.filter((l) => typeof l.value === "string").flatMap((l) => String(l.value).match(emailRe) || []).map(normalizeEmail);
  const emails = uniq((emailsFromEmailKeys.length ? emailsFromEmailKeys : emailsFallback).filter(Boolean)).slice(0, 10);
  const phoneish = leaves.filter((l) => l.path.some((p) => /phone|mobile|cell/i.test(p)) && typeof l.value === "string").map((l) => String(l.value));
  const phoneishFallback = leaves.filter((l) => typeof l.value === "string").map((l) => String(l.value)).filter((s) => /\d{3}.*\d{3}.*\d{4}/.test(s));
  const phoneCandidates = phoneish.length ? phoneish : phoneishFallback;
  const phones = uniq(phoneCandidates.map(normalizePhone).filter((p) => !!p)).slice(0, 10);
  return { emails, phones };
}
var EnformionGOSkipTraceProvider = class {
  name = "enformiongo";
  async skipTrace(input) {
    const baseUrl = String(process.env.ENFORMION_API_BASE_URL || "https://devapi.enformion.com").trim().replace(/\/+$/, "");
    const apName = requireEnv("ENFORMION_AP_NAME");
    const apPassword = requireEnv("ENFORMION_AP_PASSWORD");
    const ownerName = String(input.ownerName || "").trim();
    const address = String(input.address || "").trim();
    const city = String(input.city || "").trim();
    const state = String(input.state || "").trim();
    const zipCode = String(input.zipCode || "").trim();
    const { firstName, middleName, lastName } = splitName(ownerName);
    const addressLine2 = [city, state, zipCode].filter(Boolean).join(", ").replace(/,\s*,/g, ",").trim();
    const body = {
      FirstName: firstName || void 0,
      MiddleName: middleName || void 0,
      LastName: lastName || void 0,
      Address: {
        addressLine1: address || void 0,
        addressLine2: addressLine2 || void 0
      },
      Phone: "",
      Email: ""
    };
    const res = await fetch(`${baseUrl}/Contact/Enrich`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "galaxy-ap-name": apName,
        "galaxy-ap-password": apPassword,
        "galaxy-search-type": "DevAPIContactEnrich"
      },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    const costCents = parseCostCents();
    if (!res.ok) {
      const msg = typeof data?.message === "string" ? data.message : "Request failed";
      return { status: "fail", phones: [], emails: [], costCents, raw: data, errorMessage: msg };
    }
    const extracted = extractFromResponse(data);
    if (!extracted.phones.length && !extracted.emails.length) {
      return { status: "fail", phones: [], emails: [], costCents, raw: data, errorMessage: "No hits found" };
    }
    return { status: "success", phones: extracted.phones, emails: extracted.emails, costCents, raw: data };
  }
};

// server/services/skipTrace/provider.ts
function parseMissRate(v) {
  const n = typeof v === "string" || typeof v === "number" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
function stableHash(input) {
  return crypto4.createHash("sha256").update(input).digest("hex");
}
function pickDigit(hex, index) {
  const c = hex[index % hex.length] || "0";
  const n = parseInt(c, 16);
  return Number.isFinite(n) ? n : 0;
}
var MockSkipTraceProvider = class {
  name = "mock";
  missRate = parseMissRate(process.env.SKIP_TRACE_MOCK_MISS_RATE);
  async skipTrace(input) {
    const key = `${input.ownerName}|${input.address}|${input.city}|${input.state}|${input.zipCode}`.toLowerCase().trim();
    const h = stableHash(key);
    const r = pickDigit(h, 0) / 15;
    const costCents = 99;
    if (r < this.missRate) {
      return {
        status: "fail",
        phones: [],
        emails: [],
        costCents,
        raw: { provider: this.name, missRate: this.missRate },
        errorMessage: "No hits found"
      };
    }
    const area = 200 + pickDigit(h, 3) * 10 + pickDigit(h, 4);
    const exchange = 200 + pickDigit(h, 5) * 10 + pickDigit(h, 6);
    const line = 1e3 + pickDigit(h, 7) * 100 + pickDigit(h, 8) * 10 + pickDigit(h, 9);
    const phone = `+1${area}${exchange}${line}`;
    const last = (input.ownerName.split(/\s+/).pop() || "owner").replace(/[^a-z0-9]/gi, "").toLowerCase();
    const zip = input.zipCode.replace(/\D/g, "").slice(0, 5) || "00000";
    const email = `${last}.${zip}@example.com`;
    return {
      status: "success",
      phones: [phone],
      emails: [email],
      costCents,
      raw: { provider: this.name, hash: h }
    };
  }
};
function getSkipTraceProvider() {
  const v = String(process.env.SKIP_TRACE_PROVIDER || "mock").trim().toLowerCase();
  if (v === "mock") return new MockSkipTraceProvider();
  if (v === "enformiongo" || v === "enformiongo" || v === "enformion") return new EnformionGOSkipTraceProvider();
  return new MockSkipTraceProvider();
}

// server/services/leadScoring/engine.ts
var LEAD_SCORING_WEIGHTS = {
  motivationScale: 0.45,
  absentee: 30,
  yearsOwned10Plus: 25,
  yearsOwned5Plus: 15,
  yearsOwned2Plus: 5,
  probate: 15,
  preForeclosure: 20,
  taxDelinquent: 15,
  vacancy: 10,
  hasPhone: 5,
  hasEmail: 5
};
var LEAD_SCORING_CONFIDENCE_WEIGHTS = {
  motivationScore: 0.35,
  absentee: 0.2,
  yearsOwned: 0.2,
  distress: 0.15,
  contact: 0.1
};
function clamp(n, min, max) {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
function toFiniteNumber(v) {
  if (typeof v !== "number") return null;
  if (!Number.isFinite(v)) return null;
  return v;
}
function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}
function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.map((t) => String(t || "").trim().toLowerCase()).filter(Boolean);
}
function detectDistressFromTags(tags) {
  const set = new Set(tags);
  const has2 = (k) => set.has(k) || tags.some((t) => t.includes(k));
  return {
    probate: has2("probate"),
    preForeclosure: has2("pre-foreclosure") || has2("preforeclosure") || has2("foreclosure"),
    taxDelinquent: has2("tax delinquent") || has2("tax-delinquent") || has2("tax"),
    vacancy: has2("vacant") || has2("vacancy")
  };
}
function computeLeadScore(input, options = {}) {
  const now = options.now ?? /* @__PURE__ */ new Date();
  const weights = { ...LEAD_SCORING_WEIGHTS, ...options.weights || {} };
  const confW = { ...LEAD_SCORING_CONFIDENCE_WEIGHTS, ...options.confidenceWeights || {} };
  const tags = normalizeTags(input.tags);
  const distressFromTags = detectDistressFromTags(tags);
  const distress = {
    probate: input.distress?.probate ?? distressFromTags.probate,
    preForeclosure: input.distress?.preForeclosure ?? distressFromTags.preForeclosure,
    taxDelinquent: input.distress?.taxDelinquent ?? distressFromTags.taxDelinquent,
    vacancy: input.distress?.vacancy ?? distressFromTags.vacancy
  };
  const motivationScoreRaw = toFiniteNumber(input.motivationScore);
  const motivationScore = motivationScoreRaw === null ? null : clamp(motivationScoreRaw, 0, 100);
  const isAbsentee = input.isAbsentee === null || input.isAbsentee === void 0 ? null : !!input.isAbsentee;
  const yearsOwnedRaw = toFiniteNumber(input.yearsOwned);
  const yearsOwned = yearsOwnedRaw === null ? null : clamp(yearsOwnedRaw, 0, 1e3);
  const hasPhone = input.hasPhone === null || input.hasPhone === void 0 ? null : !!input.hasPhone;
  const hasEmail = input.hasEmail === null || input.hasEmail === void 0 ? null : !!input.hasEmail;
  const nextTouchAt = parseDate(input.nextTouchAt);
  const factors = [];
  let score = 0;
  let urgency = 0;
  let confidenceEvidence = 0;
  const confidenceTotal = confW.motivationScore + confW.absentee + confW.yearsOwned + confW.distress + confW.contact;
  if (motivationScore !== null) {
    const points = clamp(Math.round(motivationScore * weights.motivationScale), 0, 100);
    score += points;
    if (motivationScore >= 80) urgency += 40;
    else if (motivationScore >= 60) urgency += 25;
    else if (motivationScore >= 40) urgency += 10;
    confidenceEvidence += confW.motivationScore;
    factors.push({
      key: "motivation_score",
      label: "Motivation score",
      weight: weights.motivationScale,
      value: motivationScore,
      points,
      confidenceWeight: confW.motivationScore,
      urgencyPoints: motivationScore >= 80 ? 40 : motivationScore >= 60 ? 25 : motivationScore >= 40 ? 10 : 0
    });
  }
  if (isAbsentee !== null) {
    const points = isAbsentee ? weights.absentee : 0;
    score += points;
    if (isAbsentee) urgency += 10;
    confidenceEvidence += confW.absentee;
    factors.push({
      key: "absentee_owner",
      label: "Absentee owner",
      weight: weights.absentee,
      value: isAbsentee,
      points,
      confidenceWeight: confW.absentee,
      urgencyPoints: isAbsentee ? 10 : 0
    });
  }
  if (yearsOwned !== null) {
    let points = 0;
    if (yearsOwned >= 10) points = weights.yearsOwned10Plus;
    else if (yearsOwned >= 5) points = weights.yearsOwned5Plus;
    else if (yearsOwned >= 2) points = weights.yearsOwned2Plus;
    score += points;
    if (yearsOwned >= 10) urgency += 10;
    confidenceEvidence += confW.yearsOwned;
    factors.push({
      key: "years_owned",
      label: "Years owned",
      weight: yearsOwned,
      value: yearsOwned,
      points,
      confidenceWeight: confW.yearsOwned,
      urgencyPoints: yearsOwned >= 10 ? 10 : 0
    });
  }
  const distressSignals = [
    { key: "probate", label: "Probate", enabled: !!distress.probate, points: weights.probate, urgency: 20 },
    { key: "pre_foreclosure", label: "Pre-foreclosure", enabled: !!distress.preForeclosure, points: weights.preForeclosure, urgency: 30 },
    { key: "tax_delinquent", label: "Tax delinquent", enabled: !!distress.taxDelinquent, points: weights.taxDelinquent, urgency: 15 },
    { key: "vacancy", label: "Vacancy", enabled: !!distress.vacancy, points: weights.vacancy, urgency: 15 }
  ];
  const distressKnown = input.distress?.probate !== void 0 || input.distress?.preForeclosure !== void 0 || input.distress?.taxDelinquent !== void 0 || input.distress?.vacancy !== void 0 || tags.length > 0;
  if (distressKnown) confidenceEvidence += confW.distress;
  for (const s of distressSignals) {
    if (!s.enabled) continue;
    score += s.points;
    urgency += s.urgency;
    factors.push({
      key: s.key,
      label: s.label,
      weight: s.points,
      value: true,
      points: s.points,
      confidenceWeight: 0,
      urgencyPoints: s.urgency
    });
  }
  const contactKnown = hasPhone !== null || hasEmail !== null;
  if (contactKnown) confidenceEvidence += confW.contact;
  if (hasPhone !== null) {
    const points = hasPhone ? weights.hasPhone : 0;
    score += points;
    factors.push({
      key: "has_phone",
      label: "Has phone",
      weight: weights.hasPhone,
      value: hasPhone,
      points,
      confidenceWeight: 0,
      urgencyPoints: 0
    });
  }
  if (hasEmail !== null) {
    const points = hasEmail ? weights.hasEmail : 0;
    score += points;
    factors.push({
      key: "has_email",
      label: "Has email",
      weight: weights.hasEmail,
      value: hasEmail,
      points,
      confidenceWeight: 0,
      urgencyPoints: 0
    });
  }
  if (nextTouchAt) {
    const deltaMs = nextTouchAt.getTime() - now.getTime();
    const deltaHours = deltaMs / 36e5;
    let urgencyPoints = 0;
    if (deltaHours <= 0) urgencyPoints = 40;
    else if (deltaHours <= 24) urgencyPoints = 25;
    else if (deltaHours <= 72) urgencyPoints = 15;
    urgency += urgencyPoints;
    factors.push({
      key: "next_touch_at",
      label: "Next touch time",
      weight: 0,
      value: nextTouchAt.toISOString(),
      points: 0,
      confidenceWeight: 0,
      urgencyPoints
    });
  }
  score = clamp(score, 0, 100);
  urgency = clamp(urgency, 0, 100);
  const confidence = confidenceTotal <= 0 ? 0 : clamp(0.2 + 0.8 * (confidenceEvidence / confidenceTotal), 0, 1);
  const reasons = factors.filter((f) => f.points > 0).map((f) => ({ key: f.key, label: f.label, points: f.points })).sort((a, b) => b.points - a.points || a.key.localeCompare(b.key));
  return {
    score: Math.round(score),
    confidence: Math.round(confidence * 100) / 100,
    urgency: Math.round(urgency),
    reasons,
    factorsJson: factors
  };
}

// server/services/skipTrace/publicResearch/runner.ts
function parseEnvBool(v) {
  if (v === void 0 || v === null) return null;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
  if (s === "0" || s === "false" || s === "no" || s === "off") return false;
  return null;
}
var DefaultPublicResearchRunner = class {
  name = "default";
  enabled = parseEnvBool(process.env.SKIP_TRACE_PUBLIC_RESEARCH_ENABLED) ?? false;
  async run(_input) {
    if (!this.enabled) {
      return {
        status: "disabled",
        evidence: [],
        message: "Public research is disabled",
        raw: { env: "SKIP_TRACE_PUBLIC_RESEARCH_ENABLED" }
      };
    }
    return {
      status: "success",
      evidence: [
        {
          sourceType: "other",
          sourceUrl: null,
          extracted: {},
          confidence: {},
          notes: "Public research runner is enabled but no sources are configured",
          screenshotRef: null
        }
      ],
      message: "Public research runner produced placeholder evidence",
      raw: { runner: "default" }
    };
  }
};
function getPublicResearchRunner() {
  return new DefaultPublicResearchRunner();
}

// server/services/skipTrace/orchestrator.ts
var HttpError = class extends Error {
  statusCode;
  constructor(input) {
    super(input.message);
    this.statusCode = input.statusCode;
  }
};
function skipTraceCacheKey(input) {
  return `${input.ownerName}|${input.address}|${input.city}|${input.state}|${input.zipCode}`.trim().toLowerCase();
}
function toFiniteInt(v) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}
function clamp2(n, min, max) {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
function confidenceBucket(v) {
  if (v >= 0.75) return "high";
  if (v >= 0.45) return "medium";
  return "low";
}
function urgencyTier(score) {
  if (score >= 75) return "hot";
  if (score >= 45) return "warm";
  return "cold";
}
function summarizeReasons(reasons) {
  const parts = reasons.slice(0, 4).map((r) => `${r.label} (+${r.points})`);
  const s = parts.join("; ");
  return s.length > 400 ? s.slice(0, 397) + "..." : s;
}
function safeParseJsonArrayCount(v) {
  try {
    const parsed = JSON.parse(String(v || "[]"));
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}
async function addJobEvent(jobId, status, message, metadataJson = {}) {
  await storage.createSkipTraceJobEvent({
    jobId,
    status,
    message,
    metadataJson
  });
}
async function loadEntity(input) {
  if (input.entityType === "lead") {
    const lead = await storage.getLeadById(input.entityId);
    if (!lead) throw new HttpError({ statusCode: 404, message: "Lead not found" });
    return { lead, property: null, sourceLead: null };
  }
  const property = await storage.getPropertyById(input.entityId);
  if (!property) throw new HttpError({ statusCode: 404, message: "Opportunity not found" });
  let sourceLead = null;
  const sourceLeadId = property.sourceLeadId ? Number(property.sourceLeadId) : null;
  if (sourceLeadId) {
    try {
      sourceLead = await storage.getLeadById(sourceLeadId) ?? null;
    } catch {
      sourceLead = null;
    }
  }
  return { lead: null, property, sourceLead };
}
function requireProviderInput(input) {
  if (input.entityType === "lead") {
    const lead = input.lead;
    const ownerName2 = String(lead?.ownerName || "").trim();
    const address2 = String(lead?.address || "").trim();
    const city2 = String(lead?.city || "").trim();
    const state2 = String(lead?.state || "").trim();
    const zipCode2 = String(lead?.zipCode || "").trim();
    if (!ownerName2 || !address2 || !city2 || !state2 || !zipCode2) throw new HttpError({ statusCode: 400, message: "Lead is missing required fields" });
    return { ownerName: ownerName2, address: address2, city: city2, state: state2, zipCode: zipCode2 };
  }
  const property = input.property;
  const ownerName = String(input.sourceLead?.ownerName ?? input.ownerNameOverride ?? "").trim();
  const address = String(property?.address || "").trim();
  const city = String(property?.city || "").trim();
  const state = String(property?.state || "").trim();
  const zipCode = String(property?.zipCode || "").trim();
  if (!ownerName || !address || !city || !state || !zipCode) throw new HttpError({ statusCode: 400, message: "Opportunity is missing required fields" });
  return { ownerName, address, city, state, zipCode };
}
async function createSkipTraceJob(input) {
  const job = await storage.createSkipTraceJob({
    entityType: input.entityType,
    entityId: input.entityId,
    requestedByUserId: input.requestedByUserId,
    mode: input.mode,
    status: "queued",
    idempotencyKey: input.idempotencyKey ?? null
  });
  await addJobEvent(job.id, "queued", null, { mode: input.mode });
  return job;
}
async function persistLeadScoreSnapshot(input) {
  const lead = input.entityType === "lead" ? input.lead : input.sourceLead;
  const leadAny = lead;
  const tags = Array.isArray(leadAny?.tags) ? leadAny.tags.filter(Boolean) : [];
  const hasPhone = Boolean(String(leadAny?.ownerPhone || "").trim()) || (input.providerResult ? safeParseJsonArrayCount(input.providerResult.phonesJson) > 0 : false);
  const hasEmail = Boolean(String(leadAny?.ownerEmail || "").trim()) || (input.providerResult ? safeParseJsonArrayCount(input.providerResult.emailsJson) > 0 : false);
  const motivationScore = toFiniteInt(leadAny?.relasScore);
  const nextTouchAt = leadAny?.nextTouchAt ?? null;
  const r = computeLeadScore(
    {
      motivationScore,
      tags,
      hasPhone,
      hasEmail,
      nextTouchAt
    },
    {}
  );
  const scoreTotal = clamp2(Math.round(r.score), 0, 100);
  const snapshot = await storage.createLeadScoreSnapshot({
    entityType: input.entityType,
    entityId: input.entityId,
    jobId: input.job.id,
    scoreTotal,
    confidence: confidenceBucket(r.confidence),
    urgencyTier: urgencyTier(scoreTotal),
    reasonSummary: summarizeReasons(r.reasons),
    factorsJson: r.factorsJson
  });
  return snapshot;
}
async function runProviderStep(input) {
  const entity = await loadEntity({ entityType: input.entityType, entityId: input.entityId });
  const providerInput = requireProviderInput({ entityType: input.entityType, ...entity, ownerNameOverride: input.ownerNameOverride });
  const cacheKey = skipTraceCacheKey(providerInput);
  const existing = await storage.getLatestSkipTraceByCacheKey(cacheKey);
  const now = Date.now();
  const ms90d = 1e3 * 60 * 60 * 24 * 90;
  const ms5m = 1e3 * 60 * 5;
  if (existing && String(existing.status || "") === "success" && existing.completedAt) {
    const completedAtMs = new Date(existing.completedAt).getTime();
    if (Number.isFinite(completedAtMs) && now - completedAtMs < ms90d) {
      const cached2 = await storage.createSkipTraceResult({
        jobId: input.job.id,
        leadId: input.entityType === "lead" ? input.entityId : entity.sourceLead?.id ?? null,
        propertyId: input.entityType === "opportunity" ? input.entityId : null,
        providerName: String(existing.providerName || "cached"),
        status: "success",
        phonesJson: String(existing.phonesJson || "[]"),
        emailsJson: String(existing.emailsJson || "[]"),
        costCents: 0,
        cacheKey,
        requestedAt: /* @__PURE__ */ new Date(),
        completedAt: /* @__PURE__ */ new Date(),
        rawResponseJson: JSON.stringify({ cachedFromId: existing.id, raw: existing.rawResponseJson ?? null })
      });
      await storage.updateSkipTraceJob(input.job.id, { providerName: cached2.providerName });
      await addJobEvent(input.job.id, "provider_cached", null, { skipTraceResultId: cached2.id });
      await storage.createGlobalActivity({
        userId: input.requestedByUserId,
        action: "skip_trace_cached",
        description: `Skip trace cache hit: ${providerInput.address}`,
        metadata: JSON.stringify({ entityType: input.entityType, entityId: input.entityId, skipTraceId: cached2.id })
      });
      return { providerResult: cached2, cached: true, pending: false, lead: entity.lead, sourceLead: entity.sourceLead };
    }
  }
  if (existing && String(existing.status || "") === "pending" && existing.requestedAt) {
    const requestedAtMs = new Date(existing.requestedAt).getTime();
    if (Number.isFinite(requestedAtMs) && now - requestedAtMs < ms5m && existing.jobId) {
      await addJobEvent(input.job.id, "provider_pending", null, { existingJobId: existing.jobId, skipTraceResultId: existing.id });
      return { providerResult: existing, cached: false, pending: true, lead: entity.lead, sourceLead: entity.sourceLead };
    }
  }
  const provider = getSkipTraceProvider();
  await storage.updateSkipTraceJob(input.job.id, { providerName: provider.name });
  const pendingRow = await storage.createSkipTraceResult({
    jobId: input.job.id,
    leadId: input.entityType === "lead" ? input.entityId : entity.sourceLead?.id ?? null,
    propertyId: input.entityType === "opportunity" ? input.entityId : null,
    providerName: provider.name,
    status: "pending",
    phonesJson: "[]",
    emailsJson: "[]",
    cacheKey,
    requestedAt: /* @__PURE__ */ new Date()
  });
  await addJobEvent(input.job.id, "provider_requested", null, { skipTraceResultId: pendingRow.id, provider: provider.name });
  await storage.createGlobalActivity({
    userId: input.requestedByUserId,
    action: "skip_trace_requested",
    description: `Skip trace requested: ${providerInput.address}`,
    metadata: JSON.stringify({ entityType: input.entityType, entityId: input.entityId, skipTraceId: pendingRow.id, provider: provider.name })
  });
  let updated = pendingRow;
  try {
    const out = await provider.skipTrace(providerInput);
    if (out.status === "success") {
      updated = await storage.updateSkipTraceResult(pendingRow.id, {
        status: "success",
        phonesJson: JSON.stringify(out.phones || []),
        emailsJson: JSON.stringify(out.emails || []),
        costCents: out.costCents,
        completedAt: /* @__PURE__ */ new Date(),
        rawResponseJson: JSON.stringify(out.raw ?? null)
      });
      const leadToPatch = input.entityType === "lead" ? entity.lead : entity.sourceLead;
      const leadId = leadToPatch?.id ? Number(leadToPatch.id) : null;
      if (leadId) {
        const leadPatch = {};
        if (!String(leadToPatch.ownerPhone || "").trim() && out.phones?.[0]) leadPatch.ownerPhone = out.phones[0];
        if (!String(leadToPatch.ownerEmail || "").trim() && out.emails?.[0]) leadPatch.ownerEmail = out.emails[0];
        if (Object.keys(leadPatch).length) await storage.updateLead(leadId, leadPatch);
      }
      await addJobEvent(input.job.id, "provider_success", null, { skipTraceResultId: updated.id, phones: out.phones?.length || 0, emails: out.emails?.length || 0, costCents: out.costCents });
      await storage.createGlobalActivity({
        userId: input.requestedByUserId,
        action: "skip_trace_success",
        description: `Skip trace success: ${providerInput.address}`,
        metadata: JSON.stringify({ entityType: input.entityType, entityId: input.entityId, skipTraceId: updated.id, phones: out.phones?.length || 0, emails: out.emails?.length || 0, costCents: out.costCents })
      });
    } else {
      updated = await storage.updateSkipTraceResult(pendingRow.id, {
        status: "fail",
        phonesJson: JSON.stringify(out.phones || []),
        emailsJson: JSON.stringify(out.emails || []),
        costCents: out.costCents,
        completedAt: /* @__PURE__ */ new Date(),
        rawResponseJson: JSON.stringify(out.raw ?? null)
      });
      await addJobEvent(input.job.id, "provider_fail", String(out.errorMessage || "failed") || null, { skipTraceResultId: updated.id, costCents: out.costCents });
      await storage.createGlobalActivity({
        userId: input.requestedByUserId,
        action: "skip_trace_failed",
        description: `Skip trace failed: ${providerInput.address}`,
        metadata: JSON.stringify({ entityType: input.entityType, entityId: input.entityId, skipTraceId: updated.id, error: out.errorMessage || "failed", costCents: out.costCents })
      });
    }
  } catch (e) {
    updated = await storage.updateSkipTraceResult(pendingRow.id, {
      status: "fail",
      completedAt: /* @__PURE__ */ new Date(),
      rawResponseJson: JSON.stringify({ error: String(e?.message || e) })
    });
    await addJobEvent(input.job.id, "provider_fail", String(e?.message || e) || null, { skipTraceResultId: updated.id });
    await storage.createGlobalActivity({
      userId: input.requestedByUserId,
      action: "skip_trace_failed",
      description: `Skip trace failed: ${providerInput.address}`,
      metadata: JSON.stringify({ entityType: input.entityType, entityId: input.entityId, skipTraceId: updated.id, error: String(e?.message || e) })
    });
  }
  return { providerResult: updated, cached: false, pending: false, lead: entity.lead, sourceLead: entity.sourceLead };
}
async function runPublicResearchStep(input) {
  const entity = await loadEntity({ entityType: input.entityType, entityId: input.entityId });
  const providerInput = requireProviderInput({ entityType: input.entityType, ...entity, ownerNameOverride: input.ownerNameOverride });
  const out = await input.runner.run({
    entityType: input.entityType,
    entityId: input.entityId,
    ownerName: providerInput.ownerName,
    address: providerInput.address,
    city: providerInput.city,
    state: providerInput.state,
    zipCode: providerInput.zipCode
  });
  for (const ev of out.evidence || []) {
    await storage.createSkipTraceEvidence({
      jobId: input.job.id,
      entityType: input.entityType,
      entityId: input.entityId,
      sourceType: String(ev.sourceType || "other"),
      sourceUrl: ev.sourceUrl ? String(ev.sourceUrl) : null,
      extractedJson: ev.extracted ?? {},
      confidenceJson: ev.confidence ?? {},
      notes: ev.notes ? String(ev.notes) : null,
      screenshotRef: ev.screenshotRef ? String(ev.screenshotRef) : null
    });
  }
  const publicStatus = String(out.status || "unknown").toLowerCase();
  await addJobEvent(input.job.id, `public_${publicStatus}`, out.message ? String(out.message) : null, { runner: input.runner.name, evidenceCount: (out.evidence || []).length });
  return out;
}
async function runSkipTraceJob(jobId, input) {
  const job = await storage.getSkipTraceJobById(jobId);
  if (!job) throw new HttpError({ statusCode: 404, message: "Job not found" });
  if (job.status === "completed" || job.status === "failed") {
    const existing = (await storage.listLeadScoreSnapshotsByJobId(job.id))[0] ?? null;
    return { job, scoreSnapshot: existing };
  }
  if (job.status === "running") {
    const existing = (await storage.listLeadScoreSnapshotsByJobId(job.id))[0] ?? null;
    return { job, scoreSnapshot: existing };
  }
  if (job.status !== "queued") {
    const existing = (await storage.listLeadScoreSnapshotsByJobId(job.id))[0] ?? null;
    return { job, scoreSnapshot: existing };
  }
  const startedAt = /* @__PURE__ */ new Date();
  const running = await storage.claimSkipTraceJobForRun(job.id, startedAt);
  if (!running) {
    const refreshed = await storage.getSkipTraceJobById(job.id);
    if (!refreshed) throw new HttpError({ statusCode: 404, message: "Job not found" });
    const existing = (await storage.listLeadScoreSnapshotsByJobId(refreshed.id))[0] ?? null;
    return { job: refreshed, scoreSnapshot: existing };
  }
  await addJobEvent(running.id, "running", null);
  let providerResult = null;
  let lead = null;
  let sourceLead = null;
  const runner = getPublicResearchRunner();
  try {
    const mode = String(running.mode || "").trim().toLowerCase();
    const entityType = String(running.entityType || "").trim().toLowerCase();
    const entityId = Number(running.entityId);
    const requestedByUserId = running.requestedByUserId ? Number(running.requestedByUserId) : 0;
    let providerPending = false;
    if (mode === "provider" || mode === "both") {
      const out = await runProviderStep({ job: running, entityType, entityId, requestedByUserId, ownerNameOverride: input?.ownerNameOverride ?? null });
      providerResult = out.providerResult;
      lead = out.lead;
      sourceLead = out.sourceLead;
      providerPending = out.pending;
    }
    if (mode === "public_research" || mode === "both") {
      await runPublicResearchStep({ job: running, entityType, entityId, ownerNameOverride: input?.ownerNameOverride ?? null, runner });
    }
    if (providerPending) {
      const requeued = await storage.updateSkipTraceJob(running.id, { status: "queued", startedAt: null, errorMessage: null });
      await addJobEvent(running.id, "waiting", "Waiting for provider result", { providerPending: true });
      return { job: requeued, scoreSnapshot: null };
    }
    const scoreSnapshot = await persistLeadScoreSnapshot({ job: running, entityType, entityId, lead, sourceLead, providerResult });
    const completed = await storage.updateSkipTraceJob(running.id, { status: "completed", completedAt: /* @__PURE__ */ new Date() });
    await addJobEvent(running.id, "completed", null, { leadScoreSnapshotId: scoreSnapshot.id });
    return { job: completed, scoreSnapshot };
  } catch (e) {
    const errorMessage = String(e?.message || e || "Job failed");
    const failed = await storage.updateSkipTraceJob(running.id, { status: "failed", completedAt: /* @__PURE__ */ new Date(), errorMessage });
    await addJobEvent(running.id, "failed", errorMessage);
    throw Object.assign(e instanceof Error ? e : new Error(errorMessage), { statusCode: e?.statusCode ?? 500, job: failed });
  }
}
async function runProviderSkipTraceForEntity(input) {
  const entity = await loadEntity({ entityType: input.entityType, entityId: input.entityId });
  const providerInput = requireProviderInput({ entityType: input.entityType, ...entity, ownerNameOverride: input.ownerNameOverride });
  const cacheKey = skipTraceCacheKey(providerInput);
  const existing = await storage.getLatestSkipTraceByCacheKey(cacheKey);
  const now = Date.now();
  const ms90d = 1e3 * 60 * 60 * 24 * 90;
  const ms5m = 1e3 * 60 * 5;
  if (existing && String(existing.status || "") === "success" && existing.completedAt) {
    const completedAtMs = new Date(existing.completedAt).getTime();
    if (Number.isFinite(completedAtMs) && now - completedAtMs < ms90d) {
      const job2 = await createSkipTraceJob({ entityType: input.entityType, entityId: input.entityId, mode: "provider", requestedByUserId: input.requestedByUserId });
      await runSkipTraceJob(job2.id, { ownerNameOverride: input.ownerNameOverride ?? null });
      const providerResult2 = input.entityType === "lead" ? await storage.getLatestSkipTraceForLead(input.entityId) : await storage.getLatestSkipTraceForProperty(input.entityId);
      if (!providerResult2) throw new HttpError({ statusCode: 500, message: "Skip trace result missing" });
      return { cached: true, jobId: job2.id, providerResult: providerResult2 };
    }
  }
  if (existing && String(existing.status || "") === "pending" && existing.requestedAt) {
    const requestedAtMs = new Date(existing.requestedAt).getTime();
    if (Number.isFinite(requestedAtMs) && now - requestedAtMs < ms5m) {
      return { cached: false, pending: true, providerResult: existing };
    }
  }
  const job = await createSkipTraceJob({ entityType: input.entityType, entityId: input.entityId, mode: "provider", requestedByUserId: input.requestedByUserId });
  await runSkipTraceJob(job.id, { ownerNameOverride: input.ownerNameOverride ?? null });
  const providerResult = input.entityType === "lead" ? await storage.getLatestSkipTraceForLead(input.entityId) : await storage.getLatestSkipTraceForProperty(input.entityId);
  if (!providerResult) throw new HttpError({ statusCode: 500, message: "Skip trace result missing" });
  return { cached: false, jobId: job.id, providerResult };
}
function isHttpError(e) {
  return !!e && typeof e.statusCode === "number";
}

// server/services/skipTrace/merge.ts
function parseJsonArrayText(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  try {
    const parsed = JSON.parse(String(v));
    if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean);
    return [];
  } catch {
    return [];
  }
}
function uniq2(values) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const v of values.map((s) => String(s || "").trim()).filter(Boolean)) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}
function mergeSkipTraceResult(input) {
  const ownerName = input.entityType === "lead" ? String(input.lead?.ownerName || "").trim() || null : null;
  const address = input.entityType === "lead" ? {
    address: String(input.lead?.address || "").trim() || null,
    city: String(input.lead?.city || "").trim() || null,
    state: String(input.lead?.state || "").trim() || null,
    zipCode: String(input.lead?.zipCode || "").trim() || null
  } : {
    address: String(input.property?.address || "").trim() || null,
    city: String(input.property?.city || "").trim() || null,
    state: String(input.property?.state || "").trim() || null,
    zipCode: String(input.property?.zipCode || "").trim() || null
  };
  const leadPhones = input.entityType === "lead" ? [String(input.lead?.ownerPhone || "").trim()].filter(Boolean) : [];
  const leadEmails = input.entityType === "lead" ? [String(input.lead?.ownerEmail || "").trim()].filter(Boolean) : [];
  const providerPhones = input.providerResult ? parseJsonArrayText(input.providerResult.phonesJson) : [];
  const providerEmails = input.providerResult ? parseJsonArrayText(input.providerResult.emailsJson) : [];
  const phones = uniq2([...leadPhones, ...providerPhones]);
  const emails = uniq2([...leadEmails, ...providerEmails]);
  return {
    entityType: input.entityType,
    entityId: input.entityId,
    ownerName,
    address,
    contacts: { phones, emails },
    provider: input.providerResult ? { providerName: String(input.providerResult.providerName || "") || null, status: String(input.providerResult.status || "") || null } : null,
    scoreSnapshot: input.scoreSnapshot,
    evidenceCount: input.evidence.length
  };
}
function hydrateSkipTraceResultForApi(row) {
  return {
    ...row,
    phones: parseJsonArrayText(row.phonesJson),
    emails: parseJsonArrayText(row.emailsJson)
  };
}

// server/services/telecom/telnyx-client.ts
import crypto5 from "node:crypto";

// server/services/telecom/webhook-router.ts
init_db();
import { Router } from "express";
function createTelnyxWebhookRouter() {
  const router = Router();
  router.post("/", async (req, res) => {
    try {
      const event = req.body;
      const eventType = event?.data?.event_type || event?.event_type || "unknown";
      res.status(200).json({ received: true, eventType });
      setImmediate(async () => {
        try {
          if (eventType.startsWith("call.")) {
            await handleCallEvent(event);
          }
          if (eventType.startsWith("message.")) {
            await handleMessageEvent(event);
          }
        } catch (err) {
          console.error("Telnyx webhook background error:", err);
        }
      });
    } catch (error) {
      console.error("Telnyx webhook error:", error);
      res.status(200).json({ received: true });
    }
  });
  return router;
}
async function handleCallEvent(event) {
  const payload = event?.data || event;
  const callControlId = payload.call_control_id || payload.id;
  const from = payload.from || payload.source_number || payload.from_number;
  const to = payload.to || payload.destination_number || payload.to_number;
  const state = payload.call_state || payload.state;
  const direction = payload.direction || "outbound";
  if (!callControlId) return;
  const statusMap = {
    ringing: "ringing",
    answering: "ringing",
    answered: "answered",
    completed: "ended",
    failed: "failed",
    busy: "failed",
    no_answer: "missed"
  };
  const internalStatus = statusMap[state] || state;
  let existingLogId = null;
  let existingCreatedAt = null;
  try {
    const like2 = `%${callControlId}%`;
    const result = await pool.query(
      "SELECT id, created_at FROM call_logs WHERE metadata::text LIKE $1 ORDER BY id DESC LIMIT 1",
      [like2]
    );
    const row = result.rows?.[0];
    if (row?.id) {
      existingLogId = Number(row.id);
      existingCreatedAt = row.created_at ? new Date(row.created_at) : null;
    }
  } catch (e) {
    console.error("Failed to find call log by callControlId:", e);
  }
  if (!existingLogId && direction === "inbound" && (internalStatus === "ringing" || internalStatus === "answered")) {
    try {
      const createResult = await pool.query(
        `INSERT INTO call_logs (user_id, direction, number, status, started_at, metadata)
         VALUES (0, 'inbound', $1, $2, NOW(), $3)
         RETURNING id, created_at`,
        [from || "unknown", internalStatus, JSON.stringify({ callControlId, direction: "inbound" })]
      );
      const newRow = createResult.rows?.[0];
      if (newRow?.id) {
        existingLogId = Number(newRow.id);
        existingCreatedAt = newRow.created_at ? new Date(newRow.created_at) : null;
      }
    } catch (e) {
      console.error("Failed to create inbound call log from webhook:", e);
    }
  }
  if (existingLogId) {
    try {
      const endedAt = internalStatus === "ended" || internalStatus === "failed" ? /* @__PURE__ */ new Date() : null;
      const durationMs = internalStatus === "ended" && existingCreatedAt ? Math.max(0, Date.now() - existingCreatedAt.getTime()) : null;
      await pool.query(
        "UPDATE call_logs SET status = $1, ended_at = COALESCE($2, ended_at), duration_ms = COALESCE($3, duration_ms) WHERE id = $4",
        [internalStatus, endedAt, durationMs, existingLogId]
      );
      const terminal = /* @__PURE__ */ new Set(["answered", "missed", "failed", "ended"]);
      if (terminal.has(internalStatus)) {
        try {
          await pool.query(
            `INSERT INTO global_activity_logs (user_id, action, description, metadata, created_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [
              0,
              `call_${internalStatus}`,
              `Inbound call ${internalStatus}: ${from || "unknown"}`,
              JSON.stringify({
                callLogId: existingLogId,
                callControlId,
                from,
                to,
                direction,
                status: internalStatus
              })
            ]
          );
        } catch (e) {
          console.error("Failed to log call activity:", e);
        }
      }
    } catch (e) {
      console.error("Failed to update call log from webhook:", e);
    }
  }
  emitTelephonyEventToAll({
    type: "call_state_changed",
    payload: { callControlId, state: internalStatus, from, to, direction }
  });
}
async function handleMessageEvent(event) {
  const payload = event?.data || event;
  const from = payload.from?.phone_number || payload.from;
  const to = payload.to?.phone_number || payload.to;
  const body = payload.text || payload.body;
  const direction = payload.direction || "inbound";
  const eventType = event?.data?.event_type || event?.event_type || "unknown";
  const messageId = payload.id || payload.message_id || "";
  if (!from || !to) return;
  if (eventType === "message.delivered" || eventType === "message.delivery_update" || eventType === "message.sent" || eventType === "message.failed") {
    try {
      const statusMap = {
        "message.delivered": "delivered",
        "message.delivery_update": "delivery_update",
        "message.sent": "sent",
        "message.failed": "failed"
      };
      const status = statusMap[eventType] || eventType;
      await pool.query(
        `INSERT INTO global_activity_logs (user_id, action, description, metadata, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [
          0,
          "sms_status_update",
          `SMS ${status}: ${from} \u2192 ${to}`,
          JSON.stringify({ from, to, direction, status, messageId, eventType })
        ]
      );
    } catch (e) {
      console.error("Failed to log SMS delivery status:", e);
    }
    return;
  }
  try {
    let leadId = null;
    try {
      const toDigits = String(to || "").replace(/\D/g, "");
      if (toDigits.length >= 7) {
        const last10 = toDigits.slice(-10);
        const leadResult = await pool.query(
          "SELECT id FROM leads WHERE regexp_replace(COALESCE(owner_phone, ''), '\\D', '', 'g') LIKE $1 ORDER BY id DESC LIMIT 1",
          [`%${last10}`]
        );
        const leadRow = leadResult.rows?.[0];
        if (leadRow?.id) leadId = Number(leadRow.id);
      }
    } catch {
    }
    let fromLeadId = null;
    try {
      const fromDigits = String(from || "").replace(/\D/g, "");
      if (fromDigits.length >= 7) {
        const last10 = fromDigits.slice(-10);
        const leadResult = await pool.query(
          "SELECT id FROM leads WHERE regexp_replace(COALESCE(owner_phone, ''), '\\D', '', 'g') LIKE $1 ORDER BY id DESC LIMIT 1",
          [`%${last10}`]
        );
        const leadRow = leadResult.rows?.[0];
        if (leadRow?.id) fromLeadId = Number(leadRow.id);
      }
    } catch {
    }
    const effectiveLeadId = fromLeadId || leadId;
    await pool.query(
      `INSERT INTO global_activity_logs (user_id, action, description, metadata, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        0,
        direction === "inbound" ? "sms_received" : "sms_sent",
        String(body || "(no content)"),
        JSON.stringify({
          from,
          to,
          body,
          direction,
          messageId,
          leadId: effectiveLeadId || void 0
        })
      ]
    );
  } catch (e) {
    console.error("Failed to log SMS webhook event:", e);
  }
}

// server/services/telecom/telnyx-client.ts
function readEnv(name) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : "";
}
var TelnyxConfigError = class extends Error {
  missingEnv;
  constructor(missing) {
    super(`Telnyx is not configured: missing ${missing.join(", ")}`);
    this.name = "TelnyxConfigError";
    this.missingEnv = missing;
  }
};
function isConnectionActive(conn) {
  const rawState = String(conn?.state || conn?.status || "").trim().toLowerCase();
  return rawState === "active" || rawState === "online" || rawState === "ready";
}
var TelnyxClient = class {
  apiKey;
  connectionId;
  messagingProfileId;
  defaultFrom;
  baseUrl = "https://api.telnyx.com/v2";
  constructor(opts = {}) {
    this.apiKey = opts.apiKey || readEnv("TELNYX_API_KEY");
    this.connectionId = opts.connectionId || readEnv("TELNYX_CONNECTION_ID");
    this.messagingProfileId = opts.messagingProfileId || readEnv("TELNYX_MESSAGING_PROFILE_ID");
    this.defaultFrom = opts.defaultFrom || readEnv("TELNYX_DEFAULT_FROM_NUMBER");
  }
  missingEnv() {
    const missing = [];
    if (!this.apiKey) missing.push("TELNYX_API_KEY");
    if (!this.connectionId) missing.push("TELNYX_CONNECTION_ID");
    if (!this.messagingProfileId) missing.push("TELNYX_MESSAGING_PROFILE_ID");
    if (!this.defaultFrom) missing.push("TELNYX_DEFAULT_FROM_NUMBER");
    return missing;
  }
  requireReady() {
    const missing = this.missingEnv();
    if (missing.length) throw new TelnyxConfigError(missing);
  }
  headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json"
    };
  }
  async dial(input) {
    this.requireReady();
    const from = input.from || this.defaultFrom;
    if (!from) throw new Error("Missing from number for outbound call");
    const body = {
      connection_id: input.connectionId || this.connectionId,
      to: input.to,
      from
    };
    const res = await fetch(`${this.baseUrl}/calls`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15e3)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const title = data?.errors?.[0]?.title || data?.error || data?.message || `Telnyx dial failed (${res.status})`;
      const detail = data?.errors?.[0]?.detail || data?.details || null;
      const code = data?.errors?.[0]?.code || data?.code || null;
      const hint = String(title).toLowerCase();
      let friendly = title;
      if (hint.includes("connection") || hint.includes("credential")) {
        friendly = `Invalid connection_id for Call Control API. TELNYX_CONNECTION_ID must be a Call Control Application ID, not a SIP Credential Connection ID. Create a Call Control Application in the Telnyx portal and use its connection_id.`;
      }
      const err = new Error(friendly);
      err.status = res.status;
      err.code = code;
      err.detail = detail;
      throw err;
    }
    const callControlId = data?.data?.id || data?.call_control_id;
    if (!callControlId) throw new Error("Telnyx dial response missing call id");
    return { callControlId: String(callControlId) };
  }
  async hangup(callControlId) {
    this.requireReady();
    const res = await fetch(`${this.baseUrl}/calls/${encodeURIComponent(callControlId)}/actions/hangup`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(1e4)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const title = data?.errors?.[0]?.title || data?.error || data?.message || `Telnyx hangup failed (${res.status})`;
      const detail = data?.errors?.[0]?.detail || data?.details || null;
      const code = data?.errors?.[0]?.code || data?.code || null;
      const err = new Error(title);
      err.status = res.status;
      err.code = code;
      err.detail = detail;
      throw err;
    }
  }
  async sendSms(input) {
    this.requireReady();
    const from = input.from || this.defaultFrom;
    if (!from) throw new Error("Missing from number for SMS");
    const body = {
      from,
      to: input.to,
      body: input.body,
      messaging_profile_id: input.messagingProfileId || this.messagingProfileId
    };
    const res = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15e3)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const title = data?.errors?.[0]?.title || data?.error || data?.message || `Telnyx SMS failed (${res.status})`;
      const detail = data?.errors?.[0]?.detail || data?.details || null;
      const code = data?.errors?.[0]?.code || data?.code || null;
      const err = new Error(title);
      err.status = res.status;
      err.code = code;
      err.detail = detail;
      throw err;
    }
    const messageId = data?.data?.id || data?.id;
    if (!messageId) throw new Error("Telnyx SMS response missing message id");
    return { messageId: String(messageId) };
  }
  async healthCheck() {
    const missing = this.missingEnv();
    if (missing.length) {
      return {
        status: "unconfigured",
        code: "MISSING_CONFIG",
        message: `Telnyx is not configured: missing ${missing.join(", ")}`,
        connectionFound: false,
        connectionActive: false,
        httpStatus: null,
        missingEnv: missing
      };
    }
    let httpStatus = null;
    let errorMessage = "";
    try {
      const res = await fetch(`${this.baseUrl}/connections`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(1e4)
      });
      httpStatus = res.status;
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        const telnyxErrCode = data?.errors?.[0]?.code || null;
        const telnyxErrDetail = data?.errors?.[0]?.detail || null;
        const telnyxErrTitle = data?.errors?.[0]?.title || null;
        let classification = "INVALID_API_KEY";
        let hint = "Update TELNYX_API_KEY in Settings or .env and restart the server.";
        if (String(telnyxErrCode) === "10009") {
          classification = "MALFORMED_KEY";
          hint = "The API key appears malformed or truncated. Go to Telnyx Portal > Account > API Keys, generate a new V2 key, and replace TELNYX_API_KEY.";
        } else if (String(telnyxErrCode) === "20002") {
          classification = "REVOKED_KEY";
          hint = "This API key has been revoked. Generate a new key in the Telnyx portal.";
        } else if (String(telnyxErrCode) === "20008") {
          classification = "INVALID_KEY";
          hint = "The API key is invalid. Copy it fresh from the Telnyx portal API Keys page.";
        } else if (res.status === 403) {
          classification = "PERMISSION_DENIED";
          hint = "The key is valid but lacks permissions. Check key scope in the Telnyx portal.";
        }
        errorMessage = telnyxErrDetail || telnyxErrTitle || "Invalid Telnyx API key";
        return {
          status: "unreachable",
          code: classification,
          message: errorMessage,
          hint,
          telnyxErrorCode: telnyxErrCode,
          connectionFound: false,
          connectionActive: false,
          httpStatus
        };
      }
      if (res.status === 429) {
        errorMessage = "Telnyx rate limit exceeded";
        return {
          status: "degraded",
          code: "RATE_LIMITED",
          message: errorMessage,
          connectionFound: false,
          connectionActive: false,
          httpStatus
        };
      }
      if (res.status >= 500) {
        errorMessage = "Telnyx server error";
        return {
          status: "degraded",
          code: "PROVIDER_ERROR",
          message: errorMessage,
          connectionFound: false,
          connectionActive: false,
          httpStatus
        };
      }
      if (!res.ok) {
        errorMessage = data?.errors?.[0]?.title || data?.message || `Telnyx connections fetch failed (${res.status})`;
        return {
          status: "unreachable",
          code: "UNREACHABLE",
          message: errorMessage,
          connectionFound: false,
          connectionActive: false,
          httpStatus
        };
      }
      const connections = Array.isArray(data?.data) ? data.data : [];
      const target = connections.find((c) => String(c.id) === String(this.connectionId));
      if (!target) {
        errorMessage = `TELNYX_CONNECTION_ID (${this.connectionId}) not found among ${connections.length} connection(s) in this account`;
        return {
          status: "unreachable",
          code: "CONNECTION_NOT_FOUND",
          message: errorMessage,
          hint: "TELNYX_CONNECTION_ID must be a Call Control Application ID (numeric), not a SIP credential. Create or locate the correct app in Telnyx Portal > Voice > Call Control Applications.",
          connectionFound: false,
          connectionActive: false,
          httpStatus
        };
      }
      const active = isConnectionActive(target);
      return {
        status: active ? "reachable" : "unreachable",
        code: active ? "OK" : "CONNECTION_INACTIVE",
        message: active ? "Connection is active" : `Connection state: ${String(target.state || target.status || "unknown")}`,
        connectionFound: true,
        connectionActive: active,
        httpStatus
      };
    } catch (error) {
      const message = error?.message || String(error);
      const isTimeout = message.includes("timeout") || message.includes("ETIMEDOUT") || message.includes("ENOTFOUND");
      errorMessage = isTimeout ? "Telnyx connection timed out" : message;
      return {
        status: isTimeout ? "degraded" : "unreachable",
        code: isTimeout ? "TIMEOUT" : "UNREACHABLE",
        message: errorMessage,
        connectionFound: false,
        connectionActive: false,
        httpStatus
      };
    }
  }
  diagnostics() {
    const apiKey = String(this.apiKey || "");
    const apiKeyPrefix = apiKey.length >= 6 ? apiKey.slice(0, 6) : apiKey;
    const publicKey = String(process.env.TELNYX_PUBLIC_KEY || "");
    const webhookUrl = String(process.env.TELNYX_WEBHOOK_URL || "");
    return {
      telnyxConfigured: Boolean(apiKey && this.connectionId && this.messagingProfileId && this.defaultFrom),
      apiKeyPrefix,
      usedPublicKey: publicKey.length > 0 && apiKey === publicKey,
      baseUrl: this.baseUrl,
      connectionId: this.connectionId,
      messagingProfileId: this.messagingProfileId,
      defaultFrom: this.defaultFrom,
      webhookUrl: webhookUrl || null
    };
  }
  // ── Call Control Actions ──────────────────────────────────────────────
  async mute(callControlId, muted) {
    this.requireReady();
    const res = await fetch(
      `${this.baseUrl}/calls/${encodeURIComponent(callControlId)}/actions/mute`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ muted }),
        signal: AbortSignal.timeout(1e4)
      }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const title = data?.errors?.[0]?.title || data?.message || `Telnyx mute failed (${res.status})`;
      const err = new Error(title);
      err.status = res.status;
      throw err;
    }
  }
  async hold(callControlId) {
    this.requireReady();
    const res = await fetch(
      `${this.baseUrl}/calls/${encodeURIComponent(callControlId)}/actions/hold`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(1e4)
      }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const title = data?.errors?.[0]?.title || data?.message || `Telnyx hold failed (${res.status})`;
      const err = new Error(title);
      err.status = res.status;
      throw err;
    }
  }
  async unhold(callControlId) {
    this.requireReady();
    const res = await fetch(
      `${this.baseUrl}/calls/${encodeURIComponent(callControlId)}/actions/unhold`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(1e4)
      }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const title = data?.errors?.[0]?.title || data?.message || `Telnyx unhold failed (${res.status})`;
      const err = new Error(title);
      err.status = res.status;
      throw err;
    }
  }
  async transfer(callControlId, to) {
    this.requireReady();
    const res = await fetch(
      `${this.baseUrl}/calls/${encodeURIComponent(callControlId)}/actions/transfer`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ to }),
        signal: AbortSignal.timeout(1e4)
      }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const title = data?.errors?.[0]?.title || data?.message || `Telnyx transfer failed (${res.status})`;
      const err = new Error(title);
      err.status = res.status;
      throw err;
    }
  }
  // ── Webhook Signature Verification ────────────────────────────────────
  // Telnyx signs webhooks with HMAC-SHA256 using TELNYX_PUBLIC_KEY as the secret.
  // Header format: t=<timestamp>,v1=<hex_signature>
  verifyWebhookSignature(payload, signatureHeader, toleranceSeconds) {
    const publicKey = process.env.TELNYX_PUBLIC_KEY;
    if (!publicKey) return false;
    if (!payload || !signatureHeader) return false;
    try {
      const tolerance = toleranceSeconds ?? Number(process.env.TELNYX_WEBHOOK_SIGNING_TOLERANCE_SECONDS || "300");
      const parts = String(signatureHeader).split(",").map((p) => p.trim());
      const timestampStr = parts.find((p) => p.startsWith("t="));
      const v1Sig = parts.find((p) => p.startsWith("v1="));
      if (!timestampStr || !v1Sig) return false;
      const timestamp2 = parseInt(timestampStr.slice(2), 10);
      if (Number.isNaN(timestamp2)) return false;
      const now = Math.floor(Date.now() / 1e3);
      if (Math.abs(now - timestamp2) > tolerance) return false;
      const signedContent = `${timestamp2}.${payload}`;
      const expectedSig = crypto5.createHmac("sha256", publicKey).update(signedContent).digest("hex");
      const receivedSig = v1Sig.slice(3);
      if (expectedSig.length !== receivedSig.length) return false;
      return crypto5.timingSafeEqual(
        Buffer.from(expectedSig, "hex"),
        Buffer.from(receivedSig, "hex")
      );
    } catch {
      return false;
    }
  }
};
var telnyx = new TelnyxClient();

// server/services/messaging/resend.ts
function requireEnv2(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`${name} is not configured`);
  return String(v).trim();
}
async function sendResendEmail(input) {
  const apiKey = requireEnv2("RESEND_API_KEY");
  const from = String(input.from || process.env.RESEND_FROM || "").trim();
  if (!from) throw new Error("RESEND_FROM is not configured");
  const to = String(input.to || "").trim();
  if (!to) throw new Error("Missing recipient");
  const subject = String(input.subject || "").trim();
  if (!subject) throw new Error("Missing subject");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text: input.text || void 0,
      html: input.html || void 0
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data?.message === "string" ? data.message : "Email send failed";
    throw new Error(msg);
  }
  const id = String(data?.id || "").trim();
  return { id };
}

// server/auth/config.ts
init_db();
function isNonEmpty(v) {
  return Boolean(typeof v === "string" ? v.trim() : String(v ?? "").trim());
}
function getSessionSecretMissing() {
  if (process.env.NODE_ENV !== "production") return [];
  if (isNonEmpty(process.env.SESSION_SECRET)) return [];
  return ["env:SESSION_SECRET"];
}
function getDatabaseUrlMissing() {
  if (process.env.NODE_ENV !== "production") return [];
  const resolved = databaseUrlResolution();
  if (resolved.url && String(resolved.url).trim()) return [];
  return [
    "env:DATABASE_URL",
    "env:POSTGRES_URL_NON_POOLING",
    "env:POSTGRES_PRISMA_URL",
    "env:POSTGRES_URL"
  ];
}
function getSignupCodesMissing() {
  if (process.env.NODE_ENV !== "production") return [];
  const legacyEmployeeCode = String(process.env.EMPLOYEE_ACCESS_CODE || "").trim();
  if (legacyEmployeeCode) return [];
  const adminCode = String(process.env.ADMIN_ROLE_CODE || "").trim();
  const teamLeaderCode = String(process.env.TEAM_LEADER_ROLE_CODE || "").trim();
  const agentCode = String(process.env.AGENT_ROLE_CODE || "").trim();
  const vaCode = String(process.env.VA_ROLE_CODE || "").trim();
  if (adminCode && teamLeaderCode && agentCode && vaCode) return [];
  return [
    "env:EMPLOYEE_ACCESS_CODE",
    "env:ADMIN_ROLE_CODE",
    "env:TEAM_LEADER_ROLE_CODE",
    "env:AGENT_ROLE_CODE",
    "env:VA_ROLE_CODE"
  ];
}
function getEmailProviderMissing() {
  if (process.env.NODE_ENV !== "production") return [];
  const missing = [];
  if (!isNonEmpty(process.env.RESEND_API_KEY)) missing.push("env:RESEND_API_KEY");
  if (!isNonEmpty(process.env.RESEND_FROM)) missing.push("env:RESEND_FROM");
  return missing;
}
function getOrgEmailDomainMissing() {
  if (process.env.NODE_ENV !== "production") return [];
  if (isNonEmpty(process.env.ORG_EMAIL_DOMAIN)) return [];
  return ["env:ORG_EMAIL_DOMAIN"];
}
function getAuthStatusSnapshot() {
  const missing = [
    ...getSessionSecretMissing(),
    ...getDatabaseUrlMissing(),
    ...getSignupCodesMissing(),
    ...getEmailProviderMissing(),
    ...getOrgEmailDomainMissing()
  ];
  return {
    ok: missing.length === 0,
    nodeEnv: String(process.env.NODE_ENV || "development"),
    missing
  };
}

// server/auth/errors.ts
function getRequestIdFromRes(res) {
  const v = res?.locals?.requestId;
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}
function sendAuthError(res, status, body) {
  const requestId = getRequestIdFromRes(res);
  const payload = requestId ? { ...body, requestId } : body;
  return res.status(status).json(payload);
}
function isEmailNotConfiguredError(err) {
  const msg = String(err?.message || "").trim().toLowerCase();
  if (!msg) return false;
  return msg.includes("resend_api_key is not configured") || msg.includes("resend_from is not configured") || msg.includes("email is not configured");
}

// server/services/tasks/task-service.ts
function parseRrule(rule) {
  const raw = String(rule || "").trim();
  if (!raw) return null;
  const parts = raw.split(";").map((p) => p.trim()).filter(Boolean);
  const kv = /* @__PURE__ */ new Map();
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx <= 0) continue;
    kv.set(p.slice(0, idx).toUpperCase(), p.slice(idx + 1).toUpperCase());
  }
  const freq = kv.get("FREQ");
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY") return null;
  const intervalRaw = kv.get("INTERVAL");
  const interval = intervalRaw ? Math.max(1, parseInt(intervalRaw, 10) || 1) : 1;
  return { freq, interval };
}
function addMonths(date2, months) {
  const d = new Date(date2);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() !== day) {
    d.setDate(0);
  }
  return d;
}
function nextDueAt(input) {
  if (!input.dueAt) return null;
  const d = new Date(input.dueAt);
  if (input.rule.freq === "DAILY") return new Date(d.getTime() + input.rule.interval * 24 * 60 * 60 * 1e3);
  if (input.rule.freq === "WEEKLY") return new Date(d.getTime() + input.rule.interval * 7 * 24 * 60 * 60 * 1e3);
  return addMonths(d, input.rule.interval);
}
async function createTask(input) {
  const now = /* @__PURE__ */ new Date();
  const row = await storage.createTask({
    title: input.title,
    description: input.description ?? null,
    type: input.type ?? "general",
    relatedEntityType: input.relatedEntityType ?? null,
    relatedEntityId: input.relatedEntityId ?? null,
    dueAt: input.dueAt ?? null,
    completedAt: null,
    priority: input.priority ?? "medium",
    status: input.status ?? "open",
    assignedToUserId: input.assignedToUserId ?? null,
    isRecurring: !!input.isRecurring,
    recurrenceRule: input.recurrenceRule ?? null,
    createdBy: input.createdBy,
    isPrivate: !!input.isPrivate,
    reminderSentAt: null,
    overdueAlertSentAt: null,
    createdAt: now,
    updatedAt: now
  });
  return row;
}
async function completeTaskWithRecurrence(input) {
  const task = await storage.getTaskById(input.taskId);
  if (!task) return null;
  const completed = await storage.completeTask(task.id, { completedAt: input.completedAt, status: "completed" });
  if (!completed.isRecurring) return { completed, next: null };
  const rule = parseRrule(completed.recurrenceRule);
  if (!rule) return { completed, next: null };
  const dueAt = nextDueAt({ dueAt: completed.dueAt ?? null, rule });
  if (!dueAt) return { completed, next: null };
  const next = await createTask({
    title: completed.title,
    description: completed.description ?? null,
    type: completed.type ?? "general",
    relatedEntityType: completed.relatedEntityType ?? null,
    relatedEntityId: completed.relatedEntityId ?? null,
    dueAt,
    priority: completed.priority ?? "medium",
    status: "open",
    assignedToUserId: completed.assignedToUserId ?? null,
    isRecurring: true,
    recurrenceRule: completed.recurrenceRule ?? null,
    isPrivate: completed.isPrivate ?? false,
    createdBy: completed.createdBy ?? 0
  });
  return { completed, next };
}
async function onLeadCreated(input) {
  const assignedToUserId = typeof input.assignedTo === "number" ? input.assignedTo : input.createdBy;
  await createTask({
    title: "Initial follow-up",
    description: `New lead: ${input.leadAddress}`,
    type: "follow_up",
    relatedEntityType: "lead",
    relatedEntityId: input.leadId,
    dueAt: new Date(Date.now() + 60 * 60 * 1e3),
    priority: "high",
    status: "open",
    assignedToUserId,
    isRecurring: false,
    recurrenceRule: null,
    isPrivate: false,
    createdBy: input.createdBy
  });
}
async function onLeadStatusChanged(input) {
  const before = String(input.beforeStatus || "").trim().toLowerCase();
  const after = String(input.afterStatus || "").trim().toLowerCase();
  if (!after || after === before) return;
  const assignedToUserId = typeof input.assignedTo === "number" ? input.assignedTo : input.actorUserId;
  if (after === "qualified") {
    await createTask({
      title: "Call seller to confirm details",
      description: `Qualified lead: ${input.leadAddress}`,
      type: "call",
      relatedEntityType: "lead",
      relatedEntityId: input.leadId,
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1e3),
      priority: "medium",
      status: "open",
      assignedToUserId,
      isRecurring: false,
      recurrenceRule: null,
      isPrivate: false,
      createdBy: input.actorUserId
    });
  }
  if (after === "under_contract") {
    await createTask({
      title: "Convert to opportunity + start contract workflow",
      description: `Lead is under contract: ${input.leadAddress}`,
      type: "workflow",
      relatedEntityType: "lead",
      relatedEntityId: input.leadId,
      dueAt: new Date(Date.now() + 2 * 60 * 60 * 1e3),
      priority: "high",
      status: "open",
      assignedToUserId,
      isRecurring: false,
      recurrenceRule: null,
      isPrivate: false,
      createdBy: input.actorUserId
    });
  }
}
async function onContractSigned(input) {
  let assignedToUserId = null;
  if (typeof input.propertyId === "number") {
    try {
      const property = await storage.getPropertyById(input.propertyId);
      assignedToUserId = property?.assignedTo ?? null;
    } catch {
    }
  }
  await createTask({
    title: "Review executed contract + update deal stage",
    description: `Contract signed: ${input.title}`,
    type: "contract",
    relatedEntityType: typeof input.propertyId === "number" ? "opportunity" : null,
    relatedEntityId: typeof input.propertyId === "number" ? input.propertyId : null,
    dueAt: new Date(Date.now() + 2 * 60 * 60 * 1e3),
    priority: "high",
    status: "open",
    assignedToUserId,
    isRecurring: false,
    recurrenceRule: null,
    isPrivate: false,
    createdBy: 0
  });
}

// server/services/rvm/provider.ts
import crypto6 from "node:crypto";
function stableHash2(v) {
  return crypto6.createHash("sha256").update(v).digest("hex");
}
var MockRvmProvider = class {
  name = "mock";
  async requestDrops(input) {
    return input.toNumbers.map((toNumber) => {
      const h = stableHash2(`${input.audioAssetId}|${toNumber}`);
      const providerId = `mock_${h.slice(0, 20)}`;
      return { toNumber, status: "sent", providerId };
    });
  }
  async pollStatuses(providerIds) {
    const out = {};
    for (const id of providerIds) out[id] = { status: "sent" };
    return out;
  }
};
function getRvmProvider() {
  const v = String(process.env.RVM_PROVIDER || "mock").trim().toLowerCase();
  if (v === "mock") return new MockRvmProvider();
  return new MockRvmProvider();
}

// server/routes.ts
import crypto10 from "node:crypto";

// server/featureFlags.ts
var featureEnvVars = {
  skip_trace: "FEATURE_SKIP_TRACE",
  campaigns: "FEATURE_CAMPAIGNS",
  rvm: "FEATURE_RVM",
  esign: "FEATURE_ESIGN",
  field_mode: "FEATURE_FIELD_MODE",
  comps: "FEATURE_COMPS",
  buyer_match: "FEATURE_BUYER_MATCH",
  voice_playground: "FEATURE_VOICE_PLAYGROUND"
};
function parseEnvBool2(v) {
  if (v === void 0 || v === null) return null;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
  if (s === "0" || s === "false" || s === "no" || s === "off") return false;
  return null;
}
function createIsFeatureEnabled(getUserFeatureFlag) {
  return async (userId, flag) => {
    const envKey = featureEnvVars[flag];
    const envDecision = parseEnvBool2(process.env[envKey]);
    if (envDecision !== null) return envDecision;
    try {
      const row = await getUserFeatureFlag(userId, flag);
      return !!row?.enabled;
    } catch {
      return false;
    }
  };
}

// server/media/documentVault.ts
import { S3Client as S3Client2, GetObjectCommand as GetObjectCommand2, PutObjectCommand as PutObjectCommand2 } from "@aws-sdk/client-s3";
import { getSignedUrl as getSignedUrl2 } from "@aws-sdk/s3-request-presigner";
import crypto7 from "node:crypto";
import path from "node:path";
function readConfig() {
  const bucket = String(process.env.DOCUMENTS_BUCKET || "").trim();
  const region = String(process.env.DOCUMENTS_REGION || "").trim();
  if (!bucket || !region) return null;
  const endpoint = String(process.env.DOCUMENTS_ENDPOINT || "").trim() || void 0;
  const accessKeyId = String(process.env.DOCUMENTS_ACCESS_KEY_ID || "").trim() || void 0;
  const secretAccessKey = String(process.env.DOCUMENTS_SECRET_ACCESS_KEY || "").trim() || void 0;
  return { bucket, region, endpoint, accessKeyId, secretAccessKey };
}
function getClient2(cfg) {
  return new S3Client2({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: Boolean(cfg.endpoint),
    credentials: cfg.accessKeyId && cfg.secretAccessKey ? { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey } : void 0
  });
}
function safeBasename(name) {
  const base = path.basename(name || "file");
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_");
}
function isDocumentVaultConfigured() {
  return readConfig() !== null;
}
function sha256Hex(buf) {
  return crypto7.createHash("sha256").update(buf).digest("hex");
}
function makeDocumentStorageKey(input) {
  const filePart = safeBasename(input.originalName);
  return `teams/${input.teamId}/documents/${crypto7.randomUUID()}-${filePart}`;
}
async function uploadDocumentObject(input) {
  const cfg = readConfig();
  if (!cfg) throw new Error("Document vault is not configured");
  const client2 = getClient2(cfg);
  await client2.send(
    new PutObjectCommand2({
      Bucket: cfg.bucket,
      Key: input.storageKey,
      Body: input.body,
      ContentType: input.contentType
    })
  );
  return { storageKey: input.storageKey };
}
async function getDocumentSignedUrl(input) {
  const cfg = readConfig();
  if (!cfg) return null;
  const client2 = getClient2(cfg);
  return await getSignedUrl2(
    client2,
    new GetObjectCommand2({
      Bucket: cfg.bucket,
      Key: input.storageKey
    }),
    { expiresIn: input.expiresInSeconds ?? 60 * 10 }
  );
}

// server/services/telecom/provider-readiness.ts
function has(key) {
  const v = process.env[key];
  return Boolean(v && String(v).trim() !== "");
}
function envStr(key) {
  const v = process.env[key];
  if (!v || String(v).trim() === "") return null;
  return String(v).trim();
}
function parseBoolFlag(val) {
  if (!val) return false;
  const s = val.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}
function detectConnectionType(connectionId) {
  if (/^\d+$/.test(connectionId)) return "call_control_application";
  if (!/^\d+$/.test(connectionId) && /^[0-9a-fA-F-]{20,}$/.test(connectionId) && connectionId.includes("-")) {
    return "sip_credential";
  }
  return "unknown";
}
function parseJsonNumbers() {
  const raw = process.env.DIALER_NUMBERS_JSON;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
  }
  return [];
}
async function checkVoice() {
  const apiKey = envStr("TELNYX_API_KEY");
  const connectionId = envStr("TELNYX_CONNECTION_ID");
  const defaultFrom = envStr("TELNYX_DEFAULT_FROM_NUMBER");
  const numbers = parseJsonNumbers();
  const configured = Boolean(apiKey && connectionId);
  if (!configured) {
    const missing = [];
    if (!apiKey) missing.push("TELNYX_API_KEY");
    if (!connectionId) missing.push("TELNYX_CONNECTION_ID");
    return {
      configured: false,
      reachable: false,
      connectionFound: false,
      connectionActive: false,
      connectionType: "unknown",
      fromNumbers: numbers,
      defaultFromNumber: defaultFrom,
      blocker: `Missing: ${missing.join(", ")}. Add these in Settings \u2192 System.`
    };
  }
  const health = await telnyx.healthCheck();
  const connType = detectConnectionType(connectionId);
  let blocker;
  if (connType === "sip_credential") {
    blocker = "TELNYX_CONNECTION_ID appears to be a SIP Credential Connection ID. Dialing via /v2/calls requires a Call Control Application ID (numeric). Create a Call Control Application in the Telnyx portal and use its connection_id.";
  } else if (health.status === "unreachable" && health.code) {
    blocker = health.hint || `Telnyx API error (${health.code}): ${health.message}`;
  }
  return {
    configured: true,
    reachable: health.status === "reachable",
    connectionFound: health.connectionFound,
    connectionActive: health.connectionActive,
    connectionType: connType,
    fromNumbers: numbers,
    defaultFromNumber: defaultFrom,
    blocker
  };
}
function checkSms() {
  const apiKey = has("TELNYX_API_KEY");
  const messagingProfileId = envStr("TELNYX_MESSAGING_PROFILE_ID");
  const defaultFrom = envStr("TELNYX_DEFAULT_FROM_NUMBER");
  const configured = Boolean(apiKey && messagingProfileId);
  let blocker;
  if (!messagingProfileId) {
    blocker = "TELNYX_MESSAGING_PROFILE_ID is missing. SMS will not send.";
  }
  return {
    configured,
    reachable: configured,
    messagingProfilePresent: Boolean(messagingProfileId),
    defaultFromNumber: defaultFrom,
    blocker
  };
}
function checkVideo() {
  const configured = parseBoolFlag(process.env.TELNYX_VIDEO_ENABLED);
  const apiKey = has("TELNYX_API_KEY");
  if (!apiKey) {
    return {
      configured: false,
      reachable: false,
      roomsApiAvailable: false,
      blocker: "TELNYX_API_KEY is required for Video rooms."
    };
  }
  if (!configured) {
    return {
      configured: false,
      reachable: false,
      roomsApiAvailable: false,
      blocker: "Telnyx Video is not enabled. Confirm Video API access in the Telnyx portal, then set TELNYX_VIDEO_ENABLED=true."
    };
  }
  return {
    configured: true,
    reachable: true,
    roomsApiAvailable: true
  };
}
function checkEmail() {
  const resendKey = has("RESEND_API_KEY");
  const resendFrom = envStr("RESEND_FROM");
  const telnyxEmailEnabled = parseBoolFlag(process.env.TELNYX_EMAIL_ENABLED);
  const telnyxApiKey = has("TELNYX_API_KEY");
  const emailFromAddress = envStr("EMAIL_FROM_ADDRESS");
  const emailFromName = envStr("EMAIL_FROM_NAME");
  const activeProvider = telnyxEmailEnabled && telnyxApiKey ? "telnyx" : resendKey ? "resend" : null;
  const configured = activeProvider !== null;
  const fromAddress = emailFromAddress || resendFrom || null;
  let blocker;
  if (!configured) {
    blocker = "No email provider configured. Set RESEND_API_KEY + RESEND_FROM for Resend, or TELNYX_EMAIL_ENABLED=true for Telnyx Email API.";
  } else if (!fromAddress) {
    blocker = "Email from address not configured. Set RESEND_FROM or EMAIL_FROM_ADDRESS.";
  }
  return {
    configured,
    activeProvider,
    fromAddress,
    fromName: emailFromName || null,
    telnyxEssionEnabled: telnyxEmailEnabled,
    telnyxEmailReachable: false,
    // requires actual probe in future
    blocker
  };
}
function checkDocumentStorage() {
  const configured = isDocumentVaultConfigured();
  return {
    configured,
    blocker: configured ? void 0 : "Document storage not configured. Set DOCUMENTS_BUCKET + DOCUMENTS_REGION."
  };
}
function checkWebhook() {
  const webhookUrl = envStr("TELNYX_WEBHOOK_URL");
  return {
    configured: Boolean(webhookUrl),
    publicUrlPresent: Boolean(webhookUrl),
    blocker: webhookUrl ? void 0 : "TELNYX_WEBHOOK_URL is missing. Call events and inbound SMS will not be received."
  };
}
function checkFeatureFlags() {
  return {
    esign: parseBoolFlag(process.env.FEATURE_ESIGN),
    video_meetings: parseBoolFlag(process.env.FEATURE_VIDEO_MEETINGS),
    public_listings: parseBoolFlag(process.env.FEATURE_PUBLIC_LISTINGS),
    rvm: parseBoolFlag(process.env.FEATURE_RVM),
    skip_trace: parseBoolFlag(process.env.FEATURE_SKIP_TRACE),
    campaigns: parseBoolFlag(process.env.FEATURE_CAMPAIGNS),
    field_mode: parseBoolFlag(process.env.FEATURE_FIELD_MODE),
    comps: parseBoolFlag(process.env.FEATURE_COMPS),
    buyer_match: parseBoolFlag(process.env.FEATURE_BUYER_MATCH),
    voice_playground: parseBoolFlag(process.env.FEATURE_VOICE_PLAYGROUND)
  };
}
async function getProviderReadiness() {
  const [voice, sms, video, email, documentStorage, webhook] = await Promise.all([
    checkVoice(),
    Promise.resolve(checkSms()),
    Promise.resolve(checkVideo()),
    Promise.resolve(checkEmail()),
    Promise.resolve(checkDocumentStorage()),
    Promise.resolve(checkWebhook())
  ]);
  const featureFlags = checkFeatureFlags();
  const channelStatuses = [];
  const toStatus = (r) => {
    if (!r.configured) return "unconfigured";
    if (r.blocker) return "unavailable";
    if (r.reachable === false) return "unavailable";
    return "healthy";
  };
  channelStatuses.push(toStatus(voice));
  channelStatuses.push(toStatus(sms));
  channelStatuses.push(toStatus(video));
  channelStatuses.push(toStatus(email));
  let overallStatus = "healthy";
  if (channelStatuses.includes("unavailable")) overallStatus = "unavailable";
  else if (channelStatuses.includes("unconfigured")) overallStatus = "unconfigured";
  else if (channelStatuses.includes("degraded")) overallStatus = "degraded";
  return {
    voice,
    sms,
    video,
    email,
    documentStorage,
    webhook,
    featureFlags,
    overallStatus,
    checkedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}

// server/services/audit/writeAuditEvent.ts
init_db();
function computeShallowDiff(before, after) {
  const b = before && typeof before === "object" ? before : {};
  const a = after && typeof after === "object" ? after : {};
  const keys = /* @__PURE__ */ new Set([...Object.keys(b), ...Object.keys(a)]);
  const changed = [];
  for (const key of keys) {
    const bv = b[key];
    const av = a[key];
    if (JSON.stringify(bv) !== JSON.stringify(av)) {
      changed.push({ key, before: bv ?? null, after: av ?? null });
    }
  }
  return { changed };
}
async function writeAuditEvent(input) {
  const beforeJson = typeof input.before === "undefined" ? null : JSON.stringify(input.before);
  const afterJson = typeof input.after === "undefined" ? null : JSON.stringify(input.after);
  const diff = typeof input.diff !== "undefined" ? input.diff : typeof input.before !== "undefined" || typeof input.after !== "undefined" ? computeShallowDiff(input.before, input.after) : null;
  const diffJson = diff === null ? input.kind ? JSON.stringify({ kind: input.kind, changed: [] }) : null : JSON.stringify({ kind: input.kind || "update", ...diff });
  const rows = await db.insert(auditEvents).values({
    teamId: input.teamId,
    actorUserId: typeof input.actorUserId === "number" ? input.actorUserId : null,
    entityType: String(input.entityType || "").trim(),
    entityId: typeof input.entityId === "number" ? input.entityId : null,
    action: String(input.action || "").trim(),
    beforeJson,
    afterJson,
    diffJson,
    ip: input.ip ? String(input.ip).slice(0, 64) : null,
    userAgent: input.userAgent ? String(input.userAgent) : null,
    requestId: input.requestId ? String(input.requestId).slice(0, 64) : null
  }).returning();
  return rows[0] || null;
}

// server/services/automations/engine.ts
import crypto8 from "node:crypto";
var MAX_AUTOMATION_DEPTH = 5;
function getByPath(root, path3) {
  const parts = String(path3 || "").split(".").map((p) => p.trim()).filter(Boolean);
  let cur = root;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return void 0;
    cur = cur[p];
  }
  return cur;
}
function evalRule(event, rule) {
  const path3 = String(rule?.path || rule?.field || "").trim();
  const operator = String(rule?.operator || rule?.op || "eq").trim().toLowerCase();
  const expected = rule?.value;
  const actual = path3 ? getByPath({ event }, path3.startsWith("event.") ? path3.slice("event.".length) : `event.${path3}`) : void 0;
  if (operator === "exists") return typeof actual !== "undefined" && actual !== null;
  if (operator === "eq") return JSON.stringify(actual ?? null) === JSON.stringify(expected ?? null);
  if (operator === "neq") return JSON.stringify(actual ?? null) !== JSON.stringify(expected ?? null);
  if (operator === "contains") return String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
  if (operator === "in") return Array.isArray(expected) && expected.some((v) => JSON.stringify(v) === JSON.stringify(actual));
  if (operator === "includes") return Array.isArray(actual) && actual.some((v) => JSON.stringify(v) === JSON.stringify(expected));
  return false;
}
function evalCondition(event, configJson) {
  const raw = String(configJson || "").trim();
  if (!raw || raw === "{}") return true;
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch {
    return false;
  }
  if (Array.isArray(cfg?.rules)) {
    const op = String(cfg?.op || "and").toLowerCase();
    const results = cfg.rules.map((r) => evalRule(event, r));
    return op === "or" ? results.some(Boolean) : results.every(Boolean);
  }
  if (cfg && typeof cfg === "object" && (cfg.path || cfg.field)) {
    return evalRule(event, cfg);
  }
  return true;
}
function hmacSha256Hex(secret, rawBody) {
  return crypto8.createHmac("sha256", secret).update(rawBody).digest("hex");
}
async function postWebhook(input) {
  const deliveryId = crypto8.randomUUID();
  const rawBody = JSON.stringify(input.body);
  const sig = hmacSha256Hex(input.secret, rawBody);
  for (let attempt = 0; attempt <= input.retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const res = await fetch(input.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-luxe-event-type": String(input.body?.eventType || ""),
          "x-luxe-signature": `sha256=${sig}`,
          "x-luxe-delivery-id": deliveryId
        },
        body: rawBody,
        signal: controller.signal
      });
      clearTimeout(t);
      if (res.ok) return { ok: true, deliveryId, status: res.status };
      const txt = await res.text().catch(() => "");
      if (attempt >= input.retries) return { ok: false, deliveryId, status: res.status, error: txt || `Webhook failed: ${res.status}` };
    } catch (e) {
      clearTimeout(t);
      if (attempt >= input.retries) return { ok: false, deliveryId, status: 0, error: String(e?.message || e) };
    }
  }
  return { ok: false, deliveryId, status: 0, error: "Webhook failed" };
}
async function resolveTargetUserId(event, cfg) {
  const raw = cfg?.toUserId ?? cfg?.assignedToUserId ?? cfg?.userId ?? cfg?.assignTo;
  if (raw === "actor") return event.actorUserId;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (s === "actor") return event.actorUserId;
  }
  return event.actorUserId;
}
async function executeAction(event, automationName, action) {
  const actionType = String(action?.actionType || "").trim();
  const rawCfg = String(action?.configJson || "{}");
  let cfg = {};
  try {
    cfg = JSON.parse(rawCfg);
  } catch {
  }
  if (actionType === "task.create") {
    const title = String(cfg.title || `Automation: ${automationName}`).trim();
    const description = typeof cfg.description === "string" ? cfg.description : null;
    const priority = typeof cfg.priority === "string" ? cfg.priority : "medium";
    const type = typeof cfg.type === "string" ? cfg.type : "general";
    const dueInMinutes = typeof cfg.dueInMinutes === "number" && Number.isFinite(cfg.dueInMinutes) ? cfg.dueInMinutes : null;
    const assignedToUserId = await resolveTargetUserId(event, cfg);
    const dueAt = dueInMinutes !== null ? new Date(Date.now() + dueInMinutes * 60 * 1e3) : null;
    const task = await createTask({
      title,
      description,
      type,
      priority,
      dueAt,
      relatedEntityType: event.entity?.type || null,
      relatedEntityId: typeof event.entity?.id === "number" ? event.entity.id : null,
      assignedToUserId,
      createdBy: typeof event.actorUserId === "number" ? event.actorUserId : 0
    });
    return { ok: true, kind: "task", taskId: task.id };
  }
  if (actionType === "notification.create") {
    const toUserId = await resolveTargetUserId(event, cfg);
    if (!toUserId) return { ok: false, kind: "notification", error: "Missing target user" };
    const title = String(cfg.title || `Automation: ${automationName}`).trim();
    const description = typeof cfg.description === "string" ? cfg.description : null;
    const relatedType = event.entity?.type ? String(event.entity.type) : null;
    const relatedId = typeof event.entity?.id === "number" ? event.entity.id : null;
    const notif = await storage.createUserNotification({
      userId: toUserId,
      type: typeof cfg.type === "string" ? cfg.type : "system",
      title,
      description,
      relatedType,
      relatedId
    });
    const delivery = { inApp: { ok: true, notificationId: notif.id }, email: null, sms: null };
    if (cfg.email === true) {
      try {
        const u = await storage.getUserById(toUserId);
        const email = String(u?.email || "").trim();
        if (email) {
          const sent = await sendResendEmail({ to: email, subject: title, text: description || "" });
          delivery.email = { ok: true, id: sent.id };
        } else {
          delivery.email = { ok: false, skipped: true, error: "Missing email" };
        }
      } catch (e) {
        delivery.email = { ok: false, skipped: true, error: String(e?.message || e) };
      }
    }
    if (cfg.sms === true) {
      try {
        const u = await storage.getUserById(toUserId);
        const phone = String(u?.phone || "").trim();
        if (phone) {
          const sent = await telnyx.sendSms({ to: phone, body: [title, description].filter(Boolean).join("\n") });
          delivery.sms = { ok: true, sid: sent.messageId };
        } else {
          delivery.sms = { ok: false, skipped: true, error: "Missing phone" };
        }
      } catch (e) {
        delivery.sms = { ok: false, skipped: true, error: String(e?.message || e) };
      }
    }
    return { ok: true, kind: "notification", notificationId: notif.id, delivery };
  }
  if (actionType === "webhook.post") {
    const url = String(cfg.url || "").trim();
    const secret = String(cfg.secret || "").trim();
    if (!url || !/^https:\/\//i.test(url)) return { ok: false, kind: "webhook", error: "Invalid url" };
    if (!secret) return { ok: false, kind: "webhook", error: "Missing secret" };
    const timeoutMs = typeof cfg.timeoutMs === "number" && Number.isFinite(cfg.timeoutMs) ? cfg.timeoutMs : 5e3;
    const retries = typeof cfg.retries === "number" && Number.isFinite(cfg.retries) ? cfg.retries : 2;
    const body = {
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      teamId: event.teamId,
      actorUserId: event.actorUserId,
      entity: event.entity,
      payload: event.payload
    };
    const out = await postWebhook({ url, secret, body, timeoutMs, retries });
    return { ok: out.ok, kind: "webhook", deliveryId: out.deliveryId, status: out.status, error: out.ok ? null : out.error };
  }
  if (actionType === "tag.add") {
    const tag = String(cfg.tag || "").trim();
    if (!tag) return { ok: false, kind: "tag", error: "Missing tag name" };
    return { ok: true, kind: "tag", operation: "add", tag, entityType: event.entity?.type, entityId: event.entity?.id };
  }
  if (actionType === "tag.remove") {
    const tag = String(cfg.tag || "").trim();
    if (!tag) return { ok: false, kind: "tag", error: "Missing tag name" };
    return { ok: true, kind: "tag", operation: "remove", tag, entityType: event.entity?.type, entityId: event.entity?.id };
  }
  if (actionType === "stage.change") {
    const stage = String(cfg.stage || "").trim();
    if (!stage) return { ok: false, kind: "stage", error: "Missing target stage" };
    if (event.entity?.type !== "opportunity") return { ok: false, kind: "stage", error: "Stage change only applies to opportunities" };
    return { ok: true, kind: "stage", targetStage: stage, entityType: event.entity?.type, entityId: event.entity?.id };
  }
  if (actionType === "message.internal") {
    const toUserId = await resolveTargetUserId(event, cfg);
    if (!toUserId) return { ok: false, kind: "message", error: "Missing target user" };
    const msgTitle = String(cfg.title || "Internal message").trim();
    const msgBody = typeof cfg.description === "string" ? cfg.description : "";
    try {
      const msg = await storage.createInternalMessage({
        senderUserId: typeof event.actorUserId === "number" ? event.actorUserId : 0,
        recipientUserId: toUserId,
        body: msgBody || msgTitle,
        relatedType: event.entity?.type || null,
        relatedId: typeof event.entity?.id === "number" ? event.entity.id : null
      });
      return { ok: true, kind: "message", messageId: msg.id };
    } catch (e) {
      return { ok: false, kind: "message", error: String(e?.message || e) };
    }
  }
  return { ok: false, kind: "unknown", error: `Unknown actionType: ${actionType}` };
}
async function dispatchAutomationEvent(input) {
  const event = {
    ...input,
    occurredAt: input.occurredAt || (/* @__PURE__ */ new Date()).toISOString()
  };
  const depth = typeof input._automationDepth === "number" ? input._automationDepth : 0;
  if (depth >= MAX_AUTOMATION_DEPTH) return;
  const bundles = await storage.getEnabledAutomationsForEvent(event.teamId, event.eventType);
  for (const b of bundles) {
    const automation = b.automation;
    const autoId = automation.id;
    if (typeof input._sourceAutomationId === "number" && input._sourceAutomationId === autoId) {
      continue;
    }
    const conditionJson = b.condition ? String(b.condition.configJson || "") : "";
    const run = await storage.createAutomationRun({
      teamId: event.teamId,
      automationId: automation.id,
      eventType: event.eventType,
      eventJson: JSON.stringify(event),
      status: "running",
      error: null,
      deliveryId: null,
      finishedAt: null
    });
    try {
      const ok = evalCondition(event, conditionJson);
      if (!ok) {
        await storage.updateAutomationRun(run.id, { status: "skipped", finishedAt: /* @__PURE__ */ new Date() });
        continue;
      }
      const results = [];
      let deliveryId = null;
      for (const a of b.actions || []) {
        const r = await executeAction(event, String(automation.name || "Automation"), a);
        results.push(r);
        if (r?.kind === "webhook" && r?.deliveryId && !deliveryId) deliveryId = String(r.deliveryId);
        if (!r?.ok) throw new Error(String(r?.error || "Automation action failed"));
      }
      await storage.updateAutomationRun(run.id, {
        status: "success",
        error: null,
        deliveryId,
        finishedAt: /* @__PURE__ */ new Date()
      });
    } catch (e) {
      await storage.updateAutomationRun(run.id, { status: "error", error: String(e?.message || e), finishedAt: /* @__PURE__ */ new Date() });
    }
  }
}
async function dryRunAutomation(automationId, teamId, testEvent) {
  const bundles = await storage.getEnabledAutomationsForEvent(teamId, testEvent.eventType);
  const bundle = bundles.find((b) => b.automation.id === automationId);
  if (!bundle) {
    return { matched: false, actions: [], conditions: [] };
  }
  const event = {
    ...testEvent,
    occurredAt: testEvent.occurredAt || (/* @__PURE__ */ new Date()).toISOString()
  };
  const conditionJson = bundle.condition ? String(bundle.condition.configJson || "") : "";
  const conditionResults = [];
  let matched = true;
  if (conditionJson && conditionJson !== "{}") {
    try {
      const cfg = JSON.parse(conditionJson);
      if (Array.isArray(cfg?.rules)) {
        for (const rule of cfg.rules) {
          const field = String(rule?.path || rule?.field || "").trim();
          const op = String(rule?.operator || rule?.op || "eq").trim();
          const value = rule?.value;
          const met = evalRule(event, rule);
          conditionResults.push({ field, op, value: String(value ?? ""), met });
          if (!met) matched = false;
        }
      }
    } catch {
      matched = false;
    }
  }
  const actionResults = [];
  for (const a of bundle.actions || []) {
    const actionType = String(a?.actionType || "").trim();
    const rawCfg = String(a.configJson || "{}");
    let cfg = {};
    try {
      cfg = JSON.parse(rawCfg);
    } catch {
      cfg = {};
    }
    let wouldRun = matched;
    let reason;
    if (!matched) reason = "Conditions not met";
    if (actionType === "webhook.post" && !cfg.url) {
      wouldRun = false;
      reason = "Missing webhook URL";
    }
    if ((actionType === "tag.add" || actionType === "tag.remove") && !cfg.tag) {
      wouldRun = false;
      reason = "Missing tag name";
    }
    if (actionType === "stage.change" && !cfg.stage) {
      wouldRun = false;
      reason = "Missing target stage";
    }
    actionResults.push({ actionType, wouldRun, reason, config: cfg });
  }
  return { matched, actions: actionResults, conditions: conditionResults };
}

// server/services/esign/merge.ts
function getPathValue(obj, path3) {
  const parts = String(path3 || "").split(".").map((p) => p.trim()).filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in cur) cur = cur[p];
    else return "";
  }
  if (cur === null || cur === void 0) return "";
  if (typeof cur === "string" || typeof cur === "number" || typeof cur === "boolean") return String(cur);
  return "";
}
function mergeTemplate(content, mergeData) {
  const text2 = String(content || "");
  return text2.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, key) => getPathValue(mergeData, String(key || "")));
}

// server/services/esign/pdf.ts
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
function wrapText(text2, maxChars) {
  const words = String(text2 || "").replace(/\r\n/g, "\n").split(/\s+/g);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
async function generateSignedPdfBase64(input) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page = pdfDoc.addPage([612, 792]);
  const margin = 50;
  const width = page.getWidth() - margin * 2;
  let y = page.getHeight() - margin;
  page.drawText(String(input.title || "Document"), { x: margin, y, size: 16, font: fontBold, color: rgb(0, 0, 0) });
  y -= 26;
  const lines = wrapText(input.contentText || "", 92);
  for (const l of lines) {
    if (y < margin + 120) break;
    page.drawText(l, { x: margin, y, size: 10, font, color: rgb(0, 0, 0), maxWidth: width });
    y -= 14;
  }
  y -= 10;
  page.drawLine({ start: { x: margin, y }, end: { x: margin + width, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
  y -= 22;
  page.drawText("Signature", { x: margin, y, size: 12, font: fontBold, color: rgb(0, 0, 0) });
  y -= 20;
  if (input.signatureType === "typed") {
    const sig = String(input.signatureText || "").trim();
    page.drawText(sig || "\u2014", { x: margin, y, size: 18, font: fontBold, color: rgb(0, 0, 0) });
    y -= 28;
  } else {
    const b64 = String(input.signatureImageBase64 || "").trim();
    if (b64) {
      const bytes2 = Buffer.from(b64, "base64");
      let img = null;
      try {
        img = await pdfDoc.embedPng(bytes2);
      } catch {
        img = await pdfDoc.embedJpg(bytes2);
      }
      const targetH = 60;
      const scale = targetH / img.height;
      const targetW = img.width * scale;
      page.drawImage(img, { x: margin, y: y - targetH + 10, width: targetW, height: targetH });
      y -= targetH + 10;
    } else {
      page.drawText("\u2014", { x: margin, y, size: 18, font: fontBold, color: rgb(0, 0, 0) });
      y -= 28;
    }
  }
  page.drawText("Audit", { x: margin, y, size: 12, font: fontBold, color: rgb(0, 0, 0) });
  y -= 18;
  for (const l of input.auditLines || []) {
    if (y < margin) break;
    page.drawText(String(l), { x: margin, y, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
    y -= 12;
  }
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes).toString("base64");
}

// server/services/contracts/contract-service.ts
function fmtCurrency(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "$0.00";
}
function buildMergeData(ctx) {
  const now = /* @__PURE__ */ new Date();
  const date2 = {
    today: now.toISOString().split("T")[0],
    now: now.toISOString()
  };
  const currency = {};
  const buyer = ctx.buyer || {};
  const seller = ctx.seller || {};
  const contact = ctx.contact || {};
  const property = ctx.property || {};
  const lead = ctx.lead || {};
  const company = ctx.company || {};
  return {
    seller: {
      name: seller.name || seller.fullName || contact.name || "",
      address: seller.address || contact.address || "",
      email: seller.email || contact.email || "",
      phone: seller.phone || contact.phone || ""
    },
    buyer: {
      name: buyer.name || contact.name || "",
      company: buyer.company || company.name || "",
      email: buyer.email || contact.email || "",
      phone: buyer.phone || contact.phone || ""
    },
    property: {
      address: property.address || lead.address || "",
      city: property.city || lead.city || "",
      state: property.state || lead.state || "",
      zip: property.zipCode || lead.zipCode || ""
    },
    contract: {
      purchasePrice: fmtCurrency(property.price || property.arv || property.soldPrice || ""),
      earnestMoney: fmtCurrency(property.arv ? property.arv * 0.01 : ""),
      closingDate: property.soldDate ? new Date(property.soldDate).toISOString().split("T")[0] : "",
      inspectionDeadline: "",
      assignmentFee: fmtCurrency(""),
      paymentMethod: "Wire Transfer",
      commissionRate: "3%",
      commissionBasis: "gross sale price",
      rate: "$500",
      startDate: date2.today,
      endDate: ""
    },
    offer: {
      amount: fmtCurrency(property.price || property.arv || ""),
      earnestMoney: fmtCurrency(property.arv ? property.arv * 0.01 : ""),
      closingDate: property.soldDate ? new Date(property.soldDate).toISOString().split("T")[0] : ""
    },
    assignor: buyer,
    assignee: buyer,
    party1: buyer,
    party2: buyer,
    contractor: buyer,
    referrer: buyer,
    company: {
      name: company.name || "",
      address: company.address || "",
      phone: company.phone || "",
      email: company.email || ""
    },
    date: date2,
    currency
  };
}
function validateContractForSend(contract, signers, fields) {
  const errors = [];
  if (!contract.templateId) errors.push("Template is required");
  if (!contract.propertyId) errors.push("Property is required");
  if (!contract.purchasePrice && !contract.amount) errors.push("Purchase price is required");
  const requiredSigners = signers.filter((s) => s.status !== "declined");
  if (requiredSigners.length === 0) errors.push("At least one signer is required");
  const missingEmails = signers.filter((s) => !s.email && !s.phone);
  if (missingEmails.length > 0) errors.push("All signers must have an email or phone");
  const requiredFields = fields.filter((f) => f.required);
  const missingFieldValues = requiredFields.filter((f) => !f.fieldValue);
  if (missingFieldValues.length > 0) errors.push(`${missingFieldValues.length} required field(s) have no value`);
  return errors;
}
function applyTemplateToContract(contract, template, mergeData) {
  const content = String(template.content || "");
  return mergeTemplate(content, mergeData);
}

// server/services/contracts/email.ts
async function sendContractSigningEmail(input) {
  const from = input.from || process.env.RESEND_FROM || "";
  if (!from) throw new Error("RESEND_FROM is not configured");
  const subject = `Please sign: ${input.contractTitle}`;
  const expiryText = input.expiresAt ? `This link expires on ${new Date(input.expiresAt).toLocaleDateString()}.` : "";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">You're invited to sign a document</h2>
      <p>Hello ${input.signerName || ""},</p>
      <p>You have been requested to sign <strong>${input.contractTitle}</strong>.</p>
      <p style="margin: 24px 0;">
        <a href="${input.signingUrl}" style="background-color: #2563eb; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Sign Document</a>
      </p>
      <p style="color: #666; font-size: 14px;">${expiryText}</p>
      <p style="color: #666; font-size: 14px;">If the button above doesn't work, copy and paste this link into your browser:<br/>${input.signingUrl}</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="color: #999; font-size: 12px;">Sent via ${input.companyName || "OceanLuxe CRM"} \u2022 This is a legally binding electronic signature request.</p>
    </div>
  `;
  return sendResendEmail({
    to: input.to,
    subject,
    html,
    from
  });
}

// server/media/propertyPhotos.ts
import { S3Client as S3Client3, PutObjectCommand as PutObjectCommand3, GetObjectCommand as GetObjectCommand3 } from "@aws-sdk/client-s3";
import { getSignedUrl as getSignedUrl3 } from "@aws-sdk/s3-request-presigner";
import crypto9 from "node:crypto";
import path2 from "node:path";
function getPropertyPhotoConfig() {
  const bucket = String(process.env.PROPERTY_PHOTOS_BUCKET || "").trim();
  const region = String(process.env.PROPERTY_PHOTOS_REGION || "").trim();
  if (!bucket || !region) return null;
  const endpoint = String(process.env.PROPERTY_PHOTOS_ENDPOINT || "").trim() || void 0;
  const accessKeyId = String(process.env.PROPERTY_PHOTOS_ACCESS_KEY_ID || "").trim() || void 0;
  const secretAccessKey = String(process.env.PROPERTY_PHOTOS_SECRET_ACCESS_KEY || "").trim() || void 0;
  return { bucket, region, endpoint, accessKeyId, secretAccessKey };
}
function isPropertyPhotoStorageConfigured() {
  return getPropertyPhotoConfig() !== null;
}
function getS3Client(config) {
  return new S3Client3({
    region: config.region,
    endpoint: config.endpoint,
    credentials: config.accessKeyId && config.secretAccessKey ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } : void 0
  });
}
function safeBasename2(name) {
  const base = path2.basename(name || "photo");
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_");
}
async function uploadPropertyPhoto(input) {
  const config = getPropertyPhotoConfig();
  if (!config) throw new Error("Property photo storage is not configured");
  const s3 = getS3Client(config);
  const ext = path2.extname(input.originalName || "").slice(0, 16);
  const name = safeBasename2(input.originalName || "photo");
  const filePart = name || `photo${ext || ""}`;
  const storageKey = `opportunities/${input.opportunityId}/${crypto9.randomUUID()}-${filePart}`;
  await s3.send(
    new PutObjectCommand3({
      Bucket: config.bucket,
      Key: storageKey,
      Body: input.body,
      ContentType: input.contentType
    })
  );
  return { storageKey };
}
async function getPropertyPhotoSignedUrl(storageKey) {
  const config = getPropertyPhotoConfig();
  if (!config) return null;
  const s3 = getS3Client(config);
  return await getSignedUrl3(
    s3,
    new GetObjectCommand3({
      Bucket: config.bucket,
      Key: storageKey
    }),
    { expiresIn: 60 * 10 }
  );
}

// server/routes.ts
import Stripe from "stripe";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
var require2 = createRequire(import.meta.url);
var packageJson = (() => {
  try {
    return require2("../package.json");
  } catch {
    return {};
  }
})();
function authJwtSecret() {
  const secret = process.env.AUTH_JWT_SECRET || process.env.SESSION_SECRET;
  if (!secret || !String(secret).trim()) return null;
  return new TextEncoder().encode(String(secret));
}
var MAGIC_SIGNATURES = [
  {
    mime: "application/pdf",
    patterns: [
      [0, [37, 80, 68, 70]]
    ]
  },
  {
    mime: "image/png",
    patterns: [
      [0, [137, 80, 78, 71, 13, 10, 26, 10]]
    ]
  },
  {
    mime: "image/jpeg",
    patterns: [
      [0, [255, 216, 255]]
    ]
  },
  {
    mime: "image/gif",
    patterns: [
      [0, [71, 73, 70, 56, 55, 97]],
      [0, [71, 73, 70, 56, 57, 97]]
    ]
  },
  {
    mime: "image/webp",
    patterns: [
      [8, [87, 69, 66, 80]]
    ]
  },
  {
    mime: "application/zip",
    patterns: [
      [0, [80, 75, 3, 4]],
      [0, [80, 75, 5, 6]],
      [0, [80, 75, 7, 8]]
    ]
  },
  {
    mime: "application/x-rar-compressed",
    patterns: [
      [0, [82, 97, 114, 33, 26, 7, 0]],
      [0, [82, 97, 114, 33, 26, 7, 1, 0]]
    ]
  },
  {
    mime: "text/plain",
    patterns: [
      [0, [239, 187, 191]],
      [0, []]
    ]
  }
];
function detectMimeFromMagic(buf) {
  for (const entry of MAGIC_SIGNATURES) {
    for (const [offset, bytes] of entry.patterns) {
      if (offset + bytes.length > buf.length) continue;
      if (bytes.length === 0) continue;
      let match = true;
      for (let i = 0; i < bytes.length; i++) {
        if (buf[offset + i] !== bytes[i]) {
          match = false;
          break;
        }
      }
      if (match) return entry.mime;
    }
  }
  return null;
}
function isDbConnectivityError2(error) {
  const code = error?.code;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ETIMEDOUT") return true;
  if (code === "57P01" || code === "57P02" || code === "57P03") return true;
  if (code === "08006" || code === "08001" || code === "08004") return true;
  if (code === "DEPTH_ZERO_SELF_SIGNED_CERT" || code === "SELF_SIGNED_CERT_IN_CHAIN") return true;
  if (code === "ERR_TLS_CERT_ALTNAME_INVALID" || code === "CERT_HAS_EXPIRED") return true;
  const nested = error?.errors;
  if (Array.isArray(nested)) return nested.some(isDbConnectivityError2);
  const message = String(error?.message || "");
  if (message.includes("DATABASE_URL")) return true;
  if (/network error|non-101|socket hang up|connect econn|getaddrinfo|econnrefused|enotfound|etimedout/i.test(message)) return true;
  const cause = error?.cause;
  if (cause && cause !== error) return isDbConnectivityError2(cause);
  return false;
}
function parseLimitOffset(query) {
  const DEFAULT_LIMIT = 50;
  const MAX_LIMIT = process.env.NODE_ENV === "production" ? 100 : 500;
  let limit = DEFAULT_LIMIT;
  const limitRaw = query?.limit;
  if (typeof limitRaw === "string" && limitRaw.trim() !== "") {
    const parsed = Number.parseInt(limitRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT);
    }
  }
  let offset = 0;
  const offsetRaw = query?.offset;
  if (typeof offsetRaw === "string" && offsetRaw.trim() !== "") {
    const parsed = Number.parseInt(offsetRaw, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      offset = parsed;
    }
  }
  return { limit, offset };
}
async function issueAuthToken(payload) {
  const secret = authJwtSecret();
  if (!secret) return null;
  return await new SignJWT({ email: payload.email }).setProtectedHeader({ alg: "HS256" }).setSubject(payload.sub).setIssuedAt().setExpirationTime("7d").sign(secret);
}
function isManagerUser(user) {
  const role = String(user?.role || "").toLowerCase();
  return !!user?.isSuperAdmin || role === "admin" || role === "manager" || role === "owner";
}
function isAdminUser(user) {
  return isManagerUser(user);
}
function isSameUserOrAdmin(user, targetUserId) {
  return Number(user?.id) === Number(targetUserId) || isManagerUser(user);
}
var twoFactorAttempts = /* @__PURE__ */ new Map();
function checkTwoFactorRateLimit(key, max = 5, windowMs = 15 * 60 * 1e3) {
  const now = Date.now();
  const entry = twoFactorAttempts.get(key);
  if (!entry || entry.resetAt < now) {
    twoFactorAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count += 1;
  return true;
}
async function notifyUser(opts) {
  try {
    const prefs = await storage.getNotificationPreferencesByUserId(opts.userId);
    if (prefs && prefs.inAppEnabled === false) return false;
    const base = defaultNotificationCategories();
    const stored = prefs?.categories && typeof prefs.categories === "object" ? prefs.categories : {};
    const cats = { ...base, ...stored };
    if (cats[opts.category] === false) return false;
    const created = await storage.createUserNotificationDedup({
      userId: opts.userId,
      type: opts.category,
      title: opts.title,
      description: opts.description ?? null,
      read: false,
      relatedId: opts.relatedId ?? null,
      relatedType: opts.relatedType ?? null,
      eventKey: opts.eventKey ?? null
    });
    return Boolean(created);
  } catch (error) {
    console.error("[notifyUser] failed:", error);
    return false;
  }
}
async function notifyOpportunityOwner(opts) {
  try {
    const property = await storage.getPropertyById(opts.propertyId);
    const ownerId = Number(property?.assignedTo);
    if (!ownerId) return;
    if (opts.actorUserId && Number(opts.actorUserId) === ownerId) return;
    await notifyUser({
      userId: ownerId,
      category: opts.category,
      title: opts.title,
      description: opts.description ?? null,
      relatedType: opts.relatedType ?? "opportunity",
      relatedId: opts.propertyId,
      eventKey: opts.eventKey
    });
  } catch (error) {
    console.error("[notifyOpportunityOwner] failed:", error);
  }
}
function userDisplayName(user) {
  const first = String(user?.firstName || "").trim();
  const last = String(user?.lastName || "").trim();
  const name = [first, last].filter(Boolean).join(" ");
  return name || String(user?.email || "team member");
}
function isoDateOnly(input) {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(String(input));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
function parseMoney(input) {
  const n = Number.parseFloat(String(input ?? ""));
  if (!Number.isFinite(n)) return null;
  return n;
}
async function ensureCommissionLedgerForEvent(event) {
  const sourceType = String(event?.sourceType || "");
  const sourceId = Number(event?.sourceId);
  if (!sourceType || !Number.isFinite(sourceId)) return;
  let participants = await storage.listDealParticipants({ sourceType, sourceId });
  if (!participants.length) {
    let derivedUserId = null;
    if (sourceType === "contract") {
      const contract = await storage.getContractById(sourceId);
      const propertyId = contract?.propertyId ? Number(contract.propertyId) : null;
      if (propertyId) {
        const property = await storage.getPropertyById(propertyId);
        if (property?.assignedTo) derivedUserId = Number(property.assignedTo);
      }
    } else if (sourceType === "deal_assignment") {
      const assignment = await storage.getDealAssignmentById(sourceId);
      const propertyId = assignment?.propertyId ? Number(assignment.propertyId) : null;
      if (propertyId) {
        const property = await storage.getPropertyById(propertyId);
        if (property?.assignedTo) derivedUserId = Number(property.assignedTo);
      }
    }
    if (derivedUserId) {
      await storage.upsertDealParticipant({ sourceType, sourceId, userId: derivedUserId, role: "primary" });
      participants = await storage.listDealParticipants({ sourceType, sourceId });
    }
  }
  if (!participants.length) return;
  const gross = parseMoney(event?.grossAmount);
  for (const p of participants) {
    const pct = parseMoney(p.splitPct);
    const amount = gross !== null && pct !== null ? gross * (pct / 100) : 0;
    await storage.upsertCommissionLedgerEntry({
      eventId: event.id,
      userId: p.userId,
      amount: amount.toFixed(2),
      status: "draft",
      ruleSnapshot: { grossAmount: gross, splitPct: pct, method: pct !== null ? "pct_of_gross" : "manual" }
    });
  }
}
async function syncCommissionEventsForContract(contract) {
  const contractId = Number(contract?.id);
  if (!Number.isFinite(contractId)) return;
  const signDate = isoDateOnly(contract?.signDate);
  const closeDate = isoDateOnly(contract?.closeDate);
  const grossAmount = parseMoney(contract?.amount);
  if (signDate) {
    const ev = await storage.upsertCommissionEvent({
      sourceType: "contract",
      sourceId: contractId,
      milestone: "contract_signed",
      eventDate: signDate,
      grossAmount: grossAmount === null ? null : grossAmount.toFixed(2),
      metadata: { contractId }
    });
    await ensureCommissionLedgerForEvent(ev);
  }
  if (closeDate) {
    const ev = await storage.upsertCommissionEvent({
      sourceType: "contract",
      sourceId: contractId,
      milestone: "contract_closed",
      eventDate: closeDate,
      grossAmount: grossAmount === null ? null : grossAmount.toFixed(2),
      metadata: { contractId }
    });
    await ensureCommissionLedgerForEvent(ev);
  }
}
async function syncCommissionEventsForDealAssignment(assignment) {
  const id = Number(assignment?.id);
  if (!Number.isFinite(id)) return;
  const payoutReceived = Boolean(assignment.payoutReceived);
  const payoutAmount = parseMoney(assignment.payoutAmount);
  const closingDate = isoDateOnly(assignment.closingDate) || isoDateOnly(/* @__PURE__ */ new Date());
  if (payoutReceived) {
    const ev = await storage.upsertCommissionEvent({
      sourceType: "deal_assignment",
      sourceId: id,
      milestone: "assignment_payout_received",
      eventDate: closingDate,
      grossAmount: payoutAmount === null ? null : payoutAmount.toFixed(2),
      metadata: { dealAssignmentId: id }
    });
    await ensureCommissionLedgerForEvent(ev);
  }
}
function isConciergeUser(user) {
  const role = String(user?.role || "").trim().toLowerCase();
  return role === "concierge";
}
function isXpOpsUser(user) {
  return isAdminUser(user) || isConciergeUser(user);
}
async function requireAuth(req, res) {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }
  const user = await storage.getUserById(userId);
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }
  return user;
}
function teamRoleRank(role) {
  const r = String(role || "").trim().toLowerCase();
  if (r === "owner") return 4;
  if (r === "admin") return 3;
  if (r === "member") return 2;
  if (r === "viewer") return 1;
  return 0;
}
async function requireTeamMembership(req, res, input) {
  const user = await requireAuth(req, res);
  if (!user) return null;
  if (user.isSuperAdmin) return { user, membership: { role: "owner" } };
  const membership = await storage.getTeamMemberByTeamAndUser(input.teamId, user.id);
  if (!membership || String(membership.status || "").toLowerCase() !== "active") {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }
  const min = input.minRole ? teamRoleRank(input.minRole) : 1;
  if (teamRoleRank(membership.role) < min) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }
  return { user, membership };
}
async function getOrInitActiveTeamId(req, userId) {
  try {
    const active = typeof req.session?.activeTeamId === "number" ? req.session.activeTeamId : null;
    if (active) {
      const m = await storage.getTeamMemberByTeamAndUser(active, userId);
      if (m && String(m.status || "").toLowerCase() === "active") return active;
    }
    const teams2 = await storage.getTeamsForUser(userId);
    const first = teams2?.[0]?.id ? Number(teams2[0].id) : null;
    if (first) req.session.activeTeamId = first;
    return first;
  } catch {
    return null;
  }
}
async function requireActiveTeam(req, res, input) {
  const user = await requireAuth(req, res);
  if (!user) return null;
  const teamId = await getOrInitActiveTeamId(req, user.id);
  if (!teamId) {
    res.status(400).json({ message: "No active team selected" });
    return null;
  }
  if (user.isSuperAdmin) return { user, membership: { role: "owner" }, teamId };
  const membership = await storage.getTeamMemberByTeamAndUser(teamId, user.id);
  if (!membership || String(membership.status || "").toLowerCase() !== "active") {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }
  const min = input?.minRole ? teamRoleRank(input.minRole) : 1;
  if (teamRoleRank(membership.role) < min) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }
  return { user, membership, teamId };
}
function makeInviteCode() {
  return crypto10.randomBytes(6).toString("hex");
}
async function requireAssigneeInActiveTeam(req, res, user, assigneeUserId) {
  const teamId = await getOrInitActiveTeamId(req, user.id);
  if (!teamId) {
    if (assigneeUserId === user.id) return true;
    res.status(400).json({ message: "No active team selected" });
    return false;
  }
  if (user.isSuperAdmin) return true;
  const m = await storage.getTeamMemberByTeamAndUser(teamId, assigneeUserId);
  if (!m || String(m.status || "").toLowerCase() !== "active") {
    res.status(400).json({ message: "Assignee is not in your active team" });
    return false;
  }
  return true;
}
var isFeatureEnabled = createIsFeatureEnabled(storage.getUserFeatureFlag.bind(storage));
function isImportExportEntityType(entityType) {
  return entityType === "lead" || entityType === "opportunity" || entityType === "contact" || entityType === "buyer";
}
async function writeAuthAuditLog(input) {
  try {
    const metadataText = input.metadata ? JSON.stringify(input.metadata) : null;
    await db.execute(sql4`
      INSERT INTO auth_audit_logs (action, outcome, user_id, email, ip, user_agent, metadata)
      VALUES (
        ${input.action},
        ${input.outcome},
        ${input.userId ?? null},
        ${input.email ?? null},
        ${input.ip ?? null},
        ${input.userAgent ?? null},
        ${metadataText}
      )
    `);
  } catch {
  }
}
function isLoopbackIp(ip) {
  if (!ip) return false;
  const v = ip.trim();
  return v === "127.0.0.1" || v === "::1" || v === "::ffff:127.0.0.1";
}
function isDevEmployeeBypassEnabled() {
  if (process.env.NODE_ENV === "production") return false;
  const v = String(process.env.DEV_AUTH_BYPASS_ENABLED || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}
function toAddressKey(address) {
  return address.trim().toLowerCase();
}
function parseJsonArrayText2(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  try {
    const parsed = JSON.parse(String(v));
    if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean);
    return [];
  } catch {
    return [];
  }
}
function resolvePropertyImageSrc(v) {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  if (s.startsWith("property-photo:")) {
    const key = s.slice("property-photo:".length);
    return `/api/property-photos/${encodeURIComponent(key)}`;
  }
  return s;
}
function resolvePropertyImages(images) {
  if (!Array.isArray(images)) return [];
  return images.map(resolvePropertyImageSrc).filter((x) => !!x);
}
function toNumberOrNull(v) {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}
function haversineMiles(a, b) {
  const R = 3958.7613;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
var OPPORTUNITY_STAGES = [
  "lead",
  "contacted",
  "negotiating",
  "under_contract",
  "in_disposition",
  "reserved",
  "sold",
  "closed",
  "dead",
  "voided"
];
var OPPORTUNITY_STAGE_CONFIG = {
  lead: { label: "Lead", expects: ["Contact seller", "Initial outreach", "Qualify property"] },
  contacted: { label: "Contacted", expects: ["Schedule showing", "Send CMA", "Gather seller details"] },
  negotiating: { label: "Negotiating", expects: ["Review offer terms", "Counter offer", "Finalize contract terms"] },
  under_contract: { label: "Under Contract", expects: ["EMD deposit", "Inspection deadline", "Due diligence", "Secure financing"] },
  in_disposition: { label: "In Disposition", expects: ["Build buyer list", "Create public listing", "Schedule tours"] },
  reserved: { label: "Reserved", expects: ["Confirm buyer commitment", "Coordinate closing", "Assign contract"] },
  sold: { label: "Sold", expects: ["Close deal", "Receive assignment fee", "Disburse funds"] },
  closed: { label: "Closed", expects: ["Post-close wrap-up", "Archive documents"] },
  dead: { label: "Dead", expects: ["Document reasons", "Attempt re-engagement"] },
  voided: { label: "Voided", expects: ["Reason recorded", "Cancel related tasks", "Archive"] }
};
function isValidStage(stage) {
  return OPPORTUNITY_STAGES.includes(stage);
}
function canTransitionStage(from, to) {
  if (from === to) return true;
  const terminal = /* @__PURE__ */ new Set(["closed", "dead", "voided"]);
  if (terminal.has(from) && !terminal.has(to)) return false;
  return true;
}
function generateSlug(title) {
  const base = String(title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const rand = crypto10.randomBytes(4).toString("hex");
  return `${base || "listing"}-${rand}`;
}
function generateListingToken() {
  return crypto10.randomBytes(24).toString("hex");
}
async function logOpportunityEvent(opportunityId, eventType, title, description, actorUserId, actorType = "user", metadata) {
  try {
    await storage.createOpportunityEvent({
      opportunityId,
      eventType,
      title,
      description: description || null,
      actorType,
      actorUserId: actorUserId || null,
      metadataJson: metadata ? JSON.stringify(metadata) : null
    });
  } catch {
  }
}
async function ensureOpportunityTask(propertyId, userId, def) {
  try {
    const existing = await storage.getTasksByRelatedEntity("opportunity", propertyId);
    const key = String(def.title || "").trim();
    if (existing.some((t) => String(t.title || "").trim() === key)) return false;
    await createTask({
      relatedEntityType: "opportunity",
      relatedEntityId: propertyId,
      assignedToUserId: userId,
      title: def.title,
      description: def.description ?? null,
      type: def.type,
      priority: def.priority,
      dueAt: def.dueAt,
      createdBy: userId
    });
    return true;
  } catch {
    return false;
  }
}
var inquiryRateLimiter = /* @__PURE__ */ new Map();
function checkInquiryRateLimit(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1e3;
  const maxRequests = 5;
  const timestamps = inquiryRateLimiter.get(ip) || [];
  const valid = timestamps.filter((t) => now - t < windowMs);
  if (valid.length >= maxRequests) {
    inquiryRateLimiter.set(ip, valid);
    return false;
  }
  valid.push(now);
  inquiryRateLimiter.set(ip, valid);
  return true;
}
async function registerRoutes(app2, opts) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowed = /* @__PURE__ */ new Set([
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain",
        "text/csv",
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp"
      ]);
      if (allowed.has(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`Unsupported file type: ${file.mimetype}`));
      }
    }
  });
  const mode = opts?.mode ?? "server";
  app2.use("/api", async (req, _res, next) => {
    try {
      if (req.session?.userId) return next();
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) return next();
      const secret = authJwtSecret();
      if (!secret) return next();
      const token = authHeader.slice("Bearer ".length);
      const { payload } = await jwtVerify2(token, secret);
      const sub = payload.sub ? parseInt(String(payload.sub), 10) : NaN;
      if (!Number.isFinite(sub)) return next();
      req.session.userId = sub;
      if (typeof payload.email === "string") req.session.email = payload.email;
      next();
    } catch {
      next();
    }
  });
  app2.use("/api/v1/telecom/webhooks/telnyx", createTelnyxWebhookRouter());
  app2.get("/api/crm/fields", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const entityType = String(req.query.entityType || "");
    if (!isImportExportEntityType(entityType)) {
      return res.status(400).json({ message: "Invalid entityType" });
    }
    return res.json({ entityType, fields: getCrmFieldDefs(entityType) });
  });
  app2.post("/api/crm/import/preview", upload.single("file"), async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const entityType = String(req.body.entityType || "");
    if (!isImportExportEntityType(entityType)) {
      return res.status(400).json({ message: "Invalid entityType" });
    }
    const file = req.file;
    if (!file) return res.status(400).json({ message: "file is required" });
    const format = detectFormat(file.originalname, file.mimetype);
    if (!format) return res.status(400).json({ message: "Unsupported file type" });
    const parsed = await parseUpload(file.buffer, format);
    const headers = parsed.headers;
    const samples = parsed.rows.slice(0, 5);
    const suggested = suggestMapping(entityType, headers);
    return res.json({
      entityType,
      format,
      headers,
      sampleRows: samples,
      suggestedMapping: suggested,
      totalRows: parsed.rows.length
    });
  });
  app2.post("/api/crm/import/jobs", upload.single("file"), async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const entityType = String(req.body.entityType || "");
    if (!isImportExportEntityType(entityType)) {
      return res.status(400).json({ message: "Invalid entityType" });
    }
    const file = req.file;
    if (!file) return res.status(400).json({ message: "file is required" });
    const mapping = req.body.mapping ? JSON.parse(String(req.body.mapping)) : {};
    const options = req.body.options ? JSON.parse(String(req.body.options)) : { onDuplicate: "merge" };
    const format = detectFormat(file.originalname, file.mimetype);
    if (!format) return res.status(400).json({ message: "Unsupported file type" });
    const fileBase64 = file.buffer.toString("base64");
    const job = await createImportJob({
      entityType,
      createdBy: user.id,
      fileBase64,
      originalFilename: file.originalname,
      fileMimeType: file.mimetype,
      mapping,
      options
    });
    if (mode === "server") {
      setImmediate(() => {
        processImportJob(job.id).catch((e) => {
          console.error(JSON.stringify({
            ts: (/* @__PURE__ */ new Date()).toISOString(),
            event: "crm_import",
            kind: "process_failed",
            jobId: job.id,
            message: String(e?.message || e),
            code: e?.code ? String(e.code) : null
          }));
        });
      });
    } else {
      await processImportJob(job.id, { maxRows: 100, maxBatches: 1, resume: true });
    }
    return res.status(201).json({ jobId: job.id });
  });
  app2.post("/api/crm/import/jobs/:id/run", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const jobId = parseInt(req.params.id, 10);
    if (!Number.isFinite(jobId)) return res.status(400).json({ message: "Invalid job id" });
    const job = await getImportJob(jobId);
    if (!job) return res.status(404).json({ message: "Not found" });
    if (job.createdBy !== user.id) return res.status(403).json({ message: "Forbidden" });
    await processImportJob(jobId, { maxRows: 100, maxBatches: 1, resume: true });
    const nextJob = await getImportJob(jobId);
    const errors = await listImportJobErrors(jobId, 50);
    return res.json({ job: nextJob, errors });
  });
  app2.get("/api/crm/import/jobs", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const rows = await db.select().from(crmImportJobs).where(eq3(crmImportJobs.createdBy, user.id)).orderBy(desc2(crmImportJobs.updatedAt)).limit(20);
    return res.json({ jobs: rows });
  });
  app2.get("/api/crm/import/jobs/:id", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const jobId = parseInt(req.params.id, 10);
    if (!Number.isFinite(jobId)) return res.status(400).json({ message: "Invalid job id" });
    const job = await getImportJob(jobId);
    if (!job) return res.status(404).json({ message: "Not found" });
    if (job.createdBy !== user.id) return res.status(403).json({ message: "Forbidden" });
    const errors = await listImportJobErrors(jobId, 50);
    return res.json({ job, errors });
  });
  app2.get("/api/crm/import/jobs/:id/errors.csv", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const jobId = parseInt(req.params.id, 10);
    if (!Number.isFinite(jobId)) return res.status(400).json({ message: "Invalid job id" });
    const job = await getImportJob(jobId);
    if (!job) return res.status(404).json({ message: "Not found" });
    if (job.createdBy !== user.id) return res.status(403).json({ message: "Forbidden" });
    const errors = await listImportJobErrors(jobId, 1e4);
    const esc = (v) => {
      const s = String(v ?? "");
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = ["rowNumber,errors,rawRow"];
    for (const e of errors) lines.push([e.rowNumber, e.errors, e.rawRow || ""].map(esc).join(","));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="import-errors-${jobId}.csv"`);
    return res.send(lines.join("\n"));
  });
  app2.post("/api/crm/export/jobs", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const entityType = String(req.body.entityType || "");
    if (!isImportExportEntityType(entityType)) {
      return res.status(400).json({ message: "Invalid entityType" });
    }
    const format = String(req.body.format || "csv");
    if (format !== "csv" && format !== "xlsx") return res.status(400).json({ message: "Invalid format" });
    const filters = req.body.filters || {};
    const columns = Array.isArray(req.body.columns) ? req.body.columns : [];
    const { job, token } = await createExportJob({
      entityType,
      createdBy: user.id,
      format,
      filters,
      columns
    });
    if (mode === "server") {
      setImmediate(() => {
        processExportJob(job.id).catch((e) => {
          console.error(JSON.stringify({
            ts: (/* @__PURE__ */ new Date()).toISOString(),
            event: "crm_export",
            kind: "process_failed",
            jobId: job.id,
            message: String(e?.message || e),
            code: e?.code ? String(e.code) : null
          }));
        });
      });
    } else {
      await processExportJob(job.id, { resume: true });
    }
    const downloadUrl = `/api/crm/export/files/${job.id}/download?token=${encodeURIComponent(token)}`;
    return res.status(201).json({ jobId: job.id, downloadUrl });
  });
  app2.post("/api/crm/export/jobs/:id/run", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const exportId = parseInt(req.params.id, 10);
    if (!Number.isFinite(exportId)) return res.status(400).json({ message: "Invalid export id" });
    const job = await getExportJob(exportId);
    if (!job) return res.status(404).json({ message: "Not found" });
    if (job.createdBy !== user.id) return res.status(403).json({ message: "Forbidden" });
    await processExportJob(exportId, { resume: true });
    const nextJob = await getExportJob(exportId);
    return res.json({ job: nextJob });
  });
  app2.get("/api/crm/export/jobs", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const rows = await db.select().from(crmExportFiles).where(eq3(crmExportFiles.createdBy, user.id)).orderBy(desc2(crmExportFiles.updatedAt)).limit(20);
    return res.json({ jobs: rows });
  });
  app2.get("/api/crm/export/jobs/:id", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const exportId = parseInt(req.params.id, 10);
    if (!Number.isFinite(exportId)) return res.status(400).json({ message: "Invalid export id" });
    const job = await getExportJob(exportId);
    if (!job) return res.status(404).json({ message: "Not found" });
    if (job.createdBy !== user.id) return res.status(403).json({ message: "Forbidden" });
    return res.json({ job });
  });
  app2.post("/api/crm/export/jobs/:id/renew-download", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const exportId = parseInt(req.params.id, 10);
    if (!Number.isFinite(exportId)) return res.status(400).json({ message: "Invalid export id" });
    const job = await getExportJob(exportId);
    if (!job) return res.status(404).json({ message: "Not found" });
    if (job.createdBy !== user.id) return res.status(403).json({ message: "Forbidden" });
    if (job.status !== "completed") return res.status(409).json({ message: "Export not ready" });
    const { token } = await renewExportToken(exportId);
    const downloadUrl = `/api/crm/export/files/${exportId}/download?token=${encodeURIComponent(token)}`;
    return res.json({ downloadUrl });
  });
  app2.get("/api/crm/export/files/:id/download", async (req, res) => {
    const exportId = parseInt(req.params.id, 10);
    if (!Number.isFinite(exportId)) return res.status(400).json({ message: "Invalid export id" });
    const token = String(req.query.token || "");
    if (!token) return res.status(401).json({ message: "Missing token" });
    const job = await getExportJob(exportId);
    if (!job) return res.status(404).json({ message: "Not found" });
    if (job.status !== "completed") return res.status(409).json({ message: "Export not ready" });
    if (!verifyExportToken(job, token)) return res.status(403).json({ message: "Invalid token" });
    if (!job.contentBase64 || !job.mimeType) return res.status(500).json({ message: "Export content missing" });
    const buf = Buffer.from(String(job.contentBase64), "base64");
    res.setHeader("Content-Type", job.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${job.filename || `export-${exportId}`}"`);
    return res.send(buf);
  });
  app2.get("/api/health", async (req, res) => {
    try {
      await storage.getUserByEmail("test@example.com");
      res.json({ status: "ok", db: "connected", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    } catch (error) {
      console.error("Health check failed:", error);
      res.status(500).json({ status: "error", db: "disconnected", message: error.message });
    }
  });
  app2.get("/api/version", async (_req, res) => {
    const version = String(process.env.APP_VERSION || packageJson?.version || "0.0.0");
    const commitSha = String(
      process.env.VERCEL_GIT_COMMIT_SHA || process.env.COMMIT_SHA || process.env.GITHUB_SHA || process.env.RENDER_GIT_COMMIT || ""
    ) || null;
    const buildId = String(process.env.VERCEL_BUILD_ID || process.env.BUILD_ID || "") || null;
    res.json({ version, commitSha, buildId, nodeEnv: process.env.NODE_ENV || null });
  });
  const stripeApiVersion = "2026-04-22.dahlia";
  function xpNormalizeSlug(input) {
    return String(input || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
  }
  function xpParseDate(input) {
    if (input instanceof Date) return Number.isFinite(input.getTime()) ? input : null;
    const s = String(input || "").trim();
    if (!s) return null;
    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  function xpMoneyToCents(input) {
    const n = typeof input === "number" ? input : parseFloat(String(input || "0"));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100);
  }
  const xpPaymentModeSchema = z4.enum(["deposit", "full"]);
  const xpItinerarySchema = z4.object({
    sections: z4.array(
      z4.object({
        title: z4.string().trim().min(1),
        bullets: z4.array(z4.string().trim().min(1)).default([])
      })
    ).default([])
  }).strict();
  function xpStringList(input) {
    if (!input) return null;
    if (Array.isArray(input)) {
      const items2 = input.map((v) => String(v || "").trim()).filter(Boolean);
      return items2.length ? items2 : null;
    }
    const raw = String(input || "").trim();
    if (!raw) return null;
    const items = raw.split(",").map((v) => String(v || "").trim()).filter(Boolean);
    return items.length ? items : null;
  }
  async function xpPickAdminUser() {
    try {
      const users2 = await storage.getUsers(200, 0);
      const su = users2.find((u) => !!u?.isSuperAdmin);
      if (su) return su;
      const admin = users2.find((u) => String(u?.role || "").toLowerCase() === "admin");
      if (admin) return admin;
      return users2[0] || null;
    } catch {
      return null;
    }
  }
  app2.get("/api/xp/experiences", async (_req, res) => {
    const items = await storage.listXpExperiences({ activeOnly: true });
    return res.json({ items });
  });
  app2.get("/api/xp/experiences/:slug", async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    const experience = await storage.getXpExperienceBySlug(slug);
    if (!experience || !experience.active) return res.status(404).json({ message: "Not found" });
    return res.json({ experience });
  });
  app2.get("/api/xp/experiences/:slug/availability", async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    const experience = await storage.getXpExperienceBySlug(slug);
    if (!experience || !experience.active) return res.status(404).json({ message: "Not found" });
    const from = xpParseDate(req.query.from);
    const to = xpParseDate(req.query.to);
    if (!from || !to) return res.status(400).json({ message: "from and to are required" });
    if (to.getTime() <= from.getTime()) return res.status(400).json({ message: "Invalid range" });
    const mode2 = String(experience.mode || "time_slot");
    const out = { experienceId: experience.id, mode: mode2 };
    if (mode2 === "time_slot" || mode2 === "both") {
      const slots = await storage.listXpTimeSlots(experience.id, { from, to, activeOnly: true });
      const items = [];
      for (const s of slots) {
        const used = await storage.countXpActiveBookingsOverlapping({ experienceId: experience.id, kind: "time_slot", startAt: s.startAt, endAt: s.endAt });
        const cap = Number(s.capacity || 1);
        items.push({
          id: s.id,
          startAt: s.startAt,
          endAt: s.endAt,
          capacity: cap,
          remaining: Math.max(0, cap - used)
        });
      }
      out.timeSlots = items;
    }
    if (mode2 === "date_range" || mode2 === "both") {
      const blackouts = await storage.listXpBlackouts(experience.id, { from, to });
      const bookings = (await storage.listXpBookings({ experienceId: experience.id, from, to, limit: 500, offset: 0 })).items;
      out.blackouts = (blackouts || []).map((b) => ({ startAt: b.startAt, endAt: b.endAt }));
      out.booked = (bookings || []).filter((b) => b.kind === "date_range" && (b.status === "pending_payment" || b.status === "confirmed")).map((b) => ({ startAt: b.startAt, endAt: b.endAt }));
      out.capacity = Number(experience.capacity || 1);
    }
    return res.json(out);
  });
  app2.post("/api/xp/bookings/checkout", async (req, res) => {
    const body = req.body || {};
    const experienceSlug = String(body.experienceSlug || "").trim();
    const experience = await storage.getXpExperienceBySlug(experienceSlug);
    if (!experience || !experience.active) return res.status(404).json({ message: "Not found" });
    const mode2 = String(experience.mode || "time_slot");
    const kindRaw = String(body.kind || "").trim();
    const kind = kindRaw === "date_range" ? "date_range" : "time_slot";
    if (mode2 !== "both" && mode2 !== kind) return res.status(400).json({ message: "Invalid kind for experience" });
    const customerName = String(body.customerName || "").trim();
    const customerEmail = String(body.customerEmail || "").trim();
    const customerPhone = String(body.customerPhone || "").trim() || null;
    if (!customerName || !customerEmail) return res.status(400).json({ message: "Missing customer fields" });
    const startAt = xpParseDate(body.startAt);
    const endAt = xpParseDate(body.endAt);
    if (!startAt || !endAt) return res.status(400).json({ message: "Missing startAt/endAt" });
    if (endAt.getTime() <= startAt.getTime()) return res.status(400).json({ message: "Invalid window" });
    const experienceId = Number(experience.id);
    if (await storage.hasXpBlackoutOverlap({ experienceId, startAt, endAt })) {
      return res.status(409).json({ message: "Unavailable" });
    }
    if (kind === "time_slot") {
      const slots = await storage.listXpTimeSlots(experienceId, { from: startAt, to: startAt, activeOnly: true });
      const slot = slots.find((s) => new Date(s.startAt).getTime() === startAt.getTime() && new Date(s.endAt).getTime() === endAt.getTime());
      if (!slot) return res.status(404).json({ message: "Time slot not found" });
      const used = await storage.countXpActiveBookingsOverlapping({ experienceId, kind, startAt, endAt });
      const cap = Number(slot.capacity || 1);
      if (used >= cap) return res.status(409).json({ message: "Unavailable" });
    } else {
      const used = await storage.countXpActiveBookingsOverlapping({ experienceId, kind, startAt, endAt });
      const cap = Number(experience.capacity || 1);
      if (used >= cap) return res.status(409).json({ message: "Unavailable" });
    }
    const paymentModeRaw = String(experience.paymentMode || "deposit").trim().toLowerCase();
    const paymentMode = xpPaymentModeSchema.safeParse(paymentModeRaw);
    if (!paymentMode.success) return res.status(400).json({ message: "Invalid payment mode" });
    const dueNowAmount = paymentMode.data === "full" ? experience.priceTotal : experience.depositAmount;
    const cents = xpMoneyToCents(dueNowAmount);
    if (!cents) return res.status(400).json({ message: "Invalid amount" });
    const stripeKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
    if (!stripeKey) return res.status(500).json({ message: "Stripe is not configured" });
    const booking = await storage.createXpBookingPending({
      experienceId,
      kind,
      customerName,
      customerEmail,
      customerPhone,
      startAt,
      endAt,
      status: "pending_payment",
      currency: String(experience.currency || "USD"),
      depositAmount: dueNowAmount,
      stripeCheckoutSessionId: null,
      stripePaymentIntentId: null,
      stripeCustomerId: null
    });
    const stripe = new Stripe(stripeKey, { apiVersion: stripeApiVersion });
    const origin = `${req.protocol}://${req.get("host")}`;
    const session2 = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${origin}/xp/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/xp/checkout/cancel`,
      customer_email: customerEmail,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: String(experience.currency || "USD").trim().toLowerCase() || "usd",
            unit_amount: cents,
            product_data: {
              name: paymentMode.data === "full" ? String(experience.title || "Experience") : `${String(experience.title || "Experience")} (Deposit)`
            }
          }
        }
      ],
      metadata: {
        bookingId: String(booking.id),
        experienceId: String(experienceId),
        kind,
        paymentMode: paymentMode.data
      }
    });
    await storage.updateXpBookingStripeSession(booking.id, session2.id);
    return res.status(201).json({ checkoutUrl: session2.url });
  });
  app2.get("/api/xp/bookings/session/:sessionId", async (req, res) => {
    const sessionId = String(req.params.sessionId || "").trim();
    if (!sessionId) return res.status(400).json({ message: "Missing sessionId" });
    const booking = await storage.getXpBookingByStripeSessionId(sessionId);
    if (!booking) return res.status(404).json({ message: "Not found" });
    const experience = await storage.getXpExperienceById(Number(booking.experienceId));
    return res.json({
      booking: {
        id: booking.id,
        kind: booking.kind,
        status: booking.status,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        startAt: booking.startAt,
        endAt: booking.endAt,
        amountDueNow: booking.depositAmount,
        currency: booking.currency
      },
      experience: experience ? {
        id: experience.id,
        slug: experience.slug,
        title: experience.title,
        paymentMode: experience.paymentMode || "deposit",
        priceTotal: experience.priceTotal ?? null
      } : null
    });
  });
  app2.post("/api/stripe/webhook", async (req, res) => {
    const stripeKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
    const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
    if (!stripeKey || !webhookSecret) return res.status(500).json({ message: "Stripe is not configured" });
    const sig = String(req.headers["stripe-signature"] || "").trim();
    if (!sig) return res.status(400).json({ message: "Missing stripe-signature" });
    const stripe = new Stripe(stripeKey, { apiVersion: stripeApiVersion });
    const raw = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(JSON.stringify(req.body || {}));
    let event;
    try {
      event = stripe.webhooks.constructEvent(raw, sig, webhookSecret);
    } catch (e) {
      return res.status(400).json({ message: String(e?.message || e) });
    }
    if (await storage.hasStripeEvent(event.id)) return res.json({ received: true });
    await storage.recordStripeEvent({ eventId: event.id, type: event.type, payload: { id: event.id, type: event.type, created: event.created } });
    if (event.type === "checkout.session.completed") {
      const session2 = event.data.object;
      const sessionId = String(session2.id || "").trim();
      const paymentIntentId = typeof session2.payment_intent === "string" ? session2.payment_intent : null;
      const stripeCustomerId = typeof session2.customer === "string" ? session2.customer : null;
      const booking = await storage.getXpBookingByStripeSessionId(sessionId);
      if (booking && String(booking.status) !== "confirmed") {
        const confirmed = await storage.confirmXpBookingByStripeSessionId({ sessionId, paymentIntentId, stripeCustomerId });
        if (confirmed) {
          const admin = await xpPickAdminUser();
          if (admin) {
            await createTask({
              title: `XP booking confirmed: ${String(confirmed.customerName || "")}`.trim(),
              description: JSON.stringify({
                bookingId: confirmed.id,
                experienceId: confirmed.experienceId,
                kind: confirmed.kind,
                startAt: confirmed.startAt,
                endAt: confirmed.endAt,
                customerEmail: confirmed.customerEmail,
                customerPhone: confirmed.customerPhone
              }),
              type: "xp_booking",
              relatedEntityType: "xp_booking",
              relatedEntityId: confirmed.id,
              dueAt: confirmed.startAt,
              priority: "high",
              status: "open",
              assignedToUserId: admin.id,
              isRecurring: false,
              recurrenceRule: null,
              isPrivate: false,
              createdBy: admin.id
            });
          }
        }
      }
    }
    return res.json({ received: true });
  });
  app2.get("/api/xp/admin/experiences", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!isAdminUser(user)) return res.status(403).json({ message: "Forbidden" });
    const items = await storage.listXpExperiences({ activeOnly: false });
    return res.json({ items });
  });
  app2.post("/api/xp/admin/experiences", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!isAdminUser(user)) return res.status(403).json({ message: "Forbidden" });
    const schema = z4.object({
      slug: z4.string().trim().min(1),
      title: z4.string().trim().min(1),
      description: z4.string().optional(),
      mode: z4.enum(["time_slot", "date_range", "both"]).default("time_slot"),
      paymentMode: xpPaymentModeSchema.default("deposit"),
      currency: z4.string().trim().min(1).default("USD"),
      priceTotal: z4.union([z4.string(), z4.number()]).optional().nullable(),
      depositAmount: z4.union([z4.string(), z4.number()]).optional().nullable(),
      capacity: z4.number().int().positive().default(1),
      active: z4.boolean().default(true),
      images: z4.array(z4.string()).optional().nullable(),
      location: z4.string().optional().nullable(),
      durationMinutes: z4.number().int().positive().optional().nullable(),
      highlights: z4.any().optional().nullable(),
      inclusions: z4.any().optional().nullable(),
      cancellationPolicy: z4.string().optional().nullable(),
      itinerary: z4.any().optional().nullable()
    }).strict();
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });
    const body = parsed.data;
    const slug = xpNormalizeSlug(body.slug);
    const title = body.title;
    if (!slug || !title) return res.status(400).json({ message: "Missing fields" });
    const priceTotalCents = body.priceTotal != null ? xpMoneyToCents(body.priceTotal) : 0;
    const depositCents = xpMoneyToCents(body.depositAmount);
    if (body.paymentMode === "full") {
      if (!priceTotalCents) return res.status(400).json({ message: "priceTotal is required for full payment" });
    } else {
      if (!depositCents) return res.status(400).json({ message: "depositAmount is required" });
    }
    const itineraryParsed = body.itinerary ? xpItinerarySchema.safeParse(body.itinerary) : null;
    if (body.itinerary && !itineraryParsed?.success) return res.status(400).json({ message: "Invalid itinerary" });
    const row = await storage.createXpExperience({
      slug,
      title,
      description: String(body.description || "").trim() || null,
      mode: body.mode,
      paymentMode: body.paymentMode,
      currency: body.currency,
      priceTotal: body.priceTotal ?? null,
      depositAmount: body.paymentMode === "full" ? body.priceTotal : body.depositAmount,
      capacity: body.capacity,
      active: body.active !== false,
      images: Array.isArray(body.images) ? body.images.map((x) => String(x || "").trim()).filter(Boolean) : null,
      location: body.location ? String(body.location).trim() : null,
      durationMinutes: typeof body.durationMinutes === "number" ? body.durationMinutes : null,
      highlights: xpStringList(body.highlights),
      inclusions: xpStringList(body.inclusions),
      cancellationPolicy: body.cancellationPolicy ? String(body.cancellationPolicy).trim() : null,
      itinerary: itineraryParsed?.success ? itineraryParsed.data : null
    });
    return res.status(201).json({ experience: row });
  });
  app2.patch("/api/xp/admin/experiences/:id", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!isAdminUser(user)) return res.status(403).json({ message: "Forbidden" });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const body = req.body || {};
    const patch = {};
    if (Object.prototype.hasOwnProperty.call(body, "slug")) patch.slug = xpNormalizeSlug(body.slug);
    if (Object.prototype.hasOwnProperty.call(body, "title")) patch.title = String(body.title || "").trim();
    if (Object.prototype.hasOwnProperty.call(body, "description")) patch.description = String(body.description || "").trim() || null;
    if (Object.prototype.hasOwnProperty.call(body, "mode")) patch.mode = String(body.mode || "").trim();
    if (Object.prototype.hasOwnProperty.call(body, "paymentMode")) {
      const pm = xpPaymentModeSchema.safeParse(String(body.paymentMode || "").trim().toLowerCase());
      if (!pm.success) return res.status(400).json({ message: "Invalid paymentMode" });
      patch.paymentMode = pm.data;
    }
    if (Object.prototype.hasOwnProperty.call(body, "currency")) patch.currency = String(body.currency || "").trim() || "USD";
    if (Object.prototype.hasOwnProperty.call(body, "priceTotal")) patch.priceTotal = body.priceTotal ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "depositAmount")) {
      if (!xpMoneyToCents(body.depositAmount)) return res.status(400).json({ message: "Invalid depositAmount" });
      patch.depositAmount = body.depositAmount;
    }
    if (Object.prototype.hasOwnProperty.call(body, "capacity")) patch.capacity = typeof body.capacity === "number" ? body.capacity : 1;
    if (Object.prototype.hasOwnProperty.call(body, "active")) patch.active = !!body.active;
    if (Object.prototype.hasOwnProperty.call(body, "images")) {
      patch.images = Array.isArray(body.images) ? body.images.map((x) => String(x || "").trim()).filter(Boolean) : null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "location")) patch.location = body.location ? String(body.location).trim() : null;
    if (Object.prototype.hasOwnProperty.call(body, "durationMinutes")) {
      patch.durationMinutes = typeof body.durationMinutes === "number" ? body.durationMinutes : null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "highlights")) patch.highlights = xpStringList(body.highlights);
    if (Object.prototype.hasOwnProperty.call(body, "inclusions")) patch.inclusions = xpStringList(body.inclusions);
    if (Object.prototype.hasOwnProperty.call(body, "cancellationPolicy")) patch.cancellationPolicy = body.cancellationPolicy ? String(body.cancellationPolicy).trim() : null;
    if (Object.prototype.hasOwnProperty.call(body, "itinerary")) {
      if (body.itinerary == null) patch.itinerary = null;
      else {
        const itin = xpItinerarySchema.safeParse(body.itinerary);
        if (!itin.success) return res.status(400).json({ message: "Invalid itinerary" });
        patch.itinerary = itin.data;
      }
    }
    const nextPaymentMode = String(patch.paymentMode || "").trim();
    const paymentMode = nextPaymentMode ? xpPaymentModeSchema.safeParse(nextPaymentMode) : null;
    const current = await storage.getXpExperienceById(id);
    if (!current) return res.status(404).json({ message: "Not found" });
    const effectivePaymentMode = paymentMode?.success ? paymentMode.data : String(current.paymentMode || "deposit");
    if (effectivePaymentMode === "full") {
      const effectivePriceTotal = Object.prototype.hasOwnProperty.call(patch, "priceTotal") ? patch.priceTotal : current.priceTotal;
      if (!xpMoneyToCents(effectivePriceTotal)) return res.status(400).json({ message: "priceTotal is required for full payment" });
      patch.depositAmount = effectivePriceTotal;
    } else {
      const effectiveDeposit = Object.prototype.hasOwnProperty.call(patch, "depositAmount") ? patch.depositAmount : current.depositAmount;
      if (!xpMoneyToCents(effectiveDeposit)) return res.status(400).json({ message: "depositAmount is required" });
    }
    const row = await storage.updateXpExperience(id, patch);
    return res.json({ experience: row });
  });
  app2.delete("/api/xp/admin/experiences/:id", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!isAdminUser(user)) return res.status(403).json({ message: "Forbidden" });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const row = await storage.deactivateXpExperience(id);
    return res.json({ experience: row });
  });
  app2.get("/api/xp/admin/experiences/:id/time-slots", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!isAdminUser(user)) return res.status(403).json({ message: "Forbidden" });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const from = req.query.from ? xpParseDate(req.query.from) || void 0 : void 0;
    const to = req.query.to ? xpParseDate(req.query.to) || void 0 : void 0;
    const items = await storage.listXpTimeSlots(id, { from, to, activeOnly: false });
    return res.json({ items });
  });
  app2.post("/api/xp/admin/experiences/:id/time-slots", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!isAdminUser(user)) return res.status(403).json({ message: "Forbidden" });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const startAt = xpParseDate(req.body?.startAt);
    const endAt = xpParseDate(req.body?.endAt);
    if (!startAt || !endAt) return res.status(400).json({ message: "Missing startAt/endAt" });
    if (endAt.getTime() <= startAt.getTime()) return res.status(400).json({ message: "Invalid window" });
    const capacity = typeof req.body?.capacity === "number" ? req.body.capacity : 1;
    const row = await storage.createXpTimeSlot({ experienceId: id, startAt, endAt, capacity, active: req.body?.active !== false });
    return res.status(201).json({ timeSlot: row });
  });
  app2.delete("/api/xp/admin/time-slots/:slotId", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!isAdminUser(user)) return res.status(403).json({ message: "Forbidden" });
    const slotId = parseInt(req.params.slotId, 10);
    if (!Number.isFinite(slotId)) return res.status(400).json({ message: "Invalid id" });
    await storage.deleteXpTimeSlot(slotId);
    return res.json({ ok: true });
  });
  app2.get("/api/xp/admin/experiences/:id/blackouts", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!isAdminUser(user)) return res.status(403).json({ message: "Forbidden" });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const from = req.query.from ? xpParseDate(req.query.from) || void 0 : void 0;
    const to = req.query.to ? xpParseDate(req.query.to) || void 0 : void 0;
    const items = await storage.listXpBlackouts(id, { from, to });
    return res.json({ items });
  });
  app2.post("/api/xp/admin/experiences/:id/blackouts", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!isAdminUser(user)) return res.status(403).json({ message: "Forbidden" });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const startAt = xpParseDate(req.body?.startAt);
    const endAt = xpParseDate(req.body?.endAt);
    if (!startAt || !endAt) return res.status(400).json({ message: "Missing startAt/endAt" });
    if (endAt.getTime() <= startAt.getTime()) return res.status(400).json({ message: "Invalid window" });
    const row = await storage.createXpBlackout({ experienceId: id, startAt, endAt, reason: String(req.body?.reason || "").trim() || null });
    return res.status(201).json({ blackout: row });
  });
  app2.delete("/api/xp/admin/blackouts/:id", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!isAdminUser(user)) return res.status(403).json({ message: "Forbidden" });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    await storage.deleteXpBlackout(id);
    return res.json({ ok: true });
  });
  app2.get("/api/xp/admin/bookings", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!isXpOpsUser(user)) return res.status(403).json({ message: "Forbidden" });
    const experienceIdRaw = req.query.experienceId;
    const experienceId = typeof experienceIdRaw === "string" && experienceIdRaw.trim() ? parseInt(experienceIdRaw, 10) : void 0;
    const status = typeof req.query.status === "string" && req.query.status.trim() ? String(req.query.status).trim() : void 0;
    const kind = typeof req.query.kind === "string" && req.query.kind.trim() ? String(req.query.kind).trim() : void 0;
    const locationId = typeof req.query.locationId === "string" && String(req.query.locationId).trim() ? parseInt(String(req.query.locationId), 10) : void 0;
    const vehicleId = typeof req.query.vehicleId === "string" && String(req.query.vehicleId).trim() ? parseInt(String(req.query.vehicleId), 10) : void 0;
    const conciergeUserIdQuery = typeof req.query.conciergeUserId === "string" && String(req.query.conciergeUserId).trim() ? parseInt(String(req.query.conciergeUserId), 10) : void 0;
    const from = req.query.from ? xpParseDate(req.query.from) || void 0 : void 0;
    const to = req.query.to ? xpParseDate(req.query.to) || void 0 : void 0;
    const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : void 0;
    const offset = typeof req.query.offset === "string" ? parseInt(req.query.offset, 10) : void 0;
    const out = await storage.listXpBookings({
      experienceId: typeof experienceId === "number" && Number.isFinite(experienceId) ? experienceId : void 0,
      status,
      kind,
      from: from || void 0,
      to: to || void 0,
      conciergeUserId: isConciergeUser(user) ? Number(user.id) : typeof conciergeUserIdQuery === "number" && Number.isFinite(conciergeUserIdQuery) ? conciergeUserIdQuery : void 0,
      locationId: typeof locationId === "number" && Number.isFinite(locationId) ? locationId : void 0,
      vehicleId: typeof vehicleId === "number" && Number.isFinite(vehicleId) ? vehicleId : void 0,
      limit: Number.isFinite(limit) ? limit : void 0,
      offset: Number.isFinite(offset) ? offset : void 0
    });
    return res.json(out);
  });
  app2.get("/api/xp/admin/bookings/:id", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!isXpOpsUser(user)) return res.status(403).json({ message: "Forbidden" });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const booking = await storage.getXpBookingById(id);
    if (!booking) return res.status(404).json({ message: "Not found" });
    if (isConciergeUser(user) && Number(booking.assignment?.conciergeUserId || 0) !== Number(user.id)) {
      return res.status(404).json({ message: "Not found" });
    }
    const experience = await storage.getXpExperienceById(Number(booking.experienceId));
    return res.json({ booking, experience: experience || null });
  });
  app2.post("/api/xp/admin/bookings/:id/cancel", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!isAdminUser(user)) return res.status(403).json({ message: "Forbidden" });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const row = await storage.cancelXpBooking(id);
    if (!row) return res.status(404).json({ message: "Not found" });
    return res.json({ booking: row });
  });
  function parseNullableInt(v) {
    if (v === void 0 || v === null || v === "") return null;
    const n = typeof v === "number" ? v : parseInt(String(v), 10);
    return Number.isFinite(n) ? n : null;
  }
  app2.get("/api/xp/admin/locations", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!isXpOpsUser(user)) return res.status(403).json({ message: "Forbidden" });
    const activeOnly = isConciergeUser(user) ? true : String(req.query.activeOnly || "").trim() === "1" || String(req.query.activeOnly || "").trim().toLowerCase() === "true";
    const items = await storage.listXpLocations({ activeOnly });
    return res.json({ items });
  });
  app2.post("/api/xp/admin/locations", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!isAdminUser(user)) return res.status(403).json({ message: "Forbidden" });
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ message: "Missing name" });
    const row = await storage.createXpLocation({
      name,
      type: String(req.body?.type || "resort").trim() || "resort",
      address1: String(req.body?.address1 || "").trim() || null,
      address2: String(req.body?.address2 || "").trim() || null,
      city: String(req.body?.city || "").trim() || null,
      state: String(req.body?.state || "").trim() || null,
      zip: String(req.body?.zip || "").trim() || null,
      active: true
    });
    return res.status(201).json({ location: row });
  });
  app2.patch("/api/xp/admin/locations/:id", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!isAdminUser(user)) return res.status(403).json({ message: "Forbidden" });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const patch = {};
    if (req.body?.name !== void 0) patch.name = String(req.body?.name || "").trim();
    if (req.body?.type !== void 0) patch.type = String(req.body?.type || "").trim() || "resort";
    if (req.body?.address1 !== void 0) patch.address1 = String(req.body?.address1 || "").trim() || null;
    if (req.body?.address2 !== void 0) patch.address2 = String(req.body?.address2 || "").trim() || null;
    if (req.body?.city !== void 0) patch.city = String(req.body?.city || "").trim() || null;
    if (req.body?.state !== void 0) patch.state = String(req.body?.state || "").trim() || null;
    if (req.body?.zip !== void 0) patch.zip = String(req.body?.zip || "").trim() || null;
    if (req.body?.active !== void 0) patch.active = Boolean(req.body?.active);
    const row = await storage.updateXpLocation(id, patch);
    return res.json({ location: row });
  });
  app2.delete("/api/xp/admin/locations/:id", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!isAdminUser(user)) return res.status(403).json({ message: "Forbidden" });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const row = await storage.deactivateXpLocation(id);
    return res.json({ location: row });
  });
  app2.get("/api/xp/admin/vehicles", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!isXpOpsUser(user)) return res.status(403).json({ message: "Forbidden" });
    const activeOnly = isConciergeUser(user) ? true : String(req.query.activeOnly || "").trim() === "1" || String(req.query.activeOnly || "").trim().toLowerCase() === "true";
    const locationIdRaw = String(req.query.locationId || "").trim();
    const locationId = locationIdRaw ? parseInt(locationIdRaw, 10) : void 0;
    const items = await storage.listXpVehicles({
      activeOnly,
      locationId: typeof locationId === "number" && Number.isFinite(locationId) ? locationId : void 0
    });
    return res.json({ items });
  });
  app2.post("/api/xp/admin/vehicles", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!isAdminUser(user)) return res.status(403).json({ message: "Forbidden" });
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ message: "Missing name" });
    const row = await storage.createXpVehicle({
      name,
      type: String(req.body?.type || "tesla").trim() || "tesla",
      licensePlate: String(req.body?.licensePlate || "").trim() || null,
      locationId: parseNullableInt(req.body?.locationId),
      active: true
    });
    return res.status(201).json({ vehicle: row });
  });
  app2.patch("/api/xp/admin/vehicles/:id", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!isAdminUser(user)) return res.status(403).json({ message: "Forbidden" });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const patch = {};
    if (req.body?.name !== void 0) patch.name = String(req.body?.name || "").trim();
    if (req.body?.type !== void 0) patch.type = String(req.body?.type || "").trim() || "tesla";
    if (req.body?.licensePlate !== void 0) patch.licensePlate = String(req.body?.licensePlate || "").trim() || null;
    if (req.body?.locationId !== void 0) patch.locationId = parseNullableInt(req.body?.locationId);
    if (req.body?.active !== void 0) patch.active = Boolean(req.body?.active);
    const row = await storage.updateXpVehicle(id, patch);
    return res.json({ vehicle: row });
  });
  app2.delete("/api/xp/admin/vehicles/:id", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!isAdminUser(user)) return res.status(403).json({ message: "Forbidden" });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const row = await storage.deactivateXpVehicle(id);
    return res.json({ vehicle: row });
  });
  app2.get("/api/xp/admin/concierges", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!isAdminUser(user)) return res.status(403).json({ message: "Forbidden" });
    const items = await storage.listXpConciergeUsers();
    const safe = items.map((u) => {
      const { passwordHash, ...rest } = u;
      return rest;
    });
    return res.json({ items: safe });
  });
  app2.put("/api/xp/admin/bookings/:id/assignment", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!isXpOpsUser(user)) return res.status(403).json({ message: "Forbidden" });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const booking = await storage.getXpBookingById(id);
    if (!booking) return res.status(404).json({ message: "Not found" });
    if (isConciergeUser(user) && Number(booking.assignment?.conciergeUserId || 0) !== Number(user.id)) {
      return res.status(404).json({ message: "Not found" });
    }
    const locationId = req.body?.locationId !== void 0 ? parseNullableInt(req.body?.locationId) : booking.assignment?.locationId ?? null;
    const vehicleId = req.body?.vehicleId !== void 0 ? parseNullableInt(req.body?.vehicleId) : booking.assignment?.vehicleId ?? null;
    const conciergeUserId = isAdminUser(user) ? req.body?.conciergeUserId !== void 0 ? parseNullableInt(req.body?.conciergeUserId) : booking.assignment?.conciergeUserId ?? null : Number(user.id);
    const assignment = await storage.upsertXpBookingAssignment({
      bookingId: id,
      locationId,
      vehicleId,
      conciergeUserId
    });
    return res.json({ assignment });
  });
  app2.get("/api/xp/admin/bookings/:id/notes", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!isXpOpsUser(user)) return res.status(403).json({ message: "Forbidden" });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const booking = await storage.getXpBookingById(id);
    if (!booking) return res.status(404).json({ message: "Not found" });
    if (isConciergeUser(user) && Number(booking.assignment?.conciergeUserId || 0) !== Number(user.id)) {
      return res.status(404).json({ message: "Not found" });
    }
    const items = await storage.listXpBookingNotes(id);
    return res.json({ items });
  });
  app2.post("/api/xp/admin/bookings/:id/notes", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!isXpOpsUser(user)) return res.status(403).json({ message: "Forbidden" });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const booking = await storage.getXpBookingById(id);
    if (!booking) return res.status(404).json({ message: "Not found" });
    if (isConciergeUser(user) && Number(booking.assignment?.conciergeUserId || 0) !== Number(user.id)) {
      return res.status(404).json({ message: "Not found" });
    }
    const body = String(req.body?.body || "").trim();
    if (!body) return res.status(400).json({ message: "Missing body" });
    if (body.length > 2e3) return res.status(400).json({ message: "Body too long" });
    const note = await storage.createXpBookingNote({ bookingId: id, authorUserId: Number(user.id), body });
    return res.status(201).json({ note });
  });
  app2.get("/api/address/suggest", async (req, res) => {
    try {
      const qRaw = req.query.q || "";
      const q = qRaw.trim();
      if (q.length < 2) return res.json({ q: qRaw, provider: null, suggestions: [] });
      const providerHint = String(process.env.ADDRESS_PROVIDER || "").toLowerCase();
      const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_TOKEN;
      const smartyAuthId = process.env.SMARTY_AUTH_ID || process.env.SMARTY_STREETS_AUTH_ID;
      const smartyAuthToken = process.env.SMARTY_AUTH_TOKEN || process.env.SMARTY_STREETS_AUTH_TOKEN;
      const canUseMapbox = !!mapboxToken;
      const canUseSmarty = !!(smartyAuthId && smartyAuthToken);
      const provider = providerHint === "mapbox" && canUseMapbox ? "mapbox" : providerHint === "smarty" && canUseSmarty ? "smarty" : canUseMapbox ? "mapbox" : canUseSmarty ? "smarty" : null;
      if (!provider) {
        return res.json({ q: qRaw, provider: null, suggestions: [] });
      }
      if (provider === "mapbox") {
        const url2 = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?autocomplete=true&types=address&country=US&limit=8&access_token=${encodeURIComponent(String(mapboxToken))}`;
        const r2 = await fetch(url2);
        if (!r2.ok) return res.status(502).json({ message: "Address provider error" });
        const json2 = await r2.json();
        const suggestions2 = (json2?.features || []).map((f) => {
          const ctx = Array.isArray(f.context) ? f.context : [];
          const postcode = ctx.find((c) => typeof c?.id === "string" && c.id.startsWith("postcode."));
          const place = ctx.find((c) => typeof c?.id === "string" && c.id.startsWith("place."));
          const region = ctx.find((c) => typeof c?.id === "string" && c.id.startsWith("region."));
          const address = f.address ? `${f.address} ${f.text || ""}`.trim() : String(f.place_name || "");
          return {
            label: String(f.place_name || f.text || ""),
            address,
            city: String(place?.text || ""),
            state: String(region?.short_code || region?.text || "").replace(/^us-/i, "").toUpperCase(),
            zipCode: String(postcode?.text || ""),
            placeId: String(f.id || "")
          };
        });
        return res.json({ q: qRaw, provider, suggestions: suggestions2 });
      }
      const url = `https://us-autocomplete-pro.api.smarty.com/lookup?search=${encodeURIComponent(q)}&auth-id=${encodeURIComponent(String(smartyAuthId))}&auth-token=${encodeURIComponent(String(smartyAuthToken))}&max_results=8`;
      const r = await fetch(url);
      if (!r.ok) return res.status(502).json({ message: "Address provider error" });
      const json = await r.json();
      const suggestions = (json?.suggestions || []).map((s) => ({
        label: String(s.text || [s.street_line, s.city, s.state, s.zipcode].filter(Boolean).join(", ")),
        address: String(s.street_line || ""),
        city: String(s.city || ""),
        state: String(s.state || ""),
        zipCode: String(s.zipcode || ""),
        placeId: String(s.street_line || "")
      }));
      return res.json({ q: qRaw, provider, suggestions });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/search", async (req, res) => {
    const startedAt = Date.now();
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const activeTeamId = await getOrInitActiveTeamId(req, user.id);
      const qRaw = req.query.q || "";
      const q = qRaw.trim();
      const limit = req.query.limit ? parseInt(req.query.limit) : 20;
      const offset = req.query.offset ? parseInt(req.query.offset) : 0;
      if (!q) return res.json({ q: qRaw, results: [], counts: { leads: 0, properties: 0, contacts: 0, companies: 0, documents: 0, total: 0 } });
      const term = `%${q}%`;
      const canViewPrivateDocs = isManagerUser(user);
      const countsPromises = [
        db.execute(sql4`SELECT COUNT(*)::int AS c FROM leads l WHERE 
          lower(l.address) LIKE lower(${term}) OR lower(l.city) LIKE lower(${term}) OR lower(l.state) LIKE lower(${term}) OR
          lower(l.owner_name) LIKE lower(${term}) OR lower(l.owner_phone) LIKE lower(${term}) OR lower(l.owner_email) LIKE lower(${term})
        `),
        db.execute(sql4`SELECT COUNT(*)::int AS c FROM properties p WHERE 
          lower(p.address) LIKE lower(${term}) OR lower(p.city) LIKE lower(${term}) OR lower(p.state) LIKE lower(${term}) OR
          lower(p.apn) LIKE lower(${term}) OR lower(p.zip_code) LIKE lower(${term})
        `),
        db.execute(sql4`SELECT COUNT(*)::int AS c FROM contacts c WHERE 
          lower(c.name) LIKE lower(${term}) OR lower(c.email) LIKE lower(${term}) OR lower(c.phone) LIKE lower(${term})
        `),
        activeTeamId ? db.execute(sql4`SELECT COUNT(*)::int AS c FROM companies co WHERE co.team_id = ${activeTeamId} AND (
              lower(co.name) LIKE lower(${term}) OR lower(co.email) LIKE lower(${term}) OR lower(co.phone) LIKE lower(${term})
            )`) : Promise.resolve({ rows: [{ c: 0 }] }),
        activeTeamId ? db.execute(sql4`SELECT COUNT(*)::int AS c FROM documents d WHERE d.team_id = ${activeTeamId} AND (
              lower(d.title) LIKE lower(${term}) OR lower(COALESCE(d.kind, '')) LIKE lower(${term})
            ) AND (${canViewPrivateDocs} OR d.is_private = false OR d.created_by = ${user.id})`) : Promise.resolve({ rows: [{ c: 0 }] })
      ];
      const [leadCountRow, propertyCountRow, contactCountRow, companyCountRow, documentCountRow] = await Promise.all(countsPromises);
      const leadCount = leadCountRow.rows?.[0]?.c ?? 0;
      const propertyCount = propertyCountRow.rows?.[0]?.c ?? 0;
      const contactCount = contactCountRow.rows?.[0]?.c ?? 0;
      const companyCount = companyCountRow.rows?.[0]?.c ?? 0;
      const documentCount = documentCountRow.rows?.[0]?.c ?? 0;
      const resultsQuery = sql4`(
        SELECT 'lead' AS type, l.id AS id, l.address AS title, (l.city || ', ' || l.state) AS subtitle,
               ('/leads?leadId=' || l.id)::text AS path,
               CASE 
                 WHEN lower(l.address) LIKE lower(${term}) THEN 1
                 WHEN lower(l.owner_name) LIKE lower(${term}) THEN 2
                 ELSE 3
               END AS rank
        FROM leads l
        WHERE lower(l.address) LIKE lower(${term}) OR lower(l.city) LIKE lower(${term}) OR lower(l.state) LIKE lower(${term}) OR
              lower(l.owner_name) LIKE lower(${term}) OR lower(l.owner_phone) LIKE lower(${term}) OR lower(l.owner_email) LIKE lower(${term})
      )
      UNION ALL
      (
        SELECT 'opportunity' AS type, p.id AS id, p.address AS title, (p.city || ', ' || p.state) AS subtitle,
               ('/opportunities/' || p.id)::text AS path,
               CASE 
                 WHEN lower(p.address) LIKE lower(${term}) THEN 1
                 WHEN lower(p.apn) LIKE lower(${term}) THEN 2
                 ELSE 3
               END AS rank
        FROM properties p
        WHERE lower(p.address) LIKE lower(${term}) OR lower(p.city) LIKE lower(${term}) OR lower(p.state) LIKE lower(${term}) OR
              lower(p.apn) LIKE lower(${term}) OR lower(p.zip_code) LIKE lower(${term})
      )
      UNION ALL
      (
        SELECT 'contact' AS type, c.id AS id, c.name AS title, COALESCE(c.phone, c.email, '') AS subtitle,
               '/contacts' AS path,
               CASE 
                 WHEN lower(c.name) LIKE lower(${term}) THEN 1
                 ELSE 3
               END AS rank
        FROM contacts c
        WHERE lower(c.name) LIKE lower(${term}) OR lower(c.email) LIKE lower(${term}) OR lower(c.phone) LIKE lower(${term})
      )
      UNION ALL
      (
        SELECT 'company' AS type, co.id AS id, co.name AS title, COALESCE(co.company_type, '') AS subtitle,
               ('/companies?companyId=' || co.id)::text AS path,
               CASE 
                 WHEN lower(co.name) LIKE lower(${term}) THEN 1
                 ELSE 3
               END AS rank
        FROM companies co
        WHERE ${activeTeamId ? sql4`co.team_id = ${activeTeamId}` : sql4`1=0`} AND (
          lower(co.name) LIKE lower(${term}) OR lower(co.email) LIKE lower(${term}) OR lower(co.phone) LIKE lower(${term})
        )
      )
      UNION ALL
      (
        SELECT 'document' AS type, d.id AS id, d.title AS title, COALESCE(d.kind, '') AS subtitle,
               ('/documents?documentId=' || d.id)::text AS path,
               CASE 
                 WHEN lower(d.title) LIKE lower(${term}) THEN 1
                 ELSE 3
               END AS rank
        FROM documents d
        WHERE ${activeTeamId ? sql4`d.team_id = ${activeTeamId}` : sql4`1=0`} AND (
          lower(d.title) LIKE lower(${term}) OR lower(COALESCE(d.kind, '')) LIKE lower(${term})
        ) AND (${canViewPrivateDocs} OR d.is_private = false OR d.created_by = ${user.id})
      )
      ORDER BY rank ASC, title ASC
      LIMIT ${limit} OFFSET ${offset}`;
      const resultsRows = await db.execute(resultsQuery);
      const results = resultsRows.rows ?? [];
      const total = leadCount + propertyCount + contactCount + companyCount + documentCount;
      const elapsedMs = Date.now() - startedAt;
      console.log(
        `[search] q="${qRaw}" results=${results.length}/${total} leads=${leadCount} properties=${propertyCount} contacts=${contactCount} companies=${companyCount} documents=${documentCount} in ${elapsedMs}ms`
      );
      res.json({ q: qRaw, results, counts: { leads: leadCount, properties: propertyCount, contacts: contactCount, companies: companyCount, documents: documentCount, total } });
    } catch (error) {
      console.error("[search] error", error);
      res.status(500).json({ message: error.message });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    app2.get("/api/auth/debug", (req, res) => {
      const authHeader = String(req.headers.authorization || "");
      const isBearer = authHeader.startsWith("Bearer ");
      const tokenLen = isBearer ? authHeader.slice("Bearer ".length).trim().length : 0;
      res.json({
        nodeEnv: process.env.NODE_ENV || "development",
        hasSession: Boolean(req.session?.userId),
        sessionUserId: req.session?.userId ?? null,
        hasAuthHeader: Boolean(authHeader),
        isBearer,
        bearerTokenLength: tokenLen,
        authJwtSecretConfigured: Boolean(authJwtSecret())
      });
    });
  }
  app2.get("/api/auth/status", (_req, res) => {
    const snapshot = getAuthStatusSnapshot();
    res.json(snapshot);
  });
  const authRateBuckets = /* @__PURE__ */ new Map();
  function checkAuthRateLimit(req, res) {
    const windowMs = 6e4;
    const max = 20;
    const ip = String(req.ip || "").trim() || "unknown";
    const key = `${ip}:${String(req.path || "")}`;
    const now = Date.now();
    const existing = authRateBuckets.get(key);
    if (!existing || now >= existing.resetAt) {
      authRateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    existing.count += 1;
    if (existing.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1e3));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({ code: "rate_limited", message: "Too many requests" });
      return false;
    }
    return true;
  }
  app2.post("/api/auth/login", async (req, res) => {
    try {
      const requestId = res.locals?.requestId || void 0;
      const { email, password } = req.body;
      const normalizedEmail = String(email || "").trim().toLowerCase();
      if (!normalizedEmail || !password) {
        return res.status(400).json({ message: "Email and password are required", requestId });
      }
      const adminEmail = process.env.ADMIN_USERNAME;
      const adminPassword = process.env.ADMIN_PASSWORD;
      const normalizedAdminEmail = String(adminEmail || "").trim().toLowerCase();
      if (normalizedAdminEmail && normalizedEmail === normalizedAdminEmail && adminPassword && password === adminPassword) {
        console.log(`[Auth] Admin bypass used for ${normalizedEmail}`);
        void writeAuthAuditLog({
          action: "admin_bypass",
          outcome: "attempt",
          email: normalizedEmail,
          ip: req.ip,
          userAgent: String(req.headers["user-agent"] || ""),
          metadata: { path: req.path }
        });
        try {
          const user2 = await storage.getUserByEmail(normalizedEmail);
          if (user2) {
            req.session.userId = user2.id;
            req.session.email = user2.email;
            {
              const at = await getOrInitActiveTeamId(req, user2.id);
              if (at) req.session.activeTeamId = at;
              else delete req.session.activeTeamId;
            }
            const { passwordHash: passwordHash2, ...userWithoutPassword2 } = user2;
            const token2 = await issueAuthToken({ sub: String(user2.id), email: user2.email });
            void writeAuthAuditLog({
              action: "admin_bypass",
              outcome: "granted",
              userId: user2.id,
              email: user2.email,
              ip: req.ip,
              userAgent: String(req.headers["user-agent"] || ""),
              metadata: { path: req.path }
            });
            return res.json({ user: userWithoutPassword2, token: token2 });
          } else {
            console.error(`[Auth] Admin user ${normalizedEmail} matches env but not found in DB`);
            void writeAuthAuditLog({
              action: "admin_bypass",
              outcome: "user_not_found",
              email: normalizedEmail,
              ip: req.ip,
              userAgent: String(req.headers["user-agent"] || ""),
              metadata: { path: req.path }
            });
            return res.status(401).json({ message: "Admin user not found in database. Run bootstrap-admin script.", requestId });
          }
        } catch (dbError) {
          console.error(`[Auth] Admin bypass DB error:`, dbError);
          void writeAuthAuditLog({
            action: "admin_bypass",
            outcome: "error",
            email: normalizedEmail,
            ip: req.ip,
            userAgent: String(req.headers["user-agent"] || ""),
            metadata: { path: req.path, error: String(dbError?.message || dbError) }
          });
          return sendAuthError(res, 503, { code: "db_unavailable", message: "Database is unavailable" });
        }
      }
      const user = await storage.getUserByEmail(normalizedEmail);
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid email or password", requestId });
      }
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid email or password", requestId });
      }
      if (!user.isActive) {
        return res.status(403).json({ message: "Account is inactive", requestId });
      }
      const twoFactor = await storage.getTwoFactorAuthByUserId(user.id);
      if (twoFactor?.isEnabled) {
        const tempToken = await issueAuthToken({ sub: String(user.id), email: user.email });
        return res.json({ requires2FA: true, tempToken, method: twoFactor.method });
      }
      req.session.userId = user.id;
      req.session.email = user.email;
      {
        const at = await getOrInitActiveTeamId(req, user.id);
        if (at) req.session.activeTeamId = at;
        else delete req.session.activeTeamId;
      }
      const { passwordHash, ...userWithoutPassword } = user;
      const token = await issueAuthToken({ sub: String(user.id), email: user.email });
      res.json({ user: userWithoutPassword, token });
    } catch (error) {
      console.error("[Auth] Login error:", error);
      const requestId = res.locals?.requestId || void 0;
      if (isDbConnectivityError2(error)) {
        return sendAuthError(res, 503, { code: "db_unavailable", message: "Database is unavailable" });
      }
      res.status(500).json({ message: `Login failed: ${error.message}`, requestId });
    }
  });
  app2.post("/api/auth/password-reset/request", async (req, res) => {
    try {
      if (!checkAuthRateLimit(req, res)) return;
      const normalizedEmail = String(req.body?.email || "").trim().toLowerCase();
      if (!normalizedEmail) {
        return res.status(400).json({ message: "Email is required" });
      }
      const emailMissing = getEmailProviderMissing();
      if (emailMissing.length) {
        return sendAuthError(res, 503, { code: "email_not_configured", message: "Email is not configured", missing: emailMissing });
      }
      const orgDomain = String(process.env.ORG_EMAIL_DOMAIN || "oceanluxe.org").trim().toLowerCase();
      if (!normalizedEmail.endsWith(`@${orgDomain}`)) {
        return res.json({ message: "If an account exists, you will receive a reset email shortly." });
      }
      const user = await storage.getUserByEmail(normalizedEmail);
      if (!user || !user.isActive) {
        return res.json({ message: "If an account exists, you will receive a reset email shortly." });
      }
      const token = crypto10.randomBytes(32).toString("base64url");
      const tokenHash = crypto10.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1e3);
      await db.execute(sql4`
        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, request_ip, user_agent)
        VALUES (${user.id}, ${tokenHash}, ${expiresAt.toISOString()}, ${String(req.ip || "").trim() || null}, ${String(req.headers["user-agent"] || "") || null})
      `);
      const baseUrlFromEnv = String(process.env.APP_BASE_URL || "").trim();
      const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0];
      const host = String(req.headers.host || "").trim();
      const baseUrl = baseUrlFromEnv || (host ? `${proto}://${host}` : "");
      const resetLink = baseUrl ? `${baseUrl}/reset-password?token=${encodeURIComponent(token)}` : token;
      const subject = "Reset your Ocean Luxe CRM password";
      const text2 = baseUrl ? `Use this link to reset your password (expires in 1 hour):

${resetLink}

If you did not request this, you can ignore this email.` : `Your password reset token (expires in 1 hour):

${resetLink}

If you did not request this, you can ignore this email.`;
      await sendResendEmail({
        to: user.email,
        subject,
        text: text2
      });
      void writeAuthAuditLog({
        action: "password_reset_request",
        outcome: "sent",
        userId: user.id,
        email: user.email,
        ip: req.ip,
        userAgent: String(req.headers["user-agent"] || ""),
        metadata: { path: req.path }
      });
      return res.json({ message: "If an account exists, you will receive a reset email shortly." });
    } catch (error) {
      void writeAuthAuditLog({
        action: "password_reset_request",
        outcome: "error",
        email: String(req.body?.email || ""),
        ip: req.ip,
        userAgent: String(req.headers["user-agent"] || ""),
        metadata: { path: req.path, error: String(error?.message || error) }
      });
      if (isDbConnectivityError2(error)) {
        return sendAuthError(res, 503, { code: "db_unavailable", message: "Database is unavailable" });
      }
      if (isEmailNotConfiguredError(error)) {
        const missing = getEmailProviderMissing();
        return sendAuthError(res, 503, { code: "email_not_configured", message: error?.message || "Email is not configured", missing: missing.length ? missing : void 0 });
      }
      return sendAuthError(res, 503, { code: "email_send_failed", message: error?.message || "Email send failed" });
    }
  });
  app2.post("/api/auth/password-reset/confirm", async (req, res) => {
    try {
      if (!checkAuthRateLimit(req, res)) return;
      const token = String(req.body?.token || "").trim();
      const password = String(req.body?.password || "");
      if (!token) return res.status(400).json({ message: "Reset token is required" });
      if (!password || password.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters" });
      const tokenHash = crypto10.createHash("sha256").update(token).digest("hex");
      const passwordHash = await bcrypt.hash(password, 12);
      const result = await db.execute(sql4`
        WITH t AS (
          UPDATE password_reset_tokens
          SET used_at = NOW()
          WHERE token_hash = ${tokenHash}
            AND used_at IS NULL
            AND expires_at > NOW()
          RETURNING user_id
        )
        UPDATE users
        SET password_hash = ${passwordHash}, updated_at = NOW()
        WHERE id = (SELECT user_id FROM t)
        RETURNING id
      `);
      const updatedUserId = Number(result.rows?.[0]?.id || 0);
      if (!updatedUserId) {
        return res.status(400).json({ message: "Invalid or expired reset link" });
      }
      void writeAuthAuditLog({
        action: "password_reset_confirm",
        outcome: "success",
        userId: updatedUserId,
        ip: req.ip,
        userAgent: String(req.headers["user-agent"] || ""),
        metadata: { path: req.path }
      });
      return res.json({ message: "Password updated. You can sign in now." });
    } catch (error) {
      void writeAuthAuditLog({
        action: "password_reset_confirm",
        outcome: "error",
        ip: req.ip,
        userAgent: String(req.headers["user-agent"] || ""),
        metadata: { path: req.path, error: String(error?.message || error) }
      });
      if (isDbConnectivityError2(error)) {
        return sendAuthError(res, 503, { code: "db_unavailable", message: "Database is unavailable" });
      }
      return res.status(500).json({ message: "Password reset failed" });
    }
  });
  app2.post("/api/auth/magic-link/request", async (req, res) => {
    try {
      if (!checkAuthRateLimit(req, res)) return;
      const normalizedEmail = String(req.body?.email || "").trim().toLowerCase();
      if (!normalizedEmail) {
        return res.status(400).json({ message: "Email is required" });
      }
      const emailMissing = getEmailProviderMissing();
      if (emailMissing.length) {
        return sendAuthError(res, 503, { code: "email_not_configured", message: "Email is not configured", missing: emailMissing });
      }
      const orgDomain = String(process.env.ORG_EMAIL_DOMAIN || "oceanluxe.org").trim().toLowerCase();
      if (!normalizedEmail.endsWith(`@${orgDomain}`)) {
        return res.json({ message: "If an account exists, you will receive a sign-in link shortly." });
      }
      const user = await storage.getUserByEmail(normalizedEmail);
      if (!user || !user.isActive) {
        return res.json({ message: "If an account exists, you will receive a sign-in link shortly." });
      }
      const token = crypto10.randomBytes(32).toString("base64url");
      const tokenHash = crypto10.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1e3);
      await db.execute(sql4`
        INSERT INTO auth_magic_links (user_id, token_hash, expires_at, request_ip, user_agent)
        VALUES (${user.id}, ${tokenHash}, ${expiresAt.toISOString()}, ${String(req.ip || "").trim() || null}, ${String(req.headers["user-agent"] || "") || null})
      `);
      const baseUrlFromEnv = String(process.env.APP_BASE_URL || "").trim();
      const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0];
      const host = String(req.headers.host || "").trim();
      const baseUrl = baseUrlFromEnv || (host ? `${proto}://${host}` : "");
      const signInLink = baseUrl ? `${baseUrl}/magic-link?token=${encodeURIComponent(token)}` : token;
      await sendResendEmail({
        to: user.email,
        subject: "Your Ocean Luxe CRM sign-in link",
        text: baseUrl ? `Use this link to sign in (expires in 15 minutes):

${signInLink}

If you did not request this, you can ignore this email.` : `Your sign-in token (expires in 15 minutes):

${signInLink}

If you did not request this, you can ignore this email.`
      });
      void writeAuthAuditLog({
        action: "magic_link_request",
        outcome: "sent",
        userId: user.id,
        email: user.email,
        ip: req.ip,
        userAgent: String(req.headers["user-agent"] || ""),
        metadata: { path: req.path }
      });
      return res.json({ message: "If an account exists, you will receive a sign-in link shortly." });
    } catch (error) {
      void writeAuthAuditLog({
        action: "magic_link_request",
        outcome: "error",
        email: String(req.body?.email || ""),
        ip: req.ip,
        userAgent: String(req.headers["user-agent"] || ""),
        metadata: { path: req.path, error: String(error?.message || error) }
      });
      if (isDbConnectivityError2(error)) {
        return sendAuthError(res, 503, { code: "db_unavailable", message: "Database is unavailable" });
      }
      if (isEmailNotConfiguredError(error)) {
        const missing = getEmailProviderMissing();
        return sendAuthError(res, 503, { code: "email_not_configured", message: error?.message || "Email is not configured", missing: missing.length ? missing : void 0 });
      }
      return sendAuthError(res, 503, { code: "email_send_failed", message: error?.message || "Email send failed" });
    }
  });
  app2.post("/api/auth/magic-link/consume", async (req, res) => {
    try {
      if (!checkAuthRateLimit(req, res)) return;
      const token = String(req.body?.token || "").trim();
      if (!token) return res.status(400).json({ message: "Token is required" });
      const tokenHash = crypto10.createHash("sha256").update(token).digest("hex");
      const consumed = await db.execute(sql4`
        UPDATE auth_magic_links
        SET used_at = NOW()
        WHERE token_hash = ${tokenHash}
          AND used_at IS NULL
          AND expires_at > NOW()
        RETURNING user_id
      `);
      const userId = Number(consumed.rows?.[0]?.user_id || 0);
      if (!userId) return res.status(400).json({ message: "Invalid or expired sign-in link" });
      const user = await storage.getUserById(userId);
      if (!user || !user.isActive) return res.status(403).json({ message: "Account is inactive" });
      req.session.userId = user.id;
      req.session.email = user.email;
      await new Promise((resolve2, reject) => req.session.save((err) => err ? reject(err) : resolve2()));
      void writeAuthAuditLog({
        action: "magic_link_consume",
        outcome: "success",
        userId: user.id,
        email: user.email,
        ip: req.ip,
        userAgent: String(req.headers["user-agent"] || ""),
        metadata: { path: req.path }
      });
      const { passwordHash, ...userWithoutPassword } = user;
      return res.json({ user: userWithoutPassword });
    } catch (error) {
      void writeAuthAuditLog({
        action: "magic_link_consume",
        outcome: "error",
        ip: req.ip,
        userAgent: String(req.headers["user-agent"] || ""),
        metadata: { path: req.path, error: String(error?.message || error) }
      });
      if (isDbConnectivityError2(error)) {
        return sendAuthError(res, 503, { code: "db_unavailable", message: "Database is unavailable" });
      }
      return res.status(500).json({ message: "Sign-in failed" });
    }
  });
  app2.post("/api/auth/dev-bypass", async (req, res) => {
    try {
      if (!isDevEmployeeBypassEnabled()) {
        return res.status(404).json({ message: "Not found" });
      }
      if (!isLoopbackIp(req.ip)) {
        void writeAuthAuditLog({
          action: "dev_employee_bypass",
          outcome: "forbidden_ip",
          email: String(req.body?.email || ""),
          ip: req.ip,
          userAgent: String(req.headers["user-agent"] || ""),
          metadata: { path: req.path }
        });
        return res.status(403).json({ message: "Forbidden" });
      }
      const accessCode = process.env.EMPLOYEE_ACCESS_CODE;
      if (!accessCode || !String(accessCode).trim()) {
        return res.status(503).json({ message: "Employee access code is not configured" });
      }
      const { employeeCode, email } = req.body;
      if (!employeeCode || employeeCode !== accessCode) {
        console.warn(`[Auth] Dev bypass denied ip=${req.ip} email=${String(email || "")}`);
        void writeAuthAuditLog({
          action: "dev_employee_bypass",
          outcome: "invalid_code",
          email: String(email || ""),
          ip: req.ip,
          userAgent: String(req.headers["user-agent"] || ""),
          metadata: { path: req.path }
        });
        return res.status(403).json({ message: "Invalid employee code" });
      }
      if (!email || !String(email).trim()) {
        void writeAuthAuditLog({
          action: "dev_employee_bypass",
          outcome: "missing_email",
          ip: req.ip,
          userAgent: String(req.headers["user-agent"] || ""),
          metadata: { path: req.path }
        });
        return res.status(400).json({ message: "Email is required" });
      }
      const user = await storage.getUserByEmail(String(email).trim());
      if (!user) {
        console.warn(`[Auth] Dev bypass user not found ip=${req.ip} email=${String(email || "")}`);
        void writeAuthAuditLog({
          action: "dev_employee_bypass",
          outcome: "user_not_found",
          email: String(email || ""),
          ip: req.ip,
          userAgent: String(req.headers["user-agent"] || ""),
          metadata: { path: req.path }
        });
        return res.status(404).json({ message: "User not found" });
      }
      if (!user.isActive) {
        void writeAuthAuditLog({
          action: "dev_employee_bypass",
          outcome: "inactive_user",
          userId: user.id,
          email: user.email,
          ip: req.ip,
          userAgent: String(req.headers["user-agent"] || ""),
          metadata: { path: req.path }
        });
        return res.status(403).json({ message: "Account is inactive" });
      }
      req.session.userId = user.id;
      req.session.email = user.email;
      {
        const at = await getOrInitActiveTeamId(req, user.id);
        if (at) req.session.activeTeamId = at;
        else delete req.session.activeTeamId;
      }
      const { passwordHash, ...userWithoutPassword } = user;
      const token = await issueAuthToken({ sub: String(user.id), email: user.email });
      console.log(`[Auth] Dev bypass granted ip=${req.ip} userId=${user.id} email=${user.email}`);
      void writeAuthAuditLog({
        action: "dev_employee_bypass",
        outcome: "granted",
        userId: user.id,
        email: user.email,
        ip: req.ip,
        userAgent: String(req.headers["user-agent"] || ""),
        metadata: { path: req.path }
      });
      return res.json({ user: userWithoutPassword, token, bypass: true });
    } catch (error) {
      console.error("[Auth] Dev bypass error:", error);
      void writeAuthAuditLog({
        action: "dev_employee_bypass",
        outcome: "error",
        email: String(req.body?.email || ""),
        ip: req.ip,
        userAgent: String(req.headers["user-agent"] || ""),
        metadata: { path: req.path, error: String(error?.message || error) }
      });
      if (isDbConnectivityError2(error)) {
        return res.status(503).json({ message: "Database is unavailable" });
      }
      return res.status(500).json({ message: `Dev bypass failed: ${error.message}` });
    }
  });
  app2.post("/api/auth/signup", async (req, res) => {
    try {
      const { firstName, lastName, email, password, isActive = true, teamInviteCode } = req.body;
      if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({ message: "All fields are required" });
      }
      const requestId = res.locals?.requestId || void 0;
      const normalizedEmail = String(email || "").trim().toLowerCase();
      if (!normalizedEmail) {
        return res.status(400).json({ message: "Email is required", requestId });
      }
      const roleCode = String(req.body?.roleCode || req.body?.employeeCode || "").trim();
      const teamCode = String(req.body?.teamCode || "").trim();
      const adminCode = String(process.env.ADMIN_ROLE_CODE || "").trim();
      const teamLeaderCode = String(process.env.TEAM_LEADER_ROLE_CODE || "").trim();
      const agentCode = String(process.env.AGENT_ROLE_CODE || "").trim();
      const vaCode = String(process.env.VA_ROLE_CODE || "").trim();
      const conciergeCode = String(process.env.CONCIERGE_ROLE_CODE || "").trim();
      const legacyEmployeeCode = String(process.env.EMPLOYEE_ACCESS_CODE || "").trim();
      const codesConfigured = Boolean(adminCode) && Boolean(teamLeaderCode) && Boolean(agentCode) && Boolean(vaCode);
      if (!codesConfigured && !legacyEmployeeCode) {
        return sendAuthError(res, 503, {
          code: "signup_not_configured",
          message: "Signup codes are not configured",
          missing: ["env:EMPLOYEE_ACCESS_CODE", "env:ADMIN_ROLE_CODE", "env:TEAM_LEADER_ROLE_CODE", "env:AGENT_ROLE_CODE", "env:VA_ROLE_CODE"]
        });
      }
      let role = null;
      let isSuperAdmin = false;
      if (adminCode && roleCode === adminCode) {
        role = "admin";
        isSuperAdmin = true;
      } else if (teamLeaderCode && roleCode === teamLeaderCode) {
        role = "team_leader";
      } else if (agentCode && roleCode === agentCode) {
        role = "agent";
      } else if (vaCode && roleCode === vaCode) {
        role = "va";
      } else if (conciergeCode && roleCode === conciergeCode) {
        role = "concierge";
      } else if (legacyEmployeeCode && roleCode === legacyEmployeeCode) {
        role = "agent";
      }
      if (!role) {
        return res.status(403).json({ message: "Invalid access code", requestId });
      }
      const existingUser = await storage.getUserByEmail(normalizedEmail);
      if (existingUser) {
        return res.status(409).json({ message: "Email already in use", requestId });
      }
      const passwordHash = await bcrypt.hash(password, 12);
      const newUser = await storage.createUser({
        email: normalizedEmail,
        passwordHash,
        firstName,
        lastName,
        role,
        isSuperAdmin,
        isActive
      });
      req.session.userId = newUser.id;
      req.session.email = newUser.email;
      const invite = typeof teamInviteCode === "string" ? teamInviteCode.trim() : "";
      if (invite) {
        const team = await storage.getTeamByInviteCode(invite);
        if (!team) return res.status(400).json({ message: "Invalid team invite code" });
        await storage.createTeamMember({
          teamId: team.id,
          userId: newUser.id,
          role: "member",
          permissions: null,
          invitedBy: null,
          joinedAt: /* @__PURE__ */ new Date(),
          status: "active"
        });
        req.session.activeTeamId = team.id;
      } else {
        const at = await getOrInitActiveTeamId(req, newUser.id);
        if (at) req.session.activeTeamId = at;
        else delete req.session.activeTeamId;
      }
      const { passwordHash: _, ...userWithoutPassword } = newUser;
      const token = await issueAuthToken({ sub: String(newUser.id), email: newUser.email });
      res.status(201).json({ user: userWithoutPassword, token });
    } catch (error) {
      console.error("[Auth] Signup error:", error);
      if (isDbConnectivityError2(error)) {
        return sendAuthError(res, 503, { code: "db_unavailable", message: "Database is unavailable" });
      }
      res.status(500).json({ message: `Signup failed: ${error.message}` });
    }
  });
  app2.post("/api/auth/logout", async (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });
  app2.get("/api/auth/me", async (req, res) => {
    try {
      const requestId = res.locals?.requestId || void 0;
      if (!req.session.userId) {
        return res.status(401).json({ message: "Not authenticated", requestId });
      }
      const user = await storage.getUserById(req.session.userId);
      if (!user) {
        req.session.destroy(() => {
        });
        return res.status(401).json({ message: "User not found", requestId });
      }
      const { passwordHash, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      const requestId = res.locals?.requestId || void 0;
      res.status(500).json({ message: error.message, requestId });
    }
  });
  const proxyRateLimit = /* @__PURE__ */ new Map();
  app2.get("/api/playground/proxy", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const rawUrl = String(req.query.url || "").trim();
      if (!rawUrl) return res.status(400).json({ message: "Missing url parameter" });
      let target;
      try {
        const withProto = rawUrl.startsWith("http://") || rawUrl.startsWith("https://") ? rawUrl : `https://${rawUrl}`;
        target = new URL(withProto);
      } catch {
        return res.status(400).json({ message: "Invalid URL" });
      }
      if (target.protocol !== "http:" && target.protocol !== "https:") {
        return res.status(400).json({ message: "Only http/https URLs allowed" });
      }
      const host = target.hostname.toLowerCase();
      if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.startsWith("192.168.") || host.startsWith("10.") || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.endsWith(".local") || host.endsWith(".internal")) {
        return res.status(403).json({ message: "Private/internal URLs are not allowed" });
      }
      const now = Date.now();
      const entry = proxyRateLimit.get(userId);
      if (entry && entry.resetAt > now) {
        if (entry.count >= 60) {
          return res.status(429).json({ message: "Rate limit exceeded. Try again shortly." });
        }
        entry.count++;
      } else {
        proxyRateLimit.set(userId, { count: 1, resetAt: now + 6e4 });
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12e3);
      let upstream;
      try {
        upstream = await fetch(target.toString(), {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9"
          },
          redirect: "follow"
        });
      } catch (e) {
        clearTimeout(timeout);
        const detail = e?.name === "AbortError" ? "Request timed out" : String(e?.message || e);
        return res.status(502).json({ message: "Could not reach the target site", detail });
      }
      clearTimeout(timeout);
      const responseHeaders = new Headers();
      const skip = /* @__PURE__ */ new Set([
        "x-frame-options",
        "content-security-policy",
        "content-security-policy-report-only",
        "x-content-security-policy",
        "x-webkit-csp"
      ]);
      for (const [key, value] of upstream.headers.entries()) {
        if (!skip.has(key.toLowerCase())) {
          responseHeaders.set(key, value);
        }
      }
      responseHeaders.set("X-Frame-Options", "ALLOWALL");
      responseHeaders.set("Content-Security-Policy", "frame-ancestors *");
      responseHeaders.set("Access-Control-Allow-Origin", "*");
      const contentType = upstream.headers.get("content-type") || "";
      res.status(upstream.status);
      const base = target.origin + target.pathname;
      if (contentType.includes("text/html")) {
        let html = await upstream.text();
        html = html.replace(/(src|href)=["'](?![a-z]+:)([^"']+)["']/gi, (match, attr, rel) => {
          try {
            const abs = new URL(rel, base).toString();
            return `${attr}="${abs}"`;
          } catch {
            return match;
          }
        });
        const targetHostname = target.hostname;
        html = html.replace(/(src|href)=(['"])(https?:\/\/[^'"]+)/gi, (match, attr, q, absUrl) => {
          try {
            const u = new URL(absUrl);
            if (u.hostname === targetHostname || u.hostname.endsWith("." + targetHostname)) {
              const proxied = `/api/playground/proxy?url=${encodeURIComponent(absUrl)}`;
              return `${attr}=${q}${proxied}${q}`;
            }
            return match;
          } catch {
            return match;
          }
        });
        const targetOrigin = target.origin;
        html = html.replace(/url\((['"]?)((?!data:|blob:)[^)'"]+?)\)/gi, (match, q, rawUrl2) => {
          try {
            const abs = new URL(rawUrl2.trim(), base).toString();
            if (abs.startsWith(targetOrigin) || !rawUrl2.trim().startsWith("http")) {
              const proxied = `/api/playground/proxy?url=${encodeURIComponent(abs)}`;
              return `url(${q}${proxied}${q})`;
            }
            return match;
          } catch {
            return match;
          }
        });
        const baseTag = `<base href="${target.origin}/">`;
        if (html.includes("<head")) {
          html = html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
        } else {
          html = baseTag + html;
        }
        responseHeaders.set("Content-Type", "text/html; charset=utf-8");
        responseHeaders.delete("content-length");
        res.send(html);
      } else if (contentType.includes("text/css")) {
        let css = await upstream.text();
        const cssHostname = target.hostname;
        css = css.replace(/url\((['"]?)((?!data:|blob:)[^)'"]+?)\)/gi, (match, q, rawUrl2) => {
          try {
            const abs = new URL(rawUrl2.trim(), base).toString();
            const absUrl = new URL(abs);
            if (absUrl.hostname === cssHostname || absUrl.hostname.endsWith("." + cssHostname)) {
              const proxied = `/api/playground/proxy?url=${encodeURIComponent(abs)}`;
              return `url(${q}${proxied}${q})`;
            }
            return match;
          } catch {
            return match;
          }
        });
        for (const [key, value] of responseHeaders.entries()) {
          if (!skip.has(key.toLowerCase())) res.setHeader(key, value);
        }
        res.setHeader("Content-Type", "text/css; charset=utf-8");
        res.send(css);
      } else {
        for (const [key, value] of responseHeaders.entries()) {
          if (!skip.has(key.toLowerCase())) res.setHeader(key, value);
        }
        const buffer = Buffer.from(await upstream.arrayBuffer());
        res.send(buffer);
      }
    } catch (error) {
      res.status(500).json({ message: "Proxy error", detail: String(error?.message || error) });
    }
  });
  app2.get("/api/playground/sessions/recent", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const limit = req.query.limit ? parseInt(req.query.limit) : 20;
      const items = await storage.listRecentPlaygroundPropertySessions(userId, limit);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/playground/sessions/open", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const address = String(req.body?.address || "").trim();
      if (!address) return res.status(400).json({ message: "address is required" });
      const addressKey = toAddressKey(address);
      const leadIdRaw = req.body?.leadId;
      const propertyIdRaw = req.body?.propertyId;
      const leadId = typeof leadIdRaw === "number" ? leadIdRaw : typeof leadIdRaw === "string" ? parseInt(leadIdRaw, 10) : NaN;
      const propertyId = typeof propertyIdRaw === "number" ? propertyIdRaw : typeof propertyIdRaw === "string" ? parseInt(propertyIdRaw, 10) : NaN;
      const existing = await storage.getPlaygroundPropertySessionByAddressKey(userId, addressKey);
      const throttleMs = 10 * 60 * 1e3;
      const prevOpenedAt = existing?.lastOpenedAt ? new Date(existing.lastOpenedAt) : null;
      const shouldLogOpen = !existing || !prevOpenedAt || Date.now() - prevOpenedAt.getTime() > throttleMs;
      let session2 = existing;
      if (!existing) {
        const validated = insertPlaygroundPropertySessionSchema.parse({
          address,
          addressKey,
          leadId: Number.isFinite(leadId) ? leadId : void 0,
          propertyId: Number.isFinite(propertyId) ? propertyId : void 0,
          tagsJson: "[]",
          bookmarksJson: "[]",
          checklistJson: "{}",
          notesJson: "[]",
          underwritingJson: "{}",
          createdBy: userId,
          updatedBy: userId,
          lastOpenedBy: userId,
          lastOpenedAt: /* @__PURE__ */ new Date()
        });
        session2 = await storage.createPlaygroundPropertySession(validated);
      } else {
        const nextLeadId = Number.isFinite(leadId) ? leadId : void 0;
        const nextPropertyId = Number.isFinite(propertyId) ? propertyId : void 0;
        session2 = await storage.updatePlaygroundPropertySession(existing.id, {
          lastOpenedBy: userId,
          lastOpenedAt: /* @__PURE__ */ new Date(),
          updatedBy: userId,
          leadId: existing.leadId ?? nextLeadId,
          propertyId: existing.propertyId ?? nextPropertyId
        });
      }
      if (shouldLogOpen) {
        await storage.createGlobalActivity({
          userId,
          action: "playground_open_session",
          description: `Opened playground session: ${session2.address}`,
          metadata: JSON.stringify({ playgroundSessionId: session2.id, address: session2.address, leadId: session2.leadId ?? null, propertyId: session2.propertyId ?? null })
        });
      }
      res.json(session2);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/playground/sessions", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const address = String(req.body?.address || "").trim();
      if (!address) return res.status(400).json({ message: "address is required" });
      const addressKey = toAddressKey(address);
      const validated = insertPlaygroundPropertySessionSchema.parse({
        ...req.body,
        address,
        addressKey,
        tagsJson: typeof req.body?.tagsJson === "string" ? req.body.tagsJson : "[]",
        bookmarksJson: typeof req.body?.bookmarksJson === "string" ? req.body.bookmarksJson : "[]",
        checklistJson: typeof req.body?.checklistJson === "string" ? req.body.checklistJson : "{}",
        notesJson: typeof req.body?.notesJson === "string" ? req.body.notesJson : "[]",
        underwritingJson: typeof req.body?.underwritingJson === "string" ? req.body.underwritingJson : "{}",
        createdBy: userId,
        updatedBy: userId,
        lastOpenedBy: userId,
        lastOpenedAt: /* @__PURE__ */ new Date()
      });
      const session2 = await storage.createPlaygroundPropertySession(validated);
      res.status(201).json(session2);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/playground/sessions/:id", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const id = parseInt(req.params.id);
      const session2 = await storage.getPlaygroundPropertySessionById(id);
      if (!session2) return res.status(404).json({ message: "Not found" });
      res.json(session2);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.patch("/api/playground/sessions/:id", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const user = await storage.getUserById(userId);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const id = parseInt(req.params.id);
      const leadIdRaw = req.body?.leadId;
      const propertyIdRaw = req.body?.propertyId;
      const leadId = typeof leadIdRaw === "number" ? leadIdRaw : typeof leadIdRaw === "string" ? parseInt(leadIdRaw, 10) : void 0;
      const propertyId = typeof propertyIdRaw === "number" ? propertyIdRaw : typeof propertyIdRaw === "string" ? parseInt(propertyIdRaw, 10) : void 0;
      const assignedToRaw = req.body?.assignedTo;
      const assignedTo = typeof assignedToRaw === "number" ? assignedToRaw : typeof assignedToRaw === "string" ? parseInt(assignedToRaw, 10) : void 0;
      if (typeof assignedTo === "number" && Number.isFinite(assignedTo)) {
        const ok = await requireAssigneeInActiveTeam(req, res, user, assignedTo);
        if (!ok) return;
      }
      const underwritingJson = typeof req.body?.underwritingJson === "string" ? req.body.underwritingJson : req.body?.underwritingJson && typeof req.body.underwritingJson === "object" ? JSON.stringify(req.body.underwritingJson) : void 0;
      const patch = {
        propertyType: req.body?.propertyType,
        currentUrl: req.body?.currentUrl,
        tagsJson: req.body?.tagsJson,
        bookmarksJson: req.body?.bookmarksJson,
        checklistJson: req.body?.checklistJson,
        notesJson: req.body?.notesJson,
        underwritingJson,
        leadId: typeof leadId === "number" && Number.isFinite(leadId) ? leadId : void 0,
        propertyId: typeof propertyId === "number" && Number.isFinite(propertyId) ? propertyId : void 0,
        assignedTo,
        assignmentDueAt: req.body?.assignmentDueAt === null ? null : req.body?.assignmentDueAt ? new Date(req.body.assignmentDueAt) : void 0,
        assignmentStatus: req.body?.assignmentStatus,
        updatedBy: userId
      };
      Object.keys(patch).forEach((k) => patch[k] === void 0 && delete patch[k]);
      const updated = await storage.updatePlaygroundPropertySession(id, patch);
      const fields = Object.keys(patch).filter((f) => f !== "updatedBy");
      let action = "playground_update_session";
      if (fields.includes("notesJson")) action = "playground_notes_saved";
      else if (fields.includes("bookmarksJson")) action = "playground_bookmarks_updated";
      else if (fields.includes("underwritingJson")) action = "playground_underwriting_saved";
      else if (fields.includes("assignedTo") || fields.includes("assignmentDueAt") || fields.includes("assignmentStatus")) action = "playground_assignment_updated";
      await storage.createGlobalActivity({
        userId,
        action,
        description: `Playground: ${updated.address}`,
        metadata: JSON.stringify({
          playgroundSessionId: updated.id,
          leadId: updated.leadId,
          propertyId: updated.propertyId,
          fields
        })
      });
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/playground/sessions/:id/send", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const id = parseInt(req.params.id);
      const session2 = await storage.getPlaygroundPropertySessionById(id);
      if (!session2) return res.status(404).json({ message: "Not found" });
      const targetType = String(req.body?.targetType || "").trim();
      const targetIdRaw = req.body?.targetId;
      const targetId = typeof targetIdRaw === "number" ? targetIdRaw : typeof targetIdRaw === "string" ? parseInt(targetIdRaw, 10) : NaN;
      if (targetType !== "lead" && targetType !== "opportunity") {
        return res.status(400).json({ message: "Invalid targetType" });
      }
      if (!Number.isFinite(targetId) || targetId <= 0) {
        return res.status(400).json({ message: "Invalid targetId" });
      }
      let underwriting = {};
      let bookmarks = [];
      let notes = [];
      try {
        underwriting = session2.underwritingJson ? JSON.parse(session2.underwritingJson) : {};
      } catch {
      }
      try {
        bookmarks = session2.bookmarksJson ? JSON.parse(session2.bookmarksJson) : [];
      } catch {
      }
      try {
        notes = session2.notesJson ? JSON.parse(session2.notesJson) : [];
      } catch {
      }
      const lines = [];
      lines.push("Playground Research");
      lines.push(`Address: ${session2.address}`);
      const safeNumber2 = (v) => {
        if (typeof v === "number" && Number.isFinite(v)) return v;
        if (typeof v === "string") {
          const n = parseFloat(String(v).replace(/[^\d.\-]/g, ""));
          return Number.isFinite(n) ? n : null;
        }
        return null;
      };
      const money = (v) => {
        const n = safeNumber2(v);
        if (n === null) return null;
        return `$${Math.round(n).toLocaleString("en-US")}`;
      };
      const uwLines = [];
      const uwV1 = underwritingSchemaV1.safeParse(underwriting);
      if (uwV1.success) {
        const uw = uwV1.data;
        const arvDerived = computeArvFromComps({ subjectSqft: null, comps: uw.comps }).value;
        const arv = money(uw.arv.value ?? arvDerived);
        const repairs = computeRepairTotal(uw.repairs);
        const repairsFmt = repairs > 0 ? `$${Math.round(repairs).toLocaleString("en-US")}` : null;
        const mao = money(uw.dealMath.mao);
        const offerMin = money(uw.dealMath.offerMin);
        const offerMax = money(uw.dealMath.offerMax);
        const offerTarget = money(uw.dealMath?.offerTarget);
        const strategy = uw.snapshot.strategy ? `Strategy: ${uw.snapshot.strategy}` : null;
        if (arv) uwLines.push(`ARV: ${arv}`);
        if (repairsFmt) uwLines.push(`Repairs: ${repairsFmt}`);
        if (mao) uwLines.push(`MAO: ${mao}`);
        if (offerMin || offerMax) uwLines.push(`Offer Range: ${offerMin || "?"} - ${offerMax || "?"}`);
        if (offerTarget) uwLines.push(`Target Offer: ${offerTarget}`);
        if (strategy) uwLines.push(strategy);
        const outputs = uw?.outputs || {};
        const profit = money(outputs.profit);
        const cashToClose = money(outputs.cashToClose);
        const noiAnnual = money(outputs.noiAnnual);
        const cashflowAnnual = money(outputs.cashflowAnnual);
        const pct = (v) => {
          const n = safeNumber2(v);
          if (n === null) return null;
          return `${n.toFixed(1)}%`;
        };
        const roiPct = pct(outputs.roiPct);
        const capRatePct = pct(outputs.capRatePct);
        const cocPct = pct(outputs.cashOnCashPct);
        const dscr = (() => {
          const n = safeNumber2(outputs.dscr);
          return n === null ? null : n.toFixed(2);
        })();
        if (uw.snapshot.strategy === "rental") {
          if (noiAnnual) uwLines.push(`NOI (annual): ${noiAnnual}`);
          if (capRatePct) uwLines.push(`Cap Rate: ${capRatePct}`);
          if (cashflowAnnual) uwLines.push(`Cashflow (annual): ${cashflowAnnual}`);
          if (cocPct) uwLines.push(`Cash-on-Cash: ${cocPct}`);
          if (dscr) uwLines.push(`DSCR: ${dscr}`);
          if (cashToClose) uwLines.push(`Cash to Close: ${cashToClose}`);
        } else {
          if (profit) uwLines.push(`Profit: ${profit}`);
          if (roiPct) uwLines.push(`ROI: ${roiPct}`);
          if (cashToClose) uwLines.push(`Cash to Close: ${cashToClose}`);
        }
      } else {
        const arv = money(underwriting.arv);
        const repairs = money(underwriting.repairEstimate);
        const mao = money(underwriting.mao);
        const offerMin = money(underwriting.offerMin);
        const offerMax = money(underwriting.offerMax);
        const exit = typeof underwriting.exitStrategy === "string" && underwriting.exitStrategy.trim() ? `Exit Strategy: ${underwriting.exitStrategy}` : null;
        if (arv) uwLines.push(`ARV: ${arv}`);
        if (repairs) uwLines.push(`Repairs: ${repairs}`);
        if (mao) uwLines.push(`MAO: ${mao}`);
        if (offerMin || offerMax) uwLines.push(`Offer Range: ${offerMin || "?"} - ${offerMax || "?"}`);
        if (exit) uwLines.push(exit);
      }
      if (uwLines.length) {
        lines.push("");
        lines.push("Underwriting");
        lines.push(...uwLines);
      }
      const topLinks = Array.isArray(bookmarks) ? bookmarks.slice(0, 8) : [];
      if (topLinks.length) {
        lines.push("");
        lines.push("Links");
        topLinks.forEach((b) => {
          const name = String(b?.name || "Link").trim();
          const url = String(b?.url || "").trim();
          if (url) lines.push(`- ${name}: ${url}`);
        });
      }
      const topNotes = Array.isArray(notes) ? notes.slice(0, 5) : [];
      if (topNotes.length) {
        lines.push("");
        lines.push("Notes");
        topNotes.forEach((n) => {
          const title = String(n?.title || "Note").trim();
          const content = String(n?.content || "").trim();
          const preview = content.length > 220 ? `${content.slice(0, 220)}\u2026` : content;
          lines.push(`- ${title}${preview ? `: ${preview.replace(/\s+/g, " ")}` : ""}`);
        });
      }
      const stamped = `[${(/* @__PURE__ */ new Date()).toLocaleString()}]
${lines.join("\n")}`;
      let leadId = session2.leadId ?? null;
      let propertyId = session2.propertyId ?? null;
      if (targetType === "lead") {
        const lead = await storage.getLeadById(targetId);
        if (!lead) return res.status(404).json({ message: "Lead not found" });
        const existing = String(lead.notes || "").trim();
        const nextNotes = existing ? `${existing}

${stamped}` : stamped;
        await storage.updateLead(lead.id, { notes: nextNotes });
        leadId = lead.id;
      } else {
        const property = await storage.getPropertyById(targetId);
        if (!property) return res.status(404).json({ message: "Opportunity not found" });
        const existing = String(property.notes || "").trim();
        const nextNotes = existing ? `${existing}

${stamped}` : stamped;
        await storage.updateProperty(property.id, { notes: nextNotes });
        propertyId = property.id;
      }
      const updated = await storage.updatePlaygroundPropertySession(session2.id, {
        leadId,
        propertyId,
        updatedBy: userId
      });
      await storage.createGlobalActivity({
        userId,
        action: "playground_send_to_crm",
        description: `Sent playground research to ${targetType}: ${targetId}`,
        metadata: JSON.stringify({ playgroundSessionId: session2.id, targetType, targetId, leadId, propertyId })
      });
      res.json({ session: updated, leadId, propertyId });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/playground/sessions/:id", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const id = parseInt(req.params.id);
      await storage.deletePlaygroundPropertySession(id);
      res.json({ message: "Deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/underwriting/templates", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const templates = await storage.getUnderwritingTemplates(userId);
      const mapped = templates.map((t) => {
        let config = {};
        try {
          config = underwritingTemplateConfigSchema.parse(t.configJson ? JSON.parse(t.configJson) : {});
        } catch {
          config = underwritingTemplateConfigSchema.parse({});
        }
        return { id: t.id, name: t.name, config };
      });
      res.json(mapped);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/underwriting/templates", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ message: "name is required" });
      const configInput = req.body?.config;
      const configObj = typeof configInput === "string" ? JSON.parse(configInput || "{}") : configInput && typeof configInput === "object" ? configInput : {};
      const config = underwritingTemplateConfigSchema.parse(configObj);
      const validated = insertUnderwritingTemplateSchema.parse({
        userId,
        name,
        configJson: JSON.stringify(config)
      });
      const created = await storage.createUnderwritingTemplate(validated);
      res.status(201).json({ id: created.id, name: created.name, config });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/underwriting/templates/:id", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const id = parseInt(req.params.id);
      const existing = await storage.getUnderwritingTemplateById(id);
      if (!existing || existing.userId !== userId) return res.status(404).json({ message: "Not found" });
      const patch = {};
      if (req.body?.name !== void 0) {
        const name = String(req.body?.name || "").trim();
        if (!name) return res.status(400).json({ message: "name is required" });
        patch.name = name;
      }
      if (req.body?.config !== void 0) {
        const configInput = req.body?.config;
        const configObj = typeof configInput === "string" ? JSON.parse(configInput || "{}") : configInput && typeof configInput === "object" ? configInput : {};
        const config2 = underwritingTemplateConfigSchema.parse(configObj);
        patch.configJson = JSON.stringify(config2);
      }
      if (!Object.keys(patch).length) return res.json({ id: existing.id, name: existing.name, config: JSON.parse(existing.configJson || "{}") });
      const updated = await storage.updateUnderwritingTemplate(id, patch);
      const config = underwritingTemplateConfigSchema.parse(updated.configJson ? JSON.parse(updated.configJson) : {});
      res.json({ id: updated.id, name: updated.name, config });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/underwriting/templates/:id", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const id = parseInt(req.params.id);
      const existing = await storage.getUnderwritingTemplateById(id);
      if (!existing || existing.userId !== userId) return res.status(404).json({ message: "Not found" });
      await storage.deleteUnderwritingTemplate(id);
      res.json({ message: "Deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/underwriting/ai", async (req, res) => {
    const schema = z4.object({
      subject: z4.object({ sqft: z4.number().finite().optional().nullable() }).default({}),
      underwriting: underwritingSchemaV1,
      templateConfig: underwritingTemplateConfigSchema.optional()
    });
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const payload = schema.parse(req.body || {});
      const repairsTotal = computeRepairTotal(payload.underwriting.repairs);
      const arvFromComps = computeArvFromComps({ subjectSqft: payload.subject.sqft ?? null, comps: payload.underwriting.comps });
      const template = payload.templateConfig ?? underwritingTemplateConfigSchema.parse({});
      const arv = payload.underwriting.arv.value ?? arvFromComps.value ?? 0;
      const dealMath = arv > 0 ? computeDealMath({ arv, repairs: repairsTotal, assumptions: payload.underwriting.assumptions, targetDiscountPct: template.targetDiscountPct }) : payload.underwriting.dealMath;
      res.json({
        suggestedArvRange: { low: arvFromComps.low, high: arvFromComps.high, value: arvFromComps.value },
        repairsTotal,
        dealMath,
        notes: {
          summary: "Suggested values are computed from selected comps and your template assumptions."
        }
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/dashboard/stats", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const cutoff = /* @__PURE__ */ new Date();
      cutoff.setHours(0, 0, 0, 0);
      cutoff.setDate(cutoff.getDate() - 14);
      const leadCount = await db.execute(sql4`
        select
          count(*)::int as active,
          count(*) filter (where last_touch_at is null or last_touch_at < ${cutoff.toISOString()})::int as stale
        from leads
        where archived_at is null and status not in ('dead','voided','closed')
      `);
      const staleTop = await db.execute(sql4`
        select id, address, city, state, last_touch_at as "lastTouchAt"
        from leads
        where archived_at is null and status not in ('dead','voided','closed')
          and (last_touch_at is null or last_touch_at < ${cutoff.toISOString()})
        order by last_touch_at asc nulls first
        limit 5
      `);
      res.json({
        activeLeads: Number(leadCount.rows?.[0]?.active || 0),
        staleLeadsCount: Number(leadCount.rows?.[0]?.stale || 0),
        staleLeadsTop: staleTop.rows || [],
        windowDays: 14
      });
    } catch (error) {
      if (isDbConnectivityError2(error)) {
        return res.status(503).json({ message: "Database is unavailable" });
      }
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/leads", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { limit, offset } = parseLimitOffset(req.query);
      const q = typeof req.query?.q === "string" ? req.query.q : "";
      const status = typeof req.query?.status === "string" ? req.query.status : "";
      const statusInRaw = typeof req.query?.statusIn === "string" ? req.query.statusIn : "";
      const statusIn = statusInRaw ? statusInRaw.split(",").map((s) => s.trim()).filter((s) => !!s && s.length <= 50).slice(0, 10) : void 0;
      const owner = typeof req.query?.owner === "string" ? req.query.owner : "";
      const zip = typeof req.query?.zip === "string" ? req.query.zip : "";
      const state = typeof req.query?.state === "string" ? req.query.state : "";
      const city = typeof req.query?.city === "string" ? req.query.city : "";
      const county = typeof req.query?.county === "string" ? req.query.county : "";
      const leadType = typeof req.query?.leadType === "string" ? req.query.leadType : "";
      const assignedToRaw = typeof req.query?.assignedTo === "string" ? req.query.assignedTo : "";
      const assignedTo = assignedToRaw === "unassigned" ? "unassigned" : assignedToRaw ? parseInt(assignedToRaw, 10) : void 0;
      const tagsRaw = typeof req.query?.tags === "string" ? req.query.tags : "";
      const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : void 0;
      const tagsModeRaw = typeof req.query?.tagsMode === "string" ? req.query.tagsMode : "";
      const tagsMode = tagsModeRaw === "all" ? "all" : tagsModeRaw === "any" ? "any" : void 0;
      const contactPresenceRaw = typeof req.query?.contactPresence === "string" ? req.query.contactPresence : "";
      const contactPresence = contactPresenceRaw === "phone_only" || contactPresenceRaw === "email_only" || contactPresenceRaw === "both" || contactPresenceRaw === "none" ? contactPresenceRaw : void 0;
      const scoreMinRaw = typeof req.query?.scoreMin === "string" ? req.query.scoreMin : "";
      const scoreMaxRaw = typeof req.query?.scoreMax === "string" ? req.query.scoreMax : "";
      const scoreMin = scoreMinRaw ? Number(scoreMinRaw) : void 0;
      const scoreMax = scoreMaxRaw ? Number(scoreMaxRaw) : void 0;
      const archivedRaw = typeof req.query?.archived === "string" ? req.query.archived : "";
      const archived = archivedRaw === "exclude" || archivedRaw === "include" || archivedRaw === "only" ? archivedRaw : void 0;
      const hasNotesRaw = typeof req.query?.hasNotes === "string" ? req.query.hasNotes : "";
      const hasNotes = hasNotesRaw === "true" ? true : hasNotesRaw === "false" ? false : void 0;
      const noteUpdatedWithinDaysRaw = typeof req.query?.noteUpdatedWithinDays === "string" ? req.query.noteUpdatedWithinDays : "";
      const noteUpdatedWithinDays = noteUpdatedWithinDaysRaw ? parseInt(noteUpdatedWithinDaysRaw, 10) : void 0;
      const lastTouchFromRaw = typeof req.query?.lastTouchFrom === "string" ? req.query.lastTouchFrom : "";
      const lastTouchToRaw = typeof req.query?.lastTouchTo === "string" ? req.query.lastTouchTo : "";
      const nextFollowUpFromRaw = typeof req.query?.nextFollowUpFrom === "string" ? req.query.nextFollowUpFrom : "";
      const nextFollowUpToRaw = typeof req.query?.nextFollowUpTo === "string" ? req.query.nextFollowUpTo : "";
      const sortKey = typeof req.query?.sortKey === "string" ? req.query.sortKey : void 0;
      const sortDir = typeof req.query?.sortDir === "string" ? req.query.sortDir : void 0;
      let createdFrom = void 0;
      let createdTo = void 0;
      const createdFromRaw = typeof req.query?.createdFrom === "string" ? req.query.createdFrom : "";
      const createdToRaw = typeof req.query?.createdTo === "string" ? req.query.createdTo : "";
      if (createdFromRaw) {
        const d = new Date(createdFromRaw);
        if (!Number.isNaN(d.getTime())) createdFrom = d;
      }
      if (createdToRaw) {
        const d = new Date(createdToRaw);
        if (!Number.isNaN(d.getTime())) createdTo = d;
      }
      let lastTouchFrom = void 0;
      let lastTouchTo = void 0;
      let nextFollowUpFrom = void 0;
      let nextFollowUpTo = void 0;
      if (lastTouchFromRaw) {
        const d = new Date(lastTouchFromRaw);
        if (!Number.isNaN(d.getTime())) lastTouchFrom = d;
      }
      if (lastTouchToRaw) {
        const d = new Date(lastTouchToRaw);
        if (!Number.isNaN(d.getTime())) lastTouchTo = d;
      }
      if (nextFollowUpFromRaw) {
        const d = new Date(nextFollowUpFromRaw);
        if (!Number.isNaN(d.getTime())) nextFollowUpFrom = d;
      }
      if (nextFollowUpToRaw) {
        const d = new Date(nextFollowUpToRaw);
        if (!Number.isNaN(d.getTime())) nextFollowUpTo = d;
      }
      const { items, total } = await storage.listLeads({
        q,
        status,
        statusIn,
        owner,
        zip,
        state,
        city,
        county,
        leadType,
        assignedTo: typeof assignedTo === "number" && Number.isFinite(assignedTo) ? assignedTo : assignedTo === "unassigned" ? "unassigned" : void 0,
        tags,
        tagsMode,
        contactPresence,
        scoreMin: typeof scoreMin === "number" && Number.isFinite(scoreMin) ? scoreMin : void 0,
        scoreMax: typeof scoreMax === "number" && Number.isFinite(scoreMax) ? scoreMax : void 0,
        archived,
        hasNotes,
        noteUpdatedWithinDays: typeof noteUpdatedWithinDays === "number" && Number.isFinite(noteUpdatedWithinDays) ? noteUpdatedWithinDays : void 0,
        lastTouchFrom,
        lastTouchTo,
        nextFollowUpFrom,
        nextFollowUpTo,
        sortKey,
        sortDir,
        createdFrom,
        createdTo,
        limit,
        offset
      });
      const leadIds = items.map((l) => Number(l.id)).filter((n) => Number.isFinite(n) && n > 0);
      const propertyLinks = await storage.getPropertiesBySourceLeadIds(leadIds);
      const bySourceLeadId = /* @__PURE__ */ new Map();
      for (const row of propertyLinks) {
        const sid = Number(row.sourceLeadId);
        const pid = Number(row.id);
        if (Number.isFinite(sid) && Number.isFinite(pid)) bySourceLeadId.set(sid, pid);
      }
      let notesAgg = [];
      try {
        notesAgg = await storage.getLeadNotesAggByLeadIds(leadIds);
      } catch {
        notesAgg = [];
      }
      const notesAggByLeadId = /* @__PURE__ */ new Map();
      for (const r of notesAgg || []) {
        const lid = Number(r.leadId);
        if (!Number.isFinite(lid) || lid <= 0) continue;
        notesAggByLeadId.set(lid, r);
      }
      res.json({
        items: items.map((l) => {
          const agg = notesAggByLeadId.get(Number(l.id));
          return {
            ...l,
            linkedPropertyId: bySourceLeadId.get(Number(l.id)) ?? null,
            notesCount: agg ? Number(agg.notesCount || 0) : 0,
            lastNoteAt: agg?.lastNoteAt ?? null,
            lastNotePreview: agg?.lastNotePreview ?? null
          };
        }),
        total
      });
    } catch (error) {
      console.error("GET /api/leads failed:", error);
      if (isDbConnectivityError2(error)) {
        return res.status(503).json({ message: "Database is unavailable" });
      }
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/leads/:id", async (req, res) => {
    try {
      const lead = await storage.getLeadById(parseInt(req.params.id));
      if (!lead) return res.status(404).json({ message: "Lead not found" });
      res.json(lead);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/leads/:id/notes", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const leadId = parseInt(req.params.id, 10);
      if (!Number.isFinite(leadId)) return res.status(400).json({ message: "Invalid lead id" });
      const limitRaw = typeof req.query?.limit === "string" ? req.query.limit : "";
      const limit = limitRaw ? parseInt(limitRaw, 10) : 50;
      const items = await storage.listLeadNotes(leadId, limit);
      res.json({ items });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/leads/:id/notes", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const leadId = parseInt(req.params.id, 10);
      if (!Number.isFinite(leadId)) return res.status(400).json({ message: "Invalid lead id" });
      const body = z4.object({ body: z4.string().trim().min(1).max(2e4) }).parse(req.body || {});
      const note = await storage.createLeadNote({
        leadId,
        createdBy: user.id,
        body: body.body
      });
      const now = /* @__PURE__ */ new Date();
      const lead = await storage.getLeadById(leadId);
      if (lead) {
        const existingNotes = String(lead.notes || "").trim();
        const appended = existingNotes ? `${existingNotes}

${body.body}` : body.body;
        await storage.updateLead(leadId, { lastTouchAt: now, notes: appended });
      } else {
        await storage.updateLead(leadId, { lastTouchAt: now });
      }
      if (req.session.userId) {
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action: "added_note",
          description: `Added note to lead`,
          metadata: JSON.stringify({ leadId, noteId: note.id })
        });
      }
      res.status(201).json(note);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/leads/views", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const teams2 = await storage.getTeamsForUser(user.id);
      const teamIds = (teams2 || []).map((t) => Number(t.id)).filter((n) => Number.isFinite(n) && n > 0);
      const items = await storage.listSavedViews({ entityType: "lead", userId: user.id, teamIds });
      res.json({ items });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/leads/views", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const payload = z4.object({
        name: z4.string().trim().min(1).max(120),
        visibility: z4.enum(["private", "team", "link"]).default("private"),
        teamId: z4.coerce.number().int().positive().optional().nullable(),
        configJson: z4.any()
      }).parse(req.body || {});
      let teamId = payload.teamId ?? null;
      if (payload.visibility === "team") {
        if (!teamId) teamId = await getOrInitActiveTeamId(req, user.id);
        if (!teamId) return res.status(400).json({ message: "No active team selected" });
        if (!user.isSuperAdmin) {
          const m = await storage.getTeamMemberByTeamAndUser(teamId, user.id);
          if (!m || String(m.status || "").toLowerCase() !== "active") return res.status(404).json({ message: "Not found" });
        }
      } else {
        teamId = null;
      }
      const shareToken = payload.visibility === "link" ? crypto10.randomBytes(24).toString("hex") : null;
      const row = await storage.createSavedView({
        entityType: "lead",
        name: payload.name,
        ownerUserId: user.id,
        teamId,
        visibility: payload.visibility,
        shareToken,
        configJson: payload.configJson
      });
      res.status(201).json(row);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/leads/views/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
      const existing = await storage.getSavedViewById(id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      if (!user.isSuperAdmin && Number(existing.ownerUserId) !== user.id) return res.status(404).json({ message: "Not found" });
      const payload = z4.object({
        name: z4.string().trim().min(1).max(120).optional(),
        configJson: z4.any().optional(),
        visibility: z4.enum(["private", "team", "link"]).optional()
      }).parse(req.body || {});
      const nextVisibility = payload.visibility ?? existing.visibility;
      const patch = {};
      if (typeof payload.name === "string") patch.name = payload.name;
      if (typeof payload.configJson !== "undefined") patch.configJson = payload.configJson;
      if (payload.visibility) patch.visibility = payload.visibility;
      if (nextVisibility === "link" && !existing.shareToken) patch.shareToken = crypto10.randomBytes(24).toString("hex");
      const row = await storage.updateSavedView(id, patch);
      res.json(row);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/leads/views/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
      const existing = await storage.getSavedViewById(id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      if (!user.isSuperAdmin && Number(existing.ownerUserId) !== user.id) return res.status(404).json({ message: "Not found" });
      await storage.deleteSavedView(id);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/leads/views/by-token/:token", async (req, res) => {
    try {
      const token = String(req.params.token || "").trim();
      if (!token) return res.status(404).json({ message: "Not found" });
      const row = await storage.getSavedViewByShareToken(token);
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  const normalizeLeadListFilter = (raw) => {
    const getStr = (k) => typeof raw?.[k] === "string" ? String(raw[k]) : "";
    const parseDate2 = (v) => {
      if (typeof v !== "string") return void 0;
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) return d;
      return void 0;
    };
    const parseNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : void 0;
    };
    const tagsRaw = raw?.tags;
    const tags = typeof tagsRaw === "string" ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : Array.isArray(tagsRaw) ? tagsRaw.map((t) => String(t || "").trim()).filter(Boolean) : void 0;
    const hasNotesRaw = raw?.hasNotes;
    const hasNotes = hasNotesRaw === true ? true : hasNotesRaw === false ? false : hasNotesRaw === "true" ? true : hasNotesRaw === "false" ? false : void 0;
    const assignedToRaw = raw?.assignedTo;
    const assignedTo = assignedToRaw === "unassigned" ? "unassigned" : typeof assignedToRaw === "number" ? assignedToRaw : typeof assignedToRaw === "string" && assignedToRaw.trim() ? parseInt(assignedToRaw, 10) : void 0;
    const archivedRaw = String(raw?.archived || "").trim();
    const archived = archivedRaw === "exclude" || archivedRaw === "include" || archivedRaw === "only" ? archivedRaw : void 0;
    const tagsModeRaw = String(raw?.tagsMode || "").trim();
    const tagsMode = tagsModeRaw === "all" || tagsModeRaw === "any" ? tagsModeRaw : void 0;
    const contactPresenceRaw = String(raw?.contactPresence || "").trim();
    const contactPresence = contactPresenceRaw === "phone_only" || contactPresenceRaw === "email_only" || contactPresenceRaw === "both" || contactPresenceRaw === "none" ? contactPresenceRaw : void 0;
    const sortKey = typeof raw?.sortKey === "string" ? raw.sortKey : void 0;
    const sortDir = raw?.sortDir === "asc" ? "asc" : raw?.sortDir === "desc" ? "desc" : void 0;
    return {
      q: getStr("query") || getStr("q"),
      status: getStr("status"),
      owner: getStr("owner"),
      zip: getStr("zip"),
      state: getStr("state"),
      city: getStr("city"),
      county: getStr("county"),
      leadType: getStr("leadType"),
      assignedTo: Number.isFinite(assignedTo) ? assignedTo : assignedTo === "unassigned" ? "unassigned" : void 0,
      tags,
      tagsMode,
      contactPresence,
      scoreMin: parseNum(raw?.scoreMin),
      scoreMax: parseNum(raw?.scoreMax),
      archived,
      hasNotes,
      noteUpdatedWithinDays: parseNum(raw?.noteUpdatedWithinDays),
      lastTouchFrom: parseDate2(raw?.lastTouchFrom),
      lastTouchTo: parseDate2(raw?.lastTouchTo),
      nextFollowUpFrom: parseDate2(raw?.nextFollowUpFrom),
      nextFollowUpTo: parseDate2(raw?.nextFollowUpTo),
      createdFrom: parseDate2(raw?.createdFrom),
      createdTo: parseDate2(raw?.createdTo),
      sortKey,
      sortDir
    };
  };
  app2.post("/api/leads/bulk/preview", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const payload = z4.object({
        selectionScope: z4.enum(["explicit", "all_filtered"]),
        leadIds: z4.array(z4.coerce.number().int().positive()).optional(),
        filter: z4.record(z4.any()).optional(),
        action: z4.string().trim().min(1).max(80),
        params: z4.record(z4.any()).optional()
      }).parse(req.body || {});
      const allowedAssignedToUserIds = user.isSuperAdmin ? void 0 : await (async () => {
        const teamId = await getOrInitActiveTeamId(req, user.id);
        if (!teamId) return [user.id];
        const members = await storage.getTeamMembers(teamId);
        return (members || []).filter((m) => String(m.status || "").toLowerCase() === "active").map((m) => Number(m.userId)).filter((n) => Number.isFinite(n) && n > 0);
      })();
      if (payload.selectionScope === "explicit") {
        const ids = (payload.leadIds || []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
        if (!ids.length) return res.json({ totalTargets: 0, validLeadIds: [] });
        const whereAllowed = allowedAssignedToUserIds && allowedAssignedToUserIds.length ? sql4`AND (assigned_to IS NULL OR assigned_to IN (${sql4.join(allowedAssignedToUserIds.map((id) => sql4`${id}`), sql4`,`)}))` : sql4``;
        const rows = await db.execute(sql4`
          SELECT id
          FROM leads
          WHERE id IN (${sql4.join(ids.map((id) => sql4`${id}`), sql4`,`)})
          ${whereAllowed}
        `);
        const validLeadIds = (rows.rows || []).map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n > 0);
        return res.json({ totalTargets: validLeadIds.length, validLeadIds });
      }
      const f = normalizeLeadListFilter(payload.filter || {});
      const { total } = await storage.listLeads({
        ...f,
        allowedAssignedToUserIds,
        limit: 1,
        offset: 0
      });
      res.json({ totalTargets: total });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/leads/bulk/jobs", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const payload = z4.object({
        selectionScope: z4.enum(["explicit", "all_filtered"]),
        leadIds: z4.array(z4.coerce.number().int().positive()).optional(),
        filter: z4.record(z4.any()).optional(),
        action: z4.enum(["set_status", "assign", "archive", "unarchive", "export"]),
        params: z4.record(z4.any()).optional()
      }).parse(req.body || {});
      const allowedAssignedToUserIds = user.isSuperAdmin ? void 0 : await (async () => {
        const teamId = await getOrInitActiveTeamId(req, user.id);
        if (!teamId) return [user.id];
        const members = await storage.getTeamMembers(teamId);
        return (members || []).filter((m) => String(m.status || "").toLowerCase() === "active").map((m) => Number(m.userId)).filter((n) => Number.isFinite(n) && n > 0);
      })();
      const job = await storage.createLeadBulkActionJob({
        createdBy: user.id,
        status: "queued",
        action: payload.action,
        selectionScope: payload.selectionScope,
        leadIds: payload.selectionScope === "explicit" ? payload.leadIds || [] : null,
        filterJson: payload.selectionScope === "all_filtered" ? payload.filter || {} : null,
        totalTargets: 0,
        processed: 0,
        succeeded: 0,
        failed: 0,
        resultJson: null
      });
      setImmediate(async () => {
        const updateJob = async (patch) => {
          try {
            await storage.updateLeadBulkActionJob(job.id, patch);
          } catch {
          }
        };
        const startAt = /* @__PURE__ */ new Date();
        await updateJob({ status: "running", startedAt: startAt, updatedAt: startAt });
        const runBatchUpdate = async (ids) => {
          if (!ids.length) return { processed: 0, succeeded: 0, failed: 0 };
          if (payload.action === "set_status") {
            const nextStatus = String(payload.params?.status || "").trim();
            if (!nextStatus) throw new Error("Missing status");
            await db.execute(sql4`
              UPDATE leads
              SET status = ${nextStatus}, status_changed_at = NOW(), updated_at = NOW()
              WHERE id IN (${sql4.join(ids.map((id) => sql4`${id}`), sql4`,`)})
            `);
            return { processed: ids.length, succeeded: ids.length, failed: 0 };
          }
          if (payload.action === "assign") {
            const nextAssignedTo = Number(payload.params?.assignedTo);
            if (!Number.isFinite(nextAssignedTo) || nextAssignedTo <= 0) throw new Error("Invalid assignedTo");
            await db.execute(sql4`
              UPDATE leads
              SET assigned_to = ${nextAssignedTo}, updated_at = NOW()
              WHERE id IN (${sql4.join(ids.map((id) => sql4`${id}`), sql4`,`)})
            `);
            return { processed: ids.length, succeeded: ids.length, failed: 0 };
          }
          if (payload.action === "archive") {
            await db.execute(sql4`
              UPDATE leads
              SET archived_at = NOW(), updated_at = NOW()
              WHERE id IN (${sql4.join(ids.map((id) => sql4`${id}`), sql4`,`)})
            `);
            return { processed: ids.length, succeeded: ids.length, failed: 0 };
          }
          if (payload.action === "unarchive") {
            await db.execute(sql4`
              UPDATE leads
              SET archived_at = NULL, updated_at = NOW()
              WHERE id IN (${sql4.join(ids.map((id) => sql4`${id}`), sql4`,`)})
            `);
            return { processed: ids.length, succeeded: ids.length, failed: 0 };
          }
          if (payload.action === "export") {
            const { job: exportJob, token } = await createExportJob({
              entityType: "lead",
              createdBy: user.id,
              format: "csv",
              filters: { ids },
              columns: [],
              expiresInMinutes: 60
            });
            const finalExport = await processExportJob(exportJob.id);
            await updateJob({ resultJson: { exportId: finalExport.id, token }, updatedAt: /* @__PURE__ */ new Date() });
            return { processed: ids.length, succeeded: ids.length, failed: 0 };
          }
          return { processed: ids.length, succeeded: 0, failed: ids.length };
        };
        try {
          let totalTargets = 0;
          let processed = 0;
          let succeeded = 0;
          let failed = 0;
          if (payload.selectionScope === "explicit") {
            const rawIds = (payload.leadIds || []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
            const unique = Array.from(new Set(rawIds));
            const whereAllowed = allowedAssignedToUserIds && allowedAssignedToUserIds.length ? sql4`AND (assigned_to IS NULL OR assigned_to IN (${sql4.join(allowedAssignedToUserIds.map((id) => sql4`${id}`), sql4`,`)}))` : sql4``;
            const rows = await db.execute(sql4`
              SELECT id
              FROM leads
              WHERE id IN (${sql4.join(unique.map((id) => sql4`${id}`), sql4`,`)})
              ${whereAllowed}
            `);
            const ids = (rows.rows || []).map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n > 0);
            totalTargets = ids.length;
            const out = await runBatchUpdate(ids);
            processed += out.processed;
            succeeded += out.succeeded;
            failed += out.failed;
          } else {
            const f = normalizeLeadListFilter(payload.filter || {});
            const pageSize = 500;
            let offset = 0;
            while (true) {
              const page = await storage.listLeads({
                ...f,
                allowedAssignedToUserIds,
                limit: pageSize,
                offset
              });
              if (!totalTargets) totalTargets = page.total;
              const ids = (page.items || []).map((l) => Number(l.id)).filter((n) => Number.isFinite(n) && n > 0);
              if (!ids.length) break;
              const out = await runBatchUpdate(ids);
              processed += out.processed;
              succeeded += out.succeeded;
              failed += out.failed;
              offset += pageSize;
              await updateJob({ totalTargets, processed, succeeded, failed, updatedAt: /* @__PURE__ */ new Date() });
              if (offset >= totalTargets) break;
            }
          }
          await updateJob({ status: "completed", totalTargets, processed, succeeded, failed, finishedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() });
        } catch (err) {
          await updateJob({
            status: "failed",
            resultJson: { error: String(err?.message || err) },
            finishedAt: /* @__PURE__ */ new Date(),
            updatedAt: /* @__PURE__ */ new Date()
          });
        }
      });
      res.status(201).json({ jobId: job.id, status: job.status });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/leads/bulk/jobs/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
      const job = await storage.getLeadBulkActionJobById(id);
      if (!job) return res.status(404).json({ message: "Not found" });
      if (!user.isSuperAdmin && Number(job.createdBy) !== user.id) return res.status(404).json({ message: "Not found" });
      res.json(job);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/ai/voice/parse", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "voice_playground")) return res.status(404).json({ message: "Not found" });
      const payload = z4.object({ transcript: z4.string().trim().min(1).max(5e3) }).parse(req.body || {});
      const t = payload.transcript.toLowerCase();
      let action = null;
      const params = {};
      const playgroundNoteMatch = t.match(/playground\s+note[:\s]+([\s\S]{1,5000})/) || t.match(/add\s+playground\s+note[:\s]+([\s\S]{1,5000})/) || t.match(/in\s+playground[:\s]+([\s\S]{1,5000})/);
      if (playgroundNoteMatch) {
        action = "playground_append_note";
        params.note = String(playgroundNoteMatch[1] || "").trim();
      }
      const noteMatch = !action && (t.match(/add\s+note[:\s]+([\s\S]{1,5000})/) || t.match(/note[:\s]+([\s\S]{1,5000})/) || t.match(/log\s+note[:\s]+([\s\S]{1,5000})/));
      if (noteMatch) {
        action = "add_note";
        params.body = String(noteMatch[1] || "").trim();
      }
      if (t.includes("unarchive")) action = "unarchive";
      else if (t.includes("archive")) action = "archive";
      else if (t.includes("export")) action = "export";
      const statusMatch = t.match(/status\s+to\s+([a-z0-9_\- ]{2,40})/) || t.match(/mark\s+as\s+([a-z0-9_\- ]{2,40})/) || t.match(/set\s+status\s+([a-z0-9_\- ]{2,40})/);
      if (statusMatch) {
        action = "set_status";
        params.status = String(statusMatch[1] || "").trim();
      }
      if (t.includes("assign to me")) {
        action = "assign";
        params.assignedTo = user.id;
      } else {
        const assignMatch = t.match(/assign\s+to\s+user\s+(\d{1,10})/);
        if (assignMatch) {
          action = "assign";
          params.assignedTo = Number(assignMatch[1]);
        }
      }
      res.json({ action, params, transcript: payload.transcript });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/ai/voice/preview", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "voice_playground")) return res.status(404).json({ message: "Not found" });
      const payload = z4.object({
        parsed: z4.object({ action: z4.string().nullable(), params: z4.record(z4.any()).default({}), transcript: z4.string().optional() }),
        leadIds: z4.array(z4.coerce.number().int().positive()).max(200).optional(),
        playground: z4.object({
          sessionId: z4.coerce.number().int().positive().optional(),
          address: z4.string().trim().max(255).optional(),
          leadId: z4.coerce.number().int().positive().optional(),
          propertyId: z4.coerce.number().int().positive().optional()
        }).optional()
      }).parse(req.body || {});
      const action = payload.parsed.action;
      const params = payload.parsed.params || {};
      if (action === "playground_append_note") {
        const note = String(params.note || "").trim();
        if (!note) return res.status(400).json({ message: "Missing note" });
        const ctx = payload.playground || {};
        const sessionId = typeof ctx.sessionId === "number" && Number.isFinite(ctx.sessionId) ? ctx.sessionId : null;
        const address = String(ctx.address || "").trim();
        let session2 = null;
        let wouldCreateSession = false;
        if (sessionId) {
          session2 = await storage.getPlaygroundPropertySessionById(sessionId);
        } else if (address) {
          const addressKey = toAddressKey(address);
          session2 = await storage.getPlaygroundPropertySessionByAddressKey(user.id, addressKey);
          if (!session2) wouldCreateSession = true;
        } else {
          return res.status(400).json({ message: "Missing playground sessionId or address" });
        }
        return res.json({
          changes: [],
          notes: null,
          playground: {
            sessionId: session2?.id ?? null,
            wouldCreateSession,
            notePreview: note.slice(0, 280),
            currentNotesCount: session2 ? (() => {
              try {
                return Array.isArray(JSON.parse(String(session2.notesJson || "[]"))) ? JSON.parse(String(session2.notesJson || "[]")).length : 0;
              } catch {
                return 0;
              }
            })() : 0
          }
        });
      }
      if (action === "add_note") {
        const body = String(params.body || "").trim();
        const ids2 = (payload.leadIds || []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
        if (!ids2.length) return res.json({ changes: [], notes: null, playground: null });
        if (!body) return res.status(400).json({ message: "Missing note body" });
        return res.json({ changes: [], notes: { leadIdsCount: ids2.length, bodyPreview: body.slice(0, 280) }, playground: null });
      }
      const ids = (payload.leadIds || []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
      if (!ids.length) return res.json({ changes: [], notes: null, playground: null });
      const leadRows = await db.execute(sql4`
        SELECT id, status, assigned_to as "assignedTo", archived_at as "archivedAt"
        FROM leads
        WHERE id IN (${sql4.join(ids.map((id) => sql4`${id}`), sql4`,`)})
      `);
      const leadsRows = leadRows.rows || [];
      const changes = leadsRows.map((r) => {
        const next = { id: Number(r.id) };
        if (action === "set_status") next.status = String(params.status || "").trim();
        if (action === "assign") next.assignedTo = Number(params.assignedTo);
        if (action === "archive") next.archivedAt = (/* @__PURE__ */ new Date()).toISOString();
        if (action === "unarchive") next.archivedAt = null;
        return { before: r, next };
      });
      res.json({ changes, notes: null, playground: null });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/ai/voice/apply", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "voice_playground")) return res.status(404).json({ message: "Not found" });
      const payload = z4.object({
        parsed: z4.object({ action: z4.string().nullable(), params: z4.record(z4.any()).default({}), transcript: z4.string().optional() }),
        transcript: z4.string().trim().min(1).max(5e3),
        leadIds: z4.array(z4.coerce.number().int().positive()).max(200).optional(),
        playground: z4.object({
          sessionId: z4.coerce.number().int().positive().optional(),
          address: z4.string().trim().max(255).optional(),
          leadId: z4.coerce.number().int().positive().optional(),
          propertyId: z4.coerce.number().int().positive().optional()
        }).optional()
      }).parse(req.body || {});
      const action = payload.parsed.action;
      const params = payload.parsed.params || {};
      if (action === "playground_append_note") {
        const note = String(params.note || "").trim();
        if (!note) return res.status(400).json({ message: "Missing note" });
        const ctx = payload.playground || {};
        const sessionId = typeof ctx.sessionId === "number" && Number.isFinite(ctx.sessionId) ? ctx.sessionId : null;
        const address = String(ctx.address || "").trim();
        const leadId = typeof ctx.leadId === "number" && Number.isFinite(ctx.leadId) ? ctx.leadId : void 0;
        const propertyId = typeof ctx.propertyId === "number" && Number.isFinite(ctx.propertyId) ? ctx.propertyId : void 0;
        let session2 = null;
        if (sessionId) {
          session2 = await storage.getPlaygroundPropertySessionById(sessionId);
          if (!session2) return res.status(404).json({ message: "Playground session not found" });
        } else if (address) {
          const addressKey = toAddressKey(address);
          session2 = await storage.getPlaygroundPropertySessionByAddressKey(user.id, addressKey);
          if (!session2) {
            const validated = insertPlaygroundPropertySessionSchema.parse({
              address,
              addressKey,
              leadId,
              propertyId,
              tagsJson: "[]",
              bookmarksJson: "[]",
              checklistJson: "{}",
              notesJson: "[]",
              underwritingJson: "{}",
              createdBy: user.id,
              updatedBy: user.id,
              lastOpenedBy: user.id,
              lastOpenedAt: /* @__PURE__ */ new Date()
            });
            session2 = await storage.createPlaygroundPropertySession(validated);
          }
        } else {
          return res.status(400).json({ message: "Missing playground sessionId or address" });
        }
        const prevNotesJson = String(session2.notesJson || "[]");
        let notesArr = [];
        try {
          const parsed = JSON.parse(prevNotesJson);
          notesArr = Array.isArray(parsed) ? parsed : [];
        } catch {
          notesArr = [];
        }
        const noteEntry = { id: crypto10.randomBytes(8).toString("hex"), createdAt: (/* @__PURE__ */ new Date()).toISOString(), createdBy: user.id, body: note };
        const nextNotesJson = JSON.stringify([...notesArr, noteEntry]);
        const updated = await storage.updatePlaygroundPropertySession(session2.id, { notesJson: nextNotesJson, updatedBy: user.id });
        const actionLog2 = await storage.createAiActionLog({
          createdBy: user.id,
          entityType: "playground",
          transcript: payload.transcript,
          parsedJson: payload.parsed,
          selectionJson: { playground: { sessionId: updated.id, address: updated.address, leadId: updated.leadId ?? null, propertyId: updated.propertyId ?? null } },
          appliedJson: { action, params }
        });
        const expiresAt2 = new Date(Date.now() + 60 * 60 * 1e3);
        await storage.createAiActionUndo({
          aiActionLogId: actionLog2.id,
          undoJson: [{ sessionId: updated.id, prevNotesJson }],
          expiresAt: expiresAt2
        });
        await storage.createGlobalActivity({
          userId: user.id,
          action: "playground_voice_append_note",
          description: "Voice appended playground note",
          metadata: JSON.stringify({ playgroundSessionId: updated.id })
        });
        return res.json({ ok: true, actionLogId: actionLog2.id, applied: 1, playgroundSessionId: updated.id });
      }
      const ids = (payload.leadIds || []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
      if (!ids.length) return res.json({ ok: true, applied: 0 });
      if (action === "add_note") {
        const body = String(params.body || "").trim();
        if (!body) return res.status(400).json({ message: "Missing note body" });
        const now = /* @__PURE__ */ new Date();
        for (const leadId of ids) {
          await storage.createLeadNote({ leadId, createdBy: user.id, body });
        }
        await db.execute(sql4`UPDATE leads SET last_touch_at = NOW(), updated_at = NOW() WHERE id IN (${sql4.join(ids.map((id) => sql4`${id}`), sql4`,`)})`);
        const actionLog2 = await storage.createAiActionLog({
          createdBy: user.id,
          entityType: "lead",
          transcript: payload.transcript,
          parsedJson: payload.parsed,
          selectionJson: { leadIds: ids },
          appliedJson: { action, params }
        });
        const expiresAt2 = new Date(Date.now() + 60 * 60 * 1e3);
        await storage.createAiActionUndo({
          aiActionLogId: actionLog2.id,
          undoJson: [],
          expiresAt: expiresAt2
        });
        await storage.createGlobalActivity({
          userId: user.id,
          action: "lead_voice_add_note",
          description: "Voice added lead note",
          metadata: JSON.stringify({ leadIdsCount: ids.length })
        });
        return res.json({ ok: true, actionLogId: actionLog2.id, applied: ids.length, createdAt: now.toISOString() });
      }
      const rows = await db.execute(sql4`
        SELECT id, status, assigned_to as "assignedTo", archived_at as "archivedAt"
        FROM leads
        WHERE id IN (${sql4.join(ids.map((id) => sql4`${id}`), sql4`,`)})
      `);
      const beforeRows = rows.rows || [];
      const undoJson = beforeRows.map((r) => ({
        id: Number(r.id),
        status: r.status ?? null,
        assignedTo: r.assignedTo ?? null,
        archivedAt: r.archivedAt ?? null
      }));
      const actionLog = await storage.createAiActionLog({
        createdBy: user.id,
        entityType: "lead",
        transcript: payload.transcript,
        parsedJson: payload.parsed,
        selectionJson: { leadIds: ids },
        appliedJson: { action, params }
      });
      const expiresAt = new Date(Date.now() + 60 * 60 * 1e3);
      await storage.createAiActionUndo({
        aiActionLogId: actionLog.id,
        undoJson,
        expiresAt
      });
      if (action === "set_status") {
        const nextStatus = String(params.status || "").trim();
        if (!nextStatus) return res.status(400).json({ message: "Missing status" });
        await db.execute(sql4`
          UPDATE leads
          SET status = ${nextStatus}, status_changed_at = NOW(), updated_at = NOW()
          WHERE id IN (${sql4.join(ids.map((id) => sql4`${id}`), sql4`,`)})
        `);
      } else if (action === "assign") {
        const nextAssignedTo = Number(params.assignedTo);
        if (!Number.isFinite(nextAssignedTo) || nextAssignedTo <= 0) return res.status(400).json({ message: "Invalid assignedTo" });
        await db.execute(sql4`
          UPDATE leads
          SET assigned_to = ${nextAssignedTo}, updated_at = NOW()
          WHERE id IN (${sql4.join(ids.map((id) => sql4`${id}`), sql4`,`)})
        `);
      } else if (action === "archive") {
        await db.execute(sql4`
          UPDATE leads
          SET archived_at = NOW(), updated_at = NOW()
          WHERE id IN (${sql4.join(ids.map((id) => sql4`${id}`), sql4`,`)})
        `);
      } else if (action === "unarchive") {
        await db.execute(sql4`
          UPDATE leads
          SET archived_at = NULL, updated_at = NOW()
          WHERE id IN (${sql4.join(ids.map((id) => sql4`${id}`), sql4`,`)})
        `);
      } else if (action === "export") {
        const { job: exportJob, token } = await createExportJob({
          entityType: "lead",
          createdBy: user.id,
          format: "csv",
          filters: { ids },
          columns: [],
          expiresInMinutes: 60
        });
        await processExportJob(exportJob.id);
        await storage.updateAiActionUndo((await storage.getAiActionUndoByActionId(actionLog.id)).id, { undoneAt: null });
        return res.json({ ok: true, actionLogId: actionLog.id, exportId: exportJob.id, token });
      } else {
        return res.status(400).json({ message: "Unsupported voice action" });
      }
      res.json({ ok: true, actionLogId: actionLog.id, applied: ids.length });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/ai/voice/undo", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "voice_playground")) return res.status(404).json({ message: "Not found" });
      const payload = z4.object({ aiActionLogId: z4.coerce.number().int().positive() }).parse(req.body || {});
      const undo = await storage.getAiActionUndoByActionId(payload.aiActionLogId);
      if (!undo) return res.status(404).json({ message: "Not found" });
      const expiresAt = undo.expiresAt ? new Date(undo.expiresAt) : null;
      if (expiresAt && expiresAt.getTime() < Date.now()) return res.status(400).json({ message: "Undo window expired" });
      if (undo.undoneAt) return res.status(400).json({ message: "Already undone" });
      const undoJson = Array.isArray(undo.undoJson) ? undo.undoJson : [];
      const leadRows = undoJson.filter((r) => Number.isFinite(Number(r?.id)) && Number(r?.id) > 0);
      const sessionRows = undoJson.filter((r) => Number.isFinite(Number(r?.sessionId)) && Number(r?.sessionId) > 0);
      for (const row of leadRows) {
        const id = Number(row.id);
        await db.execute(sql4`
          UPDATE leads
          SET status = ${row.status ?? null},
              assigned_to = ${row.assignedTo ?? null},
              archived_at = ${row.archivedAt ?? null},
              updated_at = NOW()
          WHERE id = ${id}
        `);
      }
      for (const row of sessionRows) {
        const sessionId = Number(row.sessionId);
        const prevNotesJson = typeof row.prevNotesJson === "string" ? row.prevNotesJson : "[]";
        await storage.updatePlaygroundPropertySession(sessionId, { notesJson: prevNotesJson, updatedBy: user.id });
      }
      await storage.updateAiActionUndo(undo.id, { undoneAt: /* @__PURE__ */ new Date() });
      res.json({ ok: true, restored: leadRows.length + sessionRows.length, restoredLeads: leadRows.length, restoredPlayground: sessionRows.length });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/audit/runs", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const limitRaw = typeof req.query?.limit === "string" ? req.query.limit : "";
      const limit = limitRaw ? parseInt(limitRaw, 10) : 50;
      const items = await storage.listAppAuditRuns({ createdBy: user.id, limit });
      res.json({ items });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/audit/runs", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const payload = z4.object({ scopeJson: z4.any() }).parse(req.body || {});
      const row = await storage.createAppAuditRun({ createdBy: user.id, scopeJson: payload.scopeJson });
      res.status(201).json(row);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/audit/runs/:id/findings", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const runId = parseInt(req.params.id, 10);
      if (!Number.isFinite(runId)) return res.status(400).json({ message: "Invalid run id" });
      const items = await storage.listAppAuditFindings({ runId, limit: 500 });
      res.json({ items });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/audit/runs/:id/findings", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const runId = parseInt(req.params.id, 10);
      if (!Number.isFinite(runId)) return res.status(400).json({ message: "Invalid run id" });
      const payload = z4.object({
        severity: z4.enum(["low", "medium", "high", "critical"]),
        area: z4.string().trim().min(1).max(80),
        title: z4.string().trim().min(1).max(160),
        description: z4.string().trim().min(1).max(2e4),
        recommendation: z4.string().trim().max(2e4).optional().nullable(),
        technicalNotes: z4.string().trim().max(2e4).optional().nullable(),
        affectedPages: z4.array(z4.string().trim().min(1).max(120)).min(1).max(50),
        fixPlan: z4.string().trim().min(1).max(2e4),
        ownerUserId: z4.coerce.number().int().positive().optional().nullable(),
        prdSection: z4.string().trim().max(500).optional().nullable()
      }).parse(req.body || {});
      const row = await storage.createAppAuditFinding({
        runId,
        severity: payload.severity,
        area: payload.area,
        title: payload.title,
        description: payload.description,
        recommendation: payload.recommendation ?? null,
        technicalNotes: payload.technicalNotes ?? null,
        affectedPages: payload.affectedPages,
        fixPlan: payload.fixPlan,
        ownerUserId: payload.ownerUserId ?? null,
        prdSection: payload.prdSection ?? null,
        status: "open"
      });
      res.status(201).json(row);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/audit/runs/:id/seed-pages", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const runId = parseInt(req.params.id, 10);
      if (!Number.isFinite(runId)) return res.status(400).json({ message: "Invalid run id" });
      const payload = z4.object({ mode: z4.enum(["append", "replace"]).default("append") }).parse(req.body || {});
      if (payload.mode === "replace") {
        await db.execute(sql4`DELETE FROM app_audit_findings WHERE run_id = ${runId}`);
      }
      const pages = [
        {
          title: "Dashboard: KPI correctness + work-queue links",
          area: "dashboard",
          affectedPages: ["/dashboard"],
          description: "Verify KPI correctness, loading states, and add deep links into active work queues (Leads, Tasks, Today).",
          fixPlan: "Audit KPIs for correctness and freshness; add primary CTAs to Leads/Tasks/Today with context and saved views."
        },
        {
          title: "Leads: Scale workflow (filters, views, bulk, notes, voice)",
          area: "leads",
          affectedPages: ["/leads"],
          description: "Upgrade Leads into the primary work queue and segmentation hub with safe bulk actions and voice-to-action.",
          fixPlan: "Wire advanced filters + saved views + column chooser + async bulk jobs + notes preview + voice action entry points."
        },
        {
          title: "Opportunities: Lead linking + next action handoff",
          area: "opportunities",
          affectedPages: ["/opportunities", "/opportunities/:id"],
          description: "Ensure Lead\u2194Opportunity linking is visible and provide clear next actions (Playground, Call, Follow-up).",
          fixPlan: "Add consistent link UI and contextual actions; ensure timeline and follow-ups connect back to Leads."
        },
        {
          title: "Playground: Context binding + voice append note",
          area: "playground",
          affectedPages: ["/playground"],
          description: "Playground should preserve context (leadId/propertyId/sessionId) and accept voice-to-action append notes safely.",
          fixPlan: "Add voice entry point; implement append-only note write target via session patch; ensure preview + audit log + undo when feasible."
        },
        {
          title: "Phone: Context handoff + activity semantics",
          area: "phone",
          affectedPages: ["/phone"],
          description: "Ensure opening Phone from Leads/Opportunities preserves context and creates consistent activity events.",
          fixPlan: "Standardize query params and link targets; ensure call outcomes write activity tied to lead/property IDs."
        },
        {
          title: "Dialer: Context handoff + activity semantics",
          area: "dialer",
          affectedPages: ["/dialer"],
          description: "Ensure opening Dialer from Leads preserves context and logging is consistent.",
          fixPlan: "Normalize deep-link params and enforce consistent activity logging and compliance checks."
        },
        {
          title: "Campaigns: Enroll from saved views (planned)",
          area: "campaigns",
          affectedPages: ["/campaigns"],
          description: "Allow campaign audiences to be enrolled from Leads saved views/segments (backlog this release).",
          fixPlan: "Design enrollment UX and backend targeting based on saved view config; add suppression rules; ship after Leads views are stable."
        },
        {
          title: "RVM: Audience from saved views + suppression (planned)",
          area: "rvm",
          affectedPages: ["/rvm"],
          description: "Allow RVM targeting from Leads saved views with suppression and preview counts (backlog this release).",
          fixPlan: "Reuse saved views targeting; add suppression engine (DNC/invalid/recent contact); add launch preview and result dashboards."
        },
        {
          title: "Field Mode: Offline capture integrity",
          area: "field",
          affectedPages: ["/field"],
          description: "Verify offline capture and sync creates leads, notes, and media reliably with dedupe.",
          fixPlan: "Audit offline queue handling and failure states; ensure created records link back to Leads/Playground context."
        },
        {
          title: "Tasks: Entity-linked execution",
          area: "tasks",
          affectedPages: ["/tasks"],
          description: "Ensure tasks created from Leads/Opportunities keep entity links and power Today/Calendar queues.",
          fixPlan: "Normalize quick-create flows; ensure navigation and due-date handling supports follow-up workflows."
        },
        {
          title: "Calendar: Follow-up visibility",
          area: "calendar",
          affectedPages: ["/calendar"],
          description: "Calendar should show follow-ups and tasks with links back to leads/opportunities.",
          fixPlan: "Audit calendar sources and deep-links; ensure follow-up dates align with Leads filters."
        },
        {
          title: "Today: Work queue compression",
          area: "today",
          affectedPages: ["/today"],
          description: "Today should be the operator queue for due tasks/follow-ups with one-click handoffs.",
          fixPlan: "Audit queue correctness; add fast actions to call/open lead/open playground; minimize clicks."
        },
        {
          title: "Notifications: Routing and deep links",
          area: "notifications",
          affectedPages: ["/notifications"],
          description: "Notifications should reliably link back to the correct entity context.",
          fixPlan: "Audit notification payloads; standardize entity references and target URLs."
        },
        {
          title: "Contacts: Link to leads and calls",
          area: "contacts",
          affectedPages: ["/contacts"],
          description: "Contacts should link to associated leads/opportunities and show communications context.",
          fixPlan: "Audit entity linking and add contextual navigation and activity timeline reuse."
        },
        {
          title: "Buyers: Dispo readiness links",
          area: "buyers",
          affectedPages: ["/buyers"],
          description: "Buyers should connect to opportunities and contract workflows.",
          fixPlan: "Audit buyer\u2192deal linking and add deep-links into opportunity detail and contracts."
        },
        {
          title: "Contracts: Opportunity context",
          area: "contracts",
          affectedPages: ["/contracts"],
          description: "Contracts should be generated/managed from opportunity context.",
          fixPlan: "Audit contract generation flow; ensure linked lead/property/buyer context is preserved and navigable."
        },
        {
          title: "Analytics: Data trust layer",
          area: "analytics",
          affectedPages: ["/analytics"],
          description: "Analytics must be correct and attributable to real actions and segments.",
          fixPlan: "Audit KPI definitions; ensure events and activity semantics are consistent and queryable."
        },
        {
          title: "Settings/Teams/System Health: Control plane alignment",
          area: "control_plane",
          affectedPages: ["/settings", "/teams", "/system-health"],
          description: "Ensure feature flags, team selection, and health signals connect to audit and workflows.",
          fixPlan: "Audit feature flag visibility and team selection; link health issues to audit findings; reduce config confusion."
        },
        {
          title: "XP surfaces: audit-only this release",
          area: "xp",
          affectedPages: ["/xp", "/xp/admin", "/xp/:slug", "/xp/checkout/success", "/xp/checkout/cancel"],
          description: "Include XP pages in the audit backlog; fix only if critical regressions are found.",
          fixPlan: "Create findings for UX correctness and conversion flow; defer enhancements unless blocking."
        }
      ];
      const created = [];
      for (const p of pages) {
        const row = await storage.createAppAuditFinding({
          runId,
          severity: "medium",
          area: p.area,
          title: p.title,
          description: p.description,
          recommendation: null,
          technicalNotes: null,
          affectedPages: p.affectedPages,
          fixPlan: p.fixPlan,
          ownerUserId: null,
          prdSection: null,
          status: "open"
        });
        created.push(row);
      }
      res.status(201).json({ createdCount: created.length });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/audit/findings/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
      if (!user.isSuperAdmin) {
        const rows = await db.execute(sql4`
          SELECT r.created_by as "createdBy"
          FROM app_audit_findings f
          JOIN app_audit_runs r ON r.id = f.run_id
          WHERE f.id = ${id}
          LIMIT 1
        `);
        const createdBy = Number(rows.rows?.[0]?.createdBy);
        if (!Number.isFinite(createdBy) || createdBy !== user.id) return res.status(404).json({ message: "Not found" });
      }
      const payload = z4.object({
        severity: z4.enum(["low", "medium", "high", "critical"]).optional(),
        area: z4.string().trim().min(1).max(80).optional(),
        title: z4.string().trim().min(1).max(160).optional(),
        description: z4.string().trim().min(1).max(2e4).optional(),
        recommendation: z4.string().trim().max(2e4).optional().nullable(),
        technicalNotes: z4.string().trim().max(2e4).optional().nullable(),
        affectedPages: z4.array(z4.string().trim().min(1).max(120)).min(1).max(50).optional(),
        fixPlan: z4.string().trim().min(1).max(2e4).optional(),
        ownerUserId: z4.coerce.number().int().positive().optional().nullable(),
        prdSection: z4.string().trim().max(500).optional().nullable(),
        status: z4.enum(["open", "in_progress", "resolved", "ignored"]).optional()
      }).parse(req.body || {});
      const row = await storage.updateAppAuditFinding(id, payload);
      res.json(row);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/audit/release-gate", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const rows = await db.execute(sql4`
        SELECT 
          f.id as "id",
          f.run_id as "runId",
          f.severity as "severity",
          f.area as "area",
          f.title as "title",
          f.status as "status",
          f.updated_at as "updatedAt"
        FROM app_audit_findings f
        JOIN app_audit_runs r ON r.id = f.run_id
        WHERE r.created_by = ${user.id}
          AND f.severity = 'critical'
          AND f.status IN ('open', 'in_progress')
        ORDER BY f.updated_at DESC, f.id DESC
        LIMIT 50
      `);
      const blockingItems = Array.isArray(rows.rows) ? rows.rows : [];
      res.json({
        ok: blockingItems.length === 0,
        blockingCount: blockingItems.length,
        blockingItems
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/skip-trace/config", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const enabled = await isFeatureEnabled(user.id, "skip_trace");
      if (!enabled) {
        return res.json({
          enabled: false,
          providerName: null,
          publicResearchEnabled: false,
          allowedModes: []
        });
      }
      const providerName = getSkipTraceProvider().name;
      const publicResearchEnabled = String(process.env.SKIP_TRACE_PUBLIC_RESEARCH_ENABLED || "").trim().toLowerCase() === "true";
      const allowedModes = publicResearchEnabled ? ["provider", "public_research", "both"] : ["provider"];
      res.json({
        enabled: true,
        providerName,
        publicResearchEnabled,
        allowedModes
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/skip-trace/jobs", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "skip_trace")) return res.status(404).json({ message: "Not found" });
      const body = z4.object({
        entityType: z4.enum(["lead", "opportunity"]),
        entityId: z4.coerce.number().int().positive(),
        mode: z4.enum(["provider", "public_research", "both"])
      }).parse(req.body);
      const job = await createSkipTraceJob({
        entityType: body.entityType,
        entityId: body.entityId,
        mode: body.mode,
        requestedByUserId: user.id
      });
      if (body.mode === "provider") {
        const out = await runSkipTraceJob(job.id);
        return res.json({ jobId: out.job.id, status: out.job.status });
      }
      res.json({ jobId: job.id, status: job.status });
    } catch (error) {
      if (isHttpError(error)) return res.status(error.statusCode).json({ message: error.message });
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/skip-trace/jobs/:jobId/run", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "skip_trace")) return res.status(404).json({ message: "Not found" });
      const jobId = parseInt(req.params.jobId, 10);
      if (!Number.isFinite(jobId)) return res.status(400).json({ message: "Invalid job id" });
      const job = await storage.getSkipTraceJobById(jobId);
      if (!job) return res.status(404).json({ message: "Not found" });
      if (!user.isSuperAdmin && job.requestedByUserId && Number(job.requestedByUserId) !== user.id) return res.status(404).json({ message: "Not found" });
      const out = await runSkipTraceJob(job.id);
      res.json({ jobId: out.job.id, status: out.job.status });
    } catch (error) {
      if (isHttpError(error)) return res.status(error.statusCode).json({ message: error.message });
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/skip-trace/jobs/:jobId", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "skip_trace")) return res.status(404).json({ message: "Not found" });
      const jobId = parseInt(req.params.jobId, 10);
      if (!Number.isFinite(jobId)) return res.status(400).json({ message: "Invalid job id" });
      const job = await storage.getSkipTraceJobById(jobId);
      if (!job) return res.status(404).json({ message: "Not found" });
      if (!user.isSuperAdmin && job.requestedByUserId && Number(job.requestedByUserId) !== user.id) return res.status(404).json({ message: "Not found" });
      const events = await storage.listSkipTraceJobEvents(job.id, 500);
      const evidence = await storage.listSkipTraceEvidence(job.id, 500);
      const scoreSnapshot = (await storage.listLeadScoreSnapshotsByJobId(job.id))[0] ?? null;
      const entityType = String(job.entityType || "").trim().toLowerCase();
      const entityId = Number(job.entityId);
      const lead = entityType === "lead" ? await storage.getLeadById(entityId) ?? null : null;
      const property = entityType === "opportunity" ? await storage.getPropertyById(entityId) ?? null : null;
      const providerRow = entityType === "lead" ? await storage.getLatestSkipTraceForLead(entityId) : entityType === "opportunity" ? await storage.getLatestSkipTraceForProperty(entityId) : null;
      const providerResult = providerRow && providerRow.jobId === job.id ? hydrateSkipTraceResultForApi(providerRow) : null;
      const merged = entityType === "lead" || entityType === "opportunity" ? mergeSkipTraceResult({
        entityType,
        entityId,
        lead,
        property,
        providerResult: providerRow && providerRow.jobId === job.id ? providerRow : null,
        evidence,
        scoreSnapshot
      }) : null;
      res.json({
        job,
        events,
        evidence,
        providerResult,
        scoreSnapshot,
        merged
      });
    } catch (error) {
      if (isHttpError(error)) return res.status(error.statusCode).json({ message: error.message });
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/leads/:id/skip-trace/latest", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "skip_trace")) return res.status(404).json({ message: "Not found" });
      const leadId = parseInt(req.params.id);
      const lead = await storage.getLeadById(leadId);
      if (!lead) return res.status(404).json({ message: "Lead not found" });
      const row = await storage.getLatestSkipTraceForLead(leadId);
      if (!row) return res.json(null);
      return res.json({
        ...row,
        phones: parseJsonArrayText2(row.phonesJson),
        emails: parseJsonArrayText2(row.emailsJson)
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/leads/:id/skip-trace", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "skip_trace")) return res.status(404).json({ message: "Not found" });
      const leadId = parseInt(req.params.id);
      const out = await runProviderSkipTraceForEntity({ entityType: "lead", entityId: leadId, requestedByUserId: user.id });
      if ("pending" in out && out.pending) {
        return res.json({ pending: true, result: hydrateSkipTraceResultForApi(out.providerResult) });
      }
      return res.json({ cached: out.cached, result: hydrateSkipTraceResultForApi(out.providerResult) });
    } catch (error) {
      if (isHttpError(error)) return res.status(error.statusCode).json({ message: error.message });
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/lead-source-options", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      let rows = await storage.getLeadSourceOptions(user.id);
      if (!rows.length) {
        const defaults = [
          "Cold Call",
          "Direct Mail",
          "Referral",
          "SMS",
          "PPC",
          "Driving for Dollars",
          "Inbound Call"
        ];
        for (let i = 0; i < defaults.length; i++) {
          const v = defaults[i];
          await storage.upsertLeadSourceOption({
            userId: user.id,
            value: v,
            label: v,
            sortOrder: i,
            isActive: true
          });
        }
        rows = await storage.getLeadSourceOptions(user.id);
      }
      res.json(rows.map((r) => ({
        id: r.id,
        value: r.value,
        label: r.label,
        isActive: r.isActive,
        sortOrder: r.sortOrder
      })));
    } catch (error) {
      try {
        const readiness = await getSchemaReadiness();
        if (!readiness.ok) {
          return res.status(503).json({ message: readiness.message, code: readiness.code, missing: readiness.missing, hint: schemaFixInstructions() });
        }
      } catch {
      }
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/lead-source-options", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const schema = z4.object({
        value: z4.string().trim().min(1).max(100),
        label: z4.string().trim().min(1).max(120),
        sortOrder: z4.number().int().min(0).max(1e5).optional(),
        isActive: z4.boolean().optional()
      });
      const payload = schema.parse(req.body || {});
      const row = await storage.upsertLeadSourceOption({
        userId: user.id,
        value: payload.value,
        label: payload.label,
        sortOrder: payload.sortOrder ?? 0,
        isActive: payload.isActive ?? true
      });
      res.status(201).json(row);
    } catch (error) {
      try {
        const readiness = await getSchemaReadiness();
        if (!readiness.ok) {
          return res.status(503).json({ message: readiness.message, code: readiness.code, missing: readiness.missing, hint: schemaFixInstructions() });
        }
      } catch {
      }
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/campaigns", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "campaigns")) return res.status(404).json({ message: "Not found" });
      const rows = await storage.getCampaigns(user.id);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/campaigns", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "campaigns")) return res.status(404).json({ message: "Not found" });
      const schema = z4.object({ name: z4.string().trim().min(1).max(120) });
      const payload = schema.parse(req.body || {});
      const row = await storage.createCampaign({ userId: user.id, name: payload.name, status: "active" });
      res.status(201).json(row);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/campaigns/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "campaigns")) return res.status(404).json({ message: "Not found" });
      const id = parseInt(req.params.id);
      const schema = z4.object({
        name: z4.string().trim().min(1).max(120).optional(),
        status: z4.string().trim().min(1).max(20).optional()
      });
      const payload = schema.parse(req.body || {});
      const row = await storage.updateCampaign(id, payload);
      res.json(row);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/campaigns/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "campaigns")) return res.status(404).json({ message: "Not found" });
      const id = parseInt(req.params.id);
      await storage.deleteCampaign(id);
      res.json({ message: "Deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/campaigns/:id/steps", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "campaigns")) return res.status(404).json({ message: "Not found" });
      const id = parseInt(req.params.id);
      const rows = await storage.getCampaignSteps(id);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/campaigns/:id/steps", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "campaigns")) return res.status(404).json({ message: "Not found" });
      const id = parseInt(req.params.id);
      const schema = z4.object({
        steps: z4.array(
          z4.object({
            stepOrder: z4.number().int().min(0),
            channel: z4.enum(["sms", "email"]),
            offsetDays: z4.number().int().min(0).default(0),
            sendWindowStart: z4.string().trim().regex(/^\d{2}:\d{2}$/).optional().nullable(),
            sendWindowEnd: z4.string().trim().regex(/^\d{2}:\d{2}$/).optional().nullable(),
            templateText: z4.string().default("")
          })
        )
      });
      const payload = schema.parse(req.body || {});
      const rows = await storage.replaceCampaignSteps(
        id,
        payload.steps.map((s) => ({
          campaignId: id,
          stepOrder: s.stepOrder,
          channel: s.channel,
          offsetDays: s.offsetDays,
          sendWindowStart: s.sendWindowStart || null,
          sendWindowEnd: s.sendWindowEnd || null,
          templateText: s.templateText || ""
        }))
      );
      res.json(rows);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/campaigns/:id/enroll", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "campaigns")) return res.status(404).json({ message: "Not found" });
      const id = parseInt(req.params.id);
      const schema = z4.object({ leadIds: z4.array(z4.number().int().positive()).min(1) });
      const payload = schema.parse(req.body || {});
      await storage.enrollCampaignLeads(id, payload.leadIds);
      await storage.createGlobalActivity({
        userId: user.id,
        action: "campaign_enrolled",
        description: `Enrolled ${payload.leadIds.length} lead(s) into campaign`,
        metadata: JSON.stringify({ campaignId: id, leadIds: payload.leadIds })
      });
      res.json({ enrolled: payload.leadIds.length });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/campaigns/:id/stats", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "campaigns")) return res.status(404).json({ message: "Not found" });
      const id = parseInt(req.params.id);
      const stats = await storage.getCampaignStats(id);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  function inSendWindow(now, start, end) {
    const s = String(start || "").trim();
    const e = String(end || "").trim();
    if (!/^\d{2}:\d{2}$/.test(s) || !/^\d{2}:\d{2}$/.test(e)) return true;
    const [sh, sm] = s.split(":").map(Number);
    const [eh, em] = e.split(":").map(Number);
    if (![sh, sm, eh, em].every((n) => Number.isFinite(n))) return true;
    const mins = now.getHours() * 60 + now.getMinutes();
    const startM = sh * 60 + sm;
    const endM = eh * 60 + em;
    if (startM <= endM) return mins >= startM && mins <= endM;
    return mins >= startM || mins <= endM;
  }
  app2.get("/api/rvm/audio-assets", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "rvm")) return res.status(404).json({ message: "Not found" });
      const rows = await storage.getRvmAudioAssets(user.id);
      res.json(rows.map((r) => ({ id: r.id, name: r.name, mimeType: r.mimeType, createdAt: r.createdAt })));
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/rvm/audio-assets", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "rvm")) return res.status(404).json({ message: "Not found" });
      const schema = z4.object({
        name: z4.string().trim().min(1).max(120),
        mimeType: z4.string().trim().min(1).max(120),
        contentBase64: z4.string().trim().min(1)
      });
      const payload = schema.parse(req.body || {});
      const row = await storage.createRvmAudioAsset({ userId: user.id, ...payload });
      res.status(201).json({ id: row.id, name: row.name, mimeType: row.mimeType, createdAt: row.createdAt });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/rvm/audio-assets/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "rvm")) return res.status(404).json({ message: "Not found" });
      const id = parseInt(req.params.id);
      await storage.deleteRvmAudioAsset(id);
      res.json({ message: "Deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/rvm/campaigns", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "rvm")) return res.status(404).json({ message: "Not found" });
      const rows = await storage.getRvmCampaigns(user.id);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/rvm/campaigns", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "rvm")) return res.status(404).json({ message: "Not found" });
      const schema = z4.object({
        name: z4.string().trim().min(1).max(120),
        sendWindowStart: z4.string().trim().regex(/^\d{2}:\d{2}$/).optional().nullable(),
        sendWindowEnd: z4.string().trim().regex(/^\d{2}:\d{2}$/).optional().nullable(),
        dailyCap: z4.number().int().min(1).max(1e5).optional(),
        audioAssetId: z4.number().int().positive().optional().nullable()
      });
      const payload = schema.parse(req.body || {});
      const row = await storage.createRvmCampaign({
        userId: user.id,
        name: payload.name,
        status: "draft",
        sendWindowStart: payload.sendWindowStart || null,
        sendWindowEnd: payload.sendWindowEnd || null,
        dailyCap: payload.dailyCap ?? 500,
        audioAssetId: payload.audioAssetId ?? null
      });
      res.status(201).json(row);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/rvm/campaigns/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "rvm")) return res.status(404).json({ message: "Not found" });
      const id = parseInt(req.params.id);
      const schema = z4.object({
        name: z4.string().trim().min(1).max(120).optional(),
        status: z4.string().trim().min(1).max(20).optional(),
        sendWindowStart: z4.string().trim().regex(/^\d{2}:\d{2}$/).optional().nullable(),
        sendWindowEnd: z4.string().trim().regex(/^\d{2}:\d{2}$/).optional().nullable(),
        dailyCap: z4.number().int().min(1).max(1e5).optional(),
        audioAssetId: z4.number().int().positive().optional().nullable()
      });
      const payload = schema.parse(req.body || {});
      const row = await storage.updateRvmCampaign(id, payload);
      res.json(row);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/rvm/campaigns/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "rvm")) return res.status(404).json({ message: "Not found" });
      const id = parseInt(req.params.id);
      await storage.deleteRvmCampaign(id);
      res.json({ message: "Deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/rvm/campaigns/:id/drops", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "rvm")) return res.status(404).json({ message: "Not found" });
      const id = parseInt(req.params.id);
      const rows = await storage.getRvmCampaignDrops(id, 200);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/rvm/campaigns/:id/launch", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "rvm")) return res.status(404).json({ message: "Not found" });
      const id = parseInt(req.params.id);
      const schema = z4.object({
        leadIds: z4.array(z4.number().int().positive()).min(1),
        audioAssetId: z4.number().int().positive().optional().nullable()
      });
      const payload = schema.parse(req.body || {});
      const campaignRows = await db.execute(sql4`
        SELECT id, user_id, name, send_window_start, send_window_end, daily_cap, audio_asset_id
        FROM rvm_campaigns
        WHERE id = ${id}
        LIMIT 1
      `);
      const campaign = campaignRows.rows?.[0];
      if (!campaign) return res.status(404).json({ message: "Campaign not found" });
      if (Number(campaign.user_id) !== user.id) return res.status(403).json({ message: "Forbidden" });
      const audioAssetId = payload.audioAssetId || Number(campaign.audio_asset_id || 0);
      if (!audioAssetId) return res.status(400).json({ message: "Audio asset is required" });
      const now = /* @__PURE__ */ new Date();
      if (!inSendWindow(now, campaign.send_window_start, campaign.send_window_end)) {
        return res.status(400).json({ message: "Outside allowed send window" });
      }
      const todayRows = await db.execute(sql4`
        SELECT COUNT(*)::int AS cnt
        FROM rvm_drops d
        JOIN rvm_campaigns c ON c.id = d.campaign_id
        WHERE c.user_id = ${user.id}
          AND d.requested_at >= date_trunc('day', NOW())
      `);
      const todayCount = Number(todayRows.rows?.[0]?.cnt || 0);
      const dailyCap = Number(campaign.daily_cap || 0) || 500;
      const remaining = Math.max(0, dailyCap - todayCount);
      if (remaining <= 0) return res.status(400).json({ message: "Daily RVM cap reached" });
      const toLaunch = payload.leadIds.slice(0, remaining);
      const leadsRows = await db.execute(sql4`
        SELECT id, owner_phone, do_not_call, do_not_text
        FROM leads
        WHERE id = ANY(${toLaunch})
      `);
      const leadRows = leadsRows.rows || [];
      const eligible = [];
      const failed = [];
      for (const r of leadRows) {
        const leadId = Number(r.id);
        const phone = String(r.owner_phone || "").trim();
        const blocked = !!r.do_not_call || !!r.do_not_text;
        if (blocked) {
          failed.push({ leadId, reason: "DNC" });
          continue;
        }
        if (!phone) {
          failed.push({ leadId, reason: "Missing phone" });
          continue;
        }
        eligible.push({ leadId, to: phone });
      }
      const provider = getRvmProvider();
      const results = await provider.requestDrops({ audioAssetId, toNumbers: eligible.map((x) => x.to) });
      const nowIso2 = /* @__PURE__ */ new Date();
      const dropsToInsert = [];
      for (const e of eligible) {
        const r = results.find((x) => x.toNumber === e.to);
        const status = r?.status || "failed";
        dropsToInsert.push({
          campaignId: id,
          leadId: e.leadId,
          toNumber: e.to,
          status,
          providerId: r?.providerId || null,
          requestedAt: nowIso2,
          completedAt: status === "sent" || status === "failed" ? nowIso2 : null,
          error: r?.error || null
        });
      }
      for (const f of failed) {
        dropsToInsert.push({
          campaignId: id,
          leadId: f.leadId,
          toNumber: "",
          status: "failed",
          providerId: null,
          requestedAt: nowIso2,
          completedAt: nowIso2,
          error: f.reason
        });
      }
      await storage.createRvmDrops(dropsToInsert);
      await storage.updateRvmCampaign(id, { status: "launched", audioAssetId });
      await storage.createGlobalActivity({
        userId: user.id,
        action: "rvm_campaign_launched",
        description: `RVM campaign launched: ${String(campaign.name || "")}`,
        metadata: JSON.stringify({ campaignId: id, requested: payload.leadIds.length, eligible: eligible.length, failed: failed.length })
      });
      res.json({ requested: payload.leadIds.length, launched: eligible.length, failed: failed.length, cappedAt: remaining });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/sync", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "field_mode")) return res.status(404).json({ message: "Not found" });
      const schema = z4.object({
        actions: z4.array(
          z4.object({
            idempotencyKey: z4.string().trim().min(1).max(120),
            type: z4.enum(["create_lead", "add_note", "enroll_campaign", "skip_trace_lead", "upload_media"]),
            payload: z4.any()
          })
        )
      });
      const payload = schema.parse(req.body || {});
      const results = [];
      for (const a of payload.actions) {
        const existing = await storage.getSyncIdempotency(user.id, a.idempotencyKey);
        if (existing) {
          try {
            results.push(JSON.parse(String(existing.responseJson || "{}")));
          } catch {
            results.push({ idempotencyKey: a.idempotencyKey, ok: false, error: "Invalid cached response" });
          }
          continue;
        }
        let out = { idempotencyKey: a.idempotencyKey, ok: true };
        try {
          if (a.type === "create_lead") {
            const leadSchema = insertLeadSchema.extend({ source: z4.string().trim().min(1) });
            const leadInput = leadSchema.parse(a.payload || {});
            const dedupeKey = computeLeadDedupeKey(leadInput);
            const lead = await storage.createLead({ ...leadInput, dedupeKey });
            out = { ...out, leadId: lead.id };
          } else if (a.type === "add_note") {
            const s = z4.object({ leadId: z4.number().int().positive(), note: z4.string().trim().min(1) });
            const p = s.parse(a.payload || {});
            const lead = await storage.getLeadById(p.leadId);
            if (!lead) throw new Error("Lead not found");
            const cur = String(lead.notes || "");
            const next = cur ? `${cur}

${p.note}` : p.note;
            await storage.updateLead(p.leadId, { notes: next });
            out = { ...out, leadId: p.leadId };
          } else if (a.type === "enroll_campaign") {
            const s = z4.object({ campaignId: z4.number().int().positive(), leadId: z4.number().int().positive() });
            const p = s.parse(a.payload || {});
            if (!await isFeatureEnabled(user.id, "campaigns")) throw new Error("Campaigns disabled");
            await storage.enrollCampaignLeads(p.campaignId, [p.leadId]);
            out = { ...out, campaignId: p.campaignId, leadId: p.leadId };
          } else if (a.type === "skip_trace_lead") {
            const s = z4.object({ leadId: z4.number().int().positive() });
            const p = s.parse(a.payload || {});
            if (!await isFeatureEnabled(user.id, "skip_trace")) throw new Error("Skip trace disabled");
            const r = await runProviderSkipTraceForEntity({ entityType: "lead", entityId: p.leadId, requestedByUserId: user.id });
            if ("pending" in r && r.pending) {
              out = { ...out, pending: true, cached: false, skipTraceId: r.providerResult.id };
            } else {
              out = { ...out, cached: r.cached, skipTraceId: r.providerResult.id };
            }
          } else if (a.type === "upload_media") {
            const s = z4.object({
              leadId: z4.number().int().positive().optional().nullable(),
              kind: z4.enum(["photo", "voice"]),
              mimeType: z4.string().trim().min(1).max(120),
              contentBase64: z4.string().trim().min(1)
            });
            const p = s.parse(a.payload || {});
            const row = await storage.createFieldMediaAsset({
              userId: user.id,
              leadId: p.leadId ?? null,
              kind: p.kind,
              mimeType: p.mimeType,
              contentBase64: p.contentBase64
            });
            out = { ...out, mediaId: row.id };
          }
        } catch (e) {
          out = { idempotencyKey: a.idempotencyKey, ok: false, error: String(e?.message || e) };
        }
        await storage.createSyncIdempotency({ userId: user.id, idempotencyKey: a.idempotencyKey, responseJson: JSON.stringify(out) });
        results.push(out);
      }
      res.json({ results });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/leads", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const validated = insertLeadSchema.parse(req.body);
      const source = String(validated.source || "").trim();
      if (!source || source === "__custom__") {
        return res.status(400).json({ message: "Lead source is required" });
      }
      const assignedTo = validated.assignedTo;
      if (typeof assignedTo === "number") {
        const ok = await requireAssigneeInActiveTeam(req, res, user, assignedTo);
        if (!ok) return;
      }
      const dedupeKey = computeLeadDedupeKey(validated);
      try {
        const dupRows = await db.execute(sql4`
          SELECT id FROM leads
          WHERE dedupe_key = ${dedupeKey}
          LIMIT 1
        `);
        if (dupRows.rows?.length) {
          const existingId = dupRows.rows[0].id;
          return res.status(409).json({ message: "Duplicate lead: address and owner already exist", leadId: existingId });
        }
      } catch {
      }
      const lead = await storage.createLead({ ...validated, dedupeKey });
      if (req.session.userId) {
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action: "created_lead",
          description: `Added new lead: ${lead.address}`,
          metadata: JSON.stringify({ leadId: lead.id, address: lead.address })
        });
      }
      try {
        await onLeadCreated({
          leadId: lead.id,
          leadAddress: String(lead.address || "").trim(),
          assignedTo: lead.assignedTo ?? null,
          createdBy: Number(req.session.userId || 0)
        });
      } catch {
      }
      try {
        const teamId = await getOrInitActiveTeamId(req, user.id);
        if (teamId) {
          await dispatchAutomationEvent({
            eventType: "lead.created",
            teamId,
            actorUserId: user.id,
            entity: { type: "lead", id: lead.id },
            payload: { lead }
          });
        }
      } catch {
      }
      res.status(201).json(lead);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/leads/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const partial = insertLeadSchema.partial().parse(req.body);
      const id = parseInt(req.params.id);
      const assignedTo = partial.assignedTo;
      if (typeof assignedTo === "number") {
        const ok = await requireAssigneeInActiveTeam(req, res, user, assignedTo);
        if (!ok) return;
      }
      const before = await storage.getLeadById(id);
      if (before) {
        const merged = { ...before, ...partial };
        if (merged.address && merged.city && merged.state && merged.zipCode && merged.ownerName) {
          partial.dedupeKey = computeLeadDedupeKey(merged);
        }
      }
      const lead = await storage.updateLead(id, partial);
      try {
        const property = await storage.getPropertyBySourceLeadId(id);
        if (property) {
          const propertyPatch = {};
          if (typeof partial.address !== "undefined") propertyPatch.address = partial.address;
          if (typeof partial.city !== "undefined") propertyPatch.city = partial.city;
          if (typeof partial.state !== "undefined") propertyPatch.state = partial.state;
          if (typeof partial.zipCode !== "undefined") propertyPatch.zipCode = partial.zipCode;
          if (Object.keys(propertyPatch).length) {
            await storage.updateProperty(property.id, propertyPatch);
            console.log(`[link] propagated lead ${id} fields to property ${property.id}`);
          }
        }
      } catch {
      }
      if (req.session.userId) {
        const onlyNotesChanged = before && typeof partial.notes !== "undefined" && partial.notes !== before.notes && Object.keys(partial).length === 1;
        const action = onlyNotesChanged ? "added_note" : "updated_lead";
        const description = onlyNotesChanged ? `Added note to lead: ${lead.address}` : `Updated lead: ${lead.address}`;
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action,
          description,
          metadata: JSON.stringify({ leadId: lead.id, address: lead.address })
        });
      }
      try {
        await onLeadStatusChanged({
          leadId: lead.id,
          leadAddress: String(lead.address || "").trim(),
          beforeStatus: before?.status ?? null,
          afterStatus: lead?.status ?? null,
          assignedTo: lead?.assignedTo ?? null,
          actorUserId: Number(req.session.userId || 0)
        });
      } catch {
      }
      try {
        const beforeStatus = String(before?.status || "");
        const afterStatus = String(lead?.status || "");
        if (beforeStatus !== afterStatus) {
          const teamId = await getOrInitActiveTeamId(req, user.id);
          if (teamId) {
            await dispatchAutomationEvent({
              eventType: "lead.status_changed",
              teamId,
              actorUserId: user.id,
              entity: { type: "lead", id: lead.id },
              payload: { leadId: lead.id, beforeStatus: beforeStatus || null, afterStatus: afterStatus || null, lead }
            });
            try {
              await writeAuditEvent({
                teamId,
                actorUserId: user.id,
                entityType: "lead",
                entityId: lead.id,
                action: "lead_status_changed",
                before: { status: beforeStatus || null },
                after: { status: afterStatus || null },
                kind: "update",
                ip: req.ip,
                userAgent: String(req.headers["user-agent"] || ""),
                requestId: res.locals?.requestId || null
              });
            } catch {
            }
          }
        }
      } catch {
      }
      res.json(lead);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/leads/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const lead = await storage.getLeadById(parseInt(req.params.id));
      await storage.deleteLead(parseInt(req.params.id));
      if (req.session.userId && lead) {
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action: "deleted_lead",
          description: `Deleted lead: ${lead.address}`,
          metadata: JSON.stringify({ leadId: lead.id, address: lead.address })
        });
      }
      res.json({ message: "Lead deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/leads/:id/convert-to-property", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const leadId = parseInt(req.params.id);
      const lead = await storage.getLeadById(leadId);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }
      const existingProperty = await storage.getPropertyBySourceLeadId(leadId);
      if (existingProperty) {
        return res.status(409).json({
          message: "Opportunity already exists for this lead",
          propertyId: existingProperty.id
        });
      }
      const propertyData = insertPropertySchema.parse({
        address: lead.address,
        city: lead.city,
        state: lead.state,
        zipCode: lead.zipCode,
        price: lead.estimatedValue || null,
        status: "active",
        sourceLeadId: lead.id,
        leadSource: lead.source || null,
        notes: lead.notes || null
      });
      const property = await storage.createProperty(propertyData);
      if (req.session.userId) {
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action: "converted_lead_to_property",
          description: `Converted lead to property: ${property.address}`,
          metadata: JSON.stringify({
            leadId: lead.id,
            propertyId: property.id,
            address: property.address
          })
        });
      }
      try {
        const teamId = await getOrInitActiveTeamId(req, user.id);
        if (teamId) {
          await dispatchAutomationEvent({
            eventType: "opportunity.created",
            teamId,
            actorUserId: user.id,
            entity: { type: "opportunity", id: property.id },
            payload: { opportunity: property, source: "lead.convert_to_property", leadId: lead.id }
          });
          try {
            await writeAuditEvent({
              teamId,
              actorUserId: user.id,
              entityType: "opportunity",
              entityId: property.id,
              action: "opportunity_created",
              before: null,
              after: property,
              kind: "create",
              ip: req.ip,
              userAgent: String(req.headers["user-agent"] || ""),
              requestId: res.locals?.requestId || null
            });
          } catch {
          }
        }
      } catch {
      }
      res.status(201).json({
        message: "Lead successfully converted to property",
        property
      });
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({ message: "Property already exists for this lead" });
      }
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/opportunities", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { limit, offset } = parseLimitOffset(req.query);
      const assignedToRaw = typeof req.query?.assignedTo === "string" ? req.query.assignedTo : "";
      const assignedTo = assignedToRaw ? parseInt(assignedToRaw, 10) : void 0;
      const allProperties = await storage.getProperties(limit, offset, assignedTo);
      res.json(
        (allProperties || []).map((p) => ({
          ...p,
          images: resolvePropertyImages(p.images)
        }))
      );
    } catch (error) {
      console.error("GET /api/opportunities failed:", error);
      if (isDbConnectivityError2(error)) {
        return res.status(503).json({ message: "Database is unavailable" });
      }
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/opportunities/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const id = parseInt(req.params.id);
      const property = await storage.getPropertyById(id);
      if (!property) return res.status(404).json({ message: "Opportunity not found" });
      let lead = null;
      if (property.sourceLeadId) {
        try {
          lead = await storage.getLeadById(property.sourceLeadId);
        } catch {
        }
      }
      res.json({ property: { ...property, images: resolvePropertyImages(property.images) }, lead });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/opportunities/:id/companies", async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "viewer" });
      if (!ctx) return;
      const opportunityId = parseInt(req.params.id, 10);
      const links = await storage.listCompanyLinksForEntity({ teamId: ctx.teamId, entityType: "opportunity", entityId: opportunityId });
      res.json(links);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/opportunities/:id/companies", async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "member" });
      if (!ctx) return;
      const opportunityId = parseInt(req.params.id, 10);
      const schema = insertCompanyLinkSchema.omit({ teamId: true, entityType: true, entityId: true });
      const validated = schema.parse(req.body || {});
      const companyId = Number(validated.companyId);
      const company = await storage.getCompanyById(companyId);
      if (!company || company.teamId !== ctx.teamId) return res.status(404).json({ message: "Company not found" });
      const link = await storage.createCompanyLink({
        teamId: ctx.teamId,
        companyId,
        entityType: "opportunity",
        entityId: opportunityId,
        role: typeof validated.role === "string" ? validated.role : null
      });
      try {
        await writeAuditEvent({
          teamId: ctx.teamId,
          actorUserId: ctx.user.id,
          entityType: "opportunity",
          entityId: opportunityId,
          action: "opportunity_company_link_added",
          before: null,
          after: link,
          kind: "update",
          ip: req.ip,
          userAgent: String(req.headers["user-agent"] || ""),
          requestId: res.locals?.requestId || null
        });
      } catch {
      }
      res.status(201).json(link);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/opportunities/:id/companies/:linkId", async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "member" });
      if (!ctx) return;
      const opportunityId = parseInt(req.params.id, 10);
      const linkId = parseInt(req.params.linkId, 10);
      const existing = await storage.listCompanyLinksForEntity({ teamId: ctx.teamId, entityType: "opportunity", entityId: opportunityId });
      const target = existing.find((r) => Number(r.link?.id) === linkId);
      if (!target) return res.status(404).json({ message: "Not found" });
      await storage.deleteCompanyLinkForTeam(ctx.teamId, linkId);
      try {
        await writeAuditEvent({
          teamId: ctx.teamId,
          actorUserId: ctx.user.id,
          entityType: "opportunity",
          entityId: opportunityId,
          action: "opportunity_company_link_removed",
          before: target.link,
          after: null,
          kind: "update",
          ip: req.ip,
          userAgent: String(req.headers["user-agent"] || ""),
          requestId: res.locals?.requestId || null
        });
      } catch {
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/property-photos/:key", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!isPropertyPhotoStorageConfigured()) {
      return res.status(503).json({ code: "photo_storage_not_configured", message: "Photo storage is not configured" });
    }
    const key = decodeURIComponent(String(req.params.key || ""));
    const url = await getPropertyPhotoSignedUrl(key);
    if (!url) return res.status(404).json({ message: "Not found" });
    res.redirect(url);
  });
  app2.post("/api/opportunities/:id/photos", upload.array("photos", 20), async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const opportunityId = parseInt(req.params.id, 10);
      const property = await storage.getPropertyById(opportunityId);
      if (!property) return res.status(404).json({ message: "Opportunity not found" });
      if (!isPropertyPhotoStorageConfigured()) {
        return res.status(503).json({ code: "photo_storage_not_configured", message: "Photo storage is not configured" });
      }
      const files = Array.isArray(req.files) ? req.files : [];
      if (!files.length) return res.status(400).json({ message: "No files uploaded" });
      const existingRaw = Array.isArray(property.images) ? property.images.filter(Boolean) : [];
      const uploaded = [];
      for (const f of files) {
        const out = await uploadPropertyPhoto({
          opportunityId,
          contentType: String(f.mimetype || "application/octet-stream"),
          body: f.buffer,
          originalName: String(f.originalname || "photo")
        });
        uploaded.push(`property-photo:${out.storageKey}`);
      }
      const updated = await storage.updateProperty(opportunityId, { images: [...existingRaw, ...uploaded] });
      res.json({ property: { ...updated, images: resolvePropertyImages(updated.images) } });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/opportunities/:id/skip-trace/latest", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "skip_trace")) return res.status(404).json({ message: "Not found" });
      const propertyId = parseInt(req.params.id);
      const property = await storage.getPropertyById(propertyId);
      if (!property) return res.status(404).json({ message: "Opportunity not found" });
      const row = await storage.getLatestSkipTraceForProperty(propertyId);
      if (!row) return res.json(null);
      return res.json({
        ...row,
        phones: parseJsonArrayText2(row.phonesJson),
        emails: parseJsonArrayText2(row.emailsJson)
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/opportunities/:id/skip-trace", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "skip_trace")) return res.status(404).json({ message: "Not found" });
      const propertyId = parseInt(req.params.id);
      const ownerNameOverride = req.body?.ownerName ? String(req.body.ownerName).trim() : null;
      const out = await runProviderSkipTraceForEntity({ entityType: "opportunity", entityId: propertyId, requestedByUserId: user.id, ownerNameOverride });
      if ("pending" in out && out.pending) {
        return res.json({ pending: true, result: hydrateSkipTraceResultForApi(out.providerResult) });
      }
      return res.json({ cached: out.cached, result: hydrateSkipTraceResultForApi(out.providerResult) });
    } catch (error) {
      if (isHttpError(error)) return res.status(error.statusCode).json({ message: error.message });
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/opportunities/:id/comps/snapshots", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const opportunityId = parseInt(req.params.id, 10);
      const rows = await storage.getCompSnapshotRowsByOpportunity(opportunityId, 500);
      if (!rows.length) return res.json({ avgArv: null, avgRent: null, saleComps: [], rentalComps: [] });
      const ids = Array.from(new Set(rows.map((r) => Number(r.compPropertyId)).filter(Number.isFinite)));
      const compsById = /* @__PURE__ */ new Map();
      if (ids.length) {
        const idSql = sql4.join(ids.map((id) => sql4`${id}`), sql4`, `);
        const out = await db.execute(sql4`
          SELECT id, address, city, state, zip_code, sqft, beds, baths, year_built, property_type, sold_price, sold_date, rent_per_month, rented_date, latitude, longitude
          FROM properties
          WHERE id IN (${idSql})
        `);
        for (const r of out.rows || []) compsById.set(Number(r.id), r);
      }
      const sale = [];
      const rental = [];
      for (const r of rows) {
        const comp = compsById.get(Number(r.compPropertyId)) || null;
        const base = {
          id: r.id,
          compPropertyId: Number(r.compPropertyId),
          distanceMiles: toNumberOrNull(r.distanceMiles),
          soldPrice: toNumberOrNull(r.soldPrice),
          soldDate: r.soldDate ?? null,
          rentPerMonth: toNumberOrNull(r.rentPerMonth),
          isRentalComp: !!r.isRentalComp,
          comp
        };
        if (base.isRentalComp) rental.push(base);
        else sale.push(base);
      }
      const avg = (vals) => {
        const xs = vals.filter((x) => typeof x === "number" && Number.isFinite(x));
        if (!xs.length) return null;
        return xs.reduce((a, b) => a + b, 0) / xs.length;
      };
      const avgArv = avg(sale.map((x) => x.soldPrice));
      const avgRent = avg(rental.map((x) => x.rentPerMonth));
      res.json({ avgArv, avgRent, saleComps: sale, rentalComps: rental });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/opportunities/:id/comps/pull", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const opportunityId = parseInt(req.params.id, 10);
      const property = await storage.getPropertyById(opportunityId);
      if (!property) return res.status(404).json({ message: "Opportunity not found" });
      const dealSqft = typeof property.sqft === "number" ? property.sqft : property.sqft ? Number(property.sqft) : null;
      const dealType = String(property.propertyType || "").trim();
      const dealLat = toNumberOrNull(property.latitude);
      const dealLng = toNumberOrNull(property.longitude);
      if (!dealSqft || !Number.isFinite(dealSqft)) return res.status(400).json({ message: "Opportunity is missing square footage" });
      if (!dealType) return res.status(400).json({ message: "Opportunity is missing property type" });
      if (dealLat === null || dealLng === null) return res.status(400).json({ message: "Opportunity is missing latitude/longitude" });
      const saleMinSqft = Math.floor(dealSqft * 0.85);
      const saleMaxSqft = Math.ceil(dealSqft * 1.15);
      const rentMinSqft = Math.floor(dealSqft * 0.8);
      const rentMaxSqft = Math.ceil(dealSqft * 1.2);
      const saleOut = await db.execute(sql4`
        SELECT id, latitude, longitude, sqft, sold_price, sold_date
        FROM properties
        WHERE id <> ${opportunityId}
          AND property_type = ${dealType}
          AND sqft IS NOT NULL
          AND sqft >= ${saleMinSqft} AND sqft <= ${saleMaxSqft}
          AND sold_price IS NOT NULL
          AND sold_date IS NOT NULL
          AND sold_date >= (CURRENT_DATE - INTERVAL '6 months')
          AND latitude IS NOT NULL AND longitude IS NOT NULL
      `);
      const rentalOut = await db.execute(sql4`
        SELECT id, latitude, longitude, sqft, rent_per_month, rented_date
        FROM properties
        WHERE id <> ${opportunityId}
          AND property_type = ${dealType}
          AND sqft IS NOT NULL
          AND sqft >= ${rentMinSqft} AND sqft <= ${rentMaxSqft}
          AND rent_per_month IS NOT NULL
          AND rented_date IS NOT NULL
          AND rented_date >= (CURRENT_DATE - INTERVAL '12 months')
          AND latitude IS NOT NULL AND longitude IS NOT NULL
      `);
      const dealPoint = { lat: dealLat, lng: dealLng };
      const saleRows = (saleOut.rows || []).map((r) => {
        const d = haversineMiles(dealPoint, { lat: toNumberOrNull(r.latitude) ?? 0, lng: toNumberOrNull(r.longitude) ?? 0 });
        return { ...r, distanceMiles: d };
      }).filter((r) => Number.isFinite(r.distanceMiles) && r.distanceMiles <= 1).sort((a, b) => a.distanceMiles - b.distanceMiles).slice(0, 25);
      const rentalRows = (rentalOut.rows || []).map((r) => {
        const d = haversineMiles(dealPoint, { lat: toNumberOrNull(r.latitude) ?? 0, lng: toNumberOrNull(r.longitude) ?? 0 });
        return { ...r, distanceMiles: d };
      }).filter((r) => Number.isFinite(r.distanceMiles) && r.distanceMiles <= 2).sort((a, b) => a.distanceMiles - b.distanceMiles).slice(0, 25);
      const rowsToPersist = [
        ...saleRows.map((r) => ({
          compPropertyId: Number(r.id),
          distanceMiles: String(Number(r.distanceMiles).toFixed(3)),
          soldPrice: r.sold_price != null ? String(r.sold_price) : null,
          soldDate: r.sold_date ?? null,
          isRentalComp: false,
          rentPerMonth: null
        })),
        ...rentalRows.map((r) => ({
          compPropertyId: Number(r.id),
          distanceMiles: String(Number(r.distanceMiles).toFixed(3)),
          soldPrice: null,
          soldDate: null,
          isRentalComp: true,
          rentPerMonth: r.rent_per_month != null ? String(r.rent_per_month) : null
        }))
      ];
      await storage.replaceCompSnapshotRows(opportunityId, rowsToPersist);
      const avg = (vals) => {
        const xs = vals.filter((x) => typeof x === "number" && Number.isFinite(x));
        if (!xs.length) return null;
        return xs.reduce((a, b) => a + b, 0) / xs.length;
      };
      const avgArv = avg(saleRows.map((r) => toNumberOrNull(r.sold_price)));
      const avgRent = avg(rentalRows.map((r) => toNumberOrNull(r.rent_per_month)));
      res.json({ avgArv, avgRent, saleCount: saleRows.length, rentalCount: rentalRows.length });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  async function recomputeBuyerMatches(opportunityId, userId) {
    const property = await storage.getPropertyById(opportunityId);
    if (!property) throw new Error("Opportunity not found");
    const dealZipCode = String(property.zipCode || "").trim();
    const dealState = String(property.state || "").trim();
    const dealPrice = toNumberOrNull(property.price);
    const dealRepairCost = toNumberOrNull(property.repairCost ?? property.repair_cost);
    const snapshotRows = await storage.getCompSnapshotRowsByOpportunity(opportunityId, 500);
    const saleRows = snapshotRows.filter((r) => !r.isRentalComp);
    const avgArvFromSnapshots = (() => {
      const vals = saleRows.map((r) => toNumberOrNull(r.soldPrice)).filter((x) => x !== null);
      if (!vals.length) return null;
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    })();
    const dealArv = avgArvFromSnapshots ?? toNumberOrNull(property.arv);
    const dealSpread = dealArv !== null && dealPrice !== null ? dealArv - dealPrice - (dealRepairCost ?? 0) : null;
    const buyers2 = await storage.getBuyers(2e3, 0);
    const buyerIds = (buyers2 || []).map((b) => Number(b.id)).filter(Number.isFinite);
    const profilesById = /* @__PURE__ */ new Map();
    if (buyerIds.length) {
      const idsSql = sql4.join(buyerIds.map((id) => sql4`${id}`), sql4`, `);
      const out = await db.execute(sql4`SELECT * FROM buyer_profiles WHERE id IN (${idsSql})`);
      for (const r of out.rows || []) profilesById.set(Number(r.id), r);
    }
    const historyBuyerIds = /* @__PURE__ */ new Set();
    if (dealZipCode) {
      const out = await db.execute(sql4`
        SELECT DISTINCT da.buyer_id
        FROM deal_assignments da
        INNER JOIN properties p ON p.id = da.property_id
        WHERE p.zip_code = ${dealZipCode}
      `);
      for (const r of out.rows || []) historyBuyerIds.add(Number(r.buyer_id));
    }
    const scored = (buyers2 || []).map((b) => {
      const buyerId = Number(b.id);
      const profile = profilesById.get(buyerId) || null;
      const targetZips = Array.isArray(profile?.target_zips) ? profile.target_zips.map(String) : Array.isArray(b.zipCodes) ? b.zipCodes.map(String) : [];
      const targetStates = Array.isArray(profile?.target_states) ? profile.target_states.map(String) : [];
      const minSpread = toNumberOrNull(profile?.min_spread);
      let score = 0;
      const reasons = [];
      if (dealZipCode && targetZips.includes(dealZipCode)) {
        score += 0.4;
        reasons.push(`Invests in ${dealZipCode}`);
      }
      if (dealState && targetStates.includes(dealState)) {
        score += 0.2;
        reasons.push(`Invests in ${dealState}`);
      }
      if (dealSpread !== null && minSpread !== null && dealSpread >= minSpread) {
        score += 0.3;
        reasons.push("Meets minimum spread");
      }
      if (historyBuyerIds.has(buyerId) && dealZipCode) {
        score += 0.3;
        reasons.push(`Has bought in ${dealZipCode}`);
      }
      const scoreInt = Math.max(0, Math.round(score * 1e3));
      return { buyerId, scoreInt, reasons };
    }).filter((m) => m.scoreInt > 0).sort((a, b) => b.scoreInt - a.scoreInt).slice(0, 50);
    await storage.replaceDealBuyerMatches(
      opportunityId,
      scored.map((m) => ({ buyerId: m.buyerId, score: m.scoreInt, reasons: m.reasons, computedAt: /* @__PURE__ */ new Date() }))
    );
    return scored;
  }
  app2.get("/api/opportunities/:id/buyer-matches", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const propertyId = parseInt(req.params.id);
      const rows = await storage.getDealBuyerMatches(propertyId, 25);
      res.json(
        (rows || []).map((r) => ({
          ...r,
          matchScore: typeof r.score === "number" ? r.score / 1e3 : toNumberOrNull(r.score) !== null ? toNumberOrNull(r.score) / 1e3 : 0,
          reasons: Array.isArray(r.reasons) ? r.reasons : []
        }))
      );
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/opportunities/:id/buyer-matches/recompute", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const propertyId = parseInt(req.params.id);
      const matches = await recomputeBuyerMatches(propertyId, user.id);
      res.json({ ok: true, count: matches.length });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/opportunities", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const validated = insertPropertySchema.parse(req.body);
      const dedupeKey = computeOpportunityDedupeKey(validated);
      const assignedTo = validated.assignedTo;
      if (typeof assignedTo === "number") {
        const ok = await requireAssigneeInActiveTeam(req, res, user, assignedTo);
        if (!ok) return;
      }
      try {
        const dupRows = await db.execute(sql4`
          SELECT id FROM properties
          WHERE dedupe_key = ${dedupeKey}
          LIMIT 1
        `);
        if (dupRows.rows?.length) {
          const existingId = dupRows.rows[0].id;
          return res.status(409).json({ message: "Duplicate opportunity: address already exists", opportunityId: existingId });
        }
      } catch {
      }
      const property = await storage.createProperty({ ...validated, dedupeKey });
      if (req.session.userId) {
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action: "created_opportunity",
          description: `Added new opportunity: ${property.address}`,
          metadata: JSON.stringify({ propertyId: property.id, address: property.address })
        });
      }
      try {
        const teamId = await getOrInitActiveTeamId(req, user.id);
        if (teamId) {
          await dispatchAutomationEvent({
            eventType: "opportunity.created",
            teamId,
            actorUserId: user.id,
            entity: { type: "opportunity", id: property.id },
            payload: { opportunity: property }
          });
          try {
            await writeAuditEvent({
              teamId,
              actorUserId: user.id,
              entityType: "opportunity",
              entityId: property.id,
              action: "opportunity_created",
              before: null,
              after: property,
              kind: "create",
              ip: req.ip,
              userAgent: String(req.headers["user-agent"] || ""),
              requestId: res.locals?.requestId || null
            });
          } catch {
          }
        }
      } catch {
      }
      res.status(201).json(property);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/opportunities/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const partial = insertPropertySchema.partial().parse(req.body);
      const id = parseInt(req.params.id);
      const assignedTo = partial.assignedTo;
      if (typeof assignedTo === "number") {
        const ok = await requireAssigneeInActiveTeam(req, res, user, assignedTo);
        if (!ok) return;
      }
      const before = await storage.getPropertyById(id);
      if (before) {
        const merged = { ...before, ...partial };
        if (merged.address && merged.city && merged.state && merged.zipCode) {
          partial.dedupeKey = computeOpportunityDedupeKey(merged);
        }
      }
      const property = await storage.updateProperty(id, partial);
      if (req.session.userId) {
        const onlyNotesChanged = before && typeof partial.notes !== "undefined" && partial.notes !== before.notes && Object.keys(partial).length === 1;
        const action = onlyNotesChanged ? "added_note" : "updated_opportunity";
        const description = onlyNotesChanged ? `Added note to opportunity: ${property.address}` : `Updated opportunity: ${property.address}`;
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action,
          description,
          metadata: JSON.stringify({ propertyId: property.id, address: property.address })
        });
      }
      try {
        const beforeStatus = String(before?.status || "");
        const afterStatus = String(property?.status || "");
        if (beforeStatus !== afterStatus) {
          const teamId = await getOrInitActiveTeamId(req, user.id);
          if (teamId) {
            await dispatchAutomationEvent({
              eventType: "opportunity.status_changed",
              teamId,
              actorUserId: user.id,
              entity: { type: "opportunity", id: property.id },
              payload: { opportunityId: property.id, beforeStatus: beforeStatus || null, afterStatus: afterStatus || null, opportunity: property }
            });
            try {
              await writeAuditEvent({
                teamId,
                actorUserId: user.id,
                entityType: "opportunity",
                entityId: property.id,
                action: "opportunity_status_changed",
                before: { status: beforeStatus || null },
                after: { status: afterStatus || null },
                kind: "update",
                ip: req.ip,
                userAgent: String(req.headers["user-agent"] || ""),
                requestId: res.locals?.requestId || null
              });
            } catch {
            }
          }
        }
      } catch {
      }
      res.json(property);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/opportunities/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const property = await storage.getPropertyById(parseInt(req.params.id));
      await storage.deleteProperty(parseInt(req.params.id));
      if (req.session.userId && property) {
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action: "deleted_opportunity",
          description: `Deleted opportunity: ${property.address}`,
          metadata: JSON.stringify({ propertyId: property.id, address: property.address })
        });
      }
      res.json({ message: "Opportunity deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/opportunities/:id/stage-change", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const propertyId = parseInt(req.params.id, 10);
      const { stage, notes } = req.body || {};
      const newStage = String(stage || "").trim();
      if (!isValidStage(newStage)) {
        return res.status(400).json({ message: "Invalid stage" });
      }
      const property = await storage.getPropertyById(propertyId);
      if (!property) return res.status(404).json({ message: "Opportunity not found" });
      const oldStage = property.stage || "lead";
      if (!canTransitionStage(oldStage, newStage)) {
        return res.status(400).json({ message: `Cannot transition from '${oldStage}' to '${newStage}'` });
      }
      if ((newStage === "dead" || newStage === "voided") && !String(notes || "").trim()) {
        return res.status(400).json({ message: `A reason is required to move to '${newStage}'. Add notes describing why the deal is ${newStage}.` });
      }
      const now = /* @__PURE__ */ new Date();
      await storage.updateProperty(propertyId, {
        stage: newStage,
        stageChangedAt: now,
        lastActivityAt: now
      });
      await logOpportunityEvent(
        propertyId,
        "stage_changed",
        `Stage changed to ${OPPORTUNITY_STAGE_CONFIG[newStage]?.label || newStage}`,
        notes || `Moved from '${oldStage}' to '${newStage}'`,
        user.id,
        "user",
        { oldStage, newStage }
      );
      try {
        const teamId = await getOrInitActiveTeamId(req, user.id);
        if (teamId) {
          await dispatchAutomationEvent({
            eventType: "opportunity.stage_changed",
            teamId,
            actorUserId: user.id,
            entity: { type: "opportunity", id: propertyId },
            payload: { oldStage, newStage, opportunity: { ...property, stage: newStage } }
          });
          await writeAuditEvent({
            teamId,
            actorUserId: user.id,
            entityType: "opportunity",
            entityId: propertyId,
            action: "opportunity_stage_changed",
            before: { stage: oldStage },
            after: { stage: newStage },
            kind: "update",
            ip: req.ip,
            userAgent: String(req.headers["user-agent"] || ""),
            requestId: res.locals?.requestId || null
          });
        }
      } catch {
      }
      if (["under_contract", "in_disposition", "reserved", "sold", "closed", "dead", "voided"].includes(newStage)) {
        await notifyOpportunityOwner({
          propertyId,
          category: "stage_changed",
          title: `Opportunity moved to ${OPPORTUNITY_STAGE_CONFIG[newStage]?.label || newStage}`,
          description: `${property?.address || `Opportunity #${propertyId}`} moved from '${oldStage}' to '${newStage}'.${notes ? ` Reason: ${notes}` : ""}`,
          eventKey: `stage:${propertyId}:${newStage}`,
          actorUserId: user.id
        });
      }
      const stageNow = /* @__PURE__ */ new Date();
      const day = 24 * 60 * 60 * 1e3;
      if (newStage === "under_contract") {
        await logOpportunityEvent(propertyId, "under_contract_entered", "Entered Under Contract", "Opportunity is now under contract. Check due diligence items.", user.id, "user", { oldStage });
        const inspectionDue = new Date(stageNow.getTime() + 10 * day);
        const emdDue = new Date(stageNow.getTime() + 3 * day);
        const ddDefs = [
          { title: "[Due Diligence] Deposit Earnest Money (EMD)", type: "due_diligence", priority: "high", dueAt: emdDue },
          { title: "[Due Diligence] Schedule Property Inspection", type: "due_diligence", priority: "high", dueAt: inspectionDue },
          { title: "[Due Diligence] Review Title Report", type: "due_diligence", priority: "medium", dueAt: new Date(stageNow.getTime() + 7 * day) },
          { title: "[Due Diligence] Secure Financing", type: "due_diligence", priority: "medium", dueAt: new Date(stageNow.getTime() + 5 * day) },
          { title: "[Due Diligence] Order Appraisal", type: "due_diligence", priority: "medium", dueAt: new Date(stageNow.getTime() + 3 * day) },
          { title: "[Due Diligence] Coordinate Walk-Through", type: "due_diligence", priority: "low", dueAt: inspectionDue }
        ];
        let ddCreated = 0;
        for (const d of ddDefs) {
          if (await ensureOpportunityTask(propertyId, user.id, d)) ddCreated += 1;
        }
        if (ddCreated > 0) {
          await logOpportunityEvent(propertyId, "checklist_created", "Due Diligence Checklist Created", `Auto-created ${ddCreated} due diligence tasks for under_contract stage.`, user.id, "system", { count: ddCreated });
        }
        if (await ensureOpportunityTask(propertyId, user.id, { title: "[Disposition] Create public listing for investors", type: "disposition", priority: "high", dueAt: new Date(stageNow.getTime() + 2 * day) })) {
          await logOpportunityEvent(propertyId, "disposition_checklist_created", "Disposition Checklist Created", "Auto-created disposition task (create public listing).", user.id, "system", {});
        }
      }
      if (newStage === "in_disposition") {
        await logOpportunityEvent(propertyId, "disposition_started", "Started Disposition", "Opportunity is now in the disposition phase.", user.id, "user", { oldStage });
        try {
          const listings = await storage.getPublicListingsByOpportunity(propertyId);
          if (!listings.some((l) => l.status === "published")) {
            await logOpportunityEvent(propertyId, "listing_required", "Create Public Listing", "No published public listing exists. Create or publish a listing to begin buyer outreach.", user.id, "system", {});
          }
        } catch {
        }
        if (await ensureOpportunityTask(propertyId, user.id, { title: "[Disposition] Buyer outreach & follow up", type: "disposition", priority: "high", dueAt: new Date(stageNow.getTime() + 1 * day) })) {
          await logOpportunityEvent(propertyId, "buyer_outreach_task_created", "Buyer Outreach Task Created", "Auto-created buyer outreach task for disposition.", user.id, "system", {});
        }
      }
      if (newStage === "reserved") {
        await logOpportunityEvent(propertyId, "reserved_entered", "Opportunity Reserved", "A buyer has committed. Coordinate closing and confirm the assignment.", user.id, "user", { oldStage });
        const closingDefs = [
          { title: "[Closing] Confirm buyer commitment / EMD", type: "closing", priority: "high", dueAt: new Date(stageNow.getTime() + 2 * day) },
          { title: "[Closing] Coordinate title & closing", type: "closing", priority: "high", dueAt: new Date(stageNow.getTime() + 7 * day) },
          { title: "[Closing] Order closing documents", type: "closing", priority: "medium", dueAt: new Date(stageNow.getTime() + 5 * day) }
        ];
        let closingCreated = 0;
        for (const d of closingDefs) {
          if (await ensureOpportunityTask(propertyId, user.id, d)) closingCreated += 1;
        }
        if (closingCreated > 0) {
          await logOpportunityEvent(propertyId, "closing_checklist_created", "Closing Coordination Checklist Created", `Auto-created ${closingCreated} closing coordination tasks.`, user.id, "system", { count: closingCreated });
        }
      }
      if (newStage === "sold" || newStage === "closed") {
        await logOpportunityEvent(
          propertyId,
          newStage === "sold" ? "sold_entered" : "closed_entered",
          newStage === "sold" ? "Opportunity Sold" : "Deal Closed",
          newStage === "sold" ? "Opportunity moved to sold. Record proceeds and archive listing." : "Deal closed. Wrap up documents and disburse funds.",
          user.id,
          "user",
          { oldStage }
        );
        try {
          const fresh = await storage.getPropertyById(propertyId);
          if (fresh && !fresh.closingDate) {
            await storage.updateProperty(propertyId, { closingDate: stageNow });
          }
        } catch {
        }
        try {
          const listings = await storage.getPublicListingsByOpportunity(propertyId);
          for (const l of listings) {
            if (l.status === "published") await storage.updatePublicListing(l.id, { status: "archived" });
          }
        } catch {
        }
        if (await ensureOpportunityTask(propertyId, user.id, { title: "[Closing] Final deal review & wrap-up", type: "closing", priority: "medium", dueAt: new Date(stageNow.getTime() + 3 * day) })) {
          await logOpportunityEvent(propertyId, "final_review_task_created", "Final Deal Review Task Created", "Auto-created final deal review task.", user.id, "system", {});
        }
      }
      if (newStage === "dead" || newStage === "voided") {
        const reason = String(notes || "").trim();
        await logOpportunityEvent(
          propertyId,
          newStage === "dead" ? "dead_entered" : "voided_entered",
          newStage === "dead" ? "Opportunity Marked Dead" : "Opportunity Voided",
          reason || "No reason provided.",
          user.id,
          "user",
          { oldStage, reason }
        );
        try {
          const listings = await storage.getPublicListingsByOpportunity(propertyId);
          for (const l of listings) {
            if (l.status === "published") await storage.updatePublicListing(l.id, { status: "paused" });
          }
        } catch {
        }
      }
      const updated = await storage.getPropertyById(propertyId);
      res.json({ property: { ...updated, images: resolvePropertyImages(updated.images) }, oldStage, newStage });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/opportunities/:id/parties", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const opportunityId = parseInt(req.params.id, 10);
      const property = await storage.getPropertyById(opportunityId);
      if (!property) return res.status(404).json({ message: "Opportunity not found" });
      const parties = await storage.getOpportunityParties(opportunityId);
      res.json(parties);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/opportunities/:id/parties", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const opportunityId = parseInt(req.params.id, 10);
      const property = await storage.getPropertyById(opportunityId);
      if (!property) return res.status(404).json({ message: "Opportunity not found" });
      const validated = insertOpportunityPartySchema.parse({ ...req.body || {}, opportunityId });
      const party = await storage.createOpportunityParty(validated);
      await logOpportunityEvent(opportunityId, "party_added", "Party added", `Added ${party.role}: ${party.name || party.email || party.phone || ""}`, user.id, "user", { partyId: party.id, role: party.role });
      res.status(201).json(party);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/opportunities/parties/:partyId", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const partyId = parseInt(req.params.partyId, 10);
      const party = await storage.getOpportunityPartyById(partyId);
      if (!party) return res.status(404).json({ message: "Party not found" });
      const validated = insertOpportunityPartySchema.partial().parse(req.body || {});
      const updated = await storage.updateOpportunityParty(partyId, validated);
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/opportunities/parties/:partyId", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const partyId = parseInt(req.params.partyId, 10);
      const party = await storage.getOpportunityPartyById(partyId);
      if (!party) return res.status(404).json({ message: "Party not found" });
      await storage.deleteOpportunityParty(partyId);
      await logOpportunityEvent(party.opportunityId, "party_removed", "Party removed", `Removed ${party.role}: ${party.name || party.email || ""} `, user.id, "user", { partyId, role: party.role });
      res.json({ message: "Party removed" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/opportunities/:id/listings", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const opportunityId = parseInt(req.params.id, 10);
      const property = await storage.getPropertyById(opportunityId);
      if (!property) return res.status(404).json({ message: "Opportunity not found" });
      const listings = await storage.getPublicListingsByOpportunity(opportunityId);
      res.json(listings);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/opportunities/:id/listings", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const opportunityId = parseInt(req.params.id, 10);
      const property = await storage.getPropertyById(opportunityId);
      if (!property) return res.status(404).json({ message: "Opportunity not found" });
      const body = req.body || {};
      const slug = String(body.slug || "").trim() || generateSlug(property.address || `opportunity-${opportunityId}`);
      const existing = await storage.getPublicListingBySlug(slug);
      if (existing && existing.opportunityId !== opportunityId) {
        return res.status(400).json({ message: "Slug already in use" });
      }
      const token = body.token || generateListingToken();
      const validated = insertPublicListingSchema.parse({
        ...body,
        opportunityId,
        slug,
        token
      });
      const listing = await storage.createPublicListing(validated);
      await logOpportunityEvent(opportunityId, "listing_created", "Public listing created", `Created listing: ${listing.title || slug}`, user.id, "user", { listingId: listing.id, slug });
      res.status(201).json(listing);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/listings/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const listingId = parseInt(req.params.id, 10);
      const existing = await storage.getPublicListingById(listingId);
      if (!existing) return res.status(404).json({ message: "Listing not found" });
      const validated = insertPublicListingSchema.partial().parse(req.body || {});
      const updated = await storage.updatePublicListing(listingId, validated);
      if (req.body?.status === "published" && !existing?.publishedAt) {
        await storage.updatePublicListing(listingId, { publishedAt: /* @__PURE__ */ new Date(), status: "published" });
        await logOpportunityEvent(existing.opportunityId, "listing_published", "Listing published", "Public listing is now live.", user.id, "user", { listingId });
      }
      if (req.body?.status === "archived") {
        await logOpportunityEvent(existing.opportunityId, "listing_archived", "Listing archived", "Public listing has been archived.", user.id, "user", { listingId });
      }
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/listings/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const listingId = parseInt(req.params.id, 10);
      await storage.deletePublicListing(listingId);
      res.json({ message: "Listing deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/listings/:id/share", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const listingId = parseInt(req.params.id, 10);
      const listing = await storage.getPublicListingById(listingId);
      if (!listing) return res.status(404).json({ message: "Listing not found" });
      const body = req.body || {};
      const channel = String(body.channel || "link").slice(0, 20);
      const target = String(body.target || "").trim().slice(0, 255) || null;
      await logOpportunityEvent(
        listing.opportunityId,
        "listing_shared",
        `Listing shared via ${channel}`,
        target ? `Share link sent to ${target} (${channel}).` : `Share link copied (${channel}).`,
        user.id,
        "user",
        { listingId, channel, target }
      );
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/opportunities/:id/inquiries", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const opportunityId = parseInt(req.params.id, 10);
      const property = await storage.getPropertyById(opportunityId);
      if (!property) return res.status(404).json({ message: "Opportunity not found" });
      const inquiries = await storage.getBuyerInquiries(opportunityId);
      res.json(inquiries);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.patch("/api/inquiries/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const inquiryId = parseInt(req.params.id, 10);
      const inquiry = await storage.getBuyerInquiryById(inquiryId);
      if (!inquiry) return res.status(404).json({ message: "Inquiry not found" });
      const body = req.body || {};
      const INQUIRY_STATUSES = ["new", "contacted", "qualified", "offer_received", "negotiating", "won", "lost", "spam"];
      const patch = {};
      if (body.status) {
        const status = String(body.status);
        if (!INQUIRY_STATUSES.includes(status)) return res.status(400).json({ message: "Invalid inquiry status" });
        patch.status = status;
      }
      if (body.notes !== void 0) patch.notes = body.notes;
      if (body.assignedToUserId !== void 0) patch.assignedToUserId = body.assignedToUserId === null || body.assignedToUserId === "" ? null : parseInt(body.assignedToUserId, 10);
      const updated = await storage.updateBuyerInquiry(inquiryId, patch);
      if (patch.status && patch.status !== inquiry.status) {
        await logOpportunityEvent(
          inquiry.opportunityId,
          "inquiry_status_changed",
          `Inquiry ${String(patch.status).replace("_", " ")}`,
          `${inquiry.name}'s inquiry (${inquiry.email || inquiry.phone || "no contact"}) marked ${String(patch.status).replace("_", " ")}.`,
          user.id,
          "user",
          { inquiryId, from: inquiry.status, to: patch.status }
        );
      }
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/inquiries/:id/convert", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const inquiryId = parseInt(req.params.id, 10);
      const inquiry = await storage.getBuyerInquiryById(inquiryId);
      if (!inquiry) return res.status(404).json({ message: "Inquiry not found" });
      const email = String(inquiry.email || "").trim().toLowerCase();
      const phone = String(inquiry.phone || "").trim().replace(/[^\d+]/g, "");
      let buyer = null;
      let created = false;
      if (email || phone) {
        const existing = await storage.getBuyers(1e3);
        buyer = existing.find(
          (b) => email && String(b.email || "").trim().toLowerCase() === email || phone && String(b.phone || "").trim().replace(/[^\d+]/g, "") === phone
        ) || null;
      }
      if (!buyer) {
        buyer = await storage.createBuyer({
          name: String(inquiry.name || "Unknown Buyer"),
          email: email || null,
          phone: inquiry.phone ? String(inquiry.phone).trim() : null,
          company: inquiry.company || null,
          buyerType: String(inquiry.buyerType || "individual"),
          proofOfFunds: Boolean(inquiry.proofOfFundsUrl),
          proofOfFundsNotes: inquiry.proofOfFundsUrl ? `POF from inquiry #${inquiry.id}` : null,
          notes: inquiry.message || null,
          status: "active",
          dedupeKey: email ? `email:${email}` : phone ? `phone:${phone}` : `name:${String(inquiry.name || "").toLowerCase()}`
        });
        created = true;
      }
      const parties = await storage.getOpportunityParties(inquiry.opportunityId);
      const alreadyParty = parties.some(
        (p) => p.role === "buyer" && (email && String(p.email || "").trim().toLowerCase() === email || phone && String(p.phone || "").trim().replace(/[^\d+]/g, "") === phone || buyer.id && p.contactId === buyer.id)
      );
      let party = null;
      if (!alreadyParty) {
        party = await storage.createOpportunityParty({
          opportunityId: inquiry.opportunityId,
          contactId: buyer.id,
          role: "buyer",
          name: String(inquiry.name || buyer.name || "Buyer"),
          email: email || null,
          phone: phone || null,
          company: inquiry.company || null,
          notes: `Converted from buyer inquiry #${inquiry.id}`
        });
      } else {
        party = parties.find(
          (p) => p.role === "buyer" && (email && String(p.email || "").trim().toLowerCase() === email || phone && String(p.phone || "").trim().replace(/[^\d+]/g, "") === phone || buyer.id && p.contactId === buyer.id)
        ) || null;
      }
      if (String(inquiry.status || "new") === "new") {
        await storage.updateBuyerInquiry(inquiryId, { status: "qualified" });
      }
      await logOpportunityEvent(
        inquiry.opportunityId,
        "inquiry_converted",
        "Inquiry Converted to Buyer",
        `${inquiry.name} converted to buyer${created ? "" : " (matched existing buyer)"}.`,
        user.id,
        "user",
        { inquiryId, buyerId: buyer.id, created, partyId: party?.id || null }
      );
      res.status(201).json({ buyer, party, created, alreadyParty: !!party && !created && !!alreadyParty });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/inquiries/:id/offer", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const inquiryId = parseInt(req.params.id, 10);
      const inquiry = await storage.getBuyerInquiryById(inquiryId);
      if (!inquiry) return res.status(404).json({ message: "Inquiry not found" });
      const body = req.body || {};
      const amount = body.amount !== void 0 && body.amount !== "" ? Number(body.amount) : inquiry.offerAmount ? Number(inquiry.offerAmount) : NaN;
      if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: "A valid offer amount is required" });
      const offer = await storage.createBuyerOffer({
        opportunityId: inquiry.opportunityId,
        buyerInquiryId: inquiry.id,
        buyerContactId: null,
        amount: String(amount),
        earnestMoney: body.earnestMoney !== void 0 && body.earnestMoney !== "" ? String(Number(body.earnestMoney)) : null,
        financingType: body.financingType ? String(body.financingType).slice(0, 50) : null,
        closeBy: body.closeBy ? new Date(body.closeBy) : null,
        terms: body.terms ? String(body.terms) : inquiry.message || null,
        assignmentTerms: body.assignmentTerms ? String(body.assignmentTerms) : null,
        notes: body.notes ? String(body.notes) : null,
        status: "received",
        version: 1,
        parentOfferId: null,
        superseded: false,
        createdBy: user.id
      });
      if (String(inquiry.status || "new") === "new") {
        await storage.updateBuyerInquiry(inquiryId, { status: "offer_received" });
      }
      await logOpportunityEvent(inquiry.opportunityId, "offer_created", "Offer Created from Inquiry", `Offer of $${amount.toLocaleString()} created from ${inquiry.name}'s inquiry.`, user.id, "user", { offerId: offer.id, inquiryId: inquiry.id, amount: String(amount) });
      res.status(201).json(offer);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/opportunities/:id/events", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const opportunityId = parseInt(req.params.id, 10);
      const property = await storage.getPropertyById(opportunityId);
      if (!property) return res.status(404).json({ message: "Opportunity not found" });
      const limit = parseInt(String(req.query.limit || "100"), 10);
      const events = await storage.getOpportunityEvents(opportunityId, limit);
      res.json(events);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/properties", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { limit, offset } = parseLimitOffset(req.query);
      const allProperties = await storage.getProperties(limit, offset);
      res.json(allProperties);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/dialer/lists", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    res.json([
      { id: "new", name: "New leads" },
      { id: "followups_due", name: "Follow-ups due" },
      { id: "all_callable", name: "All callable" }
    ]);
  });
  app2.get("/api/dialer/scripts", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
      const listIdRaw = typeof req.query.listId === "string" ? req.query.listId : "";
      const listId = String(listIdRaw || "").trim() || null;
      let where = sql4`user_id = ${user.id}`;
      if (listId) where = sql4`${where} AND (list_id IS NULL OR list_id = ${listId})`;
      else where = sql4`${where} AND list_id IS NULL`;
      const result = await db.execute(sql4`
        SELECT id, list_id as "listId", name, content, is_default as "isDefault", created_at as "createdAt", updated_at as "updatedAt"
        FROM dialer_scripts
        WHERE ${where}
        ORDER BY is_default DESC, updated_at DESC, id DESC
      `);
      res.json({ items: result.rows || [] });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/dialer/scripts", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
      const name = String(req.body?.name || "").trim();
      const content = String(req.body?.content || "");
      const listId = String(req.body?.listId || "").trim() || null;
      const isDefault = Boolean(req.body?.isDefault);
      if (!name) return res.status(400).json({ message: "Missing name" });
      if (name.length > 120) return res.status(400).json({ message: "Name too long" });
      if (content.length > 5e4) return res.status(400).json({ message: "Content too long" });
      const listKey = listId || "";
      if (isDefault) {
        await db.execute(sql4`
          UPDATE dialer_scripts
          SET is_default = false, updated_at = now()
          WHERE user_id = ${user.id} AND COALESCE(list_id, '') = ${listKey}
        `);
      }
      const result = await db.execute(sql4`
        INSERT INTO dialer_scripts (user_id, list_id, name, content, is_default, created_at, updated_at)
        VALUES (${user.id}, ${listId}, ${name}, ${content}, ${isDefault}, now(), now())
        RETURNING id, list_id as "listId", name, content, is_default as "isDefault", created_at as "createdAt", updated_at as "updatedAt"
      `);
      res.status(201).json((result.rows || [])[0] || null);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/dialer/scripts/:id", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
      const before = await db.execute(sql4`
        SELECT id, user_id as "userId", list_id as "listId", name, content, is_default as "isDefault"
        FROM dialer_scripts
        WHERE id = ${id} AND user_id = ${user.id}
        LIMIT 1
      `);
      const existing = (before.rows || [])[0];
      if (!existing) return res.status(404).json({ message: "Not found" });
      const nameNext = typeof req.body?.name === "string" ? String(req.body.name).trim() : existing.name;
      const contentNext = typeof req.body?.content === "string" ? String(req.body.content) : existing.content;
      const listIdNext = typeof req.body?.listId === "string" ? String(req.body.listId).trim() || null : existing.listId;
      const isDefaultNext = typeof req.body?.isDefault === "boolean" ? Boolean(req.body.isDefault) : Boolean(existing.isDefault);
      if (!nameNext) return res.status(400).json({ message: "Missing name" });
      if (nameNext.length > 120) return res.status(400).json({ message: "Name too long" });
      if (contentNext.length > 5e4) return res.status(400).json({ message: "Content too long" });
      const listKey = listIdNext || "";
      if (isDefaultNext) {
        await db.execute(sql4`
          UPDATE dialer_scripts
          SET is_default = false, updated_at = now()
          WHERE user_id = ${user.id} AND COALESCE(list_id, '') = ${listKey}
        `);
      }
      const result = await db.execute(sql4`
        UPDATE dialer_scripts
        SET
          list_id = ${listIdNext},
          name = ${nameNext},
          content = ${contentNext},
          is_default = ${isDefaultNext},
          updated_at = now()
        WHERE id = ${id} AND user_id = ${user.id}
        RETURNING id, list_id as "listId", name, content, is_default as "isDefault", created_at as "createdAt", updated_at as "updatedAt"
      `);
      res.json((result.rows || [])[0] || null);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/dialer/scripts/:id", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
      await db.execute(sql4`DELETE FROM dialer_scripts WHERE id = ${id} AND user_id = ${user.id}`);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/dialer/queue", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
      const listId = String(req.query.listId || "new");
      const rawLimit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, rawLimit)) : 50;
      const conditions = [
        sql4`l.owner_phone IS NOT NULL`,
        sql4`COALESCE(l.do_not_call, false) = false`
      ];
      let orderBy = sql4`l.created_at DESC`;
      if (listId === "new") {
        conditions.push(sql4`COALESCE(l.status, '') = 'new'`);
        orderBy = sql4`l.created_at DESC`;
      } else if (listId === "followups_due") {
        conditions.push(sql4`l.next_follow_up_at IS NOT NULL`);
        conditions.push(sql4`l.next_follow_up_at <= ${/* @__PURE__ */ new Date()}`);
        orderBy = sql4`l.next_follow_up_at ASC NULLS LAST`;
      } else if (listId === "all_callable") {
        orderBy = sql4`l.updated_at DESC`;
      } else {
        return res.status(400).json({ message: "Invalid listId" });
      }
      const where = sql4.join(conditions, sql4` AND `);
      try {
        const result = await db.execute(sql4`
          SELECT
            l.id as "leadId",
            l.owner_name as "ownerName",
            l.owner_phone as "ownerPhone",
            l.address as "address",
            l.city as "city",
            l.state as "state",
            l.status as "status",
            l.next_follow_up_at as "nextFollowUpAt",
            lc.last_call_at as "lastCallAt"
          FROM leads l
          LEFT JOIN (
            SELECT lead_id, MAX(started_at) as last_call_at
            FROM call_logs
            WHERE lead_id IS NOT NULL
            GROUP BY lead_id
          ) lc ON lc.lead_id = l.id
          WHERE ${where}
          ORDER BY ${orderBy}
          LIMIT ${limit}
        `);
        return res.json({ listId, items: result.rows || [] });
      } catch (e) {
        console.error(JSON.stringify({
          ts: (/* @__PURE__ */ new Date()).toISOString(),
          event: "dialer_queue",
          kind: "primary_query_failed",
          message: String(e?.message || e),
          code: e?.code ? String(e.code) : null,
          listId,
          limit
        }));
        const leadsList = await storage.getLeads(limit, 0);
        const calls = await storage.getCallLogs(5e3, 0);
        const lastCallByLeadId = /* @__PURE__ */ new Map();
        for (const c of calls || []) {
          const lid = typeof c.leadId === "number" ? c.leadId : null;
          if (!lid || !c.startedAt) continue;
          const iso = new Date(c.startedAt).toISOString();
          const prev = lastCallByLeadId.get(lid);
          if (!prev || iso > prev) lastCallByLeadId.set(lid, iso);
        }
        const now = Date.now();
        const filtered = (leadsList || []).filter((l) => Boolean(l.ownerPhone) && !l.doNotCall).filter((l) => {
          if (listId === "new") return String(l.status || "") === "new";
          if (listId === "followups_due") return l.nextFollowUpAt && new Date(l.nextFollowUpAt).getTime() <= now;
          return true;
        }).slice(0, limit).map((l) => ({
          leadId: l.id,
          ownerName: l.ownerName,
          ownerPhone: l.ownerPhone,
          address: l.address,
          city: l.city,
          state: l.state,
          status: l.status ?? null,
          nextFollowUpAt: l.nextFollowUpAt ? new Date(l.nextFollowUpAt).toISOString() : null,
          lastCallAt: lastCallByLeadId.get(l.id) || null
        }));
        return res.json({ listId, items: filtered });
      }
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/telephony/calls", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { direction, number, contactId, status, startedAt, metadata, leadId } = req.body || {};
      const resolvedLeadId = leadId ? Number(leadId) : metadata?.leadId ? Number(metadata.leadId) : null;
      const log3 = await storage.createCallLog({
        userId: user.id,
        direction,
        number,
        contactId: contactId ?? null,
        leadId: resolvedLeadId || null,
        status: status || "dialing",
        startedAt: startedAt ? new Date(startedAt) : /* @__PURE__ */ new Date(),
        metadata: metadata ? JSON.stringify(metadata) : null
      });
      if (metadata && typeof metadata === "object") {
        const metaLeadId = metadata.leadId ? Number(metadata.leadId) : null;
        const propertyId = metadata.propertyId ? Number(metadata.propertyId) : null;
        const linkedLeadId = resolvedLeadId || metaLeadId;
        if (linkedLeadId || propertyId) {
          await storage.createGlobalActivity({
            userId: user.id,
            action: "call_started",
            description: `Started call to ${String(number || "")}`,
            metadata: JSON.stringify({ leadId: linkedLeadId || void 0, propertyId: propertyId || void 0, callLogId: log3.id, number: String(number || "") })
          });
        }
      }
      res.status(201).json(log3);
      {
        const evt = { type: "call_log_created", payload: { id: log3.id, status: log3.status, number: log3.number, direction: log3.direction, leadId: log3.leadId } };
        emitTelephonyEventToAll(evt);
        publishTelephonyEvent(evt).catch(() => {
        });
      }
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/telephony/calls/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const id = parseInt(req.params.id);
      let beforeStatus = null;
      let beforeMetadataText = null;
      let beforeLeadId = null;
      try {
        const beforeRows = await db.execute(sql4`SELECT status, metadata, lead_id FROM call_logs WHERE id = ${id} LIMIT 1`);
        const row = beforeRows.rows?.[0];
        beforeStatus = row?.status ?? null;
        beforeMetadataText = row?.metadata ?? null;
        beforeLeadId = row?.lead_id ?? null;
      } catch {
      }
      const patch = { ...req.body || {} };
      const followUpAtRaw = patch.followUpAt;
      delete patch.followUpAt;
      if (patch.metadata && typeof patch.metadata !== "string") patch.metadata = JSON.stringify(patch.metadata);
      if (patch.status && ["answered", "missed", "failed", "ended"].includes(String(patch.status))) {
        patch.endedAt = /* @__PURE__ */ new Date();
      }
      if (typeof patch.startedAt === "string" || typeof patch.startedAt === "number") patch.startedAt = new Date(patch.startedAt);
      if (typeof patch.endedAt === "string" || typeof patch.endedAt === "number") patch.endedAt = new Date(patch.endedAt);
      if (typeof patch.durationMs !== "undefined") patch.durationMs = Number(patch.durationMs);
      if (typeof patch.leadId !== "undefined") patch.leadId = patch.leadId ? Number(patch.leadId) : null;
      const updated = await storage.updateCallLog(id, patch);
      const nextStatus = patch.status ? String(patch.status) : null;
      let meta = null;
      try {
        meta = beforeMetadataText ? JSON.parse(beforeMetadataText) : null;
      } catch {
      }
      const metaLeadId = meta?.leadId ? Number(meta.leadId) : null;
      const propertyId = meta?.propertyId ? Number(meta.propertyId) : null;
      const effectiveLeadId = (typeof updated.leadId === "number" ? updated.leadId : null) || beforeLeadId || metaLeadId;
      if (nextStatus && nextStatus !== beforeStatus) {
        const terminal = /* @__PURE__ */ new Set(["answered", "missed", "failed"]);
        if (terminal.has(nextStatus)) {
          if (effectiveLeadId || propertyId) {
            await storage.createGlobalActivity({
              userId: user.id,
              action: `call_${nextStatus}`,
              description: `Call ${nextStatus}: ${String(updated.number || "")}`,
              metadata: JSON.stringify({ leadId: effectiveLeadId || void 0, propertyId: propertyId || void 0, callLogId: updated.id, status: nextStatus })
            });
          }
        }
      }
      if ((patch.disposition || patch.note) && (effectiveLeadId || propertyId)) {
        await storage.createGlobalActivity({
          userId: user.id,
          action: "call_dispositioned",
          description: patch.disposition ? `Disposition: ${String(patch.disposition)}` : "Disposition updated",
          metadata: JSON.stringify({ leadId: effectiveLeadId || void 0, propertyId: propertyId || void 0, callLogId: updated.id, disposition: patch.disposition || void 0 })
        });
      }
      if (followUpAtRaw && effectiveLeadId) {
        const followUpAt = new Date(followUpAtRaw);
        if (!Number.isNaN(followUpAt.valueOf())) {
          await storage.updateLead(effectiveLeadId, { nextFollowUpAt: followUpAt });
          await storage.createGlobalActivity({
            userId: user.id,
            action: "followup_scheduled",
            description: `Follow-up scheduled: ${followUpAt.toLocaleString()}`,
            metadata: JSON.stringify({ leadId: effectiveLeadId, callLogId: updated.id })
          });
          try {
            const dueFrom = new Date(followUpAt.getTime() - 60 * 1e3);
            const dueTo = new Date(followUpAt.getTime() + 60 * 1e3);
            const existing = await storage.listTasks(
              { userId: user.id, isManager: isManagerUser(user) },
              {
                relatedEntityType: "lead",
                relatedEntityId: effectiveLeadId,
                type: "follow_up",
                dueFrom,
                dueTo,
                includeCompleted: true,
                limit: 5,
                offset: 0
              }
            );
            const alreadyExists = Array.isArray(existing?.items) && existing.items.length > 0;
            if (!alreadyExists) {
              const task = await createTask({
                title: "Follow up",
                description: `Follow up from call: ${String(updated.number || "")}`,
                type: "follow_up",
                relatedEntityType: "lead",
                relatedEntityId: effectiveLeadId,
                dueAt: followUpAt,
                priority: "high",
                status: "open",
                assignedToUserId: user.id,
                isRecurring: false,
                recurrenceRule: null,
                isPrivate: false,
                createdBy: user.id
              });
              await storage.createGlobalActivity({
                userId: user.id,
                action: "followup_task_created",
                description: `Follow-up task created: ${followUpAt.toLocaleString()}`,
                metadata: JSON.stringify({ leadId: effectiveLeadId, callLogId: updated.id, taskId: task.id })
              });
            }
          } catch {
          }
        }
      }
      if (patch.disposition === "do_not_call" && effectiveLeadId) {
        await storage.updateLead(effectiveLeadId, { doNotCall: true });
      }
      res.json(updated);
      {
        const evt = { type: "call_log_updated", payload: { id: updated.id, status: updated.status, number: updated.number, direction: updated.direction } };
        emitTelephonyEventToAll(evt);
        publishTelephonyEvent(evt).catch(() => {
        });
      }
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/telephony/history", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { limit, offset, status, contactId } = req.query;
      const items = await storage.getCallLogs(
        limit ? parseInt(limit) : void 0,
        offset ? parseInt(offset) : 0,
        status,
        contactId ? parseInt(contactId) : void 0
      );
      if (!items.length) return res.json(items);
      const numbers = Array.from(new Set(items.map((i) => String(i.number || "").trim()).filter(Boolean)));
      const reps = await storage.getNumberReputationByE164s(user.id, numbers);
      const labelByE164 = /* @__PURE__ */ new Map();
      for (const r of reps) labelByE164.set(String(r.e164), String(r.label));
      res.json(items.map((i) => ({ ...i, spamLabel: labelByE164.get(String(i.number || "").trim()) || null })));
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/telephony/contacts", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const q = (req.query.query || "").toLowerCase();
      const all = await storage.getContacts(100, 0);
      const filtered = all.filter((c) => (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q));
      res.json({ items: filtered.map((c) => ({ id: c.id, name: c.name, numbers: [c.phone].filter(Boolean) })) });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/telephony/spam/flag", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const e164 = String(req.body?.e164 || "").trim();
      const label = String(req.body?.label || "").trim().toLowerCase();
      const reason = typeof req.body?.reason === "string" ? req.body.reason : null;
      if (!e164) return res.status(400).json({ message: "Missing e164" });
      if (label !== "spam" && label !== "allow" && label !== "block") return res.status(400).json({ message: "Invalid label" });
      const saved = await storage.upsertNumberReputation({ userId: req.session.userId, e164, label, reason });
      res.json(saved);
      {
        const evt = { type: "spam_flag_updated", payload: { e164, label } };
        emitTelephonyEventToAll(evt);
        publishTelephonyEvent(evt).catch(() => {
        });
      }
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/telephony/spam/unflag", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const e164 = String(req.body?.e164 || "").trim();
      if (!e164) return res.status(400).json({ message: "Missing e164" });
      await storage.deleteNumberReputation(req.session.userId, e164);
      res.json({ ok: true });
      {
        const evt = { type: "spam_flag_updated", payload: { e164, label: null } };
        emitTelephonyEventToAll(evt);
        publishTelephonyEvent(evt).catch(() => {
        });
      }
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/telephony/analytics/summary", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const rangeDaysRaw = String(req.query.rangeDays || "30");
      const rangeDays = Math.max(1, Math.min(365, parseInt(rangeDaysRaw, 10) || 30));
      const startDate = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1e3);
      const summary = await storage.getTelephonyAnalyticsSummary(req.session.userId, startDate);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/telephony/voicemail", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const limit = Math.max(1, Math.min(200, parseInt(String(req.query.limit || "50"), 10) || 50));
      const items = await storage.listTelephonyMedia(req.session.userId, "voicemail", limit);
      const numbers = Array.from(new Set(items.map((i) => String(i.e164 || "").trim()).filter(Boolean)));
      const reps = await storage.getNumberReputationByE164s(req.session.userId, numbers);
      const labelByE164 = /* @__PURE__ */ new Map();
      for (const r of reps) labelByE164.set(String(r.e164), String(r.label));
      const enriched = await Promise.all(
        items.map(async (m) => {
          const audioUrl = m.storageKey ? await getTelephonyMediaSignedUrl({ key: String(m.storageKey) }) : null;
          return { ...m, audioUrl: audioUrl || m.providerUrl || null, spamLabel: labelByE164.get(String(m.e164 || "").trim()) || null };
        })
      );
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/telephony/presence", async (req, res) => {
    try {
      const number = req.query.number;
      res.json({ number, available: true, lastSeenAt: (/* @__PURE__ */ new Date()).toISOString() });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/telephony/health", async (req, res) => {
    try {
      await storage.getUserByEmail("test@example.com");
      const telnyxResult = await telnyx.healthCheck();
      const telnyxDiag = telnyx.diagnostics();
      const apiKey = String(process.env.TELNYX_API_KEY || "");
      const connectionId = String(process.env.TELNYX_CONNECTION_ID || "");
      const messagingProfileId = String(process.env.TELNYX_MESSAGING_PROFILE_ID || "");
      const defaultFrom = String(process.env.TELNYX_DEFAULT_FROM_NUMBER || "");
      const webhookUrl = String(process.env.TELNYX_WEBHOOK_URL || "");
      const looksLikeCallControl = /^\d+$/.test(connectionId);
      const looksLikeSipCredential = !looksLikeCallControl && /^[0-9a-fA-F-]{20,}$/.test(connectionId) && connectionId.includes("-");
      const voiceDetail = telnyxResult.message || "Unknown";
      const voice = {
        configured: Boolean(apiKey && connectionId),
        connectionIdPresent: Boolean(connectionId),
        connectionType: looksLikeSipCredential ? "sip_credential" : looksLikeCallControl ? "call_control_application" : "unknown",
        connectionActive: Boolean(telnyxResult.connectionActive),
        callControlReady: telnyxResult.status === "reachable" && !looksLikeSipCredential,
        defaultFromNumber: defaultFrom || null,
        detail: looksLikeSipCredential ? "TELNYX_CONNECTION_ID looks like a SIP Credential Connection ID. Dialing via /v2/calls requires a Call Control Application ID (numeric)." : voiceDetail,
        code: telnyxResult.code ?? null,
        hint: telnyxResult.hint || null,
        telnyxErrorCode: telnyxResult.telnyxErrorCode || null
      };
      const messaging = {
        configured: Boolean(apiKey && messagingProfileId),
        messagingProfilePresent: Boolean(messagingProfileId),
        defaultFromNumber: defaultFrom || null,
        detail: !messagingProfileId ? "TELNYX_MESSAGING_PROFILE_ID is missing; SMS will not send." : "Messaging profile configured."
      };
      const webhook = {
        configured: Boolean(webhookUrl),
        publicUrlPresent: Boolean(webhookUrl),
        detail: !webhookUrl ? "TELNYX_WEBHOOK_URL is missing; call events and inbound SMS will not be received." : "Webhook URL configured."
      };
      const overallStatus = telnyxResult.status === "unconfigured" ? "unconfigured" : telnyxResult.status === "reachable" ? "reachable" : telnyxResult.status === "degraded" ? "degraded" : "unreachable";
      res.json({
        status: overallStatus,
        checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
        voice,
        messaging,
        webhook,
        db: "connected",
        telnyx: telnyxResult,
        telnyxDiag,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        numbers: process.env.DIALER_NUMBERS_JSON ? JSON.parse(process.env.DIALER_NUMBERS_JSON) : [],
        defaultFrom: defaultFrom || null
      });
    } catch (error) {
      console.error("Telephony health check failed:", error);
      res.status(500).json({
        status: "error",
        checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
        voice: { configured: false, connectionIdPresent: false, connectionActive: false, callControlReady: false, detail: "Health check failed" },
        messaging: { configured: false, messagingProfilePresent: false, detail: "Health check failed" },
        webhook: { configured: false, publicUrlPresent: false, detail: "Health check failed" },
        db: "disconnected",
        telnyx: { status: "error", code: null, message: error?.message || "Health check failed", connectionFound: false, connectionActive: false, httpStatus: null },
        telnyxDiag: telnyx.diagnostics(),
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  });
  app2.post("/api/telnyx/validate/api-key", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { apiKey } = req.body || {};
      const key = String(apiKey || "").trim();
      if (!key) return res.status(400).json({ ok: false, error: "API key is required" });
      const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
      try {
        const response = await fetch("https://api.telnyx.com/v2/connections", { headers, signal: AbortSignal.timeout(15e3) });
        const body = await response.json().catch(() => ({}));
        if (response.ok) {
          const connections = body?.data || [];
          return res.json({ ok: true, status: "valid", message: `Authenticated. Found ${connections.length} connection(s).`, connectionCount: connections.length, connections: connections.map((c) => ({ id: c.id, name: c.name, state: c.state || c.status })) });
        }
        const errCode = body?.errors?.[0]?.code || null;
        const errDetail = body?.errors?.[0]?.detail || body?.errors?.[0]?.title || "Authentication failed";
        let classification = "invalid";
        let hint = "Copy a fresh API key from Telnyx Portal -> Account -> API Keys.";
        if (String(errCode) === "10009") {
          classification = "malformed";
          hint = "Key looks malformed. Generate a new V2 key in Telnyx portal.";
        } else if (String(errCode) === "20002") {
          classification = "revoked";
          hint = "This key has been revoked. Generate a new key.";
        } else if (String(errCode) === "20008") {
          classification = "invalid";
          hint = "Key is invalid. Copy it fresh from Telnyx portal.";
        } else if (response.status === 403) {
          classification = "no_permission";
          hint = "Key is valid but lacks permissions.";
        }
        return res.json({ ok: false, status: classification, message: errDetail, hint, telnyxErrorCode: errCode, httpStatus: response.status });
      } catch (fetchErr) {
        return res.json({ ok: false, status: "unreachable", message: fetchErr?.message || "Could not reach Telnyx API" });
      }
    } catch (error) {
      res.status(500).json({ ok: false, error: error?.message || "Validation failed" });
    }
  });
  app2.post("/api/telnyx/validate/connection", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { apiKey, connectionId } = req.body || {};
      const key = String(apiKey || "").trim();
      const connId = String(connectionId || "").trim();
      if (!key || !connId) return res.status(400).json({ ok: false, error: "Both apiKey and connectionId are required" });
      const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
      try {
        const response = await fetch(`https://api.telnyx.com/v2/connections/${connId}`, { headers, signal: AbortSignal.timeout(15e3) });
        const body = await response.json().catch(() => ({}));
        if (response.ok) {
          const conn = body?.data || body;
          const state = String(conn?.state || conn?.status || "").toLowerCase();
          const isActive = state === "active" || state === "online" || state === "ready";
          const isNumeric = /^\d+$/.test(connId);
          const looksLikeSip = !isNumeric && /^[0-9a-fA-F-]{20,}$/.test(connId) && connId.includes("-");
          const connType = looksLikeSip ? "sip_credential" : isNumeric ? "call_control_application" : "unknown";
          let typeWarning = "";
          if (looksLikeSip) typeWarning = "This is a SIP Credential ID, not a Call Control Application. Outbound calling requires a Call Control Application (numeric ID).";
          return res.json({ ok: true, status: isActive ? "active" : "inactive", message: isActive ? `Connection "${conn.name || connId}" is active.` : `Connection found, state: "${state}".`, connectionType: connType, connectionName: conn.name || null, connectionState: state, typeWarning });
        }
        const errDetail = body?.errors?.[0]?.detail || body?.errors?.[0]?.title || "Connection not found";
        return res.json({ ok: false, status: "not_found", message: errDetail, hint: "Verify Connection ID in Telnyx Portal -> Voice -> Call Control Applications." });
      } catch (fetchErr) {
        return res.json({ ok: false, status: "unreachable", message: fetchErr?.message || "Could not reach Telnyx API" });
      }
    } catch (error) {
      res.status(500).json({ ok: false, error: error?.message || "Validation failed" });
    }
  });
  app2.post("/api/telnyx/validate/messaging-profile", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { apiKey, profileId, fromNumber } = req.body || {};
      const key = String(apiKey || "").trim();
      const pid = String(profileId || "").trim();
      const from = String(fromNumber || "").trim();
      if (!key || !pid) return res.status(400).json({ ok: false, error: "Both apiKey and profileId are required" });
      const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
      try {
        const response = await fetch(`https://api.telnyx.com/v2/messaging_profiles/${pid}`, { headers, signal: AbortSignal.timeout(15e3) });
        const body = await response.json().catch(() => ({}));
        if (response.ok) {
          const profile = body?.data || body;
          const numbers = profile?.numbers || [];
          let numberCheck = null;
          if (from) {
            const e164 = /^\+\d{10,15}$/.test(from);
            if (!e164) {
              numberCheck = { valid: false, message: "From number must be E.164 format (e.g. +15551234567)" };
            } else {
              const assigned = numbers.some((n) => String(n.phone_number || n) === from);
              numberCheck = assigned ? { valid: true, message: `Number ${from} is assigned to this profile.` } : { valid: false, message: `Number ${from} is not assigned. Assign it in Telnyx Portal -> Messaging -> Profiles.` };
            }
          }
          return res.json({ ok: true, status: "found", message: `Profile "${profile.name || pid}" found with ${numbers.length} number(s).`, profileName: profile.name || null, numberCount: numbers.length, numbers: numbers.slice(0, 10).map((n) => String(n.phone_number || n)), numberCheck });
        }
        const errDetail = body?.errors?.[0]?.detail || body?.errors?.[0]?.title || "Profile not found";
        return res.json({ ok: false, status: "not_found", message: errDetail, hint: "Verify Profile ID in Telnyx Portal -> Messaging -> Profiles." });
      } catch (fetchErr) {
        return res.json({ ok: false, status: "unreachable", message: fetchErr?.message || "Could not reach Telnyx API" });
      }
    } catch (error) {
      res.status(500).json({ ok: false, error: error?.message || "Validation failed" });
    }
  });
  app2.get("/api/comms/readiness", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const readiness = await getProviderReadiness();
      res.json(readiness);
    } catch (error) {
      res.status(500).json({ error: error?.message || "Readiness check failed" });
    }
  });
  app2.post("/api/admin/migrate", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!isAdminUser(user)) {
        res.status(403).json({ success: false, error: "Admin access required" });
        return;
      }
      const LOCK_KEY = 83749201;
      const lockResult = await pool.query("SELECT pg_try_advisory_lock()", [LOCK_KEY]);
      const acquired = lockResult?.rows?.[0]?.pg_try_advisory_lock;
      if (!acquired) {
        res.status(409).json({ success: false, error: "Migration already in progress by another instance" });
        return;
      }
      try {
        const { applyMigrations: applyMigrations2 } = await Promise.resolve().then(() => (init_apply_migrations(), apply_migrations_exports));
        await applyMigrations2();
        res.json({ success: true, message: "Migrations applied successfully." });
      } finally {
        await pool.query("SELECT pg_advisory_unlock()", [LOCK_KEY]).catch(() => {
        });
      }
    } catch (e) {
      console.error("Admin migrate failed:", e?.message || e);
      res.status(500).json({ success: false, error: "Migration failed" });
    }
  });
  app2.get("/api/system/health", async (_req, res) => {
    try {
      let dbStatus = "disconnected";
      try {
        await storage.getUserByEmail("test@example.com");
        dbStatus = "connected";
      } catch (_e) {
      }
      const telnyxResult = await telnyx.healthCheck();
      const telnyxStatus = telnyxResult.status;
      const telnyxDiag = telnyx.diagnostics();
      const required = [
        "DATABASE_URL",
        "SESSION_SECRET",
        "EMPLOYEE_ACCESS_CODE",
        "TELNYX_API_KEY",
        "TELNYX_CONNECTION_ID",
        "TELNYX_MESSAGING_PROFILE_ID",
        "TELNYX_PUBLIC_KEY",
        "TELNYX_DEFAULT_FROM_NUMBER"
      ];
      const missing = required.filter((k) => !process.env[k] || String(process.env[k]).trim() === "");
      let sessionsOk = true;
      try {
        await (await Promise.resolve().then(() => (init_db(), db_exports))).db.execute?.(void 0);
      } catch (_e) {
        sessionsOk = true;
      }
      const nextSteps = [];
      if (missing.length) nextSteps.push(`Add missing env vars: ${missing.join(", ")}`);
      if (telnyxStatus !== "reachable") nextSteps.push("Verify Telnyx credentials and number capabilities");
      if (dbStatus !== "connected") nextSteps.push("Verify DATABASE_URL and Neon availability");
      if (!process.env.TELNYX_DEFAULT_FROM_NUMBER) nextSteps.push("Set TELNYX_DEFAULT_FROM_NUMBER for outbound caller ID");
      let releaseGate = { ok: true, blockingCritical: 0 };
      try {
        const gateRows = await db.execute(sql4`
          SELECT COUNT(*)::int as "count"
          FROM app_audit_findings
          WHERE severity = 'critical'
            AND status IN ('open', 'in_progress')
        `);
        const n = Number(gateRows.rows?.[0]?.count ?? 0);
        releaseGate = { ok: n === 0, blockingCritical: Number.isFinite(n) ? n : 0 };
      } catch {
      }
      if (!releaseGate.ok) nextSteps.push(`Release gate blocked: ${releaseGate.blockingCritical} Critical findings are still open`);
      const checkedAt = (/* @__PURE__ */ new Date()).toISOString();
      const has2 = (key) => Boolean(process.env[key] && String(process.env[key]).trim() !== "");
      const telnyxReady = telnyxResult.status === "reachable";
      const pf = (v) => {
        if (!v) return false;
        const s = v.trim().toLowerCase();
        return s === "1" || s === "true" || s === "yes" || s === "on";
      };
      const featureFlags = [
        { key: "esign", label: "E-Sign", enabled: pf(process.env.FEATURE_ESIGN), action: "Enable FEATURE_ESIGN to allow contract electronic signatures" },
        { key: "rvm", label: "RVM (Ringless Voicemail)", enabled: pf(process.env.FEATURE_RVM), action: "Enable FEATURE_RVM to allow ringless voicemail campaigns" },
        { key: "skip_trace", label: "Skip Trace", enabled: pf(process.env.FEATURE_SKIP_TRACE), action: "Enable FEATURE_SKIP_TRACE to allow lead skip tracing" },
        { key: "campaigns", label: "Campaigns", enabled: pf(process.env.FEATURE_CAMPAIGNS), action: "Enable FEATURE_CAMPAIGNS to allow campaign creation and management" },
        { key: "field_mode", label: "Field Mode", enabled: pf(process.env.FEATURE_FIELD_MODE), action: "Enable FEATURE_FIELD_MODE for field-agent mode" },
        { key: "comps", label: "Comps / Valuation", enabled: pf(process.env.FEATURE_COMPS), action: "Enable FEATURE_COMPS for property comparisons" },
        { key: "buyer_match", label: "Buyer Match", enabled: pf(process.env.FEATURE_BUYER_MATCH), action: "Enable FEATURE_BUYER_MATCH for automated buyer matching" },
        { key: "voice_playground", label: "Voice Playground", enabled: pf(process.env.FEATURE_VOICE_PLAYGROUND), action: "Enable FEATURE_VOICE_PLAYGROUND for voice research" }
      ];
      const modules = [
        { key: "app", label: "CRM API / server", state: "healthy", detail: "Server is responding", lastChecked: checkedAt },
        { key: "database", label: "Database", state: dbStatus === "connected" ? "healthy" : "unavailable", detail: dbStatus === "connected" ? "Database reachable" : "Database unreachable \u2014 check DATABASE_URL / Neon availability", lastChecked: checkedAt },
        { key: "storage", label: "File storage", state: has2("S3_BUCKET") || has2("STORAGE_BUCKET") ? "healthy" : "unconfigured", detail: has2("S3_BUCKET") || has2("STORAGE_BUCKET") ? "Storage bucket configured" : "No storage bucket configured \u2014 uploads may fall back to local storage", lastChecked: checkedAt },
        { key: "file_preview", label: "Document preview", state: has2("S3_BUCKET") || has2("STORAGE_BUCKET") ? "healthy" : "unconfigured", detail: "PDF/image preview works from stored files; office formats may require conversion setup", lastChecked: checkedAt },
        { key: "jobs", label: "Background jobs / queues", state: has2("CRON_SECRET") || has2("JOBS_ENABLED") ? "healthy" : "unconfigured", detail: "No background job runner configured \u2014 reminders/digests run on-demand", lastChecked: checkedAt },
        { key: "email", label: "Email provider", state: has2("RESEND_API_KEY") || has2("SMTP_HOST") || has2("EMAIL_FROM") ? "healthy" : "unconfigured", detail: has2("RESEND_API_KEY") || has2("SMTP_HOST") ? "Email provider configured" : "No email provider configured \u2014 email notifications are disabled", lastChecked: checkedAt },
        { key: "telnyx_voice", label: "Telnyx Voice", state: telnyxReady ? "healthy" : telnyxResult.status === "unconfigured" ? "unconfigured" : "unavailable", detail: telnyxResult.message || "Unknown", hint: telnyxResult.hint || null, lastChecked: checkedAt },
        { key: "telnyx_sms", label: "Telnyx SMS", state: telnyxReady && has2("TELNYX_MESSAGING_PROFILE_ID") ? "healthy" : !has2("TELNYX_MESSAGING_PROFILE_ID") ? "unconfigured" : "unavailable", detail: !has2("TELNYX_MESSAGING_PROFILE_ID") ? "TELNYX_MESSAGING_PROFILE_ID missing" : "SMS requires valid Telnyx credentials", lastChecked: checkedAt },
        { key: "telnyx_webhook", label: "Telnyx webhook", state: has2("TELNYX_WEBHOOK_URL") ? "healthy" : "unconfigured", detail: has2("TELNYX_WEBHOOK_URL") ? "Webhook URL configured" : "TELNYX_WEBHOOK_URL missing \u2014 call events / inbound SMS not received", lastChecked: checkedAt },
        { key: "skip_trace", label: "Skip trace provider", state: has2("SKIPTRACE_API_KEY") || has2("SKIP_TRACE_API_KEY") ? "healthy" : "unconfigured", detail: has2("SKIPTRACE_API_KEY") || has2("SKIP_TRACE_API_KEY") ? "Skip trace provider configured" : "No skip trace provider configured \u2014 skip trace is unavailable until configured", lastChecked: checkedAt },
        { key: "calendar", label: "Calendar / meetings", state: "healthy", detail: "Internal CRM calendar active; external calendar sync requires an opt-in connector", lastChecked: checkedAt },
        { key: "campaigns", label: "Ad / campaign providers", state: has2("META_ADS_TOKEN") || has2("GOOGLE_ADS_TOKEN") ? "healthy" : "unconfigured", detail: has2("META_ADS_TOKEN") || has2("GOOGLE_ADS_TOKEN") ? "Ad provider configured" : "No ad network credentials \u2014 campaign planning works, live ad delivery is off", lastChecked: checkedAt },
        { key: "automations", label: "Automation engine", state: "healthy", detail: "Automation engine available (trigger/conditions/actions)", lastChecked: checkedAt },
        { key: "playground", label: "Playground / research", state: has2("PLAYGROUND_URL") || has2("DEEP_RESEARCH_API_KEY") ? "healthy" : "unconfigured", detail: has2("PLAYGROUND_URL") || has2("DEEP_RESEARCH_API_KEY") ? "Research service configured" : "No research provider configured \u2014 deep research will show setup guidance", lastChecked: checkedAt }
      ];
      res.json({
        status: missing.length === 0 && dbStatus === "connected" && telnyxStatus === "reachable" ? "ok" : "warn",
        env: { nodeEnv: process.env.NODE_ENV || "", missing },
        db: dbStatus,
        telnyx: telnyxResult,
        telnyxDiag,
        numbers: process.env.DIALER_NUMBERS_JSON ? JSON.parse(process.env.DIALER_NUMBERS_JSON) : [],
        defaultFrom: process.env.TELNYX_DEFAULT_FROM_NUMBER || null,
        sessions: { ok: sessionsOk },
        releaseGate,
        nextSteps,
        modules,
        features: featureFlags,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/telephony/sms", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { to, from, body, metadata } = req.body || {};
      if (!to || !body) return res.status(400).json({ error: "Missing to/body", code: "MISSING_FIELDS" });
      const resolvedFrom = from || process.env.TELNYX_DEFAULT_FROM_NUMBER || "";
      if (!resolvedFrom) {
        return res.status(400).json({ error: "Missing fromNumber", code: "MISSING_FROM" });
      }
      const e164Re = /^\+[1-9]\d{1,14}$/;
      if (!e164Re.test(String(to))) {
        return res.status(400).json({ error: "Invalid E.164 destination number", code: "INVALID_TO" });
      }
      if (!String(body).trim()) {
        return res.status(400).json({ error: "SMS body cannot be empty", code: "EMPTY_BODY" });
      }
      let sid = null;
      let smsStatus = "queued";
      try {
        const out = await telnyx.sendSms({ to: String(to), body: String(body), from: resolvedFrom });
        sid = out.messageId || null;
        smsStatus = "queued";
      } catch (error) {
        console.error("Telnyx SMS failed:", error);
        if (error instanceof TelnyxConfigError) {
          return res.status(503).json({
            error: `Telnyx is not configured. Add the missing variables in Settings \u2192 System: ${error.missingEnv.join(", ")}.`,
            code: "TELNYX_NOT_CONFIGURED",
            detail: null
          });
        }
        return res.status(error?.status || 502).json({
          error: error?.message || "SMS send failed",
          code: error?.code || "TELNYX_SMS_ERROR",
          detail: error?.detail || null
        });
      }
      if (metadata && typeof metadata === "object") {
        const leadId = metadata.leadId ? Number(metadata.leadId) : null;
        const propertyId = metadata.propertyId ? Number(metadata.propertyId) : null;
        if (leadId || propertyId) {
          try {
            await storage.createGlobalActivity({
              userId: user.id,
              action: "sms_sent",
              description: `Sent SMS to ${String(to || "")}`,
              metadata: JSON.stringify({ leadId: leadId || void 0, propertyId: propertyId || void 0, to: String(to || ""), sid, status: smsStatus, body: String(body || "") })
            });
          } catch {
          }
        }
      }
      res.json({ sid, status: smsStatus });
    } catch (error) {
      console.error("SMS route error:", error);
      res.status(500).json({ error: error?.message || "Internal error", code: "INTERNAL_ERROR" });
    }
  });
  app2.post("/api/telephony/outbound/dispatch", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { toNumber, fromNumber, metadata } = req.body || {};
      if (!toNumber || !String(toNumber).trim()) {
        return res.status(400).json({ error: "toNumber is required", code: "MISSING_TO" });
      }
      const resolvedFrom = fromNumber || process.env.TELNYX_DEFAULT_FROM_NUMBER || "";
      if (!resolvedFrom) {
        return res.status(400).json({ error: "Missing fromNumber", code: "MISSING_FROM" });
      }
      const e164Re = /^\+[1-9]\d{1,14}$/;
      if (!e164Re.test(String(toNumber))) {
        return res.status(400).json({ error: "Invalid E.164 destination number", code: "INVALID_TO" });
      }
      let callControlId = null;
      let callLog = null;
      try {
        const result = await telnyx.dial({
          to: String(toNumber),
          from: resolvedFrom
        });
        callControlId = result.callControlId;
      } catch (error) {
        console.error("Telnyx outbound dispatch failed:", error);
        if (error instanceof TelnyxConfigError) {
          return res.status(503).json({
            error: `Telnyx is not configured. Add the missing variables in Settings \u2192 System: ${error.missingEnv.join(", ")}.`,
            code: "TELNYX_NOT_CONFIGURED",
            detail: null
          });
        }
        return res.status(error?.status || 502).json({
          error: error?.message || "Outbound dispatch failed",
          code: error?.code || "TELNYX_DIAL_ERROR",
          detail: error?.detail || null
        });
      }
      try {
        callLog = await storage.createCallLog({
          userId: user.id,
          direction: "outbound",
          number: String(toNumber),
          status: "dialing",
          startedAt: /* @__PURE__ */ new Date(),
          metadata: metadata ? JSON.stringify({ ...metadata, callControlId }) : JSON.stringify({ callControlId })
        });
      } catch (e) {
        console.error("Failed to persist call log:", e);
      }
      if (metadata && typeof metadata === "object") {
        const metaLeadId = metadata.leadId ? Number(metadata.leadId) : null;
        const propertyId = metadata.propertyId ? Number(metadata.propertyId) : null;
        if (metaLeadId || propertyId) {
          try {
            await storage.createGlobalActivity({
              userId: user.id,
              action: "call_started",
              description: `Started call to ${String(toNumber || "")}`,
              metadata: JSON.stringify({ leadId: metaLeadId || void 0, propertyId: propertyId || void 0, callLogId: callLog?.id, number: String(toNumber || ""), callControlId })
            });
          } catch {
          }
        }
      }
      res.status(201).json({ callControlId, callLogId: callLog?.id || null });
    } catch (error) {
      console.error("Outbound dispatch route error:", error);
      res.status(500).json({ error: error?.message || "Internal error", code: "INTERNAL_ERROR" });
    }
  });
  app2.post("/api/telephony/outbound/:callControlId/hangup", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const callControlId = String(req.params.callControlId || "").trim();
      if (!callControlId) {
        return res.status(400).json({ error: "callControlId is required", code: "MISSING_CALL_CONTROL_ID" });
      }
      try {
        await telnyx.hangup(callControlId);
      } catch (error) {
        console.error("Telnyx hangup failed:", error);
        if (error instanceof TelnyxConfigError) {
          return res.status(503).json({
            error: `Telnyx is not configured. Add the missing variables in Settings \u2192 System: ${error.missingEnv.join(", ")}.`,
            code: "TELNYX_NOT_CONFIGURED",
            detail: null
          });
        }
        return res.status(error?.status || 502).json({
          error: error?.message || "Hangup failed",
          code: error?.code || "TELNYX_HANGUP_ERROR",
          detail: error?.detail || null
        });
      }
      res.json({ ok: true, callControlId });
    } catch (error) {
      console.error("Hangup route error:", error);
      res.status(500).json({ error: error?.message || "Internal error", code: "INTERNAL_ERROR" });
    }
  });
  app2.post("/api/telephony/outbound/:callControlId/mute", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const callControlId = String(req.params.callControlId || "").trim();
      if (!callControlId) return res.status(400).json({ error: "callControlId required", code: "MISSING_CALL_CONTROL_ID" });
      const muted = Boolean(req.body?.muted ?? true);
      try {
        await telnyx.mute(callControlId, muted);
      } catch (error) {
        if (error instanceof TelnyxConfigError) {
          return res.status(503).json({ error: `Telnyx not configured: ${error.missingEnv.join(", ")}`, code: "TELNYX_NOT_CONFIGURED" });
        }
        return res.status(error?.status || 502).json({ error: error?.message || "Mute failed", code: error?.code || "TELNYX_MUTE_ERROR" });
      }
      res.json({ ok: true, callControlId, muted });
    } catch (error) {
      res.status(500).json({ error: error?.message || "Internal error", code: "INTERNAL_ERROR" });
    }
  });
  app2.post("/api/telephony/outbound/:callControlId/hold", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const callControlId = String(req.params.callControlId || "").trim();
      if (!callControlId) return res.status(400).json({ error: "callControlId required", code: "MISSING_CALL_CONTROL_ID" });
      const action = String(req.body?.action || "hold");
      try {
        if (action === "unhold") {
          await telnyx.unhold(callControlId);
        } else {
          await telnyx.hold(callControlId);
        }
      } catch (error) {
        if (error instanceof TelnyxConfigError) {
          return res.status(503).json({ error: `Telnyx not configured: ${error.missingEnv.join(", ")}`, code: "TELNYX_NOT_CONFIGURED" });
        }
        return res.status(error?.status || 502).json({ error: error?.message || "Hold failed", code: error?.code || "TELNYX_HOLD_ERROR" });
      }
      res.json({ ok: true, callControlId, action });
    } catch (error) {
      res.status(500).json({ error: error?.message || "Internal error", code: "INTERNAL_ERROR" });
    }
  });
  app2.post("/api/telephony/outbound/:callControlId/transfer", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const callControlId = String(req.params.callControlId || "").trim();
      if (!callControlId) return res.status(400).json({ error: "callControlId required", code: "MISSING_CALL_CONTROL_ID" });
      const to = String(req.body?.to || "").trim();
      if (!to) return res.status(400).json({ error: "Transfer destination required", code: "MISSING_TO" });
      try {
        await telnyx.transfer(callControlId, to);
      } catch (error) {
        if (error instanceof TelnyxConfigError) {
          return res.status(503).json({ error: `Telnyx not configured: ${error.missingEnv.join(", ")}`, code: "TELNYX_NOT_CONFIGURED" });
        }
        return res.status(error?.status || 502).json({ error: error?.message || "Transfer failed", code: error?.code || "TELNYX_TRANSFER_ERROR" });
      }
      res.json({ ok: true, callControlId, transferredTo: to });
    } catch (error) {
      res.status(500).json({ error: error?.message || "Internal error", code: "INTERNAL_ERROR" });
    }
  });
  app2.get("/api/system/provider-readiness", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const readiness = await getProviderReadiness();
      return res.json(readiness);
    } catch (error) {
      console.error("Provider readiness check failed:", error);
      res.status(500).json({ error: error?.message || "Internal error" });
    }
  });
  app2.post("/api/video/rooms", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { name, maxParticipants, propertyId } = req.body || {};
      if (!name || !String(name).trim()) return res.status(400).json({ error: "Room name is required", code: "MISSING_NAME" });
      const { telnyxVideo: telnyxVideo2 } = await Promise.resolve().then(() => (init_video(), video_exports));
      let room;
      try {
        room = await telnyxVideo2.createRoom({
          name: String(name).trim(),
          maxParticipants: maxParticipants ? Number(maxParticipants) : void 0
        });
      } catch (error) {
        return res.status(error?.status || 502).json({ error: error?.message || "Video room creation failed", code: "VIDEO_ROOM_ERROR" });
      }
      let dbRoom = null;
      try {
        const result = await pool.query(
          `INSERT INTO video_rooms (room_id, room_sid, name, created_by, property_id, status, max_participants, created_at)
           VALUES ($1, $2, $3, $4, $5, 'active', $6, NOW())
           RETURNING *`,
          [room.roomId, room.roomSid, room.name, user.id, propertyId || null, room.maxParticipants]
        );
        dbRoom = result.rows?.[0];
      } catch (e) {
        console.error("Failed to persist video room:", e);
      }
      if (propertyId) {
        try {
          await storage.createGlobalActivity({
            userId: user.id,
            action: "video_room_created",
            description: `Created meeting: ${room.name}`,
            metadata: JSON.stringify({ roomId: room.roomId, propertyId, roomSid: room.roomSid })
          });
          await logOpportunityEvent(Number(propertyId), "video_room_created", `Meeting created: ${room.name}`, void 0, user.id);
        } catch {
        }
      }
      res.status(201).json({ ...room, dbId: dbRoom?.id || null });
    } catch (error) {
      res.status(500).json({ error: error?.message || "Internal error", code: "INTERNAL_ERROR" });
    }
  });
  app2.get("/api/video/rooms/:roomId/join", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const roomId = String(req.params.roomId || "").trim();
      if (!roomId) return res.status(400).json({ error: "roomId required" });
      const identity = req.query.identity ? String(req.query.identity) : `${user.firstName || ""} ${user.lastName || ""}`.trim() || `User ${user.id}`;
      const { telnyxVideo: telnyxVideo2 } = await Promise.resolve().then(() => (init_video(), video_exports));
      try {
        const joinResult = await telnyxVideo2.getJoinToken(roomId, identity);
        return res.json(joinResult);
      } catch (error) {
        return res.status(error?.status || 502).json({ error: error?.message || "Failed to get join token", code: "VIDEO_JOIN_ERROR" });
      }
    } catch (error) {
      res.status(500).json({ error: error?.message || "Internal error", code: "INTERNAL_ERROR" });
    }
  });
  app2.post("/api/video/rooms/:roomId/end", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const roomId = String(req.params.roomId || "").trim();
      if (!roomId) return res.status(400).json({ error: "roomId required" });
      const { telnyxVideo: telnyxVideo2 } = await Promise.resolve().then(() => (init_video(), video_exports));
      try {
        await telnyxVideo2.endRoom(roomId);
      } catch (error) {
        return res.status(error?.status || 502).json({ error: error?.message || "Failed to end room", code: "VIDEO_END_ERROR" });
      }
      try {
        await pool.query(
          "UPDATE video_rooms SET status = 'ended', ended_at = NOW() WHERE room_id = $1",
          [roomId]
        );
      } catch {
      }
      res.json({ ok: true, roomId });
    } catch (error) {
      res.status(500).json({ error: error?.message || "Internal error", code: "INTERNAL_ERROR" });
    }
  });
  app2.get("/api/video/health", async (_req, res) => {
    try {
      const { telnyxVideo: telnyxVideo2 } = await Promise.resolve().then(() => (init_video(), video_exports));
      const health = await telnyxVideo2.healthCheck();
      return res.json(health);
    } catch (error) {
      res.status(500).json({ configured: false, reachable: false, roomsApiAvailable: false, blocker: error?.message || "Check failed" });
    }
  });
  app2.get("/api/video/rooms", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const status = String(req.query.status || "active");
      const limit = Math.min(100, parseInt(String(req.query.limit || "20"), 10) || 20);
      const result = await pool.query(
        "SELECT * FROM video_rooms WHERE status = $1 ORDER BY created_at DESC LIMIT $2",
        [status, limit]
      );
      return res.json({ rooms: result.rows || [] });
    } catch (error) {
      res.status(500).json({ error: error?.message || "Internal error" });
    }
  });
  function normalizeDigits(value) {
    return String(value || "").replace(/[^\d]/g, "");
  }
  async function findLeadMatchByPhone(rawPhone) {
    const digits = normalizeDigits(rawPhone);
    if (digits.length < 7) return null;
    const last10 = digits.slice(-10);
    const like2 = `%${last10}`;
    const rows = await db.execute(sql4`
      SELECT id, assigned_to
      FROM leads
      WHERE regexp_replace(COALESCE(owner_phone, ''), '\\D', '', 'g') LIKE ${like2}
      ORDER BY id DESC
      LIMIT 1
    `);
    const row = rows.rows?.[0];
    if (!row?.id) return null;
    const leadId = Number(row.id);
    const userId = row.assigned_to ? Number(row.assigned_to) : 0;
    return { leadId, userId: Number.isFinite(userId) ? userId : 0 };
  }
  async function findCallLogIdByCallSid(callSid) {
    const sid = String(callSid || "").trim();
    if (!sid) return null;
    const like2 = `%"callSid":"${sid}"%`;
    const rows = await db.execute(sql4`
      SELECT id
      FROM call_logs
      WHERE metadata LIKE ${like2}
      ORDER BY id DESC
      LIMIT 1
    `);
    const row = rows.rows?.[0];
    return row?.id ? Number(row.id) : null;
  }
  app2.get("/api/properties/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const property = await storage.getPropertyById(id);
      if (!property) return res.status(404).json({ message: "Property not found" });
      let lead = null;
      if (property.sourceLeadId) {
        try {
          lead = await storage.getLeadById(property.sourceLeadId);
        } catch {
        }
      }
      res.json({ property, lead });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/properties", async (req, res) => {
    try {
      const validated = insertPropertySchema.parse(req.body);
      const property = await storage.createProperty(validated);
      if (req.session.userId) {
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action: "created_property",
          description: `Added new property: ${property.address}`,
          metadata: JSON.stringify({ propertyId: property.id, address: property.address })
        });
      }
      res.status(201).json(property);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/properties/:id", async (req, res) => {
    try {
      const partial = insertPropertySchema.partial().parse(req.body);
      const property = await storage.updateProperty(parseInt(req.params.id), partial);
      if (req.session.userId) {
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action: "updated_property",
          description: `Updated property: ${property.address}`,
          metadata: JSON.stringify({ propertyId: property.id, address: property.address })
        });
      }
      res.json(property);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/properties/:id", async (req, res) => {
    try {
      const property = await storage.getPropertyById(parseInt(req.params.id));
      await storage.deleteProperty(parseInt(req.params.id));
      if (req.session.userId && property) {
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action: "deleted_property",
          description: `Deleted property: ${property.address}`,
          metadata: JSON.stringify({ propertyId: property.id, address: property.address })
        });
      }
      res.json({ message: "Property deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/contracts", async (req, res) => {
    try {
      const propertyId = req.query.propertyId ? parseInt(req.query.propertyId) : void 0;
      const { limit, offset } = parseLimitOffset(req.query);
      if (propertyId) {
        const items2 = await storage.getContractsByPropertyId(propertyId, limit, offset);
        return res.json(items2);
      }
      const items = await storage.getContracts(limit, offset);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/contracts/:id", async (req, res) => {
    try {
      const contract = await storage.getContractById(parseInt(req.params.id));
      if (!contract) return res.status(404).json({ message: "Contract not found" });
      res.json(contract);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/contracts", async (req, res) => {
    try {
      const validated = insertContractSchema.parse(req.body);
      const contract = await storage.createContract(validated);
      try {
        await syncCommissionEventsForContract(contract);
      } catch {
      }
      res.status(201).json(contract);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/contracts/:id", async (req, res) => {
    try {
      const partial = insertContractSchema.partial().parse(req.body);
      const contract = await storage.updateContract(parseInt(req.params.id), partial);
      try {
        await syncCommissionEventsForContract(contract);
      } catch {
      }
      res.json(contract);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/contracts/:id", async (req, res) => {
    try {
      await storage.deleteContract(parseInt(req.params.id));
      res.json({ message: "Contract deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/contracts/:id/send", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const contract = await storage.getContractById(parseInt(req.params.id));
      if (!contract) return res.status(404).json({ message: "Contract not found" });
      if (contract.status === "sent" || contract.status === "viewed" || contract.status === "partially_signed" || contract.status === "signed" || contract.status === "executed") {
        return res.status(400).json({ message: `Contract already sent or executed` });
      }
      const updated = await storage.updateContract(contract.id, { status: "sent", sentAt: /* @__PURE__ */ new Date() });
      const signers = await storage.getContractSignersByContract(contract.id);
      const signingUrlBase = `${process.env.APP_URL || "http://localhost:3000"}/api/sign/signers/`;
      for (const signer of signers) {
        if (signer.status === "signed" || signer.status === "declined") continue;
        const token = signer.tokenHash || crypto10.createHash("sha256").update(`${signer.id}-${Date.now()}`).digest("hex");
        if (token !== signer.tokenHash) {
          await storage.updateContractSigner(signer.id, { tokenHash: token });
        }
        if (signer.email) {
          try {
            await sendContractSigningEmail({
              to: signer.email,
              signerName: signer.name,
              contractTitle: contract.title || contract.notes || `Contract #${contract.id}`,
              signingUrl: `${signingUrlBase}${token}`,
              expiresAt: signer.expiresAt || void 0
            });
          } catch (e) {
            console.error(`[Contracts] Failed to send email to ${signer.email}:`, e);
          }
        }
        await storage.updateContractSigner(signer.id, {
          status: "sent",
          sentAt: /* @__PURE__ */ new Date()
        });
      }
      await storage.createContractEvent({
        contractId: contract.id,
        actorType: "user",
        actorUserId: user.id,
        eventType: "sent",
        payloadJson: JSON.stringify({ signerCount: signers.length }),
        ip: req.ip,
        userAgent: String(req.headers["user-agent"] || "")
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/contracts/:id/void", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const contract = await storage.getContractById(parseInt(req.params.id));
      if (!contract) return res.status(404).json({ message: "Contract not found" });
      if (contract.status === "executed" || contract.status === "voided") {
        return res.status(400).json({ message: `Cannot void contract from status: ${contract.status}` });
      }
      const { reason } = req.body || {};
      const updated = await storage.updateContract(contract.id, { status: "voided", voidedAt: /* @__PURE__ */ new Date(), voidedReason: reason || null });
      await storage.createContractEvent({
        contractId: contract.id,
        actorType: "user",
        actorUserId: user.id,
        eventType: "voided",
        payloadJson: JSON.stringify({ reason }),
        ip: req.ip,
        userAgent: String(req.headers["user-agent"] || "")
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/contracts/:id/execute", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const contract = await storage.getContractById(parseInt(req.params.id));
      if (!contract) return res.status(404).json({ message: "Contract not found" });
      if (contract.status !== "signed") {
        return res.status(400).json({ message: `Cannot execute contract from status: ${contract.status}` });
      }
      const updated = await storage.updateContract(contract.id, { status: "executed", executedAt: /* @__PURE__ */ new Date() });
      await storage.createContractEvent({
        contractId: contract.id,
        actorType: "user",
        actorUserId: user.id,
        eventType: "executed",
        payloadJson: JSON.stringify({}),
        ip: req.ip,
        userAgent: String(req.headers["user-agent"] || "")
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/contracts/:id/upload-signed", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const contract = await storage.getContractById(parseInt(req.params.id));
      if (!contract) return res.status(404).json({ message: "Contract not found" });
      const { documentId, reason } = req.body || {};
      const updated = await storage.updateContract(contract.id, {
        status: "signed",
        executedDocumentId: documentId || null,
        signedAt: /* @__PURE__ */ new Date()
      });
      await storage.createContractEvent({
        contractId: contract.id,
        actorType: "user",
        actorUserId: user.id,
        eventType: "document_uploaded",
        payloadJson: JSON.stringify({ documentId, reason }),
        ip: req.ip,
        userAgent: String(req.headers["user-agent"] || "")
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/contracts/:id/validate", async (req, res) => {
    try {
      const contract = await storage.getContractById(parseInt(req.params.id));
      if (!contract) return res.status(404).json({ message: "Contract not found" });
      const signers = await storage.getContractSignersByContract(contract.id);
      const fields = await storage.getContractFieldsByContract(contract.id);
      const errors = validateContractForSend(contract, signers, fields);
      res.json({ valid: errors.length === 0, errors });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/contracts/:id/generate-document", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const contract = await storage.getContractById(parseInt(req.params.id));
      if (!contract) return res.status(404).json({ message: "Contract not found" });
      const template = contract.templateId ? await storage.getContractTemplateById(contract.templateId) : null;
      if (!template) return res.status(400).json({ message: "Template is required" });
      const [property, buyer, seller, lead] = await Promise.all([
        contract.propertyId ? storage.getPropertyById(contract.propertyId) : null,
        contract.buyerId ? storage.getBuyerById(contract.buyerId) : null,
        contract.sellerContactId ? storage.getContactById(contract.sellerContactId) : null,
        contract.leadId ? storage.getLeadById(contract.leadId) : null
      ]);
      const mergeData = buildMergeData({
        property: property || void 0,
        buyer: buyer || void 0,
        seller: seller || void 0,
        lead: lead || void 0
      });
      const content = applyTemplateToContract(contract, template, mergeData);
      const doc = await storage.createContractDocument({
        templateId: template.id,
        propertyId: contract.propertyId,
        title: `${template.name} - Contract #${contract.id}`,
        documentType: "contract",
        status: "draft",
        content,
        mergeData: JSON.stringify(mergeData),
        createdBy: String(user.id)
      });
      await storage.updateContract(contract.id, { generatedDocumentId: doc.id });
      await storage.createContractEvent({
        contractId: contract.id,
        actorType: "user",
        actorUserId: user.id,
        eventType: "generated",
        payloadJson: JSON.stringify({ documentId: doc.id })
      });
      res.status(201).json(doc);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/contracts/:id/signers", async (req, res) => {
    try {
      const signers = await storage.getContractSignersByContract(parseInt(req.params.id));
      res.json(signers);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/contracts/:id/signers", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const validated = insertContractSignerSchema.parse(req.body);
      const signer = await storage.createContractSigner({ ...validated, contractId: parseInt(req.params.id) });
      await storage.createContractEvent({
        contractId: parseInt(req.params.id),
        actorType: "user",
        actorUserId: user.id,
        eventType: "signer_added",
        payloadJson: JSON.stringify({ signerId: signer.id })
      });
      res.status(201).json(signer);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/contracts/signers/:signerId", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const partial = insertContractSignerSchema.partial().parse(req.body);
      const signer = await storage.updateContractSigner(parseInt(req.params.signerId), partial);
      res.json(signer);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/contracts/:id/events", async (req, res) => {
    try {
      const events = await storage.getContractEventsByContract(parseInt(req.params.id));
      res.json(events);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/contracts/:id/fields", async (req, res) => {
    try {
      const fields = await storage.getContractFieldsByContract(parseInt(req.params.id));
      res.json(fields);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/contracts/:id/fields", async (req, res) => {
    try {
      const validated = insertContractFieldSchema.parse(req.body);
      const field = await storage.createContractField({ ...validated, contractId: parseInt(req.params.id) });
      res.status(201).json(field);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/contracts/fields/:fieldId", async (req, res) => {
    try {
      const partial = insertContractFieldSchema.partial().parse(req.body);
      const field = await storage.updateContractField(parseInt(req.params.fieldId), partial);
      res.json(field);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/contracts/fields/:fieldId", async (req, res) => {
    try {
      await storage.deleteContractField(parseInt(req.params.fieldId));
      res.json({ message: "Field deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/contract-templates/:id/preview", async (req, res) => {
    try {
      const template = await storage.getContractTemplateById(parseInt(req.params.id));
      if (!template) return res.status(404).json({ message: "Template not found" });
      const { propertyId, buyerId, sellerContactId, leadId } = req.body || {};
      const [property, buyer, seller, lead] = await Promise.all([
        propertyId ? storage.getPropertyById(parseInt(propertyId)) : null,
        buyerId ? storage.getBuyerById(parseInt(buyerId)) : null,
        sellerContactId ? storage.getContactById(parseInt(sellerContactId)) : null,
        leadId ? storage.getLeadById(parseInt(leadId)) : null
      ]);
      const mergeData = buildMergeData({ property: property || void 0, buyer: buyer || void 0, seller: seller || void 0, lead: lead || void 0 });
      const content = applyTemplateToContract({}, template, mergeData);
      res.json({ content, mergeData, fields: template.mergeFields || [] });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/contacts", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { limit, offset } = parseLimitOffset(req.query);
      const query = String(req.query.query || "").trim().toLowerCase();
      const allContacts = await storage.getContacts(limit, offset);
      if (!query) return res.json(allContacts);
      const filtered = allContacts.filter((c) => {
        const hay = [
          c?.name,
          c?.email,
          c?.phone,
          c?.company,
          c?.type,
          c?.notes
        ].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(query);
      });
      res.json(filtered);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/contacts/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const contact = await storage.getContactById(parseInt(req.params.id));
      if (!contact) return res.status(404).json({ message: "Contact not found" });
      res.json(contact);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/contacts", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const validated = insertContactSchema.parse(req.body);
      const contact = await storage.createContact(validated);
      res.status(201).json(contact);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/contacts/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const partial = insertContactSchema.partial().parse(req.body);
      const contact = await storage.updateContact(parseInt(req.params.id), partial);
      res.json(contact);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/contacts/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      await storage.deleteContact(parseInt(req.params.id));
      res.json({ message: "Contact deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/companies", async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "viewer" });
      if (!ctx) return;
      const { limit, offset } = parseLimitOffset(req.query);
      const q = typeof req.query?.q === "string" ? req.query.q : "";
      const companyType = typeof req.query?.type === "string" ? req.query.type : "";
      const out = await storage.listCompanies({ teamId: ctx.teamId, q, companyType, limit, offset });
      res.json(out);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/companies", async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "member" });
      if (!ctx) return;
      const schema = insertCompanySchema.omit({ teamId: true });
      const validated = schema.parse(req.body || {});
      const company = await storage.createCompany({ ...validated, teamId: ctx.teamId });
      try {
        await writeAuditEvent({
          teamId: ctx.teamId,
          actorUserId: ctx.user.id,
          entityType: "company",
          entityId: company.id,
          action: "company_created",
          before: null,
          after: company,
          kind: "create",
          ip: req.ip,
          userAgent: String(req.headers["user-agent"] || ""),
          requestId: res.locals?.requestId || null
        });
      } catch {
      }
      res.status(201).json(company);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/companies/:id", async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "viewer" });
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      const company = await storage.getCompanyById(id);
      if (!company || company.teamId !== ctx.teamId) return res.status(404).json({ message: "Not found" });
      res.json(company);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.patch("/api/companies/:id", async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "member" });
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      const before = await storage.getCompanyById(id);
      if (!before || before.teamId !== ctx.teamId) return res.status(404).json({ message: "Not found" });
      const patchSchema = insertCompanySchema.partial().omit({ teamId: true });
      const patch = patchSchema.parse(req.body || {});
      const updated = await storage.updateCompany(id, patch);
      try {
        await writeAuditEvent({
          teamId: ctx.teamId,
          actorUserId: ctx.user.id,
          entityType: "company",
          entityId: id,
          action: "company_updated",
          before,
          after: updated,
          kind: "update",
          ip: req.ip,
          userAgent: String(req.headers["user-agent"] || ""),
          requestId: res.locals?.requestId || null
        });
      } catch {
      }
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/companies/:id", async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "admin" });
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      const before = await storage.getCompanyById(id);
      if (!before || before.teamId !== ctx.teamId) return res.status(404).json({ message: "Not found" });
      await storage.deleteCompany(id);
      try {
        await writeAuditEvent({
          teamId: ctx.teamId,
          actorUserId: ctx.user.id,
          entityType: "company",
          entityId: id,
          action: "company_deleted",
          before,
          after: null,
          kind: "delete",
          ip: req.ip,
          userAgent: String(req.headers["user-agent"] || ""),
          requestId: res.locals?.requestId || null
        });
      } catch {
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/companies/:id/people", async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "viewer" });
      if (!ctx) return;
      const companyId = parseInt(req.params.id, 10);
      const company = await storage.getCompanyById(companyId);
      if (!company || company.teamId !== ctx.teamId) return res.status(404).json({ message: "Not found" });
      const people = await storage.getCompanyPeople(companyId);
      res.json(people);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/companies/:id/people", async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "member" });
      if (!ctx) return;
      const companyId = parseInt(req.params.id, 10);
      const company = await storage.getCompanyById(companyId);
      if (!company || company.teamId !== ctx.teamId) return res.status(404).json({ message: "Not found" });
      const schema = insertCompanyPersonSchema.omit({ teamId: true, companyId: true });
      const validated = schema.parse(req.body || {});
      const contactId = Number(validated.contactId);
      const contact = await storage.getContactById(contactId);
      if (!contact) return res.status(404).json({ message: "Contact not found" });
      const row = await storage.createCompanyPerson({ ...validated, teamId: ctx.teamId, companyId });
      try {
        await writeAuditEvent({
          teamId: ctx.teamId,
          actorUserId: ctx.user.id,
          entityType: "company",
          entityId: companyId,
          action: "company_person_added",
          before: null,
          after: { companyPerson: row, contactId },
          kind: "update",
          ip: req.ip,
          userAgent: String(req.headers["user-agent"] || ""),
          requestId: res.locals?.requestId || null
        });
      } catch {
      }
      res.status(201).json(row);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/companies/:companyId/people/:companyPersonId", async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "member" });
      if (!ctx) return;
      const companyId = parseInt(req.params.companyId, 10);
      const company = await storage.getCompanyById(companyId);
      if (!company || company.teamId !== ctx.teamId) return res.status(404).json({ message: "Not found" });
      const companyPersonId = parseInt(req.params.companyPersonId, 10);
      await storage.deleteCompanyPerson(companyPersonId);
      try {
        await writeAuditEvent({
          teamId: ctx.teamId,
          actorUserId: ctx.user.id,
          entityType: "company",
          entityId: companyId,
          action: "company_person_removed",
          before: { companyPersonId },
          after: null,
          kind: "update",
          ip: req.ip,
          userAgent: String(req.headers["user-agent"] || ""),
          requestId: res.locals?.requestId || null
        });
      } catch {
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/documents", async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "viewer" });
      if (!ctx) return;
      const { limit, offset } = parseLimitOffset(req.query);
      const q = typeof req.query?.q === "string" ? req.query.q : "";
      const tag = typeof req.query?.tag === "string" ? req.query.tag : "";
      const entityType = typeof req.query?.entityType === "string" ? req.query.entityType : "";
      const entityIdRaw = typeof req.query?.entityId === "string" ? req.query.entityId : "";
      const entityId = entityIdRaw ? parseInt(entityIdRaw, 10) : void 0;
      const out = await storage.listDocuments({
        teamId: ctx.teamId,
        q,
        tag,
        entityType,
        entityId,
        limit,
        offset
      });
      res.json(out);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  function canViewVaultDocument(ctx, document) {
    if (!document) return false;
    if (!document.isPrivate) return true;
    if (Number(document.createdBy) === Number(ctx.user.id)) return true;
    return teamRoleRank(ctx.membership?.role) >= teamRoleRank("admin") || isManagerUser(ctx.user);
  }
  app2.post("/api/documents/upload", upload.single("file"), async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "member" });
      if (!ctx) return;
      if (!isDocumentVaultConfigured()) {
        return res.status(503).json({ code: "document_vault_not_configured", message: "Document vault is not configured" });
      }
      const file = req.file;
      if (!file) return res.status(400).json({ message: "Missing file" });
      const titleRaw = typeof req.body?.title === "string" ? req.body.title : "";
      const title = titleRaw.trim() || String(file.originalname || "Document");
      const kind = typeof req.body?.kind === "string" ? req.body.kind.trim() : null;
      const isPrivateRaw = req.body?.isPrivate;
      const isPrivate = isPrivateRaw === true || String(isPrivateRaw || "").trim().toLowerCase() === "true" || String(isPrivateRaw || "").trim() === "1";
      const tagsRaw = req.body?.tags;
      let tags = null;
      if (Array.isArray(tagsRaw)) {
        tags = tagsRaw.map((t) => String(t || "").trim()).filter(Boolean);
      } else if (typeof tagsRaw === "string" && tagsRaw.trim()) {
        try {
          const parsed = JSON.parse(tagsRaw);
          if (Array.isArray(parsed)) tags = parsed.map((t) => String(t || "").trim()).filter(Boolean);
          else tags = tagsRaw.split(",");
        } catch {
          tags = tagsRaw.split(",");
        }
      }
      const buf = Buffer.from(file.buffer);
      const detectedMime = detectMimeFromMagic(buf);
      if (detectedMime && detectedMime !== file.mimetype) {
        return res.status(400).json({ message: `File content does not match declared type. Expected ${file.mimetype}, detected ${detectedMime}` });
      }
      const storageKey = makeDocumentStorageKey({ teamId: ctx.teamId, originalName: String(file.originalname || "file") });
      const sha = sha256Hex(buf);
      await uploadDocumentObject({ storageKey, contentType: String(file.mimetype || "application/octet-stream"), body: buf });
      const doc = await storage.createDocument({
        teamId: ctx.teamId,
        title,
        kind,
        mimeType: String(file.mimetype || "application/octet-stream"),
        sizeBytes: typeof file.size === "number" ? file.size : buf.length,
        storageKey,
        sha256: sha,
        tags: tags && tags.length ? tags : null,
        isPrivate,
        createdBy: ctx.user.id
      });
      const v1 = await storage.createVaultDocumentVersion({
        teamId: ctx.teamId,
        documentId: doc.id,
        version: 1,
        storageKey,
        mimeType: String(file.mimetype || "application/octet-stream"),
        sizeBytes: typeof file.size === "number" ? file.size : buf.length,
        sha256: sha,
        createdBy: ctx.user.id
      });
      const entityType = typeof req.body?.entityType === "string" ? req.body.entityType.trim() : "";
      const entityIdRaw = typeof req.body?.entityId === "string" ? req.body.entityId.trim() : "";
      const entityId = entityIdRaw ? parseInt(entityIdRaw, 10) : NaN;
      const relation = typeof req.body?.relation === "string" ? req.body.relation.trim() : null;
      const links = [];
      if (entityType && Number.isFinite(entityId) && entityId > 0) {
        const link = await storage.createDocumentLink({
          teamId: ctx.teamId,
          documentId: doc.id,
          entityType,
          entityId,
          relation
        });
        links.push(link);
      }
      try {
        await writeAuditEvent({
          teamId: ctx.teamId,
          actorUserId: ctx.user.id,
          entityType: "document",
          entityId: doc.id,
          action: "document_uploaded",
          before: null,
          after: doc,
          kind: "create",
          ip: req.ip,
          userAgent: String(req.headers["user-agent"] || ""),
          requestId: res.locals?.requestId || null
        });
      } catch {
      }
      res.status(201).json({ document: doc, links, versions: [v1] });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/documents/:id", async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "viewer" });
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      const doc = await storage.getDocumentById(id);
      if (!doc || doc.teamId !== ctx.teamId) return res.status(404).json({ message: "Not found" });
      if (!canViewVaultDocument(ctx, doc)) return res.status(403).json({ message: "Forbidden" });
      const links = await storage.getDocumentLinksByDocumentId(id);
      const versions = await storage.getVaultDocumentVersions(id);
      res.json({ document: doc, links, versions });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/documents/:id/download", async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "viewer" });
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      const doc = await storage.getDocumentById(id);
      if (!doc || doc.teamId !== ctx.teamId) return res.status(404).json({ message: "Not found" });
      if (!canViewVaultDocument(ctx, doc)) return res.status(403).json({ message: "Forbidden" });
      const url = await getDocumentSignedUrl({ storageKey: String(doc.storageKey), expiresInSeconds: 60 * 10 });
      if (!url) return res.status(503).json({ message: "Document vault is not configured" });
      res.redirect(url);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/documents/:id/preview", async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "viewer" });
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      const doc = await storage.getDocumentById(id);
      if (!doc || doc.teamId !== ctx.teamId) return res.status(404).json({ message: "Not found" });
      if (!canViewVaultDocument(ctx, doc)) return res.status(403).json({ message: "Forbidden" });
      const url = await getDocumentSignedUrl({ storageKey: String(doc.storageKey), expiresInSeconds: 60 * 5 });
      if (!url) return res.status(503).json({ code: "document_vault_not_configured", message: "Document vault is not configured for preview" });
      const upstream = await fetch(url);
      if (!upstream.ok) return res.status(502).json({ message: "Preview source unavailable" });
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.setHeader("Content-Type", String(doc.mimeType || "application/octet-stream"));
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(buffer);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/documents/:id/link", async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "member" });
      if (!ctx) return;
      const documentId = parseInt(req.params.id, 10);
      const doc = await storage.getDocumentById(documentId);
      if (!doc || doc.teamId !== ctx.teamId) return res.status(404).json({ message: "Not found" });
      const schema = insertDocumentLinkSchema.omit({ id: true, createdAt: true, teamId: true, documentId: true });
      const validated = schema.parse(req.body || {});
      const link = await storage.createDocumentLink({
        teamId: ctx.teamId,
        documentId,
        entityType: validated.entityType,
        entityId: validated.entityId,
        relation: typeof validated.relation === "string" ? validated.relation : null
      });
      try {
        await writeAuditEvent({
          teamId: ctx.teamId,
          actorUserId: ctx.user.id,
          entityType: "document",
          entityId: documentId,
          action: "document_link_added",
          before: null,
          after: link,
          kind: "update",
          ip: req.ip,
          userAgent: String(req.headers["user-agent"] || ""),
          requestId: res.locals?.requestId || null
        });
      } catch {
      }
      res.status(201).json(link);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/documents/:id/link/:linkId", async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "member" });
      if (!ctx) return;
      const documentId = parseInt(req.params.id, 10);
      const doc = await storage.getDocumentById(documentId);
      if (!doc || doc.teamId !== ctx.teamId) return res.status(404).json({ message: "Not found" });
      const linkId = parseInt(req.params.linkId, 10);
      const link = await storage.getDocumentLinkById(linkId);
      if (!link || link.teamId !== ctx.teamId || link.documentId !== documentId) return res.status(404).json({ message: "Not found" });
      await storage.deleteDocumentLinkForTeam(ctx.teamId, linkId);
      try {
        await writeAuditEvent({
          teamId: ctx.teamId,
          actorUserId: ctx.user.id,
          entityType: "document",
          entityId: documentId,
          action: "document_link_removed",
          before: link,
          after: null,
          kind: "update",
          ip: req.ip,
          userAgent: String(req.headers["user-agent"] || ""),
          requestId: res.locals?.requestId || null
        });
      } catch {
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/documents/:id/versions", async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "viewer" });
      if (!ctx) return;
      const documentId = parseInt(req.params.id, 10);
      const doc = await storage.getDocumentById(documentId);
      if (!doc || doc.teamId !== ctx.teamId) return res.status(404).json({ message: "Not found" });
      if (!canViewVaultDocument(ctx, doc)) return res.status(403).json({ message: "Forbidden" });
      const versions = await storage.getVaultDocumentVersions(documentId);
      res.json(versions);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/documents/:id/versions", upload.single("file"), async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "member" });
      if (!ctx) return;
      if (!isDocumentVaultConfigured()) {
        return res.status(503).json({ code: "document_vault_not_configured", message: "Document vault is not configured" });
      }
      const documentId = parseInt(req.params.id, 10);
      const doc = await storage.getDocumentById(documentId);
      if (!doc || doc.teamId !== ctx.teamId) return res.status(404).json({ message: "Not found" });
      if (!canViewVaultDocument(ctx, doc)) return res.status(403).json({ message: "Forbidden" });
      const file = req.file;
      if (!file) return res.status(400).json({ message: "Missing file" });
      const versions = await storage.getVaultDocumentVersions(documentId);
      const nextVersion = versions.length ? Math.max(...versions.map((v2) => Number(v2.version) || 0)) + 1 : 1;
      const buf = Buffer.from(file.buffer);
      const storageKey = makeDocumentStorageKey({ teamId: ctx.teamId, originalName: String(file.originalname || "file") });
      const sha = sha256Hex(buf);
      await uploadDocumentObject({ storageKey, contentType: String(file.mimetype || "application/octet-stream"), body: buf });
      const v = await storage.createVaultDocumentVersion({
        teamId: ctx.teamId,
        documentId,
        version: nextVersion,
        storageKey,
        mimeType: String(file.mimetype || "application/octet-stream"),
        sizeBytes: typeof file.size === "number" ? file.size : buf.length,
        sha256: sha,
        createdBy: ctx.user.id
      });
      const updated = await storage.updateDocument(documentId, {
        storageKey,
        mimeType: String(file.mimetype || "application/octet-stream"),
        sizeBytes: typeof file.size === "number" ? file.size : buf.length,
        sha256: sha,
        updatedAt: /* @__PURE__ */ new Date()
      });
      try {
        await writeAuditEvent({
          teamId: ctx.teamId,
          actorUserId: ctx.user.id,
          entityType: "document",
          entityId: documentId,
          action: "document_version_uploaded",
          before: doc,
          after: updated,
          kind: "update",
          ip: req.ip,
          userAgent: String(req.headers["user-agent"] || ""),
          requestId: res.locals?.requestId || null
        });
      } catch {
      }
      res.status(201).json({ document: updated, version: v });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/automations", async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "admin" });
      if (!ctx) return;
      const { limit, offset } = parseLimitOffset(req.query);
      const items = await storage.listAutomations(ctx.teamId, limit, offset);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/automations", async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "admin" });
      if (!ctx) return;
      const baseSchema = insertAutomationSchema.omit({ teamId: true });
      const base = baseSchema.parse(req.body || {});
      const automation = await storage.createAutomation({ ...base, teamId: ctx.teamId });
      const triggersRaw = Array.isArray(req.body?.triggers) ? req.body.triggers : [];
      const triggers = triggersRaw.map((t) => ({
        eventType: String(t?.eventType || "").trim(),
        configJson: typeof t?.configJson === "string" ? t.configJson : JSON.stringify(t?.config || {})
      })).filter((t) => t.eventType);
      await storage.replaceAutomationTriggers(ctx.teamId, automation.id, triggers);
      const conditionRaw = req.body?.condition;
      const conditionJson = typeof conditionRaw?.configJson === "string" ? String(conditionRaw.configJson) : typeof conditionRaw === "object" && conditionRaw ? JSON.stringify(conditionRaw) : "{}";
      await storage.upsertAutomationCondition(ctx.teamId, automation.id, conditionJson);
      const actionsRaw = Array.isArray(req.body?.actions) ? req.body.actions : [];
      const actions = actionsRaw.map((a, idx) => ({
        actionType: String(a?.actionType || "").trim(),
        configJson: typeof a?.configJson === "string" ? a.configJson : JSON.stringify(a?.config || {}),
        sortOrder: typeof a?.sortOrder === "number" ? a.sortOrder : idx
      })).filter((a) => a.actionType);
      await storage.replaceAutomationActions(ctx.teamId, automation.id, actions);
      const out = {
        automation,
        triggers: await storage.getAutomationTriggers(automation.id),
        condition: await storage.getAutomationCondition(automation.id),
        actions: await storage.getAutomationActions(automation.id)
      };
      try {
        await writeAuditEvent({
          teamId: ctx.teamId,
          actorUserId: ctx.user.id,
          entityType: "automation",
          entityId: automation.id,
          action: "automation_created",
          before: null,
          after: out,
          kind: "create",
          ip: req.ip,
          userAgent: String(req.headers["user-agent"] || ""),
          requestId: res.locals?.requestId || null
        });
      } catch {
      }
      res.status(201).json(out);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/automations/:id", async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "admin" });
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      const automation = await storage.getAutomationById(id);
      if (!automation || automation.teamId !== ctx.teamId) return res.status(404).json({ message: "Not found" });
      res.json({
        automation,
        triggers: await storage.getAutomationTriggers(id),
        condition: await storage.getAutomationCondition(id),
        actions: await storage.getAutomationActions(id)
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.patch("/api/automations/:id", async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "admin" });
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      const before = await storage.getAutomationById(id);
      if (!before || before.teamId !== ctx.teamId) return res.status(404).json({ message: "Not found" });
      const baseSchema = insertAutomationSchema.partial().omit({ teamId: true });
      const patch = baseSchema.parse(req.body || {});
      const updated = await storage.updateAutomation(id, { ...patch, updatedAt: /* @__PURE__ */ new Date() });
      if (Array.isArray(req.body?.triggers)) {
        const triggers = req.body.triggers.map((t) => ({
          eventType: String(t?.eventType || "").trim(),
          configJson: typeof t?.configJson === "string" ? t.configJson : JSON.stringify(t?.config || {})
        })).filter((t) => t.eventType);
        await storage.replaceAutomationTriggers(ctx.teamId, id, triggers);
      }
      if (typeof req.body?.condition !== "undefined") {
        const c = req.body.condition;
        const conditionJson = typeof c?.configJson === "string" ? String(c.configJson) : typeof c === "object" && c ? JSON.stringify(c) : "{}";
        await storage.upsertAutomationCondition(ctx.teamId, id, conditionJson);
      }
      if (Array.isArray(req.body?.actions)) {
        const actions = req.body.actions.map((a, idx) => ({
          actionType: String(a?.actionType || "").trim(),
          configJson: typeof a?.configJson === "string" ? a.configJson : JSON.stringify(a?.config || {}),
          sortOrder: typeof a?.sortOrder === "number" ? a.sortOrder : idx
        })).filter((a) => a.actionType);
        await storage.replaceAutomationActions(ctx.teamId, id, actions);
      }
      const out = {
        automation: updated,
        triggers: await storage.getAutomationTriggers(id),
        condition: await storage.getAutomationCondition(id),
        actions: await storage.getAutomationActions(id)
      };
      try {
        await writeAuditEvent({
          teamId: ctx.teamId,
          actorUserId: ctx.user.id,
          entityType: "automation",
          entityId: id,
          action: "automation_updated",
          before,
          after: out,
          kind: "update",
          ip: req.ip,
          userAgent: String(req.headers["user-agent"] || ""),
          requestId: res.locals?.requestId || null
        });
      } catch {
      }
      res.json(out);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/automations/:id", async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "admin" });
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      const before = await storage.getAutomationById(id);
      if (!before || before.teamId !== ctx.teamId) return res.status(404).json({ message: "Not found" });
      await storage.deleteAutomation(id);
      try {
        await writeAuditEvent({
          teamId: ctx.teamId,
          actorUserId: ctx.user.id,
          entityType: "automation",
          entityId: id,
          action: "automation_deleted",
          before,
          after: null,
          kind: "delete",
          ip: req.ip,
          userAgent: String(req.headers["user-agent"] || ""),
          requestId: res.locals?.requestId || null
        });
      } catch {
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/automations/:id/runs", async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "admin" });
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      const automation = await storage.getAutomationById(id);
      if (!automation || automation.teamId !== ctx.teamId) return res.status(404).json({ message: "Not found" });
      const { limit, offset } = parseLimitOffset(req.query);
      const items = await storage.listAutomationRuns(ctx.teamId, id, limit, offset);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/automations/:id/test", async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "admin" });
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      const automation = await storage.getAutomationById(id);
      if (!automation || automation.teamId !== ctx.teamId) return res.status(404).json({ message: "Not found" });
      const { eventType, entity } = req.body || {};
      if (!eventType || typeof eventType !== "string") {
        return res.status(400).json({ message: "eventType is required" });
      }
      const result = await dryRunAutomation(id, ctx.teamId, {
        eventType,
        occurredAt: (/* @__PURE__ */ new Date()).toISOString(),
        teamId: ctx.teamId,
        actorUserId: ctx.user.id,
        entity: { type: entity?.type || "lead", id: entity?.id || null },
        payload: req.body?.payload || {}
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/contract-templates", async (req, res) => {
    try {
      const { limit, offset } = parseLimitOffset(req.query);
      const category = typeof req.query?.category === "string" ? req.query.category : void 0;
      const jurisdiction = typeof req.query?.jurisdiction === "string" ? req.query.jurisdiction : void 0;
      const status = typeof req.query?.status === "string" ? req.query.status : void 0;
      const q = typeof req.query?.q === "string" ? req.query.q : void 0;
      const templates = await storage.getContractTemplates({ limit, offset, category, jurisdiction, status, q });
      res.json(templates);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/contract-templates/:id", async (req, res) => {
    try {
      const template = await storage.getContractTemplateById(parseInt(req.params.id));
      if (!template) return res.status(404).json({ message: "Template not found" });
      res.json(template);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/contract-templates", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const validated = insertContractTemplateSchema.parse(req.body);
      const template = await storage.createContractTemplate({
        ...validated,
        ownerUserId: user.id,
        status: validated.status || "draft",
        version: 1
      });
      res.status(201).json(template);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/contract-templates/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const id = parseInt(req.params.id);
      const current = await storage.getContractTemplateById(id);
      if (!current) return res.status(404).json({ message: "Template not found" });
      const partial = insertContractTemplateSchema.partial().parse(req.body);
      if (partial.content !== void 0 && current.status === "approved") {
        return res.status(400).json({ message: "Approved templates are immutable. Use /revise to create a new version." });
      }
      const template = await storage.updateContractTemplate(id, partial);
      res.json(template);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/contract-templates/:id", async (req, res) => {
    try {
      await storage.deleteContractTemplate(parseInt(req.params.id));
      res.json({ message: "Template deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/contract-templates/:id/approve", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!isManagerUser(user)) return res.status(403).json({ message: "Requires manager or admin role" });
      const id = parseInt(req.params.id);
      const template = await storage.getContractTemplateById(id);
      if (!template) return res.status(404).json({ message: "Template not found" });
      const approved = await storage.approveContractTemplate(id, user.id);
      res.json(approved);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/contract-templates/:id/revise", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const id = parseInt(req.params.id);
      const template = await storage.getContractTemplateById(id);
      if (!template) return res.status(404).json({ message: "Template not found" });
      if (template.status !== "approved") {
        return res.status(400).json({ message: "Only approved templates require versioning. Edit drafts directly." });
      }
      const clone = await storage.cloneContractTemplate(id, user.id);
      if (!clone) return res.status(500).json({ message: "Failed to create revision" });
      res.status(201).json(clone);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/contract-documents", async (req, res) => {
    try {
      const { limit, offset } = parseLimitOffset(req.query);
      const documents2 = await storage.getContractDocuments(limit, offset);
      res.json(documents2);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/contract-documents/:id", async (req, res) => {
    try {
      const document = await storage.getContractDocumentById(parseInt(req.params.id));
      if (!document) return res.status(404).json({ message: "Document not found" });
      res.json(document);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/contract-documents/:id/view", async (req, res) => {
    try {
      const actor = await requireAuth(req, res);
      if (!actor) return;
      const doc = await storage.getContractDocumentById(parseInt(req.params.id));
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const content = String(doc.content ?? "");
      res.json({ id: doc.id, title: doc.title, documentType: doc.documentType, content });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  function wrapText2(text2, maxChars = 95) {
    const words = String(text2).split(/\s+/);
    const out = [];
    let line = "";
    for (const w of words) {
      if ((line + " " + w).trim().length > maxChars) {
        if (line) out.push(line.trim());
        line = w;
      } else {
        line = line ? line + " " + w : w;
      }
    }
    if (line) out.push(line.trim());
    return out;
  }
  app2.get("/api/contract-documents/:id/pdf", async (req, res) => {
    try {
      const actor = await requireAuth(req, res);
      if (!actor) return;
      const doc = await storage.getContractDocumentById(parseInt(req.params.id));
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const pdfLib = await import("pdf-lib");
      const pdf = await pdfLib.PDFDocument.create();
      const lines = String(doc.content ?? "").split(/\r?\n/);
      const page = pdf.addPage([612, 792]);
      const helvetica = await pdf.embedFont(pdfLib.StandardFonts.Helvetica);
      let y = 750;
      for (const raw of lines) {
        const line = String(raw).trim();
        if (!line) {
          y -= 14;
          continue;
        }
        const cleaned = line.replace(/[ --]/g, "");
        try {
          const wrapped = wrapText2(cleaned, 95);
          for (const seg of wrapped) {
            if (y < 40) {
              y = 750;
              page.drawText("", { x: 0, y: 0 });
            }
            page.drawText(seg, { x: 50, y, size: 10, font: helvetica });
            y -= 14;
          }
        } catch {
        }
      }
      const bytes = await pdf.save();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(String(doc.title || "contract"))}.pdf"`);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(Buffer.from(bytes));
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/contract-documents", async (req, res) => {
    try {
      const validated = insertContractDocumentSchema.parse(req.body);
      const document = await storage.createContractDocument(validated);
      res.status(201).json(document);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/contract-documents/:id", async (req, res) => {
    try {
      const partial = insertContractDocumentSchema.partial().parse(req.body);
      const document = await storage.updateContractDocument(parseInt(req.params.id), partial);
      res.json(document);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/contract-documents/:id", async (req, res) => {
    try {
      await storage.deleteContractDocument(parseInt(req.params.id));
      res.json({ message: "Document deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/contract-documents/:id/envelopes", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "esign")) return res.status(403).json({ message: "E-sign is not enabled for this account. Ask an administrator to enable the esign feature." });
      const id = parseInt(req.params.id);
      const rows = await storage.getContractEnvelopesByDocument(id);
      res.json(rows.map((e) => ({ ...e, tokenHash: void 0 })));
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/contract-documents/:id/envelopes", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "esign")) return res.status(403).json({ message: "E-sign is not enabled for this account. Ask an administrator to enable the esign feature." });
      const id = parseInt(req.params.id);
      const doc = await storage.getContractDocumentById(id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const schema = z4.object({
        signerName: z4.string().trim().min(1).max(255),
        signerEmail: z4.string().trim().email().max(255),
        expiresInDays: z4.number().int().min(1).max(120).optional()
      });
      const payload = schema.parse(req.body || {});
      const token = crypto10.randomBytes(24).toString("hex");
      const tokenHash = crypto10.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + (payload.expiresInDays ?? 30) * 24 * 60 * 60 * 1e3);
      const env = await storage.createContractEnvelope({
        documentId: id,
        status: "sent",
        signerName: payload.signerName,
        signerEmail: payload.signerEmail,
        tokenHash,
        expiresAt,
        sentAt: /* @__PURE__ */ new Date(),
        auditJson: JSON.stringify([{ event: "sent", at: (/* @__PURE__ */ new Date()).toISOString(), userId: user.id }])
      });
      await storage.updateContractDocument(id, { status: "sent" });
      await storage.createGlobalActivity({
        userId: user.id,
        action: "contract_sent",
        description: `Contract sent for signature: ${doc.title}`,
        metadata: JSON.stringify({ documentId: id, envelopeId: env.id, signerEmail: payload.signerEmail })
      });
      const origin = `${req.protocol}://${req.get("host")}`;
      const signerUrl = `${origin}/sign/${token}`;
      let emailSent = false;
      let emailError = null;
      try {
        const subject = `Signature requested: ${String(doc.title || "Document")}`;
        const text2 = `You have a document to sign.

${signerUrl}

This link expires on ${expiresAt.toISOString()}.`;
        const html = `<p>You have a document to sign.</p><p><a href="${signerUrl}">${signerUrl}</a></p><p>This link expires on ${expiresAt.toISOString()}.</p>`;
        await sendResendEmail({ to: payload.signerEmail, subject, text: text2, html });
        emailSent = true;
      } catch (e) {
        emailError = String(e?.message || e);
      }
      try {
        const audit = (() => {
          try {
            const parsed = JSON.parse(String(env.auditJson || "[]"));
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })();
        audit.push({
          event: emailSent ? "email_sent" : "email_failed",
          at: (/* @__PURE__ */ new Date()).toISOString(),
          to: payload.signerEmail,
          error: emailSent ? void 0 : emailError
        });
        await storage.updateContractEnvelope(env.id, { auditJson: JSON.stringify(audit) });
      } catch {
      }
      res.status(201).json({ envelopeId: env.id, signerUrl, expiresAt: expiresAt.toISOString(), emailSent, emailError });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/contract-envelopes/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "esign")) return res.status(403).json({ message: "E-sign is not enabled for this account. Ask an administrator to enable the esign feature." });
      const id = parseInt(req.params.id);
      const env = await storage.getContractEnvelopeById(id);
      if (!env) return res.status(404).json({ message: "Not found" });
      res.json({ ...env, tokenHash: void 0, signatureImageBase64: void 0, signedPdfBase64: void 0 });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/contract-envelopes/:id/upload-signed", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!await isFeatureEnabled(user.id, "esign")) return res.status(403).json({ message: "E-sign is not enabled for this account. Ask an administrator to enable the esign feature." });
      const id = parseInt(req.params.id);
      const schema = z4.object({ signedPdfBase64: z4.string().trim().min(1) });
      const payload = schema.parse(req.body || {});
      const env = await storage.getContractEnvelopeById(id);
      if (!env) return res.status(404).json({ message: "Not found" });
      const audit = (() => {
        try {
          const parsed = JSON.parse(String(env.auditJson || "[]"));
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();
      audit.push({ event: "uploaded", at: (/* @__PURE__ */ new Date()).toISOString(), userId: user.id });
      const updated = await storage.updateContractEnvelope(id, {
        status: "signed",
        signedAt: /* @__PURE__ */ new Date(),
        signedPdfBase64: payload.signedPdfBase64,
        auditJson: JSON.stringify(audit)
      });
      await storage.createGlobalActivity({
        userId: user.id,
        action: "contract_uploaded",
        description: "Signed contract uploaded",
        metadata: JSON.stringify({ envelopeId: id, documentId: updated.documentId })
      });
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/sign/envelopes/:token", async (req, res) => {
    try {
      const token = String(req.params.token || "").trim();
      if (!token) return res.status(404).json({ message: "Not found" });
      const tokenHash = crypto10.createHash("sha256").update(token).digest("hex");
      const env = await storage.getContractEnvelopeByTokenHash(tokenHash);
      if (!env) return res.status(404).json({ message: "Not found" });
      if (env.expiresAt && new Date(env.expiresAt).getTime() < Date.now()) return res.status(410).json({ message: "Link expired" });
      const doc = await storage.getContractDocumentById(env.documentId);
      if (!doc) return res.status(404).json({ message: "Not found" });
      let mergeData = {};
      try {
        mergeData = doc.mergeData ? JSON.parse(String(doc.mergeData)) : {};
      } catch {
        mergeData = {};
      }
      const merged = mergeTemplate(String(doc.content || ""), mergeData);
      res.json({
        envelope: {
          id: env.id,
          status: env.status,
          signerName: env.signerName,
          signerEmail: env.signerEmail,
          expiresAt: env.expiresAt,
          sentAt: env.sentAt,
          viewedAt: env.viewedAt,
          signedAt: env.signedAt,
          declinedAt: env.declinedAt
        },
        document: { id: doc.id, title: doc.title, content: merged }
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/sign/envelopes/:token/viewed", async (req, res) => {
    try {
      const token = String(req.params.token || "").trim();
      const tokenHash = crypto10.createHash("sha256").update(token).digest("hex");
      const env = await storage.getContractEnvelopeByTokenHash(tokenHash);
      if (!env) return res.status(404).json({ message: "Not found" });
      if (env.expiresAt && new Date(env.expiresAt).getTime() < Date.now()) return res.status(410).json({ message: "Link expired" });
      const audit = (() => {
        try {
          const parsed = JSON.parse(String(env.auditJson || "[]"));
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();
      audit.push({ event: "viewed", at: (/* @__PURE__ */ new Date()).toISOString(), ip: req.ip, ua: req.headers["user-agent"] || "" });
      await storage.updateContractEnvelope(env.id, {
        status: env.status === "sent" ? "viewed" : env.status,
        viewedAt: env.viewedAt || /* @__PURE__ */ new Date(),
        auditJson: JSON.stringify(audit)
      });
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/sign/envelopes/:token/decline", async (req, res) => {
    try {
      const token = String(req.params.token || "").trim();
      const tokenHash = crypto10.createHash("sha256").update(token).digest("hex");
      const env = await storage.getContractEnvelopeByTokenHash(tokenHash);
      if (!env) return res.status(404).json({ message: "Not found" });
      if (env.expiresAt && new Date(env.expiresAt).getTime() < Date.now()) return res.status(410).json({ message: "Link expired" });
      if (env.status === "signed") return res.status(400).json({ message: "Already signed" });
      const audit = (() => {
        try {
          const parsed = JSON.parse(String(env.auditJson || "[]"));
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();
      audit.push({ event: "declined", at: (/* @__PURE__ */ new Date()).toISOString(), ip: req.ip, ua: req.headers["user-agent"] || "" });
      await storage.updateContractEnvelope(env.id, { status: "declined", declinedAt: /* @__PURE__ */ new Date(), auditJson: JSON.stringify(audit) });
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/sign/envelopes/:token/sign", async (req, res) => {
    try {
      const token = String(req.params.token || "").trim();
      const tokenHash = crypto10.createHash("sha256").update(token).digest("hex");
      const env = await storage.getContractEnvelopeByTokenHash(tokenHash);
      if (!env) return res.status(404).json({ message: "Not found" });
      if (env.expiresAt && new Date(env.expiresAt).getTime() < Date.now()) return res.status(410).json({ message: "Link expired" });
      if (env.status === "signed") return res.status(400).json({ message: "Already signed" });
      if (env.status === "declined") return res.status(400).json({ message: "Declined" });
      const schema = z4.object({
        signatureType: z4.enum(["typed", "drawn"]),
        signatureText: z4.string().trim().max(255).optional().nullable(),
        signatureImageBase64: z4.string().trim().optional().nullable()
      });
      const payload = schema.parse(req.body || {});
      if (payload.signatureType === "typed" && !String(payload.signatureText || "").trim()) return res.status(400).json({ message: "Signature text is required" });
      if (payload.signatureType === "drawn" && !String(payload.signatureImageBase64 || "").trim()) return res.status(400).json({ message: "Signature image is required" });
      const doc = await storage.getContractDocumentById(env.documentId);
      if (!doc) return res.status(404).json({ message: "Not found" });
      let mergeData = {};
      try {
        mergeData = doc.mergeData ? JSON.parse(String(doc.mergeData)) : {};
      } catch {
        mergeData = {};
      }
      const merged = mergeTemplate(String(doc.content || ""), mergeData);
      const audit = (() => {
        try {
          const parsed = JSON.parse(String(env.auditJson || "[]"));
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();
      audit.push({ event: "signed", at: (/* @__PURE__ */ new Date()).toISOString(), ip: req.ip, ua: req.headers["user-agent"] || "" });
      const auditLines = [
        `Envelope #${env.id}`,
        `Signer: ${String(env.signerName || "")} <${String(env.signerEmail || "")}>`,
        `Signed at: ${(/* @__PURE__ */ new Date()).toISOString()}`
      ];
      const signedPdfBase64 = await generateSignedPdfBase64({
        title: String(doc.title || "Document"),
        contentText: merged,
        signatureType: payload.signatureType,
        signatureText: payload.signatureText || null,
        signatureImageBase64: payload.signatureImageBase64 || null,
        auditLines
      });
      await storage.updateContractEnvelope(env.id, {
        status: "signed",
        signedAt: /* @__PURE__ */ new Date(),
        signatureType: payload.signatureType,
        signatureText: payload.signatureText || null,
        signatureImageBase64: payload.signatureType === "drawn" ? payload.signatureImageBase64 || null : null,
        signedPdfBase64,
        auditJson: JSON.stringify(audit)
      });
      await storage.updateContractDocument(env.documentId, { status: "executed" }).catch((e) => {
        console.error(JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), event: "esign", kind: "document_update_failed", documentId: env.documentId, message: String(e?.message || e), code: e?.code ? String(e.code) : null }));
      });
      await storage.createGlobalActivity({
        userId: 0,
        action: "contract_signed",
        description: `Contract signed: ${String(doc.title || "")}`,
        metadata: JSON.stringify({ envelopeId: env.id, documentId: env.documentId, signerEmail: env.signerEmail || null })
      }).catch((e) => {
        console.error(JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), event: "esign", kind: "activity_log_failed", action: "contract_signed", documentId: env.documentId, envelopeId: env.id, message: String(e?.message || e), code: e?.code ? String(e.code) : null }));
      });
      try {
        await onContractSigned({
          documentId: env.documentId,
          title: String(doc.title || "").trim(),
          propertyId: doc?.propertyId ?? null
        });
      } catch {
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/sign/envelopes/:token/pdf", async (req, res) => {
    try {
      const token = String(req.params.token || "").trim();
      const tokenHash = crypto10.createHash("sha256").update(token).digest("hex");
      const env = await storage.getContractEnvelopeByTokenHash(tokenHash);
      if (!env) return res.status(404).json({ message: "Not found" });
      if (!env.signedPdfBase64) return res.status(404).json({ message: "Not found" });
      const bytes = Buffer.from(String(env.signedPdfBase64), "base64");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="signed-envelope-${env.id}.pdf"`);
      res.send(bytes);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/sign/signers/:token", async (req, res) => {
    try {
      const token = String(req.params.token || "").trim();
      if (!token) return res.status(404).json({ message: "Not found" });
      const tokenHash = crypto10.createHash("sha256").update(token).digest("hex");
      const signer = await storage.getContractSignerByTokenHash(tokenHash);
      if (!signer) return res.status(404).json({ message: "Not found" });
      if (signer.expiresAt && new Date(signer.expiresAt).getTime() < Date.now()) return res.status(410).json({ message: "Link expired" });
      if (signer.status === "signed") return res.status(400).json({ message: "Already signed" });
      if (signer.status === "declined") return res.status(400).json({ message: "Declined" });
      const contract = await storage.getContractById(signer.contractId);
      if (!contract) return res.status(404).json({ message: "Not found" });
      let docContent = "";
      let docTitle = "Contract";
      if (contract.generatedDocumentId) {
        const doc = await storage.getContractDocumentById(contract.generatedDocumentId);
        if (doc) {
          docTitle = doc.title;
          let mergeData = {};
          try {
            mergeData = doc.mergeData ? JSON.parse(String(doc.mergeData)) : {};
          } catch {
            mergeData = {};
          }
          const fallback = contract.mergeDataSnapshot || {};
          const merged = mergeTemplate(String(doc.content || ""), { ...fallback, ...mergeData });
          docContent = merged;
        }
      }
      res.json({
        signer: {
          id: signer.id,
          name: signer.name,
          email: signer.email,
          role: signer.role,
          status: signer.status,
          expiresAt: signer.expiresAt,
          sentAt: signer.sentAt,
          viewedAt: signer.viewedAt,
          signedAt: signer.signedAt
        },
        contract: { id: contract.id, status: contract.status },
        document: { title: docTitle, content: docContent }
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/sign/signers/:token/viewed", async (req, res) => {
    try {
      const token = String(req.params.token || "").trim();
      const tokenHash = crypto10.createHash("sha256").update(token).digest("hex");
      const signer = await storage.getContractSignerByTokenHash(tokenHash);
      if (!signer) return res.status(404).json({ message: "Not found" });
      if (signer.expiresAt && new Date(signer.expiresAt).getTime() < Date.now()) return res.status(410).json({ message: "Link expired" });
      const updated = await storage.updateContractSigner(signer.id, {
        status: signer.status === "sent" ? "viewed" : signer.status,
        viewedAt: /* @__PURE__ */ new Date()
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/sign/signers/:token/decline", async (req, res) => {
    try {
      const token = String(req.params.token || "").trim();
      const tokenHash = crypto10.createHash("sha256").update(token).digest("hex");
      const signer = await storage.getContractSignerByTokenHash(tokenHash);
      if (!signer) return res.status(404).json({ message: "Not found" });
      if (signer.expiresAt && new Date(signer.expiresAt).getTime() < Date.now()) return res.status(410).json({ message: "Link expired" });
      if (signer.status === "signed") return res.status(400).json({ message: "Already signed" });
      const updated = await storage.updateContractSigner(signer.id, {
        status: "declined",
        declinedAt: /* @__PURE__ */ new Date()
      });
      await storage.createContractEvent({
        contractId: signer.contractId,
        actorType: "contact",
        actorContactId: signer.contactId || void 0,
        eventType: "declined",
        payloadJson: JSON.stringify({ signerId: signer.id }),
        ip: req.ip,
        userAgent: String(req.headers["user-agent"] || "")
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/sign/signers/:token/sign", async (req, res) => {
    try {
      const token = String(req.params.token || "").trim();
      const tokenHash = crypto10.createHash("sha256").update(token).digest("hex");
      const signer = await storage.getContractSignerByTokenHash(tokenHash);
      if (!signer) return res.status(404).json({ message: "Not found" });
      if (signer.expiresAt && new Date(signer.expiresAt).getTime() < Date.now()) return res.status(410).json({ message: "Link expired" });
      if (signer.status === "signed") return res.status(400).json({ message: "Already signed" });
      if (signer.status === "declined") return res.status(400).json({ message: "Declined" });
      const schema = z4.object({
        signatureType: z4.enum(["typed", "drawn"]),
        signatureText: z4.string().trim().max(255).optional().nullable(),
        signatureImageBase64: z4.string().trim().optional().nullable(),
        legalName: z4.string().trim().max(255).optional(),
        consent: z4.boolean().optional()
      });
      const payload = schema.parse(req.body || {});
      if (payload.signatureType === "typed" && !String(payload.signatureText || "").trim()) return res.status(400).json({ message: "Signature text is required" });
      if (payload.signatureType === "drawn" && !String(payload.signatureImageBase64 || "").trim()) return res.status(400).json({ message: "Signature image is required" });
      const contract = await storage.getContractById(signer.contractId);
      if (!contract) return res.status(404).json({ message: "Not found" });
      let docContent = "";
      if (contract.generatedDocumentId) {
        const doc = await storage.getContractDocumentById(contract.generatedDocumentId);
        if (doc) {
          let mergeData = {};
          try {
            mergeData = doc.mergeData ? JSON.parse(String(doc.mergeData)) : {};
          } catch {
            mergeData = {};
          }
          const fallback = contract.mergeDataSnapshot || {};
          docContent = mergeTemplate(String(doc.content || ""), { ...fallback, ...mergeData });
        }
      }
      const auditLines = [
        `Contract #${contract.id}`,
        `Signer: ${signer.name} <${signer.email || ""}>`,
        `Signed at: ${(/* @__PURE__ */ new Date()).toISOString()}`
      ];
      const signedPdfBase64 = await generateSignedPdfBase64({
        title: `Contract #${contract.id}`,
        contentText: docContent,
        signatureType: payload.signatureType,
        signatureText: payload.signatureText || null,
        signatureImageBase64: payload.signatureImageBase64 || null,
        auditLines
      });
      const signatureMetadata = {
        signatureType: payload.signatureType,
        legalName: payload.legalName || signer.name,
        consent: payload.consent || false,
        signedAt: (/* @__PURE__ */ new Date()).toISOString(),
        ip: req.ip,
        userAgent: String(req.headers["user-agent"] || "")
      };
      await storage.updateContractSigner(signer.id, {
        status: "signed",
        signedAt: /* @__PURE__ */ new Date(),
        signatureMetadataJson: JSON.stringify(signatureMetadata)
      });
      await storage.createContractEvent({
        contractId: signer.contractId,
        actorType: "contact",
        actorContactId: signer.contactId || void 0,
        eventType: "signed",
        payloadJson: JSON.stringify({ signerId: signer.id, signatureType: payload.signatureType }),
        ip: req.ip,
        userAgent: String(req.headers["user-agent"] || "")
      });
      res.json({ ok: true, signedPdfBase64 });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/documents/:documentId/versions", async (req, res) => {
    try {
      const versions = await storage.getDocumentVersions(parseInt(req.params.documentId));
      res.json(versions);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/documents/:documentId/versions", async (req, res) => {
    try {
      const validated = insertDocumentVersionSchema.parse({
        ...req.body,
        documentId: parseInt(req.params.documentId)
      });
      const version = await storage.createDocumentVersion(validated);
      res.status(201).json(version);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/lois", async (req, res) => {
    try {
      const { limit, offset } = parseLimitOffset(req.query);
      const allLois = await storage.getLois(limit, offset);
      res.json(allLois);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/lois/:id", async (req, res) => {
    try {
      const loi = await storage.getLoiById(parseInt(req.params.id));
      if (!loi) return res.status(404).json({ message: "LOI not found" });
      res.json(loi);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/lois", async (req, res) => {
    try {
      const validated = insertLoiSchema.parse(req.body);
      const loi = await storage.createLoi(validated);
      res.status(201).json(loi);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/lois/:id", async (req, res) => {
    try {
      const partial = insertLoiSchema.partial().parse(req.body);
      const loi = await storage.updateLoi(parseInt(req.params.id), partial);
      res.json(loi);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/lois/:id", async (req, res) => {
    try {
      await storage.deleteLoi(parseInt(req.params.id));
      res.json({ message: "LOI deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/users", async (req, res) => {
    try {
      const { limit, offset } = parseLimitOffset(req.query);
      const users2 = await storage.getUsers(limit, offset);
      res.json((users2 || []).filter((u) => u.isActive !== false).map((u) => {
        const { passwordHash, ...safe } = u;
        return safe;
      }));
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUserById(parseInt(req.params.id));
      if (!user) return res.status(404).json({ message: "User not found" });
      const { passwordHash, ...safe } = user;
      res.json(safe);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/users", async (req, res) => {
    try {
      const validated = insertUserSchema.parse(req.body);
      const user = await storage.createUser(validated);
      res.status(201).json(user);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/users/:id/password", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const userId = parseInt(req.params.id);
    if (req.session.userId !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current and new password are required" });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters long" });
      }
      const user = await storage.getUserById(userId);
      if (!user || !user.passwordHash) {
        return res.status(404).json({ message: "User not found" });
      }
      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }
      const newPasswordHash = await bcrypt.hash(newPassword, 12);
      await storage.updateUser(userId, { passwordHash: newPasswordHash });
      res.json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });
  app2.patch("/api/users/:id", async (req, res) => {
    try {
      const partial = insertUserSchema.partial().parse(req.body);
      const user = await storage.updateUser(parseInt(req.params.id), partial);
      res.json(user);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/users/:userId/2fa", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const targetId = parseInt(req.params.userId);
      if (!isSameUserOrAdmin(user, targetId)) return res.status(403).json({ message: "You do not have access" });
      const auth = await storage.getTwoFactorAuthByUserId(targetId);
      res.json(auth ? { isEnabled: auth.isEnabled, method: auth.method, createdAt: auth.createdAt } : { isEnabled: false });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/users/:userId/2fa", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const targetId = parseInt(req.params.userId);
      if (!isSameUserOrAdmin(user, targetId)) return res.status(403).json({ message: "You do not have access" });
      if (Number(user.id) !== targetId) return res.status(403).json({ message: "Only the account owner can enable 2FA" });
      const currentPassword = String(req.body?.password || "");
      const fresh = await storage.getUserById(targetId);
      if (!fresh?.passwordHash) return res.status(400).json({ message: "Password authentication is required to enable 2FA" });
      const okPw = await bcrypt.compare(currentPassword, fresh.passwordHash);
      if (!okPw) return res.status(401).json({ message: "Current password is incorrect" });
      const existing = await storage.getTwoFactorAuthByUserId(targetId);
      if (existing?.isEnabled) return res.status(400).json({ message: "2FA is already enabled" });
      const secret = speakeasy.generateSecret({ name: `Luxe RM (${req.body?.email || user.email})`, issuer: "Luxe RM", length: 32 });
      const qrCode = await QRCode.toDataURL(secret.otpauth_url);
      const validated = insertTwoFactorAuthSchema.parse({ userId: targetId, secret: secret.base32, isEnabled: false, method: "totp" });
      const auth = await storage.createTwoFactorAuth(validated);
      const teamId = await getOrInitActiveTeamId(req, user.id) ?? null;
      if (teamId) {
        try {
          await writeAuditEvent({ teamId, actorUserId: user.id, entityType: "user", entityId: targetId, action: "2fa_enrollment_started", kind: "create", ip: req.ip, userAgent: String(req.headers["user-agent"] || "") });
        } catch {
        }
      }
      res.status(201).json({ ...auth, qrCode, otpauthUrl: secret.otpauth_url });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/users/:userId/2fa/verify", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const targetId = parseInt(req.params.userId);
      if (!isSameUserOrAdmin(user, targetId)) return res.status(403).json({ message: "You do not have access" });
      if (!checkTwoFactorRateLimit(`verify:${targetId}:${req.ip || "unknown"}`)) {
        return res.status(429).json({ message: "Too many attempts. Try again in 15 minutes." });
      }
      const { code } = req.body || {};
      if (!code || String(code).trim().length !== 6) return res.status(400).json({ message: "A 6-digit code is required" });
      const auth = await storage.getTwoFactorAuthByUserId(targetId);
      if (!auth) return res.status(404).json({ message: "2FA not set up" });
      const verified = speakeasy.totp.verify({ secret: auth.secret, encoding: "base32", token: String(code).trim(), window: 2 });
      if (!verified) return res.status(400).json({ message: "Invalid code" });
      const updated = await storage.updateTwoFactorAuth(targetId, { isEnabled: true });
      const teamId = await getOrInitActiveTeamId(req, user.id) ?? null;
      if (teamId) {
        try {
          await writeAuditEvent({ teamId, actorUserId: user.id, entityType: "user", entityId: targetId, action: "2fa_enabled", kind: "update", ip: req.ip, userAgent: String(req.headers["user-agent"] || "") });
        } catch {
        }
      }
      res.json({ isEnabled: updated.isEnabled });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/auth/login/2fa", async (req, res) => {
    try {
      const { tempToken, code } = req.body || {};
      if (!tempToken || !code) return res.status(400).json({ message: "Missing tempToken or code" });
      if (!checkTwoFactorRateLimit(`login2fa:${req.ip || "unknown"}`)) {
        return res.status(429).json({ message: "Too many attempts. Try again in 15 minutes." });
      }
      const secret = authJwtSecret();
      if (!secret) return res.status(500).json({ message: "Auth not configured" });
      const { jwtVerify: jwtVerify3 } = await import("jose");
      let payload;
      try {
        payload = await jwtVerify3(tempToken, secret);
      } catch {
        return res.status(401).json({ message: "Invalid or expired session" });
      }
      const userId = parseInt(payload.sub);
      const user = await storage.getUserById(userId);
      if (!user) return res.status(401).json({ message: "User not found" });
      const twoFactor = await storage.getTwoFactorAuthByUserId(userId);
      if (!twoFactor?.isEnabled) return res.status(400).json({ message: "2FA is not enabled" });
      const isBackupCode = String(code).trim().length === 10;
      let verified = false;
      if (isBackupCode) {
        const codeHash = crypto10.createHash("sha256").update(String(code).trim()).digest("hex");
        verified = await storage.useBackupCode(userId, codeHash);
      } else {
        verified = speakeasy.totp.verify({ secret: twoFactor.secret, encoding: "base32", token: String(code).trim(), window: 2 });
      }
      if (!verified) return res.status(401).json({ message: isBackupCode ? "Invalid backup code" : "Invalid 2FA code" });
      req.session.userId = user.id;
      req.session.email = user.email;
      {
        const at = await getOrInitActiveTeamId(req, user.id);
        if (at) req.session.activeTeamId = at;
        else delete req.session.activeTeamId;
      }
      const { passwordHash, ...userWithoutPassword } = user;
      const token = await issueAuthToken({ sub: String(user.id), email: user.email });
      res.json({ user: userWithoutPassword, token });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.patch("/api/users/:userId/2fa", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const targetId = parseInt(req.params.userId);
      if (!isSameUserOrAdmin(user, targetId)) return res.status(403).json({ message: "You do not have access" });
      const partial = insertTwoFactorAuthSchema.partial().parse(req.body);
      const { secret: _secret, isEnabled: _isEnabled, ...allowed } = partial;
      if (Object.keys(allowed).length === 0) return res.status(400).json({ message: "Nothing to update" });
      const auth = await storage.updateTwoFactorAuth(targetId, allowed);
      res.json(auth);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/users/:userId/2fa", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const targetId = parseInt(req.params.userId);
      if (!isSameUserOrAdmin(user, targetId)) return res.status(403).json({ message: "You do not have access" });
      if (Number(user.id) !== targetId) return res.status(403).json({ message: "Only the account owner can disable 2FA" });
      const currentPassword = String(req.body?.password || "");
      const secondFactor = String(req.body?.code || "");
      const fresh = await storage.getUserById(targetId);
      if (!fresh?.passwordHash) return res.status(400).json({ message: "Password authentication is required to disable 2FA" });
      const okPw = await bcrypt.compare(currentPassword, fresh.passwordHash);
      if (!okPw) return res.status(401).json({ message: "Current password is incorrect" });
      const auth = await storage.getTwoFactorAuthByUserId(targetId);
      let secondFactorOk = false;
      if (auth) {
        if (String(secondFactor).trim().length === 10) {
          const codeHash = crypto10.createHash("sha256").update(String(secondFactor).trim()).digest("hex");
          secondFactorOk = await storage.useBackupCode(targetId, codeHash);
        } else {
          secondFactorOk = speakeasy.totp.verify({ secret: auth.secret, encoding: "base32", token: String(secondFactor).trim(), window: 2 });
        }
      }
      if (!secondFactorOk) return res.status(401).json({ message: "A valid 2FA code or backup code is required to disable 2FA" });
      await storage.deleteTwoFactorAuth(targetId);
      await storage.deleteBackupCodes(targetId);
      const teamId = await getOrInitActiveTeamId(req, user.id) ?? null;
      if (teamId) {
        try {
          await writeAuditEvent({ teamId, actorUserId: user.id, entityType: "user", entityId: targetId, action: "2fa_disabled", kind: "delete", ip: req.ip, userAgent: String(req.headers["user-agent"] || "") });
        } catch {
        }
      }
      res.json({ message: "2FA disabled" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/users/:userId/backup-codes", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const targetId = parseInt(req.params.userId);
      if (!isSameUserOrAdmin(user, targetId)) return res.status(403).json({ message: "You do not have access" });
      const codes = await storage.getBackupCodesByUserId(targetId);
      const unusedCount = codes.filter((c) => !c.isUsed).length;
      res.json({ count: codes.length, unusedCount, createdAt: codes[0]?.createdAt || null });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/users/:userId/backup-codes", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const targetId = parseInt(req.params.userId);
      if (!isSameUserOrAdmin(user, targetId)) return res.status(403).json({ message: "You do not have access" });
      const validated = insertBackupCodeSchema.parse({ ...req.body, userId: targetId });
      const code = await storage.createBackupCode(validated);
      res.status(201).json(code);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/users/:userId/backup-codes/generate", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const targetId = parseInt(req.params.userId);
      if (!isSameUserOrAdmin(user, targetId)) return res.status(403).json({ message: "You do not have access" });
      if (Number(user.id) !== targetId) return res.status(403).json({ message: "Only the account owner can generate backup codes" });
      await storage.deleteBackupCodes(targetId);
      const codes = [];
      const hashedCodes = [];
      for (let i = 0; i < 10; i++) {
        const rawCode = crypto10.randomBytes(5).toString("hex").toUpperCase().slice(0, 10);
        const codeHash = crypto10.createHash("sha256").update(rawCode).digest("hex");
        codes.push(rawCode);
        hashedCodes.push({ userId: targetId, code: codeHash, isUsed: false });
      }
      await db.insert(backupCodes).values(hashedCodes);
      const teamId = await getOrInitActiveTeamId(req, user.id) ?? null;
      if (teamId) {
        try {
          await writeAuditEvent({ teamId, actorUserId: user.id, entityType: "user", entityId: targetId, action: "backup_codes_regenerated", kind: "update", ip: req.ip, userAgent: String(req.headers["user-agent"] || "") });
        } catch {
        }
      }
      res.status(201).json({ codes });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  const defaultPipelineColumnsByEntityType = {
    lead: [
      { value: "new", label: "New" },
      { value: "contacted", label: "Contacted" },
      { value: "qualified", label: "Qualified" },
      { value: "negotiation", label: "Negotiation" },
      { value: "under_contract", label: "Under Contract" },
      { value: "closed", label: "Closed" },
      { value: "lost", label: "Lost" }
    ],
    opportunity: [
      { value: "active", label: "Active" },
      { value: "negotiation", label: "Negotiation" },
      { value: "under_contract", label: "Under Contract" },
      { value: "pending", label: "Pending" },
      { value: "sold", label: "Sold" },
      { value: "withdrawn", label: "Withdrawn" }
    ]
  };
  app2.get("/api/pipeline-config", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const entityType = String(req.query.entityType || "").trim();
      const defaults = defaultPipelineColumnsByEntityType[entityType];
      if (!defaults) return res.status(400).json({ message: "Invalid entityType" });
      const row = await storage.getPipelineConfig(userId, entityType);
      if (!row) return res.json({ entityType, columns: defaults });
      let parsed = defaults;
      try {
        const json = JSON.parse(row.columns);
        if (Array.isArray(json)) parsed = json;
      } catch {
      }
      res.json({ entityType, columns: parsed });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/pipeline-config", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const entityType = String(req.query.entityType || "").trim();
      const defaults = defaultPipelineColumnsByEntityType[entityType];
      if (!defaults) return res.status(400).json({ message: "Invalid entityType" });
      const columns = req.body?.columns;
      if (!Array.isArray(columns) || !columns.length) return res.status(400).json({ message: "Invalid columns" });
      const cleaned = columns.map((c) => ({ value: String(c?.value || "").trim(), label: String(c?.label || "").trim() })).filter((c) => c.value && c.label);
      if (!cleaned.length) return res.status(400).json({ message: "Invalid columns" });
      const updated = await storage.upsertPipelineConfig(userId, entityType, JSON.stringify(cleaned));
      let parsed = cleaned;
      try {
        const json = JSON.parse(updated.columns);
        if (Array.isArray(json)) parsed = json;
      } catch {
      }
      res.json({ entityType, columns: parsed });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/activity", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : 50;
      const group = String(req.query.group || "").trim().toLowerCase() === "true";
      const windowMinutesRaw = req.query.windowMinutes ? parseInt(req.query.windowMinutes) : 15;
      const windowMinutes = Number.isFinite(windowMinutesRaw) ? Math.min(Math.max(windowMinutesRaw, 1), 60) : 15;
      const propertyId = req.query.propertyId ? parseInt(req.query.propertyId) : void 0;
      const leadId = req.query.leadId ? parseInt(req.query.leadId) : void 0;
      const playgroundSessionIdRaw = req.query.playgroundSessionId ?? req.query.sessionId;
      const playgroundSessionId = playgroundSessionIdRaw ? parseInt(playgroundSessionIdRaw) : void 0;
      const logs = await storage.getGlobalActivityLogs(limit);
      const parsed = logs.map((log3) => {
        let meta = null;
        try {
          meta = log3.metadata ? JSON.parse(log3.metadata) : null;
        } catch {
        }
        return { ...log3, metadataParsed: meta };
      });
      const filtered = parsed.filter((log3) => {
        if (playgroundSessionId && log3.metadataParsed?.playgroundSessionId !== playgroundSessionId) return false;
        if (propertyId && log3.metadataParsed?.propertyId !== propertyId) return false;
        if (leadId && log3.metadataParsed?.leadId !== leadId) return false;
        return true;
      });
      const filteredOrGrouped = !group ? filtered : (() => {
        const out2 = [];
        const windowMs = windowMinutes * 60 * 1e3;
        for (const log3 of filtered) {
          const createdAtMs = new Date(log3.createdAt).getTime();
          const meta = log3.metadataParsed || {};
          const key = [
            String(log3.userId ?? ""),
            String(log3.action ?? ""),
            String(log3.description ?? ""),
            String(meta?.leadId ?? ""),
            String(meta?.propertyId ?? ""),
            String(meta?.playgroundSessionId ?? "")
          ].join("|");
          const last = out2[out2.length - 1];
          if (last && last.__groupKey === key && Number.isFinite(last.__createdAtMs) && Number.isFinite(createdAtMs) && last.__createdAtMs - createdAtMs <= windowMs) {
            last.groupCount = Number(last.groupCount || 1) + 1;
            continue;
          }
          out2.push({
            ...log3,
            groupCount: 1,
            __groupKey: key,
            __createdAtMs: createdAtMs
          });
        }
        return out2.map((l) => {
          const { __groupKey, __createdAtMs, ...rest } = l;
          return rest;
        });
      })();
      const userIds = Array.from(
        new Set(
          filteredOrGrouped.map((log3) => typeof log3.userId === "number" ? log3.userId : null).filter((id) => typeof id === "number" && Number.isFinite(id) && id !== 0)
        )
      );
      const userRows = userIds.length > 0 ? await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        profilePicture: users.profilePicture
      }).from(users).where(inArray3(users.id, userIds)) : [];
      const usersById = new Map(userRows.map((u) => [u.id, u]));
      const out = filteredOrGrouped.map((log3) => {
        const user = log3.userId === 0 ? {
          id: 0,
          firstName: "System",
          lastName: null,
          email: null,
          profilePicture: null
        } : usersById.get(log3.userId) || null;
        return { ...log3, user };
      });
      res.json(out);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/activity", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const action = String(req.body?.action || "").trim();
      const description = typeof req.body?.description === "string" ? req.body.description : null;
      const metadata = req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : null;
      if (!action) return res.status(400).json({ message: "Missing action" });
      const log3 = await storage.createGlobalActivity({
        userId,
        action,
        description,
        metadata: metadata ? JSON.stringify(metadata) : null
      });
      res.status(201).json(log3);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/audit", async (req, res) => {
    try {
      const ctx = await requireActiveTeam(req, res, { minRole: "admin" });
      if (!ctx) return;
      const { limit, offset } = parseLimitOffset(req.query);
      const schema = z4.object({
        entityType: z4.string().trim().min(1).optional(),
        entityId: z4.coerce.number().int().positive().optional(),
        actorUserId: z4.coerce.number().int().positive().optional(),
        action: z4.string().trim().min(1).optional(),
        from: z4.coerce.date().optional(),
        to: z4.coerce.date().optional()
      });
      const q = schema.parse(req.query || {});
      const whereParts = [eq3(auditEvents.teamId, ctx.teamId)];
      if (q.entityType) whereParts.push(eq3(auditEvents.entityType, q.entityType));
      if (typeof q.entityId === "number") whereParts.push(eq3(auditEvents.entityId, q.entityId));
      if (typeof q.actorUserId === "number") whereParts.push(eq3(auditEvents.actorUserId, q.actorUserId));
      if (q.action) whereParts.push(eq3(auditEvents.action, q.action));
      if (q.from) whereParts.push(gte3(auditEvents.createdAt, q.from));
      if (q.to) whereParts.push(lte3(auditEvents.createdAt, q.to));
      const whereClause = and3(...whereParts);
      const rows = await db.select().from(auditEvents).where(whereClause).orderBy(desc2(auditEvents.createdAt), desc2(auditEvents.id)).limit(limit).offset(offset);
      const countRows = await db.select({ count: sql4`count(*)::int` }).from(auditEvents).where(whereClause);
      const total = Number(countRows?.[0]?.count || 0);
      const actorIds = Array.from(
        new Set(
          rows.map((r) => typeof r.actorUserId === "number" ? r.actorUserId : null).filter((id) => typeof id === "number" && Number.isFinite(id))
        )
      );
      const actorRows = actorIds.length > 0 ? await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        profilePicture: users.profilePicture
      }).from(users).where(inArray3(users.id, actorIds)) : [];
      const actorsById = new Map(actorRows.map((u) => [u.id, u]));
      const items = rows.map((r) => {
        const parsed = { ...r, actor: r.actorUserId ? actorsById.get(r.actorUserId) || null : null };
        for (const key of ["beforeJson", "afterJson", "diffJson"]) {
          try {
            const raw = parsed[key];
            parsed[`${key}Parsed`] = raw ? JSON.parse(raw) : null;
          } catch {
            parsed[`${key}Parsed`] = null;
          }
        }
        return parsed;
      });
      res.json({ items, total });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/teams/my", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const teams2 = await storage.getTeamsForUser(user.id);
      res.json(teams2);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/teams/active", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const teamId = await getOrInitActiveTeamId(req, user.id);
      if (!teamId) return res.json({ teamId: null, team: null });
      const team = await storage.getTeamById(teamId);
      return res.json({ teamId, team: team || null });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/teams/active", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const teamId = typeof req.body?.teamId === "number" ? req.body.teamId : parseInt(String(req.body?.teamId || ""), 10);
      if (!Number.isFinite(teamId) || teamId <= 0) return res.status(400).json({ message: "Invalid teamId" });
      if (!user.isSuperAdmin) {
        const m = await storage.getTeamMemberByTeamAndUser(teamId, user.id);
        if (!m || String(m.status || "").toLowerCase() !== "active") return res.status(403).json({ message: "Forbidden" });
      }
      req.session.activeTeamId = teamId;
      const team = await storage.getTeamById(teamId);
      return res.json({ teamId, team: team || null });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/teams/join", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const inviteCode = String(req.body?.inviteCode || "").trim();
      if (!inviteCode) return res.status(400).json({ message: "Missing inviteCode" });
      const team = await storage.getTeamByInviteCode(inviteCode);
      if (!team) return res.status(404).json({ message: "Team not found" });
      const existing = await storage.getTeamMemberByTeamAndUser(team.id, user.id);
      if (!existing) {
        await storage.createTeamMember({
          teamId: team.id,
          userId: user.id,
          role: "member",
          permissions: null,
          invitedBy: null,
          joinedAt: /* @__PURE__ */ new Date(),
          status: "active"
        });
        await storage.createTeamActivityLog({
          teamId: team.id,
          userId: user.id,
          action: "team_joined",
          description: `${user.email} joined`,
          metadata: null
        });
      }
      if (!req.session.activeTeamId) req.session.activeTeamId = team.id;
      res.json({ team });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/teams", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const teams2 = await storage.getTeamsForUser(user.id);
      res.json(teams2);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/teams/:id", async (req, res) => {
    try {
      const teamId = parseInt(req.params.id);
      const ctx = await requireTeamMembership(req, res, { teamId, minRole: "viewer" });
      if (!ctx) return;
      const team = await storage.getTeamById(teamId);
      if (!team) return res.status(404).json({ message: "Team not found" });
      res.json(team);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/teams", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ message: "Missing team name" });
      const inviteCode = makeInviteCode();
      const team = await storage.createTeam({
        name,
        description: typeof req.body?.description === "string" ? req.body.description : null,
        ownerId: user.id,
        inviteCode,
        isActive: true
      });
      await storage.createTeamMember({
        teamId: team.id,
        userId: user.id,
        role: "owner",
        permissions: null,
        invitedBy: user.id,
        joinedAt: /* @__PURE__ */ new Date(),
        status: "active"
      });
      req.session.activeTeamId = team.id;
      res.status(201).json(team);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/teams/:id", async (req, res) => {
    try {
      const teamId = parseInt(req.params.id);
      const ctx = await requireTeamMembership(req, res, { teamId, minRole: "admin" });
      if (!ctx) return;
      const partial = insertTeamSchema.partial().parse(req.body);
      const patch = { ...partial };
      delete patch.ownerId;
      delete patch.inviteCode;
      const team = await storage.updateTeam(teamId, patch);
      res.json(team);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/teams/:id", async (req, res) => {
    try {
      const teamId = parseInt(req.params.id);
      const ctx = await requireTeamMembership(req, res, { teamId, minRole: "admin" });
      if (!ctx) return;
      await storage.deleteTeam(teamId);
      res.json({ message: "Team deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/teams/:teamId/members", async (req, res) => {
    try {
      const teamId = parseInt(req.params.teamId);
      const ctx = await requireTeamMembership(req, res, { teamId, minRole: "viewer" });
      if (!ctx) return;
      const members = await storage.getTeamMembersWithUsers(teamId);
      res.json(members);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/teams/:teamId/invite", async (req, res) => {
    try {
      const teamId = parseInt(req.params.teamId);
      const ctx = await requireTeamMembership(req, res, { teamId, minRole: "admin" });
      if (!ctx) return;
      const email = String(req.body?.email || "").trim().toLowerCase();
      if (!email) return res.status(400).json({ message: "Missing email" });
      const role = String(req.body?.role || "member").trim().toLowerCase();
      if (teamRoleRank(role) < 1) return res.status(400).json({ message: "Invalid role" });
      const user = await storage.getUserByEmail(email);
      if (!user) return res.status(404).json({ message: "User not found" });
      const existing = await storage.getTeamMemberByTeamAndUser(teamId, user.id);
      if (existing) return res.json(existing);
      const member = await storage.createTeamMember({
        teamId,
        userId: user.id,
        role,
        permissions: null,
        invitedBy: ctx.user.id,
        joinedAt: /* @__PURE__ */ new Date(),
        status: "active"
      });
      await storage.createTeamActivityLog({
        teamId,
        userId: ctx.user.id,
        action: "member_invited",
        description: `${email} invited`,
        metadata: JSON.stringify({ invitedUserId: user.id, role })
      });
      res.status(201).json(member);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/teams/:teamId/members", async (req, res) => {
    try {
      const teamId = parseInt(req.params.teamId);
      const ctx = await requireTeamMembership(req, res, { teamId, minRole: "admin" });
      if (!ctx) return;
      const validated = insertTeamMemberSchema.parse({ ...req.body, teamId });
      const member = await storage.createTeamMember(validated);
      res.status(201).json(member);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/team-members/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const existing = await storage.getTeamMemberById(parseInt(req.params.id));
      if (!existing) return res.status(404).json({ message: "Not found" });
      const teamId = Number(existing.teamId);
      const ctx = await requireTeamMembership(req, res, { teamId, minRole: "admin" });
      if (!ctx) return;
      const partial = insertTeamMemberSchema.partial().parse(req.body);
      const member = await storage.updateTeamMember(parseInt(req.params.id), partial);
      res.json(member);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/team-members/:id", async (req, res) => {
    try {
      const existing = await storage.getTeamMemberById(parseInt(req.params.id));
      if (!existing) return res.status(404).json({ message: "Not found" });
      const teamId = Number(existing.teamId);
      const ctx = await requireTeamMembership(req, res, { teamId, minRole: "admin" });
      if (!ctx) return;
      await storage.deleteTeamMember(parseInt(req.params.id));
      res.json({ message: "Team member removed" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/teams/:teamId/activity", async (req, res) => {
    try {
      const teamId = parseInt(req.params.teamId);
      const ctx = await requireTeamMembership(req, res, { teamId, minRole: "viewer" });
      if (!ctx) return;
      const { limit } = parseLimitOffset(req.query);
      const logs = await storage.getTeamActivityLogs(teamId, limit);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/teams/:teamId/activity", async (req, res) => {
    try {
      const teamId = parseInt(req.params.teamId);
      const ctx = await requireTeamMembership(req, res, { teamId, minRole: "admin" });
      if (!ctx) return;
      const validated = insertTeamActivityLogSchema.parse({ ...req.body, teamId });
      const log3 = await storage.createTeamActivityLog({ ...validated, userId: ctx.user.id });
      res.status(201).json(log3);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/users/:userId/notification-preferences", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const targetId = parseInt(req.params.userId);
      if (!isSameUserOrAdmin(user, targetId)) return res.status(403).json({ message: "You do not have access" });
      const prefs = await storage.getNotificationPreferencesByUserId(targetId);
      res.json(prefs || {});
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/users/:userId/notification-preferences", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const targetId = parseInt(req.params.userId);
      if (!isSameUserOrAdmin(user, targetId)) return res.status(403).json({ message: "You do not have access" });
      const validated = insertNotificationPreferenceSchema.parse({ ...req.body, userId: targetId });
      const prefs = await storage.createNotificationPreferences(validated);
      res.status(201).json(prefs);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/users/:userId/notification-preferences", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const targetId = parseInt(req.params.userId);
      if (!isSameUserOrAdmin(user, targetId)) return res.status(403).json({ message: "You do not have access" });
      const partial = insertNotificationPreferenceSchema.partial().parse(req.body);
      const prefs = await storage.updateNotificationPreferences(targetId, partial);
      res.json(prefs);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/users/:userId/notifications", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const targetId = parseInt(req.params.userId);
      if (!isSameUserOrAdmin(user, targetId)) return res.status(403).json({ message: "You do not have access" });
      const { limit, offset } = parseLimitOffset(req.query);
      const notifications = await storage.getUserNotifications(targetId, limit, offset);
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/users/:userId/notifications/unread-count", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const targetId = parseInt(req.params.userId);
      if (!isSameUserOrAdmin(user, targetId)) return res.status(403).json({ message: "You do not have access" });
      const count = await storage.getUnreadNotificationCount(targetId);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/users/:userId/notifications", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const targetId = parseInt(req.params.userId);
      if (!isSameUserOrAdmin(user, targetId)) return res.status(403).json({ message: "You do not have access" });
      const validated = insertUserNotificationSchema.parse({ ...req.body, userId: targetId });
      const notification = await storage.createUserNotification(validated);
      res.status(201).json(notification);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const notificationId = parseInt(req.params.id);
      const target = await storage.getUserNotificationById(notificationId);
      if (!target) return res.status(404).json({ message: "Notification not found" });
      if (Number(target.userId) !== Number(user.id) && !isManagerUser(user)) {
        return res.status(403).json({ message: "You do not have access" });
      }
      const notification = await storage.markNotificationAsRead(notificationId);
      res.json(notification);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/notifications/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const notificationId = parseInt(req.params.id);
      const target = await storage.getUserNotificationById(notificationId);
      if (!target) return res.status(404).json({ message: "Notification not found" });
      if (Number(target.userId) !== Number(user.id) && !isManagerUser(user)) {
        return res.status(403).json({ message: "You do not have access" });
      }
      await storage.deleteUserNotification(notificationId);
      res.json({ message: "Notification deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.delete("/api/users/:userId/notifications", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const targetId = parseInt(req.params.userId);
      if (!isSameUserOrAdmin(user, targetId)) return res.status(403).json({ message: "You do not have access" });
      await storage.deleteAllUserNotifications(targetId);
      res.json({ message: "All notifications deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.patch("/api/users/:userId/notifications/read-all", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const targetId = parseInt(req.params.userId);
      if (!isSameUserOrAdmin(user, targetId)) return res.status(403).json({ message: "You do not have access" });
      await storage.markAllNotificationsAsRead(targetId);
      res.json({ message: "All notifications marked as read" });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/messages/conversations", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const rows = await storage.getInternalMessageConversations(user.id);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/messages", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const withUserId = req.query.withUserId ? parseInt(String(req.query.withUserId), 10) : void 0;
      const limit = Math.min(parseInt(String(req.query.limit || "100"), 10) || 100, 500);
      const offset = parseInt(String(req.query.offset || "0"), 10) || 0;
      const messages = await storage.getInternalMessages(user.id, withUserId, limit, offset);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/messages/unread-count", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const count = await storage.getInternalMessageUnreadCount(user.id);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/messages/read", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const withUserId = req.body?.withUserId ? parseInt(String(req.body.withUserId), 10) : void 0;
      await storage.markInternalMessagesRead(user.id, withUserId);
      res.json({ message: "Marked as read" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/messages", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const body = req.body || {};
      const recipientUserId = parseInt(body.recipientUserId, 10);
      if (!Number.isInteger(recipientUserId) || recipientUserId <= 0) {
        return res.status(400).json({ message: "A valid recipient is required" });
      }
      if (recipientUserId === user.id) return res.status(400).json({ message: "You cannot message yourself" });
      const messageBody = String(body.body || "").trim();
      if (!messageBody) return res.status(400).json({ message: "Message body is required" });
      if (messageBody.length > 5e3) return res.status(400).json({ message: "Message is too long" });
      const recipient = await storage.getUserById(recipientUserId);
      if (!recipient) return res.status(404).json({ message: "Recipient not found" });
      const relatedType = body.relatedType ? String(body.relatedType).slice(0, 50) : null;
      const relatedId = body.relatedId ? parseInt(String(body.relatedId), 10) : null;
      const message = await storage.createInternalMessage({
        senderUserId: user.id,
        recipientUserId,
        body: messageBody,
        relatedType,
        relatedId,
        readAt: null
      });
      await notifyUser({
        userId: recipientUserId,
        category: "internal_message",
        title: `New internal message from ${userDisplayName(user)}`,
        description: messageBody.length > 140 ? `${messageBody.slice(0, 140)}\u2026` : messageBody,
        relatedType: relatedType || "message",
        relatedId: relatedId ?? message.id,
        eventKey: `msg:${message.id}`
      });
      res.status(201).json(message);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/calendar-events", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const from = req.query.from ? new Date(String(req.query.from)) : void 0;
      const to = req.query.to ? new Date(String(req.query.to)) : void 0;
      const events = await storage.getCalendarEventsForUser(user.id, from, to);
      res.json(events);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/calendar-events", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const body = req.body || {};
      const title = String(body.title || "").trim();
      if (!title) return res.status(400).json({ message: "Title is required" });
      const startsAt = new Date(body.startsAt);
      if (Number.isNaN(startsAt.getTime())) return res.status(400).json({ message: "A valid start time is required" });
      const endsAt = body.endsAt ? new Date(body.endsAt) : null;
      if (endsAt && Number.isNaN(endsAt.getTime())) return res.status(400).json({ message: "Invalid end time" });
      if (endsAt && endsAt.getTime() <= startsAt.getTime()) return res.status(400).json({ message: "End time must be after start time" });
      const inviteeUserIds = Array.isArray(body.inviteeUserIds) ? body.inviteeUserIds.map((id) => parseInt(String(id), 10)).filter((id) => Number.isInteger(id) && id > 0) : [];
      const event = await storage.createCalendarEvent({
        title,
        description: body.description ? String(body.description).slice(0, 5e3) : null,
        startsAt,
        endsAt,
        meetingLink: body.meetingLink ? String(body.meetingLink).slice(0, 500) : null,
        location: body.location ? String(body.location).slice(0, 255) : null,
        createdBy: user.id,
        relatedType: body.relatedType ? String(body.relatedType).slice(0, 50) : null,
        relatedId: body.relatedId ? parseInt(String(body.relatedId), 10) : null,
        inviteeUserIds
      });
      const invitees = [.../* @__PURE__ */ new Set([...inviteeUserIds])].filter((id) => id !== user.id);
      for (const inviteeId of invitees) {
        await notifyUser({
          userId: inviteeId,
          category: "meeting_invite",
          title: "Meeting invitation",
          description: `${userDisplayName(user)} invited you to "${title}"${endsAt ? ` at ${endsAt.toISOString()}` : ""}.`,
          relatedType: "calendar",
          relatedId: event.id,
          eventKey: `meeting:${event.id}:invitee:${inviteeId}`
        });
      }
      res.status(201).json(event);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/calendar-events/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const eventId = parseInt(req.params.id, 10);
      const event = await storage.getCalendarEventById(eventId);
      if (!event) return res.status(404).json({ message: "Event not found" });
      if (Number(event.createdBy) !== Number(user.id) && !isManagerUser(user)) {
        return res.status(403).json({ message: "You do not have access to edit this event" });
      }
      const body = req.body || {};
      const patch = {};
      if (body.title !== void 0) patch.title = String(body.title).trim() || void 0;
      if (body.description !== void 0) patch.description = String(body.description).slice(0, 5e3);
      if (body.startsAt !== void 0) {
        const s = new Date(body.startsAt);
        if (Number.isNaN(s.getTime())) return res.status(400).json({ message: "Invalid start time" });
        patch.startsAt = s;
      }
      if (body.endsAt !== void 0) {
        const e = new Date(body.endsAt);
        if (Number.isNaN(e.getTime())) return res.status(400).json({ message: "Invalid end time" });
        patch.endsAt = e;
      }
      if (patch.startsAt && patch.endsAt && patch.endsAt.getTime() <= patch.startsAt.getTime()) {
        return res.status(400).json({ message: "End time must be after start time" });
      }
      if (body.meetingLink !== void 0) patch.meetingLink = body.meetingLink ? String(body.meetingLink).slice(0, 500) : null;
      if (body.inviteeUserIds !== void 0) {
        patch.inviteeUserIds = Array.isArray(body.inviteeUserIds) ? body.inviteeUserIds.map((id) => parseInt(String(id), 10)).filter((id) => Number.isInteger(id) && id > 0) : [];
      }
      const updated = await storage.updateCalendarEvent(eventId, patch);
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/calendar-events/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const eventId = parseInt(req.params.id, 10);
      const event = await storage.getCalendarEventById(eventId);
      if (!event) return res.status(404).json({ message: "Event not found" });
      if (Number(event.createdBy) !== Number(user.id) && !isManagerUser(user)) {
        return res.status(403).json({ message: "You do not have access to delete this event" });
      }
      await storage.deleteCalendarEvent(eventId);
      res.json({ message: "Event deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  function canViewTask(user, task) {
    if (isManagerUser(user)) return true;
    if (task?.isPrivate) {
      return Number(task?.createdBy) === Number(user?.id) || Number(task?.assignedToUserId) === Number(user?.id);
    }
    return true;
  }
  function canMutateTask(user, task) {
    if (isManagerUser(user)) return true;
    return Number(task?.createdBy) === Number(user?.id) || Number(task?.assignedToUserId) === Number(user?.id);
  }
  app2.get("/api/tasks", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const schema = z4.object({
        assignedToUserId: z4.coerce.number().int().positive().optional(),
        createdByUserId: z4.coerce.number().int().positive().optional(),
        status: z4.string().trim().min(1).optional(),
        type: z4.string().trim().min(1).optional(),
        priority: z4.string().trim().min(1).optional(),
        relatedEntityType: z4.string().trim().min(1).optional(),
        relatedEntityId: z4.coerce.number().int().positive().optional(),
        dueFrom: z4.coerce.date().optional(),
        dueTo: z4.coerce.date().optional(),
        includeCompleted: z4.enum(["true", "false"]).optional().transform((v) => v === "true"),
        limit: z4.coerce.number().int().min(1).max(200).optional(),
        offset: z4.coerce.number().int().min(0).optional()
      });
      const q = schema.parse(req.query || {});
      if (typeof q.assignedToUserId === "number") {
        const ok = await requireAssigneeInActiveTeam(req, res, user, q.assignedToUserId);
        if (!ok) return;
      }
      const out = await storage.listTasks(
        { userId: user.id, isManager: isManagerUser(user) },
        {
          assignedToUserId: q.assignedToUserId,
          createdByUserId: q.createdByUserId,
          status: q.status,
          type: q.type,
          priority: q.priority,
          relatedEntityType: q.relatedEntityType,
          relatedEntityId: q.relatedEntityId,
          dueFrom: q.dueFrom,
          dueTo: q.dueTo,
          includeCompleted: q.includeCompleted,
          limit: q.limit,
          offset: q.offset
        }
      );
      res.json(out);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/tasks", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const createSchema = insertTaskSchema.omit({ createdBy: true });
      const validated = createSchema.parse(req.body || {});
      const assignedToUserId = typeof validated.assignedToUserId === "number" ? validated.assignedToUserId : user.id;
      const ok = await requireAssigneeInActiveTeam(req, res, user, assignedToUserId);
      if (!ok) return;
      const task = await createTask({
        ...validated,
        assignedToUserId,
        createdBy: user.id
      });
      res.status(201).json(task);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/tasks/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const id = parseInt(req.params.id);
      const task = await storage.getTaskById(id);
      if (!task) return res.status(404).json({ message: "Task not found" });
      if (!canViewTask(user, task)) return res.status(404).json({ message: "Task not found" });
      if (!canMutateTask(user, task)) return res.status(403).json({ message: "Forbidden" });
      const patchSchema = insertTaskSchema.partial().omit({ createdBy: true });
      const patch = patchSchema.parse(req.body || {});
      if (typeof patch.assignedToUserId === "number") {
        const ok = await requireAssigneeInActiveTeam(req, res, user, patch.assignedToUserId);
        if (!ok) return;
      }
      const updated = await storage.updateTask(id, patch);
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/tasks/:id/complete", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const id = parseInt(req.params.id);
      const task = await storage.getTaskById(id);
      if (!task) return res.status(404).json({ message: "Task not found" });
      if (!canViewTask(user, task)) return res.status(404).json({ message: "Task not found" });
      if (!canMutateTask(user, task)) return res.status(403).json({ message: "Forbidden" });
      const out = await completeTaskWithRecurrence({ taskId: id, completedAt: /* @__PURE__ */ new Date() });
      if (!out) return res.status(404).json({ message: "Task not found" });
      res.json(out);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/tasks/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const id = parseInt(req.params.id);
      const task = await storage.getTaskById(id);
      if (!task) return res.status(404).json({ message: "Task not found" });
      if (!canViewTask(user, task)) return res.status(404).json({ message: "Task not found" });
      if (!canMutateTask(user, task)) return res.status(403).json({ message: "Forbidden" });
      await storage.deleteTask(id);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  async function listEntityTasks(req, res, entity) {
    const user = await requireAuth(req, res);
    if (!user) return null;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const includeCompleted = String(req.query.includeCompleted || "").trim().toLowerCase() === "true";
    const out = await storage.listTasks(
      { userId: user.id, isManager: isManagerUser(user) },
      {
        relatedEntityType: entity.type,
        relatedEntityId: entity.id,
        includeCompleted,
        limit,
        offset: 0
      }
    );
    return out;
  }
  async function createEntityTask(req, res, entity) {
    const user = await requireAuth(req, res);
    if (!user) return null;
    const createSchema = insertTaskSchema.omit({ createdBy: true, relatedEntityType: true, relatedEntityId: true });
    const validated = createSchema.parse(req.body || {});
    const assignedToUserId = typeof validated.assignedToUserId === "number" ? validated.assignedToUserId : user.id;
    const task = await createTask({
      ...validated,
      relatedEntityType: entity.type,
      relatedEntityId: entity.id,
      assignedToUserId,
      createdBy: user.id
    });
    return task;
  }
  app2.get("/api/leads/:id/tasks", async (req, res) => {
    try {
      const out = await listEntityTasks(req, res, { type: "lead", id: parseInt(req.params.id) });
      if (!out) return;
      res.json(out);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/leads/:id/tasks", async (req, res) => {
    try {
      const task = await createEntityTask(req, res, { type: "lead", id: parseInt(req.params.id) });
      if (!task) return;
      res.status(201).json(task);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/opportunities/:id/tasks", async (req, res) => {
    try {
      const out = await listEntityTasks(req, res, { type: "opportunity", id: parseInt(req.params.id) });
      if (!out) return;
      res.json(out);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/opportunities/:id/tasks", async (req, res) => {
    try {
      const task = await createEntityTask(req, res, { type: "opportunity", id: parseInt(req.params.id) });
      if (!task) return;
      res.status(201).json(task);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/buyers/:id/tasks", async (req, res) => {
    try {
      const out = await listEntityTasks(req, res, { type: "buyer", id: parseInt(req.params.id) });
      if (!out) return;
      res.json(out);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/buyers/:id/tasks", async (req, res) => {
    try {
      const task = await createEntityTask(req, res, { type: "buyer", id: parseInt(req.params.id) });
      if (!task) return;
      res.status(201).json(task);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/campaigns/:id/tasks", async (req, res) => {
    try {
      const out = await listEntityTasks(req, res, { type: "campaign", id: parseInt(req.params.id) });
      if (!out) return;
      res.json(out);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/campaigns/:id/tasks", async (req, res) => {
    try {
      const task = await createEntityTask(req, res, { type: "campaign", id: parseInt(req.params.id) });
      if (!task) return;
      res.status(201).json(task);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/ai/config", async (_req, res) => {
    const required = [
      "TELNYX_API_KEY",
      "TELNYX_CONNECTION_ID",
      "TELNYX_MESSAGING_PROFILE_ID",
      "TELNYX_PUBLIC_KEY",
      "TELNYX_DEFAULT_FROM_NUMBER"
    ];
    const missing = required.filter((k) => !process.env[k] || String(process.env[k]).trim() === "");
    const ready2 = missing.length === 0;
    res.json({ ready: ready2, missing });
  });
  app2.get("/api/ai/ping", async (_req, res) => {
    const ok = Boolean(process.env.TELNYX_API_KEY && process.env.TELNYX_CONNECTION_ID && process.env.TELNYX_MESSAGING_PROFILE_ID);
    res.json({ ok });
  });
  app2.get("/api/users/:userId/goals", async (req, res) => {
    try {
      const goals = await storage.getUserGoals(parseInt(req.params.userId));
      res.json(goals);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/goals/:id", async (req, res) => {
    try {
      const goal = await storage.getUserGoalById(parseInt(req.params.id));
      if (!goal) return res.status(404).json({ message: "Goal not found" });
      res.json(goal);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/users/:userId/goals", async (req, res) => {
    try {
      const validated = insertUserGoalSchema.parse({ ...req.body, userId: parseInt(req.params.userId) });
      const goal = await storage.createUserGoal(validated);
      res.status(201).json(goal);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/goals/:id", async (req, res) => {
    try {
      const partial = insertUserGoalSchema.partial().parse(req.body);
      const goal = await storage.updateUserGoal(parseInt(req.params.id), partial);
      res.json(goal);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/goals/:id", async (req, res) => {
    try {
      await storage.deleteUserGoal(parseInt(req.params.id));
      res.json({ message: "Goal deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/offers", async (req, res) => {
    try {
      const userId = req.query.userId ? parseInt(req.query.userId) : void 0;
      const propertyId = req.query.propertyId ? parseInt(req.query.propertyId) : void 0;
      const { limit, offset } = parseLimitOffset(req.query);
      if (userId) {
        const offers3 = await storage.getOffersByUserId(userId, limit, offset);
        return res.json(offers3);
      }
      if (propertyId) {
        const offers3 = await storage.getOffersByPropertyId(propertyId, limit, offset);
        return res.json(offers3);
      }
      const offers2 = await storage.getOffers(limit, offset);
      res.json(offers2);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/offers/:id", async (req, res) => {
    try {
      const offer = await storage.getOfferById(parseInt(req.params.id));
      if (!offer) return res.status(404).json({ message: "Offer not found" });
      res.json(offer);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/offers", async (req, res) => {
    try {
      const validated = insertOfferSchema.parse(req.body);
      const offer = await storage.createOffer(validated);
      res.status(201).json(offer);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/offers/:id", async (req, res) => {
    try {
      const partial = insertOfferSchema.partial().parse(req.body);
      const offer = await storage.updateOffer(parseInt(req.params.id), partial);
      res.json(offer);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/offers/:id", async (req, res) => {
    try {
      await storage.deleteOffer(parseInt(req.params.id));
      res.json({ message: "Offer deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  const BUYER_OFFER_STATUSES = ["draft", "received", "countered", "accepted", "rejected", "withdrawn", "expired"];
  app2.get("/api/opportunities/:id/offers", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const opportunityId = parseInt(req.params.id, 10);
      const property = await storage.getPropertyById(opportunityId);
      if (!property) return res.status(404).json({ message: "Opportunity not found" });
      const offers2 = await storage.getBuyerOffersByOpportunity(opportunityId);
      res.json(offers2);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/opportunities/:id/offers", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const opportunityId = parseInt(req.params.id, 10);
      const property = await storage.getPropertyById(opportunityId);
      if (!property) return res.status(404).json({ message: "Opportunity not found" });
      const body = req.body || {};
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: "A valid offer amount is required" });
      const buyerInquiryId = body.buyerInquiryId ? parseInt(body.buyerInquiryId, 10) : null;
      const buyerContactId = body.buyerContactId ? parseInt(body.buyerContactId, 10) : null;
      const offer = await storage.createBuyerOffer({
        opportunityId,
        buyerInquiryId,
        buyerContactId,
        amount: String(amount),
        earnestMoney: body.earnestMoney !== void 0 && body.earnestMoney !== "" ? String(Number(body.earnestMoney)) : null,
        financingType: body.financingType ? String(body.financingType).slice(0, 50) : null,
        closeBy: body.closeBy ? new Date(body.closeBy) : null,
        terms: body.terms ? String(body.terms) : null,
        assignmentTerms: body.assignmentTerms ? String(body.assignmentTerms) : null,
        notes: body.notes ? String(body.notes) : null,
        status: "received",
        version: 1,
        parentOfferId: null,
        superseded: false,
        createdBy: user.id
      });
      await logOpportunityEvent(opportunityId, "offer_created", "Offer Created", `Offer of $${amount.toLocaleString()} received${buyerInquiryId ? " from buyer inquiry" : ""}.`, user.id, "user", { offerId: offer.id, amount: String(amount) });
      await notifyOpportunityOwner({
        propertyId: opportunityId,
        category: "offer_received",
        title: "New offer received",
        description: `Offer of $${amount.toLocaleString()} received for ${property?.address || `opportunity #${opportunityId}`}.`,
        eventKey: `offer:${offer.id}:received`,
        actorUserId: user.id
      });
      res.status(201).json(offer);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/buyer-offers/:id/counter", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const offerId = parseInt(req.params.id, 10);
      const existing = await storage.getBuyerOfferById(offerId);
      if (!existing) return res.status(404).json({ message: "Offer not found" });
      const body = req.body || {};
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: "A valid counter amount is required" });
      await storage.updateBuyerOffer(offerId, { superseded: true, status: "countered" });
      const counter = await storage.createBuyerOffer({
        opportunityId: existing.opportunityId,
        buyerInquiryId: existing.buyerInquiryId,
        buyerContactId: existing.buyerContactId,
        amount: String(amount),
        earnestMoney: body.earnestMoney !== void 0 && body.earnestMoney !== "" ? String(Number(body.earnestMoney)) : existing.earnestMoney,
        financingType: body.financingType ? String(body.financingType).slice(0, 50) : existing.financingType,
        closeBy: body.closeBy ? new Date(body.closeBy) : existing.closeBy,
        terms: body.terms ? String(body.terms) : existing.terms,
        assignmentTerms: body.assignmentTerms ? String(body.assignmentTerms) : existing.assignmentTerms,
        notes: body.notes ? String(body.notes) : null,
        status: "received",
        version: (existing.version || 1) + 1,
        parentOfferId: existing.id,
        superseded: false,
        createdBy: user.id
      });
      await logOpportunityEvent(existing.opportunityId, "offer_countered", "Offer Countered", `Counter-offer of $${amount.toLocaleString()} sent (v${counter.version}).`, user.id, "user", { offerId: counter.id, parentOfferId: existing.id, amount: String(amount) });
      res.status(201).json(counter);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/buyer-offers/:id/status", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const offerId = parseInt(req.params.id, 10);
      const offer = await storage.getBuyerOfferById(offerId);
      if (!offer) return res.status(404).json({ message: "Offer not found" });
      const newStatus = String(req.body?.status || "").trim();
      if (!BUYER_OFFER_STATUSES.includes(newStatus)) return res.status(400).json({ message: "Invalid offer status" });
      if (offer.status === newStatus) return res.json(offer);
      if (offer.superseded) return res.status(400).json({ message: "This offer version was superseded by a counter-offer" });
      const updated = await storage.updateBuyerOffer(offerId, { status: newStatus });
      await logOpportunityEvent(offer.opportunityId, "offer_status_changed", `Offer ${newStatus.replace("_", " ")}`, `Offer #${offer.id} ($${Number(offer.amount).toLocaleString()}) marked ${newStatus}.`, user.id, "user", { offerId: offer.id, status: newStatus });
      if (newStatus === "accepted") {
        const property = await storage.getPropertyById(offer.opportunityId);
        const currentStage = String(property?.stage || "lead");
        const reservedIdx = OPPORTUNITY_STAGES.indexOf("reserved");
        const currentIdx = OPPORTUNITY_STAGES.indexOf(currentStage);
        if (currentIdx >= 0 && currentIdx < reservedIdx) {
          await storage.updateProperty(offer.opportunityId, { stage: "reserved", stageChangedAt: /* @__PURE__ */ new Date(), lastActivityAt: /* @__PURE__ */ new Date() });
          await logOpportunityEvent(offer.opportunityId, "stage_changed", "Stage changed to Reserved", "Opportunity moved to Reserved after offer accepted.", user.id, "user", { oldStage: currentStage, newStage: "reserved" });
        }
        try {
          const listings = await storage.getPublicListingsByOpportunity(offer.opportunityId);
          for (const l of listings) {
            if (l.status === "published") await storage.updatePublicListing(l.id, { status: "paused" });
          }
        } catch {
        }
        const day = 24 * 60 * 60 * 1e3;
        const closingDefs = [
          { title: "[Closing] Confirm buyer commitment / EMD", type: "closing", priority: "high", dueAt: new Date(Date.now() + 2 * day) },
          { title: "[Closing] Coordinate title & closing", type: "closing", priority: "high", dueAt: new Date(Date.now() + 7 * day) }
        ];
        for (const d of closingDefs) {
          await ensureOpportunityTask(offer.opportunityId, user.id, d);
        }
        await notifyOpportunityOwner({
          propertyId: offer.opportunityId,
          category: "offer_accepted",
          title: "Offer accepted",
          description: `Offer #${offer.id} ($${Number(offer.amount).toLocaleString()}) was accepted. Closing tasks created and listing paused.`,
          eventKey: `offer:${offer.id}:accepted`,
          actorUserId: user.id
        });
      }
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/work-categories", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const includeInactive = String(req.query.includeInactive || "").trim() === "true";
      const rows = await storage.getWorkCategories({ includeInactive });
      res.json(rows);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/work-categories", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!isManagerUser(user)) return res.status(403).json({ message: "Forbidden" });
      const validated = insertWorkCategorySchema.parse(req.body);
      const created = await storage.createWorkCategory(validated);
      res.status(201).json(created);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/work-categories/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!isManagerUser(user)) return res.status(403).json({ message: "Forbidden" });
      const id = parseInt(req.params.id);
      const patch = insertWorkCategorySchema.partial().parse(req.body);
      const updated = await storage.updateWorkCategory(id, patch);
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/work-categories/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!isManagerUser(user)) return res.status(403).json({ message: "Forbidden" });
      const id = parseInt(req.params.id);
      const updated = await storage.updateWorkCategory(id, { isActive: false });
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/timeclock/current", async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
      const session2 = await storage.getOpenTimeClockSession(req.session.userId);
      if (!session2?.id) return res.json(null);
      const clockInMs = new Date(session2.clockInAt).getTime();
      const ageHours = (Date.now() - clockInMs) / 36e5;
      if (ageHours > MAX_TIME_ENTRY_HOURS2) {
        try {
          const result = await storage.closeOpenTimeClockSessionAndCreateEntry(req.session.userId, { clockOutAt: /* @__PURE__ */ new Date(), tzOffsetMinutes: Number(session2.tzOffsetMinutes || 0) });
          return res.json(result?.session ? null : session2);
        } catch {
          return res.json(session2);
        }
      }
      res.json(session2);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/timeclock/auto-start", async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
      const { clientNow, tzOffsetMinutes } = req.body || {};
      if (typeof clientNow !== "string" || typeof tzOffsetMinutes !== "number") {
        return res.status(400).json({ message: "clientNow and tzOffsetMinutes are required" });
      }
      const clockInAt = new Date(clientNow);
      if (Number.isNaN(clockInAt.getTime())) return res.status(400).json({ message: "Invalid clientNow" });
      const open = await storage.getOpenTimeClockSession(req.session.userId);
      if (open) return res.json(open);
      const user = await storage.getUserById(req.session.userId);
      const employee = user?.firstName || user?.lastName ? `${user?.firstName || ""} ${user?.lastName || ""}`.trim() : user?.email || "Employee";
      try {
        const created = await storage.createTimeClockSession({
          userId: req.session.userId,
          employee,
          task: "General",
          clockInAt,
          tzOffsetMinutes,
          autoStarted: true
        });
        return res.status(201).json(created);
      } catch (e) {
        const existing = await storage.getOpenTimeClockSession(req.session.userId);
        if (existing) return res.json(existing);
        throw e;
      }
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/timeclock/auto-stop", async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
      const { clientNow, tzOffsetMinutes } = req.body || {};
      if (typeof clientNow !== "string" || typeof tzOffsetMinutes !== "number") {
        return res.status(400).json({ message: "clientNow and tzOffsetMinutes are required" });
      }
      const clockOutAt = new Date(clientNow);
      if (Number.isNaN(clockOutAt.getTime())) return res.status(400).json({ message: "Invalid clientNow" });
      const result = await storage.closeOpenTimeClockSessionAndCreateEntry(req.session.userId, { clockOutAt, tzOffsetMinutes });
      if (!result) return res.json({ stopped: false });
      res.json({ stopped: true, entry: result.entry });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.patch("/api/timeclock/current", async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
      const { task } = req.body || {};
      if (typeof task !== "string" || !task.trim()) return res.status(400).json({ message: "task is required" });
      const updated = await storage.updateOpenTimeClockSession(req.session.userId, { task: task.trim() });
      if (!updated) return res.status(404).json({ message: "No active session" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/timesheet", async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
      const sessionUser = await storage.getUserById(req.session.userId);
      const manager = isManagerUser(sessionUser);
      const from = typeof req.query.from === "string" ? req.query.from : void 0;
      const to = typeof req.query.to === "string" ? req.query.to : void 0;
      const userId = typeof req.query.userId === "string" ? parseInt(req.query.userId) : void 0;
      const { limit, offset } = parseLimitOffset(req.query);
      const effectiveUserId = manager ? userId : req.session.userId;
      const entries = await storage.getTimesheetEntriesFiltered({ userId: effectiveUserId, from, to, limit, offset });
      res.json(entries);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/users/:userId/timesheet", async (req, res) => {
    try {
      const { limit, offset } = parseLimitOffset(req.query);
      const entries = await storage.getTimesheetEntries(parseInt(req.params.userId), limit, offset);
      res.json(entries);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/timesheet/:id", async (req, res) => {
    try {
      const entry = await storage.getTimesheetEntryById(parseInt(req.params.id));
      if (!entry) return res.status(404).json({ message: "Entry not found" });
      res.json(entry);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/users/:userId/timesheet", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const targetUserId = parseInt(req.params.userId);
      if (!Number.isFinite(targetUserId)) return res.status(400).json({ message: "Invalid userId" });
      if (!isManagerUser(user) && user.id !== targetUserId) return res.status(403).json({ message: "Forbidden" });
      const raw = { ...req.body || {}, userId: targetUserId };
      const validated = insertTimesheetEntrySchema.parse(raw);
      const computed = computeManualTimeEntry({ date: validated.date, startTime: validated.startTime, endTime: validated.endTime });
      if (!computed.ok) return res.status(400).json({ message: computed.error });
      const entry = await storage.createTimesheetEntry({
        ...validated,
        hours: computed.hours.toFixed(2),
        status: computed.status,
        payableHours: computed.payableHours === null ? null : Number(computed.payableHours.toFixed(2)),
        anomalyFlags: computed.flags.length ? computed.flags : null,
        approvedByUserId: null,
        approvedAt: null,
        paidAt: null
      });
      res.status(201).json(entry);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/timesheet/:id", async (req, res) => {
    try {
      const partial = insertTimesheetEntrySchema.partial().parse(req.body);
      const entry = await storage.updateTimesheetEntry(parseInt(req.params.id), partial);
      res.json(entry);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/timesheet/:id", async (req, res) => {
    try {
      await storage.deleteTimesheetEntry(parseInt(req.params.id));
      res.json({ message: "Entry deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/timesheet/:id/submit", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const id = parseInt(req.params.id);
      const entry = await storage.getTimesheetEntryById(id);
      if (!entry) return res.status(404).json({ message: "Entry not found" });
      if (!isManagerUser(user) && Number(entry.userId) !== user.id) return res.status(403).json({ message: "Forbidden" });
      const updated = await storage.updateTimesheetEntry(id, { status: "submitted" });
      await storage.createApprovalEvent({ entityType: "timesheet_entry", entityId: id, action: "submitted", byUserId: user.id });
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/timesheet/:id/approve", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!isManagerUser(user)) return res.status(403).json({ message: "Forbidden" });
      const id = parseInt(req.params.id);
      const updated = await storage.updateTimesheetEntry(id, { status: "approved", approvedByUserId: user.id, approvedAt: /* @__PURE__ */ new Date() });
      await storage.createApprovalEvent({ entityType: "timesheet_entry", entityId: id, action: "approved", byUserId: user.id });
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/timesheet/:id/dispute", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!isManagerUser(user)) return res.status(403).json({ message: "Forbidden" });
      const id = parseInt(req.params.id);
      const { reason } = req.body || {};
      const updated = await storage.updateTimesheetEntry(id, { status: "disputed", anomalyFlags: ["manager_disputed"], payableHours: 0 });
      await storage.createApprovalEvent({ entityType: "timesheet_entry", entityId: id, action: "disputed", byUserId: user.id, notes: typeof reason === "string" ? reason : null });
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/timesheet/:id/mark-paid", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!isManagerUser(user)) return res.status(403).json({ message: "Forbidden" });
      const id = parseInt(req.params.id);
      const updated = await storage.updateTimesheetEntry(id, { status: "paid", paidAt: /* @__PURE__ */ new Date() });
      await storage.createApprovalEvent({ entityType: "timesheet_entry", entityId: id, action: "paid", byUserId: user.id });
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/approvals/timesheet", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!isManagerUser(user)) return res.status(403).json({ message: "Forbidden" });
      const from = typeof req.query.from === "string" ? req.query.from : void 0;
      const to = typeof req.query.to === "string" ? req.query.to : void 0;
      if (!from || !to) return res.status(400).json({ message: "from and to are required" });
      const statuses = typeof req.query.status === "string" && req.query.status.trim() ? req.query.status.split(",").map((s) => s.trim()).filter(Boolean) : ["submitted", "disputed"];
      const rows = await storage.getTimesheetEntriesFiltered({ from, to, limit: 500, offset: 0 });
      res.json(rows.filter((r) => statuses.includes(String(r.status || "draft"))));
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/payroll/summary", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!isManagerUser(user)) return res.status(403).json({ message: "Forbidden" });
      const from = typeof req.query.from === "string" ? req.query.from : void 0;
      const to = typeof req.query.to === "string" ? req.query.to : void 0;
      if (!from || !to) return res.status(400).json({ message: "from and to are required" });
      const userId = typeof req.query.userId === "string" ? parseInt(req.query.userId) : void 0;
      const summary = await storage.getPayrollSummary({ from, to, userId });
      res.json(summary);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/worker-profiles", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!isManagerUser(user)) return res.status(403).json({ message: "Forbidden" });
      const usersRows = await storage.getUsers(500, 0);
      const profiles = await storage.listWorkerProfiles();
      const byUserId = /* @__PURE__ */ new Map();
      for (const p of profiles) byUserId.set(Number(p.userId), p);
      res.json(usersRows.map((u) => ({ user: u, profile: byUserId.get(Number(u.id)) || null })));
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/worker-profiles/:userId", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!isManagerUser(user)) return res.status(403).json({ message: "Forbidden" });
      const targetUserId = parseInt(req.params.userId);
      if (!Number.isFinite(targetUserId)) return res.status(400).json({ message: "Invalid userId" });
      const patch = insertWorkerProfileSchema.partial().parse(req.body);
      const upserted = await storage.upsertWorkerProfile(targetUserId, patch);
      res.json(upserted);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/category-rate-overrides", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!isManagerUser(user)) return res.status(403).json({ message: "Forbidden" });
      const userId = typeof req.query.userId === "string" ? parseInt(req.query.userId) : void 0;
      if (!userId) return res.status(400).json({ message: "userId is required" });
      const rows = await storage.getCategoryRateOverridesByUser(userId);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/category-rate-overrides/:userId/:categoryId", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!isManagerUser(user)) return res.status(403).json({ message: "Forbidden" });
      const userId = parseInt(req.params.userId);
      const categoryId = parseInt(req.params.categoryId);
      if (!userId || !categoryId) return res.status(400).json({ message: "Invalid userId/categoryId" });
      const patch = insertCategoryRateOverrideSchema.partial().parse(req.body);
      const upserted = await storage.upsertCategoryRateOverride(userId, categoryId, patch);
      res.json(upserted);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/category-rate-overrides/:userId/:categoryId", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!isManagerUser(user)) return res.status(403).json({ message: "Forbidden" });
      const userId = parseInt(req.params.userId);
      const categoryId = parseInt(req.params.categoryId);
      if (!userId || !categoryId) return res.status(400).json({ message: "Invalid userId/categoryId" });
      await storage.deleteCategoryRateOverride(userId, categoryId);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/commissions/events", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!isManagerUser(user)) return res.status(403).json({ message: "Forbidden" });
      const from = typeof req.query.from === "string" ? new Date(req.query.from) : void 0;
      const to = typeof req.query.to === "string" ? new Date(req.query.to) : void 0;
      const sourceType = typeof req.query.sourceType === "string" ? req.query.sourceType : void 0;
      const sourceId = typeof req.query.sourceId === "string" ? parseInt(req.query.sourceId) : void 0;
      const { limit, offset } = parseLimitOffset(req.query);
      const events = await storage.listCommissionEvents({ from, to, sourceType, sourceId, limit, offset });
      res.json(events);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/commissions/participants", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!isManagerUser(user)) return res.status(403).json({ message: "Forbidden" });
      const sourceType = typeof req.query.sourceType === "string" ? req.query.sourceType : "";
      const sourceId = typeof req.query.sourceId === "string" ? parseInt(req.query.sourceId) : NaN;
      if (!sourceType || !Number.isFinite(sourceId)) return res.status(400).json({ message: "sourceType and sourceId are required" });
      const rows = await storage.listDealParticipants({ sourceType, sourceId });
      res.json(rows);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/commissions/participants", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!isManagerUser(user)) return res.status(403).json({ message: "Forbidden" });
      const validated = insertDealParticipantSchema.parse(req.body);
      const row = await storage.upsertDealParticipant(validated);
      res.status(201).json(row);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/commissions/participants/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!isManagerUser(user)) return res.status(403).json({ message: "Forbidden" });
      await storage.deleteDealParticipant(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/commissions/ledger", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!isManagerUser(user)) return res.status(403).json({ message: "Forbidden" });
      const userId = typeof req.query.userId === "string" ? parseInt(req.query.userId) : void 0;
      const status = typeof req.query.status === "string" ? req.query.status : void 0;
      const eventId = typeof req.query.eventId === "string" ? parseInt(req.query.eventId) : void 0;
      const { limit, offset } = parseLimitOffset(req.query);
      const rows = await storage.listCommissionLedgerEntries({ userId, status, eventId, limit, offset });
      res.json(rows);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/commissions/ledger/:id/approve", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!isManagerUser(user)) return res.status(403).json({ message: "Forbidden" });
      const id = parseInt(req.params.id);
      const updated = await storage.updateCommissionLedgerEntry(id, { status: "approved", approvedByUserId: user.id, approvedAt: /* @__PURE__ */ new Date() });
      await storage.createApprovalEvent({ entityType: "commission_ledger_entry", entityId: id, action: "approved", byUserId: user.id });
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/commissions/ledger/:id/dispute", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!isManagerUser(user)) return res.status(403).json({ message: "Forbidden" });
      const id = parseInt(req.params.id);
      const { reason } = req.body || {};
      const updated = await storage.updateCommissionLedgerEntry(id, { status: "disputed", disputedReason: typeof reason === "string" ? reason : null });
      await storage.createApprovalEvent({ entityType: "commission_ledger_entry", entityId: id, action: "disputed", byUserId: user.id, notes: typeof reason === "string" ? reason : null });
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/commissions/ledger/:id/mark-paid", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!isManagerUser(user)) return res.status(403).json({ message: "Forbidden" });
      const id = parseInt(req.params.id);
      const updated = await storage.updateCommissionLedgerEntry(id, { status: "paid", paidAt: /* @__PURE__ */ new Date() });
      await storage.createApprovalEvent({ entityType: "commission_ledger_entry", entityId: id, action: "paid", byUserId: user.id });
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/buyers", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { limit, offset } = parseLimitOffset(req.query);
      const buyers2 = await storage.getBuyers(limit, offset);
      res.json(buyers2);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/buyers/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const buyer = await storage.getBuyerById(parseInt(req.params.id));
      if (!buyer) return res.status(404).json({ message: "Buyer not found" });
      res.json(buyer);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/buyers", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const validated = insertBuyerSchema.parse({ ...req.body, userId: user.id });
      const buyer = await storage.createBuyer(validated);
      res.status(201).json(buyer);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/buyers/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const partial = insertBuyerSchema.partial().parse(req.body);
      if (Object.prototype.hasOwnProperty.call(partial, "userId")) {
        delete partial.userId;
      }
      const buyer = await storage.updateBuyer(parseInt(req.params.id), partial);
      res.json(buyer);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/buyers/:id", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      await storage.deleteBuyer(parseInt(req.params.id));
      res.json({ message: "Buyer deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/buyers/:buyerId/communications", async (req, res) => {
    try {
      const { limit, offset } = parseLimitOffset(req.query);
      const comms = await storage.getBuyerCommunications(parseInt(req.params.buyerId), limit, offset);
      res.json(comms);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/buyers/:buyerId/communications", async (req, res) => {
    try {
      const validated = insertBuyerCommunicationSchema.parse({
        ...req.body,
        buyerId: parseInt(req.params.buyerId)
      });
      const comm = await storage.createBuyerCommunication(validated);
      res.status(201).json(comm);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/buyer-communications/:id", async (req, res) => {
    try {
      await storage.deleteBuyerCommunication(parseInt(req.params.id));
      res.json({ message: "Communication deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/deal-assignments", async (req, res) => {
    try {
      const { limit, offset } = parseLimitOffset(req.query);
      const assignments = await storage.getDealAssignments(limit, offset);
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/deal-assignments/:id", async (req, res) => {
    try {
      const assignment = await storage.getDealAssignmentById(parseInt(req.params.id));
      if (!assignment) return res.status(404).json({ message: "Assignment not found" });
      res.json(assignment);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/properties/:propertyId/assignments", async (req, res) => {
    try {
      const { limit, offset } = parseLimitOffset(req.query);
      const assignments = await storage.getDealAssignmentsByPropertyId(parseInt(req.params.propertyId), limit, offset);
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/buyers/:buyerId/assignments", async (req, res) => {
    try {
      const { limit, offset } = parseLimitOffset(req.query);
      const assignments = await storage.getDealAssignmentsByBuyerId(parseInt(req.params.buyerId), limit, offset);
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/deal-assignments", async (req, res) => {
    try {
      const validated = insertDealAssignmentSchema.parse(req.body);
      const assignment = await storage.createDealAssignment(validated);
      try {
        await syncCommissionEventsForDealAssignment(assignment);
      } catch {
      }
      res.status(201).json(assignment);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/deal-assignments/:id", async (req, res) => {
    try {
      const partial = insertDealAssignmentSchema.partial().parse(req.body);
      const assignment = await storage.updateDealAssignment(parseInt(req.params.id), partial);
      try {
        await syncCommissionEventsForDealAssignment(assignment);
      } catch {
      }
      res.json(assignment);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/deal-assignments/:id", async (req, res) => {
    try {
      await storage.deleteDealAssignment(parseInt(req.params.id));
      res.json({ message: "Assignment deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/reports/source", async (req, res) => {
    try {
      const user = await requireAuth(req, res);
      if (!user) return;
      const fromRaw = typeof req.query.from === "string" ? req.query.from : "";
      const toRaw = typeof req.query.to === "string" ? req.query.to : "";
      const from = fromRaw ? new Date(fromRaw) : null;
      const to = toRaw ? new Date(toRaw) : null;
      const fromOk = from && Number.isFinite(from.getTime()) ? from : null;
      const toOk = to && Number.isFinite(to.getTime()) ? to : null;
      const leadWhere = sql4`WHERE ${fromOk ? sql4`created_at >= ${fromOk}` : sql4`TRUE`} AND ${toOk ? sql4`created_at < ${toOk}` : sql4`TRUE`}`;
      const oppWhere = sql4`WHERE ${fromOk ? sql4`p.created_at >= ${fromOk}` : sql4`TRUE`} AND ${toOk ? sql4`p.created_at < ${toOk}` : sql4`TRUE`}`;
      const dealWhere = sql4`WHERE ${fromOk ? sql4`da.created_at >= ${fromOk}` : sql4`TRUE`} AND ${toOk ? sql4`da.created_at < ${toOk}` : sql4`TRUE`}`;
      const leadsRows = await db.execute(sql4`
        SELECT
          COALESCE(NULLIF(TRIM(source), ''), 'Unknown') AS source,
          COUNT(*)::int AS leads
        FROM leads
        ${leadWhere}
        GROUP BY 1
      `);
      const oppRows = await db.execute(sql4`
        SELECT
          COALESCE(NULLIF(TRIM(COALESCE(p.lead_source, l.source)), ''), 'Unknown') AS source,
          COUNT(*)::int AS opportunities
        FROM properties p
        LEFT JOIN leads l ON l.id = p.source_lead_id
        ${oppWhere}
        GROUP BY 1
      `);
      const dealRows = await db.execute(sql4`
        SELECT
          COALESCE(NULLIF(TRIM(COALESCE(p.lead_source, l.source)), ''), 'Unknown') AS source,
          COUNT(*)::int AS deals,
          COALESCE(SUM(COALESCE(da.payout_amount, '0')::numeric), 0)::numeric AS revenue
        FROM deal_assignments da
        JOIN properties p ON p.id = da.property_id
        LEFT JOIN leads l ON l.id = p.source_lead_id
        ${dealWhere}
        GROUP BY 1
      `);
      const merged = /* @__PURE__ */ new Map();
      for (const r of leadsRows.rows || []) {
        merged.set(String(r.source), { source: String(r.source), leads: r.leads || 0, opportunities: 0, deals: 0, revenue: 0 });
      }
      for (const r of oppRows.rows || []) {
        const key = String(r.source);
        const cur = merged.get(key) || { source: key, leads: 0, opportunities: 0, deals: 0, revenue: 0 };
        cur.opportunities = r.opportunities || 0;
        merged.set(key, cur);
      }
      for (const r of dealRows.rows || []) {
        const key = String(r.source);
        const cur = merged.get(key) || { source: key, leads: 0, opportunities: 0, deals: 0, revenue: 0 };
        cur.deals = r.deals || 0;
        cur.revenue = typeof r.revenue === "string" || typeof r.revenue === "number" ? Number(r.revenue) : 0;
        merged.set(key, cur);
      }
      const sources = Array.from(merged.values()).sort((a, b) => (b.revenue || 0) - (a.revenue || 0) || (b.deals || 0) - (a.deals || 0) || (b.leads || 0) - (a.leads || 0));
      res.json({ from: fromRaw || null, to: toRaw || null, sources });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/public/listings/:token", async (req, res) => {
    try {
      const token = String(req.params.token || "").trim();
      if (!token) return res.status(404).json({ message: "Not found" });
      const listing = await storage.getPublicListingByToken(token);
      if (!listing) return res.status(404).json({ message: "Not found" });
      if (listing.status !== "published") return res.status(404).json({ message: "Not found" });
      if (listing.expiresAt && new Date(listing.expiresAt).getTime() < Date.now()) return res.status(410).json({ message: "Listing expired" });
      if (listing.passwordHash && String(req.query.pw || "").trim() !== "") {
        return res.json({ requiresPassword: true, listing: { id: listing.id, title: listing.title, description: listing.description } });
      }
      const property = await storage.getPropertyById(listing.opportunityId);
      if (!property) return res.status(404).json({ message: "Not found" });
      await storage.incrementListingViews(listing.id);
      const showAddress = Boolean(listing.exposeAddress);
      const showFinancials = Boolean(listing.exposeFinancials);
      res.json({
        listing: {
          id: listing.id,
          title: listing.title || `${property.address}, ${property.city}, ${property.state} ${property.zipCode}`,
          description: listing.description,
          slug: listing.slug,
          visibility: listing.visibility,
          viewCount: listing.viewCount,
          publishedAt: listing.publishedAt,
          exposeAddress: listing.exposeAddress,
          exposeComps: listing.exposeComps,
          exposeFinancials: listing.exposeFinancials,
          exposeDocs: listing.exposeDocs,
          contactName: listing.contactName,
          contactEmail: listing.contactEmail,
          contactPhone: listing.contactPhone
        },
        property: {
          ...showAddress ? {
            address: property.address,
            city: property.city,
            state: property.state,
            zipCode: property.zipCode,
            latitude: property.latitude,
            longitude: property.longitude
          } : { city: property.city, state: property.state },
          beds: property.beds,
          baths: property.baths,
          sqft: property.sqft,
          yearBuilt: property.yearBuilt,
          propertyType: property.propertyType,
          lotSize: property.lotSize,
          occupancy: property.occupancy,
          images: resolvePropertyImages(property.images || []),
          ...showFinancials ? {
            price: property.price,
            arv: property.arv,
            repairCost: property.repairCost,
            askingPrice: property.askingPrice,
            targetDispositionPrice: property.targetDispositionPrice,
            internalSummary: property.internalSummary
          } : {}
        }
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/listings/:token/inquiries", async (req, res) => {
    try {
      const token = String(req.params.token || "").trim();
      if (!token) return res.status(404).json({ message: "Not found" });
      const listing = await storage.getPublicListingByToken(token);
      if (!listing) return res.status(404).json({ message: "Not found" });
      if (listing.status !== "published") return res.status(404).json({ message: "Not found" });
      if (listing.passwordHash) {
        const providedPw = String(req.body?._password || "").trim();
        if (providedPw !== listing.passwordHash) {
          return res.status(401).json({ message: "Password required" });
        }
      }
      if (listing.expiresAt && new Date(listing.expiresAt).getTime() < Date.now()) return res.status(410).json({ message: "Listing expired" });
      const clientIp = String(req.ip || req.socket?.remoteAddress || req.headers["x-forwarded-for"] || "").split(",")[0];
      if (!checkInquiryRateLimit(clientIp)) {
        return res.status(429).json({ message: "Too many inquiries. Please try again later." });
      }
      const body = req.body || {};
      const name = String(body.name || "").trim().slice(0, 255);
      const email = String(body.email || "").trim().slice(0, 255);
      const phone = String(body.phone || "").trim().slice(0, 20);
      const company = String(body.company || "").trim().slice(0, 255);
      const buyerType = String(body.buyerType || "").trim().slice(0, 50);
      const message = String(body.message || "").trim().slice(0, 5e3);
      const offerAmount = body.offerAmount ? Number(body.offerAmount) : null;
      const pofUrl = body.proofOfFundsUrl ? String(body.proofOfFundsUrl).trim().slice(0, 500) : null;
      if (!name || name.length < 2) return res.status(400).json({ message: "Name is required (min 2 characters)" });
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Invalid email" });
      const inquiry = await storage.createBuyerInquiry({
        listingId: listing.id,
        opportunityId: listing.opportunityId,
        name,
        email: email || null,
        phone: phone || null,
        company: company || null,
        buyerType: buyerType || null,
        message: message || null,
        offerAmount: offerAmount !== null && !Number.isNaN(offerAmount) ? String(offerAmount) : null,
        proofOfFundsUrl: pofUrl,
        status: "new",
        ip: req.ip || null,
        userAgent: String(req.headers["user-agent"] || "")
      });
      await storage.updateProperty(listing.opportunityId, { lastActivityAt: /* @__PURE__ */ new Date() });
      await logOpportunityEvent(listing.opportunityId, "inquiry_received", "New buyer inquiry received", `${inquiry.name} submitted an inquiry${offerAmount ? ` with offer $${Number(offerAmount).toLocaleString()}` : ""}`, void 0, "buyer", { inquiryId: inquiry.id, offerAmount: offerAmount ? String(offerAmount) : null });
      try {
        const property = await storage.getPropertyById(listing.opportunityId);
        const ownerId = property?.assignedTo;
        if (ownerId) {
          await storage.createUserNotification({
            userId: ownerId,
            type: "opportunity_inquiry",
            title: "New buyer inquiry on your listing",
            message: `${inquiry.name} submitted an inquiry for ${property?.address || "your property"}.`,
            linkUrl: `/opportunities/${listing.opportunityId}/inquiry/${inquiry.id}`,
            metadata: JSON.stringify({ inquiryId: inquiry.id, listingId: listing.id, opportunityId: listing.opportunityId })
          });
        }
      } catch {
      }
      try {
        const property = await storage.getPropertyById(listing.opportunityId);
        const ownerId = property?.assignedTo;
        if (ownerId) {
          await createTask({
            relatedEntityType: "opportunity",
            relatedEntityId: listing.opportunityId,
            assignedToUserId: Number(ownerId),
            title: `Follow up: Buyer inquiry from ${inquiry.name}`,
            description: `New inquiry on public listing. Offer: $${offerAmount ? Number(offerAmount).toLocaleString() : "N/A"}`,
            type: "followup",
            priority: "high",
            dueAt: new Date(Date.now() + 24 * 60 * 60 * 1e3),
            createdBy: Number(ownerId)
          });
        }
      } catch {
      }
      res.status(201).json({ inquiryId: inquiry.id, message: "Inquiry submitted successfully" });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/listings/:token/offer", async (req, res) => {
    try {
      const token = String(req.params.token || "").trim();
      if (!token) return res.status(404).json({ message: "Not found" });
      const listing = await storage.getPublicListingByToken(token);
      if (!listing) return res.status(404).json({ message: "Not found" });
      if (listing.status !== "published") return res.status(404).json({ message: "Not found" });
      const body = req.body || {};
      const name = String(body.name || "").trim().slice(0, 255);
      const email = String(body.email || "").trim().slice(0, 255);
      const phone = String(body.phone || "").trim().slice(0, 20);
      const offerAmount = body.offerAmount ? Number(body.offerAmount) : null;
      const terms = String(body.terms || "").trim().slice(0, 500);
      const closingDateTarget = body.closingDateTarget ? new Date(body.closingDateTarget) : null;
      const pofUrl = body.proofOfFundsUrl ? String(body.proofOfFundsUrl).trim().slice(0, 500) : null;
      if (!name || name.length < 2) return res.status(400).json({ message: "Name is required" });
      if (!offerAmount || Number.isNaN(offerAmount)) return res.status(400).json({ message: "Valid offer amount is required" });
      const inquiry = await storage.createBuyerInquiry({
        listingId: listing.id,
        opportunityId: listing.opportunityId,
        name,
        email: email || null,
        phone: phone || null,
        buyerType: "individual",
        message: terms || null,
        offerAmount: String(offerAmount),
        proofOfFundsUrl: pofUrl,
        status: "new",
        ip: req.ip || null,
        userAgent: String(req.headers["user-agent"] || "")
      });
      try {
        const property = await storage.getPropertyById(listing.opportunityId);
        const ownerId = property?.assignedTo;
        if (ownerId) {
          await storage.createUserNotification?.({
            userId: ownerId,
            type: "buyer_offer",
            title: "New offer received!",
            message: `${inquiry.name} submitted an offer of $${Number(offerAmount).toLocaleString()}`,
            linkUrl: `/opportunities/${listing.opportunityId}/inquiry/${inquiry.id}`,
            metadata: JSON.stringify({ inquiryId: inquiry.id, offerAmount: String(offerAmount), listingId: listing.id })
          });
        }
      } catch {
      }
      res.status(201).json({ inquiryId: inquiry.id, message: "Offer submitted successfully" });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/public/listings/:token/view", async (req, res) => {
    const token = String(req.params.token || "").trim();
    if (!token) return res.status(404).json({ message: "Not found" });
    const listing = await storage.getPublicListingByToken(token);
    if (!listing) return res.status(404).json({ message: "Not found" });
    if (listing.status !== "published") return res.status(404).json({ message: "Not found" });
    res.json({ listingId: listing.id, slug: listing.slug });
  });
  if (mode === "serverless") return null;
  const httpServer = createServer(app2);
  initTelephonyWs(httpServer);
  return httpServer;
}

// server/sentry.ts
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    integrations: [nodeProfilingIntegration()]
  });
}

// server/app.ts
import crypto11 from "node:crypto";

// server/metrics.ts
import client from "prom-client";
var register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: "fp_" });
var httpRequestsTotal = new client.Counter({
  name: "fp_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "path", "status"],
  registers: [register]
});
var httpErrorsTotal = new client.Counter({
  name: "fp_http_errors_total",
  help: "Total number of HTTP 5xx errors",
  labelNames: ["path", "status"],
  registers: [register]
});

// server/cron/campaign-scheduler.ts
init_db();
import { sql as sql5 } from "drizzle-orm";

// server/cron/rvm-poller.ts
init_db();
import { sql as sql6 } from "drizzle-orm";

// server/cron/task-reminders.ts
init_db();
import { sql as sql7 } from "drizzle-orm";

// server/app.ts
function log2(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
var app = express();
log2(`[Startup] Server initializing... (Commit: 90e785a)`);
initSentry();
app.disable("x-powered-by");
if (!globalThis.__stackk_process_handlers_installed) {
  globalThis.__stackk_process_handlers_installed = true;
  process.on("unhandledRejection", (reason) => {
    console.error(JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), event: "process", kind: "unhandledRejection", message: String(reason?.message || reason) }));
  });
  process.on("uncaughtException", (err) => {
    console.error(JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), event: "process", kind: "uncaughtException", message: String(err?.message || err), code: err?.code ? String(err.code) : null }));
  });
}
app.use(helmet({
  contentSecurityPolicy: false
  // Disabled for simplicity with Vite dev server scripts
}));
if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  console.error("SESSION_SECRET environment variable is required in production");
}
var sessionSecret = process.env.SESSION_SECRET || (process.env.NODE_ENV === "development" ? "luxe-rm-development-secret-DO-NOT-USE-IN-PRODUCTION" : "");
if (!sessionSecret) {
  console.error("SESSION_SECRET must be set");
}
if (process.env.NODE_ENV === "production" && !process.env.EMPLOYEE_ACCESS_CODE) {
  console.error("EMPLOYEE_ACCESS_CODE environment variable is required in production");
}
var PgSession = connectPgSimple(session);
function installErrorHandling(target) {
  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(target);
  }
  target.use((err, req, res, _next) => {
    const rawMessage = String(err?.message || "Internal Server Error");
    const quotaExceeded = /exceeded the .*quota/i.test(rawMessage) || String(err?.code || "") === "XX000";
    const status = quotaExceeded ? 503 : err.status || err.statusCode || 500;
    const message = quotaExceeded ? "Database is over quota" : rawMessage;
    const requestId = res.locals.requestId || req.headers["x-request-id"] || null;
    if (process.env.NODE_ENV === "production") {
      console.error(
        JSON.stringify({
          ts: (/* @__PURE__ */ new Date()).toISOString(),
          event: "http_error",
          requestId,
          method: req.method,
          path: req.path,
          message: String(message),
          code: err?.code ? String(err.code) : null,
          status
        })
      );
    } else {
      console.error(err);
    }
    const clientMessage = process.env.NODE_ENV === "production" && status >= 500 && !quotaExceeded ? "Internal Server Error" : message;
    const payload = { message: clientMessage, requestId };
    if (quotaExceeded) payload.code = "DB_QUOTA_EXCEEDED";
    res.status(status).json(payload);
  });
}
app.set("trust proxy", 1);
var hasDatabaseUrl = Boolean(databaseUrl() && String(databaseUrl()).trim());
app.use(express.json({
  limit: "10mb",
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const requestId = req.headers["x-request-id"] || crypto11.randomUUID();
  res.locals.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
});
if (!sessionSecret) {
  app.use("/api", (_req, res) => {
    const missing = getSessionSecretMissing();
    return sendAuthError(res, 503, { code: "session_secret_missing", message: "Server authentication is not configured", missing: missing.length ? missing : void 0 });
  });
  app.use((_req, _res, next) => {
    next(new Error("SESSION_SECRET is required"));
  });
} else if (process.env.NODE_ENV === "production" && !hasDatabaseUrl) {
  app.use("/api", (_req, res) => {
    const missing = getDatabaseUrlMissing();
    res.status(503).json({
      message: "Server database is not configured",
      kind: "db_unavailable",
      missing,
      code: "db_not_configured",
      requestId: getRequestIdFromRes(res),
      howToFix: schemaFixInstructions()
    });
  });
  app.use((_req, _res, next) => {
    next(new Error("DATABASE_URL is required in production"));
  });
} else {
  app.use("/api", (req, res, next) => {
    if (req.path === "/auth" || req.path.startsWith("/auth/") || req.path.startsWith("/api/auth/")) return next();
    getSchemaReadiness().then((r) => {
      if (r.ok) return next();
      const requestId = getRequestIdFromRes(res);
      const code = r.kind === "db_unavailable" ? "db_unavailable" : "schema_not_ready";
      res.status(503).json({
        message: r.message,
        kind: r.kind,
        missing: r.missing,
        code,
        requestId,
        howToFix: schemaFixInstructions()
      });
    }).catch(next);
  });
  const store = hasDatabaseUrl ? new PgSession({
    pool,
    tableName: "session",
    createTableIfMissing: false,
    disableTouch: true
  }) : void 0;
  app.use(
    "/api",
    session({
      store,
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        domain: process.env.NODE_ENV === "production" && String(process.env.COOKIE_DOMAIN || "").trim() ? String(process.env.COOKIE_DOMAIN).trim() : void 0,
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 1e3 * 60 * 60 * 24 * 7,
        sameSite: "lax"
      }
    })
  );
  if (process.env.DEBUG_ENDPOINTS === "1") {
    app.get("/api/debug/config", (_req, res) => {
      const cookieDomain = process.env.NODE_ENV === "production" && String(process.env.COOKIE_DOMAIN || "").trim() ? String(process.env.COOKIE_DOMAIN).trim() : null;
      res.json({
        hasSessionSecret: Boolean(sessionSecret && String(sessionSecret).trim()),
        hasDatabaseUrl,
        hasEmployeeAccessCode: Boolean(
          process.env.EMPLOYEE_ACCESS_CODE && String(process.env.EMPLOYEE_ACCESS_CODE).trim()
        ),
        cookieDomain,
        env: process.env.NODE_ENV || "development"
      });
    });
    app.get("/api/debug/session", (req, res) => {
      const cookieHeader = String(req.headers.cookie || "");
      res.json({
        host: req.hostname,
        path: req.path,
        cookieHeaderPresent: Boolean(cookieHeader),
        sessionID: req.sessionID || null,
        hasSession: Boolean(req.session),
        sessionKeys: req.session ? Object.keys(req.session) : []
      });
    });
  }
}
app.use((req, res, next) => {
  const start = Date.now();
  const path3 = req.path;
  const requestId = res.locals.requestId || req.headers["x-request-id"] || crypto11.randomUUID();
  res.locals.requestId = requestId;
  if (!res.getHeader("x-request-id")) res.setHeader("x-request-id", requestId);
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path3.startsWith("/api")) {
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms id=${requestId}`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log2(logLine);
      httpRequestsTotal.labels(req.method, path3, String(res.statusCode)).inc();
      if (res.statusCode >= 500) {
        httpErrorsTotal.labels(path3, String(res.statusCode)).inc();
      }
    }
  });
  next();
});

// api/index.ts
var ready = false;
async function handler(req, res) {
  if (!ready) {
    try {
      await registerRoutes(app, { mode: "serverless" });
      installErrorHandling(app);
      ready = true;
    } catch (err) {
      console.error("[api/index] Failed to initialize:", err?.message || err);
      if (!res.headersSent) {
        res.status(500).json({ message: "Server initialization failed", detail: String(err?.message || err) });
      }
      return;
    }
  }
  app(req, res);
}
export {
  handler as default
};
