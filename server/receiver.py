import datetime
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCREENSHOTS_DIR = os.path.join(PROJECT_ROOT, "screenshots")
HOST = os.environ.get("RECEIVER_HOST", "127.0.0.1")
PORT = int(os.environ.get("RECEIVER_PORT", "8000"))


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
            self._send_json(200, {"status": "ok", "screenshots_dir": SCREENSHOTS_DIR})
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

        self._send_json(200, {
            "ok": True,
            "path": rel_path,
            "absolute_path": dest,
            "bytes": len(data),
            "timestamp": ts,
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
