"""Start the V.A.R.M.A receiver server with sensible defaults.

Usage:
    python scripts/start_server.py

Environment overrides:
    RECEIVER_HOST, RECEIVER_PORT
    VLLM_BASE_URL, VLLM_MODEL, VLLM_MAX_TOKENS
    CDP_URL
    AGENT_MAX_STEPS, AGENT_MAX_ACTIONS_PER_STEP
    AGENT_SHOW_OVERLAY=0, AGENT_SHOW_CURSOR=0
"""

import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent

DEFAULTS = {
    "RECEIVER_HOST": "127.0.0.1",
    "RECEIVER_PORT": "8002",
    "VLLM_BASE_URL": "http://127.0.0.1:8000/v1",
    "VLLM_MODEL": "gemma-3",
    "CDP_URL": "http://localhost:9222",
    "AGENT_MAX_STEPS": "15",
    "AGENT_MAX_ACTIONS_PER_STEP": "3",
}


def receiver_already_running(host: str, port: str) -> bool:
    """Return whether a healthy receiver already owns the configured port."""
    try:
        with urllib.request.urlopen(f"http://{host}:{port}/health", timeout=2) as response:
            return response.status == 200
    except (OSError, urllib.error.URLError):
        return False


def main() -> int:
    env = os.environ.copy()
    for key, value in DEFAULTS.items():
        env.setdefault(key, value)

    print("=" * 64)
    print("  V.A.R.M.A receiver")
    print("=" * 64)
    print(f"  listening : http://{env['RECEIVER_HOST']}:{env['RECEIVER_PORT']}")
    print(f"  vLLM      : {env['VLLM_BASE_URL']}  (model: {env['VLLM_MODEL']})")
    print(f"  browser   : {env['CDP_URL']}")
    print()
    print("  If the model runs on a remote GPU box, tunnel it first:")
    print("    ssh -L 8000:localhost:8000 user@gpu-host")
    print("  The browser must already be running with:")
    print("    --remote-debugging-port=9222 --user-data-dir=<profile>")
    print("=" * 64)
    print()

    if receiver_already_running(env["RECEIVER_HOST"], env["RECEIVER_PORT"]):
        print(
            f"[start_server] receiver is already running at "
            f"http://{env['RECEIVER_HOST']}:{env['RECEIVER_PORT']}"
        )
        print("[start_server] reusing the existing healthy process")
        return 0

    creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    proc = subprocess.Popen(
        [sys.executable, str(ROOT_DIR / "server" / "receiver.py")],
        cwd=str(ROOT_DIR),
        env=env,
        creationflags=creationflags,
    )
    print(f"[start_server] receiver started (pid {proc.pid})")

    try:
        return proc.wait()
    except KeyboardInterrupt:
        print("\n[start_server] stopping receiver...")
        proc.terminate()
        return proc.wait()


if __name__ == "__main__":
    raise SystemExit(main())
