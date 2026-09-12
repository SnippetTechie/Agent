#!/usr/bin/env bash
# =============================================================================
# V.A.R.M.A — Start 24/7 Server in Background (Detached Mode)
#
# Starts both Gemma model (:8000) and Receiver (:8002) in the background.
# Waits until both are 100% healthy, then returns you to your terminal prompt!
#
# Usage:
#   bash scripts/start_detached.sh
# =============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

mkdir -p "${ROOT_DIR}/logs"

echo "================================================================="
echo "  Starting V.A.R.M.A in Background (24/7 Mode)"
echo "================================================================="

# Start runner in background with nohup
nohup bash "${ROOT_DIR}/scripts/start_production_247.sh" > "${ROOT_DIR}/logs/runner.log" 2>&1 &
RUNNER_PID=$!
echo "[*] Supervisor process running in background (PID: $RUNNER_PID)"
echo "[*] Waiting for Model (:8000) and Receiver (:8002) to become healthy..."

COUNT=0
MAX_WAIT=180

while [ $COUNT -lt $MAX_WAIT ]; do
    if curl -s "http://127.0.0.1:8002/health" >/dev/null 2>&1; then
        SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "your-server-ip")
        echo ""
        echo "================================================================="
        echo "  SUCCESS: Both Gemma Model and Receiver are running in background!"
        echo "================================================================="
        echo "  vLLM Engine  : http://0.0.0.0:8000"
        echo "  Receiver API : http://${SERVER_IP}:8002"
        echo "  WebSocket    : ws://${SERVER_IP}:8002/ws/agent"
        echo ""
        echo "  To view live logs anytime:"
        echo "    tail -f logs/receiver.log"
        echo "    tail -f logs/vllm.log"
        echo ""
        echo "  To stop the server anytime:"
        echo "    bash scripts/stop_production.sh"
        echo "================================================================="
        exit 0
    fi

    if ! kill -0 "$RUNNER_PID" 2>/dev/null; then
        echo ""
        echo "[ERROR] Supervisor process stopped unexpectedly. Last logs:"
        tail -n 25 "${ROOT_DIR}/logs/runner.log"
        exit 1
    fi

    sleep 3
    COUNT=$((COUNT + 1))
    echo -n "."
done

echo ""
echo "[!] Still warming up. You can check progress with: tail -f logs/vllm.log"