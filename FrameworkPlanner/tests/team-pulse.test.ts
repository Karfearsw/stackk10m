import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';

// TEAM PULSE endpoint test — mocks storage + db so the aggregation/bucketing
// logic in GET /api/team-pulse is verified without a live database.
vi.mock('../server/storage', () => ({
  storage: {
    getUserByIdWithoutProfilePicture: async () => ({ id: 1, email: 'admin@test.local', role: 'admin', isActive: true }),
    // Bound at routes.ts module load (createIsFeatureEnabled) — must exist.
    getUserFeatureFlag: async () => undefined,
    getUsers: async () => [
      { id: 1, firstName: 'Ada', lastName: 'Admin', email: 'admin@test.local', isActive: true, profilePicture: null, avatarUrl: null },
      { id: 2, firstName: 'Ben', lastName: 'Quiet', email: 'ben@test.local', isActive: true, profilePicture: null, avatarUrl: null },
      { id: 3, firstName: 'Gone', lastName: 'User', email: 'gone@test.local', isActive: false, profilePicture: null, avatarUrl: null },
    ],
    getTeamPulseWindow: async (hours: number) => {
      (globalThis as any).__pulseHours = hours;
      return [
        { userId: 1, action: 'lead.created', count: 7, lastAt: new Date(Date.now() - 5 * 60 * 1000) },
        { userId: 1, action: 'lead.updated', count: 5, lastAt: new Date(Date.now() - 2 * 60 * 1000) },
        { userId: 1, action: 'task.completed', count: 3, lastAt: new Date(Date.now() - 10 * 60 * 1000) },
        { userId: 99, action: 'call_started', count: 2, lastAt: new Date(Date.now() - 30 * 60 * 1000) },
      ];
    },
  },
}));

// The highlights query is a drizzle chain; resolve to one duplicated burst so
// the 15-minute grouping can be asserted (3 identical events -> one ×3 row).
const highlightsResult: any[] = [
  { id: 1, userId: 1, action: 'lead.created', description: 'Lead: 123 Main St', createdAt: new Date(Date.now() - 4 * 60 * 1000) },
  { id: 2, userId: 1, action: 'lead.created', description: 'Lead: 123 Main St', createdAt: new Date(Date.now() - 6 * 60 * 1000) },
  { id: 3, userId: 1, action: 'lead.created', description: 'Lead: 123 Main St', createdAt: new Date(Date.now() - 9 * 60 * 1000) },
  { id: 4, userId: 99, action: 'call_started', description: 'Call started', createdAt: new Date(Date.now() - 30 * 60 * 1000) },
];
vi.mock('../server/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => highlightsResult,
          }),
        }),
      }),
    }),
  },
  pool: {},
}));

import { registerRoutes } from '../server/routes';

describe('GET /api/team-pulse', () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
    app.use((req, _res, next) => {
      (req.session as any).userId = 1;
      next();
    });
    await registerRoutes(app);
  });

  it('requires auth', async () => {
    const bare = express();
    bare.use(express.json());
    await registerRoutes(bare);
    const res = await request(bare).get('/api/team-pulse');
    expect(res.status).toBe(401);
  });

  it('returns the standup shape with buckets, quiet list, orphans and grouped highlights', async () => {
    const res = await request(app).get('/api/team-pulse');
    expect(res.status).toBe(200);
    expect(res.body.hours).toBe(24);
    expect(res.body.totalTeammates).toBe(2); // active roster only (Gone is inactive)
    expect(res.body.totalActive).toBe(1);

    // Ada: 12 leads + 3 tasks bucketed from two lead actions + one task action.
    const ada = res.body.active.find((p: any) => p.userId === 1);
    expect(ada).toBeTruthy();
    expect(ada.counts.leads).toBe(12);
    expect(ada.counts.tasks).toBe(3);
    expect(ada.counts.calls).toBe(0);
    expect(ada.total).toBe(15);
    expect(ada.lastActiveAt).toBeTruthy();

    // Ben has no activity -> quiet; inactive Gone is not listed at all.
    expect(res.body.quiet.map((p: any) => p.userId)).toEqual([2]);
    expect(res.body.active.concat(res.body.quiet).map((p: any) => p.userId)).not.toContain(3);

    // Orphan activity from user 99 (off roster) surfaces as a ghost row.
    expect(res.body.orphans.map((p: any) => p.userId)).toEqual([99]);
    expect(res.body.orphans[0].total).toBe(2);

    // 3 identical lead.created events inside the window collapse to one ×3 row.
    const leadHighlight = res.body.highlights.find((h: any) => h.id === 1);
    expect(leadHighlight.groupCount).toBe(3);
    expect(res.body.highlights.some((h: any) => h.id === 2 || h.id === 3)).toBe(false);
    expect(res.body.highlights.some((h: any) => h.id === 4)).toBe(true);
  });

  it('clamps the hours window', async () => {
    const res = await request(app).get('/api/team-pulse?hours=99999');
    expect(res.status).toBe(200);
    expect((globalThis as any).__pulseHours).toBe(720);
    expect(res.body.hours).toBe(720);
  });
});
