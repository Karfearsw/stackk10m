# Status — Backend (Express)

## Entry Points

- Development server: [index-dev.ts](file:///workspace/FrameworkPlanner/server/index-dev.ts)
- Production server bundle targets: [index-prod.ts](file:///workspace/FrameworkPlanner/server/index-prod.ts), [index-vercel.ts](file:///workspace/FrameworkPlanner/server/index-vercel.ts), [index-ws.ts](file:///workspace/FrameworkPlanner/server/index-ws.ts)
- Main app middleware + session + schema gate: [app.ts](file:///workspace/FrameworkPlanner/server/app.ts)

## Auth Model

- Cookie session via `express-session` (with Postgres-backed store when DB is configured): [app.ts](file:///workspace/FrameworkPlanner/server/app.ts#L77-L152)
- Auth endpoints:
  - `POST /api/auth/login`
  - `POST /api/auth/signup`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
  - `POST /api/auth/dev-bypass` (dev only)

Source: [routes.ts](file:///workspace/FrameworkPlanner/server/routes.ts#L659-L940)

## API Surface (High-Level Catalog)

Most endpoints are registered in one file: [routes.ts](file:///workspace/FrameworkPlanner/server/routes.ts).

### Leads

Endpoints:
- `GET /api/leads` (supports `limit`, `offset`, filters, returns `{items,total}`)  
- `GET /api/leads/:id`  
- `POST /api/leads`  
- `PATCH /api/leads/:id`  
- `DELETE /api/leads/:id`  
- `POST /api/leads/:id/convert-to-property`  
- `GET /api/leads/:id/skip-trace/latest` / `POST /api/leads/:id/skip-trace`  
- `GET /api/leads/:id/tasks` / `POST /api/leads/:id/tasks`

Source: [routes.ts](file:///workspace/FrameworkPlanner/server/routes.ts#L1413-L1569)

### Opportunities (Properties)

Endpoints:
- `GET /api/opportunities` / `GET /api/opportunities/:id`
- `POST /api/opportunities` / `PATCH /api/opportunities/:id` / `DELETE /api/opportunities/:id`
- Photos: `POST /api/opportunities/:id/photos`
- Comps: `GET /api/opportunities/:id/comps/snapshots`, `POST /api/opportunities/:id/comps/pull`
- Buyer matching: `GET /api/opportunities/:id/buyer-matches`, `POST /api/opportunities/:id/buyer-matches/recompute`
- Skip trace: `GET /api/opportunities/:id/skip-trace/latest`, `POST /api/opportunities/:id/skip-trace`
- Tasks: `GET /api/opportunities/:id/tasks`, `POST /api/opportunities/:id/tasks`

Source: [routes.ts](file:///workspace/FrameworkPlanner/server/routes.ts#L2439-L3044)

### Telephony (Phone/Dialer)

Endpoints:
- Call logs: `POST /api/telephony/calls`, `PATCH /api/telephony/calls/:id`
- History: `GET /api/telephony/history`
- Contacts search: `GET /api/telephony/contacts`
- Spam flagging: `POST /api/telephony/spam/flag`, `POST /api/telephony/spam/unflag`
- Voicemail: `GET /api/telephony/voicemail`
- Analytics: `GET /api/telephony/analytics/summary`
- Health/presence: `GET /api/telephony/health`, `GET /api/telephony/presence`
- SignalWire: `POST /api/telephony/signalwire/token`
- Webhooks: `/api/telephony/*/webhook`, gather/recording endpoints

Source: [routes.ts](file:///workspace/FrameworkPlanner/server/routes.ts#L3310-L4045)

### Playground (Underwriting / Research sessions)

Endpoints:
- Sessions: `GET /api/playground/sessions/recent`, `POST /api/playground/sessions/open`, `POST /api/playground/sessions`, `GET/PATCH/DELETE /api/playground/sessions/:id`
- “Send session” action: `POST /api/playground/sessions/:id/send`

Source: [routes.ts](file:///workspace/FrameworkPlanner/server/routes.ts#L953-L1283)

### Tasks

Endpoints:
- `GET /api/tasks` (list)
- `POST /api/tasks` (create)
- `PATCH /api/tasks/:id` (update)
- `POST /api/tasks/:id/complete`
- `DELETE /api/tasks/:id`

Source: [routes.ts](file:///workspace/FrameworkPlanner/server/routes.ts#L5382-L5495)

### Search

- `GET /api/search` aggregates leads/properties/contacts and returns deep-links.  
Source: [routes.ts](file:///workspace/FrameworkPlanner/server/routes.ts#L574)

### Pipeline config

- `GET /api/pipeline-config?entityType=lead|opportunity`  
Source: [routes.ts](file:///workspace/FrameworkPlanner/server/routes.ts#L5026)

## Third-Party Integrations (Env-gated)

- **Sentry (server)**: `SENTRY_DSN` enables server error capture ([sentry.ts](file:///workspace/FrameworkPlanner/server/sentry.ts))
- **SignalWire SMS**: requires `SIGNALWIRE_PROJECT_ID`, `SIGNALWIRE_API_TOKEN`, `SIGNALWIRE_SPACE_URL`, `SIGNALWIRE_FROM_NUMBER` ([signalwire.ts](file:///workspace/FrameworkPlanner/server/services/messaging/signalwire.ts))
- **Resend Email**: requires `RESEND_API_KEY`, `RESEND_FROM` ([resend.ts](file:///workspace/FrameworkPlanner/server/services/messaging/resend.ts))
- **Telephony media storage (S3-compatible)**: `TELEPHONY_MEDIA_*` ([objectStorage.ts](file:///workspace/FrameworkPlanner/server/telephony/objectStorage.ts))

## Background Jobs / Workers

Workers are started from the main app runtime:
- Lead automation: [cron/lead-automation.ts](file:///workspace/FrameworkPlanner/server/cron/lead-automation.ts)
- Campaign scheduler: [cron/campaign-scheduler.ts](file:///workspace/FrameworkPlanner/server/cron/campaign-scheduler.ts)
- RVM poller: [cron/rvm-poller.ts](file:///workspace/FrameworkPlanner/server/cron/rvm-poller.ts)
- Task reminders: [cron/task-reminders.ts](file:///workspace/FrameworkPlanner/server/cron/task-reminders.ts)

