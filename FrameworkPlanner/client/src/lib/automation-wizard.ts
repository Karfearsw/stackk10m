/**
 * Pure helpers for the guided Automation Wizard (Settings -> Automation).
 * Builds the exact payload shape the automation API/engine expects, so the
 * UI never needs to ask users to write raw JSON. Unit-testable in node.
 */

export type AutomationTriggerDef = { value: string; label: string; description: string };
export type AutomationActionDef = {
  value: string;
  label: string;
  description: string;
  fields: { key: string; label: string; type: "text" | "number" | "select"; options?: { value: string; label: string }[]; default?: string | number }[];
};

export const AUTOMATION_TRIGGERS: AutomationTriggerDef[] = [
  { value: "lead.created", label: "Lead created", description: "A new lead is created" },
  { value: "lead.status_changed", label: "Lead status changed", description: "A lead moves to a new status" },
  { value: "opportunity.created", label: "Opportunity created", description: "A new opportunity is created" },
  { value: "opportunity.stage_changed", label: "Opportunity stage changed", description: "An opportunity moves to a new pipeline stage" },
  { value: "opportunity.status_changed", label: "Opportunity status changed", description: "An opportunity status changes (active, on hold, …)" },
  { value: "task.overdue", label: "Task overdue", description: "A task passes its due date" },
  { value: "listing.published", label: "Listing published", description: "A public listing is published" },
  { value: "listing.paused", label: "Listing paused/archived", description: "A listing is paused or archived" },
  { value: "inquiry.received", label: "Buyer inquiry received", description: "A buyer submits an inquiry on a listing" },
  { value: "offer.received", label: "Buyer offer received", description: "A buyer offer is created" },
  { value: "offer.accepted", label: "Buyer offer accepted", description: "A buyer offer is accepted" },
  { value: "contract.sent", label: "Contract sent", description: "A contract is sent for signature" },
  { value: "contract.viewed", label: "Contract viewed", description: "A signer views a sent contract" },
  { value: "contract.signed", label: "Contract signed/executed", description: "A contract is fully signed" },
  { value: "calendar.upcoming", label: "Calendar event upcoming", description: "A calendar event is approaching" },
  { value: "sms.inbound", label: "Inbound SMS received", description: "An inbound SMS message arrives" },
];

export const AUTOMATION_ACTIONS: AutomationActionDef[] = [
  {
    value: "task.create",
    label: "Create a task",
    description: "Create a follow-up task assigned to the actor or a team member",
    fields: [
      { key: "title", label: "Task title", type: "text", default: "Follow up" },
      { key: "dueInMinutes", label: "Due in (minutes)", type: "number", default: 60 },
      { key: "assignTo", label: "Assign to", type: "select", options: [{ value: "actor", label: "The person who triggered it" }], default: "actor" },
    ],
  },
  {
    value: "notification.create",
    label: "Notify someone",
    description: "Send an in-app notification",
    fields: [
      { key: "title", label: "Notification title", type: "text", default: "Action needed" },
      { key: "description", label: "Description", type: "text", default: "" },
      { key: "toUserId", label: "Notify", type: "select", options: [{ value: "actor", label: "The person who triggered it" }], default: "actor" },
    ],
  },
  {
    value: "webhook.post",
    label: "Call a webhook",
    description: "POST to an external URL (advanced)",
    fields: [
      { key: "url", label: "Webhook URL", type: "text", default: "" },
      { key: "timeoutMs", label: "Timeout (ms)", type: "number", default: 5000 },
    ],
  },
  {
    value: "tag.add",
    label: "Add a tag",
    description: "Add a tag to the triggering record",
    fields: [
      { key: "tag", label: "Tag name", type: "text", default: "" },
    ],
  },
  {
    value: "tag.remove",
    label: "Remove a tag",
    description: "Remove a tag from the triggering record",
    fields: [
      { key: "tag", label: "Tag name", type: "text", default: "" },
    ],
  },
  {
    value: "stage.change",
    label: "Change pipeline stage",
    description: "Move an opportunity to a new pipeline stage",
    fields: [
      { key: "stage", label: "Target stage", type: "select", options: [
        { value: "lead", label: "Lead" },
        { value: "contacted", label: "Contacted" },
        { value: "negotiating", label: "Negotiating" },
        { value: "under_contract", label: "Under Contract" },
        { value: "in_disposition", label: "In Disposition" },
        { value: "reserved", label: "Reserved" },
        { value: "sold", label: "Sold" },
        { value: "closed", label: "Closed" },
        { value: "dead", label: "Dead" },
        { value: "voided", label: "Voided" },
      ], default: "contacted" },
    ],
  },
  {
    value: "message.internal",
    label: "Send internal message",
    description: "Send an internal team message (not SMS)",
    fields: [
      { key: "title", label: "Subject", type: "text", default: "Internal message" },
      { key: "description", label: "Body", type: "text", default: "" },
      { key: "toUserId", label: "Recipient", type: "select", options: [{ value: "actor", label: "The person who triggered it" }], default: "actor" },
    ],
  },
];

export const AUTOMATION_CONDITION_FIELDS = [
  { value: "lead.source", label: "Lead source" },
  { value: "lead.status", label: "Lead status" },
  { value: "lead.score", label: "Lead score" },
  { value: "opportunity.stage", label: "Opportunity stage" },
  { value: "opportunity.status", label: "Opportunity status" },
  { value: "tag", label: "Tag" },
  { value: "lead.dnc", label: "Lead DNC/opt-out" },
  { value: "listing.status", label: "Listing status" },
  { value: "inquiry.status", label: "Inquiry status" },
  { value: "offer.amount", label: "Offer amount" },
  { value: "contract.status", label: "Contract status" },
  { value: "property.state", label: "Property state" },
  { value: "property.type", label: "Property type" },
];

export type WizardCondition = { field: string; op: "eq" | "gte" | "lte"; value: string };
export type WizardAction = { actionType: string; config: Record<string, string | number> };

export type AutomationWizardInput = {
  name: string;
  description: string;
  enabled: boolean;
  trigger: string;
  conditions: WizardCondition[];
  actions: WizardAction[];
};

/**
 * Build the exact payload accepted by POST /api/automations.
 * Config objects are serialized server-side into configJson; sending plain
 * objects keeps the wizard independent of the storage format.
 */
export function buildAutomationPayload(input: AutomationWizardInput) {
  const conditions = (input.conditions || []).filter((c) => c.field && c.value.trim() !== "");
  return {
    name: input.name.trim(),
    description: input.description.trim() || null,
    enabled: input.enabled,
    triggers: [{ eventType: input.trigger, config: {} }],
    condition: { op: "and", rules: conditions.map((c) => ({ field: c.field, op: c.op, value: c.value.trim() })) },
    actions: (input.actions || []).map((a, idx) => ({ actionType: a.actionType, config: a.config, sortOrder: idx })),
  };
}

function triggerLabel(value: string) {
  return AUTOMATION_TRIGGERS.find((t) => t.value === value)?.label || value;
}

function conditionText(c: WizardCondition) {
  const field = AUTOMATION_CONDITION_FIELDS.find((f) => f.value === c.field)?.label || c.field;
  const op = c.op === "gte" ? "is at least" : c.op === "lte" ? "is at most" : "is";
  return `${field} ${op} “${String(c.value || "").trim()}”`;
}

function actionText(a: WizardAction) {
  const def = AUTOMATION_ACTIONS.find((d) => d.value === a.actionType);
  if (!def) return a.actionType;
  const title = a.config.title ? ` “${a.config.title}”` : "";
  return `${def.label.toLowerCase()}${title}`;
}

/** Plain-language summary: “When X happens, if Y, then do Z.” */
export function describeAutomation(input: AutomationWizardInput): string {
  const when = `When ${triggerLabel(input.trigger).toLowerCase()} happens`;
  const ifs = (input.conditions || []).filter((c) => c.field && c.value.trim() !== "");
  const thens = (input.actions || []).filter((a) => a.actionType);
  let summary = when;
  if (ifs.length) summary += `, if ${ifs.map(conditionText).join(" and ")}`;
  if (thens.length) summary += `, then ${thens.map(actionText).join(", ")}`;
  return `${summary}.`;
}

function parseJson<T = unknown>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw === "object") return raw as T;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

/** Human-readable labels for existing automations in the list/view UI. */
export function describeStoredAutomation(input: {
  triggers?: { eventType?: string }[];
  condition?: { rules?: { field?: string; op?: string; value?: string }[]; configJson?: string };
  actions?: { actionType?: string; config?: Record<string, unknown>; configJson?: string }[];
}): string {
  const when = `When ${triggerLabel(input.triggers?.[0]?.eventType || "an event").toLowerCase()} happens`;
  const condition = parseJson<{ rules?: { field?: string; op?: string; value?: string }[] }>(
    input.condition?.configJson,
    (input.condition as { rules?: { field?: string; op?: string; value?: string }[] }) || {}
  );
  const rules = (condition?.rules || []).filter((r) => r.field && r.value);
  const acts = (input.actions || []).filter((a) => a.actionType);
  let s = when;
  if (rules.length) s += `, if ${rules.map((r) => conditionText({ field: r.field || "", op: (r.op as WizardCondition["op"]) || "eq", value: r.value || "" })).join(" and ")}`;
  if (acts.length)
    s += `, then ${acts
      .map((a) => {
        const config = parseJson<Record<string, string | number>>(a.configJson, (a.config || {}) as Record<string, string | number>);
        return actionText({ actionType: a.actionType || "", config });
      })
      .join(", ")}`;
  return `${s}.`;
}
