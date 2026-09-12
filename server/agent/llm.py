"""vLLM (OpenAI-compatible) client tuned for low-latency agent steps.

Design notes
------------
* One HTTP client, kept alive across steps and tasks (connection reuse matters
  a lot at 1-3s/step).
* Uses vLLM guided decoding via ``response_format: json_schema`` so the model
  is physically unable to emit prose around the JSON. That removes the entire
  "extract JSON from text, retry on parse failure" class of latency spikes.
* Prompts are assembled as two blocks: a large, byte-identical SYSTEM prefix
  (so vLLM's prefix cache hits) and a small volatile user block.
* Sampling is near-greedy: agent action selection wants determinism, not
  creativity, and low temperature shortens outputs.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class VLLMError(RuntimeError):
    """Raised when the vLLM or LLM backend fails in a way the agent cannot recover from."""


LLMError = VLLMError


class VLLMClient:
    """Thin async client for a vLLM OpenAI-compatible chat endpoint."""

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:8000/v1",
        model: str = "gemma-3",
        *,
        api_key: str = "EMPTY",
        temperature: float = 0.0,
        top_p: float = 0.95,
        max_tokens: int = 512,
        timeout: float = 120.0,
        seed: int | None = 0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key
        self.temperature = temperature
        self.top_p = top_p
        self.max_tokens = max_tokens
        self.timeout = timeout
        self.seed = seed

        self._client: httpx.AsyncClient | None = None
        # Rolling metrics so we can prove the latency budget on the dashboard.
        self.last_usage: dict[str, Any] = {}
        self.last_latency_ms: float = 0.0

    # -- lifecycle ---------------------------------------------------------

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(self.timeout, connect=5.0),
                headers={"Authorization": f"Bearer {self.api_key}"},
                limits=httpx.Limits(max_keepalive_connections=20, max_connections=50),
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
        self._client = None

    # -- discovery ---------------------------------------------------------

    async def list_models(self) -> list[str]:
        try:
            resp = await self.client.get("/models")
            resp.raise_for_status()
            return [m["id"] for m in resp.json().get("data", []) if "id" in m]
        except Exception:
            return []

    async def resolve_model(self, preferred: str) -> str:
        """Use the preferred model name if served, else the first served model."""
        if "gemini" in preferred.lower():
            self.model = preferred
            return self.model
        models = await self.list_models()
        if models and preferred not in models:
            self.model = models[0]
        return self.model

    # -- chat --------------------------------------------------------------

    async def chat(
        self,
        messages: list[dict[str, Any]],
        *,
        schema: dict[str, Any] | None = None,
        max_tokens: int | None = None,
        temperature: float | None = None,
        extra: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Return parsed JSON when ``schema`` is given, else the raw text."""
        effective_max_tokens = self.max_tokens if max_tokens is None else max_tokens

        # Proactively guard against 4096-token context limit violations:
        # Estimate prompt tokens (~3.3 chars per token)
        total_prompt_chars = sum(len(str(m.get("content", ""))) for m in messages)
        est_tokens = int(total_prompt_chars / 3.3)
        if est_tokens + effective_max_tokens > 3900 and "googleapis.com" not in self.base_url:
            clamped = max(64, 4000 - est_tokens)
            if clamped < effective_max_tokens:
                logger.info(
                    "[llm] Clamping max_tokens from %d to %d (est input tokens: %d)",
                    effective_max_tokens, clamped, est_tokens
                )
                effective_max_tokens = clamped

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature if temperature is None else temperature,
            "top_p": self.top_p,
            "max_tokens": effective_max_tokens,
        }
        if self.seed is not None and "googleapis.com" not in self.base_url:
            payload["seed"] = self.seed
        if schema is not None:
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "agent_step", "strict": True, "schema": schema},
            }
        if extra:
            payload.update(extra)

        max_retries = 3
        backoff = 2.0
        resp = None

        for attempt in range(max_retries + 1):
            started = time.perf_counter()
            try:
                resp = await self.client.post("/chat/completions", json=payload)
                self.last_latency_ms = (time.perf_counter() - started) * 1000.0
            except httpx.HTTPError as exc:
                if attempt < max_retries:
                    await asyncio.sleep(backoff)
                    backoff *= 2.0
                    continue
                raise VLLMError(f"LLM request failed: {exc}") from exc

            if resp.status_code == 429:
                if attempt < max_retries:
                    retry_after = resp.headers.get("retry-after")
                    delay = float(retry_after) if retry_after and retry_after.isdigit() else backoff
                    await asyncio.sleep(delay)
                    backoff *= 2.0
                    continue
                raise VLLMError(f"LLM rate limit reached (HTTP 429). Please wait a moment: {resp.text[:300]}")
            elif resp.status_code == 503 and attempt < max_retries:
                await asyncio.sleep(backoff)
                backoff *= 2.0
                continue
            elif resp.status_code == 400 and ("maximum context length" in resp.text or "input_tokens" in resp.text):
                # Automatic recovery for context window overflow (e.g. vLLM 4096 limit on large web pages)
                match = re.search(r"maximum context length is (\d+) tokens.*at least (\d+) input tokens", resp.text)
                if match:
                    ctx_len = int(match.group(1))
                    inp_tok = int(match.group(2))
                    avail = ctx_len - inp_tok - 4
                    if avail >= 32 and payload["max_tokens"] > avail:
                        logger.warning(
                            "[llm] HTTP 400 context overflow caught. Auto-adjusting max_tokens from %d to %d",
                            payload["max_tokens"], avail
                        )
                        payload["max_tokens"] = avail
                        resp = await self.client.post("/chat/completions", json=payload)
                        if resp.status_code < 400:
                            break
                    elif avail < 32:
                        logger.warning("[llm] Input prompt itself exceeded context window, pruning prompt and retrying")
                        pruned: list[dict[str, Any]] = []
                        for m in payload["messages"]:
                            content_str = str(m.get("content", ""))
                            if m.get("role") == "user" and len(content_str) > 2500:
                                content_str = content_str[:2200] + "\n...[truncated for context limit]"
                            pruned.append({**m, "content": content_str})
                        payload["messages"] = pruned
                        payload["max_tokens"] = 128
                        resp = await self.client.post("/chat/completions", json=payload)
                        if resp.status_code < 400:
                            break
            break

        if resp is None:
            raise VLLMError("LLM request did not yield a response")

        if resp.status_code >= 400:
            raise VLLMError(f"LLM HTTP {resp.status_code}: {resp.text[:400]}")

        data = resp.json()
        usage = data.get("usage") or {}
        usage["latency_ms"] = round(self.last_latency_ms, 1)
        self.last_usage = usage

        choices = data.get("choices") or []
        if not choices:
            raise VLLMError("LLM returned no choices")
        message = choices[0].get("message") or {}
        content = message.get("content") or ""

        if schema is None:
            return {"text": content, "usage": usage}

        parsed = _parse_json(content)
        if parsed is None:
            raise VLLMError(f"Model did not return valid JSON: {content[:300]}")
        return {"json": parsed, "usage": usage, "raw": content}

    async def ping(self) -> bool:
        try:
            resp = await self.client.get("/models", timeout=3.0)
            return resp.status_code == 200
        except Exception:
            return False


def _parse_json(text: str) -> dict[str, Any] | None:
    """Tolerate fences / trailing prose even though guided decoding should prevent it."""
    text = (text or "").strip()
    if not text:
        return None
    try:
        value = json.loads(text)
        return value if isinstance(value, dict) else None
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            value = json.loads(text[start : end + 1])
            return value if isinstance(value, dict) else None
        except json.JSONDecodeError:
            return None
    return None


# Semantic alias so callers can treat this as a generic OpenAI/Gemini compatible client
LLMClient = VLLMClient
