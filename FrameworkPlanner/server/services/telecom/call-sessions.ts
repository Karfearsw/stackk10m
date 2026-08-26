import { telnyx } from "./telnyx-client.js";
import { storage } from "../../storage.js";
import { createTask } from "../tasks/task-service.js";
import { getAiAssistantConfig } from "./ai-config.js";
import { emitTelephonyEventToAll } from "../../telephony/ws.js";

// ── Types ──────────────────────────────────────────────────────────────────

export type CallMode = "human_first" | "ai_screen" | "ai_screen_handoff";

export type SessionStatus =
  | "queued" | "validation_failed"
  | "agent_dialing" | "agent_ringing" | "agent_answered"
  | "lead_dialing" | "lead_ringing" | "ai_screening"
  | "handoff_requested" | "handoff_agent_dialing"
  | "bridging" | "connected" | "completed" | "failed" | "cancelled";

const TERMINAL = new Set<string>(["completed", "failed", "cancelled", "validation_failed"]);
const E164 = /^\+[1-9]\d{1,14}$/;

export const ALLOWED_DISPOSITIONS = new Set<string>([
  "connected", "qualified", "qualified_handoff", "callback_requested", "voicemail",
  "no_answer", "busy", "wrong_number_confirmed", "wrong_number_review", "not_interested",
  "do_not_call", "invalid_number", "failed", "abandoned", "agent_unavailable", "bridge_failed",
]);

// ── Feature flags (default ON unless explicitly disabled) ─────────────────

function flag(name: string): boolean {
  const v = String(process.env[name] || "").trim().toLowerCase();
  if (v === "") return true;
  return ["1", "true", "yes", "on"].includes(v);
}
export function twoLegEnabled(): boolean { return flag("ENABLE_TWO_LEG_CLICK_TO_DIAL"); }
export function aiScreeningEnabled(): boolean { return flag("ENABLE_AI_SCREENING"); }
export function aiHandoffEnabled(): boolean { return flag("ENABLE_AI_HUMAN_HANDOFF"); }

export async function getCallFeatures() {
  return { twoLeg: twoLegEnabled(), aiScreening: aiScreeningEnabled(), aiHandoff: aiHandoffEnabled() };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function defaultFrom(): string { return String(process.env.TELNYX_DEFAULT_FROM_NUMBER || "").trim(); }

async function recordEvent(
  sessionId: number, eventType: string, fromStatus: string | null, toStatus: string | null,
  metadata: any = {}, actorUserId?: number,
) {
  try {
    await storage.createCallSessionEvent({
      sessionId, eventType,
      fromStatus: fromStatus ?? null, toStatus: toStatus ?? null,
      metadata: metadata ? JSON.stringify(metadata) : null,
      actorUserId: actorUserId ?? null,
    } as any);
  } catch (e) {
    console.error("recordEvent failed:", e);
  }
}

async function createActivity(session: any, action: string, description: string, metadata: any = {}) {
  try {
    await storage.createGlobalActivity({
      userId: session.initiatingUserId || session.assignedAgentUserId || 0,
      action, description,
      metadata: JSON.stringify({ sessionId: session.id, leadId: session.leadId || undefined, ...metadata }),
    } as any);
  } catch (e) {
    console.error("createActivity failed:", e);
  }
}

function emitSession(session: any) {
  try {
    emitTelephonyEventToAll({
      type: "call_session_state_changed",
      payload: {
        sessionId: session.id, status: session.status, mode: session.mode,
        leadId: session.leadId, finalDisposition: session.finalDisposition || null,
      },
    } as any);
  } catch {
    // never throw from emit
  }
}

export function canAccessSession(user: any, session: any): boolean {
  if (!session) return false;
  return Boolean(
    user?.isSuperAdmin ||
    Number(session.initiatingUserId) === Number(user?.id) ||
    Number(session.assignedAgentUserId) === Number(user?.id),
  );
}
// ── Session creation ───────────────────────────────────────────────────────

export async function createCallSession(input: {
  leadId: number; mode: CallMode; userId: number; agentUserId?: number; campaignId?: number;
}): Promise<{ ok: true; session: any } | { ok: false; status: number; code: string; error: string }> {
  const mode = input.mode;
  if (!["human_first", "ai_screen", "ai_screen_handoff"].includes(mode)) {
    return { ok: false, status: 400, code: "INVALID_MODE", error: "mode must be human_first | ai_screen | ai_screen_handoff" };
  }
  if (!twoLegEnabled()) {
    return { ok: false, status: 403, code: "TWO_LEG_DISABLED", error: "Two-legged click-to-dial is disabled." };
  }
  if (mode === "ai_screen" && !aiScreeningEnabled()) {
    return { ok: false, status: 403, code: "AI_SCREENING_DISABLED", error: "AI screening is disabled." };
  }
  if (mode === "ai_screen_handoff" && (!aiScreeningEnabled() || !aiHandoffEnabled())) {
    return { ok: false, status: 403, code: "AI_HANDOFF_DISABLED", error: "AI + human handoff is disabled." };
  }

  const lead = await storage.getLeadById(input.leadId);
  if (!lead) return { ok: false, status: 404, code: "LEAD_NOT_FOUND", error: "Lead not found" };
  const leadPhone = String(lead.ownerPhone || "").trim();
  if (!E164.test(leadPhone)) {
    return { ok: false, status: 400, code: "INVALID_LEAD_PHONE", error: "Lead phone must be E.164" };
  }
  if (lead.doNotCall) {
    return { ok: false, status: 403, code: "DO_NOT_CALL", error: "This lead is marked Do Not Call." };
  }

  const agentUserId = input.agentUserId || input.userId;
  let agentPhone = "";
  try {
    const setting = await storage.getAgentPhoneSetting(agentUserId);
    agentPhone = String(setting?.phoneE164 || "").trim();
  } catch {
    agentPhone = "";
  }
  if (!agentPhone) agentPhone = String(process.env.TELNYX_AGENT_PHONE || "").trim();
  if ((mode === "human_first" || mode === "ai_screen_handoff") && !E164.test(agentPhone)) {
    return { ok: false, status: 400, code: "AGENT_PHONE_REQUIRED", error: "Your agent phone number must be set (E.164) before dialing." };
  }

  const session = await storage.createCallSession({
    leadId: lead.id,
    campaignId: input.campaignId || null,
    initiatingUserId: input.userId,
    assignedAgentUserId: agentUserId,
    mode,
    status: "queued",
    agentPhoneE164: agentPhone || null,
    leadPhoneE164: leadPhone,
    providerName: "telnyx",
    idempotencyKey: `crm_${lead.id}_${mode}_${input.userId}_${Date.now()}`,
  } as any);

  await recordEvent(session.id, "session_created", null, "queued", { mode, leadId: lead.id }, input.userId);
  return startCallSession(session.id);
}
// ── Start (dial the first leg) ─────────────────────────────────────────────

export async function startCallSession(
  sessionId: number,
): Promise<{ ok: true; session: any } | { ok: false; status: number; code: string; error: string }> {
  const s = await storage.getCallSessionById(sessionId);
  if (!s) return { ok: false, status: 404, code: "SESSION_NOT_FOUND", error: "Call session not found" };
  if (s.status !== "queued") return { ok: false, status: 409, code: "SESSION_STARTED", error: "Session already started" };

  const needsAgent = s.mode === "human_first"; // AI modes dial the lead first; handoff dials the agent later
  const to = needsAgent ? s.agentPhoneE164 : s.leadPhoneE164;
  const connectionId = String(process.env.TELNYX_CONNECTION_ID || "");
  try {
    const { callControlId } = await telnyx.dial({ to: String(to || ""), from: defaultFrom(), connectionId });
    const patch: any = needsAgent
      ? { status: "agent_dialing", agentLegCallControlId: callControlId, startedAt: new Date(), providerConnectionId: connectionId }
      : { status: "lead_dialing", leadLegCallControlId: callControlId, startedAt: new Date(), providerConnectionId: connectionId };
    await storage.updateCallSession(s.id, patch);
    await recordEvent(s.id, "session_started", "queued", patch.status, { leg: needsAgent ? "agent" : "lead", callControlId }, s.initiatingUserId ?? undefined);
    const updated = await storage.getCallSessionById(s.id);
    emitSession(updated);
    return { ok: true, session: updated };
  } catch (e: any) {
    const msg = String(e?.message || e || "Failed to place call");
    await storage.updateCallSession(s.id, { status: "failed", endedAt: new Date(), finalDisposition: "failed", providerHangupCause: "dial_error" });
    await recordEvent(s.id, "session_failed", s.status, "failed", { error: msg }, s.initiatingUserId ?? undefined);
    await createActivity(s, "call_failed", `Outbound dial failed: ${msg}`, { mode: s.mode });
    const updated = await storage.getCallSessionById(s.id);
    emitSession(updated);
    return { ok: false, status: 502, code: "DIAL_ERROR", error: msg };
  }
}
// ── Webhook-driven state machine ──────────────────────────────────────────
// Transitions are driven ONLY by validated Telnyx call.* events. The legacy
// call-log handler still runs alongside for the single-leg dialer surfaces.

export async function handleWebhookEvent(event: any): Promise<void> {
  const eventType = String(event?.data?.event_type || event?.event_type || "");
  if (!eventType.startsWith("call.")) return;
  const payload = event?.data?.payload || event?.data || event;
  const callControlId = String(payload.call_control_id || "");
  if (!callControlId) return;

  let session: any = null;
  try {
    session = await storage.getCallSessionByLegCallControlId(callControlId);
  } catch {
    session = null;
  }
  if (!session || TERMINAL.has(session.status)) return;

  const leg =
    session.agentLegCallControlId === callControlId ? "agent"
    : session.leadLegCallControlId === callControlId ? "lead"
    : null;
  if (!leg) return;

  try {
    if (eventType === "call.ringing" || eventType === "call.initiated") await onLegRinging(session, leg);
    else if (eventType === "call.answered") await onLegAnswered(session, leg);
    else if (eventType === "call.bridged") await onLegBridged(session, leg);
    else if (eventType === "call.hangup") await onLegHangup(session, leg, payload);
  } catch (e) {
    console.error("call-session webhook error:", e);
  }
}

async function patchStatus(session: any, status: string, eventType: string, extra: any = {}) {
  await storage.updateCallSession(session.id, { status, ...extra });
  await recordEvent(session.id, eventType, session.status, status);
  emitSession(await storage.getCallSessionById(session.id));
}

async function onLegRinging(session: any, leg: string) {
  if (leg === "agent" && session.status === "agent_dialing") {
    await patchStatus(session, "agent_ringing", "agent_leg_ringing");
  } else if (leg === "lead" && session.status === "lead_dialing") {
    await patchStatus(session, "lead_ringing", "lead_leg_ringing");
  }
}

async function onLegAnswered(session: any, leg: string) {
  if (leg === "agent") {
    // Handoff path: the lead leg is already live, bridge immediately.
    if (session.status === "handoff_agent_dialing" || session.status === "handoff_requested") {
      await patchStatus(session, "agent_answered", "handoff_agent_answered", { agentAnsweredAt: new Date() });
      await bridgeLegs(session);
      return;
    }
    if (session.status !== "agent_dialing" && session.status !== "agent_ringing") return;
    if (session.leadLegCallControlId) return; // guard: one lead leg per session
    await patchStatus(session, "agent_answered", "agent_answered", { agentAnsweredAt: new Date() });
    const connectionId = String(process.env.TELNYX_CONNECTION_ID || "");
    try {
      const { callControlId } = await telnyx.dial({
        to: String(session.leadPhoneE164 || ""), from: defaultFrom(), connectionId,
      });
      await storage.updateCallSession(session.id, { leadLegCallControlId: callControlId, status: "lead_dialing" });
      await recordEvent(session.id, "lead_leg_dialed", "agent_answered", "lead_dialing", { callControlId });
      emitSession(await storage.getCallSessionById(session.id));
    } catch (e: any) {
      await failSession(session, "DIAL_ERROR", `Failed to dial lead: ${String(e?.message || e)}`);
    }
    return;
  }
  // Lead leg answered.
  if (session.status !== "lead_dialing" && session.status !== "lead_ringing") return;
  if (session.leadAnsweredAt) return; // idempotent: never double-bridge
  const aiMode = session.mode === "ai_screen" || session.mode === "ai_screen_handoff";
  await patchStatus(session, aiMode ? "ai_screening" : "bridging", "lead_answered", { leadAnsweredAt: new Date() });
  if (aiMode) {
    await startAiOnSession(session);
    return;
  }
  await bridgeLegs(session);
}

export async function bridgeLegs(session: any): Promise<boolean> {
  if (!session.agentLegCallControlId || !session.leadLegCallControlId) return false;
  if (session.bridgeRequestId) return false; // exactly one bridge request per session
  const bridgeRequestId = `crm_${session.id}_${Date.now()}`;
  try {
    await storage.updateCallSession(session.id, { bridgeRequestId, status: "bridging" });
    await recordEvent(session.id, "bridge_requested", session.status, "bridging", { bridgeRequestId });
    await telnyx.bridge(session.agentLegCallControlId, session.leadLegCallControlId, { commandId: bridgeRequestId });
    emitSession(await storage.getCallSessionById(session.id));
    return true;
  } catch (e: any) {
    await storage.updateCallSession(session.id, { status: "failed", finalDisposition: "bridge_failed", endedAt: new Date() });
    await recordEvent(session.id, "bridge_failed", session.status, "failed", { error: String(e?.message || e) });
    await createActivity(session, "call_failed", `Bridge failed: ${String(e?.message || e)}`);
    emitSession(await storage.getCallSessionById(session.id));
    return false;
  }
}

async function onLegBridged(session: any, leg: string) {
  if (session.status !== "bridging") return;
  await patchStatus(session, "connected", "connected", { bridgedAt: new Date() });
  await createActivity(session, "call_connected", `Call connected (${leg} leg bridged)`, { leg });
}

async function onLegHangup(session: any, leg: string, payload: any) {
  const cause =
    String(payload.hangup_cause || payload.cause || payload.sip_hangup_cause || "").trim() || null;
  if (session.status === "connected") {
    await completeSession(session, cause, "connected");
    return;
  }
  const otherLegId = leg === "agent" ? session.leadLegCallControlId : session.agentLegCallControlId;
  if (otherLegId) {
    try { await telnyx.hangup(otherLegId); } catch { /* best effort */ }
  }
  const disposition = leg === "agent"
    ? "agent_unavailable"
    : cause === "busy" ? "busy"
    : cause === "no-answer" || cause === "no_answer" ? "no_answer"
    : "abandoned";
  await completeSession(session, cause, disposition);
}

async function completeSession(session: any, cause: string | null, disposition: string) {
  const endedAt = new Date();
  const startedAt = session.startedAt ? new Date(session.startedAt) : null;
  const durationSeconds = startedAt ? Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)) : null;
  await storage.updateCallSession(session.id, {
    status: "completed", endedAt, durationSeconds,
    finalDisposition: disposition, providerHangupCause: cause,
  });
  await recordEvent(session.id, "session_completed", session.status, "completed", { cause, disposition, durationSeconds });
  await createActivity(session, "call_completed", `Call ${disposition} (${cause || "hangup"})`, { disposition, cause, durationSeconds });
  emitSession(await storage.getCallSessionById(session.id));
}

async function failSession(session: any, code: string, error: string) {
  await storage.updateCallSession(session.id, { status: "failed", endedAt: new Date(), finalDisposition: "failed", providerHangupCause: code });
  await recordEvent(session.id, "session_failed", session.status, "failed", { code, error });
  await createActivity(session, "call_failed", error, { code });
  emitSession(await storage.getCallSessionById(session.id));
}

async function startAiOnSession(session: any) {
  const cfg = await getAiAssistantConfig();
  if (!cfg.enabled || !cfg.assistantId || !session.leadLegCallControlId) {
    await recordEvent(session.id, "ai_skipped", session.status, session.status, { reason: "not_configured" });
    return;
  }
  try {
    await telnyx.startAiAssistant(session.leadLegCallControlId, cfg.assistantId);
    await storage.updateCallSession(session.id, { aiLegCallControlId: session.leadLegCallControlId });
    await recordEvent(session.id, "ai_started", session.status, session.status, { assistantId: cfg.assistantId });
  } catch (e: any) {
    await recordEvent(session.id, "ai_start_failed", session.status, session.status, { error: String(e?.message || e) });
  }
}
// ── Manual control: cancel / hangup / human handoff ───────────────────────

export async function cancelOrHangupSession(
  sessionId: number, userId: number, opts: { hangup?: boolean } = {},
): Promise<{ ok: true; session: any } | { ok: false; status: number; code: string; error: string }> {
  const s = await storage.getCallSessionById(sessionId);
  if (!s) return { ok: false, status: 404, code: "SESSION_NOT_FOUND", error: "Call session not found" };
  if (!canAccessSession({ id: userId, isSuperAdmin: false }, s)) {
    return { ok: false, status: 403, code: "FORBIDDEN", error: "You do not have access to this call session" };
  }
  if (TERMINAL.has(s.status)) {
    return { ok: false, status: 409, code: "SESSION_TERMINAL", error: `Session already ${s.status}` };
  }

  if (opts.hangup && s.status === "connected") {
    const leg = s.agentLegCallControlId || s.leadLegCallControlId;
    if (leg) { try { await telnyx.hangup(leg); } catch { /* best effort */ } }
    await completeSession(s, "agent-hangup", "connected");
    return { ok: true, session: await storage.getCallSessionById(s.id) };
  }

  for (const legId of [s.agentLegCallControlId, s.leadLegCallControlId]) {
    if (legId) { try { await telnyx.hangup(legId); } catch { /* best effort */ } }
  }
  await storage.updateCallSession(s.id, { status: "cancelled", endedAt: new Date(), finalDisposition: "abandoned" });
  await recordEvent(s.id, "session_cancelled", s.status, "cancelled", {}, userId);
  await createActivity(s, "call_cancelled", "Call session cancelled before connection", {});
  emitSession(await storage.getCallSessionById(s.id));
  return { ok: true, session: await storage.getCallSessionById(s.id) };
}

export async function requestHumanHandoff(
  sessionId: number, userId: number,
): Promise<{ ok: true; session: any } | { ok: false; status: number; code: string; error: string }> {
  const s = await storage.getCallSessionById(sessionId);
  if (!s) return { ok: false, status: 404, code: "SESSION_NOT_FOUND", error: "Call session not found" };
  if (!canAccessSession({ id: userId, isSuperAdmin: false }, s)) {
    return { ok: false, status: 403, code: "FORBIDDEN", error: "You do not have access to this call session" };
  }
  if (s.status !== "ai_screening") {
    return { ok: false, status: 409, code: "NOT_SCREENING", error: `Human handoff is only available while AI is screening (status: ${s.status})` };
  }
  const agentPhone = String(s.agentPhoneE164 || "").trim();
  if (!E164.test(agentPhone)) {
    await recordEvent(s.id, "handoff_unavailable", s.status, s.status, { reason: "no_agent_phone" });
    await createActivity(s, "handoff_unavailable", "Human handoff unavailable: no agent phone configured", {});
    emitSession(await storage.getCallSessionById(s.id));
    return { ok: false, status: 400, code: "AGENT_PHONE_REQUIRED", error: "Agent phone must be set before human handoff" };
  }
  await storage.updateCallSession(s.id, { status: "handoff_requested" });
  await recordEvent(s.id, "handoff_requested", s.status, "handoff_requested", {}, userId);
  await createActivity(s, "handoff_requested", "AI screening requested human handoff", {});
  const connectionId = String(process.env.TELNYX_CONNECTION_ID || "");
  try {
    const { callControlId } = await telnyx.dial({ to: agentPhone, from: defaultFrom(), connectionId });
    await storage.updateCallSession(s.id, { agentLegCallControlId: callControlId, status: "handoff_agent_dialing" });
    await recordEvent(s.id, "handoff_agent_dialed", "handoff_requested", "handoff_agent_dialing", { callControlId });
    emitSession(await storage.getCallSessionById(s.id));
    return { ok: true, session: await storage.getCallSessionById(s.id) };
  } catch (e: any) {
    await storage.updateCallSession(s.id, { status: "handoff_requested" });
    await recordEvent(s.id, "handoff_agent_dial_failed", "handoff_requested", "handoff_requested", { error: String(e?.message || e) });
    await createActivity(s, "handoff_unavailable", `Handoff agent dial failed: ${String(e?.message || e)}`, {});
    return { ok: false, status: 502, code: "DIAL_ERROR", error: String(e?.message || e) };
  }
}
// ── Disposition / notes / callback / getters / AI qualification ───────────

export async function setDisposition(
  sessionId: number, userId: number,
  input: { disposition: string; note?: string; confidence?: string },
): Promise<{ ok: true; session: any } | { ok: false; status: number; code: string; error: string }> {
  const s = await storage.getCallSessionById(sessionId);
  if (!s) return { ok: false, status: 404, code: "SESSION_NOT_FOUND", error: "Call session not found" };
  if (!canAccessSession({ id: userId, isSuperAdmin: false }, s)) {
    return { ok: false, status: 403, code: "FORBIDDEN", error: "You do not have access to this call session" };
  }
  if (!ALLOWED_DISPOSITIONS.has(input.disposition)) {
    return { ok: false, status: 400, code: "INVALID_DISPOSITION", error: `disposition must be one of: ${[...ALLOWED_DISPOSITIONS].join(", ")}` };
  }
  await storage.createCallDisposition({
    sessionId, disposition: input.disposition,
    confidence: input.confidence || "high", source: "agent",
    note: input.note || null, actorUserId: userId,
  } as any);
  if (input.disposition === "do_not_call" && s.leadId) {
    try {
      await storage.updateLead(s.leadId, { doNotCall: true } as any);
      await createActivity(s, "do_not_call", "Marked Do Not Call from call disposition", { source: "agent" });
    } catch (e) { console.error("DNC update failed:", e); }
  }
  await storage.updateCallSession(s.id, { finalDisposition: input.disposition });
  await recordEvent(s.id, "disposition_set", s.status, s.status, { disposition: input.disposition, note: input.note || null }, userId);
  await createActivity(s, "call_dispositioned", `Call dispositioned: ${input.disposition}`, { disposition: input.disposition });
  emitSession(await storage.getCallSessionById(s.id));
  return { ok: true, session: await storage.getCallSessionById(s.id) };
}

export async function addSessionNote(sessionId: number, userId: number, note: string): Promise<{ ok: true } | { ok: false; status: number; code: string; error: string }> {
  const s = await storage.getCallSessionById(sessionId);
  if (!s) return { ok: false, status: 404, code: "SESSION_NOT_FOUND", error: "Call session not found" };
  if (!canAccessSession({ id: userId, isSuperAdmin: false }, s)) return { ok: false, status: 403, code: "FORBIDDEN", error: "Forbidden" };
  if (!String(note || "").trim()) return { ok: false, status: 400, code: "NOTE_REQUIRED", error: "note is required" };
  await recordEvent(s.id, "agent_note", s.status, s.status, { note }, userId);
  await createActivity(s, "call_note", `Note: ${note}`, {});
  return { ok: true };
}

export async function scheduleCallback(sessionId: number, userId: number, input: { dueAt: string; note?: string }): Promise<{ ok: true; taskId?: number } | { ok: false; status: number; code: string; error: string }> {
  const s = await storage.getCallSessionById(sessionId);
  if (!s) return { ok: false, status: 404, code: "SESSION_NOT_FOUND", error: "Call session not found" };
  if (!canAccessSession({ id: userId, isSuperAdmin: false }, s)) return { ok: false, status: 403, code: "FORBIDDEN", error: "Forbidden" };
  const dueAt = new Date(input.dueAt);
  if (Number.isNaN(dueAt.getTime())) return { ok: false, status: 400, code: "INVALID_DUE_AT", error: "dueAt must be a valid ISO timestamp" };
  const task = await createTask({
    title: `Callback: ${s.leadPhoneE164}`,
    description: input.note || `Follow-up callback for call session ${s.id}`,
    type: "callback",
    relatedEntityType: "lead",
    relatedEntityId: s.leadId || undefined,
    dueAt,
    priority: "high",
    assignedToUserId: s.assignedAgentUserId || userId,
    createdBy: userId,
  } as any);
  await recordEvent(s.id, "callback_scheduled", s.status, s.status, { dueAt: input.dueAt, taskId: task.id }, userId);
  await createActivity(s, "callback_scheduled", `Callback scheduled for ${input.dueAt}`, { taskId: task.id });
  return { ok: true, taskId: task.id };
}
export async function getSessionDetail(sessionId: number, user: any): Promise<{ ok: true; session: any } | { ok: false; status: number; code: string; error: string }> {
  const s = await storage.getCallSessionById(sessionId);
  if (!s) return { ok: false, status: 404, code: "SESSION_NOT_FOUND", error: "Call session not found" };
  if (!canAccessSession(user, s)) return { ok: false, status: 403, code: "FORBIDDEN", error: "Forbidden" };
  const [events, disposition, qualification] = await Promise.all([
    storage.getCallSessionEvents(sessionId),
    storage.getCallDispositionBySession(sessionId),
    storage.getAiCallQualificationBySession(sessionId),
  ]);
  return { ok: true, session: { ...s, events, disposition: disposition || null, aiQualification: qualification || null } };
}

export async function getSessionEvents(sessionId: number, user: any): Promise<{ ok: true; events: any[] } | { ok: false; status: number; code: string; error: string }> {
  const s = await storage.getCallSessionById(sessionId);
  if (!s) return { ok: false, status: 404, code: "SESSION_NOT_FOUND", error: "Call session not found" };
  if (!canAccessSession(user, s)) return { ok: false, status: 403, code: "FORBIDDEN", error: "Forbidden" };
  return { ok: true, events: await storage.getCallSessionEvents(sessionId) };
}

// ── AI qualification ingestion (from ai_assistant.* webhook events) ───────

export async function handleAiSessionEvent(event: any): Promise<void> {
  const eventType = String(event?.data?.event_type || event?.event_type || "");
  if (!eventType.startsWith("ai_assistant.")) return;
  const payload = event?.data?.payload || event?.data || event;
  const callControlId = String(payload.call_control_id || "");
  if (!callControlId) return;
  let session: any = null;
  try { session = await storage.getCallSessionByLegCallControlId(callControlId); } catch { session = null; }
  if (!session || TERMINAL.has(session.status)) return;

  const fields = payload.qualification || payload.extracted_fields || payload.fields || {};
  const history = Array.isArray(payload.message_history) ? payload.message_history : [];
  const lastMsg = history.length ? history[history.length - 1] : null;
  const transcript = String(payload.transcript || lastMsg?.content || lastMsg?.text || "").trim();
  const intent = String(fields.intent || "").trim();
  const qualified = payload.qualified === true || fields.qualified === true;
  const requestHuman = fields.request_human === true || fields.requestHuman === true;
  const doNotCall = payload.do_not_call === true || fields.do_not_call === true || fields.doNotCall === true;

  if (intent || transcript || qualified || requestHuman || doNotCall) {
    try {
      const existing = await storage.getAiCallQualificationBySession(session.id);
      await storage.createAiCallQualification({
        sessionId: session.id,
        intent: intent || existing?.intent || null,
        location: String(fields.location || "").trim() || existing?.location || null,
        propertyType: String(fields.property_type || fields.propertyType || "").trim() || existing?.propertyType || null,
        budget: String(fields.budget || "").trim() || existing?.budget || null,
        timeline: String(fields.timeline || "").trim() || existing?.timeline || null,
        financingStatus: String(fields.financing_status || fields.financingStatus || "").trim() || existing?.financingStatus || null,
        motivation: String(fields.motivation || "").trim() || existing?.motivation || null,
        preferredContact: String(fields.preferred_contact || fields.preferredContact || "").trim() || existing?.preferredContact || null,
        requestHuman: Boolean(requestHuman || qualified),
        doNotCall: Boolean(doNotCall),
        confidence: typeof fields.confidence === "number" ? fields.confidence : null,
        raw: JSON.stringify({ transcript: transcript.slice(0, 8000), intent, qualified }),
      } as any);
    } catch (e) { console.error("ai qualification persist failed:", e); }
  }

  if (doNotCall) {
    if (session.leadId) {
      try { await storage.updateLead(session.leadId, { doNotCall: true } as any); } catch { /* best effort */ }
    }
    await storage.updateCallSession(session.id, { finalDisposition: "do_not_call" });
    await createActivity(session, "do_not_call", "AI heard opt-out/DNC request; suppression applied", { source: "ai" });
  } else if (qualified || requestHuman) {
    if (session.mode === "ai_screen_handoff") {
      await requestHumanHandoff(session.id, session.initiatingUserId || 0);
    } else {
      try {
        await createTask({
          title: `Qualified lead follow-up: ${session.leadPhoneE164}`,
          description: `AI screening flagged this lead as qualified (intent: ${intent || "unknown"}). Follow up to schedule a property consultation.`,
          type: "lead_follow_up",
          relatedEntityType: "lead",
          relatedEntityId: session.leadId || undefined,
          priority: "high",
          assignedToUserId: session.assignedAgentUserId || session.initiatingUserId,
          createdBy: session.initiatingUserId || 0,
        } as any);
        await recordEvent(session.id, "qualified_followup_task", session.status, session.status, {});
      } catch (e) { console.error("qualified task creation failed:", e); }
    }
  }
}
