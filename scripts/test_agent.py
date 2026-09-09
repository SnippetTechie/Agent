"""End-to-end agent test against a live browser + live vLLM.

Usage:
    python scripts/test_agent.py "Search for ISRO on Google" [max_steps]

Prereqs:
  * Chrome/Brave running with --remote-debugging-port=9222
  * vLLM serving the model (default http://127.0.0.1:8000/v1)
"""

import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.agent import AgentLoop, AgentRunConfig, BrowserSessionManager, VLLMClient  # noqa: E402


async def main() -> None:
    task = sys.argv[1] if len(sys.argv) > 1 else "Search for ISRO on Google"
    max_steps = int(sys.argv[2]) if len(sys.argv) > 2 else 6

    llm = VLLMClient(base_url="http://127.0.0.1:8000/v1", model="gemma-3", max_tokens=256)
    session = BrowserSessionManager(cdp_url="http://localhost:9222", show_overlay=True)
    await llm.resolve_model("gemma-3")

    async def on_event(event: dict) -> None:
        kind = event.get("type")
        if kind == "PAGE_STATE":
            print(f"  [page] {event.get('url')}  ({len(event.get('elements', []))} elements, "
                  f"{event.get('observe_ms')}ms)")
        elif kind == "ACTION":
            action = event.get("action", {})
            print(f"  [act ] {action}")
        elif kind == "STEP_COMPLETE":
            timing = event.get("timing", {})
            print(f"  [step] {event.get('step')} total={timing.get('total_ms')}ms "
                  f"(observe={timing.get('observe_ms')} llm={timing.get('llm_ms')} "
                  f"act={timing.get('action_ms')})")
        elif kind == "FINAL_RESULT":
            print(f"\nFINAL: success={event.get('success')} result={event.get('result')!r}")
            print(f"METRICS: {event.get('metrics')}")
        elif kind == "ERROR":
            print(f"  [err ] {event.get('error')}")

    loop = AgentLoop(session, llm, on_event=on_event)
    started = time.perf_counter()
    result = await loop.run(AgentRunConfig(task=task, max_steps=max_steps))
    print(f"\nelapsed: {(time.perf_counter() - started):.1f}s")
    print(f"result: {result}")
    await llm.aclose()
    await session.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
