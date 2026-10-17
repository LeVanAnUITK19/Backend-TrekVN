"""Message model — maps to 'messages' collection."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from .common import AppBaseModel


class MessageRole(str, Enum):
    SYSTEM = "SYSTEM"
    USER = "USER"
    ASSISTANT = "ASSISTANT"
    TOOL = "TOOL"


class LLMMeta(AppBaseModel):
    provider: str
    model: str
    latency_ms: int
    usage: Optional[dict[str, Any]] = None  # promptTokens, completionTokens, totalTokens


class Message(AppBaseModel):
    message_id: str
    conversation_id: str
    admin_id: str
    role: MessageRole
    content: str
    llm: Optional[LLMMeta] = None          # Only for ASSISTANT role
    tool_calls: Optional[list[dict]] = None
    error: Optional[dict] = None
    created_at: datetime
