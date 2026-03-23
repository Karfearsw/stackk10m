import crypto from "node:crypto";
import { pool, databaseUrlResolution } from "./db.js";

type SchemaReadiness =
  | { ok: true; checkedAt: string }
  | {
      ok: false;
      checkedAt: string;
      kind: "db_unavailable" | "schema_missing";
      message: string;
      code: string | null;
      missing: string[];
    };

let cached: { value: SchemaReadiness; expiresAt: number } | null = null;

function nowIso() {
  return new Date().toISOString();
}

function isDbConnectivityError(error: any): boolean {
  const code = error?.code;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ETIMEDOUT") return true;
  if (code === "57P01" || code === "57P02" || code === "57P03") return true;
  if (code === "53300" || code === "08000" || code === "08003" || code === "08006" || code === "08001") return true;
  if (code === "ENETUNREACH" || code === "EHOSTUNREACH") return true;
  return false;
}

function log(level: "info" | "warn" | "error", payload: Record<string, unknown>) {
  const line = JSON.stringify({ ts: nowIso(), event: "schema", ...payload });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

async function checkSchemaOnce(): Promise<SchemaReadiness> {
  const checkedAt = nowIso();
  const missing: string[] = [];
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
        missing,
      };
    }

    const reqId = crypto.randomUUID();
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
      [],
    );
    if (!dncRes?.rows?.length) missing.push("column:leads.do_not_call");

    const dneRes = await pool.query(
      "select 1 as ok from information_schema.columns where table_schema = 'public' and table_name = 'leads' and column_name = 'do_not_email' limit 1",
      [],
    );
    if (!dneRes?.rows?.length) missing.push("column:leads.do_not_email");

    const plsRes = await pool.query(
      "select 1 as ok from information_schema.columns where table_schema = 'public' and table_name = 'properties' and column_name = 'lead_source' limit 1",
      [],
    );
    if (!plsRes?.rows?.length) missing.push("column:properties.lead_source");

    const plsDetailRes = await pool.query(
      "select 1 as ok from information_schema.columns where table_schema = 'public' and table_name = 'properties' and column_name = 'lead_source_detail' limit 1",
      [],
    );
    if (!plsDetailRes?.rows?.length) missing.push("column:properties.lead_source_detail");

    if (missing.length) {
      log("error", { kind: "missing", missing, requestId: reqId });
      return {
        ok: false,
        checkedAt,
        kind: "schema_missing",
        message: "Database schema is not ready",
        code: null,
        missing,
      };
    }
    return { ok: true, checkedAt };
  } catch (e: any) {
    const code = e?.code ? String(e.code) : null;
    const isConn = isDbConnectivityError(e);
    log("error", { kind: "check_failed", message: String(e?.message || e), code, connectivity: isConn });
    return {
      ok: false,
      checkedAt,
      kind: isConn ? "db_unavailable" : "schema_missing",
      message: isConn ? "Database is unavailable" : "Database schema check failed",
      code,
      missing,
    };
  }
}

export async function getSchemaReadiness(): Promise<SchemaReadiness> {
  const ttlMs = 30_000;
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  const value = await checkSchemaOnce();
  cached = { value, expiresAt: now + ttlMs };
  return value;
}

export function schemaFixInstructions() {
  return {
    vercelBuildNote:
      "Vercel builds auto-apply migrations when DB env vars are set (set AUTO_APPLY_MIGRATIONS=false to force-disable).",
    applyMigrations: "npm run migrate",
    applyMigrationsFromRepoRoot: "npm --prefix FrameworkPlanner run migrate",
    drizzlePush: "npm run db:push",
    drizzlePushFromRepoRoot: "npm --prefix FrameworkPlanner run db:push",
  };
}
