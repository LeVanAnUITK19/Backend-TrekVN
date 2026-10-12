"""
Trekking Service READ tools for the AI Assistant.

All tools call TrekkingReadClient (GET endpoints only).
Result size is bounded before returning to the LLM.

Observability: each tool logs toolName, endpointKey, durationMs, status, resultCount.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Optional

from app.clients.trekking_client import TrekkingReadClient
from app.config import Settings

from ..base import BaseAssistantTool, ToolResult

logger = logging.getLogger(__name__)

# Hard cap: max items passed to LLM per tool call
_MAX_ITEMS_TO_LLM = 30


def _log_call(tool_name: str, endpoint_key: str, start: float, success: bool, count: int = 0) -> None:
    logger.info(
        "tool_call service=trekking tool=%s endpoint=%s duration_ms=%d status=%s result_count=%d",
        tool_name, endpoint_key, int((time.monotonic() - start) * 1000),
        "ok" if success else "error", count,
    )


class SearchPlacesTool(BaseAssistantTool):
    """
    Search trekking places by name, province, difficulty, or status.
    Returns a paginated list with essential fields only.
    """

    name = "search_places"
    description = (
        "Search trekking places by name/keyword, province, difficulty, or status. "
        "Returns id, name, slug, provinceId, difficulty, ratingAverage, status, offlineMap availability. "
        "Use this when the admin asks about places or to find a placeId by name."
    )
    parameters = {
        "type": "object",
        "properties": {
            "q": {"type": "string", "description": "Search query (place name or keyword)"},
            "province_id": {"type": "string", "description": "Filter by province ID"},
            "difficulty": {"type": "string", "enum": ["easy", "medium", "hard"], "description": "Filter by difficulty"},
            "status": {"type": "string", "enum": ["APPROVED", "PENDING", "REJECTED"], "description": "Filter by status"},
            "page": {"type": "integer", "default": 1},
            "limit": {"type": "integer", "default": 20, "maximum": 30},
        },
        "required": [],
    }

    def __init__(self, settings: Settings):
        self._settings = settings

    async def run(
        self,
        q: Optional[str] = None,
        province_id: Optional[str] = None,
        difficulty: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
        **kwargs: Any,
    ) -> ToolResult:
        # Extract user token from kwargs (_user_token được truyền từ send_message)
        user_token = kwargs.get("_user_token")
        logger.info("SearchPlacesTool: user_token present=%s", bool(user_token))
        if user_token:
            logger.debug("SearchPlacesTool: user_token length=%d", len(user_token))
        
        client = TrekkingReadClient(self._settings, user_token=user_token)
        
        start = time.monotonic()
        limit = min(limit, _MAX_ITEMS_TO_LLM)
        try:
            result = await client.search_places(
                q=q, province_id=province_id, difficulty=difficulty,
                status=status, page=page, limit=limit,
            )
            items = result.get("items", [])
            # Slim fields for LLM — keep essential info only
            slim_items = [
                {
                    "trekkingPlaceId": p.get("trekkingPlaceId") or p.get("_id"),
                    "name": p.get("name"),
                    "slug": p.get("slug"),
                    "provinceId": p.get("provinceId"),
                    "difficulty": p.get("difficulty"),
                    "status": p.get("status"),
                    "ratingAverage": p.get("ratingAverage"),
                    "ratingCount": p.get("ratingCount"),
                    "hasOfflineMap": bool(
                        p.get("offlineMap", {}) and p.get("offlineMap", {}).get("available")
                    ) if isinstance(p.get("offlineMap"), dict) else False,
                    "hasImages": len(p.get("images", [])) > 0,
                    "hasDescription": bool(p.get("description")),
                }
                for p in items
            ]
            data = {
                "total": result.get("total", len(slim_items)),
                "page": result.get("page", page),
                "limit": result.get("limit", limit),
                "items": slim_items,
                "sourceType": "PRODUCTION_API",
                "service": "trekking-service",
                "endpointKey": "search_places",
            }
            _log_call(self.name, "search_places", start, True, len(slim_items))
            return ToolResult(name=self.name, success=True, data=data)
        except RuntimeError as exc:
            _log_call(self.name, "search_places", start, False)
            return ToolResult(name=self.name, success=False, error=str(exc))
        except Exception as exc:
            logger.exception("SearchPlacesTool unexpected error")
            return ToolResult(name=self.name, success=False, error=f"Unexpected error: {exc}")


class GetPlaceTool(BaseAssistantTool):
    """
    Get full details of a single trekking place by ID.
    """

    name = "get_place"
    description = (
        "Get detailed information about a single trekking place by its trekkingPlaceId. "
        "Returns full place data including location, description, images, offline map status."
    )

    def __init__(self, settings: Settings):
        self._settings = settings

    async def run(self, place_id: str, **kwargs: Any) -> ToolResult:
        user_token = kwargs.get("_user_token")
        client = TrekkingReadClient(self._settings, user_token=user_token)
        
        start = time.monotonic()
        try:
            place = await client.get_place(place_id)
            if place is None:
                _log_call(self.name, "get_place", start, False)
                return ToolResult(name=self.name, success=False, error=f"Place '{place_id}' not found")
            # Remove heavy fields before returning to LLM
            place.pop("gpxTrack", None)
            place.pop("encodedPolyline", None)
            data = {**place, "sourceType": "PRODUCTION_API", "service": "trekking-service", "endpointKey": "get_place"}
            _log_call(self.name, "get_place", start, True, 1)
            return ToolResult(name=self.name, success=True, data=data)
        except RuntimeError as exc:
            _log_call(self.name, "get_place", start, False)
            return ToolResult(name=self.name, success=False, error=str(exc))


class GetRoutesByPlaceTool(BaseAssistantTool):
    """
    Get all routes belonging to a trekking place.
    """

    name = "get_routes_by_place"
    description = (
        "Get all trekking routes for a given place (by trekkingPlaceId). "
        "Returns route list with distance, elevation, difficulty, offline map status."
    )

    def __init__(self, settings: Settings):
        self._settings = settings

    async def run(self, place_id: str, **kwargs: Any) -> ToolResult:
        user_token = kwargs.get("_user_token")
        client = TrekkingReadClient(self._settings, user_token=user_token)
        
        start = time.monotonic()
        try:
            routes = await client.get_routes_by_place(place_id)
            slim_routes = [
                {
                    "trekkingRouteId": r.get("trekkingRouteId") or r.get("_id"),
                    "name": r.get("name"),
                    "difficulty": r.get("difficulty"),
                    "distanceMeters": r.get("distanceMeters"),
                    "estimatedDurationMinutes": r.get("estimatedDurationMinutes"),
                    "elevationGain": r.get("elevationGain"),
                    "maxElevation": r.get("maxElevation"),
                    "status": r.get("status"),
                    "offlineMapAvailable": (
                        r.get("offlineMap", {}).get("available", False)
                        if isinstance(r.get("offlineMap"), dict) else False
                    ),
                    "offlineMapVersion": (
                        r.get("offlineMap", {}).get("version")
                        if isinstance(r.get("offlineMap"), dict) else None
                    ),
                }
                for r in routes[:_MAX_ITEMS_TO_LLM]
            ]
            data = {
                "placeId": place_id,
                "count": len(routes),
                "routes": slim_routes,
                "sourceType": "PRODUCTION_API",
                "service": "trekking-service",
                "endpointKey": "get_routes_by_place",
            }
            _log_call(self.name, "get_routes_by_place", start, True, len(slim_routes))
            return ToolResult(name=self.name, success=True, data=data)
        except RuntimeError as exc:
            _log_call(self.name, "get_routes_by_place", start, False)
            return ToolResult(name=self.name, success=False, error=str(exc))


class GetRouteTool(BaseAssistantTool):
    """Get full details of a single route by ID."""

    name = "get_route"
    description = (
        "Get detailed information about a single trekking route by its trekkingRouteId. "
        "Returns full route data including distance, elevation, milestones count, offline map."
    )

    def __init__(self, settings: Settings):
        self._settings = settings

    async def run(self, route_id: str, **kwargs: Any) -> ToolResult:
        user_token = kwargs.get("_user_token")
        client = TrekkingReadClient(self._settings, user_token=user_token)
        
        start = time.monotonic()
        try:
            route = await client.get_route(route_id)
            if route is None:
                _log_call(self.name, "get_route", start, False)
                return ToolResult(name=self.name, success=False, error=f"Route '{route_id}' not found")
            route.pop("gpxTrack", None)
            route.pop("encodedPolyline", None)
            data = {**route, "sourceType": "PRODUCTION_API", "service": "trekking-service", "endpointKey": "get_route"}
            _log_call(self.name, "get_route", start, True, 1)
            return ToolResult(name=self.name, success=True, data=data)
        except RuntimeError as exc:
            _log_call(self.name, "get_route", start, False)
            return ToolResult(name=self.name, success=False, error=str(exc))


class GetMilestonesTool(BaseAssistantTool):
    """Get milestones of a trekking route."""

    name = "get_milestones"
    description = (
        "Get all milestones of a trekking route (by trekkingRouteId), sorted by sequence. "
        "Returns type (START/SUMMIT/FINISH/...), sequence, altitude, checkin radius."
    )

    def __init__(self, settings: Settings):
        self._settings = settings

    async def run(self, route_id: str, **kwargs: Any) -> ToolResult:
        user_token = kwargs.get("_user_token")
        client = TrekkingReadClient(self._settings, user_token=user_token)
        
        start = time.monotonic()
        try:
            milestones = await client.get_milestones(route_id)
            slim = [
                {
                    "milestoneId": m.get("milestoneId") or m.get("_id"),
                    "name": m.get("name"),
                    "type": m.get("type"),
                    "sequence": m.get("sequence"),
                    "altitude": m.get("altitude"),
                    "checkinRadiusMeters": m.get("checkinRadiusMeters"),
                    "required": m.get("required"),
                    "qualifiesPlaceVisit": m.get("qualifiesPlaceVisit"),
                }
                for m in milestones
            ]
            data = {
                "routeId": route_id,
                "count": len(slim),
                "milestones": slim,
                "sourceType": "PRODUCTION_API",
                "service": "trekking-service",
                "endpointKey": "get_milestones",
            }
            _log_call(self.name, "get_milestones", start, True, len(slim))
            return ToolResult(name=self.name, success=True, data=data)
        except RuntimeError as exc:
            _log_call(self.name, "get_milestones", start, False)
            return ToolResult(name=self.name, success=False, error=str(exc))


class GetPlaceReviewsTool(BaseAssistantTool):
    """Get reviews for a trekking place."""

    name = "get_place_reviews"
    description = (
        "Get user reviews for a trekking place (by trekkingPlaceId). "
        "Returns pagination of reviews with rating point and content (truncated). "
        "Also returns ratingAverage and ratingCount."
    )

    def __init__(self, settings: Settings):
        self._settings = settings

    async def run(
        self,
        place_id: str,
        page: int = 1,
        limit: int = 10,
        **kwargs: Any,
    ) -> ToolResult:
        user_token = kwargs.get("_user_token")
        client = TrekkingReadClient(self._settings, user_token=user_token)
        
        start = time.monotonic()
        limit = min(limit, 20)
        try:
            result = await client.get_place_reviews(place_id, page=page, limit=limit)
            # Truncate review content to avoid flooding LLM
            slim_items = [
                {
                    "userId": r.get("userId"),
                    "point": r.get("point"),
                    "content": (r.get("content") or "")[:300],
                    "createdAt": r.get("createdAt"),
                }
                for r in result.get("items", [])
            ]
            data = {
                "placeId": place_id,
                "total": result.get("total", 0),
                "ratingAverage": result.get("ratingAverage"),
                "ratingCount": result.get("ratingCount"),
                "items": slim_items,
                "sourceType": "PRODUCTION_API",
                "service": "trekking-service",
                "endpointKey": "get_place_reviews",
            }
            _log_call(self.name, "get_place_reviews", start, True, len(slim_items))
            return ToolResult(name=self.name, success=True, data=data)
        except RuntimeError as exc:
            _log_call(self.name, "get_place_reviews", start, False)
            return ToolResult(name=self.name, success=False, error=str(exc))


class GetBadgesTool(BaseAssistantTool):
    """Get all badges in the gamification system."""

    name = "get_badges"
    description = (
        "Get the list of badges in the TrekViet gamification system. "
        "Returns badgeId, code, name, description, category, rarity, condition, status. "
        "Optionally filter by status (ACTIVE/INACTIVE) or category."
    )

    def __init__(self, settings: Settings):
        self._settings = settings

    async def run(
        self,
        status: Optional[str] = None,
        category: Optional[str] = None,
        **kwargs: Any,
    ) -> ToolResult:
        user_token = kwargs.get("_user_token")
        client = TrekkingReadClient(self._settings, user_token=user_token)
        
        start = time.monotonic()
        try:
            badges = await client.get_badges(status=status, category=category)
            data = {
                "count": len(badges),
                "badges": badges[:_MAX_ITEMS_TO_LLM],
                "sourceType": "PRODUCTION_API",
                "service": "trekking-service",
                "endpointKey": "get_badges",
            }
            _log_call(self.name, "get_badges", start, True, len(badges))
            return ToolResult(name=self.name, success=True, data=data)
        except RuntimeError as exc:
            _log_call(self.name, "get_badges", start, False)
            return ToolResult(name=self.name, success=False, error=str(exc))


class GetContributionsTool(BaseAssistantTool):
    """Get user contributions (route submissions + place suggestions)."""

    name = "get_contributions"
    description = (
        "Get user contributions (route submissions or place suggestions) for admin review. "
        "Filter by type (ROUTE_SUBMISSION/PLACE_SUGGESTION), status, or userId. "
        "Returns pagination of contributions with status and basic info."
    )

    def __init__(self, settings: Settings):
        self._settings = settings

    async def run(
        self,
        type: Optional[str] = None,
        status: Optional[str] = None,
        user_id: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
        **kwargs: Any,
    ) -> ToolResult:
        user_token = kwargs.get("_user_token")
        client = TrekkingReadClient(self._settings, user_token=user_token)
        
        start = time.monotonic()
        limit = min(limit, _MAX_ITEMS_TO_LLM)
        try:
            result = await client.get_contributions(
                type=type, status=status, user_id=user_id, page=page, limit=limit
            )
            data = {
                **result,
                "sourceType": "PRODUCTION_API",
                "service": "trekking-service",
                "endpointKey": "get_contributions",
            }
            _log_call(self.name, "get_contributions", start, True, len(result.get("items", [])))
            return ToolResult(name=self.name, success=True, data=data)
        except RuntimeError as exc:
            _log_call(self.name, "get_contributions", start, False)
            return ToolResult(name=self.name, success=False, error=str(exc))
