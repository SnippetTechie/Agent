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

import json
import time
from typing import Any

import httpx


class VLLMError(RuntimeError):
    """Raised when the vLLM backend fails in a way the agent cannot recover from."""


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
                limits=httpx.Limits(max_keepalive_connections=8, max_connections=16),
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
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature if temperature is None else temperature,
            "top_p": self.top_p,
            "max_tokens": self.max_tokens if max_tokens is None else max_tokens,
        }
        if self.seed is not None:
            payload["seed"] = self.seed
        if schema is not None:
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "agent_step", "strict": True, "schema": schema},
            }
        if extra:
            payload.update(extra)

        started = time.perf_counter()
        try:
            resp = await self.client.post("/chat/completions", json=payload)
        except httpx.HTTPError as exc:
            raise VLLMError(f"vLLM request failed: {exc}") from exc

        self.last_latency_ms = (time.perf_counter() - started) * 1000.0

        if resp.status_code >= 400:
            raise VLLMError(f"vLLM HTTP {resp.status_code}: {resp.text[:400]}")

        data = resp.json()
        self.last_usage = data.get("usage") or {}
        self.last_usage["latency_ms"] = round(self.last_latency_ms, 1)

        choices = data.get("choices") or []
        if not choices:
            raise VLLMError("vLLM returned no choices")
        message = choices[0].get("message") or {}
        content = message.get("content") or ""

        if schema is None:
            return {"text": content, "usage": self.last_usage}

        parsed = _parse_json(content)
        if parsed is None:
            raise VLLMError(f"Model did not return valid JSON: {content[:300]}")
        return {"json": parsed, "usage": self.last_usage, "raw": content}

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
