"""V.A.R.M.A receiver server.

Endpoints
---------
GET  /health                 server + vLLM + CDP status
POST /chat                   conversational reply (no browser)
POST /screenshot             store a PNG captured by the extension
GET  /screenshots/<name>     serve a stored PNG
WS   /ws/agent               run a browser task on the user's active tab

The agent path is intentionally thin: the extension sends a task, this server
runs the CDP loop and streams step events back. Perception is DOM-based
(one in-page pass per step), so there is no screenshot upload in the loop.
"""

from __future__ import annotations

import asyncio
import datetime
import os
import re
import socket
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from server.agent import AgentLoop, AgentRunConfig, BrowserSessionManager, VLLMClient  # noqa: E402
from server.agent.llm import VLLMError  # noqa: E402
from server.agent.session import CDPUnavailable  # noqa: E402

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

HOST = os.getenv("RECEIVER_HOST", "127.0.0.1")
PORT = int(os.getenv("RECEIVER_PORT", "8002"))

# vLLM. For a remote GPU box, tunnel first:
#   ssh -p 2222 -L 8000:localhost:8000 -L 8001:localhost:8001 user@host
#
# Two endpoints, two roles:
#   :8000  reasoning / screen understanding  (gemma4)
#   :8001  precision mouse grounding         (groundnext)
# The grounding endpoint is optional: if it is not served, only the precision
# path is unavailable and everything else still works.
VLLM_BASE_URL = os.getenv("VLLM_BASE_URL", "http://127.0.0.1:8000/v1")
VLLM_MODEL = os.getenv("VLLM_MODEL", "gemma4-12b")
VLLM_MAX_TOKENS = int(os.getenv("VLLM_MAX_TOKENS", "512"))

GROUNDING_BASE_URL = os.getenv("GROUNDING_BASE_URL", "http://127.0.0.1:8001/v1")
GROUNDING_MODEL = os.getenv("GROUNDING_MODEL", "groundnext-7b")
GROUNDING_MAX_TOKENS = int(os.getenv("GROUNDING_MAX_TOKENS", "128"))
GROUNDING_ENABLED = os.getenv("GROUNDING_ENABLED", "1") != "0"

# Chrome DevTools Protocol endpoint of the browser the user is already using.
CDP_URL = os.getenv("CDP_URL", "http://localhost:9222")

MAX_STEPS = int(os.getenv("AGENT_MAX_STEPS", "15"))
MAX_ACTIONS_PER_STEP = int(os.getenv("AGENT_MAX_ACTIONS_PER_STEP", "3"))
SHOW_OVERLAY = os.getenv("AGENT_SHOW_OVERLAY", "1") != "0"
SHOW_CURSOR = os.getenv("AGENT_SHOW_CURSOR", "1") != "0"

# Approval gate. The extension sends a per-run mode; this is only the fallback
# used when a client does not specify one (direct demo.py runs, curl, tests).
DEFAULT_APPROVAL_MODE = os.getenv("AGENT_APPROVAL_MODE", "manual").lower()
APPROVAL_TIMEOUT = float(os.getenv("AGENT_APPROVAL_TIMEOUT", "180"))
AUTO_APPROVE_DELAY = float(os.getenv("AGENT_AUTO_APPROVE_DELAY", "1.2"))

# Layer-1 deterministic DOM redaction: password/banking fields and card numbers
# are masked in-page before the text ever reaches the model.
AUTO_REDACT = os.getenv("AGENT_AUTO_REDACT", "1") != "0"

SCREENSHOTS_DIR = ROOT_DIR / "screenshots"
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Shared, long-lived resources
# ---------------------------------------------------------------------------

llm = VLLMClient(
    base_url=VLLM_BASE_URL,
    model=VLLM_MODEL,
    max_tokens=VLLM_MAX_TOKENS,
    temperature=0.0,
)

# Same client class, different endpoint. Grounding wants near-greedy sampling and
# a short output budget: its replies are a single tool call, never prose.
grounding_llm = VLLMClient(
    base_url=GROUNDING_BASE_URL,
    model=GROUNDING_MODEL,
    max_tokens=GROUNDING_MAX_TOKENS,
    temperature=0.0,
)

session = BrowserSessionManager(
    cdp_url=CDP_URL,
    show_overlay=SHOW_OVERLAY,
    show_cursor=SHOW_CURSOR,
    auto_redact=AUTO_REDACT,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Own the shared HTTP and CDP connections for the process lifetime."""
    yield
    await llm.aclose()
    await grounding_llm.aclose()
    await session.disconnect()


app = FastAPI(title="V.A.R.M.A receiver", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _port_open(url: str, default_port: int) -> bool:
    try:
        parsed = urlparse(url)
        host = parsed.hostname or "localhost"
        port = parsed.port or default_port
        with socket.create_connection((host, port), timeout=1.5):
            return True
    except Exception:
        return False


def vllm_reachable() -> bool:
    return _port_open(VLLM_BASE_URL, 8000)


def grounding_reachable() -> bool:
    """Whether the precision-grounding endpoint is serving right now."""
    if not GROUNDING_ENABLED:
        return False
    return _port_open(GROUNDING_BASE_URL, 8001)


def cdp_reachable() -> bool:
    return _port_open(CDP_URL, 9222)


_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)
_ORPHAN_RE = re.compile(r"</?think>")
_SPECIAL_RE = re.compile(r"<\|[^|]+\|>")
_TOOLTAG_RE = re.compile(r"</?(tool_response|tool_call|tool_result|function_call|function_response)>")


def clean_model_response(raw: str) -> str:
    """Strip reasoning blocks and stray special tokens from model output."""
    text = _THINK_RE.sub("", raw or "")
    text = _ORPHAN_RE.sub("", text)
    text = _TOOLTAG_RE.sub("", text)
    text = _SPECIAL_RE.sub("", text)
    return text.strip()


def normalize_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Coerce a message list into the strict shape Gemma-3's chat template wants.

    At most one leading system message, then strictly alternating user/assistant
    starting with user. Empty slots are replaced so the template cannot drop them.
    """
    if not messages:
        return [{"role": "user", "content": "Please continue."}]

    system_parts: list[str] = []
    dialogue: list[dict[str, str]] = []

    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")

        if isinstance(content, list):
            chunks = []
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    chunks.append(part.get("text", ""))
                elif isinstance(part, str):
                    chunks.append(part)
            content = "\n".join(c for c in chunks if c and c.strip())
        elif not isinstance(content, str):
            content = str(content)

        content = (content or "").strip() or "[Continuing]"

        if role == "system":
            system_parts.append(content)
        else:
            dialogue.append(
                {"role": "assistant" if role == "assistant" else "user", "content": content}
            )

    merged: list[dict[str, str]] = []
    for msg in dialogue:
        if merged and merged[-1]["role"] == msg["role"]:
            merged[-1]["content"] += "\n\n" + msg["content"]
        else:
            merged.append(msg)

    if not merged:
        merged = [{"role": "user", "content": "Please continue."}]
    elif merged[0]["role"] != "user":
        merged.insert(0, {"role": "user", "content": "Please continue."})

    result: list[dict[str, Any]] = []
    if system_parts:
        result.append({"role": "system", "content": "\n\n".join(system_parts)})
    result.extend(merged)
    return result


# ---------------------------------------------------------------------------
# HTTP endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health() -> dict[str, Any]:
    models = await llm.list_models() if vllm_reachable() else []
    grounding_models = await grounding_llm.list_models() if grounding_reachable() else []

    # Report a wrong alias explicitly. vLLM's resolver falls back to the first
    # served model, which silently hides a typo'd model name — the classic
    # "why is the model answering nonsense" symptom. Say it out loud instead.
    grounding_state: dict[str, Any] = {
        "base_url": GROUNDING_BASE_URL,
        "model": grounding_llm.model,
        "enabled": GROUNDING_ENABLED,
        "reachable": grounding_reachable(),
        "available_models": grounding_models,
    }
    if grounding_models:
        grounding_state["alias_ok"] = grounding_llm.model in grounding_models

    return {
        "status": "ok",
        "engine": "varma-native-cdp",
        "vllm": {
            "base_url": VLLM_BASE_URL,
            "model": llm.model,
            "reachable": vllm_reachable(),
            "available_models": models,
        },
        "grounding": grounding_state,
        "cdp": {
            "url": CDP_URL,
            "reachable": cdp_reachable(),
            "connected": session.connected,
        },
        "config": {
            "max_steps": MAX_STEPS,
            "max_actions_per_step": MAX_ACTIONS_PER_STEP,
            "overlay": SHOW_OVERLAY,
            "cursor": SHOW_CURSOR,
            "auto_redact": AUTO_REDACT,
            "approval_mode": DEFAULT_APPROVAL_MODE,
            "approval_timeout_s": APPROVAL_TIMEOUT,
        },
        "last_step": {
            "observe_ms": round(session.last_observe_ms, 1),
            "action_ms": round(session.last_action_ms, 1),
            "llm_ms": round(llm.last_latency_ms, 1),
        },
    }


@app.get("/screenshots/{filename}")
async def get_screenshot(filename: str) -> Any:
    path = (SCREENSHOTS_DIR / filename).resolve()
    if not str(path).startswith(str(SCREENSHOTS_DIR)) or not path.exists():
        return JSONResponse({"error": "File not found"}, status_code=404)
    return FileResponse(path, media_type="image/png")


@app.post("/screenshot")
async def save_screenshot(request: Request) -> Any:
    """Store a PNG captured by the extension (used for the UI preview only)."""
    try:
        body = await request.body()
        if not body:
            return JSONResponse({"ok": False, "error": "empty body"}, status_code=400)

        hint = request.query_params.get("name") or request.headers.get("X-Prompt") or ""
        safe = "".join(c for c in hint if c.isalnum() or c in "-_.") or "screenshot"
        stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        filename = f"{stamp}-{safe[:40]}.png"

        (SCREENSHOTS_DIR / filename).write_bytes(body)
        return {
            "ok": True,
            "path": f"screenshots/{filename}",
            "url": f"http://{HOST}:{PORT}/screenshots/{filename}",
            "bytes": len(body),
            "timestamp": stamp,
        }
    except Exception as exc:  # pragma: no cover
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=500)


CHAT_SYSTEM_PROMPT = (
    "You are V.A.R.M.A, an AI companion inside the user's browser. "
    "Reply in the user's language, be direct and concise, and never emit XML tags "
    "or special tokens."
)


@app.post("/chat")
async def chat(request: Request) -> dict[str, Any]:
    """Conversational reply. No page access, no browser control."""
    try:
        data = await request.json()
    except Exception:
        return {"ok": False, "error": "invalid JSON", "response": "I couldn't read that request."}

    messages = data.get("messages") or []
    if not messages and data.get("prompt"):
        messages = [{"role": "user", "content": data["prompt"]}]

    if not vllm_reachable():
        return {
            "ok": False,
            "offline": True,
            "error": "vLLM backend is unreachable.",
            "response": (
                "I'm in local standby because the vLLM server is disconnected. "
                "Start the tunnel (ssh -L 8000:localhost:8000 ...) and try again."
            ),
            "model": llm.model,
        }

    try:
        model = await llm.resolve_model(VLLM_MODEL)
        full = normalize_messages([{"role": "system", "content": CHAT_SYSTEM_PROMPT}] + messages)
        result = await llm.chat(full, max_tokens=1024, temperature=0.3)
        reply = clean_model_response(result.get("text", ""))
        if not reply:
            reply = "I received your message but couldn't generate a response. Please try again."
        return {"ok": True, "response": reply, "model": model, "usage": result.get("usage")}
    except VLLMError as exc:
        return {"ok": False, "error": str(exc), "response": f"Model error: {exc}"}
    except Exception as exc:  # pragma: no cover
        return {"ok": False, "error": str(exc), "response": f"Unexpected error: {exc}"}


# ---------------------------------------------------------------------------
# Agent websocket
# ---------------------------------------------------------------------------

@app.websocket("/ws/agent")
async def agent_ws(websocket: WebSocket) -> None:
    await websocket.accept()

    if not vllm_reachable():
        await websocket.send_json(
            {
                "type": "ERROR",
                "error": (
                    f"Cannot reach vLLM at {VLLM_BASE_URL}. Start the tunnel: "
                    "ssh -L 8000:localhost:8000 user@gpu-host"
                ),
            }
        )
        await websocket.close()
        return

    if not cdp_reachable():
        await websocket.send_json(
            {
                "type": "ERROR",
                "error": (
                    f"Cannot reach the browser on {CDP_URL}. Start Chrome/Brave with "
                    "--remote-debugging-port=9222 --user-data-dir=<profile>"
                ),
            }
        )
        await websocket.close()
        return

    loop: AgentLoop | None = None

    try:
        init = await websocket.receive_json()
        if init.get("type") != "START_TASK":
            await websocket.send_json({"type": "ERROR", "error": "Expected START_TASK"})
            return

        task = str(init.get("task", "")).strip()
        if not task:
            await websocket.send_json({"type": "ERROR", "error": "Empty task"})
            return

        max_steps = int(init.get("max_steps") or MAX_STEPS)

        # Approval mode decides whether state-changing actions pause for the
        # panel. Unknown values fall back to "manual" (the safe default).
        approval_mode = str(init.get("approval_mode") or DEFAULT_APPROVAL_MODE).lower()
        if approval_mode not in ("manual", "auto", "skip"):
            approval_mode = "manual"

        # The side panel's settings decide the visual debug layer. Apply before
        # the run starts so the first perception already draws correctly.
        await session.apply_visuals(
            overlay=bool(init.get("show_overlay", SHOW_OVERLAY)),
            cursor=bool(init.get("show_cursor", SHOW_CURSOR)),
            redact=bool(init.get("auto_redact", AUTO_REDACT)),
        )

        # Tab scope: "single" pins the run to the attached tab.
        tab_scope = str(init.get("tab_scope") or "single").lower()
        session.tab_scope = "all" if tab_scope == "all" else "single"

        async def emit(event: dict[str, Any]) -> None:
            await websocket.send_json(event)

        await llm.resolve_model(VLLM_MODEL)
        loop = AgentLoop(session, llm, on_event=emit)
        config = AgentRunConfig(
            task=task,
            max_steps=max_steps,
            max_actions_per_step=MAX_ACTIONS_PER_STEP,
            approval_mode=approval_mode,
            approval_timeout=APPROVAL_TIMEOUT,
            auto_approve_delay=AUTO_APPROVE_DELAY,
        )

        async def listen() -> None:
            """Handle STOP, APPROVE/DENY and live visual toggles mid-run."""
            try:
                while True:
                    msg = await websocket.receive_json()
                    kind = msg.get("type")
                    if kind == "STOP" and loop is not None:
                        loop.stop()
                    elif kind == "APPROVE" and loop is not None:
                        loop.approve()
                    elif kind == "DENY" and loop is not None:
                        loop.deny()
                    elif kind == "SET_VISUALS":
                        applied = await session.apply_visuals(
                            overlay=msg.get("overlay"),
                            cursor=msg.get("cursor"),
                            redact=msg.get("redact"),
                        )
                        # Re-draw immediately so toggling on mid-run is visible.
                        if applied.get("overlay") and loop is not None:
                            await session.observe()
            except (WebSocketDisconnect, asyncio.CancelledError):
                if loop is not None:
                    loop.stop()
            except Exception:
                pass

        listener = asyncio.create_task(listen())
        try:
            await loop.run(config)
        finally:
            listener.cancel()
            try:
                await listener
            except (asyncio.CancelledError, WebSocketDisconnect):
                pass

    except WebSocketDisconnect:
        if loop is not None:
            loop.stop()
    except CDPUnavailable as exc:
        await _safe_send(websocket, {"type": "ERROR", "error": str(exc)})
    except Exception as exc:  # pragma: no cover
        import traceback

        traceback.print_exc()
        await _safe_send(websocket, {"type": "ERROR", "error": str(exc)})


async def _safe_send(websocket: WebSocket, payload: dict[str, Any]) -> None:
    try:
        await websocket.send_json(payload)
    except Exception:
        pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
