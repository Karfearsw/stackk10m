import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";

describe("Teams endpoints", () => {
  let app: express.Express;

  const usersById = new Map<number, any>();

  beforeAll(async () => {
    process.env.SESSION_SECRET = "test";

    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use((req, _res, next) => {
      const header = req.headers["x-test-user-id"];
      const raw = Array.isArray(header) ? header[0] : header;
      const id = raw ? parseInt(String(raw), 10) : NaN;
      if (Number.isFinite(id)) (req.session as any).userId = id;
      next();
    });

    storage.getUserById = (async (id: number) => usersById.get(id)) as any;
    storage.getUserByEmail = (async (_email: string) => null) as any;
    storage.createTeam = (async (t: any) => ({ id: 10, ...t })) as any;
    storage.createTeamMember = (async (m: any) => ({ id: 100, ...m })) as any;
    storage.getTeamsForUser = (async (_userId: number) => []) as any;
    storage.getTeamByInviteCode = (async (_code: string) => null) as any;
    storage.getTeamMemberByTeamAndUser = (async (_teamId: number, _userId: number) => null) as any;
    storage.updateTeamMember = (async (_id: number, patch: any) => ({ id: _id, ...patch })) as any;
    storage.createTeamActivityLog = (async (l: any) => ({ id: 1, ...l })) as any;
    storage.getTeamMemberById = (async (_id: number) => null) as any;

    await registerRoutes(app);
  });

  beforeEach(() => {
    usersById.clear();
  });

  it("POST /api/teams creates team and adds owner membership", async () => {
    usersById.set(1, { id: 1, email: "owner@example.com", role: "employee", isSuperAdmin: false, isActive: true });
    let createdTeam: any = null;
    let createdMember: any = null;
    storage.createTeam = (async (t: any) => {
      createdTeam = t;
      return { id: 10, ...t };
    }) as any;
    storage.createTeamMember = (async (m: any) => {
      createdMember = m;
      return { id: 100, ...m };
    }) as any;

    const res = await request(app).post("/api/teams").set("x-test-user-id", "1").send({ name: "My Team" });
    expect(res.status).toBe(201);
    expect(createdTeam.name).toBe("My Team");
    expect(typeof createdTeam.inviteCode).toBe("string");
    expect(createdMember.role).toBe("owner");
    expect(createdMember.userId).toBe(1);
    expect(createdMember.teamId).toBe(10);
  });

  it("POST /api/teams/join creates membership when missing", async () => {
    usersById.set(2, { id: 2, email: "member@example.com", role: "employee", isSuperAdmin: false, isActive: true });
    storage.getTeamByInviteCode = (async (code: string) => ({ id: 10, inviteCode: code })) as any;
    storage.getTeamMemberByTeamAndUser = (async () => null) as any;

    let createdMember: any = null;
    storage.createTeamMember = (async (m: any) => {
      createdMember = m;
      return { id: 200, ...m };
    }) as any;

    const res = await request(app).post("/api/teams/join").set("x-test-user-id", "2").send({ inviteCode: "abc123" });
    expect(res.status).toBe(200);
    expect(createdMember.teamId).toBe(10);
    expect(createdMember.userId).toBe(2);
    expect(createdMember.status).toBe("active");
  });

  it("POST /api/teams/join reactivates inactive membership", async () => {
    usersById.set(2, { id: 2, email: "member@example.com", role: "employee", isSuperAdmin: false, isActive: true });
    storage.getTeamByInviteCode = (async (code: string) => ({ id: 10, inviteCode: code })) as any;
    storage.getTeamMemberByTeamAndUser = (async () => ({ id: 99, teamId: 10, userId: 2, status: "inactive" })) as any;

    let updated: any = null;
    storage.updateTeamMember = (async (id: number, patch: any) => {
      updated = { id, patch };
      return { id, ...patch };
    }) as any;

    const res = await request(app).post("/api/teams/join").set("x-test-user-id", "2").send({ inviteCode: "abc123" });
    expect(res.status).toBe(200);
    expect(updated.id).toBe(99);
    expect(updated.patch.status).toBe("active");
    expect(updated.patch.joinedAt instanceof Date).toBe(true);
  });

  it("PATCH /api/team-members/:id requires admin role in team", async () => {
    usersById.set(1, { id: 1, email: "admin@example.com", role: "employee", isSuperAdmin: false, isActive: true });
    storage.getTeamMemberById = (async () => ({ id: 500, teamId: 10, userId: 2, role: "member", status: "active" })) as any;
    storage.getTeamMemberByTeamAndUser = (async () => ({ id: 123, teamId: 10, userId: 1, role: "admin", status: "active" })) as any;

    let updatedPatch: any = null;
    storage.updateTeamMember = (async (_id: number, patch: any) => {
      updatedPatch = patch;
      return { id: _id, ...patch };
    }) as any;

    const res = await request(app).patch("/api/team-members/500").set("x-test-user-id", "1").send({ role: "viewer" });
    expect(res.status).toBe(200);
    expect(updatedPatch.role).toBe("viewer");
  });
});

