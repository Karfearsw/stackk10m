## Overview
The TypeScript errors indicate that `Sentry.Handlers` no longer exists in the installed `@sentry/node` (v8+ / v10). In newer SDKs, Express instrumentation replaces `Handlers.requestHandler` and `Handlers.errorHandler` with `Sentry.setupExpressErrorHandler(app)` and auto-instrumentation via OpenTelemetry.

## Changes
- Remove `app.use(Sentry.Handlers.requestHandler())` in `server/app.ts` (current line ~28).
- Replace `app.use(Sentry.Handlers.errorHandler())` with `Sentry.setupExpressErrorHandler(app)` (current line ~140), ensuring it runs after route registration and before our custom error middleware.
- Keep existing `initSentry()` and profiling integration; no change required for now.

## Code Edits
- File: `server/app.ts`
  - Delete:
    ```ts
    if (process.env.SENTRY_DSN) {
      app.use(Sentry.Handlers.requestHandler());
    }
    ```
  - Replace:
    ```ts
    if (process.env.SENTRY_DSN) {
      app.use(Sentry.Handlers.errorHandler());
    }
    ```
    with:
    ```ts
    if (process.env.SENTRY_DSN) {
      Sentry.setupExpressErrorHandler(app);
    }
    ```

## Validation
- Run `npm run build` to confirm TS errors are resolved.
- Start dev server and hit a route that throws (e.g., add a temporary `/debug-sentry` route) to verify events are captured in Sentry.
- Check Vercel build logs for successful compilation without TS2339.

## Notes
- Reference: Sentry migration guide for Express v7 → v8 (replaces Handlers APIs with `setupExpressErrorHandler`).
- Optional later enhancement: move `Sentry.init` to an early `instrument.ts` loaded before other imports, per v8+ best practices, though not required to fix the current error.
