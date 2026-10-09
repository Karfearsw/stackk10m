# Ocean Luxe CRM — Full-Stack Audit Report

**Date:** 2026-10-09
**Repo:** `~/workspace/builds/final-merge` · **Branch:** `feat/phone-queue`
**App root:** `FrameworkPlanner/`
**Audit SHAs:** start `b1e543ce57a882bd9d4eaaeb59d5142c920431e9` → end `a532f42a5494b680d4bb1e095e67f88ac55216ae`
**Method:** Five parallel read-only audit workstreams (A: baseline+routes, B: connections+integrations, C: data-model+deal-journey, D: friction+mobile, E: observability+security). Static code analysis; builds/tests executed where possible; no source modified, no migrations run, no production touched, no secrets reproduced.

## ⚠️ Master caveats — read before citing any finding

1. **No runtime verification was possible.** This sandbox has no `DATABASE_URL`, and the app uses `@neondatabase/serverless` `Pool`, which is WebSocket-only and cannot talk to a local Postgres. The dev server crashes at boot (`server/db.ts:224`). Consequently **no route is marked VERIFIED_WORKING** — the strongest claim below is "CONNECTED (static: full code chain present)".
2. **Moving target.** A parallel build coordinator (Phases 9–16 investor Matchroom) committed mid-audit. Several findings were fixed during the audit window and are marked **[FIXED MID-AUDIT]** — re-verify before acting.
3. **Baseline was red at audit start:** `npm ci` failed (lockfile drift), server bundle failed (syntax error in `server/routes.ts:9334` from commit `3be8647`), `tsc` had 9+ errors. The coordinator repaired the syntax error live; 5 tsc errors and the lockfile drift remain.
4. Detail reports: `audit/AUDITOR_A_ROUTES.md`, `audit/AUDITOR_B_CONNECTIONS.md`, `audit/AUDITOR_C_DATA_JOURNEY.md`, `audit/AUDITOR_D_FRICTION_MOBILE.md`, `audit/AUDITOR_E_SECURITY.md`.

---

## 1. Architecture map

| Layer | Technology (verified) |
|---|---|
| Frontend | React 19.2.0 + Vite 7.1.9, wouter 3.3.5 router, TypeScript 5.6.3, Tailwind CSS v4, shadcn/ui (Radix), next-themes (dark default), @tanstack/react-query 5.60.5 |
| Backend | Express 4.21.2 (ESM); 588 routes in `server/routes.ts` (~17.4k lines) + modular routers (`server/routes/esign.ts`, `server/routes/sequences.ts`, `server/routes/dispo.ts`, `server/investor/*`) |
| Database | PostgreSQL via Neon (`@neondatabase/serverless` 0.10.4); Drizzle ORM 0.39.1; 141 tables in `server/shared-schema.ts` (**zero** `.references()` FK declarations — FKs exist only in migrations, patchy) |
| Auth | Custom session auth: express-session + connect-pg-simple (sessions in Postgres `session` table), bcryptjs passwords, `req.session.userId`; `requireAuth` per-route; investor portal uses separate `investorUserId` session key. No route-level RBAC — `ProtectedRoute` checks auth only |
| Storage | S3-compatible (AWS SDK v3): DOCUMENTS_*, PROPERTY_PHOTOS_*, TELEPHONY_MEDIA_* buckets; presigned URLs, private-by-default |
| Deployment | Vercel (`vercel.json` → `dist-server/vercel.js` built by esbuild from `server/index-vercel.ts`); Dockerfile also present |
| Background jobs | In-process: PG-backed durable queue (`server/jobs/queue.ts` + `worker.ts`, setInterval poller) + 7 cron tickers in `server/cron/*.ts` (campaign-scheduler, contract-expiry-sweeper, contract-reminders, lead-automation, rvm-poller, skip-trace-worker, task-reminders). No Bull/BullMQ |
| Feature flags | `FEATURE_*` env flags + `isFeatureEnabled`; `INVESTOR_PORTAL_ENABLED` default OFF (portal renders CRM 404 when off) |
| Package manager | npm 10.9.4 (lockfile currently drifted — `npm ci` fails) |

**Third-party integrations (names only):** Telnyx (voice/SMS/video/AI), Resend + Telnyx Email fallback, Tracerfy, Enformion GO, CourtListener, Mapbox→Smarty→Nominatim address chain, Stripe (XP checkout), Sentry (opt-in/fail-open), S3-compatible storage. **Not present in repo:** Discord (lives in workspace skill layer), any LLM provider (no OpenAI/Anthropic keys; "AI" = Telnyx AI voice + heuristics).

---

## 2. Route inventory (Auditor A)

~65 routes inventoried in `audit/AUDITOR_A_ROUTES.md`. All authenticated CRM routes render inside the shared `Layout` (sidebar + header + mobile bottom nav) — the 4 previously shell-less pages (`/dialer-workspace`, `/disposition`, `/sequences`, `/buyers/qualify`) are now wrapped. **No route-level role gating exists** — every authenticated user can reach every route.

Key structural findings:
- **Duplicates:** `/dashboard`≡`/`, `/dialer/workspace`≡`/dialer-workspace`, `/opportunities`≡`/properties`, `/opportunities/:id`≡`/property/:id`, `/investor/buy-box`≡`/investor/onboarding`
- **Orphaned page files (no route):** `client/src/pages/dialer.tsx` (old SignalWire dialpad), `client/src/pages/history.tsx` (call history)
- **Investor sub-routes** (`/investor/discover`, `/matches`, `/buy-boxes`, `/deal-rooms/:id`, `/locked-up`, `/contracts/:id`, `/onboarding`, `/saved`, `/offers`, `/messages`, `/account`) — wired mid-audit; whole group flag-gated
- **Dead code:** `getAppVariant()` computed but never used in `client/src/App.tsx:108`
- All routes: **NOT_TESTED** at runtime (app never booted in sandbox)

---

## 3. User-role matrix

| Role | Auth mechanism | Route access | Object-level scoping | Notes |
|---|---|---|---|---|
| Public visitor | none | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/magic-link`, `/l/:token`, `/xp*`, `/esign/:token`, `/sign/:token` | n/a | Signup gated by employee code |
| Authenticated CRM user | session `userId` | **All** CRM routes (no RBAC) | List views: team/assignment filter; **by-ID endpoints: none (IDOR — §13)** | `isAdminUser` gates ~20 admin routes, but user-management endpoints missed it (§13 P0s) |
| Team member (viewer/member/admin/owner) | session + `team_members` rank | Same routes; `requireActiveTeam`/`requireTeamMembership` on some endpoints | Partial — inconsistent | Team filter is a list-view convention, not a security boundary on core tables (no `team_id` on leads/properties/contracts/buyers) |
| Investor | separate session `investorUserId` | `/investor/*` only (flag-gated) | `requireActiveInvestor`: role=investor + status=active + linked buyer | Cannot reach agent `requireAuth` routes — verified good |
| External signer | HMAC single-use token | `/esign/:token`, `/sign/:token` | Token-bound, nonce + expiry, atomic consume | Verified good |

---

## 4. Entity relationship map (Auditor C — condensed)

**Core pipeline:** `leads` → `properties` (= opportunities, `sourceLeadId`) → `contracts`/`contract_envelopes`/`contract_signers`/`contract_events` → `deal_assignments` (ledger) → `locked_up_deals`/`deal_conditions`. Buyers: `buyers` (+ inline buy-box columns) ↔ `lead_buyer_matches` / `deal_buyer_matches`. Offers: `buyer_offers` (versioned) / `lois` (dispo tracker) / `offers` (legacy) / `investor_offers`. Comms: `call_logs` + `crm_call_sessions`/`crm_call_dispositions`, `crm_sms_messages`, `internal_messages`. Activity: `global_activity_logs` / `team_activity_logs` / `opportunity_events` / `audit_events` (+ `task_audit`, `auth_audit_logs`). Notifications: `notifications` (0098) + `user_notifications` (older).

**Structural problems:**
- **Zero FK declarations** in drizzle schema; migration FK coverage patchy. Newest e-sign tables (`contract_signers`, `contract_events`) have none.
- **Schema drift:** 0080/0099–0102 columns and tables missing from `shared-schema.ts`; orphan `shared/schema.ts` (1025 lines, zero imports); parallel `server/investor/schema.ts`.
- **Dead tables:** `video_meetings*`, `storage_config`; entire `xp_*` module has zero server references.
- **Bare deletes orphan records:** `DELETE /api/contracts/:id` orphans signers/envelopes/events; `DELETE /api/leads/:id` orphans `lead_notes`.

---

## 5. Connection matrix (Auditor B — condensed)

31 features traced. **26 CONNECTED (static):** auth, onboarding, teams, leads, contacts, buyers, properties, lead matching (compute-on-read), investor feed/saved/passed, agent offers + counteroffers, tasks (optimistic w/ rollback), calendar, Quick Log Call (full chain + timeline), WebRTC/dialer, SMS (DNC gates + persistence + auto-lead-create), notifications, contracts, e-sign v1, documents, deal rooms, timesheets, reports, search, settings, audit history, skip-trace, LOIs.
**1 BACKEND_ONLY:** email (`/api/email/send` + outbox works; no manual compose UI).
**4 PARTIAL:** e-sign v2 + sequences (**P0:** missing from Vercel bundle — UI 404s in prod); locked-up "deals" API (P1: client paths have no server routes); investor structured offers/deal rooms (UI_ONLY → CONNECTED mid-audit).

**Clean sweeps:** zero TODO/FIXME/HACK; no dead buttons; no toast-before-await; no un-rolled-back optimistic state; mock skip-trace provider disabled server-side.

---

## 6. Third-party integration matrix (Auditor B — condensed)

| Provider | Purpose | Sandbox | Webhook sig verify | Retry | Status / gap |
|---|---|---|---|---|---|
| Telnyx | Voice/SMS/video/AI | No | Conditional on `TELNYX_PUBLIC_KEY` (open if unset — P1) | None | **No balance monitoring** — Oct-8 outage class undetectable; `healthCheck()` only hits `/connections` |
| Resend / Telnyx Email | Transactional email | No | Email webhook accepts-all when secret unset (P2) | None (idempotency-keyed outbox instead) | Connected |
| Tracerfy / Enformion / CourtListener | Skip-trace | free-web no-key mode | n/a (API key) | None | Connected, flag-gated |
| Mapbox→Smarty→Nominatim | Address autocomplete | Nominatim fallback | n/a | None | Connected, SSRF-guarded |
| S3-compatible | File storage | Local dev fallback | Signed URLs 900s | SDK | Connected |
| Stripe | XP checkout | Dashboard test keys | Yes (`constructEvent`) | None | Connected |
| Neon / Vercel / Sentry | DB / hosting / errors | n/a | n/a | n/a | Sentry fail-open both ends (P2) |

---

## 7. Mobile matrix (Auditor D — condensed)

Static analysis only (no browser in sandbox) — all rows NOT_TESTED at runtime. Baseline good: every key route renders in shared `Layout` (mobile bottom nav + safe-area padding); no document-level horizontal overflow found (all wide tables wrapped); dialogs/sheets scroll internally; Luxe primitives mobile-safe.

**Top mobile blockers:**
1. Investor nav 75% dead at audit SHA (Matches/Buy Boxes/Locked Up → NotFound) **[FIXED MID-AUDIT per A — re-verify]**
2. Disposition board is drag-and-drop only — stage moves impossible on touch (P2)
3. Every call CTA is a raw `tel:` link — bypasses CRM dialer, DNC checks, logging (P1)
4. Native `window.confirm/prompt` in money flows (P2)
5. Contract wizard post-send dead end; dialer widget deep-links to nonexistent `/leads/:id` (P1)

Full 20-route matrix in `audit/AUDITOR_D_FRICTION_MOBILE.md`.

---

## 8. Deal-journey map (Auditor C)

**Direct answer: NO — a test deal cannot go from lead to close today.** Blocked at step 0: no `DATABASE_URL` in this environment and the app is Neon-WebSocket-only (cannot use local Postgres). Repro: `npx tsx server/index-dev.ts` → `{"event":"db_url","kind":"missing"}` → driver throws at `server/db.ts:224`.

Code-traced journey (all endpoints exist; pure logic units executed and verified):

| Step | Code verdict |
|---|---|
| 1. Create lead (+409 dedupe) | ✅ Sound; dedupe normalization verified |
| 2. Qualify → auto buyer-match → `lead_buyer_matches` + dispo task | ✅ Sound; ⚠️ `status` free-form — typo silently skips matching |
| 3. Buyer buy-box scores | ⚠️ **Split brain:** matcher reads only buyer inline fields; `buyer_buybox` + investor `buy_boxes` invisible (verified 100 vs 0) |
| 4. Lead→opportunity → offer → counter (versioned) | ✅ Mostly sound; ⚠️ conversion comment claims a check that doesn't exist; ⚠️ dispo tracker writes `lois`, not `buyer_offers` |
| 5. Contract from template (merge fields) | ✅ Populates; ⚠️ missing fields render blank silently |
| 6. E-sign v2 sandbox | ✅ Complete in code; zero-outbound safe only when no email provider configured; no dry-run flag |
| 7. Lock-up gate | ✅ Genuinely strict (executed + all signers + dates + EMD); resists execute-shortcut; ⚠️ investor-portal-only, no agent-side equivalent |
| 8. Close checklist | ✅ Enforced on document-close; ❌ **bypassable** via generic opportunity PATCH + permissive stage machine (`lead→closed` legal, verified) |

Full journey table + executed logic results in `audit/AUDITOR_C_DATA_JOURNEY.md`.

---

## 9. Broken or missing connections

| ID | Connection | Expected | Actual | Evidence |
|---|---|---|---|---|
| BRK-1 | E-sign v2 UI → API (prod) | `/api/esign/*` served | 404 in prod — `registerEsignRoutes` never called in `server/index-vercel.ts` | `server/index-vercel.ts:1-30`, `server/app.ts:622` |
| BRK-2 | Sequences UI → API (prod) | `/api/sequences/*` served | Same Vercel gap — `registerSequenceRoutes` missing | `server/index-vercel.ts`, `server/app.ts:633` |
| BRK-3 | Locked-up "deals" client → server | `/api/investor/locked-up/deals*`, `/gate/*`, `/templates` | No server routes; only `/contracts*` exists | `client/src/investor/lockedup/api.ts:239-280` vs `server/investor/lockedup.ts` |
| BRK-4 | Investor nav → routes (at audit SHA) | Matches/Buy Boxes/Locked Up render | Rendered CRM 404 **[FIXED MID-AUDIT — re-verify]** | `investor/routes.tsx` (end SHA) |
| BRK-5 | Dialer widget "lead exists" → lead | Opens lead detail | Navigates to `/leads/:id` — route doesn't exist | `components/dialer/GlobalDialerWidget.tsx:85` |
| BRK-6 | Contract wizard → contract detail | Lands on new contract | Resets to Template step; user must hunt | `pages/contract-wizard.tsx:352-362` |
| BRK-7 | `lead_buyer_matches` → investor `buy_boxes` | Named boxes score | Matcher reads only buyer inline fields | `server/services/buyerMatch/matchLead.ts:60-100` |
| BRK-8 | Dispo "Offers" tracker → `buyer_offers` | One offer record | Writes to `lois` instead; two records possible | `server/routes/dispo.ts:351-406` |
| BRK-9 | Migration 0101 `offers` DDL | Adds deal-room columns + CHECK | Silent no-op (table existed) — columns never applied | `migrations/0101_dealrooms_offers.sql:133` |

---

## 10. UI-only or mocked features

| Feature | Route | Nature | Evidence |
|---|---|---|---|
| Investor structured offers / deal rooms (start SHA) | `/investor/*` | UI_ONLY at `b1e543ce` — `.catch(() => defaults)` hid 404s | `client/src/investor/OffersPage.tsx:114-115` **[mounted mid-audit]** |
| "Notify Buyer" button | `/opportunities/:id` | Labeled stub — toast "not implemented yet" | `pages/property-detail.tsx:1344` |
| Telephony presence | `/api/telephony/presence` | **MOCKED** — hardcoded `available: true` | `server/routes.ts:8520-8527` |
| Manual email compose | — | Missing — API exists, no UI | No client refs to `/api/email/send` |
| Orphaned pages | (none) | `pages/dialer.tsx`, `pages/history.tsx` have no routes | Dead code |

---

## 11. Backend-only features (no UI exposure)

| Feature | API | Notes |
|---|---|---|
| Email send | `POST /api/email/send` (16674) | Outbox + idempotency work; sends only via automated paths (contracts, automations, sequences) |
| Dead-letter queue | `server/jobs/dead-letter.ts` + `/api/jobs/dead-letters` | Exists; no alerting/dashboard/retention |
| Contract reminders | `contract_reminders` table (0102) | Records only; no scheduler built |
| Skip-trace backfill | `POST /api/skip-trace/backfill` | API exists (0098); no UI trigger found |
| Speed-to-lead stats | `GET /api/speed-to-lead/stats` | API exists (0098); no dashboard widget found |
| Metrics | `GET /api/metrics` | Exists but unauthenticated (§13) |

---

## 12. Duplicate sources of truth

| Concept | Duplicates | Impact |
|---|---|---|
| Offers | `offers` (legacy, no UI) × `buyer_offers` (versioned) × `lois` (dispo tracker) × `investor_offers` (0080) × 0101 no-op | Same deal can hold 4 "offer" records with different status vocabularies |
| Buy boxes | `buyers.*` inline fields (matcher reads) × `buyer_buybox` × `buy_boxes` (investor) | Two of three invisible to scoring |
| Buyer status | `buyers.status` × `buyers.buyerStatus` (10-value pipeline) × `buyer_qualification.relationship_stage` | Free-form on generic PATCH |
| Contract models | `contracts` (envelope-anchored) × `contract_documents` (owns close checklist) | Close checklist lives on the older model |
| Interaction logs | `investor_deal_interactions` (0080) × `deal_interactions` (0100) | Parallel tables, 0100 notes 0080 "left untouched" |
| Notifications | `user_notifications` × `notifications` (0098 bell) | Two tables |
| Activity/audit | `global_activity_logs` × `team_activity_logs` × `audit_events` × `opportunity_events` (+`task_audit`, `auth_audit_logs`) | Overlapping trails |
| Call models | `call_logs` × `crm_call_sessions` (+events/dispositions) | 0096 made sessions the note source of truth |
| Schema definitions | `server/shared-schema.ts` × `shared/schema.ts` (orphan, 0 imports) × `server/investor/schema.ts` | Drift; 0080/0099–0102 absent from shared schema |
| E-sign | v1 (`/api/sign/*`, in Vercel) × v2 (`/api/esign/*`, missing from Vercel) | Prod serves v1 only |
| Toasts | shadcn `<Toaster/>` × Sonner `<SonnerToaster/>` | Both mounted; pages mix |

---

## 13. Security findings (Auditor E)

Architectural context: core tables (`leads`, `properties`, `contracts`, `buyers`) have **no `team_id`** — team scoping is a list-view convention, not a security boundary. Every by-ID endpoint below was verified by code inspection (not exercised live).

| ID | Sev | Finding | Endpoint | Expected | Actual | Evidence |
|---|---|---|---|---|---|---|
| SEC-1 | **P0** | Any authenticated user can create `role:"admin"`/`isSuperAdmin:true` account | `POST /api/users` | Admin-only | `requireAuth` only; privileged fields unfiltered | `server/routes.ts:12838-12848` |
| SEC-2 | **P0** | Self privilege escalation via PATCH (role/isSuperAdmin/passwordHash) | `PATCH /api/users/:id` | Field whitelist | Unfiltered `set()` | `server/routes.ts:12882-12903` |
| SEC-3 | **P0** | **No authentication at all** — any user's timesheet readable | `GET /api/users/:userId/timesheet` | requireAuth + owner check | No auth | `server/routes.ts:15314-15321` |
| SEC-4 | **P0** | **No authentication at all** — any timesheet entry by ID | `GET /api/timesheet/:id` | requireAuth + owner check | No auth | `server/routes.ts:15323-15330` |
| SEC-5 | P1 | Any user can update/delete ANY user's timesheet | `PATCH/DELETE /api/timesheet/:id` | Owner-or-manager | `requireAuth` only | `server/routes.ts:15358-15377` |
| SEC-6 | P1 | Universal IDOR: any lead/buyer/contract/property by ID (read/write/delete) | 14 endpoints (§E) | Object-level authZ | `requireAuth` only, raw `getById` | `server/routes.ts:3714,5983,6075,10647,10684,15984,16023,16037,10340,10379,7136,11014` |
| SEC-7 | P1 | Arbitrary storage-key file download | `GET /api/files/by-key/download` | Ownership check | `?key=` verbatim | `server/routes.ts:8943-8975` |
| SEC-8 | P1 | Telnyx webhook accepted unsigned when `TELNYX_PUBLIC_KEY` unset | `POST /api/v1/telecom/webhooks/telnyx` | Fail closed | Conditional verify | `server/services/telecom/webhook-router.ts:28-40` |
| SEC-9 | P2 | Global search unscoped (leads/properties/contacts) | `GET /api/search` | Team filter | Raw SELECT, no scope | `server/routes.ts:2036-2075` |
| SEC-10 | P2 | `/api/metrics` unauthenticated | `GET /api/metrics` | Admin-only | Public | `server/app.ts:686-690` |
| SEC-11 | P2 | Export download token not bound to user | `GET /api/crm/export/files/:id/download` | Token+session | Hash+expiry only | `server/routes.ts:1122-1136` |
| OBS-1 | P1 | Full JSON response bodies (PII) logged on every `/api` request | — | Shape/status only | `capturedJsonResponse` in logs | `server/app.ts:275-285` |
| OBS-3 | P1 | Cron failures console.error-only; no heartbeat/alert | 7 cron tickers | Heartbeat + alert | Bare catch | `server/cron/lead-automation.ts:74-77` |

**Verified good:** document download/preview (team + vault roles + signed URLs), media routes (`requireActiveTeam`), investor session isolation, Telnyx webhook idempotency, e-sign HMAC single-use tokens, session cookie hardening, no hardcoded/client-exposed secrets.

---

## 14. Workflow friction findings (Auditor D)

Click counts (traced): lead→first contact ≈12 clicks + 9 fills (**then exits app via `tel:`**); qualified→LOI ≈10 clicks + 8 fills (buyer/seller names re-typed); accepted offer→contract ≈12 clicks (buyer identity + price re-typed); executed→Locked Up = 1 click + manual nav + **mobile-impossible drag**; match→buyer offer ≈6 clicks (buyer name free-text, unlinked).

| ID | Sev | Finding | Routes | Fix | Cx |
|---|---|---|---|---|---|
| F-01 | P0 | Investor primary nav 75% dead (Matches/Buy Boxes/Locked Up → 404) | `/investor/*` | Add routes / fix hrefs **[FIXED MID-AUDIT — re-verify]** | S |
| F-02 | P1 | Dialer "lead exists" → nonexistent `/leads/:id` | `/phone` | Use `/leads?highlight=` | S |
| F-03 | P1 | All call CTAs are raw `tel:` — bypass dialer/DNC/logging | `/leads`, `/buyers`, `/contacts` | Route via `/phone?number=` | M |
| F-04 | P1 | Contract wizard resets after send instead of navigating | `/contracts/new` | `setLocation(/contracts/:id)` | S |
| F-05 | P1 | Two parallel offer models, different vocabularies | `/opportunities/:id`, `/disposition` | Unify offer entity | L |
| F-06 | P2 | Dispo board drag-only — blocked on touch | `/disposition` | Per-card "Move to stage" menu | M |
| F-07 | P2 | Native `window.confirm/prompt` in money flows | `/opportunities/:id`, `/contacts` | In-app dialogs | S |
| F-08 | P2 | Withdraw offer — zero confirmation | `/opportunities/:id` | Confirm step | S |
| F-09 | P2 | Terminology drift: Opportunity/Property/Deal | multiple | Pick one customer term | S |
| F-10 | P2 | No "Call now" CTA after lead creation | `/leads` | Add to success dialog | S |
| F-11 | P2 | Dual toast systems mounted | app-wide | Standardize on one | S |
| F-12 | P2 | Contract/LOI don't carry buyer + accepted price forward | `/contracts/new`, `/lois` | `?offerId=` deep-link prefill | M |
| F-13 | P2 | No "Open in Disposition" after contract execution | `/contracts/:id` | Quick action | S |
| F-14–F-20 | P3–P4 | Missing nav entries, cramped dialogs, small tabs, investor More→CRM links, raw property IDs, dual e-sign surfaces, no draft autosave | various | See auditor D report | S–M |

Full table with file:line evidence in `audit/AUDITOR_D_FRICTION_MOBILE.md`.

---

## 15. P0–P4 prioritized backlog (unified)

### P0 — fix before any production use of affected surfaces

**P0-1 — Privilege escalation via user management**
- Feature: User management · Route: `POST /api/users`, `PATCH /api/users/:id` · Role: any authenticated user
- Expected: only admins create users / change roles. Actual: any user creates `role:"admin"` accounts; any user PATCHes own `role`/`isSuperAdmin`/`passwordHash`.
- Repro: `POST /api/users {role:"admin",...}` with a non-admin session → 201. `PATCH /api/users/<self> {isSuperAdmin:true}` → 200.
- Root cause: no admin gate; `insertUserSchema` includes privileged fields; `storage.updateUser` unfiltered `set()`.
- Frontend: `client/src/pages/settings.tsx` (team tab) · Backend: `server/routes.ts:12838-12903` · DB: `users` · Evidence: AUDITOR_E SEC-1/SEC-2
- Fix: admin-only gate on POST; field whitelist on PATCH (block role/isSuperAdmin/isActive/passwordHash for non-admins). Complexity: **S**

**P0-2 — Unauthenticated timesheet reads**
- Feature: Timesheets · Routes: `GET /api/users/:userId/timesheet`, `GET /api/timesheet/:id` · Role: **unauthenticated**
- Expected: auth + owner/manager. Actual: no auth of any kind — hours/pay/dates readable by anyone.
- Repro: `curl https://host/api/timesheet/1` → 200 with entry JSON.
- Root cause: auth middleware omitted on these two GETs (sibling POST has the check).
- Backend: `server/routes.ts:15314-15330` · DB: `timesheet_entries` · Evidence: AUDITOR_E SEC-3/SEC-4
- Fix: add `requireAuth` + owner/manager check (mirror `:15332`). Complexity: **S**

**P0-3 — E-sign v2 + Sequences 404 in production**
- Feature: E-signatures, Sequences · Routes: `/api/esign/*` (14), `/api/sequences/*` (12); UI: `/esign`, `/esign/:token`, `/sequences` · Role: authenticated
- Expected: API served in prod. Actual: mounted in `server/app.ts` but never in `server/index-vercel.ts` (the esbuild entry for `dist-server/vercel.js`) → every call 404s in prod while UI renders.
- Repro: deploy current tree; `GET /api/esign/envelopes` → 404.
- Root cause: two server entry points diverged; no check that Vercel bundle mounts all routers.
- Frontend: `client/src/pages/esign.tsx`, `esign-sign.tsx`, `sequences.tsx` · Backend: `server/index-vercel.ts:1-30`, `server/app.ts:622,633` · Evidence: AUDITOR_B P0-1
- Fix: add `registerEsignRoutes(app)` + `registerSequenceRoutes(app)` to `index-vercel.ts`; add CI check that both entries mount the same routers. Complexity: **S**

**P0-4 — Investor primary nav dead-ends [REPORTED AT START SHA; FIXED MID-AUDIT — RE-VERIFY]**
- Feature: Investor portal · Routes: `/investor/matches`, `/investor/buy-boxes`, `/investor/locked-up` · Role: investor
- Expected: nav targets render. Actual (at `b1e543ce`): components existed but no routes → CRM 404 on 3 of 4 primary tabs.
- Evidence: AUDITOR_D F-01; AUDITOR_A confirms routes added by coordinator at `a532f42`. Status: presumed resolved, needs runtime re-verification.

### P1 — core workflow blocked or seriously unreliable

| ID | Finding | Feature / Route | Fix | Cx |
|---|---|---|---|---|
| P1-1 | Universal IDOR on by-ID lead/buyer/contract/property endpoints (14 endpoints, read+write+delete) | Leads/Buyers/Contracts/Properties | Object-level guard per entity; long-term: `team_id` on core tables | M |
| P1-2 | Any user can update/delete ANY user's timesheet entry | Timesheets `PATCH/DELETE /api/timesheet/:id` | Owner/manager check | S |
| P1-3 | Arbitrary storage-key file download (`?key=`) | `GET /api/files/by-key/download` | Remove escape hatch / admin-only | S |
| P1-4 | Telnyx webhook accepted unsigned when `TELNYX_PUBLIC_KEY` unset | Telecom webhooks | Fail closed in prod | S |
| P1-5 | Locked-up "deals" client API has no server routes (`/deals*`, `/gate/*`, `/templates`) | Investor locked-up | Implement or remove client paths | M |
| P1-6 | Buy-box split brain: matcher reads only buyer inline fields; `buyer_buybox` + investor `buy_boxes` invisible | Matching | Unify behind one engine input | M |
| P1-7 | Stage machine bypassable: generic PATCH sets any stage; `lead→closed` legal; evidence gates only on document-close | Pipeline/close | Constrain PATCH to stage machine; server-enforced gates | M |
| P1-8 | All call CTAs are raw `tel:` — bypass dialer, DNC, logging | Leads/Buyers/Contacts | Route through `/phone?number=` | M |
| P1-9 | PII in logs: full JSON response bodies on every `/api` request | Observability | Log shape/status only | S |
| P1-10 | Cron failures silent (no heartbeat/alert); dead letters accumulate | Jobs | Heartbeat table + alerts | M |
| P1-11 | Investor UI swallows 404s (`.catch(() => defaults)`) hiding backend outages | Investor portal | Surface error states | S |
| P1-12 | Contract wizard post-send dead end; dialer deep-link to nonexistent `/leads/:id` | Contracts/Phone | One-line nav fixes | S |

### P2 — major friction / mobile failure / inconsistent data

P2-1 Dispo board drag-only (touch-blocked) · P2-2 Native confirm/prompt in money flows · P2-3 Withdraw offer no confirmation · P2-4 Dual offer models (buyer_offers vs lois) · P2-5 Contract/LOI don't carry buyer+price forward · P2-6 No "Call now" after lead creation · P2-7 Dual toast systems · P2-8 Terminology drift (Opportunity/Property/Deal) · P2-9 No "Open in Disposition" after execution · P2-10 Search unscoped · P2-11 `/api/metrics` unauthenticated · P2-12 Export token not user-bound · P2-13 No Telnyx balance monitoring · P2-14 "Notify Buyer" stub button · P2-15 Presence API mocked · P2-16 Free-form statuses (`leads.status`, `buyers.buyerStatus`, `contracts.status`) · P2-17 Missing merge fields render blank · P2-18 Zero-FK schema; bare deletes orphan records · P2-19 Migration 0101 `offers` no-op · P2-20 Schema drift (0080/0099–0102 absent from shared-schema) · P2-21 Dead tables (`video_meetings*`, `storage_config`, `xp_*`)

### P3 — usability / tech debt

P3-1 `npm ci` broken (lockfile drift) · P3-2 5 remaining tsc errors · P3-3 No lint configured · P3-4 Dev-bypass endpoint (gated; ensure flag off in prod) · P3-5 Sentry fail-open both ends · P3-6 No slow-request logging · P3-7 requestId missing from 401s · P3-8 Orphaned pages (`dialer.tsx`, `history.tsx`) · P3-9 Cramped lead dialogs at 360px · P3-10 Small tab touch targets · P3-11 Investor "More" links into CRM routes · P3-12 Raw property IDs in contracts list · P3-13 648/659 unit tests pass (11 env-blocked: no DATABASE_URL)

### P4 — optional

P4-1 Duplicate contacts/properties possible (no merge UI) · P4-2 No draft autosave (LOI, Add Lead) · P4-3 Dual e-sign surfaces (`/esign` vs `/contracts`) · P4-4 Missing global-activity writes (contacts/buyers/tasks) · P4-5 `/api/auth/debug` public (benign)

---

## 16. Recommended implementation phases (fix order)

**Phase 1 — Security (P0/P1):** P0-1 (user priv-esc), P0-2 (timesheet auth), P1-1 (IDOR guards), P1-2 (timesheet write scope), P1-3 (by-key download), P1-4 (webhook fail-closed). Small, surgical, no migrations.
**Phase 2 — Production correctness:** P0-3 (Vercel router mounting + CI parity check), P1-5 (locked-up deals API), P1-11 (error surfaces), P3-1 (lockfile regen), P3-2 (tsc clean).
**Phase 3 — Data integrity:** P1-6 (unify buy boxes), P1-7 (stage gates), P2-4 (unify offers), P2-16 (status enums on write paths), P2-18/19/20 (FKs, 0101 fix, schema sync), orphan cleanup on deletes.
**Phase 4 — Deal-closing blockers:** P1-8 (tel: → dialer), P1-12 (wizard nav), P2-5 (offer→contract prefill), P2-6 (call-now CTA), P2-9 (dispo CTA), F-10/F-13.
**Phase 5 — Observability:** P1-9 (PII in logs), P1-10 (cron heartbeat + dead-letter alerts), P2-13 (Telnyx balance polling + send gating), P3-5/6 (Sentry DSN verify, slow-request logging), gate `/api/metrics`.
**Phase 6 — Mobile:** P2-1 (dispo tap-to-move), P2-2 (in-app dialogs), P3-9/10 (dialog/tab touch targets); then Playwright viewport suite once a dev DB exists.
**Phase 7 — Friction & consistency:** P2-7/8 (toasts, terminology), P2-14/15 (stubs/mocks), P4 items, duplicate-record merge UI, draft autosave.
**Phase 8 — Verification:** provision Neon dev branch (unblocks all runtime testing) → re-run route manifest live → full deal journey lead→close → Playwright e2e across viewports → re-audit.

---

## Appendix — build/test evidence (Auditor A)

| Check | Result | Evidence |
|---|---|---|
| `npm ci` | ❌ FAIL (pre-existing lockfile drift: `@axe-core/playwright` missing) | `/tmp/npm-install.log` |
| `npm run build` | ⚠️ PARTIAL — Vite client ✅ (47s), esbuild server ❌ at audit start (`routes.ts:9334` syntax error from `3be8647`); fixed mid-audit by coordinator (`a532f42`) | `/tmp/build.log` |
| `tsc` | ❌ 5 remaining errors (down from 9+): disposition `offerCount`, messages undefined→number, missing `@types/nodemailer`, `getUser`→`getUsers`, missing `telnyx` module | `/tmp/tsc.log` |
| Lint | n/a — not configured | — |
| Unit tests | 648 pass / 11 fail / 25 skip (684) — all failures environmental (`No database host or connection string was set`) | `/tmp/unit2.log` |
| E2E | Not run — blocked (no DB, server didn't bundle at start) | — |
| DB connectivity | Not run — no `DATABASE_URL` in sandbox | — |

*End of report. All findings static-analysis unless noted. "NOT_TESTED" marks the boundary of what this environment could verify — the recommended Phase 8 re-audit against a live dev database will convert those to pass/fail with traces.*
