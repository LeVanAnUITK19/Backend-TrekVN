"""Request/response schemas for Place Builder API."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class CreatePlaceJobRequest(BaseModel):
    place_name: str = Field(..., alias="placeName", min_length=1, max_length=200)
    location_hint: Optional[str] = Field(None, alias="locationHint", max_length=200)
    operation: str = Field("CREATE", pattern="^(CREATE|UPDATE)$")
    target_place_id: Optional[str] = Field(None, alias="targetPlaceId")

    model_config = {"populate_by_name": True}


class UpdateCandidateRequest(BaseModel):
    candidate: Optional[dict[str, Any]] = None
    status: Optional[str] = Field(None, pattern="^(PENDING_REVIEW|NEEDS_FIX)$")


class ReviewActionRequest(BaseModel):
    note: Optional[str] = Field(None, max_length=2000)


class UnifiedReviewRequest(BaseModel):
    """
    POST /agent/candidates/:id/review
    action: APPROVE | REJECT | REQUEST_REVISION
    """
    action: str = Field(..., pattern="^(APPROVE|REJECT|REQUEST_REVISION)$")
    reason: Optional[str] = Field(None, max_length=2000)
