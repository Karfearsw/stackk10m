# Mobile Audit — CRM Pages (375px viewport)

**Date:** October 9, 2026
**Method:** Static code analysis of Tailwind layout classes, table wrappers, grid breakpoints, and dialog constraints across all pages in `client/src/pages/`.

**Rating key:**
- 🟢 **GOOD** — Responsive layout, no horizontal overflow, touch-usable
- 🟡 **NEEDS WORK** — Functional but cramped, awkward, or has minor overflow
- 🔴 **BROKEN** — Content cut off, unreachable buttons, or unusable on mobile

---

## Page-by-Page Results

### Buyers (`client/src/pages/buyers.tsx`)
**Status:** 🟢 GOOD
- All grids use `grid-cols-1 sm:grid-cols-2` responsive pattern
- Buyer detail tabs use `grid-cols-4 sm:grid-cols-7` — 4 tabs fit on mobile
- No fixed-width tables

### Buyer Qualify (`client/src/pages/buyers/qualify.tsx`)
**Status:** 🟢 GOOD
- Funnel cards use responsive grids
- No tables, no fixed widths

### Leads (`client/src/pages/leads.tsx`)
**Status:** 🟡 NEEDS WORK
- Main table wrapped in `overflow-x-auto` with `min-w-[800px]` — scrolls horizontally on mobile (functional but not ideal)
- **Issue:** Table requires horizontal scrolling to see all columns. Consider a card-based mobile view.
- File: `client/src/pages/leads.tsx:2133`

### Disposition (`client/src/pages/disposition.tsx`)
**Status:** 🟡 NEEDS WORK
- Kanban board uses `grid-flow-col` with `overflow-x-auto` — columns scroll horizontally
- **Issue:** Drag-and-drop does not work on touch devices. Mobile users cannot move cards between stages. Need touch-friendly move actions (e.g., a "Move to" dropdown on each card).
- File: `client/src/pages/disposition.tsx:162`

### Opportunities (`/opportunities` → `client/src/pages/properties.tsx`)
**Status:** 🟢 GOOD
- Uses responsive grids with `overflow-x-auto` on tables
- Note: `/opportunities` and `/properties` render the same component

### Research Lab (`/playground` → `client/src/pages/playground.tsx`)
**Status:** 🟢 GOOD
- `UnderwriteDealWorkspace` uses `grid-cols-1 xl:grid-cols-12` — stacks on mobile
- `ResearchHub` uses responsive grids throughout
- **Note:** The in-app browser iframe (`ResearchConsole.tsx`) relies on `/api/playground/proxy` to strip X-Frame-Options. If the browser "isn't working fully," it's likely the proxy failing on specific sites (not a mobile layout issue).

### Calculator (`client/src/pages/calculator.tsx` → `DealCalculator.tsx`)
**Status:** 🔴 BROKEN
- **Critical:** Uses `grid-cols-2` and `grid-cols-3` WITHOUT responsive breakpoints in 15+ places (`client/src/components/deals/DealCalculator.tsx:448,479,505,537,568,611,673,690,708,729,760,780,812,832`)
- On 375px, 3-column input grids are ~110px per column — labels and inputs are cramped/cut off
- **Fix:** Change to `grid-cols-1 sm:grid-cols-2` and `grid-cols-1 sm:grid-cols-3`

### Audit (`client/src/pages/audit.tsx`)
**Status:** 🟢 GOOD
- Code quality audit dashboard — responsive grids, no tables

### Audit Log (`client/src/pages/audit-log.tsx`)
**Status:** 🟢 GOOD
- User activity trail — has `overflow-x-auto` wrapper on the event table

### Job Queue (`client/src/pages/jobs.tsx`)
**Status:** 🟢 GOOD
- Both tables wrapped in overflow containers
- Responsive grid for health cards

### System Health (`client/src/pages/system-health.tsx`)
**Status:** 🟢 GOOD
- All grids responsive (`sm:`, `md:` breakpoints)

### Notifications (`client/src/pages/notifications.tsx`)
**Status:** 🟢 GOOD
- Simple list layout, no tables or complex grids

### Settings (`client/src/pages/settings.tsx`)
**Status:** 🟢 GOOD
- Grids use responsive breakpoints
- Has overflow wrapper where needed

### Call Audit (`client/src/pages/call-audit.tsx`)
**Status:** 🟡 NEEDS WORK
- No tables, but dense filter controls may wrap awkwardly
- **Note:** Page will appear empty until Telnyx is funded and calls are being made

### Scripts (`client/src/pages/scripts.tsx`)
**Status:** 🟢 GOOD
- Has overflow wrapper, responsive grid

### Automations (`client/src/pages/automations.tsx`)
**Status:** 🟢 GOOD
- Has overflow wrapper, responsive grid

### Analytics (`client/src/pages/analytics.tsx`)
**Status:** 🟢 GOOD
- All 5 grids use responsive breakpoints

### Sequences (`client/src/pages/sequences.tsx`)
**Status:** 🟡 NEEDS WORK
- Main layout is responsive (`grid-cols-1 lg:grid-cols-3`)
- Builder dialog uses `max-w-2xl` with `max-h-[90vh] overflow-y-auto` — fits on mobile but is dense
- **Issue:** The "New Sequence" builder has multiple step cards that may feel cramped on mobile. Usable but not optimized.

### Documentation (`client/src/pages/docs.tsx`)
**Status:** 🟢 GOOD
- Has `mobileNavOpen` state for mobile navigation drawer
- One grid missing `sm:` breakpoint (line ~40) but not critical

### Messages (`client/src/pages/messages.tsx`)
**Status:** 🟢 GOOD
- Uses `grid-cols-1 md:grid-cols-3` — conversation list stacks on mobile
- Image attachments now working (confirmed by user)

### Campaigns (`client/src/pages/campaigns.tsx`)
**Status:** 🔴 BROKEN
- **Critical:** Two `<table>` elements with NO `overflow-x-auto` wrapper (lines 148, 473)
- Tables will cause horizontal page overflow on mobile
- **Fix:** Wrap both tables in `<div className="overflow-x-auto">`
- **Note:** User also reported "campaign page couldn't load this data" and "column audience violation" — this is a backend API issue, not a mobile layout issue

### Contracts (`client/src/pages/contracts.tsx`)
**Status:** 🟡 NEEDS WORK
- Contract cards use `flex items-center justify-between` — action buttons (View, Archive) squeeze content on mobile
- **Issue:** Buttons have text labels ("View", "Archive") that take horizontal space. On 375px, the card content gets compressed.
- **Fix:** Use icon-only buttons on mobile (`sm:` breakpoint to show labels), or stack actions below content on mobile
- Stats grid is responsive (`md:grid-cols-4`)

### Voicemail (`client/src/pages/voicemail.tsx`)
**Status:** 🟢 GOOD
- Simple list layout, no tables or complex grids
- **Note:** Will appear empty until Telnyx is funded

### Timesheet (`client/src/pages/timesheet.tsx`)
**Status:** 🟡 NEEDS WORK
- Main grids are responsive
- **Issue:** Lines 576, 598 use `grid-cols-2` without breakpoints for time entry fields — cramped on mobile but usable
- Line 754 uses `grid-cols-2` for detail rows — acceptable

---

## Summary

| Status | Count | Pages |
|--------|-------|-------|
| 🟢 GOOD | 17 | Buyers, Qualify, Opportunities, Research Lab, Audit, Audit Log, Job Queue, System Health, Notifications, Settings, Scripts, Automations, Analytics, Documentation, Messages, Voicemail |
| 🟡 NEEDS WORK | 6 | Leads, Disposition, Call Audit, Sequences, Contracts, Timesheet |
| 🔴 BROKEN | 2 | Calculator, Campaigns |

### Priority Fixes
1. **Calculator** — Add `sm:` breakpoints to all `grid-cols-2`/`grid-cols-3` in `DealCalculator.tsx` (15 locations)
2. **Campaigns** — Wrap both tables in `overflow-x-auto` divs
3. **Disposition** — Add touch-friendly "Move to" action for kanban cards (drag-drop doesn't work on mobile)
4. **Contracts** — Make action buttons icon-only on mobile

---

## Questions Answered

### 1. What's the difference between "Audit" and "Audit Log"?

**Audit** (`/audit` → `client/src/pages/audit.tsx`):
- Code quality dashboard
- Shows automated audit runs and findings (P0-P4 bugs in the codebase)
- Answers: "What's broken in our code?"
- Data source: `/api/audit/runs`

**Audit Log** (`/audit-log` → `client/src/pages/audit-log.tsx`):
- User activity trail
- Shows who did what in the CRM (who changed which lead, who logged in, etc.)
- Answers: "Who did what and when?"
- Data source: `/api/audit` (entity change events)

They are completely different features that happen to share the word "audit."

### 2. What is the Job Queue page for?

**File:** `client/src/pages/jobs.tsx` → Route `/jobs`

Background job monitoring. Shows:
- **Health overview** (`/api/jobs/health`) — are background workers running?
- **Job list** (`/api/jobs`) — individual background tasks (e.g., skip-trace jobs, SMS sends, RVM drops) with status (queued, running, completed, failed)
- **Dead letters** (`/api/jobs/dead-letters`) — jobs that failed permanently and need manual intervention

**Purpose:** When the CRM does work asynchronously (sending bulk SMS, running skip-traces, processing RVM campaigns), those go into a job queue. This page lets admins see if jobs are stuck, failing, or backing up.

### 3. What is the Sequences page for?

**File:** `client/src/pages/sequences.tsx` → Route `/sequences`

Follow-up automation builder. A "sequence" is a series of timed touchpoints (e.g., Day 1: SMS, Day 3: Call, Day 7: Email). Features:
- Create multi-step follow-up sequences
- Enroll leads/buyers into sequences
- Track enrollment progress (`/api/sequences/:id/enrollments`)

**Purpose:** Automate follow-up so no lead falls through the cracks. Instead of manually remembering to call back in 3 days, enroll them in a sequence that triggers reminders/tasks automatically.

### 4. What is the Documentation page for?

**File:** `client/src/pages/docs.tsx` → Route `/docs`

Company knowledge base / wiki. Features:
- Searchable documentation pages organized by category
- Admin-editable (admin/owner roles)
- Deep-linkable (`/docs?category=X&page=Y`)
- Mobile navigation drawer

**Purpose:** Per MEMORY.md: "Company private info (policies, compliance docs, handbook) lives in the CRM's Documentation module." This is where SOPs, training materials, and company policies live.

### 5. What's the difference between Disposition tab and Opportunities?

**Opportunities** (`/opportunities` → same as `/properties`):
- The full pipeline of potential deals at ANY stage
- Includes: new leads, contacted, negotiating, under contract, etc.
- This is the "everything" view

**Disposition** (`/disposition`):
- A focused kanban board showing ONLY deals that are under contract and being marketed to buyers
- Stages: `under_contract` → `in_disposition` → `reserved` → `sold` / `closed` / `dead`
- This is the "we have a signed contract, now let's find a buyer" view

**Analogy:** Opportunities is the entire sales pipeline. Disposition is the final phase where you're selling the contract to a cash buyer.

**The confusing wording:** The Disposition page says "Move contracted deals to buyers — drag cards between stages." The user asked "how do you drop a lead in here?" — you don't. Leads become Opportunities first (through the lead pipeline), then when a lead goes under contract, it appears on the Disposition board. The page should clarify this.
