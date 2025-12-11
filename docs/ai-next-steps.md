# AI Implementation Next Steps

## Overview
- Provider: SignalWire
- Goal: Introduce an AI service layer with environment-driven configuration, health checks, and preview-ready endpoints.

## Step-by-Step Actions
- Define environment variables: `SIGNALWIRE_SPACE_URL`, `SIGNALWIRE_PROJECT_ID`, `SIGNALWIRE_API_TOKEN`.
- Add backend readiness endpoints: `GET /api/ai/config`, `GET /api/ai/ping`.
- Implement provider abstraction (future): `AiProvider` interface with SignalWire implementation.
- Add client integration (future): lightweight UI to display AI readiness and trigger ping.
- Establish error handling and metrics for AI requests.
- Document deployment configuration for production.

## Configuration
- Place values in `.env` locally and in deployment environment settings.
- Do not log secrets; only report readiness booleans.

## Rollout Plan
- Phase 1: Config + readiness endpoints + tests.
- Phase 2: Provider adapter and basic inference.
- Phase 3: Full UI integration and workflows.

