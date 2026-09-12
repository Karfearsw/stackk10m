import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";

storage.getUserById = async () => ({ id: 1, email: "test@example.com", isSuperAdmin: true } as any);

// Regression for M4 follow-up: after switching properties.baths to NUMERIC,
// drizzle-zod generated z.string() for it while the UI posts numbers
// (parseFloat("1.5")), so every half-bath save was rejected server-side.
// The insert schemas must accept numbers OR strings and normalize to the
// decimal-string shape drizzle expects — for baths, unit baths, and rent.
describe("Fractional baths validation (audit M4)", () => {
  let app: express.Express;
  const originals: Record<string, any> = {};

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
    for (const k of [
      "createProperty",
      "updateProperty",
      "getPropertyById",
      "createPropertyUnit",
      "createOpportunityEvent",
      "createGlobalActivity",
    ]) {
      originals[k] = (storage as any)[k];
    }
    (storage as any).createGlobalActivity = async () => ({});
    (storage as any).createOpportunityEvent = async () => ({});
  });

  afterEach(() => {
    for (const [k, fn] of Object.entries(originals)) {
      (storage as any)[k] = fn;
    }
  });

  it("accepts a half bath as a number on opportunity create", async () => {
    (storage as any).createProperty = async (p: any) => ({ id: 1, createdAt: new Date(), updatedAt: new Date(), ...p });
    const res = await request(app)
      .post("/api/opportunities")
      .send({ address: "1 Main St", city: "Baltimore", state: "MD", zipCode: "21201", baths: 1.5 });
    expect(res.status).toBe(201);
    expect(res.body.baths).toBe("1.5");
  });

  it("still accepts decimal strings and empty strings", async () => {
    (storage as any).createProperty = async (p: any) => ({ id: 2, createdAt: new Date(), updatedAt: new Date(), ...p });
    const res = await request(app)
      .post("/api/opportunities")
      .send({ address: "2 Main St", city: "Baltimore", state: "MD", zipCode: "21201", baths: "2.5" });
    expect(res.status).toBe(201);
    expect(res.body.baths).toBe("2.5");

    const res2 = await request(app)
      .post("/api/opportunities")
      .send({ address: "3 Main St", city: "Baltimore", state: "MD", zipCode: "21201", baths: "" });
    expect(res2.status).toBe(201);
    expect(res2.body.baths).toBeNull();
  });

  it("rejects non-numeric baths", async () => {
    const res = await request(app)
      .post("/api/opportunities")
      .send({ address: "4 Main St", city: "Baltimore", state: "MD", zipCode: "21201", baths: "abc" });
    expect(res.status).toBe(400);
  });

  it("accepts a half bath on opportunity update", async () => {
    (storage as any).getPropertyById = async () => ({ id: 20, address: "20 Main St", city: "Baltimore", state: "MD", zipCode: "21201", baths: "1" });
    (storage as any).updateProperty = async (_id: number, p: any) => ({ id: 20, createdAt: new Date(), updatedAt: new Date(), address: "20 Main St", city: "Baltimore", state: "MD", zipCode: "21201", ...p });
    const res = await request(app).patch("/api/opportunities/20").send({ baths: 1.5 });
    expect(res.status).toBe(200);
    expect(res.body.baths).toBe("1.5");
  });

  it("accepts fractional baths and decimal rent on property units", async () => {
    (storage as any).getPropertyById = async () => ({ id: 20 });
    (storage as any).createPropertyUnit = async (u: any) => ({ id: 5, createdAt: new Date(), updatedAt: new Date(), ...u });
    const res = await request(app)
      .post("/api/opportunities/20/units")
      .send({ unitLabel: "Unit A", beds: 2, baths: 1.5, rent: 2100.5, unitStatus: "vacant" });
    expect(res.status).toBe(201);
    expect(res.body.baths).toBe("1.5");
    expect(res.body.rent).toBe("2100.5");
  });
});
