# AUDITOR D — Workflow Friction + Mobile Audit

**Repo:** `~/workspace/builds/final-merge` · **Branch:** `feat/phone-queue`
**Git SHA (recorded at audit start):** `b1e543ce57a882bd9d4eaaeb59d5142c920431e9`
(`feat(matchroom): deal rooms + structured offers (Phase 13/14)`)
**Audit date:** 2026-10-09 · **Method:** read-only static analysis of client code (no edits, no migrations, no DB writes).
No Playwright/dev-server available in this environment (no `node_modules`, no Chromium binary) — mobile findings are rigorous static analysis; the matrix marks anything unverifiable as `NOT_TESTED`. Nothing is marked "passed" without code evidence.

---

## 1. Click-count measurements (UI interactions per workflow)

Measured by tracing the actual render/interaction code paths. "Clicks" = taps/clicks; field fills counted separately.

### Flow 1 — Lead creation → first contact attempt (routes: `/leads`)
1. Click **"Add Lead"** → dialog opens (`pages/leads.tsx:1839`)
2. Fill ~9 fields (address, city, zip, owner, phone, source, est. value, status, assignee) — address autocomplete helps (`pages/leads.tsx:1857-1878`)
3. Click **Save** → toast "Lead created", dialog closes (`pages/leads.tsx:836-850`) — **no "Call now" / next-step CTA**
4. Find the lead, click to open detail sheet (1)
5. Click the phone number → raw `tel:` link (`pages/leads.tsx:2393`) → **leaves the CRM for the device dialer**: no DNC check, no call logging, no CRM disposition to return to

**Total: ~12 clicks + 9 field fills, then the contact attempt exits the app and bypasses all CRM calling features.**
Alternative in-app path: mobile bottom nav **"Dial"** → `/dialer-workspace`, or the floating `GlobalDialerWidget` → number must be **re-typed manually**; nothing passes lead context (`components/dialer/GlobalDialerWidget.tsx:60-66`).

### Flow 2 — Qualified lead → offer creation (seller-side offer = LOI; routes: `/leads` → `/opportunities/:id` → `/lois`)
1. Open lead (1) → **"Convert to Opportunity"** (1) → confirm dialog (1) → lands on `/opportunities/:id` (`pages/leads.tsx:2228-2234`, `:2716-2743`)
2. Navigate to LOIs via nav (More → Closing → LOIs: 2–3 clicks)
3. Click **"New LOI"** (`pages/lois.tsx:190`)
4. Select property from an **unscoped full property dropdown** — no deep link pre-selects the opportunity you came from (`pages/lois.tsx:311`)
5. **Re-type buyer name and seller name** as free text — not linked to buyer/contact records (`pages/lois.tsx:322-330`)
6. Fill offer amount, earnest, closing date, expiry, terms → **Create** (`pages/lois.tsx:367-369`)

**Total: ~10 clicks + 8 field fills, with buyer/seller names re-entered despite existing records.** No "Create LOI for this opportunity" button exists on the deal room.

### Flow 3 — Accepted offer → contract generation (route: `/opportunities/:id` Buyer Offers card → `/contracts/new`)
1. Click **Accept** (1) + native `window.confirm` (1) (`pages/property-detail.tsx:2818-2823`) → deal → Reserved, closing tasks auto-created, listing paused (per the confirm text)
2. Scroll to a **different card** on the same page and click **"Generate Contract"** (`pages/property-detail.tsx:800`) → `/contracts/new?opportunityId=&propertyId=` — prefill covers property/lead **only**; the accepted buyer and offer amount are **not** carried over (`pages/contract-wizard.tsx:107-134`)
3. Wizard: Template select (1) → Next (1) → Records confirm (1) → Next (1) → Review creates contract (1) → Signers: **re-type signer name/email** (not prefilled from buyer or lead) → Next (1) → **Send** (1) (`pages/contract-wizard.tsx:352-362`)

**Total: ~12 clicks + re-typing buyer identity and deal price that already exist on the accepted offer.**

### Flow 4 — Executed contract → Locked Up (route: `/contracts/:id` → `/disposition`)
1. Click **"Execute Contract"** (`pages/contract-detail.tsx:402`) → server auto-advances the opportunity to `under_contract` (good — zero extra clicks; `server/routes.ts:10827`)
2. **Dead end:** no CTA on contract-detail to open Disposition; the user navigates manually (2+ clicks)
3. On `/disposition`, the deal sits in the "under_contract" column; moving it to "in_disposition" (locked-up) requires **drag-and-drop, which does not work on touch devices** (`pages/disposition.tsx:168-186`); no tap-to-move alternative
4. The investor **"Locked Up" workspace is unreachable** (see F-01)

**Total: 1 click to execute + manual navigation + a mobile-impossible drag to finish the workflow.**

### Flow 5 — Buyer match → buyer offer submission
**CRM path** (`/disposition` → deal drawer):
1. Open deal drawer (1) → **Offers** tab (1) → **"Log offer"** (1) → **type buyer name free-text** — no picker from the matched-buyers list (`components/dispo/OffersTracker.tsx:80-113`) → amount, earnest, contingencies → Save (1)
**Total: ~6 clicks + buyer name re-typed, unlinked from the buyer record.**

**Investor path** (`/investor/discover` → deal room → `/investor/offers`): Deal card → **"Create offer"** (`investor/dealroom/DealRoomPage.tsx:359`) → draft → review screen → explicit **Submit** with confirmation (`investor/OffersPage.tsx:174-187`) — good UX, but the investor nav can't reach it back (see F-01).

---

## 2. Data entered twice (distinct screens)

| # | Data | Entered at | Re-entered at | Evidence |
|---|------|-----------|---------------|----------|
| D-1 | Buyer name | Buyer record (`/buyers` add/qualify, `pages/buyers.tsx:478`) | LOI "Buyer Name" free-text (`pages/lois.tsx:324`); OffersTracker "Log offer" free-text (`components/dispo/OffersTracker.tsx`); wizard signer name (`pages/contract-wizard.tsx:46`) | unlinked strings, no picker |
| D-2 | Seller name | Lead owner (`pages/leads.tsx` add dialog) | LOI "Seller Name" free-text (`pages/lois.tsx:328`) | — |
| D-3 | Offer amount | Accepted buyer offer on deal room (`pages/property-detail.tsx:2741`) | Contract wizard purchasePrice (only auto-filled from `property.price`, not the accepted offer — `pages/contract-wizard.tsx:227-230`); LOI "Offer Amount" (`pages/lois.tsx:332`) | — |
| D-4 | Property address | Lead (address/city/zip) → server-copied on convert (`pages/leads.tsx:943`) | — (wizard/generator pull from linked property — no raw re-entry) | OK; noted for completeness |
| D-5 | Offer terms | Offer record terms | Contract Review step (free text, `pages/contract-wizard.tsx`) — no "import from offer" | manual copy |

Note: lead → opportunity conversion is server-side copy (good); the duplication hotspots are all on the **offer/contract/LOI** leg, where buyer identity and price are re-typed as free text.

---

## 3. Friction findings (P0–P4)

| ID | Severity | Finding | Route(s) | Evidence (file:line) | Recommended fix | Complexity |
|----|----------|---------|----------|----------------------|-----------------|------------|
| F-01 | P0 | Investor nav dead-ends: PRIMARY_NAV links **Matches** `/investor/matches`, **Buy Boxes** `/investor/buy-boxes`, **Locked Up** `/investor/locked-up` have **no routes**; existing components `MatchesPage`, `BuyBoxesPage`, `LockedUpPage`, `LockedUpWorkspacePage`, `DealRoomPage` are never imported → all render NotFound. Conversely existing routes `/investor/saved`, `/investor/messages`, `/investor/account`, `/investor/offers`, `/investor/buy-box` (singular) have **no nav entries**. | `/investor/*` | `investor/InvestorLayout.tsx:26-29`, `investor/routes.tsx:43-55`, grep shows zero imports of the orphan pages | Add the missing `<Route>`s (match nav hrefs exactly — `buy-box` vs `buy-boxes` mismatch) and add Saved/Messages/Account/Offers to nav | S |
| F-02 | P1 | `GlobalDialerWidget` "lead already exists" path navigates to `/leads/${existingLeadId}` — **no `/leads/:id` route exists** → NotFound dead end | `/phone` (widget) | `components/dialer/GlobalDialerWidget.tsx:85`, `App.tsx` (no `/leads/:id` route) | Navigate to `/leads?highlight=${id}` instead (already supported, `pages/leads.tsx:263-265`) | S |
| F-03 | P1 | Every call CTA in the app is a raw `tel:` link (leads ×2, buyers, buyer-qualify, contacts, pipeline card, skip-trace panel) — calls **bypass the CRM dialer**, skipping DNC checks and call logging; the `GlobalDialerWidget`/`/phone` path requires re-typing the number | `/leads`, `/buyers`, `/buyers/qualify`, `/contacts` | `pages/leads.tsx:2186,2393`, `pages/buyers.tsx:988`, `pages/buyers/qualify.tsx:407`, `pages/contacts.tsx:192`, `components/pipeline/LeadPipelineCard.tsx:80` | Replace `tel:` CTAs with a call action that routes through `/phone?number=` (widget pattern) or the widget's `handleCall` | M |
| F-04 | P1 | Contract wizard: after **"Contract sent for signature"** it resets to the Template step on `/contracts/new` instead of navigating to the contract — user must hunt for it on `/contracts` | `/contracts/new` | `pages/contract-wizard.tsx:352-362` (`setStep("Template")`, no navigation) | `setLocation(`/contracts/${result.id}`)` after send | S |
| F-05 | P1 | Two parallel offer models for the same deal: deal-room **Buyer Offers** (`pending/accepted/rejected/withdrawn`, own API) vs disposition drawer **OffersTracker** (`verbal/loi_sent/accepted/dead`, `@shared/dispo-stages`) — status vocabularies differ, records don't sync; user can log the same offer twice with different statuses | `/opportunities/:id`, `/disposition` | `pages/property-detail.tsx:2795-2840`, `components/dispo/OffersTracker.tsx:18-19`, `shared/dispo-stages.ts:76-96` | Unify on one offer entity + the canonical status machine | L |
| F-06 | P2 | Disposition board stage moves are **drag-and-drop only** — unusable on touch; no tap-to-move/menu alternative, so the core dispo workflow is blocked on mobile | `/disposition` | `pages/disposition.tsx:168-186` (no other move affordance) | Add per-card "Move to stage" menu + keep drag on desktop | M |
| F-07 | P2 | Native `window.confirm()` / `window.prompt()` still used for **Accept/Reject offer, counter-offer amount, delete listing** (`property-detail`) and **delete contact** — unreliable on mobile browsers and inconsistent with the in-app AlertDialog standard (DEV-007) | `/opportunities/:id`, `/contacts` | `pages/property-detail.tsx:2809,2820,2831,3440`, `pages/contacts.tsx:127` | Replace with in-app dialogs (pattern exists in `pages/leads.tsx:2842`) | S |
| F-08 | P2 | **"Withdraw" offer has zero confirmation** — one tap mutates status to `withdrawn` irreversibly (no undo) | `/opportunities/:id` | `pages/property-detail.tsx:2835-2840` | Add confirm step like Reject | S |
| F-09 | P2 | Terminology drift for one entity: **"Opportunity"** (nav, page title), **"Property"** (API, wizard dropdowns, deep links), **"Deal"** (DealDrawer, dispo board) — and the wizard page title says **"New Deal Document"** vs nav **"Contracts"** | `/opportunities`, `/disposition`, `/contracts/new` | `components/layout/Sidebar.tsx:56`, `pages/properties.tsx:975`, `components/dispo/DealDrawer.tsx:31`, `pages/contract-wizard.tsx:618` | Pick one customer-facing term (Opportunity) and relabel | S |
| F-10 | P2 | No **"Call now" / next-step CTA after lead creation**; toast-only success → speed-to-lead depends on the user finding the lead again | `/leads` | `pages/leads.tsx:836-850` | Add "Call now" + "Open lead" actions to the success toast/dialog | S |
| F-11 | P2 | Dual toast systems mounted: shadcn `<Toaster/>` **and** Sonner `<SonnerToaster/>` (`App.tsx:270-271`); pages mix `useToast` (leads) and `sonner` (disposition, properties, dialer widget) → duplicate/stacked notifications possible | app-wide | `App.tsx:270-271`, `pages/leads.tsx:58`, `pages/disposition.tsx:19`, `components/dialer/GlobalDialerWidget.tsx:11` | Standardize on one (sonner) and remove the other Toaster | S |
| F-12 | P2 | No "Generate contract" / "Create LOI" CTA carries **buyer + accepted price** forward; wizard/LOI force manual re-entry of both | `/opportunities/:id` → `/contracts/new`, `/lois` | `pages/contract-wizard.tsx:107-134` (prefill ignores offers), `pages/lois.tsx:311` (unscoped property select) | Deep-link `?offerId=`; prefill buyer/price/signers | M |
| F-13 | P2 | Contract-detail (CRM) has **no "Move to Disposition" CTA** after execution; user must discover `/disposition` manually to continue the pipeline | `/contracts/:id` | `pages/contract-detail.tsx:393-417` (no dispo action) | Add "Open in Disposition" quick action on executed contracts | S |
| F-14 | P3 | Features exist but are **not in navigation**: `/rvm`, `/field`, `/search`, `/tasks/triage`, `/contract-generator`, `/contracts/new` (CRM sidebar); investor Saved/Messages/Account/Offers (see F-01) | various | `App.tsx:185,219,218`, `components/layout/Sidebar.tsx:54-131` | Add missing nav entries or document as intentional | S |
| F-15 | P3 | Lead Add/Edit dialogs use `grid-cols-4` label/input rows at all widths — at 360px labels ("Address Search") wrap and inputs squeeze | `/leads` | `pages/leads.tsx:1846-1976` (21 instances of `grid grid-cols-4`) | Switch to `grid-cols-1 sm:grid-cols-4` or stacked labels on mobile | S |
| F-16 | P3 | Shared Tabs triggers are `px-2 py-1.5 text-xs` (~30px tall) — below the 44px touch target; affects phone (5 tabs wrap to 2 rows), buyer detail, tasks | app-wide | `components/ui/tabs.tsx:30`, `pages/phone.tsx:368`, `pages/buyers.tsx:945` | Bump mobile tab padding to min-h-[44px] | S |
| F-17 | P3 | InvestorLayout "More" sheet links investors into **CRM routes** (`/leads`, `/buyers`, `/contracts`…) — cross-surface, likely hits CRM auth walls | `/investor/*` | `investor/InvestorLayout.tsx:36-60` | Scope More links to investor-safe routes or gate by role | M |
| F-18 | P3 | Contracts list shows raw **`Property: {contract.propertyId}`** (numeric ID, no address) | `/contracts` | `pages/contracts.tsx:322` | Join/display property address | S |
| F-19 | P4 | Two e-sign tracking surfaces: `/esign` (envelopes) and `/contracts` (contract-level e-sign) — overlapping mental models | `/esign`, `/contracts` | `pages/esign.tsx`, `pages/contracts.tsx` | Clarify in UI copy or merge views | M |
| F-20 | P4 | LOI dialog resets form only on success (`pages/lois.tsx:99`); closing mid-fill loses data (no draft/autosave) — same for Add Lead dialog | `/lois`, `/leads` | `pages/lois.tsx:303-369`, `pages/leads.tsx:1835` | Persist draft to localStorage or keep state on close | M |

**Severity rationale:** P0 = investor primary nav renders NotFound for 3 of 4 tabs (live broken surface). P1 = impossible/dead workflows or compliance-adjacent gaps (DNC bypass). P2 = core workflow blocked on mobile or major friction. P3 = usability. P4 = enhancement.

---

## 4. Mobile matrix (static analysis — no browser available)

Baseline verified in code: every route below renders inside the shared `<Layout>` (sidebar hidden on `<lg`, header, mobile bottom nav, `main` with `pb-[calc(4rem+env(safe-area-inset-bottom))]` on mobile — `components/layout/Layout.tsx:24`); investor routes use `InvestorLayout` (mobile bottom nav + `pb-28` — `investor/InvestorLayout.tsx:147-165`). Dialog primitive caps at `max-h-[calc(100dvh-2rem)]` with `overflow-y-auto` (`components/ui/dialog.tsx:43`); Sheet scrolls internally (`components/ui/sheet.tsx:40`); Luxe dialog/bottom-sheet/table primitives are mobile-safe (`components/luxe/`).

| Route | 360 | 390 | 768 | Desktop | Navigation | Overflow | Primary workflow usable? | Result | Evidence |
|-------|-----|-----|-----|---------|-----------|----------|--------------------------|--------|----------|
| `/` dashboard | NOT_TESTED (static: responsive grids `md:grid-cols-2 lg:grid-cols-4`) | NOT_TESTED | NOT_TESTED (static: grids collapse to 1 col) | assumed OK | Layout + bottom nav | no doc-level overflow (grids responsive) | Yes (static) | `pages/dashboard.tsx:425,475,514` |
| `/leads` | NOT_TESTED (static: table has `overflow-x-auto` wrapper; Add-Lead dialog `grid-cols-4` cramped — F-15) | NOT_TESTED | NOT_TESTED | assumed OK | Layout + bottom nav ("Leads" tab) | contained: `pages/leads.tsx:2132` | Yes, cramped dialogs | `pages/leads.tsx:2132-2133` |
| lead detail (sheet) | NOT_TESTED (static: `w-[min(520px,100vw)] overflow-y-auto`) | NOT_TESTED | NOT_TESTED | assumed OK | Layout | internal scroll | Yes (static) | `pages/leads.tsx:1430` |
| `/buyers` | NOT_TESTED (static: `grid-cols-1 sm:grid-cols-2` cards) | NOT_TESTED | NOT_TESTED | assumed OK | Layout + bottom nav via More | no doc-level overflow | Yes (static) | `pages/buyers.tsx:759,808` |
| buyer detail (tabs) | NOT_TESTED (static: tabs `grid-cols-4 sm:grid-cols-7`, ~30px targets — F-16; tel: link bypasses dialer — F-03) | NOT_TESTED | NOT_TESTED | assumed OK | Layout | contained | Mostly (call CTA leaves app) | `pages/buyers.tsx:945,988` |
| `/opportunities` | NOT_TESTED (static: card grid) | NOT_TESTED | NOT_TESTED | assumed OK | Layout + bottom nav ("Opps") | contained | Yes (static) | `pages/properties.tsx:975` |
| `/opportunities/:id` deal room | NOT_TESTED (static: wide tables wrapped in `scroll-x-container`; panels stack `lg:grid-cols-2`) | NOT_TESTED | NOT_TESTED (static: 2-col at lg) | assumed OK | Layout | contained (`pages/property-detail.tsx:1239,1323,2776`) | Yes, except `window.confirm/prompt` flows (F-07) | `pages/property-detail.tsx:800,2809` |
| `/disposition` | NOT_TESTED (static: board `overflow-x-auto`; **drag-drop unusable on touch — F-06**) | NOT_TESTED | NOT_TESTED | assumed OK | Layout + sidebar nav | horizontal scroll by design | **No — stage moves impossible on touch** | `pages/disposition.tsx:168-186` |
| `/contracts` | NOT_TESTED (static: card list, `md:grid-cols-4` stats) | NOT_TESTED | NOT_TESTED | assumed OK | Layout + sidebar nav | contained | Yes (static) | `pages/contracts.tsx:221,300` |
| `/contracts/new` wizard | NOT_TESTED (static: step labels `hidden sm:inline`; post-send dead end — F-04) | NOT_TESTED | NOT_TESTED | assumed OK | Layout | dialog-free page, internal scroll | Yes (static) | `pages/contract-wizard.tsx:614-640` |
| `/esign` | NOT_TESTED (static: `grid-cols-1 lg:grid-cols-3`) | NOT_TESTED | NOT_TESTED | assumed OK | Layout + sidebar nav | contained | Yes (static) | `pages/esign.tsx:185,285` |
| `/calendar` | NOT_TESTED (static: 7-col month grid — small but standard; day cards stack) | NOT_TESTED | NOT_TESTED | assumed OK | Layout + sidebar nav | contained | Yes (static) | `pages/calendar.tsx:300-330` |
| `/tasks` | NOT_TESTED (static: tables in `overflow-x-auto`) | NOT_TESTED | NOT_TESTED | assumed OK | Layout + sidebar nav | contained | Yes (static) | `pages/tasks.tsx:718,861` |
| `/timesheet` | NOT_TESTED (static: 2-col grids; tab bar scrolls) | NOT_TESTED | NOT_TESTED | assumed OK | Layout + sidebar nav | contained | Yes (static) | `pages/timesheet.tsx:466` |
| `/playground` | NOT_TESTED (static: `min-w-0 overflow-hidden` wrapper on underwrite workspace) | NOT_TESTED | NOT_TESTED | assumed OK | Layout + bottom nav ("Lab") | contained | Likely (static) | `pages/playground.tsx:283` |
| `/phone` | NOT_TESTED (static: 5 tabs wrap to 2 rows on `grid-cols-3`; triggers <44px — F-16; dialpad `grid-cols-3`) | NOT_TESTED | NOT_TESTED | assumed OK | Layout + sidebar nav | contained | Yes (static) | `pages/phone.tsx:368,405` |
| `/dialer-workspace` | NOT_TESTED (static: grid breakpoints down to xxs=2 cols; widget drag on touch limited) | NOT_TESTED | NOT_TESTED | assumed OK | Layout + bottom nav ("Dial") | contained | Partially (static; drag limited) | `components/dialer/widgets/DialerWorkspaceGrid.tsx:50-51` |
| `/settings` | NOT_TESTED (static: tab bar scrolls; `grid-cols-2` forms cramped at 360) | NOT_TESTED | NOT_TESTED | assumed OK | Layout + sidebar nav | contained | Yes (static) | `pages/settings.tsx:665` |
| `/investor/discover` | NOT_TESTED (static: Luxe cards; InvestorLayout bottom nav + pb-28) | NOT_TESTED | NOT_TESTED | assumed OK | InvestorLayout bottom nav | contained | Yes (static) | `investor/DiscoverFeed.tsx:42`, `investor/InvestorLayout.tsx` |
| `/investor/locked-up`, `/investor/matches`, `/investor/buy-boxes` | **Dead — no routes** | — | — | — | Nav links render NotFound | n/a | **No** | F-01 |

No document-level horizontal overflow was found anywhere in static analysis: every wide table/grid is wrapped in `overflow-x-auto` or `scroll-x-container`, and no fixed `w-[Npx]` element exceeds small viewports outside such wrappers.

---

## 5. Top 5 mobile blockers

1. **Investor primary nav is 75% dead (P0).** Tapping Matches / Buy Boxes / Locked Up in the mobile bottom nav (or desktop nav) renders the CRM 404 page; `Saved`, `Messages`, `Account`, and `Offers` have no nav entries at all. Any investor who taps beyond Discover is stranded. — `investor/InvestorLayout.tsx:26-29`, `investor/routes.tsx:43-55`
2. **Disposition stage moves are drag-and-drop only (P2).** On touch there is no way to move a deal between `under_contract → in_disposition → reserved` — the single most important dispo action is desktop-only. Add a per-card "Move to stage" menu. — `pages/disposition.tsx:168-186`
3. **All call CTAs bypass the CRM dialer (P1/P2).** On mobile, the phone number is the primary contact path, and every one is a raw `tel:` link: no DNC check, no call logging, no post-call disposition. Route lead/buyer call buttons through `/phone?number=` (the pattern `GlobalDialerWidget` already uses). — `pages/leads.tsx:2393`, `pages/buyers.tsx:988`, `pages/buyers/qualify.tsx:407`
4. **Native `window.confirm()`/`window.prompt()` in core money flows (P2).** Accept/Reject offer, counter-offer amount, and delete listing all use native browser dialogs — unreliable on mobile Safari/Chrome and inconsistent with the app's own DEV-007 in-app dialog standard. — `pages/property-detail.tsx:2809,2820,2831`
5. **Post-send dead end + broken widget deep link (P1).** The contract wizard resets to step 1 after sending (no navigation to the new contract), and the dialer's "lead exists" shortcut points at `/leads/:id`, a route that doesn't exist. Both are one-line fixes. — `pages/contract-wizard.tsx:352-362`, `components/dialer/GlobalDialerWidget.tsx:85`

---

## Notes / caveats
- Parallel build coordinator was active during the audit; findings are pinned to SHA `b1e543ce57a882bd9d4eaaeb59d5142c920431e9` — re-verify file:line refs after merges.
- Server-side stage automation was verified read-only: contract execute → opportunity `under_contract` auto-advance exists (`server/routes.ts:10827`); the gap is purely UI (no CTA, touch-unfriendly dispo board).
- Click counts assume no validation errors; several forms (LOI, Add Lead) lose their contents if closed mid-fill (F-20).
