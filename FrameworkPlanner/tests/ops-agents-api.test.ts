import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

vi.mock("../server/services/audit/writeAuditEvent.js", () => ({
  writeAuditEvent: vi.fn(async () => null),
}));

import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import { computeOpsAgentStatus } from "../server/ops/status";
import { hashOpsAgentSecret } from "../server/ops/auth";

type AgentRow = {
  id: number;
  teamId: number;
  slug: string;
  displayName: string;
  hostname: string | null;
  provider: string | null;
  region: string | null;
  environment: string;
  agentType: string;
  model: string | null;
  expectedHeartbeatIntervalSeconds: number;
  heartbeatSecretHash: string;
  configRefCiphertext: string | null;
  configRefIv: string | null;
  lastStatus: string;
  lastHeartbeatAt: Date | null;
  lastError: string | null;
  lastTask: string | null;
  latestMetricsJson: Record<string, unknown>;
  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
};

describe("Ops Agents API", () => {
  let app: express.Express;
  let agents: AgentRow[];
  let heartbeats: any[];
  let nextAgentId = 2;

  const superAdmin = { id: 1, email: "owner@example.com", role: "admin", isSuperAdmin: true, isActive: true } as any;
  const teamAdmin = { id: 2, email: "team@example.com", role: "agent", isSuperAdmin: false, isActive: true } as any;
  const agentSecret = "ops-secret-1";

  beforeAll(async () => {
    process.env.SESSION_SECRET = "test";
    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use((req: any, _res, next) => {
      const testUserId = Number(req.headers["x-test-user-id"]);
      const testTeamId = Number(req.headers["x-test-team-id"]);
      if (Number.isFinite(testUserId) && testUserId > 0) req.session.userId = testUserId;
      if (Number.isFinite(testTeamId) && testTeamId > 0) req.session.activeTeamId = testTeamId;
      next();
    });
    await registerRoutes(app);
  });

  beforeEach(() => {
    agents = [
      {
        id: 1,
        teamId: 10,
        slug: "hermes-orlando-01",
        displayName: "Hermes Orlando",
        hostname: "vps-01",
        provider: "VPS",
        region: "Orlando",
        environment: "production",
        agentType: "hermes",
        model: "tinyllama",
        expectedHeartbeatIntervalSeconds: 60,
        heartbeatSecretHash: hashOpsAgentSecret(agentSecret),
        configRefCiphertext: null,
        configRefIv: null,
        lastStatus: "offline",
        lastHeartbeatAt: null,
        lastError: null,
        lastTask: null,
        latestMetricsJson: {},
        createdBy: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    heartbeats = [];
    nextAgentId = 2;

    storage.getUserById = async (id: number) => {
      if (id === 1) return superAdmin;
      if (id === 2) return teamAdmin;
      return undefined as any;
    };
    storage.getTeamById = async (id: number) => (id === 10 ? ({ id: 10, name: "Ops Team" } as any) : undefined);
    storage.getTeams = async () => [{ id: 10, name: "Ops Team" } as any];
    storage.getTeamsForUser = async (userId: number) => (userId === 2 ? [{ id: 10, name: "Ops Team" } as any] : [{ id: 10, name: "Ops Team" } as any]);
    storage.getTeamMemberByTeamAndUser = async (teamId: number, userId: number) => {
      if (teamId === 10 && userId === 2) return { id: 20, teamId, userId, role: "admin", status: "active" } as any;
      return undefined as any;
    };
    storage.getOpsAgentBySlug = async (slug: string) => agents.find((agent) => agent.slug === slug) as any;
    storage.getOpsAgentById = async (id: number) => agents.find((agent) => agent.id === id) as any;
    storage.createOpsAgent = async (input: any) => {
      const row: AgentRow = {
        id: nextAgentId++,
        lastStatus: "offline",
        lastHeartbeatAt: null,
        lastError: null,
        lastTask: null,
        latestMetricsJson: {},
        configRefCiphertext: null,
        configRefIv: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...input,
      };
      agents.push(row);
      return row as any;
    };
    storage.updateOpsAgent = async (id: number, patch: any) => {
      const index = agents.findIndex((agent) => agent.id === id);
      agents[index] = { ...agents[index], ...patch, updatedAt: new Date() };
      return agents[index] as any;
    };
    storage.createOpsAgentHeartbeat = async (input: any) => {
      const row = { id: heartbeats.length + 1, receivedAt: new Date(), ...input };
      heartbeats.push(row);
      return row as any;
    };
    storage.listRecentOpsAgentHeartbeats = async (agentId: number) => heartbeats.filter((item) => item.agentId === agentId) as any;
    storage.listOpsAgents = async (input: any) => {
      let scoped = [...agents];
      if (Array.isArray(input.teamIds) && input.teamIds.length > 0) scoped = scoped.filter((agent) => input.teamIds.includes(agent.teamId));
      if (input.teamId) scoped = scoped.filter((agent) => agent.teamId === input.teamId);
      if (input.status) scoped = scoped.filter((agent) => agent.lastStatus === input.status);
      return {
        items: scoped.map((agent) => ({ ...agent, teamName: "Ops Team" })),
        total: scoped.length,
      } as any;
    };
  });

  it("rejects heartbeat without a valid bearer secret", async () => {
    const res = await request(app)
      .post("/api/ops/agents/heartbeat")
      .set("Authorization", "Bearer wrong-secret")
      .send({
        agentId: "hermes-orlando-01",
        cpuPercent: 20,
        ramUsedMb: 512,
        ramTotalMb: 2048,
        diskUsedMb: 1024,
        diskTotalMb: 4096,
        uptimeSeconds: 60,
        hermes: "running",
        ollama: "running",
      });

    expect(res.status).toBe(401);
  });

  it("accepts a valid heartbeat and updates the cached snapshot", async () => {
    const res = await request(app)
      .post("/api/ops/agents/heartbeat")
      .set("Authorization", `Bearer ${agentSecret}`)
      .send({
        agentId: "hermes-orlando-01",
        status: "online",
        cpuPercent: 22,
        ramUsedMb: 640,
        ramTotalMb: 2048,
        diskUsedMb: 2048,
        diskTotalMb: 4096,
        uptimeSeconds: 120,
        hermes: "running",
        ollama: "running",
        model: "tinyllama",
        latestTask: "idle",
      });

    expect(res.status).toBe(202);
    expect(heartbeats).toHaveLength(1);
    expect(agents[0].lastStatus).toBe("online");
    expect(agents[0].latestMetricsJson).toMatchObject({ cpuPercent: 22, hermesStatus: "running", ollamaStatus: "running" });
  });

  it("limits fleet visibility to the active team for a team admin", async () => {
    agents.push({
      ...agents[0],
      id: 99,
      slug: "hermes-miami-01",
      teamId: 55,
      displayName: "Hermes Miami",
      heartbeatSecretHash: hashOpsAgentSecret("another-secret"),
    });

    const res = await request(app)
      .get("/api/ops/agents")
      .set("x-test-user-id", "2")
      .set("x-test-team-id", "10");

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].slug).toBe("hermes-orlando-01");
    expect(res.body.items[0].heartbeatSecretHash).toBeUndefined();
  });

  it("creates a new agent only for super-admin users", async () => {
    const forbidden = await request(app)
      .post("/api/ops/agents")
      .set("x-test-user-id", "2")
      .set("x-test-team-id", "10")
      .send({
        teamId: 10,
        slug: "hermes-tampa-01",
        displayName: "Hermes Tampa",
        expectedHeartbeatIntervalSeconds: 60,
      });
    expect(forbidden.status).toBe(403);

    const created = await request(app)
      .post("/api/ops/agents")
      .set("x-test-user-id", "1")
      .send({
        teamId: 10,
        slug: "hermes-tampa-01",
        displayName: "Hermes Tampa",
        provider: "VPS",
        environment: "production",
        agentType: "hermes",
        model: "tinyllama",
        expectedHeartbeatIntervalSeconds: 60,
      });

    expect(created.status).toBe(201);
    expect(typeof created.body.heartbeatSecret).toBe("string");
    expect(agents.some((agent) => agent.slug === "hermes-tampa-01")).toBe(true);
  });

  it("computes offline state when heartbeat freshness expires", () => {
    const status = computeOpsAgentStatus({
      lastHeartbeatAt: new Date(Date.now() - 181000),
      reportedStatus: "online",
      hermesStatus: "running",
      ollamaStatus: "running",
      lastError: null,
    });

    expect(status).toBe("offline");
  });
});
