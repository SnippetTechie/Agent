#!/usr/bin/env bash
# =============================================================================
# V.A.R.M.A — 24/7 Production All-in-One Server Runner
#
# Runs both:
#   1. vLLM with gemma-4-12b-it on Port 8000
#   2. V.A.R.M.A Receiver on Port 8002 (bound to 0.0.0.0 for external clients)
#
# Features:
#   - 24/7 process supervision: auto-restarts either service if it dies
#   - Auto-detects local model paths or downloads from HuggingFace
#   - Writes rotating, timestamped logs to logs/vllm.log and logs/receiver.log
#   - Graceful shutdown handler for systemd and SIGINT/SIGTERM
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
export MAX_MODEL_LEN="${MAX_MODEL_LEN:-4096}"

# Recommended CUDA & vLLM optimizations for Gemma / Ampere
export VLLM_USE_V1="${VLLM_USE_V1:-0}"
export VLLM_ATTENTION_BACKEND="${VLLM_ATTENTION_BACKEND:-FLASH_ATTN}"
export CCCL_IGNORE_DEPRECATED_CUDA_BELOW_12=1

# --- Locate Model Path ---
MODEL_PATH="${MODEL_PATH:-}"
CANDIDATE_PATHS=(
    "${MODEL_PATH}"
    "${HOME}/pe-x1/models/gemma-4-12b-it"
    "${HOME}/models/gemma-4-12b-it"
    "${ROOT_DIR}/models/gemma-4-12b-it"
    "/models/gemma-4-12b-it"
    "google/gemma-4-12b-it"
)

RESOLVED_MODEL=""
for p in "${CANDIDATE_PATHS[@]}"; do
    if [ -n "$p" ] && [ -d "$p" ]; then
        RESOLVED_MODEL="$p"
        break
    fi
done

if [ -z "$RESOLVED_MODEL" ]; then
    RESOLVED_MODEL="${MODEL_PATH:-google/gemma-4-12b-it}"
fi

echo "================================================================="
echo "  V.A.R.M.A 24/7 Production Runner"
echo "================================================================="
echo "  Model               : ${RESOLVED_MODEL}"
echo "  vLLM Engine Port    : ${VLLM_PORT}"
echo "  Receiver API Port   : ${RECEIVER_PORT} (Host: ${RECEIVER_HOST})"
echo "  Logs Directory      : ${LOGS_DIR}"
echo "================================================================="

# --- Cleanup Trap ---
cleanup() {
    echo ""
    echo "[!] Caught shutdown signal! Stopping child processes..."
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

start_vllm() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting vLLM server on port ${VLLM_PORT}..."
    vllm serve "${RESOLVED_MODEL}" \
        --port "${VLLM_PORT}" \
        --host "${VLLM_HOST}" \
        --gpu-memory-utilization "${GPU_MEMORY_UTILIZATION}" \
        --max-model-len "${MAX_MODEL_LEN}" \
        --trust-remote-code \
        --dtype bfloat16 \
        >> "${LOGS_DIR}/vllm.log" 2>&1 &
    PID_VLLM=$!
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] vLLM started with PID ${PID_VLLM}"
}

start_receiver() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting V.A.R.M.A receiver on port ${RECEIVER_PORT}..."
    python3 scripts/start_server.py >> "${LOGS_DIR}/receiver.log" 2>&1 &
    PID_RECEIVER=$!
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Receiver started with PID ${PID_RECEIVER}"
}

# --- 1. Start vLLM ---
start_vllm

echo "[*] Waiting for vLLM to warm up and load weights into GPU VRAM..."
RETRIES=150
COUNT=0
VLLM_READY=0
while [ $COUNT -lt $RETRIES ]; do
    if curl -s "http://127.0.0.1:${VLLM_PORT}/health" >/dev/null 2>&1 || curl -s "http://127.0.0.1:${VLLM_PORT}/v1/models" >/dev/null 2>&1; then
        VLLM_READY=1
        echo ""
        echo "[✓] vLLM is healthy and serving ${RESOLVED_MODEL} on port ${VLLM_PORT}!"
        break
    fi
    # Check if process died early
    if ! kill -0 "$PID_VLLM" 2>/dev/null; then
        echo ""
        echo "[ERROR] vLLM process died unexpectedly during startup! Check logs/vllm.log:"
        tail -n 25 "${LOGS_DIR}/vllm.log"
        exit 1
    fi
    sleep 3
    COUNT=$((COUNT + 1))
    echo -n "."
done

if [ $VLLM_READY -eq 0 ]; then
    echo ""
    echo "[ERROR] Timed out waiting for vLLM to become healthy."
    exit 1
fi

# --- 2. Start Receiver ---
start_receiver

echo "[*] Verifying receiver health on port ${RECEIVER_PORT}..."
sleep 3
if curl -s "http://127.0.0.1:${RECEIVER_PORT}/health" >/dev/null 2>&1; then
    echo "[✓] Receiver is healthy and reachable on http://${RECEIVER_HOST}:${RECEIVER_PORT}!"
else
    echo "[!] Receiver is starting up, continuing to monitor..."
fi

# Discover public/local IP for display
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
    if ! kill -0 "$PID_VLLM" 2>/dev/null; then
        echo "[ALERT $(date '+%Y-%m-%d %H:%M:%S')] vLLM exited! Auto-restarting in 3 seconds..."
        sleep 3
        start_vllm
    fi

    if ! kill -0 "$PID_RECEIVER" 2>/dev/null; then
        echo "[ALERT $(date '+%Y-%m-%d %H:%M:%S')] Receiver exited! Auto-restarting in 2 seconds..."
        sleep 2
        start_receiver
    fi

    sleep 5
done
