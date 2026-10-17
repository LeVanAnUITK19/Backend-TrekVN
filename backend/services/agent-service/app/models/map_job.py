"""MapJob model — maps to 'map_jobs' collection."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from .common import AppBaseModel, BoundingBox


class MapJobStatus(str, Enum):
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    PENDING_REVIEW = "PENDING_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    PUBLISHING = "PUBLISHING"
    PUBLISHED = "PUBLISHED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class PublishTargetType(str, Enum):
    PLACE = "PLACE"
    ROUTE = "ROUTE"


class PublishTarget(AppBaseModel):
    type: PublishTargetType = PublishTargetType.PLACE
    target_id: str


class MapInput(AppBaseModel):
    bbox: BoundingBox
    min_zoom: int = 10
    max_zoom: int = 14


class StepInfo(AppBaseModel):
    name: str
    status: str  # PENDING | RUNNING | DONE | FAILED | SKIPPED
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    error: Optional[str] = None


class MapProgress(AppBaseModel):
    current_step: Optional[str] = None
    percent: int = 0
    steps: list[StepInfo] = []


class ArtifactMetadata(AppBaseModel):
    bounds: Optional[dict[str, float]] = None   # { minLon, minLat, maxLon, maxLat }
    center: Optional[list[float]] = None        # [lon, lat]
    min_zoom: Optional[int] = None
    max_zoom: Optional[int] = None
    version: int = 1


class MapOutput(AppBaseModel):
    """Temporary artifact metadata — the actual file is NOT stored in MongoDB."""
    artifact_type: str = "MAP_ZIP"
    temp_path: Optional[str] = None
    file_name: Optional[str] = None
    file_size_bytes: Optional[int] = None
    sha256: Optional[str] = None
    metadata: Optional[ArtifactMetadata] = None
    expires_at: Optional[datetime] = None


class R2Upload(AppBaseModel):
    uploaded: bool = False
    bucket: Optional[str] = None
    object_key: Optional[str] = None
    uploaded_at: Optional[datetime] = None


class ProductionOfflineMapUpdate(AppBaseModel):
    updated: bool = False
    audit_log_id: Optional[str] = None
    updated_at: Optional[datetime] = None
    last_error: Optional[str] = None


class MapPublish(AppBaseModel):
    approved: bool = False
    r2: Optional[R2Upload] = None
    production_offline_map: Optional[ProductionOfflineMapUpdate] = None


class MapReview(AppBaseModel):
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    note: Optional[str] = None


class MapJob(AppBaseModel):
    map_job_id: str
    job_id: str
    admin_id: str
    trekking_place_id: str
    trekking_route_id: Optional[str] = None
    place_name: str
    publish_target: PublishTarget
    input: MapInput
    status: MapJobStatus
    progress: Optional[MapProgress] = None
    output: Optional[MapOutput] = None
    review: Optional[MapReview] = None
    publish: Optional[MapPublish] = None
    error: Optional[dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime
