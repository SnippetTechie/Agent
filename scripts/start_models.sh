#!/usr/bin/env bash
# =============================================================================
# V.A.R.M.A — Dual Model Launcher for 48GB RTX A6000 Server
#
# Launches two vLLM instances simultaneously:
#   Port 8000: Qwen2.5-VL-3B-Instruct  (Screen Intelligence & Perception) ~8GB VRAM
#   Port 8001: groundnext-7b           (Precision Mouse & Click Grounding) ~18GB VRAM
#
# Total VRAM: ~26GB / 48GB (leaving ~22GB buffer)
# =============================================================================

set -euo pipefail

MODELS_DIR="${HOME}/pe-x1/models"
LOGS_DIR="${HOME}/pe-x1/logs"
mkdir -p "$LOGS_DIR"

MODEL_REASONING="${MODEL_REASONING:-${MODELS_DIR}/Qwen2.5-VL-3B-Instruct}"
MODEL_GROUNDING="${MODEL_GROUNDING:-${MODELS_DIR}/groundnext-7b}"

echo "================================================================="
echo "  V.A.R.M.A Dual Model Launcher (RTX A6000 48GB)"
echo "================================================================="
echo "  Model 1 (Reasoning / Port 8000): ${MODEL_REASONING}"
echo "  Model 2 (Grounding / Port 8001): ${MODEL_GROUNDING}"
echo "  Logs Directory                 : ${LOGS_DIR}"
echo "================================================================="

# --- 1. Validate Model Paths ---
if [ ! -d "$MODEL_REASONING" ]; then
    echo "ERROR: Reasoning model directory not found: $MODEL_REASONING"
    exit 1
fi

if [ ! -d "$MODEL_GROUNDING" ]; then
    echo "ERROR: Grounding model directory not found: $MODEL_GROUNDING"
    exit 1
fi

# --- 2. Clean Existing Ports ---
echo "[*] Clearing ports 8000 and 8001 if in use..."
for PORT in 8000 8001; do
    if command -v fuser >/dev/null 2>&1; then
        fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
    elif command -v lsof >/dev/null 2>&1; then
        lsof -ti :$PORT | xargs kill -9 >/dev/null 2>&1 || true
    fi
done
sleep 2

# --- 3. Launch Process Cleanup Trap ---
cleanup() {
    echo ""
    echo "[*] Shutting down vLLM servers..."
    if [ -n "${PID_8000:-}" ] && kill -0 "$PID_8000" 2>/dev/null; then
        kill "$PID_8000" 2>/dev/null || true
    fi
    if [ -n "${PID_8001:-}" ] && kill -0 "$PID_8001" 2>/dev/null; then
        kill "$PID_8001" 2>/dev/null || true
    fi
    wait 2>/dev/null || true
    echo "[*] Both vLLM processes stopped."
    exit 0
}

trap cleanup INT TERM EXIT

# --- 4. Start Model 1 (Reasoning: Qwen2.5-VL-3B on :8000) ---
echo "[1/2] Starting Reasoning Model (Qwen2.5-VL-3B) on port 8000..."
vllm serve "$MODEL_REASONING" \
    --port 8000 \
    --host 0.0.0.0 \
    --gpu-memory-utilization 0.35 \
    --max-model-len 4096 \
    --trust-remote-code \
    --dtype bfloat16 \
    > "${LOGS_DIR}/vllm_8000.log" 2>&1 &
PID_8000=$!
echo "      Started process PID: $PID_8000 (Log: ${LOGS_DIR}/vllm_8000.log)"

# --- 5. Start Model 2 (Grounding: groundnext-7b on :8001) ---
echo "[2/2] Starting Grounding Model (groundnext-7b) on port 8001..."
vllm serve "$MODEL_GROUNDING" \
    --port 8001 \
    --host 0.0.0.0 \
    --gpu-memory-utilization 0.45 \
    --max-model-len 4096 \
    --trust-remote-code \
    --dtype bfloat16 \
    > "${LOGS_DIR}/vllm_8001.log" 2>&1 &
PID_8001=$!
echo "      Started process PID: $PID_8001 (Log: ${LOGS_DIR}/vllm_8001.log)"

# --- 6. Wait for Readiness ---
echo ""
echo "[*] Waiting for both models to warm up and load weights into VRAM..."

wait_for_port() {
    local PORT=$1
    local NAME=$2
    local RETRIES=120
    local COUNT=0
    while [ $COUNT -lt $RETRIES ]; do
        if curl -s "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1 || curl -s "http://127.0.0.1:${PORT}/v1/models" >/dev/null 2>&1; then
            echo "  [READY] $NAME is listening on port $PORT!"
            return 0
        fi
        sleep 2
        COUNT=$((COUNT + 1))
        echo -n "."
    done
    echo ""
    echo "ERROR: Timeout waiting for $NAME on port $PORT to become ready."
    return 1
}

wait_for_port 8000 "Reasoning (Qwen2.5-VL-3B)"
wait_for_port 8001 "Grounding (groundnext-7b)"

echo ""
echo "================================================================="
echo "  SUCCESS: Both Models are LIVE and Ready for V.A.R.M.A!"
echo "================================================================="
echo "  :8000 -> Reasoning & Screen Understanding (Qwen2.5-VL-3B)"
echo "  :8001 -> Mouse Point Grounding (groundnext-7b)"
echo "================================================================="
echo "  Press Ctrl+C to stop both servers."
echo ""

# Keep alive and monitor child processes
wait "$PID_8000" "$PID_8001"
