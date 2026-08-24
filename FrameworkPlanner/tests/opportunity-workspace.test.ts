import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { registerRoutes } from '../server/routes';
import { storage } from '../server/storage';
import { generateListingToken } from '../server/routes';

const mockOpportunity = (overrides: any = {}) => ({
  id: 1,
  address: '123 Test St',
  city: 'Test City',
  state: 'TS',
  zipCode: '12345',
  status: 'active',
  stage: 'lead',
  opportunityType: 'acquisition',
  askingPrice: '250000',
  targetDispositionPrice: '325000',
  earnestMoney: '5000',
  internalSummary: 'Test property',
  photos: [],
  ...overrides,
});

describe('Opportunity Stage Workflow', () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
    app.use((req, _res, next) => {
      req.session.userId = 1;
      next();
    });

    const mockProp = mockOpportunity();
    storage.getPropertyById = vi.fn(async () => mockProp) as any;
    storage.updateProperty = vi.fn(async (_id: number, patch: any) => ({ ...mockProp, ...patch })) as any;
    storage.createGlobalActivity = vi.fn(async () => ({})) as any;
    storage.createOpportunityEvent = vi.fn(async () => ({ id: 1 })) as any;
    storage.getOpportunityEvents = vi.fn(async () => ([])) as any;
    storage.getUserById = vi.fn(async () => ({ id: 1, email: 'test@example.com', isSuperAdmin: true })) as any;
    storage.getTeamMembership = vi.fn(async () => ({ teamId: 1, role: 'admin' })) as any;
    storage.getOrInitActiveTeamId = vi.fn(async () => 1) as any;
    storage.createTask = vi.fn(async () => ({ id: 1 })) as any;
    storage.getTransactionStatus = vi.fn(async () => 'completed') as any;
    storage.applyOpportunityPatch = vi.fn(async () => mockProp) as any;
    storage.getPropertyComps = vi.fn(async () => []) as any;
    storage.upsertPropertyComp = vi.fn(async () => ({})) as any;
    storage.resolvePropertyImages = vi.fn((x: any) => x) as any;
    storage.getBuyerMatches = vi.fn(async () => []) as any;
    storage.getLeadById = vi.fn(async () => null) as any;
    storage.getTasksByRelatedEntity = vi.fn(async () => []) as any;
    storage.getPublicListingsByOpportunity = vi.fn(async () => []) as any;

    await registerRoutes(app);
  });

  afterEach(() => {
    vi.clearAllMocks();
    (storage.getPropertyById as any).mockResolvedValue(mockOpportunity());
  });

  it('POST /api/opportunities/:id/stage-change transitions from lead to contacted', async () => {
    const res = await request(app)
      .post('/api/opportunities/1/stage-change')
      .send({ stage: 'contacted', notes: 'Spoke with seller' });

    expect(res.status).toBe(200);
    expect(res.body.oldStage).toBe('lead');
    expect(res.body.newStage).toBe('contacted');
    expect(storage.updateProperty).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ stage: 'contacted', stageChangedAt: expect.any(Date), lastActivityAt: expect.any(Date) })
    );
    expect(storage.createOpportunityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'stage_changed', opportunityId: 1 })
    );
  });

  it('POST /api/opportunities/:id/stage-change rejects invalid stage', async () => {
    const res = await request(app)
      .post('/api/opportunities/1/stage-change')
      .send({ stage: 'invalid_stage' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid stage');
  });

  it('POST /api/opportunities/:id/stage-change rejects invalid transition to voided then back to lead', async () => {
    (storage.getPropertyById as any).mockResolvedValue(mockOpportunity({ stage: 'voided' }));

    const res = await request(app)
      .post('/api/opportunities/1/stage-change')
      .send({ stage: 'lead' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot transition/i);
  });

  it('POST /api/opportunities/:id/stage-change creates due diligence tasks when entering under_contract', async () => {
    const res = await request(app)
      .post('/api/opportunities/1/stage-change')
      .send({ stage: 'under_contract' });

    expect(res.status).toBe(200);
    expect(res.body.newStage).toBe('under_contract');
    expect(storage.createTask).toHaveBeenCalledTimes(7);
    expect(storage.createOpportunityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'checklist_created' })
    );
  });

  it('POST /api/opportunities/:id/stage-change allows stage change to in_disposition', async () => {
    const res = await request(app)
      .post('/api/opportunities/1/stage-change')
      .send({ stage: 'in_disposition' });

    expect(res.status).toBe(200);
    expect(res.body.newStage).toBe('in_disposition');
  });

  it('does not duplicate checklist tasks when stage is re-entered', async () => {
    (storage.getTasksByRelatedEntity as any).mockResolvedValue([
      { id: 1, title: '[Due Diligence] Deposit Earnest Money (EMD)', relatedEntityType: 'opportunity', relatedEntityId: 1 },
      { id: 2, title: '[Due Diligence] Schedule Property Inspection', relatedEntityType: 'opportunity', relatedEntityId: 1 },
      { id: 3, title: '[Due Diligence] Review Title Report', relatedEntityType: 'opportunity', relatedEntityId: 1 },
      { id: 4, title: '[Due Diligence] Secure Financing', relatedEntityType: 'opportunity', relatedEntityId: 1 },
      { id: 5, title: '[Due Diligence] Order Appraisal', relatedEntityType: 'opportunity', relatedEntityId: 1 },
      { id: 6, title: '[Due Diligence] Coordinate Walk-Through', relatedEntityType: 'opportunity', relatedEntityId: 1 },
      { id: 7, title: '[Disposition] Create public listing for investors', relatedEntityType: 'opportunity', relatedEntityId: 1 },
    ]);
    (storage.createTask as any).mockClear();

    const res = await request(app)
      .post('/api/opportunities/1/stage-change')
      .send({ stage: 'under_contract' });

    expect(res.status).toBe(200);
    expect(storage.createTask).not.toHaveBeenCalled();
  });

  it('requires a reason when moving to dead', async () => {
    const res = await request(app)
      .post('/api/opportunities/1/stage-change')
      .send({ stage: 'dead' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/reason is required/i);
  });

  it('allows moving to dead with a reason', async () => {
    (storage.getTasksByRelatedEntity as any).mockResolvedValue([]);
    (storage.createTask as any).mockClear();
    const res = await request(app)
      .post('/api/opportunities/1/stage-change')
      .send({ stage: 'dead', notes: 'Seller found better offer' });

    expect(res.status).toBe(200);
    expect(res.body.newStage).toBe('dead');
  });
});

describe('Opportunity Parties', () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
    app.use((req, _res, next) => {
      req.session.userId = 1;
      next();
    });

    storage.getPropertyById = vi.fn(async () => mockOpportunity()) as any;
    storage.getOpportunityParties = vi.fn(async () => [
      { id: 1, opportunityId: 1, role: 'seller', name: 'John Seller', email: 'john@test.com', phone: '555-0100' },
    ]) as any;
    storage.createOpportunityParty = vi.fn(async (data: any) => ({ id: 2, ...data })) as any;
    storage.getOpportunityPartyById = vi.fn(async () => ({ id: 1, opportunityId: 1, role: 'seller', name: 'John Seller' })) as any;
    storage.updateOpportunityParty = vi.fn(async (_id: number, patch: any) => ({ id: 1, ...patch })) as any;
    storage.deleteOpportunityParty = vi.fn(async () => undefined) as any;
    storage.createOpportunityEvent = vi.fn(async () => ({ id: 1 })) as any;
    storage.createGlobalActivity = vi.fn(async () => ({})) as any;
    storage.getUserById = vi.fn(async () => ({ id: 1, email: 'test@example.com', isSuperAdmin: true })) as any;
    storage.getTeamMembership = vi.fn(async () => ({ teamId: 1, role: 'admin' })) as any;
    storage.getOrInitActiveTeamId = vi.fn(async () => 1) as any;

    await registerRoutes(app);
  });

  it('GET /api/opportunities/:id/parties returns parties', async () => {
    const res = await request(app).get('/api/opportunities/1/parties');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].role).toBe('seller');
  });

  it('POST /api/opportunities/:id/parties creates a new party', async () => {
    const res = await request(app)
      .post('/api/opportunities/1/parties')
      .send({ role: 'buyer', name: 'Jane Buyer', email: 'jane@test.com' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(2);
    expect(res.body.name).toBe('Jane Buyer');
    expect(storage.createOpportunityParty).toHaveBeenCalled();
  });

  it('DELETE /api/opportunities/parties/:partyId deletes a party', async () => {
    const res = await request(app).delete('/api/opportunities/parties/1');
    expect(res.status).toBe(200);
    expect(storage.deleteOpportunityParty).toHaveBeenCalledWith(1);
    expect(storage.createOpportunityEvent).toHaveBeenCalled();
  });
});

describe('Public Listings (CRM-facing)', () => {
  let app: express.Express;

  const mockListing = {
    id: 1,
    opportunityId: 1,
    title: 'Test Listing',
    slug: 'test-listing-abc123',
    token: generateListingToken(),
    status: 'draft',
    visibility: 'link_only',
    viewCount: 0,
    publishedAt: null,
    exposeAddress: false,
    exposeComps: false,
    exposeFinancials: false,
    exposeDocs: false,
    contactName: 'Agent Smith',
    contactEmail: 'agent@test.com',
    contactPhone: '555-0000',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
    app.use((req, _res, next) => {
      req.session.userId = 1;
      next();
    });

    storage.getPropertyById = vi.fn(async () => mockOpportunity()) as any;
    storage.getPublicListingBySlug = vi.fn(async () => undefined) as any;
    storage.getPublicListingById = vi.fn(async () => mockListing) as any;
    storage.getPublicListingsByOpportunity = vi.fn(async () => [mockListing]) as any;
    storage.createPublicListing = vi.fn(async (data: any) => ({ id: 1, ...data })) as any;
    storage.updatePublicListing = vi.fn(async (_id: number, patch: any) => ({ ...mockListing, ...patch })) as any;
    storage.deletePublicListing = vi.fn(async () => undefined) as any;
    storage.incrementListingViews = vi.fn(async () => undefined) as any;
    storage.createOpportunityEvent = vi.fn(async () => ({ id: 1 })) as any;
    storage.createGlobalActivity = vi.fn(async () => ({})) as any;
    storage.getUserById = vi.fn(async () => ({ id: 1, email: 'test@example.com', isSuperAdmin: true })) as any;
    storage.getTeamMembership = vi.fn(async () => ({ teamId: 1, role: 'admin' })) as any;
    storage.getOrInitActiveTeamId = vi.fn(async () => 1) as any;

    await registerRoutes(app);
  });

  it('POST /api/opportunities/:id/listings creates a public listing', async () => {
    const res = await request(app)
      .post('/api/opportunities/1/listings')
      .send({ title: 'Test Listing', visibility: 'link_only' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(1);
    expect(storage.createPublicListing).toHaveBeenCalledWith(
      expect.objectContaining({
        opportunityId: 1,
        title: 'Test Listing',
        visibility: 'link_only',
        token: expect.any(String),
        slug: expect.any(String),
      })
    );
  });

  it('POST /api/opportunities/:id/listings rejects duplicate slug', async () => {
    (storage.getPublicListingBySlug as any).mockResolvedValue({ id: 99, opportunityId: 2 });
    const res = await request(app)
      .post('/api/opportunities/1/listings')
      .send({ title: 'Test', visibility: 'public', slug: 'taken-slug' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Slug already in use');
  });

  it('PATCH /api/listings/:id archives a listing', async () => {
    const res = await request(app)
      .patch('/api/listings/1')
      .send({ status: 'archived' });

    expect(res.status).toBe(200);
    expect(storage.updatePublicListing).toHaveBeenCalledWith(1, expect.objectContaining({ status: 'archived' }));
  });
});

describe('Public Listing (No-Auth)', () => {
  let app: express.Express;

  const token = generateListingToken();
  const mockProperty = mockOpportunity({
    askingPrice: '250000',
    targetDispositionPrice: '325000',
    internalSummary: 'Great investment property',
    photos: ['https://example.com/img1.jpg'],
  });

  const mockListing = {
    id: 1,
    opportunityId: 1,
    title: 'Investment Property',
    slug: 'investment-property-abc',
    token,
    status: 'published',
    visibility: 'link_only',
    viewCount: 10,
    publishedAt: new Date().toISOString(),
    expiresAt: null,
    passwordHash: null,
    exposeAddress: true,
    exposeComps: false,
    exposeFinancials: true,
    exposeDocs: false,
    contactName: 'Agent Smith',
    contactEmail: 'agent@test.com',
    contactPhone: '555-0000',
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));

    storage.getPublicListingByToken = vi.fn(async (t: string) => t === token ? mockListing : undefined) as any;
    storage.getPropertyById = vi.fn(async () => mockProperty) as any;
    storage.incrementListingViews = vi.fn(async () => undefined) as any;
    storage.createBuyerInquiry = vi.fn(async (data: any) => ({ id: 1, ...data })) as any;
    storage.createOpportunityEvent = vi.fn(async () => ({ id: 1 })) as any;
    storage.getTransactionStatus = vi.fn(async () => 'completed') as any;
    storage.resolvePropertyImages = vi.fn((x: any) => x) as any;

    await registerRoutes(app);
  });

  it('GET /api/public/listings/:token returns listing data without auth', async () => {
    const res = await request(app).get(`/api/public/listings/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.listing.title).toBe('Investment Property');
    expect(res.body.listing.token).toBeUndefined();
    expect(res.body.property.address).toBe('123 Test St');
    expect(storage.incrementListingViews).toHaveBeenCalled();
  });

  it('GET /api/public/listings/:token returns 404 for invalid token', async () => {
    const res = await request(app).get('/api/public/listings/invalid-token');
    expect(res.status).toBe(404);
  });

  it('POST /api/listings/:token/inquiries submits inquiry without auth', async () => {
    const res = await request(app)
      .post(`/api/listings/${token}/inquiries`)
      .send({
        name: 'Investor Buyer',
        email: 'buyer@example.com',
        phone: '555-0199',
        buyerType: 'individual',
        message: 'Interested in the property',
      });

    expect(res.status).toBe(201);
    expect(res.body.inquiryId).toBe(1);
    expect(res.body.message).toBe('Inquiry submitted successfully');
    expect(storage.createBuyerInquiry).toHaveBeenCalledWith(
      expect.objectContaining({
        listingId: 1,
        opportunityId: 1,
        name: 'Investor Buyer',
        email: 'buyer@example.com',
      })
    );
    expect(storage.createOpportunityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'inquiry_received' })
    );
  });

  it('POST /api/listings/:token/inquiries rejects short name', async () => {
    const res = await request(app)
      .post(`/api/listings/${token}/inquiries`)
      .send({ name: 'A', email: 'buyer@example.com', phone: '555-0199' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/name/i);
  });

  it('POST /api/listings/:token/inquiries rejects invalid email', async () => {
    const res = await request(app)
      .post(`/api/listings/${token}/inquiries`)
      .send({ name: 'Valid Name', email: 'not-an-email', phone: '555-0199' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/email/i);
  });

  it('POST /api/listings/:token/offer submits offer without auth', async () => {
    const res = await request(app)
      .post(`/api/listings/${token}/offer`)
      .send({
        name: 'Cash Buyer',
        email: 'cash@example.com',
        phone: '555-0200',
        offerAmount: 275000,
        terms: 'All cash, 30-day close',
      });

    expect(res.status).toBe(201);
    expect(res.body.inquiryId).toBe(1);
    expect(storage.createBuyerInquiry).toHaveBeenCalledWith(
      expect.objectContaining({
        listingId: 1,
        opportunityId: 1,
        name: 'Cash Buyer',
        offerAmount: '275000',
      })
    );
  });

  it('POST /api/listings/:token/offer rejects missing offer amount', async () => {
    const res = await request(app)
      .post(`/api/listings/${token}/offer`)
      .send({ name: 'Cash Buyer', email: 'cash@example.com', phone: '555-0200' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/offer amount/i);
  });

  it('GET /api/public/listings/:token returns 404 for unpublished listing', async () => {
    const unpublishedToken = generateListingToken();
    storage.getPublicListingByToken = vi.fn(async () => ({
      ...mockListing,
      token: unpublishedToken,
      status: 'draft',
    })) as any;

    const res = await request(app).get(`/api/public/listings/${unpublishedToken}`);
    expect(res.status).toBe(404);
  });

  it('GET /api/public/listings/:token returns 410 for expired listing', async () => {
    const expiredToken = generateListingToken();
    storage.getPublicListingByToken = vi.fn(async () => ({
      ...mockListing,
      token: expiredToken,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    })) as any;

    const res = await request(app).get(`/api/public/listings/${expiredToken}`);
    expect(res.status).toBe(410);
  });

  it('GET /api/public/listings/:token returns password prompt for protected listing', async () => {
    const protectedToken = generateListingToken();
    storage.getPublicListingByToken = vi.fn(async () => ({
      ...mockListing,
      token: protectedToken,
      passwordHash: 'secret123',
      exposeAddress: false,
      exposeFinancials: false,
    })) as any;

    const res = await request(app).get(`/api/public/listings/${protectedToken}?pw=wrong`);
    expect(res.status).toBe(200);
    expect(res.body.requiresPassword).toBe(true);
  });
});

describe('Inquiry Status Updates', () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
    app.use((req, _res, next) => {
      req.session.userId = 1;
      next();
    });

    storage.getBuyerInquiryById = vi.fn(async () => ({
      id: 1, opportunityId: 1, name: 'Test Buyer', status: 'new',
    })) as any;
    storage.updateBuyerInquiry = vi.fn(async (_id: number, patch: any) => ({ id: 1, status: 'qualified' })) as any;
    storage.getUserById = vi.fn(async () => ({ id: 1, email: 'test@example.com', isSuperAdmin: true })) as any;
    storage.getTeamMembership = vi.fn(async () => ({ teamId: 1, role: 'admin' })) as any;
    storage.getOrInitActiveTeamId = vi.fn(async () => 1) as any;

    await registerRoutes(app);
  });

  it('PATCH /api/inquiries/:id updates inquiry status', async () => {
    const res = await request(app)
      .patch('/api/inquiries/1')
      .send({ status: 'qualified' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('qualified');
    expect(storage.updateBuyerInquiry).toHaveBeenCalledWith(1, { status: 'qualified' });
  });
});

describe('Opportunity Events', () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
    app.use((req, _res, next) => {
      req.session.userId = 1;
      next();
    });

    storage.getPropertyById = vi.fn(async () => mockOpportunity()) as any;
    storage.getOpportunityEvents = vi.fn(async () => [
      { id: 1, opportunityId: 1, eventType: 'stage_changed', title: 'Stage changed to contacted', createdAt: new Date().toISOString() },
    ]) as any;
    storage.getUserById = vi.fn(async () => ({ id: 1, email: 'test@example.com', isSuperAdmin: true })) as any;
    storage.getTeamMembership = vi.fn(async () => ({ teamId: 1, role: 'admin' })) as any;
    storage.getOrInitActiveTeamId = vi.fn(async () => 1) as any;

    await registerRoutes(app);
  });

  it('GET /api/opportunities/:id/events returns event log', async () => {
    const res = await request(app).get('/api/opportunities/1/events?limit=50');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].eventType).toBe('stage_changed');
  });
});


describe('Buyer Offers', () => {
  let app: express.Express;

  const mockOffer = (overrides: any = {}) => ({
    id: 1,
    opportunityId: 1,
    buyerInquiryId: null,
    buyerContactId: null,
    amount: '250000',
    earnestMoney: '5000',
    financingType: 'cash',
    closeBy: null,
    terms: '30-day close',
    assignmentTerms: null,
    notes: null,
    status: 'received',
    version: 1,
    parentOfferId: null,
    superseded: false,
    createdBy: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
    app.use((req, _res, next) => {
      req.session.userId = 1;
      next();
    });

    storage.getPropertyById = vi.fn(async () => mockOpportunity({ stage: 'negotiating' })) as any;
    storage.getBuyerOffersByOpportunity = vi.fn(async () => [mockOffer()]) as any;
    storage.getBuyerOfferById = vi.fn(async (id: number) => mockOffer({ id })) as any;
    storage.createBuyerOffer = vi.fn(async (data: any) => ({ id: 2, ...data })) as any;
    storage.updateBuyerOffer = vi.fn(async (id: number, patch: any) => ({ ...mockOffer({ id }), ...patch })) as any;
    storage.updateProperty = vi.fn(async (_id: number, patch: any) => ({ ...mockOpportunity(), ...patch })) as any;
    storage.getPublicListingsByOpportunity = vi.fn(async () => [
      { id: 1, opportunityId: 1, status: 'published' },
    ]) as any;
    storage.updatePublicListing = vi.fn(async () => ({})) as any;
    storage.getTasksByRelatedEntity = vi.fn(async () => []) as any;
    storage.createTask = vi.fn(async () => ({ id: 1 })) as any;
    storage.createOpportunityEvent = vi.fn(async () => ({ id: 1 })) as any;
    storage.createUserNotification = vi.fn(async () => ({ id: 1 })) as any;
    storage.createUserNotificationDedup = vi.fn(async () => ({ id: 1 })) as any;
    storage.getNotificationPreferencesByUserId = vi.fn(async () => ({ inAppEnabled: true, categories: {} })) as any;
    storage.createGlobalActivity = vi.fn(async () => ({})) as any;
    storage.getUserById = vi.fn(async () => ({ id: 1, email: 'test@example.com', isSuperAdmin: true })) as any;
    storage.getTeamMembership = vi.fn(async () => ({ teamId: 1, role: 'admin' })) as any;
    storage.getOrInitActiveTeamId = vi.fn(async () => 1) as any;

    await registerRoutes(app);
  });

  it('POST /api/opportunities/:id/offers creates a buyer offer', async () => {
    const res = await request(app)
      .post('/api/opportunities/1/offers')
      .send({ amount: 300000, earnestMoney: 10000, financingType: 'cash', terms: '10-day close' });

    expect(res.status).toBe(201);
    expect(res.body.amount).toBe('300000');
    expect(storage.createBuyerOffer).toHaveBeenCalledWith(
      expect.objectContaining({ opportunityId: 1, amount: '300000', version: 1, status: 'received' })
    );
  });

  it('POST /api/opportunities/:id/offers rejects invalid amounts', async () => {
    const res = await request(app)
      .post('/api/opportunities/1/offers')
      .send({ amount: -5 });
    expect(res.status).toBe(400);
  });

  it('POST /api/buyer-offers/:id/counter preserves prior history and creates a new version', async () => {
    const res = await request(app)
      .post('/api/buyer-offers/1/counter')
      .send({ amount: 275000 });

    expect(res.status).toBe(201);
    expect(res.body.version).toBe(2);
    expect(res.body.parentOfferId).toBe(1);
    expect(storage.updateBuyerOffer).toHaveBeenCalledWith(1, { superseded: true, status: 'countered' });
  });

  it('PATCH /api/buyer-offers/:id/status accept moves stage to reserved, pauses listing, creates closing tasks, notifies owner', async () => {
    (storage.getPropertyById as any).mockResolvedValue(mockOpportunity({ stage: 'negotiating', assignedTo: 2 }));
    (storage.createTask as any).mockClear();

    const res = await request(app)
      .patch('/api/buyer-offers/1/status')
      .send({ status: 'accepted' });

    expect(res.status).toBe(200);
    expect(storage.updateProperty).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ stage: 'reserved' })
    );
    expect(storage.updatePublicListing).toHaveBeenCalledWith(1, { status: 'paused' });
    expect(storage.createTask).toHaveBeenCalled();
    expect(storage.createUserNotificationDedup).toHaveBeenCalled();
  });

  it('PATCH /api/buyer-offers/:id/status rejects superseded offers', async () => {
    (storage.getBuyerOfferById as any).mockResolvedValue(mockOffer({ superseded: true }));
    const res = await request(app)
      .patch('/api/buyer-offers/1/status')
      .send({ status: 'accepted' });
    expect(res.status).toBe(400);
  });
});

describe('Inquiry Conversion', () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
    app.use((req, _res, next) => {
      req.session.userId = 1;
      next();
    });

    storage.getBuyerInquiryById = vi.fn(async () => ({
      id: 1, opportunityId: 1, listingId: 1, name: 'Jane Buyer', email: 'jane@test.com', phone: '555-0101',
      company: 'Acme LLC', buyerType: 'individual', message: 'Interested', status: 'new',
    })) as any;
    storage.getBuyers = vi.fn(async () => []) as any;
    storage.createBuyer = vi.fn(async (data: any) => ({ id: 10, ...data })) as any;
    storage.getOpportunityParties = vi.fn(async () => []) as any;
    storage.createOpportunityParty = vi.fn(async (data: any) => ({ id: 3, ...data })) as any;
    storage.updateBuyerInquiry = vi.fn(async (_id: number, patch: any) => ({ id: 1, ...patch })) as any;
    storage.createOpportunityEvent = vi.fn(async () => ({ id: 1 })) as any;
    storage.getUserById = vi.fn(async () => ({ id: 1, email: 'test@example.com', isSuperAdmin: true })) as any;
    storage.getTeamMembership = vi.fn(async () => ({ teamId: 1, role: 'admin' })) as any;
    storage.getOrInitActiveTeamId = vi.fn(async () => 1) as any;

    await registerRoutes(app);
  });

  it('POST /api/inquiries/:id/convert creates a buyer and links a party', async () => {
    const res = await request(app).post('/api/inquiries/1/convert');

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(true);
    expect(res.body.buyer.id).toBe(10);
    expect(storage.createBuyer).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'jane@test.com', phone: '555-0101' })
    );
    expect(storage.createOpportunityParty).toHaveBeenCalledWith(
      expect.objectContaining({ opportunityId: 1, role: 'buyer', contactId: 10 })
    );
    expect(storage.updateBuyerInquiry).toHaveBeenCalledWith(1, { status: 'qualified' });
  });

  it('dedupes by email when the buyer already exists', async () => {
    (storage.getBuyers as any).mockResolvedValue([
      { id: 10, name: 'Jane Buyer', email: 'jane@test.com', phone: '555-0101' },
    ]);
    (storage.createBuyer as any).mockClear();

    const res = await request(app).post('/api/inquiries/1/convert');

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(false);
    expect(res.body.buyer.id).toBe(10);
    expect(storage.createBuyer).not.toHaveBeenCalled();
  });
});

describe('Public Listing Data Privacy', () => {
  let app: express.Express;

  const token = generateListingToken();

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));

    storage.getPublicListingByToken = vi.fn(async (t: string) => t === token ? {
      id: 1, opportunityId: 1, title: 'Private Deal', slug: 'private-deal', token,
      status: 'published', visibility: 'link_only', viewCount: 0, publishedAt: new Date().toISOString(),
      expiresAt: null, passwordHash: null,
      exposeAddress: false, exposeComps: false, exposeFinancials: false, exposeDocs: false,
      contactName: 'Agent', contactEmail: 'a@test.com', contactPhone: '555-0000',
    } : undefined) as any;
    storage.getPropertyById = vi.fn(async () => mockOpportunity({
      askingPrice: '250000', targetDispositionPrice: '325000', internalSummary: 'Secret internal notes',
    })) as any;
    storage.incrementListingViews = vi.fn(async () => undefined) as any;
    storage.resolvePropertyImages = vi.fn((x: any) => x) as any;

    await registerRoutes(app);
  });

  it('hides address and financials when not exposed', async () => {
    const res = await request(app).get(`/api/public/listings/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.property.address).toBeUndefined();
    expect(res.body.property.price).toBeUndefined();
    expect(res.body.property.askingPrice).toBeUndefined();
    expect(res.body.property.arv).toBeUndefined();
    expect(res.body.property.internalSummary).toBeUndefined();
    expect(res.body.property.latitude).toBeUndefined();
  });
});
