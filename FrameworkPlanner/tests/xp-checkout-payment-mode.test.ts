import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

vi.mock("stripe", async () => {
  const createSpy = vi.fn(async () => ({ id: "cs_test_123", url: "https://checkout.example" }));
  class StripeMock {
    checkout = { sessions: { create: createSpy } };
    constructor(_key: string, _opts: any) {}
  }
  return { default: StripeMock, __createSpy: createSpy };
});

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  for (const k of Object.keys(process.env)) delete (process.env as any)[k];
  Object.assign(process.env, ORIGINAL_ENV);
}

describe("XP checkout payment mode", () => {
  beforeEach(() => {
    restoreEnv();
    process.env.DB_STARTUP_TEST = "0";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
  });

  afterEach(() => {
    restoreEnv();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("charges priceTotal when paymentMode=full", async () => {
    vi.resetModules();
    const { registerRoutes } = await import("../server/routes");
    const { storage } = await import("../server/storage");
    const stripeMod: any = await import("stripe");

    const createBookingSpy = vi.fn(async (input: any) => ({ id: 10, ...input }));
    storage.getXpExperienceBySlug = async () =>
      ({
        id: 1,
        slug: "test",
        title: "Test Experience",
        active: true,
        mode: "time_slot",
        paymentMode: "full",
        currency: "USD",
        priceTotal: "500.00",
        depositAmount: "100.00",
        capacity: 1,
      }) as any;
    storage.listXpTimeSlots = async () =>
      [
        {
          id: 99,
          startAt: new Date("2030-01-01T10:00:00.000Z").toISOString(),
          endAt: new Date("2030-01-01T12:00:00.000Z").toISOString(),
          capacity: 1,
          remaining: 1,
        },
      ] as any;
    storage.hasXpBlackoutOverlap = async () => false as any;
    storage.countXpActiveBookingsOverlapping = async () => 0 as any;
    storage.createXpBookingPending = createBookingSpy as any;
    storage.updateXpBookingStripeSession = async (_id: number, _sessionId: string) => ({ id: 10 }) as any;

    const app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    await registerRoutes(app);

    const res = await request(app).post("/api/xp/bookings/checkout").send({
      experienceSlug: "test",
      kind: "time_slot",
      customerName: "Jane Doe",
      customerEmail: "jane@example.com",
      startAt: "2030-01-01T10:00:00.000Z",
      endAt: "2030-01-01T12:00:00.000Z",
    });

    expect(res.status).toBe(201);
    expect(res.body?.checkoutUrl).toBe("https://checkout.example");

    expect(createBookingSpy).toHaveBeenCalled();
    expect(createBookingSpy.mock.calls[0][0]?.depositAmount).toBe("500.00");

    expect(stripeMod.__createSpy).toHaveBeenCalled();
    const args = stripeMod.__createSpy.mock.calls[0][0];
    expect(args?.line_items?.[0]?.price_data?.unit_amount).toBe(50000);
    expect(args?.metadata?.paymentMode).toBe("full");
  });

  it("charges depositAmount when paymentMode=deposit", async () => {
    vi.resetModules();
    const { registerRoutes } = await import("../server/routes");
    const { storage } = await import("../server/storage");
    const stripeMod: any = await import("stripe");

    const createBookingSpy = vi.fn(async (input: any) => ({ id: 11, ...input }));
    storage.getXpExperienceBySlug = async () =>
      ({
        id: 1,
        slug: "test",
        title: "Test Experience",
        active: true,
        mode: "time_slot",
        paymentMode: "deposit",
        currency: "USD",
        priceTotal: "500.00",
        depositAmount: "100.00",
        capacity: 1,
      }) as any;
    storage.listXpTimeSlots = async () =>
      [
        {
          id: 99,
          startAt: new Date("2030-01-01T10:00:00.000Z").toISOString(),
          endAt: new Date("2030-01-01T12:00:00.000Z").toISOString(),
          capacity: 1,
          remaining: 1,
        },
      ] as any;
    storage.hasXpBlackoutOverlap = async () => false as any;
    storage.countXpActiveBookingsOverlapping = async () => 0 as any;
    storage.createXpBookingPending = createBookingSpy as any;
    storage.updateXpBookingStripeSession = async (_id: number, _sessionId: string) => ({ id: 11 }) as any;

    const app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    await registerRoutes(app);

    const res = await request(app).post("/api/xp/bookings/checkout").send({
      experienceSlug: "test",
      kind: "time_slot",
      customerName: "Jane Doe",
      customerEmail: "jane@example.com",
      startAt: "2030-01-01T10:00:00.000Z",
      endAt: "2030-01-01T12:00:00.000Z",
    });

    expect(res.status).toBe(201);
    expect(res.body?.checkoutUrl).toBe("https://checkout.example");

    expect(createBookingSpy).toHaveBeenCalled();
    expect(createBookingSpy.mock.calls[0][0]?.depositAmount).toBe("100.00");

    expect(stripeMod.__createSpy).toHaveBeenCalled();
    const args = stripeMod.__createSpy.mock.calls[0][0];
    expect(args?.line_items?.[0]?.price_data?.unit_amount).toBe(10000);
    expect(args?.metadata?.paymentMode).toBe("deposit");
  });
});
