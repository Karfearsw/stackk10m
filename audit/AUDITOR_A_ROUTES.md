# AUDITOR A — Baseline + Route Inventory

**Audit window:** 2026-10-09 13:31–13:48 EDT
**Repo:** `~/workspace/builds/final-merge` (branch `feat/phone-queue`)

## 0. Git SHA audited — READ THIS FIRST

The parallel build coordinator **moved the branch mid-audit**:

| Moment | HEAD | Description |
|---|---|---|
| Audit start (13:31 EDT) | `b1e543ce57a882bd9d4eaaeb59d5142c920431e9` | `feat(matchroom): deal rooms + structured offers (Phase 13/14)` |
| During audit (~13:45 EDT) | `11db7cd7d826ef6ee27aedc8a1f558b0afcd0f60` | `feat(matchroom): investor onboarding + buy box management (Phase 9/10)` |
| Audit end (13:48 EDT) | `a532f42a5494b680d4bb1e095e67f88ac55216ae` | `feat(matchroom): integrate Phases 9-16 — mount investor routers, wire routes, type fixes` (coordinator committed the mid-audit fixes: stray-syntax removal in `server/routes.ts`, investor route wiring, luxe barrel exports, type narrowings) |

Between the two SHAs, 8 files changed (+2593/−182), all in the investor portal area
(`client/src/investor/*`, `server/investor/buybox.ts`, `migrations/0099_investor_buyboxes.sql`).
Additionally the working tree is dirty beyond HEAD (fixes being landed live by the
coordinator while this audit ran — see §3). **Findings below are stamped with the tree
state at the time each check ran.** The investor-portal route section was re-verified
after the mid-audit route additions.

## 1. Stack inventory

| Layer | Value (verified from source) |
|---|---|
| Frontend framework | React **19.2.0** + Vite **7.1.9** (`FrameworkPlanner/package.json`) |
| Router | **wouter** 3.3.5 (no react-router) |
| Language / types | TypeScript **5.6.3** |
| Backend | Express **4.21.2** (ESM, bundled with esbuild for prod) |
| Database | PostgreSQL — **Neon** (`@neondatabase/serverless` 0.10.4, `DATABASE_URL` / `POSTGRES_URL_NON_POOLING` env) |
| ORM | **Drizzle ORM** 0.39.1 (+ drizzle-kit 0.31.4, drizzle-zod) |
| Auth | **Custom session auth**: `express-session` 1.18.1 + `connect-pg-simple` 10.0.0 (sessions persisted in Postgres `session` table), passwords verified with `bcryptjs` 3.0.3, login sets `req.session.userId` (`server/routes.ts:2277–2289`). `passport`/`passport-local` are installed deps but the login flow is custom bcrypt + session, not passport strategies. No route-level role gates: `ProtectedRoute` (`client/src/App.tsx:84–101`) only checks `isAuthenticated`; all authenticated users can reach all routes. |
| File storage | **S3-compatible object storage** via `@aws-sdk/client-s3` 3.888 + presigned URLs: three buckets wired via env — `DOCUMENTS_*` (document vault, `server/media/documentVault.ts`), `PROPERTY_PHOTOS_*` (`server/media/propertyPhotos.ts`), `TELEPHONY_MEDIA_*` (call recordings, `server/telephony/objectStorage.ts`) |
| Deployment target | **Vercel** (`vercel.json`: `npm run vercel-build`, output `dist`, `/api/*` → serverless, SPA fallback to `/index.html`); `Dockerfile` also present. Three prod entrypoints are esbuild-bundled: `dist-server/index.js`, `dist-server/ws.js`, `dist-server/vercel.js` (`package.json` `build` script) |
| Background jobs | **In-process** — no Bull/BullMQ/node-cron lib. Two mechanisms: (1) a PostgreSQL-backed durable job queue with advisory-style claim locks (`server/jobs/queue.ts`, `worker.ts` — `setInterval` poller, `server/jobs/worker.ts:114`); (2) `server/cron/*.ts` — 7 scheduled tickers (`campaign-scheduler`, `contract-expiry-sweeper`, `contract-reminders`, `lead-automation`, `rvm-poller`, `skip-trace-worker`, `task-reminders`), each `setInterval`-driven with re-entrancy guards, started from `server/app.ts` / `server/routes.ts` |
| Package manager | **npm** (npm 10.9.4, node v24.20.0) — `package-lock.json` present |
| CSS / UI | Tailwind CSS **v4** (`tailwindcss` 4.1.14, `tw-animate-css`), shadcn/ui (Radix primitives), `next-themes` dark-mode default |
| State / data | `@tanstack/react-query` 5.60.5 |

### Third-party integrations (names only — depth is Auditor B's)

Telnyx (voice/SMS/video/AI assistant — `@telnyx/webrtc`, `@telnyx/video`, `TELNYX_*` env), SignalWire (`@signalwire/js` — legacy dialer hook `useSignalWire`), Stripe (`stripe` 22.1.1 — XP checkout), Resend (`RESEND_API_KEY`) + nodemailer (SMTP fallback), Sentry (`@sentry/*` node + react), Discord outgoing webhooks (`DISCORD_WEBHOOK_URL`), S3-compatible storage (see above), skip-trace providers (Tracerfy, Enformion, CourtListener, free-web — `server/services/skipTrace/`), Google OAuth (login path `server/routes.ts:786` sets `req.session.userId = sub`), IONOS email provisioning (`/api/onboarding/request-forward`).

### Feature flags (server-side, `.env.example`)

`FEATURE_AI_ASSISTANT`, `FEATURE_BUYER_MATCH`, `FEATURE_CAMPAIGNS`, `FEATURE_COMPS`, `FEATURE_ESIGN`, `FEATURE_FIELD_MODE`, `FEATURE_PUBLIC_LISTINGS`, `FEATURE_RVM`, `FEATURE_SKIP_TRACE`, `FEATURE_VIDEO_MEETINGS`, `FEATURE_VOICE_PLAYGROUND`, plus `INVESTOR_PORTAL_ENABLED` (default OFF — when off, every `/investor/*` path renders the CRM 404; `client/src/investor/routes.tsx:44–45`, `server/investor/flag.ts`).

## 2. Baseline report

Working directory for all commands: `~/workspace/builds/final-merge/FrameworkPlanner`.

| Check | Command | Result | Pre-existing failure? | Evidence |
|---|---|---|---|---|
| Install | `npm ci --no-audit --no-fund` | ❌ FAIL | **Yes** — lockfile out of sync before this audit began | `npm error code EUSAGE` / ``npm ci` can only install packages when your package.json and package-lock.json ... are in sync` — `Missing: @axe-core/playwright@4.13.0 from lock file`, `Missing: axe-core@4.13.0 from lock file` (`/tmp/npm-install.log`) |
| Install (workaround) | `npm install --no-save --no-audit --no-fund` | ✅ PASS | n/a | `added 961 packages ... EXIT:0` (`/tmp/npm-install2.log`). `--no-save` used so `package.json`/`package-lock.json` were **not** modified (verified: `git status --porcelain` clean for both files). Previously `node_modules` contained only a bare `typescript/` dir (92K) with **no `.bin`** — the earlier "node_modules/.bin/tsc missing" finding is resolved: `tsc`, `vite`, `vitest`, `playwright`, `drizzle-kit` now present. |
| Build | `npm run build` | ❌ PARTIAL FAIL (client ✅ / server ❌) | **Yes** — broken by commit `3be8647` ("feat(ops): speed-to-lead alerts…", 2026-10-09 13:09 EDT) before this audit | Vite client build succeeded: `✓ built in 47.25s`, `dist/index.html` produced. esbuild server bundle failed: `✘ [ERROR] Expected "finally" but found "as"` — `server/routes.ts:9334:10` (`/tmp/build.log`). `dist-server/` was **not** produced. The parallel coordinator deleted the offending stray `} as any);` line mid-audit; a re-parse with esbuild now succeeds. The fix was committed by the coordinator as `a532f42` (13:41 EDT, after this build ran). |
| Type-check | `node ./node_modules/typescript/bin/tsc` (== `npm run check`) | ❌ FAIL (exit 2) | **Yes** — all errors pre-date this audit; some were fixed by the coordinator *during* the audit | First run (13:36 EDT): 9 syntax errors in `server/routes.ts` (the 9334 `} as any);` cascade + truncated-parse cascade at EOF). After the coordinator's mid-audit fix: 24 errors, mostly in the in-flight investor/matchroom work (`LuxeMobileCardRow`/`LuxeDocState` missing from `@/components/luxe`, bad casts in `server/investor/buybox.ts`, `server/investor/lockedup.ts`). Final run (~14:00 EDT): **5 remaining errors** (`/tmp/tsc.log`): `client/src/pages/disposition.tsx(244,51)` TS2339 `offerCount` missing on `DealCardData`; `client/src/pages/messages.tsx(136,38)` TS2345 `number\|undefined`→`number`; `server/email/sender.ts(83,31)` TS7016 missing `@types/nodemailer`; `server/routes.ts(17027,36)` TS2551 `getUser` missing on `DatabaseStorage`; `server/sequences/engine.ts(330,35)` TS2307 cannot find module `'telnyx'`. |
| Lint | n/a | ➖ NOT CONFIGURED | n/a | No `lint` script in `package.json`; ESLint is not a dependency and no `.bin/eslint` exists. There is nothing to run. |
| Unit tests | `node ./node_modules/vitest/vitest.mjs run tests` (== `npm run test:unit`; 93 test files) | ⚠️ COMPLETED — env-blocked failures | All observed failures are **environmental**, not proven regressions | First attempt was killed by the 280s exec cap (`UNIT_EXIT:124`) and had been poisoned by the then-broken `server/routes.ts` syntax error. Clean re-run completed 13:48 EDT (`/tmp/unit2.log`, 452s): **Test Files 8 failed / 75 passed / 10 skipped (93); Tests 11 failed / 648 passed / 25 skipped (684); 10 uncaught errors.** Failing tests: `tests/auth-503-codes-and-status.test.ts` 4 failed (expects `signup_not_configured` / `db_unavailable` / `email_not_configured` 503 codes — env not configured), `tests/xp-checkout-payment-mode.test.ts` 2 failed (Stripe payment-mode amounts — no Stripe keys), `tests/telephony.test.ts` 3 failed + uncaught `@neondatabase/serverless` socket teardown errors (outbound dispatch `callControlId` / leadId persistence), `tests/dev007-dev008-regression.test.ts` 1 failed (`POST /api/scripts/:id/archive` — DB query error). Every failure's log line traces to `Error: No database host or connection string was set` — **no `DATABASE_URL` in this sandbox**. 648 tests pass; DB/env-dependent tests cannot pass here by construction. |
| E2E tests | `playwright test` (== `npm run test:e2e`) | ➖ NOT RUN — blocked | **Yes** (blocked by the same pre-existing breakage) | 4 spec files (`leads-tasks`, `mobile-nav-a11y`, `playground-session`, `responsive-layout`) × 7 browser projects. Requires a running server on `:3000` + Postgres. The server could not even bundle at audit start (routes.ts syntax error, §Build), and there is no `DATABASE_URL` in this environment. Not attempted beyond feasibility analysis — running it would only reproduce the build failure. |
| DB connectivity | `SELECT 1` via app config / psql | ➖ NOT RUN — no credentials available | n/a | No `DATABASE_URL` in the shell env and **no `.env` file exists** (only `.env.example`, 2026-10-08). Per the read-only/no-secrets constraints, no credential was retrieved or fabricated, so no connection was attempted. Neon access is documented as working from other contexts (MEMORY.md), but it is not reachable from this sandbox. |

### Baseline summary for the coordinator
- The tree was **not green at audit start**: `npm ci` broken (lockfile drift), `npm run build` broken (routes.ts syntax error from `3be8647`), `tsc` broken (same). The coordinator repaired the syntax error and most investor-portal type errors live during the audit; 5 tsc errors and the lockfile drift remain.
- Anything server-side (unit tests touching the DB, e2e, DB connectivity) is blocked in this sandbox by the missing `DATABASE_URL`.

## 3. Route manifest

Router: `client/src/App.tsx` (wouter `Switch`). Shared shell = `Layout` (`client/src/components/layout/Layout.tsx`) = Sidebar + Header + MobileBottomNav + MobileNavDrawer. Desktop nav = `Sidebar.tsx` `primaryNavigation` + `menuGroups` (same list feeds `MobileNavDrawer`); mobile bottom bar = 4 items (`MobileBottomNav.tsx:13–16`).

Roles: **no route-level role gating** — every protected route is `ProtectedRoute` (auth-only). Intended roles are therefore "any authenticated CRM user" throughout; admin-only behavior, if any, is enforced inside pages/APIs (not verified here).

Status legend: `VERIFIED_WORKING` (never claimed without runtime evidence — **not used below**; the app was never run), `NOT_TESTED` (cannot verify without a running app), plus structural statuses where static analysis is conclusive (`DUPLICATE`, `ORPHANED`, redirect shims). All routes below are `NOT_TESTED` at runtime unless otherwise noted.

| Route | Page component | Intended roles | Shared shell | Desktop nav | Mobile nav | API dependencies (observed in page file) | Status |
|---|---|---|---|---|---|---|---|
| `/login` (App.tsx:121) | `client/src/pages/login.tsx` | public (redirects to `/` if authed) | none (auth shell) | – | – | `/api/auth/*` | NOT_TESTED |
| `/signup` (App.tsx:122) | `client/src/pages/signup.tsx` | public (employee code gate) | none | – | – | `/api/auth/*` | NOT_TESTED |
| `/forgot-password` (App.tsx:123) | `client/src/pages/forgot-password.tsx` | public | none | – | – | `/api/auth/*` | NOT_TESTED |
| `/reset-password` (App.tsx:124) | `client/src/pages/reset-password.tsx` | public (token) | none | – | – | `/api/auth/*` | NOT_TESTED |
| `/magic-link` (App.tsx:125) | `client/src/pages/magic-link.tsx` | public (token) | none | – | – | `/api/auth/*` | NOT_TESTED |
| `/l/:token` (App.tsx:128) | `client/src/pages/public-listing.tsx` | public | none (public shell) | – | – | `/api/listings/*`, `/api/public/listings/*` | NOT_TESTED |
| `/esign/:token` (App.tsx:136) | `client/src/pages/esign-sign.tsx` | public (HMAC token) | none | – | – | `/api/esign/sign/*` | NOT_TESTED |
| `/sign/:token` (App.tsx:142) | `client/src/pages/sign-contract.tsx` | public (legacy token) | none | – | – | `/api/sign/envelopes` | NOT_TESTED |
| `/xp` (App.tsx:151) | `client/src/pages/xp/index.tsx` | public storefront | none (XP shell) | ✓ ("XP Booking") | – | `/api/xp/experiences` | NOT_TESTED |
| `/xp/experience` (App.tsx:156) | `client/src/pages/xp/experience.tsx` | public | none | – | – | `/api/xp/experiences`, `/api/xp/bookings/checkout` | NOT_TESTED |
| `/xp/admin` (App.tsx:161) | `client/src/pages/xp/admin.tsx` | authenticated (CRM) | **Layout** | via `/xp` | – | `/api/xp/admin/*`, `/api/xp/experiences` | NOT_TESTED |
| `/xp/checkout-success` (App.tsx:162) | `client/src/pages/xp/checkout-success.tsx` | public | none | – | – | `/api/xp/bookings/session` | NOT_TESTED |
| `/xp/checkout-cancel` (App.tsx:167) | `client/src/pages/xp/checkout-cancel.tsx` | public | none | – | – | none observed in page | NOT_TESTED |
| `/xp/:slug` (App.tsx:174) | `client/src/pages/xp/experience.tsx` | public | none | – | – | same as `/xp/experience` | NOT_TESTED |
| `/` (App.tsx:181) | `client/src/pages/dashboard.tsx` | authenticated | **Layout** | ✓ ("Dashboard") | drawer | `/api/dashboard/stats`, `/api/dashboard/summary`, `/api/leads`, `/api/properties`, `/api/contracts`, `/api/tasks`, `/api/users`, `/api/activity`, `/api/deal-assignments`, `/api/contract-documents` | NOT_TESTED |
| `/dashboard` (App.tsx:182) | `dashboard.tsx` | authenticated | **Layout** | – (active state via `/`) | – | same as `/` | DUPLICATE (alias of `/`; same component) |
| `/leads` (App.tsx:183) | `client/src/pages/leads.tsx` | authenticated | **Layout** | ✓ ("Leads Pipeline") | ✓ bottom ("Leads") | `/api/leads`, `/api/leads/bulk/*`, `/api/leads/notes`, `/api/assignment/*`, `/api/ai/voice/*`, `/api/lead-source-options`, `/api/activity` | NOT_TESTED |
| `/campaigns` (App.tsx:184) | `client/src/pages/campaigns.tsx` | authenticated | **Layout** | ✓ | drawer | `/api/campaigns`, `/api/system/provider-readiness` | NOT_TESTED |
| `/rvm` (App.tsx:185) | `client/src/pages/rvm.tsx` | authenticated | **Layout** | – | – | `/api/rvm/campaigns`, `/api/rvm/audio-assets` | NOT_TESTED |
| `/property/:id` (App.tsx:186) | `client/src/pages/property-detail.tsx` | authenticated | **Layout** | – | – | `/api/opportunities`, `/api/properties/assignments`, `/api/buyers`, `/api/buyers/comms`, `/api/contracts`, `/api/contract-documents`, `/api/deal-assignments`, `/api/activity`, `/api/search`, `/api/users` | NOT_TESTED |
| `/opportunities/:id` (App.tsx:187) | `property-detail.tsx` | authenticated | **Layout** | – | – | same as `/property/:id` | DUPLICATE (same component; nav uses `/opportunities`) |
| `/properties` (App.tsx:188) | `client/src/pages/properties.tsx` | authenticated | **Layout** | – | – | `/api/opportunities`, `/api/pipeline-config`, `/api/teams`, `/api/teams/active` | DUPLICATE-ish (same component as `/opportunities`; not in nav — legacy alias) |
| `/opportunities` (App.tsx:189) | `properties.tsx` | authenticated | **Layout** | ✓ ("Opportunities") | ✓ bottom ("Opps") | same as `/properties` | NOT_TESTED |
| `/contracts` (App.tsx:190) | `client/src/pages/contracts.tsx` | authenticated | **Layout** | ✓ ("Contracts") | drawer | `/api/contracts` (+`?tab=` deep links: `list`/`create`/`closing` used by `setLocation` in App code) | NOT_TESTED |
| `/contract-generator` (App.tsx:191) | `client/src/pages/contract-generator.tsx` | authenticated | **Layout** | – | – | `/api/contract-templates`, `/api/contract-documents`, `/api/lois`, `/api/opportunities`, `/api/properties`, `/api/deal-assignments` | NOT_TESTED |
| `/contracts/new` (App.tsx:192) | `client/src/pages/contract-wizard.tsx` | authenticated | **Layout** | – | – | `/api/contracts`, `/api/contract-templates`, `/api/buyers`, `/api/contacts`, `/api/leads`, `/api/properties` | NOT_TESTED |
| `/contracts/:id` (App.tsx:193) | `client/src/pages/contract-detail.tsx` | authenticated | **Layout** | – | – | `/api/contracts/*`, `/api/sign/signers/*` | NOT_TESTED |
| `/analytics` (App.tsx:194) | `client/src/pages/analytics.tsx` | authenticated | **Layout** | ✓ | drawer | `/api/reports/source`, `/api/contracts`, `/api/leads`, `/api/opportunities`, `/api/deal-assignments`, `/api/contract-documents`, `/api/telephony/analytics/summary` | NOT_TESTED |
| `/settings` (App.tsx:195) | `client/src/pages/settings.tsx` | authenticated | **Layout** | ✓ | drawer | `/api/settings/telecom/*`, `/api/ai/config`, `/api/skip-trace/config`, `/api/system/provider-readiness`, `/api/telephony/health`, `/api/pipeline-config`, `/api/teams/*`, `/api/health` (+`?tab=team` target of `/teams` shim) | NOT_TESTED |
| `/settings/email` (App.tsx:196) | `client/src/pages/settings/email.tsx` | authenticated | **Layout** | – | – | `/api/email/identities`, `/api/email/readiness`, `/api/email/stats`, `/api/email/suppressions` | NOT_TESTED |
| `/settings/assignment` (App.tsx:197) | `client/src/pages/settings/assignment.tsx` | authenticated | **Layout** | – | – | `/api/assignment/rules`, `/api/assignment/auto-assign`, `/api/assignment/capacity`, `/api/assignment/dry-run`, `/api/assignment/unassigned` | NOT_TESTED |
| `/settings/email-provisioning` (App.tsx:198) | `client/src/pages/settings/email-provisioning.tsx` | authenticated | **Layout** | – | – | `/api/onboarding/*` (forwards, checklist) | NOT_TESTED |
| `/settings/onboarding-docs` (App.tsx:199) | `client/src/pages/settings/onboarding-docs.tsx` | authenticated | **Layout** | – | – | `/api/onboarding/docs/*`, `/api/users` | NOT_TESTED |
| `/calculator` (App.tsx:200) | `client/src/pages/calculator.tsx` | authenticated | **Layout** | ✓ | drawer | `/api/opportunities`, `/api/playground/session` | NOT_TESTED |
| `/sequences` (App.tsx:202) | `client/src/pages/sequences.tsx` | authenticated | **Layout** ✅ (fixed — earlier audit found it bypassed the shell; now `import { Layout }` line 4, renders `<Layout>` line 499) | ✓ | drawer | `/api/sequences`, `/api/sequences/process` | NOT_TESTED |
| `/timesheet` (App.tsx:203) | `client/src/pages/timesheet.tsx` | authenticated | **Layout** | ✓ | drawer | `/api/timeclock/*`, `/api/commissions/ledger`, `/api/work-categories`, `/api/worker-profiles`, `/api/users` | NOT_TESTED |
| `/notifications` (App.tsx:204) | `client/src/pages/notifications.tsx` | authenticated | **Layout** | ✓ | drawer | `/api/notifications/*`, `/api/users/*` | NOT_TESTED |
| `/messages` (App.tsx:205) | `client/src/pages/messages.tsx` | authenticated | **Layout** | ✓ ("Messages") | drawer | `/api/messages`, `/api/messages/conversations`, `/api/messages/read`, `/api/messages/unread-count`, `/api/video/rooms`, `/api/users` | NOT_TESTED — tsc error at `messages.tsx(136,38)` (see §2) |
| `/playground` (App.tsx:207) | `client/src/pages/playground.tsx` | authenticated | **Layout** | ✓ ("Research Lab") | ✓ bottom ("Lab") | `/api/playground/sessions/*`, `/api/ai/voice/*` | NOT_TESTED |
| `/buyers` (App.tsx:208) | `client/src/pages/buyers.tsx` | authenticated | **Layout** | ✓ ("Buyers") | drawer | `/api/buyers`, `/api/telephony/sms` | NOT_TESTED |
| `/buyers/qualify` (App.tsx:210) | `client/src/pages/buyers/qualify.tsx` | authenticated | **Layout** ✅ (fixed — earlier bypass; now line 4 / line 461) | ✓ ("Buyer Qualification") | drawer | `/api/buyers/qualification/dashboard`, `/api/buyers/review-queue` | NOT_TESTED |
| `/disposition` (App.tsx:212) | `client/src/pages/disposition.tsx` | authenticated | **Layout** ✅ (fixed — earlier bypass; now line 4 / line 266) | ✓ ("Disposition") | drawer | `/api/disposition/deals` | NOT_TESTED — tsc error at `disposition.tsx(244,51)` (see §2) |
| `/tasks` (App.tsx:213) | `client/src/pages/tasks.tsx` | authenticated | **Layout** | ✓ ("Tasks") | drawer | `/api/tasks`, `/api/teams`, `/api/teams/active` | NOT_TESTED |
| `/tasks/triage` (App.tsx:214) | `client/src/pages/tasks-triage.tsx` | authenticated | **Layout** | – (deep link from tasks) | – | `/api/tasks/sla-dashboard`, `/api/tasks/sla-rules`, `/api/tasks/bulk-triage`, `/api/tasks/check-sla`, `/api/users` | NOT_TESTED |
| `/calendar` (App.tsx:215) | `client/src/pages/calendar.tsx` | authenticated | **Layout** | ✓ ("Calendar") | drawer | `/api/calendar-events`, `/api/leads`, `/api/opportunities`, `/api/users` | NOT_TESTED |
| `/today` (App.tsx:216) | `client/src/pages/today.tsx` | authenticated | **Layout** | ✓ ("Today") | drawer | `/api/tasks` | NOT_TESTED |
| `/contacts` (App.tsx:217) | `client/src/pages/contacts.tsx` | authenticated | **Layout** | ✓ | drawer | `/api/contacts` | NOT_TESTED |
| `/search` (App.tsx:218) | `client/src/pages/search.tsx` | authenticated | **Layout** | – | – | `/api/search` | NOT_TESTED |
| `/field` (App.tsx:219) | `client/src/pages/field.tsx` | authenticated | **Layout** | – | – | `/api/lead-source-options`, `/api/sync` | NOT_TESTED |
| `/phone` (App.tsx:220) | `client/src/pages/phone.tsx` | authenticated | **Layout** | ✓ ("Phone") | drawer | `/api/telephony/calls`, `/api/telephony/history`, `/api/telephony/contacts`, `/api/telephony/voicemail`, `/api/telephony/analytics/summary`, `/api/telephony/health` | NOT_TESTED |
| `/voicemail` (App.tsx:221) | `client/src/pages/voicemail.tsx` | authenticated | **Layout** | ✓ ("Voicemail") | drawer | `/api/telephony/voicemail` | NOT_TESTED |
| `/dialer` (App.tsx:222) | — (redirect) | authenticated | n/a | – | – | n/a | Redirect → `/phone`. The old `client/src/pages/dialer.tsx` (SignalWire bare dialpad) is **orphaned** (see §4). |
| `/dialer-workspace` (App.tsx:223) | `client/src/pages/dialer-workspace.tsx` | authenticated | **Layout** ✅ (fixed — earlier bypass; now line 4 / line 25) | ✓ ("Dialer Workspace") | ✓ bottom ("Dial") | none in page file — API via child widgets (`@/components/dialer/widgets/*`: DialerWorkspaceContext/Grid/useDialerWorkspaceState) | NOT_TESTED |
| `/dialer/workspace` (App.tsx:224) | `dialer-workspace.tsx` | authenticated | **Layout** | – | – | same as above | DUPLICATE (same component as `/dialer-workspace`) |
| `/workspace/communications` (App.tsx:225) | `client/src/pages/workspace-communications.tsx` | authenticated | **Layout** | ✓ ("Communication Hub") | drawer | `/api/telephony/history`, `/api/telephony/sms`, `/api/telephony/sms/threads`, `/api/video/rooms`, `/api/scripts`, `/api/leads`, `/api/tasks`, `/api/activity` | NOT_TESTED |
| `/scripts` (App.tsx:226) | `client/src/pages/scripts.tsx` | authenticated | **Layout** | ✓ | drawer | `/api/scripts`, `/api/scripts/import` | NOT_TESTED |
| `/call-audit` (App.tsx:229) | `client/src/pages/call-audit.tsx` | authenticated | **Layout** | ✓ ("Call Audit") | drawer | none in page — delegates to `@/components/telecom/CallAuditContent` | NOT_TESTED |
| `/lois` (App.tsx:232) | `client/src/pages/lois.tsx` | authenticated | **Layout** | ✓ ("LOIs") | drawer | `/api/lois`, `/api/opportunities`, `/api/properties` | NOT_TESTED |
| `/esign` (App.tsx:233) | `client/src/pages/esign.tsx` | authenticated | **Layout** | ✓ ("E-Sign") | drawer | `/api/esign/envelopes`, `/api/contract-templates` | NOT_TESTED |
| `/system-health` (App.tsx:234) | `client/src/pages/system-health.tsx` | authenticated | **Layout** | ✓ | drawer | `/api/system/health`, `/api/system/routes`, `/api/version` | NOT_TESTED |
| `/jobs` (App.tsx:236) | `client/src/pages/jobs.tsx` | authenticated | **Layout** | ✓ ("Job Queue") | drawer | `/api/jobs`, `/api/jobs/health`, `/api/jobs/dead-letters` | NOT_TESTED |
| `/teams` (App.tsx:237) | `client/src/pages/teams.tsx` | authenticated | none (redirect shim) | – | – | n/a | Redirect shim → `/settings?tab=team` (`teams.tsx:1–16`). Harmless. |
| `/team` (App.tsx:239) | `client/src/pages/team-pulse.tsx` | authenticated | **Layout** | ✓ ("Team") | drawer | `/api/team-pulse` | NOT_TESTED |
| `/companies` (App.tsx:240) | `client/src/pages/companies.tsx` | authenticated | **Layout** | ✓ | drawer | `/api/companies` | NOT_TESTED |
| `/documents` (App.tsx:241) | `client/src/pages/documents.tsx` | authenticated | **Layout** | ✓ ("Documents") | drawer | `/api/documents/upload` | NOT_TESTED |
| `/docs` (App.tsx:242) | `client/src/pages/docs.tsx` | authenticated | **Layout** | ✓ ("Documentation") | drawer | `/api/docs/categories`, `/api/docs/pages` | NOT_TESTED |
| `/automations` (App.tsx:243) | `client/src/pages/automations.tsx` | authenticated | **Layout** | ✓ | drawer | `/api/automations` | NOT_TESTED |
| `/audit` (App.tsx:244) | `client/src/pages/audit.tsx` | authenticated | **Layout** | ✓ ("Audit") | drawer | `/api/audit/runs`, `/api/audit/release-gate` | NOT_TESTED |
| `/audit-log` (App.tsx:245) | `client/src/pages/audit-log.tsx` | authenticated | **Layout** | ✓ ("Audit Log") | drawer | `/api/audit` | NOT_TESTED |
| `/investor/*` (App.tsx:250) | `client/src/investor/routes.tsx` (sub-router) | public signup/login; portal-auth elsewhere; whole group flag-gated (`INVESTOR_PORTAL_ENABLED`, default OFF → CRM 404) | InvestorLayout (own shell, not CRM Layout) | – | – | `/api/investor/status`, `/api/investor/signup`, `/api/investor/login`, `/api/investor/logout`, `/api/investor/me`, `/api/investor/profile`, `/api/investor/buy-box`, `/api/investor/buy-boxes`, `/api/investor/deal-rooms`, `/api/investor/locked-up`, `/api/investor/saved`, `/api/investor/offers`, `/api/investor/offers/structured`, `/api/investor/interests`, `/api/investor/pof` | NOT_TESTED at runtime; **structurally complete** after mid-audit fix (see §4) |

### Investor sub-routes (`client/src/investor/routes.tsx`, current working tree)

| Route | Component | Notes |
|---|---|---|
| `/investor/signup` | `InvestorAuth.InvestorSignup` | public |
| `/investor/login` | `InvestorAuth.InvestorLogin` | public |
| `/investor/discover` | `DiscoverFeed.tsx` | swipe/save/pass deal cards (rebuilt mid-audit: deliberate button-first UX, undo on pass) |
| `/investor/matches` | `matches/MatchesPage.tsx` | **added mid-audit** (was a dead `setLocation` target before) |
| `/investor/buy-boxes` | `buybox/BuyBoxesPage.tsx` | **added mid-audit** |
| `/investor/deal-rooms/:id` | `dealroom/DealRoomPage.tsx` | **added mid-audit** |
| `/investor/locked-up` | `lockedup/LockedUpWorkspace.tsx` (`LockedUpWorkspacePage`) | **added mid-audit** (file was untracked at audit start) |
| `/investor/contracts/:id` | `contracts/ContractWorkspacePage.tsx` | **added mid-audit** (file was untracked at audit start) |
| `/investor/onboarding` | `BuyBoxWizard.tsx` | **added mid-audit** (was a dead `setLocation` target before) |
| `/investor/saved` | `SavedPage.tsx` | |
| `/investor/offers` | `OffersPage.tsx` | |
| `/investor/buy-box` | `BuyBoxWizard.tsx` | same wizard as `/investor/onboarding` — intentional alias |
| `/investor/messages` | `MessagesPage.tsx` | |
| `/investor/account` | `AccountPage.tsx` | |
| `/investor` (exact) | redirect → `/investor/discover` (inside `RequireInvestor`) | |

Also note: `appVariant = getAppVariant()` is computed in `Router()` (`client/src/App.tsx:108`) but **never used** — dead code. Host-based variant (`xp.oceanluxe.org`) exists in `client/src/lib/appVariant.ts` but nothing branches on it in the router.

## 4. Orphaned / duplicate routes

### Orphaned page files (exist, no route renders them)
1. **`client/src/pages/dialer.tsx`** — old bare SignalWire dialpad (`useSignalWire`, full dial UI). The `/dialer` route now redirects to `/phone`; nothing imports this file. Dead code; delete candidate.
2. **`client/src/pages/history.tsx`** — call-history page fetching `/api/telephony/history`. No route, no nav entry, nothing imports it. Dead code (functionality overlaps `/voicemail` and `/workspace/communications`); delete or re-home candidate.

### Dead navigation targets — FIXED mid-audit
3. `/investor/matches` — referenced by `BuyBoxWizard.tsx:218` (`if (done) setLocation("/investor/matches")`) but had **no route** at audit start (fell through to CRM 404). **Fixed during audit**: route added (`investor/routes.tsx:52`).
4. `/investor/onboarding` — referenced by `matches/MatchesPage.tsx:75,113`; no route at audit start. **Fixed during audit** (`investor/routes.tsx:57` → `BuyBoxWizard`).
5. `DealRoomPage`, `LockedUpPage`/`LockedUpWorkspace`, `BuyBoxesPage`, `contracts/ContractWorkspacePage` existed as components with no routes at audit start. **All wired during audit** (`investor/routes.tsx:52–57`).

### Duplicate / alias routes (both render, same component)
6. `/dashboard` ≡ `/` (App.tsx:182 vs 181) — same `Dashboard` component. Nav uses `/`.
7. `/dialer/workspace` ≡ `/dialer-workspace` (App.tsx:224 vs 223) — same `DialerWorkspace` component.
8. `/opportunities` ≡ `/properties` (App.tsx:189 vs 188) — same `Properties` component; nav uses `/opportunities`; `/properties` is an unlinked legacy alias.
9. `/opportunities/:id` ≡ `/property/:id` (App.tsx:187 vs 186) — same `PropertyDetail` component.
10. `/investor/buy-box` ≡ `/investor/onboarding` — same `BuyBoxWizard` component (appears intentional).

### Redirect shims (not orphans, recorded for completeness)
- `/dialer` → `/phone` (App.tsx:222)
- `/teams` → `/settings?tab=team` (App.tsx:237 → `teams.tsx:8`)

## 5. Notes, caveats, and recommended follow-ups

1. **Nothing is marked VERIFIED_WORKING.** The app was never run (no DB, server didn't bundle at audit start). Every runtime claim needs a live environment; Auditor C (or the coordinator) should re-run this manifest against a deployed preview with a database.
2. **Moving target.** The coordinator landed ~2.5k lines of investor-portal work plus live fixes *during* this audit (HEAD moved `b1e543ce` → `11db7cd7` → `a532f42` within ~17 minutes; the final commit integrated the fixes). Re-verify the investor section before citing it.
3. **Remaining type errors (5, `/tmp/tsc.log`)** — `disposition.tsx:244` (`offerCount` on `DealCardData`), `messages.tsx:136` (undefined→number), `sender.ts:83` (missing `@types/nodemailer`), `routes.ts:17027` (`getUser` vs `getUsers`), `sequences/engine.ts:330` (module `'telnyx'`). Two of these sit on nav-visible pages (`/disposition`, `/messages`).
4. **`npm ci` is broken by lockfile drift** (`@axe-core/playwright`, `axe-core` missing from lock). CI/Vercel builds using `npm ci` will fail; fix with a lockfile regen (requires a source-tree write — left to the coordinator).
5. **Orphaned pages** `pages/dialer.tsx` and `pages/history.tsx` are delete candidates (confirm no other branch references them first).
6. **Roles:** no route-level RBAC exists; if any page is meant to be admin-only, it is currently reachable by every authenticated user. Worth an explicit decision.
7. **API-dependency column** was derived by static regex over page files (template-literal `/api/...` references). Endpoints reached only through deeply nested child components may be under-listed (noted per row where the page delegates).
8. Logs retained for the coordinator: `/tmp/npm-install.log` (npm ci failure), `/tmp/npm-install2.log` (successful install), `/tmp/build.log` (vite OK / esbuild failure), `/tmp/tsc.log` (final 5 errors), `/tmp/unit.log` + `/tmp/unit2.log` (unit runs).
