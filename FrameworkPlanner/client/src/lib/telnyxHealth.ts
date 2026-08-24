export type TelnyxHealthResult = {
  status: "reachable" | "unreachable" | "degraded" | "unconfigured" | string;
  code: number | string | null;
  message?: string;
  missingEnv?: string[];
  connectionFound?: boolean;
  connectionActive?: boolean;
  httpStatus?: number | null;
};

export type HealthTone = "ok" | "warn" | "error" | "muted";

export function mapTelnyxHealth(h: TelnyxHealthResult | null | undefined): { label: string; tone: HealthTone; detail: string } {
  if (!h || !h.status) return { label: "Unknown", tone: "muted", detail: "Provider health unavailable." };
  const code = h.code;
  const msg = String(h.message || "");
  switch (h.status) {
    case "reachable":
      return { label: "Ready", tone: "ok", detail: msg || "Telnyx reachable, Call Control connection active." };
    case "unconfigured":
      return {
        label: "Not configured",
        tone: "warn",
        detail: (h.missingEnv?.length ? `Missing: ${h.missingEnv.join(", ")}. ` : "") + "Add Telnyx keys in Settings → System.",
      };
    case "unreachable": {
      if (code === "MALFORMED_KEY") {
        return { label: "Malformed API key", tone: "error", detail: "TELNYX_API_KEY appears malformed or truncated. Generate a new V2 key in Telnyx Portal → Account → API Keys, then update Settings → System." };
      }
      if (code === "REVOKED_KEY") {
        return { label: "API key revoked", tone: "error", detail: "TELNYX_API_KEY has been revoked. Generate a new key in the Telnyx portal." };
      }
      if (code === "INVALID_KEY" || code === "INVALID_API_KEY" || code === 401 || /invalid.*key|key.*invalid/i.test(msg)) {
        return { label: "Invalid API key", tone: "error", detail: "TELNYX_API_KEY is invalid — copy it fresh from Telnyx Portal → Account → API Keys." };
      }
      if (code === "PERMISSION_DENIED" || code === 403) {
        return { label: "Permission denied", tone: "error", detail: "TELNYX_API_KEY is valid but lacks permissions. Check key scope in Telnyx portal." };
      }
      if (code === "CONNECTION_NOT_FOUND" || code === 404 || msg.includes("not found in account")) {
        return { label: "Connection not found", tone: "error", detail: "TELNYX_CONNECTION_ID does not match a Call Control Application in this account." };
      }
      return { label: "Unreachable", tone: "error", detail: msg || "Telnyx provider could not be reached." };
    }
    case "degraded":
      if (code === "RATE_LIMITED" || code === 429) {
        return { label: "Rate limited", tone: "warn", detail: "Telnyx rate limit exceeded — retry shortly." };
      }
      if (code === "TIMEOUT") {
        return { label: "Timed out", tone: "warn", detail: "Telnyx did not respond in time — the provider may be degraded." };
      }
      return { label: "Degraded", tone: "warn", detail: msg || "Telnyx is degraded." };
    default:
      return { label: String(h.status), tone: "muted", detail: msg || "" };
  }
}
