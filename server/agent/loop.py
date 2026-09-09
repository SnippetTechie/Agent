"""The fast agent loop: observe -> think -> act.

Per step this does exactly three things:

  1. ``observe``  - one in-page pass returns elements + text (~30-80ms)
  2. ``think``    - one vLLM call with guided JSON decoding
  3. ``act``      - execute the chosen actions via CDP

There is no screenshot, no judge, no planner and no second model call. That is
what keeps a step inside the 1-3s budget on a single-GPU 12B model.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from . import prompts
from .dom import format_state_for_prompt
from .llm import VLLMClient, VLLMError
from .session import BrowserSessionManager, CDPUnavailable

EventHandler = Callable[[dict[str, Any]], Awaitable[None]]


# Actions that change page state and are therefore gated by the approval mode.
# Perception-only actions (scroll/hover/wait/wait_for/read) are always allowed:
# gating them would stall the run without protecting anything.
RISKY_ACTIONS: frozenset[str] = frozenset(
    {"click", "type", "navigate", "press", "go_back"}
)


@dataclass
class AgentRunConfig:
    """Tunables for one agent run."""

    task: str
    max_steps: int = 15
    max_actions_per_step: int = 3
    # Stop the run when the same action+index repeats this many times.
    loop_threshold: int = 3
    # After a click/type, give the page a moment before re-reading it.
    settle_seconds: float = 0.15
    done_text_fallback: str = "Task completed."

    # -- approval gate -----------------------------------------------------
    # "manual" -> pause until the panel clicks Approve/Deny.
    # "auto"   -> still surface the banner, but resolve without a click.
    # "skip"   -> execute risky actions immediately (fastest).
    approval_mode: str = "manual"
    # How long to wait for an APPROVE/DENY before falling back.
    approval_timeout: float = 180.0
    # In "auto" mode, self-approve after this delay if no client responds.
    auto_approve_delay: float = 1.2


@dataclass
class StepRecord:
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


class AgentLoop:
    """Runs a task against a live browser page."""

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
        self._step_records: list[StepRecord] = []

        # -- approval gate state ------------------------------------------
        # A pending decision is represented by a future; the WebSocket listener
        # resolves it when APPROVE/DENY arrives, or the loop resolves it itself
        # on timeout. ``None`` means "nothing is waiting right now".
        self._approval_future: asyncio.Future[bool] | None = None
        self._approval_step: int = 0
        self._denied = False

    # -- control -----------------------------------------------------------

    def stop(self) -> None:
        self._stop.set()
        # Unblock a run parked on an approval prompt so STOP is immediate.
        self._resolve_approval(False)

    def approve(self) -> None:
        """Resolve a pending approval as approved (called from the WS listener)."""
        self._resolve_approval(True)

    def deny(self) -> None:
        """Resolve a pending approval as denied (called from the WS listener)."""
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
        return {
            "steps": len(self._step_records),
            "avg_step_ms": round(sum(totals) / len(totals), 1),
            "min_step_ms": round(min(totals), 1),
            "max_step_ms": round(max(totals), 1),
            "avg_observe_ms": round(
                sum(r.observe_ms for r in self._step_records) / len(self._step_records), 1
            ),
            "avg_llm_ms": round(
                sum(r.llm_ms for r in self._step_records) / len(self._step_records), 1
            ),
            "avg_action_ms": round(
                sum(r.action_ms for r in self._step_records) / len(self._step_records), 1
            ),
        }

    # -- main --------------------------------------------------------------

    async def run(self, config: AgentRunConfig) -> dict[str, Any]:
        """Run to completion. Returns a final result payload."""
        self._stop.clear()
        self._history.clear()
        self._step_records.clear()

        started = time.perf_counter()

        try:
            page = await self.session.connect()
        except CDPUnavailable as exc:
            await self._emit({"type": "ERROR", "error": str(exc)})
            return {"success": False, "result": str(exc)}

        await self._emit(
            {"type": "CONNECTED", "cdp_url": self.session.cdp_url, "url": page.url}
        )

        final_text = ""
        success = False

        for step in range(1, config.max_steps + 1):
            if self._stop.is_set():
                await self._emit({"type": "STOPPED", "reason": "User stopped the task"})
                return {"success": False, "result": "Stopped by user", "metrics": self.metrics}

            record = StepRecord(step=step)
            self._step_records.append(record)

            await self._emit({"type": "STEP_START", "step": step, "status": "Reading page..."})

            # -- 1. observe ------------------------------------------------
            try:
                state = await self.session.observe()
                # A blank/mid-load DOM would waste a full LLM call, so give the
                # page a short grace period before asking the model anything.
                if not state.get("elements") and not (state.get("text") or "").strip():
                    await self.session.wait_until_ready(timeout=2.0)
                    state = await self.session.observe()
                # Park the cursor on screen so the visual layer is present from
                # the very first step, not just once an action runs.
                await self.session.ensure_cursor_visible()
            except Exception as exc:
                await self._emit({"type": "ERROR", "error": f"Page read failed: {exc}"})
                return {"success": False, "result": str(exc), "metrics": self.metrics}

            record.observe_ms = self.session.last_observe_ms

            # Report Layer-1 redactions so the panel's audit log reflects what
            # was actually masked on this page (never the masked values).
            redactions = state.get("redactions") or []
            if redactions:
                await self._emit(
                    {
                        "type": "REDACTIONS",
                        "step": step,
                        "redactions": redactions,
                    }
                )

            await self._emit(
                {
                    "type": "PAGE_STATE",
                    "step": step,
                    "url": state.get("url"),
                    "title": state.get("title"),
                    "elements": [
                        {
                            "i": e["i"],
                            "tag": e["tag"],
                            "label": e.get("label", ""),
                            "x": e["x"],
                            "y": e["y"],
                            "w": e["w"],
                            "h": e["h"],
                        }
                        for e in state.get("elements", [])
                    ],
                    "observe_ms": round(record.observe_ms, 1),
                }
            )

            # -- 2. think --------------------------------------------------
            await self._emit({"type": "STEP_START", "step": step, "status": "Reasoning..."})
            state_text = format_state_for_prompt(state)
            nudge = self._loop_nudge()
            prompt = prompts.build_step_prompt(
                config.task,
                state,
                state_text,
                prompts.compact_history(self._history),
                step,
                config.max_steps,
                nudge,
            )

            llm_started = time.perf_counter()
            try:
                response = await self.llm.chat(
                    [
                        {"role": "system", "content": prompts.SYSTEM_PROMPT},
                        {"role": "user", "content": prompt},
                    ],
                    schema=prompts.ACTION_SCHEMA,
                )
            except VLLMError as exc:
                await self._emit({"type": "ERROR", "error": f"LLM error: {exc}"})
                return {"success": False, "result": str(exc), "metrics": self.metrics}

            record.llm_ms = (time.perf_counter() - llm_started) * 1000.0
            record.usage = response.get("usage", {})

            payload = response.get("json") or {}
            actions = payload.get("actions") or []
            if not isinstance(actions, list):
                actions = []
            actions = actions[: config.max_actions_per_step]

            # Block actions the agent has already repeated without progress.
            # A nudge alone is not enough: a small model will happily repeat a
            # no-op click forever.
            counts = self._repeat_counts()
            kept: list[dict[str, Any]] = []
            blocked: list[str] = []
            for action in actions:
                if str(action.get("type", "")).lower() == "done":
                    kept.append(action)
                    continue
                key = _proposed_key(action)
                if counts.get(key, 0) >= config.loop_threshold:
                    blocked.append(key)
                    continue
                kept.append(action)

            for key in blocked:
                record.results.append(f"BLOCKED: {key} already repeated {counts[key]}x - pick another action")
            if blocked and not kept:
                await self._emit(
                    {
                        "type": "STEP_COMPLETE",
                        "step": step,
                        "thought": f"Blocked repeated action: {', '.join(blocked)}",
                        "actions": [],
                        "is_done": False,
                        "timing": {"observe_ms": round(record.observe_ms, 1)},
                    }
                )
                self._history.append(
                    {
                        "step": step,
                        "thought": f"Blocked repeated action: {', '.join(blocked)}",
                        "actions": [],
                        "results": record.results,
                    }
                )
                continue
            actions = kept

            # The model emits no prose, so the UI label is synthesised here.
            record.thought = prompts.describe_actions(actions)

            if not actions:
                await self._emit(
                    {
                        "type": "ERROR",
                        "error": "Model returned no actions.",
                        "step": step,
                    }
                )
                return {
                    "success": False,
                    "result": "Model returned no actions.",
                    "metrics": self.metrics,
                }

            # -- 3. act ----------------------------------------------------
            # Gate state-changing actions behind the approval mode. This runs
            # before anything is executed so a denial leaves the page untouched.
            if self._needs_approval(actions, config):
                if not await self._await_approval(step, actions, config):
                    return {
                        "success": False,
                        "result": (
                            "Stopped by user"
                            if self._stop.is_set()
                            else "Action denied by user"
                        ),
                        "metrics": self.metrics,
                    }

            action_started = time.perf_counter()
            done_payload: dict[str, Any] | None = None

            for action in actions:
                if self._stop.is_set():
                    break
                action_type = str(action.get("type", "")).lower()

                if action_type == "done":
                    done_payload = action
                    break

                result = await self._execute(action_type, action, state)
                record.actions.append(result)
                record.results.append(_describe_result(result))

                # A navigation/submit destroys the injected DOM. Re-draw the
                # visual layer *before* reporting the action, so anything
                # watching (UI, screenshots) sees boxes on the new page rather
                # than a blank document.
                if result.get("ok") and done_payload is None:
                    try:
                        await self.session.refresh_visuals()
                    except Exception:
                        pass

                await self._emit(
                    {
                        "type": "ACTION",
                        "step": step,
                        "action": result,
                        "thought": record.thought,
                    }
                )

            record.action_ms = (time.perf_counter() - action_started) * 1000.0

            self._history.append(
                {
                    "step": step,
                    "thought": record.thought,
                    "actions": record.actions,
                    "results": record.results,
                }
            )

            await self._emit(
                {
                    "type": "STEP_COMPLETE",
                    "step": step,
                    "thought": record.thought,
                    "actions": record.actions,
                    "is_done": done_payload is not None,
                    "timing": {
                        "observe_ms": round(record.observe_ms, 1),
                        "llm_ms": round(record.llm_ms, 1),
                        "action_ms": round(record.action_ms, 1),
                        "total_ms": round(record.total_ms, 1),
                    },
                    "usage": record.usage,
                }
            )

            if done_payload is not None:
                final_text = str(done_payload.get("text") or "").strip()
                if not final_text:
                    final_text = _summarize_page(state, config.task)
                success = bool(done_payload.get("success", True))
                break

        else:
            final_text = (
                final_text
                or "Reached the step limit before finishing. Here is what I did so far."
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

    # -- approval gate -----------------------------------------------------

    def _needs_approval(self, actions: list[dict[str, Any]], config: AgentRunConfig) -> bool:
        """True when at least one proposed action is state-changing."""
        if config.approval_mode == "skip":
            return False
        return any(
            str(a.get("type", "")).lower() in RISKY_ACTIONS for a in actions
        )

    async def _await_approval(
        self, step: int, actions: list[dict[str, Any]], config: AgentRunConfig
    ) -> bool:
        """Emit APPROVAL_REQUIRED and wait for the user's decision.

        Returns True if the run may proceed. ``skip`` never reaches here.
        """
        self._approval_step = step
        self._approval_future = asyncio.get_running_loop().create_future()

        await self._emit(
            {
                "type": "APPROVAL_REQUIRED",
                "step": step,
                "thought": prompts.describe_actions(actions),
                "actions": actions,
                "mode": config.approval_mode,
                "timeout_s": round(config.approval_timeout, 1),
            }
        )

        future = self._approval_future
        timeout = config.approval_timeout if config.approval_mode == "manual" else config.auto_approve_delay

        try:
            approved = await asyncio.wait_for(asyncio.shield(future), timeout=timeout)
        except asyncio.TimeoutError:
            if config.approval_mode == "auto":
                # The banner was shown; proceed without waiting for a click.
                approved = True
            else:
                approved = False
                await self._emit(
                    {
                        "type": "ERROR",
                        "step": step,
                        "error": (
                            f"No approval response within {int(config.approval_timeout)}s. "
                            "The action was not executed."
                        ),
                    }
                )
        except asyncio.CancelledError:
            approved = False
            raise
        finally:
            self._approval_future = None

        if not approved:
            self._denied = True
            await self._emit(
                {
                    "type": "STOPPED",
                    "step": step,
                    "reason": "Action denied by user" if not self._stop.is_set() else "User stopped the task",
                }
            )
        return approved

    # -- action dispatch ---------------------------------------------------

    async def _execute(
        self, action_type: str, action: dict[str, Any], state: dict[str, Any]
    ) -> dict[str, Any]:
        """Execute one action, converting failures into data instead of exceptions."""
        try:
            if action_type == "click":
                index = _as_int(action.get("index"))
                if index is None:
                    return _fail("click", "missing index")
                result = await self.session.click(index, double=bool(action.get("double")))
                return result

            if action_type == "type":
                index = _as_int(action.get("index"))
                if index is None:
                    return _fail("type", "missing index")
                text = str(action.get("text", ""))
                return await self.session.type_text(
                    index,
                    text,
                    submit=bool(action.get("submit")),
                    clear=action.get("clear", True) is not False,
                )

            if action_type == "navigate":
                url = str(action.get("url", "")).strip()
                if not url:
                    return _fail("navigate", "missing url")
                return await self.session.navigate(url, new_tab=bool(action.get("new_tab")))

            if action_type == "scroll":
                return await self.session.scroll(
                    direction=str(action.get("direction", "down")),
                    amount=_as_int(action.get("amount")) or 0,
                    index=_as_int(action.get("index")),
                )

            if action_type == "hover":
                index = _as_int(action.get("index"))
                if index is None:
                    return _fail("hover", "missing index")
                return await self.session.hover(index)

            if action_type == "press":
                return await self.session.press(str(action.get("key", "Enter")))

            if action_type == "wait":
                return await self.session.wait(float(action.get("seconds") or 1.0))

            if action_type == "wait_for":
                return await self.session.wait_for_text(
                    str(action.get("text", "")), timeout=float(action.get("seconds") or 5.0)
                )

            if action_type == "read":
                return await self.session.read_text()

            if action_type == "go_back":
                return await self.session.go_back()

            return _fail(action_type or "unknown", "unsupported action type")

        except CDPUnavailable as exc:
            return _fail(action_type, str(exc))
        except Exception as exc:  # keep the loop alive
            return _fail(action_type, f"{type(exc).__name__}: {exc}")

    # -- loop detection ----------------------------------------------------

    def _repeat_counts(self) -> dict[str, int]:
        """Count how often each action signature has been executed so far."""
        counts: dict[str, int] = {}
        for entry in self._history:
            for action in entry.get("actions", []):
                key = _action_key(action)
                counts[key] = counts.get(key, 0) + 1
        return counts

    def _loop_nudge(self) -> str | None:
        """Warn the model when it is about to repeat itself."""
        counts = self._repeat_counts()
        if not counts:
            return None
        worst_key, worst_count = max(counts.items(), key=lambda kv: kv[1])
        if worst_count >= 2:
            return (
                f"You already did `{worst_key}` {worst_count} time(s) without progress. "
                "Do something different: use a different element index, scroll, "
                "navigate elsewhere, or call done if the goal is met."
            )
        return None

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


def _as_int(value: Any) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _fail(action: str, error: str) -> dict[str, Any]:
    return {"ok": False, "action": action, "error": error}


def _action_key(action: dict[str, Any]) -> str:
    """Signature of an executed action, used to detect no-progress loops."""
    name = action.get("action", "?")
    if not action.get("ok", True):
        return f"{name}:failed"
    index = action.get("index")
    if index is not None:
        return f"{name}[{index}]"
    if action.get("url"):
        return f"{name}:{str(action['url'])[:60]}"
    if action.get("text"):
        return f"{name}:{str(action['text'])[:40]}"
    if action.get("key"):
        return f"{name}:{action['key']}"
    return str(name)


def _proposed_key(action: dict[str, Any]) -> str:
    """Signature of a proposed (not yet executed) action."""
    name = str(action.get("type", "?"))
    if action.get("index") is not None:
        return f"{name}[{action['index']}]"
    if action.get("url"):
        return f"{name}:{str(action['url'])[:60]}"
    if action.get("text"):
        return f"{name}:{str(action['text'])[:40]}"
    if action.get("key"):
        return f"{name}:{action['key']}"
    return name


def _describe_result(result: dict[str, Any]) -> str:
    if not result.get("ok"):
        return f"FAILED {result.get('action')}: {result.get('error')}"
    name = result.get("action")
    if name == "read":
        text = str(result.get("text", ""))
        return f"read {len(text)} chars: {text[:200]}"
    if name == "navigate":
        return f"navigated to {result.get('final_url') or result.get('url')}"
    if name == "type":
        return f"typed {result.get('text', '')[:60]!r} into [{result.get('index')}]"
    if name == "click":
        return f"clicked [{result.get('index')}] {result.get('label', '')[:50]}"
    return f"{name} ok"


def _summarize_page(state: dict[str, Any], task: str) -> str:
    """Build a useful final answer when the model calls done without text."""
    title = (state.get("title") or "").strip()
    url = (state.get("url") or "").strip()
    text = (state.get("text") or "").strip()

    snippet = " ".join(text.split())[:280]
    parts = []
    if title:
        parts.append(f"{title}")
    if snippet:
        parts.append(snippet)
    if url:
        parts.append(f"({url[:120]})")
    if parts:
        return " - ".join(parts)
    return f"Finished: {task}"
