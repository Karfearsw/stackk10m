// Human-readable labels for the canonical call disposition taxonomy
// (server: ALLOWED_DISPOSITIONS in services/telecom/call-sessions.ts).
// Raw enum values like "callback_requested" were showing up verbatim in the
// dialer, call audit, and call panel UI.

const LABELS: Record<string, string> = {
  connected: "Connected",
  qualified: "Qualified",
  qualified_handoff: "Qualified — Handoff",
  callback_requested: "Callback Requested",
  voicemail: "Voicemail",
  no_answer: "No Answer",
  busy: "Busy",
  wrong_number_confirmed: "Wrong Number (Confirmed)",
  wrong_number_review: "Wrong Number (Review)",
  not_interested: "Not Interested",
  do_not_call: "Do Not Call",
  invalid_number: "Invalid Number",
  failed: "Failed",
  abandoned: "Abandoned",
  agent_unavailable: "Agent Unavailable",
  bridge_failed: "Bridge Failed",
};

export function formatDisposition(value: string | null | undefined): string {
  if (!value) return "—";
  const v = String(value);
  return LABELS[v] || v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const DISPOSITION_LABELS = LABELS;
