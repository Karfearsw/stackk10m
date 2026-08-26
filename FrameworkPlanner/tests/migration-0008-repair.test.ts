import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "@neondatabase/serverless";

/**
 * Verifies the duplicate address_key repair for playground_property_sessions.
 *
 * Uses TEMP tables on a single dedicated connection (search_path pinned to the
 * temp schema) so the fixture never touches real tables. Exercises the actual
 * migration files on disk: 0008 (guarded index creation must not throw with
 * duplicates present) and 0058 (repair + per-user unique index).
 */
describe("migration 0008 duplicate address_key repair", () => {
  let pool: Pool;
  let client: any;
  let f0008a: string;
  let f0008b: string;
  let f0058: string;

  beforeAll(async () => {
    const dir = join(process.cwd(), "migrations");
    f0008a = readFileSync(join(dir, "0008_playground_property_sessions.sql"), "utf8");
    f0008b = readFileSync(join(dir, "0008_playground_sessions.sql"), "utf8");
    f0058 = readFileSync(join(dir, "0058_repair_playground_property_sessions.sql"), "utf8");

    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    client = await pool.connect();
    // Pin resolution to the temp schema only.
    await client.query("SET search_path = pg_temp, pg_catalog");

    await client.query(`CREATE TEMP TABLE playground_property_sessions (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      address VARCHAR(500) NOT NULL,
      address_key TEXT NOT NULL,
      property_type VARCHAR(50),
      current_url TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      bookmarks_json TEXT NOT NULL DEFAULT '[]',
      checklist_json TEXT NOT NULL DEFAULT '{}',
      notes_json TEXT NOT NULL DEFAULT '[]',
      underwriting_json TEXT NOT NULL DEFAULT '{}',
      lead_id INTEGER,
      property_id INTEGER,
      assigned_to INTEGER,
      assignment_due_at TIMESTAMP,
      assignment_status VARCHAR(50),
      created_by INTEGER NOT NULL,
      updated_by INTEGER,
      last_opened_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      last_opened_at TIMESTAMP DEFAULT NOW()
    )`);

    // Fixture:
    //  aaa: 3 rows, distinct updated_at  -> newest wins (row C)
    //  bbb: 2 rows, same updated_at, diff created_at -> newest created_at wins
    //  ccc: 2 rows, same timestamps -> highest id wins
    //  ddd: 1 clean row (untouched)
    await client.query(`INSERT INTO playground_property_sessions
      (address, address_key, created_by, created_at, updated_at) VALUES
      ('a', 'aaa', 1, '2026-01-01 00:00:00', '2026-01-02 00:00:00'),
      ('a2', 'aaa', 2, '2026-02-01 00:00:00', '2026-02-02 00:00:00'),
      ('a3', 'aaa', 3, '2026-03-01 00:00:00', '2026-03-03 00:00:00'),
      ('b', 'bbb', 1, '2026-05-01 00:00:00', '2026-06-01 10:00:00'),
      ('b2', 'bbb', 2, '2026-05-02 00:00:00', '2026-06-01 10:00:00'),
      ('c', 'ccc', 1, '2026-07-01 00:00:00', '2026-08-01 00:00:00'),
      ('c2', 'ccc', 2, '2026-07-01 00:00:00', '2026-08-01 00:00:00'),
      ('d', 'ddd', 1, '2026-09-01 00:00:00', '2026-09-02 00:00:00')`);
  });

  afterAll(async () => {
    try {
      await client?.query("SET search_path = public");
      await client?.release?.();
    } catch {
      /* noop */
    }
    await pool?.end();
  });

  it("0008 unique index creation does not abort when duplicates exist", async () => {
    // With duplicates present the guarded 0008 files must complete without error.
    await expect(client.query(f0008a)).resolves.toBeDefined();
    await expect(client.query(f0008b)).resolves.toBeDefined();
  });

  it("0058 repairs duplicates deterministically and records backups", async () => {
    await expect(client.query(f0058)).resolves.toBeDefined();

    const rows = await client.query(
      "SELECT id, address_key, created_by, updated_at FROM playground_property_sessions ORDER BY address_key, id",
    );
    // 3 dup groups -> 1 canonical each + 1 clean row = 4 rows.
    expect(rows.rows.length).toBe(4);
    const byKey: Record<string, any[]> = {};
    for (const r of rows.rows) (byKey[r.address_key] ||= []).push(r);

    // aaa: canonical is the newest updated_at (2026-03-03), created_by 3.
    expect(byKey["aaa"].length).toBe(1);
    expect(byKey["aaa"][0].created_by).toBe(3);
    // bbb: tie on updated_at -> newest created_at (2026-05-02), created_by 2.
    expect(byKey["bbb"].length).toBe(1);
    expect(byKey["bbb"][0].created_by).toBe(2);
    // ccc: tie on both -> highest id wins.
    expect(byKey["ccc"].length).toBe(1);
    const cccIds = byKey["ccc"][0].id;
    // ddd untouched.
    expect(byKey["ddd"].length).toBe(1);

    // Backup contains the 4 non-canonical rows with the canonical target.
    const backups = await client.query(
      "SELECT id, address_key, replaced_by_session_id FROM playground_property_sessions_dedup_backup ORDER BY id",
    );
    expect(backups.rows.length).toBe(4);
    for (const b of backups.rows) {
      expect(b.replaced_by_session_id).not.toBe(b.id);
    }
    // ccc backup row points at the surviving ccc id.
    const cccBackup = backups.rows.find((r: any) => r.address_key === "ccc");
    expect(cccBackup.replaced_by_session_id).toBe(cccIds);

    // Per-user unique index now exists and enforces (created_by, address_key).
    const dupInsert = await client
      .query("INSERT INTO playground_property_sessions (address, address_key, created_by) VALUES ('x', 'aaa', 3)")
      .then(() => "inserted")
      .catch((e: any) => String(e?.code));
    expect(dupInsert).toBe("23505");
  });

  it("0058 is idempotent on replay and 0008 succeeds once data is clean", async () => {
    // Clean DB replay: 0008 can now create the historical global index.
    await expect(client.query(f0008a)).resolves.toBeDefined();
    await expect(client.query(f0008b)).resolves.toBeDefined();
    // 0058 replay is a no-op (no duplicates left).
    await expect(client.query(f0058)).resolves.toBeDefined();

    const rows = await client.query("SELECT count(*)::int AS n FROM playground_property_sessions");
    expect(rows.rows[0].n).toBe(4);
    const backups = await client.query("SELECT count(*)::int AS n FROM playground_property_sessions_dedup_backup");
    expect(backups.rows[0].n).toBe(4);
  });
});
