"""
Production READ tools for the AI Assistant.

All tools in this package are READ-ONLY (GET operations only).
Tools use API clients from app/clients/ — never raw httpx calls.

Tool registry:
  Trekking:
    SearchPlacesTool        — search_places(q, provinceId, difficulty, status, page, limit)
    GetPlaceTool            — get_place(placeId)
    GetRoutesByPlaceTool    — get_routes_by_place(placeId)
    GetRouteTool            — get_route(routeId)
    GetMilestonesTool       — get_milestones(routeId)
    GetPlaceReviewsTool     — get_place_reviews(placeId, page, limit)
    GetBadgesTool           — get_badges(status, category)
    GetContributionsTool    — get_contributions(type, status, userId, page, limit)

  Checkin:
    GetProvincesTool        — get_provinces()
    GetCheckinStatsTool     — get_checkin_statistics(from, to)
    GetPlaceVisitStatsTool  — get_place_visit_statistics(placeId)

  Users / Gamification:
    SearchUsersTool         — search_users(q, role, status, page, limit)
    GetUserSummaryTool      — get_user_summary(userId)
    GetRanksTool            — get_ranks()
    GetRankDistributionTool — get_rank_distribution()
    GetUserStatisticsTool   — get_user_statistics()

  Analytics:
    GetSystemOverviewTool   — get_system_overview()
"""
from .checkin_tools import GetCheckinStatsTool, GetPlaceVisitStatsTool, GetProvincesTool
from .gamification_tools import (
    GetRankDistributionTool,
    GetRanksTool,
    GetUserStatisticsTool,
    SearchUsersTool,
    GetUserSummaryTool,
)
from .trekking_tools import (
    GetBadgesTool,
    GetContributionsTool,
    GetMilestonesTool,
    GetPlaceReviewsTool,
    GetRouteTool,
    GetRoutesByPlaceTool,
    SearchPlacesTool,
    GetPlaceTool,
)
from .analytics_tools import GetSystemOverviewTool
from .badge_write_tools import ProposeBadgeCreateTool, ProposeBadgeUpdateTool

__all__ = [
    # Trekking
    "SearchPlacesTool",
    "GetPlaceTool",
    "GetRoutesByPlaceTool",
    "GetRouteTool",
    "GetMilestonesTool",
    "GetPlaceReviewsTool",
    "GetBadgesTool",
    "GetContributionsTool",
    # Checkin
    "GetProvincesTool",
    "GetCheckinStatsTool",
    "GetPlaceVisitStatsTool",
    # Users / Gamification
    "SearchUsersTool",
    "GetUserSummaryTool",
    "GetRanksTool",
    "GetRankDistributionTool",
    "GetUserStatisticsTool",
    # Analytics
    "GetSystemOverviewTool",
    # Badge write proposals (require admin approval)
    "ProposeBadgeCreateTool",
    "ProposeBadgeUpdateTool",
]
