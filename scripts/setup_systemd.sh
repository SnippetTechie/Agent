#!/usr/bin/env bash
# =============================================================================
# V.A.R.M.A — Systemd 24/7 Service Installer (Linux / Ubuntu)
#
# Configures the server to start both vLLM and the receiver automatically
# on boot and keep them running 24/7 in the background without any open terminal.
#
# Usage:
#   sudo bash scripts/setup_systemd.sh
# =============================================================================

set -euo pipefail

CURRENT_USER="${SUDO_USER:-$(whoami)}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

SERVICE_FILE="/etc/systemd/system/varma.service"

echo "================================================================="
echo "  Installing V.A.R.M.A 24/7 Systemd Service"
echo "================================================================="
echo "  User              : ${CURRENT_USER}"
echo "  Working Directory : ${ROOT_DIR}"
echo "  Target Unit File  : ${SERVICE_FILE}"
echo "================================================================="

if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: Please run with sudo: sudo bash scripts/setup_systemd.sh"
    exit 1
fi

cat <<EOF > "${SERVICE_FILE}"
[Unit]
Description=V.A.R.M.A 24/7 Autonomous Agent Server & Gemma Vision Service
After=network.target

[Service]
Type=simple
User=${CURRENT_USER}
WorkingDirectory=${ROOT_DIR}
ExecStart=/usr/bin/env bash ${ROOT_DIR}/scripts/start_production_247.sh
Restart=always
RestartSec=10
KillMode=mixed
TimeoutStopSec=30
Environment="PATH=/home/${CURRENT_USER}/.local/bin:/usr/local/cuda/bin:/usr/bin:/bin:${PATH:-}"

[Install]
WantedBy=multi-user.target
EOF

echo "[*] Reloading systemd daemon..."
systemctl daemon-reload

echo "[*] Enabling and starting varma.service..."
systemctl enable varma.service
systemctl restart varma.service

echo ""
echo "================================================================="
echo "  SUCCESS: V.A.R.M.A is now running as a 24/7 background service!"
echo "================================================================="
echo "  Check service status:"
echo "    sudo systemctl status varma"
echo ""
echo "  Follow live systemd logs:"
echo "    sudo journalctl -u varma -f"
echo ""
echo "  Stop service:"
echo "    sudo systemctl stop varma"
echo ""
echo "  Restart service:"
echo "    sudo systemctl restart varma"
echo "================================================================="
