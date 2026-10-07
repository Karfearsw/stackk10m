/**
 * Ticket 04 — finalized data-domain ownership registry.
 *
 * The audit found core data with no accountable owner (10,665 unassigned leads,
 * 166 buyers with zero outreach). This module is the single source of truth for
 * who accounts for each domain and which domains must produce immutable
 * `audit_events` evidence. Owners are role-based on purpose: a role survives
 * personnel changes, and the owner can reassign the individual behind a role
 * without editing code or invalidating the audit trail.
 *
 * Pure module (no imports, no side effects) so it can be unit tested without a
 * database and shared by server and client.
 */

export const DATA_DOMAIN_IDS = [
  "program",
  "leads",
  "buyers",
  "contracts",
  "documents",
  "billing",
] as const;

export type DataDomainId = (typeof DATA_DOMAIN_IDS)[number];

export type AuditActionKind = "create" | "update" | "delete";

export interface DataDomain {
  id: DataDomainId;
  /** Human label used in docs, audit exports, and the UI. */
  label: string;
  /** The role accountable for quality, access, and retention of this domain. */
  owner: string;
  /** The role doing day-to-day upkeep (often the same person as the owner). */
  custodian: string;
  /** Primary tables covered by the domain. */
  tables: string[];
  /** `entity_type` values that map onto this domain for audit purposes. */
  entityTypes: string[];
  /** Whether create/update/delete on this domain must write an audit event. */
  requiresAudit: boolean;
  /** Operations that additionally require the domain owner (or an admin). */
  approvalRequiredFor: string[];
  notes?: string;
}

export const DATA_DOMAINS: Record<DataDomainId, DataDomain> = {
  program: {
    id: "program",
    label: "Program / all domains",
    owner: "Benjamin (Owner)",
    custodian: "Benjamin (Owner)",
    tables: ["audit_events", "teams", "team_members", "users"],
    entityTypes: ["audit_event", "team", "user"],
    requiresAudit: true,
    approvalRequiredFor: ["retention policy change", "role/permission change", "cross-domain bulk export"],
    notes: "Cross-domain policy, retention, and access. Named by the owner as overall data owner.",
  },
  leads: {
    id: "leads",
    label: "Leads",
    owner: "Sales Lead (Team Leader role)",
    custodian: "Team Leader role",
    tables: ["leads", "contacts", "lead_notes", "lead_scores", "tasks", "follow_ups"],
    entityTypes: ["lead", "contact", "lead_note", "task", "follow_up"],
    requiresAudit: true,
    approvalRequiredFor: ["bulk import", "bulk stage/status change", "quarantine restore"],
    notes: "Highest-volume domain; drives unassigned-lead and overdue-task cleanup.",
  },
  buyers: {
    id: "buyers",
    label: "Buyers",
    owner: "Dispositions Lead (Dispositions Lead role)",
    custodian: "Dispositions Lead role",
    tables: ["buyers", "buyer_inquiries", "buyer_outreach"],
    entityTypes: ["buyer", "buyer_inquiry", "buyer_outreach"],
    requiresAudit: true,
    approvalRequiredFor: ["bulk buyer import", "outreach campaign enrollment"],
    notes: "Owns the backlog of buyers with zero outreach.",
  },
  contracts: {
    id: "contracts",
    label: "Contracts",
    owner: "Acquisitions Lead (Acquisitions Lead role)",
    custodian: "Acquisitions Lead role",
    tables: ["contracts", "contract_fields", "offers"],
    entityTypes: ["contract", "contract_field", "offer"],
    requiresAudit: true,
    approvalRequiredFor: ["contract void/termination", "offer term change"],
    notes: "Owns offer terms and contract-stage integrity.",
  },
  documents: {
    id: "documents",
    label: "Documents",
    owner: "Transaction Coordinator (Ops / TC role)",
    custodian: "Ops / Transaction Coordinator role",
    tables: ["documents", "contract_documents", "document_versions", "lois", "vault_document_blobs"],
    entityTypes: ["document", "contract_document", "document_version", "loi"],
    requiresAudit: true,
    approvalRequiredFor: ["template change", "document deletion"],
    notes: "Owns templates, versioning, and signed-document retention.",
  },
  billing: {
    id: "billing",
    label: "Billing & commissions",
    owner: "Finance / Owner role",
    custodian: "Finance / Owner role",
    tables: ["commission_records", "commission_payouts", "invoices", "payment_records"],
    entityTypes: ["commission", "commission_payout", "invoice", "payment"],
    requiresAudit: true,
    approvalRequiredFor: ["payout approval", "commission rate change"],
    notes: "Sensitive: restrict read/write to finance and owner roles.",
  },
};

/** Every entity type that must produce an immutable audit row. */
export const AUDITED_ENTITY_TYPES: readonly string[] = Object.values(DATA_DOMAINS)
  .filter((d) => d.requiresAudit)
  .flatMap((d) => d.entityTypes);

export function isDataDomainId(value: unknown): value is DataDomainId {
  return typeof value === "string" && (DATA_DOMAIN_IDS as readonly string[]).includes(value.trim().toLowerCase());
}

export function getDataDomain(id: unknown): DataDomain | null {
  if (!isDataDomainId(id)) return null;
  return DATA_DOMAINS[(id as string).trim().toLowerCase() as DataDomainId];
}

export function listDataDomains(): DataDomain[] {
  return DATA_DOMAIN_IDS.map((id) => DATA_DOMAINS[id]);
}

/**
 * Resolve the owning domain for an audit `entity_type`.
 * Unknown entity types legitimately return null: not every write is
 * domain-governed, and callers must not invent an owner.
 */
export function domainForEntityType(entityType: unknown): DataDomainId | null {
  const needle = String(entityType ?? "").trim().toLowerCase();
  if (!needle) return null;
  for (const domain of listDataDomains()) {
    if (domain.entityTypes.some((t) => t.toLowerCase() === needle)) return domain.id;
  }
  return null;
}

export function requiresAuditForEntityType(entityType: unknown): boolean {
  const domain = domainForEntityType(entityType);
  if (domain) return DATA_DOMAINS[domain].requiresAudit;
  return AUDITED_ENTITY_TYPES.includes(String(entityType ?? "").trim().toLowerCase());
}

/** Roles allowed to approve destructive/bulk operations in a domain. */
export const DOMAIN_APPROVER_ROLES: readonly string[] = [
  "owner",
  "admin",
  "manager",
  "team_leader",
  "sales_lead",
  "dispositions_lead",
  "acquisitions_lead",
  "finance",
  "transaction_coordinator",
];

export function canApproveDomainOperation(actor: { role?: string | null; isSuperAdmin?: boolean | null } | null | undefined, input?: { domain?: DataDomainId | null }): boolean {
  if (!actor) return false;
  if (actor.isSuperAdmin) return true;
  const role = String(actor.role ?? "").trim().toLowerCase();
  if (!role) return false;
  if (role === "finance" || role === "transaction_coordinator") {
    // Narrow roles only approve inside their own domain.
    const domain = input?.domain ?? null;
    if (domain === "billing") return role === "finance";
    if (domain === "documents") return role === "transaction_coordinator";
    return false;
  }
  return DOMAIN_APPROVER_ROLES.includes(role);
}
