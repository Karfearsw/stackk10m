/**
 * Ticket 04 — first-party service identities.
 *
 * Background work (skip-trace workers, quarantine scanners, campaign schedulers,
 * webhooks) previously produced rows with no `actorUserId`, which made the audit
 * trail ambiguous: an autonomous change looked identical to "no actor recorded".
 * Every non-human writer must now identify itself with one of these stable ids,
 * and audit rows record `actor_kind = 'service'` plus the identity id.
 *
 * Pure module (no imports, no side effects).
 */

import type { DataDomainId } from "./data-domains.js";

export const SERVICE_IDENTITY_IDS = [
  "crm-import-worker",
  "skip-trace-worker",
  "quarantine-scanner",
  "campaign-scheduler",
  "telnyx-webhook",
  "email-delivery-worker",
  "automation-runner",
  "audit-system",
] as const;

export type ServiceIdentityId = (typeof SERVICE_IDENTITY_IDS)[number];

export interface ServiceIdentity {
  id: ServiceIdentityId;
  label: string;
  /** Domain whose accountable owner is responsible for this service's writes. */
  ownerDomain: DataDomainId;
  description: string;
  /** What this identity is permitted to do (documented, not yet enforced). */
  scopes: string[];
  /** Where the identity runs, so an operator can find the process. */
  source: "cron" | "route" | "webhook" | "startup";
}

export const SERVICE_IDENTITIES: Record<ServiceIdentityId, ServiceIdentity> = {
  "crm-import-worker": {
    id: "crm-import-worker",
    label: "CRM import worker",
    ownerDomain: "leads",
    description: "Processes approved bulk lead/contact imports (Ticket 01 approval gate).",
    scopes: ["leads:import", "contacts:import", "audit:write"],
    source: "cron",
  },
  "skip-trace-worker": {
    id: "skip-trace-worker",
    label: "Skip trace worker",
    ownerDomain: "leads",
    description: "Runs queued skip-trace jobs against the configured provider chain.",
    scopes: ["leads:enrich", "skip_trace:run", "audit:write"],
    source: "cron",
  },
  "quarantine-scanner": {
    id: "quarantine-scanner",
    label: "Quarantine scanner",
    ownerDomain: "leads",
    description: "Scans records for test/demo patterns and flags them into quarantine (Ticket 02).",
    scopes: ["leads:read", "quarantine:flag", "audit:write"],
    source: "cron",
  },
  "campaign-scheduler": {
    id: "campaign-scheduler",
    label: "Campaign scheduler",
    ownerDomain: "buyers",
    description: "Enrolls and advances campaign steps for leads and buyers.",
    scopes: ["campaigns:run", "audit:write"],
    source: "cron",
  },
  "telnyx-webhook": {
    id: "telnyx-webhook",
    label: "Telnyx webhook handler",
    ownerDomain: "program",
    description: "Applies inbound call/SMS provider events to CRM records.",
    scopes: ["calls:write", "sms:write", "audit:write"],
    source: "webhook",
  },
  "email-delivery-worker": {
    id: "email-delivery-worker",
    label: "Email delivery worker",
    ownerDomain: "program",
    description: "Sends transactional email and records delivery state.",
    scopes: ["email:send", "audit:write"],
    source: "cron",
  },
  "automation-runner": {
    id: "automation-runner",
    label: "Automation runner",
    ownerDomain: "program",
    description: "Executes saved automations (stage changes, task creation, campaign enrollment).",
    scopes: ["automations:run", "audit:write"],
    source: "cron",
  },
  "audit-system": {
    id: "audit-system",
    label: "Audit system",
    ownerDomain: "program",
    description: "Fallback identity for system-originated writes that belong to no specific worker.",
    scopes: ["audit:write"],
    source: "startup",
  },
};

export const AUDIT_ACTOR_KINDS = ["user", "service", "system"] as const;
export type AuditActorKind = (typeof AUDIT_ACTOR_KINDS)[number];

export function isAuditActorKind(value: unknown): value is AuditActorKind {
  return typeof value === "string" && (AUDIT_ACTOR_KINDS as readonly string[]).includes(value.trim().toLowerCase());
}

export function isServiceIdentityId(value: unknown): value is ServiceIdentityId {
  return typeof value === "string" && (SERVICE_IDENTITY_IDS as readonly string[]).includes(value.trim().toLowerCase());
}

export function getServiceIdentity(id: unknown): ServiceIdentity | null {
  if (!isServiceIdentityId(id)) return null;
  return SERVICE_IDENTITIES[(id as string).trim().toLowerCase() as ServiceIdentityId];
}

export function listServiceIdentities(): ServiceIdentity[] {
  return SERVICE_IDENTITY_IDS.map((id) => SERVICE_IDENTITIES[id]);
}

export function serviceIdentityIdsForDomain(domain: DataDomainId): ServiceIdentityId[] {
  return SERVICE_IDENTITY_IDS.filter((id) => SERVICE_IDENTITIES[id].ownerDomain === domain);
}

/** Convenience: the identity used when a background caller has no specific worker. */
export const DEFAULT_SYSTEM_SERVICE_IDENTITY: ServiceIdentityId = "audit-system";
