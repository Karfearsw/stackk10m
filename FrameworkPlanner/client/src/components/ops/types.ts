export type OpsAgentStatus = "online" | "offline" | "unhealthy";

export type OpsAgentMetrics = {
  cpuPercent?: number | null;
  ramUsedMb?: number | null;
  ramTotalMb?: number | null;
  diskUsedMb?: number | null;
  diskTotalMb?: number | null;
  uptimeSeconds?: number | null;
  hermesStatus?: string | null;
  ollamaStatus?: string | null;
  model?: string | null;
  reportedAt?: string | null;
};

export type OpsAgent = {
  id: number;
  teamId: number;
  teamName?: string | null;
  slug: string;
  displayName: string;
  hostname?: string | null;
  provider?: string | null;
  region?: string | null;
  environment: string;
  agentType: string;
  model?: string | null;
  expectedHeartbeatIntervalSeconds: number;
  lastStatus: OpsAgentStatus;
  lastHeartbeatAt?: string | null;
  lastError?: string | null;
  lastTask?: string | null;
  latestMetricsJson?: OpsAgentMetrics | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
};

export type OpsAgentHeartbeat = {
  id: number;
  agentId: number;
  reportedAt: string;
  receivedAt: string;
  status: OpsAgentStatus;
  cpuPercent?: number | null;
  ramUsedMb?: number | null;
  ramTotalMb?: number | null;
  diskUsedMb?: number | null;
  diskTotalMb?: number | null;
  uptimeSeconds?: number | null;
  hermesStatus?: string | null;
  ollamaStatus?: string | null;
  model?: string | null;
  latestTask?: string | null;
  lastError?: string | null;
};

export type OpsAgentListResponse = {
  items: OpsAgent[];
  total: number;
};

export type OpsAgentDetailResponse = {
  agent: OpsAgent;
  recentHeartbeats: OpsAgentHeartbeat[];
};

export type TeamOption = {
  id: number;
  name: string;
};
