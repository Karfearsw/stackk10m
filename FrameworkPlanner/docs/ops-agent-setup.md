# Ops Agent Setup

Use this for the first Hermes VPS before onboarding more agents into the control plane.

## Goal

- Keep one Hermes + Ollama VPS stable for 24 hours.
- Send a signed heartbeat every 60 seconds to `/api/ops/agents/heartbeat`.
- Capture OOM and restart evidence without manual SSH debugging every time.

## 1. Keep The Model Small

Use one intentionally small local model first:

```bash
ollama pull tinyllama
```

Set the active model in `/etc/default/ops-agent`:

```bash
sudo tee /etc/default/ops-agent >/dev/null <<'EOF'
OPS_AGENT_ID=hermes-orlando-01
OPS_HEARTBEAT_URL=https://ops.yourdomain.com/api/ops/agents/heartbeat
OPS_HEARTBEAT_SECRET=replace-with-secret-from-dashboard
OLLAMA_MODEL=tinyllama
OPS_LATEST_TASK_FILE=/var/lib/ops-agent/latest-task.txt
EOF
```

## 2. Enable Swap

If the VPS is low memory, add swap before trusting uptime:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
swapon --show
free -m
```

## 3. Install Deploy Artifacts

Copy the repo artifacts into place:

```bash
sudo install -m 0755 deploy/ops-agent/agent-health.sh /usr/local/bin/agent-health.sh
sudo install -m 0755 deploy/ops-agent/capture-oom-logs.sh /usr/local/bin/capture-oom-logs.sh
sudo install -m 0644 deploy/ops-agent/hermes.service /etc/systemd/system/hermes.service
sudo install -m 0644 deploy/ops-agent/agent-heartbeat.service /etc/systemd/system/agent-heartbeat.service
sudo install -m 0644 deploy/ops-agent/agent-heartbeat.timer /etc/systemd/system/agent-heartbeat.timer
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo install -m 0644 deploy/ops-agent/ollama.service.d/override.conf /etc/systemd/system/ollama.service.d/override.conf
```

## 4. Configure Hermes

Place Hermes runtime settings in `/etc/default/hermes` and your Hermes config in `/etc/hermes/config.yaml`.

Example:

```bash
sudo mkdir -p /etc/hermes
sudo tee /etc/default/hermes >/dev/null <<'EOF'
PATH=/usr/local/bin:/usr/bin:/bin
EOF
```

Update the `ExecStart` path in `deploy/ops-agent/hermes.service` if your Hermes binary lives elsewhere.

## 5. Enable Services

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ollama.service
sudo systemctl enable --now hermes.service
sudo systemctl enable --now agent-heartbeat.timer
```

Verify:

```bash
systemctl status ollama.service --no-pager
systemctl status hermes.service --no-pager
systemctl status agent-heartbeat.timer --no-pager
```

## 6. Test The Heartbeat

Run one heartbeat manually:

```bash
sudo /usr/local/bin/agent-health.sh
```

You should then see the server appear in the Agent Control Plane within one refresh cycle.

## 7. Capture OOM Evidence

If the VPS goes down or Hermes disappears:

```bash
sudo /usr/local/bin/capture-oom-logs.sh
```

Also inspect:

```bash
journalctl -u hermes.service -n 100 --no-pager
journalctl -u ollama.service -n 100 --no-pager
journalctl -k --no-pager | grep -Ei 'oom|killed process|out of memory'
```

## 8. Burn-In Checklist

- Heartbeats stay fresh for 24 hours.
- `tinyllama` is the only active model.
- Swap remains enabled.
- `systemd` restarts Hermes and Ollama cleanly.
- No repeated OOM events appear in kernel logs.
