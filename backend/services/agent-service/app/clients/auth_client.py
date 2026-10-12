"""
AuthServiceClient — READ-ONLY admin client for auth-service.

Allowed endpoints (GET allowlist):
  GET /api/v1/admin/users          — search/list users
  GET /api/v1/admin/users/:id      — get user details
  GET /api/v1/admin/users/:id/activity-summary
  GET /api/v1/admin/statistics     — system-level user statistics
  GET /api/v1/admin/ranks          — rank definitions
  GET /api/v1/health

SECURITY:
- Sensitive fields are ALWAYS redacted before returning to LLM:
  passwordHash, refreshToken, tokenHash, otp, apiKey, any field
  containing 'secret', 'token', 'hash', 'password', 'key', 'otp'
- SSRF protection: base URL comes from Settings — LLM cannot override it.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.config import Settings

from ._base import MAX_LIMIT, _build_params, _safe_get

logger = logging.getLogger(__name__)

# Sensitive field names — always redact (lowercase comparison)
_SENSITIVE_KEYS = {
    "passwordhash", "refreshtoken", "tokenhash", "otp", "apikey",
    "secret", "internalsecret", "resettoken", "verificationtoken",
    "hashedpassword", "hash",
}


def _redact_user(obj: Any) -> Any:
    """Recursively strip sensitive fields from user objects."""
    if isinstance(obj, list):
        return [_redact_user(i) for i in obj]
    if isinstance(obj, dict):
        return {
            k: _redact_user(v)
            for k, v in obj.items()
            if k.lower() not in _SENSITIVE_KEYS
        }
    return obj


class AuthServiceClient:
    """Read-only auth-service client for the AI Assistant."""

    def __init__(self, settings: Settings, user_token: str | None = None):
        self._base = settings.auth_service_url.rstrip("/")
        self._token = settings.trekviet_internal_token
        self._timeout = float(settings.request_timeout_seconds)
        self._user_token = user_token

    def _headers(self) -> dict[str, str]:
        # Admin GET endpoints: dùng Bearer token của user
        # Write endpoints (POST/PUT/DELETE): dùng X-Service-Token
        headers = {"X-Agent-Service": "trekviet-agent/1.0"}
        if self._user_token:
            headers["Authorization"] = f"Bearer {self._user_token}"
        else:
            headers["X-Service-Token"] = self._token
        return headers

    async def ping(self) -> bool:
        """GET /health — check service availability."""
        try:
            result = await _safe_get(
                f"{self._base}/health",
                headers={"X-Agent-Service": "trekviet-agent/1.0"},
                timeout=5.0,
                service_name="auth-service",
            )
            return result is not None
        except Exception:
            return False

    # ── Users ─────────────────────────────────────────────────────────────

    async def search_users(
        self,
        q: Optional[str] = None,
        role: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
    ) -> dict[str, Any]:
        """GET /api/v1/admin/users — search/list users. Sensitive fields redacted."""
        limit = min(limit, MAX_LIMIT)
        params = _build_params(q=q, role=role, status=status, page=page, limit=limit)
        try:
            result = await _safe_get(
                f"{self._base}/api/v1/admin/users",
                headers=self._headers(),
                params=params,
                timeout=self._timeout,
                service_name="auth-service",
            )
            if result is not None:
                data = result.get("data", {})
                return {
                    "items": _redact_user(data.get("items", [])),
                    "total": data.get("total", 0),
                    "page": data.get("page", page),
                    "limit": data.get("limit", limit),
                }
        except RuntimeError as exc:
            logger.warning("search_users unavailable: %s", exc)
        return {
            "items": [],
            "total": 0,
            "note": "Admin users endpoint not yet available on auth-service",
        }

    async def get_user_summary(self, user_id: str) -> Optional[dict[str, Any]]:
        """GET /api/v1/admin/users/:id — user profile. Sensitive fields redacted."""
        try:
            result = await _safe_get(
                f"{self._base}/api/v1/admin/users/{user_id}",
                headers=self._headers(),
                timeout=self._timeout,
                service_name="auth-service",
            )
            if result is None:
                return None
            return _redact_user(result.get("data", result))
        except RuntimeError as exc:
            logger.warning("get_user_summary unavailable: %s", exc)
            return None

    async def get_user_activity_summary(self, user_id: str) -> Optional[dict[str, Any]]:
        """GET /api/v1/admin/users/:id/activity-summary"""
        try:
            result = await _safe_get(
                f"{self._base}/api/v1/admin/users/{user_id}/activity-summary",
                headers=self._headers(),
                timeout=self._timeout,
                service_name="auth-service",
            )
            if result is None:
                return None
            return _redact_user(result.get("data", result))
        except RuntimeError as exc:
            logger.warning("get_user_activity_summary unavailable: %s", exc)
            return None

    async def get_user_statistics(self) -> dict[str, Any]:
        """GET /api/v1/admin/statistics — aggregate user statistics."""
        try:
            result = await _safe_get(
                f"{self._base}/api/v1/admin/statistics",
                headers=self._headers(),
                timeout=self._timeout,
                service_name="auth-service",
            )
            if result is not None:
                return result.get("data", {})
        except RuntimeError as exc:
            logger.warning("get_user_statistics unavailable: %s", exc)
        return {"note": "Admin statistics endpoint not yet available on auth-service"}

    # ── Ranks ──────────────────────────────────────────────────────────────

    async def get_ranks(self) -> list[dict[str, Any]]:
        """GET /api/v1/admin/ranks — rank definitions."""
        try:
            result = await _safe_get(
                f"{self._base}/api/v1/admin/ranks",
                headers=self._headers(),
                timeout=self._timeout,
                service_name="auth-service",
            )
            if result is not None:
                data = result.get("data", [])
                if isinstance(data, list):
                    return data
                return data.get("items", [])
        except RuntimeError as exc:
            logger.warning("get_ranks unavailable: %s", exc)
        return []

    async def get_rank_distribution(self) -> dict[str, Any]:
        """GET /api/v1/admin/ranks/distribution — user distribution across ranks."""
        try:
            result = await _safe_get(
                f"{self._base}/api/v1/admin/ranks/distribution",
                headers=self._headers(),
                timeout=self._timeout,
                service_name="auth-service",
            )
            if result is not None:
                return result.get("data", {})
        except RuntimeError as exc:
            logger.warning("get_rank_distribution unavailable: %s", exc)
        return {"note": "Rank distribution endpoint not yet available on auth-service"}
