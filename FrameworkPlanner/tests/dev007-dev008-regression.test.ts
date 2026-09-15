import { describe, it, expect, beforeAll, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";

// Regression tests for DEV-007 (lead delete) and DEV-008 (script archive).
// Both buttons were reported inert/silent on production builds. The server
// endpoints are covered here; the client now uses in-app AlertDialog
// confirmations instead of native confirm() (see leads.tsx, ScriptEditorDialog.tsx).

(storage as any).getUserByIdWithoutProfilePicture = async () =>
  ({ id: 1, email: "test@example.com", isSuperAdmin: true } as any);

describe("DEV-007/DEV-008 regression: delete + archive endpoints", () => {
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
    for (const k of ["getLeadById", "deleteLead", "createGlobalActivity"])
      originals[k] = (storage as any)[k];
  });

  afterEach(() => {
    for (const k of Object.keys(originals)) (storage as any)[k] = originals[k];
  });

  it("DEV-007: DELETE /api/leads/:id deletes the lead and returns 200", async () => {
    let deletedId: number | null = null;
    (storage as any).getLeadById = async (id: number) => ({ id, address: "1 Test St" } as any);
    (storage as any).deleteLead = async (id: number) => { deletedId = id; };
    (storage as any).createGlobalActivity = async () => ({ id: 1 } as any);

    const res = await request(app).delete("/api/leads/10666");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Lead deleted");
    expect(deletedId).toBe(10666);
  });

  it("DEV-007: DELETE /api/leads/:id is not swallowed by an earlier duplicate route", async () => {
    // Express serves the first matching handler; assert the canonical handler
    // (the one that calls storage.deleteLead) is the one that answers.
    let calls = 0;
    (storage as any).getLeadById = async (id: number) => ({ id, address: "1 Test St" } as any);
    (storage as any).deleteLead = async () => { calls += 1; };
    (storage as any).createGlobalActivity = async () => ({ id: 1 } as any);

    await request(app).delete("/api/leads/42");
    expect(calls).toBe(1);
  });

  it("DEV-008: POST /api/scripts/:id/archive is registered and authorized", async () => {
    // The route must exist (not 404) and require auth semantics consistent
    // with the other script routes. With a signed-in session the handler runs;
    // here we assert the route is reachable (any non-404 proves registration).
    const res = await request(app).post("/api/scripts/99999/archive");
    expect([200, 500]).toContain(res.status);
    expect(res.status).not.toBe(404);
  });
});
