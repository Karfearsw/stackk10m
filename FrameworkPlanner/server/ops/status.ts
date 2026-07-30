type ServiceStatus = string | null | undefined;

function isRunning(status: ServiceStatus) {
  return String(status || "").trim().toLowerCase() === "running";
}

export function getOpsAgentAgeSeconds(lastHeartbeatAt: Date | string | null | undefined, now = new Date()) {
  if (!lastHeartbeatAt) return Number.POSITIVE_INFINITY;
  const value = lastHeartbeatAt instanceof Date ? lastHeartbeatAt : new Date(String(lastHeartbeatAt));
  const diffMs = now.getTime() - value.getTime();
  if (!Number.isFinite(diffMs)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor(diffMs / 1000));
}

export function computeOpsAgentStatus(input: {
  lastHeartbeatAt?: Date | string | null;
  reportedStatus?: string | null;
  hermesStatus?: ServiceStatus;
  ollamaStatus?: ServiceStatus;
  lastError?: string | null;
  now?: Date;
}) {
  const ageSeconds = getOpsAgentAgeSeconds(input.lastHeartbeatAt, input.now);
  if (ageSeconds > 180) return "offline" as const;

  const reportedStatus = String(input.reportedStatus || "online").trim().toLowerCase();
  const hasError = Boolean(String(input.lastError || "").trim());
  if (reportedStatus !== "online" || !isRunning(input.hermesStatus) || !isRunning(input.ollamaStatus) || hasError) {
    return "unhealthy" as const;
  }

  return "online" as const;
}
