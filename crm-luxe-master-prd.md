# CRM Luxe Master PRD

## Document purpose

This document is a master product requirements document and senior-developer build prompt for the next major CRM Luxe upgrade cycle. It consolidates the audited modules, proposed improvements, architectural expectations, workflow logic, UX standards, and implementation priorities discussed across the CRM. The CRM already includes Leads, Opportunities, Property Playground, Campaigns, RVM, Field Mode, Phone, Dialer, Buyers, Contracts, Analytics, Calculator, Dashboard, Calendar, Tasks, Today, Timesheet, Notifications, Contacts, and Settings surfaces, so this PRD focuses on upgrading those systems into a cohesive production-grade real estate operating platform.[cite:1]

## Product thesis

CRM Luxe should evolve from a collection of useful pages into a unified operating system for acquisitions, underwriting, outreach, dispositions, contracts, execution, team management, and reporting. The current platform already contains major workflow surfaces such as a Leads workspace with search, filters, list and pipeline modes, a large lead dataset, and cross-functional modules for calling, campaigns, buyers, contracts, tasks, analytics, and settings, which means the next phase should focus less on adding random pages and more on operational depth, data integrity, automation, and cross-module cohesion.[cite:1]

## Objectives

### Primary objectives

- Improve speed of execution across lead management, calling, underwriting, and deal progression.
- Add safer automation and AI-assisted actions with review, logging, and undo.
- Turn the CRM into a multi-role operating system for acquisitions, dispositions, support staff, field users, and management.
- Improve data trust across scores, time tracking, analytics, and pipeline metrics.
- Add missing system backbone layers such as property records, company records, document workflows, automations, auditability, and compliance.

### Secondary objectives

- Reduce click count for common workflows.
- Increase context visibility without requiring page hops.
- Improve search, saved views, filters, and smart defaults.
- Create platform-level settings, routing, permissions, and payout logic.
- Support future multi-tenant SaaS architecture.

### Non-goals

- Fully autonomous AI write actions without user review.
- A complete visual redesign disconnected from current workflow structure.
- Replacing all modules at once rather than progressively hardening the existing system.

## Platform-wide product principles

### 1. One record, many linked objects

Every important business object should be linkable: people, companies, properties, leads, opportunities, buyers, contracts, tasks, calendar events, communications, and files. The current CRM already has many module surfaces, but stronger entity linking is required to make them feel like one system rather than separate tools.[cite:1]

### 2. Explainable automation

AI and automation should never mutate important records silently. Every AI voice action, score output, recommendation, or automation should be previewable, reviewable, and logged, with undo support wherever possible.

### 3. Action over display

Most pages already have useful scaffolding. The next step is to make each page answer: what should the user do next, why, and with what confidence?

### 4. High-volume operational design

The Leads module already handles a large dataset and many other modules clearly aim at repetitive execution workflows, so the product should optimize for bulk actions, queue logic, keyboard speed, saved views, and workflow compression rather than decorative UI.[cite:1]

### 5. Data trust first

Any screen with wrong math, empty KPIs, fake precision, duplicated activity, or ambiguous telephony state loses operator trust. Fixing correctness is as important as adding features.

## Cross-system missing backbone

The current CRM surface is broad, but several platform layers are still missing or underdeveloped. These should be treated as foundational epics, not optional add-ons.

### Missing or underdeveloped system layers

- Canonical **Properties** object.
- Canonical **Companies / Organizations** object.
- **Documents / File Vault** with versioning and linking.
- **Automation Builder** with triggers, conditions, actions, delays, and logs.
- **Audit Log** for user actions, automation actions, and AI actions.
- **Compliance Center** for DNC, DNT, opt-outs, quiet hours, and communication suppression.
- **Integrations Hub** for telephony, skip trace, email, SMS, e-sign, webhooks, and data vendors.
- **Custom Fields / Schema Extensions** by object type.
- **Global Command Bar / Search** across all entities and actions.
- **Import Mapping + Dedupe Center** for leads, buyers, contacts, companies, and properties.

## User roles

### Core user types

- Admin / Owner
- Acquisition manager
- Disposition manager
- Caller / dialer rep
- Virtual assistant
- Field rep / driving-for-dollars user
- Transaction coordinator
- Analyst / underwriter
- Operations / team lead

### Role-based product expectations

- Admins need governance, settings, reporting, automations, audit logs, and permissions.
- Acquisition reps need leads, dialer, opportunity intelligence, follow-up, and notes.
- Dispo reps need buyers, buyer match, contracts, and outbound deal distribution.
- VAs need tasks, timesheet, field-light admin work, list hygiene, and approvals.
- Managers need today queues, dashboards, analytics, timesheet approval, and notification routing.

## Epic map

1. Lead Operations at Scale
2. Opportunity Execution Layer
3. Property Playground as Decision Lab
4. Outreach Stack: Phone, Dialer, Campaigns, RVM
5. Buyer and Contact Intelligence
6. Contracts and Transaction Management
7. Task, Today, Calendar, Notifications
8. Dashboard and Analytics Trust Layer
9. Timesheet, Compensation, and Team Productivity
10. Settings, Permissions, and Control Plane
11. Missing Platform Backbone: Properties, Companies, Documents, Automations, Audit, Compliance

---

## 1. Leads PRD

### Current state summary

The Leads page already exposes search, a generic filter entry point, import/export, list and pipeline toggles, a high-volume table, and columns such as Address, Owner, Status, Score, Value, Contact, and Actions. It also operates on a large dataset, which makes it the highest-leverage page for organization, prioritization, and bulk workflow improvements.[cite:1]

### Product goal

Turn Leads into the system’s primary **work queue and segmentation hub** for acquisitions.

### Key upgrades

- Row selection with per-row and bulk selection.
- Bulk action toolbar with assign, tag, status change, export, archive, deep search, and rescore actions.
- Saved views with filter + sort + column persistence.
- Advanced filters: ZIP, state, city, county, lead type, owner occupancy, score, tags, assigned user, last activity, contactability, deep-search state.
- Strong sort menu with operational modes like highest score, oldest untouched, newest imported, last contact attempt, and status age.
- Column chooser with per-view persistence.
- Notes visibility and recent context preview.
- List-first selection model with pipeline filter parity.

### AI scoring and deep search

The Score column should be backed by a deterministic, explainable scoring model with confidence, reasons, and next best action. Deep search should enrich property, owner, distress, market, and contactability data through a staged enrichment pipeline.

### Acceptance criteria

- Users can select rows and perform bulk operations safely.
- Filters are URL-driven and shareable.
- Saved views store filters, sorts, columns, and view state.
- Score and confidence are visible and explainable.
- Deep search can run asynchronously at scale.
- Pipeline and List share filter and saved-view context.

---

## 2. Pipeline view behavior

### Product decision

Adopt **List-first** selection and bulk edits in Phase 1. Pipeline should retain filter/view parity and act as a drag/scan mode first, with optional future card multi-select only if proven necessary.

### Phase design

- Phase 1: filters, saved views, and scoped dataset parity across List and Pipeline.
- Phase 2: optional “apply to all filtered” pipeline actions.
- Phase 3: evaluate explicit Select Mode for card multi-select, not always-on checkboxes.

### Reasoning

Pipeline is optimized for stage movement and scanning, while list view provides the clearer mental model for high-trust bulk mutation.

---

## 3. Opportunity page PRD

### Product goal

Turn Opportunities into the **deal execution hub** after a lead is prioritized.

### Current strengths

Opportunity already includes Underwrite Deal, Run Comps, Generate Offer, Deal Room, Comps, Buyer Matches, notes, tasks, and scoring scaffolding, which means the structural base exists.[cite:1]

### Core upgrades

- Opportunity health score with evidence count and confidence.
- Next-best-action panel.
- Deal readiness block for missing data and blockers.
- Underwriting workspace with ARV, repairs, MAO, spread, seller ask, and offer band.
- Seller conversation summary from notes/calls.
- Buyer fit score and dispo readiness.
- Evidence timeline for why the score and recommendations exist.
- Stage checklist: intake, underwriting, offer, negotiation, contract, dispo, close.

### Acceptance criteria

- Every opportunity shows missing information, risk, and recommended next action.
- Underwriting and offer generation are tied to real assumptions and comps.
- Opportunity timeline aggregates calls, notes, tasks, stage changes, and generated outputs.

---

## 4. Property Playground PRD

### Product goal

Make Playground the **decision lab** between Leads and Opportunities.

### Current strengths

The page already combines a research browser, bookmarks, notes, quick links, ARV prompts, comp guidance, repair presets, MAO math, and structured note sections, making it a strong underwriting scratchpad.[cite:1]

### Core upgrades

- Auto-extract facts from visited pages into structured snapshot fields.
- Evidence capture for snippets, URLs, and screenshots.
- Comp scoring and pinning engine.
- AI deal brief summarizing what is known, missing, risky, and recommended.
- ARV confidence band: low/base/high.
- Offer strategy presets: wholesale, wholetail, flip, buy-and-hold.
- Push-to-opportunity readiness score.
- Save structured evidence to opportunity and document vault.

### Acceptance criteria

- Users can move from research to underwriting to opportunity handoff without losing context.
- Saved comps are rankable, includable/excludable, and tied to confidence.
- AI summary is evidence-backed and editable.

---

## 5. Campaigns PRD

### Product goal

Make Campaigns the **outbound automation layer** for segmented lead outreach.

### Current state summary

The current Campaigns page provides only a small shell with campaign creation and selection concepts, but not a full sequence, enrollment, or performance system.[cite:1]

### Core upgrades

- Campaign inventory with draft, active, paused, completed states.
- Audience enrollment from saved views and lead filters.
- Sequence builder supporting SMS, email, ringless voicemail, task prompts, and manual-call reminders.
- Wait rules, quiet hours, stop-on-reply, and suppression logic.
- Performance dashboard with sends, delivered, opened, replied, opted out, and influenced opportunities.
- AI reply classification for inbound responses.

### Acceptance criteria

- Audiences can be enrolled from lead segments without manual exports.
- Compliance and suppression checks occur before launch.
- Performance is visible by campaign and step.

---

## 6. RVM PRD

### Product goal

Turn RVM into a **guardrailed ringless voicemail campaign manager**.

### Current state summary

RVM already supports audio asset selection, campaign naming, time windows, daily cap, and launch by lead IDs, but still requires production-grade targeting, suppression, and analytics.[cite:1]

### Core upgrades

- Audience selection from saved views and filters.
- Suppression engine for DNC, invalid numbers, recent contact, and opt-out logic.
- Launch preview: eligible, suppressed, duplicate, and sendable counts.
- Audio asset library with transcript, tags, and versioning.
- Result dashboard: sent, delivered, callbacks, opportunities created, and cost per response.
- A/B voicemail testing.

---

## 7. Field Mode PRD

### Product goal

Make Field Mode the **mobile capture and offline sync hub** for field reps.

### Current state summary

Field Mode already emphasizes fast capture, offline queue, sync controls, voice notes, media, quick actions, and note queueing, which makes it one of the clearest field-workflow surfaces in the app.[cite:1]

### Core upgrades

- Persistent sync state with online/offline/syncing/failed and last successful sync.
- Queue inspector for leads, notes, media, retries, and failed items.
- Voice note card with transcript preview, playback, attach target, and save state.
- Duplicate/address match before creating a lead.
- Quick presets: driving for dollars, vacant property, owner encounter, revisit.
- Auto geotagging and time metadata where permitted.

---

## 8. Phone page PRD

### Product goal

Make Phone the **general telephony workspace** and conversation context layer.

### Core upgrades

- Active-call panel with notes, disposition, last activity, scripts, and next steps.
- Disposition-driven automation for tasks and status updates.
- Better connection diagnostics and readiness messaging.
- CRM linkage so every call logs back to lead/opportunity/contact timeline.
- Queue mode or handoff to Dialer for power-calling scenarios.

---

## 9. Dialer PRD

### Product goal

Make Dialer the **high-throughput calling engine**.

### Current state summary

Dialer already has queue tabs, session control, lead context, call logging, follow-up date, DNC/DNT flags, stage update fields, SMS drafting, and script support, making it one of the most advanced operational pages already.[cite:1]

### Core upgrades

- Mandatory post-call wrap-up before next lead if call attempt occurred.
- Telephony clarity around SignalWire vs external calling path.
- Queue intelligence badges: stage, score, last touch, urgency, follow-up due.
- Auto-created callback tasks from follow-up date.
- Disposition-driven stage updates, suppression, and next-best-action logic.
- Activity timeline for the selected lead.
- Session metrics and leaderboard-style productivity analytics.

---

## 10. Buyers PRD

### Product goal

Make Buyers the **dispositions intelligence layer**.

### Current state summary

Buyers already contains useful criteria notes, budgets, and contact methods, but behaves more like a buyer directory than a matching and relationship engine.[cite:1]

### Core upgrades

- Structured buy-box fields: markets, ZIPs, price range, asset type, beds, baths, HOA/flood preferences, financing type, close speed.
- Buyer profile drawer with timeline and sent-deal history.
- Buyer match scoring against opportunities and playground deals.
- Responsiveness score and VIP/hot/dormant segmentation.
- One-click send-to-matched-buyers workflow.
- Proof-of-funds and funding preference fields.

---

## 11. Contracts and Closing PRD

### Product goal

Turn Contracts into the **transaction document engine** and Closing into milestone execution.

### Current state summary

Contracts already exposes categories like Contracts, Create New, Closing, Templates, and LOIs, but has little visible operational workflow or actual contract record management.[cite:1]

### Core upgrades

- Generate contract or LOI from opportunity data.
- Template engine with merge fields and clause blocks.
- E-sign lifecycle and signer status tracking.
- Contract status board and detail drawer.
- Deadline tracker for EMD, inspection, close, contingencies, and reminders.
- Closing checklist and document timeline.
- Linked document vault and audit trail.

---

## 12. Dashboard and Analytics PRD

### Dashboard goal

Make Dashboard the **daily mission control** for users.

### Analytics goal

Make Analytics the **trustworthy business intelligence layer**.

### Dashboard upgrades

- Needs-attention widgets for stale leads, overdue follow-ups, hot opps, unsigned contracts, and today’s calls.
- Clickable stage counts and KPI drill-through.
- Deduplicated activity feed with grouped entity events.
- Role-based quick actions.
- Personalized work queue by user role.

### Analytics upgrades

- Canonical contract-close event pipeline.
- Source attribution: first touch, last touch, primary source.
- Stage aging, lag, fallout, and conversion analysis.
- Rep activity-to-revenue reporting.
- Drill-through charts and record-level filters.
- Market, ZIP, source, rep, and campaign segmentation.

---

## 13. Calculator PRD

### Product goal

Turn Calculator into the **core underwriting engine** used by Playground and Opportunity.

### Core upgrades

- Strategy selector: wholesale, flip, wholetail, rental.
- MAO and target offer range generation.
- Financing and holding assumptions.
- Scenario analysis with low/base/high ARV and rehab assumptions.
- Save multiple scenarios to a deal.
- Generate shareable underwriting summary.
- Push outputs into opportunity and offer generator.

---

## 14. Calendar, Tasks, Today, Notifications PRD

### Calendar goal

Make Calendar the **time and commitments layer**.

### Tasks goal

Make Tasks the **execution queue**.

### Today goal

Make Today the **smart daily focus engine**.

### Notifications goal

Make Notifications the **alert and attention routing layer**.

### Calendar upgrades

- Typed events with color coding.
- Linked entity chips.
- Quick-create callback, appointment, inspection, close, and task actions.
- Assignee/team filters and saved calendar views.
- Due-today and overdue agenda panel.

### Tasks upgrades

- Overdue/due-today/mine/unassigned presets.
- Linked record columns.
- Better statuses: open, in progress, blocked, waiting, skipped, completed.
- Grouping by type, source, campaign, or linked entity.
- Inline edit controls and bulk triage.

### Today upgrades

- Top-priority ranked section.
- Grouped backlog triage.
- Linked metadata: record type, score, stage, assignee, last touch.
- Repeat-snooze escalation rules.
- AI batching recommendations.

### Notifications upgrades

- Event ingestion from tasks, opps, contracts, dialer, leads, campaigns, buyers, and system alerts.
- Severity levels, unread state, snooze, archive, and preferences.
- Deep links and contextual actions.
- Digest mode and quiet hours.

---

## 15. Contacts and Companies PRD

### Product goal

Turn Contacts into the **people layer** and Companies into the **organization layer** of the CRM.

### Contacts upgrades

- Master contact profile with multi-role tagging.
- Richer fields: phones, emails, addresses, role, title, company, notes, tags, source.
- Unified communication and relationship timeline.
- Linked records to leads, opportunities, buyers, contracts, properties, and campaigns.
- Deduplication and merge tools.
- Quick actions for call, text, email, note, task, and open linked records.

### Companies page (new)

- Manage title companies, brokerages, builders, vendors, lenders, contractors, and LLCs.
- Link many people to one company.
- Track company-level specialties, markets, performance, notes, and files.
- Show related deals, contacts, and tasks.

---

## 16. Properties page PRD (new)

### Product goal

Create a canonical **Property record hub** that unifies address-based data across the CRM.

### Why it is missing

The system currently references addresses inside leads, opportunities, playground research, calculator workflows, and tasks, but lacks a first-class property object to unify all of that.

### Core modules

- Property identity: address, parcel/APN, ownership snapshot.
- Valuation + comps summary.
- Distress and market signals.
- Linked leads and opportunities.
- Linked contacts and companies.
- Photos, docs, and inspection artifacts.
- Timeline of touches, notes, tasks, offers, and contracts.

---

## 17. Timesheet, Compensation, and Team Performance PRD

### Product goal

Transform Timesheet into **Team Performance & Compensation**.

### Current issue

Visible timer and duration math are incorrect, so correctness hardening must come first.

### Core upgrades

- Rebuild duration and cost math from normalized timestamps.
- Stale timer detection, idle detection, pause/resume, overlap prevention.
- Employee compensation profiles: hourly, salary-shadow, commission-only, hybrid, flat-per-task.
- Work categories plus linked CRM record tracking.
- Commission ledger tied to opportunities, contracts, and closed deals.
- Approval states: draft, submitted, approved, paid, disputed.
- Productivity analytics by employee, category, and outcome.
- Pomodoro enhancement and breathing focus rail on Timesheet.

---

## 18. Settings, Integrations, Automations, Compliance, Audit Log PRD

### Product goal

Turn Settings into the **control plane** and introduce missing admin pages.

### Settings rebuild

Split into:
- Personal Settings
- Workspace Admin Settings

### Admin modules

- Account & profile
- Security & sessions
- Notifications & routing
- Team & permissions
- Goals & KPIs
- Offers & calculator defaults
- Pipeline setup
- Appearance and workspace defaults
- System & integrations
- Compensation defaults
- Compliance settings

### New supporting admin pages

- Integrations hub
- Automation builder
- Audit log
- Compliance center
- Import and dedupe center

### Automation builder requirements

Trigger examples:
- lead_created
- score_above_threshold
- opportunity_stage_changed
- call_disposition_saved
- contract_signed
- task_overdue
- buyer_replied

Actions:
- assign owner
- create task
- send notification
- update status
- add tag
- enqueue campaign
- run deep search
- create calendar event

---

## 19. AI systems PRD

### Voice action / playground mode

Build AI voice-to-action as a guarded system with:
- Speech-to-text capture.
- Route and record context.
- Structured JSON action proposal.
- Review drawer.
- Confirmed write action only after approval.
- Audit log and undo support.

### AI scoring

- Deterministic, explainable scoring first.
- Confidence stored separately.
- Positive and negative factors.
- Model versioning.
- Score history.
- Recommendation engine for next best action.

### AI content helpers

- Post-call summaries.
- Seller objection summaries.
- Buyer fit summaries.
- Deal brief generation.
- Notification summarization.
- Smart batching for tasks and today queues.

### AI governance rules

- No destructive write without confirmation.
- Every AI mutation logged.
- Every model output attributable to evidence or features.
- Admin can disable or restrict actions by role.

---

## 20. Technical architecture requirements

### Data model additions

Required or strongly recommended tables:

- `properties`
- `companies`
- `company_contacts`
- `documents`
- `document_links`
- `saved_views`
- `saved_view_filters`
- `lead_features`
- `lead_scores`
- `lead_score_history`
- `lead_enrichment_runs`
- `lead_enrichment_raw`
- `opportunity_health`
- `buyer_preferences`
- `buyer_match_events`
- `contact_activity_timeline`
- `ai_action_logs`
- `ai_action_undo`
- `automation_flows`
- `automation_runs`
- `notification_events`
- `audit_log`
- `compliance_flags`
- `time_entries`
- `compensation_profiles`
- `commission_ledger`
- `payroll_periods`
- `calendar_links`
- `task_links`

### Platform rules

- All filters should be URL-driven where possible.
- All core pages should support linked-record drill-through.
- All communication events should write to a common activity model.
- All AI actions and automations should be auditable.
- All bulk actions should support partial failure reporting.
- All compliance flags should influence outreach eligibility globally.

### Performance requirements

- Async jobs for scoring, deep search, imports, campaign launches, and notifications.
- No blocking page render for enrichment or analytics recompute.
- Virtualized tables for high-volume views.
- Partial hydration and smart query caching for dense pages.

### Design requirements

- Compact, productivity-first web app styling.
- Strong keyboard support on list, task, and calling pages.
- Better empty states, loading states, and failure states across all modules.
- Reduced-motion support for ambient effects like breathing rail.

---

## Release roadmap

### Release 1: Core execution hardening

- Leads bulk actions, filters, saved views, and notes context.
- Dialer flow enforcement and queue intelligence.
- Tasks/Today smart triage improvements.
- Dashboard needs-attention widgets.
- Timesheet timer correctness fixes.

### Release 2: Deal intelligence

- Lead scoring and deep search.
- Opportunity health and next-best-action.
- Playground AI deal brief and comp ranking.
- Calculator strategy modes and MAO.
- Buyer structured buy boxes and match scoring.

### Release 3: Transaction and admin backbone

- Contracts generation and e-sign lifecycle.
- Documents / file vault.
- Properties and Companies pages.
- Settings control plane rebuild.
- Notifications event pipeline.

### Release 4: Automation and compliance

- Automation builder.
- Audit log.
- Compliance center.
- Integrations hub.
- Voice action playground mode.

### Release 5: Team performance and management

- Timesheet compensation engine.
- Commission ledger.
- Payroll summaries and approvals.
- Analytics trust layer and rep performance dashboards.

---

## Senior developer build prompt

You are the senior full-stack architect and product engineer responsible for upgrading CRM Luxe into a production-grade real estate operating system.

Context:
- Existing app already contains modules for Leads, Opportunities, Playground, Campaigns, RVM, Field Mode, Phone, Dialer, Buyers, Contracts, Analytics, Calculator, Dashboard, Calendar, Tasks, Today, Timesheet, Notifications, Contacts, Settings, and an XP Admin workflow.[cite:1]
- Many modules already have useful structural scaffolding, but several still lack production-grade workflow depth, data trust, record linking, automation, and admin governance.[cite:1]
- The CRM must support acquisitions, dispo, calling, outreach, underwriting, transactions, operations, and internal team performance management.[cite:1]

Your mission:
1. Use this PRD as the canonical source of truth for product direction.
2. Refactor existing modules before replacing them unless the architecture is fundamentally broken.
3. Build missing backbone systems: Properties, Companies, Documents, Automations, Audit Log, Compliance Center, Integrations Hub.
4. Prioritize data integrity, bulk workflow speed, explainable AI, and role-aware UX.
5. Optimize for high-volume real estate investor workflows, multi-user collaboration, and future multi-tenant SaaS architecture.

Execution requirements:
- Return architecture decisions before implementation starts.
- Define database schema additions and migrations first.
- Define shared entity-linking patterns across the app.
- Standardize timeline/activity models across leads, contacts, opportunities, contracts, and communications.
- Build AI systems with preview/confirm/log/undo safeguards.
- Add URL-driven filters, saved views, and drill-through behavior where relevant.
- Add compliance-aware gating for phone, SMS, campaign, and RVM actions.
- Add test coverage for scoring, timer math, payout math, automations, and role permissions.

Output expectations for implementation planning:
- Architecture overview
- Schema definitions
- API/server actions
- Queue/job design
- Component architecture
- Role/permission matrix
- Event model
- Audit/compliance model
- Release-by-release implementation plan
- QA and regression checklist

## Final product standard

The upgraded CRM Luxe should feel like one coherent operating system where:
- Leads identify who matters.
- Playground forms conviction.
- Opportunity drives execution.
- Dialer and Campaigns drive outreach.
- Buyers drive disposition.
- Contracts drive formal transaction flow.
- Tasks, Today, Calendar, and Notifications route attention.
- Dashboard and Analytics reveal truth.
- Timesheet and Compensation reveal labor and payout reality.
- Settings, Automations, Audit, and Compliance govern the system.

That is the standard this upgrade cycle should target.
