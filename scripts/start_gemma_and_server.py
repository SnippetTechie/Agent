"""V.A.R.M.A — 24/7 All-in-One Process Supervisor (Cross-Platform)

Launches both:
  1. vLLM serving gemma-4-12b-it on Port 8000
  2. V.A.R.M.A Receiver on Port 8002

Monitors both processes 24/7 and auto-restarts any process that exits or crashes.
"""

import os
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
LOGS_DIR = ROOT_DIR / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)

RECEIVER_HOST = os.getenv("RECEIVER_HOST", "0.0.0.0")
RECEIVER_PORT = os.getenv("RECEIVER_PORT", "8002")
VLLM_PORT = os.getenv("VLLM_PORT", "8000")
VLLM_HOST = os.getenv("VLLM_HOST", "0.0.0.0")

# Candidate model paths
candidate_paths = [
    os.getenv("MODEL_PATH", ""),
    str(Path.home() / "pe-x1" / "models" / "gemma-4-12b-it"),
    str(Path.home() / "models" / "gemma-4-12b-it"),
    str(ROOT_DIR / "models" / "gemma-4-12b-it"),
    "/models/gemma-4-12b-it",
    "google/gemma-4-12b-it",
]

RESOLVED_MODEL = "google/gemma-4-12b-it"
for cp in candidate_paths:
    if cp and (Path(cp).is_dir() or cp.startswith("google/")):
        RESOLVED_MODEL = cp
        break

print("=" * 64)
print("  V.A.R.M.A 24/7 Process Supervisor")
print("=" * 64)
print(f"  Model             : {RESOLVED_MODEL}")
print(f"  vLLM Port         : {VLLM_PORT}")
print(f"  Receiver API Port : {RECEIVER_PORT} (Host: {RECEIVER_HOST})")
print(f"  Logs Dir          : {LOGS_DIR}")
print("=" * 64)


def is_healthy(port: str) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=2) as resp:
            return resp.status == 200
    except Exception:
        return False


vllm_proc = None
recv_proc = None


def stop_all(signum=None, frame=None):
    print("\n[supervisor] Stopping child processes...")
    global vllm_proc, recv_proc
    for proc in (recv_proc, vllm_proc):
        if proc and proc.poll() is None:
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
    print("[supervisor] All processes stopped cleanly.")
    sys.exit(0)


signal.signal(signal.SIGINT, stop_all)
signal.signal(signal.SIGTERM, stop_all)


def start_vllm_proc():
    vllm_log = open(LOGS_DIR / "vllm.log", "a", encoding="utf-8")
    env = os.environ.copy()
    env["VLLM_USE_V1"] = "0"
    env["VLLM_ATTENTION_BACKEND"] = "FLASH_ATTN"
    env["CCCL_IGNORE_DEPRECATED_CUDA_BELOW_12"] = "1"

    cmd = [
        "vllm", "serve", RESOLVED_MODEL,
        "--port", VLLM_PORT,
        "--host", VLLM_HOST,
        "--gpu-memory-utilization", os.getenv("GPU_MEMORY_UTILIZATION", "0.85"),
        "--max-model-len", os.getenv("MAX_MODEL_LEN", "4096"),
        "--trust-remote-code",
        "--dtype", "bfloat16",
    ]
    print(f"[{time.strftime('%X')}] Launching vLLM: {' '.join(cmd[:4])}...")
    return subprocess.Popen(cmd, stdout=vllm_log, stderr=subprocess.STDOUT, env=env)


def start_recv_proc():
    recv_log = open(LOGS_DIR / "receiver.log", "a", encoding="utf-8")
    env = os.environ.copy()
    env["RECEIVER_HOST"] = RECEIVER_HOST
    env["RECEIVER_PORT"] = RECEIVER_PORT
    env["VLLM_BASE_URL"] = f"http://127.0.0.1:{VLLM_PORT}/v1"
    env["VLLM_MODEL"] = "gemma-4-12b-it"

    cmd = [sys.executable, str(ROOT_DIR / "scripts" / "start_server.py")]
    print(f"[{time.strftime('%X')}] Launching Receiver server on {RECEIVER_HOST}:{RECEIVER_PORT}...")
    return subprocess.Popen(cmd, stdout=recv_log, stderr=subprocess.STDOUT, env=env)


def main():
    global vllm_proc, recv_proc

    vllm_proc = start_vllm_proc()
    print("[*] Waiting for vLLM to warm up and load weights...")
    for _ in range(120):
        if is_healthy(VLLM_PORT):
            print(f"[✓] vLLM is ready on port {VLLM_PORT}!")
            break
        if vllm_proc.poll() is not None:
            print("[ERROR] vLLM crashed during startup! Check logs/vllm.log")
            sys.exit(1)
        time.sleep(2)
        sys.stdout.write(".")
        sys.stdout.flush()
    print()

    recv_proc = start_recv_proc()
    time.sleep(3)

    print("=" * 64)
    print("  V.A.R.M.A is now running 24/7!")
    print(f"  External API endpoint: http://0.0.0.0:{RECEIVER_PORT}")
    print(f"  WebSocket endpoint   : ws://0.0.0.0:{RECEIVER_PORT}/ws/agent")
    print("=" * 64)

    while True:
        if vllm_proc.poll() is not None:
            print(f"[ALERT {time.strftime('%X')}] vLLM exited (code {vllm_proc.returncode})! Restarting...")
            vllm_proc = start_vllm_proc()

        if recv_proc.poll() is not None:
            print(f"[ALERT {time.strftime('%X')}] Receiver exited (code {recv_proc.returncode})! Restarting...")
            recv_proc = start_recv_proc()

        time.sleep(5)


if __name__ == "__main__":
    main()
