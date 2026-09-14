#!/usr/bin/env bash
# =============================================================================
# V.A.R.M.A — 1-Click Server Dependencies Installer
#
# Run this after git clone on your remote GPU server:
#   bash scripts/install_server_deps.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

echo "================================================================="
echo "  V.A.R.M.A Server Dependencies Installation"
echo "================================================================="

if command -v nvidia-smi >/dev/null 2>&1; then
    echo "[✓] GPU detected:"
    nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
else
    echo "[!] Warning: nvidia-smi not found. Ensure NVIDIA CUDA drivers are installed."
fi

# Initialize server/.env from template if present
if [ ! -f "${ROOT_DIR}/server/.env" ] && [ -f "${ROOT_DIR}/server/.env.example" ]; then
    echo "[*] Creating server/.env from template..."
    cp "${ROOT_DIR}/server/.env.example" "${ROOT_DIR}/server/.env"
fi

echo "[*] Upgrading pip..."
python3 -m pip install --upgrade pip

echo "[*] Installing V.A.R.M.A server requirements..."
python3 -m pip install -r "${ROOT_DIR}/server/requirements.txt"

echo "[*] Installing vLLM (if not already installed)..."
python3 -m pip install "vllm>=0.6.0" || true

echo "[*] Installing Playwright Chromium browser..."
python3 -m playwright install chromium || true

echo ""
echo "================================================================="
echo "  SUCCESS: Server dependencies are installed!"
echo "================================================================="
echo "  To start both Gemma and the Receiver running 24/7, run:"
echo "    bash scripts/start_production_247.sh"
echo "================================================================="
