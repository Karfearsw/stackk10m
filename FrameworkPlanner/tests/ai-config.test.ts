import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { registerRoutes } from '../server/routes';

describe('AI Config Endpoints', () => {
  let app: express.Express;
  const original = {
    SIGNALWIRE_SPACE_URL: process.env.SIGNALWIRE_SPACE_URL,
    SIGNALWIRE_PROJECT_ID: process.env.SIGNALWIRE_PROJECT_ID,
    SIGNALWIRE_API_TOKEN: process.env.SIGNALWIRE_API_TOKEN,
  };

  beforeAll(async () => {
    delete process.env.SIGNALWIRE_SPACE_URL;
    delete process.env.SIGNALWIRE_PROJECT_ID;
    delete process.env.SIGNALWIRE_API_TOKEN;
    app = express();
    app.use(express.json());
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
    await registerRoutes(app);
  });

  afterAll(() => {
    process.env.SIGNALWIRE_SPACE_URL = original.SIGNALWIRE_SPACE_URL;
    process.env.SIGNALWIRE_PROJECT_ID = original.SIGNALWIRE_PROJECT_ID;
    process.env.SIGNALWIRE_API_TOKEN = original.SIGNALWIRE_API_TOKEN;
  });

  it('GET /api/ai/config reports missing keys when not set', async () => {
    const res = await request(app).get('/api/ai/config');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(false);
    expect(res.body.missing).toContain('SIGNALWIRE_SPACE_URL');
    expect(res.body.missing).toContain('SIGNALWIRE_PROJECT_ID');
    expect(res.body.missing).toContain('SIGNALWIRE_API_TOKEN');
  });

  it('GET /api/ai/ping returns ok=false when not configured', async () => {
    const res = await request(app).get('/api/ai/ping');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
  });

  it('reports ready=true and ping ok when configured', async () => {
    process.env.SIGNALWIRE_SPACE_URL = 'https://space.signalwire.com';
    process.env.SIGNALWIRE_PROJECT_ID = 'proj_123';
    process.env.SIGNALWIRE_API_TOKEN = 'token_abc';
    const cfg = await request(app).get('/api/ai/config');
    expect(cfg.status).toBe(200);
    expect(cfg.body.ready).toBe(true);
    expect(cfg.body.missing.length).toBe(0);
    const ping = await request(app).get('/api/ai/ping');
    expect(ping.status).toBe(200);
    expect(ping.body.ok).toBe(true);
  });
});

