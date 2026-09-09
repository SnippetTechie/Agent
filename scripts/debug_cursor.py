"""Debug cursor movement. Run: python scripts/debug_cursor.py"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.agent import BrowserSessionManager  # noqa: E402

READ = "() => { const c = document.getElementById('__varma_cursor__'); return c ? { inline: c.style.transform, computed: getComputedStyle(c).transform, display: c.style.display } : null; }"


async def main() -> None:
    session = BrowserSessionManager(cdp_url="http://localhost:9222", show_cursor=True)
    page = await session.connect()
    state = await session.observe()
    el = state["elements"][0]
    cx = el["x"] + el["w"] / 2
    cy = el["y"] + el["h"] / 2
    print(f"target center: ({cx:.0f},{cy:.0f})  element: {el['tag']} {el.get('label', '')[:40]!r}")

    await session.ensure_cursor_visible()
    print("after ensure:", await page.evaluate(READ))

    await session._move_cursor(cx, cy, ripple=True)
    await asyncio.sleep(0.5)
    print("after move  :", await page.evaluate(READ))
    print("cursor nodes:", await page.evaluate("() => document.querySelectorAll('#__varma_cursor__').length"))

    # Run the raw script directly to surface any error.
    from server.agent import dom

    try:
        raw = await page.evaluate(dom.CURSOR_SCRIPT, {"x": 400, "y": 300, "ripple": True})
        print("raw script returned:", raw)
    except Exception as exc:
        print("raw script ERROR:", type(exc).__name__, exc)
    await asyncio.sleep(0.4)
    print("after raw   :", await page.evaluate(READ))

    await session.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
