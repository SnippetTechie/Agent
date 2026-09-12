"""Lightweight Supabase client for V.A.R.M.A.

Uses direct PostgREST and Storage REST APIs over httpx (dependency-free).
Stores:
  - Tasks (goal, user_email, status, steps, latency)
  - Task Steps (step_number, action, thought, screenshot_url, latency)
  - Redacted Screenshots (uploaded to 'redacted-screens' storage bucket)
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import time
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger("varma.supabase")

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
if _ENV_FILE.exists():
    for _line in _ENV_FILE.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if not _line or _line.startswith("#") or "=" not in _line:
            continue
        _k, _, _v = _line.partition("=")
        _k, _v = _k.strip(), _v.strip().strip('"').strip("'")
        if _k and _k not in os.environ:
            os.environ[_k] = _v


class SupabaseClient:
    """Async client for Supabase database and storage."""

    def __init__(
        self,
        url: str | None = None,
        service_role_key: str | None = None,
        jwt_secret: str | None = None,
        bucket: str = "redacted-screens",
    ) -> None:
        self.url = (
            url
            or os.getenv("SUPABASE_URL")
            or os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
        ).strip().rstrip("/")
        self.key = (
            service_role_key
            or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
            or os.getenv("SUPABASE_SECRET_KEY")
            or os.getenv("SUPABASE_PUBLISHABLE_KEY")
            or os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
            or os.getenv("SUPABASE_ANON_KEY", "")
        ).strip()
        self.jwt_secret = (jwt_secret or os.getenv("SUPABASE_JWT_SECRET", "")).strip()
        self.bucket = (os.getenv("SUPABASE_STORAGE_BUCKET") or bucket).strip()

        self._client: httpx.AsyncClient | None = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            headers = {
                "apikey": self.key,
                "Authorization": f"Bearer {self.key}",
            }
            self._client = httpx.AsyncClient(
                base_url=self.url,
                headers=headers,
                timeout=15.0,
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
        self._client = None

    def is_configured(self) -> bool:
        return bool(self.url and self.key)

    # -----------------------------------------------------------------------
    # Database: Tasks & Steps
    # -----------------------------------------------------------------------

    async def create_task(
        self,
        task: str,
        *,
        mode: str = "normal",
        user_email: str | None = None,
        user_id: str | None = None,
    ) -> str | None:
        """Insert a new task record, returning the task UUID string."""
        if not self.is_configured():
            return None

        payload: dict[str, Any] = {
            "task": task,
            "mode": mode,
            "status": "running",
            "user_email": user_email,
        }
        if user_id:
            payload["user_id"] = user_id

        try:
            resp = await self.client.post(
                "/rest/v1/tasks",
                json=payload,
                headers={"Prefer": "return=representation"},
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                if data and isinstance(data, list):
                    return str(data[0].get("id"))
            logger.warning("Supabase create_task failed HTTP %s: %s", resp.status_code, resp.text[:200])
        except Exception as exc:
            logger.warning("Supabase create_task error: %s", exc)
        return None

    async def log_step(
        self,
        task_id: str,
        step_number: int,
        action_type: str | None,
        action_payload: Any = None,
        thought: str | None = None,
        screenshot_url: str | None = None,
        latency_ms: float = 0.0,
    ) -> bool:
        """Append an audit log for one executed agent step."""
        if not self.is_configured() or not task_id:
            return False

        payload: dict[str, Any] = {
            "task_id": task_id,
            "step_number": step_number,
            "action_type": action_type or "unknown",
            "action_payload": action_payload if action_payload is not None else {},
            "thought": thought or "",
            "screenshot_url": screenshot_url,
            "latency_ms": round(latency_ms, 1),
        }

        try:
            resp = await self.client.post("/rest/v1/task_steps", json=payload)
            return resp.status_code in (200, 201)
        except Exception as exc:
            logger.warning("Supabase log_step error: %s", exc)
            return False

    async def finish_task(
        self,
        task_id: str,
        status: str = "completed",
        total_steps: int = 0,
        total_latency_ms: float = 0.0,
    ) -> bool:
        """Mark task completed/failed with final metrics."""
        if not self.is_configured() or not task_id:
            return False

        payload = {
            "status": status,
            "total_steps": total_steps,
            "total_latency_ms": round(total_latency_ms, 1),
        }

        try:
            resp = await self.client.patch(
                f"/rest/v1/tasks?id=eq.{task_id}",
                json=payload,
            )
            return resp.status_code in (200, 204)
        except Exception as exc:
            logger.warning("Supabase finish_task error: %s", exc)
            return False

    # -----------------------------------------------------------------------
    # Storage: Redacted Screenshots
    # -----------------------------------------------------------------------

    async def upload_screenshot(
        self,
        task_id: str,
        step_number: int,
        image_bytes: bytes,
        *,
        user_id: str | None = None,
    ) -> str | None:
        """Upload a redacted screenshot to Supabase Storage and return its public URL."""
        if not self.is_configured() or not image_bytes:
            return None

        clean_task_id = task_id or f"anon_{int(time.time())}"
        clean_user = "".join(c for c in (user_id or "").lower() if c.isalnum() or c in "-_.")[:40]
        if clean_user:
            path = f"users/{clean_user}/{clean_task_id}/step_{step_number}.png"
        else:
            path = f"{clean_task_id}/step_{step_number}.png"

        url_path = f"/storage/v1/object/{self.bucket}/{path}"

        try:
            resp = await self.client.post(
                url_path,
                content=image_bytes,
                headers={"Content-Type": "image/png", "x-upsert": "true"},
            )
            if resp.status_code in (200, 201):
                return f"{self.url}/storage/v1/object/public/{self.bucket}/{path}"
            logger.warning("Supabase upload_screenshot failed HTTP %s: %s", resp.status_code, resp.text[:200])
        except Exception as exc:
            logger.warning("Supabase upload_screenshot error: %s", exc)
        return None

    # -----------------------------------------------------------------------
    # Auth: JWT Verification
    # -----------------------------------------------------------------------

    def verify_jwt(self, token: str) -> dict[str, Any] | None:
        """Verify and decode a Supabase / Google OAuth JWT token.

        Uses stdlib hmac+hashlib (zero extra dependencies).
        If SUPABASE_JWT_SECRET is unset, decodes the unverified payload for dev convenience.
        """
        token = (token or "").strip()
        if not token:
            return None

        parts = token.split(".")
        if len(parts) != 3:
            return None

        header_b64, payload_b64, signature_b64 = parts

        # Verify HMAC-SHA256 signature if secret is configured
        if self.jwt_secret:
            try:
                signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
                expected_sig = hmac.new(
                    self.jwt_secret.encode("utf-8"),
                    signing_input,
                    hashlib.sha256,
                ).digest()

                # Base64URL decode actual signature
                rem = len(signature_b64) % 4
                padded_sig = signature_b64 + ("=" * (4 - rem) if rem else "")
                actual_sig = base64.urlsafe_b64decode(padded_sig)

                if not hmac.compare_digest(expected_sig, actual_sig):
                    logger.warning("JWT signature verification failed")
                    return None
            except Exception as exc:
                logger.warning("JWT verification error: %s", exc)
                return None

        # Decode payload
        try:
            rem = len(payload_b64) % 4
            padded_payload = payload_b64 + ("=" * (4 - rem) if rem else "")
            payload_json = base64.urlsafe_b64decode(padded_payload).decode("utf-8")
            payload = json.loads(payload_json)

            # Check expiration
            exp = payload.get("exp")
            if exp and time.time() > float(exp):
                logger.warning("JWT token has expired")
                return None

            return payload
        except Exception as exc:
            logger.warning("JWT payload parse error: %s", exc)
            return None


# Global singleton instance
supabase = SupabaseClient()
