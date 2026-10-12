"""
TrekkingReadClient — READ-ONLY client for trekking-service.

Only GET/read operations are allowed here.
Write operations live in app/tools/trekking_service.py (called after approval).

Allowed endpoints (GET allowlist):
  GET /api/v1/places
  GET /api/v1/places/:id
  GET /api/v1/places/:id/routes
  GET /api/v1/places/:id/reviews
  GET /api/v1/routes/:id
  GET /api/v1/routes/:id/milestones
  GET /api/v1/badges
  GET /api/v1/admin/trekking/places
  GET /api/v1/admin/trekking/places/:id
  GET /api/v1/admin/trekking/routes
  GET /api/v1/admin/trekking/routes/:id
  GET /api/v1/admin/trekking/routes/:id/milestones
  GET /api/v1/admin/trekking/routes/:id/offline-map
  GET /api/v1/admin/badges
  GET /api/v1/admin/contributions

SSRF protection: base URL comes from Settings — LLM cannot override it.
Sensitive fields: this client never requests/returns passwordHash, tokens, or secrets.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.config import Settings

from ._base import MAX_LIMIT, _build_params, _safe_get

logger = logging.getLogger(__name__)

# Redacted fields that must never reach the LLM
_SENSITIVE_PLACE_FIELDS = {"__v", "_id"}


def _redact(obj: Any) -> Any:
    """Strip internal Mongo fields from dicts / lists."""
    if isinstance(obj, list):
        return [_redact(i) for i in obj]
    if isinstance(obj, dict):
        return {k: _redact(v) for k, v in obj.items() if k not in _SENSITIVE_PLACE_FIELDS}
    return obj


class TrekkingReadClient:
    """Read-only trekking-service client for the AI Assistant."""

    def __init__(self, settings: Settings, user_token: str | None = None):
        self._base = settings.trekking_service_url.rstrip("/")
        self._token = settings.trekviet_internal_token
        self._timeout = float(settings.request_timeout_seconds)
        self._user_token = user_token

    def _headers(self) -> dict[str, str]:
        # Admin GET endpoints: dùng Bearer token của user
        # Write endpoints (POST/PUT/DELETE): dùng X-Service-Token
        headers = {"X-Agent-Service": "trekviet-agent/1.0"}
        if self._user_token:
            headers["Authorization"] = f"Bearer {self._user_token}"
            logger.debug("TrekkingReadClient: using Bearer token (length=%d)", len(self._user_token))
        else:
            headers["X-Service-Token"] = self._token
            logger.debug("TrekkingReadClient: using service token")
        return headers

    # ── Places ────────────────────────────────────────────────────────────

    async def search_places(
        self,
        q: Optional[str] = None,
        province_id: Optional[str] = None,
        difficulty: Optional[str] = None,
        tags: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
    ) -> dict[str, Any]:
        """GET /api/v1/admin/trekking/places — all places including INACTIVE."""
        limit = min(limit, MAX_LIMIT)
        params = _build_params(
            q=q, provinceId=province_id, difficulty=difficulty,
            tags=tags, status=status, page=page, limit=limit,
        )
        result = await _safe_get(
            f"{self._base}/api/v1/admin/trekking/places",
            headers=self._headers(),
            params=params,
            timeout=self._timeout,
            service_name="trekking-service",
        )
        if result is None:
            return {"items": [], "total": 0, "page": page, "limit": limit}
        data = result.get("data", {})
        return {
            "items": _redact(data.get("items", [])),
            "total": data.get("total", 0),
            "page": data.get("page", page),
            "limit": data.get("limit", limit),
        }

    async def get_place(self, place_id: str) -> Optional[dict[str, Any]]:
        """GET /api/v1/admin/trekking/places/:id"""
        result = await _safe_get(
            f"{self._base}/api/v1/admin/trekking/places/{place_id}",
            headers=self._headers(),
            timeout=self._timeout,
            service_name="trekking-service",
        )
        if result is None:
            return None
        return _redact(result.get("data"))

    async def get_place_public(self, place_id: str) -> Optional[dict[str, Any]]:
        """GET /api/v1/places/:id — public endpoint (only ACTIVE)."""
        result = await _safe_get(
            f"{self._base}/api/v1/places/{place_id}",
            headers={"X-Agent-Service": "trekviet-agent/1.0"},
            timeout=self._timeout,
            service_name="trekking-service",
        )
        if result is None:
            return None
        return _redact(result.get("data"))

    # ── Routes ────────────────────────────────────────────────────────────

    async def get_routes_by_place(self, place_id: str) -> list[dict[str, Any]]:
        """GET /api/v1/places/:id/routes — ACTIVE routes of a place."""
        result = await _safe_get(
            f"{self._base}/api/v1/places/{place_id}/routes",
            headers={"X-Agent-Service": "trekviet-agent/1.0"},
            timeout=self._timeout,
            service_name="trekking-service",
        )
        if result is None:
            return []
        return _redact(result.get("data", []))

    async def get_all_admin_routes(
        self,
        place_id: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
    ) -> dict[str, Any]:
        """GET /api/v1/admin/trekking/routes — all routes (admin)."""
        limit = min(limit, MAX_LIMIT)
        params = _build_params(placeId=place_id, status=status, page=page, limit=limit)
        result = await _safe_get(
            f"{self._base}/api/v1/admin/trekking/routes",
            headers=self._headers(),
            params=params,
            timeout=self._timeout,
            service_name="trekking-service",
        )
        if result is None:
            return {"items": [], "total": 0, "page": page, "limit": limit}
        data = result.get("data", {})
        return {
            "items": _redact(data.get("items", [])),
            "total": data.get("total", 0),
            "page": data.get("page", page),
            "limit": data.get("limit", limit),
        }

    async def get_route(self, route_id: str) -> Optional[dict[str, Any]]:
        """GET /api/v1/admin/trekking/routes/:id"""
        result = await _safe_get(
            f"{self._base}/api/v1/admin/trekking/routes/{route_id}",
            headers=self._headers(),
            timeout=self._timeout,
            service_name="trekking-service",
        )
        if result is None:
            return None
        return _redact(result.get("data"))

    async def get_route_offline_map(self, route_id: str) -> Optional[dict[str, Any]]:
        """GET /api/v1/admin/trekking/routes/:id/offline-map"""
        result = await _safe_get(
            f"{self._base}/api/v1/admin/trekking/routes/{route_id}/offline-map",
            headers=self._headers(),
            timeout=self._timeout,
            service_name="trekking-service",
        )
        if result is None:
            return None
        return result.get("data")

    # ── Milestones ────────────────────────────────────────────────────────

    async def get_milestones(self, route_id: str) -> list[dict[str, Any]]:
        """GET /api/v1/routes/:id/milestones — sorted by sequence asc."""
        result = await _safe_get(
            f"{self._base}/api/v1/routes/{route_id}/milestones",
            headers={"X-Agent-Service": "trekviet-agent/1.0"},
            timeout=self._timeout,
            service_name="trekking-service",
        )
        if result is None:
            return []
        return _redact(result.get("data", []))

    # ── Reviews ───────────────────────────────────────────────────────────

    async def get_place_reviews(
        self,
        place_id: str,
        page: int = 1,
        limit: int = 20,
    ) -> dict[str, Any]:
        """GET /api/v1/places/:id/reviews"""
        limit = min(limit, MAX_LIMIT)
        result = await _safe_get(
            f"{self._base}/api/v1/places/{place_id}/reviews",
            headers={"X-Agent-Service": "trekviet-agent/1.0"},
            params={"page": page, "limit": limit},
            timeout=self._timeout,
            service_name="trekking-service",
        )
        if result is None:
            return {"items": [], "total": 0}
        data = result.get("data", {})
        return {
            "items": _redact(data.get("items", [])),
            "total": data.get("total", 0),
            "ratingAverage": data.get("ratingAverage"),
            "ratingCount": data.get("ratingCount"),
        }

    # ── Badges ────────────────────────────────────────────────────────────

    async def get_badges(
        self,
        status: Optional[str] = None,
        category: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """GET /api/v1/admin/badges — all badges (admin)."""
        params = _build_params(status=status, category=category)
        result = await _safe_get(
            f"{self._base}/api/v1/admin/badges",
            headers=self._headers(),
            params=params,
            timeout=self._timeout,
            service_name="trekking-service",
        )
        if result is None:
            return []
        data = result.get("data", {})
        # Some APIs return list directly, some wrap in items
        if isinstance(data, list):
            return _redact(data)
        return _redact(data.get("items", []))

    async def get_badge(self, badge_id: str) -> Optional[dict[str, Any]]:
        """GET /api/v1/admin/badges/:id"""
        result = await _safe_get(
            f"{self._base}/api/v1/admin/badges/{badge_id}",
            headers=self._headers(),
            timeout=self._timeout,
            service_name="trekking-service",
        )
        if result is None:
            return None
        return result.get("data")

    # ── Contributions ─────────────────────────────────────────────────────

    async def get_contributions(
        self,
        type: Optional[str] = None,
        status: Optional[str] = None,
        user_id: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
    ) -> dict[str, Any]:
        """GET /api/v1/admin/contributions — all contributions (admin)."""
        limit = min(limit, MAX_LIMIT)
        params = _build_params(
            type=type, status=status, userId=user_id, page=page, limit=limit
        )
        result = await _safe_get(
            f"{self._base}/api/v1/admin/contributions",
            headers=self._headers(),
            params=params,
            timeout=self._timeout,
            service_name="trekking-service",
        )
        if result is None:
            return {"items": [], "total": 0, "page": page, "limit": limit}
        data = result.get("data", {})
        return {
            "items": _redact(data.get("items", [])),
            "total": data.get("total", 0),
            "page": data.get("page", page),
            "limit": data.get("limit", limit),
        }
