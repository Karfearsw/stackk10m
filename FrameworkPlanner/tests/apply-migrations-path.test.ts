import { describe, expect, it, vi } from "vitest";

describe("apply migrations runner", () => {
  it("targets FrameworkPlanner/migrations (not repo-root migrations)", async () => {
    const prevSession = process.env.SESSION_SECRET;
    const prevMigrationsUrl = process.env.MIGRATIONS_DATABASE_URL;
    process.env.SESSION_SECRET = "test";
    process.env.MIGRATIONS_DATABASE_URL = "postgresql://user:pass@localhost:5432/db?sslmode=require";

    vi.resetModules();

    const readdirSync = vi.fn(() => ["0026_dialer_scripts.sql", "0001_fake.sql"]);
    const readFileSync = vi.fn(() => "");

    vi.doMock("node:fs", () => ({ readdirSync, readFileSync }));
    vi.doMock("pg", () => {
      class FakeClient {
        query = vi.fn(async () => ({}));
        release = vi.fn(() => {});
      }
      class FakePool {
        query = vi.fn(async (sql: string) => {
          if (String(sql).includes("SELECT filename, checksum")) return { rows: [] };
          if (String(sql).includes("SELECT NOW()")) return { rows: [{ now: "now" }] };
          return {};
        });
        connect = vi.fn(async () => new FakeClient());
        end = vi.fn(async () => {});
      }
      return { default: { Pool: FakePool } };
    });

    const mod = await import("../server/scripts/apply-migrations");
    await mod.applyMigrations();

    expect(readdirSync).toHaveBeenCalledTimes(1);
    const dirArg = String(readdirSync.mock.calls[0]?.[0] ?? "").replace(/\\/g, "/");
    expect(dirArg.endsWith("/FrameworkPlanner/migrations")).toBe(true);

    process.env.SESSION_SECRET = prevSession;
    if (prevMigrationsUrl === undefined) delete process.env.MIGRATIONS_DATABASE_URL;
    else process.env.MIGRATIONS_DATABASE_URL = prevMigrationsUrl;
  });
});
