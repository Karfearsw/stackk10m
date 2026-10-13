#!/usr/bin/env node
/**
 * OceanLuxe CRM MCP Server
 *
 * Exposes CRM tools to AI agents (Telnyx AI assistants, Claude, etc.)
 * via the Model Context Protocol.
 *
 * Tools:
 *  - search_leads: Search leads by name, phone, address, or keyword
 *  - get_lead: Get full lead details by ID
 *  - update_lead_notes: Append notes to a lead
 *  - search_contacts: Search contacts by name or phone
 *  - create_task: Create a follow-up task
 *  - get_lead_calls: Get recent call history for a lead
 *
 * Transports:
 *  - stdio (for Claude Desktop, CLI agents)
 *  - SSE (for Telnyx AI assistants, web clients) — set PORT env var
 *
 * Auth: CRM_API_KEY env var (Bearer lxrm_... token)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";

const CRM_BASE_URL = process.env.CRM_BASE_URL || "https://crm.oceanluxe.org";
const CRM_API_KEY = process.env.CRM_API_KEY || "";
// Separate token for inbound MCP client auth (SSE). Never reuse CRM_API_KEY.
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || "";

if (!CRM_API_KEY) {
  console.error("CRM_API_KEY required");
  process.exit(1);
}

// ── Input validation ──
function validateLeadId(v: any): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0 || n > 2147483647) {
    throw new Error("leadId must be a positive integer");
  }
  return n;
}

function validateQuery(v: any): string {
  const s = String(v || "").trim();
  if (!s) throw new Error("query is required");
  if (s.length > 200) throw new Error("query too long (max 200 chars)");
  return s;
}

function validateLimit(v: any, def = 10, max = 50): number {
  const n = Number(v ?? def);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(Math.floor(n), 1), max);
}

function validateNote(v: any): string {
  const s = String(v || "").trim();
  if (!s) throw new Error("note is required");
  if (s.length > 5000) throw new Error("note too long (max 5000 chars)");
  return s;
}

function validatePriority(v: any): string {
  const p = String(v || "medium").toLowerCase();
  if (!["low", "medium", "high"].includes(p)) throw new Error("priority must be low, medium, or high");
  return p;
}

// ── Rate limiting (in-memory, per-process) ──
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60; // requests per minute per IP
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= RATE_LIMIT;
}

// ── Audit logging ──
function auditLog(tool: string, args: any, ip: string, ok: boolean, err?: string) {
  const safeArgs = { ...args };
  // Never log full note content — just length
  if (typeof safeArgs.note === "string") safeArgs.note = `[${safeArgs.note.length} chars]`;
  console.error(JSON.stringify({
    ts: new Date().toISOString(),
    type: "mcp_tool_call",
    tool,
    args: safeArgs,
    ip,
    ok,
    ...(err ? { error: err.slice(0, 200) } : {}),
  }));
}

async function crmApi(path: string, opts: { method?: string; body?: any } = {}) {
  const res = await fetch(`${CRM_BASE_URL}${path}`, {
    method: opts.method || "GET",
    headers: {
      Authorization: `Bearer ${CRM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`CRM API ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

const TOOLS = [
  {
    name: "search_leads",
    description: "Search CRM leads by name, phone number, address, or keyword. Returns matching leads with IDs, names, phones, addresses, and status.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term (name, phone, address)" },
        limit: { type: "number", description: "Max results (default 10)", default: 10 },
      },
      required: ["query"],
    },
  },
  {
    name: "get_lead",
    description: "Get full details for a lead by ID, including contact info, property details, notes, and status.",
    inputSchema: {
      type: "object",
      properties: {
        leadId: { type: "number", description: "Lead ID" },
      },
      required: ["leadId"],
    },
  },
  {
    name: "update_lead_notes",
    description: "Append a note to a lead's notes. Use for call summaries, observations, or follow-up context.",
    inputSchema: {
      type: "object",
      properties: {
        leadId: { type: "number", description: "Lead ID" },
        note: { type: "string", description: "Note text to append" },
      },
      required: ["leadId", "note"],
    },
  },
  {
    name: "search_contacts",
    description: "Search CRM contacts (buyers, partners) by name or phone.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term" },
        limit: { type: "number", description: "Max results (default 10)", default: 10 },
      },
      required: ["query"],
    },
  },
  {
    name: "create_task",
    description: "Create a follow-up task for a lead. Use after qualifying a lead or when a callback is needed.",
    inputSchema: {
      type: "object",
      properties: {
        leadId: { type: "number", description: "Lead ID" },
        title: { type: "string", description: "Task title" },
        description: { type: "string", description: "Task details" },
        priority: { type: "string", description: "low, medium, high", default: "medium" },
      },
      required: ["leadId", "title"],
    },
  },
  {
    name: "get_lead_calls",
    description: "Get recent call history for a lead, including dispositions and transcripts.",
    inputSchema: {
      type: "object",
      properties: {
        leadId: { type: "number", description: "Lead ID" },
        limit: { type: "number", description: "Max results (default 5)", default: 5 },
      },
      required: ["leadId"],
    },
  },
];

async function handleTool(name: string, args: any, clientIp = "stdio") {
  try {
    let result: any;
    switch (name) {
      case "search_leads": {
        const query = validateQuery(args.query);
        const limit = validateLimit(args.limit);
        const data = await crmApi(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`);
        const leads = (data.results || []).filter((r: any) => r.type === "lead");
        result = { leads: leads.map((l: any) => ({ id: l.id, title: l.title, subtitle: l.subtitle, path: l.path })) };
        break;
      }
      case "get_lead": {
        const leadId = validateLeadId(args.leadId);
        result = await crmApi(`/api/v1/leads/${leadId}`);
        break;
      }
      case "update_lead_notes": {
        const leadId = validateLeadId(args.leadId);
        const note = validateNote(args.note);
        const lead = await crmApi(`/api/v1/leads/${leadId}`);
        const existing = lead.notes || "";
        const updated = existing ? `${existing}\n\n[AI ${new Date().toISOString()}]\n${note}` : `[AI ${new Date().toISOString()}]\n${note}`;
        await crmApi(`/api/v1/leads/${leadId}`, { method: "PATCH", body: { notes: updated } });
        result = { ok: true, leadId };
        break;
      }
      case "search_contacts": {
        const query = validateQuery(args.query);
        const limit = validateLimit(args.limit);
        const data = await crmApi(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`);
        const contacts = (data.results || []).filter((r: any) => r.type === "contact" || r.type === "buyer");
        result = { contacts: contacts.map((c: any) => ({ id: c.id, title: c.title, subtitle: c.subtitle })) };
        break;
      }
      case "create_task": {
        const leadId = validateLeadId(args.leadId);
        const title = validateQuery(args.title);
        if (title.length > 200) throw new Error("title too long (max 200 chars)");
        const description = String(args.description || "").slice(0, 2000);
        const priority = validatePriority(args.priority);
        const task = await crmApi("/api/tasks", {
          method: "POST",
          body: {
            title,
            description,
            type: "follow_up",
            relatedEntityType: "lead",
            relatedEntityId: leadId,
            priority,
            status: "open",
          },
        });
        result = { ok: true, taskId: task.id };
        break;
      }
      case "get_lead_calls": {
        const leadId = validateLeadId(args.leadId);
        const limit = validateLimit(args.limit, 5);
        result = await crmApi(`/api/v1/leads/${leadId}/calls?limit=${limit}`);
        break;
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    auditLog(name, args, clientIp, true);
    return result;
  } catch (e: any) {
    auditLog(name, args, clientIp, false, e.message);
    throw e;
  }
}

function createServer(clientIp = "stdio") {
  const server = new Server(
    { name: "oceanluxe-crm", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const result = await handleTool(request.params.name, request.params.arguments || {}, clientIp);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
    }
  });

  return server;
}

// ── stdio transport (default) ──
async function runStdio() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("OceanLuxe CRM MCP server running (stdio)");
}

// ── SSE transport (for Telnyx, web clients) ──
async function runSse(port: number) {
  const app = express();
  // sessionId -> transport
  const transports = new Map<string, SSEServerTransport>();
  // sessionId -> client IP (for audit logging)
  const sessionIps = new Map<string, string>();

  if (!MCP_AUTH_TOKEN) {
    console.error("WARNING: MCP_AUTH_TOKEN not set — SSE endpoints will reject all connections. Set it in Render.");
  }

  // Auth + rate limit middleware for SSE endpoints
  function guard(req: any, res: any, next: any) {
    const ip = String(req.ip || req.socket?.remoteAddress || "unknown");
    if (!checkRateLimit(ip)) {
      res.status(429).send("Rate limit exceeded");
      return;
    }
    if (MCP_AUTH_TOKEN) {
      const token = String(req.query.token || req.headers["x-mcp-token"] || "");
      if (token !== MCP_AUTH_TOKEN) {
        console.error(JSON.stringify({ ts: new Date().toISOString(), type: "mcp_auth_rejected", ip }));
        res.status(401).send("Unauthorized");
        return;
      }
    } else {
      res.status(503).send("MCP auth not configured");
      return;
    }
    next();
  }

  app.get("/sse", guard, async (req, res) => {
    const ip = String(req.ip || req.socket?.remoteAddress || "unknown");
    const transport = new SSEServerTransport("/messages", res);
    transports.set(transport.sessionId, transport);
    sessionIps.set(transport.sessionId, ip);
    res.on("close", () => {
      transports.delete(transport.sessionId);
      sessionIps.delete(transport.sessionId);
    });
    const server = createServer(ip);
    await server.connect(transport);
    console.error(JSON.stringify({ ts: new Date().toISOString(), type: "mcp_sse_connected", ip, session: transport.sessionId.slice(0, 8) }));
  });

  // NOTE: no express.json() here — handlePostMessage reads the raw body itself
  app.post("/messages", guard, async (req, res) => {
    const sessionId = String(req.query.sessionId || "");
    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(400).send("No transport found for sessionId");
      return;
    }
    // Wrap handleTool calls with client IP for audit logging
    const origHandler = (transport as any)._server?._requestHandlers;
    await transport.handlePostMessage(req, res);
  });

  app.get("/health", (_req, res) => res.json({ ok: true, tools: TOOLS.length, auth: !!MCP_AUTH_TOKEN }));

  app.listen(port, () => {
    console.error(`OceanLuxe CRM MCP server running (SSE on :${port})`);
  });
}

const port = process.env.PORT ? Number(process.env.PORT) : 0;
if (port > 0) {
  runSse(port).catch((e) => { console.error(e); process.exit(1); });
} else {
  runStdio().catch((e) => { console.error(e); process.exit(1); });
}
