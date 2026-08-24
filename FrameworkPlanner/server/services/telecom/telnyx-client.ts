import crypto from "node:crypto";

function readEnv(name: string): string {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : "";
}

export class TelnyxConfigError extends Error {
  missingEnv: string[];
  constructor(missing: string[]) {
    super(`Telnyx is not configured: missing ${missing.join(", ")}`);
    this.name = "TelnyxConfigError";
    this.missingEnv = missing;
  }
}

export type TelnyxDialInput = {
  to: string;
  from?: string;
  connectionId?: string;
};

export type TelnyxSmsInput = {
  to: string;
  body: string;
  from?: string;
  messagingProfileId?: string;
};

export type TelnyxClientOptions = {
  apiKey?: string;
  connectionId?: string;
  messagingProfileId?: string;
  defaultFrom?: string;
};

function isConnectionActive(conn: any): boolean {
  const rawState = String(conn?.state || conn?.status || "").trim().toLowerCase();
  return rawState === "active" || rawState === "online" || rawState === "ready";
}

export class TelnyxClient {
  private readonly apiKey: string;
  private readonly connectionId: string;
  private readonly messagingProfileId: string;
  private readonly defaultFrom: string;
  private readonly baseUrl = "https://api.telnyx.com/v2";

  constructor(opts: TelnyxClientOptions = {}) {
    this.apiKey = opts.apiKey || readEnv("TELNYX_API_KEY");
    this.connectionId = opts.connectionId || readEnv("TELNYX_CONNECTION_ID");
    this.messagingProfileId = opts.messagingProfileId || readEnv("TELNYX_MESSAGING_PROFILE_ID");
    this.defaultFrom = opts.defaultFrom || readEnv("TELNYX_DEFAULT_FROM_NUMBER");
  }

  private missingEnv(): string[] {
    const missing: string[] = [];
    if (!this.apiKey) missing.push("TELNYX_API_KEY");
    if (!this.connectionId) missing.push("TELNYX_CONNECTION_ID");
    if (!this.messagingProfileId) missing.push("TELNYX_MESSAGING_PROFILE_ID");
    if (!this.defaultFrom) missing.push("TELNYX_DEFAULT_FROM_NUMBER");
    return missing;
  }

  private requireReady(): void {
    const missing = this.missingEnv();
    if (missing.length) throw new TelnyxConfigError(missing);
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async dial(input: TelnyxDialInput): Promise<{ callControlId: string }> {
    this.requireReady();
    const from = input.from || this.defaultFrom;
    if (!from) throw new Error("Missing from number for outbound call");

    const body: Record<string, unknown> = {
      connection_id: input.connectionId || this.connectionId,
      to: input.to,
      from,
    };

    const res = await fetch(`${this.baseUrl}/calls`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const title = data?.errors?.[0]?.title || data?.error || data?.message || `Telnyx dial failed (${res.status})`;
      const detail = data?.errors?.[0]?.detail || data?.details || null;
      const code = data?.errors?.[0]?.code || data?.code || null;
      const hint = String(title).toLowerCase();
      let friendly = title;
      if (hint.includes("connection") || hint.includes("credential")) {
        friendly = `Invalid connection_id for Call Control API. TELNYX_CONNECTION_ID must be a Call Control Application ID, not a SIP Credential Connection ID. Create a Call Control Application in the Telnyx portal and use its connection_id.`;
      }
      const err = new Error(friendly) as any;
      err.status = res.status;
      err.code = code;
      err.detail = detail;
      throw err;
    }

    const callControlId = data?.data?.id || data?.call_control_id;
    if (!callControlId) throw new Error("Telnyx dial response missing call id");
    return { callControlId: String(callControlId) };
  }

  async hangup(callControlId: string): Promise<void> {
    this.requireReady();
    const res = await fetch(`${this.baseUrl}/calls/${encodeURIComponent(callControlId)}/actions/hangup`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const data: any = await res.json().catch(() => ({}));
      const title = data?.errors?.[0]?.title || data?.error || data?.message || `Telnyx hangup failed (${res.status})`;
      const detail = data?.errors?.[0]?.detail || data?.details || null;
      const code = data?.errors?.[0]?.code || data?.code || null;
      const err = new Error(title) as any;
      err.status = res.status;
      err.code = code;
      err.detail = detail;
      throw err;
    }
  }

  async sendSms(input: TelnyxSmsInput): Promise<{ messageId: string }> {
    this.requireReady();
    const from = input.from || this.defaultFrom;
    if (!from) throw new Error("Missing from number for SMS");

    const body: Record<string, unknown> = {
      from,
      to: input.to,
      body: input.body,
      messaging_profile_id: input.messagingProfileId || this.messagingProfileId,
    };

    const res = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const title = data?.errors?.[0]?.title || data?.error || data?.message || `Telnyx SMS failed (${res.status})`;
      const detail = data?.errors?.[0]?.detail || data?.details || null;
      const code = data?.errors?.[0]?.code || data?.code || null;
      const err = new Error(title) as any;
      err.status = res.status;
      err.code = code;
      err.detail = detail;
      throw err;
    }

    const messageId = data?.data?.id || data?.id;
    if (!messageId) throw new Error("Telnyx SMS response missing message id");
    return { messageId: String(messageId) };
  }

  async healthCheck(): Promise<{
    status: "reachable" | "unreachable" | "degraded" | "unconfigured";
    code: number | string | null;
    message: string;
    hint?: string;
    telnyxErrorCode?: string | null;
    connectionFound: boolean;
    connectionActive: boolean;
    httpStatus: number | null;
    missingEnv?: string[];
  }> {
    const missing = this.missingEnv();
    if (missing.length) {
      return {
        status: "unconfigured",
        code: "MISSING_CONFIG",
        message: `Telnyx is not configured: missing ${missing.join(", ")}`,
        connectionFound: false,
        connectionActive: false,
        httpStatus: null,
        missingEnv: missing,
      };
    }

    let httpStatus: number | null = null;
    let errorMessage: string = "";
    try {
      const res = await fetch(`${this.baseUrl}/connections`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });
      httpStatus = res.status;
      const data: any = await res.json().catch(() => ({}));

      if (res.status === 401 || res.status === 403) {
        const telnyxErrCode = data?.errors?.[0]?.code || null;
        const telnyxErrDetail = data?.errors?.[0]?.detail || null;
        const telnyxErrTitle = data?.errors?.[0]?.title || null;

        // Classify the specific auth failure from Telnyx error codes
        let classification = "INVALID_API_KEY";
        let hint = "Update TELNYX_API_KEY in Settings or .env and restart the server.";
        if (String(telnyxErrCode) === "10009") {
          classification = "MALFORMED_KEY";
          hint = "The API key appears malformed or truncated. Go to Telnyx Portal > Account > API Keys, generate a new V2 key, and replace TELNYX_API_KEY.";
        } else if (String(telnyxErrCode) === "20002") {
          classification = "REVOKED_KEY";
          hint = "This API key has been revoked. Generate a new key in the Telnyx portal.";
        } else if (String(telnyxErrCode) === "20008") {
          classification = "INVALID_KEY";
          hint = "The API key is invalid. Copy it fresh from the Telnyx portal API Keys page.";
        } else if (res.status === 403) {
          classification = "PERMISSION_DENIED";
          hint = "The key is valid but lacks permissions. Check key scope in the Telnyx portal.";
        }

        errorMessage = telnyxErrDetail || telnyxErrTitle || "Invalid Telnyx API key";
        return {
          status: "unreachable",
          code: classification,
          message: errorMessage,
          hint,
          telnyxErrorCode: telnyxErrCode,
          connectionFound: false,
          connectionActive: false,
          httpStatus,
        };
      }

      if (res.status === 429) {
        errorMessage = "Telnyx rate limit exceeded";
        return {
          status: "degraded",
          code: "RATE_LIMITED",
          message: errorMessage,
          connectionFound: false,
          connectionActive: false,
          httpStatus,
        };
      }

      if (res.status >= 500) {
        errorMessage = "Telnyx server error";
        return {
          status: "degraded",
          code: "PROVIDER_ERROR",
          message: errorMessage,
          connectionFound: false,
          connectionActive: false,
          httpStatus,
        };
      }

      if (!res.ok) {
        errorMessage = data?.errors?.[0]?.title || data?.message || `Telnyx connections fetch failed (${res.status})`;
        return {
          status: "unreachable",
          code: "UNREACHABLE",
          message: errorMessage,
          connectionFound: false,
          connectionActive: false,
          httpStatus,
        };
      }

      const connections: any[] = Array.isArray(data?.data) ? data.data : [];
      const target = connections.find((c) => String(c.id) === String(this.connectionId));

      if (!target) {
        errorMessage = `TELNYX_CONNECTION_ID (${this.connectionId}) not found among ${connections.length} connection(s) in this account`;
        return {
          status: "unreachable",
          code: "CONNECTION_NOT_FOUND",
          message: errorMessage,
          hint: "TELNYX_CONNECTION_ID must be a Call Control Application ID (numeric), not a SIP credential. Create or locate the correct app in Telnyx Portal > Voice > Call Control Applications.",
          connectionFound: false,
          connectionActive: false,
          httpStatus,
        };
      }

      const active = isConnectionActive(target);
      return {
        status: active ? "reachable" : "unreachable",
        code: active ? "OK" : "CONNECTION_INACTIVE",
        message: active ? "Connection is active" : `Connection state: ${String(target.state || target.status || "unknown")}`,
        connectionFound: true,
        connectionActive: active,
        httpStatus,
      };
    } catch (error: any) {
      const message = error?.message || String(error);
      const isTimeout = message.includes("timeout") || message.includes("ETIMEDOUT") || message.includes("ENOTFOUND");
      errorMessage = isTimeout ? "Telnyx connection timed out" : message;
      return {
        status: isTimeout ? "degraded" : "unreachable",
        code: isTimeout ? "TIMEOUT" : "UNREACHABLE",
        message: errorMessage,
        connectionFound: false,
        connectionActive: false,
        httpStatus: httpStatus,
      };
    }
  }

  diagnostics() {
    const apiKey = String(this.apiKey || "");
    const apiKeyPrefix = apiKey.length >= 6 ? apiKey.slice(0, 6) : apiKey;
    const publicKey = String(process.env.TELNYX_PUBLIC_KEY || "");
    const webhookUrl = String(process.env.TELNYX_WEBHOOK_URL || "");
    return {
      telnyxConfigured: Boolean(apiKey && this.connectionId && this.messagingProfileId && this.defaultFrom),
      apiKeyPrefix,
      usedPublicKey: publicKey.length > 0 && apiKey === publicKey,
      baseUrl: this.baseUrl,
      connectionId: this.connectionId,
      messagingProfileId: this.messagingProfileId,
      defaultFrom: this.defaultFrom,
      webhookUrl: webhookUrl || null,
    };
  }

  // ── Call Control Actions ──────────────────────────────────────────────

  async mute(callControlId: string, muted: boolean): Promise<void> {
    this.requireReady();
    const res = await fetch(
      `${this.baseUrl}/calls/${encodeURIComponent(callControlId)}/actions/mute`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ muted }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) {
      const data: any = await res.json().catch(() => ({}));
      const title = data?.errors?.[0]?.title || data?.message || `Telnyx mute failed (${res.status})`;
      const err = new Error(title) as any;
      err.status = res.status;
      throw err;
    }
  }

  async hold(callControlId: string): Promise<void> {
    this.requireReady();
    const res = await fetch(
      `${this.baseUrl}/calls/${encodeURIComponent(callControlId)}/actions/hold`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) {
      const data: any = await res.json().catch(() => ({}));
      const title = data?.errors?.[0]?.title || data?.message || `Telnyx hold failed (${res.status})`;
      const err = new Error(title) as any;
      err.status = res.status;
      throw err;
    }
  }

  async unhold(callControlId: string): Promise<void> {
    this.requireReady();
    const res = await fetch(
      `${this.baseUrl}/calls/${encodeURIComponent(callControlId)}/actions/unhold`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) {
      const data: any = await res.json().catch(() => ({}));
      const title = data?.errors?.[0]?.title || data?.message || `Telnyx unhold failed (${res.status})`;
      const err = new Error(title) as any;
      err.status = res.status;
      throw err;
    }
  }

  async transfer(callControlId: string, to: string): Promise<void> {
    this.requireReady();
    const res = await fetch(
      `${this.baseUrl}/calls/${encodeURIComponent(callControlId)}/actions/transfer`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ to }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) {
      const data: any = await res.json().catch(() => ({}));
      const title = data?.errors?.[0]?.title || data?.message || `Telnyx transfer failed (${res.status})`;
      const err = new Error(title) as any;
      err.status = res.status;
      throw err;
    }
  }

  // ── Webhook Signature Verification ────────────────────────────────────
  // Telnyx signs webhooks with HMAC-SHA256 using TELNYX_PUBLIC_KEY as the secret.
  // Header format: t=<timestamp>,v1=<hex_signature>

  verifyWebhookSignature(
    payload: string,
    signatureHeader: string,
    toleranceSeconds?: number,
  ): boolean {
    const publicKey = process.env.TELNYX_PUBLIC_KEY;
    if (!publicKey) return false;
    if (!payload || !signatureHeader) return false;

    try {
      const tolerance = toleranceSeconds ?? Number(process.env.TELNYX_WEBHOOK_SIGNING_TOLERANCE_SECONDS || "300");

      // Parse header: t=<timestamp>,v1=<hex_signature>,v0=<older_signature>
      const parts = String(signatureHeader).split(",").map((p) => p.trim());
      const timestampStr = parts.find((p) => p.startsWith("t="));
      const v1Sig = parts.find((p) => p.startsWith("v1="));

      if (!timestampStr || !v1Sig) return false;

      const timestamp = parseInt(timestampStr.slice(2), 10);
      if (Number.isNaN(timestamp)) return false;

      // Check timestamp tolerance
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - timestamp) > tolerance) return false;

      // Compute HMAC-SHA256 of `{timestamp}.{payload}` using the public key
      const signedContent = `${timestamp}.${payload}`;
      const expectedSig = crypto
        .createHmac("sha256", publicKey)
        .update(signedContent)
        .digest("hex");

      const receivedSig = v1Sig.slice(3); // strip "v1="

      // Constant-time comparison
      if (expectedSig.length !== receivedSig.length) return false;
      return crypto.timingSafeEqual(
        Buffer.from(expectedSig, "hex"),
        Buffer.from(receivedSig, "hex"),
      );
    } catch {
      return false;
    }
  }
}

export const telnyx = new TelnyxClient();
export { createTelnyxWebhookRouter } from "./webhook-router.js";
