import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { registerRoutes } from '../server/routes';
import { storage } from '../server/storage';

storage.listLeads = async ({ limit }: any) => ({
  items: Array.from({ length: limit ?? 10 }).map((_, i) => ({ id: i + 1 })),
  total: limit ?? 10,
}) as any;
storage.getPropertiesBySourceLeadIds = async () => [] as any;
storage.getProperties = async (limit?: number) => Array.from({ length: limit ?? 10 }).map((_, i) => ({ id: i + 1 })) as any;

describe('List Endpoints Pagination', () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
    app.use((req, _res, next) => {
      (req.session as any).userId = 1;
      next();
    });
    storage.getUserById = async (_id: number) => ({ id: 1, role: "admin", isSuperAdmin: true, isActive: true } as any);
    await registerRoutes(app);
  });

  it('GET /api/leads respects limit', async () => {
    const res = await request(app).get('/api/leads?limit=5');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(5);
  });

  it('GET /api/properties respects limit', async () => {
    const res = await request(app).get('/api/properties?limit=3');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(3);
  });
});
