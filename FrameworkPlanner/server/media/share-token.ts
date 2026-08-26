import crypto from "node:crypto";

// ── Media share tokens ─────────────────────────────────────────────────────
// Short-lived HMAC-signed URLs used for:
//   - MMS media_urls (Telnyx fetches them server-side; no cookies)
//   - link_fallback SMS (secure link when media is too large for MMS)
//   - guest/share links from the UI
// Tokens encode { mediaId, purpose, exp } and are verified without any
// database lookup, so the open route stays fast and stateless.

function secret(): string {
  return String(process.env.SESSION_SECRET || "dev-secret-change-me");
}

export function signMediaToken(input: { mediaId: number; purpose: "mms" | "link" | "share"; ttlSeconds: number }): string {
  const exp = Math.floor(Date.now() / 1000) + input.ttlSeconds;
  const payload = `${input.mediaId}:${input.purpose}:${exp}`;
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("hex").slice(0, 32);
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

export function verifyMediaToken(token: string): { mediaId: number; purpose: string; exp: number } | null {
  try {
    const [enc, sig] = String(token || "").split(".");
    if (!enc || !sig) return null;
    const payload = Buffer.from(enc, "base64url").toString("utf8");
    const parts = payload.split(":");
    const mediaIdStr = parts[0];
    const purpose = parts[1];
    const expStr = parts[2];
    const expected = crypto.createHmac("sha256", secret()).update(payload).digest("hex").slice(0, 32);
    const a = Buffer.from(String(sig));
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const mediaId = Number(mediaIdStr);
    const exp = Number(expStr);
    if (!Number.isInteger(mediaId) || mediaId <= 0 || !Number.isFinite(exp)) return null;
    if (exp < Math.floor(Date.now() / 1000)) return null;
    return { mediaId, purpose: String(purpose || ""), exp };
  } catch {
    return null;
  }
}

export function mediaShareBaseUrl(): string {
  return String(process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || "")
    .trim()
    .replace(/\/+$/, "");
}

export function makeMediaShareUrl(input: { mediaId: number; purpose: "mms" | "link" | "share"; ttlSeconds?: number }): string {
  const ttl = input.ttlSeconds ?? (input.purpose === "mms" ? 48 * 60 * 60 : 7 * 24 * 60 * 60);
  const token = signMediaToken({ mediaId: input.mediaId, purpose: input.purpose, ttlSeconds: ttl });
  const base = mediaShareBaseUrl();
  return `${base}/api/media/open/${token}`;
}
