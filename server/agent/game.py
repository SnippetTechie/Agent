"""Game-mode loop: precision mouse control over a screenshot.

Why a second loop
-----------------
AgentLoop (loop.py) reasons over a DOM element list and picks an index. That is
exact, cheap and the right tool for browsing - but a chess board, a Sudoku grid
or a canvas game exposes no useful DOM nodes, so there is nothing to pick.

This loop swaps perception for pixels and the action space for a pointer:

    observe  - one screenshot of the viewport (CSS pixels, never device pixels)
    think    - one grounded action from the vision model, in 0-1000 coordinates
    act      - a real mouse click/drag/type via CDP at the mapped pixel

It keeps loop.py's shape deliberately: same event vocabulary, same approval
gate, same step budget, same stop handling. The extension therefore renders a
game run with no special casing beyond the mode badge.

Termination
-----------
The brief for game mode is "one prompt, then it plays until the game ends". Two
mechanisms enforce that, and both are load-bearing:

  * the model calls done, either because it won/lost/the puzzle is solved, or
    because it judged the goal met. This is the normal exit.
  * stall detection. A grounding model that cannot find its next move will
    happily re-emit the same coordinate forever. After stall_threshold identical
    consecutive placements the run is closed out as "no further progress"
    instead of burning the whole step budget.

Without the second mechanism a finished game would sit there clicking the same
square until max_steps ran out, which reads as a hang rather than an ending.

Every step carries a screenshot to the model, so this path is far more expensive
per step than the DOM loop (~1.1s of prefill and decode on the reference A6000).
That is the accepted cost of a mode that can drive things the DOM cannot
describe.
"""

from __future__ import annotations

import asyncio
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from . import vision
from .llm import VLLMClient, VLLMError
from .session import BrowserSessionManager, CDPUnavailable

EventHandler = Callable[[dict[str, Any]], Awaitable[None]]

# Pointer actions that change state and are therefore gated by approval mode.
# Reading, waiting and finishing never need a gate.
RISKY_ACTIONS: frozenset[str] = frozenset(
    {"click", "double_click", "right_click", "drag", "type", "key"}
)


@dataclass
class GameRunConfig:
    """Tunables for one game-mode run."""

    task: str
    # Games need a longer horizon than a browsing task: a single Sudoku cell at a
    # time is several dozen steps. The receiver's default stays lower for
    # browsing; game mode raises it.
    max_steps: int = 60
    # Consecutive identical grounded placements before the run is closed out as
    # stuck. See "Termination" above - this is what actually ends a finished game.
    stall_threshold: int = 4
    # Screenshot every step. Off only for a debugging run that wants the model to
    # reason from the accessibility text alone.
    use_screenshot: bool = True
    # Seconds between the click and the next screenshot. A board that animates its
    # pieces needs this or the next frame shows the move half-applied.
    settle_seconds: float = 0.35
    # How many previous moves to describe back to the model.
    history_window: int = 4

    approval_mode: str = "manual"
    approval_timeout: float = 180.0
    auto_approve_delay: float = 1.2

    done_text_fallback: str = "Game session finished."


@dataclass
class GameStepRecord:
    step: int
    thought: str = ""
    actions: list[dict[str, Any]] = field(default_factory=list)
    results: list[str] = field(default_factory=list)
    usage: dict[str, Any] = field(default_factory=dict)
    observe_ms: float = 0.0
    llm_ms: float = 0.0
    action_ms: float = 0.0

    @property
    def total_ms(self) -> float:
        return self.observe_ms + self.llm_ms + self.action_ms


class GameLoop:
    """Plays a game on the page with grounded mouse control."""

    def __init__(
        self,
        session: BrowserSessionManager,
        llm: VLLMClient,
        *,
        on_event: EventHandler | None = None,
    ) -> None:
        self.session = session
        self.llm = llm
        self.on_event = on_event
        self._stop = asyncio.Event()
        self._history: list[dict[str, Any]] = []
        self._step_records: list[GameStepRecord] = []

        self._approval_future: asyncio.Future[bool] | None = None
        self._denied = False

    # -- control -----------------------------------------------------------

    def stop(self) -> None:
        self._stop.set()
        self._resolve_approval(False)

    def approve(self) -> None:
        self._resolve_approval(True)

    def deny(self) -> None:
        self._denied = True
        self._resolve_approval(False)

    def _resolve_approval(self, approved: bool) -> None:
        future = self._approval_future
        if future is not None and not future.done():
            future.set_result(approved)

    @property
    def stopped(self) -> bool:
        return self._stop.is_set()

    @property
    def denied(self) -> bool:
        return self._denied

    @property
    def metrics(self) -> dict[str, Any]:
        if not self._step_records:
            return {}
        totals = [r.total_ms for r in self._step_records]
        count = len(self._step_records)
        return {
            "steps": count,
            "mode": "game",
            "avg_step_ms": round(sum(totals) / count, 1),
            "min_step_ms": round(min(totals), 1),
            "max_step_ms": round(max(totals), 1),
            "avg_observe_ms": round(sum(r.observe_ms for r in self._step_records) / count, 1),
            "avg_llm_ms": round(sum(r.llm_ms for r in self._step_records) / count, 1),
            "avg_action_ms": round(sum(r.action_ms for r in self._step_records) / count, 1),
        }

    # -- main --------------------------------------------------------------

    async def run(self, config: GameRunConfig) -> dict[str, Any]:
        self._stop.clear()
        self._history.clear()
        self._step_records.clear()
        # The on-page "Stop V.A.R.M.A" pill halts a game run exactly the way the
        # side panel's stop button does.
        self.session.on_stop_requested = self.stop

        started = time.perf_counter()

        try:
            page = await self.session.connect()
        except CDPUnavailable as exc:
            await self._emit({"type": "ERROR", "error": str(exc)})
            return {"success": False, "result": str(exc)}

        await self._emit(
            {"type": "CONNECTED", "cdp_url": self.session.cdp_url, "url": page.url, "mode": "game"}
        )

        final_text = ""
        success = False
        page_context: dict[str, Any] = {}
        recent: deque[str] = deque(maxlen=config.stall_threshold)

        for step in range(1, config.max_steps + 1):
            if self._stop.is_set():
                await self._emit({"type": "STOPPED", "reason": "User stopped the task"})
                return {"success": False, "result": "Stopped by user", "metrics": self.metrics}

            record = GameStepRecord(step=step)
            self._step_records.append(record)

            await self._emit({"type": "STEP_START", "step": step, "status": "Capturing screen..."})

            # -- 1. observe: a real screenshot -----------------------------
            observe_started = time.perf_counter()
            try:
                frame, page_context = await self._capture(config)
                await self.session.ensure_cursor_visible()
                await self.session.ensure_task_border()
                await self.session.ensure_stop_control()
            except Exception as exc:
                await self._emit({"type": "ERROR", "error": "Screen capture failed: " + str(exc)})
                return {"success": False, "result": str(exc), "metrics": self.metrics}

            record.observe_ms = (time.perf_counter() - observe_started) * 1000.0

            await self._emit(
                {
                    "type": "PAGE_STATE",
                    "step": step,
                    "url": page_context.get("url", ""),
                    "title": page_context.get("title", ""),
                    "elements": [],
                    "observe_ms": round(record.observe_ms, 1),
                    "frame": {"width": frame["width"], "height": frame["height"]},
                }
            )

            # -- 2. think: one grounded action -----------------------------
            await self._emit({"type": "STEP_START", "step": step, "status": "Grounding action..."})

            warning = self._stall_warning(recent)
            user_prompt = vision.build_grounding_user_prompt(
                config.task,
                step=step,
                max_steps=config.max_steps,
                page_context=_render_page_context(page_context),
                history=_render_history(self._history, config.history_window),
                warning=warning,
            )

            llm_started = time.perf_counter()
            try:
                reply = await self._ask_model(frame, user_prompt, config)
            except VLLMError as exc:
                await self._emit({"type": "ERROR", "error": "Vision model error: " + str(exc)})
                return {"success": False, "result": str(exc), "metrics": self.metrics}

            record.llm_ms = (time.perf_counter() - llm_started) * 1000.0
            record.usage = reply.get("usage", {})

            point = vision.parse_grounding_json(
                reply.get("text", ""), width=frame["width"], height=frame["height"]
            )
            record.thought = vision.describe_grounded(point)

            if not point.ok:
                # A failed grounding is not fatal: report it, and let the model
                # try again next step with the failure in its history.
                record.results.append("GROUNDING FAILED: " + str(point.error))
                self._history.append(
                    {
                        "step": step,
                        "thought": record.thought,
                        "actions": [],
                        "results": record.results,
                    }
                )
                await self._emit(
                    {
                        "type": "ACTION",
                        "step": step,
                        "thought": record.thought,
                        "action": {"ok": False, "action": "ground", "error": point.error},
                    }
                )
                await self._emit(
                    {
                        "type": "STEP_COMPLETE",
                        "step": step,
                        "thought": record.thought,
                        "actions": [],
                        "is_done": False,
                        "timing": {
                            "observe_ms": round(record.observe_ms, 1),
                            "llm_ms": round(record.llm_ms, 1),
                            "total_ms": round(record.total_ms, 1),
                        },
                    }
                )
                continue

            if point.action == "done":
                success = point.success
                final_text = _finish_text(config, success, page_context)
                await self._emit(
                    {
                        "type": "STEP_COMPLETE",
                        "step": step,
                        "thought": "Game finished",
                        "actions": [],
                        "is_done": True,
                        "timing": {"total_ms": round(record.total_ms, 1)},
                    }
                )
                break

            action = point.as_dict()
            record.actions.append(action)

            # -- 3. act: gate, then a real pointer event -------------------
            if config.approval_mode != "skip" and point.action in RISKY_ACTIONS:
                if not await self._await_approval(step, point, config):
                    return {
                        "success": False,
                        "result": (
                            "Stopped by user" if self._stop.is_set() else "Action denied by user"
                        ),
                        "metrics": self.metrics,
                    }

            action_started = time.perf_counter()
            result = await self._execute(point)
            record.action_ms = (time.perf_counter() - action_started) * 1000.0
            record.results.append(_describe_result(result))
            record.actions[-1] = result

            if config.settle_seconds > 0:
                await asyncio.sleep(config.settle_seconds)

            await self._emit(
                {"type": "ACTION", "step": step, "thought": record.thought, "action": result}
            )

            self._history.append(
                {
                    "step": step,
                    "thought": record.thought,
                    "actions": [result],
                    "results": record.results,
                }
            )

            await self._emit(
                {
                    "type": "STEP_COMPLETE",
                    "step": step,
                    "thought": record.thought,
                    "actions": [result],
                    "is_done": False,
                    "timing": {
                        "observe_ms": round(record.observe_ms, 1),
                        "llm_ms": round(record.llm_ms, 1),
                        "action_ms": round(record.action_ms, 1),
                        "total_ms": round(record.total_ms, 1),
                    },
                    "usage": record.usage,
                }
            )

            # -- stalled? --------------------------------------------------
            if result.get("ok") and point.action in vision.CLICK_ACTIONS:
                recent.append(_placement_key(point))
                if len(recent) == config.stall_threshold and len(set(recent)) == 1:
                    success = False
                    final_text = (
                        "No further progress: the same position was chosen "
                        + str(config.stall_threshold)
                        + " times in a row. The game looks finished, or the board no "
                        "longer responds to clicks."
                    )
                    await self._emit(
                        {
                            "type": "STEP_COMPLETE",
                            "step": step,
                            "thought": final_text,
                            "actions": [],
                            "is_done": True,
                            "timing": {"total_ms": round(record.total_ms, 1)},
                        }
                    )
                    break
            else:
                recent.clear()

        else:
            final_text = final_text or (
                "Reached the step limit before the game finished. Where it stands: "
                + _render_page_context(page_context)
            )
            success = False

        if self._stop.is_set() and not final_text:
            await self._emit({"type": "STOPPED", "reason": "User stopped the task"})
            return {"success": False, "result": "Stopped by user", "metrics": self.metrics}

        elapsed_ms = (time.perf_counter() - started) * 1000.0
        await self.session.clear_overlay()

        await self._emit(
            {
                "type": "FINAL_RESULT",
                "result": final_text,
                "success": success,
                "metrics": self.metrics,
                "elapsed_ms": round(elapsed_ms, 1),
            }
        )
        return {
            "success": success,
            "result": final_text,
            "metrics": self.metrics,
            "elapsed_ms": round(elapsed_ms, 1),
        }

    # -- perception --------------------------------------------------------

    async def _capture(self, config: GameRunConfig) -> tuple[dict[str, Any], dict[str, Any]]:
        """One screenshot plus the cheap text context that rides along with it.

        The DOM read is deliberately limited to url/title/visible text: the
        element list would be noise for a canvas game, but the title and body
        text are what let the model notice "Checkmate" or "Congratulations".
        """
        page_context = await self.session.page_context()
        if not config.use_screenshot:
            return {"bytes": b"", "width": 0, "height": 0, "scale": 1.0}, page_context

        frame = await self.session.screenshot()
        if not frame.get("width") or not frame.get("height"):
            raise RuntimeError("screenshot returned no dimensions")
        return frame, page_context

    async def _ask_model(
        self, frame: dict[str, Any], user_prompt: str, config: GameRunConfig
    ) -> dict[str, Any]:
        """One grounded action from the vision model."""
        content: Any
        if frame.get("bytes"):
            content = [
                {"type": "text", "text": user_prompt},
                {
                    "type": "image_url",
                    "image_url": {"url": vision.encode_data_uri(frame["bytes"])},
                },
            ]
        else:
            content = user_prompt

        return await self.llm.chat(
            [
                {"role": "system", "content": vision.GROUNDING_SYSTEM_PROMPT},
                {"role": "user", "content": content},
            ],
            schema=vision.GROUNDING_SCHEMA,
            max_tokens=160,
        )

    # -- approval gate -----------------------------------------------------

    async def _await_approval(
        self, step: int, point: vision.GroundedPoint, config: GameRunConfig
    ) -> bool:
        self._approval_future = asyncio.get_running_loop().create_future()

        await self._emit(
            {
                "type": "APPROVAL_REQUIRED",
                "step": step,
                "thought": vision.describe_grounded(point),
                "actions": [point.as_dict()],
                "mode": config.approval_mode,
                "timeout_s": round(config.approval_timeout, 1),
            }
        )

        future = self._approval_future
        timeout = (
            config.approval_timeout
            if config.approval_mode == "manual"
            else config.auto_approve_delay
        )
        try:
            approved = await asyncio.wait_for(asyncio.shield(future), timeout=timeout)
        except asyncio.TimeoutError:
            if config.approval_mode == "auto":
                approved = True
            else:
                approved = False
                await self._emit(
                    {
                        "type": "ERROR",
                        "step": step,
                        "error": (
                            "No approval response within "
                            + str(int(config.approval_timeout))
                            + "s. The action was not executed."
                        ),
                    }
                )
        finally:
            self._approval_future = None

        if not approved:
            self._denied = True
            await self._emit(
                {
                    "type": "STOPPED",
                    "step": step,
                    "reason": (
                        "Action denied by user" if not self._stop.is_set() else "User stopped the task"
                    ),
                }
            )
        return approved

    # -- action dispatch ---------------------------------------------------

    async def _execute(self, point: vision.GroundedPoint) -> dict[str, Any]:
        """Execute a grounded action, converting failures into data."""
        try:
            if point.action in vision.CLICK_ACTIONS:
                return await self.session.click_at(
                    point.x,
                    point.y,
                    double=point.action == "double_click",
                    button="right" if point.action == "right_click" else "left",
                    hover_only=point.action == "hover",
                )
            if point.action == "drag":
                return await self.session.drag_to(point.x, point.y, point.x2, point.y2)
            if point.action == "type":
                # A grounded type may or may not carry a point; a point means
                # "click here first, then type".
                if point.x is not None and point.y is not None:
                    await self.session.click_at(point.x, point.y)
                return await self.session.type_text_at(
                    point.text or "", submit=point.submit
                )
            if point.action == "key":
                return await self.session.press(str(point.key))
            if point.action == "scroll":
                return await self.session.scroll(direction=str(point.key or "down"))
            if point.action == "wait":
                await asyncio.sleep(0.6)
                return {"ok": True, "action": "wait"}
            return {"ok": False, "action": point.action or "unknown", "error": "unsupported action"}
        except CDPUnavailable as exc:
            return {"ok": False, "action": point.action, "error": str(exc)}
        except Exception as exc:  # keep the loop alive
            return {
                "ok": False,
                "action": point.action,
                "error": type(exc).__name__ + ": " + str(exc),
            }

    # -- loop detection ----------------------------------------------------

    def _stall_warning(self, recent: deque[str]) -> str:
        if not recent:
            return ""
        if len(recent) >= 2 and len(set(recent)) == 1:
            return (
                "You have chosen the same position " + str(len(recent))
                + " time(s) in a row and the board has not changed. If your last move "
                "did not register, click a different point or re-read the board. If the "
                "game is already over, reply with the done action."
            )
        return ""

    # -- events ------------------------------------------------------------

    async def _emit(self, event: dict[str, Any]) -> None:
        if self.on_event is None:
            return
        try:
            await self.on_event(event)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _placement_key(point: vision.GroundedPoint) -> str:
    """Signature of a grounded placement, used for stall detection."""
    if point.x is None or point.y is None:
        return str(point.action)
    # Round to a 12px bucket: a model that jitters by a pixel per step on the
    # same square is still stuck, and exact equality would miss it.
    return str(point.action) + ":" + str(point.x // 12) + "," + str(point.y // 12)


def _describe_result(result: dict[str, Any]) -> str:
    if not result.get("ok"):
        return "FAILED " + str(result.get("action")) + ": " + str(result.get("error"))
    name = result.get("action")
    if name in vision.CLICK_ACTIONS:
        return "clicked (" + str(result.get("x")) + ", " + str(result.get("y")) + ")"
    if name == "drag":
        return (
            "dragged (" + str(result.get("x")) + ", " + str(result.get("y"))
            + ") to (" + str(result.get("x2")) + ", " + str(result.get("y2")) + ")"
        )
    if name == "type":
        return "typed " + repr(str(result.get("text", ""))[:40])
    if name == "key":
        return "pressed " + str(result.get("key"))
    return str(name) + " ok"


def _render_history(history: list[dict[str, Any]], window: int) -> str:
    lines: list[str] = []
    for entry in history[-window:]:
        lines.append("  step " + str(entry.get("step")) + ": " + str(entry.get("thought", "")))
        for result in entry.get("results", []):
            lines.append("    -> " + str(result))
    return "\n".join(lines)


def _render_page_context(context: dict[str, Any]) -> str:
    parts: list[str] = []
    title = str(context.get("title") or "").strip()
    url = str(context.get("url") or "").strip()
    text = str(context.get("text") or "").strip()
    if title:
        parts.append("title: " + title)
    if url:
        parts.append("url: " + url[:200])
    if text:
        parts.append("visible text: " + " ".join(text.split())[:600])
    return "\n".join(parts)


def _finish_text(config: GameRunConfig, success: bool, page_context: dict[str, Any]) -> str:
    title = str(page_context.get("title") or "").strip()
    text = " ".join(str(page_context.get("text") or "").split())[:240]
    verdict = "Game finished" if success else "Game ended"
    parts = [verdict + ": " + config.task]
    if title:
        parts.append(title)
    if text:
        parts.append(text)
    return " - ".join(parts)
