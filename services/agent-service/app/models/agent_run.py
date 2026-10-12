"""AgentRun model — maps to 'agent_runs' collection."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from .common import AppBaseModel


class RunType(str, Enum):
    ASSISTANT_CHAT = "ASSISTANT_CHAT"
    PLACE_BUILDER = "PLACE_BUILDER"
    MAP_BUILDER = "MAP_BUILDER"


class RunStatus(str, Enum):
    RUNNING = "RUNNING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class AgentRun(AppBaseModel):
    agent_run_id: str
    run_type: RunType
    conversation_id: Optional[str] = None
    workflow_id: Optional[str] = None
    admin_id: str
    provider: Optional[str] = None
    model: Optional[str] = None
    status: RunStatus
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    usage: Optional[dict[str, Any]] = None
    tool_summary: Optional[list[dict]] = None
    error: Optional[dict] = None
    expires_at: Optional[datetime] = None
    created_at: datetime
