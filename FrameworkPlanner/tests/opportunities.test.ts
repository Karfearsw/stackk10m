import { describe, it, expect, beforeAll, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import session from 'express-session'
import { registerRoutes } from '../server/routes'
import { storage } from '../server/storage'

describe('Opportunity Endpoints', () => {
  let app: express.Express

  beforeAll(async () => {
    app = express()
    app.use(express.json())
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }))

    // Mock storage methods
    storage.getProperties = async () => []
    storage.getPropertyById = async (id: number) => ({ id, address: '123 Test St', city: 'Test City', state: 'TS', zipCode: '12345', status: 'active', sourceLeadId: 99 } as any)
    storage.getLeadById = async (id: number) => ({ id, ownerName: 'Jane Smith', ownerPhone: '(813) 555-0123', ownerEmail: 'jane@example.com', relasScore: 92 } as any)
    storage.createProperty = async (data: any) => ({ ...data, id: 1, createdAt: new Date(), updatedAt: new Date() } as any)
    storage.updateProperty = async (id: number, data: any) => ({ id, ...data, address: '123 Test St', status: 'under_contract' } as any)
    storage.deleteProperty = async (_id: number) => undefined
    storage.createGlobalActivity = async () => ({ id: 1 } as any)

    await registerRoutes(app)
  })

  it('GET /api/opportunities returns empty array initially', async () => {
    const res = await request(app).get('/api/opportunities')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('POST /api/opportunities creates a new opportunity', async () => {
    const res = await request(app)
      .post('/api/opportunities')
      .send({
        address: '456 Opportunity Ln',
        city: 'Growth City',
        state: 'GC',
        zipCode: '54321',
        status: 'active',
        price: '150000'
      })
    
    expect(res.status).toBe(201)
    expect(res.body.address).toBe('456 Opportunity Ln')
    expect(res.body.status).toBe('active')
  })

  it('PATCH /api/opportunities/:id updates status (Pipeline Movement)', async () => {
    const res = await request(app)
      .patch('/api/opportunities/1')
      .send({ status: 'under_contract' })
    
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('under_contract')
  })

  it('Legacy /api/properties endpoint still works (Backward Compatibility)', async () => {
    const res = await request(app).get('/api/properties')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('GET /api/opportunities/:id returns composite detail with lead', async () => {
    const res = await request(app).get('/api/opportunities/1')
    expect(res.status).toBe(200)
    expect(res.body.property.address).toBe('123 Test St')
    expect(res.body.lead.ownerName).toBe('Jane Smith')
    expect(res.body.lead.relasScore).toBe(92)
  })

  it('PATCH /api/leads/:id with notes logs added_note', async () => {
    // mock getLeadById/updateLead to simulate notes change
    storage.getLeadById = async (id: number) => ({ id, address: '123 Test St', notes: '' } as any)
    const createGlobalActivity = vi.fn(async () => ({}))
    storage.createGlobalActivity = createGlobalActivity as any
    storage.updateLead = async (_id: number, patch: any) => ({ id: 99, address: '123 Test St', notes: patch.notes } as any)

    const res = await request(app)
      .patch('/api/leads/99')
      .send({ notes: 'New note' })
    expect(res.status).toBe(200)
    expect(createGlobalActivity).toHaveBeenCalled()
  })
})
