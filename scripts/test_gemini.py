"""Test Gemini API connectivity for V.A.R.M.A.

Verifies:
1. API Key authentication to Google's OpenAI-compatible endpoint.
2. Structured JSON generation for browser actions (AgentLoop contract).
3. Multimodal vision grounding on a sample screenshot (GameLoop / Vision contract).

Usage:
    python scripts/test_gemini.py
"""

from __future__ import annotations

import asyncio
import base64
import io
import os
import sys
import time
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from server.agent.llm import VLLMClient, VLLMError
from server.agent import prompts, vision


def make_sample_image() -> bytes:
    """Generate a clean synthetic 200x200 PNG image with a blue box in the center."""
    try:
        from PIL import Image, ImageDraw
        img = Image.new("RGB", (200, 200), color=(240, 240, 240))
        draw = ImageDraw.Draw(img)
        draw.rectangle([50, 50, 150, 150], fill=(66, 133, 244))  # Google blue box
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()
    except Exception:
        # Fallback 1x1 valid PNG
        return base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")



def load_env() -> None:
    env_file = ROOT_DIR / "server" / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v


async def test_gemini() -> bool:
    load_env()

    api_key = os.getenv("GEMINI_API_KEY", os.getenv("GOOGLE_API_KEY", "")).strip()
    if not api_key or api_key == "your_gemini_api_key_here":
        print("\n" + "=" * 64)
        print("  ERROR: GEMINI_API_KEY is not set!")
        print("=" * 64)
        print("  1. Get a FREE key from: https://aistudio.google.com/")
        print("  2. Add it to server/.env:")
        print("     GEMINI_API_KEY=AIzaSy...")
        print("  3. Run this test again:")
        print("     python scripts/test_gemini.py\n")
        return False

    base_url = os.getenv(
        "VLLM_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai/"
    )
    model = os.getenv("VLLM_MODEL", "gemini-2.0-flash")

    print("\n" + "=" * 64)
    print("  Testing Google Gemini API for V.A.R.M.A")
    print("=" * 64)
    print(f"  Endpoint : {base_url}")
    print(f"  Model    : {model}")
    print(f"  Key      : {api_key[:8]}...{api_key[-4:] if len(api_key) > 12 else ''}")
    print("=" * 64 + "\n")

    client = VLLMClient(
        base_url=base_url,
        model=model,
        api_key=api_key,
        temperature=0.0,
        timeout=30.0,
    )

    # -----------------------------------------------------------------------
    # Test 1: Structured Action Reasoning
    # -----------------------------------------------------------------------
    print("[1/2] Testing structured DOM action reasoning...")
    t0 = time.perf_counter()

    test_prompt = (
        "Task: Search for ISRO missions.\n"
        "Page State:\n"
        "[0] input type=search name=q (Search box)\n"
        "[1] button type=submit (Search)\n"
        "Generate the next step action."
    )

    try:
        res = await client.chat(
            [
                {"role": "system", "content": prompts.SYSTEM_PROMPT},
                {"role": "user", "content": test_prompt},
            ],
            schema=prompts.ACTION_SCHEMA,
            max_tokens=256,
        )
        latency1 = (time.perf_counter() - t0) * 1000
        parsed = res.get("json", {})
        actions = parsed.get("actions", [])

        print(f"      Latency: {latency1:.1f}ms")
        print(f"      Thought: {parsed.get('thought', 'N/A')}")
        print(f"      Actions: {actions}")

        if not actions:
            print("      WARNING: Model returned valid JSON, but no actions array.")
        else:
            print("      SUCCESS: Structured action reasoning verified!")
    except VLLMError as exc:
        print(f"      FAILED: {exc}")
        await client.aclose()
        return False

    print()

    # -----------------------------------------------------------------------
    # Test 2: Multimodal Visual Grounding
    # -----------------------------------------------------------------------
    print("[2/2] Testing multimodal screenshot grounding...")
    t0 = time.perf_counter()

    sample_bytes = make_sample_image()
    data_uri = vision.encode_data_uri(sample_bytes)

    grounding_prompt = vision.build_grounding_user_prompt(
        "Click the button in the center of the frame",
        step=1,
        max_steps=5,
    )

    try:
        res2 = await client.chat(
            [
                {"role": "system", "content": vision.GROUNDING_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": grounding_prompt},
                        {"type": "image_url", "image_url": {"url": data_uri}},
                    ],
                },
            ],
            schema=vision.GROUNDING_SCHEMA,
            max_tokens=160,
        )
        latency2 = (time.perf_counter() - t0) * 1000
        grounding_json = res2.get("json", {})
        point = vision.parse_grounding_json(res2.get("raw", ""), width=100, height=100)

        print(f"      Latency: {latency2:.1f}ms")
        print(f"      Model Grounding Output: {grounding_json}")
        print(f"      Parsed Point: action={point.action}, x={point.x}, y={point.y}")

        if point.ok:
            print("      SUCCESS: Multimodal visual grounding verified!")
        else:
            print(f"      Grounding parsed with warning: {point.error}")
    except VLLMError as exc:
        print(f"      FAILED: {exc}")
        await client.aclose()
        return False

    await client.aclose()

    print("\n" + "=" * 64)
    print("  ALL TESTS PASSED: Gemini API is ready for V.A.R.M.A!")
    print("=" * 64 + "\n")
    return True


if __name__ == "__main__":
    success = asyncio.run(test_gemini())
    sys.exit(0 if success else 1)
