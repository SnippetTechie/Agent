"""Verify the overlay is re-drawn after a submit that navigates.

Run: python scripts/debug/test_refresh.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from server.agent import BrowserSessionManager  # noqa: E402

PROBE = "() => { const o = document.getElementById('__varma_overlay__'); return o ? o.children.length : 0; }"


async def main() -> None:
    session = BrowserSessionManager(cdp_url="http://localhost:9222")
    page = await session.connect()

    await page.goto("https://www.google.com/", wait_until="domcontentloaded")
    state = await session.observe()
    print(f"step 0: {len(state['elements'])} elements, overlay boxes={await page.evaluate(PROBE)}")

    # Find the search field and submit a query, exactly like the agent does.
    search_index = None
    for el in state["elements"]:
        if el["tag"].startswith("textarea") or el["tag"] == "input:text":
            search_index = el["i"]
            break
    if search_index is None:
        search_index = 0
    print(f"typing into element [{search_index}] with submit=True")

    result = await session.type_text(search_index, "ISRO", submit=True)
    print(f"type result: ok={result.get('ok')}")
    print(f"after action, overlay boxes={await page.evaluate(PROBE)} (expected 0 - navigation wiped it)")

    await session.refresh_visuals()
    boxes = await page.evaluate(PROBE)
    cursor = await page.evaluate(
        "() => { const c = document.getElementById('__varma_cursor__'); return c ? c.style.display !== 'none' : false; }"
    )
    print(f"after refresh_visuals: boxes={boxes} cursorVisible={cursor}")

    ok = boxes > 0 and cursor
    print("\n" + ("OK: overlay + cursor restored after navigation" if ok else "FAIL: visuals not restored"))
    await session.disconnect()
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    asyncio.run(main())
