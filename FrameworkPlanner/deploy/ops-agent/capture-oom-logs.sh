#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${OPS_OOM_LOG_DIR:-/var/log/ops-agent}"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
OUT_FILE="$OUT_DIR/oom-bundle-$STAMP.log"

{
  echo "==== TIMESTAMP ===="
  date -u
  echo

  echo "==== FREE -M ===="
  free -m
  echo

  echo "==== SWAP ===="
  swapon --show
  echo

  echo "==== OOM KERNEL LOGS ===="
  journalctl -k --no-pager | grep -Ei 'oom|killed process|out of memory' || true
  echo

  echo "==== HERMES LOGS ===="
  journalctl -u hermes.service -n 200 --no-pager || true
  echo

  echo "==== OLLAMA LOGS ===="
  journalctl -u ollama.service -n 200 --no-pager || true
} >"$OUT_FILE"

echo "Wrote $OUT_FILE"
