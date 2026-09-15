import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import { computeDealMetrics } from "../client/src/lib/deal-metrics";

(storage as any).getUserByIdWithoutProfilePicture = async () =>
  ({ id: 1, email: "test@example.com", isSuperAdmin: true } as any);

// DEV-002 regression: closing a deal must record revenue on the per-deal
// ledger (deal_assignments), advance the opportunity, and agree between the
// Dashboard and Analytics. The root cause was a duplicate
// POST /api/contract-documents/:id/close registration — Express served the
// stale handler, which never persisted the closing fee.
describe("Deal close & revenue recording (DEV-002)", () => {
  let app: express.Express;
  const originals: Record<string, any> = {};

  const mockNames = [
    "getPropertyById",
    "getDealAssignmentsByPropertyId",
    "createDealAssignment",
    "updateDealAssignment",
    "updateProperty",
    "createOpportunityEvent",
    "createGlobalActivity",
    "getDealAssignmentsByStatus",
    "getDealAssignments",
  ];

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use((req: any, _res, next) => {
      req.session.userId = 1;
      next();
    });
    await registerRoutes(app);
  });

  beforeEach(() => {
    for (const name of mockNames) originals[name] = (storage as any)[name];
    (storage as any).getPropertyById = async (id: number) =>
      id === 7 ? ({ id: 7, stage: "under_contract", address: "1 Test Revenue St" } as any) : undefined;
    (storage as any).getDealAssignmentsByPropertyId = async () => [];
    (storage as any).createOpportunityEvent = async () => ({ id: 1 } as any);
    (storage as any).createGlobalActivity = async () => ({ id: 1 } as any);
  });

  afterEach(() => {
    for (const name of mockNames) (storage as any)[name] = originals[name];
  });

  it("registers exactly one POST /api/contract-documents/:id/close handler (duplicate-route regression)", () => {
    const stack = (app as any)._router.stack as any[];
    const matches = stack.filter(
      (l) => l.route && l.route.path === "/api/contract-documents/:id/close" && l.route.methods?.post,
    );
    expect(matches.length).toBe(1);
  });

  it("POST /api/opportunities/:id/close with a $1 fee writes a closed ledger row and advances to sold", async () => {
    let createdPayload: any = null;
    const updated: any[] = [];
    (storage as any).createDealAssignment = async (payload: any) => {
      createdPayload = payload;
      return { id: 99, ...payload };
    };
    (storage as any).updateProperty = async (id: number, patch: any) => {
      updated.push({ id, patch });
      return { id, ...patch };
    };

    const res = await request(app).post("/api/opportunities/7/close").send({
      assignmentFee: 1,
      closingCosts: 0,
      buyerPaid: true,
      titleReceived: true,
      fundsWired: true,
      docsRecorded: true,
      notes: "audit test close",
    });

    expect(res.status).toBe(200);
    // Ledger row: the $1 fee is the recorded revenue, status closed.
    expect(createdPayload).not.toBeNull();
    expect(createdPayload.propertyId).toBe(7);
    expect(createdPayload.status).toBe("closed");
    expect(createdPayload.assignmentFee).toBe("1.00");
    expect(createdPayload.payoutReceived).toBe(true);
    expect(createdPayload.payoutAmount).toBe("1.00");
    // buyerId stays nullable — the old NOT NULL schema drift must not break
    // closes with no buyer linked.
    expect(createdPayload.buyerId ?? null).toBeNull();
    // Stage advanced to sold exactly once.
    expect(updated.length).toBe(1);
    expect(updated[0].patch.stage).toBe("sold");
    expect(res.body.ledger?.status).toBe("closed");
    expect(res.body.stageAdvanced).toBe(true);
  });

  it("fails loud (500, no silent success) when the ledger write throws", async () => {
    let stageTouched = false;
    (storage as any).createDealAssignment = async () => {
      throw new Error('null value in column "buyer_id"');
    };
    (storage as any).updateProperty = async () => {
      stageTouched = true;
      return {};
    };

    const res = await request(app).post("/api/opportunities/7/close").send({
      assignmentFee: 5000,
      buyerPaid: true,
      titleReceived: true,
      fundsWired: true,
      docsRecorded: true,
    });

    expect(res.status).toBe(500);
    expect(String(res.body.message)).toMatch(/could not record revenue/i);
    expect(stageTouched).toBe(false);
  });

  it("rejects a negative or missing assignment fee with 400", async () => {
    const neg = await request(app).post("/api/opportunities/7/close").send({ assignmentFee: -5 });
    expect(neg.status).toBe(400);
    const missing = await request(app).post("/api/opportunities/7/close").send({});
    expect(missing.status).toBe(400);
  });

  it("GET /api/deal-assignments?status=closed reads the ledger", async () => {
    const rows = [{ id: 99, propertyId: 7, status: "closed", assignmentFee: "1.00" }];
    (storage as any).getDealAssignmentsByStatus = async (status: string) =>
      status === "closed" ? rows : [];

    const res = await request(app).get("/api/deal-assignments?status=closed");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
  });

  it("shared helper: a $1 closed ledger row is $1 of revenue and one closed deal", () => {
    const m = computeDealMetrics([], [], {
      ledger: [{ id: 1, propertyId: 9, status: "closed", assignmentFee: 1 }],
    });
    expect(m.revenue).toBe(1);
    expect(m.dealsClosed).toBe(1);
  });

  it("shared helper: a closed document and its matching ledger row count once", () => {
    const doc = {
      id: 3,
      propertyId: 9,
      status: "closed",
      mergeData: JSON.stringify({ closingData: { assignmentFee: 5000 } }),
    };
    const m = computeDealMetrics([], [doc], {
      ledger: [{ id: 1, propertyId: 9, status: "closed", assignmentFee: 5000 }],
    });
    expect(m.dealsClosed).toBe(1);
    expect(m.revenue).toBe(5000);
  });

  it("shared helper: payoutAmount wins over assignmentFee on the ledger", () => {
    const m = computeDealMetrics([], [], {
      ledger: [{ id: 1, propertyId: 9, status: "closed", payoutAmount: 900, assignmentFee: 1000 }],
    });
    expect(m.revenue).toBe(900);
  });
});
