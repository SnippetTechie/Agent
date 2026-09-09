"""Run a task and capture screenshots proving the visual layer renders.

Each screenshot is taken from the real page while the overlay (numbered
bounding boxes) and the agent cursor are injected, so the PNGs show exactly
what a human watching the browser would see.

Usage:
    python scripts/capture_visuals.py "Search for ISRO on Google"
    python scripts/capture_visuals.py "Open wikipedia.org and search for ISRO" --out screenshots/visuals

Output goes to <out>/step-NN-before.png and step-NN-after.png, plus a summary
of how many boxes were drawn at each stage.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.agent import AgentLoop, AgentRunConfig, BrowserSessionManager, VLLMClient  # noqa: E402

PROBE = r"""
(() => {
  const overlay = document.getElementById('__varma_overlay__');
  const cursor = document.getElementById('__varma_cursor__');
  return {
    boxes: overlay ? overlay.children.length : 0,
    cursor: cursor ? cursor.style.transform : null,
    cursorVisible: cursor ? cursor.style.display !== 'none' : false,
  };
})()
"""


async def main() -> int:
    parser = argparse.ArgumentParser(description="Capture the agent's on-page visuals.")
    parser.add_argument("task", nargs="?", default="Search for ISRO on Google")
    parser.add_argument("--max-steps", type=int, default=6)
    parser.add_argument("--vllm", default="http://127.0.0.1:8000/v1")
    parser.add_argument("--model", default="gemma-3")
    parser.add_argument("--cdp", default="http://localhost:9222")
    parser.add_argument("--out", default="screenshots/visuals")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    llm = VLLMClient(base_url=args.vllm, model=args.model, max_tokens=256)
    if not await llm.ping():
        print(f"ERROR: cannot reach vLLM at {args.vllm}")
        return 2
    await llm.resolve_model(args.model)

    session = BrowserSessionManager(cdp_url=args.cdp, show_overlay=True, show_cursor=True)
    page = await session.connect()
    print(f"browser: {page.url[:80]}")
    print(f"output : {out_dir.resolve()}\n")

    step_no = 0
    shots: list[str] = []

    async def shoot(tag: str) -> None:
        probe = await page.evaluate(PROBE)
        path = out_dir / f"{tag}.png"
        await page.screenshot(path=str(path))
        shots.append(str(path))
        print(
            f"  saved {path.name:<26} boxes={probe['boxes']:<3} "
            f"cursor={probe['cursor']} visible={probe['cursorVisible']}"
        )

    async def on_event(event: dict) -> None:
        nonlocal step_no
        kind = event.get("type")
        if kind == "PAGE_STATE":
            step_no = event.get("step", step_no)
            # Overlay was just redrawn for this step: capture it before acting.
            await shoot(f"step-{step_no:02d}-before")
        elif kind == "ACTION":
            action = event.get("action", {})
            # refresh_visuals() runs right after the action, but a navigation
            # may still be settling; wait for the boxes to come back first.
            if action.get("action") in ("navigate", "click", "type"):
                for _ in range(20):
                    probe = await page.evaluate(PROBE)
                    if probe["boxes"] > 0:
                        break
                    await asyncio.sleep(0.15)
            await shoot(f"step-{step_no:02d}-after")

    loop = AgentLoop(session, llm, on_event=on_event)
    result = await loop.run(AgentRunConfig(task=args.task, max_steps=args.max_steps))

    print(f"\nsuccess={result.get('success')}")
    print(f"result: {str(result.get('result'))[:160]}")
    print(f"metrics: {result.get('metrics')}")
    print(f"\n{len(shots)} screenshots in {out_dir.resolve()}")

    await llm.aclose()
    await session.disconnect()
    return 0 if result.get("success") else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
