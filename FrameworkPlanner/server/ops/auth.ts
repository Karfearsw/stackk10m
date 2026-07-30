import crypto from "node:crypto";

export function generateOpsAgentSecret() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashOpsAgentSecret(secret: string) {
  return crypto.createHash("sha256").update(String(secret || "")).digest("hex");
}

export function opsAgentSecretMatches(secret: string, secretHash: string | null | undefined) {
  const left = Buffer.from(hashOpsAgentSecret(secret), "utf8");
  const right = Buffer.from(String(secretHash || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function readBearerToken(headerValue: unknown) {
  const raw = String(headerValue || "").trim();
  if (!raw.toLowerCase().startsWith("bearer ")) return null;
  const token = raw.slice(7).trim();
  return token || null;
}
