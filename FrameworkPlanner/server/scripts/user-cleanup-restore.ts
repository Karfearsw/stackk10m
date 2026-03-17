import dotenv from "dotenv";
import { join } from "node:path";

dotenv.config({ path: join(process.cwd(), "FrameworkPlanner", ".env") });

type SnapshotTable = {
  schema: string;
  table: string;
  pkColumns: string[];
  fkColumn?: string;
  onDelete?: "no_action" | "restrict" | "cascade" | "set_null" | "set_default";
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
  const backupId = args["backup-id"] ? parseInt(String(args["backup-id"]), 10) : undefined;
  const runId = args["run-id"] ? String(args["run-id"]) : undefined;
  const userId = args["user-id"] ? parseInt(String(args["user-id"]), 10) : undefined;
  return { backupId, runId, userId };
}

function quoteIdent(v: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v)) throw new Error(`Invalid identifier: ${v}`);
  return `"${v}"`;
}

function qual(schema: string, table: string) {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`;
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

async function identityNeedsOverride(pool: any, schema: string, table: string): Promise<boolean> {
  const r = await pool.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = $1
      AND table_name = $2
      AND is_identity = 'YES'
      AND identity_generation = 'ALWAYS'
    LIMIT 1
  `,
    [schema, table]
  );
  return r.rowCount > 0;
}

async function insertRow(client: any, opts: { schema: string; table: string; pkColumns: string[]; row: Record<string, unknown> }) {
  const keys = Object.keys(opts.row).filter((k) => opts.row[k] !== undefined);
  keys.sort();
  if (keys.length === 0) return { inserted: 0, skipped: 0 };
  const cols = keys.map(quoteIdent).join(", ");
  const vals = keys.map((_, i) => `$${i + 1}`).join(", ");
  const override = (await identityNeedsOverride(client, opts.schema, opts.table)) ? " OVERRIDING SYSTEM VALUE" : "";
  const conflict = opts.pkColumns.length > 0 ? ` ON CONFLICT (${opts.pkColumns.map(quoteIdent).join(", ")}) DO NOTHING` : "";
  const q = `INSERT INTO ${qual(opts.schema, opts.table)}${override} (${cols}) VALUES (${vals})${conflict}`;
  const res = await client.query(q, keys.map((k) => opts.row[k]));
  return { inserted: res.rowCount || 0, skipped: (res.rowCount || 0) === 0 && opts.pkColumns.length > 0 ? 1 : 0 };
}

async function bumpIdentitySequenceBestEffort(pool: any, schema: string, table: string, column: string) {
  if (schema !== "public") return;
  try {
    const seqRes = await pool.query(`SELECT pg_get_serial_sequence($1, $2) AS seq`, [`${schema}.${table}`, column]);
    const seq = seqRes.rows?.[0]?.seq;
    if (!seq) return;
    await pool.query(
      `SELECT setval($1::regclass, GREATEST((SELECT COALESCE(MAX(${quoteIdent(column)}), 0) FROM ${qual(schema, table)}), 1))`,
      [seq]
    );
  } catch {}
}

async function updateFkForRows(client: any, t: SnapshotTable, fkValue: number) {
  if (!t.fkColumn || t.pkColumns.length === 0 || t.rows.length === 0) return 0;
  if (t.pkColumns.length === 1) {
    const pk = t.pkColumns[0];
    const ids = t.rows.map((r) => r[pk]).filter((v) => v !== undefined && v !== null);
    if (ids.length === 0) return 0;
    const q = `UPDATE ${qual(t.schema, t.table)} SET ${quoteIdent(t.fkColumn)} = $1 WHERE ${quoteIdent(pk)} = ANY($2::int[])`;
    const res = await client.query(q, [fkValue, ids]);
    return res.rowCount || 0;
  }
  let total = 0;
  for (const row of t.rows) {
    const whereParts: string[] = [];
    const params: unknown[] = [fkValue];
    let idx = 2;
    for (const pk of t.pkColumns) {
      if (row[pk] === undefined) continue;
      whereParts.push(`${quoteIdent(pk)} = $${idx++}`);
      params.push(row[pk]);
    }
    if (whereParts.length === 0) continue;
    const q = `UPDATE ${qual(t.schema, t.table)} SET ${quoteIdent(t.fkColumn)} = $1 WHERE ${whereParts.join(" AND ")}`;
    const res = await client.query(q, params);
    total += res.rowCount || 0;
  }
  return total;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { pool } = await import("../db.js");

  let backupRow: any;
  if (Number.isFinite(args.backupId)) {
    const r = await pool.query(`SELECT * FROM user_cleanup_backups WHERE id = $1 LIMIT 1`, [args.backupId]);
    backupRow = r.rows?.[0];
  } else if (args.runId && Number.isFinite(args.userId)) {
    const r = await pool.query(
      `SELECT * FROM user_cleanup_backups WHERE run_id = $1 AND deleted_user_id = $2 ORDER BY id DESC LIMIT 1`,
      [args.runId, args.userId]
    );
    backupRow = r.rows?.[0];
  } else {
    console.error("Usage: --backup-id <id> OR --run-id <runId> --user-id <id>");
    process.exitCode = 2;
    return;
  }

  if (!backupRow) {
    console.error("Backup not found");
    process.exitCode = 2;
    return;
  }

  const expiresAt = backupRow.expires_at ? new Date(backupRow.expires_at) : undefined;
  if (expiresAt && Date.now() > expiresAt.getTime()) {
    console.error("Backup has expired (past 24-hour window)");
    process.exitCode = 2;
    return;
  }

  const snapshot: Snapshot = typeof backupRow.snapshot === "string" ? JSON.parse(backupRow.snapshot) : backupRow.snapshot;
  const user = snapshot.user as any;
  const userId = parseInt(String(user.id), 10);
  const email = String(user.email || "");

  const existingByEmail = await pool.query(`SELECT id FROM users WHERE lower(trim(email)) = lower(trim($1)) LIMIT 1`, [email]);
  if ((existingByEmail.rowCount ?? 0) > 0) {
    console.error(`Cannot restore: another user already exists with email ${email}`);
    process.exitCode = 2;
    return;
  }
  const existingById = await pool.query(`SELECT id FROM users WHERE id = $1 LIMIT 1`, [userId]);
  if ((existingById.rowCount ?? 0) > 0) {
    console.error(`Cannot restore: a user already exists with id ${userId}`);
    process.exitCode = 2;
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await insertRow(client, { schema: "public", table: "users", pkColumns: ["id"], row: user });

    let insertedManual = 0;
    for (const t of snapshot.manualTables || []) {
      for (const row of t.rows) {
        const res = await insertRow(client, { schema: t.schema, table: t.table, pkColumns: t.pkColumns, row });
        insertedManual += res.inserted;
      }
      if (t.pkColumns.includes("id")) await bumpIdentitySequenceBestEffort(pool, t.schema, t.table, "id");
    }

    const cascadeTables = (snapshot.fkTables || []).filter((t) => t.onDelete === "cascade");
    const setNullTables = (snapshot.fkTables || []).filter((t) => t.onDelete === "set_null");

    const byName = (s: SnapshotTable) => `${s.schema}.${s.table}`;
    const order = ["crm_import_jobs", "crm_import_job_errors", "crm_export_files", "pipeline_configs", "time_clock_sessions"];
    cascadeTables.sort((a, b) => {
      const ia = order.indexOf(a.table);
      const ib = order.indexOf(b.table);
      if (ia === -1 && ib === -1) return byName(a).localeCompare(byName(b));
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    let insertedCascade = 0;
    for (const t of cascadeTables) {
      for (const row of t.rows) {
        const res = await insertRow(client, { schema: t.schema, table: t.table, pkColumns: t.pkColumns, row });
        insertedCascade += res.inserted;
      }
      if (t.pkColumns.includes("id")) await bumpIdentitySequenceBestEffort(pool, t.schema, t.table, "id");
    }

    let updatedSetNull = 0;
    for (const t of setNullTables) {
      updatedSetNull += await updateFkForRows(client, t, userId);
    }

    for (const rr of snapshot.restrictReassignments || []) {
      if (rr.table !== "playground_property_sessions" || rr.affectedIds.length === 0) continue;
      await client.query(
        `UPDATE ${qual("public", "playground_property_sessions")}
         SET ${quoteIdent("created_by")} = $1
         WHERE ${quoteIdent(rr.idColumn)} = ANY($2::int[])
           AND ${quoteIdent("created_by")} = $3`,
        [rr.fromUserId, rr.affectedIds, rr.toUserId]
      );
    }

    await client.query(`UPDATE user_cleanup_backups SET restored_at = NOW() WHERE id = $1`, [backupRow.id]);
    await client.query("COMMIT");

    await bumpIdentitySequenceBestEffort(pool, "public", "users", "id");

    await writeAuthAuditLog(pool, {
      action: "user_cleanup_restore",
      outcome: "success",
      userId,
      email,
      metadata: { backupId: backupRow.id, runId: snapshot.runId, insertedManual, insertedCascade, updatedSetNull },
    });

    console.log(`Restored user id=${userId} email=${email} from backupId=${backupRow.id}`);
    console.log(`Inserted manual rows: ${insertedManual}`);
    console.log(`Inserted cascade rows: ${insertedCascade}`);
    console.log(`Updated set-null references: ${updatedSetNull}`);
  } catch (e: any) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    await writeAuthAuditLog(pool, {
      action: "user_cleanup_restore",
      outcome: "failure",
      userId: parseInt(String(snapshot?.user?.["id"] ?? "0"), 10) || null,
      email: String(snapshot?.user?.["email"] ?? ""),
      metadata: { backupId: backupRow.id, runId: snapshot.runId, error: String(e?.message || e) },
    });
    console.error(String(e?.message || e));
    process.exitCode = 1;
  } finally {
    client.release();
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
