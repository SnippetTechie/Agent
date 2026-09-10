"""V.A.R.M.A native browser agent (CDP-based, low-latency).

This package replaces the browser-use request path with a purpose-built loop:

    observe (compact DOM + on-screen element map)
      -> think (one vLLM structured-output call)
      -> act   (CDP / in-page execution)
      -> repeat

Why not browser-use for the hot path:
  * browser-use always captures a screenshot per step even with vision off
  * its default output schema includes planning + thinking fields
  * it rebuilds the browser session per run

Target budget: 1-3s per step with a 12B-class model on a single A6000.
"""

from .session import BrowserSessionManager
from .loop import AgentLoop, AgentRunConfig
from .llm import VLLMClient
from .grounding import (
    GroundingResult,
    build_grounding_prompt,
    parse_grounding_response,
)

__all__ = [
    "BrowserSessionManager",
    "AgentLoop",
    "AgentRunConfig",
    "VLLMClient",
    "GroundingResult",
    "build_grounding_prompt",
    "parse_grounding_response",
]
