import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import express from "express";
import session from "express-session";
import request from "supertest";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import { emitInAppNotification } from "../server/services/notifications/emit";
import { onContractSigned } from "../server/services/tasks/task-service";

describe("Notification emission", () => {
  beforeEach(() => {
    storage.getNotificationPreferencesByUserId = async () => ({ inAppEnabled: true, emailEnabled: true, pushEnabled: true } as any);
    storage.createUserNotification = async (input: any) => ({ id: 1, ...input } as any);
  });

  it("skips in-app notifications during DND", async () => {
    const created: any[] = [];
    storage.getNotificationPreferencesByUserId = async () =>
      ({
        inAppEnabled: true,
        taskReminders: true,
        dndEnabled: true,
        dndStartTime: "22:00",
        dndEndTime: "06:00",
      } as any);
    storage.createUserNotification = async (input: any) => {
      created.push(input);
      return { id: 1, ...input } as any;
    };

    const res = await emitInAppNotification({
      userId: 1,
      type: "task_overdue",
      severity: "urgent",
      title: "Task overdue",
      category: "taskReminders",
      now: new Date("2020-01-01T23:00:00Z"),
    });

    expect(res.created).toBe(false);
    expect(created.length).toBe(0);
  });

  it("skips in-app notifications when category is disabled", async () => {
    const created: any[] = [];
    storage.getNotificationPreferencesByUserId = async () =>
      ({
        inAppEnabled: true,
        dealUpdates: false,
        dndEnabled: false,
      } as any);
    storage.createUserNotification = async (input: any) => {
      created.push(input);
      return { id: 1, ...input } as any;
    };

    const res = await emitInAppNotification({
      userId: 1,
      type: "opportunity_assigned",
      severity: "info",
      title: "Opportunity assigned",
      category: "dealUpdates",
      now: new Date("2020-01-01T12:00:00Z"),
    });

    expect(res.created).toBe(false);
    expect(created.length).toBe(0);
  });

  it("creates in-app notifications when allowed", async () => {
    const created: any[] = [];
    storage.getNotificationPreferencesByUserId = async () =>
      ({
        inAppEnabled: true,
        newLeads: true,
        dndEnabled: false,
      } as any);
    storage.createUserNotification = async (input: any) => {
      created.push(input);
      return { id: 1, ...input } as any;
    };

    const res = await emitInAppNotification({
      userId: 2,
      type: "lead_assigned",
      severity: "info",
      title: "Lead assigned",
      category: "newLeads",
      linkPath: "/leads?leadId=123",
      relatedType: "lead",
      relatedId: 123,
      now: new Date("2020-01-01T12:00:00Z"),
    });

    expect(res.created).toBe(true);
    expect(created.length).toBe(1);
    expect(created[0].userId).toBe(2);
    expect(created[0].linkPath).toBe("/leads?leadId=123");
    expect(created[0].severity).toBe("info");
  });
});

describe("Notification emission routes", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));

    app.post("/test/login", (req, res) => {
      (req.session as any).userId = 1;
      res.json({ ok: true });
    });

    storage.getUserById = async (id: number) => {
      if (id === 1) return { id: 1, email: "admin@example.com", isActive: true, isSuperAdmin: true } as any;
      if (id === 2) return { id: 2, email: "assignee@example.com", isActive: true } as any;
      return undefined as any;
    };

    storage.getTeamsForUser = async () => [{ id: 1 } as any];
    storage.getTeamMemberByTeamAndUser = async () => ({ teamId: 1, userId: 1, role: "owner", status: "active" } as any);

    storage.createGlobalActivity = async () => ({ id: 1 } as any);
    storage.getPropertyBySourceLeadId = async () => null as any;
    storage.getNotificationPreferencesByUserId = async () => ({ inAppEnabled: true, newLeads: true, dealUpdates: true, dndEnabled: false } as any);

    await registerRoutes(app);
  });

  it("emits lead_assigned when lead assignee changes", async () => {
    const created: any[] = [];
    storage.getLeadById = async (id: number) =>
      ({
        id,
        address: "123 Main St",
        city: "Miami",
        state: "FL",
        zipCode: "33101",
        ownerName: "Jane Doe",
        status: "new",
        assignedTo: null,
      } as any);
    storage.updateLead = async (id: number, patch: any) => ({ ...(await storage.getLeadById(id)), ...patch, assignedTo: 2 } as any);
    storage.createUserNotification = async (input: any) => {
      created.push(input);
      return { id: 1, ...input } as any;
    };

    const agent = request.agent(app);
    await agent.post("/test/login");

    const res = await agent.patch("/api/leads/123").send({ assignedTo: 2 });
    expect(res.status).toBe(200);
    expect(created.length).toBe(1);
    expect(created[0].userId).toBe(2);
    expect(created[0].type).toBe("lead_assigned");
    expect(created[0].linkPath).toBe("/leads?leadId=123");
  });

  it("emits opportunity_assigned when opportunity assignee changes", async () => {
    const created: any[] = [];
    storage.getPropertyById = async (id: number) =>
      ({
        id,
        address: "456 Oak Ave",
        city: "Tampa",
        state: "FL",
        zipCode: "33602",
        assignedTo: null,
      } as any);
    storage.updateProperty = async (id: number, patch: any) => ({ ...(await storage.getPropertyById(id)), ...patch, assignedTo: 2 } as any);
    storage.createUserNotification = async (input: any) => {
      created.push(input);
      return { id: 1, ...input } as any;
    };

    const agent = request.agent(app);
    await agent.post("/test/login");

    const res = await agent.patch("/api/opportunities/55").send({ assignedTo: 2 });
    expect(res.status).toBe(200);
    expect(created.length).toBe(1);
    expect(created[0].userId).toBe(2);
    expect(created[0].type).toBe("opportunity_assigned");
    expect(created[0].linkPath).toBe("/opportunities/55");
  });
});

describe("Contract signed emission", () => {
  it("emits contract_signed to the opportunity assignee when available", async () => {
    const created: any[] = [];
    storage.getPropertyById = async () => ({ id: 77, assignedTo: 2 } as any);
    storage.createTask = async () => ({ id: 1 } as any);
    storage.getNotificationPreferencesByUserId = async () => ({ inAppEnabled: true, contractAlerts: true, dndEnabled: false } as any);
    storage.createUserNotification = async (input: any) => {
      created.push(input);
      return { id: 1, ...input } as any;
    };

    await onContractSigned({ documentId: 9, title: "Purchase Agreement", propertyId: 77 });

    expect(created.length).toBe(1);
    expect(created[0].userId).toBe(2);
    expect(created[0].type).toBe("contract_signed");
    expect(created[0].severity).toBe("urgent");
    expect(created[0].linkPath).toBe("/opportunities/77");
  });
});
