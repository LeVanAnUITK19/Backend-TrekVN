from .base import BaseAssistantTool, ToolResult
from .knowledge_tools import (
    ListKnowledgeDocumentsTool,
    ReadKnowledgeDocumentTool,
    SearchKnowledgeTool,
)
from .production import (
    GetBadgesTool,
    GetCheckinStatsTool,
    GetContributionsTool,
    GetMilestonesTool,
    GetPlaceReviewsTool,
    GetPlaceTool,
    GetPlaceVisitStatsTool,
    GetProvincesTool,
    GetRankDistributionTool,
    GetRanksTool,
    GetRouteTool,
    GetRoutesByPlaceTool,
    GetSystemOverviewTool,
    GetUserStatisticsTool,
    GetUserSummaryTool,
    ProposeBadgeCreateTool,
    ProposeBadgeUpdateTool,
    SearchPlacesTool,
    SearchUsersTool,
)

__all__ = [
    "BaseAssistantTool",
    "ToolResult",
    # Knowledge
    "ListKnowledgeDocumentsTool",
    "SearchKnowledgeTool",
    "ReadKnowledgeDocumentTool",
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
    "GetUserStatisticsTool",
    "GetRanksTool",
    "GetRankDistributionTool",
    # Analytics
    "GetSystemOverviewTool",
    # Badge write proposals (require admin approval)
    "ProposeBadgeCreateTool",
    "ProposeBadgeUpdateTool",
]
