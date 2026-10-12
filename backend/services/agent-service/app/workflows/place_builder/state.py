"""Place Builder workflow state — passed between nodes."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class PlaceBuilderState:
    # Input
    job_id: str
    place_name: str
    location_hint: Optional[str]
    operation: str        # CREATE | UPDATE
    target_place_id: Optional[str]
    admin_id: str

    # OSM discovery results
    osm_elements: list[dict[str, Any]] = field(default_factory=list)
    best_osm: Optional[dict[str, Any]] = None

    # Wikidata enrichment
    wikidata: Optional[dict[str, Any]] = None

    # Web crawl
    web_info: Optional[dict[str, Any]] = None

    # Normalized candidate
    candidate: Optional[dict[str, Any]] = None   # productionPayload + enrichment

    # Sources
    sources: list[dict[str, Any]] = field(default_factory=list)

    # Quality
    confidence_score: int = 0
    field_confidence: dict[str, int] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    # Duplicate check
    is_potential_duplicate: bool = False
    matched_place_id: Optional[str] = None
    duplicate_score: int = 0
    duplicate_reason: Optional[str] = None

    # Step tracking
    failed_steps: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    # Final status
    final_status: str = "PROCESSING"   # → PENDING_REVIEW | FAILED
