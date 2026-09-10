"""Structured run journal.

One place records everything that happens during an agent run so a demo can be
explained after the fact: the exact prompt sent to the model at each step, the
actions it chose, what actually executed, how long each phase took, which
guards fired, whether vision was used, and the final answer.

Design notes
------------
* **Append-only and non-blocking.** ``record`` only mutates in-memory state and
  appends one JSON line. A journal failure must never break a run, so every
  write is guarded.
* **Two artefacts per run.** ``logs/runs/<stamp>-<id>.jsonl`` is the machine
  record (one event per line, then a summary line). ``logs/runs/<stamp>-<id>.md``
  is a human transcript for the demo walkthrough.
* **Never a new source of leakage.** Action payloads arrive already redacted by
  ``actions.redact_for_ui`` and page text arrives already scrubbed by the
  perception kernel. The journal does not add its own copies of secrets.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

# Event kinds that carry the model's own output and are worth keeping verbatim
# in the transcript.
_PROMPT_KIND = "PROMPT"


def _ms(value: float) -> float:
    return round(value, 1)


@dataclass
class StepStats:
    """Everything measured for one loop iteration."""

    step: int
    observe_ms: float = 0.0
    llm_ms: float = 0.0
    action_ms: float = 0.0
    total_ms: float = 0.0
    prompt_chars: int = 0
    output_tokens: int = 0
    input_tokens: int = 0
    actions: list[str] = field(default_factory=list)
    failed_actions: int = 0
    changed_page: int = 0
    blocked: int = 0
    vision: bool = False
    nudges: list[str] = field(default_factory=list)
    url: str = ""
    thought: str = ""


class RunJournal:
    """Records one run and writes it to disk when the run ends."""

    def __init__(
        self,
        task: str,
        *,
        run_id: str,
        model: str = "",
        provider: str = "unknown",
        browser: str = "unknown",
        log_dir: Path | None = None,
        persist: bool = True,
        max_events: int = 4000,
    ) -> None:
        self.task = task
        self.run_id = run_id
        self.model = model
        self.provider = provider
        self.browser = browser
        self.log_dir = log_dir
        self.persist = persist
        self.max_events = max_events

        self.started_at = time.perf_counter()
        self.started_wall = datetime.now()
        self.events: list[dict[str, Any]] = []
        self.steps: dict[int, StepStats] = {}
        self.redactions: list[dict[str, Any]] = []
        self.vision_calls = 0
        self.approvals = 0
        self.denials = 0
        self.plan: list[str] = []
        self.final: dict[str, Any] = {}
        self.urls: list[str] = []
        self._closed = False
        self._file: Any = None
        self.path: Path | None = None

    # -- recording ---------------------------------------------------------

    @property
    def elapsed_ms(self) -> float:
        return (time.perf_counter() - self.started_at) * 1000.0

    def _step(self, step: int | None) -> StepStats | None:
        if step is None:
            return None
        if step not in self.steps:
            self.steps[step] = StepStats(step=step)
        return self.steps[step]

    def record(self, event: dict[str, Any]) -> None:
        """Record one loop event. Returns immediately on any error."""
        if self._closed:
            return
        try:
            self._record(event)
        except Exception:  # pragma: no cover - journalling must never break a run
            pass

    def _record(self, event: dict[str, Any]) -> None:
        kind = str(event.get("type") or "")
        step = event.get("step")
        step = int(step) if isinstance(step, (int, float)) else None
        stats = self._step(step)

        entry: dict[str, Any] = {"t_ms": _ms(self.elapsed_ms), "kind": kind, "step": step}

        if kind == "CONNECTED":
            self.provider = str(event.get("provider") or self.provider)
            self.browser = str(event.get("browser") or self.browser)
            entry["provider"] = self.provider
            entry["browser"] = self.browser
            entry["url"] = event.get("url")

        elif kind == "PLAN":
            self.plan = [str(s.get("text") or "") for s in event.get("steps") or []]
            entry["goal"] = event.get("goal")
            entry["steps"] = self.plan

        elif kind == _PROMPT_KIND:
            if stats is not None:
                stats.prompt_chars = int(event.get("chars") or 0)
            entry["chars"] = event.get("chars")
            entry["history_steps"] = event.get("history_steps")
            entry["vision"] = bool(event.get("vision"))
            entry["prompt"] = event.get("prompt")

        elif kind == "PAGE_STATE":
            url = str(event.get("url") or "")
            if url and (not self.urls or self.urls[-1] != url):
                self.urls.append(url)
            if stats is not None:
                stats.url = url
                stats.observe_ms = float(event.get("observe_ms") or 0.0)
            entry["url"] = url
            entry["title"] = event.get("title")
            entry["elements"] = len(event.get("elements") or [])
            entry["overlays"] = [o.get("kind") for o in event.get("overlays") or []]
            entry["observe_ms"] = event.get("observe_ms")

        elif kind == "REDACTIONS":
            redactions = event.get("redactions") or []
            self.redactions.extend(redactions)
            entry["redactions"] = redactions

        elif kind == "VISION":
            self.vision_calls += 1
            if stats is not None:
                stats.vision = True
            entry["reason"] = event.get("reason")

        elif kind == "ACTION":
            action = event.get("action") or {}
            name = str(action.get("action") or action.get("type") or "?")
            ok = action.get("ok", True) is not False
            if stats is not None:
                stats.actions.append(name)
                if not ok:
                    stats.failed_actions += 1
                if event.get("changed_page"):
                    stats.changed_page += 1
            entry["action"] = name
            entry["ok"] = ok
            entry["label"] = action.get("label")
            entry["error"] = action.get("error")
            entry["changed_page"] = bool(event.get("changed_page"))
            entry["ms"] = action.get("ms")

        elif kind == "APPROVAL_REQUIRED":
            self.approvals += 1
            entry["mode"] = event.get("mode")
            entry["actions"] = [a.get("action") for a in event.get("actions") or []]

        elif kind == "STEP_COMPLETE":
            timing = event.get("timing") or {}
            usage = event.get("usage") or {}
            if stats is not None:
                stats.observe_ms = float(timing.get("observe_ms") or stats.observe_ms)
                stats.llm_ms = float(timing.get("llm_ms") or 0.0)
                stats.action_ms = float(timing.get("action_ms") or 0.0)
                stats.total_ms = float(timing.get("total_ms") or 0.0)
                stats.output_tokens = int(usage.get("completion_tokens") or 0)
                stats.input_tokens = int(usage.get("prompt_tokens") or 0)
                stats.thought = str(event.get("thought") or "")
            entry["thought"] = event.get("thought")
            entry["is_done"] = bool(event.get("is_done"))
            entry["timing"] = timing
            entry["usage"] = usage

        elif kind == "FINAL_RESULT":
            self.final = {
                "success": bool(event.get("success")),
                "result": str(event.get("result") or ""),
                "elapsed_ms": event.get("elapsed_ms"),
                "metrics": event.get("metrics") or {},
            }
            entry.update(self.final)

        elif kind == "ERROR":
            entry["error"] = event.get("error")

        elif kind == "STOPPED":
            self.denials += 1 if "denied" in str(event.get("reason") or "").lower() else 0
            entry["reason"] = event.get("reason")

        self._append(entry)

    def _count_vision(self, step: int | None, stats: StepStats | None) -> None:
        """Count one screenshot per step, from either signal."""
        if stats is not None:
            stats.vision = True
        key = step if step is not None else -1
        if key in self._vision_steps:
            return
        self._vision_steps.add(key)
        self.vision_calls += 1

    def _count_vision(self, step: int | None, stats: StepStats | None) -> None:
        """Count one screenshot per step, from either signal."""
        if stats is not None:
            stats.vision = True
        key = step if step is not None else -1
        if key in self._vision_steps:
            return
        self._vision_steps.add(key)
        self.vision_calls += 1

    def note_nudge(self, step: int | None, nudge: str) -> None:
        """Called by the loop when a guard produces a warning for the model."""
        if not nudge:
            return
        """Called by the loop when a guard produces a warning for the model."""
        if not nudge:
            return
        """Called by the loop when a guard produces a warning for the model."""
        if not nudge:
            return
        stats = self._step(step)
        if stats is not None:
            stats.nudges.append(nudge[:200])
        self.record({"type": "NUDGE", "step": step, "nudge": nudge[:400]})

    def note_blocked(self, step: int | None, reasons: Iterable[str]) -> None:
        reasons = list(reasons)
        if not reasons:
            return
        stats = self._step(step)
        if stats is not None:
            stats.blocked += len(reasons)
        self.record({"type": "BLOCKED", "step": step, "reasons": reasons[:8]})

    def _append(self, entry: dict[str, Any]) -> None:
        if len(self.events) >= self.max_events:
            return
        self.events.append(entry)
        if not self.persist or self.log_dir is None:
            return
        try:
            if self._file is None:
                self.log_dir.mkdir(parents=True, exist_ok=True)
                self.path = self.log_dir / f"{self.started_wall:%Y%m%d-%H%M%S}-{self.run_id}.jsonl"
                self._file = self.path.open("a", encoding="utf-8")
            self._file.write(json.dumps(entry, ensure_ascii=False) + "\n")
            self._file.flush()
        except Exception:  # pragma: no cover
            self._file = None

    # -- summary -----------------------------------------------------------

    def summary(self) -> dict[str, Any]:
        steps = [self.steps[k] for k in sorted(self.steps)]
        total = self.elapsed_ms
        llm_total = sum(s.llm_ms for s in steps)
        return {
            "run_id": self.run_id,
            "task": self.task,
            "model": self.model,
            "provider": self.provider,
            "browser": self.browser,
            "started": self.started_wall.isoformat(timespec="seconds"),
            "elapsed_ms": _ms(total),
            "success": self.final.get("success"),
            "result": self.final.get("result"),
            "steps": len(steps),
            "llm_ms_total": _ms(llm_total),
            "llm_ms_avg": _ms(llm_total / len(steps)) if steps else 0.0,
            "observe_ms_avg": _ms(sum(s.observe_ms for s in steps) / len(steps)) if steps else 0.0,
            "action_ms_avg": _ms(sum(s.action_ms for s in steps) / len(steps)) if steps else 0.0,
            "output_tokens": sum(s.output_tokens for s in steps),
            "input_tokens": sum(s.input_tokens for s in steps),
            "actions": sum(len(s.actions) for s in steps),
            "failed_actions": sum(s.failed_actions for s in steps),
            "changed_pages": sum(s.changed_page for s in steps),
            "blocked_actions": sum(s.blocked for s in steps),
            "vision_calls": self.vision_calls,
            "approvals": self.approvals,
            "redactions": sum(int(r.get("count") or 0) for r in self.redactions),
            "pages_visited": len(self.urls),
            "log_path": str(self.path) if self.path else None,
        }

    def close(self) -> dict[str, Any]:
        """Flush, write the transcript, and return the summary."""
        if self._closed:
            return self.summary()
        summary = self.summary()
        self.record({"type": "SUMMARY", **summary})
        self._closed = True
        if self._file is not None:
            try:
                self._file.close()
            except Exception:  # pragma: no cover
                pass
            self._file = None
        if self.persist and self.log_dir is not None:
            try:
                self._write_markdown(summary)
            except Exception:  # pragma: no cover
                pass
        return summary

    def _write_markdown(self, summary: dict[str, Any]) -> None:
        assert self.log_dir is not None
        self.log_dir.mkdir(parents=True, exist_ok=True)
        path = self.log_dir / f"{self.started_wall:%Y%m%d-%H%M%S}-{self.run_id}.md"

        lines: list[str] = [
            f"# Run {self.run_id}",
            "",
            f"- **Goal:** {self.task}",
            f"- **When:** {self.started_wall:%Y-%m-%d %H:%M:%S}",
            f"- **Model:** `{self.model}`",
            f"- **Transport:** {self.provider} ({self.browser})",
            f"- **Outcome:** {'success' if summary.get('success') else 'incomplete'}",
            f"- **Wall time:** {summary['elapsed_ms']:.0f} ms",
            f"- **Steps:** {summary['steps']} | "
            f"avg LLM {summary['llm_ms_avg']:.0f} ms | "
            f"avg perceive {summary['observe_ms_avg']:.0f} ms | "
            f"avg act {summary['action_ms_avg']:.0f} ms",
            f"- **Tokens:** {summary['input_tokens']} in / {summary['output_tokens']} out",
            f"- **Actions:** {summary['actions']} ({summary['failed_actions']} failed, "
            f"{summary['blocked_actions']} blocked by guards)",
            f"- **Vision frames:** {summary['vision_calls']} | "
            f"**PII fields masked:** {summary['redactions']}",
            "",
        ]
        if self.plan:
            lines.append("## Plan")
            lines.extend(f"{i}. {s}" for i, s in enumerate(self.plan, 1))
            lines.append("")

        lines.append("## Timeline")
        for entry in self.events:
            kind = entry.get("kind")
            step = entry.get("step")
            prefix = f"[{entry.get('t_ms', 0):>7.0f}ms]"
            where = f" step {step}" if step else ""
            if kind == "PAGE_STATE":
                lines.append(f"{prefix}{where}  page: {entry.get('url')} "
                             f"({entry.get('elements')} elements, {entry.get('observe_ms')}ms)")
            elif kind == _PROMPT_KIND:
                lines.append(f"{prefix}{where}  prompt sent ({entry.get('chars')} chars"
                             + (", with screenshot" if entry.get("vision") else "") + ")")
            elif kind == "ACTION":
                status = "ok" if entry.get("ok") else "FAILED"
                detail = entry.get("label") or ""
                changed = "changed" if entry.get("changed_page") else "no-change"
                lines.append(f"{prefix}{where}  action: {entry.get('action')} {status} "
                             f"{detail} ({changed}, {entry.get('ms')}ms)")
                if entry.get("error"):
                    lines.append(f"{' ' * len(prefix)}          {entry['error']}")
            elif kind == "VISION":
                lines.append(f"{prefix}{where}  vision: {entry.get('reason')}")
            elif kind == "NUDGE":
                lines.append(f"{prefix}{where}  guard: {entry.get('nudge')}")
            elif kind == "BLOCKED":
                lines.append(f"{prefix}{where}  blocked: {'; '.join(entry.get('reasons') or [])}")
            elif kind == "REDACTIONS":
                lines.append(f"{prefix}{where}  redacted: {entry.get('redactions')}")
            elif kind == "APPROVAL_REQUIRED":
                lines.append(f"{prefix}{where}  approval requested ({entry.get('mode')})")
            elif kind == "STEP_COMPLETE":
                timing = entry.get("timing") or {}
                lines.append(f"{prefix}{where}  step done in {timing.get('total_ms', 0):.0f}ms "
                             f"(llm {timing.get('llm_ms', 0):.0f}ms)")
            elif kind == "ERROR":
                lines.append(f"{prefix}{where}  ERROR: {entry.get('error')}")
            elif kind == "FINAL_RESULT":
                lines.append(f"{prefix}  final: {entry.get('result')}")

        lines.append("")
        lines.append("## Prompts")
        for entry in self.events:
            if entry.get("kind") != _PROMPT_KIND or not entry.get("prompt"):
                continue
            lines.append(f"### Step {entry.get('step')} ({entry.get('chars')} chars)")
            lines.append("")
            lines.append("```text")
            lines.append(str(entry["prompt"]))
            lines.append("```")
            lines.append("")

        if self.final.get("result"):
            lines.append("## Result")
            lines.append("")
            lines.append(str(self.final["result"]))
            lines.append("")

        path.write_text("\n".join(lines), encoding="utf-8")


# ---------------------------------------------------------------------------
# Process-wide recent-runs ring, exposed by the receiver's /runs endpoints.
# ---------------------------------------------------------------------------


class RunRegistry:
    """Bounded in-memory index of recent runs, newest first."""

    def __init__(self, limit: int = 30) -> None:
        self.limit = limit
        self._runs: list[RunJournal] = []

    def add(self, journal: RunJournal) -> None:
        self._runs.append(journal)
        if len(self._runs) > self.limit:
            self._runs = self._runs[-self.limit :]

    def summaries(self) -> list[dict[str, Any]]:
        return [j.summary() for j in reversed(self._runs)]

    def get(self, run_id: str) -> RunJournal | None:
        for journal in self._runs:
            if journal.run_id == run_id:
                return journal
        return None
