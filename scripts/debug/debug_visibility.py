"""Confirm whether CSS transitions are throttled in the target tab."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from server.agent import BrowserSessionManager  # noqa: E402


async def main() -> None:
    session = BrowserSessionManager(cdp_url="http://localhost:9222", show_cursor=True)
    page = await session.connect()
    info = await page.evaluate(
        "() => ({ visibility: document.visibilityState, hidden: document.hidden, focused: document.hasFocus() })"
    )
    print(f"tab: {page.url[:70]}")
    print(f"visibilityState={info['visibility']}  hidden={info['hidden']}  hasFocus={info['focused']}")

    await session.ensure_cursor_visible()
    await session._move_cursor(500, 400, ripple=True)
    await asyncio.sleep(0.6)
    computed = await page.evaluate(
        "() => getComputedStyle(document.getElementById('__varma_cursor__')).transform"
    )
    print(f"computed after 0.6s: {computed}")
    if info["hidden"]:
        print("\n=> Tab is backgrounded: Chromium throttles CSS transitions, so the")
        print("   computed value lags. This does NOT affect a visible tab.")
    await session.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
