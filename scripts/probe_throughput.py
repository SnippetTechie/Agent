"""Measure raw decode throughput of the vLLM server.

Run: python scripts/probe_throughput.py
"""

import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402

BASE = "http://127.0.0.1:8000/v1"


async def one_run(client: httpx.AsyncClient, max_tokens: int) -> tuple[float, int]:
    payload = {
        "model": "gemma-3",
        "messages": [{"role": "user", "content": "Count from 1 to 400, comma separated."}],
        "temperature": 0.0,
        "max_tokens": max_tokens,
    }
    started = time.perf_counter()
    resp = await client.post(f"{BASE}/chat/completions", json=payload)
    elapsed = time.perf_counter() - started
    usage = resp.json().get("usage", {})
    return elapsed, usage.get("completion_tokens", 0)


async def main() -> None:
    async with httpx.AsyncClient(timeout=180.0) as client:
        info = (await client.get(f"{BASE}/models")).json()["data"][0]
        print(f"model root: {info.get('root')}")

        await one_run(client, 16)  # warm up

        for max_tokens in (128, 256, 512):
            elapsed, out = await one_run(client, max_tokens)
            rate = out / elapsed if elapsed else 0
            print(
                f"max_tokens={max_tokens:>4} | generated={out:>4} tok | "
                f"{elapsed:6.2f}s | {rate:5.1f} tok/s"
            )


if __name__ == "__main__":
    asyncio.run(main())
