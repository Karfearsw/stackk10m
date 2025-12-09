import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import session from 'express-session'
import { registerRoutes } from '../server/routes'
import { storage } from '../server/storage'

describe('Auth Endpoints', () => {
  let app: express.Express

  beforeAll(async () => {
    app = express()
    app.use(express.json())
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }))

    storage.getUserByEmail = async (email: string) => null as any
    storage.createUser = async (data: any) => ({ id: 1, email: data.email, firstName: data.firstName, lastName: data.lastName, isActive: true } as any)
    storage.getUserById = async (_id: number) => ({ id: 1, email: 'new@example.com', firstName: 'New', lastName: 'User', isActive: true } as any)

    await registerRoutes(app)
  })

  it('POST /api/auth/signup creates user and sets session', async () => {
    const agent = request.agent(app)
    const res = await agent
      .post('/api/auth/signup')
      .send({ firstName: 'New', lastName: 'User', email: 'new@example.com', password: 'password123', employeeCode: '3911' })

    expect(res.status).toBe(201)
    expect(res.body.user.email).toBe('new@example.com')

    const me = await agent.get('/api/auth/me')
    expect(me.status).toBe(200)
    expect(me.body.email).toBe('new@example.com')
  })
})

