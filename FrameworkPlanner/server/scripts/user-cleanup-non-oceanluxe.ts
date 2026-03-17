import dotenv from "dotenv";
import { join } from "node:path";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import crypto from "node:crypto";

dotenv.config({ path: join(process.cwd(), "FrameworkPlanner", ".env") });

type UserRow = Record<string, unknown> & {
  id: number;
  email: string;
  role: string | null;
  is_super_admin: boolean | null;
  is_active: boolean | null;
  created_at: string | Date | null;
};

type FkRef = {
  schema: string;
  table: string;
  column: string;
  onDelete: "no_action" | "restrict" | "cascade" | "set_null" | "set_default";
};

type SnapshotTable = {
  schema: string;
  table: string;
  pkColumns: string[];
  fkColumn?: string;
  onDelete?: FkRef["onDelete"];
  rows: Record<string, unknown>[];
};

type Snapshot = {
  version: 1;
  runId: string;
  domain: string;
  deletedAt: string;
  reassignedToUserId: number;
  user: Record<string, unknown>;
  fkTables: SnapshotTable[];
  manualTables: SnapshotTable[];
  restrictReassignments: {
    table: string;
    idColumn: string;
    affectedIds: number[];
    fromUserId: number;
    toUserId: number;
  }[];
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(v: unknown) {
  return String(v ?? "").trim().toLowerCase();
}

function endsWithDomain(email: string, domain: string) {
  return normalizeEmail(email).endsWith(`@${domain.toLowerCase()}`);
}

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const k = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[k] = true;
    } else {
      args[k] = next;
      i++;
    }
  }
  const domain = String(args["domain"] || "oceanluxe.org").trim();
  const execute = Boolean(args["execute"]);
  const confirmDomain = args["confirm-domain"] ? String(args["confirm-domain"]).trim() : undefined;
  const confirmCount = args["confirm-count"] ? parseInt(String(args["confirm-count"]), 10) : undefined;
  const reassignUserId = args["reassign-user-id"] ? parseInt(String(args["reassign-user-id"]), 10) : undefined;
  const runId = String(args["run-id"] || `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(4).toString("hex")}`);
  const exportDir = String(args["export-dir"] || join(process.cwd(), "FrameworkPlanner", "backups", "user-cleanup", runId));
  const noFiles = Boolean(args["no-files"]);
  return { domain, execute, confirmDomain, confirmCount, reassignUserId, runId, exportDir, noFiles };
}

function quoteIdent(v: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v)) throw new Error(`Invalid identifier: ${v}`);
  return `"${v}"`;
}

function qual(schema: string, table: string) {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`;
}

function mapConfDelType(code: string): FkRef["onDelete"] {
  if (code === "a") return "no_action";
  if (code === "r") return "restrict";
  if (code === "c") return "cascade";
  if (code === "n") return "set_null";
  if (code === "d") return "set_default";
  return "no_action";
}

async function listUserFkRefs(pool: any): Promise<FkRef[]> {
  const r = await pool.query(
    `
    SELECT
      nsp.nspname AS schema,
      rel.relname AS table,
      att.attname AS column,
      con.confdeltype AS confdeltype
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
    JOIN pg_class frel ON frel.oid = con.confrelid
    JOIN pg_namespace fnsp ON fnsp.oid = frel.relnamespace
    WHERE con.contype = 'f'
      AND fnsp.nspname = 'public'
      AND frel.relname = 'users'
      AND nsp.nspname = 'public'
    ORDER BY nsp.nspname, rel.relname, att.attname
  `
  );
  return r.rows.map((x: any) => ({
    schema: String(x.schema),
    table: String(x.table),
    column: String(x.column),
    onDelete: mapConfDelType(String(x.confdeltype)),
  }));
}

async function getPrimaryKeyColumns(pool: any, schema: string, table: string): Promise<string[]> {
  const r = await pool.query(
    `
    SELECT a.attname AS col
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
    WHERE i.indisprimary = true
      AND n.nspname = $1
      AND c.relname = $2
    ORDER BY array_position(i.indkey, a.attnum)
  `,
    [schema, table]
  );
  return r.rows.map((x: any) => String(x.col));
}

async function pickDefaultReassignUserId(pool: any, domain: string): Promise<number | undefined> {
  const r = await pool.query(
    `
    SELECT id
    FROM users
    WHERE is_super_admin = true
      AND lower(trim(email)) LIKE $1
    ORDER BY created_at ASC, id ASC
    LIMIT 1
  `,
    [`%@${domain.toLowerCase()}`]
  );
  const id = r.rows?.[0]?.id;
  if (!id) return undefined;
  return parseInt(String(id), 10);
}

async function writeAuthAuditLog(pool: any, input: { action: string; outcome: string; userId?: number | null; email?: string | null; metadata?: Record<string, unknown> | null }) {
  const metadataText = input.metadata ? JSON.stringify(input.metadata) : null;
  try {
    await pool.query(
      `
      INSERT INTO auth_audit_logs (action, outcome, user_id, email, metadata)
      VALUES ($1, $2, $3, $4, $5)
    `,
      [input.action, input.outcome, input.userId ?? null, input.email ?? null, metadataText]
    );
  } catch {}
}

function ensureDir(p: string) {
  mkdirSync(p, { recursive: true });
}

function formatUserLine(u: any) {
  return `${String(u.id).padStart(6, " ")}  ${String(u.email).padEnd(32, " ")}  ${String(u.role || "").padEnd(10, " ")}  super=${u.is_super_admin ? "1" : "0"}  active=${u.is_active ? "1" : "0"}`;
}

async function loadUsers(pool: any): Promise<UserRow[]> {
  const r = await pool.query(
    `
    SELECT id, email, role, is_super_admin, is_active, created_at
    FROM users
    ORDER BY id ASC
  `
  );
  return r.rows as UserRow[];
}

async function userOwnsTeam(pool: any, userId: number): Promise<boolean> {
  try {
    const r = await pool.query(`SELECT 1 FROM teams WHERE owner_id = $1 LIMIT 1`, [userId]);
    return r.rowCount > 0;
  } catch {
    return false;
  }
}

function isPrivilegedRole(role: unknown) {
  const v = String(role ?? "").trim().toLowerCase();
  return v === "admin" || v === "manager" || v === "owner";
}

async function countFkMatches(pool: any, fk: FkRef, userIds: number[]) {
  const q = `SELECT count(*)::bigint AS c FROM ${qual(fk.schema, fk.table)} WHERE ${quoteIdent(fk.column)} = ANY($1::int[])`;
  const r = await pool.query(q, [userIds]);
  return parseInt(String(r.rows?.[0]?.c ?? "0"), 10);
}

async function selectRowsByFk(pool: any, fk: FkRef, userId: number): Promise<Record<string, unknown>[]> {
  const q = `SELECT * FROM ${qual(fk.schema, fk.table)} WHERE ${quoteIdent(fk.column)} = $1`;
  const r = await pool.query(q, [userId]);
  return r.rows as Record<string, unknown>[];
}

async function selectTableRows(pool: any, schema: string, table: string, whereSql: string, params: unknown[]): Promise<Record<string, unknown>[]> {
  const q = `SELECT * FROM ${qual(schema, table)} WHERE ${whereSql}`;
  const r = await pool.query(q, params);
  return r.rows as Record<string, unknown>[];
}

async function deleteTableRows(client: any, schema: string, table: string, whereSql: string, params: unknown[]) {
  const q = `DELETE FROM ${qual(schema, table)} WHERE ${whereSql}`;
  await client.query(q, params);
}

async function updateTableRows(client: any, schema: string, table: string, setSql: string, whereSql: string, params: unknown[]) {
  const q = `UPDATE ${qual(schema, table)} SET ${setSql} WHERE ${whereSql}`;
  await client.query(q, params);
}

async function deleteUserSessionsBestEffort(pool: any, userId: number) {
  try {
    await pool.query(`DELETE FROM "session" WHERE (sess::jsonb ->> 'userId')::int = $1`, [userId]);
  } catch {}
}

async function buildSnapshot(pool: any, opts: { domain: string; runId: string; userId: number; reassignedToUserId: number; fkRefs: FkRef[] }): Promise<Snapshot> {
  const userRes = await pool.query(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [opts.userId]);
  const user = userRes.rows?.[0];
  if (!user) throw new Error(`User not found: ${opts.userId}`);

  const fkTables: SnapshotTable[] = [];
  for (const fk of opts.fkRefs) {
    const pkColumns = await getPrimaryKeyColumns(pool, fk.schema, fk.table);
    const rows = await selectRowsByFk(pool, fk, opts.userId);
    fkTables.push({
      schema: fk.schema,
      table: fk.table,
      pkColumns,
      fkColumn: fk.column,
      onDelete: fk.onDelete,
      rows,
    });
  }

  const manualTableDefs: { schema: string; table: string; where: string; params: unknown[] }[] = [
    { schema: "public", table: "two_factor_auth", where: `user_id = $1`, params: [opts.userId] },
    { schema: "public", table: "backup_codes", where: `user_id = $1`, params: [opts.userId] },
    { schema: "public", table: "notification_preferences", where: `user_id = $1`, params: [opts.userId] },
    { schema: "public", table: "team_members", where: `user_id = $1`, params: [opts.userId] },
  ];

  const manualTables: SnapshotTable[] = [];
  for (const t of manualTableDefs) {
    const pkColumns = await getPrimaryKeyColumns(pool, t.schema, t.table).catch(() => []);
    const rows = await selectTableRows(pool, t.schema, t.table, t.where, t.params).catch(() => []);
    if (rows.length === 0) continue;
    manualTables.push({ schema: t.schema, table: t.table, pkColumns, rows });
  }

  const restrictReassignments: Snapshot["restrictReassignments"] = [];
  try {
    const rows = await pool.query(`SELECT id FROM playground_property_sessions WHERE created_by = $1`, [opts.userId]);
    const ids = rows.rows.map((r: any) => parseInt(String(r.id), 10)).filter((n: number) => Number.isFinite(n));
    if (ids.length > 0) {
      restrictReassignments.push({
        table: "playground_property_sessions",
        idColumn: "id",
        affectedIds: ids,
        fromUserId: opts.userId,
        toUserId: opts.reassignedToUserId,
      });
    }
  } catch {}

  return {
    version: 1,
    runId: opts.runId,
    domain: opts.domain,
    deletedAt: nowIso(),
    reassignedToUserId: opts.reassignedToUserId,
    user,
    fkTables,
    manualTables,
    restrictReassignments,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { pool } = await import("../db.js");

  const allUsers = await loadUsers(pool);
  const ocean = allUsers.filter((u) => endsWithDomain(u.email, args.domain));

  const protectedUsers: { user: UserRow; reasons: string[] }[] = [];
  for (const u of allUsers) {
    const reasons: string[] = [];
    if (u.is_super_admin) reasons.push("isSuperAdmin");
    if (isPrivilegedRole(u.role)) reasons.push("privilegedRole");
    if (await userOwnsTeam(pool, u.id)) reasons.push("teamOwner");
    if (reasons.length > 0) protectedUsers.push({ user: u, reasons });
  }

  const protectedNonOcean = protectedUsers.filter((p) => !endsWithDomain(p.user.email, args.domain));

  const candidates = allUsers.filter((u) => {
    if (endsWithDomain(u.email, args.domain)) return false;
    const isProtected = protectedUsers.some((p) => p.user.id === u.id);
    return !isProtected;
  });

  const runHeader = {
    runId: args.runId,
    domain: args.domain,
    mode: args.execute ? "execute" : "dry-run",
    ts: nowIso(),
  };

  console.log(JSON.stringify(runHeader));
  console.log("");
  console.log(`Oceanluxe users (kept): ${ocean.length}`);
  console.log(`Non-oceanluxe candidates: ${candidates.length}`);
  console.log(`Protected users (excluded): ${protectedUsers.length}`);
  if (protectedNonOcean.length > 0) {
    console.log("");
    console.log(`BLOCKER: ${protectedNonOcean.length} protected users are non-${args.domain} and must be remediated manually (change email to @${args.domain} or remove protection).`);
  }

  console.log("");
  console.log("Candidates:");
  if (candidates.length === 0) console.log("(none)");
  for (const u of candidates) console.log(formatUserLine(u));

  console.log("");
  console.log("Protected (excluded):");
  if (protectedUsers.length === 0) console.log("(none)");
  for (const p of protectedUsers) console.log(`${formatUserLine(p.user)}  reasons=${p.reasons.join(",")}`);

  const fkRefs = await listUserFkRefs(pool);
  const candidateIds = candidates.map((c) => c.id);
  console.log("");
  console.log("Dependency counts (across candidates):");
  if (candidateIds.length === 0) {
    console.log("(none)");
  } else {
    for (const fk of fkRefs) {
      const c = await countFkMatches(pool, fk, candidateIds).catch(() => 0);
      if (c === 0) continue;
      console.log(`${fk.schema}.${fk.table}.${fk.column} onDelete=${fk.onDelete} rows=${c}`);
    }
    const restrictCount = await pool
      .query(`SELECT count(*)::bigint AS c FROM playground_property_sessions WHERE created_by = ANY($1::int[])`, [candidateIds])
      .then((r: any) => parseInt(String(r.rows?.[0]?.c ?? "0"), 10))
      .catch(() => 0);
    if (restrictCount > 0) console.log(`playground_property_sessions.created_by onDelete=restrict rows=${restrictCount}`);
  }

  if (!args.noFiles) {
    ensureDir(args.exportDir);
    const reviewPath = join(args.exportDir, "review.json");
    writeFileSync(
      reviewPath,
      JSON.stringify(
        {
          ...runHeader,
          totals: { totalUsers: allUsers.length, oceanluxeUsers: ocean.length, candidates: candidates.length, protected: protectedUsers.length },
          candidates,
          protectedUsers: protectedUsers.map((p) => ({ user: p.user, reasons: p.reasons })),
          blockers: protectedNonOcean.map((p) => ({ user: p.user, reasons: p.reasons })),
        },
        null,
        2
      )
    );
    console.log("");
    console.log(`Wrote review: ${reviewPath}`);
  }

  if (!args.execute) {
    if (protectedNonOcean.length > 0) process.exitCode = 2;
    return;
  }

  if (protectedNonOcean.length > 0) {
    console.error("Refusing to execute while protected non-oceanluxe users exist.");
    process.exitCode = 2;
    return;
  }

  if (args.confirmDomain !== args.domain) {
    console.error(`Missing/invalid --confirm-domain. Expected: ${args.domain}`);
    process.exitCode = 2;
    return;
  }

  if (typeof args.confirmCount !== "number" || args.confirmCount !== candidates.length) {
    console.error(`Missing/invalid --confirm-count. Expected: ${candidates.length}`);
    process.exitCode = 2;
    return;
  }

  const reassignedToUserId = Number.isFinite(args.reassignUserId)
    ? (args.reassignUserId as number)
    : await pickDefaultReassignUserId(pool, args.domain);

  if (!reassignedToUserId) {
    console.error(`Missing --reassign-user-id and no default super-admin @${args.domain} found to use for RESTRICT reassignment.`);
    process.exitCode = 2;
    return;
  }

  console.log("");
  console.log(`Using reassignment target user id: ${reassignedToUserId}`);

  if (!args.noFiles) ensureDir(args.exportDir);
  const backupPath = join(args.exportDir, "backup.jsonl");

  let deleted = 0;
  for (const u of candidates) {
    const email = String(u.email);
    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const ownsTeam = await userOwnsTeam(client, u.id);
        if (ownsTeam) throw new Error("User owns a team; strict mode excludes deletion.");

        const snapshot = await buildSnapshot(client, {
          domain: args.domain,
          runId: args.runId,
          userId: u.id,
          reassignedToUserId,
          fkRefs,
        });

        const backupInsert = await client.query(
          `
          INSERT INTO user_cleanup_backups
            (run_id, deleted_user_id, deleted_user_email, snapshot, metadata, expires_at)
          VALUES
            ($1, $2, $3, $4::jsonb, $5::jsonb, NOW() + INTERVAL '24 hours')
          RETURNING id
        `,
          [
            args.runId,
            u.id,
            email,
            JSON.stringify(snapshot),
            JSON.stringify({ domain: args.domain, reassignedToUserId, script: "user-cleanup-non-oceanluxe", version: 1 }),
          ]
        );
        const backupId = parseInt(String(backupInsert.rows?.[0]?.id ?? "0"), 10);

        for (const rr of snapshot.restrictReassignments) {
          if (rr.table === "playground_property_sessions" && rr.affectedIds.length > 0) {
            await updateTableRows(client, "public", "playground_property_sessions", `created_by = $1`, `id = ANY($2::int[])`, [
              rr.toUserId,
              rr.affectedIds,
            ]);
          }
        }

        for (const t of snapshot.manualTables) {
          await deleteTableRows(client, t.schema, t.table, `user_id = $1`, [u.id]).catch(() => {});
        }

        await client.query(`DELETE FROM users WHERE id = $1`, [u.id]);

        await client.query("COMMIT");
        client.release();

        if (!args.noFiles) {
          appendFileSync(backupPath, JSON.stringify({ backupId, ...snapshot }) + "\n");
        }

        await deleteUserSessionsBestEffort(pool, u.id);
        await writeAuthAuditLog(pool, {
          action: "user_cleanup_delete",
          outcome: "success",
          userId: u.id,
          email,
          metadata: { runId: args.runId, domain: args.domain, backupId, reassignedToUserId },
        });
        deleted++;
        console.log(`[${nowIso()}] deleted user id=${u.id} email=${email} backupId=${backupId}`);
      } catch (e: any) {
        try {
          await client.query("ROLLBACK");
        } catch {}
        client.release();
        await writeAuthAuditLog(pool, {
          action: "user_cleanup_delete",
          outcome: "failure",
          userId: u.id,
          email,
          metadata: { runId: args.runId, domain: args.domain, error: String(e?.message || e) },
        });
        console.error(`[${nowIso()}] failed user id=${u.id} email=${email}: ${String(e?.message || e)}`);
      }
    } catch (e: any) {
      console.error(`[${nowIso()}] failed user id=${u.id} email=${email}: ${String(e?.message || e)}`);
    }
  }

  const remaining = await loadUsers(pool);
  const remainingOcean = remaining.filter((x) => endsWithDomain(x.email, args.domain));
  const remainingNonOcean = remaining.filter((x) => !endsWithDomain(x.email, args.domain));

  console.log("");
  console.log("Summary:");
  console.log(`Removed: ${deleted}`);
  console.log(`Remaining oceanluxe: ${remainingOcean.length}`);
  console.log(`Remaining total users: ${remaining.length}`);
  console.log(`Remaining non-oceanluxe: ${remainingNonOcean.length}`);

  if (remainingNonOcean.length > 0) {
    console.log("");
    console.log("Remaining non-oceanluxe users:");
    for (const x of remainingNonOcean) console.log(formatUserLine(x));
    process.exitCode = 3;
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});

