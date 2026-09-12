#!/usr/bin/env bash
# =============================================================================
# V.A.R.M.A — Instant Receiver Restart
#
# Restarts ONLY the Python Receiver (port 8002) in < 1 second.
# Preserves the running Gemma model (port 8000) so you don't wait 2 minutes
# for weights to reload!
#
# Usage:
#   bash scripts/restart_receiver.sh
# =============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

mkdir -p "${ROOT_DIR}/logs"

echo "[*] Restarting V.A.R.M.A receiver on port 8002..."

# 1. Kill existing receiver process
pkill -f "start_server.py" 2>/dev/null || true
pkill -f "receiver.py" 2>/dev/null || true
if command -v fuser >/dev/null 2>&1; then
    fuser -k "8002/tcp" 2>/dev/null || true
fi
sleep 1

# 2. Detect Python binary
PYTHON_BIN="python3"
if [ -f "${ROOT_DIR}/.venv/bin/python" ]; then
    PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"
elif [ -f "${HOME}/pe-x1/vllm-env/bin/python" ]; then
    PYTHON_BIN="${HOME}/pe-x1/vllm-env/bin/python"
fi

# 3. Start receiver in background
nohup $PYTHON_BIN scripts/start_server.py >> "${ROOT_DIR}/logs/receiver.log" 2>&1 &
REC_PID=$!
echo "[*] Receiver started (PID: $REC_PID). Verifying health..."

# 4. Wait for health check
COUNT=0
while [ $COUNT -lt 15 ]; do
    if curl -s "http://127.0.0.1:8002/health" >/dev/null 2>&1; then
        echo "[✓] Receiver is LIVE on port 8002!"
        curl -s "http://127.0.0.1:8002/health" | grep -o '"status":"ok"' || true
        exit 0
    fi
    sleep 1
    COUNT=$((COUNT + 1))
    echo -n "."
done

echo ""
echo "[!] Check logs/receiver.log for details:"
tail -n 20 "${ROOT_DIR}/logs/receiver.log"
