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
  // Buyer-specific outcomes — buyer workflow uses one taxonomy with lead
  // calls, so dialer wrap-up, quick log, and call audit all render identically.
  send_deal: "Send Deal",
  offer_expected: "Offer Expected",
  offer_submitted: "Offer Submitted",
  criteria_mismatch: "Criteria Mismatch",
  qualified_buyer: "Qualified Buyer",
  needs_info: "Needs More Info",
};

// Buyer pipeline (mirrors server BUYER_PIPELINE in shared-schema.ts)
export const BUYER_PIPELINE: Array<{ value: string; label: string; color: string }> = [
  { value: "new", label: "New", color: "bg-slate-100 text-slate-800" },
  { value: "attempting_contact", label: "Attempting Contact", color: "bg-sky-100 text-sky-800" },
  { value: "contacted", label: "Contacted", color: "bg-blue-100 text-blue-800" },
  { value: "qualified", label: "Qualified", color: "bg-indigo-100 text-indigo-800" },
  { value: "active_buyer", label: "Active Buyer", color: "bg-violet-100 text-violet-800" },
  { value: "offer_submitted", label: "Offer Submitted", color: "bg-amber-100 text-amber-800" },
  { value: "under_contract", label: "Under Contract", color: "bg-purple-100 text-purple-800" },
  { value: "closed", label: "Closed", color: "bg-emerald-100 text-emerald-800" },
  { value: "nurture", label: "Nurture", color: "bg-zinc-100 text-zinc-800" },
  { value: "do_not_contact", label: "Do Not Contact", color: "bg-red-100 text-red-800" },
];

export function formatBuyerStatus(value: string | null | undefined): string {
  return BUYER_PIPELINE.find((s) => s.value === value)?.label || String(value || "—");
}

export function buyerStatusColor(value: string | null | undefined): string {
  return BUYER_PIPELINE.find((s) => s.value === value)?.color || "bg-slate-100 text-slate-800";
}

// Dispositions that require a next action + date for buyer calls
// (mirrors server BUYER_DISPOSITIONS_REQUIRE_NEXT_ACTION).
export const BUYER_DISPOSITIONS_REQUIRE_NEXT_ACTION = new Set([
  "callback_requested", "send_deal", "offer_expected", "needs_info", "qualified_buyer",
]);

export function formatDisposition(value: string | null | undefined): string {
  if (!value) return "—";
  const v = String(value);
  return LABELS[v] || v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const DISPOSITION_LABELS = LABELS;
