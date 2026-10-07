import crypto from "node:crypto";

/**
 * Ticket 01 — bulk import approval gate (pure policy).
 *
 * Rule: every bulk lead/entity import requires an explicit approval from a
 * permitted user before it can touch production records. Machine integrations
 * must identify themselves as a known source (and those trusted sources are
 * still recorded as such). Unknown sources are rejected outright.
 *
 * This module is dependency-free so the policy can be unit tested without a DB.
 */

export const IMPORT_SOURCES = [
  "manual_upload",
  "crm_ui",
  "api",
  "integration",
  "migration",
  "system",
] as const;

export type ImportSource = (typeof IMPORT_SOURCES)[number];

export type ImportApprovalStatus = "pending" | "approved" | "rejected" | "not_required";

/** Sources that identify themselves as an already-approved machine integration. */
export const TRUSTED_IMPORT_SOURCES: readonly ImportSource[] = ["integration", "migration", "system"];

/** Roles permitted to approve a bulk import. */
export const IMPORT_APPROVER_ROLES = ["admin", "owner", "manager", "team_leader"] as const;

export interface ImportActor {
  id?: number | null;
  role?: string | null;
  isSuperAdmin?: boolean | null;
}

export interface ImportGateInput {
  /** Raw source value supplied by the caller. */
  source?: unknown;
  /** Acting user, if any. */
  actor?: ImportActor | null;
}

export interface ImportGateResult {
  /** Whether the job may run immediately. */
  allowed: boolean;
  /** Normalized source (or the raw string when unknown). */
  source: string;
  approvalStatus: ImportApprovalStatus;
  requiresApproval: boolean;
  reason?: string;
}

export function isKnownImportSource(value: unknown): value is ImportSource {
  return (IMPORT_SOURCES as readonly string[]).includes(String(value ?? "").trim());
}

export function isTrustedImportSource(value: unknown): boolean {
  return (TRUSTED_IMPORT_SOURCES as readonly string[]).includes(String(value ?? "").trim());
}

export function canApproveImports(user: ImportActor | null | undefined): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  const role = String(user.role || "").trim().toLowerCase();
  return (IMPORT_APPROVER_ROLES as readonly string[]).includes(role);
}

/**
 * Decide whether an import may run now or must wait for approval.
 * - Unknown/missing source with no actor is treated as an unapproved bulk import.
 * - Trusted machine sources run and are recorded as `not_required`.
 * - Bulk/manual sources run only if the actor is a permitted approver
 *   (self-approval, with the approver recorded); otherwise `pending`.
 */
export function evaluateImportGate(input: ImportGateInput): ImportGateResult {
  const rawSource = String(input.source ?? "").trim();

  if (rawSource && !isKnownImportSource(rawSource)) {
    return {
      allowed: false,
      source: rawSource,
      approvalStatus: "rejected",
      requiresApproval: true,
      reason: `Unknown import source "${rawSource}". Bulk imports must be approved and integrations must identify a known source.`,
    };
  }

  const source: ImportSource = isKnownImportSource(rawSource) ? rawSource : "manual_upload";

  if (isTrustedImportSource(source)) {
    return { allowed: true, source, approvalStatus: "not_required", requiresApproval: false };
  }

  if (canApproveImports(input.actor)) {
    return { allowed: true, source, approvalStatus: "approved", requiresApproval: true };
  }

  return {
    allowed: false,
    source,
    approvalStatus: "pending",
    requiresApproval: true,
    reason: "Bulk import is blocked until a permitted user approves it.",
  };
}

/**
 * Stable signature for re-run detection: the same approved file + mapping for the
 * same entity type produces the same signature, so duplicate imports are visible.
 */
export function computeImportSignature(input: {
  entityType: string;
  fileBase64: string;
  mapping?: Record<string, unknown>;
  options?: Record<string, unknown>;
}): string {
  const fileHash = crypto.createHash("sha256").update(input.fileBase64 || "", "utf8").digest("hex");
  const stable = (obj: Record<string, unknown> | undefined) => {
    if (!obj) return "{}";
    const keys = Object.keys(obj).sort();
    const sorted: Record<string, unknown> = {};
    for (const k of keys) sorted[k] = (obj as any)[k];
    return JSON.stringify(sorted);
  };
  const payload = [input.entityType, fileHash, stable(input.mapping), stable(input.options)].join("|");
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 64);
}
