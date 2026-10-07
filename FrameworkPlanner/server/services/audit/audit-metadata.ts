/**
 * Ticket 04 — audit metadata + service identity resolution (pure).
 *
 * Everything here is deterministic and side-effect free so the audit policy can
 * be unit tested without a database. `writeAuditEvent` is the only caller that
 * persists the result.
 */

import {
  domainForEntityType,
  getDataDomain,
  type DataDomainId,
} from "../../../shared/data-domains.js";
import {
  DEFAULT_SYSTEM_SERVICE_IDENTITY,
  isAuditActorKind,
  getServiceIdentity,
  type AuditActorKind,
  type ServiceIdentityId,
} from "../../../shared/service-identities.js";

export type AuditEventKind = "create" | "update" | "delete";

export interface AuditEventInput {
  teamId: number;
  actorUserId?: number | null;
  entityType: string;
  entityId?: number | null;
  action: string;
  before?: unknown;
  after?: unknown;
  diff?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  kind?: AuditEventKind;
  /** Ticket 04: owning data domain (derived from entityType when omitted). */
  domain?: DataDomainId | string | null;
  /** Ticket 04: who performed the action. */
  actorKind?: AuditActorKind | string | null;
  /** Ticket 04: required whenever actorKind is "service". */
  serviceIdentity?: ServiceIdentityId | string | null;
  /** Ticket 04: free-form, non-secret context (never put secrets here). */
  metadata?: Record<string, unknown> | null;
}

export interface ResolvedAuditActor {
  actorKind: AuditActorKind;
  actorUserId: number | null;
  serviceIdentity: ServiceIdentityId | null;
}

export interface AuditEventValues {
  teamId: number;
  actorUserId: number | null;
  entityType: string;
  entityId: number | null;
  action: string;
  beforeJson: string | null;
  afterJson: string | null;
  diffJson: string | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  domain: DataDomainId | null;
  actorKind: AuditActorKind;
  serviceIdentity: ServiceIdentityId | null;
  metadataJson: string | null;
}

export interface AuditEventBuild {
  values: AuditEventValues;
  warnings: string[];
}

export function computeShallowDiff(before: unknown, after: unknown) {
  const b = before && typeof before === "object" ? (before as Record<string, unknown>) : {};
  const a = after && typeof after === "object" ? (after as Record<string, unknown>) : {};
  const keys = new Set<string>([...Object.keys(b), ...Object.keys(a)]);
  const changed: Array<{ key: string; before: unknown; after: unknown }> = [];
  for (const key of keys) {
    const bv = b[key];
    const av = a[key];
    if (JSON.stringify(bv) !== JSON.stringify(av)) {
      changed.push({ key, before: bv ?? null, after: av ?? null });
    }
  }
  return { changed };
}

/**
 * Never attribute an automated write to a human, and never let a service write
 * appear as "no actor": an unresolvable service identity falls back to the
 * system identity and is reported as a warning.
 */
export function resolveAuditActor(input: {
  actorUserId?: number | null;
  actorKind?: AuditActorKind | string | null;
  serviceIdentity?: ServiceIdentityId | string | null;
}): { actor: ResolvedAuditActor; warnings: string[] } {
  const warnings: string[] = [];
  const actorUserId = typeof input.actorUserId === "number" ? input.actorUserId : null;

  let serviceIdentity: ServiceIdentityId | null = null;
  if (input.serviceIdentity !== undefined && input.serviceIdentity !== null && String(input.serviceIdentity).trim() !== "") {
    const resolved = getServiceIdentity(input.serviceIdentity);
    if (resolved) serviceIdentity = resolved.id;
    else warnings.push(`Unknown serviceIdentity "${String(input.serviceIdentity)}" — attribute the caller in shared/service-identities.ts.`);
  }

  let actorKind: AuditActorKind;
  const requested = isAuditActorKind(input.actorKind) ? (String(input.actorKind).trim().toLowerCase() as AuditActorKind) : null;
  if (requested === "service" || requested === "system") actorKind = requested;
  else if (serviceIdentity) actorKind = "service";
  else actorKind = "user";

  if (actorKind === "service" && !serviceIdentity) {
    actorKind = "system";
    serviceIdentity = DEFAULT_SYSTEM_SERVICE_IDENTITY;
    warnings.push("actorKind=service without a registered serviceIdentity — recorded against the system identity.");
  }
  if (actorKind === "user" && actorUserId === null) {
    actorKind = "system";
    serviceIdentity = serviceIdentity ?? DEFAULT_SYSTEM_SERVICE_IDENTITY;
    warnings.push("Automated write had no actorUserId — recorded as a system actor instead of a human.");
  }

  return { actor: { actorKind, actorUserId, serviceIdentity }, warnings };
}

/** Explicit domain wins; otherwise derive from the entity type. */
export function resolveAuditDomain(input: { domain?: unknown; entityType: unknown }): { domain: DataDomainId | null; warnings: string[] } {
  const warnings: string[] = [];
  if (input.domain !== undefined && input.domain !== null && String(input.domain).trim() !== "") {
    const explicit = getDataDomain(input.domain);
    if (explicit) return { domain: explicit.id, warnings };
    warnings.push(`Unknown data domain "${String(input.domain)}" — falling back to the entity type mapping.`);
  }
  return { domain: domainForEntityType(input.entityType), warnings };
}

/** Build the audit_events row for an input without touching the database. */
export function buildAuditEventValues(input: AuditEventInput): AuditEventBuild {
  const { actor, warnings: actorWarnings } = resolveAuditActor(input);
  const { domain, warnings: domainWarnings } = resolveAuditDomain(input);
  const warnings = [...actorWarnings, ...domainWarnings];

  const beforeJson = typeof input.before === "undefined" ? null : JSON.stringify(input.before);
  const afterJson = typeof input.after === "undefined" ? null : JSON.stringify(input.after);
  const diff =
    typeof input.diff !== "undefined"
      ? input.diff
      : typeof input.before !== "undefined" || typeof input.after !== "undefined"
        ? computeShallowDiff(input.before, input.after)
        : null;
  const diffJson =
    diff === null
      ? input.kind
        ? JSON.stringify({ kind: input.kind, changed: [] })
        : null
      : JSON.stringify({ kind: input.kind || "update", ...(diff as Record<string, unknown>) });

  const meta: Record<string, unknown> = { ...(input.metadata ?? {}) };
  if (actor.serviceIdentity && !meta.serviceLabel) {
    const identity = getServiceIdentity(actor.serviceIdentity);
    if (identity) {
      meta.serviceLabel = identity.label;
      if (!meta.ownerDomain) meta.ownerDomain = identity.ownerDomain;
    }
  }
  if (domain && !meta.domainOwner) {
    const descriptor = getDataDomain(domain);
    if (descriptor) meta.domainOwner = descriptor.owner;
  }
  if (warnings.length) meta.warnings = warnings;

  return {
    values: {
      teamId: input.teamId,
      actorUserId: actor.actorUserId,
      entityType: String(input.entityType || "").trim(),
      entityId: typeof input.entityId === "number" ? input.entityId : null,
      action: String(input.action || "").trim(),
      beforeJson,
      afterJson,
      diffJson,
      ip: input.ip ? String(input.ip).slice(0, 64) : null,
      userAgent: input.userAgent ? String(input.userAgent) : null,
      requestId: input.requestId ? String(input.requestId).slice(0, 64) : null,
      domain,
      actorKind: actor.actorKind,
      serviceIdentity: actor.serviceIdentity,
      metadataJson: Object.keys(meta).length ? JSON.stringify(meta) : null,
    },
    warnings,
  };
}
