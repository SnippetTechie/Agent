"""V.A.R.M.A native browser agent (CDP-based, low-latency).

Two loops, one browser session:

  loop.AgentLoop   DOM mode    observe the element map -> pick an index -> click it
  game.GameLoop    Game mode   screenshot the viewport -> ground a point -> click it

Both stream the same event vocabulary, so the side panel renders either one
without special casing. The DOM loop is the cheap, exact path for browsing; the
game loop is the expensive per-step path for anything the DOM cannot describe
(a chess board, a Sudoku grid, a canvas game).

Why not browser-use for the hot path:
  * browser-use always captures a screenshot per step even with vision off
  * its default output schema includes planning + thinking fields
  * it rebuilds the browser session per run

Target budget: 1-3s per step with a 12B-class model on a single A6000 for the DOM
loop; roughly 2s for a grounded game step, which pays a screenshot encode and a
full image prefill on every step.
"""

from .session import BrowserSessionManager
from .loop import AgentLoop, AgentRunConfig
from .game import GameLoop, GameRunConfig
from .llm import VLLMClient
from .grounding import (
    GroundingResult,
    build_grounding_prompt,
    parse_grounding_response,
)
from .vision import (
    GROUNDING_SCHEMA,
    GROUNDING_SYSTEM_PROMPT,
    GroundedPoint,
    build_grounding_user_prompt,
    describe_grounded,
    parse_grounding_json,
)

__all__ = [
    "BrowserSessionManager",
    "AgentLoop",
    "AgentRunConfig",
    "GameLoop",
    "GameRunConfig",
    "VLLMClient",
    "GroundingResult",
    "build_grounding_prompt",
    "parse_grounding_response",
    "GroundedPoint",
    "GROUNDING_SCHEMA",
    "GROUNDING_SYSTEM_PROMPT",
    "build_grounding_user_prompt",
    "describe_grounded",
    "parse_grounding_json",
]
