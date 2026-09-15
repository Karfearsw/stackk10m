// Human-readable labels for task types. Raw snake_case values like
// "follow_up" were rendering verbatim on task cards (MOB-5).

const LABELS: Record<string, string> = {
  general: "General",
  follow_up: "Follow Up",
  call: "Call",
  sms: "SMS",
  email: "Email",
  meeting: "Meeting",
  viewing: "Viewing",
  offer: "Offer",
  closing: "Closing",
  document: "Document",
  reminder: "Reminder",
};

export function formatTaskType(value: string | null | undefined): string {
  if (!value) return "General";
  const v = String(value);
  return LABELS[v] || v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
