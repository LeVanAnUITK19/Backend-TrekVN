"""WorkflowEvent model — maps to 'workflow_events' collection."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from .common import AppBaseModel


class EventLevel(str, Enum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARN = "WARN"
    ERROR = "ERROR"


class WorkflowType(str, Enum):
    ASSISTANT = "ASSISTANT"
    PLACE_BUILDER = "PLACE_BUILDER"
    MAP_BUILDER = "MAP_BUILDER"


class WorkflowEvent(AppBaseModel):
    workflow_event_id: str
    job_id: str
    workflow_type: WorkflowType
    event: str
    level: EventLevel
    message: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None
    created_at: datetime
    expires_at: Optional[datetime] = None
