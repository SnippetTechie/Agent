#!/usr/bin/env bash
# =============================================================================
# V.A.R.M.A — 24/7 Production All-in-One Server Runner
#
# Runs:
#   1. Gemma Model via ~/pe-x1/launch_gemma4.sh (or vLLM fallback) on Port 8000
#   2. V.A.R.M.A Receiver on Port 8002 (bound to 0.0.0.0 for external clients)
#
# 24/7 Supervision: monitors both processes and auto-restarts if either crashes.
# =============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

LOGS_DIR="${ROOT_DIR}/logs"
mkdir -p "${LOGS_DIR}"

# --- Configuration & Defaults ---
export RECEIVER_HOST="${RECEIVER_HOST:-0.0.0.0}"
export RECEIVER_PORT="${RECEIVER_PORT:-8002}"
export VLLM_HOST="${VLLM_HOST:-0.0.0.0}"
export VLLM_PORT="${VLLM_PORT:-8000}"
export VLLM_BASE_URL="http://127.0.0.1:${VLLM_PORT}/v1"
export VLLM_MODEL="${VLLM_MODEL:-gemma-4-12b-it}"
export MODELS="${VLLM_MODEL}"
export MODEL_VISION="${VLLM_MODEL}"
export GROUNDING_BASE_URL="http://127.0.0.1:${VLLM_PORT}/v1"
export GROUNDING_MODEL="${VLLM_MODEL}"
export GPU_MEMORY_UTILIZATION="${GPU_MEMORY_UTILIZATION:-0.85}"
export MAX_MODEL_LEN="${MAX_MODEL_LEN:-8192}"
export MAX_NUM_SEQS="${MAX_NUM_SEQS:-32}"

# Check for custom Gemma launcher script in ~/pe-x1
GEMMA_LAUNCHER="${GEMMA_LAUNCHER:-${HOME}/pe-x1/launch_gemma4.sh}"

echo "================================================================="
echo "  V.A.R.M.A 24/7 Production Runner"
echo "================================================================="
if [ -f "$GEMMA_LAUNCHER" ]; then
    echo "  Gemma Launcher      : ${GEMMA_LAUNCHER} (Custom script detected)"
else
    echo "  Gemma Launcher      : vllm serve google/gemma-4-12b-it"
fi
echo "  vLLM Engine Port    : ${VLLM_PORT}"
echo "  Receiver API Port   : ${RECEIVER_PORT} (Host: ${RECEIVER_HOST})"
echo "  Logs Directory      : ${LOGS_DIR}"
echo "  Max Context Length  : ${MAX_MODEL_LEN}"
echo "  Max Concurrent Seqs : ${MAX_NUM_SEQS}"
echo "================================================================="

PID_VLLM=""
PID_RECEIVER=""

cleanup() {
    echo ""
    echo "[*] Stopping V.A.R.M.A production services..."
    if [ -n "${PID_RECEIVER:-}" ] && kill -0 "$PID_RECEIVER" 2>/dev/null; then
        kill -TERM "$PID_RECEIVER" 2>/dev/null || true
    fi
    if [ -n "${PID_VLLM:-}" ] && kill -0 "$PID_VLLM" 2>/dev/null; then
        kill -TERM "$PID_VLLM" 2>/dev/null || true
    fi
    sleep 2
    echo "[✓] All processes stopped."
    exit 0
}
trap cleanup INT TERM

is_vllm_healthy() {
    curl -s "http://127.0.0.1:${VLLM_PORT}/health" >/dev/null 2>&1 || \
    curl -s "http://127.0.0.1:${VLLM_PORT}/v1/models" >/dev/null 2>&1
}

start_vllm() {
    if is_vllm_healthy; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] vLLM is ALREADY running on port ${VLLM_PORT}! Reusing existing instance."
        return 0
    fi

    if [ -f "$GEMMA_LAUNCHER" ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting Gemma via ${GEMMA_LAUNCHER}..."
        (cd "${HOME}/pe-x1" && bash "$GEMMA_LAUNCHER") >> "${LOGS_DIR}/vllm.log" 2>&1 &
        PID_VLLM=$!
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting vLLM server on port ${VLLM_PORT}..."
        vllm serve google/gemma-4-12b-it \
            --port "${VLLM_PORT}" \
            --host "${VLLM_HOST}" \
            --gpu-memory-utilization "${GPU_MEMORY_UTILIZATION}" \
            --max-model-len "${MAX_MODEL_LEN}" \
            --max-num-seqs "${MAX_NUM_SEQS}" \
            --trust-remote-code \
            --dtype bfloat16 \
            >> "${LOGS_DIR}/vllm.log" 2>&1 &
        PID_VLLM=$!
    fi
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Model process started with PID ${PID_VLLM}"
}

start_receiver() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting V.A.R.M.A receiver on port ${RECEIVER_PORT}..."
    python3 scripts/start_server.py >> "${LOGS_DIR}/receiver.log" 2>&1 &
    PID_RECEIVER=$!
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Receiver started with PID ${PID_RECEIVER}"
}

# --- 1. Start vLLM Model ---
start_vllm

echo "[*] Waiting for Gemma model to be ready on port ${VLLM_PORT}..."
RETRIES=150
COUNT=0
VLLM_READY=0
while [ $COUNT -lt $RETRIES ]; do
    if is_vllm_healthy; then
        VLLM_READY=1
        echo ""
        echo "[✓] Gemma model is LIVE and responding on port ${VLLM_PORT}!"
        break
    fi
    if [ -n "$PID_VLLM" ] && ! kill -0 "$PID_VLLM" 2>/dev/null; then
        echo ""
        echo "[ERROR] Model process exited! Check logs/vllm.log:"
        tail -n 25 "${LOGS_DIR}/vllm.log"
        exit 1
    fi
    sleep 3
    COUNT=$((COUNT + 1))
    echo -n "."
done

if [ $VLLM_READY -eq 0 ]; then
    echo ""
    echo "[ERROR] Timed out waiting for Gemma on port ${VLLM_PORT}."
    exit 1
fi

# --- 2. Start Receiver Server ---
start_receiver

echo "[*] Verifying receiver health on port ${RECEIVER_PORT}..."
sleep 3
if curl -s "http://127.0.0.1:${RECEIVER_PORT}/health" >/dev/null 2>&1; then
    echo "[✓] Receiver is healthy and reachable on http://${RECEIVER_HOST}:${RECEIVER_PORT}!"
else
    echo "[*] Receiver starting up..."
fi

SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "your-server-ip")

echo ""
echo "================================================================="
echo "  V.A.R.M.A 24/7 SERVER IS LIVE!"
echo "================================================================="
echo "  External clients can connect via:"
echo "    HTTP: http://${SERVER_IP}:${RECEIVER_PORT}"
echo "    WS  : ws://${SERVER_IP}:${RECEIVER_PORT}/ws/agent"
echo ""
echo "  Tail logs in real-time:"
echo "    tail -f ${LOGS_DIR}/receiver.log"
echo "    tail -f ${LOGS_DIR}/vllm.log"
echo "================================================================="
echo "  Monitoring processes for 24/7 uptime. Press Ctrl+C to stop."
echo ""

# --- 3. 24/7 Supervisor Loop ---
while true; do
    if ! is_vllm_healthy; then
        echo "[ALERT $(date '+%Y-%m-%d %H:%M:%S')] Model on port ${VLLM_PORT} unreachable! Restarting..."
        start_vllm
    fi

    if [ -n "$PID_RECEIVER" ] && ! kill -0 "$PID_RECEIVER" 2>/dev/null; then
        echo "[ALERT $(date '+%Y-%m-%d %H:%M:%S')] Receiver exited! Auto-restarting in 2 seconds..."
        sleep 2
        start_receiver
    fi

    sleep 5
done