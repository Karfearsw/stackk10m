# Data Ownership — DRAFT (Ticket 4)

> **STATUS: DRAFT — PENDING OWNER APPROVAL. DO NOT FINALIZE.**
> This proposes accountable owners for the CRM's core data domains. It is not
> binding and no enforcement code depends on it yet. Review, edit the
> `Proposed owner` column, and approve or reject each row before it is adopted.

## Why

The audit found data that nobody is accountable for (10,665 leads, 100%
unassigned; 166 buyers with zero outreach). Naming an owner per domain gives a
single accountable person for quality, access, retention, and escalation, and
gives the immutable audit trail a subject to record against.

## Terminology

- **Accountable owner** — the one person answerable for the domain's quality and
  access decisions (approves who can read/write, signs off on bulk changes).
- **Custodian** — the person/role who performs day-to-day upkeep.
- **Accountable** and **Custodian** may be the same person for small domains.

## Proposed ownership

| Domain | Data | Proposed owner (accountable) | Custodian | Notes |
| --- | --- | --- | --- | --- |
| **Program / all domains** | Cross-domain policy, retention, access | **Benjamin** | Benjamin | Named by the owner as the overall data owner. |
| **Leads** | `leads`, `contacts`, lead notes, tasks, follow-ups | `<confirm: Sales lead / Team Leader>` | Team Leader | Highest-volume domain; drives unassigned/overdue task cleanup. |
| **Buyers** | `buyers`, `buyer_inquiries`, buyer outreach | `<confirm: Dispositions lead>` | Dispositions lead | Owns the 166 zero-outreach buyers. |
| **Contracts** | `contracts`, `offers`, `contract_fields` | `<confirm: Acquisitions lead>` | Acquisitions lead | Owns offer terms and contract-stage integrity. |
| **Documents** | `documents`, `contract_documents`, `document_versions`, `lois`, media vault | `<confirm: Ops / Transaction Coordinator>` | Ops / TC | Owns templates, versioning, and signed-document retention. |
| **Billing** | `commission_*`, invoices/payment records, Stripe ledger | `<confirm: Finance / Owner>` | Finance / Owner | Sensitive: restricts to finance roles. |

### Questions for the owner

1. Confirm **Benjamin** as accountable for the program-level policy row.
2. Fill in the four `<confirm: …>` owners (leads, buyers, contracts, documents,
   billing) — role or individual.
3. Should Documents and Contracts share one owner, or stay separate?
4. Approve the audit scope: which of these domains get mandatory immutable
   `audit_events` entries on create/update/delete (see below).

## Immutable audit (proposed, not yet enforced)

Existing infrastructure to build on (no new mechanism needed):
- `audit_events` table + `server/services/audit/writeAuditEvent.ts`
  (`teamId`, `actorUserId`, `entityType`, `entityId`, `action`,
  `beforeJson`/`afterJson`/`diffJson`, `ip`, `userAgent`, `requestId`, `kind`).

Proposed enforcement once owners are confirmed:
- Every create/update/delete on an owned domain writes an `audit_events` row
  tagged with the domain's accountable owner.
- Bulk operations (import, quarantine restore, purge) require the domain owner
  or an admin (reuse the role checks from Ticket 1's import approval gate).
- Audit rows are append-only (no update/delete route) and indexed by
  `(entity_type, entity_id, created_at)`.

## Approval

- [ ] All `<confirm>` owners filled in.
- [ ] Program-level owner (Benjamin) confirmed.
- [ ] Audit scope for each domain agreed.
- [ ] Approved by owner on: ______________________
