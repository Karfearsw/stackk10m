/**
 * server/sequences/builder.ts — Follow-up sequence validation (Ticket 14).
 *
 * Pure validation logic for sequence definitions. Keeps bad sequences out
 * of the database: no conflicting steps, valid timing, approved copy rules.
 */

export type SequenceChannel = "sms" | "email" | "call_task";

export interface SequenceStepInput {
  step_order?: number;
  channel: SequenceChannel;
  delay_hours?: number;
  subject?: string | null;
  body?: string | null;
}

export interface SequenceInput {
  name: string;
  description?: string | null;
  trigger_stage?: string | null;
  is_active?: boolean;
  steps: SequenceStepInput[];
}

export interface ValidationIssue {
  field: string;
  message: string;
}

const VALID_CHANNELS: SequenceChannel[] = ["sms", "email", "call_task"];
const MAX_STEPS = 20;
const MAX_DELAY_HOURS = 24 * 90; // 90 days per step cap
const MAX_BODY_LEN = 5000;
const MAX_SUBJECT_LEN = 255;

// Copy that must never appear in automated outreach.
const BLOCKED_PATTERNS: RegExp[] = [
  /\bguarantee[ds]?\b/i,
  /\bno[-\s]?risk\b/i,
  /\bact now\b/i,
  /\blimited[-\s]?time\b/i,
];

/**
 * Validate a full sequence definition. Returns a list of issues; an empty
 * list means the sequence is valid.
 */
export function validateSequence(input: SequenceInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const name = String(input.name || "").trim();
  if (!name) issues.push({ field: "name", message: "Sequence name is required." });
  if (name.length > 200) issues.push({ field: "name", message: "Name must be 200 characters or fewer." });

  const steps = Array.isArray(input.steps) ? input.steps : [];
  if (steps.length === 0) {
    issues.push({ field: "steps", message: "At least one step is required." });
    return issues;
  }
  if (steps.length > MAX_STEPS) {
    issues.push({ field: "steps", message: `A sequence may have at most ${MAX_STEPS} steps.` });
  }

  // No conflicting steps: two identical (channel + body) steps back-to-back
  // would spam the same message twice.
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const prefix = `steps[${i}]`;

    if (!VALID_CHANNELS.includes(s.channel)) {
      issues.push({ field: `${prefix}.channel`, message: `Channel must be one of: ${VALID_CHANNELS.join(", ")}.` });
    }

    const delay = s.delay_hours ?? 0;
    if (!Number.isFinite(delay) || delay < 0) {
      issues.push({ field: `${prefix}.delay_hours`, message: "Delay must be a non-negative number of hours." });
    } else if (delay > MAX_DELAY_HOURS) {
      issues.push({ field: `${prefix}.delay_hours`, message: `Delay may not exceed ${MAX_DELAY_HOURS} hours (90 days).` });
    }

    // First step can be immediate (delay 0); later steps should have spacing
    // so we don't blast multiple messages in the same hour.
    if (i > 0 && delay === 0) {
      const prev = steps[i - 1];
      if (prev.channel === s.channel && String(prev.body || "").trim() === String(s.body || "").trim()) {
        issues.push({
          field: `${prefix}`,
          message: "Conflicting step: duplicate channel + body back-to-back with no delay.",
        });
      }
    }

    if (s.channel === "email" && !String(s.subject || "").trim()) {
      issues.push({ field: `${prefix}.subject`, message: "Email steps require a subject." });
    }
    if (String(s.subject || "").length > MAX_SUBJECT_LEN) {
      issues.push({ field: `${prefix}.subject`, message: `Subject must be ${MAX_SUBJECT_LEN} characters or fewer.` });
    }

    const body = String(s.body || "");
    if (s.channel !== "call_task" && !body.trim()) {
      issues.push({ field: `${prefix}.body`, message: `${s.channel} steps require message body.` });
    }
    if (body.length > MAX_BODY_LEN) {
      issues.push({ field: `${prefix}.body`, message: `Body must be ${MAX_BODY_LEN} characters or fewer.` });
    }

    // Approved-copy gate: block deceptive sales language.
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(body) || pattern.test(String(s.subject || ""))) {
        issues.push({
          field: `${prefix}.body`,
          message: `Copy blocked by compliance filter (${pattern.source}). Rewrite without pressure/deceptive language.`,
        });
        break;
      }
    }

    // SMS length sanity (segments cost money; keep templates tight).
    if (s.channel === "sms" && body.length > 640) {
      issues.push({ field: `${prefix}.body`, message: "SMS body should be 640 characters or fewer (4 segments max)." });
    }
  }

  return issues;
}

/** Normalize steps into DB-ready rows with explicit ordering. */
export function normalizeSteps(steps: SequenceStepInput[]) {
  return steps.map((s, i) => ({
    step_order: Number.isInteger(s.step_order) ? (s.step_order as number) : i,
    channel: s.channel,
    delay_hours: Math.max(0, Math.floor(Number(s.delay_hours) || 0)),
    subject: s.subject?.trim() || null,
    body: s.body?.trim() || null,
  }));
}
