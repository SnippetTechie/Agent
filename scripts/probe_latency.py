"""Measure vLLM latency vs prompt size and output size. Run: python scripts/probe_latency.py"""

import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.agent import VLLMClient  # noqa: E402
from server.agent import prompts  # noqa: E402


def filler(tokens: int) -> str:
    """Roughly `tokens` tokens of plausible page text."""
    unit = "[42] button \"Add to cart\" @(300,420 120x36) (href=https://example.com/x) "
    return unit * max(1, tokens // 14)


async def main() -> None:
    client = VLLMClient(base_url="http://127.0.0.1:8000/v1", model="gemma-3", max_tokens=512)
    await client.resolve_model("gemma-3")
    print(f"model={client.model}\n")

    print("--- prompt size sweep (fixed small output) ---")
    for size in (200, 1000, 2500, 5000, 9000):
        state_text = filler(size)
        prompt = prompts.build_step_prompt("Search for ISRO on Google", {}, state_text, [], 1, 15)
        messages = [
            {"role": "system", "content": prompts.SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]
        # warm the prefix cache
        await client.chat(messages, schema=prompts.ACTION_SCHEMA)
        started = time.perf_counter()
        result = await client.chat(messages, schema=prompts.ACTION_SCHEMA)
        elapsed = (time.perf_counter() - started) * 1000
        usage = result["usage"]
        print(
            f"prompt~{size:>5} tok | actual={usage.get('prompt_tokens'):>5} "
            f"| out={usage.get('completion_tokens'):>3} | {elapsed:7.0f} ms"
        )

    print("\n--- output size sweep (fixed small prompt) ---")
    for max_out in (64, 256, 1024):
        prompt = prompts.build_step_prompt("Search for ISRO on Google", {}, filler(300), [], 1, 15)
        messages = [
            {"role": "system", "content": prompts.SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]
        await client.chat(messages, schema=prompts.ACTION_SCHEMA, max_tokens=max_out)
        started = time.perf_counter()
        result = await client.chat(messages, schema=prompts.ACTION_SCHEMA, max_tokens=max_out)
        elapsed = (time.perf_counter() - started) * 1000
        usage = result["usage"]
        print(f"max_tokens={max_out:>5} | out={usage.get('completion_tokens'):>3} | {elapsed:7.0f} ms")

    await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
