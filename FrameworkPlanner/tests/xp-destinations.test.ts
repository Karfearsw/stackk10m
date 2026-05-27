import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

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

describe("XP destinations API", () => {
  let app: express.Express;

  beforeAll(async () => {
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
      return undefined as any;
    }) as any;

    storage.listXpDestinations = (async () => [
      { id: 10, name: "Westgate Lakes", slug: "westgate-lakes", heroImage: "/images/westgate.jpg", images: ["/images/westgate-2.jpg"], type: "resort", active: true },
      { id: 11, name: "Hidden Resort", slug: "hidden", heroImage: null, images: null, type: "resort", active: false },
    ]) as any;

    storage.getXpDestinationBySlug = (async (slug: string) => {
      if (slug === "westgate-lakes") return { id: 10, name: "Westgate Lakes", slug: "westgate-lakes", heroImage: "/images/westgate.jpg", images: ["/images/westgate-2.jpg"], active: true } as any;
      return undefined as any;
    }) as any;

    storage.listXpExperiencesWithDestinations = (async () => [
      { id: 1, slug: "sunset-cruise", title: "Sunset Cruise", active: true, depositAmount: "100.00", currency: "USD", mode: "time_slot", locationId: 10, destination: { id: 10, name: "Westgate Lakes", slug: "westgate-lakes", heroImage: "/images/westgate.jpg", images: ["/images/westgate-2.jpg"] } },
      { id: 2, slug: "city-tour", title: "City Tour", active: true, depositAmount: "50.00", currency: "USD", mode: "time_slot", locationId: 999, destination: null },
    ]) as any;

    storage.createXpLocation = (async (input: any) => ({ id: 99, ...input })) as any;
    storage.updateXpLocation = (async (id: number, patch: any) => ({ id, name: "Westgate Lakes", type: "resort", active: true, ...patch })) as any;
  });

  it("GET /api/xp/destinations returns active destinations", async () => {
    const res = await request(app).get("/api/xp/destinations");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items[0].slug).toBe("westgate-lakes");
  });

  it("GET /api/xp/destinations/:slug returns destination and its experiences", async () => {
    const res = await request(app).get("/api/xp/destinations/westgate-lakes");
    expect(res.status).toBe(200);
    expect(res.body.destination.slug).toBe("westgate-lakes");
    expect(Array.isArray(res.body.experiences)).toBe(true);
    expect(res.body.experiences.map((x: any) => x.slug)).toContain("sunset-cruise");
    expect(res.body.experiences.map((x: any) => x.slug)).not.toContain("city-tour");
  });

  it("POST /api/xp/admin/locations accepts destination image fields", async () => {
    const res = await request(app)
      .post("/api/xp/admin/locations")
      .set("x-test-user-id", "1")
      .send({
        name: "Westgate Lakes",
        type: "resort",
        slug: "Westgate Lakes",
        heroImage: "/images/westgate.jpg",
        images: ["/images/westgate-2.jpg"],
        description: "Luxury lakeside resort.",
        highlights: ["Lakeside", "Spa"],
      });
    expect(res.status).toBe(201);
    expect(res.body.location.slug).toBe("westgate-lakes");
    expect(res.body.location.heroImage).toBe("/images/westgate.jpg");
  });

  it("PATCH /api/xp/admin/locations/:id updates slug", async () => {
    const res = await request(app)
      .patch("/api/xp/admin/locations/10")
      .set("x-test-user-id", "1")
      .send({ slug: "Westgate Branson Lakes" });
    expect(res.status).toBe(200);
    expect(res.body.location.slug).toBe("westgate-branson-lakes");
  });
});

