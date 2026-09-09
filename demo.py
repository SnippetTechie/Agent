"""V.A.R.M.A demo - run a browser task from the terminal.

This is the same agent loop the extension uses over its WebSocket, driven
directly. It attaches to the browser you already have open (via CDP), so you
watch the real tab being controlled.

Prerequisites
-------------
1. Start Chrome/Brave with a debugging port:
     chrome.exe --remote-debugging-port=9222 --user-data-dir="C:\\ChromeDevProfile"

2. Serve the model (remote GPU box -> tunnel first):
     ssh -L 8000:localhost:8000 user@gpu-host
     vllm serve <model> --served-model-name gemma-3 ...

Usage
-----
    python demo.py "Search for ISRO on Google"
    python demo.py "Open wikipedia.org and search for ISRO" --max-steps 8
    python demo.py "..." --vllm http://127.0.0.1:8000/v1 --cdp http://localhost:9222
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from server.agent import AgentLoop, AgentRunConfig, BrowserSessionManager, VLLMClient  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a V.A.R.M.A browser task.")
    parser.add_argument("task", nargs="?", default="Search for ISRO on Google")
    parser.add_argument("--max-steps", type=int, default=10)
    parser.add_argument("--vllm", default="http://127.0.0.1:8000/v1")
    parser.add_argument("--model", default="gemma-3")
    parser.add_argument("--cdp", default="http://localhost:9222")
    parser.add_argument("--no-overlay", action="store_true", help="Do not draw element boxes")
    parser.add_argument("--no-cursor", action="store_true", help="Do not animate a cursor")
    return parser.parse_args()


async def main() -> int:
    args = parse_args()

    llm = VLLMClient(base_url=args.vllm, model=args.model, max_tokens=256)
    if not await llm.ping():
        print(f"ERROR: cannot reach vLLM at {args.vllm}")
        print("Start the tunnel: ssh -L 8000:localhost:8000 user@gpu-host")
        return 2
    await llm.resolve_model(args.model)
    print(f"model: {llm.model} @ {args.vllm}")

    session = BrowserSessionManager(
        cdp_url=args.cdp,
        show_overlay=not args.no_overlay,
        show_cursor=not args.no_cursor,
    )

    def on_event(event: dict) -> None:
        kind = event.get("type")
        if kind == "PAGE_STATE":
            print(
                f"  perceive  {str(event.get('url', ''))[:80]}  "
                f"({len(event.get('elements', []))} elements, {event.get('observe_ms')}ms)"
            )
        elif kind == "ACTION":
            action = event.get("action", {})
            status = "ok " if action.get("ok", True) else "ERR"
            detail = (
                action.get("label")
                or action.get("url")
                or action.get("text")
                or action.get("key")
                or ""
            )
            print(f"  act  [{status}] {action.get('action')} {str(detail)[:60]}")
            if action.get("error"):
                print(f"          {action['error']}")
        elif kind == "STEP_COMPLETE":
            timing = event.get("timing", {})
            print(
                f"  step {event.get('step')}: {timing.get('total_ms', 0):.0f}ms total "
                f"(perceive {timing.get('observe_ms', 0):.0f} + "
                f"think {timing.get('llm_ms', 0):.0f} + "
                f"act {timing.get('action_ms', 0):.0f})"
            )
        elif kind == "FINAL_RESULT":
            print(f"\nRESULT (success={event.get('success')}): {event.get('result')}")
        elif kind == "ERROR":
            print(f"  ERROR: {event.get('error')}")

    loop = AgentLoop(session, llm, on_event=on_event)
    started = time.perf_counter()
    result = await loop.run(AgentRunConfig(task=args.task, max_steps=args.max_steps))
    elapsed = time.perf_counter() - started

    metrics = result.get("metrics", {})
    print(f"\ntotal: {elapsed:.1f}s over {metrics.get('steps', 0)} steps")
    if metrics:
        print(
            f"avg/step: {metrics['avg_step_ms']:.0f}ms  "
            f"(perceive {metrics['avg_observe_ms']:.0f}ms, "
            f"think {metrics['avg_llm_ms']:.0f}ms, "
            f"act {metrics['avg_action_ms']:.0f}ms)"
        )

    await llm.aclose()
    await session.disconnect()
    return 0 if result.get("success") else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
