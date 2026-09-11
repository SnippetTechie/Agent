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

from server.agent import (  # noqa: E402
    AgentLoop,
    AgentRunConfig,
    BrowserSessionManager,
    GameLoop,
    GameRunConfig,
    VLLMClient,
)
from server.agent.llm import VLLMError  # noqa: E402
from server.agent.session import CDPUnavailable  # noqa: E402
from server.agent.extension_session import ExtensionSession  # noqa: E402
from server.redaction.pii_detector import detector  # noqa: E402

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

def _load_dotenv(path: Path) -> None:
    """Minimal stdlib-only .env loader.

    Never overrides a variable already present in the environment, so an
    explicit shell export always wins over the file. Values are taken verbatim
    apart from surrounding quotes; ``#`` comments and blank lines are skipped.
    """
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


# Load before any setting is read below.
ENV_FILE = ROOT_DIR / "server" / ".env"
_load_dotenv(ENV_FILE)

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
# The name the operator asked for, kept separately from llm.model because
# resolve_model() silently rewrites llm.model to whatever is actually serving.
# Comparing against this is what makes "your configured model is not the model
# answering" visible instead of an invisible fallback.
CONFIGURED_VLLM_MODEL = VLLM_MODEL
VLLM_MAX_TOKENS = int(os.getenv("VLLM_MAX_TOKENS", "512"))

GROUNDING_BASE_URL = os.getenv("GROUNDING_BASE_URL", "http://127.0.0.1:8000/v1")
GROUNDING_MODEL = os.getenv("GROUNDING_MODEL", "gemma4-12b")
GROUNDING_MAX_TOKENS = int(os.getenv("GROUNDING_MAX_TOKENS", "256"))
# Points at the same endpoint as the reasoning model by default, because the
# deployment that actually runs today is gemma-only: the served gemma4-12b is a
# vision model and grounds coordinates well enough to play a board game (2-11px
# measured error, see agent/vision.py). Setting GROUNDING_BASE_URL to :8001 and
# GROUNDING_MODEL to a dedicated grounding model switches game mode onto it the
# moment one is loaded - no code change.
GROUNDING_ENABLED = os.getenv("GROUNDING_ENABLED", "1") != "0"

# Chrome DevTools Protocol endpoint of the browser the user is already using.
CDP_URL = os.getenv("CDP_URL", "http://localhost:9222")

MAX_STEPS = int(os.getenv("AGENT_MAX_STEPS", "15"))
MAX_ACTIONS_PER_STEP = int(os.getenv("AGENT_MAX_ACTIONS_PER_STEP", "3"))
# Game mode runs a longer horizon: one cell at a time on a Sudoku grid is dozens
# of steps, and a chess opening is dozens of moves.
GAME_MAX_STEPS = int(os.getenv("GAME_MAX_STEPS", "60"))
GAME_STALL_THRESHOLD = int(os.getenv("GAME_STALL_THRESHOLD", "4"))
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

# Precision/grounding client. Same class, possibly the same endpoint: when no
# dedicated grounding model is loaded this points at the reasoning model, which
# is why it is mutable - the precision role can be retargeted without a restart.
# A grounding reply is one small JSON object, never prose, so the budget is small.
grounding_llm = VLLMClient(
    base_url=GROUNDING_BASE_URL,
    model=GROUNDING_MODEL,
    max_tokens=GROUNDING_MAX_TOKENS,
    temperature=0.0,
)


def configure_precision_endpoint(base_url: str, model: str) -> None:
    """Point the precision role at an endpoint, reusing the HTTP client.

    The client is long-lived on purpose (connection reuse dominates at ~1s per
    grounded step), so retargeting mutates it rather than building a new one.
    """
    global GROUNDING_BASE_URL, GROUNDING_MODEL
    GROUNDING_BASE_URL = base_url.rstrip("/")
    GROUNDING_MODEL = model
    grounding_llm.base_url = GROUNDING_BASE_URL
    grounding_llm.model = model


# ---------------------------------------------------------------------------
# Model registry
# ---------------------------------------------------------------------------
#
# Two roles, and they do not have to be two processes:
#
#   reasoning  /chat and DOM browsing. Predicts an action index from a
#              textual element map. Any instruction-following LLM serves this.
#   precision  Game mode. Receives a screenshot and grounds a point in 0-1000
#              normalised coordinates. Needs a vision-capable model.
#
# A model advertised here is one the operator has declared as loaded; the panel
# only offers these, so it cannot ask for a model that does not exist.

PRECISION_TASKS: tuple[str, ...] = ("chess", "sudoku")
NORMAL_TASKS: tuple[str, ...] = ("browsing", "search", "wikipedia", "whatsapp")


def _build_catalog() -> list[dict[str, Any]]:
    """The models this deployment can be asked for, with their capabilities.

    Declared in server/.env as MODELS=<id>,<id>,... and optionally annotated for
    capabilities with MODEL_VISION=<id>,<id>. Read once at import, like the rest
    of the configuration, so the catalog cannot silently change under a running
    server. Anything the endpoint is serving that we did not declare is appended
    at runtime by model_catalog(), so the panel still shows the truth when
    someone else's launcher is occupying the port.
    """
    declared = [m.strip() for m in os.getenv("MODELS", "").split(",") if m.strip()]
    vision_ids = {m.strip() for m in os.getenv("MODEL_VISION", "").split(",") if m.strip()}

    if not declared:
        declared = [VLLM_MODEL]
        # The deployed gemma4-12b is explicitly vision-capable: it is served from
        # an AWQ checkpoint of the gemma4_unified multimodal architecture.
        vision_ids.add(VLLM_MODEL)

    entries: list[dict[str, Any]] = []
    for model_id in declared:
        vision = _is_vision_model(model_id, vision_ids)
        entries.append(
            {
                "id": model_id,
                "vision": vision,
                "modes": ["normal", "game"] if vision else ["normal"],
                "tasks": list(NORMAL_TASKS) + (list(PRECISION_TASKS) if vision else []),
                "reasoning": True,
                "precision": vision,
            }
        )
    return entries


def _is_vision_model(model_id: str, declared: set[str] | None = None) -> bool:
    """Whether a model id is known to accept image input.

    Declared explicitly with MODEL_VISION; the gemma4 family is multimodal by
    construction, so it is recognised without configuration.
    """
    if declared is None:
        declared = {m.strip() for m in os.getenv("MODEL_VISION", "").split(",") if m.strip()}
    if model_id in declared:
        return True
    lowered = model_id.lower()
    return "gemma4" in lowered or "gemma-4" in lowered or "-vl" in lowered or "vision" in lowered


# The declared catalog, frozen at import. model_catalog() layers the runtime view
# (what is actually being served) on top of it.
DECLARED_MODELS: list[dict[str, Any]] = _build_catalog()


def _known_models() -> list[dict[str, Any]]:
    """A copy of the declared catalog; callers may append the runtime view."""
    return [dict(entry) for entry in DECLARED_MODELS]

session = BrowserSessionManager(
    cdp_url=CDP_URL,
    show_overlay=SHOW_OVERLAY,
    show_cursor=SHOW_CURSOR,
    auto_redact=AUTO_REDACT,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Own the shared HTTP, CDP connections, and PII detector for the process lifetime."""
    # Pre-warm or background-load the LiquidAI PII detector model
    asyncio.create_task(asyncio.to_thread(detector.load_model))
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
    """Coarse, synchronous guess at whether the precision port is open.

    Not a readiness answer, and no longer used to decide anything: an open TCP
    port does not mean a model is serving. Kept because callers outside this
    module may still ask.
    """
    return _port_open(GROUNDING_BASE_URL, 8001)


async def _answers(client: VLLMClient) -> bool:
    """True only when the endpoint returns a real model list.

    An open TCP port is NOT proof that a model is serving. The GPU box is reached
    through an SSH tunnel, so a forwarded port accepts connections even when
    nothing is listening on the far end. That produced a "reachable" model with
    an empty model list - exactly the state that fails a demo with a confusing
    error at the first grounded click. Ask for the model list and require an
    answer.
    """
    try:
        models = await client.list_models()
    except Exception:
        return False
    return bool(models)


async def precision_endpoint() -> dict[str, Any]:
    """Resolve which endpoint actually answers grounding calls right now.

    Preference order:

      1. A dedicated grounding model on GROUNDING_BASE_URL, when one is loaded.
      2. The reasoning endpoint, when its model can accept an image. This is the
         deployed gemma-only case: gemma4-12b is multimodal, so one process
         serves both roles.
      3. Nothing. Game mode is then refused with a reason the panel can show.

    The fallback is explicit and reported in the "source" field, never silent.
    A silent fallback is how "why is a different model answering?" becomes
    unanswerable.
    """
    if not GROUNDING_ENABLED:
        return {
            "ready": False,
            "source": "disabled",
            "base_url": GROUNDING_BASE_URL,
            "model": grounding_llm.model,
            "reason": "The precision role is switched off (GROUNDING_ENABLED=0).",
        }

    dedicated = GROUNDING_BASE_URL != VLLM_BASE_URL
    if dedicated and await _answers(grounding_llm):
        return {
            "ready": True,
            "source": "dedicated",
            "base_url": GROUNDING_BASE_URL,
            "model": grounding_llm.model,
            "reason": "",
        }

    if await _answers(llm):
        vision_model = llm.model
        if _is_vision_model(vision_model):
            # Point the precision client at the reasoning endpoint, so a grounded
            # call reaches the model that can actually see the screenshot.
            if grounding_llm.base_url != VLLM_BASE_URL or grounding_llm.model != vision_model:
                configure_precision_endpoint(VLLM_BASE_URL, vision_model)
            return {
                "ready": True,
                "source": "reasoning_vision",
                "base_url": VLLM_BASE_URL,
                "model": vision_model,
                "reason": "",
            }
        return {
            "ready": False,
            "source": "no_vision",
            "base_url": GROUNDING_BASE_URL,
            "model": grounding_llm.model,
            "reason": (
                "The selected model '" + vision_model + "' cannot accept images, so it "
                "cannot ground a click. Switch to a vision model, or load a dedicated "
                "grounding model on " + GROUNDING_BASE_URL + "."
            ),
        }

    return {
        "ready": False,
        "source": "unreachable",
        "base_url": GROUNDING_BASE_URL,
        "model": grounding_llm.model,
        "reason": (
            "No model endpoint is answering. Start a model, then press Refresh."
            if dedicated
            else "No model is loaded on " + VLLM_BASE_URL + ". Start one, then press Refresh."
        ),
    }


async def precision_reachable() -> bool:
    """True when game mode can actually run right now."""
    resolved = await precision_endpoint()
    return bool(resolved["ready"])


async def precision_model_name() -> str | None:
    """The model that would answer a grounding call, or None if none would."""
    resolved = await precision_endpoint()
    return str(resolved["model"]) if resolved["ready"] else None


async def capabilities() -> dict[str, Any]:
    """What the panel should offer right now, and why."""
    resolved = await precision_endpoint()
    ready = bool(resolved["ready"])
    return {
        "normal": list(NORMAL_TASKS),
        "game": list(PRECISION_TASKS) if ready else [],
        "precision_ready": ready,
        "precision_source": resolved["source"],
        "precision_model": resolved["model"] if ready else None,
        "precision_reason": "" if ready else str(resolved["reason"]),
    }


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

async def model_catalog() -> dict[str, Any]:
    """Everything the panel needs to describe the current model situation.

    One source of truth for "which model is loaded, what can it do, and what went
    wrong if not". The panel polls this while a model loads, so reachability is
    reported per role rather than as a single boolean.
    """
    catalog_caps = await capabilities()
    reasoning_models = await llm.list_models() if vllm_reachable() else []
    precision_models = (
        await grounding_llm.list_models()
        if GROUNDING_BASE_URL != VLLM_BASE_URL
        else reasoning_models
    )

    # A wrong alias is reported explicitly. vLLM's model resolver falls back to
    # the first served model, which silently hides a typo - the classic "why is
    # the model answering nonsense" symptom.
    # Compared against the CONFIGURED name, not llm.model, which resolve_model()
    # may already have rewritten to the first served model. Otherwise a typo'd
    # VLLM_MODEL reports alias_ok=true and the mismatch stays invisible.
    reasoning_alias_ok = (not reasoning_models) or (CONFIGURED_VLLM_MODEL in reasoning_models)
    precision_alias_ok = (not precision_models) or (grounding_llm.model in precision_models)

    declared = _known_models()
    declared_ids = {entry["id"] for entry in declared}
    # Anything the endpoints are serving that was not declared is still shown, so
    # a foreign launcher occupying the port cannot hide behind a tidy list.
    for served in reasoning_models + precision_models:
        if served in declared_ids:
            continue
        vision = _is_vision_model(served)
        declared.append(
            {
                "id": served,
                "vision": vision,
                "modes": ["normal", "game"] if vision else ["normal"],
                "tasks": list(NORMAL_TASKS) + (list(PRECISION_TASKS) if vision else []),
                "reasoning": True,
                "precision": vision,
                "undeclared": True,
            }
        )
        declared_ids.add(served)

    return {
        "server_up": True,
        "catalog": declared,
        "roles": {
            "reasoning": {
                "base_url": VLLM_BASE_URL,
                "model": llm.model,
                "configured_model": CONFIGURED_VLLM_MODEL,
                "reachable": vllm_reachable(),
                "available_models": reasoning_models,
                "alias_ok": reasoning_alias_ok,
            },
            "precision": {
                "base_url": GROUNDING_BASE_URL,
                "model": grounding_llm.model,
                "reachable": catalog_caps["precision_ready"],
                "enabled": GROUNDING_ENABLED,
                "available_models": precision_models,
                "alias_ok": precision_alias_ok,
                "source": catalog_caps["precision_source"],
                "load_state": (
                    "ready"
                    if catalog_caps["precision_ready"]
                    else ("disabled" if not GROUNDING_ENABLED else "loading")
                ),
            },
        },
        "capabilities": catalog_caps,
    }


@app.get("/health")
async def health() -> dict[str, Any]:
    catalog = await model_catalog()
    caps = catalog["capabilities"]

    return {
        "status": "ok",
        "engine": "varma-native-cdp",
        # Kept in the old shape: an older panel build reads these two keys
        # directly and must not break just because the model story got richer.
        "vllm": catalog["roles"]["reasoning"],
        "grounding": catalog["roles"]["precision"],
        "models": catalog["catalog"],
        "roles": catalog["roles"],
        "capabilities": caps,
        "cdp": {
            "url": CDP_URL,
            "reachable": cdp_reachable(),
            "connected": session.connected,
        },
        "config": {
            "max_steps": MAX_STEPS,
            "max_actions_per_step": MAX_ACTIONS_PER_STEP,
            "game_max_steps": GAME_MAX_STEPS,
            "overlay": SHOW_OVERLAY,
            "cursor": SHOW_CURSOR,
            "auto_redact": AUTO_REDACT,
            "approval_mode": DEFAULT_APPROVAL_MODE,
            "approval_timeout_s": APPROVAL_TIMEOUT,
            "available_tasks": caps["normal"] + caps["game"],
            "normal_tasks": caps["normal"],
            "game_tasks": caps["game"],
            "reasoning_ready": catalog["roles"]["reasoning"]["reachable"],
            "precision_ready": caps["precision_ready"],
            "precision_source": caps["precision_source"],
            "configured_model": CONFIGURED_VLLM_MODEL,
            "active_model": llm.model,
        },
        "last_step": {
            "observe_ms": round(session.last_observe_ms, 1),
            "action_ms": round(session.last_action_ms, 1),
            "llm_ms": round(llm.last_latency_ms, 1),
        },
    }


@app.get("/models")
async def get_models() -> dict[str, Any]:
    """The catalog the panel renders its switcher from."""
    return await model_catalog()


@app.post("/models/select")
async def select_model(request: Request) -> Any:
    """Switch the model the reasoning role uses.

    Deliberately does not load anything. A model has to be served on an
    OpenAI-compatible endpoint before it can be selected; loading it is a GPU
    operation owned by scripts/start_models.sh on the box that has the GPU. What
    this does is make "which model is answering" an explicit, inspectable choice
    instead of an accident of whatever the tunnel happens to point at.
    """
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "invalid JSON body"}, status_code=400)

    requested = str(data.get("model") or "").strip()
    if not requested:
        return JSONResponse({"ok": False, "error": "model is required"}, status_code=400)

    if not vllm_reachable():
        return JSONResponse(
            {
                "ok": False,
                "error": (
                    "No model endpoint is reachable at " + VLLM_BASE_URL
                    + ". Start the model, then retry."
                ),
                "load_state": "loading",
            },
            status_code=503,
        )

    served = await llm.list_models()
    if served and requested not in served:
        return JSONResponse(
            {
                "ok": False,
                "error": (
                    "Model '" + requested + "' is not loaded on " + VLLM_BASE_URL
                    + ". Serving: " + ", ".join(served)
                ),
                "load_state": "not_loaded",
                "available_models": served,
            },
            status_code=404,
        )

    previous = llm.model
    llm.model = requested

    catalog = await model_catalog()
    entry = next((m for m in catalog["catalog"] if m["id"] == requested), None)

    # A vision-capable reasoning model also serves the precision role while no
    # dedicated grounding endpoint is configured. That is what makes game mode
    # work on a gemma-only deployment.
    precision_note = ""
    if grounding_llm.base_url == VLLM_BASE_URL:
        grounding_llm.model = requested
        precision_note = "Precision role follows the reasoning model."

    return {
        "ok": True,
        "selected": requested,
        "previous": previous,
        "vision": bool(entry and entry.get("vision")),
        "modes": (entry or {}).get("modes", ["normal"]),
        "tasks": (entry or {}).get("tasks", list(NORMAL_TASKS)),
        "note": precision_note,
        "roles": catalog["roles"],
        "capabilities": catalog["capabilities"],
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


@app.post("/redact/detect")
async def detect_pii(request: Request) -> Any:
    """Detect PII entities in page text using LiquidAI LFM2.5 and deterministic rules."""
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "Invalid JSON body"}, status_code=400)

    text = str(data.get("text") or "").strip()
    elements = data.get("elements") or []

    # If full text wasn't provided, aggregate from elements
    if not text and elements:
        text = "\n".join(str(el.get("text") or el.get("label") or "") for el in elements if el)

    if not text:
        return {"ok": True, "spans": [], "targets": [], "count": 0}

    # If model is not loaded yet, ensure it is loaded before running
    if not detector.is_loaded:
        await asyncio.to_thread(detector.load_model)

    # Run detection (deterministic regex + neural LFM2.5)
    spans = await asyncio.to_thread(detector.detect, text)

    targets = [
        {"text": span.text, "tag": span.tag, "label": span.label}
        for span in spans
        if len(span.text.strip()) >= 3
    ]

    return {
        "ok": True,
        "spans": [span.to_dict() for span in spans],
        "targets": targets,
        "count": len(targets),
        "model_loaded": detector.is_loaded,
    }


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

    # Either loop streams the same events; the listener only needs .stop/.approve.
    loop: AgentLoop | GameLoop | None = None
    active_session: Any = session

    try:
        init = await websocket.receive_json()
        if init.get("type") != "START_TASK":
            await websocket.send_json({"type": "ERROR", "error": "Expected START_TASK"})
            return

        task = str(init.get("task", "")).strip()
        if not task:
            await websocket.send_json({"type": "ERROR", "error": "Empty task"})
            return

        requested_mode = str(init.get("mode") or "normal").lower()
        if requested_mode not in ("normal", "game"):
            requested_mode = "normal"

        # Universal browser support: if CDP is not reachable, use ExtensionSession
        # to control the active tab directly via the extension without --remote-debugging-port
        supports_driver = bool(init.get("supports_driver", True))
        if not cdp_reachable():
            if supports_driver:
                active_session = ExtensionSession(
                    websocket,
                    auto_redact=bool(init.get("auto_redact", AUTO_REDACT)),
                    show_overlay=bool(init.get("show_overlay", SHOW_OVERLAY)),
                    show_cursor=bool(init.get("show_cursor", SHOW_CURSOR)),
                )
            else:
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

        # Game mode needs a model that can ground a point on a screenshot. Refuse
        # clearly rather than silently degrading into the DOM loop, which would
        # look like the agent ignoring the game and clicking page furniture.
        game_caps = await capabilities()
        if requested_mode == "game" and not game_caps["precision_ready"]:
            await websocket.send_json(
                {
                    "type": "ERROR",
                    "error": (
                        game_caps["precision_reason"]
                        or "No precision model is available for game mode."
                    ),
                    "mode": "game",
                    "needs": "precision_model",
                }
            )
            await websocket.close()
            return

        if requested_mode == "game":
            max_steps = int(init.get("max_steps") or GAME_MAX_STEPS)
        else:
            max_steps = int(init.get("max_steps") or MAX_STEPS)

        # Approval mode decides whether state-changing actions pause for the
        # panel. Unknown values fall back to "manual" (the safe default).
        approval_mode = str(init.get("approval_mode") or DEFAULT_APPROVAL_MODE).lower()
        if approval_mode not in ("manual", "auto", "skip"):
            approval_mode = "manual"

        # The side panel's settings decide the visual debug layer. Apply before
        # the run starts so the first perception already draws correctly.
        await active_session.apply_visuals(
            overlay=bool(init.get("show_overlay", SHOW_OVERLAY)),
            cursor=bool(init.get("show_cursor", SHOW_CURSOR)),
            redact=bool(init.get("auto_redact", AUTO_REDACT)),
        )

        # Tab scope: "single" pins the run to the attached tab.
        tab_scope = str(init.get("tab_scope") or "single").lower()
        active_session.tab_scope = "all" if tab_scope == "all" else "single"

        async def emit(event: dict[str, Any]) -> None:
            await websocket.send_json(event)

        loaded_reasoning_model = await llm.resolve_model(VLLM_MODEL)
        # Re-resolve after the model is chosen: which endpoint serves grounding
        # depends on what the reasoning role ended up on.
        caps = await capabilities()
        grounding_model = await precision_model_name()

        if requested_mode == "game":
            # Grounding runs on the precision client, which may be a different
            # endpoint or the same vision model wearing a second hat.
            loop = GameLoop(active_session, grounding_llm, on_event=emit)
            config: Any = GameRunConfig(
                task=task,
                max_steps=max_steps,
                stall_threshold=GAME_STALL_THRESHOLD,
                approval_mode=approval_mode,
                approval_timeout=APPROVAL_TIMEOUT,
                auto_approve_delay=AUTO_APPROVE_DELAY,
            )
        else:
            loop = AgentLoop(active_session, llm, on_event=emit)
            config = AgentRunConfig(
                task=task,
                max_steps=max_steps,
                max_actions_per_step=MAX_ACTIONS_PER_STEP,
                approval_mode=approval_mode,
                approval_timeout=APPROVAL_TIMEOUT,
                auto_approve_delay=AUTO_APPROVE_DELAY,
            )

        cdp_val = getattr(active_session, "cdp_url", CDP_URL)
        page_url = active_session.current_url() if hasattr(active_session, "current_url") else ""

        await websocket.send_json(
            {
                "type": "CONNECTED",
                "cdp_url": cdp_val,
                "url": page_url,
                "mode": requested_mode,
                "reasoning_model": loaded_reasoning_model,
                "grounding_model": grounding_model,
                "tasks": caps["normal"] + caps["game"],
                "capabilities": caps["normal"] + caps["game"],
            }
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
                    elif kind == "DRIVER_RESPONSE" and hasattr(active_session, "handle_driver_response"):
                        active_session.handle_driver_response(msg)
                    elif kind == "SET_VISUALS":
                        applied = await active_session.apply_visuals(
                            overlay=msg.get("overlay"),
                            cursor=msg.get("cursor"),
                            redact=msg.get("redact"),
                        )
                        # Re-draw immediately so toggling on mid-run is visible.
                        if applied and applied.get("overlay") and loop is not None:
                            await active_session.observe()
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