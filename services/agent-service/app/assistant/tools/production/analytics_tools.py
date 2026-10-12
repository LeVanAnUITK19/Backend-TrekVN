"""
Cross-service analytics tool — aggregates data from multiple services in one shot.

GetSystemOverviewTool calls trekking + auth service in parallel,
combining results into a single admin dashboard summary.

This avoids N+1 individual tool calls when the admin asks
"give me an overview of the system".
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from app.clients.auth_client import AuthServiceClient
from app.clients.checkin_client import CheckinServiceClient
from app.clients.trekking_client import TrekkingReadClient
from app.config import Settings

from ..base import BaseAssistantTool, ToolResult

logger = logging.getLogger(__name__)


class GetSystemOverviewTool(BaseAssistantTool):
    """
    Get a high-level overview of the entire TrekViet system.
    Combines data from trekking, checkin, and auth services in parallel.
    """

    name = "get_system_overview"
    description = (
        "Get a high-level system overview combining data from all TrekViet services. "
        "Returns: total places, routes, badges, users, checkin count. "
        "Use to answer dashboard-level questions like 'give me a system summary' or "
        "'what is the current state of the platform'."
    )

    def __init__(self, settings: Settings):
        self._settings = settings

    async def run(self, **kwargs: Any) -> ToolResult:
        user_token = kwargs.get("_user_token")
        
        # Tạo dynamic clients với user token
        trekking = TrekkingReadClient(self._settings, user_token=user_token)
        checkin = CheckinServiceClient(self._settings, user_token=user_token)
        auth = AuthServiceClient(self._settings, user_token=user_token)
        
        start = time.monotonic()

        # Fan-out: call all three services concurrently
        places_task = asyncio.create_task(
            trekking.search_places(limit=1)
        )
        badges_task = asyncio.create_task(
            trekking.get_badges()
        )
        user_stats_task = asyncio.create_task(
            auth.get_user_statistics()
        )
        checkin_stats_task = asyncio.create_task(
            checkin.get_checkin_statistics()
        )
        routes_task = asyncio.create_task(
            trekking.get_all_admin_routes(limit=1)
        )

        results = await asyncio.gather(
            places_task, badges_task, user_stats_task, checkin_stats_task, routes_task,
            return_exceptions=True,
        )

        places_result, badges_result, user_stats, checkin_stats, routes_result = results

        # Build overview — gracefully handle individual service failures
        overview: dict[str, Any] = {
            "sourceType": "PRODUCTION_API",
            "service": "multi-service",
            "endpointKey": "get_system_overview",
        }

        if isinstance(places_result, Exception):
            overview["places"] = {"error": str(places_result)}
        else:
            overview["places"] = {
                "total": places_result.get("total", "unknown"),
            }

        if isinstance(routes_result, Exception):
            overview["routes"] = {"error": str(routes_result)}
        else:
            overview["routes"] = {
                "total": routes_result.get("total", "unknown"),
            }

        if isinstance(badges_result, Exception):
            overview["badges"] = {"error": str(badges_result)}
        else:
            active_badges = [b for b in badges_result if b.get("status") == "ACTIVE"]
            overview["badges"] = {
                "total": len(badges_result),
                "active": len(active_badges),
            }

        if isinstance(user_stats, Exception):
            overview["users"] = {"error": str(user_stats)}
        else:
            # user_stats might be a "note" dict if endpoint not implemented
            overview["users"] = user_stats

        if isinstance(checkin_stats, Exception):
            overview["checkins"] = {"error": str(checkin_stats)}
        else:
            overview["checkins"] = checkin_stats

        duration_ms = int((time.monotonic() - start) * 1000)
        overview["_meta"] = {"durationMs": duration_ms}

        # Determine success: at least one service responded
        any_success = not all(isinstance(r, Exception) for r in results)
        logger.info(
            "tool_call service=multi tool=%s duration_ms=%d status=%s",
            self.name, duration_ms, "ok" if any_success else "error",
        )
        return ToolResult(name=self.name, success=any_success, data=overview)
