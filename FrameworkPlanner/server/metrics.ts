import client from "prom-client";

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: "fp_" });

export const httpRequestsTotal = new client.Counter({
  name: "fp_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "path", "status"],
  registers: [register],
});

export const httpErrorsTotal = new client.Counter({
  name: "fp_http_errors_total",
  help: "Total number of HTTP 5xx errors",
  labelNames: ["path", "status"],
  registers: [register],
});

export async function metricsText() {
  return await register.metrics();
}
