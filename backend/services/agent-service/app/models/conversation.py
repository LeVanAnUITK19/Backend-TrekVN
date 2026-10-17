"""Conversation model — maps to 'conversations' collection in trekviet_agent."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from .common import AppBaseModel


class ConversationStatus(str, Enum):
    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"


class Conversation(AppBaseModel):
    conversation_id: str
    admin_id: str
    title: Optional[str] = None
    status: ConversationStatus = ConversationStatus.ACTIVE
    selected_provider: Optional[str] = None  # auto | uit | groq | openai
    selected_model: Optional[str] = None
    message_count: int = 0
    last_message_at: Optional[datetime] = None
    summary: Optional[str] = None
    created_at: datetime
    updated_at: datetime
