#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${OPS_AGENT_ENV_FILE:-/etc/default/ops-agent}"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

: "${OPS_AGENT_ID:?OPS_AGENT_ID is required}"
: "${OPS_HEARTBEAT_URL:?OPS_HEARTBEAT_URL is required}"
: "${OPS_HEARTBEAT_SECRET:?OPS_HEARTBEAT_SECRET is required}"

sanitize() {
  printf '%s' "${1:-}" | tr '\n' ' ' | sed 's/"/\\"/g' | sed 's/[[:space:]]\+/ /g'
}

cpu_percent="$(top -bn1 | awk -F',' '/Cpu\(s\)/ {gsub(/%us/,"",$1); gsub(/ /,"",$1); print int($1)}' | head -n1)"
ram_used_mb="$(free -m | awk '/Mem:/ {print $3}')"
ram_total_mb="$(free -m | awk '/Mem:/ {print $2}')"
disk_used_mb="$(df -Pm / | awk 'NR==2 {print $3}')"
disk_total_mb="$(df -Pm / | awk 'NR==2 {print $2}')"
uptime_seconds="$(awk '{print int($1)}' /proc/uptime)"
hermes_status="$(systemctl is-active hermes.service 2>/dev/null || true)"
ollama_status="$(systemctl is-active ollama.service 2>/dev/null || true)"

model="${OLLAMA_MODEL:-}"
if [[ -z "$model" ]] && command -v ollama >/dev/null 2>&1; then
  model="$(ollama list 2>/dev/null | awk 'NR==2 {print $1}')"
fi
model="${model:-tinyllama}"

latest_task="idle"
if [[ -n "${OPS_LATEST_TASK_FILE:-}" && -f "${OPS_LATEST_TASK_FILE:-}" ]]; then
  latest_task="$(head -n1 "${OPS_LATEST_TASK_FILE}" || true)"
fi

last_error="$(journalctl -u hermes.service -u ollama.service -n 50 --no-pager 2>/dev/null | grep -Ei 'error|failed|oom|killed' | tail -n1 || true)"
reported_status="online"
if [[ "$hermes_status" != "active" || "$ollama_status" != "active" ]]; then
  reported_status="unhealthy"
fi

payload="$(cat <<JSON
{
  "agentId": "$(sanitize "$OPS_AGENT_ID")",
  "status": "$(sanitize "$reported_status")",
  "cpuPercent": ${cpu_percent:-0},
  "ramUsedMb": ${ram_used_mb:-0},
  "ramTotalMb": ${ram_total_mb:-0},
  "diskUsedMb": ${disk_used_mb:-0},
  "diskTotalMb": ${disk_total_mb:-0},
  "uptimeSeconds": ${uptime_seconds:-0},
  "ollama": "$(sanitize "$ollama_status")",
  "hermes": "$(sanitize "$hermes_status")",
  "model": "$(sanitize "$model")",
  "latestTask": "$(sanitize "$latest_task")",
  "lastError": "$(sanitize "$last_error")",
  "reportedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
JSON
)"

curl --fail --silent --show-error --max-time 10 \
  -H "Authorization: Bearer ${OPS_HEARTBEAT_SECRET}" \
  -H "Content-Type: application/json" \
  -X POST \
  --data "$payload" \
  "$OPS_HEARTBEAT_URL"
