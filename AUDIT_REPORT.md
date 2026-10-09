# CRM Phase 0 — Repository Audit Report

**Date:** 2026-10-09
**Repo:** `~/workspace/builds/final-merge/FrameworkPlanner`
**Scope:** Read-only audit. No files were modified.
**Method:** Direct file inspection — every claim below cites a verified path and line number.

---

## 1. Framework & Build Tools (`package.json`)

| Item | Value |
|---|---|
| Framework | React **19.2.0** + React DOM 19.2.0, Vite **7.1.9** (`vite build`), ES modules |
| Router | **wouter 3.3.5** (not react-router) |
| Backend | Express 4.21.2, bundled with esbuild for prod (`dist-server/index.js`) |
| Styling | **Tailwind CSS 4.1.14** via `@tailwindcss/vite` (CSS-first config, no `tailwind.config.js`; theme in `client/src/index.css` via `@theme inline`) |
| UI kit | Radix UI primitives + shadcn-style `components/ui` |
| Breakpoints | Tailwind v4 defaults: `sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px, `2xl` 1536px. Mobile nav hides at `lg` (`lg:hidden` in `MobileBottomNav.tsx:20`); sidebar renders only `lg+` (`hidden lg:flex` in `Layout.tsx:17`) |
| State/data | TanStack React Query 5.60.5, `apiRequest` wrapper in `client/src/lib/queryClient.ts` |
| DB | Drizzle ORM 0.39.1 + Neon serverless Postgres (`@neondatabase/serverless`), schema in `server/shared-schema.ts` |
| Unit tests | **vitest 4.0.15** + `@testing-library/react` 16.3.3 + jsdom |
| E2E tests | **Playwright** `@playwright/test` 1.55.0 (`playwright.config.ts`) |
| TypeScript | 5.6.3 (`npm run check` → `tsc`) |

---

## 2. Route Definitions (`client/src/App.tsx`)

Router: wouter `<Switch>` in `App.tsx:107-264`. Auth guard is `ProtectedRoute` (App.tsx:88-105), which redirects unauthenticated users to `/login`.

### Protected routes (all wrapped in `ProtectedRoute`)

| Path | Page component |
|---|---|
| `/`, `/dashboard` | `pages/dashboard.tsx` |
| `/leads` | `pages/leads.tsx` |
| `/campaigns` | `pages/campaigns.tsx` |
| `/rvm` | `pages/rvm.tsx` |
| `/property/:id`, `/opportunities/:id` | `pages/property-detail.tsx` |
| `/properties`, `/opportunities` | `pages/properties.tsx` |
| `/contracts`, `/contract-generator`, `/contracts/new`, `/contracts/:id` | `pages/contracts*.tsx` |
| `/analytics`, `/settings` (+`/settings/email`, `/assignment`, `/email-provisioning`, `/onboarding-docs`) | `pages/analytics.tsx`, `pages/settings*.tsx` |
| `/calculator`, `/sequences` | `pages/calculator.tsx`, `pages/sequences.tsx` |
| `/timesheet` | `pages/timesheet.tsx` |
| `/notifications`, `/messages` | `pages/notifications.tsx`, `pages/messages.tsx` |
| **`/playground`** | `pages/playground.tsx` — **dev-only**: `{import.meta.env.DEV && <Route .../>}` (App.tsx:201). No route exists in production builds. |
| `/buyers`, `/buyers/qualify` | `pages/buyers.tsx`, `pages/buyers/qualify.tsx` |
| `/disposition` | `pages/disposition.tsx` |
| `/tasks`, `/tasks/triage` | `pages/tasks.tsx`, `pages/tasks-triage.tsx` |
| `/calendar`, `/today`, `/contacts`, `/search`, `/field` | `pages/calendar.tsx`, `pages/today.tsx`, `pages/contacts.tsx`, `pages/search.tsx`, `pages/field.tsx` |
| `/phone` (and `/dialer` → redirect) | `pages/phone.tsx` |
| `/dialer-workspace`, `/dialer/workspace` | `pages/dialer-workspace.tsx` |
| `/workspace/communications` | `pages/workspace-communications.tsx` |
| `/scripts`, `/call-audit`, `/lois`, `/esign` | `pages/scripts.tsx`, `pages/call-audit.tsx`, `pages/lois.tsx`, `pages/esign.tsx` |
| `/system-health`, `/jobs`, `/teams`, `/team` | `pages/system-health.tsx`, `pages/jobs.tsx`, `pages/teams.tsx`, `pages/team-pulse.tsx` |
| `/companies`, `/documents`, `/docs`, `/automations`, `/audit`, `/audit-log` | `pages/*.tsx` |
| `/xp/admin` | `pages/xp/admin.tsx` |
| `/investor/*` | `client/src/investor/routes.tsx` |

### Public routes
`/login`, `/signup`, `/forgot-password`, `/reset-password`, `/magic-link`, `/l/:token`, `/esign/:token`, `/sign/:token`, `/xp`, `/xp/experience`, `/xp/checkout-success`, `/xp/checkout-cancel`, `/xp/:slug`.

---

## 3. Layout / App Shell

**Single authenticated shell:** `client/src/components/layout/Layout.tsx` (exports `Layout`).

Composition (Layout.tsx:10-38):
- `<Sidebar />` — desktop, wrapped in `hidden lg:flex` (≥1024px only)
- `<Header />`
- `<main>` with mobile bottom padding `pb-[calc(4rem+env(safe-area-inset-bottom))]` on mobile / `lg:pb-0`
- `<MobileBottomNav onMore={...} />` — `lg:hidden` (MobileBottomNav.tsx:20)
- `<MobileNavDrawer>` (Sheet drawer for "More")
- `<GlobalDialerWidget />`, `<OnboardingTour />` (global overlays)

### Pages that BYPASS the shared shell (no sidebar, no bottom nav)

Verified via `grep -L "layout/Layout"`:

| Route | File | What it renders instead | Navigation impact |
|---|---|---|---|
| `/dialer-workspace` (+ `/dialer/workspace`) | `pages/dialer-workspace.tsx:24-32` | Bare `<DialerWorkspaceGrid />` inside providers | **No sidebar, no bottom nav, no header** on any viewport |
| `/disposition` | `pages/disposition.tsx:129` | Bare `<div className="space-y-4 p-4 lg:p-6">` | **No nav on any viewport**; drag/drop workspace unreachable from mobile nav |
| `/sequences` | `pages/sequences.tsx:185` | Bare `<div className="p-6 space-y-6">` | **No nav on any viewport** |
| `/buyers/qualify` | `pages/buyers/qualify.tsx` | No `Layout` import | **No nav on any viewport** |
| `/teams` | `pages/teams.tsx:8-17` | Redirects to `/settings?tab=team` (loader screen) | Intentional redirect; no content |
| Auth/public pages (`/login`, `/signup`, `/forgot-password`, `/reset-password`, `/magic-link`, `/not-found`, `/public-listing`, `/sign/:token`, `/esign/:token`) | — | Own minimal layouts | Intentional — public flows |

All other protected routes (`/phone`, `/field`, `/timesheet`, `/leads`, etc.) correctly render inside `<Layout>`.

---

## 4. Navigation Configuration

**Central config exists for desktop sidebar + mobile drawer, but NOT for the mobile bottom nav.**

- `client/src/components/layout/Sidebar.tsx:100-136` — `primaryNavigation` (grouped: e.g. "Insights", "System", each item `{ name, href, icon }`). Exported as `navigation` and `primaryNavigation`.
- `client/src/components/layout/MobileNavDrawer.tsx:6` — reuses `primaryNavigation` from `./Sidebar`. Single source of truth ✓
- **Problem:** `client/src/components/layout/MobileBottomNav.tsx:11-16` has its own **hardcoded** 4-item list: Leads, Opps (`/opportunities`), Dial (`/dialer-workspace`), **Play (`/playground`)**. The Play tab links to a **dev-only route that does not exist in production** — tapping it in prod hits the `NotFound` fallback. "More" opens the shared drawer.

No role/permission gating exists in the nav config (no `roles` field on nav items); role checks, if any, are per-page.

---

## 5. Playground — Current Implementation

**File:** `client/src/pages/playground.tsx` (318 lines, fully read).

**What it is today:** NOT a sales-script practice workspace. It is a **voice-driven deal-underwriting workspace** titled "Property Playground" ("Research hub for zoning, suppliers, comps, and deal ideas" — line 246).

**UI structure:**
1. Header: title + session `Badge` (Session N / "Live")
2. Context `Card`: address `Input` + Apply button, Voice button (opens `VoiceActionDialog`), "Reopen session" button, resolved-address line
3. `VoiceActionDialog` (from `components/leads/VoiceActionDialog`) — voice transcript → parse → preview → apply → undo
4. `UnderwriteDealWorkspace` (from `components/underwriting/UnderwriteDealWorkspace`) — rendered once an address is resolved; empty state "Enter an address to start underwriting."

**Backend endpoints called:**
- `GET /api/opportunities/:id` (hydrate address from opportunity)
- `GET /api/leads/:id` (hydrate address from lead)
- `GET /api/playground/sessions/recent?limit=1` (resume latest session)
- `POST /api/ai/voice/parse` — parse voice transcript
- `POST /api/ai/voice/preview` — preview AI action
- `POST /api/ai/voice/apply` — apply AI action (returns `actionLogId`, `playgroundSessionId`)
- `POST /api/ai/voice/undo` — undo by `aiActionLogId`
- Query invalidation key: `/api/playground/sessions/open`

**Components in `client/src/components/playground/`:** `InAppBrowser.tsx`, `UnderwritingBookmarks.tsx`, `UnderwritingPanel.tsx`.

**Key architectural facts:**
- Dev-only route (App.tsx:201) and dev-only sidebar entry (Sidebar.tsx:130-131), yet the **MobileBottomNav "Play" tab is unconditional** (MobileBottomNav.tsx:11-16) — dead link in production.
- No scripts, no scenarios, no difficulty/personality, no coaching feedback, no transcript review, no dialer connection. A Phase 3 rebuild is a from-scratch build reusing only the page shell, not an incremental improvement.

---

## 6. Timesheet — Current Implementation

**File:** `client/src/pages/timesheet.tsx` (1079 lines). Uses shared `<Layout>` ✓. Companion: `client/src/components/timesheet/PomodoroTimer.tsx`.

**Layout (verified):**
- Tabs (`time` / other) with `TabsList className="w-full justify-start overflow-x-auto"` (line 466)
- Week navigation: `weekStart` state, `startOfWeek(..., {weekStartsOn: 1})`, prev/next `ChevronLeft/Right` buttons, date-range display
- **Desktop table** (line 670): `<Table>` with columns **Date, Employee, Category, Task, Start, ...** — fixed-width table, no responsive alternative
- Manager view: `selectedUserId` filter ("all"), `isManager` from role check (lines 60-63)
- Add-entry dialog (`openDialog` state), edit/delete actions, approval status columns (`approvedByUserId`, `approvedAt`, `paidAt`), anomaly flags
- **No clock-in/clock-out button on this page** (the mobile spec requires one; `PomodoroTimer` exists as a separate component but is not a shift clock)
- **No mobile card layout** — table will overflow horizontally below ~768px; no `overflow-x` wrapper was found around the main `<Table>`

---

## 7. Quick Log Call UI

**Component:** `client/src/components/buyers/QuickLogCallDialog.tsx` (250 lines, fully read).

**Usage:** Only one call site — `client/src/pages/buyers.tsx:1296` (`<QuickLogCallDialog buyer={selectedBuyer} .../>`). It is **buyer-scoped only**; there is no lead/contact Quick Log variant.

**Props:** `{ buyer: any; open: boolean; onOpenChange: (open: boolean) => void }`.

**Submit handler:** `logMutation` (lines 97-135) → `apiRequest("POST", `/api/buyers/${buyer.id}/call-logs`, {...})`.

**Payload:** `direction`, `sessionProvider` (google_voice/office_line/mobile/other), `occurredAt`, `durationSeconds`, `disposition`, `note`, `interestLevel`, `nextAction`, `nextActionAt`.

**Form features present:** direction, disposition (buyer outcomes + shared outcomes, optgroups), interest level, notes textarea (with template placeholder), conditional next-action + date (required for `BUYER_DISPOSITIONS_REQUIRE_NEXT_ACTION`), DNC warning banner. **Missing vs. spec:** no lead selector (buyer-bound), no follow-up toggle/datetime (only next-action), no draft preservation (form state resets on successful save via `reset()` at line 120; on failure the dialog stays open so data is preserved — acceptable), no double-submit guard beyond `logMutation.isPending` disable (adequate).

---

## 8. Server Side — Call Log Storage

Two parallel systems exist. This is the root of the "where do notes go" confusion.

### System A — Buyer Quick Log (the dialog above)
- **Route:** `POST /api/buyers/:id/call-logs` — `server/routes.ts:15989`
- **Handler:** `callSessions.logManualBuyerCall()` — `server/services/telecom/call-sessions.ts:286`
- **Writes:**
  1. `call_sessions` row (table `crm_call_sessions`): `mode: "human_first"`, `status: "completed"`, `sessionSource: "manual"`, `finalDisposition`, `idempotencyKey: manual_buyer_<buyer>_<user>_<ts>` (lines 322-345)
  2. `call_dispositions` row (table **`crm_call_dispositions`**, `server/shared-schema.ts:2530`): `sessionId` (unique), `disposition`, `source: "manual"`, **`note: input.note`** (lines 347-354) ← **the Quick Log note lands HERE**
  3. Activity rows via `createActivity` (session-scoped, note NOT included in activity description)
  4. `applyBuyerDispositionEffects` — pipeline side effects (DNC, tasks, status)
- **Read endpoint exists:** `GET /api/buyers/:id/call-logs` (`server/routes.ts:16014`), but **no client component consumes it** (verified: zero references outside `QuickLogCallDialog.tsx`).
- **UI visibility:** buyers.tsx shows only `lastCallDisposition` (line 1017-1018). **The note is write-only — invisible in the UI.** This is the answer to "where do the quick log call notes get placed": `crm_call_dispositions.note`, reachable only via API.

### System B — General telephony call logs (dialer)
- **Routes:** `POST /api/telephony/calls` (`server/routes.ts:8034`), `PATCH /api/telephony/calls/:id` (`server/routes.ts:8073`)
- **Table:** `call_logs` (`server/shared-schema.ts:1931`) — has its own `note: text("note")` column **on the record itself**
- **Storage:** `storage.createCallLog` (`server/storage.ts:3533`), interface at `server/storage.ts:695`
- **Used by:** dialer-workspace manual/offline disposition (`useDialerWorkspaceState.ts` handleSaveLog), `GlobalDialerWidget` recent calls

---

## 9. Recent Calls Display

| Location | File | Data source |
|---|---|---|
| Floating widget "Queue" tab | `client/src/components/dialer/GlobalDialerWidget.tsx:189-200` | `useQuery` recent calls (System B `call_logs`) |
| Communications hub | `client/src/pages/workspace-communications.tsx:483` | `callsQuery` — "No recent calls." empty state |

Both read System B (`call_logs`). Neither shows System A buyer dispositions/notes.

---

## 10. Activity Timeline

**Component:** `client/src/components/activity/EntityActivity.tsx` — generic feed, `GET /api/activity?leadId=X&limit=50`.
**Usage:** `client/src/pages/leads.tsx:61, 253-254, 2743-2748` — Activity dialog per lead.

`logManualBuyerCall` calls `createActivity(session, "manual_call_logged", ...)` — but these activities are **session-scoped** (buyer call sessions), and the note text is not included in the activity description. Buyer-side activities do not surface in the lead `EntityActivity` view (different entity). There is no unified "call with note preview → click for details" timeline entry for Quick Log notes today.

---

## 11. Tests

| Framework | Count | Location | Notes |
|---|---|---|---|
| vitest | **97** total test files | `tests/` (76 files, server/unit), `server/**/*.test.ts` (15), `client/src/pages/__tests__/` (1) | `npm run test:unit` = `vitest run tests`; `test:smoke` = `server/tests` |
| Playwright | config exists | `playwright.config.ts` | **Only 3 desktop projects**: Desktop Chrome, Desktop Firefox, Desktop Safari (lines 18-20). **No mobile/tablet projects.** `npm run test:e2e` = `playwright test` |
| axe-core | **not installed** | — | No accessibility testing configured |

---

## Audit Table

| Area | Current behavior | Root cause | Planned fix |
|---|---|---|---|
| Quick Log Call notes | Notes POST to `/api/buyers/:id/call-logs` and are stored in `crm_call_dispositions.note` (server/services/telecom/call-sessions.ts:347-354). They are **never displayed anywhere in the UI** — buyers page shows only `lastCallDisposition`; the GET endpoint (routes.ts:16014) has zero client consumers. | Write-only path: disposition write was built without a read/display surface. Two parallel call-log systems (`call_logs` vs `crm_call_dispositions`) with no unified read path. | Build a buyer "Call History" read surface on the existing GET endpoint (note preview, direction, duration, disposition, user, timestamp, edit-in-place updating the same disposition row); add note preview to activity entries; do not duplicate into a notes table. |
| Shared navigation | `Layout` (layout/Layout.tsx) is the single shell with Sidebar (`lg+`), `MobileBottomNav` (`<lg`), `MobileNavDrawer`. `/dialer-workspace`, `/disposition`, `/sequences`, `/buyers/qualify` bypass it entirely — no sidebar, header, or bottom nav on any viewport. `/teams` is a bare redirect. | Pages built as standalone workspaces without wrapping in `<Layout>`; no lint/CI rule enforces shell usage. | Wrap all four pages in `<Layout>`; for full-bleed workspaces (dialer, disposition) add a documented `fullBleed` Layout prop rather than bypassing. |
| Mobile bottom nav | Hardcoded 4-item list in MobileBottomNav.tsx:11-16, independent of `primaryNavigation`. The "Play" tab links to `/playground`, a dev-only route — dead link (404) in production. | Bottom nav was hand-built instead of derived from the central nav config; dev-only route leaked into an unconditional tab. | Derive bottom-nav items from `primaryNavigation` (4-5 primaries + More drawer); gate Playground tab on `import.meta.env.DEV` to match the route. |
| Playground | "Property Playground" — voice-driven deal-underwriting workspace (playground.tsx), dev-only route. No script library, scenarios, coaching, or dialer integration exists. | It was built for a different purpose (voice underwriting) than the requested sales-practice workspace; hidden from prod Oct 7. | Rebuild as script-training/roleplay workspace per Phase 3 spec; keep `Layout` wrapper and route gating decision explicit (dev-only vs. prod nav). |
| Timesheet | Desktop `<Table>` (timesheet.tsx:670) with Date/Employee/Category/Task/Start/... columns; no mobile card layout; no shift clock-in/out on page. | Built desktop-first; table never got a responsive variant. | Mobile-first card list below `md`, keep table at `lg+`; add clock in/out header, bottom-sheet filters, 320px-safe controls. |
| Other mobile pages | All `Layout`-wrapped pages get bottom nav + safe-area padding via Layout's `main` class. Risk is page-level: fixed-width tables and wide grids inside page content. | No page-level overflow audit has been run; Playwright has no mobile projects. | Run the Phase 5 viewport sweep (320→1440); fix overflow at component level, never global `overflow-x: hidden`. |
| Testing | 97 vitest files; Playwright desktop-only (3 projects); no axe-core; 1 client component test. | E2E/mobile/a11y coverage never configured. | Add Playwright mobile projects (iPhone small/modern, Android, tablet), `@axe-core/playwright`, and the automated checks listed in Phase 6. |

---

## Notes for Implementation

1. **Do not merge the two call-log tables.** System A (`crm_call_sessions` + `crm_call_dispositions`) is the buyer pipeline source of truth with disposition-driven automations; System B (`call_logs`) serves the dialer. The fix is a **read surface** for System A, not a schema merge.
2. **Idempotency exists** for manual buyer logs (`idempotencyKey: manual_buyer_...` at call-sessions.ts:343) — rapid double-tap is already guarded server-side.
3. **DNC is enforced** at log time (`logManualBuyerCall` → `applyBuyerDispositionEffects`; `QuickLogCallDialog` shows DNC banner).
4. **Styling is Tailwind v4** — responsive fixes belong in utility classes / `@theme`, not a config file that doesn't exist.
5. The MobileBottomNav "Play" dead link is a one-line prod bug worth fixing immediately regardless of the rebuild decision.
