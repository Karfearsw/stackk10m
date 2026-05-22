import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

vi.mock("stripe", () => {
  class StripeMock {
    checkout: any;
    webhooks: any;
    refunds: any;
    constructor() {
      this.checkout = {
        sessions: {
          create: vi.fn(async () => ({ id: "cs_test_123", url: "https://stripe.test/checkout" })),
          retrieve: vi.fn(async () => ({ id: "cs_test_123", url: "https://stripe.test/checkout" })),
        },
      };
      this.refunds = {
        create: vi.fn(async () => ({ id: "re_123", status: "succeeded", amount: 10000, currency: "usd" })),
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

vi.mock("../server/services/messaging/resend.js", () => {
  return { sendResendEmail: vi.fn(async () => ({ id: "email_123" })) };
});

vi.mock("../server/services/messaging/signalwire.js", () => {
  return { sendSignalWireSms: vi.fn(async () => ({ messageSid: "sms_123" })) };
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
import { sendResendEmail } from "../server/services/messaging/resend.js";
import { sendSignalWireSms } from "../server/services/messaging/signalwire.js";

describe("XP booking admin ops", () => {
  let app: express.Express;

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM = "ops@oceanluxe.org";
    process.env.SIGNALWIRE_PROJECT_ID = "sw_proj";
    process.env.SIGNALWIRE_AUTH_TOKEN = "sw_token";
    process.env.SIGNALWIRE_SPACE_URL = "example.signalwire.com";
    process.env.SIGNALWIRE_FROM_NUMBER = "+15555550123";

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
    vi.clearAllMocks();

    storage.getUserById = (async (id: number) => {
      if (id === 1) return { id: 1, role: "admin", isSuperAdmin: true, email: "admin@oceanluxe.org" } as any;
      if (id === 2) return { id: 2, role: "concierge", isSuperAdmin: false, email: "concierge@oceanluxe.org" } as any;
      return undefined as any;
    }) as any;

    storage.getXpExperienceById = (async () => ({
      id: 1,
      slug: "ocean",
      title: "Ocean",
      active: true,
      mode: "both",
      paymentMode: "full",
      priceTotal: "100.00",
      depositAmount: "25.00",
      currency: "USD",
      capacity: 1,
    })) as any;

    storage.getXpExperienceBySlug = (async () => ({
      id: 1,
      slug: "ocean",
      title: "Ocean",
      active: true,
      mode: "both",
      paymentMode: "full",
      priceTotal: "100.00",
      depositAmount: "25.00",
      currency: "USD",
      capacity: 1,
    })) as any;

    storage.listXpTimeSlots = (async () => [
      { id: 10, experienceId: 1, startAt: new Date("2026-05-15T10:00:00Z"), endAt: new Date("2026-05-15T11:00:00Z"), capacity: 1, active: true },
      { id: 11, experienceId: 1, startAt: new Date("2026-05-15T12:00:00Z"), endAt: new Date("2026-05-15T13:00:00Z"), capacity: 1, active: true },
    ]) as any;
    storage.hasXpBlackoutOverlap = (async () => false) as any;
    storage.createXpBookingPending = (async (input: any) => ({ id: 99, ...input })) as any;
    storage.updateXpBookingStripeSession = (async () => ({ id: 99 })) as any;
    storage.createXpBookingEvent = vi.fn(async () => ({ id: 1 })) as any;
    storage.createXpBookingMessage = vi.fn(async () => ({ id: 1 })) as any;

    storage.getXpBookingById = (async (id: number) => ({
      id,
      experienceId: 1,
      kind: "time_slot",
      status: "confirmed",
      customerName: "Guest",
      customerEmail: "guest@example.com",
      customerPhone: "+15555550111",
      startAt: new Date("2026-05-15T10:00:00Z"),
      endAt: new Date("2026-05-15T11:00:00Z"),
      stripeCheckoutSessionId: "cs_test_123",
      stripePaymentIntentId: "pi_123",
      assignment: { conciergeUserId: 1 },
      notes: [],
    })) as any;

    storage.updateXpBookingWindow = vi.fn(async (id: number, input: any) => ({ id, ...input })) as any;
    storage.createXpBookingRefund = vi.fn(async (input: any) => ({ id: 1, ...input })) as any;
    storage.setXpBookingStatus = vi.fn(async (id: number, status: string) => ({ id, status })) as any;
  });

  it("admin can create booking + payment link and send email/sms", async () => {
    const res = await request(app)
      .post("/api/xp/admin/bookings/checkout")
      .set("x-test-user-id", "1")
      .send({
        experienceId: 1,
        kind: "time_slot",
        startAt: "2026-05-15T10:00:00Z",
        endAt: "2026-05-15T11:00:00Z",
        customerName: "Guest",
        customerEmail: "guest@example.com",
        customerPhone: "+15555550111",
        sendEmail: true,
        sendSms: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.checkoutUrl).toBe("https://stripe.test/checkout");
    expect(sendResendEmail).toHaveBeenCalled();
    expect(sendSignalWireSms).toHaveBeenCalled();
  });

  it("ops can reschedule a booking", async () => {
    const res = await request(app)
      .put("/api/xp/admin/bookings/99/reschedule")
      .set("x-test-user-id", "1")
      .send({ startAt: "2026-05-15T12:00:00Z", endAt: "2026-05-15T13:00:00Z" });
    expect(res.status).toBe(200);
    expect(storage.updateXpBookingWindow).toHaveBeenCalled();
    expect(storage.createXpBookingEvent).toHaveBeenCalled();
  });

  it("admin can refund a confirmed booking", async () => {
    const res = await request(app).post("/api/xp/admin/bookings/99/refund").set("x-test-user-id", "1").send({});
    expect(res.status).toBe(200);
    expect(storage.createXpBookingRefund).toHaveBeenCalled();
    expect(storage.setXpBookingStatus).toHaveBeenCalledWith(99, "refunded");
  });

  it("admin can send email message to guest", async () => {
    const res = await request(app)
      .post("/api/xp/admin/bookings/99/messages")
      .set("x-test-user-id", "1")
      .send({ channel: "email", to: "guest@example.com", subject: "Test", body: "Hello" });
    expect(res.status).toBe(201);
    expect(sendResendEmail).toHaveBeenCalled();
  });

  it("concierge cannot refund", async () => {
    const res = await request(app).post("/api/xp/admin/bookings/99/refund").set("x-test-user-id", "2").send({});
    expect(res.status).toBe(403);
  });
});
