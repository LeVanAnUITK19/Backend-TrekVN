"""
User / Gamification READ tools for the AI Assistant.

All tools call AuthServiceClient (GET endpoints only).
Sensitive fields (passwordHash, tokens, secrets) are ALWAYS redacted
by AuthServiceClient before data reaches this layer.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Optional

from app.clients.auth_client import AuthServiceClient
from app.config import Settings

from ..base import BaseAssistantTool, ToolResult

logger = logging.getLogger(__name__)


def _log_call(tool_name: str, endpoint_key: str, start: float, success: bool, count: int = 0) -> None:
    logger.info(
        "tool_call service=auth tool=%s endpoint=%s duration_ms=%d status=%s result_count=%d",
        tool_name, endpoint_key, int((time.monotonic() - start) * 1000),
        "ok" if success else "error", count,
    )


class SearchUsersTool(BaseAssistantTool):
    """Search users in the TrekViet system."""

    name = "search_users"
    description = (
        "Search users in the TrekViet system by name/email/keyword, role, or status. "
        "Returns userId, displayName, email, role, status, createdAt. "
        "NEVER returns passwordHash, tokens, or any sensitive credentials. "
        "Use to look up a specific user or get user counts."
    )

    def __init__(self, settings: Settings):
        self._settings = settings

    async def run(
        self,
        q: Optional[str] = None,
        role: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
        **kwargs: Any,
    ) -> ToolResult:
        user_token = kwargs.get("_user_token")
        client = AuthServiceClient(self._settings, user_token=user_token)
        
        start = time.monotonic()
        limit = min(limit, 50)
        try:
            result = await client.search_users(
                q=q, role=role, status=status, page=page, limit=limit
            )
            data = {
                **result,
                "sourceType": "PRODUCTION_API",
                "service": "auth-service",
                "endpointKey": "search_users",
                "note": "Sensitive fields (passwords, tokens) are always redacted.",
            }
            _log_call(self.name, "search_users", start, True, len(result.get("items", [])))
            return ToolResult(name=self.name, success=True, data=data)
        except RuntimeError as exc:
            _log_call(self.name, "search_users", start, False)
            return ToolResult(name=self.name, success=False, error=str(exc))


class GetUserSummaryTool(BaseAssistantTool):
    """Get profile summary for a specific user."""

    name = "get_user_summary"
    description = (
        "Get profile summary for a specific user by userId. "
        "Returns displayName, email, role, rank, XP, status, createdAt. "
        "NEVER returns passwordHash, tokens, or any sensitive credentials."
    )

    def __init__(self, settings: Settings):
        self._settings = settings

    async def run(self, user_id: str, **kwargs: Any) -> ToolResult:
        user_token = kwargs.get("_user_token")
        client = AuthServiceClient(self._settings, user_token=user_token)
        
        start = time.monotonic()
        try:
            user = await client.get_user_summary(user_id)
            if user is None:
                _log_call(self.name, "get_user_summary", start, False)
                return ToolResult(name=self.name, success=False, error=f"User '{user_id}' not found")
            data = {
                **user,
                "sourceType": "PRODUCTION_API",
                "service": "auth-service",
                "endpointKey": "get_user_summary",
                "note": "Sensitive fields are always redacted.",
            }
            _log_call(self.name, "get_user_summary", start, True, 1)
            return ToolResult(name=self.name, success=True, data=data)
        except RuntimeError as exc:
            _log_call(self.name, "get_user_summary", start, False)
            return ToolResult(name=self.name, success=False, error=str(exc))


class GetUserStatisticsTool(BaseAssistantTool):
    """Get aggregate user statistics (total users, active users, growth)."""

    name = "get_user_statistics"
    description = (
        "Get aggregate user statistics for the TrekViet system. "
        "Returns totalUsers, activeUsers, newUsersThisMonth, usersByRole, etc. "
        "Use to answer 'how many users does TrekViet have' or 'user growth this month'."
    )

    def __init__(self, settings: Settings):
        self._settings = settings

    async def run(self, **kwargs: Any) -> ToolResult:
        user_token = kwargs.get("_user_token")
        client = AuthServiceClient(self._settings, user_token=user_token)
        
        start = time.monotonic()
        try:
            stats = await client.get_user_statistics()
            data = {
                **stats,
                "sourceType": "PRODUCTION_API",
                "service": "auth-service",
                "endpointKey": "get_user_statistics",
            }
            _log_call(self.name, "get_user_statistics", start, True)
            return ToolResult(name=self.name, success=True, data=data)
        except RuntimeError as exc:
            _log_call(self.name, "get_user_statistics", start, False)
            return ToolResult(name=self.name, success=False, error=str(exc))


class GetRanksTool(BaseAssistantTool):
    """Get rank definitions in the TrekViet gamification system."""

    name = "get_ranks"
    description = (
        "Get all rank definitions in the TrekViet gamification system. "
        "Returns rankId, name, minXP, maxXP, icon, perks for each rank. "
        "Use to answer 'what ranks exist' or 'what are the XP thresholds'."
    )

    def __init__(self, settings: Settings):
        self._settings = settings

    async def run(self, **kwargs: Any) -> ToolResult:
        user_token = kwargs.get("_user_token")
        client = AuthServiceClient(self._settings, user_token=user_token)
        
        start = time.monotonic()
        try:
            ranks = await client.get_ranks()
            data = {
                "count": len(ranks),
                "ranks": ranks,
                "sourceType": "PRODUCTION_API",
                "service": "auth-service",
                "endpointKey": "get_ranks",
            }
            _log_call(self.name, "get_ranks", start, True, len(ranks))
            return ToolResult(name=self.name, success=True, data=data)
        except RuntimeError as exc:
            _log_call(self.name, "get_ranks", start, False)
            return ToolResult(name=self.name, success=False, error=str(exc))


class GetRankDistributionTool(BaseAssistantTool):
    """Get how users are distributed across ranks."""

    name = "get_rank_distribution"
    description = (
        "Get how TrekViet users are distributed across ranks. "
        "Returns a breakdown of userCount per rank. "
        "Use to answer 'how many users are at each rank' or 'rank distribution'."
    )

    def __init__(self, settings: Settings):
        self._settings = settings

    async def run(self, **kwargs: Any) -> ToolResult:
        user_token = kwargs.get("_user_token")
        client = AuthServiceClient(self._settings, user_token=user_token)
        
        start = time.monotonic()
        try:
            dist = await client.get_rank_distribution()
            data = {
                **dist,
                "sourceType": "PRODUCTION_API",
                "service": "auth-service",
                "endpointKey": "get_rank_distribution",
            }
            _log_call(self.name, "get_rank_distribution", start, True)
            return ToolResult(name=self.name, success=True, data=data)
        except RuntimeError as exc:
            _log_call(self.name, "get_rank_distribution", start, False)
            return ToolResult(name=self.name, success=False, error=str(exc))
