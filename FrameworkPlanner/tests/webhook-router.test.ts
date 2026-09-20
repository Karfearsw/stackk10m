import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';
import request from 'supertest';
import express from 'express';

// Mock the DB pool before importing the router (the router queries pool directly).
// vi.hoisted ensures the factory can reference poolQuery before imports evaluate.
const { poolQuery } = vi.hoisted(() => ({ poolQuery: vi.fn() }));
vi.mock('../server/db.js', () => ({
  pool: { query: (...args: any[]) => poolQuery(...args) },
}));

import { createTelnyxWebhookRouter } from '../server/services/telecom/webhook-router';
import { telnyx } from '../server/services/telecom/telnyx-client';
import { storage } from '../server/storage';

// ── Ed25519 helpers (mirror Telnyx's webhook signing) ─────────────────────
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

function signBody(body: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.sign(null, Buffer.from(`${ts}.${body}`), privateKey).toString('base64');
  return `t=${ts},v1=${sig}`;
}

// ── Mutable pool behavior per test ────────────────────────────────────────
let callRow: any = null; // row returned by the exact call_control_id lookup
let pendingDialRow: any = null; // row returned by the pending WebRTC-dial lookup
let insertCallLogCalls = 0;
let updateCallLogMetaCalls = 0;
const dialCalls: any[] = [];
const bridgeCalls: any[] = [];
const hangupCcCalls: string[] = [];
let dedupeHit = false;   // when true, the event has already been processed
let updateCallLogCalls = 0;
let smsInsertCalls = 0;
let smsUpdateCalls = 0;

function routePoolQuery(sqlText: string, params?: any[]) {
  const s = String(sqlText || '');
  if (s.includes('processed_webhook_events')) {
    if (dedupeHit) return { rows: [] };
    return { rows: [{ event_id: params?.[0] }] };
  }
  if (s.includes('crm_sms_messages')) {
    if (s.trim().startsWith('UPDATE')) { smsUpdateCalls += 1; return { rows: [] }; }
    if (s.includes('INSERT INTO crm_sms_messages')) { smsInsertCalls += 1; return { rows: [] }; }
    return { rows: [] }; // SELECT dedupe check → assume not present
  }
  if (s.includes('SELECT') && (s.includes('call_control_id') || s.includes('metadata::text LIKE'))) {
    if (s.includes('webrtcPending')) return { rows: pendingDialRow ? [pendingDialRow] : [] };
    return { rows: callRow ? [callRow] : [] };
  }
  if (s.trim().startsWith('UPDATE call_logs')) {
    if (s.includes('metadata = $1')) updateCallLogMetaCalls += 1;
    updateCallLogCalls += 1;
    return { rows: [] };
  }
  if (s.includes('INSERT INTO call_logs')) { insertCallLogCalls += 1; return { rows: [{ id: 500, created_at: new Date().toISOString() }] }; }
  if (s.includes('global_activity_logs')) return { rows: [] };
  if (s.includes('leads')) return { rows: [] };
  return { rows: [] };
}

describe('Telnyx Webhook Router', () => {
  let app: express.Express;

  beforeAll(async () => {
    poolQuery.mockImplementation((sqlText: string, params?: any[]) =>
      Promise.resolve(routePoolQuery(sqlText, params)),
    );

    // Storage methods the AI assistant handler depends on.
    storage.getLeadById = async (id: number) => ({ id, notes: null, motivation: null, status: 'new' } as any);
    storage.updateLead = async (_id: number, patch: any) => ({ id: _id, ...patch } as any);
    storage.getTasksByRelatedEntity = async () => [];
    storage.createTask = vi.fn(async (input: any) => ({ id: 777, ...input } as any));
    storage.createGlobalActivity = async (input: any) => ({ id: 1, ...input } as any);

    // Stub the Telnyx API surface the parked-outbound flow calls.
    (telnyx as any).dial = vi.fn(async (input: any) => {
      dialCalls.push(input);
      return { callControlId: 'pstn-cc-1', callSessionId: null };
    });
    (telnyx as any).bridge = vi.fn(async (from: string, to: string) => {
      bridgeCalls.push({ from, to });
    });
    (telnyx as any).hangup = vi.fn(async (cc: string) => {
      hangupCcCalls.push(cc);
    });

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
    callRow = null;
    pendingDialRow = null;
    dedupeHit = false;
    updateCallLogCalls = 0;
    insertCallLogCalls = 0;
    updateCallLogMetaCalls = 0;
    dialCalls.length = 0;
    bridgeCalls.length = 0;
    hangupCcCalls.length = 0;
    smsInsertCalls = 0;
    smsUpdateCalls = 0;
    poolQuery.mockClear();
  });

  const waitForAsync = (ms = 120) => new Promise((r) => setTimeout(r, ms));

  it('verifyWebhookSignature accepts a valid Telnyx Ed25519 signature', () => {
    const body = JSON.stringify({ data: { event_type: 'call.initiated' } });
    const header = signBody(body);
    expect(telnyx.verifyWebhookSignature(Buffer.from(body), header)).toBe(true);
  });

  it('verifyWebhookSignature rejects a tampered payload', () => {
    const body = JSON.stringify({ data: { event_type: 'call.initiated' } });
    const header = signBody(body);
    expect(telnyx.verifyWebhookSignature(Buffer.from(JSON.stringify({ data: { event_type: 'call.hangup' } })), header)).toBe(false);
  });

  it('rejects unsigned webhooks with 401 when a public key is configured', async () => {
    const res = await request(app)
      .post('/')
      .send({ data: { event_type: 'call.initiated', id: 'evt-1' } });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid webhook signature');
  });

  it('accepts a signed call event and updates the call log exactly once', async () => {
    callRow = { id: 7, started_at: new Date(Date.now() - 10000).toISOString(), user_id: 1, status: 'ringing', lead_id: null, metadata: '{}', transcript: null };
    const body = JSON.stringify({ data: { event_type: 'call.answered', id: 'evt-answered', payload: { call_control_id: 'cc-1', call_state: 'answered' } } });
    const res = await request(app).post('/').set('Content-Type', 'application/json').set('Telnyx-Signature-Ed25519', signBody(body)).send(body);
    expect(res.status).toBe(200);
    await waitForAsync();
    expect(updateCallLogCalls).toBe(1);
  });

  it('skips processing an already-processed event id (dedupe)', async () => {
    dedupeHit = true;
    const body = JSON.stringify({ data: { event_type: 'call.answered', id: 'evt-dupe', payload: { call_control_id: 'cc-1', call_state: 'answered' } } });
    const res = await request(app).post('/').set('Content-Type', 'application/json').set('Telnyx-Signature-Ed25519', signBody(body)).send(body);
    expect(res.status).toBe(200);
    await waitForAsync();
    expect(updateCallLogCalls).toBe(0);
  });

  it('never downgrades a terminal call state (terminal guard)', async () => {
    callRow = { id: 8, started_at: new Date(Date.now() - 30000).toISOString(), user_id: 1, status: 'ended', lead_id: null, metadata: '{}', transcript: null };
    const body = JSON.stringify({ data: { event_type: 'call.ringing', id: 'evt-late', payload: { call_control_id: 'cc-1', call_state: 'ringing' } } });
    const res = await request(app).post('/').set('Content-Type', 'application/json').set('Telnyx-Signature-Ed25519', signBody(body)).send(body);
    expect(res.status).toBe(200);
    await waitForAsync();
    expect(updateCallLogCalls).toBe(0);
  });

  it('creates an inbound call log when no log exists yet', async () => {
    callRow = null;
    const body = JSON.stringify({
      data: {
        event_type: 'call.initiated',
        id: 'evt-inbound',
        payload: { call_control_id: 'cc-inbound', call_state: 'ringing', direction: 'inbound', from: '+13212940738' },
      },
    });
    const res = await request(app).post('/').set('Content-Type', 'application/json').set('Telnyx-Signature-Ed25519', signBody(body)).send(body);
    expect(res.status).toBe(200);
    await waitForAsync();
    const insertCalls = poolQuery.mock.calls.filter((c: any[]) => String(c[0]).includes('INSERT INTO call_logs'));
    expect(insertCalls.length).toBe(1);
    expect(String(insertCalls[0][0])).toContain('call_control_id');
  });

  it('persists inbound SMS message rows for conversation threads', async () => {
    const body = JSON.stringify({
      data: {
        event_type: 'message.received',
        id: 'evt-sms-1',
        payload: {
          id: 'msg-123',
          direction: 'inbound',
          from: { phone_number: '+13212940738' },
          to: [{ phone_number: '+15551234567' }],
          text: 'Hello, I am interested in selling',
        },
      },
    });
    const res = await request(app).post('/').set('Content-Type', 'application/json').set('Telnyx-Signature-Ed25519', signBody(body)).send(body);
    expect(res.status).toBe(200);
    await waitForAsync();
    expect(smsInsertCalls).toBe(1);
    const insertCall = poolQuery.mock.calls.find((c: any[]) => String(c[0]).includes('INSERT INTO crm_sms_messages'));
    expect(insertCall).toBeDefined();
    expect(String(insertCall![0])).toContain('provider_message_id');
    expect(insertCall![1]).toContain('msg-123');
    // Direction is inbound, linked to the from number.
    expect(insertCall![1]).toContain('+13212940738');
  });

  it('updates message delivery status on the persisted row', async () => {
    const body = JSON.stringify({
      data: {
        event_type: 'message.delivered',
        id: 'evt-sms-deliv',
        payload: {
          id: 'msg-123',
          direction: 'outbound',
          from: '+15551234567',
          to: '+13212940738',
          text: 'hello',
        },
      },
    });
    const res = await request(app).post('/').set('Content-Type', 'application/json').set('Telnyx-Signature-Ed25519', signBody(body)).send(body);
    expect(res.status).toBe(200);
    await waitForAsync();
    expect(smsUpdateCalls).toBe(1);
    const updateCall = poolQuery.mock.calls.find((c: any[]) => String(c[0]).startsWith('UPDATE crm_sms_messages'));
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toContain('delivered');
    expect(updateCall![1]).toContain('msg-123');
  });

  it('stores AI assistant transcripts and updates the lead when qualified', async () => {
    callRow = { id: 42, started_at: new Date(Date.now() - 60000).toISOString(), user_id: 1, status: 'answered', lead_id: 3, metadata: '{}', transcript: null };
    const updateLeadMock = vi.fn(async (_id: number, patch: any) => ({ id: _id, ...patch } as any));
    storage.updateLead = updateLeadMock;

    const body = JSON.stringify({
      data: {
        event_type: 'ai_assistant.message_history_updated',
        id: 'evt-ai-1',
        payload: {
          call_control_id: 'cc-ai-1',
          assistant_id: 'asst_screener',
          message_history: [
            { role: 'user', content: 'Hi, interested in selling my property' },
            { role: 'assistant', content: 'Great! What is your budget? Qualified: yes. Intent: sell' },
          ],
        },
      },
    });
    const res = await request(app).post('/').set('Content-Type', 'application/json').set('Telnyx-Signature-Ed25519', signBody(body)).send(body);
    expect(res.status).toBe(200);
    await waitForAsync();

    // Transcript persisted on the call log.
    const updateCalls = poolQuery.mock.calls.filter((c: any[]) => String(c[0]).includes('UPDATE call_logs'));
    expect(updateCalls.length).toBe(1);
    expect(String(updateCalls[0][0])).toContain('transcript');
    expect(String(updateCalls[0][0])).toContain('ai_qualified');

    // Lead updated with notes.
    expect(updateLeadMock).toHaveBeenCalled();
    const leadPatch = updateLeadMock.mock.calls[0][1];
    expect(String(leadPatch.notes || '')).toContain('[AI Screener');
    expect(String(leadPatch.notes || '')).toContain('Qualified: YES');
    expect(leadPatch.motivation).toBe('selling');

    // Follow-up task created once.
    expect(storage.createTask).toHaveBeenCalled();
    const taskInput = (storage.createTask as any).mock.calls[0][0];
    expect(taskInput.title).toBe('AI Screener follow-up');
    expect(taskInput.relatedEntityId).toBe(3);
  });

  // ── Parked-outbound WebRTC dialer (WebRTC browser leg → PSTN leg) ──────

  function parkedLegBody(overrides: Record<string, unknown> = {}): string {
    const clientState = Buffer.from(JSON.stringify({
      kind: 'webrtc_dial',
      destinationNumber: '+15551230000',
      userId: 7,
    })).toString('base64');
    return JSON.stringify({
      data: {
        event_type: 'call.initiated',
        id: 'evt-parked-1',
        payload: {
          call_control_id: 'browser-cc-1',
          call_state: 'parked',
          direction: 'incoming',
          client_state: clientState,
          ...overrides,
        },
      },
    });
  }

  it('dials the PSTN leg and binds the call log when a parked WebRTC leg arrives', async () => {
    pendingDialRow = { id: 900, user_id: 7, metadata: JSON.stringify({ webrtcPending: true, destinationNumber: '+15551230000' }) };
    const body = parkedLegBody();
    const res = await request(app).post('/').set('Content-Type', 'application/json').set('Telnyx-Signature-Ed25519', signBody(body)).send(body);
    expect(res.status).toBe(200);
    await waitForAsync();

    expect(dialCalls.length).toBe(1);
    expect(dialCalls[0].to).toBe('+15551230000');

    // The browser leg's cc is bound to the pending log; status → ringing.
    const updates = poolQuery.mock.calls.filter((c: any[]) => String(c[0]).trim().startsWith('UPDATE call_logs'));
    expect(updates.length).toBe(1);
    expect(String(updates[0][0])).toContain('call_control_id = $1');
    expect(updates[0][1][0]).toBe('browser-cc-1');
  });

  it('hangs up the parked leg without dialing when the destination is do-not-call', async () => {
    // Queue responses in call order: claim → pending lookup → leads DNC probe.
    poolQuery.mockImplementationOnce(async () => ({ rows: [{ event_id: 'evt-parked-1' }] }));
    poolQuery.mockImplementationOnce(async () => ({ rows: [{ id: 900, user_id: 7, metadata: '{}' }] }));
    poolQuery.mockImplementationOnce(async () => ({ rows: [{ id: 1 }] })); // DNC hit
    const body = parkedLegBody();
    const res = await request(app).post('/').set('Content-Type', 'application/json').set('Telnyx-Signature-Ed25519', signBody(body)).send(body);
    expect(res.status).toBe(200);
    await waitForAsync();

    expect(dialCalls.length).toBe(0);
    expect(hangupCcCalls).toEqual(['browser-cc-1']);
  });

  it('bridges the WebRTC and PSTN legs when the PSTN leg answers', async () => {
    callRow = {
      id: 900,
      started_at: new Date().toISOString(),
      user_id: 7,
      status: 'ringing',
      lead_id: null,
      metadata: JSON.stringify({ webrtcCallControlId: 'browser-cc-1', pstnCallControlId: 'pstn-cc-1' }),
      transcript: null,
    };
    const body = JSON.stringify({
      data: {
        event_type: 'call.answered',
        id: 'evt-answered-1',
        payload: { call_control_id: 'pstn-cc-1', call_state: 'answered', direction: 'outbound' },
      },
    });
    const res = await request(app).post('/').set('Content-Type', 'application/json').set('Telnyx-Signature-Ed25519', signBody(body)).send(body);
    expect(res.status).toBe(200);
    await waitForAsync();

    expect(bridgeCalls.length).toBe(1);
    expect(bridgeCalls[0]).toEqual({ from: 'browser-cc-1', to: 'pstn-cc-1' });
    expect(updateCallLogMetaCalls).toBe(1);
  });

  it('ignores answered legs with no WebRTC correlation (regular PSTN calls unaffected)', async () => {
    callRow = null;
    const body = JSON.stringify({
      data: {
        event_type: 'call.answered',
        id: 'evt-answered-2',
        payload: { call_control_id: 'pstn-plain-1', call_state: 'answered', direction: 'outbound' },
      },
    });
    const res = await request(app).post('/').set('Content-Type', 'application/json').set('Telnyx-Signature-Ed25519', signBody(body)).send(body);
    expect(res.status).toBe(200);
    await waitForAsync();

    expect(bridgeCalls.length).toBe(0);
    expect(dialCalls.length).toBe(0);
  });
});
