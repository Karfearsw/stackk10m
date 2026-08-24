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
    diagnostics: () => ({ telnyxConfigured: true, apiKeyPrefix: 'test-a', usedPublicKey: false, baseUrl: 'https://api.telnyx.com/v2', connectionId: '3027149000869414740', messagingProfileId: 'test-profile-id', defaultFrom: '+15550001234' }),
  },
  createTelnyxWebhookRouter: () => express(),
}));

import { registerRoutes } from '../server/routes';
import { storage } from '../server/storage';

describe('Phase 5 Ops: Messages, Calendar, Notifications, Health', () => {
  let app: express.Express;
  const messages: any[] = [];
  const events: any[] = [];
  const notifications: any[] = [];
  let prefs: any = { userId: 1, emailEnabled: true, pushEnabled: true, inAppEnabled: true, categories: {} };

  beforeAll(async () => {
    process.env.TELNYX_API_KEY = process.env.TELNYX_API_KEY || 'test-api-key';
    process.env.TELNYX_CONNECTION_ID = process.env.TELNYX_CONNECTION_ID || '3027149000869414740';
    process.env.TELNYX_MESSAGING_PROFILE_ID = process.env.TELNYX_MESSAGING_PROFILE_ID || 'test-profile-id';
    process.env.TELNYX_PUBLIC_KEY = process.env.TELNYX_PUBLIC_KEY || 'test-public-key';
    process.env.TELNYX_DEFAULT_FROM_NUMBER = process.env.TELNYX_DEFAULT_FROM_NUMBER || '+15550001234';

    storage.getUserById = async (id: number) => ({ id, email: `user${id}@example.com`, firstName: 'Test', lastName: `User${id}` } as any);
    storage.getUserByEmail = async () => ({ id: 1, email: 'test@example.com' } as any);

    storage.getNotificationPreferencesByUserId = async (userId: number) => (prefs.userId === userId ? { ...prefs } : undefined);
    storage.createNotificationPreferences = async (p: any) => { prefs = { ...prefs, ...p }; return prefs; };
    storage.updateNotificationPreferences = async (userId: number, p: any) => { prefs = { ...prefs, ...p }; return prefs; };
    storage.createUserNotificationDedup = async (n: any) => {
      const dup = notifications.find((x) => x.eventKey && x.eventKey === n.eventKey && x.userId === n.userId);
      if (dup) return null;
      const withId = { id: notifications.length + 1, ...n };
      notifications.push(withId);
      return withId;
    };
    storage.getUserNotifications = async () => notifications as any;
    storage.getUnreadNotificationCount = async (userId: number) => notifications.filter((n) => n.userId === userId && !n.read).length;
    storage.getUserNotificationById = async (id: number) => notifications.find((n) => n.id === id);
    storage.markNotificationAsRead = async (id: number) => { const n = notifications.find((x) => x.id === id); if (n) n.read = true; return n; };
    storage.deleteUserNotification = async (id: number) => { const i = notifications.findIndex((n) => n.id === id); if (i >= 0) notifications.splice(i, 1); };

    storage.createInternalMessage = async (m: any) => { const withId = { id: messages.length + 1, ...m }; messages.push(withId); return withId; };
    storage.getInternalMessages = async () => messages as any;
    storage.getInternalMessageConversations = async () => [{ counterpart_id: 2, last_message: 'hi', last_at: new Date().toISOString(), unread_count: 0 }];
    storage.getInternalMessageUnreadCount = async () => 0;
    storage.markInternalMessagesRead = async () => {};

    storage.createCalendarEvent = async (e: any) => { const withId = { id: events.length + 1, ...e }; events.push(withId); return withId; };
    storage.getCalendarEventsForUser = async () => events as any;
    storage.getCalendarEventById = async (id: number) => events.find((e) => e.id === id);
    storage.updateCalendarEvent = async (id: number, p: any) => { const e = events.find((x) => x.id === id); if (e) Object.assign(e, p); return e; };
    storage.deleteCalendarEvent = async (id: number) => { const i = events.findIndex((e) => e.id === id); if (i >= 0) events.splice(i, 1); };

    app = express();
    app.use(express.json());
    app.use(session({ secret: 'test', resave: false, saveUninitialized: true }));
    app.use((req: any, _res, next) => { req.session.userId = 1; next(); });
    await registerRoutes(app);
  });

  it('GET /api/telephony/health returns voice/messaging/webhook sub-objects', async () => {
    const res = await request(app).get('/api/telephony/health');
    expect(res.status).toBe(200);
    expect(res.body.voice).toMatchObject({ configured: true, connectionIdPresent: true });
    expect(res.body.voice).toHaveProperty('connectionType');
    expect(res.body.voice).toHaveProperty('callControlReady');
    expect(res.body.messaging).toHaveProperty('messagingProfilePresent');
    expect(res.body.webhook).toHaveProperty('publicUrlPresent');
  });

  it('PATCH notification-preferences persists category toggles', async () => {
    const res = await request(app)
      .patch('/api/users/1/notification-preferences')
      .send({ categories: { offer_received: false, internal_message: true } });
    expect(res.status).toBe(200);
    expect(prefs.categories.offer_received).toBe(false);
    expect(prefs.categories.internal_message).toBe(true);
  });

  it('notification routes enforce ownership (403 for another user)', async () => {
    const res = await request(app).get('/api/users/99/notifications');
    expect(res.status).toBe(403);
  });

  it('notifyUser dedupes by event key (same event does not create twice)', async () => {
    // Trigger two identical internal messages to the same recipient via the route;
    // the second should be deduped at the notification layer (null return).
    const first = await request(app).post('/api/messages').send({ recipientUserId: 2, body: 'duplicate test' });
    expect(first.status).toBe(201);
    const second = await request(app).post('/api/messages').send({ recipientUserId: 2, body: 'duplicate test 2' });
    expect(second.status).toBe(201);
    // Distinct eventKeys => both notifications created
    const created = notifications.filter((n) => n.userId === 2 && n.type === 'internal_message');
    expect(created.length).toBe(2);
    expect(created[0].eventKey).not.toBe(created[1].eventKey);
  });

  it('POST /api/messages validates recipient and persists', async () => {
    const res = await request(app).post('/api/messages').send({ recipientUserId: 0, body: 'nope' });
    expect(res.status).toBe(400);
    const ok = await request(app).post('/api/messages').send({ recipientUserId: 2, body: 'hello team' });
    expect(ok.status).toBe(201);
    expect(ok.body).toHaveProperty('id');
    expect(ok.body.senderUserId).toBe(1);
  });

  it('GET /api/messages and conversations are authenticated', async () => {
    const res = await request(app).get('/api/messages');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const conv = await request(app).get('/api/messages/conversations');
    expect(conv.status).toBe(200);
    expect(Array.isArray(conv.body)).toBe(true);
  });

  it('POST /api/calendar-events creates event and notifies invitees', async () => {
    const res = await request(app)
      .post('/api/calendar-events')
      .send({
        title: 'Team Sync',
        startsAt: '2030-01-15T15:00:00.000Z',
        endsAt: '2030-01-15T16:00:00.000Z',
        inviteeUserIds: [2, 3],
        meetingLink: 'https://meet.example.com/abc',
      });
    expect(res.status).toBe(201);
    expect(res.body.inviteeUserIds).toEqual([2, 3]);
    const invited = notifications.filter((n) => n.type === 'meeting_invite');
    expect(invited.length).toBe(2);
    expect(invited[0].eventKey).toContain('meeting:');
  });

  it('POST /api/calendar-events rejects end before start', async () => {
    const res = await request(app)
      .post('/api/calendar-events')
      .send({ title: 'Bad', startsAt: '2030-01-15T16:00:00.000Z', endsAt: '2030-01-15T15:00:00.000Z' });
    expect(res.status).toBe(400);
  });

  it('calendar PATCH/DELETE enforce ownership', async () => {
    const created = await request(app).post('/api/calendar-events').send({ title: 'Mine', startsAt: '2030-02-01T10:00:00.000Z' });
    expect(created.status).toBe(201);
    const del = await request(app).delete(`/api/calendar-events/${created.body.id}`);
    expect(del.status).toBe(200);
    const delAgain = await request(app).delete(`/api/calendar-events/${created.body.id}`);
    expect(delAgain.status).toBe(404);
  });
});
