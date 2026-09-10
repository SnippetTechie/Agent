"""Grounding-model adapter: turn a GUI-grounding VLM's output into a coordinate.

Why this module exists
----------------------
`GroundNext-7B-V0` (and UI-TARS-style models) do not emit our action schema. They
emit a tool call:

    <tool_call>{"name": "computer_use", "arguments":
        {"action": "left_click", "coordinate": [742, 386]}}</tool_call>

The reasoning model (`gemma4`) emits our strict JSON action object. Those are two
different contracts, and the agent loop must not care which one it is holding.

This module is the single place that knows the grounding dialect. It:

  * extracts the tool call even when the model wraps it in prose,
  * normalises the action name into our vocabulary,
  * bounds-checks the coordinate against the real screenshot size,
  * returns a typed result rather than raising into the loop, so a bad grounding
    response degrades into a visible failure instead of a crashed step.

Coordinate contract
-------------------
GroundNext is documented as returning coordinates already scaled to the screen
dimensions it was told about via the system prompt. We therefore treat incoming
coordinates as absolute pixels in that screen space and validate them against the
same width/height. If a future model returns 0-1000 normalised values instead,
that model belongs behind a separate normaliser — silently auto-detecting units
is how clicks land in the wrong place.

Action space
------------
GroundNext's documented action space is mouse click only. We accept the click
family and the two drag-ish variants some grounding models emit, and reject
everything else explicitly rather than guessing.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

# ---------------------------------------------------------------------------
# Vocabulary
# ---------------------------------------------------------------------------

# Grounding-model action name -> our internal action name.
_ACTION_ALIASES: dict[str, str] = {
    "left_click": "click_at",
    "click": "click_at",
    "left_single": "click_at",
    "single_click": "click_at",
    "tap": "click_at",
    "double_click": "dblclick_at",
    "left_double": "dblclick_at",
    "right_click": "rightclick_at",
    "right_single": "rightclick_at",
    "hover": "hover_at",
    "mouse_move": "hover_at",
    "move": "hover_at",
    "drag": "drag_to",
    "left_click_drag": "drag_to",
    "select": "drag_to",
}

# Actions this module is willing to hand back to the executor.
SUPPORTED_ACTIONS: frozenset[str] = frozenset(_ACTION_ALIASES.values())

# A click at the very edge of a screenshot is almost always a mis-grounding, and
# on a real page it can hit OS chrome or a scrollbar. Reject the outer margin.
_EDGE_MARGIN_PX = 2

_TOOL_CALL_RE = re.compile(r"<tool_call>\s*(?P<body>.*?)\s*</tool_call>", re.DOTALL)
_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)

# Text that means "I could not find the element". Treated as a clean miss rather
# than a parse error, because it is a real, useful answer.
_NOT_FOUND_MARKERS = (
    "not found",
    "cannot find",
    "can't find",
    "no such element",
    "unable to locate",
    "not visible",
)


@dataclass(frozen=True)
class GroundingResult:
    """A validated grounding outcome.

    ``ok`` is False for every failure mode — unparseable output, unknown action,
    missing or out-of-bounds coordinates, element-not-found. Callers branch on
    ``ok`` and surface ``error``; they never see an exception.
    """

    ok: bool
    action: str | None = None
    x: int | None = None
    y: int | None = None
    x2: int | None = None
    y2: int | None = None
    raw: str = ""
    error: str | None = None

    def as_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"ok": self.ok}
        if self.ok:
            payload.update(
                {"action": self.action, "x": self.x, "y": self.y}
            )
            if self.x2 is not None and self.y2 is not None:
                payload.update({"x2": self.x2, "y2": self.y2})
        elif self.error:
            payload["error"] = self.error
        return payload


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

def _extract_json_blob(raw: str) -> dict[str, Any] | None:
    """Pull the tool-call object out of the model's output.

    Tries the tool_call wrapper first, then falls back to the first JSON object
    in the text, because grounding models sometimes drop the tags.
    """
    text = (raw or "").strip()
    if not text:
        return None

    match = _TOOL_CALL_RE.search(text)
    candidate = match.group("body") if match else text

    try:
        value = json.loads(candidate)
        if isinstance(value, dict):
            return value
    except json.JSONDecodeError:
        pass

    # Tolerate prose around a bare object.
    obj_match = _JSON_OBJECT_RE.search(candidate)
    if obj_match:
        for text_variant in (obj_match.group(0), text):
            try:
                value = json.loads(text_variant)
                if isinstance(value, dict):
                    return value
            except json.JSONDecodeError:
                continue
    return None


def _unwrap_arguments(blob: dict[str, Any]) -> dict[str, Any] | None:
    """Accept both the wrapped and the already-flat tool-call shapes."""
    if not isinstance(blob, dict):
        return None

    # Shape 1: {"name": "computer_use", "arguments": {...}}
    args = blob.get("arguments")
    if isinstance(args, dict):
        return args
    if isinstance(args, str):
        try:
            inner = json.loads(args)
            if isinstance(inner, dict):
                return inner
        except json.JSONDecodeError:
            return None

    # Shape 2: the arguments object directly.
    if "action" in blob or "coordinate" in blob or "coordinates" in blob:
        return blob
    return None


def _coerce_point(value: Any, width: int, height: int) -> tuple[int, int] | None:
    """Validate one coordinate pair against the screen it was grounded on."""
    if isinstance(value, dict):
        # Some models emit {"x": .., "y": ..} instead of a list.
        if "x" in value and "y" in value:
            value = [value["x"], value["y"]]
        else:
            return None

    if not isinstance(value, (list, tuple)) or len(value) < 2:
        return None

    try:
        x = int(round(float(value[0])))
        y = int(round(float(value[1])))
    except (TypeError, ValueError):
        return None

    if not (0 <= x < width and 0 <= y < height):
        return None
    # Reject the outer margin — see _EDGE_MARGIN_PX.
    if x < _EDGE_MARGIN_PX or y < _EDGE_MARGIN_PX:
        return None
    if x > width - 1 - _EDGE_MARGIN_PX or y > height - 1 - _EDGE_MARGIN_PX:
        return None

    return x, y


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def parse_grounding_response(
    raw: str,
    *,
    width: int,
    height: int,
) -> GroundingResult:
    """Normalise a grounding model's output into a validated action record.

    ``width``/``height`` must be the pixel dimensions of the screenshot that was
    actually sent to the model, in the same coordinate space it was asked to
    ground in. Passing a stale size is the main way a correct-looking coordinate
    becomes a wrong click, so this is a required argument.

    Never raises. Inspect ``result.ok``.
    """
    if width <= 0 or height <= 0:
        return GroundingResult(
            ok=False, raw=raw or "", error=f"invalid screen size {width}x{height}"
        )

    text = (raw or "").strip()
    if not text:
        return GroundingResult(ok=False, raw="", error="empty grounding response")

    lowered = text.lower()
    if any(marker in lowered for marker in _NOT_FOUND_MARKERS):
        # A legitimate "target not visible" answer, not a parse failure.
        return GroundingResult(ok=False, raw=text, error="target not found on screen")

    blob = _extract_json_blob(text)
    if blob is None:
        return GroundingResult(
            ok=False, raw=text, error="could not parse a JSON tool call from the response"
        )

    args = _unwrap_arguments(blob)
    if args is None:
        return GroundingResult(ok=False, raw=text, error="tool call has no arguments object")

    raw_action = str(args.get("action", "")).strip().lower()
    if not raw_action:
        return GroundingResult(ok=False, raw=text, error="tool call has no 'action' field")

    action = _ACTION_ALIASES.get(raw_action)
    if action is None:
        return GroundingResult(
            ok=False,
            raw=text,
            error=(
                f"unsupported grounding action '{raw_action}' "
                f"(supported: {', '.join(sorted(_ACTION_ALIASES))})"
            ),
        )

    coords = args.get("coordinate", args.get("coordinates"))
    if coords is None:
        return GroundingResult(
            ok=False, raw=text, error=f"action '{raw_action}' has no coordinate"
        )

    # Drags carry two points. Some models emit [[x1,y1],[x2,y2]], others
    # [x1,y1,x2,y2] flattened.
    if (
        action == "drag_to"
        and isinstance(coords, (list, tuple))
        and len(coords) >= 4
        and not isinstance(coords[0], (list, tuple, dict))
    ):
        coords = [coords[0:2], coords[2:4]]

    if action == "drag_to":
        if not isinstance(coords, (list, tuple)) or len(coords) < 2:
            return GroundingResult(
                ok=False, raw=text, error="drag requires a start and an end coordinate"
            )
        start = _coerce_point(coords[0], width, height)
        end = _coerce_point(coords[1], width, height)
        if start is None or end is None:
            return GroundingResult(
                ok=False,
                raw=text,
                error=f"drag coordinate outside {width}x{height}",
            )
        return GroundingResult(
            ok=True, action=action, x=start[0], y=start[1], x2=end[0], y2=end[1], raw=text
        )

    point = _coerce_point(coords, width, height)
    if point is None:
        return GroundingResult(
            ok=False,
            raw=text,
            error=(
                f"coordinate {coords!r} is outside the {width}x{height} screen "
                "(or in the rejected edge margin)"
            ),
        )
    return GroundingResult(ok=True, action=action, x=point[0], y=point[1], raw=text)


def build_grounding_prompt(target: str, *, width: int, height: int) -> str:
    """Build the grounding instruction, with the real screen size stated.

    GroundNext's card is explicit that the system prompt must carry the actual
    screen dimensions, because that is the space its coordinates refer to.
    """
    return (
        f"The screen is {width}x{height} pixels.\n"
        f"Ground this element and return the mouse click action:\n"
        f"  {target}\n"
    )
