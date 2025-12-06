import * as Sentry from "@sentry/node";
import { ProfilingIntegration } from "@sentry/integrations";

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    integrations: [new ProfilingIntegration()],
  });
}

export { Sentry };
