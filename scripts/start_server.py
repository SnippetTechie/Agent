"""Start the V.A.R.M.A receiver with sensible defaults.

Configuration precedence, most specific first:

  1. the real environment (an explicit export always wins)
  2. server/.env, loaded by receiver.py itself
  3. the fallbacks below, only when neither of the above set the key

That order matters. This script runs the receiver as a CHILD process, so any
value it injects into the child environment is indistinguishable from a value
the operator exported - it would silently beat server/.env. An earlier version
hard-coded VLLM_MODEL=gemma-3 here, which quietly overrode the .env file and
made "which model is configured?" depend on which file you happened to read.

Usage:
    python scripts/start_server.py

Environmental overrides:
    RECEIVER_HOST, RECEIVER_PORT
    VLLM_BASE_URL, VLLM_MODEL
    GROUNDING_BASE_URL, GROUNDING_MODEL, GROUNDING_ENABLED
    CDP_URL
    AGENT_MAX_STEPS, AGENT_MAX_ACTIONS_PER_STEP
    AGENT_SHOW_OVERLAY=0, AGENT_SHOW_CURSOR=0
    VARMA_SKIP_ENV_FILE=1  (ignore server/.env entirely)
"""

import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT_DIR / "server" / ".env"

# Only used when neither the environment nor server/.env supplies the key.
FALLBACKS = {
    "RECEIVER_HOST": "127.0.0.1",
    "RECEIVER_PORT": "8002",
    "VLLM_BASE_URL": "http://127.0.0.1:8000/v1",
    "VLLM_MODEL": "gemma4-12b",
    "GROUNDING_BASE_URL": "http://127.0.0.1:8000/v1",
    "GROUNDING_MODEL": "gemma4-12b",
    "CDP_URL": "http://localhost:9222",
    "AGENT_MAX_STEPS": "15",
    "AGENT_MAX_ACTIONS_PER_STEP": "3",
    "GAME_MAX_STEPS": "60",
}


def read_env_file() -> dict[str, str]:
    """Parse server/.env without importing the receiver.

    Deliberately a small duplicate of receiver._load_dotenv rather than a shared
    import: this script must run even when the receiver's own dependencies are
    missing, and the banner has to describe the file the child will actually read.
    """
    values: dict[str, str] = {}
    try:
        raw = ENV_FILE.read_text(encoding="utf-8")
    except OSError:
        return values

    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if key:
            values[key] = value.strip().strip('"').strip("'")
    return values


def receiver_already_running(host: str, port: str) -> bool:
    """Return whether a healthy receiver already owns the configured port."""
    try:
        with urllib.request.urlopen("http://" + host + ":" + port + "/health", timeout=2) as response:
            return response.status == 200
    except (OSError, urllib.error.URLError):
        return False


def main() -> int:
    env = os.environ.copy()
    skip_file = env.get("VARMA_SKIP_ENV_FILE", "0") not in ("0", "", "false")
    file_values = {} if skip_file else read_env_file()

    source: dict[str, str] = {}
    for key, fallback in FALLBACKS.items():
        if key in env and env[key]:
            source[key] = "env"
        elif key in file_values:
            env[key] = file_values[key]
            source[key] = ".env"
        else:
            env[key] = fallback
            source[key] = "default"

    print("=" * 64)
    print("  V.A.R.M.A receiver")
    print("=" * 64)
    print("  listening : http://" + env["RECEIVER_HOST"] + ":" + env["RECEIVER_PORT"])
    for key in ("VLLM_BASE_URL", "VLLM_MODEL", "GROUNDING_BASE_URL", "GROUNDING_MODEL", "CDP_URL"):
        print("  " + key.ljust(19) + ": " + env[key] + "   [" + source[key] + "]")
    print()
    print("  Two roles, one or two endpoints:")
    print("    reasoning : /chat and DOM browsing")
    print("    precision : game mode (needs a model that accepts images)")
    print()
    print("  If the models run on a remote GPU box, tunnel the ports first:")
    print("    ssh -p 2222 -L 8000:localhost:8000 -L 8001:localhost:8001 <user>@<gpu-host>")
    print("  The browser must already be running with:")
    print("    --remote-debugging-port=9222 --user-data-dir=<profile>")
    print("=" * 64)
    print()

    if receiver_already_running(env["RECEIVER_HOST"], env["RECEIVER_PORT"]):
        print(
            "[start_server] receiver is already running at http://"
            + env["RECEIVER_HOST"] + ":" + env["RECEIVER_PORT"]
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
    print("[start_server] receiver started (pid " + str(proc.pid) + ")")

    try:
        return proc.wait()
    except KeyboardInterrupt:
        print("\n[start_server] stopping receiver...")
        proc.terminate()
        return proc.wait()


if __name__ == "__main__":
    raise SystemExit(main())
