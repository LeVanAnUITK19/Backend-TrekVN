"""PlaceCandidate model — maps to 'place_candidates' collection."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from .common import AppBaseModel, GeoPoint


class CandidateStatus(str, Enum):
    PROCESSING = "PROCESSING"
    PENDING_REVIEW = "PENDING_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    NEEDS_FIX = "NEEDS_FIX"
    FAILED = "FAILED"


class PlaceOperation(str, Enum):
    CREATE = "CREATE"
    UPDATE = "UPDATE"


class PlaceDifficulty(str, Enum):
    EASY = "EASY"
    MODERATE = "MODERATE"
    HARD = "HARD"
    EXPERT = "EXPERT"


class ProductionPayload(AppBaseModel):
    """Fields that will be sent to trekking-service upon approval."""
    name: str
    slug: Optional[str] = None
    province_id: Optional[str] = None
    address: Optional[str] = None
    location: Optional[GeoPoint] = None
    description: Optional[str] = None
    difficulty: Optional[PlaceDifficulty] = None
    average_duration_minutes: Optional[int] = None
    elevation_meters: Optional[int] = None
    images: list[str] = []
    image_map_url: Optional[str] = None
    tags: list[str] = []
    data_origin: str = "AI_AGENT"
    external_refs: Optional[dict[str, Any]] = None  # { osm: {type, id}, wikidataId }
    last_verified_at: Optional[datetime] = None
    status: str = "ACTIVE"


class CandidateEnrichment(AppBaseModel):
    """Agent-only metadata — NOT synced to production unless production adds those fields."""
    category: Optional[str] = None
    activities: list[str] = []
    estimated_duration: Optional[dict[str, int]] = None  # { minMinutes, maxMinutes }


class CandidateData(AppBaseModel):
    production_payload: ProductionPayload
    enrichment: Optional[CandidateEnrichment] = None


class SourceEntry(AppBaseModel):
    provider: str            # "OpenStreetMap" | "Wikidata" | "web"
    source_id: Optional[str] = None
    url: Optional[str] = None
    retrieved_at: Optional[datetime] = None
    fields: list[str] = []


class QualityInfo(AppBaseModel):
    confidence_score: int = 0   # 0–100 (rule-based, not LLM)
    field_confidence: dict[str, int] = {}
    warnings: list[str] = []


class DuplicateCheck(AppBaseModel):
    is_potential_duplicate: bool = False
    matched_place_id: Optional[str] = None
    score: int = 0
    reason: Optional[str] = None


class ReviewInfo(AppBaseModel):
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    note: Optional[str] = None


class ProductionSync(AppBaseModel):
    synced: bool = False
    production_place_id: Optional[str] = None
    audit_log_id: Optional[str] = None
    synced_at: Optional[datetime] = None
    last_error: Optional[str] = None


class PlaceCandidate(AppBaseModel):
    place_candidate_id: str
    job_id: str
    admin_id: str
    operation: PlaceOperation
    target_place_id: Optional[str] = None
    input: dict[str, Any]             # { placeName, locationHint }
    status: CandidateStatus
    candidate: Optional[CandidateData] = None
    sources: list[SourceEntry] = []
    quality: Optional[QualityInfo] = None
    duplicate_check: Optional[DuplicateCheck] = None
    review: Optional[ReviewInfo] = None
    production_sync: Optional[ProductionSync] = None
    created_at: datetime
    updated_at: datetime
