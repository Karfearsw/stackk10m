# Self-built e-sign (v2) — `server/esign/*`

Owner decision (Oct 7, 2026): **NO DocuSign / HelloSign API.** This is the
native e-signature module.

> ⚠️ **ATTORNEY REVIEW REQUIRED BEFORE PRODUCTION USE.** This module is
> engineered for ESIGN Act / UETA-shaped compliance (intent, e-consent,
> attribution, tamper-evident retention) but it is **not legal advice** and has
> not been reviewed by counsel. Do not execute real contracts until an attorney
> signs off on the ceremony, the certificate, and the retention story.

## What was built

| File | Purpose |
|---|---|
| `types.ts` | Envelope/signer statuses, zod input schemas, `ESIGN_CONSENT_TEXT` |
| `tokens.ts` | HMAC-SHA256 **single-use** signer links (`esign_v1.<env>.<signer>.<exp>.<nonce>.<sig>`), expiry |
| `ceremony.ts` | Pure signing guards: expiry, state, single-use replay, sequential order |
| `audit.ts` | SHA-256 hash-chain over `contract_events` (`event_hash = sha256(prev_hash \| type \| payload \| ts)`) |
| `pdf.ts` | Chromium (Playwright) HTML→PDF render + pdf-lib signature overlays + Certificate of Completion |
| `envelopes.ts` | Orchestration: create-from-template, send, view, sign (draw/type/upload), decline, void, expire, finalize |
| `notify.ts` | **LOG-ONLY** signer notification stubs (no provider configured) |
| `../routes/esign.ts` | HTTP layer (`/api/esign/*` agent routes + `/api/esign/sign/:token` public routes), mounted from `server/app.ts` |
| `client/src/pages/esign-sign.tsx` | Public token-gated ceremony page at `/esign/:token` |

## Envelope lifecycle

```
draft → sent → viewed → signed → completed
                          ├→ expired
                          └→ voided
```

`signed` = partially signed (multi-signer). `completed` = all signers done AND
the final packet (rendered PDF + per-signer signature pages + Certificate of
Completion) generated with `document_sha256` + `final_pdf_sha256` recorded.

## Security properties

- **HMAC-signed links**: token integrity verified without a DB lookup; the
  nonce is additionally matched against `contract_signers.token_nonce`.
- **Single-use**: the token is atomically consumed (`UPDATE … WHERE
  token_used_at IS NULL`) at signing; replays return 409 even though the HMAC
  still verifies.
- **Expiry**: enforced on every access; a sweeper (`expireStaleEnvelopes`) marks
  stale envelopes/signers `expired`.
- **Tamper evidence**: hash-chained `contract_events`; the final PDF's SHA-256
  is stored and re-verified on every download. Any edit/delete/reorder of
  events, or any post-completion PDF byte change, is detectable via
  `GET /api/esign/envelopes/:id/verify`.
- Signers need **no login**; the token is the credential. Agents need a session
  plus the `esign` feature flag.

## Environment

| Var | Purpose |
|---|---|
| `ESIGN_HMAC_SECRET` | 32+ char secret for signer-token HMAC. Falls back to a key derived from `SESSION_SECRET` (loud warning). **Set a dedicated secret in production.** |
| `ESIGN_CHROMIUM_PATH` | Chromium executable for PDF rendering. **Required on Vercel** (see below). |
| `PLAYWRIGHT_BROWSERS_PATH` | Optional: where `npx playwright install` puts browsers (dev/CI). |

## Vercel / production notes

- `playwright-core` is a **runtime dependency** (browser launch only; it does
  not bundle a browser). `@playwright/test` remains dev-only.
- Serverless functions have no Chromium by default. Recommended: add
  `@sparticuz/chromium` and set `ESIGN_CHROMIUM_PATH` to its executable path
  (see sparticuz docs for the exact import). Budget for the ~130 MB layer and
  raise the function's memory/timeout — PDF finalization is the heaviest step.
- Alternative: move finalization to a long-running worker/container and keep
  the serverless route to status polling.
- If no browser is resolvable, finalization fails **closed** with
  `EsignPdfError(code="no_browser")` — envelopes stay `signed`, never
  `completed`, until a browser is available.

## TODO before production

1. **Attorney review** of the ceremony, consent text, certificate, and
   retention (see warning above).
2. **Wire notifications**: `notify.ts` is log-only. Connect
   `server/services/messaging/email-router.ts` and the Telnyx SMS path;
   add quiet-hours + opt-out handling.
3. **Rotate `ESIGN_HMAC_SECRET`** independently from `SESSION_SECRET`.
4. Decide PDF **retention/storage**: currently base64 in
   `contract_envelopes.signed_pdf_base64`; consider the documents module /
   object storage for large volumes.
5. Wire `sweepExpiredEsignEnvelopes()` into the app's cron (exported from
   `server/routes/esign.ts`; not auto-registered).
6. Migration numbering: this branch adds `0081_esign_selfbuilt.sql`
   (renumbered from 0079 — #27 kept 0079, #26 took 0080).

## Legacy coexistence

The v1 flow (`/api/sign/*`, `server/services/esign/pdf.ts`,
`client/src/pages/sign-contract.tsx`) is untouched and keeps working. v2 rows
are marked `esign_version = 2` while legacy v1 rows default to `1`, so the new
agent UI never mixes the two flows.
