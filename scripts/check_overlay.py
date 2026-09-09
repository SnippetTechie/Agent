"""Diagnose whether the on-page overlay, cursor and click ripple actually render.

Run:
    python scripts/check_overlay.py

It attaches to the browser on CDP, reads the page (which draws the overlay),
then inspects the DOM for the injected nodes and reports what it found.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.agent import BrowserSessionManager  # noqa: E402

PROBE = r"""
(() => {
  const overlay = document.getElementById('__varma_overlay__');
  const cursor = document.getElementById('__varma_cursor__');
  const style = document.getElementById('__varma_style__');
  return {
    url: location.href,
    overlay: overlay
      ? {
          present: true,
          children: overlay.children.length,
          zIndex: getComputedStyle(overlay).zIndex,
          pointerEvents: getComputedStyle(overlay).pointerEvents,
          position: getComputedStyle(overlay).position,
          firstBoxRect: overlay.firstElementChild
            ? JSON.parse(JSON.stringify(overlay.firstElementChild.getBoundingClientRect()))
            : null,
        }
      : { present: false },
    cursor: cursor
      ? {
          present: true,
          transform: getComputedStyle(cursor).transform,
          visible: getComputedStyle(cursor).display !== 'none',
        }
      : { present: false },
    rippleKeyframes: !!style,
    bodyChildren: document.body ? document.body.children.length : 0,
  };
})()
"""


async def main() -> int:
    session = BrowserSessionManager(
        cdp_url="http://localhost:9222", show_overlay=True, show_cursor=True
    )
    try:
        page = await session.connect()
        print(f"attached to: {page.url}")

        state = await session.observe()
        elements = state.get("elements", [])
        print(f"observed {len(elements)} elements in {session.last_observe_ms:.1f}ms")

        # Exercise the same path the agent loop uses to put the cursor on screen.
        await session.ensure_cursor_visible()

        probe = await page.evaluate(PROBE)
        print("\n--- DOM probe ---")
        print(f"url              : {probe['url']}")
        print(f"body children    : {probe['bodyChildren']}")
        print(f"overlay          : {probe['overlay']}")
        print(f"cursor           : {probe['cursor']}")
        print(f"ripple keyframes : {probe['rippleKeyframes']}")

        ok = True
        if not probe["overlay"].get("present"):
            print("\nFAIL: overlay node was not injected")
            ok = False
        elif probe["overlay"].get("children", 0) == 0:
            print("\nFAIL: overlay exists but drew no boxes")
            ok = False
        else:
            rect = probe["overlay"].get("firstBoxRect") or {}
            print(
                f"\nOK: overlay drew {probe['overlay']['children']} boxes; "
                f"first at ({rect.get('left', 0):.0f},{rect.get('top', 0):.0f}) "
                f"{rect.get('width', 0):.0f}x{rect.get('height', 0):.0f}"
            )

        if not probe["cursor"].get("present"):
            print("FAIL: cursor node missing after ensure_cursor_visible()")
            ok = False
        else:
            print(f"OK: cursor present, transform={probe['cursor']['transform']}")

        # Move the cursor onto an element and confirm it tracks + ripples.
        if elements:
            await session._move_cursor(
                elements[0]["x"] + elements[0]["w"] / 2,
                elements[0]["y"] + elements[0]["h"] / 2,
                ripple=True,
            )
            await asyncio.sleep(0.4)
            probe2 = await page.evaluate(PROBE)
            print(f"\ncursor after move: {probe2['cursor']}")
            if not probe2["rippleKeyframes"]:
                print("FAIL: ripple keyframes were not injected")
                ok = False
            else:
                print("OK: click ripple keyframes injected")

        # Toggle the visual layer off and confirm it hides.
        await session.apply_visuals(overlay=False, cursor=False)
        hidden = await page.evaluate(PROBE)
        if hidden["overlay"].get("present") and hidden["overlay"].get("children", 0) > 0:
            shown = await page.evaluate(
                "() => { const o = document.getElementById('__varma_overlay__');"
                " return o ? getComputedStyle(o).display : null; }"
            )
            print(f"after toggle off -> overlay display={shown}")
            if shown != "none":
                print("FAIL: overlay did not hide when toggled off")
                ok = False
            else:
                print("OK: overlay hides when toggled off")

        await session.apply_visuals(overlay=True, cursor=True)

        return 0 if ok else 1
    finally:
        await session.disconnect()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
