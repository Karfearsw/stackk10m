import { describe, expect, it, vi } from "vitest";

describe("schema readiness", () => {
  it("returns db_unavailable when DATABASE_URL is missing", async () => {
    const prev = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    vi.resetModules();
    vi.doMock("../server/db.js", () => ({
      pool: { query: vi.fn() },
      databaseUrlResolution: () => ({ url: null }),
    }));
    const mod = await import("../server/schema-readiness");
    const r = await mod.getSchemaReadiness();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("db_unavailable");
      expect(r.missing).toEqual(
        expect.arrayContaining([
          "env:DATABASE_URL",
          "env:POSTGRES_URL_NON_POOLING",
          "env:POSTGRES_PRISMA_URL",
          "env:POSTGRES_URL",
        ]),
      );
    }
    process.env.DATABASE_URL = prev;
  });

  it("returns schema_missing when required tables/columns are missing", async () => {
    const prev = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://example.local/test";
    vi.resetModules();
    vi.doMock("../server/db.js", () => ({
      pool: {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("to_regclass('public.tasks')")) return { rows: [{ reg: "tasks" }] };
          if (sql.includes("to_regclass('public.pipeline_configs')")) return { rows: [{ reg: null }] };
          if (sql.includes("table_name = 'leads'") && sql.includes("column_name = 'do_not_call'")) return { rows: [{ ok: 1 }] };
          if (sql.includes("table_name = 'leads'") && sql.includes("column_name = 'do_not_email'")) return { rows: [] };
          if (sql.includes("table_name = 'properties'") && sql.includes("column_name = 'lead_source'")) return { rows: [] };
          if (sql.includes("table_name = 'properties'") && sql.includes("column_name = 'lead_source_detail'")) return { rows: [] };
          throw new Error(`Unexpected query: ${sql}`);
        }),
      },
      databaseUrlResolution: () => ({ url: process.env.DATABASE_URL }),
    }));
    const mod = await import("../server/schema-readiness");
    const r = await mod.getSchemaReadiness();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("schema_missing");
      expect(r.missing).toEqual(
        expect.arrayContaining([
          "table:pipeline_configs",
          "column:leads.do_not_email",
          "column:properties.lead_source",
          "column:properties.lead_source_detail",
        ]),
      );
      expect(mod.schemaFixInstructions().applyMigrations).toBe("npm run migrate");
      expect(mod.schemaFixInstructions().vercelBuildNote).toBeTypeOf("string");
    }
    process.env.DATABASE_URL = prev;
  });
});
