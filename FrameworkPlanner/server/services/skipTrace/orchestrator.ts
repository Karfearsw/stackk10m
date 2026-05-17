import { storage } from "../../storage.js";
import type { Lead, Property, SkipTraceJob, SkipTraceResult, LeadScoreSnapshot } from "../../shared-schema.js";
import { getSkipTraceProvider } from "./provider.js";
import { computeLeadScore } from "../leadScoring/engine.js";
import { getPublicResearchRunner, type PublicResearchRunner } from "./publicResearch/runner.js";

export type SkipTraceEntityType = "lead" | "opportunity";
export type SkipTraceMode = "provider" | "public_research" | "both";

type HttpErrorInput = { statusCode: number; message: string };

class HttpError extends Error {
  statusCode: number;
  constructor(input: HttpErrorInput) {
    super(input.message);
    this.statusCode = input.statusCode;
  }
}

function skipTraceCacheKey(input: { ownerName: string; address: string; city: string; state: string; zipCode: string }) {
  return `${input.ownerName}|${input.address}|${input.city}|${input.state}|${input.zipCode}`.trim().toLowerCase();
}

function toFiniteInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function clamp(n: number, min: number, max: number) {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function confidenceBucket(v: number) {
  if (v >= 0.75) return "high";
  if (v >= 0.45) return "medium";
  return "low";
}

function urgencyTier(score: number) {
  if (score >= 75) return "hot";
  if (score >= 45) return "warm";
  return "cold";
}

function summarizeReasons(reasons: Array<{ label: string; points: number }>) {
  const parts = reasons.slice(0, 4).map((r) => `${r.label} (+${r.points})`);
  const s = parts.join("; ");
  return s.length > 400 ? s.slice(0, 397) + "..." : s;
}

function safeParseJsonArrayCount(v: unknown): number {
  try {
    const parsed = JSON.parse(String(v || "[]"));
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

async function addJobEvent(jobId: number, status: string, message: string | null, metadataJson: Record<string, unknown> = {}) {
  await storage.createSkipTraceJobEvent({
    jobId,
    status,
    message,
    metadataJson,
  } as any);
}

async function loadEntity(input: { entityType: SkipTraceEntityType; entityId: number }) {
  if (input.entityType === "lead") {
    const lead = await storage.getLeadById(input.entityId);
    if (!lead) throw new HttpError({ statusCode: 404, message: "Lead not found" });
    return { lead, property: null as Property | null, sourceLead: null as Lead | null };
  }

  const property = await storage.getPropertyById(input.entityId);
  if (!property) throw new HttpError({ statusCode: 404, message: "Opportunity not found" });
  let sourceLead: Lead | null = null;
  const sourceLeadId = (property as any).sourceLeadId ? Number((property as any).sourceLeadId) : null;
  if (sourceLeadId) {
    try {
      sourceLead = (await storage.getLeadById(sourceLeadId)) ?? null;
    } catch {
      sourceLead = null;
    }
  }
  return { lead: null as Lead | null, property, sourceLead };
}

function requireProviderInput(input: {
  entityType: SkipTraceEntityType;
  lead: Lead | null;
  property: Property | null;
  sourceLead: Lead | null;
  ownerNameOverride?: string | null;
}) {
  if (input.entityType === "lead") {
    const lead = input.lead as any;
    const ownerName = String(lead?.ownerName || "").trim();
    const address = String(lead?.address || "").trim();
    const city = String(lead?.city || "").trim();
    const state = String(lead?.state || "").trim();
    const zipCode = String(lead?.zipCode || "").trim();
    if (!ownerName || !address || !city || !state || !zipCode) throw new HttpError({ statusCode: 400, message: "Lead is missing required fields" });
    return { ownerName, address, city, state, zipCode };
  }

  const property = input.property as any;
  const ownerName = String((input.sourceLead as any)?.ownerName ?? input.ownerNameOverride ?? "").trim();
  const address = String(property?.address || "").trim();
  const city = String(property?.city || "").trim();
  const state = String(property?.state || "").trim();
  const zipCode = String(property?.zipCode || "").trim();
  if (!ownerName || !address || !city || !state || !zipCode) throw new HttpError({ statusCode: 400, message: "Opportunity is missing required fields" });
  return { ownerName, address, city, state, zipCode };
}

export async function createSkipTraceJob(input: {
  entityType: SkipTraceEntityType;
  entityId: number;
  mode: SkipTraceMode;
  requestedByUserId: number;
  idempotencyKey?: string | null;
}): Promise<SkipTraceJob> {
  const job = await storage.createSkipTraceJob({
    entityType: input.entityType,
    entityId: input.entityId,
    requestedByUserId: input.requestedByUserId,
    mode: input.mode,
    status: "queued",
    idempotencyKey: input.idempotencyKey ?? null,
  } as any);
  await addJobEvent(job.id, "queued", null, { mode: input.mode });
  return job;
}

async function persistLeadScoreSnapshot(input: {
  job: SkipTraceJob;
  entityType: SkipTraceEntityType;
  entityId: number;
  lead: Lead | null;
  sourceLead: Lead | null;
  providerResult: SkipTraceResult | null;
}) {
  const lead = input.entityType === "lead" ? input.lead : input.sourceLead;
  const leadAny: any = lead as any;
  const tags = Array.isArray(leadAny?.tags) ? leadAny.tags.filter(Boolean) : [];
  const hasPhone =
    Boolean(String(leadAny?.ownerPhone || "").trim()) ||
    (input.providerResult ? safeParseJsonArrayCount((input.providerResult as any).phonesJson) > 0 : false);
  const hasEmail =
    Boolean(String(leadAny?.ownerEmail || "").trim()) ||
    (input.providerResult ? safeParseJsonArrayCount((input.providerResult as any).emailsJson) > 0 : false);
  const motivationScore = toFiniteInt(leadAny?.relasScore);
  const nextTouchAt = leadAny?.nextTouchAt ?? null;

  const r = computeLeadScore(
    {
      motivationScore,
      tags,
      hasPhone,
      hasEmail,
      nextTouchAt,
    },
    {},
  );

  const scoreTotal = clamp(Math.round(r.score), 0, 100);
  const snapshot = await storage.createLeadScoreSnapshot({
    entityType: input.entityType,
    entityId: input.entityId,
    jobId: input.job.id,
    scoreTotal,
    confidence: confidenceBucket(r.confidence),
    urgencyTier: urgencyTier(scoreTotal),
    reasonSummary: summarizeReasons(r.reasons),
    factorsJson: r.factorsJson,
  } as any);

  return snapshot;
}

async function runProviderStep(input: {
  job: SkipTraceJob;
  entityType: SkipTraceEntityType;
  entityId: number;
  requestedByUserId: number;
  ownerNameOverride?: string | null;
}) {
  const entity = await loadEntity({ entityType: input.entityType, entityId: input.entityId });
  const providerInput = requireProviderInput({ entityType: input.entityType, ...entity, ownerNameOverride: input.ownerNameOverride });

  const cacheKey = skipTraceCacheKey(providerInput);
  const existing = await storage.getLatestSkipTraceByCacheKey(cacheKey);

  const now = Date.now();
  const ms90d = 1000 * 60 * 60 * 24 * 90;
  const ms5m = 1000 * 60 * 5;

  if (existing && String((existing as any).status || "") === "success" && (existing as any).completedAt) {
    const completedAtMs = new Date((existing as any).completedAt).getTime();
    if (Number.isFinite(completedAtMs) && now - completedAtMs < ms90d) {
      const cached = await storage.createSkipTraceResult({
        jobId: input.job.id,
        leadId: input.entityType === "lead" ? input.entityId : (entity.sourceLead as any)?.id ?? null,
        propertyId: input.entityType === "opportunity" ? input.entityId : null,
        providerName: String((existing as any).providerName || "cached"),
        status: "success",
        phonesJson: String((existing as any).phonesJson || "[]"),
        emailsJson: String((existing as any).emailsJson || "[]"),
        costCents: 0,
        cacheKey,
        requestedAt: new Date(),
        completedAt: new Date(),
        rawResponseJson: JSON.stringify({ cachedFromId: (existing as any).id, raw: (existing as any).rawResponseJson ?? null }),
      } as any);

      await storage.updateSkipTraceJob(input.job.id, { providerName: cached.providerName } as any);
      await addJobEvent(input.job.id, "provider_cached", null, { skipTraceResultId: cached.id });
      await storage.createGlobalActivity({
        userId: input.requestedByUserId,
        action: "skip_trace_cached",
        description: `Skip trace cache hit: ${providerInput.address}`,
        metadata: JSON.stringify({ entityType: input.entityType, entityId: input.entityId, skipTraceId: cached.id }),
      } as any);
      return { providerResult: cached, cached: true, pending: false, lead: entity.lead, sourceLead: entity.sourceLead };
    }
  }

  if (existing && String((existing as any).status || "") === "pending" && (existing as any).requestedAt) {
    const requestedAtMs = new Date((existing as any).requestedAt).getTime();
    if (Number.isFinite(requestedAtMs) && now - requestedAtMs < ms5m && (existing as any).jobId) {
      await addJobEvent(input.job.id, "provider_pending", null, { existingJobId: (existing as any).jobId, skipTraceResultId: (existing as any).id });
      return { providerResult: existing, cached: false, pending: true, lead: entity.lead, sourceLead: entity.sourceLead };
    }
  }

  const provider = getSkipTraceProvider();
  await storage.updateSkipTraceJob(input.job.id, { providerName: provider.name } as any);

  const pendingRow = await storage.createSkipTraceResult({
    jobId: input.job.id,
    leadId: input.entityType === "lead" ? input.entityId : (entity.sourceLead as any)?.id ?? null,
    propertyId: input.entityType === "opportunity" ? input.entityId : null,
    providerName: provider.name,
    status: "pending",
    phonesJson: "[]",
    emailsJson: "[]",
    cacheKey,
    requestedAt: new Date(),
  } as any);

  await addJobEvent(input.job.id, "provider_requested", null, { skipTraceResultId: pendingRow.id, provider: provider.name });
  await storage.createGlobalActivity({
    userId: input.requestedByUserId,
    action: "skip_trace_requested",
    description: `Skip trace requested: ${providerInput.address}`,
    metadata: JSON.stringify({ entityType: input.entityType, entityId: input.entityId, skipTraceId: pendingRow.id, provider: provider.name }),
  } as any);

  let updated: SkipTraceResult = pendingRow as any;
  try {
    const out = await provider.skipTrace(providerInput);
    if (out.status === "success") {
      updated = (await storage.updateSkipTraceResult(pendingRow.id, {
        status: "success",
        phonesJson: JSON.stringify(out.phones || []),
        emailsJson: JSON.stringify(out.emails || []),
        costCents: out.costCents,
        completedAt: new Date(),
        rawResponseJson: JSON.stringify(out.raw ?? null),
      } as any)) as any;

      const leadToPatch = input.entityType === "lead" ? entity.lead : entity.sourceLead;
      const leadId = (leadToPatch as any)?.id ? Number((leadToPatch as any).id) : null;
      if (leadId) {
        const leadPatch: any = {};
        if (!String((leadToPatch as any).ownerPhone || "").trim() && out.phones?.[0]) leadPatch.ownerPhone = out.phones[0];
        if (!String((leadToPatch as any).ownerEmail || "").trim() && out.emails?.[0]) leadPatch.ownerEmail = out.emails[0];
        if (Object.keys(leadPatch).length) await storage.updateLead(leadId, leadPatch);
      }

      await addJobEvent(input.job.id, "provider_success", null, { skipTraceResultId: updated.id, phones: out.phones?.length || 0, emails: out.emails?.length || 0, costCents: out.costCents });
      await storage.createGlobalActivity({
        userId: input.requestedByUserId,
        action: "skip_trace_success",
        description: `Skip trace success: ${providerInput.address}`,
        metadata: JSON.stringify({ entityType: input.entityType, entityId: input.entityId, skipTraceId: updated.id, phones: out.phones?.length || 0, emails: out.emails?.length || 0, costCents: out.costCents }),
      } as any);
    } else {
      updated = (await storage.updateSkipTraceResult(pendingRow.id, {
        status: "fail",
        phonesJson: JSON.stringify(out.phones || []),
        emailsJson: JSON.stringify(out.emails || []),
        costCents: out.costCents,
        completedAt: new Date(),
        rawResponseJson: JSON.stringify(out.raw ?? null),
      } as any)) as any;
      await addJobEvent(input.job.id, "provider_fail", String((out as any).errorMessage || "failed") || null, { skipTraceResultId: updated.id, costCents: out.costCents });
      await storage.createGlobalActivity({
        userId: input.requestedByUserId,
        action: "skip_trace_failed",
        description: `Skip trace failed: ${providerInput.address}`,
        metadata: JSON.stringify({ entityType: input.entityType, entityId: input.entityId, skipTraceId: updated.id, error: (out as any).errorMessage || "failed", costCents: out.costCents }),
      } as any);
    }
  } catch (e: any) {
    updated = (await storage.updateSkipTraceResult(pendingRow.id, {
      status: "fail",
      completedAt: new Date(),
      rawResponseJson: JSON.stringify({ error: String(e?.message || e) }),
    } as any)) as any;
    await addJobEvent(input.job.id, "provider_fail", String(e?.message || e) || null, { skipTraceResultId: updated.id });
    await storage.createGlobalActivity({
      userId: input.requestedByUserId,
      action: "skip_trace_failed",
      description: `Skip trace failed: ${providerInput.address}`,
      metadata: JSON.stringify({ entityType: input.entityType, entityId: input.entityId, skipTraceId: updated.id, error: String(e?.message || e) }),
    } as any);
  }

  return { providerResult: updated, cached: false, pending: false, lead: entity.lead, sourceLead: entity.sourceLead };
}

async function runPublicResearchStep(input: {
  job: SkipTraceJob;
  entityType: SkipTraceEntityType;
  entityId: number;
  ownerNameOverride?: string | null;
  runner: PublicResearchRunner;
}) {
  const entity = await loadEntity({ entityType: input.entityType, entityId: input.entityId });
  const providerInput = requireProviderInput({ entityType: input.entityType, ...entity, ownerNameOverride: input.ownerNameOverride });

  const out = await input.runner.run({
    entityType: input.entityType,
    entityId: input.entityId,
    ownerName: providerInput.ownerName,
    address: providerInput.address,
    city: providerInput.city,
    state: providerInput.state,
    zipCode: providerInput.zipCode,
  });

  for (const ev of out.evidence || []) {
    await storage.createSkipTraceEvidence({
      jobId: input.job.id,
      entityType: input.entityType,
      entityId: input.entityId,
      sourceType: String(ev.sourceType || "other"),
      sourceUrl: ev.sourceUrl ? String(ev.sourceUrl) : null,
      extractedJson: ev.extracted ?? {},
      confidenceJson: ev.confidence ?? {},
      notes: ev.notes ? String(ev.notes) : null,
      screenshotRef: ev.screenshotRef ? String(ev.screenshotRef) : null,
    } as any);
  }

  await addJobEvent(input.job.id, `public_research_${out.status}`, out.message ? String(out.message) : null, { runner: input.runner.name, evidenceCount: (out.evidence || []).length });
  return out;
}

export async function runSkipTraceJob(jobId: number, input?: { ownerNameOverride?: string | null }): Promise<{ job: SkipTraceJob; scoreSnapshot: LeadScoreSnapshot | null }> {
  const job = await storage.getSkipTraceJobById(jobId);
  if (!job) throw new HttpError({ statusCode: 404, message: "Job not found" });

  if (job.status === "completed" || job.status === "failed") {
    const existing = (await storage.listLeadScoreSnapshotsByJobId(job.id))[0] ?? null;
    return { job, scoreSnapshot: existing };
  }

  if (job.status === "running") {
    const existing = (await storage.listLeadScoreSnapshotsByJobId(job.id))[0] ?? null;
    return { job, scoreSnapshot: existing };
  }

  if (job.status !== "queued") {
    const existing = (await storage.listLeadScoreSnapshotsByJobId(job.id))[0] ?? null;
    return { job, scoreSnapshot: existing };
  }

  const startedAt = new Date();
  const running = await storage.claimSkipTraceJobForRun(job.id, startedAt);
  if (!running) {
    const refreshed = await storage.getSkipTraceJobById(job.id);
    if (!refreshed) throw new HttpError({ statusCode: 404, message: "Job not found" });
    const existing = (await storage.listLeadScoreSnapshotsByJobId(refreshed.id))[0] ?? null;
    return { job: refreshed, scoreSnapshot: existing };
  }
  await addJobEvent(running.id, "running", null);

  let providerResult: SkipTraceResult | null = null;
  let lead: Lead | null = null;
  let sourceLead: Lead | null = null;

  const runner = getPublicResearchRunner();

  try {
    const mode = String(running.mode || "").trim().toLowerCase();
    const entityType = String(running.entityType || "").trim().toLowerCase() as SkipTraceEntityType;
    const entityId = Number(running.entityId);
    const requestedByUserId = (running as any).requestedByUserId ? Number((running as any).requestedByUserId) : 0;
    let providerPending = false;

    if (mode === "provider" || mode === "both") {
      const out = await runProviderStep({ job: running, entityType, entityId, requestedByUserId, ownerNameOverride: input?.ownerNameOverride ?? null });
      providerResult = out.providerResult;
      lead = out.lead;
      sourceLead = out.sourceLead;
      providerPending = out.pending;
    }

    if (mode === "public_research" || mode === "both") {
      await runPublicResearchStep({ job: running, entityType, entityId, ownerNameOverride: input?.ownerNameOverride ?? null, runner });
    }

    if (providerPending) {
      const requeued = await storage.updateSkipTraceJob(running.id, { status: "queued", startedAt: null, errorMessage: null } as any);
      await addJobEvent(running.id, "waiting", "Waiting for provider result", { providerPending: true });
      return { job: requeued, scoreSnapshot: null };
    }

    const scoreSnapshot = await persistLeadScoreSnapshot({ job: running, entityType, entityId, lead, sourceLead, providerResult });
    const completed = await storage.updateSkipTraceJob(running.id, { status: "completed", completedAt: new Date() } as any);
    await addJobEvent(running.id, "completed", null, { leadScoreSnapshotId: scoreSnapshot.id });
    return { job: completed, scoreSnapshot };
  } catch (e: any) {
    const errorMessage = String(e?.message || e || "Job failed");
    const failed = await storage.updateSkipTraceJob(running.id, { status: "failed", completedAt: new Date(), errorMessage } as any);
    await addJobEvent(running.id, "failed", errorMessage);
    throw Object.assign(e instanceof Error ? e : new Error(errorMessage), { statusCode: (e as any)?.statusCode ?? 500, job: failed });
  }
}

export async function runProviderSkipTraceForEntity(input: {
  entityType: SkipTraceEntityType;
  entityId: number;
  requestedByUserId: number;
  ownerNameOverride?: string | null;
}): Promise<
  | { cached: true; pending?: false; jobId: number; providerResult: SkipTraceResult }
  | { cached: false; pending: true; providerResult: SkipTraceResult }
  | { cached: false; pending?: false; jobId: number; providerResult: SkipTraceResult }
> {
  const entity = await loadEntity({ entityType: input.entityType, entityId: input.entityId });
  const providerInput = requireProviderInput({ entityType: input.entityType, ...entity, ownerNameOverride: input.ownerNameOverride });
  const cacheKey = skipTraceCacheKey(providerInput);
  const existing = await storage.getLatestSkipTraceByCacheKey(cacheKey);

  const now = Date.now();
  const ms90d = 1000 * 60 * 60 * 24 * 90;
  const ms5m = 1000 * 60 * 5;

  if (existing && String((existing as any).status || "") === "success" && (existing as any).completedAt) {
    const completedAtMs = new Date((existing as any).completedAt).getTime();
    if (Number.isFinite(completedAtMs) && now - completedAtMs < ms90d) {
      const job = await createSkipTraceJob({ entityType: input.entityType, entityId: input.entityId, mode: "provider", requestedByUserId: input.requestedByUserId });
      await runSkipTraceJob(job.id, { ownerNameOverride: input.ownerNameOverride ?? null });
      const providerResult = input.entityType === "lead" ? await storage.getLatestSkipTraceForLead(input.entityId) : await storage.getLatestSkipTraceForProperty(input.entityId);
      if (!providerResult) throw new HttpError({ statusCode: 500, message: "Skip trace result missing" });
      return { cached: true, jobId: job.id, providerResult };
    }
  }

  if (existing && String((existing as any).status || "") === "pending" && (existing as any).requestedAt) {
    const requestedAtMs = new Date((existing as any).requestedAt).getTime();
    if (Number.isFinite(requestedAtMs) && now - requestedAtMs < ms5m) {
      return { cached: false, pending: true, providerResult: existing };
    }
  }

  const job = await createSkipTraceJob({ entityType: input.entityType, entityId: input.entityId, mode: "provider", requestedByUserId: input.requestedByUserId });
  await runSkipTraceJob(job.id, { ownerNameOverride: input.ownerNameOverride ?? null });
  const providerResult = input.entityType === "lead" ? await storage.getLatestSkipTraceForLead(input.entityId) : await storage.getLatestSkipTraceForProperty(input.entityId);
  if (!providerResult) throw new HttpError({ statusCode: 500, message: "Skip trace result missing" });
  return { cached: false, jobId: job.id, providerResult };
}

export function isHttpError(e: any): e is HttpError {
  return !!e && typeof e.statusCode === "number";
}
