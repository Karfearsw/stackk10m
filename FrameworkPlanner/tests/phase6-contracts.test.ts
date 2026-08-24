import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';

vi.mock('../server/services/telecom/telnyx-client', () => ({
  telnyx: {
    dial: async () => ({ callControlId: 'test' }),
    hangup: async () => {},
    sendSms: async () => ({ messageId: 'test' }),
    healthCheck: async () => ({ status: 'reachable', code: 200, message: 'ok', connectionFound: true, connectionActive: true, httpStatus: 200 }),
    diagnostics: () => ({ telnyxConfigured: true, apiKeyPrefix: 't', usedPublicKey: false, baseUrl: 'https://api.telnyx.com/v2', connectionId: '3027149000869414740', messagingProfileId: 'p', defaultFrom: '+15550001234' }),
  },
  createTelnyxWebhookRouter: () => express(),
}));

import { registerRoutes } from '../server/routes';
import { storage } from '../server/storage';
import { vi } from 'vitest';

describe('Phase 6: Contract template governance + opportunity linkage', () => {
  let app: express.Express;
  const templates: any[] = [];
  const contracts: any[] = [];
  let currentUser: any = { id: 1, email: 'u1@example.com', role: 'admin' };

  beforeAll(async () => {
    storage.getUserById = async (id: number) => ({ id, email: `u${id}@example.com`, role: currentUser.role, isSuperAdmin: currentUser.isSuperAdmin });

    storage.createContractTemplate = async (t: any) => { const r = { id: templates.length + 1, ...t }; templates.push(r); return r; };
    storage.getContractTemplateById = async (id: number) => templates.find((t) => t.id === id);
    storage.updateContractTemplate = async (id: number, p: any) => { const t = templates.find((x) => x.id === id); if (t) Object.assign(t, p); return t; };
    storage.approveContractTemplate = async (id: number, userId: number) => {
      const t = templates.find((x) => x.id === id);
      if (t) { t.status = 'approved'; t.approvedByUserId = userId; t.approvedAt = new Date(); t.isActive = true; }
      return t;
    };
    storage.cloneContractTemplate = async (parentId: number, ownerUserId: number) => {
      const p = templates.find((x) => x.id === parentId);
      if (!p) return undefined;
      const c = { id: templates.length + 1, ...p, id: undefined, status: 'draft', approvedByUserId: null, approvedAt: null, lastReviewedAt: null, isActive: false, ownerUserId, version: (p.version || 1) + 1, parentTemplateId: p.id };
      const row = { id: templates.length + 1, ...c }; templates.push(row); return row;
    };

    storage.createContract = async (c: any) => { const r = { id: contracts.length + 1, ...c }; contracts.push(r); return r; };

    app = express();
    app.use(express.json());
    app.use(session({ secret: 'test', resave: false, saveUninitialized: true }));
    app.use((req: any, _res, next) => { req.session.userId = 1; next(); });
    await registerRoutes(app);
  });

  it('POST /api/contract-templates sets owner, draft status and version 1', async () => {
    const res = await request(app).post('/api/contract-templates').send({ name: 'LOI', content: '{{property.address}}' });
    expect(res.status).toBe(201);
    expect(res.body.ownerUserId).toBe(1);
    expect(res.body.status).toBe('draft');
    expect(res.body.version).toBe(1);
  });

  it('PATCH approved template content is immutable (requires revise)', async () => {
    templates.push({ id: 99, name: 'Approved PSA', content: 'A', status: 'approved', version: 2, approvedByUserId: 1 });
    const res = await request(app).patch('/api/contract-templates/99').send({ content: 'B' });
    expect(res.status).toBe(400);
  });

  it('PATCH a draft template content succeeds', async () => {
    templates.push({ id: 100, name: 'Draft NDA', content: 'A', status: 'draft', version: 1 });
    const res = await request(app).patch('/api/contract-templates/100').send({ content: 'B' });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('B');
  });

  it('approve endpoint requires manager/admin role', async () => {
    currentUser = { id: 1, email: 'u1', role: 'agent' };
    let r = await request(app).post('/api/contract-templates/99/approve');
    expect(r.status).toBe(403);

    currentUser = { id: 1, email: 'u1', role: 'admin' };
    r = await request(app).post('/api/contract-templates/99/approve');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('approved');
    expect(r.body.approvedByUserId).toBe(1);
  });

  it('revise creates a new version lineage (parent + version+1)', async () => {
    const res = await request(app).post('/api/contract-templates/99/revise');
    expect(res.status).toBe(201);
    expect(res.body.parentTemplateId).toBe(99);
    expect(res.body.version).toBe(3);
    expect(res.body.status).toBe('draft');
  });

  it('POST /api/contracts persists opportunityId linkage', async () => {
    const res = await request(app).post('/api/contracts').send({
      title: 'Test', propertyId: 5, opportunityId: 7, templateId: 1, contractType: 'purchase_agreement', status: 'draft', ownerUserId: 1,
    });
    expect(res.status).toBe(201);
    expect(res.body.opportunityId).toBe(7);
    expect(res.body.propertyId).toBe(5);
  });
});
