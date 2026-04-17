# Status — Frontend

## Routing Map (Wouter)

Routes are defined in [App.tsx](file:///workspace/FrameworkPlanner/client/src/App.tsx#L73-L177) and pages live in [client/src/pages](file:///workspace/FrameworkPlanner/client/src/pages).

| Route | Page | Notes |
|---|---|---|
| `/` | [dashboard.tsx](file:///workspace/FrameworkPlanner/client/src/pages/dashboard.tsx) | Overview widgets |
| `/leads` | [leads.tsx](file:///workspace/FrameworkPlanner/client/src/pages/leads.tsx) | List + pipeline |
| `/opportunities` | [properties.tsx](file:///workspace/FrameworkPlanner/client/src/pages/properties.tsx) | Opportunity pipeline/list |
| `/opportunities/:id` | [property-detail.tsx](file:///workspace/FrameworkPlanner/client/src/pages/property-detail.tsx) | Opportunity detail |
| `/playground` | [playground.tsx](file:///workspace/FrameworkPlanner/client/src/pages/playground.tsx) | Research + underwriting |
| `/phone` | [phone.tsx](file:///workspace/FrameworkPlanner/client/src/pages/phone.tsx) | Calling/SMS/voicemail/history |
| `/dialer/workspace` | [dialer-workspace.tsx](file:///workspace/FrameworkPlanner/client/src/pages/dialer-workspace.tsx) | Dialer queue workspace |
| `/tasks` | [tasks.tsx](file:///workspace/FrameworkPlanner/client/src/pages/tasks.tsx) | Tasks list + assignment |
| `/contacts` | [contacts.tsx](file:///workspace/FrameworkPlanner/client/src/pages/contacts.tsx) | Contact CRUD |
| `/campaigns` | [campaigns.tsx](file:///workspace/FrameworkPlanner/client/src/pages/campaigns.tsx) | Campaigns |
| `/rvm` | [rvm.tsx](file:///workspace/FrameworkPlanner/client/src/pages/rvm.tsx) | Ringless voicemail |
| `/contracts` | [contract-generator.tsx](file:///workspace/FrameworkPlanner/client/src/pages/contract-generator.tsx) | Current contracts UI |
| `/analytics` | [analytics.tsx](file:///workspace/FrameworkPlanner/client/src/pages/analytics.tsx) | Analytics |
| `/settings` | [settings.tsx](file:///workspace/FrameworkPlanner/client/src/pages/settings.tsx) | User/admin settings |
| `/system/health` | [system-health.tsx](file:///workspace/FrameworkPlanner/client/src/pages/system-health.tsx) | Operational readiness UI |
| `/search` | [search.tsx](file:///workspace/FrameworkPlanner/client/src/pages/search.tsx) | Global search UI |
| `/login` | [login.tsx](file:///workspace/FrameworkPlanner/client/src/pages/login.tsx) | Auth |
| `/signup` | [signup.tsx](file:///workspace/FrameworkPlanner/client/src/pages/signup.tsx) | Auth |

## Key Data Dependencies (Grounded)

This section is based on direct `/api/` references in the page code.

### Dashboard

Queries:
- `/api/leads?limit=500`
- `/api/properties`
- `/api/contracts`
- `/api/contract-documents`
- `/api/activity`
- `/api/users`

Source: [dashboard.tsx](file:///workspace/FrameworkPlanner/client/src/pages/dashboard.tsx)

### Leads

Leads is a combined list + pipeline view.

Core endpoints:
- `/api/leads` (+ pipeline config and lead-source options)
- `/api/pipeline-config?entityType=lead`
- `/api/lead-source-options`
- `/api/leads/:id/skip-trace/*`
- `/api/leads/:id/tasks`

Source: [leads.tsx](file:///workspace/FrameworkPlanner/client/src/pages/leads.tsx), backend endpoints in [routes.ts](file:///workspace/FrameworkPlanner/server/routes.ts#L1413-L1496)

### Opportunities

Core endpoints:
- `/api/opportunities` (+ pipeline config)
- `/api/pipeline-config?entityType=opportunity`
- `/api/address/suggest` (address autocomplete)

Source: [properties.tsx](file:///workspace/FrameworkPlanner/client/src/pages/properties.tsx)

### Phone

Core endpoints:
- `/api/telephony/history`
- `/api/telephony/contacts`
- `/api/telephony/calls` (create/update)
- `/api/telephony/voicemail`
- `/api/telephony/analytics/summary`

Source: [phone.tsx](file:///workspace/FrameworkPlanner/client/src/pages/phone.tsx)

### Playground

Playground page fetches context:
- `/api/opportunities/:id` (when `propertyId` is present)
- `/api/leads/:id` (when `leadId` is present)

Source: [playground.tsx](file:///workspace/FrameworkPlanner/client/src/pages/playground.tsx)

## UX / Reliability Gaps (What to Improve Next)

1) **List scalability & correctness**
- Ensure every list view supports pagination and exposes `total` (avoid hard-coded limits that make records “disappear”).
- Standardize query key naming and invalidation patterns so updates reflect immediately.

2) **Global search → deep-link reliability**
- Any search result that links to a “details view” should always open, even if the list data is not currently loaded (fallback fetch-by-id).

3) **Pipeline completeness**
- Pipeline configs can hide items if statuses are missing; pipeline UIs should have a deterministic “Other/missing statuses” behavior.

4) **Loading/empty/error consistency**
- Establish a consistent pattern for:
  - skeleton/loading
  - empty state CTA
  - error state with retry

5) **Speed features**
- Add a command palette (“Jump to Lead / Opportunity / Contact”) that accepts:
  - id
  - address
  - owner name/phone

