type DatabaseUrlIssue = { name: string; reason: string };
export type DatabaseUrlResolution = { url: string | undefined; source: string | null; issues: DatabaseUrlIssue[] };

export const runtimeDatabaseEnvNames = [
  "DATABASE_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
] as const;

export const migrationsDatabaseEnvNames = [
  "MIGRATIONS_DATABASE_URL",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
] as const;

export function sanitizeDatabaseUrl(input: string | undefined): string | undefined {
  if (!input) return input;
  try {
    const u = new URL(input);
    const channelBinding = (u.searchParams.get("channel_binding") || "").toLowerCase();
    if (channelBinding === "require") {
      u.searchParams.delete("channel_binding");
      return u.toString();
    }
    return input;
  } catch {
    return undefined;
  }
}

export function redactDbUrlForLogs(input: string) {
  try {
    const u = new URL(input);
    const db = u.pathname ? u.pathname.replace(/^\//, "") : "";
    return { host: u.host, db };
  } catch {
    return { host: null, db: null };
  }
}

function isValidPostgresUrl(input: string | undefined): boolean {
  if (!input) return false;
  try {
    const u = new URL(input);
    return u.protocol === "postgres:" || u.protocol === "postgresql:";
  } catch {
    return false;
  }
}

export function resolveDatabaseUrlFromEnv(names: readonly string[]): DatabaseUrlResolution {
  const issues: DatabaseUrlIssue[] = [];
  for (const name of names) {
    const raw = String(process.env[name] ?? "").trim();
    if (!raw) continue;

    if (!isValidPostgresUrl(raw)) {
      issues.push({ name, reason: "invalid_url" });
      continue;
    }

    const sanitized = sanitizeDatabaseUrl(raw);
    if (!sanitized) {
      issues.push({ name, reason: "invalid_url" });
      continue;
    }

    return { url: sanitized, source: name, issues };
  }

  return { url: undefined, source: null, issues };
}

export function shouldUseSsl(connectionString: string | undefined) {
  if (!connectionString) return false;
  try {
    const u = new URL(connectionString);
    const sslmode = (u.searchParams.get("sslmode") || process.env.PGSSLMODE || "").toLowerCase();
    if (sslmode === "require" || sslmode === "verify-full" || sslmode === "verify-ca") return true;
    if (u.hostname.endsWith(".neon.tech")) return true;
    return false;
  } catch {
    return false;
  }
}

export function sslOptionsFor(connectionString: string | undefined) {
  const useSsl = shouldUseSsl(connectionString);
  if (!useSsl) return undefined;
  const raw = String(process.env.DB_SSL_REJECT_UNAUTHORIZED ?? "").trim().toLowerCase();
  const rejectUnauthorized = raw ? raw === "1" || raw === "true" || raw === "yes" || raw === "on" : true;
  return { rejectUnauthorized };
}

