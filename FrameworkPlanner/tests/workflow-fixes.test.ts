import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

// M15: note lifecycle. M20: campaign activation gated on SMS readiness.
// XP-15: vehicle/location type vocabularies aligned with the admin UI.

vi.mock("../server/services/telecom/provider-readiness.js", () => ({
  getProviderReadiness: vi.fn(async () => ({
    sms: { configured: false, reachable: false },
    voice: { configured: false, reachable: false },
  })),
}));

import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";

(storage as any).getUserByIdWithoutProfilePicture = async () =>
  ({ id: 1, email: "test@example.com", isSuperAdmin: true } as any);

describe("lead notes lifecycle (M15)", () => {
  let app: express.Express;
  const notes = new Map<number, any>();
  let nextId = 5000;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use((req: any, _res, next) => {
      req.session.userId = 1;
      next();
    });
    await registerRoutes(app);

    (storage as any).getLeadNoteById = async (id: number) => notes.get(id);
    (storage as any).updateLeadNote = async (id: number, body: string) => {
      const n = notes.get(id);
      if (!n) return undefined;
      n.body = body;
      return n;
    };
    (storage as any).deleteLeadNote = async (id: number) => notes.delete(id);
    (storage as any).createLeadNote = async (input: any) => {
      const id = nextId++;
      const row = { id, createdAt: new Date().toISOString(), ...input };
      notes.set(id, row);
      return row;
    };
    (storage as any).getLeadById = async () => null;
    (storage as any).updateLead = async (id: number, patch: any) => ({ id, ...patch });
    (storage as any).createGlobalActivity = async (i: any) => i;
    (storage as any).listLeadNotes = async (leadId: number) =>
      [...notes.values()].filter((n) => n.leadId === leadId);
  });

  it("PATCH updates the note body", async () => {
    const created = await (storage as any).createLeadNote({ leadId: 7, body: "original", createdBy: 1 });
    const res = await request(app).patch(`/api/leads/notes/${created.id}`).send({ body: "edited body" });
    expect(res.status).toBe(200);
    expect(res.body.body).toBe("edited body");
  });

  it("PATCH rejects empty body and unknown ids", async () => {
    const created = await (storage as any).createLeadNote({ leadId: 7, body: "x", createdBy: 1 });
    const empty = await request(app).patch(`/api/leads/notes/${created.id}`).send({ body: "   " });
    expect(empty.status).toBe(400);
    const missing = await request(app).patch("/api/leads/notes/999999").send({ body: "y" });
    expect(missing.status).toBe(404);
  });

  it("DELETE removes the note", async () => {
    const created = await (storage as any).createLeadNote({ leadId: 7, body: "bye", createdBy: 1 });
    const res = await request(app).delete(`/api/leads/notes/${created.id}`);
    expect(res.status).toBe(204);
    expect(notes.has(created.id)).toBe(false);
    const again = await request(app).delete(`/api/leads/notes/${created.id}`);
    expect(again.status).toBe(404);
  });
});

describe("campaign activation gate (M20)", () => {
  let app: express.Express;
  const campaigns = new Map<number, any>([[42, { id: 42, name: "Test", status: "draft" }]]);

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use((req: any, _res, next) => {
      req.session.userId = 1;
      next();
    });
    await registerRoutes(app);
    (storage as any).updateCampaign = async (id: number, patch: any) => {
      const c = campaigns.get(id);
      Object.assign(c, patch);
      return c;
    };
  });

  it("refuses activation with 409 while SMS is not configured", async () => {
    const res = await request(app).patch("/api/campaigns/42").send({ status: "active" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("sms_not_configured");
    expect(campaigns.get(42).status).toBe("draft");
  });

  it("still allows non-activation updates", async () => {
    const res = await request(app).patch("/api/campaigns/42").send({ name: "Renamed" });
    expect(res.status).toBe(200);
    expect(campaigns.get(42).name).toBe("Renamed");
  });
});

describe("XP type vocabularies (XP-15)", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use((req: any, _res, next) => {
      req.session.userId = 1;
      next();
    });
    await registerRoutes(app);
    (storage as any).createXpVehicle = async (v: any) => ({ id: 1, ...v });
    (storage as any).createXpLocation = async (v: any) => ({ id: 1, ...v });
  });

  it("accepts boat vehicle type and marina/venue location types", async () => {
    const v = await request(app).post("/api/xp/admin/vehicles").send({ name: "Test Boat", type: "boat" });
    expect(v.status).toBe(201);
    const l = await request(app).post("/api/xp/admin/locations").send({ name: "Test Marina", type: "marina" });
    expect(l.status).toBe(201);
    const l2 = await request(app).post("/api/xp/admin/locations").send({ name: "Test Venue", type: "venue" });
    expect(l2.status).toBe(201);
  });

  it("still rejects unknown types", async () => {
    const v = await request(app).post("/api/xp/admin/vehicles").send({ name: "X", type: "spaceship" });
    expect(v.status).toBe(400);
  });
});
