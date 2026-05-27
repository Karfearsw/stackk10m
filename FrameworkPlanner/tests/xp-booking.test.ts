import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

vi.mock("stripe", () => {
  class StripeMock {
    checkout: any;
    webhooks: any;
    constructor() {
      this.checkout = {
        sessions: {
          create: vi.fn(async () => ({ id: "cs_test_123", url: "https://stripe.test/checkout" })),
        },
      };
      this.webhooks = {
        constructEvent: vi.fn(() => ({
          id: "evt_123",
          type: "checkout.session.completed",
          created: 0,
          data: { object: { id: "cs_test_123", payment_intent: "pi_123", customer: "cus_123" } },
        })),
      };
    }
  }
  return { default: StripeMock };
});

vi.mock("../server/db", () => {
  return {
    db: {
      execute: vi.fn(async () => ({ rows: [] })),
    },
    pool: {},
    databaseUrl: () => null,
  };
});

import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";

describe("XP booking API", () => {
  let app: express.Express;

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";

    app = express();
    app.use(
      express.json({
        verify: (req: any, _res, buf) => {
          req.rawBody = buf;
        },
      }),
    );
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    await registerRoutes(app);
  });

  beforeEach(() => {
    storage.listXpExperiencesWithDestinations = (async () => [{ id: 1, slug: "ocean", title: "Ocean", active: true, depositAmount: "100.00", currency: "USD", mode: "both", destination: null }]) as any;
    storage.getXpExperienceBySlug = (async () => ({ id: 1, slug: "ocean", title: "Ocean", active: true, depositAmount: "100.00", currency: "USD", mode: "both", capacity: 1 })) as any;
    storage.listXpTimeSlots = (async () => [{ id: 10, experienceId: 1, startAt: new Date("2026-05-15T10:00:00Z"), endAt: new Date("2026-05-15T11:00:00Z"), capacity: 1, active: true }]) as any;
    storage.hasXpBlackoutOverlap = (async () => false) as any;
    storage.countXpActiveBookingsOverlapping = (async () => 0) as any;
    storage.createXpBookingPending = (async (input: any) => ({ id: 99, ...input, status: "pending_payment" })) as any;
    storage.updateXpBookingStripeSession = (async (_id: number, _sessionId: string) => ({ id: 99 })) as any;
    storage.hasStripeEvent = (async () => false) as any;
    storage.recordStripeEvent = (async (input: any) => input) as any;
    storage.createXpBookingEvent = (async () => ({ id: 1 })) as any;
    storage.getXpBookingByStripeSessionId = (async () => ({ id: 99, experienceId: 1, status: "pending_payment" })) as any;
    storage.confirmXpBookingByStripeSessionId = (async () => ({ id: 99, experienceId: 1, status: "confirmed", startAt: new Date(), endAt: new Date(), customerName: "A", customerEmail: "a@b.com" })) as any;
    storage.getUsers = (async () => [{ id: 1, role: "admin", isSuperAdmin: false, email: "admin@example.com" }]) as any;
    storage.createTask = (async (input: any) => ({ id: 123, ...input })) as any;
  });

  it("GET /api/xp/experiences returns public experiences", async () => {
    const res = await request(app).get("/api/xp/experiences");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items[0].slug).toBe("ocean");
  });

  it("POST /api/xp/bookings/checkout returns checkoutUrl", async () => {
    const res = await request(app)
      .post("/api/xp/bookings/checkout")
      .send({
        experienceSlug: "ocean",
        kind: "time_slot",
        startAt: "2026-05-15T10:00:00Z",
        endAt: "2026-05-15T11:00:00Z",
        customerName: "Test",
        customerEmail: "test@example.com",
      });
    expect(res.status).toBe(201);
    expect(res.body.checkoutUrl).toMatch(/^https:\/\/stripe\.test\/checkout/);
  });

  it("POST /api/stripe/webhook processes event idempotently", async () => {
    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "sig_test")
      .send({ ok: true });
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });
});
