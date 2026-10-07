import { describe, expect, it } from "vitest";
import {
  AUDITED_ENTITY_TYPES,
  DATA_DOMAINS,
  DATA_DOMAIN_IDS,
  DOMAIN_APPROVER_ROLES,
  canApproveDomainOperation,
  domainForEntityType,
  getDataDomain,
  isDataDomainId,
  listDataDomains,
  requiresAuditForEntityType,
} from "../shared/data-domains";
import {
  AUDIT_ACTOR_KINDS,
  DEFAULT_SYSTEM_SERVICE_IDENTITY,
  SERVICE_IDENTITIES,
  SERVICE_IDENTITY_IDS,
  getServiceIdentity,
  isAuditActorKind,
  isServiceIdentityId,
  listServiceIdentities,
  serviceIdentityIdsForDomain,
} from "../shared/service-identities";
import {
  buildAuditEventValues,
  computeShallowDiff,
  resolveAuditActor,
  resolveAuditDomain,
} from "../server/services/audit/audit-metadata";

describe("data domain registry", () => {
  it("gives every domain an owner, custodian, tables, and audit policy", () => {
    for (const id of DATA_DOMAIN_IDS) {
      const domain = DATA_DOMAINS[id];
      expect(domain.id).toBe(id);
      expect(domain.label).toBeTruthy();
      expect(domain.owner).toBeTruthy();
      expect(domain.custodian).toBeTruthy();
      expect(domain.tables.length).toBeGreaterThan(0);
      expect(domain.entityTypes.length).toBeGreaterThan(0);
      expect(Array.isArray(domain.approvalRequiredFor)).toBe(true);
    }
    // No remaining unconfirmed placeholders once the registry is final.
    for (const domain of listDataDomains()) {
      expect(domain.owner).not.toMatch(/confirm/i);
      expect(domain.owner).not.toMatch(/</);
    }
  });

  it("maps entity types back to their owning domain", () => {
    expect(domainForEntityType("lead")).toBe("leads");
    expect(domainForEntityType("Follow_Up")).toBe("leads");
    expect(domainForEntityType("buyer_inquiry")).toBe("buyers");
    expect(domainForEntityType("contract")).toBe("contracts");
    expect(domainForEntityType("document_version")).toBe("documents");
    expect(domainForEntityType("commission_payout")).toBe("billing");
    expect(domainForEntityType("not_a_thing")).toBeNull();
    expect(domainForEntityType("")).toBeNull();
  });

  it("requires an audit row for every owned entity type", () => {
    for (const entityType of AUDITED_ENTITY_TYPES) {
      expect(requiresAuditForEntityType(entityType)).toBe(true);
      expect(domainForEntityType(entityType)).toBeTruthy();
    }
    expect(requiresAuditForEntityType("random_entity")).toBe(false);
  });

  it("exposes helper lookups", () => {
    expect(isDataDomainId("billing")).toBe(true);
    expect(isDataDomainId("BILLING")).toBe(true);
    expect(isDataDomainId("payroll")).toBe(false);
    expect(getDataDomain("leads")?.owner).toContain("Sales Lead");
    expect(getDataDomain("leads")?.owner).toContain("role");
    expect(getDataDomain("nope")).toBeNull();
  });

  it("scopes narrow approver roles to their own domain", () => {
    expect(canApproveDomainOperation({ role: "finance" }, { domain: "billing" })).toBe(true);
    expect(canApproveDomainOperation({ role: "finance" }, { domain: "documents" })).toBe(false);
    expect(canApproveDomainOperation({ role: "transaction_coordinator" }, { domain: "documents" })).toBe(true);
    expect(canApproveDomainOperation({ role: "transaction_coordinator" }, { domain: "billing" })).toBe(false);
    for (const role of ["owner", "admin", "manager", "team_leader"]) {
      expect(DOMAIN_APPROVER_ROLES).toContain(role);
      expect(canApproveDomainOperation({ role }, { domain: "contracts" })).toBe(true);
    }
    expect(canApproveDomainOperation({ role: "viewer" })).toBe(false);
    expect(canApproveDomainOperation(null)).toBe(false);
    expect(canApproveDomainOperation({ role: "viewer", isSuperAdmin: true })).toBe(true);
  });
});

describe("service identities", () => {
  it("describes every registered identity", () => {
    for (const id of SERVICE_IDENTITY_IDS) {
      const identity = SERVICE_IDENTITIES[id];
      expect(identity.id).toBe(id);
      expect(identity.label).toBeTruthy();
      expect(identity.description).toBeTruthy();
      expect(identity.scopes).toContain("audit:write");
      expect(isDataDomainId(identity.ownerDomain)).toBe(true);
      expect(["cron", "route", "webhook", "startup"]).toContain(identity.source);
    }
    expect(listServiceIdentities()).toHaveLength(SERVICE_IDENTITY_IDS.length);
  });

  it("recognizes only registered identities", () => {
    expect(isServiceIdentityId("skip-trace-worker")).toBe(true);
    expect(isServiceIdentityId("SKIP-TRACE-WORKER")).toBe(true);
    expect(isServiceIdentityId("made-up-worker")).toBe(false);
    expect(getServiceIdentity("quarantine-scanner")?.ownerDomain).toBe("leads");
    expect(getServiceIdentity("nope")).toBeNull();
  });

  it("groups identities by owning domain", () => {
    const leadWorkers = serviceIdentityIdsForDomain("leads");
    expect(leadWorkers).toContain("skip-trace-worker");
    expect(leadWorkers).toContain("quarantine-scanner");
    expect(leadWorkers).toContain("crm-import-worker");
    expect(serviceIdentityIdsForDomain("billing")).toEqual([]);
  });

  it("defines the actor kinds used by the audit trail", () => {
    expect(AUDIT_ACTOR_KINDS).toEqual(["user", "service", "system"]);
    expect(isAuditActorKind("service")).toBe(true);
    expect(isAuditActorKind("robot")).toBe(false);
    expect(isServiceIdentityId(DEFAULT_SYSTEM_SERVICE_IDENTITY)).toBe(true);
  });
});

describe("resolveAuditActor", () => {
  it("attributes a signed-in human to actor_kind=user", () => {
    const { actor, warnings } = resolveAuditActor({ actorUserId: 42 });
    expect(actor).toEqual({ actorKind: "user", actorUserId: 42, serviceIdentity: null });
    expect(warnings).toEqual([]);
  });

  it("attributes a registered worker to actor_kind=service", () => {
    const { actor, warnings } = resolveAuditActor({ actorUserId: null, serviceIdentity: "skip-trace-worker" });
    expect(actor.actorKind).toBe("service");
    expect(actor.serviceIdentity).toBe("skip-trace-worker");
    expect(actor.actorUserId).toBeNull();
    expect(warnings).toEqual([]);
  });

  it("never attributes an automated write to a human", () => {
    const { actor, warnings } = resolveAuditActor({});
    expect(actor.actorKind).toBe("system");
    expect(actor.actorUserId).toBeNull();
    expect(warnings.join(" ")).toMatch(/automated write/i);
  });

  it("falls back to the system identity when a service identity is unknown", () => {
    const { actor, warnings } = resolveAuditActor({ actorKind: "service", serviceIdentity: "ghost-worker" });
    expect(actor.actorKind).toBe("system");
    expect(actor.serviceIdentity).toBe(DEFAULT_SYSTEM_SERVICE_IDENTITY);
    expect(warnings.join(" ")).toMatch(/ghost-worker/);
  });

  it("honors an explicit system actor kind", () => {
    const { actor } = resolveAuditActor({ actorKind: "system" });
    expect(actor.actorKind).toBe("system");
  });
});

describe("resolveAuditDomain", () => {
  it("prefers an explicit valid domain", () => {
    const { domain, warnings } = resolveAuditDomain({ domain: "billing", entityType: "lead" });
    expect(domain).toBe("billing");
    expect(warnings).toEqual([]);
  });

  it("derives the domain from the entity type when omitted", () => {
    expect(resolveAuditDomain({ entityType: "buyer" }).domain).toBe("buyers");
  });

  it("warns and derives when the explicit domain is unknown", () => {
    const { domain, warnings } = resolveAuditDomain({ domain: "payroll", entityType: "lead" });
    expect(domain).toBe("leads");
    expect(warnings.join(" ")).toMatch(/payroll/);
  });

  it("leaves an unmapped entity type without an owner", () => {
    expect(resolveAuditDomain({ entityType: "whatever" }).domain).toBeNull();
  });
});

describe("buildAuditEventValues", () => {
  it("builds a human row with domain, diff, and owner metadata", () => {
    const { values, warnings } = buildAuditEventValues({
      teamId: 7,
      actorUserId: 3,
      entityType: "lead",
      entityId: 10,
      action: "lead_status_changed",
      before: { status: "new" },
      after: { status: "contacted" },
      kind: "update",
      metadata: { source: "ui" },
    });
    expect(warnings).toEqual([]);
    expect(values.domain).toBe("leads");
    expect(values.actorKind).toBe("user");
    expect(values.serviceIdentity).toBeNull();
    expect(values.teamId).toBe(7);
    expect(values.entityId).toBe(10);
    const diff = JSON.parse(String(values.diffJson));
    expect(diff.kind).toBe("update");
    expect(diff.changed).toEqual([{ key: "status", before: "new", after: "contacted" }]);
    const meta = JSON.parse(String(values.metadataJson));
    expect(meta.source).toBe("ui");
    expect(meta.domainOwner).toBe(DATA_DOMAINS.leads.owner);
  });

  it("records service attribution with the worker label and owner domain", () => {
    const { values } = buildAuditEventValues({
      teamId: 7,
      actorUserId: null,
      entityType: "quarantine",
      action: "quarantine_scan",
      actorKind: "service",
      serviceIdentity: "quarantine-scanner",
      domain: "leads",
      kind: "create",
      metadata: { flagged: 2 },
    });
    expect(values.actorKind).toBe("service");
    expect(values.serviceIdentity).toBe("quarantine-scanner");
    expect(values.domain).toBe("leads");
    const meta = JSON.parse(String(values.metadataJson));
    expect(meta.serviceLabel).toBe(SERVICE_IDENTITIES["quarantine-scanner"].label);
    expect(meta.flagged).toBe(2);
    expect(meta.warnings).toBeUndefined();
  });

  it("records warnings for an unattributable write instead of pretending it was human", () => {
    const { values } = buildAuditEventValues({
      teamId: 1,
      entityType: "unknown_entity",
      action: "mystery",
    });
    expect(values.actorKind).toBe("system");
    expect(values.domain).toBeNull();
    const meta = JSON.parse(String(values.metadataJson));
    expect(meta.warnings.length).toBeGreaterThan(0);
  });

  it("keeps a kind-only delete with an empty change list", () => {
    const { values } = buildAuditEventValues({
      teamId: 1,
      actorUserId: 9,
      entityType: "contract",
      entityId: 5,
      action: "contract_deleted",
      kind: "delete",
    });
    expect(JSON.parse(String(values.diffJson))).toEqual({ kind: "delete", changed: [] });
    expect(values.domain).toBe("contracts");
  });

  it("truncates oversized request identifiers and redacts nothing else", () => {
    const { values } = buildAuditEventValues({
      teamId: 1,
      actorUserId: 9,
      entityType: "lead",
      action: "noop",
      requestId: "x".repeat(200),
      ip: "203.0.113.5",
    });
    expect(values.requestId?.length).toBe(64);
    expect(values.ip).toBe("203.0.113.5");
  });
});

describe("computeShallowDiff", () => {
  it("lists only changed keys and treats missing values as null", () => {
    expect(computeShallowDiff({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual({
      changed: [{ key: "b", before: 2, after: 3 }],
    });
    expect(computeShallowDiff({ a: 1 }, {})).toEqual({ changed: [{ key: "a", before: 1, after: null }] });
    expect(computeShallowDiff(null, { z: 1 })).toEqual({ changed: [{ key: "z", before: null, after: 1 }] });
  });
});
