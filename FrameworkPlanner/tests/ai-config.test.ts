import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_7sAWdTo6cjpF@ep-rough-paper-an8epzvm.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
process.env.DB_STARTUP_TEST = "false";
process.env.TELNYX_API_KEY = process.env.TELNYX_API_KEY || "test-api-key";
process.env.TELNYX_CONNECTION_ID = process.env.TELNYX_CONNECTION_ID || "test-connection-id";
process.env.TELNYX_MESSAGING_PROFILE_ID = process.env.TELNYX_MESSAGING_PROFILE_ID || "test-profile-id";
process.env.TELNYX_PUBLIC_KEY = process.env.TELNYX_PUBLIC_KEY || "test-public-key";
process.env.TELNYX_DEFAULT_FROM_NUMBER = process.env.TELNYX_DEFAULT_FROM_NUMBER || "+15555550123";

import { registerRoutes } from '../server/routes';

describe('AI Config Endpoints', () => {
  let app: express.Express;
  const original = {
    TELNYX_API_KEY: process.env.TELNYX_API_KEY,
    TELNYX_CONNECTION_ID: process.env.TELNYX_CONNECTION_ID,
    TELNYX_MESSAGING_PROFILE_ID: process.env.TELNYX_MESSAGING_PROFILE_ID,
    TELNYX_PUBLIC_KEY: process.env.TELNYX_PUBLIC_KEY,
    TELNYX_DEFAULT_FROM_NUMBER: process.env.TELNYX_DEFAULT_FROM_NUMBER,
  };

  beforeAll(async () => {
    delete process.env.TELNYX_API_KEY;
    delete process.env.TELNYX_CONNECTION_ID;
    delete process.env.TELNYX_MESSAGING_PROFILE_ID;
    delete process.env.TELNYX_PUBLIC_KEY;
    delete process.env.TELNYX_DEFAULT_FROM_NUMBER;
    app = express();
    app.use(express.json());
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
    await registerRoutes(app);
  });

  afterAll(() => {
    process.env.TELNYX_API_KEY = original.TELNYX_API_KEY;
    process.env.TELNYX_CONNECTION_ID = original.TELNYX_CONNECTION_ID;
    process.env.TELNYX_MESSAGING_PROFILE_ID = original.TELNYX_MESSAGING_PROFILE_ID;
    process.env.TELNYX_PUBLIC_KEY = original.TELNYX_PUBLIC_KEY;
    process.env.TELNYX_DEFAULT_FROM_NUMBER = original.TELNYX_DEFAULT_FROM_NUMBER;
  });

  it('GET /api/ai/config reports missing keys when not set', async () => {
    const res = await request(app).get('/api/ai/config');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(false);
    expect(res.body.missing).toContain('TELNYX_API_KEY');
    expect(res.body.missing).toContain('TELNYX_CONNECTION_ID');
    expect(res.body.missing).toContain('TELNYX_MESSAGING_PROFILE_ID');
  });

  it('GET /api/ai/ping returns ok=false when not configured', async () => {
    const res = await request(app).get('/api/ai/ping');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
  });

  it('reports ready=true and ping ok when configured', async () => {
    process.env.TELNYX_API_KEY = 'key_test';
    process.env.TELNYX_CONNECTION_ID = 'conn_test';
    process.env.TELNYX_MESSAGING_PROFILE_ID = 'profile_test';
    process.env.TELNYX_PUBLIC_KEY = 'pubkey_test';
    process.env.TELNYX_DEFAULT_FROM_NUMBER = '+15555550123';
    const cfg = await request(app).get('/api/ai/config');
    expect(cfg.status).toBe(200);
    expect(cfg.body.ready).toBe(true);
    expect(cfg.body.missing.length).toBe(0);
    const ping = await request(app).get('/api/ai/ping');
    expect(ping.status).toBe(200);
    expect(ping.body.ok).toBe(true);
  });
});
