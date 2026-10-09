# Responsive Design Audit — CRM Pages (static, code-read)

**Date:** 2026-10-09 · **Scope:** `FrameworkPlanner/client/src/pages/` (*.tsx, excluding `__tests__`)
**Skipped (already fixed):** playground.tsx, timesheet.tsx, buyers.tsx, sequences.tsx, disposition.tsx, dialer-workspace.tsx, buyers/qualify.tsx
**Method:** Read-only static analysis. Every issue below was verified by reading the surrounding code. No guessing.

## HIGH severity

| Page | Issue | Location (line) | Suggested fix |
|------|-------|-----------------|---------------|
| audit-log.tsx | 6-col `<Table>` with no `overflow-x-auto` wrapper and no mobile card alternative — causes page-level horizontal overflow on mobile | 133 | Wrap in `overflow-x-auto` (min) or add `hidden md:block` table + `md:hidden` card list |
| automations.tsx | 5-col `<Table>` inside `rounded-md border` div, no overflow wrapper, no mobile alternative | 393 | Same as above |
| companies.tsx | 7-col `<Table>` bare on page, no overflow wrapper, no mobile alternative | 237 | Same as above |
| documents.tsx | 6-col `<Table>` bare on page, no overflow wrapper, no mobile alternative | 264 | Same as above |
| tasks-triage.tsx | 8-col `<Table>` (checkbox + 7 data cols) inside CardContent, no overflow wrapper | 242 | Same as above |
| xp/admin.tsx | 6-col `<Table>` inside CardContent, no overflow wrapper, no mobile alternative | 915 | Same as above |

## MEDIUM severity

| Page | Issue | Location (line) | Suggested fix |
|------|-------|-----------------|---------------|
| rvm.tsx | Recent Drops `grid-cols-4` (Lead/To/Status/When) in plain bordered div, no overflow — 4 cols squeeze to ~85px each at 360px | 273, 280 | `overflow-x-auto` + `min-w-[480px]` inner, or collapse to 2-col stacked rows on mobile |
| leads.tsx | `<Table className="min-w-[800px]">` — has `overflow-x-auto` so it scrolls, but no card alternative for mobile | 2132 | Add `md:hidden` card list alongside the `hidden md:block` table |
| tasks.tsx | Task group `<Table>` wrapped in `overflow-x-auto` — scrolls but no card alternative | 719 | Same as above |
| property-detail.tsx | Comps sections use `min-w-[900px]` / `min-w-[1000px]` inside `scroll-x-container` — works but forces horizontal scroll on mobile | 1239, 1273, 1323 | Acceptable short-term; long-term convert comp rows to stacked cards on mobile |

## LOW severity

| Page | Issue | Location (line) | Suggested fix |
|------|-------|-----------------|---------------|
| campaigns.tsx | Step builder `grid-cols-3` (Channel/Offset/Window selects+inputs) — squeezed to ~110px/col at 360px inside dialog | 557 | `grid-cols-1 sm:grid-cols-3` |
| rvm.tsx | Create Campaign `grid-cols-3` (Start/End/Batch inputs) — squeezed on mobile | 205 | `grid-cols-1 sm:grid-cols-3` |
| settings.tsx | Goal form `grid-cols-3` (Target/Current/Deadline) — squeezed on mobile | 2516 | `grid-cols-1 sm:grid-cols-3` |
| calendar.tsx | Meeting dialog `grid-cols-2` datetime-local inputs — cramped at 360px | 510 | `grid-cols-1 sm:grid-cols-2` |
| properties.tsx | Image upload `grid-cols-3` thumbnails — very small on mobile but functional | 317 | `grid-cols-2 sm:grid-cols-3` |
| properties.tsx | Property form `grid-cols-2` input pairs in dialog — slightly cramped on mobile | 352, 624 | `grid-cols-1 sm:grid-cols-2` |
| properties.tsx | Detail stats `grid-cols-3` (Beds/Baths/etc.) — tight but short values, acceptable | 1165 | No change needed; optional `gap-1` on mobile |
| leads.tsx | Add-Lead dialog form rows `grid-cols-4` (label + 3-col input) — cramped labels at 360px but standard shadcn pattern | 1847, 1890, 1894, 1898 | Optional: `grid-cols-1 sm:grid-cols-4` with label above input on mobile |

## Verified NOT issues (checked, no action)

- **All Dialogs:** base `DialogContent` (`components/ui/dialog.tsx:33`) ships `max-h-[calc(100dvh-2rem)] overflow-y-auto` — dialogs without explicit max-h are safe.
- **Dial pads** (dialer.tsx:248, phone.tsx:405): `grid-cols-3` is correct by design.
- **Calendar week view** (calendar.tsx:300,307): `grid-cols-7` is correct by design; has responsive gaps and `sm:hidden` mobile dots.
- **messages.tsx:** chat list/bubbles use `truncate`, `break-words`, `[overflow-wrap:anywhere]`, `max-w-[85%]` — good.
- **team-pulse.tsx, contracts.tsx:** use responsive prefixes (`sm:grid-cols-2`, `md:grid-cols-4`, `lg:grid-cols-3`) — good.
- **dashboard.tsx:912:** `grid-cols-2` stats use `min-w-0` + `break-words` — fine.

## Systemic observation (design system, not per-page)

- Button sizes: `default` = 36px (`min-h-9`), `sm` = 32px, `icon` = 36px (`h-9 w-9`) — all below the 44px mobile touch-target guideline (`components/ui/button.tsx:34-42`). Fixing this means changing the shared design system, not individual pages. Recommend bumping `default` to `min-h-11` (44px) on touch devices or globally.
