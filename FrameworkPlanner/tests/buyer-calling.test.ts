import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Module mocks (matching the service's import specifiers) ───────────────
const m = vi.hoisted(() => ({
  telnyx: { dial: vi.fn(), hangup: vi.fn(), bridge: vi.fn(), startAiAssistant: vi.fn(), stopAiAssistant: vi.fn(), sendDtmf: vi.fn() },
  storage: {
    getLeadById: vi.fn(), createCallSession: vi.fn(), getCallSessionById: vi.fn(),
    updateCallSession: vi.fn(), getCallSessionByLegCallControlId: vi.fn(),
    createCallSessionEvent: vi.fn(), getCallSessionEvents: vi.fn(),
    getAgentPhoneSetting: vi.fn(), setAgentPhoneSetting: vi.fn(),
    createCallDisposition: vi.fn(), getCallDispositionBySession: vi.fn(),
    createAiCallQualification: vi.fn(), getAiCallQualificationBySession: vi.fn(),
    createGlobalActivity: vi.fn(), updateLead: vi.fn(),
    getStaleCallSessions: vi.fn(),
    // Buyer workflow
    getBuyerById: vi.fn(), updateBuyer: vi.fn(), setBuyerDnc: vi.fn(),
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

// ── Session / buyer helpers ───────────────────────────────────────────────
let sess: any;

function makeSession(overrides: any = {}) {
  return {
    id: 7, leadId: null, buyerId: 3, contactId: null, campaignId: null,
    initiatingUserId: 2, assignedAgentUserId: 2,
    mode: 'human_first', status: 'queued', sessionSource: 'crm_dialer',
    agentPhoneE164: '+15550002222', leadPhoneE164: '+15550001111',
    agentLegCallControlId: null, leadLegCallControlId: null, aiLegCallControlId: null,
    bridgeRequestId: null, providerConnectionId: 'conn-1', providerName: 'telnyx',
    startedAt: null, agentAnsweredAt: null, leadAnsweredAt: null, bridgedAt: null,
    endedAt: null, durationSeconds: null, finalDisposition: null,
    providerHangupCause: null, aiSummary: null, aiQualificationScore: null,
    aiConfidence: null, idempotencyKey: null, occurredAt: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function wireSessionMocks(initial: any) {
  sess = initial;
  // Clear per-test call history so assertions on mock.calls never see
  // invocations from earlier cases.
  m.storage.updateBuyer.mockClear();
  m.storage.setBuyerDnc.mockClear();
  m.createTask.mockClear();
  m.storage.createCallSession.mockImplementation((input: any) => {
    sess = { ...makeSession(), ...input, id: 7 };
    return sess;
  });
  m.storage.getCallSessionById.mockImplementation(async () => sess);
  m.storage.updateCallSession.mockImplementation(async (_id: number, patch: any) => {
    Object.assign(sess, patch);
    return sess;
  });
  m.storage.getCallSessionByLegCallControlId.mockImplementation(async (cc: string) => {
    if (!sess) return null;
    if (cc === sess.agentLegCallControlId || cc === sess.leadLegCallControlId) return sess;
    return null;
  });
  m.storage.createCallSessionEvent.mockResolvedValue({ id: 1 });
  m.storage.createGlobalActivity.mockResolvedValue({ id: 1 });
  m.storage.createCallDisposition.mockResolvedValue({ id: 1 });
  m.storage.getCallSessionEvents.mockResolvedValue([]);
  m.storage.getCallDispositionBySession.mockResolvedValue(undefined);
  m.storage.getAiCallQualificationBySession.mockResolvedValue(undefined);
  m.storage.updateLead.mockResolvedValue({});
  m.storage.setBuyerDnc.mockResolvedValue({});
  m.storage.updateBuyer.mockResolvedValue({});
  m.telnyx.sendDtmf.mockReset();
  m.telnyx.sendDtmf.mockResolvedValue(undefined);
}

function fullBuyer(overrides: any = {}) {
  return {
    id: 3, name: 'Test Buyer', phone: '+15550001111', doNotCall: false,
    buyerStatus: 'contacted', interestLevel: null, lastContactDate: null,
    lastCallDisposition: null, nextAction: null, nextActionAt: null,
    minPrice: '100000', maxPrice: '300000', minBudget: null, maxBudget: null,
    preferredAreas: ['Austin'], zipCodes: [], propertyTypes: ['Single Family'],
    preferredPropertyTypes: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.telnyx.dial.mockImplementation(async (input: any) => {
    return {
      callControlId: input.to === '+15550002222' ? 'leg-agent-1' : 'leg-lead-1',
      callSessionId: input.to === '+15550002222' ? 'cs-agent-1' : 'cs-lead-1',
    };
  });
  m.telnyx.bridge.mockResolvedValue(undefined);
  m.telnyx.hangup.mockResolvedValue(undefined);
  m.storage.getLeadById.mockResolvedValue({ id: 1, ownerPhone: '+15550001111', doNotCall: false });
  m.storage.getBuyerById.mockResolvedValue(fullBuyer());
  m.storage.getAgentPhoneSetting.mockResolvedValue({ phoneE164: '+15550002222', defaultCallMode: 'human_first', verified: false });
  m.aiConfig.getAiAssistantConfig.mockResolvedValue({ enabled: true, assistantId: 'ast-1', source: 'db', featureSource: 'db' });
  m.createTask.mockResolvedValue({ id: 99 });
  process.env.ENABLE_TWO_LEG_CLICK_TO_DIAL = 'true';
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

// ── Buyer dialing ─────────────────────────────────────────────────────────
describe('Buyer call sessions', () => {
  it('dials the agent first, then the buyer, and bridges', async () => {
    wireSessionMocks(makeSession());
    const r = await cs.createBuyerCallSession({ buyerId: 3, userId: 2 });
    expect(r.ok).toBe(true);
    expect(sess.status).toBe('agent_dialing');
    expect(sess.buyerId).toBe(3);
    expect(sess.leadId).toBeNull();
    expect(sess.sessionSource).toBe('crm_dialer');

    await cs.handleWebhookEvent(answered('leg-agent-1'));
    expect(sess.status).toBe('lead_dialing');
    await cs.handleWebhookEvent(answered('leg-lead-1'));
    await cs.handleWebhookEvent(bridged('leg-agent-1'));
    expect(sess.status).toBe('connected');
    expect(m.telnyx.bridge).toHaveBeenCalledTimes(1);
  });

  it('rejects a buyer with no E.164 phone', async () => {
    wireSessionMocks(makeSession());
    m.storage.getBuyerById.mockResolvedValue(fullBuyer({ phone: '(555) 000-1111' }));
    const r = await cs.createBuyerCallSession({ buyerId: 3, userId: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_BUYER_PHONE');
    expect(m.telnyx.dial).not.toHaveBeenCalled();
  });

  it('blocks dialing a do-not-call buyer', async () => {
    wireSessionMocks(makeSession());
    m.storage.getBuyerById.mockResolvedValue(fullBuyer({ doNotCall: true }));
    const r = await cs.createBuyerCallSession({ buyerId: 3, userId: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('DO_NOT_CALL');
  });

  it('blocks dialing when the pipeline stage is do_not_contact', async () => {
    wireSessionMocks(makeSession());
    m.storage.getBuyerById.mockResolvedValue(fullBuyer({ buyerStatus: 'do_not_contact' }));
    const r = await cs.createBuyerCallSession({ buyerId: 3, userId: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('DO_NOT_CALL');
  });
});

// ── Buyer dispositions ────────────────────────────────────────────────────
describe('Buyer disposition automations', () => {
  it('send_deal stamps contact, sets warm interest, moves to active_buyer, and creates a due-now task', async () => {
    wireSessionMocks(makeSession());
    const r = await cs.setDisposition(7, 2, { disposition: 'send_deal', note: 'Wants the package' });
    expect(r.ok).toBe(true);
    expect(sess.finalDisposition).toBe('send_deal');
    const patch = m.storage.updateBuyer.mock.calls[0][1];
    expect(patch.lastCallDisposition).toBe('send_deal');
    expect(patch.interestLevel).toBe('warm');
    const statusPatch = m.storage.updateBuyer.mock.calls[1][1];
    expect(statusPatch.buyerStatus).toBe('active_buyer');
    expect(m.createTask).toHaveBeenCalledTimes(1);
    expect(m.createTask.mock.calls[0][0].title).toContain('Send deal package');
  });

  it('offer_expected marks the buyer hot and creates a follow-up task', async () => {
    wireSessionMocks(makeSession());
    await cs.setDisposition(7, 2, { disposition: 'offer_expected' });
    expect(m.storage.updateBuyer.mock.calls[0][1].interestLevel).toBe('hot');
    expect(m.createTask).toHaveBeenCalledTimes(1);
  });

  it('callback_requested schedules a callback task for the buyer', async () => {
    wireSessionMocks(makeSession());
    await cs.setDisposition(7, 2, { disposition: 'callback_requested' });
    expect(m.createTask).toHaveBeenCalledTimes(1);
    expect(m.createTask.mock.calls[0][0].relatedEntityType).toBe('buyer');
    expect(m.createTask.mock.calls[0][0].relatedEntityId).toBe(3);
  });

  it('qualified_buyer only promotes when the buy box is complete', async () => {
    wireSessionMocks(makeSession());
    m.storage.getBuyerById.mockResolvedValue(fullBuyer());
    await cs.setDisposition(7, 2, { disposition: 'qualified_buyer' });
    // fullBuyer has range + area + property type → promoted
    const called = m.storage.updateBuyer.mock.calls.some(([, patch]: any[]) => patch.buyerStatus === 'qualified');
    expect(called).toBe(true);

    // Missing property types → no promotion
    wireSessionMocks(makeSession());
    wireSessionMocks(makeSession());
    m.storage.getBuyerById.mockResolvedValue(fullBuyer({ propertyTypes: null, preferredPropertyTypes: null }));
    await cs.setDisposition(7, 2, { disposition: 'qualified_buyer' });
    const promoted = m.storage.updateBuyer.mock.calls.some(([, patch]: any[]) => patch.buyerStatus === 'qualified');
    expect(promoted).toBe(false);
  });

  it('do_not_call sets buyer DNC flag, moves status, and creates no tasks', async () => {
    wireSessionMocks(makeSession());
    await cs.setDisposition(7, 2, { disposition: 'do_not_call' });
    expect(m.storage.setBuyerDnc).toHaveBeenCalledWith(3, true);
    // calls[0] is the explicit DNC lock applied inside setDisposition.
    expect(m.storage.updateBuyer.mock.calls[0][1].buyerStatus).toBe('do_not_contact');
    expect(m.createTask).not.toHaveBeenCalled();
  });

  it('no_answer schedules a retry task and moves new buyers to attempting_contact', async () => {
    wireSessionMocks(makeSession());
    m.storage.getBuyerById.mockResolvedValue(fullBuyer({ buyerStatus: 'new' }));
    await cs.setDisposition(7, 2, { disposition: 'no_answer' });
    expect(m.createTask).toHaveBeenCalledTimes(1);
    expect(m.createTask.mock.calls[0][0].title).toContain('Retry call');
    const statusPatch = m.storage.updateBuyer.mock.calls.find(([, patch]: any[]) => patch.buyerStatus === 'attempting_contact');
    expect(statusPatch).toBeTruthy();
  });

  it('explicit next action and interest level win over inferred values', async () => {
    wireSessionMocks(makeSession());
    await cs.setDisposition(7, 2, {
      disposition: 'send_deal',
      nextAction: 'Email package + rent roll',
      nextActionAt: new Date(Date.now() + 3600_000).toISOString(),
      interestLevel: 'hot',
    });
    const first = m.storage.updateBuyer.mock.calls[0][1];
    expect(first.nextAction).toBe('Email package + rent roll');
    expect(first.interestLevel).toBe('hot');
  });
});

// ── Manual quick-log (Google Voice) ───────────────────────────────────────
describe('Manual buyer call logs', () => {
  it('creates a completed, provider-tagged session and runs the same automations', async () => {
    wireSessionMocks(makeSession());
    const r = await cs.logManualBuyerCall({
      buyerId: 3, userId: 2, direction: 'outbound',
      sessionProvider: 'google_voice', disposition: 'send_deal',
      note: 'Called from company GV line', interestLevel: 'warm',
      nextAction: 'Email deal package',
      nextActionAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(r.ok).toBe(true);
    const created = m.storage.createCallSession.mock.calls[0][0];
    expect(created.sessionSource).toBe('manual');
    expect(created.sessionProvider).toBe('google_voice');
    expect(created.status).toBe('completed');
    expect(created.finalDisposition).toBe('send_deal');
    expect(m.storage.createCallDisposition).toHaveBeenCalledTimes(1);
    // Same disposition automation as dialed calls:
    expect(m.storage.updateBuyer.mock.calls[0][1].lastCallDisposition).toBe('send_deal');
    expect(m.createTask).toHaveBeenCalledTimes(1);
  });

  it('requires a next action + date for actionable dispositions', async () => {
    wireSessionMocks(makeSession());
    const r = await cs.logManualBuyerCall({
      buyerId: 3, userId: 2, direction: 'outbound', disposition: 'offer_expected',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NEXT_ACTION_REQUIRED');
    expect(m.storage.createCallSession).not.toHaveBeenCalled();
  });

  it('accepts explicit next action for the actionable disposition', async () => {
    wireSessionMocks(makeSession());
    const due = new Date(Date.now() + 86_400_000).toISOString();
    const r = await cs.logManualBuyerCall({
      buyerId: 3, userId: 2, direction: 'outbound', disposition: 'offer_expected',
      nextAction: 'Chase offer', nextActionAt: due,
    });
    expect(r.ok).toBe(true);
    expect(m.createTask).toHaveBeenCalledTimes(1);
  });

  it('rejects future occurredAt and invalid providers', async () => {
    wireSessionMocks(makeSession());
    const future = await cs.logManualBuyerCall({
      buyerId: 3, userId: 2, direction: 'outbound', disposition: 'connected',
      occurredAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.code).toBe('OCCURRED_AT_FUTURE');

    const badProvider = await cs.logManualBuyerCall({
      buyerId: 3, userId: 2, direction: 'outbound', disposition: 'connected',
      sessionProvider: 'slack',
    });
    expect(badProvider.ok).toBe(false);
    if (!badProvider.ok) expect(badProvider.code).toBe('INVALID_PROVIDER');
  });

  it('rejects dispositions outside the canonical taxonomy', async () => {
    wireSessionMocks(makeSession());
    const r = await cs.logManualBuyerCall({
      buyerId: 3, userId: 2, direction: 'outbound', disposition: 'made_up_outcome',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_DISPOSITION');
  });
});
