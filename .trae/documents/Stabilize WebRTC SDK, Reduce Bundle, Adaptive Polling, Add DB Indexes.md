## Goals
- Remove WebRTC export mismatch warnings and prevent runtime “not a function” errors
- Drop initial client bundle below 1 MB via route-level splitting
- Make history refresh adaptive to call status
- Ensure fast searches with indexes on contacts/leads and verify latency

## SDK Import & Runtime Guard
- Confirm current usage: `client/src/hooks/useSignalWire.ts:2` imports `@signalwire/js` as a namespace
- Replace any named imports with `import * as SignalWire from '@signalwire/js'` and access via the namespace
- Add a runtime guard where the SDK is instantiated:
  - Check `typeof SignalWire.WebRTC?.createRoomSession === 'function'` (or the specific factory you use) before calling
  - Fallback: log a soft warning and surface an actionable error when missing
- Pin SDK to a known-good version in `FrameworkPlanner/package.json:53` by removing the caret (e.g., `"@signalwire/js": "3.29.1"`) and rebuild
- Verify server JWT token generation for WebRTC compatibility at `server/routes.ts:732`
- Outcome: build warning resolved; if production ever shows runtime errors, the guard prevents hard failures and the pinned version avoids breakage

## Bundle Size: Lazy Routes & Deferred Assets
- Target routes: `client/src/App.tsx:114` (`/dialer`), `client/src/App.tsx:129` (`/system/health`), `client/src/App.tsx:81` (`/opportunities/:id` PropertyDetail)
- Implement `React.lazy` on Dialer and SystemHealthPage components; wrap with `Suspense` and a small skeleton
- Split heavy submodules inside PropertyDetail (maps/charts/media viewers) via dynamic import; load on interaction (tab open, scroll into view)
- Defer non-critical assets (e.g., large images) with native `loading="lazy"` and on-demand fetch
- Preload on hover for common navigations to reduce perceived latency
- Measure before/after using the bundler’s analyzer and confirm initial bundle < 1 MB

## Adaptive History Refresh
- Replace fixed `refetchInterval: 10000` at `client/src/pages/dialer.tsx:40` with adaptive logic:
  - `connected`: 200–500 ms
  - `ringing`: 1000–2000 ms
  - `idle`: 20000–30000 ms
- Use React Query’s dynamic `refetchInterval` (function or state-driven) and ensure cleanup of any manual `setInterval` logic noted at `dialer.tsx:115`
- Gate fast polling behind foreground activity and pause when the tab is hidden
- Outcome: fresher UI during calls, reduced backend load when idle

## DB Indexes & Migrations
- Verify existing search indexes in `migrations/0002_search_indexes.sql:3` (leads: address/city/state) and `:19` (contacts: name/email/phone) and that `pg_trgm` extension exists
- If gaps exist, add btree/trgm indexes for:
  - Contacts: `name`, `phone`
  - Leads: `address`, `city`, `state`
- Create a new migration (e.g., `0005_search_indexes_refine.sql`) to add missing indexes idempotently
- Run `EXPLAIN ANALYZE` on typical search queries and capture latency before/after; ensure planner uses the intended indexes
- Schedule `VACUUM (ANALYZE)` post-migration to update stats

## Verification & Risk Controls
- Build locally to confirm the SignalWire warning is gone; run a smoke test call using the guarded import
- Measure bundle with analyzer; verify route-level chunks for Dialer and SystemHealth
- Validate adaptive polling behavior by simulating status transitions (idle → ringing → connected)
- Benchmark search endpoints using `EXPLAIN ANALYZE` and record improvements
- Rollback plan: revert SDK pin or guards if needed; disable lazy splitting per-route if unforeseen regressions appear

## Code References
- SDK import: `client/src/hooks/useSignalWire.ts:2`
- Routes: `client/src/App.tsx:81`, `client/src/App.tsx:114`, `client/src/App.tsx:129`
- Polling: `client/src/pages/dialer.tsx:40`, `client/src/pages/dialer.tsx:115`
- DB schema: `server/shared-schema.ts:7`, `server/shared-schema.ts:61`
- Search indexes: `migrations/0002_search_indexes.sql:3`, `migrations/0002_search_indexes.sql:19`
- WebRTC token route: `server/routes.ts:732`