# Campaign email setup (kept feature — Campaigns)

Campaign SMS sends through the existing Telnyx integration
(`TELNYX_API_KEY` + messaging profile). Campaign **email** goes through the
provider abstraction in `server/services/messaging/email-router.ts`:

1. **Telnyx Email API** (preferred) — needs `TELNYX_API_KEY` plus a **verified
   custom sending domain** (DNS: DKIM + ownership) and `EMAIL_FROM_ADDRESS`
   (e.g. `notifications@oceanluxe.org`). Without a verified custom domain,
   Telnyx can only email the account owner's verified address (shared-domain
   mode) — campaign emails to leads will be blocked with a clear error.
2. **Resend** (fallback) — needs `RESEND_API_KEY` + `RESEND_FROM`.

## Current status (Oct 7, 2026)

No email provider is configured in this deployment — that is the known gap.
The scheduler's email path is fully wired: `sendEmail()` throws a structured
`EmailRouterError` (surfaced in `campaign_deliveries.error` and the Campaigns →
Compliance tab) instead of silently failing, so the moment a provider key is
added, email steps start working with no code change.

To enable: set **one** of the following and redeploy —

- `RESEND_API_KEY` + `RESEND_FROM`, or
- `TELNYX_API_KEY` + verified custom domain + `EMAIL_FROM_ADDRESS`
  (keep `TELNYX_EMAIL_ENABLED=true`, the default)

Check live status anytime: **Settings → System → provider readiness**
(`GET /api/system/provider-readiness` → `email.blocker` explains exactly
what is missing).

## Compliance gates (enforced server-side, not UI hints)

- Email steps require `leads.email_consent = true` (positive opt-in, set on the
  lead record via Edit Lead → Consent & Do Not Contact).
- `do_not_call` hard-suppresses **every** channel; `do_not_email` suppresses email.
- Every send or suppression is logged to `campaign_deliveries` with a
  machine-readable code (`NO_EMAIL_CONSENT`, `DNC_DO_NOT_CALL`, …) plus a
  human-readable reason.
