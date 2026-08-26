import { telnyx } from "./telnyx-client.js";
import { isDocumentVaultConfigured } from "../../media/documentVault.js";
import { getAiAssistantConfig } from "./ai-config.js";

// ── Types ──────────────────────────────────────────────────────────────────

export type ChannelStatus = "healthy" | "unconfigured" | "unavailable" | "degraded";

export type VoiceReadiness = {
  configured: boolean;
  reachable: boolean;
  connectionFound: boolean;
  connectionActive: boolean;
  connectionType: "call_control_application" | "sip_credential" | "unknown";
  fromNumbers: string[];
  defaultFromNumber: string | null;
  blocker?: string;
};

export type SmsReadiness = {
  configured: boolean;
  reachable: boolean;
  messagingProfilePresent: boolean;
  defaultFromNumber: string | null;
  blocker?: string;
};

export type VideoReadiness = {
  configured: boolean;
  reachable: boolean;
  roomsApiAvailable: boolean;
  blocker?: string;
};

export type EmailReadiness = {
  configured: boolean;
  activeProvider: "resend" | "telnyx" | null;
  fromAddress: string | null;
  fromName: string | null;
  telnyxEssionEnabled: boolean;
  telnyxEmailReachable: boolean;
  blocker?: string;
};

export type DocumentStorageReadiness = {
  configured: boolean;
  blocker?: string;
};

export type WebhookReadiness = {
  configured: boolean;
  publicUrlPresent: boolean;
  blocker?: string;
};

export type AiAssistantReadiness = {
  configured: boolean;
  featureEnabled: boolean;
  assistantIdPresent: boolean;
  assistantIdHint: string | null;
  /** Where the effective assistant ID / feature flag came from (env or saved settings). */
  configSource: "env" | "db" | "none";
  featureSource: "env" | "db";
  blocker?: string;
};

export type ProviderReadiness = {
  voice: VoiceReadiness;
  sms: SmsReadiness;
  video: VideoReadiness;
  email: EmailReadiness;
  documentStorage: DocumentStorageReadiness;
  webhook: WebhookReadiness;
  aiAssistant: AiAssistantReadiness;
  featureFlags: Record<string, boolean>;
  overallStatus: ChannelStatus;
  checkedAt: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function has(key: string): boolean {
  const v = process.env[key];
  return Boolean(v && String(v).trim() !== "");
}

function envStr(key: string): string | null {
  const v = process.env[key];
  if (!v || String(v).trim() === "") return null;
  return String(v).trim();
}

function parseBoolFlag(val: string | undefined): boolean {
  if (!val) return false;
  const s = val.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function detectConnectionType(
  connectionId: string,
): "call_control_application" | "sip_credential" | "unknown" {
  if (/^\d+$/.test(connectionId)) return "call_control_application";
  if (
    !/^\d+$/.test(connectionId) &&
    /^[0-9a-fA-F-]{20,}$/.test(connectionId) &&
    connectionId.includes("-")
  ) {
    return "sip_credential";
  }
  return "unknown";
}

function parseJsonNumbers(): string[] {
  const raw = process.env.DIALER_NUMBERS_JSON;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {}
  return [];
}

// ── Channel checks ─────────────────────────────────────────────────────────

async function checkVoice(): Promise<VoiceReadiness> {
  const apiKey = envStr("TELNYX_API_KEY");
  const connectionId = envStr("TELNYX_CONNECTION_ID");
  const defaultFrom = envStr("TELNYX_DEFAULT_FROM_NUMBER");
  const numbers = parseJsonNumbers();

  const configured = Boolean(apiKey && connectionId);

  if (!configured) {
    const missing: string[] = [];
    if (!apiKey) missing.push("TELNYX_API_KEY");
    if (!connectionId) missing.push("TELNYX_CONNECTION_ID");
    return {
      configured: false,
      reachable: false,
      connectionFound: false,
      connectionActive: false,
      connectionType: "unknown",
      fromNumbers: numbers,
      defaultFromNumber: defaultFrom,
      blocker: `Missing: ${missing.join(", ")}. Add these in Settings → System.`,
    };
  }

  const health = await telnyx.healthCheck();
  const connType = detectConnectionType(connectionId!);

  let blocker: string | undefined;
  if (connType === "sip_credential") {
    blocker =
      "TELNYX_CONNECTION_ID appears to be a SIP Credential Connection ID. " +
      "Dialing via /v2/calls requires a Call Control Application ID (numeric). " +
      "Create a Call Control Application in the Telnyx portal and use its connection_id.";
  } else if (health.status === "unreachable" && health.code) {
    // Use the specific hint from the health check (MALFORMED_KEY, REVOKED_KEY, INVALID_KEY, etc.)
    blocker = (health as any).hint || `Telnyx API error (${health.code}): ${health.message}`;
  }

  return {
    configured: true,
    reachable: health.status === "reachable",
    connectionFound: health.connectionFound,
    connectionActive: health.connectionActive,
    connectionType: connType,
    fromNumbers: numbers,
    defaultFromNumber: defaultFrom,
    blocker,
  };
}

function checkSms(): SmsReadiness {
  const apiKey = has("TELNYX_API_KEY");
  const messagingProfileId = envStr("TELNYX_MESSAGING_PROFILE_ID");
  const defaultFrom = envStr("TELNYX_DEFAULT_FROM_NUMBER");
  const configured = Boolean(apiKey && messagingProfileId);

  let blocker: string | undefined;
  if (!messagingProfileId) {
    blocker = "TELNYX_MESSAGING_PROFILE_ID is missing. SMS will not send.";
  }

  return {
    configured,
    reachable: configured,
    messagingProfilePresent: Boolean(messagingProfileId),
    defaultFromNumber: defaultFrom,
    blocker,
  };
}

function checkVideo(): VideoReadiness {
  const configured = parseBoolFlag(process.env.TELNYX_VIDEO_ENABLED);
  const apiKey = has("TELNYX_API_KEY");

  if (!apiKey) {
    return {
      configured: false,
      reachable: false,
      roomsApiAvailable: false,
      blocker: "TELNYX_API_KEY is required for Video rooms.",
    };
  }

  if (!configured) {
    return {
      configured: false,
      reachable: false,
      roomsApiAvailable: false,
      blocker:
        "Telnyx Video is not enabled. Confirm Video API access in the Telnyx portal, " +
        "then set TELNYX_VIDEO_ENABLED=true.",
    };
  }

  return {
    configured: true,
    reachable: true,
    roomsApiAvailable: true,
  };
}

function checkEmail(): EmailReadiness {
  const resendKey = has("RESEND_API_KEY");
  const resendFrom = envStr("RESEND_FROM");
  const telnyxEmailEnabled = parseBoolFlag(process.env.TELNYX_EMAIL_ENABLED);
  const telnyxApiKey = has("TELNYX_API_KEY");
  const emailFromAddress = envStr("EMAIL_FROM_ADDRESS");
  const emailFromName = envStr("EMAIL_FROM_NAME");

  const activeProvider: "resend" | "telnyx" | null =
    telnyxEmailEnabled && telnyxApiKey ? "telnyx" : resendKey ? "resend" : null;

  const configured = activeProvider !== null;
  const fromAddress = emailFromAddress || resendFrom || null;

  let blocker: string | undefined;
  if (!configured) {
    blocker =
      "No email provider configured. Set RESEND_API_KEY + RESEND_FROM for Resend, " +
      "or TELNYX_EMAIL_ENABLED=true for Telnyx Email API.";
  } else if (!fromAddress) {
    blocker = "Email from address not configured. Set RESEND_FROM or EMAIL_FROM_ADDRESS.";
  }

  return {
    configured,
    activeProvider,
    fromAddress,
    fromName: emailFromName || null,
    telnyxEssionEnabled: telnyxEmailEnabled,
    telnyxEmailReachable: false, // requires actual probe in future
    blocker,
  };
}

function checkDocumentStorage(): DocumentStorageReadiness {
  const configured = isDocumentVaultConfigured();
  return {
    configured,
    blocker: configured
      ? undefined
      : "Document storage not configured. Set DOCUMENTS_BUCKET + DOCUMENTS_REGION.",
  };
}

function checkWebhook(): WebhookReadiness {
  const webhookUrl = envStr("TELNYX_WEBHOOK_URL");
  return {
    configured: Boolean(webhookUrl),
    publicUrlPresent: Boolean(webhookUrl),
    blocker: webhookUrl
      ? undefined
      : "TELNYX_WEBHOOK_URL is missing. Call events and inbound SMS will not be received.",
  };
}

async function checkAiAssistant(): Promise<AiAssistantReadiness> {
  const apiKey = has("TELNYX_API_KEY");
  const config = await getAiAssistantConfig();
  const featureEnabled = config.enabled;
  const assistantId = config.assistantId;

  let blocker: string | undefined;
  if (!apiKey) {
    blocker = "TELNYX_API_KEY is required to start AI assistants on calls.";
  } else if (!featureEnabled) {
    blocker =
      "FEATURE_AI_ASSISTANT is off. Enable the AI lead screener in Settings → System (AI Assistant) or set FEATURE_AI_ASSISTANT=true.";
  } else if (!assistantId) {
    blocker =
      "TELNYX_AI_ASSISTANT_ID is missing. Copy the Assistant ID from Telnyx AI Assistants (High-Intent Lead Screener).";
  }

  return {
    configured: Boolean(apiKey && featureEnabled),
    featureEnabled,
    assistantIdPresent: Boolean(assistantId),
    assistantIdHint: assistantId ? `${assistantId.slice(0, 8)}…` : null,
    configSource: config.source,
    featureSource: config.featureSource,
    blocker,
  };
}

function checkFeatureFlags(): Record<string, boolean> {
  return {
    esign: parseBoolFlag(process.env.FEATURE_ESIGN),
    video_meetings: parseBoolFlag(process.env.FEATURE_VIDEO_MEETINGS),
    public_listings: parseBoolFlag(process.env.FEATURE_PUBLIC_LISTINGS),
    rvm: parseBoolFlag(process.env.FEATURE_RVM),
    skip_trace: parseBoolFlag(process.env.FEATURE_SKIP_TRACE),
    campaigns: parseBoolFlag(process.env.FEATURE_CAMPAIGNS),
    field_mode: parseBoolFlag(process.env.FEATURE_FIELD_MODE),
    comps: parseBoolFlag(process.env.FEATURE_COMPS),
    buyer_match: parseBoolFlag(process.env.FEATURE_BUYER_MATCH),
    voice_playground: parseBoolFlag(process.env.FEATURE_VOICE_PLAYGROUND),
    ai_assistant: parseBoolFlag(process.env.FEATURE_AI_ASSISTANT),
  };
}

// ── Main ───────────────────────────────────────────────────────────────────

export async function getProviderReadiness(): Promise<ProviderReadiness> {
  const [voice, sms, video, email, documentStorage, webhook, aiAssistant] = await Promise.all([
    checkVoice(),
    Promise.resolve(checkSms()),
    Promise.resolve(checkVideo()),
    Promise.resolve(checkEmail()),
    Promise.resolve(checkDocumentStorage()),
    Promise.resolve(checkWebhook()),
    checkAiAssistant(),
  ]);

  const featureFlags = checkFeatureFlags();

  // Determine overall status
  const channelStatuses: ChannelStatus[] = [];
  const toStatus = (r: { configured: boolean; reachable?: boolean; blocker?: string }): ChannelStatus => {
    if (!r.configured) return "unconfigured";
    if (r.blocker) return "unavailable";
    if (r.reachable === false) return "unavailable";
    return "healthy";
  };
  channelStatuses.push(toStatus(voice));
  channelStatuses.push(toStatus(sms));
  channelStatuses.push(toStatus(video));
  channelStatuses.push(toStatus(email));
  channelStatuses.push(toStatus(aiAssistant));

  let overallStatus: ChannelStatus = "healthy";
  if (channelStatuses.includes("unavailable")) overallStatus = "unavailable";
  else if (channelStatuses.includes("unconfigured")) overallStatus = "unconfigured";
  else if (channelStatuses.includes("degraded")) overallStatus = "degraded";

  return {
    voice,
    sms,
    video,
    email,
    documentStorage,
    webhook,
    aiAssistant,
    featureFlags,
    overallStatus,
    checkedAt: new Date().toISOString(),
  };
}
