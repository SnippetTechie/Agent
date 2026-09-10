"""Does the screenshot format change grounding accuracy?

This is the measurement that decides which encoder game mode should use.

Game mode grounds a *coordinate*, so what matters is not how the image reads to
a human but whether the model's 0-1000 answer lands inside the right cell. JPEG
quantises in 8x8 DCT blocks and smears exactly the high-contrast edges a board is
made of; PNG is lossless. That is a real hypothesis and this probe tests it
rather than assuming it.

Method: render a grid of uniquely labelled cells at known pixel centres, ask the
model to click a named cell, and compare the grounded point against the cell's
true centre. The same targets are asked in both formats, interleaved, so load
from another tenant on the shared GPU box (CLAUDE.md §7) hits both conditions.

Reported per format: mean and max pixel error, and - the number that actually
matters - how many clicks landed inside the correct cell at all. A mean error of
6px is fine on a 120px cell and fatal on a 30px Sudoku cell, so hit-rate is the
honest headline.

Run:  python scripts/probes/probe_grounding_format.py
      python scripts/probes/probe_grounding_format.py --targets 6 --rounds 2
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from server.agent import VLLMClient  # noqa: E402
from server.agent import vision  # noqa: E402

# Deterministic labels: no two cells share a first letter, so "the cell labelled
# K7" cannot be satisfied by the neighbouring cell.
_LABELS = [
    "A1", "B2", "C3", "D4",
    "E5", "F6", "G7", "H8",
    "J1", "K2", "L3", "M4",
    "N5", "P6", "Q7", "R8",
]

ROWS = 4
COLS = 4
CELL = 150
GRID_ORIGIN_X = 60
GRID_ORIGIN_Y = 50


def grid_html() -> str:
    cells = []
    for index, label in enumerate(_LABELS):
        row, col = divmod(index, COLS)
        shade = "#f0d9b5" if (row + col) % 2 else "#b58863"
        cells.append(
            f'<div class="c" style="background:{shade}"><span>{label}</span></div>'
        )
    return (
        "<!doctype html><meta charset=utf-8><title>Grid</title><style>"
        "body{margin:0;background:#f7f7f5}"
        f"#g{{position:absolute;left:{GRID_ORIGIN_X}px;top:{GRID_ORIGIN_Y}px;"
        f"width:{COLS * CELL}px;height:{ROWS * CELL}px;"
        f"display:grid;grid-template-columns:repeat({COLS},1fr);"
        f"grid-template-rows:repeat({ROWS},1fr);border:3px solid #222}}"
        ".c{display:flex;align-items:center;justify-content:center}"
        ".c span{font:600 40px/1 system-ui,sans-serif;color:#1a1a1a;"
        "text-shadow:0 1px 0 rgba(255,255,255,.6)}"
        "</style><div id=g>" + "".join(cells) + "</div>"
    )


def grid_uri() -> str:
    return "data:text/html;base64," + base64.b64encode(grid_html().encode("utf-8")).decode("ascii")


async def ask(client: VLLMClient, uri: str, label: str) -> dict | None:
    """One grounding call, retried across a transient endpoint restart.

    The GPU box is shared and any tenant's launcher can restart the model
    mid-sweep (CLAUDE.md §7) - observed as "Server disconnected" followed by
    "All connection attempts failed". Retrying turns that into a slower run
    instead of a table of zeros that reads like a model failure.
    """
    prompt = vision.build_grounding_user_prompt(
        f"Click the cell labelled {label}.", step=1, max_steps=1
    )
    for attempt in range(3):
        try:
            return await client.chat(
                [
                    {"role": "system", "content": vision.GROUNDING_SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": uri}},
                        ],
                    },
                ],
                schema=vision.GROUNDING_SCHEMA,
            )
        except Exception as exc:
            if attempt == 2:
                print(f"    request failed after 3 attempts: {exc}")
                return None
            await asyncio.sleep(3.0 * (attempt + 1))
    return None


def true_centre(label: str) -> tuple[float, float]:
    index = _LABELS.index(label)
    row, col = divmod(index, COLS)
    return (
        GRID_ORIGIN_X + col * CELL + CELL / 2,
        GRID_ORIGIN_Y + row * CELL + CELL / 2,
    )


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--vllm", default="http://127.0.0.1:8000/v1")
    ap.add_argument("--model", default="gemma4-12b-it")
    ap.add_argument("--cdp", default="http://localhost:9222")
    ap.add_argument("--targets", type=int, default=8, help="Distinct cells asked per round.")
    ap.add_argument("--rounds", type=int, default=2)
    ap.add_argument("--max-tokens", type=int, default=160)
    args = ap.parse_args()

    client = VLLMClient(
        base_url=args.vllm, model=args.model, max_tokens=args.max_tokens, temperature=0.0
    )
    if not await client.ping():
        print(f"ERROR: cannot reach vLLM at {args.vllm}")
        return 2
    await client.resolve_model(args.model)

    from server.agent.session import BrowserSessionManager  # noqa: E402

    session = BrowserSessionManager(cdp_url=args.cdp, show_overlay=False, show_cursor=False)
    try:
        await session.connect()
        await session.navigate(grid_uri())
        await asyncio.sleep(0.7)
        # The overlay/cursor must be off: a drawn box over the grid would be an
        # artefact the model grounds on instead of the board itself.
        png = await session.screenshot(format="png")
        jpg = await session.screenshot(format="jpeg", quality=72)
    except Exception as exc:
        print(f"ERROR: capture failed: {exc}")
        print("Start the browser first:  powershell -File scripts/start_browser.ps1")
        await session.disconnect()
        await client.aclose()
        return 3

    width, height = png["width"], png["height"]
    variants = {
        "png": vision.encode_data_uri(png["bytes"], media_type="image/png"),
        "jpeg": vision.encode_data_uri(jpg["bytes"], media_type="image/jpeg"),
    }
    print(f"model     : {client.model}")
    print(f"frame     : {width}x{height}   grid cell {CELL}px")
    print(f"png       : {len(png['bytes']):,} bytes")
    print(f"jpeg q72  : {len(jpg['bytes']):,} bytes")
    print(f"targets   : {args.targets} cells x {args.rounds} rounds x {len(variants)} formats"
          f" = {args.targets * args.rounds * len(variants)} grounding calls\n")

    targets = _LABELS[: max(1, min(args.targets, len(_LABELS)))]
    stats: dict[str, list[tuple[str, float, bool, str]]] = {name: [] for name in variants}

    for name, uri in variants.items():
        # One warm-up per format so encoder/prefill costs are not read as error.
        if await ask(client, uri, targets[0]) is None:
            print(f"ERROR: warm-up failed for {name}; the endpoint is not usable.")
            await session.disconnect()
            await client.aclose()
            return 4

    for round_index in range(max(1, args.rounds)):
        for name, uri in variants.items():
            for label in targets:
                reply = await ask(client, uri, label)
                if reply is None:
                    continue

                point = vision.parse_grounding_json(
                    reply.get("text", ""), width=width, height=height
                )
                if not point.ok or point.x is None or point.y is None:
                    stats[name].append((label, float("inf"), False, str(point.error)))
                    print(f"  [{name}] {label:<3} no usable point: {point.error}")
                    continue

                cx, cy = true_centre(label)
                error = ((point.x - cx) ** 2 + (point.y - cy) ** 2) ** 0.5
                # Inside the correct cell counts even if the error is non-zero:
                # that is the outcome the game actually observes.
                half = CELL / 2
                inside = abs(point.x - cx) <= half and abs(point.y - cy) <= half
                stats[name].append((label, error, inside, ""))
                print(
                    f"  [{name}] {label:<3} -> ({point.x:>4},{point.y:>4})"
                    f"  truth ({cx:>5.0f},{cy:>5.0f})  err {error:>6.1f}px"
                    f"  {'OK' if inside else 'MISS'}"
                )

    print("\n" + "=" * 68)
    print(f"{'format':<8} {'n':>3} {'mean err':>10} {'max err':>9} {'hit rate':>10} {'median err':>11}")
    for name in variants:
        rows = stats[name]
        if not rows:
            continue
        errors = [r[1] for r in rows if r[1] != float("inf")]
        hits = sum(1 for r in rows if r[2])
        if errors:
            print(
                f"{name:<8} {len(rows):>3} {statistics.mean(errors):>9.1f}px"
                f" {max(errors):>8.1f}px {hits / len(rows):>9.1%}"
                f" {statistics.median(errors):>10.1f}px"
            )
        else:
            print(f"{name:<8} {len(rows):>3}   no valid points   {hits / len(rows):>9.1%}")

    print("\nA point landing in the wrong cell is a wrong move the game cannot")
    print("recover from, so hit rate - not mean error - is the number to choose on.")

    await session.disconnect()
    await client.aclose()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
