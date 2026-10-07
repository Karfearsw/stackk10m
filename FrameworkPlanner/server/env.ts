/**
 * Ticket 03 — Centralized, validated environment configuration.
 *
 * Goals (see LUXE RM dev ticket 03):
 *  - One place that decides which environment we are running in.
 *  - Startup validates required variables and refuses unsafe or mixed config.
 *  - Non-production workloads and migrations cannot silently target production.
 *  - Secret values are never logged; only redacted connection targets.
 *
 * This module is intentionally dependency-free and side-effect-free so it can be
 * unit tested without a database.
 */

export type AppEnv = "development" | "test" | "production";

export interface EnvIssue {
  level: "error" | "warn";
  key: string;
  message: string;
}

export interface EnvValidation {
  appEnv: AppEnv;
  ok: boolean;
  issues: EnvIssue[];
}

export const APP_ENVS: readonly AppEnv[] = ["development", "test", "production"] as const;

/** Connection-string env vars we accept, in priority order. */
export const DATABASE_URL_KEYS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
] as const;

/** Documentation-only development session secret (must never reach production). */
export const DEV_SESSION_SECRET = "luxe-rm-development-secret-DO-NOT-USE-IN-PRODUCTION";

function isTruthy(value: unknown): boolean {
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

/**
 * Resolve the effective application environment.
 * An explicit APP_ENV wins; otherwise NODE_ENV / VERCEL_ENV decide.
 */
export function resolveAppEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  const explicit = String(env.APP_ENV ?? "")
    .trim()
    .toLowerCase();
  if ((APP_ENVS as readonly string[]).includes(explicit)) return explicit as AppEnv;

  const nodeEnv = String(env.NODE_ENV ?? "")
    .trim()
    .toLowerCase();
  const vercelEnv = String(env.VERCEL_ENV ?? "")
    .trim()
    .toLowerCase();

  if (nodeEnv === "production" || vercelEnv === "production") return "production";
  if (nodeEnv === "test") return "test";
  return "development";
}

export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): {
  url?: string;
  source: string | null;
} {
  for (const key of DATABASE_URL_KEYS) {
    const raw = String(env[key] ?? "").trim();
    if (raw) return { url: raw, source: key };
  }
  return { url: undefined, source: null };
}

/** host + path only; never includes userinfo (credentials). */
export function redactDatabaseUrl(url: string | undefined): string {
  if (!url) return "(none)";
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return "(unparseable)";
  }
}

/**
 * Best-effort detection of a production database target. Because we cannot know
 * every provider's naming, this uses (a) an explicit PRODUCTION_DATABASE_URL to
 * compare hosts, (b) an explicit PRODUCTION_DB_HOSTS allowlist, and (c) a
 * conservative hostname heuristic. Deliberately over-inclusive is avoided so we
 * do not block ordinary local/dev work.
 */
export function isProductionDatabaseUrl(
  url: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!url) return false;

  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }

  const configured = String(env.PRODUCTION_DATABASE_URL ?? "").trim();
  if (configured) {
    try {
      if (new URL(configured).hostname.toLowerCase() === host) return true;
    } catch {
      /* ignore malformed configured URL */
    }
  }

  const allowedHosts = String(env.PRODUCTION_DB_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (allowedHosts.some((h) => host === h || host.endsWith(`.${h}`))) return true;

  return /(^|[.-])prod([.-]|$)/.test(host) || host.includes("production");
}

/**
 * Validate the current environment. Pure: reads only the provided env object.
 */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): EnvValidation {
  const appEnv = resolveAppEnv(env);
  const issues: EnvIssue[] = [];

  const explicitAppEnv = String(env.APP_ENV ?? "").trim();
  if (explicitAppEnv && !(APP_ENVS as readonly string[]).includes(explicitAppEnv.toLowerCase())) {
    issues.push({
      level: "error",
      key: "APP_ENV",
      message: `APP_ENV must be one of ${APP_ENVS.join(", ")} (received "${explicitAppEnv}").`,
    });
  }

  const { url: dbUrl, source: dbSource } = resolveDatabaseUrl(env);

  if (appEnv === "production") {
    if (!dbUrl) {
      issues.push({
        level: "error",
        key: "DATABASE_URL",
        message: "A Postgres connection string is required in production.",
      });
    }
    const sessionSecret = String(env.SESSION_SECRET ?? "");
    if (!sessionSecret.trim()) {
      issues.push({ level: "error", key: "SESSION_SECRET", message: "SESSION_SECRET is required in production." });
    } else if (sessionSecret === DEV_SESSION_SECRET) {
      issues.push({
        level: "error",
        key: "SESSION_SECRET",
        message: "SESSION_SECRET is set to the documentation-only development default.",
      });
    }
    if (!String(env.EMPLOYEE_ACCESS_CODE ?? "").trim()) {
      issues.push({
        level: "error",
        key: "EMPLOYEE_ACCESS_CODE",
        message: "EMPLOYEE_ACCESS_CODE is required in production.",
      });
    }
    if (isTruthy(env.DEV_AUTH_BYPASS_ENABLED)) {
      issues.push({
        level: "error",
        key: "DEV_AUTH_BYPASS_ENABLED",
        message: "Dev auth bypass must never be enabled in production.",
      });
    }
    if (isTruthy(env.ENABLE_ADMIN_BYPASS)) {
      issues.push({
        level: "error",
        key: "ENABLE_ADMIN_BYPASS",
        message: "Admin credential bypass must be disabled in production.",
      });
    }
    if (String(env.NODE_ENV ?? "").trim().toLowerCase() === "development") {
      issues.push({
        level: "warn",
        key: "NODE_ENV",
        message: "APP_ENV resolves to production while NODE_ENV=development — verify this is intentional.",
      });
    }
  } else {
    if (!dbUrl) {
      issues.push({
        level: "warn",
        key: "DATABASE_URL",
        message: "No Postgres connection string configured; database-backed features will be unavailable.",
      });
    }
    if (dbUrl && isProductionDatabaseUrl(dbUrl, env) && !isTruthy(env.ALLOW_PRODUCTION_DB_IN_DEV)) {
      issues.push({
        level: "error",
        key: dbSource || "DATABASE_URL",
        message: `Non-production workload is pointed at a production database (${redactDatabaseUrl(
          dbUrl,
        )}). Set ALLOW_PRODUCTION_DB_IN_DEV=true only if this is deliberate.`,
      });
    }
    if (isTruthy(env.DEV_AUTH_BYPASS_ENABLED) && appEnv !== "development") {
      issues.push({
        level: "warn",
        key: "DEV_AUTH_BYPASS_ENABLED",
        message: "Dev auth bypass is enabled outside the development environment.",
      });
    }
  }

  return { appEnv, ok: !issues.some((i) => i.level === "error"), issues };
}

export function formatEnvIssues(v: EnvValidation): string {
  return v.issues.map((i) => `${i.level.toUpperCase()} ${i.key}: ${i.message}`).join("; ");
}

/**
 * Throw when running in production with an unsafe configuration. Outside
 * production this is a no-op so local/test runs are never blocked.
 */
export function assertEnvSafe(env: NodeJS.ProcessEnv = process.env): EnvValidation {
  const v = validateEnv(env);
  if (v.appEnv === "production" && !v.ok) {
    throw new Error(`Refusing to start with unsafe production configuration — ${formatEnvIssues(v)}`);
  }
  return v;
}

/** Log validation issues without ever echoing secret values. */
export function logEnvValidation(v: EnvValidation, logger: Pick<Console, "info" | "warn" | "error"> = console): void {
  logger.info(`[env] resolved appEnv=${v.appEnv} ok=${v.ok}`);
  for (const issue of v.issues) {
    const line = `[env] ${issue.level.toUpperCase()} ${issue.key}: ${issue.message}`;
    if (issue.level === "error") logger.error(line);
    else logger.warn(line);
  }
}

/**
 * Guard destructive/schema operations from running against a production
 * database unless explicitly allowed. Used by migration scripts.
 */
export function assertSafeMigrationTarget(env: NodeJS.ProcessEnv = process.env): void {
  const { url } = resolveDatabaseUrl(env);
  if (!url) return;
  if (isProductionDatabaseUrl(url, env) && !isTruthy(env.ALLOW_PRODUCTION_MIGRATIONS)) {
    throw new Error(
      `Refusing to run migrations against a production database (${redactDatabaseUrl(
        url,
      )}) without ALLOW_PRODUCTION_MIGRATIONS=true.`,
    );
  }
}
