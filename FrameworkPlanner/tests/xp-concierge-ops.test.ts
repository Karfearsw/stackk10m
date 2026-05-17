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

describe("XP concierge ops RBAC", () => {
  let app: express.Express;

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";

    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use((req: any, _res, next) => {
      const id = req.get("x-test-user-id");
      if (id) req.session.userId = parseInt(String(id), 10);
      next();
    });
    await registerRoutes(app);
  });

  beforeEach(() => {
    storage.getUserById = (async (id: number) => {
      if (id === 1) return { id: 1, role: "admin", isSuperAdmin: true, email: "admin@oceanluxe.org" } as any;
      if (id === 2) return { id: 2, role: "concierge", isSuperAdmin: false, email: "concierge@oceanluxe.org" } as any;
      return undefined as any;
    }) as any;

    storage.listXpBookings = vi.fn(async () => ({ items: [], total: 0 })) as any;
    storage.getXpBookingById = (async () => undefined) as any;
    storage.getXpExperienceById = (async () => ({ id: 1, slug: "ocean", title: "Ocean" })) as any;
    storage.listXpLocations = vi.fn(async () => []) as any;
  });

  it("forces concierge assigned-only filtering on bookings list", async () => {
    (storage.listXpBookings as any).mockImplementationOnce(async (input: any) => {
      expect(input.conciergeUserId).toBe(2);
      return { items: [], total: 0 };
    });
    const res = await request(app).get("/api/xp/admin/bookings").set("x-test-user-id", "2");
    expect(res.status).toBe(200);
  });

  it("returns 404 for concierge when booking is not assigned to them", async () => {
    storage.getXpBookingById = (async () => ({ id: 10, experienceId: 1, status: "confirmed", assignment: { conciergeUserId: 999 } })) as any;
    const res = await request(app).get("/api/xp/admin/bookings/10").set("x-test-user-id", "2");
    expect(res.status).toBe(404);
  });

  it("allows concierge to list locations (read-only) with activeOnly forced", async () => {
    (storage.listXpLocations as any).mockImplementationOnce(async (input: any) => {
      expect(input.activeOnly).toBe(true);
      return [];
    });
    const res = await request(app).get("/api/xp/admin/locations").set("x-test-user-id", "2");
    expect(res.status).toBe(200);
  });

  it("forbids concierge from creating a location", async () => {
    const res = await request(app).post("/api/xp/admin/locations").set("x-test-user-id", "2").send({ name: "Four Seasons" });
    expect(res.status).toBe(403);
  });
});

