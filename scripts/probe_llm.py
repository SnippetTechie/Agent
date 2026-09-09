"""Latency probe for the native agent's vLLM path. Run: python scripts/probe_llm.py"""

import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.agent import VLLMClient  # noqa: E402
from server.agent import prompts  # noqa: E402

STATE_TEXT = """URL: https://www.google.com/
TITLE: Google
SCROLL: y=0 of 0
HEADINGS:

INTERACTIVE ELEMENTS (6 visible):
[0] textarea "Search" @(400,300 500x44)
[1] button "Google Search" @(400,360 120x36)
[2] button "I'm Feeling Lucky" @(540,360 150x36)
[3] a "About" @(20,20 60x20)
[4] a "Gmail" @(120,20 60x20)
[5] a "Images" @(200,20 60x20)

PAGE TEXT:
Google
"""


async def main() -> None:
    base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000/v1"
    client = VLLMClient(base_url=base, model="gemma-3", max_tokens=512)

    print("models:", await client.list_models())
    print("resolved:", await client.resolve_model("gemma-3"))

    prompt = prompts.build_step_prompt("Search for ISRO on Google", {}, STATE_TEXT, [], 1, 15)
    messages = [
        {"role": "system", "content": prompts.SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]

    for run in range(3):
        started = time.perf_counter()
        result = await client.chat(messages, schema=prompts.ACTION_SCHEMA)
        elapsed = (time.perf_counter() - started) * 1000
        print(f"run {run + 1}: {elapsed:.0f} ms  usage={result['usage']}")
        print("  ->", result["json"])

    await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
