import { storage } from "../../storage.js";

/**
 * AI Assistant configuration resolver.
 *
 * Values can come from two layers:
 *   1. Environment variables (the default — set in .env / deployment env)
 *   2. The app_settings table (DB override — editable from Settings → System)
 *
 * A stored row wins over the environment so admins can configure the
 * High-Intent Lead Screener without touching .env.
 */

export interface AiAssistantConfig {
  enabled: boolean;
  assistantId: string | null;
  /** Where the effective assistant ID came from. */
  source: "env" | "db" | "none";
  /** Where the effective feature flag came from. */
  featureSource: "env" | "db";
}

function parseBool(value: string | null | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

export async function getAiAssistantConfig(): Promise<AiAssistantConfig> {
  const envEnabled = parseBool(process.env.FEATURE_AI_ASSISTANT);
  const envAssistantId = String(process.env.TELNYX_AI_ASSISTANT_ID || "").trim() || null;

  let dbEnabled: boolean | null = null;
  let dbAssistantId: string | null = null;
  try {
    const [flag, id] = await Promise.all([
      storage.getAppSetting("FEATURE_AI_ASSISTANT"),
      storage.getAppSetting("TELNYX_AI_ASSISTANT_ID"),
    ]);
    if (flag !== null && flag !== undefined) dbEnabled = parseBool(flag);
    const trimmedId = String(id || "").trim();
    if (trimmedId) dbAssistantId = trimmedId;
  } catch (e) {
    // Table may not exist yet on a fresh DB — fall back to env, never block.
    console.error("getAiAssistantConfig: settings read failed (using env fallback):", e);
  }

  const enabled = dbEnabled !== null ? dbEnabled : envEnabled;
  const assistantId = dbAssistantId ?? envAssistantId;

  return {
    enabled,
    assistantId,
    source: assistantId ? (dbAssistantId ? "db" : "env") : "none",
    featureSource: dbEnabled !== null ? "db" : "env",
  };
}
