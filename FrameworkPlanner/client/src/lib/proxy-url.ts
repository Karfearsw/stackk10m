/**
 * Rewrite a target URL to go through the server-side proxy
 * so iframe-blocking headers (X-Frame-Options, CSP frame-ancestors) are stripped.
 */
export function getProxiedUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  // Already a proxy URL — don't double-proxy
  if (trimmed.includes("/api/playground/proxy?url=")) return trimmed;
  return `/api/playground/proxy?url=${encodeURIComponent(trimmed)}`;
}
