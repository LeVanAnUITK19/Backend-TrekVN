"""
Checkin Service READ tools for the AI Assistant.

All tools call CheckinServiceClient (GET endpoints only).
Falls back gracefully when admin endpoints don't exist yet — never hallucinate.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Optional

from app.clients.checkin_client import CheckinServiceClient
from app.config import Settings

from ..base import BaseAssistantTool, ToolResult

logger = logging.getLogger(__name__)


def _log_call(tool_name: str, endpoint_key: str, start: float, success: bool, count: int = 0) -> None:
    logger.info(
        "tool_call service=checkin tool=%s endpoint=%s duration_ms=%d status=%s result_count=%d",
        tool_name, endpoint_key, int((time.monotonic() - start) * 1000),
        "ok" if success else "error", count,
    )


class GetProvincesTool(BaseAssistantTool):
    """Get all provinces with visit metadata."""

    name = "get_provinces"
    description = (
        "Get the list of all provinces in the TrekViet system with visit statistics. "
        "Returns provinceId, code, name, region, and visit counts. "
        "Use to answer questions like 'which province has the most trekkers' or 'list provinces'."
    )

    def __init__(self, settings: Settings):
        self._settings = settings

    async def run(self, **kwargs: Any) -> ToolResult:
        user_token = kwargs.get("_user_token")
        client = CheckinServiceClient(self._settings, user_token=user_token)
        
        start = time.monotonic()
        try:
            provinces = await client.get_provinces()
            data = {
                "count": len(provinces),
                "provinces": provinces[:50],  # max 50 provinces (Vietnam has 63)
                "sourceType": "PRODUCTION_API",
                "service": "checkin-service",
                "endpointKey": "get_provinces",
            }
            _log_call(self.name, "get_provinces", start, True, len(provinces))
            return ToolResult(name=self.name, success=True, data=data)
        except RuntimeError as exc:
            _log_call(self.name, "get_provinces", start, False)
            return ToolResult(name=self.name, success=False, error=str(exc))
        except Exception as exc:
            logger.exception("GetProvincesTool unexpected error")
            return ToolResult(name=self.name, success=False, error=f"Unexpected error: {exc}")


class GetCheckinStatsTool(BaseAssistantTool):
    """Get aggregate checkin statistics."""

    name = "get_checkin_statistics"
    description = (
        "Get aggregate check-in statistics (total checkins, by province, by place, by date range). "
        "Optionally filter by from/to date (ISO format). "
        "Use to answer 'how many checkins total' or 'checkin activity in last 30 days'."
    )

    def __init__(self, settings: Settings):
        self._settings = settings

    async def run(
        self,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        **kwargs: Any,
    ) -> ToolResult:
        user_token = kwargs.get("_user_token")
        client = CheckinServiceClient(self._settings, user_token=user_token)
        
        start = time.monotonic()
        try:
            stats = await client.get_checkin_statistics(
                from_date=from_date, to_date=to_date
            )
            data = {
                **stats,
                "sourceType": "PRODUCTION_API",
                "service": "checkin-service",
                "endpointKey": "get_checkin_statistics",
            }
            _log_call(self.name, "get_checkin_statistics", start, True)
            return ToolResult(name=self.name, success=True, data=data)
        except RuntimeError as exc:
            _log_call(self.name, "get_checkin_statistics", start, False)
            return ToolResult(name=self.name, success=False, error=str(exc))


class GetPlaceVisitStatsTool(BaseAssistantTool):
    """Get visit statistics for trekking places."""

    name = "get_place_visit_statistics"
    description = (
        "Get visit statistics for trekking places (visit counts, most visited, etc.). "
        "Optionally filter by a specific placeId. "
        "Use to answer 'which place is visited most' or 'how many visits to Núi Bà Đen'."
    )

    def __init__(self, settings: Settings):
        self._settings = settings

    async def run(
        self,
        place_id: Optional[str] = None,
        **kwargs: Any,
    ) -> ToolResult:
        user_token = kwargs.get("_user_token")
        client = CheckinServiceClient(self._settings, user_token=user_token)
        
        start = time.monotonic()
        try:
            stats = await client.get_place_visit_statistics(place_id=place_id)
            data = {
                **stats,
                "sourceType": "PRODUCTION_API",
                "service": "checkin-service",
                "endpointKey": "get_place_visit_statistics",
            }
            _log_call(self.name, "get_place_visit_statistics", start, True)
            return ToolResult(name=self.name, success=True, data=data)
        except RuntimeError as exc:
            _log_call(self.name, "get_place_visit_statistics", start, False)
            return ToolResult(name=self.name, success=False, error=str(exc))
