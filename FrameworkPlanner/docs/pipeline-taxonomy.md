# Pipeline Stage Taxonomy (Ticket 7)

Status: **proposed — pending owner approval.** The code now enforces one
taxonomy end to end; the id/label set below is the candidate the owner signs off
on. Until then, treat this as the single source of truth in code.

Single source of truth: `shared/pipeline-stages.ts` (imported by the server as
`../shared/pipeline-stages.js` and by the client as `@shared/pipeline-stages`).

## Why

Three vocabularies could disagree about the same deal, which hid stalled leads:

1. Lead statuses on the leads board.
2. Opportunity stages in the deal room.
3. A dashboard summary bar with an ad-hoc `{lead, negotiation, contract, closed}`
   vocabulary that counted a mix of property status and contract documents.

## Canonical stages

### Lead pipeline (`leads.status`)

`new` · `contacted` · `qualified` · `negotiation` · `under_contract` · `closed` · `lost`

### Opportunity pipeline (`properties.stage`)

`lead` · `contacted` · `negotiating` · `under_contract` · `in_disposition` ·
`reserved` · `sold` · `closed` · `dead` · `voided`

Transition rule: `dead` and `voided` are terminal (only a new record leaves
them); every other transition is allowed, including the reversible
`closed ↔ sold`.

## What consumes it

- `server/routes.ts` — `OPPORTUNITY_STAGES` / `OPPORTUNITY_STAGE_CONFIG` /
  `isValidStage` / `canTransitionStage` are re-exported from the shared module.
- `server` `GET/PUT /api/pipeline-config` — returns the canonical default when a
  user has not configured columns, normalizes known legacy values, and rejects
  unknown stage ids (400 + `rejected`) instead of persisting them.
- `client` `leads.tsx`, `properties.tsx`, `lib/automation-wizard.ts`,
  `components/dashboard/PipelineBar.tsx` — all import the shared lists, so a
  stage has one id and label everywhere.

## Migration `0077_pipeline_stage_unification.sql`

Non-destructive normalization of legacy values for `properties.stage` and
`leads.status`. It never deletes rows. The exception report at the bottom of the
file lists any value that could not be mapped — run it and review before any
follow-up. Stored `pipeline_configs` rows are normalized on read/write by the
API, so no JSON rewrite is required.

## Owner approval checklist

- [ ] Confirm the lead stage set (especially whether `lost` replaces `dead`).
- [ ] Confirm the opportunity stage set (10 stages above).
- [ ] Approve running migration `0077` against production (PRODUCTION STOP).
