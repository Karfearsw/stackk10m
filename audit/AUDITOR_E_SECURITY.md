# AUDITOR E — Observability + Security Audit (Ocean Luxe CRM)

**Auditor:** E (Observability + Security)
**Repo:** `~/workspace/builds/final-merge` (branch: `feat/phone-queue`)
**Git SHA at audit start:** `b1e543ce57a882bd9d4eaaeb59d5142c920431e9`
**Audit date:** 2026-10-09 ~13:30 EDT
**Method:** read-only static code inspection (`FrameworkPlanner/server/**`, `FrameworkPlanner/client/src`). No migrations run, no DB touched, no outbound messages sent, no exploits attempted.
**Caveat:** a parallel build coordinator had uncommitted working-tree changes during this audit (modified investor client files + untracked investor/buybox files, new migrations). Line numbers below refer to the tree as audited; uncommitted changes may shift them.

---

## PART 1 — OBSERVABILITY

### 1.1 Request / trace IDs — PRESENT (with one gap)

- `server/app.ts:148-150` — middleware assigns `x-request-id` (client-supplied or `crypto.randomUUID()`), stores in `res.locals.requestId`, echoes back on the response header. A second logging middleware at `app.ts:259-264` re-reads/generates it for request logging.
- Propagated to: global error handler (`app.ts:103-129` — `http_error` structured log + client error payload includes `requestId`), and login/auth error payloads throughout `server/routes.ts` (e.g. `routes.ts:2199`).
- **Gap:** `requireAuth` 401 responses (`routes.ts:427-441`) do NOT include the requestId in the body, and DB query errors deep in services (e.g. webhook router) do not carry the requestId — correlation is incomplete for the most common failure paths.

### 1.2 Structured logging — MIXED

- The global error handler and the buyer-create path use structured JSON (`console.error(JSON.stringify({ts, event, requestId, ...}))`) — e.g. `app.ts:111-122`, `routes.ts:~16008` (`buyer_create_invariant`).
- Elsewhere the codebase is raw `console.log/console.error` with string interpolation (`server/routes.ts` has ~77 `console.*` calls; most cron workers only `console.error("[Automation] Error running lead automation:", error)`).
- There is NO centralized logger (no pino/winston/bunyan) — `server/lib/` contains only `time-entry-math.ts`.
- Backend Sentry: `server/sentry.ts` — `initSentry()` is a no-op unless `SENTRY_DSN` is set. It is opt-in and there is no verification anywhere that it is set in production (fail-open).

### 1.3 Frontend error capture — PRESENT

- `client/src/main.tsx:8` — `Sentry.init()` for `@sentry/react`; `client/src/components/system/AppErrorBoundary.tsx` wraps the app in `Sentry.ErrorBoundary`.
- **Gap:** no `window.onerror` / `unhandledrejection` handlers found outside Sentry, so if the Sentry DSN is unset on the client the app has zero frontend error capture (fail-open, same as backend).

### 1.4 Log redaction

Redaction utilities that exist:
- `server/db.ts:33` `redactDbUrlForLogs` + `server/env.ts:82` `redactDatabaseUrl` — DB connection strings redacted; `env.ts:8` documents "secret values are never logged".
- `server/scripts/scan-secrets.ts` — a secret scanner exists (not wired into any pre-commit/CI that I could find).

**Violations found:**

| # | Severity | Location | Issue |
|---|----------|----------|-------|
| L1 | **P1** | `server/app.ts:275-285` | The request-logging middleware logs the **full JSON response body** (`capturedJsonResponse`) for every `/api` request: `logLine += ` :: ${JSON.stringify(capturedJsonResponse)}``. Truncated to 80 chars, but lead/buyer/user payloads (owner names, phone numbers, emails) land in plaintext logs. This is systematic PII-in-logs. |
| L2 | P2 | `server/routes.ts` (77 console calls) + cron workers | No redaction at the logging boundary; lead objects, skip-trace payloads, and error payloads are interpolated ad hoc. No central place enforces masking. |
| L3 | P2 | `server/services/telecom/webhook-router.ts:34-38` | On signature rejection it logs only booleans + body length (good), but on processing errors (`:72`, `:76`) it logs `console.error("Telnyx webhook processing error:", err)` — error objects from Telnyx SDKs can embed payload fields (from/to numbers). Partial exposure. |

No evidence of tokens/passwords/full call-note bodies being console-logged.

### 1.5 Slow-request / failed-job / failed-webhook visibility

- **Failed jobs:** `server/jobs/dead-letter.ts` — a real dead-letter queue (`dead_letter_queue` table) with list/retry/purge helpers. Jobs that exhaust `max_attempts` land there. **But:** no alerting on dead-letter growth, no dashboard wiring found, and no retention policy — dead letters accumulate silently unless an operator polls.
- **Cron workers** (`server/cron/*.ts` — campaign-scheduler, contract-expiry-sweeper, contract-reminders, lead-automation, rvm-poller, skip-trace-worker, task-reminders): all `setInterval`-based, all catch errors with a bare `console.error` (e.g. `lead-automation.ts:74-77`). A silently-failing cron produces no alert; nothing records tick success/failure (no heartbeat table, no last-run watermark).
- **Failed webhooks:** Telnyx webhook failures log `console.error` only; no dead-letter capture for webhook events that throw after the idempotency claim is released.
- **Slow requests:** prom-client counters (`httpRequestsTotal`, `httpErrorsTotal`, `server/metrics.ts`) but **no latency histogram and no slow-request threshold log** — slow requests are invisible.
- **Metrics endpoint:** `GET /api/metrics` (`server/app.ts:686`) is **unauthenticated** — exposes traffic patterns, per-path 5xx counts, and Node runtime metrics to anyone. P2 info disclosure.

### Observability gaps table

| ID | Severity | Gap | Evidence |
|----|----------|-----|----------|
| OBS-1 | **P1** | Response bodies (lead/buyer/user PII) written to server logs on every `/api` request | `server/app.ts:275-285` |
| OBS-2 | P1 | No centralized logger; unstructured console.* across 77+ call sites in routes.ts + cron workers | `server/routes.ts`, `server/cron/*` |
| OBS-3 | P1 | Cron failures are console.error-only; no heartbeat, no alert, no last-run tracking | `server/cron/lead-automation.ts:74-77` and siblings |
| OBS-4 | P2 | Sentry backend + frontend are fail-open (no-op without DSN); nothing verifies DSN is set in prod | `server/sentry.ts:3-11`, `client/src/main.tsx:8` |
| OBS-5 | P2 | `/api/metrics` unauthenticated — traffic + runtime info publicly readable | `server/app.ts:686-690` |
| OBS-6 | P2 | Dead-letter queue exists but no alerting/dashboard/retention for failed jobs | `server/jobs/dead-letter.ts` |
| OBS-7 | P2 | Webhook processing errors after idempotency-claim release have no dead-letter path | `server/services/telecom/webhook-router.ts:58-72` |
| OBS-8 | P2 | No latency histogram / slow-request logging; performance regressions invisible | `server/metrics.ts`, `server/app.ts:273-291` |
| OBS-9 | P3 | requestId absent from `requireAuth` 401s and from service-layer DB errors — incomplete trace correlation | `server/routes.ts:427-441` |

---

## PART 2 — SECURITY / TENANT ISOLATION

### Architectural context (critical to read first)

The core entity tables — `leads` (`shared-schema.ts:8`, only has `assignedTo`, no team column), `properties` (`:165`), `contracts` (`:645`), `buyers` (`:1779`) — have **no `team_id` column at all**. Team scoping (`requireTeamMembership`, `requireActiveTeam`, `getOrInitActiveTeamId`, `allowedAssignedToUserIds`) is a newer layer applied inconsistently: list/search-on-some-entities filter by "leads assigned to active team members + unassigned", while **every by-ID read/write endpoint fetches by raw ID with no ownership/team check**. The data model is effectively single-tenant for core entities; the team filter is a UI-level convention, not a security boundary.

### Findings table

| ID | Severity | Finding | Endpoint / file | Expected | Actual | Evidence | Recommended fix | Complexity |
|----|----------|---------|-----------------|----------|--------|----------|-----------------|------------|
| SEC-1 | **P0** | Any authenticated user can **create a user account with `role: "admin"` / `isSuperAdmin: true`** — no admin check on user creation | `POST /api/users` | Admin-only user creation, privileged fields stripped for non-admins | `requireAuth` only; `insertUserSchema.parse(req.body)` passes `role`/`isSuperAdmin` straight to `createUser` | `server/routes.ts:12838-12848`; schema includes both fields: `shared-schema.ts:1011, ~997, ~998`; `storage.updateUser` raw `set()` `storage.ts:2478` | Add `isAdminUser` gate; strip `role`/`isSuperAdmin`/`isActive` from body for non-admin callers | Small |
| SEC-2 | **P0** | **Self privilege escalation:** any user can `PATCH /api/users/:id` (own id) with `{ role: "admin" }` or `{ isSuperAdmin: true }` or arbitrary `passwordHash` — no field filtering | `PATCH /api/users/:id` | Privileged fields (`role`, `isSuperAdmin`, `isActive`, `passwordHash`) restricted | `isSameUserOrAdmin` passes for self; `insertUserSchema.partial()` accepts all columns; `updateUser` does unfiltered `set()` | `server/routes.ts:12882-12903`; `isSameUserOrAdmin` `routes.ts:237-239`; `storage.ts:2478-2481` | Whitelist updatable fields per role; require admin for `role`/`isSuperAdmin`/`isActive`; route passwordHash only through the dedicated password-change endpoint | Small |
| SEC-3 | **P0** | `GET /api/users/:userId/timesheet` has **no authentication at all** — any unauthenticated request reads any user's timesheet (hours, pay, dates) | `GET /api/users/:userId/timesheet` | requireAuth + owner-or-manager check | No auth of any kind before `storage.getTimesheetEntries` | `server/routes.ts:15314-15321` | Add `requireAuth` + owner/manager check (mirror `POST /api/users/:userId/timesheet` at `:15332-15338`) | Small |
| SEC-4 | **P0** | `GET /api/timesheet/:id` has **no authentication at all** — any unauthenticated request reads any timesheet entry by ID | `GET /api/timesheet/:id` | requireAuth + ownership check | No auth before `storage.getTimesheetEntryById` | `server/routes.ts:15323-15330` | Add `requireAuth` + owner/manager check | Small |
| SEC-5 | **P1** | Any authenticated user can **update/delete ANY user's timesheet entry** by ID (no ownership or manager check) | `PATCH /api/timesheet/:id`, `DELETE /api/timesheet/:id` | Owner-or-manager gate | `requireAuth` only; no entry-ownership verification | `server/routes.ts:15358-15377` | Fetch entry, enforce `entry.userId === user.id \|\| isManagerUser(user)` | Small |
| SEC-6 | **P1** | IDOR on all core by-ID endpoints: any authenticated user can read/write/delete any lead, buyer, contract, property by changing the ID — bypasses the list-view team filter (`allowedAssignedToUserIds`) | `GET/PATCH/DELETE /api/leads/:id`, `GET/PATCH/DELETE /api/buyers/:id`, `GET/PATCH/DELETE /api/contracts/:id`, `GET/PATCH/DELETE /api/properties/:id`, `GET /api/contracts/:id/events`, `GET /api/buyers/:id/sms-thread`, `GET/POST /api/leads/:id/notes`, `GET /api/leads/:id/buyer-matches`, `GET /api/leads/:id/skip-trace/latest` | Object-level authorization: verify the record is visible to the caller's team/assignment scope | `requireAuth` only; direct `storage.getLeadById(id)` etc. with no scope check | `server/routes.ts:3714-3723`, `5983-5984`, `6075-6079`, `10647-10655`, `10684-10687`, `15984-15991`, `16023-16037`, `10340-10349`, `10379-10383`, `11014-11019`, `7136-7152`, `3725-3735`, `5000`, `6607` | Add a `requireLeadVisible(req,res,id)`-style guard per entity (or add team_id to core tables and enforce at storage layer) | Medium |
| SEC-7 | **P1** | `GET /api/files/:id/download` — `requireAuth` only, **no ownership check** on the stored-file record; worse, the `id === "by-key"` branch lets any authenticated user pass an arbitrary `?key=` storage key and download any file from the bucket | `GET /api/files/:id/download` (`/api/files/by-key/download`) | Ownership check on the file record; remove arbitrary-key download | `storage.getStoredFile(id)` → download; `by-key` branch takes `req.query.key` verbatim | `server/routes.ts:8943-8975` | Verify file record ownership/team before download; drop the `by-key` escape hatch or restrict to admin | Small |
| SEC-8 | **P1** | Telnyx webhook signature verification is **conditional**: if `TELNYX_PUBLIC_KEY` is unset, webhooks are accepted **unsigned** — forged events can mutate call logs, messages, and leads | `POST /api/v1/telecom/webhooks/telnyx` | Reject unsigned webhooks in production (fail closed) | `if (process.env.TELNYX_PUBLIC_KEY)` guards the whole check | `server/services/telecom/webhook-router.ts:28-40` | Fail closed when unset in production; alert on missing key (readiness check at `routes.ts:9129` only labels it "unconfigured") | Small |
| SEC-9 | P2 | Global search (`GET /api/search`) queries **unscoped** `leads`, `properties`, `contacts` — bypasses the team filter applied on list endpoints (documents/companies are team-scoped, showing the pattern is known) | `GET /api/search` | Same `allowedAssignedToUserIds`/team scope as list endpoints | Raw `SELECT ... FROM leads/properties/contacts WHERE ... LIKE` with no scope predicate | `server/routes.ts:2036-2075` (leads/properties/contacts queries; companies/documents scoped at `:2063-2072`) | Apply the active-team assignment filter to the leads/properties/contacts subqueries | Small |
| SEC-10 | P2 | Unauthenticated `/api/metrics` exposes per-path traffic + 5xx counts + Node runtime metrics (recon surface) | `GET /api/metrics` | requireAuth (or admin-only / internal network) | No auth | `server/app.ts:686-690` | Gate behind admin auth | Trivial |
| SEC-11 | P2 | Export download token is bearer-only: `GET /api/crm/export/files/:id/download` verifies the token hash but does not bind the token to the requesting user/session — anyone with the URL downloads the export | Export file download | Token bound to user or single-session check | `verifyExportToken(job, token)` — hash compare + expiry only | `server/routes.ts:1122-1136`; `server/crm/import-export.ts:1484-1494` | Bind token to creator userId, or require session auth in addition to token | Small |

### Explicitly verified GOOD (not findings)

- **`/api/documents/:id/download` and `/preview`** — `requireActiveTeam` + `doc.teamId !== ctx.teamId` → 404 + vault role check (`canViewVaultDocument`); signed URLs via provider with 5–10 min expiry. Exemplary pattern. (`routes.ts:12243-12290`)
- **Media routes** (`/api/media/*`) — `requireActiveTeam` throughout (`server/media/media-routes.ts:133-356`).
- **Telnyx webhook idempotency** — dedupe by provider event ID via `processed_webhook_events` (`INSERT ... ON CONFLICT DO NOTHING`); claim released on processing failure so Telnyx retries reprocess (`webhook-router.ts:44-69, 188-191`).
- **E-sign signer links** — HMAC-signed, nonce-bound, expiry-checked, single-use (`consumeSignerToken` atomic; `server/esign/envelopes.ts:175-189`).
- **Investor portal** — separate session key (`investorUserId`) so investors can never hit agent `requireAuth`; `requireActiveInvestor` enforces `role === "investor"` + `investorStatus === "active"` + linked buyer record; admin investor endpoints enforce `isAdminish` on the *agent* session (`server/investor/router.ts:9-11, 74-122, 359-386`; `service.ts:173-181`).
- **`POST /api/users/:userId/timesheet`** — owner-or-manager check present (`routes.ts:15338`).
- **`PATCH /api/users/:id/password`** — self-only + current-password re-auth + min length (`routes.ts:12850-12880`).
- **`PATCH /api/buyers/:id`** — strips `userId` from body, preventing ownership reassignment (`routes.ts:16025-16027`).
- **Session cookie** — `httpOnly`, `secure` in production, `sameSite: "lax"`, `saveUninitialized: false` (`app.ts:208-224`); `SESSION_SECRET` required in production (`app.ts:75-84`).
- **Export token** — SHA-256 hash compare + expiry (`import-export.ts:1484`); login/investor auth endpoints have rate-limit guards.
- **No hardcoded secrets** found in server source; only `.env.example` is committed; `vitest.config.ts` reads URLs from env (the previously reported hardcoded Neon URL is no longer present).
- **No client-exposed secrets**: no `VITE_*` vars containing keys/secrets in `client/src`.

### Per-endpoint auth/scoping verdict (16 endpoints checked)

| Endpoint | Auth | Team/object scoping | Verdict |
|----------|------|--------------------|---------|
| `GET /api/leads/:id` (`routes.ts:3714`) | requireAuth ✅ | None — any ID readable | ❌ IDOR (SEC-6) |
| `PATCH /api/leads/:id` (`:5983`) | requireAuth ✅ | Assignee-change checked (`requireAssigneeInActiveTeam`) but record itself unscoped | ❌ IDOR on write (SEC-6) |
| `DELETE /api/leads/:id` (`:6075`) | requireAuth ✅ | None | ❌ (SEC-6) |
| `GET /api/contracts/:id` (`:10647`) | requireAuth ✅ | None | ❌ (SEC-6) |
| `PATCH /api/contracts/:id` (`:10684`) | requireAuth ✅ | None | ❌ (SEC-6) |
| `GET /api/buyers/:id` (`:15984`) | requireAuth ✅ | None | ❌ (SEC-6) |
| `PATCH /api/buyers/:id` (`:16023`) | requireAuth ✅ | None (userId stripped, good) | ❌ (SEC-6) |
| `DELETE /api/buyers/:id` (`:16037`) | requireAuth ✅ | None | ❌ (SEC-6) |
| `GET /api/properties/:id` (`:10340`) | requireAuth ✅ | None (also leaks linked lead) | ❌ (SEC-6) |
| `PATCH /api/properties/:id` (`:10379`) | requireAuth ✅ | None | ❌ (SEC-6) |
| `GET /api/buyers/:id/sms-thread` (`:7136`) | requireAuth ✅ | None | ❌ (SEC-6) |
| `GET /api/contracts/:id/events` (`:11014`) | requireAuth ✅ | None | ❌ (SEC-6) |
| `POST /api/users/:userId/timesheet` (`:15332`) | requireAuth ✅ | Owner-or-manager ✅ | ✅ PASS |
| `GET /api/users/:userId/timesheet` (`:15314`) | **None** ❌ | None | ❌❌ **P0 no-auth** (SEC-3) |
| `GET /api/timesheet/:id` (`:15323`) | **None** ❌ | None | ❌❌ **P0 no-auth** (SEC-4) |
| `PATCH/DELETE /api/timesheet/:id` (`:15358/:15369`) | requireAuth ✅ | None | ❌ cross-user write (SEC-5) |
| `GET /api/leads` (`:3561`), `GET /api/search` (`:2036`) | requireAuth ✅ | Team-filtered ✅ / partially scoped ⚠️ | ✅ / ⚠️ (SEC-9) |
| `GET /api/documents/:id/download` + `/preview` (`:12243`) | requireActiveTeam ✅ | teamId match + vault role ✅ | ✅ PASS (reference pattern) |
| `POST /api/users` (`:12838`), `PATCH /api/users/:id` (`:12882`) | requireAuth ✅ | Missing admin/field-level checks | ❌❌ **P0 priv-esc** (SEC-1/SEC-2) |
| Investor routes (`/api/investor/*`, `/api/admin/investors/*`) | separate session + requireActiveInvestor / requireAdmin ✅ | Buyer-linked ✅ | ✅ PASS |

### Role enforcement

Server-side role enforcement **does** exist and is used broadly (`isAdminUser` gates ~20+ routes in `routes.ts`; `requireTeamMembership` with min-role ranks; investor router's `requireAdmin`; media/vault role checks). It is **not** UI-only. However, the three critical account-management and timesheet endpoints above were missed by it, which is where the P0s live.

---

## TOP ACTIONS (priority order)

1. **SEC-1/SEC-2 (P0):** gate `POST /api/users` to admin and whitelist PATCH-able fields on `PATCH /api/users/:id` (block `role`, `isSuperAdmin`, `isActive`, `passwordHash` for non-admins). — Small
2. **SEC-3/SEC-4 (P0):** add auth to the two unauthenticated timesheet GET endpoints. — Trivial
3. **SEC-5 (P1):** owner/manager check on timesheet update/delete. — Small
4. **OBS-1 (P1):** stop logging full JSON response bodies in `app.ts` (log shape/status only, or redact PII fields). — Small
5. **SEC-6 (P1):** add object-level guards to by-ID lead/buyer/contract/property endpoints (verify visibility under the caller's active-team scope); longer term, add `team_id` to core tables. — Medium
6. **SEC-7/SEC-8 (P1):** remove the `by-key` arbitrary file download; fail closed on missing `TELNYX_PUBLIC_KEY` in production. — Small
7. **OBS-3 (P1):** add cron heartbeat/last-run tracking + alerting; wire dead-letter growth alerts. — Medium

---
*End of AUDITOR E report. All findings are static-analysis; none were exercised against a live system.*
