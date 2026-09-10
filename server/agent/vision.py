"""Visual grounding: turn a screenshot plus a text target into a click point.

Why this module exists
----------------------
The DOM loop in loop.py picks an *index* from a list of real DOM nodes, which is
exact and cheap. It cannot drive anything that is not in the DOM: chess boards,
Sudoku grids, canvases, WebGL, PDFs, custom widgets.

Game mode therefore runs a different contract: the model is shown a screenshot
and answers with a point. That point is worthless unless the coordinate space is
pinned down on both sides of the call, so this module owns that contract
explicitly rather than leaving it implicit in a prompt string.

The measured coordinate contract
--------------------------------
Probed live against the model actually serving on the GPU box (gemma4-12b, the
encoder-free gemma4_unified architecture) on synthetic 3x3 colour grids:

    image 600x400   mean error  2.1 px   (max  3.4)
    image 800x600   mean error  4.2 px   (max 10.6)
    image 1000x700  mean error 10.9 px   (max 22.3)

That model emits a 0-1000 normalised square: x is scaled by the image WIDTH and
y by the image HEIGHT, independently. The same model also answers the
UI-TARS-style {"action": ..., "coordinate": [x, y]} convention, which
grounding.py already parses; parse_grounding_json below is the structured form
the prompt actually asks for, and grounding.py stays as the fallback adapter.

Error grows with image size, so the caller screenshots at CSS scale, never at
device scale: a 2x device-pixel-ratio capture doubles the coordinate error.

Keeping this honest
-------------------
A grounding call that cannot be validated is worse than no call at all - a wrong
click in a game is indistinguishable from a right one. Every failure mode
(unparseable output, target reported absent, coordinate outside the frame)
returns ok=False with a reason, and the executor refuses to click.
"""

from __future__ import annotations

import base64
import json
import re
import struct
from dataclasses import dataclass
from typing import Any

# ---------------------------------------------------------------------------
# Coordinate contract
# ---------------------------------------------------------------------------

# The normalised space the model answers in. Do not change one of these without
# changing the prompt and the de-normaliser together.
NORM_MAX = 1000.0

# Margin kept from the frame edge. A point in the last pixel row is almost
# always a mis-grounding, and clicking there can hit a scrollbar.
_EDGE_MARGIN_PX = 1


@dataclass(frozen=True)
class GroundedPoint:
    """A validated pointer action in screenshot pixel space."""

    ok: bool
    action: str | None = None
    x: int | None = None
    y: int | None = None
    x2: int | None = None
    y2: int | None = None
    text: str | None = None
    key: str | None = None
    submit: bool = False
    success: bool = True
    raw: str = ""
    error: str | None = None

    def as_dict(self) -> dict[str, Any]:
        if not self.ok:
            return {"ok": False, "action": "ground", "error": self.error}
        payload: dict[str, Any] = {
            "ok": True,
            "action": self.action,
            "x": self.x,
            "y": self.y,
        }
        if self.x2 is not None and self.y2 is not None:
            payload.update({"x2": self.x2, "y2": self.y2})
        if self.text is not None:
            payload["text"] = self.text
        if self.key is not None:
            payload["key"] = self.key
        return payload


# The vocabulary the executor accepts. Anything else is refused here rather than
# silently degrading into a click in the wrong place.
CLICK_ACTIONS = frozenset({"click", "double_click", "right_click", "hover"})
POINT_ACTIONS = CLICK_ACTIONS | {"type", "drag", "scroll", "key", "wait", "done"}

_ACTION_ALIASES: dict[str, str] = {
    "left_click": "click",
    "single_click": "click",
    "tap": "click",
    "left_single": "click",
    "left_double": "double_click",
    "dblclick": "double_click",
    "right_single": "right_click",
    "mouse_move": "hover",
    "move": "hover",
    "left_click_drag": "drag",
    "select": "drag",
    "input_text": "type",
    "type_text": "type",
    "press": "key",
    "keypress": "key",
    "finish": "done",
    "stop": "done",
}


def normalise_action(raw: Any) -> str | None:
    name = str(raw or "").strip().lower().replace(" ", "_")
    if not name:
        return None
    return _ACTION_ALIASES.get(name, name)


# ---------------------------------------------------------------------------
# Image helpers
# ---------------------------------------------------------------------------

_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def image_size(data: bytes) -> tuple[int, int] | None:
    """Read (width, height) straight out of the encoded image header.

    Deliberately dependency-free: the project ships no imaging library, and
    pulling one in just to read two integers would be a poor trade. Returns None
    for a format it cannot parse, which the caller treats as a hard failure
    rather than guessing a size.
    """
    if not data or len(data) < 24:
        return None

    # PNG: IHDR is always the first chunk, width/height at fixed offsets.
    if data.startswith(_PNG_MAGIC) and data[12:16] == b"IHDR":
        width, height = struct.unpack(">II", data[16:24])
        return int(width), int(height)

    # JPEG: walk the segment markers until a Start-Of-Frame.
    if data.startswith(b"\xff\xd8"):
        index = 2
        size = len(data)
        while index + 9 < size:
            if data[index] != 0xFF:
                index += 1
                continue
            marker = data[index + 1]
            if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
                index += 2
                continue
            segment_length = int.from_bytes(data[index + 2 : index + 4], "big")
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
                          0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                height = int.from_bytes(data[index + 5 : index + 7], "big")
                width = int.from_bytes(data[index + 7 : index + 9], "big")
                return int(width), int(height)
            index += 2 + segment_length
        return None

    return None


def detect_media_type(data: bytes) -> str:
    if data.startswith(_PNG_MAGIC):
        return "image/png"
    if data.startswith(b"\xff\xd8"):
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return "image/png"


def encode_data_uri(data: bytes, *, media_type: str | None = None) -> str:
    kind = media_type or detect_media_type(data)
    return "data:" + kind + ";base64," + base64.b64encode(data).decode("ascii")


# ---------------------------------------------------------------------------
# Prompt and schema
# ---------------------------------------------------------------------------

GROUNDING_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "action": {
            "type": "string",
            "enum": [
                "click",
                "double_click",
                "right_click",
                "hover",
                "drag",
                "type",
                "key",
                "scroll",
                "wait",
                "done",
            ],
        },
        "x": {"type": "number", "description": "0-1000 normalised x (scaled by image WIDTH)."},
        "y": {"type": "number", "description": "0-1000 normalised y (scaled by image HEIGHT)."},
        "x2": {"type": "number", "description": "Drag end, normalised."},
        "y2": {"type": "number", "description": "Drag end, normalised."},
        "text": {"type": "string", "description": "For type: the exact text to enter."},
        "key": {"type": "string", "description": "For key: Enter, Escape, ArrowLeft..."},
        "submit": {"type": "boolean", "description": "For type: press Enter afterwards."},
        "direction": {"type": "string", "enum": ["up", "down"]},
        "found": {
            "type": "boolean",
            "description": "False when the target is not visible on screen.",
        },
        "success": {"type": "boolean", "description": "For done: was the goal achieved?"},
    },
    "required": ["action", "found"],
}


GROUNDING_SYSTEM_PROMPT = """You are a precision GUI grounding engine driving a real browser with a mouse.
You are shown a screenshot and must answer with ONE JSON object, nothing else.

COORDINATE SYSTEM - THIS IS THE CRITICAL RULE
  x and y use a normalised 0-1000 scale over the image, NOT pixels.
  (0,0) is the very top-left pixel of the screenshot.
  (1000,1000) is the very bottom-right pixel.
  x is scaled by the image WIDTH and y by the image HEIGHT, independently.
  Example: the centre of a 1000x700 screenshot is x=500, y=500 - NOT y=350.

ACTIONS
  {"action":"click","x":500,"y":500,"found":true}                    left click a point
  {"action":"double_click","x":500,"y":500,"found":true}             double click a point
  {"action":"drag","x":120,"y":300,"x2":420,"y2":300,"found":true}   press, move, release
  {"action":"type","text":"hello","submit":true,"found":true}        type into the focused field
  {"action":"key","key":"Escape","found":true}                       press a keyboard key
  {"action":"scroll","direction":"down","found":true}                scroll the page
  {"action":"wait","found":true}                                     wait for an animation
  {"action":"done","success":true,"found":true}                      goal achieved, or game over

RULES
1. Click the CENTRE of the target element, not its edge.
2. If the target is not visible in this screenshot, set "found" to false. Never guess.
3. Prefer a click over a drag when both would work: click the source now, then
   click the destination on the next step. Drags are fragile.
4. Never click outside the image bounds.
5. The whole visible page is fair game. Menus, modals, cookie banners and consent
   buttons often have to be handled before the main goal.
6. Call done the moment the goal is achieved, or as soon as the game is over
   (checkmate, stalemate, a win/lose dialog, or a finished puzzle). Do not keep
   exploring once the outcome is decided.
7. Answer with the JSON object only. No prose, no markdown, no code fences."""


def build_grounding_user_prompt(
    task: str,
    *,
    step: int,
    max_steps: int,
    page_context: str = "",
    history: str = "",
    warning: str = "",
) -> str:
    """Assemble the volatile user block for one grounding step.

    The goal goes last: a small model weights the most recent tokens most
    heavily, and putting the page dump after the goal measurably made earlier
    iterations explore instead of act.
    """
    parts: list[str] = []
    if history:
        parts.append("<history>\n" + history + "\n</history>")
    if page_context:
        parts.append("<page>\n" + page_context + "\n</page>")
    if warning:
        parts.append("<warning>\n" + warning + "\n</warning>")
    parts.append("<goal>\n" + task + "\n</goal>")
    parts.append(
        "<step>Step " + str(step) + " of at most " + str(max_steps) + ". Answer with the "
        "single next action as JSON. If the goal above is already achieved, or the "
        'game is over, reply {"action":"done","success":true,"found":true}.</step>'
    )
    return "\n\n".join(parts)


def describe_grounded(point: GroundedPoint) -> str:
    """Human-readable label for the UI, synthesised without spending tokens."""
    if not point.ok:
        return "Grounding failed: " + str(point.error)
    name = point.action or "?"
    if name in CLICK_ACTIONS and point.x is not None:
        return name.replace("_", " ") + " at (" + str(point.x) + ", " + str(point.y) + ")"
    if name == "drag":
        return "drag (" + str(point.x) + ", " + str(point.y) + ") to (" + str(point.x2) + ", " + str(point.y2) + ")"
    if name == "type":
        return "type " + repr(str(point.text or "")[:40])
    if name == "key":
        return "press " + str(point.key)
    if name == "scroll":
        return "scroll " + str(point.key or "down")
    if name == "wait":
        return "wait"
    if name == "done":
        return "finish"
    return name


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)
_NOT_FOUND_MARKERS = (
    "not found",
    "cannot find",
    "can't find",
    "no such element",
    "unable to locate",
    "not visible on screen",
)


def _extract_object(raw: str) -> dict[str, Any] | None:
    text = (raw or "").strip()
    if not text:
        return None
    try:
        value = json.loads(text)
        if isinstance(value, dict):
            return value
    except json.JSONDecodeError:
        pass
    # Tolerates a fenced block or surrounding prose: the regex finds the object
    # itself, so there is no need to strip fences first.
    match = _JSON_OBJECT_RE.search(text)
    if match:
        try:
            value = json.loads(match.group(0))
            if isinstance(value, dict):
                return value
        except json.JSONDecodeError:
            return None
    return None


def _to_pixels(value: Any, extent: int) -> int | None:
    """Map one normalised coordinate onto a pixel axis.

    Two different kinds of "outside" are treated differently, deliberately:

      * A value outside the 0-1000 domain the model was given is a bad answer and
        is refused. Clamping it would turn a nonsense grounding into a
        plausible-looking click at the frame edge.
      * A value inside the domain that lands on the outermost pixel is a
        legitimate answer ("the thing at the very left"), so it is inset by the
        edge margin rather than refused. The margin exists because a click on the
        last pixel row can hit a scrollbar, not to make x=0 unreachable.
    """
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number or number in (float("inf"), float("-inf")):  # NaN / inf
        return None
    if number < 0 or number > NORM_MAX:
        return None

    pixel = int(round(number / NORM_MAX * extent))
    return max(_EDGE_MARGIN_PX, min(pixel, extent - 1 - _EDGE_MARGIN_PX))


def parse_grounding_json(raw: str, *, width: int, height: int) -> GroundedPoint:
    """Validate a grounding reply against the frame it was grounded on.

    Never raises. Inspect result.ok; result.error says exactly what was wrong, so
    a failed grounding becomes a visible, debuggable event instead of a silently
    missed click.
    """
    if width <= 0 or height <= 0:
        return GroundedPoint(ok=False, raw=raw or "", error="bad frame size " + str(width) + "x" + str(height))

    text = (raw or "").strip()
    if not text:
        return GroundedPoint(ok=False, raw="", error="empty grounding response")

    blob = _extract_object(text)
    if blob is None:
        lowered = text.lower()
        if any(marker in lowered for marker in _NOT_FOUND_MARKERS):
            return GroundedPoint(ok=False, raw=text, error="target not found on screen")
        return GroundedPoint(ok=False, raw=text, error="no JSON object in the grounding reply")

    action = normalise_action(blob.get("action"))
    if action is None:
        return GroundedPoint(ok=False, raw=text, error="grounding reply has no action")

    # The model's own "I cannot see it" answer. Honoured only for pointer
    # actions: a model that answers done or scroll is not claiming a missed
    # element, and the schema forces a found field it may fill carelessly.
    if blob.get("found") is False and action in CLICK_ACTIONS:
        return GroundedPoint(ok=False, raw=text, error="target not visible in the screenshot")

    if action not in POINT_ACTIONS:
        return GroundedPoint(
            ok=False, raw=text, error="unsupported grounding action " + repr(action)
        )

    if action == "done":
        return GroundedPoint(
            ok=True, action="done", success=bool(blob.get("success", True)), raw=text
        )

    if action == "wait":
        return GroundedPoint(ok=True, action="wait", raw=text)

    if action == "scroll":
        direction = str(blob.get("direction") or "down").lower()
        return GroundedPoint(
            ok=True,
            action="scroll",
            key=direction if direction in ("up", "down") else "down",
            raw=text,
        )

    if action == "key":
        key = str(blob.get("key") or "").strip()
        if not key:
            return GroundedPoint(ok=False, raw=text, error="key action with no key name")
        return GroundedPoint(ok=True, action="key", key=key, raw=text)

    if action == "type":
        value = blob.get("text")
        if value is None:
            return GroundedPoint(ok=False, raw=text, error="type action with no text")
        x = _to_pixels(blob.get("x"), width) if blob.get("x") is not None else None
        y = _to_pixels(blob.get("y"), height) if blob.get("y") is not None else None
        return GroundedPoint(
            ok=True,
            action="type",
            x=x,
            y=y,
            text=str(value),
            submit=bool(blob.get("submit", False)),
            raw=text,
        )

    # Pointer actions need a validated point.
    x = _to_pixels(blob.get("x"), width)
    y = _to_pixels(blob.get("y"), height)
    if x is None or y is None:
        return GroundedPoint(
            ok=False,
            raw=text,
            error=(
                "coordinate (" + repr(blob.get("x")) + ", " + repr(blob.get("y"))
                + ") does not map inside the " + str(width) + "x" + str(height) + " frame"
            ),
        )

    if action == "drag":
        x2 = _to_pixels(blob.get("x2"), width)
        y2 = _to_pixels(blob.get("y2"), height)
        if x2 is None or y2 is None:
            return GroundedPoint(
                ok=False,
                raw=text,
                error="drag needs both a start and an end inside the frame",
            )
        return GroundedPoint(ok=True, action="drag", x=x, y=y, x2=x2, y2=y2, raw=text)

    return GroundedPoint(ok=True, action=action, x=x, y=y, raw=text)
