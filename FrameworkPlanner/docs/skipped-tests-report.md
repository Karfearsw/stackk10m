# Skipped Tests Report

Investigation of every skipped Vitest test as of the storage/media release.
**22 tests are skipped across 10 suites — all of them are conditional
`describe.skip` smoke tests that require a live deployment.** No test is
silently broken; none hides a regression.

## Shared root cause

Each skipped suite is an HTTP smoke/E2E test that talks to a **running
deployment** through `TEST_BASE_URL`. The default unit run (`npm test`) does
not set `TEST_BASE_URL`, so the suites skip. The smoke script
(`npm run test:smoke`, which runs `server/tests`) still requires
`TEST_BASE_URL` plus, for the auth/lead flows, `TEST_EMPLOYEE_CODE` and
`TEST_PASSWORD` — credentials that must never live in CI defaults.

## The 22 skipped tests

| # | Test file | Suite / tests (count) | Skip mechanism | Reason |
|---|---|---|---|---|
| 1–5 | `tests/phase7-feature-flags.test.ts` | Feature flag health and FEATURE_DISABLED (5) | `(process.env.TEST_BASE_URL ? describe : describe.skip)` | Live-server smoke: hits `/api/system/health` |
| 6 | `server/tests/auth-dev-bypass-smoke.test.ts` | `/api/auth/dev-bypass smoke` (1) | `shouldRun` = TEST_BASE_URL + TEST_EMPLOYEE_CODE + TEST_PASSWORD | Live auth smoke |
| 7–8 | `server/tests/auth-flow-smoke.test.ts` | `/api/auth end-to-end smoke` (2) | `shouldRun` (same trio) | Live signup→token→me flow |
| 9–12 | `server/tests/auth-smoke.test.ts` | `/api/auth smoke` (4) | `TEST_BASE_URL ? describe : describe.skip` | Live auth endpoints |
| 13–15 | `server/tests/lead-convert-opportunity.test.ts` | lead → opportunity conversion (3) | `shouldRun` (trio) | Live conversion flow |
| 16–18 | `server/tests/leads-filters-bulk-jobs.test.ts` | `/api/leads filters + bulk jobs` (3) | `shouldRun` (trio) | Live leads/bulk-jobs flow |
| 19 | `server/tests/opportunity-detail.test.ts` | `/api/opportunities/:id` (1) | `TEST_BASE_URL ? describe : describe.skip` | Live opportunity detail |
| 20 | `server/tests/playground-sessions.test.ts` | `/api/playground/sessions` (1) | `shouldRun` (trio) | Live playground sessions |
| 21 | `server/tests/search.test.ts` | `/api/search` (1) | `TEST_BASE_URL ? describe : describe.skip` | Live search |
| 22 | `server/tests/system-health.test.ts` | `/api/system/health` (1) | `TEST_BASE_URL ? describe : describe.skip` | Live system health |

## Classification & recommendation

- **Classification**: environment-dependent by design (live-server smoke
  coverage). Not obsolete, not broken, not technical debt.
- **Required for release?** No — the equivalent behavior is covered by the
  unit/integration suite (mock-based) that runs green in CI. These add
  end-to-end confidence against a real deployment.
- **Recommended action**: **keep skipped** in the default unit run. The skip
  conditions are explicit, self-documenting env gates — the correct pattern
  for environment-dependent tests. Do **not** convert to `fixme`: they are
  intentionally conditional, not known-broken.
- **Follow-up (optional)**: wire `npm run test:smoke` into deployment CI with
  `TEST_BASE_URL`, `TEST_EMPLOYEE_CODE`, `TEST_PASSWORD` supplied as protected
  secrets, so the smoke suite runs against each release candidate.

## Anti-patterns checked

- No `it.skip`/`test.skip`/`xit`/`xdescribe` in `tests/` or `server/tests/`.
- No conditional `it` that silently no-ops.
- No skipped test exists to paper over a failure — the last full run is
  **324 passed / 22 skipped / 0 failed**.
