import { db } from "../../db.js";
import { auditEvents } from "../../shared-schema.js";
import { buildAuditEventValues, type AuditEventInput } from "./audit-metadata.js";
import { getServiceIdentity, type ServiceIdentityId } from "../../../shared/service-identities.js";
import { getDataDomain, type DataDomainId } from "../../../shared/data-domains.js";

export type { AuditEventInput } from "./audit-metadata.js";

/**
 * Append an immutable audit row.
 *
 * Ticket 04: rows now carry the owning data domain, the actor kind
 * (`user` | `service` | `system`), the first-party service identity when a
 * background worker performed the change, and free-form non-secret metadata.
 */
export async function writeAuditEvent(input: AuditEventInput) {
  const { values } = buildAuditEventValues(input);
  const rows = await db
    .insert(auditEvents)
    .values(values as any)
    .returning();
  return rows[0] || null;
}

/**
 * Ticket 04 — write an audit row attributed to a registered background worker.
 * Rejects unknown identities and unknown domains instead of silently producing
 * an unattributable row.
 */
export async function recordServiceAuditEvent(input: {
  teamId: number;
  serviceIdentity: ServiceIdentityId | string;
  entityType: string;
  entityId?: number | null;
  action: string;
  domain?: DataDomainId | string | null;
  metadata?: Record<string, unknown> | null;
  kind?: "create" | "update" | "delete";
  requestId?: string | null;
}) {
  const identity = getServiceIdentity(input.serviceIdentity);
  if (!identity) {
    throw new Error(
      `Unknown service identity "${String(input.serviceIdentity)}". Register it in shared/service-identities.ts before it writes to the audit trail.`,
    );
  }
  if (input.domain && !getDataDomain(input.domain)) {
    throw new Error(`Unknown data domain "${String(input.domain)}". Register it in shared/data-domains.ts before it writes to the audit trail.`);
  }
  return writeAuditEvent({
    teamId: input.teamId,
    actorUserId: null,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    action: input.action,
    kind: input.kind,
    actorKind: "service",
    serviceIdentity: identity.id,
    domain: input.domain ?? null,
    metadata: input.metadata ?? null,
    requestId: input.requestId ?? null,
  });
}
