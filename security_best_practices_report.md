# Security Best Practices Report (Express + React)

## Executive Summary

The app uses cookie-based sessions and also stores an auth JWT in `localStorage`. Today there is no CSRF protection visible in the codebase, and some auth and redirect patterns increase security risk in production. Several of these items also correlate with “recurring errors” (proxy trust/cookies, missing secrets, noisy background workers when DB is unavailable).

## Findings

### 1) Missing CSRF protection for cookie-authenticated requests

- Rule ID: EXPRESS-CSRF-001 / REACT-CSRF-001
- Severity: High
- Evidence:
  - Client sends cookies broadly with `credentials: "include"` on API calls ([queryClient.ts:L24-L70](file:///workspace/FrameworkPlanner/client/src/lib/queryClient.ts#L24-L70)).
  - Server uses `express-session` cookies under `/api` ([app.ts:L137-L150](file:///workspace/FrameworkPlanner/server/app.ts#L137-L150)).
  - No CSRF middleware/token checks found in repo (`csrf/csurf` not present).
- Impact: A malicious site can trigger state-changing requests in a victim’s browser if the victim is logged in, potentially causing unintended actions.
- Fix:
  - Prefer token-based CSRF protection for cookie-authenticated POST/PUT/PATCH/DELETE.
  - If token-based is not feasible immediately, require a custom header on state-changing requests and validate `Origin`/`Referer` as defense-in-depth.

### 2) Auth token stored in localStorage (XSS token exfiltration risk)

- Rule ID: REACT-AUTH-001
- Severity: Medium
- Evidence:
  - JWT is stored in `localStorage` (`authToken` / `token`) ([AuthContext.tsx:L41-L50](file:///workspace/FrameworkPlanner/client/src/contexts/AuthContext.tsx#L41-L50)).
  - Token is reused as `Authorization: Bearer ...` ([queryClient.ts:L3-L15](file:///workspace/FrameworkPlanner/client/src/lib/queryClient.ts#L3-L15)).
- Impact: Any XSS (or compromised third-party script) can steal long-lived tokens from storage.
- Fix:
  - Prefer cookie-only sessions with CSRF protection, or store tokens in memory with short TTL + refresh.

### 3) Admin “bypass” login path is enabled when env vars are set

- Rule ID: EXPRESS-AUTH-001 (hardening), EXPRESS-ERROR-001 (info leakage via logs)
- Severity: High (if enabled in production)
- Evidence:
  - `/api/auth/login` allows “admin bypass” when `ADMIN_USERNAME`/`ADMIN_PASSWORD` match request credentials ([routes.ts:L682-L739](file:///workspace/FrameworkPlanner/server/routes.ts#L682-L739)).
  - Logs include the email address (`Admin bypass used for ${email}`) ([routes.ts:L687-L689](file:///workspace/FrameworkPlanner/server/routes.ts#L687-L689)).
- Impact: If those env credentials are leaked or reused, an attacker can bypass the normal password verification path. It also increases attack surface on the highest-value endpoint (login).
- Fix:
  - Gate this behind an explicit `ENABLE_ADMIN_BYPASS=true` and restrict to non-production, or remove entirely once bootstrap/admin tooling is in place.
  - Avoid logging PII (email) in auth success paths; log only a requestId + outcome.

### 4) Open redirect surface in property photo proxy endpoint

- Rule ID: EXPRESS-REDIRECT-001
- Severity: Medium
- Evidence:
  - `GET /api/property-photos/:key` performs `res.redirect(url)` ([routes.ts:L2476-L2486](file:///workspace/FrameworkPlanner/server/routes.ts#L2476-L2486)).
- Impact: If `getPropertyPhotoSignedUrl` can ever return attacker-controlled destinations, this becomes an open redirect (phishing) and can be chained with other issues.
- Fix:
  - Enforce an allowlist of hosts/protocols for redirect targets (e.g., only `https:` and only expected storage domains).

### 5) CSP is disabled globally in Helmet

- Rule ID: EXPRESS-HEADERS-001 / REACT-CSP-001
- Severity: Medium
- Evidence:
  - `helmet({ contentSecurityPolicy: false })` ([app.ts:L44-L46](file:///workspace/FrameworkPlanner/server/app.ts#L44-L46)).
- Impact: CSP is a major defense-in-depth control against XSS; disabling it increases blast radius of any frontend injection issue.
- Fix:
  - Enable CSP in production with a pragmatic policy; keep it relaxed in dev if needed.

### 6) Reverse proxy trust is hard-coded (`trust proxy = 1`)

- Rule ID: EXPRESS-PROXY-001
- Severity: Medium
- Evidence:
  - `app.set("trust proxy", 1)` ([app.ts:L80-L82](file:///workspace/FrameworkPlanner/server/app.ts#L80-L82)).
- Impact: If deployed behind a different proxy topology, IP/protocol/host derivation can be wrong; this can break auth/cookies and can also weaken rate limiting or security decisions based on `req.ip`.
- Fix:
  - Make trust proxy configuration explicit via env (hop count or allowlist) and document expected deployment topology.

### 7) Session cookie name is default (fingerprinting/collision risk)

- Rule ID: EXPRESS-SESS-001
- Severity: Low
- Evidence:
  - Session middleware does not set `name:`, so default cookie name is used ([app.ts:L137-L150](file:///workspace/FrameworkPlanner/server/app.ts#L137-L150)).
- Impact: Minor fingerprinting risk and potential collisions with other apps on the same domain.
- Fix:
  - Set a custom `name` for the session cookie (e.g., `stackk10m.sid`).

## Notes / Constraints

- This report is limited to code-visible controls. Some protections may exist at the edge (Vercel headers, WAF, etc.); verify runtime headers and deployment config for completeness.

