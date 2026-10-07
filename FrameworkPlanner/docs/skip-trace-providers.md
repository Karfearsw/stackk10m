# Skip Trace Providers — Provider-Agnostic Enrichment (Ticket 5)

**STATUS: IMPLEMENTED.** Skip tracing is no longer written against one vendor:
providers register a descriptor, the selected provider runs first, and a provider
that cannot return contacts falls back to the next configured one instead of
failing the job.

## Registered providers

Registry: `server/services/skipTrace/provider.ts` (single source of truth).

| Slug | Label | Kind | Requires | Typical cost |
| --- | --- | --- | --- | --- |
| `free-web` *(default)* | Free public-web research | `web_research` | nothing | free |
| `enformiongo` | EnformionGO | `commercial` | `ENFORMION_AP_NAME`, `ENFORMION_AP_PASSWORD` | `ENFORMION_COST_CENTS` per lookup |

`free-web` is the agentic public-records researcher (US Census geocoder + public
search engines). Every hit is backed by recorded evidence; a miss stays a miss.
The former `mock`/`demo`/`test` provider stays deleted — fabricated phone numbers
and `@example.com` emails must never reach production data.

## Configuration

| Variable | Meaning |
| --- | --- |
| `SKIP_TRACE_PROVIDER` | Selected provider slug (or alias: `enformion`, `free_web`, `web`, …). Defaults to `free-web`. Unknown or synthetic values throw. |
| `SKIP_TRACE_PROVIDER_FALLBACKS` | Comma-separated slugs tried, in order, after the selected provider. An unknown slug throws rather than being silently skipped. |
| `ENFORMION_AP_NAME` / `ENFORMION_AP_PASSWORD` | EnformionGO credentials. Missing values make that provider report `configured: false` with a blocker instead of failing a lookup. |
| `ENFORMION_API_BASE_URL` | Optional EnformionGO endpoint override. |
| `ENFORMION_COST_CENTS` | Per-lookup cost accounting for the commercial provider. |

## Chain semantics

1. **Selected provider first.** `SKIP_TRACE_PROVIDER` (default `free-web`).
2. **Requested fallbacks**, in the order written in `SKIP_TRACE_PROVIDER_FALLBACKS`.
3. **Automatic last resort** for descriptors that opt in with `autoFallback: true`.
   Only the cost-free `free-web` provider sets this — **a paid vendor is never
   billed without an explicit opt-in**.
4. Unconfigured providers are dropped from the chain, so a missing credential
   never blocks a lookup another provider can serve. If nothing in the chain is
   configured, the selected provider is returned alone so the user sees its
   specific blocker.

The resolved chain is recorded on every job: `skip_trace_job_events` gets a
`provider_requested` event carrying `providerChain`, each failed attempt logs
`provider_fail`, and a hand-off logs `provider_fallback`. The successful provider
is stored on `skip_trace_results.provider_name` and on the job row, so results
are always attributable to the source that produced them.

## Adding a provider

Register a descriptor — no orchestrator changes:

```ts
registerSkipTraceProvider({
  slug: "acme",
  label: "Acme People Data",
  kind: "commercial",
  description: "Higher contact coverage for rural addresses.",
  costPerLookupCents: 25,
  requiresEnv: ["ACME_API_KEY"],
  isConfigured: () => Boolean(process.env.ACME_API_KEY),
  blocker: () => (process.env.ACME_API_KEY ? null : "Missing: ACME_API_KEY."),
  create: () => new AcmeSkipTraceProvider(),
});
```

A duplicate slug throws unless `{ replace: true }` is passed, and the descriptor
must supply `label`, `description`, `create()`, and `isConfigured()`.

## Surfaces

| Surface | Behavior |
| --- | --- |
| `GET /api/skip-trace/config` | Feature-gated; returns `providerName`, `providers[]`, `providerChain[]`, `publicResearchEnabled`, `allowedModes`. |
| `GET /api/skip-trace/providers` | Provider catalog: `activeProvider`, `chain[]`, `providers[]` with `configured`, `selected`, `chainIndex`, `missingEnv`, `costPerLookupCents`, `blocker`. |
| `GET /api/system-health` | `skip_trace` module row reports `Providers ready: … (chain: …)` or the selected provider's blocker. |
| `getProviderReadiness()` | New `skipTrace` section with the same provider list; contributes to `overallStatus`. |

No schema change was needed for this ticket: `skip_trace_results.provider_name`
and `skip_trace_jobs.provider_name` already store a free-form provider id.

## Tests

`tests/skip-trace-providers.test.ts` (16 tests): registry contents, aliases,
default selection, synthetic/unknown rejection, chain resolution (default,
configured paid + free fallback, explicit fallback order, unconfigured paid
provider, unknown fallback), per-chain instance construction, status reporting,
and custom provider registration/validation.
