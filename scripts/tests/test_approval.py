"""Approval-gate and redaction tests — no browser, no GPU required.

These exercise the real ``AgentLoop`` against stubbed session/LLM doubles, so the
gate's control flow (manual / auto / skip, approve / deny / timeout / stop) is
verified deterministically in CI without a live Chrome or vLLM.

Usage:
    python scripts/tests/test_approval.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT_DIR))

from server.agent.loop import AgentLoop, AgentRunConfig, RISKY_ACTIONS  # noqa: E402

FAILURES: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = "PASS" if condition else "FAIL"
    print(f"  [{status}] {name}" + (f" — {detail}" if detail and not condition else ""))
    if not condition:
        FAILURES.append(name)


# ---------------------------------------------------------------------------
# Test doubles
# ---------------------------------------------------------------------------


class StubSession:
    """Minimal stand-in for BrowserSessionManager."""

    def __init__(self, actions_per_step: int = 1) -> None:
        self.cdp_url = "http://stub:9222"
        self.last_observe_ms = 1.0
        self.tab_scope = "single"
        self.executed: list[dict[str, Any]] = []
        self._actions_per_step = actions_per_step

    async def connect(self):
        return self

    @property
    def url(self) -> str:
        return "https://example.test/"

    async def observe(self, **_kwargs):
        return {
            "url": "https://example.test/",
            "title": "Example",
            "elements": [
                {"i": 0, "tag": "input:text", "label": "Search", "x": 10, "y": 20, "w": 100, "h": 20},
                {"i": 1, "tag": "button", "label": "Go", "x": 10, "y": 50, "w": 60, "h": 24},
            ],
            "text": "Example page",
            "redactions": [],
        }

    async def ensure_cursor_visible(self, **_kwargs):
        return None

    async def refresh_visuals(self, **_kwargs):
        return None

    async def clear_overlay(self):
        return None

    async def wait_until_ready(self, timeout: float = 2.0):
        return True

    async def click(self, index: int, **_kwargs):
        self.executed.append({"action": "click", "index": index})
        return {"ok": True, "action": "click", "index": index, "label": "Go"}


class StubLLM:
    """Emits a fixed scripted action sequence, one batch per step."""

    def __init__(self, batches: list[list[dict[str, Any]]]) -> None:
        self._batches = batches
        self.calls = 0
        self.last_latency_ms = 1.0

    async def chat(self, _messages, **_kwargs):
        index = min(self.calls, len(self._batches) - 1)
        self.calls += 1
        return {"json": {"actions": self._batches[index]}, "usage": {}}


async def run_loop(
    batches: list[list[dict[str, Any]]],
    *,
    approval_mode: str,
    on_event=None,
    config_overrides: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], StubSession, AgentLoop]:
    session = StubSession()
    llm = StubLLM(batches)
    loop = AgentLoop(session, llm, on_event=on_event)
    config = AgentRunConfig(
        task="click Go",
        max_steps=3,
        approval_mode=approval_mode,
        **({"approval_timeout": 1.0, "auto_approve_delay": 0.05} | (config_overrides or {})),
    )
    result = await loop.run(config)
    return result, session, loop


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_risky_classification() -> None:
    print("\n1. Risky-action classification")
    loop = AgentLoop(StubSession(), StubLLM([[]]))
    config = AgentRunConfig(task="t", approval_mode="manual")

    check(
        "click needs approval in manual",
        loop._needs_approval([{"type": "click", "index": 1}], config),
    )
    check(
        "scroll does not need approval",
        not loop._needs_approval([{"type": "scroll"}], config),
    )
    check(
        "read does not need approval",
        not loop._needs_approval([{"type": "read"}], config),
    )
    check(
        "done does not need approval",
        not loop._needs_approval([{"type": "done"}], config),
    )
    skip_config = AgentRunConfig(task="t", approval_mode="skip")
    check(
        "skip bypasses the gate entirely",
        not loop._needs_approval([{"type": "click", "index": 1}], skip_config),
    )
    check(
        "risky set covers click/type/navigate/press/go_back",
        RISKY_ACTIONS == {"click", "type", "navigate", "press", "go_back"},
    )


async def test_skip_mode_executes_without_gate() -> None:
    print("\n2. skip mode — no APPROVAL_REQUIRED, action executes")
    events: list[dict[str, Any]] = []

    async def collect(event):
        events.append(event)

    result, session, _ = await run_loop(
        [[{"type": "click", "index": 1}], [{"type": "done", "success": True, "text": "ok"}]],
        approval_mode="skip",
        on_event=collect,
    )

    kinds = [e["type"] for e in events]
    check("no APPROVAL_REQUIRED emitted", "APPROVAL_REQUIRED" not in kinds)
    check("click executed", len(session.executed) == 1, str(session.executed))
    check("run produced a result", bool(result.get("result")))


async def test_manual_approve() -> None:
    print("\n3. manual mode — APPROVE lets the action through")
    events: list[dict[str, Any]] = []

    async def collect(event):
        events.append(event)
        if event["type"] == "APPROVAL_REQUIRED":
            await asyncio.sleep(0.05)
            loop_ref[0].approve()

    loop_ref: list[AgentLoop] = []
    session = StubSession()
    llm = StubLLM([[{"type": "click", "index": 1}], [{"type": "done", "success": True, "text": "ok"}]])
    loop = AgentLoop(session, llm, on_event=collect)
    loop_ref.append(loop)
    result = await loop.run(
        AgentRunConfig(task="click Go", max_steps=3, approval_mode="manual", approval_timeout=3.0)
    )

    approval_events = [e for e in events if e["type"] == "APPROVAL_REQUIRED"]
    check("APPROVAL_REQUIRED emitted once", len(approval_events) == 1)
    if approval_events:
        check(
            "approval event carries mode=manual",
            approval_events[0].get("mode") == "manual",
            str(approval_events[0].get("mode")),
        )
        check(
            "approval event carries a timeout",
            isinstance(approval_events[0].get("timeout_s"), (int, float)),
        )
    check("click executed after approval", len(session.executed) == 1, str(session.executed))
    check("run completed", result.get("success") is True, str(result.get("result")))


async def test_manual_deny() -> None:
    print("\n4. manual mode — DENY blocks the action and stops the run")
    events: list[dict[str, Any]] = []
    loop_ref: list[AgentLoop] = []

    async def collect(event):
        events.append(event)
        if event["type"] == "APPROVAL_REQUIRED":
            await asyncio.sleep(0.05)
            loop_ref[0].deny()

    session = StubSession()
    llm = StubLLM([[{"type": "click", "index": 1}]])
    loop = AgentLoop(session, llm, on_event=collect)
    loop_ref.append(loop)
    result = await loop.run(
        AgentRunConfig(task="click Go", max_steps=3, approval_mode="manual", approval_timeout=3.0)
    )

    kinds = [e["type"] for e in events]
    check("no ACTION executed", "ACTION" not in kinds, str(kinds))
    check("nothing reached the page", session.executed == [], str(session.executed))
    check("STOPPED emitted", "STOPPED" in kinds)
    stopped = next((e for e in events if e["type"] == "STOPPED"), {})
    check("stop reason names the denial", "denied" in str(stopped.get("reason", "")).lower())
    check("loop reports denial", loop.denied is True)
    check("run unsuccessful", result.get("success") is False)


async def test_manual_timeout() -> None:
    print("\n5. manual mode — no response times out without executing")
    events: list[dict[str, Any]] = []

    async def collect(event):
        events.append(event)

    result, session, _ = await run_loop(
        [[{"type": "click", "index": 1}]],
        approval_mode="manual",
        on_event=collect,
        config_overrides={"approval_timeout": 0.4},
    )

    kinds = [e["type"] for e in events]
    check("nothing executed on timeout", session.executed == [], str(session.executed))
    check("ERROR explains the timeout", "ERROR" in kinds)
    error = next((e for e in events if e["type"] == "ERROR"), {})
    check("timeout message is actionable", "approval" in str(error.get("error", "")).lower())
    check("run unsuccessful", result.get("success") is False)


async def test_auto_mode() -> None:
    print("\n6. auto mode — banner surfaces, then self-approves and executes")
    events: list[dict[str, Any]] = []

    async def collect(event):
        events.append(event)

    result, session, _ = await run_loop(
        [[{"type": "click", "index": 1}], [{"type": "done", "success": True, "text": "ok"}]],
        approval_mode="auto",
        on_event=collect,
        config_overrides={"auto_approve_delay": 0.2},
    )

    approval_events = [e for e in events if e["type"] == "APPROVAL_REQUIRED"]
    check("banner still emitted for the audit trail", len(approval_events) == 1)
    if approval_events:
        check("banner is marked auto", approval_events[0].get("mode") == "auto")
    check("click executed without a click", len(session.executed) == 1, str(session.executed))
    check("run completed", result.get("success") is True)


async def test_stop_interrupts_pending_approval() -> None:
    print("\n7. STOP while parked on an approval prompt resolves immediately")
    events: list[dict[str, Any]] = []
    loop_ref: list[AgentLoop] = []

    async def collect(event):
        events.append(event)
        if event["type"] == "APPROVAL_REQUIRED":
            await asyncio.sleep(0.05)
            loop_ref[0].stop()

    session = StubSession()
    llm = StubLLM([[{"type": "click", "index": 1}]])
    loop = AgentLoop(session, llm, on_event=collect)
    loop_ref.append(loop)

    started = asyncio.get_running_loop().time()
    result = await loop.run(
        AgentRunConfig(task="click Go", max_steps=3, approval_mode="manual", approval_timeout=30.0)
    )
    elapsed = asyncio.get_running_loop().time() - started

    check("did not wait for the full timeout", elapsed < 2.0, f"{elapsed:.2f}s")
    check("nothing executed", session.executed == [], str(session.executed))
    check("run unsuccessful", result.get("success") is False)


async def test_redaction_event_forwarded() -> None:
    print("\n8. redaction report is forwarded to the panel")

    class RedactingSession(StubSession):
        async def observe(self, **_kwargs):
            state = await super().observe(**_kwargs)
            state["redactions"] = [{"tag": "CREDENTIAL", "label": "input:password", "count": 1}]
            return state

    events: list[dict[str, Any]] = []

    async def collect(event):
        events.append(event)

    session = RedactingSession()
    loop = AgentLoop(session, StubLLM([[{"type": "done", "success": True, "text": "ok"}]]), on_event=collect)
    await loop.run(AgentRunConfig(task="t", max_steps=1, approval_mode="skip"))

    redaction_events = [e for e in events if e["type"] == "REDACTIONS"]
    check("REDACTIONS emitted", len(redaction_events) == 1)
    if redaction_events:
        entry = redaction_events[0]["redactions"][0]
        check("carries the tag", entry["tag"] == "CREDENTIAL")
        check("carries the field label", entry["label"] == "input:password")
        check("never carries a value", "value" not in entry)


async def main() -> int:
    print("=" * 66)
    print("  V.A.R.M.A approval gate + redaction tests (stubbed, no browser)")
    print("=" * 66)

    await test_risky_classification()
    await test_skip_mode_executes_without_gate()
    await test_manual_approve()
    await test_manual_deny()
    await test_manual_timeout()
    await test_auto_mode()
    await test_stop_interrupts_pending_approval()
    await test_redaction_event_forwarded()

    print("\n" + "=" * 66)
    if FAILURES:
        print(f"  {len(FAILURES)} FAILURE(S): {', '.join(FAILURES)}")
        return 1
    print("  ALL APPROVAL-GATE TESTS PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
