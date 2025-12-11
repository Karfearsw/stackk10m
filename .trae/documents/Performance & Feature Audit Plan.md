## Objectives
- Perform a thorough performance check of client and server
- Produce a feature checklist: working, partial, broken, and prioritized fixes
- Deliver an actionable “What’s Next” summary for engineering

## Metrics & Tools
- Client: Lighthouse (Performance, Accessibility, Best Practices), bundle size from Vite build stats
- Server: `/api/metrics` (HTTP request/error counts, latencies), endpoint health probes
- Network: WebRTC connection timing (token fetch, connect, dial) and REST latency
- Browser DevTools: FPS, CPU, memory for dialer page and dashboard

## Back-End Diagnostics
- Verify core endpoints: `/api/health`, `/api/system/health`, `/api/telephony/health`, `/api/telephony/signalwire/token`
- Validate session store behavior (secure cookies in production; `pg-simple` table created)
- Database: Neon connectivity, query latencies for read-heavy pages (dashboard, opportunities, contacts)
- Telephony: SignalWire reachability and error modes (timeouts, invalid creds)

## Front-End Diagnostics
- Page load performance: `/` (dashboard), `/opportunities`, `/dialer`, `/settings`
- Interaction performance: keypad input, contact search, history polling, settings navigation
- Bundle analysis: identify large chunks and candidates for code-splitting (signalwire SDK, charting)
- Accessibility: keyboard nav, focus states, ARIA labels on new System Health button/page

## Telephony Feature Checks
- Token issuance: short-lived JWT contents (iss, exp, resource.from/to)
- Client init: module import stability and event handling (ready, call.state)
- Call flows: dial, mute/unmute, hold/unhold, hangup; error recovery paths
- Presence and contacts: basic filtering; history logging (create/patch durations)

## Core Feature Checklist
- Auth: login/signup/logout, protected routes (dashboard, dialer, system health)
- CRM pages: leads/opportunities/contacts/contracts—list, detail, CRUD, convert lead → property
- Notifications: list, read, delete
- Settings: profile, password change, notification preferences, System Health button
- System Health page: aggregated diagnostics, refresh, copy JSON

## Performance Optimization Opportunities
- Code-splitting: lazy-load dialer and system-health
- Defer heavy assets on property-detail; use responsive images
- Reduce polling frequency on history (adaptive refresh)
- Add DB indexes for search fields (contacts.name/phone, leads.address/city)

## Deliverables
- Performance report with Lighthouse scores and key metrics
- Feature status matrix: Working / Needs attention / Broken with owner and priority
- Prioritized “What’s Next” checklist mapped to measurable acceptance criteria

## Execution Steps
1. Collect server metrics and run endpoint health probes
2. Run Lighthouse on key pages; capture results and regressions
3. Inspect bundles and propose code-splitting targets
4. Exercise telephony flows; log events/latencies
5. Compile feature status and next steps; publish the checklist

## Verification Criteria
- All health endpoints return expected JSON with “connected/reachable” states
- Lighthouse performance >= 80 on dashboard and dialer
- No runtime errors on feature pages; telephony actions succeed or report actionable errors
- Checklist is complete, prioritized, and traceable to code locations