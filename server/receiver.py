import base64
import datetime
import json
import os
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCREENSHOTS_DIR = os.path.join(PROJECT_ROOT, "screenshots")
HOST = os.environ.get("RECEIVER_HOST", "127.0.0.1")
PORT = int(os.environ.get("RECEIVER_PORT", "8002"))

# Default vLLM URL (vLLM running on localhost:8000 or via SSH tunnel)
VLLM_BASE_URL = os.environ.get("VLLM_BASE_URL", "http://127.0.0.1:8000/v1").rstrip("/")
VLLM_MODEL = os.environ.get("VLLM_MODEL", "UI-TARS-7B")


import socket

def check_vllm_health() -> bool:
    """Fast check if the vLLM port is listening."""
    try:
        parsed = urlparse(VLLM_BASE_URL)
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        with socket.create_connection((host, port), timeout=0.5):
            return True
    except Exception:
        return False


def query_uitars(image_bytes: bytes, user_prompt: str) -> dict:
    """Send screenshot and user prompt to UI-TARS running on vLLM."""
    b64_image = base64.b64encode(image_bytes).decode("utf-8")
    clean_prompt = user_prompt.strip() or "Describe this webpage screenshot in a clear and simplified way."

    system_prompt = (
        "You are UI-TARS, a state-of-the-art vision-language agent specialized in GUI and webpage understanding. "
        "Analyze the provided webpage screenshot and describe it in a simplified, easy-to-understand way. "
        "Highlight the primary content, structure, key interactive elements, and directly answer the user's request. "
        "Keep the explanation clear, structured, and helpful."
    )

    payload = {
        "model": VLLM_MODEL,
        "messages": [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": clean_prompt,
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{b64_image}",
                        },
                    },
                ],
            },
        ],
        "max_tokens": 1024,
        "temperature": 0.2,
    }

    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{VLLM_BASE_URL}/chat/completions",
        data=body,
        headers={"Content-Type": "application/json"},
    )

    print(f"[receiver] Dispatching to UI-TARS at {VLLM_BASE_URL}/chat/completions (model: {VLLM_MODEL})...", flush=True)
    try:
        # Allow up to 90 seconds for vision inference
        with urllib.request.urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            choices = data.get("choices", [])
            if choices:
                text = choices[0].get("message", {}).get("content", "")
                print(f"[receiver] UI-TARS response received ({len(text)} chars)", flush=True)
                return {
                    "success": True,
                    "analysis": text,
                    "model": VLLM_MODEL,
                }
            return {
                "success": False,
                "error": "No completion choice returned by vLLM",
            }
    except urllib.error.URLError as err:
        msg = (
            f"vLLM server unreachable at {VLLM_BASE_URL}. "
            f"Ensure start_vllm_uitars.sh is running and forwarded (e.g. ssh -L 8001:localhost:8000). Error: {err}"
        )
        print(f"[receiver] {msg}", flush=True)
        return {
            "success": False,
            "error": msg,
            "offline": True,
        }
    except Exception as err:
        print(f"[receiver] Error calling UI-TARS: {err}", flush=True)
        return {
            "success": False,
            "error": str(err),
        }


class ScreenshotHandler(BaseHTTPRequestHandler):
    def _send_json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Prompt")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Prompt")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            vllm_ok = check_vllm_health()
            self._send_json(200, {
                "status": "ok",
                "screenshots_dir": SCREENSHOTS_DIR,
                "vllm_base_url": VLLM_BASE_URL,
                "vllm_model": VLLM_MODEL,
                "vllm_reachable": vllm_ok,
            })
        else:
            self._send_json(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/screenshot":
            self._send_json(404, {"ok": False, "error": "not found"})
            return

        length = int(self.headers.get("Content-Length", "0") or 0)
        data = self.rfile.read(length) if length else b""
        if not data:
            self._send_json(400, {"ok": False, "error": "empty body"})
            return

        os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
        qs = parse_qs(parsed.query)
        hint = (qs.get("name", [None])[0]) or self.headers.get("X-Prompt")
        ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        if hint:
            safe = "".join(c for c in hint if c.isalnum() or c in "-_.")
            filename = f"{ts}-{safe[:40] or 'screenshot'}.png"
        else:
            filename = f"{ts}.png"

        dest = os.path.join(SCREENSHOTS_DIR, filename)
        with open(dest, "wb") as f:
            f.write(data)

        rel_path = os.path.join("screenshots", filename).replace("\\", "/")
        print(f"[receiver] saved {len(data)} bytes -> {dest}", flush=True)

        # Extract prompt for UI-TARS
        prompt_raw = self.headers.get("X-Prompt")
        if prompt_raw:
            try:
                user_prompt = unquote(prompt_raw)
            except Exception:
                user_prompt = prompt_raw
        else:
            user_prompt = hint or "Describe this webpage screenshot in a simplified way."

        # Query UI-TARS via vLLM
        vllm_result = query_uitars(data, user_prompt)

        self._send_json(200, {
            "ok": True,
            "path": rel_path,
            "absolute_path": dest,
            "bytes": len(data),
            "timestamp": ts,
            "analysis": vllm_result.get("analysis"),
            "analysis_error": vllm_result.get("error"),
            "vllm_status": "online" if vllm_result.get("success") else "offline",
        })

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("[receiver] " + (fmt % args) + "\n")


def main() -> None:
    os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
    server_address = (HOST, PORT)
    try:
        httpd = ThreadingHTTPServer(server_address, ScreenshotHandler)
    except OSError as err:
        print(f"[receiver] Port {PORT} is already in use (receiver may already be running): {err}", flush=True)
        return

    print(f"[receiver] Listening on http://{HOST}:{PORT}/screenshot", flush=True)
    print(f"[receiver] Storing screenshots to: {SCREENSHOTS_DIR}", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[receiver] Stopping server...", flush=True)


if __name__ == "__main__":
    main()
