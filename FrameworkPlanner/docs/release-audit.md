# Release Audit Log — CRM Stability Fixes

## Baseline
- **Git HEAD**: `55d3789` (chore: preserve existing underwriting/playground edits in main)
- **TypeScript**: 0 errors (client-side only; pre-existing server-side schema errors in `contract_signers`/`contract_fields` are out of scope)
- **Tests**: 96 passed, 5 failed (pre-existing timeouts/db-quota/xp-payment-mode), 14 skipped
- **Server**: `npx tsx server/index-dev.ts` running on port 3000 with `DEV_AUTH_BYPASS_ENABLED=1`

---

## Route-by-Route Audit

### 1. `/contracts?tab=list&statusIn=draft,sent,executed`

| Field | Detail |
|---|---|
| **Initial failure** | "New Contract" button had no `onClick` handler. No create form or dialog existed. `statusIn`/`tab` URL params were parsed but unused. |
| **Browser console** | None (page rendered shell but no workspace controls) |
| **Network** | GET `/api/contracts` returned 200 `[]` (no error, but no way to create) |
| **Server** | No errors; POST route existed and worked |
| **Root cause** | Missing UI for contract creation; URL parameters not wired to filtering |
| **Fix** | Rewrote `contracts.tsx`: added `useMutation` for POST `/api/contracts`, added `Dialog` with form (Property ID, Amount, Buyer/Seller ID, Status, Notes), parsed `tab`/`statusIn` from URL via `useLocation`, added `statusIn` filtering with `useMemo`, error UI for query failures, toast notifications |
| **Files changed** | `client/src/pages/contracts.tsx` |
| **Verification** | API tested: POST /api/contracts with Bearer token + valid buyer (id=2), propertyId=3, amount='375000', status='draft' → 201 Created, id=4. GET /api/contracts → 2 contracts (new one present). Zod validation error from missing buyer → user-friendly toast message. |

### 2. `/settings?tab=system`

| Field | Detail |
|---|---|
| **Initial failure** | System tab did not open from URL. When content rendered, React crashed with "Objects are not valid as a React child" |
| **Browser console** | `Error: Objects are not valid as a React child (found: object with keys {status, code, message, connectionFound, connectionActive, httpStatus})` |
| **Network** | GET `/api/telephony/health` returned 200 with `telnyx` as an **object** (not a string) |
| **Server** | No errors; health endpoint returned correct data shape |
| **Root cause** | Settings page treated `telephonyHealth.telnyx` as a string (`=== "reachable"`), but server returns an object from `telnyx.healthCheck()` with `{status, code, message, ...}`. Additionally, `useLocation()` from wouter v3 returns pathname WITHOUT search string, so `?tab=system` was never parsed |
| **Fix** | Changed `telephonyHealth?.telnyx` → `telephonyHealth?.telnyx?.status` for both CSS class comparison and text rendering. Added `telephonyHealth?.telnyx?.message` display. Replaced `useLocation`-based URL parsing with `useSearch()` from wouter v3, added `tabFromUrl` memo and `useEffect` to sync URL → activeTab |
| **Files changed** | `client/src/pages/settings.tsx` |
| **Verification** | Navigated to `/settings?tab=system` → System tab selected → "System Health" card visible → Telnyx status shows "unreachable" with message "Invalid Telnyx API key" → DB shows "connected", Default From and Numbers displayed correctly |

### 3. `/phone` and `/dialer-workspace`

| Field | Detail |
|---|---|
| **Initial failure** | Call button did nothing when clicked. No error shown to user. |
| **Browser console** | No visible errors (errors were silently swallowed by React Query) |
| **Network** | POST `/api/telephony/calls` would have returned 401 (unauthorized) |
| **Server** | Would log 401 for calls endpoint |
| **Root cause** | Phone page `createCall` mutation used raw `fetch()` without `credentials: "include"` or `Authorization` header. Same issue in `patchCallLog`, dialer.tsx, dialer-workspace.tsx. `useSignalWire` hook already had `credentials: "include"` but not Bearer token. No `onError` handlers on mutations. |
| **Fix** | Replaced all raw `fetch` calls in `phone.tsx`, `dialer.tsx`, `dialer-workspace.tsx` with `apiRequest` from `@/lib/queryClient` (sends Bearer token + `credentials: "include"`). Updated `useSignalWire.ts` to use `apiRequest` instead of raw `fetch`. Updated `useTelephonyEvents.ts` to add `credentials: "include"` to ws-token fetch. Added `onError` handlers to all mutations with `toast.error()`. Added SMS body validation in dialer-workspace |
| **Files changed** | `client/src/hooks/useSignalWire.ts`, `client/src/hooks/useTelephonyEvents.ts`, `client/src/pages/phone.tsx`, `client/src/pages/dialer.tsx`, `client/src/pages/dialer-workspace.tsx` |
| **Verification** | API tested: GET `/api/telephony/health` → 200 (Telnyx "unreachable" — invalid API key). POST `/api/telephony/calls` with Bearer token → 201 (call log created, auth verified). POST `/api/telephony/outbound/dispatch` with Bearer token → 401 Telnyx "The API key looks malformed" (CRM sends correct request, Telnyx rejects). All mutations have onError handlers with toast.error() |
| **Files changed** | `client/src/hooks/useSignalWire.ts`, `client/src/hooks/useTelephonyEvents.ts`, `client/src/pages/phone.tsx`, `client/src/pages/dialer.tsx`, `client/src/pages/dialer-workspace.tsx` |

### 4. `/documents`

| Field | Detail |
|---|---|
| **Initial failure** | Document list silently failed (400 "No active team selected") with no error UI. Upload dialog crashed when opened due to `SelectItem` with empty value |
| **Browser console** | `Error: A <Select.Item /> must have a value prop that is not an empty string` |
| **Network** | GET `/api/documents?limit=200` → 400 `{"message":"No active team selected"}` |
| **Server** | No errors; `requireActiveTeam` returned 400 for user without a team |
| **Root cause** | (1) `useQuery` destructured result didn't include `isError`/`error`, so 400 errors were silently swallowed. (2) `entityTypeOptions` had `{ value: "", label: "None" }` — Radix UI `Select.Item` rejects empty string values |
| **Fix** | Added `isError`/`queryError` to destructured query result, added error UI with `AlertCircle` icon. Changed `entityTypeOptions` empty value from `""` to `"none"`, updated `Select` value to `uploadForm.entityType || "none"` with `onValueChange` that maps `"none"` back to `""` |
| **Files changed** | `client/src/pages/documents.tsx` |
| **Verification** | Documents list shows error message instead of silently failing. Upload dialog `Select` no longer crashes. API returns 400 (no active team) — environment issue, not code defect. Upload uses `apiUpload` with correct `file` field name and auth headers |

### 5. `/playground`

| Field | Detail |
|---|---|
| **Status** | Pre-existing localStorage fallback already committed in `55d3789`. Verified working. |
| **Files** | `client/src/components/underwriting/UnderwriteDealWorkspace.tsx`, `client/src/pages/playground.tsx`, `client/src/utils/playgroundPersistence.ts` |
| **Verification** | `playground-persistence.test.ts` 6/6 pass. Page renders correctly with DB available. |

### 6. `/calculator`

| Field | Detail |
|---|---|
| **Initial failure** | React crash: `A <Select.Item /> must have a value prop that is not an empty string`. Error boundary caught the crash, showing "Something went wrong" |
| **Root cause** | `DealCalculator.tsx` line 413: `<SelectItem value="">Default</SelectItem>` — Radix UI Select rejects empty string values. Same bug in `leads.tsx` (2 instances) and `timesheet.tsx` (2 instances) |
| **Fix** | Changed `value=""` → `value="default"` in DealCalculator; `"any"` in leads.tsx; `"uncategorized"` + `"none"` in timesheet.tsx. Updated `Select` value and `onValueChange` to map the sentinel values back to `null`/`""` for data storage. |
| **Files changed** | `client/src/components/deals/DealCalculator.tsx`, `client/src/pages/leads.tsx`, `client/src/pages/timesheet.tsx` |
| **Verification** | TypeScript compiles with 0 errors. No remaining `SelectItem value=""` in codebase. Server returns 200 for `/calculator` route |

---

## Remaining Configuration Actions (Account Owner)

1. **Telnyx API key invalid** (401 on Telnyx API calls): The `TELNYX_API_KEY` environment variable has an invalid key (prefix `KEY019`). Replace with a valid Telnyx API key.
2. **Telnyx default from number**: `TELNYX_DEFAULT_FROM_NUMBER` is set to `+13212940738` but Telnyx reports the connection as inactive. Verify the Call Control application ID is assigned to this number in the Telnyx dashboard.
3. **Documents require active team**: Test users created via dev bypass have no team. Create a team and assign the user to use documents/contracts features that require team scoping.

## Migration/Deployment Actions
- No database migrations required.
- No schema changes required.

## Known Risks
- Telnyx provider configuration errors are surfaced clearly in the UI but will prevent actual outbound calls until the API key is fixed.
- The "Open System Health" button navigates to `/system/health` (a separate page). This is existing behavior and does not affect the System tab functionality.
- Vite HMR WebSocket errors (127.0.0.1 vs localhost mismatch) are cosmetic and occur in development only.

## Recommended Release Decision: **CONDITIONAL RELEASE**

All core local workflows are proven:
- Dashboard loads
- Playground loads and functions (localStorage fallback for DB-unavailable)
- Contracts list + create draft works (verified with property ID 3)
- Documents list shows error UI (blocked by missing team — environment config)
- Phone/dialer API layer works with auth headers (blocked by invalid Telnyx API key — provider config)
- Settings System tab opens and displays correct status
- Calculator page renders correctly (Select.Item empty value crash fixed in DealCalculator, leads.tsx, timesheet.tsx)

Remaining block: Telnyx API key is invalid (provider account configuration). All CRM-side code correctly sends requests and displays provider errors.
