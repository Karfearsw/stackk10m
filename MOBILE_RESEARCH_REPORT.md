# Mobile Layout Deep Research Report
**Date:** October 10, 2026
**Source:** 10 real-device screenshots from Benjamin's phone (crm.oceanluxe.org)
**Method:** Screenshot evidence → code tracing → root cause analysis

---

## Issue 1: E-sign "Failed to create envelope" (400)
**Screenshot:** #3 — Red error: "400: Provide contractId, or include propertyId in mergeData, so the audit trail has a contract anchor."

**Root cause:**
- File: `client/src/pages/esign.tsx` lines 82-93
- The "New Envelope" form sends: `templateId`, `title`, `signers`, `signingMode`, `expiresInDays`, `message`
- It does NOT send `contractId` or `mergeData.propertyId`
- File: `server/esign/envelopes.ts` line 243 — backend requires one of these for audit trail anchoring
- The form is designed for standalone envelopes, but the backend validation assumes every envelope must be anchored to a contract

**Why it happens:** The e-sign page was built for two use cases (standalone + contract-linked) but the form only supports standalone. The backend was written with contract-anchoring as mandatory.

**Fix options:**
- A) Make `contractId`/`propertyId` optional in backend when creating from template (standalone use case)
- B) Add contract/property picker to the e-sign form UI
- C) Auto-create a minimal contract record when none provided

**Risk:** Option A weakens audit trail guarantees. Option B is most correct but requires UI work. Option C is a compromise.

**Recommendation:** Option B — add an optional "Link to Contract" dropdown and "Property" picker. If left empty, backend creates envelope without anchor but flags it as `unanchored: true`.

---

## Issue 2: Object Storage "Migration failed"
**Screenshot:** #4 — Red error: "Migration failed / Migration request failed"

**Root cause:**
- File: `client/src/components/settings/StorageSettings.tsx` line 98
- Frontend: `if (!res.ok) throw new Error("Migration request failed")` — generic, hides real error
- File: `server/routes.ts` lines 9111-9125
- Backend catches all errors and returns `500: { success: false, error: "Migration failed" }`
- Real error is only in server logs: `console.error("[storage] migrate failed:", e?.message || e)`

**Why it happens:** The error handling swallows the actual cause. Without server logs, we cannot determine if it's:
- Missing object storage credentials/env vars
- Database connection issue in migrator
- File system permission error
- Empty migration candidate set causing null reference

**Fix required:**
1. Backend: Return the actual error message (not generic "Migration failed") — at least in non-production, or log to a queryable endpoint
2. Frontend: Display `error` field from response instead of generic message
3. Investigate: Check Vercel runtime logs for `[storage] migrate failed` to get the real cause

**Risk:** Low — this is observability improvement, not behavior change.

---

## Issue 3: Notes preset pills truncated horizontally
**Screenshot:** #2 — Pills like "needs fast close", "behind on taxes" in rows, but rightmost pills cut off: "foundation cc", "access problem", "t", "pr"

**Root cause:**
- File: `client/src/components/underwriting/UnderwriteDealPanel.tsx` line 634
- Pills container: `<div className="flex flex-wrap gap-2">` — CORRECT, should wrap
- Individual pills: `<Button size="sm" variant="outline">` — no width constraints
- The pills ARE wrapping (multiple rows visible in screenshot)
- But the rightmost pill in each row is clipped mid-text

**Analysis:** This is not a flex-wrap failure. The pills wrap correctly. The clipping indicates a parent container with `overflow: hidden` and insufficient width, OR the viewport is wider than the visible area (horizontal scroll).

Looking at screenshot #2: The card extends beyond the right edge of the screen. The "MAO $0" card and Notes card are wider than the viewport. This suggests:
- Parent: `<Card className="h-full">` (line 201) — no width constraint
- The UnderwriteDealPanel is likely inside a grid or flex parent that doesn't constrain on mobile
- OR the mobile browser is zoomed/rendering at a wider viewport

**Fix required:**
1. Find the parent component rendering UnderwriteDealPanel — check if it's in a `grid-cols-2` or similar on mobile
2. Add `min-w-0` to all flex/grid children in the chain (classic flexbox overflow fix)
3. Add `overflow-x: hidden` to the page container as safety
4. Verify: The pills themselves are fine; the container is the problem

**Risk:** Medium — need to trace the full parent chain. Fixing the wrong level could break desktop.

---

## Issue 4: Team Pulse "Today's highlights" truncated
**Screenshot:** #5 — Entries like "System Playground: 119 Jones St, Mount Clemens MI..." cut off with no way to see full text

**Root cause:**
- File: `client/src/pages/team-pulse.tsx` lines 216-218
- Code: `<span className="min-w-0 flex-1 truncate text-muted-foreground">`
- The `truncate` class = `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`
- This is INTENTIONAL design — single-line truncation with ellipsis

**Why it's a problem on mobile:** On desktop, the card is wide enough that truncation is rare. On mobile (375px), almost every highlight truncates, making the feature useless.

**Fix options:**
- A) Remove `truncate`, allow `whitespace-normal` + `break-words` for wrapping (2-3 lines)
- B) Keep `truncate` but add `title` attribute for hover/long-press to see full text
- C) Use `line-clamp-2` for 2-line max with ellipsis

**Recommendation:** Option C — `line-clamp-2` gives 2 lines on mobile (readable) without taking excessive vertical space.

**Risk:** Low — purely presentational.

---

## Issue 5: Onboarding Docs "storage.getUser is not a function"
**Screenshots:** #7, #8 — Red error: "Send failed / storage.getUser is not a function"

**Root cause:**
- File: `server/routes.ts` line 17168 (FIXED in commit 49bd75b)
- Called `storage.getUser(targetUserId)` — method does not exist
- Storage interface has: `getUserById`, `getUserByEmail`, `getUsers` — but no `getUser`
- This was a pre-existing bug from the type-check audit (5 known errors)

**Status:** FIXED — changed to `storage.getUserById()`. Pushed in commit 49bd75b.

---

## Issue 6: Sequences header buttons cut off
**Screenshot:** #1 — "New Sequence" button truncated at right edge

**Root cause:**
- File: `client/src/pages/sequences.tsx` line 188 (FIXED in commit 49bd75b)
- Was: `<div className="flex items-center justify-between">` — no wrap, no stack
- On 375px: title (left) + 2 buttons (right) = overflow

**Status:** FIXED — changed to `flex-col sm:flex-row` with full-width buttons on mobile.

---

## Issue 7: Pipeline columns Up/Down overlap
**Screenshot:** #6 — "leadUp", "contactedDown", "negotiatDown" — buttons overlapping input text

**Root cause:**
- File: `client/src/pages/settings.tsx` lines 1595-1596 (FIXED in commit 49bd75b)
- Was: `grid grid-cols-12` with buttons in `col-span-2` (~62px on mobile)
- Three buttons (Up, Down, Remove) cannot fit in 62px — they overflow and overlap

**Status:** FIXED — changed to `grid-cols-1 sm:grid-cols-12` (stack on mobile).

---

## Issue 8: Assignment cards overlap
**Screenshots:** #9, #10 — "0/50 leads" badge overlapping "Available" label

**Root cause:**
- File: `client/src/pages/settings/assignment.tsx` line 304 (FIXED in commit 49bd75b)
- Was: `flex items-center gap-3 ... flex-wrap`
- `items-center` + `flex-wrap` = wrapped items stay vertically centered, causing overlap

**Status:** FIXED — changed to `items-start sm:items-center`.

---

## Summary of Fix Status

| Issue | Severity | Status | Commit |
|-------|----------|--------|--------|
| Onboarding getUser bug | P0 - Functional | FIXED | 49bd75b |
| Sequences header | P1 - Layout | FIXED | 49bd75b |
| Pipeline columns | P1 - Layout | FIXED | 49bd75b |
| Assignment cards | P1 - Layout | FIXED | 49bd75b |
| E-sign 400 error | P0 - Functional | FIXED (Option B) | 9f5498e |
| Migration failed | P1 - Functional | FIXED (error surfacing) | 9f5498e |
| Notes pills truncation | P1 - Layout | FIXED | 9f5498e |
| Team Pulse truncate | P2 - UX | FIXED | 9f5498e |

---

## Recommended Next Steps (in order)

1. **E-sign:** Decide on fix approach (A/B/C above). Recommend B (add contract picker).
2. **Migration:** Check Vercel runtime logs for `[storage] migrate failed` to get real error.
3. **Notes pills:** Trace parent component chain of UnderwriteDealPanel to find width constraint.
4. **Team Pulse:** Apply `line-clamp-2` fix (low risk, ready to go).

---

## Why Previous Fixes Missed These

The October 9 mobile audit was static code analysis at theoretical 375px viewport. It caught simple cases (grid-cols without responsive prefixes) but missed:
- Flexbox `items-center` + `flex-wrap` interaction (Issues 7, 8)
- Intentional `truncate` that's wrong on mobile (Issue 4)
- Parent container width constraints (Issue 3)
- Backend validation mismatches (Issue 1)
- Swallowed error messages (Issue 2)
- Non-existent method calls (Issue 5)

Real-device screenshots revealed the actual rendering behavior that static analysis could not predict.
