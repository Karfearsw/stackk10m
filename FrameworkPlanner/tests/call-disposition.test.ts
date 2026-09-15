import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";

// Verification for call disposition (user's #1 priority control).
// Exercises: manual call-log creation -> PATCH disposition -> persistence,
// invalid-disposition rejection, DNC flag propagation, activity logging.

(storage as any).getUserByIdWithoutProfilePicture = async () =>
  ({ id: 1, email: "test@example.com", isSuperAdmin: true } as any);

describe("call disposition end-to-end", () => {
  let app: express.Express;
  const originals: Record<string, any> = {};
  const callLogs = new Map<number, any>();
  let nextId = 1000;
  const leads = new Map<number, any>();
  const activities: any[] = [];

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use((req: any, _res, next) => {
      req.session.userId = 1;
      next();
    });
    await registerRoutes(app);

    for (const k of ["createCallLog", "updateCallLog", "getCallLogById", "getLeadById", "updateLead", "createGlobalActivity"])
      originals[k] = (storage as any)[k];

    (storage as any).createCallLog = async (input: any) => {
      const id = nextId++;
      const row = { id, disposition: null, note: null, leadId: null, status: "ended", ...input };
      callLogs.set(id, row);
      return row;
    };
    (storage as any).updateCallLog = async (id: number, patch: any) => {
      const row = callLogs.get(id);
      if (!row) return undefined as any;
      Object.assign(row, patch);
      return row;
    };
    (storage as any).getLeadById = async (id: number) => leads.get(id) || null;
    (storage as any).updateLead = async (id: number, patch: any) => {
      const lead = leads.get(id) || { id };
      Object.assign(lead, patch);
      leads.set(id, lead);
      return lead;
    };
    (storage as any).createGlobalActivity = async (input: any) => {
      activities.push(input);
      return { id: activities.length, ...input };
    };
  });

  afterEach(() => {
    callLogs.clear();
    leads.clear();
    activities.length = 0;
  });

  it("manual log: PATCH persists disposition + note and logs activity", async () => {
    leads.set(50, { id: 50, address: "1 Test St", doNotCall: false });
    const created = await (storage as any).createCallLog({ leadId: 50, number: "+15551234567", status: "ended" });

    const res = await request(app)
      .patch(`/api/telephony/calls/${created.id}`)
      .send({ disposition: "connected", note: "Spoke with owner, wants offer" });

    expect(res.status).toBe(200);
    const row = callLogs.get(created.id);
    expect(row.disposition).toBe("connected");
    expect(row.note).toBe("Spoke with owner, wants offer");
    expect(activities.some((a) => a.action === "call_dispositioned")).toBe(true);
  });

  it("rejects a disposition outside the canonical taxonomy", async () => {
    const created = await (storage as any).createCallLog({ leadId: 50, number: "+15551234567", status: "ended" });
    const res = await request(app)
      .patch(`/api/telephony/calls/${created.id}`)
      .send({ disposition: "bogus_disposition" });
    expect(res.status).toBe(400);
    expect(callLogs.get(created.id).disposition).toBeNull();
  });

  it("do_not_call disposition sets the lead DNC flag", async () => {
    leads.set(51, { id: 51, address: "2 Test St", doNotCall: false });
    const created = await (storage as any).createCallLog({ leadId: 51, number: "+15551234568", status: "ended" });

    const res = await request(app)
      .patch(`/api/telephony/calls/${created.id}`)
      .send({ disposition: "do_not_call" });

    expect(res.status).toBe(200);
    expect(leads.get(51).doNotCall).toBe(true);
  });

  it("maps legacy dialer values to the canonical taxonomy", async () => {
    const created = await (storage as any).createCallLog({ leadId: 50, number: "+15551234567", status: "ended" });
    const res = await request(app)
      .patch(`/api/telephony/calls/${created.id}`)
      .send({ disposition: "call_back", followUpAt: new Date(Date.now() + 86400000).toISOString() });
    expect(res.status).toBe(200);
    expect(callLogs.get(created.id).disposition).toBe("callback_requested");
  });
});
