import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";

describe("Leads RBAC", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test";
  });

  it("GET /api/leads scopes by allowedAssignedToUserIds for non-admin", async () => {
    const app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use((req, _res, next) => {
      (req.session as any).userId = 1;
      next();
    });

    storage.getUserById = async (_id: number) => ({ id: 1, role: "agent", isSuperAdmin: false, isActive: true } as any);
    storage.getUserTeamIds = async (_userId: number) => [10];
    storage.getTeamMemberUserIds = async (_teamId: number) => [1, 2];
    storage.getPropertiesBySourceLeadIds = async (_ids: number[]) => [] as any;

    let captured: any = null;
    storage.listLeads = async (input: any) => {
      captured = input;
      return { items: [], total: 0 } as any;
    };

    await registerRoutes(app);

    const res = await request(app).get("/api/leads");
    expect(res.status).toBe(200);
    expect(Array.isArray(captured?.allowedAssignedToUserIds)).toBe(true);
    expect(captured.allowedAssignedToUserIds).toContain(2);
  });

  it("GET /api/leads does not apply scope for admin", async () => {
    const app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use((req, _res, next) => {
      (req.session as any).userId = 2;
      next();
    });

    storage.getUserById = async (_id: number) => ({ id: 2, role: "admin", isSuperAdmin: true, isActive: true } as any);
    storage.getPropertiesBySourceLeadIds = async (_ids: number[]) => [] as any;

    let captured: any = null;
    storage.listLeads = async (input: any) => {
      captured = input;
      return { items: [], total: 0 } as any;
    };

    await registerRoutes(app);

    const res = await request(app).get("/api/leads");
    expect(res.status).toBe(200);
    expect(typeof captured?.allowedAssignedToUserIds).toBe("undefined");
  });
});

