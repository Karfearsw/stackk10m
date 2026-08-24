import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';

vi.mock('../server/services/telecom/telnyx-client', () => ({
  telnyx: {
    dial: async () => ({ callControlId: 'test-call-control-id' }),
    hangup: async () => {},
    sendSms: async () => ({ messageId: 'test-message-id' }),
    healthCheck: async () => ({ status: 'reachable', code: 200, message: 'Connection is active', connectionFound: true, connectionActive: true, httpStatus: 200 }),
    diagnostics: () => ({ telnyxConfigured: true, apiKeyPrefix: 'test-a', usedPublicKey: false, baseUrl: 'https://api.telnyx.com/v2', connectionId: 'test-connection-id', messagingProfileId: 'test-profile-id', defaultFrom: '+15550001234' }),
  },
  createTelnyxWebhookRouter: () => express(),
}));

import { registerRoutes } from '../server/routes';
import { storage } from '../server/storage';

describe('Telephony Routes', () => {
  let app: express.Express;

  beforeAll(async () => {
    // Use a throwaway test key; Telnyx is mocked
    process.env.TELNYX_API_KEY = process.env.TELNYX_API_KEY || 'test-api-key';
    process.env.TELNYX_CONNECTION_ID = process.env.TELNYX_CONNECTION_ID || 'test-connection-id';
    process.env.TELNYX_MESSAGING_PROFILE_ID = process.env.TELNYX_MESSAGING_PROFILE_ID || 'test-profile-id';
    process.env.TELNYX_PUBLIC_KEY = process.env.TELNYX_PUBLIC_KEY || 'test-public-key';
    process.env.TELNYX_DEFAULT_FROM_NUMBER = process.env.TELNYX_DEFAULT_FROM_NUMBER || '+15550001234';

    // Mock storage to avoid DB access in tests
    storage.getUserById = async (id: number) => ({ id, email: "test@example.com" } as any);
    storage.getUserByEmail = async () => ({ id: 1, email: "test@example.com" } as any);
    storage.getContacts = async () => ([{ id: 1, name: 'Test User', phone: '+15551230000' } as any]);
    storage.getLeads = async () => ([
      { id: 1, ownerName: "Lead One", ownerPhone: "+15551110000", address: "1 Main St", city: "Orlando", state: "FL", status: "new", doNotCall: false, nextFollowUpAt: null } as any,
      { id: 2, ownerName: "Lead Two", ownerPhone: "+15552220000", address: "2 Main St", city: "Orlando", state: "FL", status: "new", doNotCall: true, nextFollowUpAt: null } as any,
    ]);
    let calls: any[] = [];
    storage.createCallLog = async (log: any) => { const withId = { id: calls.length + 1, ...log }; calls.push(withId); return withId; };
    storage.updateCallLog = async (id: number, patch: any) => { const idx = calls.findIndex(c => c.id === id); if (idx >= 0) { calls[idx] = { ...calls[idx], ...patch }; return calls[idx]; } return { id, ...patch } as any; };
    storage.getCallLogs = async () => calls as any;
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
});
