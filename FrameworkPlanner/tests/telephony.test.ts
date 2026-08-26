import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';

vi.mock('../server/services/telecom/telnyx-client', () => ({
  telnyx: {
    dial: async () => ({ callControlId: 'test-call-control-id' }),
    hangup: async () => {},
    sendSms: async () => ({ messageId: 'test-message-id' }),
    transfer: async () => {},
    startAiAssistant: async () => {},
    stopAiAssistant: async () => {},
    healthCheck: async () => ({ status: 'reachable', code: 200, message: 'Connection is active', connectionFound: true, connectionActive: true, httpStatus: 200 }),
    diagnostics: () => ({ telnyxConfigured: true, apiKeyPrefix: 'test-a', usedPublicKey: false, baseUrl: 'https://api.telnyx.com/v2', connectionId: 'test-connection-id', messagingProfileId: 'test-profile-id', defaultFrom: '+15550001234' }),
  },
  createTelnyxWebhookRouter: () => express(),
}));

import { registerRoutes } from '../server/routes';
import { storage } from '../server/storage';

describe('Telephony Routes', () => {
  let app: express.Express;
  const createdCallLogs: any[] = [];
  const getCallLogsCalls: any[][] = [];

  beforeAll(async () => {
    // Use a throwaway test key; Telnyx is mocked
    process.env.TELNYX_API_KEY = process.env.TELNYX_API_KEY || 'test-api-key';
    process.env.TELNYX_CONNECTION_ID = process.env.TELNYX_CONNECTION_ID || 'test-connection-id';
    process.env.TELNYX_MESSAGING_PROFILE_ID = process.env.TELNYX_MESSAGING_PROFILE_ID || 'test-profile-id';
    process.env.TELNYX_PUBLIC_KEY = process.env.TELNYX_PUBLIC_KEY || 'test-public-key';
    process.env.TELNYX_DEFAULT_FROM_NUMBER = process.env.TELNYX_DEFAULT_FROM_NUMBER || '+15550001234';
    process.env.FEATURE_AI_ASSISTANT = 'true';
    process.env.TELNYX_AI_ASSISTANT_ID = 'asst_test';

    // Mock storage to avoid DB access in tests
    storage.getUserById = async (id: number) => ({ id, email: "test@example.com" } as any);
    storage.getUserByEmail = async () => ({ id: 1, email: "test@example.com" } as any);
    storage.getContacts = async () => ([{ id: 1, name: 'Test User', phone: '+15551230000' } as any]);
    storage.getLeads = async () => ([
      { id: 1, ownerName: "Lead One", ownerPhone: "+15551110000", address: "1 Main St", city: "Orlando", state: "FL", status: "new", doNotCall: false, nextFollowUpAt: null } as any,
      { id: 2, ownerName: "Lead Two", ownerPhone: "+15552220000", address: "2 Main St", city: "Orlando", state: "FL", status: "new", doNotCall: true, nextFollowUpAt: null } as any,
    ]);
    storage.getLeadById = async (id: number) => ({ id, ownerName: `Lead ${id}`, ownerPhone: "+15551110000", address: "1 Main St", city: "Orlando", state: "FL", status: "new", doNotCall: id === 2, doNotText: false, nextFollowUpAt: null } as any);
    storage.getActiveOutboundCallForUser = async () => undefined;
    storage.getAppSetting = async () => null;
    storage.setAppSetting = async () => {};
    storage.createSmsMessage = async (input: any) => ({ id: 1, ...input } as any);
    storage.getSmsThreads = async () => [];
    storage.getSmsThreadMessages = async () => [];
    let calls: any[] = [];
    storage.createCallLog = async (log: any) => { const withId = { id: calls.length + 1, ...log }; calls.push(withId); createdCallLogs.push(withId); return withId; };
    storage.updateCallLog = async (id: number, patch: any) => { const idx = calls.findIndex(c => c.id === id); if (idx >= 0) { calls[idx] = { ...calls[idx], ...patch }; return calls[idx]; } return { id, ...patch } as any; };
    storage.getCallLogByCallControlId = async (ccId: string) => calls.find(c => c.callControlId === ccId) as any;
    storage.getCallLogs = async (...args: any[]) => { getCallLogsCalls.push(args); return calls as any; };
    const rep = new Map<string, { e164: string; label: string; reason: string | null }>();
    storage.getNumberReputationByE164s = async (_userId: number, e164s: string[]) => e164s.map(e => rep.get(e)).filter(Boolean) as any;
    storage.upsertNumberReputation = async (input: any) => { rep.set(input.e164, { e164: input.e164, label: input.label, reason: input.reason ?? null }); return rep.get(input.e164) as any; };
    storage.deleteNumberReputation = async (_userId: number, e164: string) => { rep.delete(e164); };
    storage.getTelephonyAnalyticsSummary = async () => ({ total: calls.length, answered: calls.filter(c => c.status === "answered").length, missed: calls.filter(c => c.status === "missed").length, failed: calls.filter(c => c.status === "failed").length, talkSeconds: 0 });
    app = express();
    app.use(express.json());
    app.use(session({ secret: 'test', resave: false, saveUninitialized: true }));
    app.use((req: any, _res, next) => { req.session.userId = 1; next(); });
    await registerRoutes(app);
  });

  it('GET /api/telephony/contacts returns items', async () => {
    const res = await request(app).get('/api/telephony/contacts?query=');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
  });

  it('POST /api/telephony/outbound/dispatch returns callControlId', async () => {
    const res = await request(app)
      .post('/api/telephony/outbound/dispatch')
      .send({ toNumber: '+15551234567' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('callControlId');
    expect(res.body).toHaveProperty('callLogId');
  });

  it('POST /api/telephony/outbound/dispatch rejects non-E.164 numbers', async () => {
    const res = await request(app)
      .post('/api/telephony/outbound/dispatch')
      .send({ toNumber: 'not-a-number' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TO');
  });

  it('GET /api/telephony/health returns structured telnyx provider health', async () => {
    const res = await request(app).get('/api/telephony/health');
    expect(res.status).toBe(200);
    expect(res.body.telnyx).toMatchObject({
      status: 'reachable',
      code: 200,
      connectionFound: true,
      connectionActive: true,
    });
    expect(res.body.telnyxDiag).toHaveProperty('telnyxConfigured');
    expect(res.body).toHaveProperty('defaultFrom');
  });

  it('POST /api/telephony/calls creates call log', async () => {
    const res = await request(app)
      .post('/api/telephony/calls')
      .send({ direction: 'outbound', number: '+15551234567', status: 'dialing' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    const logId = res.body.id;
    const patch = await request(app)
      .patch(`/api/telephony/calls/${logId}`)
      .send({ status: 'connected' });
    expect(patch.status).toBe(200);
  });

  it('GET /api/telephony/history lists logs', async () => {
    const res = await request(app).get('/api/telephony/history?limit=10');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/dialer/queue excludes doNotCall leads', async () => {
    const res = await request(app).get('/api/dialer/queue?listId=new&limit=50');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
    const items = res.body.items as any[];
    expect(items.some((x) => x.leadId === 2)).toBe(false);
  });

  it('POST /api/telephony/spam/flag annotates history', async () => {
    await request(app).post('/api/telephony/calls').send({ direction: 'outbound', number: '+15550001111', status: 'dialing' });
    const flag = await request(app).post('/api/telephony/spam/flag').send({ e164: '+15550001111', label: 'spam', reason: 'test' });
    expect(flag.status).toBe(200);
    const res = await request(app).get('/api/telephony/history?limit=10');
    expect(res.status).toBe(200);
    const match = (res.body as any[]).find((x) => x.number === '+15550001111');
    expect(match?.spamLabel).toBe('spam');
  });

  it('GET /api/telephony/analytics/summary returns totals', async () => {
    const res = await request(app).get('/api/telephony/analytics/summary?rangeDays=30');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('answered');
  });

  it('POST /api/telephony/outbound/dispatch rejects do-not-call leads', async () => {
    const res = await request(app)
      .post('/api/telephony/outbound/dispatch')
      .send({ toNumber: '+15551234567', metadata: { leadId: 2 } });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DO_NOT_CALL');
    expect(res.body.leadId).toBe(2);
  });

  it('POST /api/telephony/outbound/dispatch rejects when a call is already active', async () => {
    const prev = storage.getActiveOutboundCallForUser;
    storage.getActiveOutboundCallForUser = async () => ({ id: 99, call_control_id: 'cc-active' } as any);
    try {
      const res = await request(app)
        .post('/api/telephony/outbound/dispatch')
        .send({ toNumber: '+15551234567' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CALL_ACTIVE');
    } finally {
      storage.getActiveOutboundCallForUser = prev;
    }
  });

  it('POST /api/telephony/outbound/dispatch persists leadId + callControlId on the call log', async () => {
    const before = createdCallLogs.length;
    const res = await request(app)
      .post('/api/telephony/outbound/dispatch')
      .send({ toNumber: '+15551234567', metadata: { leadId: 1 } });
    expect(res.status).toBe(201);
    const created = createdCallLogs[createdCallLogs.length - 1];
    expect(created).toBeDefined();
    expect(created.leadId).toBe(1);
    expect(created.callControlId).toBe('test-call-control-id');
    expect(createdCallLogs.length).toBeGreaterThan(before);
  });

  it('POST /api/telephony/outbound/:id/ai-assistant starts the screener', async () => {
    const res = await request(app)
      .post('/api/telephony/outbound/test-call-control/ai-assistant')
      .send({ action: 'start', assistantId: 'asst_123' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, action: 'start', assistantId: 'asst_123' });
  });

  it('POST /api/telephony/outbound/:id/ai-assistant rejects when feature disabled', async () => {
    process.env.FEATURE_AI_ASSISTANT = 'false';
    try {
      const res = await request(app)
        .post('/api/telephony/outbound/test-call-control/ai-assistant')
        .send({ action: 'start', assistantId: 'asst_123' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('AI_ASSISTANT_DISABLED');
    } finally {
      process.env.FEATURE_AI_ASSISTANT = 'true';
    }
  });

  it('POST /api/telephony/outbound/:id/ai-assistant requires assistantId', async () => {
    delete process.env.TELNYX_AI_ASSISTANT_ID;
    try {
      const res = await request(app)
        .post('/api/telephony/outbound/test-call-control/ai-assistant')
        .send({ action: 'start' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MISSING_ASSISTANT_ID');
    } finally {
      process.env.TELNYX_AI_ASSISTANT_ID = 'asst_test';
    }
  });

  it('POST /api/telephony/outbound/:id/transfer transfers the active call and marks the log', async () => {
    const res = await request(app)
      .post('/api/telephony/outbound/dispatch')
      .send({ toNumber: '+15551234567' });
    expect(res.status).toBe(201);
    const log = createdCallLogs[createdCallLogs.length - 1];
    expect(log.callControlId).toBe('test-call-control-id');
    const t = await request(app)
      .post(`/api/telephony/outbound/${log.callControlId}/transfer`)
      .send({ to: '+15551239999' });
    expect(t.status).toBe(200);
    expect(t.body.transferredTo).toBe('+15551239999');
    const hist = await request(app).get('/api/telephony/history?limit=50');
    const transferred = (hist.body as any[]).find((c: any) => c.callControlId === log.callControlId);
    expect(transferred?.status).toBe('transferring');
  });

  it('POST /api/telephony/outbound/:id/transfer rejects non-E.164 destinations', async () => {
    const res = await request(app)
      .post('/api/telephony/outbound/cc-test/transfer')
      .send({ to: 'not-a-number' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TO');
  });

  it('POST /api/telephony/outbound/:id/transfer requires a destination', async () => {
    const res = await request(app)
      .post('/api/telephony/outbound/cc-test/transfer')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_TO');
  });

  it('GET /api/settings/telecom/ai-assistant returns effective config', async () => {
    const res = await request(app).get('/api/settings/telecom/ai-assistant');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('enabled');
    expect(res.body).toHaveProperty('assistantId');
    expect(res.body.assistantId).toBe('asst_test');
  });

  it('PUT /api/settings/telecom/ai-assistant requires admin role', async () => {
    const res = await request(app)
      .put('/api/settings/telecom/ai-assistant')
      .send({ assistantId: 'asst_xyz', enabled: true });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ADMIN_REQUIRED');
  });

  it('GET /api/telephony/sms/threads returns threads list', async () => {
    const res = await request(app).get('/api/telephony/sms/threads');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('threads');
  });

  it('GET /api/telephony/sms/threads/:phone/messages rejects invalid phone', async () => {
    const res = await request(app).get('/api/telephony/sms/threads/12345/messages');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PHONE');
  });

  it('GET /api/telephony/history scopes by user', async () => {
    const before = getCallLogsCalls.length;
    await request(app).get('/api/telephony/history?limit=10');
    expect(getCallLogsCalls.length).toBeGreaterThan(before);
    const call = getCallLogsCalls[getCallLogsCalls.length - 1];
    // args: [limit, offset, status, contactId, userId]
    expect(call[0]).toBe(10);
    expect(call[4]).toBe(1);
  });
});
