"""CDP browser session management.

Connects to an already-running Chrome/Brave over the DevTools Protocol so the
agent drives the tab the user is actually looking at. Nothing is launched, no
profile is created, and the window size is never touched.

Two properties matter for the latency budget:

* **Reuse** - the Playwright connection is opened once and kept alive across
  steps and tasks. Reconnecting per task costs hundreds of ms and re-attaches
  every tab.
* **Fast perception** - all element discovery happens in one in-page pass
  (``dom.EXTRACT_SCRIPT``) instead of a screenshot round-trip.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from playwright.async_api import Browser, BrowserContext, Page, Playwright, async_playwright

from . import dom as dom_module


class CDPUnavailable(RuntimeError):
    """Raised when the browser cannot be reached on the CDP endpoint."""


class BrowserSessionManager:
    """Owns the Playwright <-> CDP connection and executes page actions."""

    def __init__(
        self,
        cdp_url: str = "http://localhost:9222",
        *,
        minimum_wait_page_load_time: float = 0.15,
        wait_between_actions: float = 0.05,
        navigation_timeout_ms: int = 20_000,
        show_overlay: bool = True,
        show_cursor: bool = True,
        step_settle: float = 0.12,
    ) -> None:
        self.cdp_url = cdp_url
        self.minimum_wait_page_load_time = minimum_wait_page_load_time
        self.wait_between_actions = wait_between_actions
        self.navigation_timeout_ms = navigation_timeout_ms
        self.show_overlay = show_overlay
        self.show_cursor = show_cursor
        self.step_settle = step_settle

        self._playwright: Playwright | None = None
        self._browser: Browser | None = None
        self._context: BrowserContext | None = None
        self._page: Page | None = None
        self._lock = asyncio.Lock()

        # Rolling timings, surfaced in /health and step events.
        self.last_observe_ms: float = 0.0
        self.last_action_ms: float = 0.0

    # -- lifecycle ---------------------------------------------------------

    @property
    def connected(self) -> bool:
        return self._browser is not None and self._browser.is_connected() and self._page is not None

    @property
    def page(self) -> Page:
        if self._page is None:
            raise CDPUnavailable("No page attached - call connect() first")
        return self._page

    async def connect(self) -> Page:
        """Connect (or reuse) the CDP session and return the active page."""
        async with self._lock:
            if self.connected:
                # Re-validate the tab still exists.
                try:
                    await self._page.title()  # type: ignore[union-attr]
                    return self._page  # type: ignore[return-value]
                except Exception:
                    self._page = None

            if self._playwright is None:
                self._playwright = await async_playwright().start()

            if self._browser is None or not self._browser.is_connected():
                try:
                    self._browser = await self._playwright.chromium.connect_over_cdp(
                        self.cdp_url, timeout=10_000
                    )
                except Exception as exc:  # pragma: no cover - environment dependent
                    raise CDPUnavailable(
                        f"Cannot connect to browser at {self.cdp_url}: {exc}. "
                        "Start Chrome/Brave with --remote-debugging-port=9222"
                    ) from exc
                self._context = (
                    self._browser.contexts[0]
                    if self._browser.contexts
                    else await self._browser.new_context()
                )

            self._page = await self._pick_active_page()
            self._page.set_default_timeout(self.navigation_timeout_ms)
            return self._page

    async def _pick_active_page(self) -> Page:
        """Prefer the tab the user can actually see."""
        assert self._context is not None
        pages = [p for p in self._context.pages if not p.url.startswith("devtools://")]
        if not pages:
            return await self._context.new_page()

        for page in reversed(pages):
            try:
                state = await page.evaluate("document.visibilityState")
                if state == "visible":
                    return page
            except Exception:
                continue
        return pages[-1]

    async def disconnect(self) -> None:
        """Drop the CDP connection. Does not close the user's browser."""
        async with self._lock:
            self._page = None
            if self._browser is not None:
                try:
                    await self._browser.close()
                except Exception:
                    pass
            self._browser = None
            self._context = None
            if self._playwright is not None:
                try:
                    await self._playwright.stop()
                except Exception:
                    pass
            self._playwright = None

    # -- perception --------------------------------------------------------

    async def observe(self, *, draw_overlay: bool | None = None) -> dict[str, Any]:
        """Extract the current page state and refresh the element registry."""
        page = await self.connect()
        started = time.perf_counter()
        state = await page.evaluate(dom_module.EXTRACT_SCRIPT, {})
        self.last_observe_ms = (time.perf_counter() - started) * 1000.0

        want_overlay = self.show_overlay if draw_overlay is None else draw_overlay
        if want_overlay and state.get("elements"):
            try:
                await page.evaluate(dom_module.OVERLAY_SCRIPT, state)
            except Exception:
                pass
        return state

    async def apply_visuals(
        self, *, overlay: bool | None = None, cursor: bool | None = None
    ) -> dict[str, Any]:
        """Turn the on-page overlay / cursor on or off without re-reading the page.

        Called when the side panel's settings toggle changes, including mid-run.
        """
        if overlay is not None:
            self.show_overlay = overlay
        if cursor is not None:
            self.show_cursor = cursor

        if self._page is None:
            return {"overlay": self.show_overlay, "cursor": self.show_cursor}

        try:
            applied = await self._page.evaluate(
                dom_module.SET_VISUALS_SCRIPT,
                {"overlay": self.show_overlay, "cursor": self.show_cursor},
            )
            return applied if isinstance(applied, dict) else {}
        except Exception:
            return {"overlay": self.show_overlay, "cursor": self.show_cursor}

    async def ensure_cursor_visible(self, *, x: float | None = None, y: float | None = None) -> None:
        """Create/park the cursor so it is on screen from the first step.

        Without this the cursor only appears once the agent performs an action,
        which makes it look like cursor rendering is broken during perception.
        """
        if not self.show_cursor or self._page is None:
            return
        px = 24.0 if x is None else x
        py = 24.0 if y is None else y
        try:
            await self._page.evaluate(
                dom_module.CURSOR_SCRIPT, {"x": px, "y": py, "ripple": False, "instant": True}
            )
        except Exception:
            pass

    async def refresh_visuals(self, *, attempts: int = 3) -> None:
        """Re-draw the overlay after a navigation or DOM-replacing action.

        Uses skipText because the overlay only needs element boxes, and this
        runs mid-step while the user is waiting.

        Retries because a submit/navigate can still be committing when this is
        called: the first pass may run against a document that is about to be
        replaced, leaving the page blank until the next step.
        """
        if not self.show_overlay or self._page is None:
            return

        for attempt in range(attempts):
            try:
                state = await self._page.evaluate(
                    dom_module.EXTRACT_SCRIPT, {"skipText": True}
                )
                if state.get("elements"):
                    await self._page.evaluate(dom_module.OVERLAY_SCRIPT, state)
                    await self.ensure_cursor_visible()
                    return
            except Exception:
                # Execution context destroyed by an in-flight navigation.
                pass

            if attempt < attempts - 1:
                await asyncio.sleep(0.2)

    async def wait_until_ready(self, timeout: float = 3.0) -> bool:
        """Wait briefly for a page that is still loading.

        Returns True if the page looks ready. This is a cheap alternative to
        spending a whole LLM step on a blank DOM right after a navigation.
        """
        if self._page is None:
            return False
        deadline = time.perf_counter() + timeout
        while time.perf_counter() < deadline:
            try:
                ready = await self._page.evaluate("document.readyState")
            except Exception:
                ready = "loading"
            if ready == "complete":
                return True
            await asyncio.sleep(0.15)
        return False

    async def wait_for_stable(self, timeout_ms: int = 1500, quiet_ms: int = 250) -> float:
        """Wait for the DOM to stop mutating after an action.

        Cheaper and more accurate than letting the model spend an LLM step on
        "the page is still loading". Returns the milliseconds actually waited.
        """
        if self._page is None:
            return 0.0
        try:
            result = await self._page.evaluate(
                dom_module.WAIT_STABLE_SCRIPT, timeout_ms
            )
            return float(result.get("waited", 0))
        except Exception:
            await asyncio.sleep(quiet_ms / 1000.0)
            return float(quiet_ms)

    async def clear_overlay(self) -> None:
        if self._page is None:
            return
        try:
            await self._page.evaluate(dom_module.CLEAR_OVERLAY_SCRIPT)
        except Exception:
            pass

    # -- element helpers ---------------------------------------------------

    async def _resolve(self, index: int):
        """Return a Playwright ElementHandle for an extracted index."""
        page = self.page
        handle = await page.evaluate_handle("(i) => (window.__varmaNodes || [])[i] || null", index)
        element = handle.as_element()
        if element is None:
            raise CDPUnavailable(
                f"Element [{index}] is no longer on the page. Re-read the element list."
            )
        return element

    async def _center(self, index: int, *, scroll: bool = True) -> tuple[float, float, str]:
        element = await self._resolve(index)
        if scroll:
            try:
                await element.evaluate(
                    "(el) => el.scrollIntoView({block:'center', inline:'center', behavior:'instant'})"
                )
                await asyncio.sleep(0.05)
            except Exception:
                pass
        box = await element.bounding_box()
        if box is None:
            raise CDPUnavailable(f"Element [{index}] has no layout box (hidden?)")
        label = ""
        try:
            label = await element.evaluate("(el) => (el.innerText || el.value || '').slice(0, 80)")
        except Exception:
            pass
        return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, label

    async def _move_cursor(self, x: float, y: float, *, ripple: bool = False) -> None:
        if not self.show_cursor:
            return
        try:
            await self.page.evaluate(dom_module.CURSOR_SCRIPT, {"x": x, "y": y, "ripple": ripple})
        except Exception:
            pass

    async def _glide_cursor(self, x: float, y: float, *, ripple: bool = False) -> None:
        """Move the cursor in a couple of visible hops before acting.

        A single CSS transition can be over before the user looks at the page.
        Two hops plus the click ripple make the movement legible at 1-3s/step.
        """
        if not self.show_cursor:
            return
        try:
            start = await self.page.evaluate(
                "() => { const c = document.getElementById('__varma_cursor__');"
                " if (!c) return null; const m = c.style.transform.match(/-?[\\d.]+/g);"
                " return m ? { x: parseFloat(m[0]), y: parseFloat(m[1]) } : null; }"
            )
        except Exception:
            start = None

        if start and (abs(start["x"] - x) > 6 or abs(start["y"] - y) > 6):
            mid_x = start["x"] + (x - start["x"]) * 0.6
            mid_y = start["y"] + (y - start["y"]) * 0.6
            await self._move_cursor(mid_x, mid_y)
            await asyncio.sleep(0.09)
        await self._move_cursor(x, y, ripple=ripple)

    # -- actions -----------------------------------------------------------

    async def click(self, index: int, *, double: bool = False) -> dict[str, Any]:
        started = time.perf_counter()
        x, y, label = await self._center(index)
        await self._glide_cursor(x, y)
        await asyncio.sleep(0.07)
        await self.page.mouse.click(x, y, click_count=2 if double else 1)
        await self._move_cursor(x, y, ripple=True)
        await self._settle()
        self.last_action_ms = (time.perf_counter() - started) * 1000.0
        return {"ok": True, "action": "click", "index": index, "label": label, "x": x, "y": y}

    async def hover(self, index: int) -> dict[str, Any]:
        started = time.perf_counter()
        x, y, label = await self._center(index)
        await self._glide_cursor(x, y)
        await self.page.mouse.move(x, y)
        await asyncio.sleep(0.08)
        self.last_action_ms = (time.perf_counter() - started) * 1000.0
        return {"ok": True, "action": "hover", "index": index, "label": label}

    async def type_text(
        self,
        index: int,
        text: str,
        *,
        submit: bool = False,
        clear: bool = True,
    ) -> dict[str, Any]:
        started = time.perf_counter()
        x, y, label = await self._center(index)
        await self._glide_cursor(x, y)
        await self.page.mouse.click(x, y)
        await asyncio.sleep(0.04)

        element = await self._resolve(index)
        try:
            # Fast path: native value set + input/change events (what React and
            # friends listen for). Falls back to typing for contenteditable.
            await element.evaluate(
                """(el, args) => {
                    const [text, clear] = args;
                    const setVal = (node, value) => {
                        const proto = node instanceof HTMLTextAreaElement
                            ? HTMLTextAreaElement.prototype
                            : HTMLInputElement.prototype;
                        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
                        if (desc && desc.set) desc.set.call(node, value);
                        else node.value = value;
                    };
                    el.focus();
                    if (clear) {
                        if (el.isContentEditable) el.textContent = '';
                        else setVal(el, '');
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    if (el.isContentEditable) {
                        el.textContent = text;
                        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
                    } else {
                        setVal(el, text);
                        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
                    }
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    return true;
                }""",
                [text, clear],
            )
        except Exception:
            await element.fill(text)

        if submit:
            await asyncio.sleep(0.05)
            await self.page.keyboard.press("Enter")

        await self._settle()
        self.last_action_ms = (time.perf_counter() - started) * 1000.0
        return {"ok": True, "action": "type", "index": index, "label": label, "text": text, "submit": submit}

    async def press(self, key: str) -> dict[str, Any]:
        started = time.perf_counter()
        await self.page.keyboard.press(key)
        await self._settle()
        self.last_action_ms = (time.perf_counter() - started) * 1000.0
        return {"ok": True, "action": "press", "key": key}

    async def scroll(self, *, direction: str = "down", amount: int = 0, index: int | None = None) -> dict[str, Any]:
        started = time.perf_counter()
        page = self.page
        if index is not None:
            element = await self._resolve(index)
            await element.evaluate(
                "(el) => el.scrollIntoView({block:'center', inline:'center', behavior:'instant'})"
            )
        else:
            delta = amount if amount else int((await page.evaluate("window.innerHeight")) * 0.8)
            if direction == "up":
                delta = -delta
            await page.evaluate("(d) => window.scrollBy({top: d, behavior: 'instant'})", delta)
        await self._settle()
        self.last_action_ms = (time.perf_counter() - started) * 1000.0
        return {"ok": True, "action": "scroll", "direction": direction, "amount": amount}

    async def navigate(self, url: str, *, new_tab: bool = False) -> dict[str, Any]:
        started = time.perf_counter()
        if "://" not in url:
            url = "https://" + url
        page = self.page
        # Show the cursor immediately so the page has a visible agent presence
        # even though navigation is not a pointer action.
        await self._move_cursor(24, 24)
        try:
            if new_tab:
                page = await page.context.new_page()
                self._page = page
                await page.goto(url, wait_until="domcontentloaded", timeout=self.navigation_timeout_ms)
            else:
                await page.goto(url, wait_until="domcontentloaded", timeout=self.navigation_timeout_ms)
        except Exception as exc:
            # Navigation to a slow page should not kill the step; the next
            # observe() will report whatever loaded.
            await asyncio.sleep(self.minimum_wait_page_load_time)
            self.last_action_ms = (time.perf_counter() - started) * 1000.0
            return {"ok": False, "action": "navigate", "url": url, "error": str(exc)[:200]}
        await self.wait_for_stable(timeout_ms=2500, quiet_ms=300)
        self.last_action_ms = (time.perf_counter() - started) * 1000.0
        return {"ok": True, "action": "navigate", "url": url, "final_url": page.url}

    async def go_back(self) -> dict[str, Any]:
        started = time.perf_counter()
        try:
            await self.page.go_back(wait_until="domcontentloaded", timeout=self.navigation_timeout_ms)
        except Exception:
            pass
        await asyncio.sleep(self.minimum_wait_page_load_time)
        self.last_action_ms = (time.perf_counter() - started) * 1000.0
        return {"ok": True, "action": "go_back", "url": self.page.url}

    async def wait(self, seconds: float) -> dict[str, Any]:
        seconds = max(0.1, min(float(seconds or 1.0), 10.0))
        await asyncio.sleep(seconds)
        return {"ok": True, "action": "wait", "seconds": seconds}

    async def wait_for_text(self, text: str, timeout: float = 5.0) -> dict[str, Any]:
        """Wait until ``text`` appears on the page (case-insensitive)."""
        if self._page is None:
            return {"ok": False, "action": "wait_for", "error": "no page"}
        needle = (text or "").strip().lower()
        if not needle:
            return {"ok": False, "action": "wait_for", "error": "empty text"}
        deadline = time.perf_counter() + min(timeout, 15.0)
        while time.perf_counter() < deadline:
            try:
                body = await self._page.evaluate("() => (document.body && document.body.innerText) || ''")
            except Exception:
                body = ""
            if needle in (body or "").lower():
                return {"ok": True, "action": "wait_for", "text": text}
            await asyncio.sleep(0.2)
        return {"ok": False, "action": "wait_for", "error": f"'{text}' did not appear"}

    async def read_text(self) -> dict[str, Any]:
        page = self.page
        text = await page.evaluate(
            """() => {
                const b = document.body;
                if (!b) return '';
                const c = b.cloneNode(true);
                c.querySelectorAll('script,style,noscript,svg,iframe,canvas').forEach(n => n.remove());
                return (c.innerText || c.textContent || '').replace(/\\n{3,}/g, '\\n\\n').trim().slice(0, 6000);
            }"""
        )
        return {"ok": True, "action": "read", "text": text, "url": page.url}

    async def _settle(self) -> None:
        """Wait for the page to stop changing, not a fixed duration."""
        if self.wait_between_actions > 0:
            await asyncio.sleep(self.wait_between_actions)
        await self.wait_for_stable(timeout_ms=900, quiet_ms=200)

    async def page_info(self) -> dict[str, Any]:
        if self._page is None:
            return {}
        try:
            return await self._page.evaluate(
                "() => ({url: location.href, title: document.title, ready: document.readyState})"
            )
        except Exception:
            return {}
