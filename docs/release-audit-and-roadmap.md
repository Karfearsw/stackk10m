# OceanLuxe CRM — Deep AI Prompt, Development Process & Release Development Plan (RDP)

> Master document for the systematic product audit and repair release of the OceanLuxe CRM / FrameworkPlanner.
> This file is both the **runnable prompt** an engineering agent can be handed, the **software development process** to follow, and the **Release Development Plan (RDP)** with quality gates and release decision criteria.
>
> Source inputs: the 12-phase mission specification (Phase 0–12 below) and the QA walkthrough transcript (recorded from the dashboard walkthrough — "Testing, testing, 1 2 3…"). The transcript confirms, prioritizes, and sharpens the mission; where they differ, the transcript's specifics win for Phase 1–3 scope, and everything is governed by the Operating Rules.

---

## Part A — THE DEEP AI PROMPT (paste this block)

You are the **Principal Product Engineer, QA Lead, and Technical Program Manager** for OceanLuxe CRM / FrameworkPlanner, a real-estate wholesaling / investor operating system.

Repository: `FrameworkPlanner` (Express + Vite + React + Postgres/Neon, `npm` workspaces: root scripts delegate via `npm --prefix FrameworkPlanner run …`).

### Mission

Conduct a systematic product audit and repair release. Implement fixes, improvements, data-integrity checks, and workflow refinements so that every existing CRM page, button, workflow, integration, and database-driven widget functions reliably, uses current data, gives clear user feedback, and behaves as one unified operating system.

### Release goals (primary)

1. Fix all broken or incomplete existing features before adding large new modules.
2. No page renders as a blank shell, no unhandled exceptions, no inaccessible controls, no dead buttons.
3. All primary data is persistent and current from the database.
4. Workflows connect logically: **Lead → Opportunity → Contract → Disposition/Buyer → Closing**.
5. Communication, notifications, scheduling, tasks, contracts, files, automation, analytics are connected to the CRM record they relate to.
6. Preserve existing architecture; make safe, surgical changes rather than duplicating modules.
7. Never fake "working" states — a button either works end-to-end or gives a clear, actionable error.
8. Quality gates at the end of every phase: TypeScript, tests, dev server, API smoke tests, database checks, browser/UI verification.

### Operating rules

- Record `git status` before editing. Do not clobber or discard changes you did not make.
- Do not print, expose, rewrite, or commit secrets from `.env`.
- Do not delete production/user records, documents, contracts, activities, or communications.
- Use migrations for schema changes and preserve existing data.
- Do not hide defects by disabling buttons or hard-coding optimistic success messages.
- Reuse existing services, storage abstractions, API clients, query hooks, auth, documents, telephony, and notification systems.
- Use role-based permissions for admin-only settings and sensitive operational actions.
- Add clear loading, empty, success, validation, and error states.
- Log diagnostic detail server-side; display safe, helpful messages client-side.
- When an external provider is unavailable or misconfigured, distinguish that from an application bug.
- **Team cleanup rule:** never delete accounts blindly — identify ownership/activity dependencies first, reassign owned records if necessary, prefer deactivate/archive with audit log, and only permanently delete if safe and explicitly approved.
- **Document the work:** every issue goes into the Issue Ledger (§ Part C) with area/route, reproduction steps, console error, failing network request/response, server log, root cause, files changed, test/verification performed, and final state (fixed / blocked by configuration / deferred).

### Consolidated phases (transcript-sharpened)

#### Phase 0 — Baseline & quality gates
- `npm install`; `npx tsc --noEmit`; run existing tests; `npm run dev` (start with `PORT=3000` — the sandbox exports `PORT=0` which overrides `.env`; see `.freebuff/run.md`).
- Inspect: browser console errors, failed network calls, server-side errors, database connectivity, auth/permissions, route loading, lazy imports, error boundaries, query-provider behavior.
- Add or improve a development-safe error boundary: friendly error state, retry action, route name, safe diagnostic ID; no secrets or raw stack traces in production.
- Confirm dashboard/query widgets use current DB data, not stale mock data or disconnected local state.

#### Phase 1 — Dashboard (`/`)
Preserve structure: banner/hero, Leads/Negotiations/Contracts/Closers, main action row (Add Lead, Start Dialing, Resume Playground, New Contracts, View Hot Leads), revenue/closed deals, active leads, deal pipeline, conversion rate, attention-now, property overview, team members.

- **1A Banner:** Settings → Appearance → Dashboard Banner. Admin can upload/select multiple images, reorder, **remove default images** (not just add), toggle active/inactive per image, and disable/hide the banner entirely. Safe image storage, URL generation, cache busting, permission checks, deletion. Fallback default only if configured.
- **1B Actions:** Add Lead opens a working creation flow that saves to DB and refreshes dashboard stats. Start Dialing navigates to the Phone/Dialer workspace and must **NOT** immediately place a call. Resume Playground restores the most recently saved Playground session; if none, show an intentional empty state with "Start new playground" (no dead button). New Contracts navigates to Contracts filtered for drafts/new records without crashing. View Hot Leads navigates to Leads with the real hot-lead filter (based on real scoring/urgency data).
- **1C Team members cleanup:** combine multiple auto-test accounts into ONE approved auto-tester; keep ONE admin and ONE agent; remove/archive TT agent test accounts and the smoke-test user; keep all legitimate regular users/agents/members. Deactivate/archive with audit log; reassign owned records first; never blind-delete.
- **1D Data integrity:** Property Overview, revenue, active leads, pipeline, conversion rate, attention-now, team widgets query the real DB; graceful empty states; consistent date windows/definitions across widgets. Document exact formulas (below).

#### Phase 2 — Leads (`/leads`, lead detail/drawer)
- Convert-to-Opportunity action from list and detail; confirmation shows what carries over (property, owner/seller contacts, notes, tasks, communications, tags, source, score, documents where appropriate); guard against duplicate opportunities for the same lead/property; offer "Open existing opportunity".
- Lead detail side panel loads all data; user can edit key fields in the panel or navigate to the Deal Room/Opportunity detail; no read-only dead-ends. Direct actions: edit, call, SMS, email, add task, add note, skip trace, convert to opportunity, open deal room.
- Skip Trace "Both" (+ phone-only / email-only modes): grayed/disabled controls must have a reason and activate when prerequisites are met; contact, phone, email, evidence, progress, total score, urgency, RELAS/motivation score populated from real data; persist every result + timestamp; show provider/source, confidence, result state; handle no-hit/partial-hit/error/rate-limited cleanly. If scoring formulas are missing, propose a documented formula (vacancy, owner occupancy, out-of-state owner, tax delinquency, equity, quick-sale request, contactability, campaign engagement, recent activity) with score evidence and scoring date — never fabricate data.

#### Phase 3 — Opportunities (`/opportunities`, `/opportunities/:id`, plus `/l/{token}` public listings)
- **Repair Add Property:** must create/select/link a Property record and update opportunity state immediately; fix property picker/modal/API/validation/duplicate handling/query invalidation; properties usable in contract workflows.
- **Deal room upgrade (not replacement):** header (property/title, stage/status, owner, quick actions: call/SMS/email/generate contract/create public listing/add note/add task/change stage); tabs (Overview, Parties, Property & Analysis, Contracts & Documents, Communications/Activity, Tasks, Buyer Matches, Public Listing, Buyer Inquiries/Offers); financials (purchase price, asking/disposition, earnest money, repair estimate, ARV, assignment fee, projected profit, inspection deadline, closing date); pipeline (lead → contacted → negotiating → under_contract → in_disposition → reserved → sold → closed → dead → voided) with activity/audit on every stage change, confirmation when skipping key stages, idempotent workflows, no overwriting later stages.
- **Public investor listings:** agent chooses visibility (public / link-only / password-protected), title, description, photos, what to show (address/map/comps/financials/documents), CTA text, agent contact, expiration; generates secure share URL (`/l/{token}`); preview/publish/pause/archive/regenerate link/copy link. Public page: no login, branded, mobile responsive, inquiry form (name, email, phone, company optional, buyer type, message, optional offer amount, optional proof-of-funds upload, consent checkbox), view/unique-visitor/inquiry/last-viewed tracking, rate limiting + spam protection, no sensitive-data exposure, no-index for link-only/password-protected.
- **Buyer inquiries & offers:** BuyerInquiry records (status: new/contacted/qualified/offer received/negotiating/won/lost) linked to opportunity + listing; notify owner + create follow-up task; convert to buyer contact/opportunity member. BuyerOffer records (offer price, EMD, terms, financing, close-by date, notes, status); on accepted offer move opportunity to reserved/sold and create closing tasks.

#### Phase 4 — Contacts & Buyers (`/contacts`, buyers routes)
- Keep working functionality; verify data is DB-backed and current; buyers linkable to opportunities; from a buyer record: view matching opportunities, send public listing, send SMS/email, log interest, create an offer. No regressions.

#### Phase 5 — Settings (`/settings`)
- **Notifications:** preferences persist to DB; task reminders, new lead assignment, new buyer inquiry, opportunity stage change, contract sent/viewed/signed, missed call/voicemail, mention/team alerts; users only receive what they're authorized for; notification center/badges/preferences in sync; read/unread with reliable marking.
- **Security:** 2FA enrollment, TOTP flow, backup/recovery codes (one-time display, download/copy, hashed storage, regeneration/invalidation), login challenge, verification, disable-with-password flow, rate limits, session revocation, audit events; never store plain recovery codes.
- **Account & Teams:** preserve working behavior; audit save/update, permissions, validation, invites, role editing, team assignment.
- **Goals & Offers:** remove "Offers" from Goals; make offers a dedicated side-nav page **or** exclusively part of Opportunity detail / Buyer Inquiry — one canonical source of truth. Preserve Goals.
- **Appearance:** banner image management (upload multiple, remove defaults, reorder, enable/disable, disable entirely); retain custom quotes and existing appearance options.
- **System:** three separate controls with their own result areas — (1) Open System Health, (2) Run Telnyx Diagnostic, (3) Configure/Test Skip Trace Wizard. Telnyx diagnostic distinguishes: missing config / unreachable provider / invalid API key / invalid Call Control app/connection / unavailable messaging profile / reachable+configured. Skip Trace wizard: guided setup, provider validation, test lookup, rate/cost awareness, error feedback. Never display secrets.

#### Phase 6 — Communications, Telnyx, dialer, internal messaging (`/phone`, `/dialer-workspace`)
- **Telnyx readiness:** structured provider status — reachable/unreachable/degraded, Call Control connection active, messaging profile readiness, available from-numbers, config errors without secrets. Never show "Connected" just because a local hook loaded. Power dialer opens from dashboard Start Dialing; frontend field names match backend contracts; default from-number valid and assigned.
- **Dialer/phone:** open workspace without placing a call; manual dial + power dial; power-dial advances only per a safe configured rule (default: after disposition/save log); call states idle/dialing/ringing/active/ended/failed; call logs, dispositions, notes, callback tasks, recordings if configured; hangup via returned Call Control ID; UI never stuck on ringing/dialing after errors.
- **SMS + internal messaging:** SMS to CRM contacts from Phone/Opportunity/Lead/Contact contexts; internal team messages between members; internal vs external SMS kept distinct in a coherent communications UI; stored, permissioned, delivery errors shown, activities linked; inbound SMS logging if configured; consent/opt-out compliance for external SMS.
- **Communication calendar/video:** schedule internal video calls with team members; provider abstraction or feature flag (no assumed Telnyx video); event persists to DB, appears on internal schedule, sends notifications, optional meeting link when a provider is configured.

#### Phase 7 — Scheduling, tasks, calendar (Tasks, Today, Schedule, Calendar)
- Tasks/today/calendar/team assignments persist to DB and stay synchronized across task detail, opportunity, lead, contract, and schedule views. Support assigned user/team, due date/time, priority, private/internal visibility, reminders, linked record, completion tracking. Calendar renders DB tasks/events reliably; team scheduling + meeting creation; timezone handling; empty and conflict/error states.
- **XP booking:** do not build/expand until separately scoped; preserve a clean integration point only if existing work requires it.

#### Phase 8 — Workflows & campaigns (Workflow/Campaign pages)
- **Campaigns:** creation, audience/lead selection, ad-campaign config where supported, A/B testing (variants, assignment logic, tracking, results display). No claimed ad-network integration without actual credentials; provide a clear "not configured" state and preserve campaign planning.
- **Automation Wizard (under Settings):** trigger → conditions → actions → review → activate. Triggers: lead created, lead converted, opportunity stage changed, task overdue, buyer inquiry received, contract signed. Conditions: tags, stage, score, owner, property, date, source. Actions: create task, notify user/team, send approved email/SMS, change stage, add tag, assign owner, create contract/public listing where appropriate. Test mode, validation, audit log, enable/disable, idempotency protections.
- **Audit Logs:** move into Settings; keep Insights = analytics + operational intelligence. Audit logs include actor, timestamp, entity, action, safe before/after summary, filtering; restricted to authorized roles.

#### Phase 9 — Contracts (`/contracts`, create/detail/template areas)
- **Templates:** governed, usable: custom templates, editing, versioning, publishing/approval, archived, storage location/linked-document visibility, metadata (category, jurisdiction/state, owner, approved date, last reviewed date). At minimum LOI, Purchase & Sale Agreement, Assignment Agreement/Addendum, NDA/non-circumvention, buyer/access agreement, offer cover letter, IC/JV/referral agreements. Never present generic templates as legal advice — mark "requires attorney review" per jurisdiction/deal type. Provide placeholders/merge fields for real approved wording.
- **Create flow:** property selector loads actual Property records (currently empty), scrollable/searchable; lead selector scrollable/searchable; buyer selector scrollable/searchable; selection persists and enables the next step; required-field validation before blocking; all steps work: 1 template/type → 2 parties/property/linked opportunity → 3 merge data/terms → 4 review → 5 signers → 6 send/save draft. Link created contract to lead, property, opportunity, documents, activity timeline.
- **E-sign/send tracking:** send by email, secure signing link, sent/viewed/signed/declined/expired/executed tracking, signer order, audit trail, executed-document storage, manual signed-upload fallback, reminders, resend/revoke.

#### Phase 10 — Documents (`/documents`)
- Preserve upload; add in-app preview without download: PDFs in a secure viewer, images inline, office docs via safe preview/conversion or an explicit fallback. Respect permissions; loading/error/unsupported-file states; download secondary; keep document analytics/insights functional.

#### Phase 11 — Insights, Tools, Notifications, System Health, Playground
- **Insights:** analytics + operational intelligence only (audit logs moved to Settings); no broken/mock data; metrics clearly defined.
- **Tools → Calculator:** preserve; add "Use Opportunity Data" — select opportunity, auto-fill known underwriting fields, retain manual override; never overwrite opportunity data unless the user explicitly saves.
- **Notifications:** page, badge, task reminders, event alerts synchronized with current data; test user/team-specific, read/unread, preferences.
- **System Health:** expanded to app/API, database, storage, file upload/preview, jobs/queues, email, Telnyx Voice, Telnyx SMS, skip tracing, calendar, campaigns, automations, playground/deep research — each with state, last check, latency where available, meaningful safe error, retry/test action.
- **Playground:** iframe loading, in-browser search, deep research workflow, saved session/resume, loading/timeout/error/retry states, no broken embedded URLs or CSP/frame issues, no blank UI when the service is unavailable.

#### Phase 12 — Testing, release readiness
- Automated tests for the critical workflows (see Part B § Automated test coverage).
- Manual QA script (Part B § Manual QA).
- Release report with PASS / BLOCKED BY CONFIGURATION / DEFERRED per feature, files changed, migrations + rollback notes, API route changes, required configuration, remaining risks, release decision.

### Completion standard
Do not say the release is complete until: TypeScript passes, tests pass, the dev server runs, key pages load, the browser has no unhandled errors on core workflows, and all provider-dependent failures are clearly identified as configuration vs code defects.

---

## Part B — SOFTWARE DEVELOPMENT PROCESS

### B.1 Phase gates (run in order, every phase)
1. **Baseline:** git status; tsc; tests; dev server up.
2. **Audit:** browser console, network, server logs, DB connectivity for the phase's routes.
3. **Implement:** surgical fixes, reusing existing services; loading/empty/success/validation/error states; server-side diagnostic logs.
4. **Verify:** typecheck, targeted tests, API smoke, browser verification in the running preview, DB spot checks.
5. **Record:** update the Issue Ledger and this roadmap (formulas, definitions, new endpoints, config needs).

### B.2 Scoring formula (documented default for skip trace / hot leads — refine in Phase 2)
Proposed explainable score (0–100), weighted, with evidence stored per factor and a scoring date:
- Vacancy + owner-occupied + out-of-state owner + tax delinquency + equity (LTV) + quick-sale request + contactability + campaign engagement + recent activity.
- Hot-lead threshold and conversion-rate window must be defined in one place (see § D.1 definitions) and shared by the dashboard, leads list, and attention-now widget.

### B.3 Automated test coverage (Phase 12)
Dashboard actions + banner config persistence · lead→opportunity conversion + duplicate guard · skip trace status/result mapping + scoring · opportunity property linking · public listing access/visibility/security · buyer inquiry creation + task automation · notification preferences · 2FA enrollment/challenge/backup codes · Telnyx diagnostic state mapping · dialer dispatch/hangup error mapping · SMS + internal messaging persistence · task/calendar synchronization · campaign/A-B validation · contract property/lead/buyer selectors + flow progression · document preview authorization · automation idempotency · playground session restore/error handling.

### B.4 Manual QA script (local/staging, 13 steps)
1. Dashboard + banner customization (upload, reorder, remove defaults, disable).
2. Lead creation and conversion to opportunity.
3. Skip trace test (Both; verify evidence/progress/score populated).
4. Opportunity property linking + stage movement.
5. Public investor listing creation + no-login public inquiry.
6. Buyer inquiry + offer workflow.
7. Telnyx health + safe test call/SMS.
8. Internal team message.
9. Task/calendar synchronization.
10. Settings: notifications, 2FA + backup codes, system diagnostics (3 separate controls).
11. Contract create flow with property/lead/buyer selection (all steps).
12. Document upload + in-app preview.
13. Playground save/resume + deep-research test.

---

## Part C — ISSUE LEDGER (template)

| # | Area/route | Repro steps | Console error | Failing request/response | Server log | Root cause | Files changed | Verification | Final state |
|---|---|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | — | — | fixed / blocked by configuration / deferred |

**Final states:** `fixed` (verified), `blocked by configuration` (code OK; provider/env missing — listed in § D.5), `deferred` (explicitly out of scope, with reason).

---

## Part D — RDP (Release Development Plan)

### D.1 Definitions & formulas (canonical, single source of truth — maintain here)
- **Revenue:** sum of closed deals' net/assignment fee within the selected date window (exact column confirmed against schema in Phase 1D).
- **Closed deals:** opportunities with stage `closed` (or `sold`) within window.
- **Active leads:** leads not dead/voided/converted, within window.
- **Conversion rate:** converted leads / all leads in window (%).
- **Attention-now priority:** highest-urgency items per the scoring formula § B.2.
- **Date windows:** all dashboard widgets share one window definition (this month, or a configurable range — confirmed in Phase 1D).

### D.2 Configuration required (report in Phase 12; do not fake these)
Telnyx (voice/messaging) · email provider (SMTP/Resend) · skip tracing provider · storage (S3) · calendar/video provider (feature-flagged) · ad networks (campaigns — "not configured" state if absent).

### D.3 Phase sequencing
0 baseline → 1 dashboard → 2 leads/skip trace → 3 opportunities/listings/buyer inquiries → 4 contacts/buyers → 5 settings/security/2FA → 6 comms/Telnyx/dialer → 7 tasks/calendar → 8 campaigns/automation/audit logs → 9 contracts → 10 documents → 11 insights/tools/system health/playground → 12 tests/QA/release report.

### D.4 Quality gates (release blockers)
- `tsc --noEmit` clean · unit tests green · dev server runs on :3000 · key pages load without unhandled browser errors · API smoke passes · DB connectivity confirmed · provider failures labeled config-vs-code.

### D.5 Release decision
- **READY FOR RELEASE** — all gates pass, no unresolved code defects, config gaps documented.
- **CONDITIONAL RELEASE** — code defects fixed; remaining items are all "blocked by configuration" with owners.
- **NOT READY** — any unresolved code defect, failing gate, or unlabeled provider failure.

---

## Part E — ISSUE LEDGER (executed — Phase 0/1 run)

| # | Area/route | Repro | Root cause | Fix | Verification | Final state |
|---|---|---|---|---|---|---|
| 1 | Contracts list `/contracts` | `GET /api/contracts` → 500 `column "title" does not exist`; contract wizard property selector empty | Schema drift: `server/shared-schema.ts` (contracts.title, 12 opportunity columns on properties, contract_fields.field_key/label, and the public_listings/buyer_inquiries/opportunity_parties/opportunity_events tables) was ahead of the live DB, which was built by an older `db:push`; no migration had created them | Migration `0048_opportunity_pipeline_and_listings.sql` (idempotent, additive) | Contracts page renders 2 real contracts; property selector lists 119 Jones St; `SCHEMA DIFF: clean`; getProperties/getContracts OK | fixed |
| 2 | Opportunities `/opportunities` + Add Property | `GET /api/opportunities` → 500; property dropdown empty | Same drift (properties.stage etc. missing) | Same migration 0048 | Opportunities page renders 119 Jones St with pipeline; property selection persists | fixed |
| 3 | DB-unavailable classification | `returns 503 (not 500) when Postgres host cannot be resolved` test failed: got `kind=schema_missing` instead of `db_unavailable` | Neon serverless driver surfaces DNS/connect failures as `"Received network error or non-101 status code."` with `code: null`; `isDbConnectivityError` matched only on codes | schema-readiness.ts + routes.ts: match driver message patterns and walk `cause`/`errors` chains | Test passes (3/3), log shows `connectivity: true` | fixed |
| 4 | Test suite | 10 DB-integration tests timed out at 5s against slow remote Neon (2 legitimately take ~38s) | vitest default `testTimeout` too tight for this environment | `vitest.config.ts` `testTimeout: 60_000` | Full suite: 124 passed, 0 failed, 14 skipped | fixed (environment tuning) |
| 5 | Dashboard banner | Default images hardcoded; settings could only append custom images — defaults couldn't be removed/reordered/disabled/hidden | Banner state had no DB representation for defaults | `users.banner_config` jsonb (migration 0049); shared `bannerConfig.ts`; Settings → Appearance banner manager (enable/disable, per-image active, reorder, remove defaults, add); MotivationalBanner reads config | Verified in preview: hide default-1 → 6 dots on dashboard; disable → banner gone; restore → 7 dots | fixed |
| 6 | Dashboard actions | "New Contract" → `/contracts?tab=create` (param unused); contracts page's own link → dead `/contracts/new` | Route targets didn't lead to creation | Dashboard + contracts page now point to `/contract-generator` (the real create flow) | Click-through: lands on Document Management create tab | fixed |
| 7 | Resume Playground | Dashboard button went to bare `/playground` without restoring a session | No auto-resume of last session | Playground fetches `/api/playground/sessions/recent` when arriving without context and hydrates it | Auto-restored Session 13 (114 gaulin ave) in preview | fixed |
| 8 | Dashboard data integrity | "Active Leads 500" and "Stale leads 500" — false caps | Dashboard counted from `/api/leads?limit=500` fetch; DB actually has 10,655 leads | New `GET /api/dashboard/stats` returns true counts + top-5 stale leads; dashboard consumes it | Dashboard shows 10,655 active + 10,655 stale with real top-5 | fixed |
| 9 | `/api/users` security | Any authenticated user could read all users incl. `password_hash` (login route strips it; this didn't) | `getUsers` selects all columns, route returned raw rows | Strip `passwordHash` in `/api/users` and `/api/users/:id` | Verified response no longer contains `passwordHash` | fixed |
| 10 | Team member cleanup | 11 test accounts (smoke-test, 8× audit, verify, 2× TT) mixed with real users | Automated sign-up tests created accounts | None (DB untouched — approval not confirmed) | Audit table documented; deactivation list pending approval | pending approval |
| 11 | Dev server port | Sandbox exports `PORT=0` overriding `.env` `PORT="3000"` (dotenv `override:false`) | Environment precedence | Start with `PORT=3000` (documented in `.freebuff/run.md`) | Server on :3000, preview registered | fixed (ops) |
| 12 | Browser console | Vite HMR websocket 400s in preview | Middleware-mode HMR handshake vs preview browser; cosmetic | None (non-functional impact) | Page loads, data renders | deferred (cosmetic) |
| 13 | Migration runner | `npm run migrate` aborts on old unapplied `0008_playground_property_sessions` (unique `address_key` with duplicate rows) | Pre-existing landmine in migration history; dedupe requires a data decision | Skipped via direct apply of 0048/0049; documented | New migrations applied and recorded | deferred (needs data dedupe decision) |

---

## Part F — RELEASE REPORT (this run)

### F.1 Scope executed
- **Deliverable:** this roadmap document (deep AI prompt + dev process + RDP).
- **Phase 0:** baseline (tsc, tests, dev server, console/network/server-log audit, error-boundary review, DB widget check).
- **Phase 1:** banner management (1A), dashboard actions (1B), team cleanup audit (1C — deactivation pending approval), data integrity (1D).
- **Root-cause repair:** applied migrations 0048/0049 to fix the schema drift that broke contracts/opportunities/property flows.

### F.2 Files changed (this run)
- New: `docs/release-audit-and-roadmap.md`, `migrations/0048_opportunity_pipeline_and_listings.sql`, `migrations/0049_user_banner_config.sql`, `client/src/components/dashboard/bannerConfig.ts`.
- Edited: `server/routes.ts` (dashboard stats endpoint, isDbConnectivityError, password-hash stripping), `server/schema-readiness.ts` (connectivity classification), `server/shared-schema.ts` + `shared/schema.ts` (users.banner_config), `vitest.config.ts` (testTimeout), `client/src/pages/dashboard.tsx`, `client/src/pages/settings.tsx`, `client/src/components/dashboard/MotivationalBanner.tsx`, `client/src/pages/contracts.tsx`, `client/src/pages/playground.tsx`.
- Pre-existing uncommitted edits (client layout/telephony/etc.) were left untouched; edits were layered on top.

### F.3 Database migrations & rollback
- `0048` (additive): opportunity pipeline columns on properties, contracts.title, contract_fields keys, 4 new tables + indexes. Rollback: drop the added tables/columns (no data existed in them).
- `0049` (additive): users.banner_config jsonb. Rollback: drop the column.
- Both recorded in `applied_migrations`. The legacy `0008_playground_property_sessions` migration remains unapplied and requires a data-dedupe decision before `npm run migrate` will run clean.

### F.4 API changes
- New `GET /api/dashboard/stats` (authenticated): `{ activeLeads, staleLeadsCount, staleLeadsTop, windowDays }`.
- `/api/users`, `/api/users/:id`: now strip `passwordHash`.

### F.5 Configuration required (unchanged providers)
Telnyx (voice/messaging) · email provider · skip tracing provider · storage (S3) · calendar/video · ad networks — none of these were exercised; they remain "blocked by configuration" items per § D.2.

### F.6 Quality gates
- `tsc --noEmit`: PASS · unit suite: 124 passed / 0 failed (14 skipped) · dev server on :3000: PASS · preview renders dashboard/contracts/opportunities/playground/settings without unhandled errors · DB connectivity: PASS (live queries verified) · provider failures: none exercised this run.

### F.7 Remaining risks
- Team cleanup deactivation pending explicit approval (no accounts modified).
- Migration runner still blocked by the legacy 0008 file.
- Phases 2–12 (skip trace, public listings, Telnyx dialer, 2FA, contracts wizard steps, document preview, automation wizard, system health) not yet executed.

### F.8 Release decision (for Phase 0/1 scope)
**CONDITIONAL RELEASE** — Phase 0/1 code defects are fixed and gates pass; remaining items are pending-approval account cleanup, a documented migration-history landmine, and unexecuted phases 2–12.

---

## Part G — PHASE 2/3 EXECUTION (leads conversion + opportunities + public listings)

### G.1 Issue ledger (Phase 2/3)
| # | Area | Original behavior/defect | Root cause | Fix | Verification | Final status |
|---|---|---|---|---|---|---|
| 14 | Lead → opportunity conversion | Convert button only appeared for `under_contract` leads; server rejected all others ("must be under contract") | Conversion gate was too strict vs product intent (convert any lead) | Relaxed gate: any lead without a linked property can convert; server carries `sourceLeadId` so owner/score/notes flow into the deal room; client now shows "Convert to Opportunity" on every unconverted lead (199 rows) with a confirmation dialog listing carry-over; 409 (duplicate) now navigates to the existing opportunity; added convert action to the lead detail sheet | Verified live: converted a `new` lead (19433 Rachael Dr) → opportunity created, sourceLeadId set, detail page shows owner/phone/email; duplicate attempt returns 409 + navigation; tsc clean | fixed |
| 15 | Public listing dead-end | Created listings were `draft` but the UI only listed `published` ones, and there were no Publish/Pause/Archive/Delete controls — a created listing vanished with no way to go live ("all them buttons greyed out") | `PublicListingSection` filtered to `published` and had no status controls | Section now shows all listings with status badges + Publish/Pause/Archive/Delete + Copy/Preview link actions; empty state updated | Verified live: created draft → Publish → status `published` with `publishedAt`; public page loads | fixed |
| 16 | Public share link | Opening a share URL (`/l/:token`) in a fresh browser returned **raw JSON** instead of the branded page | Express route `GET /l/:token` returned JSON and shadowed the SPA fallback | Moved JSON endpoint to `GET /api/public/listings/:token` (and `/view`); `/l/:token` now hits the SPA catch-all and renders `PublicListingPage`; client query updated | Verified: `curl /l/:token` returns HTML; browser renders OceanLuxe page with CTA + inquiry form; API returns JSON | fixed |
| 17 | Buyer inquiry follow-up task | Inquiry notification created but follow-up task silently failed | Route called `createTask` with wrong field names (`assignedTo`/`dueDate`) and omitted required `createdBy`; errors swallowed by empty `catch {}` | Fixed call: `assignedToUserId`, `dueAt`, `createdBy` | Verified: task 13 "Follow up: Buyer inquiry from Task Test" created, assigned to owner 8, priority high, due +24h | fixed |
| 18 | Opportunity manual creation | "Add Opportunity" modal existed; needed verification it persists | None (feature worked after migration 0048 fixed the properties query) | Verified end-to-end | Created "450 QA Test Blvd" via modal → 201 → listed; test record cleaned up after | fixed (verified) |
| 19 | Opportunity detail actions | All header buttons appeared greyed on first paint | Page was still loading (buttons bind `disabled={!property?.id}`); earlier snapshot taken mid-load | None (works once loaded) | After load, Underwrite/Generate Contract/Move Stage/Create Public Listing/Add Note all enabled | fixed (verified) |

### G.2 Files changed (Phase 2/3)
- `server/routes.ts`: relaxed convert gate + carry-over payload cleanup; listings JSON routes moved to `/api/public/listings/:token`; inquiry follow-up task fixed.
- `client/src/pages/leads.tsx`: convert dialog, convert button for all unconverted leads, detail-sheet convert action, 409 → navigate.
- `client/src/pages/property-detail.tsx`: `PublicListingSection` rewritten with Publish/Pause/Archive/Delete + share/copy/preview.
- `client/src/pages/public-listing.tsx`: query key → `/api/public/listings/:token`.
- `tests/opportunity-workspace.test.ts`: listing-data tests updated to the new API path (3 assertions renamed/repointed).
- New `server/tests/lead-convert-opportunity.test.ts` (env-gated integration: converts a `new` lead, asserts 409 dedupe, asserts deal-room link; cleans up after itself).

### G.3 Quality gates (Phase 2/3)
- `tsc --noEmit`: PASS · unit suite: **124 passed / 0 failed** (17 skipped, incl. env-gated integration tests) · dev server on :3000: PASS · browser walkthrough: manual opportunity creation, lead conversion (with carry-over + dedupe), listing create→publish→public page→inquiry submit all verified in preview · test data cleaned from DB.

### G.4 Remaining for Phases 2–12 (unchanged scope)
Skip-trace scoring/UI (Phase 2C), opportunity stage-confirmation/workflows (3B), offers canonical location (5D), notifications/2FA (5A/B), Telnyx/dialer (6), calendar/video (7), automation wizard + audit logs (8), contract wizard steps (9), document preview (10), system health/playground (11), full manual QA (12).
