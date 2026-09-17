import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';
import request from 'supertest';
import express from 'express';

// ── Webhook half: mock the DB pool before importing the router ──────────────
const { poolQuery } = vi.hoisted(() => ({ poolQuery: vi.fn() }));
vi.mock('../server/db.js', () => ({
  pool: { query: (...args: any[]) => poolQuery(...args) },
}));

import { createTelnyxWebhookRouter } from '../server/services/telecom/webhook-router';
import { storage } from '../server/storage';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

function signBody(body: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.sign(null, Buffer.from(`${ts}.${body}`), privateKey).toString('base64');
  return `t=${ts},v1=${sig}`;
}

// ── Captured writes ─────────────────────────────────────────────────────────
let smsInserts: any[][] = [];
let activityInserts: any[][] = [];
let buyerRow: any = null; // row returned by the buyers phone lookup
const setBuyerDncMock = vi.fn(async (id: number, dnc: boolean) => ({ id, doNotCall: dnc } as any));

function routePoolQuery(sqlText: string, params?: any[]) {
  const s = String(sqlText || '');
  if (s.includes('processed_webhook_events')) return { rows: [{ event_id: params?.[0] }] };
  if (s.includes('FROM buyers')) return { rows: buyerRow ? [buyerRow] : [] };
  if (s.includes('FROM leads')) return { rows: [] };
  if (s.includes('SELECT 1 FROM crm_sms_messages')) return { rows: [] };
  if (s.includes('INSERT INTO crm_sms_messages')) { smsInserts.push(params || []); return { rows: [] }; }
  if (s.includes('INSERT INTO global_activity_logs')) { activityInserts.push(params || []); return { rows: [] }; }
  return { rows: [] };
}

function messageEvent(overrides: any = {}) {
  return JSON.stringify({
    data: {
      event_type: 'message.received',
      id: `evt-${Math.random().toString(36).slice(2)}`,
      payload: {
        id: `msg-${Math.random().toString(36).slice(2)}`,
        direction: 'inbound',
        from: { phone_number: '+12406935776' },
        to: [{ phone_number: '+13212940738' }],
        text: 'Sounds good, send me deals',
        ...overrides,
      },
    },
  });
}

describe('Buyer SMS webhook', () => {
  let app: express.Express;

  beforeAll(async () => {
    poolQuery.mockImplementation((sqlText: string, params?: any[]) =>
      Promise.resolve(routePoolQuery(sqlText, params)),
    );
    (storage as any).setBuyerDnc = setBuyerDncMock;
    process.env.TELNYX_PUBLIC_KEY = publicKeyDer;
    process.env.TELNYX_WEBHOOK_SIGNING_TOLERANCE_SECONDS = '300';

    app = express();
    app.use(
      express.json({
        verify: (req: any, _res, buf) => {
          req.rawBody = buf;
        },
      }),
    );
    app.use('/', createTelnyxWebhookRouter());
  });

  beforeEach(() => {
    smsInserts = [];
    activityInserts = [];
    buyerRow = null;
    setBuyerDncMock.mockClear();
    poolQuery.mockClear();
  });

  it('inbound SMS from a buyer phone sets buyer_id on the persisted row', async () => {
    buyerRow = { id: 42 };
    const body = messageEvent();
    const res = await request(app).post('/').set('telnyx-signature-ed25519', signBody(body)).send(JSON.parse(body));
    expect(res.status).toBe(200);
    expect(smsInserts.length).toBe(1);
    // params: [effectiveLeadId, buyerId, from, to, body, messageId, metadataJson]
    expect(smsInserts[0][1]).toBe(42);
    expect(setBuyerDncMock).not.toHaveBeenCalled();
  });

  it('inbound STOP sets do_not_call and writes an sms_opt_out activity row', async () => {
    buyerRow = { id: 42 };
    const body = messageEvent({ text: 'stop' });
    const res = await request(app).post('/').set('telnyx-signature-ed25519', signBody(body)).send(JSON.parse(body));
    expect(res.status).toBe(200);
    expect(setBuyerDncMock).toHaveBeenCalledWith(42, true);
    const optOut = activityInserts.find((p) => p[1] === 'sms_opt_out');
    expect(optOut).toBeDefined();
    expect(JSON.parse(optOut[3]).buyerId).toBe(42);
  });

  it('inbound START clears do_not_call with an sms_opt_in activity row', async () => {
    buyerRow = { id: 42 };
    const body = messageEvent({ text: 'START' });
    const res = await request(app).post('/').set('telnyx-signature-ed25519', signBody(body)).send(JSON.parse(body));
    expect(res.status).toBe(200);
    expect(setBuyerDncMock).toHaveBeenCalledWith(42, false);
    expect(activityInserts.some((p) => p[1] === 'sms_opt_in')).toBe(true);
  });

  it('non-keyword inbound SMS does not touch DNC', async () => {
    buyerRow = { id: 42 };
    const body = messageEvent({ text: 'What areas do you cover?' });
    await request(app).post('/').set('telnyx-signature-ed25519', signBody(body)).send(JSON.parse(body));
    expect(setBuyerDncMock).not.toHaveBeenCalled();
    expect(activityInserts.some((p) => p[1] === 'sms_opt_out' || p[1] === 'sms_opt_in')).toBe(false);
  });
});
