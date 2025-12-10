## Findings
- Employee code is hardcoded client-side as `"3911"` (`FrameworkPlanner/client/src/pages/signup.tsx:20-33,139-154`).
- Signup posts to `POST /api/auth/signup` and expects session cookie (`FrameworkPlanner/client/src/pages/signup.tsx:48-76`).
- Login uses `useAuth()` which calls `POST /api/auth/login` and sets user + redirect (`FrameworkPlanner/client/src/contexts/AuthContext.tsx:41-73`, `FrameworkPlanner/client/src/pages/login.tsx:16-27`).
- Server auth routes exist and store session in `express-session` with Postgres (`FrameworkPlanner/server/routes.ts:30-105`, `FrameworkPlanner/server/app.ts:50-67`).

## Risks
- Employee code enforcement only on the client is bypassable; server should validate it.
- Production requires `SESSION_SECRET` and a valid `DATABASE_URL` (Supabase works) with SSL, otherwise auth breaks (`FrameworkPlanner/server/app.ts:35-45,51-55`, `FrameworkPlanner/server/db.ts:6-12`).

## Plan
1. Add server-side employee code validation:
   - Accept `employeeCode` in `POST /api/auth/signup`.
   - Validate against `process.env.EMPLOYEE_ACCESS_CODE` (or `EMPLOYEE_CODE`) and return 403 if invalid.
   - Update client signup to send `employeeCode` to the API.
2. Configuration:
   - Document and set `EMPLOYEE_ACCESS_CODE` in environment.
   - Ensure `DATABASE_URL` points to Supabase with `sslmode=require`.
3. UX polish:
   - On signup success, redirect to login (already implemented), but show server errors clearly.
   - On login, redirect to dashboard on success (already implemented at `AuthContext.tsx:66-73`).
4. Verification (after you approve):
   - Run backend with required env vars.
   - Test: attempt signup with wrong code → expect 403; correct code → user created and session set.
   - Test login with the new account → expect redirect and `GET /api/auth/me` returns user.

## Optional Enhancements
- Move employee code to roles/teams policy or invite-based flows.
- Add rate limiting on auth endpoints.
- Add admin bootstrap if missing and password reset flow.