import { describe, expect, it, vi } from "vitest";

describe("apply migrations runner tracking", () => {
  it("tracks and skips already applied migrations in production", async () => {
    const prev = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = "production";
    vi.resetModules();

    const readdirSync = vi.fn(() => ["0001_pipeline_indexes.sql", "0033_applied_migrations.sql", "0040_next.sql"]);
    const readFileSync = vi.fn(() => "SELECT 1;");
    const query = vi.fn(async (sql: any, params?: any[]) => {
      const text = String(sql);
      if (/select 1 as ok from applied_migrations/i.test(text)) {
        const filename = String(params?.[0] || "");
        if (filename === "0001_pipeline_indexes.sql") return { rows: [{ ok: 1 }] };
        return { rows: [] };
      }
      return { rows: [] };
    });

    vi.doMock("node:fs", () => ({ readdirSync, readFileSync }));
    vi.doMock("../server/db.js", () => ({ pool: { query } }));

    const mod = await import("../server/scripts/apply-migrations");
    await mod.applyMigrations();

    expect(query.mock.calls.some((c) => /CREATE TABLE IF NOT EXISTS applied_migrations/i.test(String(c[0])))).toBe(true);
    expect(query.mock.calls.some((c) => /select 1 as ok from applied_migrations/i.test(String(c[0])))).toBe(true);
    expect(query.mock.calls.some((c) => /insert into applied_migrations/i.test(String(c[0])))).toBe(true);
    expect(readFileSync.mock.calls.some((c) => String(c[0]).includes("0001_pipeline_indexes.sql"))).toBe(false);

    process.env.VERCEL_ENV = prev;
  });

  it("does not use tracking in preview", async () => {
    const prev = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = "preview";
    vi.resetModules();

    const readdirSync = vi.fn(() => ["0001_pipeline_indexes.sql"]);
    const readFileSync = vi.fn(() => "SELECT 1;");
    const query = vi.fn(async () => ({ rows: [] }));

    vi.doMock("node:fs", () => ({ readdirSync, readFileSync }));
    vi.doMock("../server/db.js", () => ({ pool: { query } }));

    const mod = await import("../server/scripts/apply-migrations");
    await mod.applyMigrations();

    expect(query.mock.calls.some((c) => /applied_migrations/i.test(String(c[0])))).toBe(false);
    expect(readFileSync).toHaveBeenCalledTimes(1);

    process.env.VERCEL_ENV = prev;
  });
});

