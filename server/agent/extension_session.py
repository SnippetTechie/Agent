import asyncio
import time
from typing import Any
from fastapi import WebSocket


class ExtensionSession:
    """Controls the browser tab directly through the extension over WebSocket.
    
    Allows V.A.R.M.A to automate tasks on ANY browser without requiring Playwright
    or CDP (--remote-debugging-port=9222).
    """

    def __init__(
        self,
        websocket: WebSocket,
        auto_redact: bool = True,
        show_overlay: bool = True,
        show_cursor: bool = True,
    ):
        self.ws = websocket
        self.auto_redact = auto_redact
        self.show_overlay = show_overlay
        self.show_cursor = show_cursor
        self.tab_scope = "single"
        self.last_observe_ms = 35.0
        self.cdp_url = "extension://active-tab"
        self._req_id = 0
        self._pending: dict[int, asyncio.Future[dict[str, Any]]] = {}
        self.on_stop_requested = None

    def handle_driver_response(self, msg: dict[str, Any]) -> None:
        req_id = msg.get("id")
        if req_id in self._pending and not self._pending[req_id].done():
            self._pending[req_id].set_result(msg.get("result") or {})

    async def _send_req(self, action: str, **kwargs) -> dict[str, Any]:
        self._req_id += 1
        rid = self._req_id
        loop = asyncio.get_running_loop()
        fut: asyncio.Future[dict[str, Any]] = loop.create_future()
        self._pending[rid] = fut
        payload = {"type": "DRIVER_REQUEST", "id": rid, "action": action, **kwargs}
        try:
            await self.ws.send_json(payload)
            return await asyncio.wait_for(fut, timeout=15.0)
        except Exception as exc:
            return {"ok": False, "error": str(exc)}
        finally:
            self._pending.pop(rid, None)

    async def connect(self) -> Any:
        class TabProxy:
            url = "https://active-browser-tab"
        return TabProxy()

    async def observe(self, *, draw_overlay: bool | None = None) -> dict[str, Any]:
        start = time.perf_counter()
        overlay = self.show_overlay if draw_overlay is None else draw_overlay
        state = await self._send_req(
            "observe",
            redact=self.auto_redact,
            show_overlay=overlay,
            show_cursor=self.show_cursor,
        )
        self.last_observe_ms = (time.perf_counter() - start) * 1000.0
        return state

    async def wait_until_ready(self, timeout: float = 2.0) -> None:
        pass

    async def ensure_cursor_visible(self, *, x: float | None = None, y: float | None = None) -> None:
        if not self.show_cursor:
            return
        await self._send_req("cursor", x=x or 150, y=y or 150, instant=True)

    async def ensure_task_border(self) -> None:
        await self._send_req("task_border")

    async def ensure_stop_control(self) -> None:
        pass

    async def refresh_visuals(self) -> None:
        await self._send_req(
            "refresh_visuals",
            show_overlay=self.show_overlay,
            show_cursor=self.show_cursor,
        )

    async def clear_overlay(self) -> None:
        await self._send_req("clear_overlay")

    async def click(self, index: int, double: bool = False) -> dict[str, Any]:
        return await self._send_req(
            "click", index=index, double=double, show_cursor=self.show_cursor
        )

    async def type_text(
        self, index: int, text: str, submit: bool = True, clear: bool = False
    ) -> dict[str, Any]:
        return await self._send_req(
            "type",
            index=index,
            text=text,
            submit=submit,
            clear=clear,
            show_cursor=self.show_cursor,
        )

    async def navigate(self, url: str, new_tab: bool = False) -> dict[str, Any]:
        return await self._send_req("navigate", url=url, new_tab=new_tab)

    async def scroll(
        self, direction: str = "down", amount: int | None = None
    ) -> dict[str, Any]:
        return await self._send_req(
            "scroll", direction=direction, amount=amount or 400
        )

    async def hover(self, index: int) -> dict[str, Any]:
        return {"ok": True, "action": "hover", "index": index}

    async def press(self, key: str = "Enter") -> dict[str, Any]:
        return {"ok": True, "action": "press", "key": key}

    async def wait(self, seconds: float = 1.0) -> dict[str, Any]:
        await asyncio.sleep(min(seconds, 2.0))
        return {"ok": True, "action": "wait", "seconds": seconds}

    async def wait_for_text(self, text: str, timeout: float = 5.0) -> dict[str, Any]:
        return {"ok": True, "action": "wait_for", "text": text}

    async def read_text(self) -> dict[str, Any]:
        return await self._send_req("read")

    async def go_back(self) -> dict[str, Any]:
        return {"ok": True, "action": "go_back"}

    async def apply_visuals(
        self,
        *,
        overlay: bool | None = None,
        cursor: bool | None = None,
        redact: bool | None = None,
    ) -> dict[str, Any]:
        if overlay is not None:
            self.show_overlay = overlay
        if cursor is not None:
            self.show_cursor = cursor
        if redact is not None:
            self.auto_redact = redact
        await self._send_req(
            "apply_visuals",
            show_overlay=self.show_overlay,
            show_cursor=self.show_cursor,
            redact=self.auto_redact,
        )
        return {
            "overlay": self.show_overlay,
            "cursor": self.show_cursor,
            "redact": self.auto_redact,
        }
