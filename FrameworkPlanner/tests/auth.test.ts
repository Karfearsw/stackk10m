import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import session from 'express-session'
import { registerRoutes } from '../server/routes'
import { storage } from '../server/storage'

describe('Auth Endpoints', () => {
  let app: express.Express

  beforeAll(async () => {
    process.env.ORG_EMAIL_DOMAIN = 'oceanluxe.org'
    process.env.ADMIN_ROLE_CODE = 'admin-code'
    process.env.TEAM_LEADER_ROLE_CODE = 'leader-code'
    process.env.AGENT_ROLE_CODE = 'agent-code'
    process.env.VA_ROLE_CODE = 'va-code'
    process.env.SESSION_SECRET = 'test'

    app = express()
    app.use(express.json())
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }))

    storage.getUserByEmail = async (email: string) => null as any
    storage.getTeamByJoinCode = async (_code: string) => ({ id: 10, name: 'Team', ownerId: 1, joinCode: 'team-123', isActive: true } as any)
    storage.createTeamMember = async (_data: any) => ({ id: 99 } as any)
    storage.createUser = async (data: any) => ({ id: 1, email: data.email, firstName: data.firstName, lastName: data.lastName, role: data.role, isSuperAdmin: data.isSuperAdmin, isActive: true } as any)
    storage.getUserById = async (_id: number) => ({ id: 1, email: 'new@oceanluxe.org', firstName: 'New', lastName: 'User', role: 'agent', isSuperAdmin: false, isActive: true } as any)

    await registerRoutes(app)
  })

  it('POST /api/auth/signup creates user and sets session', async () => {
    const agent = request.agent(app)
    const res = await agent
      .post('/api/auth/signup')
      .send({ firstName: 'New', lastName: 'User', email: 'new@oceanluxe.org', password: 'password123', roleCode: 'agent-code', teamCode: 'team-123' })

    expect(res.status).toBe(201)
    expect(res.body.user.email).toBe('new@oceanluxe.org')

    const me = await agent.get('/api/auth/me')
    expect(me.status).toBe(200)
    expect(me.body.email).toBe('new@oceanluxe.org')
  })

  it('POST /api/auth/signup rejects non-oceanluxe email', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ firstName: 'X', lastName: 'Y', email: 'x@gmail.com', password: 'password123', roleCode: 'agent-code', teamCode: 'team-123' })

    expect(res.status).toBe(403)
  })
})
