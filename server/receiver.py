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


def _load_dotenv(path: str) -> None:
    """Minimal stdlib-only .env loader. Never overrides a var already set in the environment."""
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


_load_dotenv(os.path.join(PROJECT_ROOT, "server", ".env"))

HOST = os.environ.get("RECEIVER_HOST", "127.0.0.1")
PORT = int(os.environ.get("RECEIVER_PORT", "8002"))

# Default vLLM URL (vLLM running on localhost:8000 or via SSH tunnel)
VLLM_BASE_URL = os.environ.get("VLLM_BASE_URL", "http://127.0.0.1:8000/v1").rstrip("/")
VLLM_MODEL = os.environ.get("VLLM_MODEL", "UI-TARS-7B")

# Shown to the user only when the vLLM server/tunnel is unreachable. Keep real
# hostnames/users/ports out of source — set the real command in server/.env
# (gitignored); see server/.env.example for the shape.
SSH_TUNNEL_HINT = os.environ.get("SSH_TUNNEL_HINT", "ssh -L 8000:localhost:8000 <user>@<host>")


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
        "You are UI-TARS, an advanced multimodal GUI agent capable of perceiving web pages and operating the browser.\n"
        "You have direct visual perception of the user's active viewport.\n\n"
        "Instructions:\n"
        "1. DECIDE ACTION TYPE:\n"
        "   - READ: If the user is asking a question, asking for a summary, looking for information (e.g. deadline, organization, problem description, or details), read the visible page contents and answer clearly.\n"
        "   - USE MOUSE: If the user wants to search, click, navigate, select, or interact with an element on the screen (e.g. 'search for disaster management', 'click shortlist', 'proceed', 'open on sih.gov.in'), identify the visual target element on the screen and issue a mouse action.\n\n"
        "2. FOR MOUSE ACTION:\n"
        "   Always output in this structure:\n"
        "   Thought: <explain what element you are clicking and why>\n"
        "   Action: click(start_box='[ymin, xmin, ymax, xmax]')\n"
        "   (Use 0-1000 normalized coordinates for the bounding box of the element to click).\n"
        "   If the action is typing or searching, also output:\n"
        "   Type: \"<text to type>\"\n\n"
        "3. FOR READING / ANSWERING:\n"
        "   Provide a clear, direct, and structured answer answering the user's question using the text, tables, and elements on the page."
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
            f"Ensure start_vllm_uitars.sh is running and forwarded (e.g. {SSH_TUNNEL_HINT}). Error: {err}"
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


def query_chat(messages: list, prompt: str) -> dict:
    """Send conversational text messages to vLLM (UI-TARS or served text model)."""
    clean_prompt = prompt.strip() if prompt else ""

    system_prompt = (
        "You are V.A.R.M.A (Visual Autonomous Redaction & Multimodal Agent), an intelligent AI companion built into the user's browser. "
        "You can chat casually, answer general knowledge and programming questions, and assist the user. "
        "When the user asks about what is on their active page or screen, inform them you can inspect the page with vision anytime they want. "
        "Keep your conversational responses helpful, friendly, natural, and concise."
    )

    formatted_messages = [{"role": "system", "content": system_prompt}]

    if messages and isinstance(messages, list):
        for msg in messages:
            if isinstance(msg, dict) and "role" in msg and "content" in msg:
                formatted_messages.append({
                    "role": msg["role"],
                    "content": str(msg["content"]),
                })
    elif clean_prompt:
        formatted_messages.append({"role": "user", "content": clean_prompt})

    payload = {
        "model": VLLM_MODEL,
        "messages": formatted_messages,
        "max_tokens": 1024,
        "temperature": 0.7,
    }

    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{VLLM_BASE_URL}/chat/completions",
        data=body,
        headers={"Content-Type": "application/json"},
    )

    print(f"[receiver] Dispatching chat to {VLLM_BASE_URL}/chat/completions...", flush=True)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            choices = data.get("choices", [])
            if choices:
                text = choices[0].get("message", {}).get("content", "")
                return {
                    "success": True,
                    "response": text,
                    "model": VLLM_MODEL,
                }
            return {
                "success": False,
                "error": "No completion choice returned by vLLM",
            }
    except urllib.error.URLError as err:
        msg = f"vLLM server unreachable at {VLLM_BASE_URL}. Error: {err}"
        print(f"[receiver] {msg}", flush=True)
        return {
            "success": False,
            "error": msg,
            "offline": True,
            "response": (
                "Hello! I am V.A.R.M.A, your browser AI companion. "
                "I am currently in local standby because the vLLM server/SSH tunnel is disconnected. "
                f"To connect my full reasoning and UI-TARS vision capabilities, start your SSH tunnel (`{SSH_TUNNEL_HINT}`)."
            ),
        }
    except Exception as err:
        print(f"[receiver] Error calling vLLM chat: {err}", flush=True)
        return {
            "success": False,
            "error": str(err),
            "response": f"Encountered an error communicating with the model: {err}",
        }


import re


def extract_mouse_action(text: str, user_prompt: str) -> dict | None:
    """Parse UI-TARS output or prompt for mouse click actions, typing, and coordinates."""
    if not text:
        text = ""

    # 1. Check for text to type: Type: "..." or type(text='...')
    text_to_type = None
    type_match = re.search(r'(?:Type:\s*|type\s*\(\s*(?:text\s*=\s*)?)[\"\']([^\"\']+)[\"\']', text, re.IGNORECASE)
    if type_match:
        text_to_type = type_match.group(1).strip()

    # Check for search query in prompt if not specified by UI-TARS
    if not text_to_type:
        search_prompt_match = re.search(r"\bsearch\s+(?:for\s+)?(.+)", user_prompt, re.IGNORECASE)
        if search_prompt_match:
            text_to_type = search_prompt_match.group(1).strip()

    # 2. Extract Thought explanation to get a clear, human-friendly target name
    target_name = None
    thought_match = re.search(r"Thought:\s*([^\n\r]+)", text, re.IGNORECASE)
    if thought_match:
        thought_line = thought_match.group(1).strip()
        target_sub = re.search(r"(?:click|interact with|tap|select)\s+(?:on\s+)?(?:the\s+)?([^,\.;]+)", thought_line, re.IGNORECASE)
        if target_sub:
            target_name = target_sub.group(1).strip()[:50]
        else:
            target_name = thought_line[:50]

    # 3. Match 4-coordinate bounding box: click(start_box='[y1, x1, y2, x2]') or '(y1, x1, y2, x2)'
    box_match = re.search(
        r"click\s*\(\s*(?:\w+\s*=\s*)?['\"]?[\[\(](\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)[\]\)]['\"]?",
        text,
        re.IGNORECASE,
    )
    if box_match:
        y1, x1, y2, x2 = map(int, box_match.groups())
        cx = (x1 + x2) / 2
        cy = (y1 + y2) / 2
        return {
            "type": "click",
            "x": cx,
            "y": cy,
            "normalized": True,
            "target": target_name or "Target Element",
            "textToType": text_to_type,
        }

    # 4. Match 2-coordinate point: click(start_box='(275,314)') or click(point='(x, y)') or click(x, y)
    pt_match = re.search(
        r"click\s*\(\s*(?:\w+\s*=\s*)?['\"]?[\[\(](\d+)\s*,\s*(\d+)[\]\)]['\"]?",
        text,
        re.IGNORECASE,
    )
    if pt_match:
        val1, val2 = map(int, pt_match.groups())
        # In UI-TARS notation, start_box=(ymin, xmin) -> val1=y, val2=x
        is_point_keyword = bool(re.search(r"point\s*=", text[:pt_match.start() + 20], re.IGNORECASE))
        if is_point_keyword:
            x, y = val1, val2
        else:
            x, y = val2, val1

        return {
            "type": "click",
            "x": x,
            "y": y,
            "normalized": x <= 1000 and y <= 1000,
            "target": target_name or "Target Element",
            "textToType": text_to_type,
        }

    # 5. Check if action contains move_to or hover
    move_match = re.search(
        r"(?:move_to|hover)\s*\(\s*(?:\w+\s*=\s*)?['\"]?[\[\(](\d+)\s*,\s*(\d+)[\]\)]['\"]?",
        text,
        re.IGNORECASE,
    )
    if move_match:
        v1, v2 = map(int, move_match.groups())
        return {
            "type": "move",
            "x": v2,
            "y": v1,
            "normalized": True,
            "target": target_name or "Target Element",
            "textToType": text_to_type,
        }

    # 6. Fallback based on user command if UI-TARS emitted an action or prompt is explicit
    if re.search(r"\bsearch\b", user_prompt, re.IGNORECASE):
        return {
            "type": "click",
            "target": "Search input",
            "x": 580,
            "y": 28,
            "normalized": True,
            "textToType": text_to_type,
        }

    click_intent = re.search(
        r"\b(?:click|open|select|press|tap|choose|play|make\s+move|solve)\s+(?:on\s+)?(?:the\s+)?([a-zA-Z0-9_\-\s]{1,30})",
        user_prompt,
        re.IGNORECASE,
    )
    if click_intent:
        target_name_fallback = target_name or click_intent.group(1).strip()
        return {
            "type": "click",
            "target": target_name_fallback,
            "x": 500,
            "y": 350,
            "normalized": True,
            "textToType": text_to_type,
        }

    return None


class ScreenshotHandler(BaseHTTPRequestHandler):
    def _send_json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Prompt, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Prompt, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/screenshots/"):
            filename = os.path.basename(parsed.path)
            filepath = os.path.join(SCREENSHOTS_DIR, filename)
            if os.path.exists(filepath) and os.path.isfile(filepath):
                try:
                    with open(filepath, "rb") as f:
                        content = f.read()
                    self.send_response(200)
                    self.send_header("Content-Type", "image/png")
                    self.send_header("Content-Length", str(len(content)))
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Cache-Control", "public, max-age=3600")
                    self.end_headers()
                    self.wfile.write(content)
                    return
                except Exception as err:
                    self._send_json(500, {"ok": False, "error": str(err)})
                    return
            else:
                self._send_json(404, {"ok": False, "error": "file not found"})
                return

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
        if parsed.path == "/chat":
            length = int(self.headers.get("Content-Length", "0") or 0)
            raw = self.rfile.read(length) if length else b"{}"
            try:
                data = json.loads(raw.decode("utf-8"))
            except Exception:
                data = {}
            prompt = data.get("prompt", "")
            messages = data.get("messages", [])
            result = query_chat(messages, prompt)
            self._send_json(200, {
                "ok": result.get("success", False),
                "response": result.get("response", ""),
                "error": result.get("error"),
                "offline": result.get("offline", False),
                "model": result.get("model", VLLM_MODEL),
            })
            return

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
        analysis_text = vllm_result.get("analysis", "")
        mouse_action = extract_mouse_action(analysis_text, user_prompt)
        if mouse_action:
            print(f"[receiver] Mouse action detected: {mouse_action}", flush=True)

        url = f"http://{HOST}:{PORT}/screenshots/{filename}"
        self._send_json(200, {
            "ok": True,
            "path": rel_path,
            "url": url,
            "absolute_path": dest,
            "bytes": len(data),
            "timestamp": ts,
            "analysis": analysis_text,
            "analysis_error": vllm_result.get("error"),
            "vllm_status": "online" if vllm_result.get("success") else "offline",
            "action": mouse_action,
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
