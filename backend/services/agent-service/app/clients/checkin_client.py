"""
CheckinServiceClient — READ-ONLY admin client for checkin-service.

Allowed endpoints (GET allowlist):
  GET /api/v1/admin/checkins/statistics
  GET /api/v1/admin/visits/provinces/statistics
  GET /api/v1/admin/visits/places/statistics
  GET /api/v1/visits/provinces        (admin: list all provinces)
  GET /api/v1/health

NOTE: Most checkin-service endpoints are user-scoped (/me/*).
      Admin statistics endpoints are used here.
      User-scoped endpoints require a user JWT — not available in admin context.
      The client gracefully falls back when admin endpoints don't exist yet.

SSRF protection: base URL comes from Settings — LLM cannot override it.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.config import Settings

from ._base import MAX_LIMIT, _build_params, _safe_get

logger = logging.getLogger(__name__)


class CheckinServiceClient:
    """Read-only checkin-service client for the AI Assistant."""

    def __init__(self, settings: Settings, user_token: str | None = None):
        self._base = settings.checkin_service_url.rstrip("/")
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
                service_name="checkin-service",
            )
            return result is not None
        except Exception:
            return False

    # ── Province statistics ───────────────────────────────────────────────

    async def get_provinces(self) -> list[dict[str, Any]]:
        """
        GET /api/v1/admin/visits/provinces — list all provinces with visit counts.
        Falls back to GET /api/v1/visits/provinces if admin endpoint not available.
        """
        # Try admin endpoint first
        try:
            result = await _safe_get(
                f"{self._base}/api/v1/admin/visits/provinces",
                headers=self._headers(),
                timeout=self._timeout,
                service_name="checkin-service",
            )
            if result is not None:
                data = result.get("data", {})
                if isinstance(data, list):
                    return data
                return data.get("provinces", data.get("items", []))
        except RuntimeError:
            pass

        # Fallback: public provinces list if exists
        try:
            result = await _safe_get(
                f"{self._base}/api/v1/visits/provinces",
                headers=self._headers(),
                timeout=self._timeout,
                service_name="checkin-service",
            )
            if result is not None:
                data = result.get("data", {})
                if isinstance(data, list):
                    return data
                return data.get("provinces", data.get("items", []))
        except RuntimeError:
            pass

        return []

    async def get_province_visit_statistics(self) -> dict[str, Any]:
        """
        GET /api/v1/admin/visits/provinces/statistics — aggregate visit stats per province.
        Returns a summary safe to give to LLM.
        """
        try:
            result = await _safe_get(
                f"{self._base}/api/v1/admin/visits/provinces/statistics",
                headers=self._headers(),
                timeout=self._timeout,
                service_name="checkin-service",
            )
            if result is not None:
                return result.get("data", {})
        except RuntimeError as exc:
            logger.warning("Province visit statistics unavailable: %s", exc)
        return {"note": "Province visit statistics endpoint not yet available on checkin-service"}

    # ── Checkin statistics ────────────────────────────────────────────────

    async def get_checkin_statistics(
        self,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        GET /api/v1/admin/checkins/statistics — aggregate checkin stats.
        """
        # Use dict unpacking to avoid 'from' keyword conflict
        params = {k: v for k, v in {'from': from_date, 'to': to_date}.items() if v is not None}
        try:
            result = await _safe_get(
                f"{self._base}/api/v1/admin/checkins/statistics",
                headers=self._headers(),
                params=params,
                timeout=self._timeout,
                service_name="checkin-service",
            )
            if result is not None:
                return result.get("data", {})
        except RuntimeError as exc:
            logger.warning("Checkin statistics unavailable: %s", exc)
        return {"note": "Checkin statistics endpoint not yet available on checkin-service"}

    # ── Place visit statistics ────────────────────────────────────────────

    async def get_place_visit_statistics(
        self,
        place_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        GET /api/v1/admin/visits/places/statistics — aggregate place visit stats.
        """
        params = _build_params(placeId=place_id)
        try:
            result = await _safe_get(
                f"{self._base}/api/v1/admin/visits/places/statistics",
                headers=self._headers(),
                params=params,
                timeout=self._timeout,
                service_name="checkin-service",
            )
            if result is not None:
                return result.get("data", {})
        except RuntimeError as exc:
            logger.warning("Place visit statistics unavailable: %s", exc)
        return {"note": "Place visit statistics endpoint not yet available on checkin-service"}

    # ── Milestone checkins ────────────────────────────────────────────────

    async def get_milestone_checkins(
        self,
        milestone_id: Optional[str] = None,
        place_id: Optional[str] = None,
        route_id: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
    ) -> dict[str, Any]:
        """GET /api/v1/admin/checkins — admin view of all checkins."""
        limit = min(limit, MAX_LIMIT)
        params = _build_params(
            milestoneId=milestone_id, placeId=place_id,
            routeId=route_id, page=page, limit=limit,
        )
        try:
            result = await _safe_get(
                f"{self._base}/api/v1/admin/checkins",
                headers=self._headers(),
                params=params,
                timeout=self._timeout,
                service_name="checkin-service",
            )
            if result is not None:
                data = result.get("data", {})
                return {
                    "items": data.get("items", []),
                    "total": data.get("total", 0),
                    "page": data.get("page", page),
                    "limit": data.get("limit", limit),
                }
        except RuntimeError as exc:
            logger.warning("Admin checkins unavailable: %s", exc)
        return {
            "items": [],
            "total": 0,
            "note": "Admin checkins endpoint not yet available on checkin-service",
        }
