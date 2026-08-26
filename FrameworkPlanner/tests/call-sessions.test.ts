import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Module mocks (matching the service's import specifiers) ───────────────
const m = vi.hoisted(() => ({
  telnyx: { dial: vi.fn(), hangup: vi.fn(), bridge: vi.fn(), startAiAssistant: vi.fn(), stopAiAssistant: vi.fn() },
  storage: {
    getLeadById: vi.fn(), createCallSession: vi.fn(), getCallSessionById: vi.fn(),
    updateCallSession: vi.fn(), getCallSessionByLegCallControlId: vi.fn(),
    createCallSessionEvent: vi.fn(), getCallSessionEvents: vi.fn(),
    getAgentPhoneSetting: vi.fn(), setAgentPhoneSetting: vi.fn(),
    createCallDisposition: vi.fn(), getCallDispositionBySession: vi.fn(),
    createAiCallQualification: vi.fn(), getAiCallQualificationBySession: vi.fn(),
    createGlobalActivity: vi.fn(), updateLead: vi.fn(),
  },
  createTask: vi.fn(),
  aiConfig: { getAiAssistantConfig: vi.fn() },
  ws: { emitTelephonyEventToAll: vi.fn() },
}));

vi.mock('../server/services/telecom/telnyx-client.js', () => ({ telnyx: m.telnyx }));
vi.mock('../server/storage.js', () => ({ storage: m.storage }));
vi.mock('../server/services/tasks/task-service.js', () => ({ createTask: m.createTask }));
vi.mock('../server/services/telecom/ai-config.js', () => ({ getAiAssistantConfig: m.aiConfig.getAiAssistantConfig }));
vi.mock('../server/telephony/ws.js', () => ({ emitTelephonyEventToAll: m.ws.emitTelephonyEventToAll }));

import * as cs from '../server/services/telecom/call-sessions';

// ── Session state helpers ─────────────────────────────────────────────────
let sess: any;

function makeSession(overrides: any = {}) {
  return {
    id: 7, leadId: 1, contactId: null, campaignId: null,
    initiatingUserId: 2, assignedAgentUserId: 2,
    mode: 'human_first', status: 'queued',
    agentPhoneE164: '+15550002222', leadPhoneE164: '+15550001111',
    agentLegCallControlId: null, leadLegCallControlId: null, aiLegCallControlId: null,
    bridgeRequestId: null, providerConnectionId: 'conn-1', providerName: 'telnyx',
    startedAt: null, agentAnsweredAt: null, leadAnsweredAt: null, bridgedAt: null,
    endedAt: null, durationSeconds: null, finalDisposition: null,
    providerHangupCause: null, aiSummary: null, aiQualificationScore: null,
    aiConfidence: null, idempotencyKey: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function wireSessionMocks(initial: any) {
  sess = initial;
  m.storage.createCallSession.mockImplementation((input: any) => {
    sess = { ...makeSession(), ...input, id: 7 };
    return sess;
  });
  m.storage.getCallSessionById.mockImplementation(async () => sess);
  m.storage.updateCallSession.mockImplementation(async (_id: number, patch: any) => {
    sess = { ...sess, ...patch };
    return sess;
  });
  m.storage.getCallSessionByLegCallControlId.mockImplementation(async (cc: string) => {
    if (!sess) return null;
    if (cc === sess.agentLegCallControlId || cc === sess.leadLegCallControlId) return sess;
    return null;
  });
  m.storage.createCallSessionEvent.mockResolvedValue({ id: 1 });
  m.storage.createGlobalActivity.mockResolvedValue({ id: 1 });
  m.storage.getCallSessionEvents.mockResolvedValue([]);
  m.storage.getCallDispositionBySession.mockResolvedValue(undefined);
  m.storage.getAiCallQualificationBySession.mockResolvedValue(undefined);
  m.storage.updateLead.mockResolvedValue({});
}

beforeEach(() => {
  vi.clearAllMocks();
  m.telnyx.dial.mockImplementation(async (input: any) => {
    return { callControlId: input.to === '+15550002222' ? 'leg-agent-1' : 'leg-lead-1' };
  });
  m.telnyx.bridge.mockResolvedValue(undefined);
  m.telnyx.hangup.mockResolvedValue(undefined);
  m.telnyx.startAiAssistant.mockResolvedValue(undefined);
  m.storage.getLeadById.mockResolvedValue({ id: 1, ownerPhone: '+15550001111', doNotCall: false });
  m.storage.getAgentPhoneSetting.mockResolvedValue({ phoneE164: '+15550002222', defaultCallMode: 'human_first', verified: false });
  m.aiConfig.getAiAssistantConfig.mockResolvedValue({ enabled: true, assistantId: 'ast-1', source: 'db', featureSource: 'db' });
  m.createTask.mockResolvedValue({ id: 99 });
  process.env.ENABLE_TWO_LEG_CLICK_TO_DIAL = 'true';
  process.env.ENABLE_AI_SCREENING = 'true';
  process.env.ENABLE_AI_HUMAN_HANDOFF = 'true';
  process.env.TELNYX_CONNECTION_ID = 'conn-1';
  process.env.TELNYX_DEFAULT_FROM_NUMBER = '+13212940738';
});

function answered(cc: string) {
  return { data: { event_type: 'call.answered', payload: { call_control_id: cc } } };
}
function hungup(cc: string, cause = '') {
  return { data: { event_type: 'call.hangup', payload: { call_control_id: cc, hangup_cause: cause } } };
}
function bridged(cc: string) {
  return { data: { event_type: 'call.bridged', payload: { call_control_id: cc } } };
}

describe('Two-Leg Call Sessions (human-first)', () => {
  it('agent answers → lead dialed → lead answers → one bridge → connected', async () => {
    wireSessionMocks(makeSession());
    const r = await cs.createCallSession({ leadId: 1, mode: 'human_first', userId: 2 });
    expect(r.ok).toBe(true);
    expect(sess.status).toBe('agent_dialing');
    expect(sess.agentLegCallControlId).toBe('leg-agent-1');

    await cs.handleWebhookEvent(answered('leg-agent-1'));
    expect(sess.status).toBe('lead_dialing');
    expect(sess.leadLegCallControlId).toBe('leg-lead-1');

    await cs.handleWebhookEvent(answered('leg-lead-1'));
    expect(sess.status).toBe('bridging');
    expect(m.telnyx.bridge).toHaveBeenCalledTimes(1);
    expect(m.telnyx.bridge.mock.calls[0][0]).toBe('leg-agent-1');
    expect(m.telnyx.bridge.mock.calls[0][1]).toBe('leg-lead-1');

    await cs.handleWebhookEvent(bridged('leg-agent-1'));
    expect(sess.status).toBe('connected');
  });

  it('agent does not answer: lead leg is never dialed', async () => {
    wireSessionMocks(makeSession());
    await cs.createCallSession({ leadId: 1, mode: 'human_first', userId: 2 });
    await cs.handleWebhookEvent(hungup('leg-agent-1', 'no-answer'));
    expect(m.telnyx.dial).toHaveBeenCalledTimes(1); // only the agent leg
    expect(sess.status).toBe('completed');
    expect(sess.finalDisposition).toBe('agent_unavailable');
    expect(sess.leadLegCallControlId).toBeNull();
  });

  it('duplicate lead-answered webhook → exactly one bridge request', async () => {
    wireSessionMocks(makeSession());
    await cs.createCallSession({ leadId: 1, mode: 'human_first', userId: 2 });
    await cs.handleWebhookEvent(answered('leg-agent-1'));
    await cs.handleWebhookEvent(answered('leg-lead-1'));
    await cs.handleWebhookEvent(answered('leg-lead-1')); // duplicate delivery
    await cs.handleWebhookEvent(bridged('leg-agent-1'));
    expect(m.telnyx.bridge).toHaveBeenCalledTimes(1);
    expect(sess.status).toBe('connected');
  });

  it('lead hangs up while ringing: agent leg is closed and call dispositioned without bridge', async () => {
    wireSessionMocks(makeSession());
    await cs.createCallSession({ leadId: 1, mode: 'human_first', userId: 2 });
    await cs.handleWebhookEvent(answered('leg-agent-1'));
    await cs.handleWebhookEvent(hungup('leg-lead-1'));
    expect(m.telnyx.bridge).toHaveBeenCalledTimes(0);
    expect(m.telnyx.hangup).toHaveBeenCalledWith('leg-agent-1');
    expect(sess.status).toBe('completed');
    expect(sess.finalDisposition).toBe('abandoned');
  });

  it('connected call: hangup ends once with duration', async () => {
    wireSessionMocks(makeSession());
    await cs.createCallSession({ leadId: 1, mode: 'human_first', userId: 2 });
    await cs.handleWebhookEvent(answered('leg-agent-1'));
    await cs.handleWebhookEvent(answered('leg-lead-1'));
    await cs.handleWebhookEvent(bridged('leg-agent-1'));
    expect(sess.status).toBe('connected');
    sess.startedAt = new Date(Date.now() - 30_000);
    await cs.handleWebhookEvent(hungup('leg-agent-1', 'user-hangup'));
    expect(sess.status).toBe('completed');
    expect(sess.finalDisposition).toBe('connected');
    expect(sess.durationSeconds).toBeGreaterThanOrEqual(29);
  });
});

describe('AI screening + human handoff', () => {
  it('AI screen + handoff: qualified → agent dialed → bridged in', async () => {
    wireSessionMocks(makeSession({ mode: 'ai_screen_handoff' }));
    const r = await cs.createCallSession({ leadId: 1, mode: 'ai_screen_handoff', userId: 2 });
    expect(r.ok).toBe(true);
    expect(sess.status).toBe('lead_dialing'); // AI dials the lead directly

    await cs.handleWebhookEvent(answered('leg-lead-1'));
    expect(sess.status).toBe('ai_screening');
    expect(m.telnyx.startAiAssistant).toHaveBeenCalledWith('leg-lead-1', 'ast-1');

    await cs.handleAiSessionEvent({
      data: { event_type: 'ai_assistant.message_history_updated', payload: {
        call_control_id: 'leg-lead-1', qualified: true,
        qualification: { intent: 'buying', budget: '1M', request_human: true },
      } },
    });
    expect(sess.status).toBe('handoff_agent_dialing');
    expect(m.telnyx.dial).toHaveBeenLastCalledWith(expect.objectContaining({ to: '+15550002222' }));

    await cs.handleWebhookEvent(answered('leg-agent-1'));
    expect(sess.status).toBe('bridging');
    expect(m.telnyx.bridge).toHaveBeenCalledTimes(1);
  });

  it('AI screen (no handoff mode): qualified creates a follow-up task', async () => {
    wireSessionMocks(makeSession({ mode: 'ai_screen' }));
    await cs.createCallSession({ leadId: 1, mode: 'ai_screen', userId: 2 });
    await cs.handleWebhookEvent(answered('leg-lead-1'));
    expect(sess.status).toBe('ai_screening');

    await cs.handleAiSessionEvent({
      data: { event_type: 'ai_assistant.message_history_updated', payload: {
        call_control_id: 'leg-lead-1', qualified: true, qualification: { intent: 'selling' },
      } },
    });
    expect(m.createTask).toHaveBeenCalledTimes(1);
    expect(String(m.createTask.mock.calls[0][0].title)).toContain('Qualified');
    expect(sess.status).toBe('ai_screening'); // stays screening
  });

  it('AI hears do-not-call: suppression applied immediately', async () => {
    wireSessionMocks(makeSession({ mode: 'ai_screen' }));
    await cs.createCallSession({ leadId: 1, mode: 'ai_screen', userId: 2 });
    await cs.handleWebhookEvent(answered('leg-lead-1'));
    await cs.handleAiSessionEvent({
      data: { event_type: 'ai_assistant.message_history_updated', payload: {
        call_control_id: 'leg-lead-1', do_not_call: true, qualification: { do_not_call: true },
      } },
    });
    expect(m.storage.updateLead).toHaveBeenCalledWith(1, { doNotCall: true });
    expect(sess.finalDisposition).toBe('do_not_call');
  });
});

describe('Validation, permissions, dispositions', () => {
  it('blocks DNC leads at session creation', async () => {
    m.storage.getLeadById.mockResolvedValue({ id: 1, ownerPhone: '+15550001111', doNotCall: true });
    wireSessionMocks(makeSession());
    const r = await cs.createCallSession({ leadId: 1, mode: 'human_first', userId: 2 });
    expect(r.ok).toBe(false);
    expect((r as any).code).toBe('DO_NOT_CALL');
  });

  it('rejects invalid lead phone', async () => {
    m.storage.getLeadById.mockResolvedValue({ id: 1, ownerPhone: '555-000-1111', doNotCall: false });
    wireSessionMocks(makeSession());
    const r = await cs.createCallSession({ leadId: 1, mode: 'human_first', userId: 2 });
    expect((r as any).code).toBe('INVALID_LEAD_PHONE');
  });

  it('requires agent phone for human-first', async () => {
    m.storage.getAgentPhoneSetting.mockResolvedValue(undefined);
    delete process.env.TELNYX_AGENT_PHONE;
    wireSessionMocks(makeSession());
    const r = await cs.createCallSession({ leadId: 1, mode: 'human_first', userId: 2 });
    expect((r as any).code).toBe('AGENT_PHONE_REQUIRED');
  });

  it('enforces AI feature flags', async () => {
    process.env.ENABLE_AI_SCREENING = 'false';
    wireSessionMocks(makeSession());
    const r = await cs.createCallSession({ leadId: 1, mode: 'ai_screen', userId: 2 });
    expect((r as any).code).toBe('AI_SCREENING_DISABLED');
  });

  it('ownership: a different user cannot read the session', async () => {
    wireSessionMocks(makeSession({ status: 'completed' }));
    const other = await cs.getSessionDetail(7, { id: 99, isSuperAdmin: false });
    expect(other.ok).toBe(false);
    expect((other as any).code).toBe('FORBIDDEN');
    const owner = await cs.getSessionDetail(7, { id: 2, isSuperAdmin: false });
    expect(owner.ok).toBe(true);
  });

  it('do_not_call disposition persists DNC on the lead', async () => {
    wireSessionMocks(makeSession({ status: 'completed' }));
    await cs.setDisposition(7, 2, { disposition: 'do_not_call', note: 'explicit request' });
    expect(m.storage.updateLead).toHaveBeenCalledWith(1, { doNotCall: true });
    expect(m.storage.createCallDisposition).toHaveBeenCalledWith(
      expect.objectContaining({ disposition: 'do_not_call', source: 'agent' }),
    );
  });

 

  it('rejects unknown dispositions', async () => {
    wireSessionMocks(makeSession({ status: 'completed' }));
    const r = await cs.setDisposition(7, 2, { disposition: 'made_up' });
    expect((r as any).code).toBe('INVALID_DISPOSITION');
  });
});
