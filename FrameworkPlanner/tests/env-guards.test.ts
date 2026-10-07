import { describe, expect, it } from "vitest";
import {
  DEV_SESSION_SECRET,
  assertEnvSafe,
  assertSafeMigrationTarget,
  isProductionDatabaseUrl,
  redactDatabaseUrl,
  resolveAppEnv,
  resolveDatabaseUrl,
  validateEnv,
} from "../server/env";

const PROD_URL = "postgresql://user:supersecret@db-prod.neon.tech/appdb?sslmode=require";
const DEV_URL = "postgresql://user:devpass@localhost:5432/appdev";

describe("resolveAppEnv", () => {
  it("honors an explicit APP_ENV over NODE_ENV", () => {
    expect(resolveAppEnv({ APP_ENV: "production", NODE_ENV: "development" })).toBe("production");
  });

  it("derives production from NODE_ENV or VERCEL_ENV", () => {
    expect(resolveAppEnv({ NODE_ENV: "production" })).toBe("production");
    expect(resolveAppEnv({ VERCEL_ENV: "production" })).toBe("production");
  });

  it("derives test and defaults to development", () => {
    expect(resolveAppEnv({ NODE_ENV: "test" })).toBe("test");
    expect(resolveAppEnv({})).toBe("development");
  });
});

describe("resolveDatabaseUrl", () => {
  it("prefers DATABASE_URL and reports its source", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: DEV_URL })).toEqual({ url: DEV_URL, source: "DATABASE_URL" });
  });

  it("falls back to provider-prefixed vars", () => {
    expect(resolveDatabaseUrl({ POSTGRES_URL: DEV_URL }).source).toBe("POSTGRES_URL");
    expect(resolveDatabaseUrl({}).url).toBeUndefined();
  });
});

describe("redactDatabaseUrl", () => {
  it("omits credentials", () => {
    const redacted = redactDatabaseUrl(PROD_URL);
    expect(redacted).toBe("db-prod.neon.tech/appdb");
    expect(redacted).not.toContain("supersecret");
    expect(redacted).not.toContain("user:");
  });

  it("handles missing/unparseable input", () => {
    expect(redactDatabaseUrl(undefined)).toBe("(none)");
    expect(redactDatabaseUrl("not-a-url")).toBe("(unparseable)");
  });
});

describe("isProductionDatabaseUrl", () => {
  it("flags prod-named hosts", () => {
    expect(isProductionDatabaseUrl(PROD_URL)).toBe(true);
    expect(isProductionDatabaseUrl(DEV_URL)).toBe(false);
  });

  it("honors an explicit host allowlist and configured prod url", () => {
    expect(isProductionDatabaseUrl("postgresql://u:p@db.example.com/app", { PRODUCTION_DB_HOSTS: "db.example.com" })).toBe(true);
    expect(
      isProductionDatabaseUrl("postgresql://u:p@same-host.neon.tech/app", {
        PRODUCTION_DATABASE_URL: "postgresql://u:p@same-host.neon.tech/app",
      }),
    ).toBe(true);
  });
});

describe("validateEnv (production)", () => {
  const valid = {
    APP_ENV: "production",
    DATABASE_URL: PROD_URL,
    SESSION_SECRET: "a-strong-random-secret",
    EMPLOYEE_ACCESS_CODE: "3911",
  };

  it("accepts a complete production config", () => {
    expect(validateEnv(valid).ok).toBe(true);
  });

  it("rejects a missing session secret", () => {
    const v = validateEnv({ ...valid, SESSION_SECRET: "" });
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.key === "SESSION_SECRET")).toBe(true);
  });

  it("rejects the documentation default secret", () => {
    expect(validateEnv({ ...valid, SESSION_SECRET: DEV_SESSION_SECRET }).ok).toBe(false);
  });

  it("rejects dev/admin bypass in production", () => {
    expect(validateEnv({ ...valid, DEV_AUTH_BYPASS_ENABLED: "true" }).ok).toBe(false);
    expect(validateEnv({ ...valid, ENABLE_ADMIN_BYPASS: "1" }).ok).toBe(false);
  });

  it("rejects a missing database url", () => {
    expect(validateEnv({ APP_ENV: "production", SESSION_SECRET: "x", EMPLOYEE_ACCESS_CODE: "1" }).ok).toBe(false);
  });
});

describe("validateEnv (non-production)", () => {
  it("blocks a non-production workload that points at a production database", () => {
    const v = validateEnv({ APP_ENV: "development", DATABASE_URL: PROD_URL });
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.level === "error" && i.key === "DATABASE_URL")).toBe(true);
  });

  it("allows it only with the explicit override", () => {
    expect(validateEnv({ APP_ENV: "development", DATABASE_URL: PROD_URL, ALLOW_PRODUCTION_DB_IN_DEV: "true" }).ok).toBe(true);
  });

  it("does not block ordinary local development", () => {
    expect(validateEnv({ APP_ENV: "development", DATABASE_URL: DEV_URL }).ok).toBe(true);
  });
});

describe("assertEnvSafe", () => {
  it("throws for unsafe production config", () => {
    expect(() => assertEnvSafe({ APP_ENV: "production", DATABASE_URL: PROD_URL })).toThrow(/unsafe production/i);
  });

  it("is a no-op outside production", () => {
    expect(() => assertEnvSafe({ APP_ENV: "development", DATABASE_URL: DEV_URL })).not.toThrow();
    expect(() => assertEnvSafe({ APP_ENV: "test" })).not.toThrow();
  });
});

describe("assertSafeMigrationTarget", () => {
  it("refuses a production target without the explicit flag", () => {
    expect(() => assertSafeMigrationTarget({ DATABASE_URL: PROD_URL })).toThrow(/production/i);
  });

  it("allows a production target with the flag, and any non-prod target", () => {
    expect(() => assertSafeMigrationTarget({ DATABASE_URL: PROD_URL, ALLOW_PRODUCTION_MIGRATIONS: "true" })).not.toThrow();
    expect(() => assertSafeMigrationTarget({ DATABASE_URL: DEV_URL })).not.toThrow();
    expect(() => assertSafeMigrationTarget({})).not.toThrow();
  });
});
