import { lookup as dnsLookup } from "node:dns/promises";

/**
 * SSRF guards for the in-app browser proxy (/api/playground/proxy) and
 * reader-mode extraction (/api/playground/extract).
 *
 * Threat model: an authenticated user asks the server to fetch an arbitrary
 * URL. Hostname blocklists alone are bypassable via DNS rebinding (an
 * attacker-controlled domain resolving to an internal IP), so we resolve the
 * hostname and reject private results. Residual TOCTOU between check and
 * fetch is accepted for this in-house tool.
 */

/** True for IPv4/IPv6 private, loopback, link-local, reserved, and multicast ranges. */
export function isPrivateIpAddress(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [, a, b] = v4.map(Number);
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. cloud metadata)
    if (a === 0) return true; // 0.0.0.0/8
    if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
    return false;
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::1" || v6 === "::") return true;
  if (v6.startsWith("fe80:")) return true; // link-local
  if (v6.startsWith("fc") || v6.startsWith("fd")) return true; // unique local
  if (v6.startsWith("ff")) return true; // multicast
  return false;
}

/** Hostname-layer blocklist (fast path before DNS). */
export function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h.startsWith("192.168.") ||
    h.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h.endsWith(".local") ||
    h.endsWith(".internal")
  );
}

/**
 * DNS-level SSRF guard: returns false if the hostname resolves to any
 * private/loopback/link-local address, or if it doesn't resolve at all.
 */
export async function assertPublicHostname(hostname: string): Promise<boolean> {
  if (/^[\d.]+$/.test(hostname) || hostname.includes(":")) {
    return !isPrivateIpAddress(hostname);
  }
  try {
    const records = await dnsLookup(hostname, { all: true });
    if (!records.length) return false;
    return records.every((r) => !isPrivateIpAddress(r.address));
  } catch {
    return false; // unresolvable — refuse
  }
}

/** Read a fetch Response body with a hard byte cap. Throws on overflow. */
export async function readBodyWithCap(upstream: Response, cap: number): Promise<Buffer> {
  const declared = Number(upstream.headers.get("content-length") || 0);
  if (declared > cap) throw new Error(`Response too large (${declared} bytes, cap ${cap})`);
  const reader = upstream.body?.getReader();
  if (!reader) {
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > cap) throw new Error(`Response too large (${buf.length} bytes, cap ${cap})`);
    return buf;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      try {
        await reader.cancel();
      } catch {}
      throw new Error(`Response too large (>${cap} bytes)`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
