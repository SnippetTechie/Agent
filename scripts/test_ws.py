"""Integration test: drive /ws/agent exactly like the extension does.

Usage:
    python scripts/test_ws.py "Search for ISRO on Google"
"""

import asyncio
import json
import sys
import time

import websockets

WS_URL = "ws://127.0.0.1:8002/ws/agent"


async def main() -> int:
    task = sys.argv[1] if len(sys.argv) > 1 else "Search for ISRO on Google"
    success = False

    async with websockets.connect(WS_URL, max_size=8 * 1024 * 1024) as ws:
        await ws.send(json.dumps({
            "type": "START_TASK",
            "task": task,
            "approval_mode": "skip",
            "max_steps": 6,
        }))

        started = time.perf_counter()
        while True:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=90)
            except asyncio.TimeoutError:
                print("TIMEOUT waiting for server")
                return 1

            msg = json.loads(raw)
            kind = msg.get("type")

            if kind == "CONNECTED":
                print(f"[ws] connected -> {msg.get('url')}")
            elif kind == "PAGE_STATE":
                print(f"[ws] page: {msg.get('elements', []) and len(msg['elements'])} elements "
                      f"in {msg.get('observe_ms')}ms  {str(msg.get('url'))[:70]}")
            elif kind == "ACTION":
                action = msg.get("action", {})
                print(f"[ws] action: {action.get('action')} ok={action.get('ok', True)} "
                      f"{str(action.get('label') or action.get('url') or action.get('text') or '')[:50]}")
            elif kind == "STEP_COMPLETE":
                timing = msg.get("timing", {})
                print(f"[ws] step {msg.get('step')} complete: {timing.get('total_ms', 0):.0f}ms")
            elif kind == "FINAL_RESULT":
                success = bool(msg.get("success"))
                print(f"[ws] FINAL success={success} in {time.perf_counter() - started:.1f}s")
                print(f"[ws] result: {msg.get('result')}")
                print(f"[ws] metrics: {msg.get('metrics')}")
                break
            elif kind == "ERROR":
                print(f"[ws] ERROR: {msg.get('error')}")
                return 1
            elif kind == "STOPPED":
                print(f"[ws] STOPPED: {msg.get('reason')}")
                break
            else:
                print(f"[ws] {kind}: {raw[:200]}")

    return 0 if success else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
