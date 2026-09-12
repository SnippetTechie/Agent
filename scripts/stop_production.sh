#!/usr/bin/env bash
# =============================================================================
# V.A.R.M.A — Stop Production Background Processes
#
# Usage:
#   bash scripts/stop_production.sh
# =============================================================================

echo "[*] Stopping V.A.R.M.A background processes..."

# Stop systemd service if running
if command -v systemctl >/dev/null 2>&1; then
    sudo systemctl stop varma 2>/dev/null || true
fi

# Kill background processes
pkill -f "start_production_247.sh" 2>/dev/null || true
pkill -f "start_server.py" 2>/dev/null || true
pkill -f "vllm serve" 2>/dev/null || true

# Free ports
for PORT in 8000 8002; do
    if command -v fuser >/dev/null 2>&1; then
        fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
    fi
done

echo "[✓] V.A.R.M.A server processes stopped."