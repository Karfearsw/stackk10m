import dotenv from "dotenv";
import pg from "pg";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const frameworkRoot = fileURLToPath(new URL("../..", import.meta.url));

dotenv.config({ path: join(frameworkRoot, ".env") });

const { Pool } = pg;

function normalizeConnectionString(input: string | undefined): string {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const url = new URL(raw);
  if ((url.searchParams.get("channel_binding") || "").toLowerCase() === "require") {
    url.searchParams.delete("channel_binding");
  }
  return url.toString();
}

function sslOptions(connectionString: string) {
  if (!connectionString) return undefined;
  const url = new URL(connectionString);
  const sslmode = (url.searchParams.get("sslmode") || "").toLowerCase();
  if (
    sslmode === "require" ||
    sslmode === "verify-full" ||
    sslmode === "verify-ca" ||
    url.hostname.endsWith(".neon.tech")
  ) {
    return { rejectUnauthorized: true };
  }
  return undefined;
}

function intOrNull(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string" && input.trim()) {
    const value = parseInt(input, 10);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

async function run() {
  const targetUrl = normalizeConnectionString(process.env.DATABASE_URL);
  const legacyUrl = normalizeConnectionString(process.env.LEGACY_DATABASE_URL);
  const sourceDb = String(process.env.LEGACY_SOURCE_DB || "legacy").trim() || "legacy";

  if (!targetUrl) {
    throw new Error("DATABASE_URL is required");
  }
  if (!legacyUrl) {
    throw new Error("LEGACY_DATABASE_URL is required");
  }

  const source = new Pool({
    connectionString: legacyUrl,
    ssl: sslOptions(legacyUrl),
  });
  const target = new Pool({
    connectionString: targetUrl,
    ssl: sslOptions(targetUrl),
  });

  const batchId = `${sourceDb}-${new Date().toISOString()}`;

  try {
    const { rows } = await source.query(`
      SELECT
        id,
        title,
        description,
        type,
        related_entity_type,
        related_entity_id,
        due_at,
        completed_at,
        priority,
        status,
        assigned_to_user_id,
        is_recurring,
        recurrence_rule,
        created_by,
        is_private,
        reminder_sent_at,
        overdue_alert_sent_at,
        created_at,
        updated_at
      FROM tasks
      ORDER BY id ASC
    `);

    let inserted = 0;
    let updated = 0;

    for (const row of rows) {
      const result = await target.query(
        `
        INSERT INTO tasks (
          title,
          description,
          type,
          legacy_task_id,
          source_db,
          migration_batch_id,
          related_entity_type,
          related_entity_id,
          due_at,
          completed_at,
          priority,
          status,
          assigned_to_user_id,
          is_recurring,
          recurrence_rule,
          created_by,
          is_private,
          reminder_sent_at,
          overdue_alert_sent_at,
          created_at,
          updated_at
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
        )
        ON CONFLICT (source_db, legacy_task_id)
        DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          type = EXCLUDED.type,
          migration_batch_id = EXCLUDED.migration_batch_id,
          related_entity_type = EXCLUDED.related_entity_type,
          related_entity_id = EXCLUDED.related_entity_id,
          due_at = EXCLUDED.due_at,
          completed_at = EXCLUDED.completed_at,
          priority = EXCLUDED.priority,
          status = EXCLUDED.status,
          assigned_to_user_id = EXCLUDED.assigned_to_user_id,
          is_recurring = EXCLUDED.is_recurring,
          recurrence_rule = EXCLUDED.recurrence_rule,
          created_by = EXCLUDED.created_by,
          is_private = EXCLUDED.is_private,
          reminder_sent_at = EXCLUDED.reminder_sent_at,
          overdue_alert_sent_at = EXCLUDED.overdue_alert_sent_at,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at
        RETURNING xmax = 0 AS inserted
        `,
        [
          String(row.title || "").trim() || `Legacy Task ${row.id}`,
          row.description ?? null,
          row.type ?? "general",
          intOrNull(row.id),
          sourceDb,
          batchId,
          row.related_entity_type ?? null,
          intOrNull(row.related_entity_id),
          row.due_at ?? null,
          row.completed_at ?? null,
          row.priority ?? "medium",
          row.status ?? "open",
          intOrNull(row.assigned_to_user_id),
          Boolean(row.is_recurring),
          row.recurrence_rule ?? null,
          intOrNull(row.created_by) ?? 0,
          Boolean(row.is_private),
          row.reminder_sent_at ?? null,
          row.overdue_alert_sent_at ?? null,
          row.created_at ?? new Date(),
          row.updated_at ?? new Date(),
        ],
      );

      if (result.rows[0]?.inserted) inserted += 1;
      else updated += 1;
    }

    console.log(
      JSON.stringify({
        sourceDb,
        batchId,
        inserted,
        updated,
        total: rows.length,
      }),
    );
  } finally {
    await source.end();
    await target.end();
  }
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
