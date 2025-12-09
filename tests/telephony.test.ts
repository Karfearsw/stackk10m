import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { registerRoutes } from '../server/routes';
import { storage } from '../server/storage';

describe('Telephony Routes', () => {
  let app: express.Express;

  beforeAll(async () => {
    // Mock storage to avoid DB access in tests
    storage.getContacts = async () => ([{ id: 1, name: 'Test User', phone: '+15551230000' } as any]);
    let calls: any[] = [];
    storage.createCallLog = async (log: any) => { const withId = { id: calls.length + 1, ...log }; calls.push(withId); return withId; };
    storage.updateCallLog = async (id: number, patch: any) => { const idx = calls.findIndex(c => c.id === id); if (idx >= 0) { calls[idx] = { ...calls[idx], ...patch }; return calls[idx]; } return { id, ...patch } as any; };
    storage.getCallLogs = async () => calls as any;
    app = express();
    app.use(express.json());
    app.use(session({ secret: 'test', resave: false, saveUninitialized: true }));
    await registerRoutes(app);
  });

  it('GET /api/telephony/contacts returns items', async () => {
    const res = await request(app).get('/api/telephony/contacts?query=');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
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
});
