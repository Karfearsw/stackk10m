# Data Ownership, Audit Metadata & Service Identities (Ticket 4)

> **STATUS: FINAL (approved by owner, Oct 7 2026).**
> The registry in `shared/data-domains.ts` and `shared/service-identities.ts` is
> now the single source of truth and is enforced by code (`writeAuditEvent`
> derives the domain, actor kind, and service identity for every row).
> Owners are assigned by **role**, not by name, so ownership survives personnel
> changes and the owner can reassign the individual behind a role without a code
> change. Update a role name in `shared/data-domains.ts` when it changes.

## Why

The audit found data nobody was accountable for (10,665 leads, 100%
unassigned; 166 buyers with zero outreach), and an audit trail that could not
answer two basic questions: *which accountable domain does this change belong
to?* and *was it a human or a background worker?*. Both are fixed here.

## Terminology

- **Accountable owner** — the role answerable for the domain's quality and access
  decisions (approves who can read/write, signs off on bulk changes).
- **Custodian** — the role performing day-to-day upkeep.
- **Actor kind** — `user` (a signed-in human), `service` (a first-party worker,
  identified by a registered service identity), or `system` (fallback for
  system-originated writes with no worker identity).
- **Service identity** — a stable id for a background writer
  (`skip-trace-worker`, `quarantine-scanner`, …) so automated changes are
  attributable instead of anonymous.

## Ownership (final)

Mirrors `shared/data-domains.ts`. `entityTypes` are the audit `entity_type`
values that map onto each domain; every domain is audit-required.

| Domain | Owner (accountable) | Custodian | Tables | Audited entity types |
| --- | --- | --- | --- | --- |
| **program** — program / all domains | Benjamin (Owner) | Benjamin (Owner) | `audit_events`, `teams`, `team_members`, `users` | `audit_event`, `team`, `user` |
| **leads** | Sales Lead (Team Leader role) | Team Leader role | `leads`, `contacts`, `lead_notes`, `lead_scores`, `tasks`, `follow_ups` | `lead`, `contact`, `lead_note`, `task`, `follow_up` |
| **buyers** | Dispositions Lead (Dispositions Lead role) | Dispositions Lead role | `buyers`, `buyer_inquiries`, `buyer_outreach` | `buyer`, `buyer_inquiry`, `buyer_outreach` |
| **contracts** | Acquisitions Lead (Acquisitions Lead role) | Acquisitions Lead role | `contracts`, `contract_fields`, `offers` | `contract`, `contract_field`, `offer` |
| **documents** | Transaction Coordinator (Ops / TC role) | Ops / Transaction Coordinator role | `documents`, `contract_documents`, `document_versions`, `lois`, `vault_document_blobs` | `document`, `contract_document`, `document_version`, `loi` |
| **billing** | Finance / Owner role | Finance / Owner role | `commission_records`, `commission_payouts`, `invoices`, `payment_records` | `commission`, `commission_payout`, `invoice`, `payment` |

**Program-level owner:** Benjamin (confirmed). Domain owners are the standing
business roles; if a role is vacant, the program owner (Benjamin) is the interim
accountable owner for that domain.

### Operations that require the domain owner (or admin)

Approval-gated operations per domain are declared in `DATA_DOMAINS[…].approvalRequiredFor`
and evaluated by `canApproveDomainOperation()`:

- **leads** — bulk import, bulk stage/status change, quarantine restore
- **buyers** — bulk buyer import, outreach campaign enrollment
- **contracts** — contract void/termination, offer term change
- **documents** — template change, document deletion
- **billing** — payout approval, commission rate change
- **program** — retention policy change, role/permission change, cross-domain bulk export

Narrow roles (`finance`, `transaction_coordinator`) can only approve inside their
own domain; `owner`/`admin`/`manager`/`team_leader` are cross-domain approvers.
Bulk lead import approval continues to use Ticket 1's import approval gate.

## Immutable audit + metadata (implemented)

Every audited write goes through `server/services/audit/writeAuditEvent.ts`,
which now persists:

| Column | Meaning |
| --- | --- |
| `domain` | owning data domain id (`leads`, `buyers`, …), derived from `entity_type` when the caller omits it |
| `actor_kind` | `user` \| `service` \| `system` |
| `service_identity` | registered worker id when `actor_kind = 'service'` |
| `metadata_json` | non-secret context, plus `domainOwner` (the accountable role) and any `warnings` |

Rules enforced by the pure builder (`server/services/audit/audit-metadata.ts`):

1. An automated write is never attributed to a human: no `actorUserId` and no
   service identity ⇒ `actor_kind = 'system'` (+ warning), never `user`.
2. `actor_kind = 'service'` without a registered identity ⇒ falls back to the
   `audit-system` identity and is flagged in `metadata_json.warnings`.
3. An unknown `domain` value is rejected (warning) and the domain is derived
   from `entity_type` instead; an unmapped `entity_type` legitimately records
   `domain = NULL`.
4. `domainOwner` is stamped into the row so an operator reading raw audit data
   sees the accountable role without joining a registry.

Background writers use `recordServiceAuditEvent()`, which **throws** on an
unregistered service identity or domain, so a new worker cannot ship an
unattributable audit row. Wired today:

| Service identity | Where it writes | Domain |
| --- | --- | --- |
| `quarantine-scanner` | `POST /api/crm/quarantine/scan` → `quarantine_scan` | leads |
| `skip-trace-worker` | `POST /api/skip-trace/jobs`, `/:jobId/run`, `POST /api/leads/:id/skip-trace` → `skip_trace_completed` | leads |

Remaining identity ids (`crm-import-worker`, `campaign-scheduler`,
`telnyx-webhook`, `email-delivery-worker`, `automation-runner`,
`audit-system`) are registered and ready for their writers to adopt.

Unchanged: audit rows are append-only (no update/delete route), indexed by
`(entity_type, entity_id, created_at)` plus `(domain, created_at)` and
`(service_identity, created_at)`.

## Migration

`migrations/0079_audit_metadata.sql` adds the four columns and three indexes
(additive, idempotent; existing rows read as `actor_kind = 'user'`, which is the
correct historical interpretation). `server/app.ts` applies the same DDL
idempotently at startup so dev databases do not need a migration run.

## Approval

- [x] Domain owners assigned (role-based, above).
- [x] Program-level owner (Benjamin) confirmed.
- [x] Audit-required scope agreed: every domain; metadata fields implemented.
- [x] Service identities registered and enforced for automated writers.
