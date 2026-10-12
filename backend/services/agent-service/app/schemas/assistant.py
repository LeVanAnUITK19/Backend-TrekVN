"""Request/response schemas for the Assistant API."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


# ── Requests ──────────────────────────────────────────────────────────────────


class CreateConversationRequest(BaseModel):
    title: Optional[str] = None
    provider: Optional[str] = None   # auto | uit | groq | openai
    model: Optional[str] = None


class SendMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=10_000)
    provider: Optional[str] = None
    model: Optional[str] = None


# ── Responses ─────────────────────────────────────────────────────────────────


class LLMMetaResponse(BaseModel):
    provider: str
    model: str
    latency_ms: int = Field(alias="latencyMs")

    model_config = {"populate_by_name": True}


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    created_at: Optional[datetime] = Field(None, alias="createdAt")

    model_config = {"populate_by_name": True}


class SendMessageResponse(BaseModel):
    message: dict[str, Any]
    llm: dict[str, Any]


class ConversationResponse(BaseModel):
    conversation_id: str = Field(alias="conversationId")
    admin_id: str = Field(alias="adminId")
    title: Optional[str]
    status: str
    selected_provider: Optional[str] = Field(None, alias="selectedProvider")
    message_count: int = Field(0, alias="messageCount")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    model_config = {"populate_by_name": True}


class RenameConversationRequest(BaseModel):
    """PATCH /agent/conversations/:id — đổi tên conversation."""
    title: str = Field(..., min_length=1, max_length=200)


# ── Badge Approval Schemas ────────────────────────────────────────────────────


class ApproveActionRequest(BaseModel):
    """POST /agent/conversations/:id/approve"""
    approval_id: str = Field(..., alias="approvalId", min_length=1)

    model_config = {"populate_by_name": True}


class RejectActionRequest(BaseModel):
    """POST /agent/conversations/:id/reject"""
    approval_id: str = Field(..., alias="approvalId", min_length=1)
    reason: Optional[str] = Field(None, max_length=500)

    model_config = {"populate_by_name": True}
