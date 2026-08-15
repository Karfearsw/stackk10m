function requireEnv(name: string) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`${name} is not configured`);
  return String(v).trim();
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
    this.apiKey = opts.apiKey || requireEnv("TELNYX_API_KEY");
    this.connectionId = opts.connectionId || requireEnv("TELNYX_CONNECTION_ID");
    this.messagingProfileId = opts.messagingProfileId || requireEnv("TELNYX_MESSAGING_PROFILE_ID");
    this.defaultFrom = opts.defaultFrom || process.env.TELNYX_DEFAULT_FROM_NUMBER || "";
    if (!this.defaultFrom) throw new Error("TELNYX_DEFAULT_FROM_NUMBER is not configured");
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async dial(input: TelnyxDialInput): Promise<{ callControlId: string }> {
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
    status: "reachable" | "unreachable" | "degraded";
    code: number | null;
    message: string;
    connectionFound: boolean;
    connectionActive: boolean;
    httpStatus: number | null;
  }> {
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
        errorMessage = "Invalid Telnyx API key";
        return {
          status: "unreachable",
          code: res.status,
          message: errorMessage,
          connectionFound: false,
          connectionActive: false,
          httpStatus,
        };
      }

      if (res.status === 429) {
        errorMessage = "Telnyx rate limit exceeded";
        return {
          status: "degraded",
          code: res.status,
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
          code: res.status,
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
          code: res.status,
          message: errorMessage,
          connectionFound: false,
          connectionActive: false,
          httpStatus,
        };
      }

      const connections: any[] = Array.isArray(data?.data) ? data.data : [];
      const target = connections.find((c) => String(c.id) === String(this.connectionId));

      if (!target) {
        errorMessage = `Connection ${this.connectionId} not found in account`;
        return {
          status: "unreachable",
          code: 404,
          message: errorMessage,
          connectionFound: false,
          connectionActive: false,
          httpStatus,
        };
      }

      const active = isConnectionActive(target);
      return {
        status: active ? "reachable" : "unreachable",
        code: 200,
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
        code: null,
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

  verifyWebhookSignature(payload: string, signature: string, toleranceSeconds?: number): boolean {
    const publicKey = process.env.TELNYX_PUBLIC_KEY;
    if (!publicKey) return false;
    // Webhook verification requires a JWS/JWT library; for now we return true if key exists
    // and the payload/signature are present. Replace with proper verification in production.
    return Boolean(publicKey && payload && signature);
  }
}

export const telnyx = new TelnyxClient();
export { createTelnyxWebhookRouter } from "./webhook-router.js";
