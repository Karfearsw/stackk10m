/**
 * Phase 2: n8n automation bridge.
 *
 * INBOUND (n8n → CRM): API-key authenticated (/api/v1/*) using Bearer lxrm_...
 *   POST /api/v1/signals        — create distress signal from scraper
 *   POST /api/v1/signals/bulk  — bulk create (max 500)
 *   GET  /api/v1/health        — health check
 *
 * OUTBOUND (CRM → n8n): session-authenticated management + event fan-out.
 *   GET/POST /api/automation/webhooks
 *   PATCH/DELETE /api/automation/webhooks/:id
 *   POST /api/automation/webhooks/:id/test
 *   GET  /api/automation/deliveries
 *
 * Events: signal.created, parcel.high_score, lead.created, lead.status_changed
 *
 * Mounted from server/app.ts and server/index-vercel.ts via registerAutomationRoutes().
 */

import type { Express, Request, Response } from "express";
import { createHmac } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db.js";
import { storage } from "../storage.js";
import {
  automationWebhooks,
  webhookDeliveries,
  distressSignals,
  parcelWatchlist,
  parcelKeyFor,
  SIGNAL_TYPES,
  SIGNAL_SEVERITIES,
  AUTOMATION_EVENTS,
} from "../shared-schema.js";
import { validateApiKey } from "../services/api-keys.js";

async function requireSession(req: Request, res: Response) {
  const userId = (req as any).session?.userId;
  if (!userId) { res.status(401).json({ message: "Unauthorized" }); return null; }
  const user = await storage.getUserByIdWithoutProfilePicture(userId);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return null; }
  return user;
}

/** API-key auth for /api/v1/* — returns { userId, keyId, scopes } or sends 401. */
async function requireApiKey(req: Request, res: Response) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const auth = await validateApiKey(token);
  if (!auth) { res.status(401).json({ message: "Invalid or missing API key" }); return null; }
  return auth;
}

const VALID_TYPES = new Set<string>(SIGNAL_TYPES as unknown as string[]);
const VALID_SEVERITIES = new Set<string>(SIGNAL_SEVERITIES as unknown as string[]);
const VALID_EVENTS = new Set<string>(AUTOMATION_EVENTS as unknown as string[]);

// ── Outbound event fan-out ────────────────────────────────────────────────
// Fire-and-forget: records a delivery row per subscribed webhook and attempts
// delivery async. Failures are logged for retry inspection.

export async function emitAutomationEvent(event: string, payload: Record<string, any>) {
  if (!VALID_EVENTS.has(event)) return;
  try {
    const hooks = await db.select().from(automationWebhooks)
      .where(and(eq(automationWebhooks.active, true)));
    const targets = hooks.filter((h: any) => (h.events || []).includes(event) || (h.events || []).includes("*"));
    for (const hook of targets as any[]) {
      const [delivery] = await db.insert(webhookDeliveries).values({
        webhookId: hook.id, event, payload, status: "pending", attempts: 0,
      }).returning();
      deliverWebhook(hook, delivery).catch(() => {});
    }
  } catch (e) {
    console.error("[automation] emit failed:", e);
  }
}

async function deliverWebhook(hook: any, delivery: any) {
  const body = JSON.stringify({
    event: delivery.event,
    delivered_at: new Date().toISOString(),
    data: delivery.payload,
  });
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Luxe-Event": delivery.event };
  if (hook.secret) {
    headers["X-Luxe-Signature"] = "sha256=" + createHmac("sha256", hook.secret).update(body).digest("hex");
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(hook.url, { method: "POST", headers, body, signal: ctrl.signal });
    clearTimeout(timer);
    const text = await res.text().catch(() => "");
    await db.update(webhookDeliveries).set({
      status: res.ok ? "delivered" : "failed",
      httpStatus: res.status,
      responseBody: text.slice(0, 2000),
      attempts: (delivery.attempts || 0) + 1,
    }).where(eq(webhookDeliveries.id, delivery.id));
  } catch (e: any) {
    await db.update(webhookDeliveries).set({
      status: "failed",
      responseBody: (e.message || "network error").slice(0, 2000),
      attempts: (delivery.attempts || 0) + 1,
    }).where(eq(webhookDeliveries.id, delivery.id));
  }
}

// Distress-score weights (must match /api/parcels/timeline)
const SCORE_WEIGHTS: Record<string, number> = { critical: 4, alert: 3, watch: 2, info: 1 };
export const HIGH_SCORE_THRESHOLD = 8;

/** Called after a signal is created — emits signal.created and parcel.high_score. */
export async function onSignalCreated(signal: any) {
  emitAutomationEvent("signal.created", {
    id: signal.id,
    parcelKey: signal.parcelKey,
    signalType: signal.signalType,
    severity: signal.severity,
    title: signal.title,
    source: signal.source,
  }).catch(() => {});
  // Check parcel score for high-score alert
  try {
    const signals = await db.select().from(distressSignals)
      .where(eq(distressSignals.parcelKey, signal.parcelKey));
    const score = signals.reduce((s: number, x: any) => s + (SCORE_WEIGHTS[x.severity] || 1), 0);
    if (score >= HIGH_SCORE_THRESHOLD) {
      const [parcel] = await db.select().from(parcelWatchlist)
        .where(eq(parcelWatchlist.parcelKey, signal.parcelKey)).limit(1);
      emitAutomationEvent("parcel.high_score", {
        parcelKey: signal.parcelKey,
        score,
        signalCount: signals.length,
        address: parcel?.address, city: parcel?.city, state: parcel?.state,
        latestSignal: { id: signal.id, title: signal.title, severity: signal.severity },
      }).catch(() => {});
    }
  } catch (e) { console.error("[automation] high-score check failed:", e); }
}

export function registerAutomationRoutes(app: Express) {
  // ── Inbound v1 API (API-key auth) ───────────────────────────────────────
  app.get("/api/v1/health", async (_req: Request, res: Response) => {
    res.json({ ok: true, service: "luxe-crm", version: "1.0.0", time: new Date().toISOString() });
  });

  app.post("/api/v1/signals", async (req: Request, res: Response) => {
    const auth = await requireApiKey(req, res);
    if (!auth) return;
    try {
      const b = req.body || {};
      if (!VALID_TYPES.has(b.signalType)) return res.status(400).json({ message: "Invalid signalType" });
      if (!b.title || !b.source) return res.status(400).json({ message: "title and source required" });
      let parcelKey = (b.parcelKey || "").trim();
      if (!parcelKey && b.address && b.city && b.state && b.zipCode)
        parcelKey = parcelKeyFor(b.address, b.city, b.state, b.zipCode);
      if (!parcelKey) return res.status(400).json({ message: "parcelKey or address/city/state/zipCode required" });

      const [row] = await db.insert(distressSignals).values({
        parcelKey,
        signalType: b.signalType,
        severity: VALID_SEVERITIES.has(b.severity) ? b.severity : "info",
        title: String(b.title).slice(0, 255),
        description: b.description || null,
        source: String(b.source).slice(0, 100),
        sourceUrl: b.sourceUrl || null,
        occurredAt: b.occurredAt || null,
        rawData: b.rawData || { via: "api-v1", keyId: auth.keyId },
        createdBy: auth.userId,
      }).returning();
      onSignalCreated(row).catch(() => {});
      res.status(201).json(row);
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed" });
    }
  });

  app.post("/api/v1/signals/bulk", async (req: Request, res: Response) => {
    const auth = await requireApiKey(req, res);
    if (!auth) return;
    try {
      const rows: any[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
      if (!rows.length) return res.status(400).json({ message: "No rows" });
      if (rows.length > 500) return res.status(400).json({ message: "Max 500 rows" });
      let created = 0;
      const errors: any[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i] || {};
        try {
          if (!VALID_TYPES.has(r.signalType)) throw new Error("invalid signalType");
          if (!r.title || !r.source) throw new Error("title/source required");
          let parcelKey = (r.parcelKey || "").trim();
          if (!parcelKey && r.address) parcelKey = parcelKeyFor(r.address, r.city, r.state, r.zipCode);
          if (!parcelKey) throw new Error("parcelKey or address required");
          const [row] = await db.insert(distressSignals).values({
            parcelKey,
            signalType: r.signalType,
            severity: VALID_SEVERITIES.has(r.severity) ? r.severity : "info",
            title: String(r.title).slice(0, 255),
            description: r.description || null,
            source: String(r.source).slice(0, 100),
            sourceUrl: r.sourceUrl || null,
            occurredAt: r.occurredAt || null,
            rawData: r.rawData || { via: "api-v1-bulk", keyId: auth.keyId },
            createdBy: auth.userId,
          }).returning();
          onSignalCreated(row).catch(() => {});
          created++;
        } catch (e: any) { errors.push({ row: i + 1, error: e.message }); }
      }
      res.json({ created, total: rows.length, errors: errors.slice(0, 20) });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed" });
    }
  });

  // ── Outbound webhook management (session auth) ──────────────────────────
  app.get("/api/automation/webhooks", async (req: Request, res: Response) => {
    const user = await requireSession(req, res);
    if (!user) return;
    const rows = await db.select().from(automationWebhooks).orderBy(desc(automationWebhooks.createdAt));
    // Don't leak secrets in list
    res.json({ webhooks: rows.map((r: any) => ({ ...r, secret: r.secret ? "••••••••" : null })) });
  });

  app.post("/api/automation/webhooks", async (req: Request, res: Response) => {
    const user = await requireSession(req, res);
    if (!user) return;
    try {
      const b = req.body || {};
      if (!b.name || !b.url) return res.status(400).json({ message: "name and url required" });
      try { new URL(b.url); } catch { return res.status(400).json({ message: "Invalid URL" }); }
      const events = Array.isArray(b.events) ? b.events.filter((e: string) => VALID_EVENTS.has(e)) : [];
      const [row] = await db.insert(automationWebhooks).values({
        name: String(b.name).slice(0, 255),
        url: b.url,
        events,
        secret: b.secret || null,
        active: b.active !== false,
        createdBy: user.id,
      }).returning();
      res.status(201).json({ ...row, secret: row.secret ? "••••••••" : null });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed" });
    }
  });

  app.patch("/api/automation/webhooks/:id", async (req: Request, res: Response) => {
    const user = await requireSession(req, res);
    if (!user) return;
    try {
      const id = Number(req.params.id);
      const b = req.body || {};
      const patch: any = { updatedAt: new Date() };
      if (b.name) patch.name = String(b.name).slice(0, 255);
      if (b.url) { try { new URL(b.url); } catch { return res.status(400).json({ message: "Invalid URL" }); } patch.url = b.url; }
      if (Array.isArray(b.events)) patch.events = b.events.filter((e: string) => VALID_EVENTS.has(e));
      if (typeof b.active === "boolean") patch.active = b.active;
      if (b.secret) patch.secret = b.secret;
      const [row] = await db.update(automationWebhooks).set(patch).where(eq(automationWebhooks.id, id)).returning();
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json({ ...row, secret: row.secret ? "••••••••" : null });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed" });
    }
  });

  app.delete("/api/automation/webhooks/:id", async (req: Request, res: Response) => {
    const user = await requireSession(req, res);
    if (!user) return;
    await db.delete(automationWebhooks).where(eq(automationWebhooks.id, Number(req.params.id)));
    res.json({ ok: true });
  });

  app.post("/api/automation/webhooks/:id/test", async (req: Request, res: Response) => {
    const user = await requireSession(req, res);
    if (!user) return;
    try {
      const [hook] = await db.select().from(automationWebhooks).where(eq(automationWebhooks.id, Number(req.params.id))).limit(1);
      if (!hook) return res.status(404).json({ message: "Not found" });
      const [delivery] = await db.insert(webhookDeliveries).values({
        webhookId: hook.id, event: "test", payload: { test: true, at: new Date().toISOString() }, status: "pending", attempts: 0,
      }).returning();
      await deliverWebhook(hook, delivery);
      const [updated] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, delivery.id)).limit(1);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed" });
    }
  });

  app.get("/api/automation/deliveries", async (req: Request, res: Response) => {
    const user = await requireSession(req, res);
    if (!user) return;
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const rows = await db.select().from(webhookDeliveries).orderBy(desc(webhookDeliveries.createdAt)).limit(limit);
      res.json({ deliveries: rows });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed" });
    }
  });

  app.get("/api/automation/events", async (req: Request, res: Response) => {
    const user = await requireSession(req, res);
    if (!user) return;
    res.json({ events: AUTOMATION_EVENTS });
  });
}
