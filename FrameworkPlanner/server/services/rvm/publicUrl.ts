/**
 * Public origin of this deployment, used wherever a URL must be reachable by
 * an external party (Telnyx webhook payloads, signed media links, e-mail
 * links). APP_URL wins; PORT defaults to 3000 for local runs.
 */
export const APP_PUBLIC_URL: string = (
  process.env.APP_URL ||
  process.env.PUBLIC_URL ||
  (process.env.PORT ? `http://localhost:${process.env.PORT}` : "http://localhost:3000")
).replace(/\/$/, "");
