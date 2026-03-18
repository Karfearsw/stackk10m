import { describe, expect, it, vi } from "vitest";

describe("schema readiness", () => {
  it("returns db_unavailable when DATABASE_URL is missing", async () => {
    const prev = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    vi.resetModules();
    const mod = await import("../server/schema-readiness");
    const r = await mod.getSchemaReadiness();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("db_unavailable");
    }
    process.env.DATABASE_URL = prev;
  });
});

