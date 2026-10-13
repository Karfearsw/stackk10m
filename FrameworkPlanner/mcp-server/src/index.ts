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

if (!CRM_API_KEY) {
  console.error("CRM_API_KEY required");
  process.exit(1);
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

async function handleTool(name: string, args: any) {
  switch (name) {
    case "search_leads": {
      const data = await crmApi(`/api/search?q=${encodeURIComponent(args.query)}&limit=${args.limit || 10}`);
      const leads = (data.results || []).filter((r: any) => r.type === "lead");
      return { leads: leads.map((l: any) => ({ id: l.id, title: l.title, subtitle: l.subtitle, path: l.path })) };
    }
    case "get_lead": {
      const lead = await crmApi(`/api/v1/leads/${args.leadId}`);
      return lead;
    }
    case "update_lead_notes": {
      const lead = await crmApi(`/api/v1/leads/${args.leadId}`);
      const existing = lead.notes || "";
      const updated = existing ? `${existing}\n\n[AI ${new Date().toISOString()}]\n${args.note}` : `[AI ${new Date().toISOString()}]\n${args.note}`;
      await crmApi(`/api/v1/leads/${args.leadId}`, { method: "PATCH", body: { notes: updated } });
      return { ok: true, leadId: args.leadId };
    }
    case "search_contacts": {
      const data = await crmApi(`/api/search?q=${encodeURIComponent(args.query)}&limit=${args.limit || 10}`);
      const contacts = (data.results || []).filter((r: any) => r.type === "contact" || r.type === "buyer");
      return { contacts: contacts.map((c: any) => ({ id: c.id, title: c.title, subtitle: c.subtitle })) };
    }
    case "create_task": {
      const task = await crmApi("/api/tasks", {
        method: "POST",
        body: {
          title: args.title,
          description: args.description || "",
          type: "follow_up",
          relatedEntityType: "lead",
          relatedEntityId: args.leadId,
          priority: args.priority || "medium",
          status: "open",
        },
      });
      return { ok: true, taskId: task.id };
    }
    case "get_lead_calls": {
      const data = await crmApi(`/api/v1/leads/${args.leadId}/calls?limit=${args.limit || 5}`);
      return data;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function createServer() {
  const server = new Server(
    { name: "oceanluxe-crm", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const result = await handleTool(request.params.name, request.params.arguments || {});
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

  app.get("/sse", async (_req, res) => {
    const transport = new SSEServerTransport("/messages", res);
    transports.set(transport.sessionId, transport);
    res.on("close", () => {
      transports.delete(transport.sessionId);
    });
    const server = createServer();
    await server.connect(transport);
  });

  // NOTE: no express.json() here — handlePostMessage reads the raw body itself
  app.post("/messages", async (req, res) => {
    const sessionId = String(req.query.sessionId || "");
    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(400).send("No transport found for sessionId");
      return;
    }
    await transport.handlePostMessage(req, res);
  });

  app.get("/health", (_req, res) => res.json({ ok: true, tools: TOOLS.length }));

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
