import { describe, expect, it, vi } from "vitest";

describe("apply migrations runner", () => {
  it("targets FrameworkPlanner/migrations (not repo-root migrations)", async () => {
    const prevSession = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "test";

    vi.resetModules();

    const readdirSync = vi.fn(() => ["0026_dialer_scripts.sql", "0001_fake.sql"]);
    const readFileSync = vi.fn(() => "");
    const query = vi.fn(async () => ({}));

    vi.doMock("node:fs", () => ({ readdirSync, readFileSync }));
    vi.doMock("../server/db.js", () => ({ pool: { query } }));

    const mod = await import("../server/scripts/apply-migrations");
    await mod.applyMigrations();

    expect(readdirSync).toHaveBeenCalledTimes(1);
    const dirArg = String(readdirSync.mock.calls[0]?.[0] ?? "").replace(/\\/g, "/");
    expect(dirArg.endsWith("/FrameworkPlanner/migrations")).toBe(true);

    process.env.SESSION_SECRET = prevSession;
  });
});

