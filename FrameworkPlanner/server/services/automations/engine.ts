import crypto from "node:crypto";
import { storage } from "../../storage.js";
import { createTask } from "../tasks/task-service.js";
import { sendResendEmail } from "../messaging/resend.js";
import { sendSignalWireSms } from "../messaging/signalwire.js";

type AutomationEvent = {
  eventType: string;
  occurredAt: string;
  teamId: number;
  actorUserId: number | null;
  entity: { type: string; id: number | null };
  payload: unknown;
};

function getByPath(root: any, path: string): any {
  const parts = String(path || "")
    .split(".")
    .map((p) => p.trim())
    .filter(Boolean);
  let cur: any = root;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function evalRule(event: AutomationEvent, rule: any): boolean {
  const path = String(rule?.path || rule?.field || "").trim();
  const operator = String(rule?.operator || rule?.op || "eq").trim().toLowerCase();
  const expected = rule?.value;
  const actual = path ? getByPath({ event }, path.startsWith("event.") ? path.slice("event.".length) : `event.${path}`) : undefined;

  if (operator === "exists") return typeof actual !== "undefined" && actual !== null;
  if (operator === "eq") return JSON.stringify(actual ?? null) === JSON.stringify(expected ?? null);
  if (operator === "neq") return JSON.stringify(actual ?? null) !== JSON.stringify(expected ?? null);
  if (operator === "contains") return String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
  if (operator === "in") return Array.isArray(expected) && expected.some((v) => JSON.stringify(v) === JSON.stringify(actual));
  if (operator === "includes") return Array.isArray(actual) && actual.some((v) => JSON.stringify(v) === JSON.stringify(expected));
  return false;
}

function evalCondition(event: AutomationEvent, configJson: string | null | undefined): boolean {
  const raw = String(configJson || "").trim();
  if (!raw || raw === "{}") return true;
  let cfg: any;
  try {
    cfg = JSON.parse(raw);
  } catch {
    return false;
  }

  if (Array.isArray(cfg?.rules)) {
    const op = String(cfg?.op || "and").toLowerCase();
    const results = cfg.rules.map((r: any) => evalRule(event, r));
    return op === "or" ? results.some(Boolean) : results.every(Boolean);
  }

  if (cfg && typeof cfg === "object" && (cfg.path || cfg.field)) {
    return evalRule(event, cfg);
  }

  return true;
}

function hmacSha256Hex(secret: string, rawBody: string) {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

async function postWebhook(input: { url: string; secret: string; body: any; timeoutMs: number; retries: number }) {
  const deliveryId = crypto.randomUUID();
  const rawBody = JSON.stringify(input.body);
  const sig = hmacSha256Hex(input.secret, rawBody);

  for (let attempt = 0; attempt <= input.retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const res = await fetch(input.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-luxe-event-type": String(input.body?.eventType || ""),
          "x-luxe-signature": `sha256=${sig}`,
          "x-luxe-delivery-id": deliveryId,
        },
        body: rawBody,
        signal: controller.signal,
      });
      clearTimeout(t);
      if (res.ok) return { ok: true, deliveryId, status: res.status };
      const txt = await res.text().catch(() => "");
      if (attempt >= input.retries) return { ok: false, deliveryId, status: res.status, error: txt || `Webhook failed: ${res.status}` };
    } catch (e: any) {
      clearTimeout(t);
      if (attempt >= input.retries) return { ok: false, deliveryId, status: 0, error: String(e?.message || e) };
    }
  }
  return { ok: false, deliveryId, status: 0, error: "Webhook failed" };
}

async function resolveTargetUserId(event: AutomationEvent, cfg: any): Promise<number | null> {
  const raw = cfg?.toUserId ?? cfg?.assignedToUserId ?? cfg?.userId ?? cfg?.assignTo;
  if (raw === "actor") return event.actorUserId;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (s === "actor") return event.actorUserId;
  }
  return event.actorUserId;
}

async function executeAction(event: AutomationEvent, automationName: string, action: any) {
  const actionType = String(action?.actionType || "").trim();
  const rawCfg = String(action?.configJson || "{}");
  let cfg: any = {};
  try {
    cfg = JSON.parse(rawCfg);
  } catch {}

  if (actionType === "task.create") {
    const title = String(cfg.title || `Automation: ${automationName}`).trim();
    const description = typeof cfg.description === "string" ? cfg.description : null;
    const priority = typeof cfg.priority === "string" ? cfg.priority : "medium";
    const type = typeof cfg.type === "string" ? cfg.type : "general";
    const dueInMinutes = typeof cfg.dueInMinutes === "number" && Number.isFinite(cfg.dueInMinutes) ? cfg.dueInMinutes : null;
    const assignedToUserId = await resolveTargetUserId(event, cfg);
    const dueAt = dueInMinutes !== null ? new Date(Date.now() + dueInMinutes * 60 * 1000) : null;

    const task = await createTask({
      title,
      description,
      type,
      priority,
      dueAt,
      relatedEntityType: event.entity?.type || null,
      relatedEntityId: typeof event.entity?.id === "number" ? event.entity.id : null,
      assignedToUserId: assignedToUserId,
      createdBy: typeof event.actorUserId === "number" ? event.actorUserId : 0,
    } as any);
    return { ok: true, kind: "task", taskId: task.id };
  }

  if (actionType === "notification.create") {
    const toUserId = await resolveTargetUserId(event, cfg);
    if (!toUserId) return { ok: false, kind: "notification", error: "Missing target user" };
    const title = String(cfg.title || `Automation: ${automationName}`).trim();
    const description = typeof cfg.description === "string" ? cfg.description : null;
    const relatedType = event.entity?.type ? String(event.entity.type) : null;
    const relatedId = typeof event.entity?.id === "number" ? event.entity.id : null;

    const notif = await storage.createUserNotification({
      userId: toUserId,
      type: typeof cfg.type === "string" ? cfg.type : "system",
      title,
      description,
      relatedType,
      relatedId,
    } as any);

    const delivery: any = { inApp: { ok: true, notificationId: notif.id }, email: null, sms: null };

    if (cfg.email === true) {
      try {
        const u = await storage.getUserById(toUserId);
        const email = String((u as any)?.email || "").trim();
        if (email) {
          const sent = await sendResendEmail({ to: email, subject: title, text: description || "" });
          delivery.email = { ok: true, id: sent.id };
        } else {
          delivery.email = { ok: false, skipped: true, error: "Missing email" };
        }
      } catch (e: any) {
        delivery.email = { ok: false, skipped: true, error: String(e?.message || e) };
      }
    }

    if (cfg.sms === true) {
      try {
        const u = await storage.getUserById(toUserId);
        const phone = String((u as any)?.phone || "").trim();
        if (phone) {
          const sent = await sendSignalWireSms({ to: phone, body: [title, description].filter(Boolean).join("\n") });
          delivery.sms = { ok: true, sid: sent.messageSid };
        } else {
          delivery.sms = { ok: false, skipped: true, error: "Missing phone" };
        }
      } catch (e: any) {
        delivery.sms = { ok: false, skipped: true, error: String(e?.message || e) };
      }
    }

    return { ok: true, kind: "notification", notificationId: notif.id, delivery };
  }

  if (actionType === "webhook.post") {
    const url = String(cfg.url || "").trim();
    const secret = String(cfg.secret || "").trim();
    if (!url || !/^https:\/\//i.test(url)) return { ok: false, kind: "webhook", error: "Invalid url" };
    if (!secret) return { ok: false, kind: "webhook", error: "Missing secret" };
    const timeoutMs = typeof cfg.timeoutMs === "number" && Number.isFinite(cfg.timeoutMs) ? cfg.timeoutMs : 5000;
    const retries = typeof cfg.retries === "number" && Number.isFinite(cfg.retries) ? cfg.retries : 2;

    const body = {
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      teamId: event.teamId,
      actorUserId: event.actorUserId,
      entity: event.entity,
      payload: event.payload,
    };

    const out = await postWebhook({ url, secret, body, timeoutMs, retries });
    return { ok: out.ok, kind: "webhook", deliveryId: out.deliveryId, status: out.status, error: out.ok ? null : out.error };
  }

  return { ok: false, kind: "unknown", error: `Unknown actionType: ${actionType}` };
}

export async function dispatchAutomationEvent(input: Omit<AutomationEvent, "occurredAt"> & { occurredAt?: string }) {
  const event: AutomationEvent = {
    ...input,
    occurredAt: input.occurredAt || new Date().toISOString(),
  };

  const bundles = await storage.getEnabledAutomationsForEvent(event.teamId, event.eventType);

  for (const b of bundles) {
    const automation = b.automation;
    const conditionJson = b.condition ? String((b.condition as any).configJson || "") : "";
    const run = await storage.createAutomationRun({
      teamId: event.teamId,
      automationId: (automation as any).id,
      eventType: event.eventType,
      eventJson: JSON.stringify(event),
      status: "running",
      error: null,
      deliveryId: null,
      finishedAt: null,
    } as any);

    try {
      const ok = evalCondition(event, conditionJson);
      if (!ok) {
        await storage.updateAutomationRun(run.id, { status: "skipped", finishedAt: new Date() } as any);
        continue;
      }

      const results: any[] = [];
      let deliveryId: string | null = null;
      for (const a of b.actions || []) {
        const r = await executeAction(event, String((automation as any).name || "Automation"), a);
        results.push(r);
        if (r?.kind === "webhook" && r?.deliveryId && !deliveryId) deliveryId = String(r.deliveryId);
        if (!r?.ok) throw new Error(String(r?.error || "Automation action failed"));
      }

      await storage.updateAutomationRun(run.id, {
        status: "success",
        error: null,
        deliveryId,
        finishedAt: new Date(),
      } as any);
    } catch (e: any) {
      await storage.updateAutomationRun(run.id, { status: "error", error: String(e?.message || e), finishedAt: new Date() } as any);
    }
  }
}

