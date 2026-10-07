/**
 * Ticket 8 — per-user dialer phone settings.
 *
 * Pure, dependency-free helpers so the validation rules are unit-testable and
 * shared by the API route and the dialing services. Each user chooses:
 *   - phoneE164:        the number their agent leg is dialed to (required for
 *                       human / AI-handoff calls).
 *   - callerIdE164:     the outbound number a lead sees (optional; falls back to
 *                       the platform default TELNYX_DEFAULT_FROM_NUMBER).
 *   - defaultCallMode:  how a click-to-dial call is handled.
 *   - recordingEnabled: whether calls placed by this user are recorded.
 */

export const E164_RE = /^\+[1-9]\d{1,14}$/;

export const CALL_MODES = ["human_first", "ai_screen", "ai_screen_handoff"] as const;
export type CallMode = (typeof CALL_MODES)[number];

export interface AgentPhoneSettings {
  phoneE164: string | null;
  callerIdE164: string | null;
  defaultCallMode: CallMode;
  recordingEnabled: boolean;
}

export const DEFAULT_AGENT_PHONE_SETTINGS: AgentPhoneSettings = {
  phoneE164: null,
  callerIdE164: null,
  defaultCallMode: "human_first",
  recordingEnabled: true,
};

export function isCallMode(value: unknown): value is CallMode {
  return CALL_MODES.includes(value as CallMode);
}

/**
 * Normalize a loosely formatted phone number to E.164, or null when it cannot
 * be resolved. Accepts 10-digit US numbers (prefixed with +1), 11-digit US
 * numbers starting with 1, and already-E.164 input.
 */
export function normalizePhone(input: unknown): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (raw.startsWith("+") && E164_RE.test(raw)) return raw;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  // Real E.164 numbers have at least 8 digits; shorter input is treated as junk.
  if (digits.length >= 8 && digits.length <= 15) {
    const prefixed = `+${digits}`;
    return E164_RE.test(prefixed) ? prefixed : null;
  }
  return null;
}

/**
 * Validate a settings payload. `requirePhone` defaults to true because a caller
 * ID-only save still needs the agent's own phone for two-leg dialing; callers
 * that only touch the caller ID may pass the current phone in `current`.
 *
 * Returns the normalized values plus any field errors. Callers should reject
 * the request when `errors` is non-empty so an invalid number is never stored.
 */
export function validateAgentPhoneSettings(
  input: Record<string, unknown> | null | undefined,
  current: AgentPhoneSettings = DEFAULT_AGENT_PHONE_SETTINGS,
  opts: { requirePhone?: boolean } = {},
): { values: AgentPhoneSettings; errors: string[] } {
  const body = input && typeof input === "object" ? input : {};
  const errors: string[] = [];
  const values: AgentPhoneSettings = { ...current };

  if ("phoneE164" in body) {
    const raw = body.phoneE164;
    if (raw === null || raw === undefined || String(raw).trim() === "") {
      values.phoneE164 = null;
    } else {
      const normalized = normalizePhone(raw);
      if (!normalized) errors.push("phoneE164 must be a valid E.164 number (e.g. +15551234567)");
      else values.phoneE164 = normalized;
    }
  }
  const requirePhone = opts.requirePhone !== false;
  if (requirePhone && !values.phoneE164) {
    errors.push("phoneE164 is required");
  }

  if ("callerIdE164" in body) {
    const raw = body.callerIdE164;
    if (raw === null || raw === undefined || String(raw).trim() === "") {
      values.callerIdE164 = null;
    } else {
      const normalized = normalizePhone(raw);
      if (!normalized) errors.push("callerIdE164 must be a valid E.164 number (e.g. +15551234567)");
      else values.callerIdE164 = normalized;
    }
  }

  if ("defaultCallMode" in body) {
    if (body.defaultCallMode === null || body.defaultCallMode === undefined) {
      values.defaultCallMode = current.defaultCallMode;
    } else if (!isCallMode(body.defaultCallMode)) {
      errors.push(`defaultCallMode must be one of: ${CALL_MODES.join(", ")}`);
    } else {
      values.defaultCallMode = body.defaultCallMode;
    }
  }

  if ("recordingEnabled" in body) {
    const raw = body.recordingEnabled;
    if (raw === undefined || raw === null) {
      values.recordingEnabled = current.recordingEnabled;
    } else if (typeof raw === "boolean") {
      values.recordingEnabled = raw;
    } else if (raw === "true" || raw === "false") {
      values.recordingEnabled = raw === "true";
    } else {
      errors.push("recordingEnabled must be a boolean");
    }
  }

  return { values, errors };
}

/** Serialize a stored row (nullable columns) into AgentPhoneSettings. */
export function settingsFromRow(
  row: {
    phoneE164?: string | null;
    callerIdE164?: string | null;
    defaultCallMode?: string | null;
    recordingEnabled?: boolean | null;
  } | null | undefined,
): AgentPhoneSettings {
  if (!row) return { ...DEFAULT_AGENT_PHONE_SETTINGS };
  return {
    phoneE164: row.phoneE164 ? String(row.phoneE164) : null,
    callerIdE164: row.callerIdE164 ? String(row.callerIdE164) : null,
    defaultCallMode: isCallMode(row.defaultCallMode) ? row.defaultCallMode : DEFAULT_AGENT_PHONE_SETTINGS.defaultCallMode,
    recordingEnabled: row.recordingEnabled ?? DEFAULT_AGENT_PHONE_SETTINGS.recordingEnabled,
  };
}

/** The caller ID a user's outbound calls should present, or the platform default. */
export function resolveCallerId(setting: { callerIdE164?: string | null } | null | undefined, platformDefault: string): string {
  const own = setting?.callerIdE164 ? String(setting.callerIdE164).trim() : "";
  return own || String(platformDefault || "").trim();
}
