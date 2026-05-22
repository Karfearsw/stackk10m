import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import session from 'express-session'
import { registerRoutes } from '../server/routes'
import { storage } from '../server/storage'

describe('Notifications Auth + AuthZ', () => {
  let app: express.Express

  beforeAll(async () => {
    app = express()
    app.use(express.json())
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }))

    app.post('/test/login', (req, res) => {
      ;(req.session as any).userId = 1
      res.json({ ok: true })
    })

    storage.getUserById = async (id: number) => {
      if (id === 1) return { id: 1, email: 'user1@example.com', isActive: true } as any
      if (id === 2) return { id: 2, email: 'user2@example.com', isActive: true } as any
      return undefined as any
    }

    storage.getNotificationPreferencesByUserId = async (userId: number) => ({ id: 1, userId } as any)
    storage.createNotificationPreferences = async (input: any) => ({ id: 1, ...input } as any)
    storage.updateNotificationPreferences = async (userId: number, patch: any) => ({ id: 1, userId, ...patch } as any)

    storage.getUserNotifications = async (userId: number) =>
      [
        {
          id: 10,
          userId,
          type: 'system',
          severity: 'info',
          title: 'Hello',
          description: null,
          read: false,
          relatedId: null,
          relatedType: null,
          linkPath: null,
          primaryAction: null,
          createdAt: new Date(),
        },
      ] as any

    storage.createUserNotification = async (input: any) => ({ id: 99, createdAt: new Date(), ...input } as any)

    storage.getUserNotificationById = async (id: number) => {
      if (id === 10) {
        return {
          id: 10,
          userId: 1,
          type: 'system',
          severity: 'info',
          title: 'Hello',
          description: null,
          read: false,
          relatedId: null,
          relatedType: null,
          linkPath: null,
          primaryAction: null,
          createdAt: new Date(),
        } as any
      }
      if (id === 11) {
        return {
          id: 11,
          userId: 2,
          type: 'system',
          severity: 'info',
          title: 'Other',
          description: null,
          read: false,
          relatedId: null,
          relatedType: null,
          linkPath: null,
          primaryAction: null,
          createdAt: new Date(),
        } as any
      }
      return undefined as any
    }

    storage.markNotificationAsRead = async (id: number) => {
      const existing = await storage.getUserNotificationById(id)
      return { ...existing, read: true } as any
    }
    storage.deleteUserNotification = async () => undefined as any
    storage.deleteAllUserNotifications = async () => undefined as any
    storage.markAllNotificationsAsRead = async () => undefined as any

    await registerRoutes(app)
  })

  it('requires auth for notifications list', async () => {
    const res = await request(app).get('/api/users/1/notifications')
    expect(res.status).toBe(401)
  })

  it('only allows current user to list own notifications', async () => {
    const agent = request.agent(app)
    await agent.post('/test/login')

    const ok = await agent.get('/api/users/1/notifications')
    expect(ok.status).toBe(200)

    const forbidden = await agent.get('/api/users/2/notifications')
    expect(forbidden.status).toBe(403)
  })

  it('enforces ownership on read/delete by notification id', async () => {
    const agent = request.agent(app)
    await agent.post('/test/login')

    const readMine = await agent.patch('/api/notifications/10/read')
    expect(readMine.status).toBe(200)

    const readOther = await agent.patch('/api/notifications/11/read')
    expect(readOther.status).toBe(404)

    const deleteMine = await agent.delete('/api/notifications/10')
    expect(deleteMine.status).toBe(200)

    const deleteOther = await agent.delete('/api/notifications/11')
    expect(deleteOther.status).toBe(404)
  })

  it('only allows current user to read/update own notification preferences', async () => {
    const agent = request.agent(app)
    await agent.post('/test/login')

    const ok = await agent.get('/api/users/1/notification-preferences')
    expect(ok.status).toBe(200)

    const forbidden = await agent.get('/api/users/2/notification-preferences')
    expect(forbidden.status).toBe(403)
  })
})

