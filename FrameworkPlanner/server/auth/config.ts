import { databaseUrlResolution } from "../db.js";

function isNonEmpty(v: unknown) {
  return Boolean(typeof v === "string" ? v.trim() : String(v ?? "").trim());
}

export function getSessionSecretMissing(): string[] {
  if (process.env.NODE_ENV !== "production") return [];
  if (isNonEmpty(process.env.SESSION_SECRET)) return [];
  return ["env:SESSION_SECRET"];
}

export function getDatabaseUrlMissing(): string[] {
  if (process.env.NODE_ENV !== "production") return [];
  const resolved = databaseUrlResolution();
  if (resolved.url && String(resolved.url).trim()) return [];
  return [
    "env:DATABASE_URL",
    "env:POSTGRES_URL_NON_POOLING",
    "env:POSTGRES_PRISMA_URL",
    "env:POSTGRES_URL",
  ];
}

export function getSignupCodesMissing(): string[] {
  if (process.env.NODE_ENV !== "production") return [];
  const legacyEmployeeCode = String(process.env.EMPLOYEE_ACCESS_CODE || "").trim();
  if (legacyEmployeeCode) return [];
  const adminCode = String(process.env.ADMIN_ROLE_CODE || "").trim();
  const teamLeaderCode = String(process.env.TEAM_LEADER_ROLE_CODE || "").trim();
  const agentCode = String(process.env.AGENT_ROLE_CODE || "").trim();
  const vaCode = String(process.env.VA_ROLE_CODE || "").trim();
  if (adminCode && teamLeaderCode && agentCode && vaCode) return [];
  return [
    "env:EMPLOYEE_ACCESS_CODE",
    "env:ADMIN_ROLE_CODE",
    "env:TEAM_LEADER_ROLE_CODE",
    "env:AGENT_ROLE_CODE",
    "env:VA_ROLE_CODE",
  ];
}

export function getEmailProviderMissing(): string[] {
  if (process.env.NODE_ENV !== "production") return [];
  const missing: string[] = [];
  if (!isNonEmpty(process.env.RESEND_API_KEY)) missing.push("env:RESEND_API_KEY");
  if (!isNonEmpty(process.env.RESEND_FROM)) missing.push("env:RESEND_FROM");
  return missing;
}

export function getOrgEmailDomainMissing(): string[] {
  if (process.env.NODE_ENV !== "production") return [];
  if (isNonEmpty(process.env.ORG_EMAIL_DOMAIN)) return [];
  return ["env:ORG_EMAIL_DOMAIN"];
}

export function getAuthStatusSnapshot(): { ok: boolean; nodeEnv: string; missing: string[] } {
  const missing = [
    ...getSessionSecretMissing(),
    ...getDatabaseUrlMissing(),
    ...getSignupCodesMissing(),
    ...getEmailProviderMissing(),
    ...getOrgEmailDomainMissing(),
  ];
  return {
    ok: missing.length === 0,
    nodeEnv: String(process.env.NODE_ENV || "development"),
    missing,
  };
}
