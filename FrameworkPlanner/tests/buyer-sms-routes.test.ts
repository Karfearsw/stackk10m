import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';

const { sendSmsMock } = vi.hoisted(() => ({ sendSmsMock: vi.fn(async () => ({ messageId: 'test-message-id' })) }));

vi.mock('../server/services/telecom/telnyx-client', () => ({
  telnyx: {
    dial: async () => ({ callControlId: 'test-call-control-id' }),
    hangup: async () => {},
    sendSms: sendSmsMock,
    transfer: async () => {},
    answer: async () => {},
    startAiAssistant: async () => {},
    stopAiAssistant: async () => {},
    healthCheck: async () => ({ status: 'reachable', code: 200, message: 'Connection is active', connectionFound: true, connectionActive: true, httpStatus: 200 }),
    diagnostics: () => ({ telnyxConfigured: true }),
  },
  TelnyxConfigError: class TelnyxConfigError extends Error {},
  createTelnyxWebhookRouter: () => express(),
}));

import { registerRoutes } from '../server/routes';
import { storage } from '../server/storage';

describe('Buyer SMS routes', () => {
  let app: express.Express;
  const createdSms: any[] = [];

  beforeAll(async () => {
    process.env.TELNYX_API_KEY = process.env.TELNYX_API_KEY || 'test-api-key';
    process.env.TELNYX_MESSAGING_PROFILE_ID = process.env.TELNYX_MESSAGING_PROFILE_ID || 'test-profile-id';
    process.env.TELNYX_DEFAULT_FROM_NUMBER = process.env.TELNYX_DEFAULT_FROM_NUMBER || '+15550001234';

    storage.getUserById = async (id: number) => ({ id, email: 'test@example.com' } as any);
    storage.getUserByEmail = async () => ({ id: 1, email: 'test@example.com' } as any);
    storage.getBuyerById = async (id: number) =>
      ({ id, name: `Buyer ${id}`, phone: '+12406935776', doNotCall: id === 9, dncUpdatedAt: null } as any);
    storage.createSmsMessage = async (input: any) => {
      const row = { id: createdSms.length + 1, ...input };
      createdSms.push(row);
      return row as any;
    };
    storage.getSmsThreadByBuyer = async (buyerId: number) =>
      createdSms.filter((m: any) => m.buyerId === buyerId) as any;
    storage.createGlobalActivity = async (input: any) => ({ id: 1, ...input } as any);

    app = express();
    app.use(express.json());
    app.use(session({ secret: 'test', resave: false, saveUninitialized: true }));
    app.use((req: any, _res, next) => { req.session.userId = 1; next(); });
    await registerRoutes(app);
  });

  it('POST /api/telephony/sms with metadata.buyerId persists buyer_id', async () => {
    const res = await request(app)
      .post('/api/telephony/sms')
      .send({ to: '+12406935776', body: 'Hello buyer', metadata: { buyerId: 7 } });
    expect(res.status).toBe(200);
    const saved = createdSms[createdSms.length - 1];
    expect(saved.buyerId).toBe(7);
    expect(saved.direction).toBe('outbound');
    expect(sendSmsMock).toHaveBeenCalled();
  });

  it('POST /api/telephony/sms to a DNC buyer returns 403 DNC_BLOCKED without sending', async () => {
    sendSmsMock.mockClear();
    const before = createdSms.length;
    const res = await request(app)
      .post('/api/telephony/sms')
      .send({ to: '+12406935776', body: 'Hello buyer', metadata: { buyerId: 9 } });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DNC_BLOCKED');
    expect(sendSmsMock).not.toHaveBeenCalled();
    expect(createdSms.length).toBe(before);
  });

  it('GET /api/buyers/:id/sms-thread returns the buyer thread', async () => {
    await request(app)
      .post('/api/telephony/sms')
      .send({ to: '+12406935776', body: 'Thread message', metadata: { buyerId: 7 } });
    const res = await request(app).get('/api/buyers/7/sms-thread');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.messages)).toBe(true);
    expect(res.body.messages.length).toBeGreaterThan(0);
    expect(res.body.messages.every((m: any) => m.buyerId === 7)).toBe(true);
  });

  it('GET /api/buyers/:id/sms-thread rejects invalid buyer ids', async () => {
    const res = await request(app).get('/api/buyers/nope/sms-thread');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_BUYER_ID');
  });
});
