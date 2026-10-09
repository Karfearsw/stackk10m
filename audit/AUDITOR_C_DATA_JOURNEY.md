# AUDITOR C — Data Model + Realistic Deal Journey Audit

**Repo:** `~/workspace/builds/final-merge` (app root `FrameworkPlanner/`, branch `feat/phone-queue`)
**Audit start SHA:** `b1e543ce57a882bd9d4eaaeb59d5142c920431e9`
**Audit end SHA:** `a532f42a5494b680d4bb1e095e67f88ac55216ae` — the parallel build coordinator committed `feat(matchroom): integrate Phases 9-16` (mount investor routers, wire routes) mid-audit. Findings below reflect the tree at end-of-audit unless noted.
**Method:** read-only. Source never edited; no migrations run; no direct SQL writes. All DB-backed journey steps were attempted against a live dev server.

---

## 1. Direct answer: can a test deal go from lead to close today?

**NO — not end-to-end.** The journey is blocked at the infrastructure layer before any business logic runs:

| # | Step | Expected | Actual | Blocker |
|---|------|----------|--------|---------|
| 0 | Start dev server / obtain test session | `npm run dev` boots; signup or dev-bypass yields a session | **Server crashes at boot.** `npx tsx server/index-dev.ts` → `{"event":"db_url","kind":"missing"}` then `Error: No database host or connection string was set` from `@neondatabase/serverless` (`FrameworkPlanner/server/db.ts:160-165`, boot log 2026-10-09 18:03 UTC). No `DATABASE_URL` exists in this sandbox and none was supplied. | **No dev database.** Per standing context, the owner deprioritized a separate dev DB (Oct 7) and the only Neon instance is production — which this audit is forbidden to touch. |
| 0b | Substitute local Postgres | `DATABASE_URL=postgres://localhost/...` lets the app run | **Architecturally impossible without code changes.** The app uses `@neondatabase/serverless` `Pool`, which is **WebSocket-only** (it proxies to Neon's WS endpoint; see `node_modules/@neondatabase/serverless/index.js:955-961`). It cannot do plain-TCP to a local Postgres. Read-only constraint forbids swapping the driver. | Same as above. |

**Reproduction path (anyone can re-run):**
1. `cd ~/workspace/builds/final-merge/FrameworkPlanner`
2. `timeout 60 npx tsx server/index-dev.ts` (no `DATABASE_URL` set)
3. Observe `{"ts":"...","event":"db_url","kind":"missing"}` → uncaught `Error: No database host or connection string was set` at `server/db.ts:224`.

Because no step could execute against a live API, the journey table below is built from **endpoint-by-endpoint code tracing** (every route handler read) plus **executed verification of the pure business-logic units** (token issue/verify, scoring, merge fields, dedupe, stage/offer state machines — all actually run via `tsx`, results included). Nothing was invented: every endpoint named exists in `server/routes.ts`, `server/routes/esign.ts`, `server/routes/dispo.ts`, or the mounted investor routers.

**Per-step journey analysis (code-traced, ordered as the UI drives it):**

| Step | Expected | Actual (from code) | API calls (all exist) | Data re-entered | Errors | Workaround | Severity |
|------|----------|-------------------|----------------------|-----------------|--------|-----------|----------|
| 1. Create seller lead | POST creates lead; appears in GET /api/leads | ✅ Works in code. `POST /api/leads` (`server/routes.ts:5921`) validates via `insertLeadSchema`, **requires `source`** (400 if missing — the AUDIT-TEST payload must include `source`), computes `dedupeKey`, returns **409 on duplicate** (`server/routes.ts:~5943`). Writes `global_activity_logs` row. | 1 POST | None | None in code | n/a | — |
| 1b. Duplicate-lead detection | Second identical create rejected | ✅ Enforced: `SELECT id FROM leads WHERE dedupe_key = ...` → 409 `Duplicate lead: address and owner already exist`. Dedupe key = normalized `address\|city\|state\|zip\|ownerName` (`server/crm/import-export.ts:677`). **Verified executed:** case/whitespace normalization confirmed equal keys. | Same POST, expect 409 | None | None | n/a | — (race: check-then-insert, no unique constraint — two concurrent POSTs could double-insert; LOW) |
| 2. Qualify lead → matching fires | PATCH status → buyer matches persist | ✅ Auto-fires. `PATCH /api/leads/:id` (`server/routes.ts:5979`) → `onLeadStatusChanged` (`server/routes.ts:6029`) → `after === "qualified"` → `matchBuyersToLead` (`server/services/tasks/task-service.ts:198`) → raw-SQL INSERT into `lead_buyer_matches` (`server/services/buyerMatch/matchLead.ts:122-136`) + creates a "Dispo: N buyers match" task. **Caveat:** lead `status` is **not validated** against `LEAD_STAGES` on PATCH — any string accepted; a typo'd status silently skips matching. | 1 PATCH + `GET /api/leads/:id/buyer-matches` (`routes.ts:6608`) | None | None | n/a | MEDIUM (free-form status) |
| 3. Create investor buyer / buy box | Buyer with buy-box criteria scores against the lead | ⚠️ **Split brain.** The matcher (`matchLead.ts:60-100`) scores using the buyer's **inline columns** (`zipCodes`, `preferredAreas`, `minPrice/maxPrice`, `minBeds/maxBeds`, `propertyTypes`/`preferredPropertyTypes`) — **NOT** the `buyer_buybox` table and **NOT** the investor `buy_boxes` table (0099). **Verified executed:** in-box buyer → score **100** with reasons; out-of-box buyer → score **0** ("Outside their zip list"). Eligibility also requires `status='active'`, not `doNotCall`, `buyerStatus != 'do_not_contact'`. | `POST /api/buyers` then `POST /api/leads/:id/buyer-matches/recompute` (`routes.ts:6620`) | Buy-box criteria must be entered on the buyer row (inline fields); `buyer_buybox` rows are invisible to matching | `buyer_buybox` (Ticket 17) and investor `buy_boxes` are orphaned from the scoring engine | Use buyer inline fields only | **HIGH** — three buy-box concepts, one engine |
| 4. Create offer → versions persist | Offer v1, counter → v2 with history | ✅ `POST /api/opportunities/:id/offers` (`server/routes.ts:15038`) creates `buyer_offers` v1; `POST /api/buyer-offers/:id/counter` (`server/routes.ts:15081`) marks old `superseded=true`, creates v2 with `parentOfferId`. **BUT the journey needs a lead→opportunity conversion first** (`POST /api/leads/:id/convert-to-property`, `routes.ts:6097`) — the route comment claims "lead must be under_contract status" but **no such check exists in the handler** (comment/code mismatch). Also note: the disposition UI's "Offers" tracker writes to **`lois`** (verbal/loi_sent/accepted/dead), not `buyer_offers` — two different "offer" records depending on which UI surface you use. | 1 POST lead→property, 1 POST offer, 1 POST counter | Property created from lead fields | None | n/a | MEDIUM (duplicate offer concepts) |
| 5. Contract from template → merge fields | Template → document with populated fields | ✅ `POST /api/esign/envelopes` (`server/routes/esign.ts:89`) → `createEnvelopeFromTemplate` (`server/esign/envelopes.ts:211`) merges `{{placeholders}}` via `mergeTemplate` (`server/services/esign/merge.ts:13`), auto-creates a `contracts` anchor row + `contract_documents` row. **Verified executed:** `Dear {{sellerName}}…` → all fields populated. **Finding:** missing merge fields render as **empty string** ("Offer ." for `{{offerAmount}}` with no data) — no warning; contracts can go out with blank fields. | 1 POST (needs `templateId` + `mergeData.propertyId` or `contractId`) | Template content once | None | Always pass full mergeData | MEDIUM |
| 6. E-sign flow | Signer signs via link; envelope completes; no real outbound | ⚠️ **Sandbox-equivalent exists but is untested live.** Flow: create (no send) → token from create response → `POST /api/esign/sign/:token/sign` with `signatureType/typed` + `legalName` + `consent:true` → single signer → status `completed` → `finalizeEnvelope` sets `contracts.status='executed'` (`envelopes.ts:598`), writes hash-chained `contract_events`, generates signed PDF (Playwright/Chromium needed — `server/esign/pdf.ts:12`). **Outbound audit:** with no email provider configured (`TELNYX_API_KEY`/`RESEND_API_KEY` unset), `sendEmail` throws `NO_EMAIL_PROVIDER` *before any network call* and every e-sign notify path catches it (`server/esign/notify.ts:74-90`) — zero outbound. If providers *are* configured, completion triggers **real** invitation/completion emails (`notify.ts:179`, `envelopes.ts:495`); there is no dry-run flag. | create, sign, verify (`GET /api/esign/envelopes/:id/verify`) | Signer name + typed signature + consent | PDF step needs Chromium in env | Keep providers unconfigured in dev | MEDIUM |
| 7. Lock-up requires executed agreement | Gate rejects un-executed contracts | ✅ **Gate is sound in code.** `evaluateLockedUpGate` (`server/investor/lockedup.ts:182`) requires: executed agreement (envelope `completed` OR contract `executed`, not voided/expired) **AND** `signers.length > 0 && every signer 'signed'` **AND** effective/expiration/closing dates **AND** EMD amount+status. Faking via `POST /api/contracts/:id/execute` (which allows executing from `sent`/`viewed`/`partially_signed` without signatures, `routes.ts:10805-10817`) does **not** pass the gate — the signer check comes from the v2 envelope, not the contract row. ⚠️ **Reachability:** the lock endpoints live behind the **investor portal** (`/api/investor/locked-up/...`, `lockedup.ts:677-729`), require `INVESTOR_PORTAL_ENABLED=1` (default off) **and an investor session** (`requireInvestor`) whose buyer is linked to the contract. There is **no agent-side lock endpoint** — the wholesaler-side "close" is the contract-documents flow. | `GET /api/investor/locked-up/gate/contracts/:id`, `POST /api/investor/locked-up/deals` | Gate dates + EMD | None | n/a | — (design note, not bug) |
| 8. Close enforces requirements | Can't close without checklist | ✅ **On the document close path.** `POST /api/contract-documents/:id/close` (`server/routes.ts:11215`) rejects with `FEE_REQUIRED` / `CHECKLIST_INCOMPLETE` unless assignment fee + buyerPaid + titleReceived + fundsWired + docsRecorded; then writes/updates the `deal_assignments` ledger, advances opportunity to `sold`, logs events. ⚠️ **Two bypasses:** (a) generic `PATCH /api/opportunities/:id` sets `stage` directly with **no transition validation** (`routes.ts:6698` — only the dedicated `/stage-change` endpoint validates); (b) `canTransitionOpportunityStage` allows **any** non-terminal transition — `lead → closed` is legal (`shared/pipeline-stages.ts:219-226`, **verified executed**). The "evidence-based close" exists only on the document-close endpoint. | 1 POST (expect 400 without checklist, 200 with) | Closing figures | None | n/a | **HIGH** — stage machine is permissive; evidence gates bypassable |
| Activity timeline | Every step leaves a trail | ✅ `global_activity_logs` on lead create/update/contract send/close; `opportunity_events` on stage change/offer events; `contract_events` hash-chained audit on e-sign. | — | — | — | — | — |
| Second session / role visibility | Another user sees the same deal data | ❌ **Unverifiable without a DB.** Code shows no row-level team scoping on lead/buyer reads in the traced paths (reads are global; team scoping appears only on assignment + some writes). Flagged for live verification, not asserted. | — | — | — | — | MEDIUM (to verify) |

**Executed pure-logic verification results** (`npx tsx /tmp/audit-logic-test.ts`, 2026-10-09):
- E-sign HMAC tokens: issue → verify OK (claims round-trip); tampered token rejected.
- Scoring: in-box buyer = 100 ("In their zip 32801", "Within their $50,000–$200,000 band", …); out-of-box = 0 ("Outside their zip list").
- Merge: all fields populate; missing field → empty string, no warning.
- Dedupe: `AUDIT-TEST 123 Fake St` ≡ `audit-test  123 fake st` (case/whitespace normalized).
- Stage machine: `negotiating→under_contract` allowed; **`lead→closed` allowed**; `isValidStage('banana')` false.
- Offer machine: `verbal→loi_sent` allowed; `accepted→verbal` blocked; `isOfferStatus('received')` = false — the buyer_offers vocabulary (`received`) is **not** a dispo offer status (vocabulary collision confirmed in code).

---

## 2. Entity relationship map (concise)

Legend: PK = primary key · FKs listed as `col → table` (drizzle schema declares **zero** FKs — all FKs below come from migrations only) · (R)=required, (O)=optional.

### Core deal pipeline
| Table | PK | Key FKs (migrations) | R / O notes |
|---|---|---|---|
| `leads` | id | `assignedTo → users` (no FK), `firstOutreachBy → users` (FK, 0098) | address/city/state/zipCode/ownerName (R); phone/email/value (O); `status` free-form default `new` |
| `properties` (= opportunities) | id | `sourceLeadId → leads` (no FK), `assignedTo → users` (no FK) | address/city/state/zip (R); `stage` default `lead`, `opportunityStatus` default `active` — parallel status columns |
| `buyers` | id | `ownerUserId → users` (no FK), `user_id → users` (FK via 0080 DDL) | name (R); `status` free-form default `active` **+** `buyerStatus` (BUYER_PIPELINE, 10 values) **+** `buyer_qualification.relationship_stage` — three status vocabularies on one concept |
| `buyer_profiles` | id (= buyer row id, odd) | `userId → users` (no FK) | Investor-portal wizard fields (`property_types`, `price_min/max`, `notify_prefs` added by 0080 — **missing from shared-schema.ts**; the investor workstream keeps a parallel definition in `server/investor/schema.ts`) |
| `buyer_buybox` | id | `buyerId → buyers` UNIQUE (no FK) | Confirmed buy-box criteria; **not read by the matching engine** |
| `buyer_qualification` | id | `buyerId → buyers` UNIQUE (no FK) | `relationshipStage` free-form |
| `buyer_outreach_log` | id | `buyerId → buyers` (no FK) | Outreach attempts |
| `lead_buyer_matches` | id | `leadId → leads` ON DELETE CASCADE, `buyerId → buyers` ON DELETE CASCADE (0097), UNIQUE(lead,buyer) | Written by raw SQL in `matchLead.ts`; no drizzle usage |
| `deal_buyer_matches` | id | (no FKs) | Opportunity-scoped matches; used by investor store + dispo |
| `offers` (legacy seller offers) | id | `propertyId → properties`, `userId → users` (FKs added by later migration) | `status` free-form default `pending`; **no active UI** — the dispo "Offers" tracker writes to `lois` instead |
| `buyer_offers` | id | (no FKs) | Deal-execution offers; `status` ∈ {draft,received,countered,accepted,rejected,withdrawn,expired} (enforced on PATCH status only); `version`/`parentOfferId`/`superseded` versioning |
| `lois` | id | `envelopeId → contract_envelopes` (no FK) | Doubles as the dispo offer tracker (`status` ∈ verbal/loi_sent/accepted/dead) |
| `investor_offers` (0080) | id | (no FKs) | Portal offers; CHECK(submitted/under_review/accepted/countered/dead); `loi_id` |
| `offer_versions` (0101) | id | `offerId → offers` ON DELETE CASCADE | **Dead on arrival** — see §3.1 |

### Contract / e-sign
| Table | PK | Key FKs | Notes |
|---|---|---|---|
| `contracts` | id | (no FKs) | `status` free-form (pending/draft/sent/viewed/signed/partially_signed/ready_to_send/executed/closed…); 0102 adds `effective_date`, `expiration_date`, `closing_date`, `emd_amount`, `emd_status`, `locked_up_at` — **these 0102 columns are missing from shared-schema.ts** |
| `contract_templates` | id | `parentTemplateId → contract_templates` (no FK) | `content` + `mergeFields[]`; governance: version/approvedBy/status |
| `contract_documents` | id | (no FKs) | Older document-centric model; `status` draft/sent/executed/closed; **close-checklist lives here** |
| `document_versions` | id | `documentId` (no FK) | Version history for contract_documents |
| `contract_envelopes` | id | `contractId → contracts` ON DELETE SET NULL (0081); `documentId` (no FK) | v1 (tokenHash on envelope) + v2 (esign_version=2, per-signer HMAC) |
| `contract_signers` | id | **none** (`contract_id`, `envelope_id` plain integers — 0102) | Single-use HMAC tokens; deleting a contract orphans signers |
| `contract_events` | id | **none** (`contract_id` plain integer — 0081) | SHA-256 hash-chained audit |
| `contract_fields` | id | (no FK) | Per-contract custom fields |
| `contract_reminders` (0102) | id | `contract_id → contracts` ON DELETE CASCADE | Records only; no scheduler built |
| `deal_assignments` | id | `propertyId → properties`, `buyerId → buyers`, `contractId → contracts` (FKs) | Payout ledger; checklist booleans; **no server-side ordering enforcement** on create/PATCH |
| `locked_up_deals` (0102) | id | `property_id → properties` ON DELETE CASCADE, `contract_id → contracts` ON DELETE SET NULL | `stage` ∈ awaiting_deposit/due_diligence/title/funding/ready_to_close/closed/at_risk (comment-only, no CHECK) |
| `deal_conditions` (0102) | id | `locked_up_deal_id → locked_up_deals` ON DELETE CASCADE | open/met/waived (comment-only) |

### Investor portal (0099/0100/0101; flag-gated, investor session)
| Table | PK | Key FKs | Notes |
|---|---|---|---|
| `investor_profiles` (0099) | id | `investor_user_id → users` UNIQUE ON DELETE CASCADE | **Not in shared-schema.ts**; raw-SQL only |
| `buy_boxes` (0099) | id | `investor_id → users` ON DELETE CASCADE | Named buy boxes; **not read by the matching engine** |
| `buy_box_match_history` (0099) | — | — | Scored matches per buy box |
| `investor_deal_interactions` (0080) | id | (no FKs) | Swipe interested/pass; CHECK(action) |
| `deal_interactions` (0100) | id (bigint) | (no FKs) | Richer interaction log; CHECK(action ∈ viewed/saved/passed/interested/offer_submitted) — **parallel table to investor_deal_interactions** |
| `deal_interests` (0101) | id | `investor_user_id → users`, `property_id → properties` (CASCADE) | 16-value CHECK status lifecycle |
| `deal_rooms` / `deal_room_participants` / `deal_room_messages` / `deal_room_tasks` / `deal_room_files` / `deal_room_showings` (0101) | id | CASCADE chains to deal_rooms | Mutual-match rooms; **not in shared-schema.ts** |

### Comms / activity
| Table | PK | Notes |
|---|---|---|
| `call_logs` (legacy) / `crm_call_sessions` (+`crm_call_session_events`, `crm_call_dispositions`, `crm_ai_call_qualifications`) | id | Two parallel call models; 0096 made sessions the note source of truth |
| `crm_sms_messages` | id | SMS threads (leadId/buyerId) |
| `internal_messages` | id | Team chat |
| `buyer_communications` | id | Buyer comms log |
| `global_activity_logs` / `team_activity_logs` / `opportunity_events` / `audit_events` / `task_audit` / `auth_audit_logs` | id | Overlapping audit trails (see §3.1) |
| `notifications` (0098, bell) / `user_notifications` (older) | id | Two in-app notification tables |
| `tasks` (+`task_sla_rules`, `task_audit`) | id | `status` free-form default `open` |
| `calendar_events` | id | Meetings |

### Money / people (mostly peripheral to the journey)
`commission_events`, `commission_ledger_entries`, `commission_snapshots`, `deal_participants`, `approval_events`, `timesheet_entries`, `time_clock_sessions`, `worker_profiles`, `category_rate_overrides`, `pay_periods`, `work_categories`, `user_goals`, `campaigns` (+recipients/messages/runs/steps/enrollments/deliveries), `rvm_*`, `xp_*` (dead, see §3.3), `documents`/`document_links`/`vault_document_versions`, `stored_files`, `provisioned_emails`, `email_forwards`, `onboarding_checklist`, `assignment_rules`/`assignment_log`/`user_capacity`, `skip_trace_*`, `comp_snapshots`/`comp_snapshot_rows`, `property_units`, `lead_notes`, `saved_views`, `contacts`, `companies`/`company_people`/`company_links`, `opportunity_parties`, `public_listings`, `buyer_inquiries`, `video_meetings` (+participants/events — dead), `user_feature_flags`, `user_widget_layouts`, `app_settings`, `storage_config` (dead), `docs_categories`/`docs_pages`, `automations` (+triggers/conditions/actions/runs), `ai_action_logs`/`ai_action_undo`, `app_audit_runs`/`app_audit_findings`, `crm_import_jobs`/`crm_import_job_errors`, `crm_export_files`, `quarantined_records`, `lead_score_snapshots`, `lead_source_options`, `lead_bulk_action_jobs`, `field_media_assets`, `sync_idempotency`, `underwriting_templates`, `playground_property_sessions`, `call_media`, `call_notes`, `number_reputation`, `agentPhoneSettings` (`crm_agent_phone_settings`), `password_reset_tokens`, `auth_magic_links`, `backup_codes`, `twoFactorAuth`.

---

## 3. Data-model findings

### 3.1 Duplicate concepts with different names — HIGH
1. **`offers` ×5.** (a) Legacy seller `offers` table (`status` free-form, default `pending`) — **no active UI** (dispo tracker writes to `lois`). (b) `buyer_offers` (deal execution, versioned). (c) Dispo "offers" = `lois` rows with `OFFER_STATUSES` verbal/loi_sent/accepted/dead (`shared/dispo-stages.ts:81`, enforced `server/routes/dispo.ts:351-406`). (d) `investor_offers` (0080, CHECK submitted/under_review/accepted/countered/dead). (e) **Migration 0101 `CREATE TABLE IF NOT EXISTS offers` is a silent no-op**: the table already existed, so its `deal_room_id`/`investor_user_id` columns and its 9-value status CHECK were **never applied** (`migrations/0101_dealrooms_offers.sql:133`). Any deal-room offer code written against the 0101 shape will fail at runtime. Buyer can have the "same" offer in up to 4 tables.
2. **Buy boxes ×3.** `buyers.*` inline fields (the only ones the matcher reads) vs `buyer_buybox` (Ticket 17, confirmed criteria — invisible to matching) vs `buy_boxes` (0099, investor named boxes — invisible to matching).
3. **Buyer status ×3.** `buyers.status` (free-form, default `active`) vs `buyers.buyerStatus` (`BUYER_PIPELINE`, 10 values) vs `buyer_qualification.relationship_stage` (free-form). The generic `PATCH /api/buyers/:id` accepts any `buyerStatus` string (`server/routes.ts:16024`).
4. **Contract models ×2.** `contracts` (newer, envelope-anchored) vs `contract_documents` (older; owns the close-checklist). v2 e-sign writes both.
5. **Interaction logs ×2.** `investor_deal_interactions` (0080: interested/pass) vs `deal_interactions` (0100: 5 actions) — the 0100 migration itself notes 0080's table is "left untouched for compatibility."
6. **Notifications ×2.** `user_notifications` (older) vs `notifications` (0098 bell). **Activity logs ×4.** `global_activity_logs` vs `team_activity_logs` vs `audit_events` vs `opportunity_events` (+ `task_audit`, `auth_audit_logs`).
7. **Call models ×2.** `call_logs` vs `crm_call_sessions` (+ events/dispositions).
8. **Schema definitions ×3.** `server/shared-schema.ts` (canonical, used) vs `shared/schema.ts` (**orphan — zero imports anywhere**, 1025 lines, stale) vs `server/investor/schema.ts` (parallel drizzle defs for `buyer_profiles` etc. with columns the shared schema lacks).

### 3.2 Missing FKs — HIGH
- `server/shared-schema.ts` declares **zero** `.references()` — every FK lives only in migrations, and coverage is patchy. Missing FKs (plain integer columns): `contract_signers.contract_id`, `contract_signers.envelope_id`, `contract_events.contract_id`, `lois.envelopeId`, `contracts.propertyId/buyerId/sellerId/leadId/opportunityId`, `buyer_offers.*`, `lead_notes.lead_id`, `buyer_communications.buyer_id`, `deal_buyer_matches.*`, `buyer_buybox.buyer_id`, `buyer_qualification.buyer_id`.
- `contract_signers` (0102) was created **without any REFERENCES** — the newest e-sign table has the weakest integrity.
- Schema/drift: **0080 added** `users.investor_status`, `users.investor_rejected_reason`, `buyers.user_id`, and 6 wizard columns on `buyer_profiles`; **0102 added** 10 lock-up columns on `contracts`; **0099/0100/0101/0102 tables are entirely absent from shared-schema.ts**. The drizzle model no longer describes the physical DB. (The app papers over some of this with DDL-fallback `pool.query` ALTERs at startup — `server/app.ts:565-577` — which is itself a schema-management smell.)

### 3.3 Tables with no active code paths — MEDIUM
Genuinely dead (no drizzle-identifier use, no raw-SQL use, no client use): `video_meetings`, `video_meeting_participants`, `video_meeting_events` (only referenced as a feature-flag key string in `provider-readiness.ts:318`), `storage_config`. The entire XP-booking surface (`xp_experiences`, `xp_time_slots`, `xp_blackouts`, `xp_bookings`, `xp_stripe_events`, `xp_locations`, `xp_vehicles`, `xp_booking_assignments`, `xp_booking_notes`) has **zero server references outside the schema file** — the CRM repo carries a dead booking module (consistent with xp_ocean_luxe living in its own repo).

### 3.4 Status string disagreements (frontend vs backend) — MEDIUM
- `client/src/pages/properties.tsx:1181` renders a progress bar from a hardcoded legacy list `["active","negotiation","under_contract","closed"]` against **`prop.status` — a column that doesn't exist on opportunities** (the field is `stage`); `"active"` isn't a stage at all and `"negotiation"` is the lead-stage spelling (opportunity uses `"negotiating"`). The bar always falls back to "active."
- `client/src/pages/property-detail.tsx:3416` `INQUIRY_STATUS_OPTIONS` includes `offer_received/won/spam` — no shared constant; `buyer_inquiries.status` is free-form.
- `client/src/investor/lockedup/LockedUpPage.tsx:23` treats `accepted`/`executed`/`under_contract` as contract states ad hoc.
- Backend: lead `status`, buyer `status`/`buyerStatus` (via generic PATCH), `contracts.status`, `contract_envelopes.status`, `tasks.status`, `campaigns.status` are all free-form varchars; only `buyer_offers` status (PATCH only), dispo offer status, `deal_interests`/`deal_rooms` (CHECK constraints in 0101), and opportunity `stage` (dedicated endpoint only) are constrained.

### 3.5 Free-form strings that should be enums — MEDIUM
`leads.status` (drives auto-matching — a typo silently disables it), `buyers.buyerStatus` (generic PATCH path), `contracts.status` (the execute endpoint alone accepts 5 different pre-states), `contract_envelopes.status`, `tasks.status`, `buyer_qualification.relationship_stage`, `locked_up_deals.stage` / `deal_conditions.status` (comment-documented values, no CHECK).

### 3.6 Optional fields that should be required at later stages — MEDIUM
- `contracts.amount`/`purchasePrice` optional — needed for any close math; nothing requires them before `execute`.
- `leads.estimatedValue` optional — the matcher degrades silently without it.
- `deal_assignments`: `purchasePrice`, `assignedPrice`, `assignmentFee`, `titleCompany`, `closingDate` all optional; the ledger accepts a "closed" row with no money fields via generic POST/PATCH.
- `POST /api/contracts/:id/execute` sets `signedAt = now()` if missing (`routes.ts:10817`) — execution can be recorded with no actual signature timestamp.
- E-sign merge: missing `{{fields}}` render as empty string with no warning (verified) — contracts can be generated with blank price/date fields.

### 3.7 Orphaned-record risks — HIGH
- `DELETE /api/contracts/:id` → `storage.deleteContract` is a bare `db.delete(contracts)` (`server/storage.ts:2117`): **orphans** `contract_signers`, `contract_envelopes` (rows with contract_id SET NULL survive as ghosts), `contract_events`, `contract_fields`, `contract_reminders`.
- `DELETE /api/leads/:id` → bare delete (`server/storage.ts:1126`): **orphans** `lead_notes` (no FK); `lead_buyer_matches` cascades (0097 FK) — inconsistent.
- No `ON DELETE` or app cleanup on: `lead_notes`, `buyer_communications`, `call_logs`, `lois`, `contract_events`, `buyer_offers`, `document_versions`.

---

## 4. Full deal-journey table

See §1 (the journey table). Summary of severities from the journey:

| # | Finding | Severity |
|---|---------|----------|
| J-0 | **No dev database in this environment; app is Neon-WebSocket-only, so no local substitute. Deal journey cannot execute end-to-end.** Repro: `npx tsx server/index-dev.ts` → `db_url missing` → Neon driver throws (`server/db.ts:160`). | **BLOCKER** |
| J-1 | Lead creation, 409 dedupe, qualify→auto-match→`lead_buyer_matches`, activity logging: all sound in code; pure units verified executed | — |
| J-2 | `leads.status` free-form on PATCH — typo'd status silently skips buyer matching | MEDIUM |
| J-3 | Matcher reads only buyer inline buy-box fields; `buyer_buybox` and investor `buy_boxes` invisible to it (verified: 100 vs 0 scores) | HIGH |
| J-4 | Lead→opportunity conversion comment claims "must be under_contract" — no such check in code | MEDIUM |
| J-5 | Two "offer" records (buyer_offers vs lois) depending on UI surface; migration 0101's `offers` DDL never applied | HIGH |
| J-6 | E-sign v2 complete in code; zero-outbound safe only when no email provider configured (throws `NO_EMAIL_PROVIDER` pre-send); no dry-run flag; completion sends real emails when configured | MEDIUM |
| J-7 | Locked-up gate is genuinely strict (executed + all signers signed + dates + EMD) and resists the `execute`-without-signatures shortcut; but lock endpoints are investor-portal-only (flag + investor session), no agent-side equivalent | — (design note) |
| J-8 | Close checklist enforced on document-close; **bypassed** by generic opportunity PATCH + permissive stage machine (`lead→closed` legal, verified) | HIGH |
| J-9 | Missing merge fields render blank with no warning | MEDIUM |
| J-10 | Second-session/role visibility unverifiable without DB; reads show no row-level team scoping on leads/buyers | MEDIUM (verify live) |

**Blocked steps (per hard constraints — documented, not bypassed):**
- **All DB-backed steps** (lead create → close): blocked by J-0. Not bypassed via direct SQL writes per instructions.
- **E-sign completion with providers configured**: would trigger real outbound email (`server/esign/notify.ts:179`, `server/esign/envelopes.ts:495`) — in a configured environment this step must be treated as blocked or run against unconfigured providers only. No real SMS/calls, emails, or legal documents were touched by this audit.

---

## 5. Files & evidence index

- Schema: `FrameworkPlanner/server/shared-schema.ts` (2794 lines, 141 tables, 0 FK declarations)
- Orphan schema: `FrameworkPlanner/shared/schema.ts` (0 imports) · parallel defs: `FrameworkPlanner/server/investor/schema.ts`
- Migrations: `FrameworkPlanner/migrations/0096_call_session_note.sql` … `0102_lockedup_contracts.sql`; 0101 no-op `offers` at `:133`
- Routes: `FrameworkPlanner/server/routes.ts` (leads 5921/5979/6029/6097, dedupe ~5943, offers 15025/15038/15081/15116, contracts 10531/10697/10805/11154/11215/11343/11546); `server/routes/esign.ts` (v2, mounted `server/app.ts:621`); `server/routes/dispo.ts` (offer tracker → lois, 351/400); investor routers mounted `server/investor/router.ts:405-435` (flag-gated `server/investor/flag.ts`)
- Logic: `server/services/buyerMatch/matchLead.ts` + `scoring.ts:48`; `server/services/tasks/task-service.ts:164-215`; `server/services/esign/merge.ts:13`; `server/esign/envelopes.ts` (211/327/422/518/598), `tokens.ts`, `notify.ts:68-90,179`; `server/investor/lockedup.ts:182` (gate); `shared/pipeline-stages.ts:219` (permissive machine); `shared/dispo-stages.ts:81`
- Executed logic test: `/tmp/audit-logic-test.ts` (ephemeral; rerunnable) — tokens, scoring (100/0), merge, dedupe, stage/offer machines
- Boot failure evidence: `npx tsx server/index-dev.ts` → `{"event":"db_url","kind":"missing"}` + Neon driver `Error: No database host…` at `server/db.ts:224`

**Recommended next actions for the parent:** (1) provision a Neon dev branch (or `TEST_DATABASE_URL`) so the journey can actually run — currently no auditor can execute it; (2) fix the 0101 `offers` no-op before any deal-room offer code ships; (3) unify the three buy-box concepts behind the matcher; (4) constrain `leads.status`/`buyers.buyerStatus` to their canonical enums on all write paths; (5) close the generic-PATCH stage bypass or accept it as designed; (6) add the missing 0080/0099–0102 columns and tables to `shared-schema.ts` (or adopt the investor workstream's split-schema model explicitly).
