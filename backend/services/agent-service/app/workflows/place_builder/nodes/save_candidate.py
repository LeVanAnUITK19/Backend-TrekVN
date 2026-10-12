"""Node: save candidate to Agent DB."""

from __future__ import annotations

import logging

from app.db.repositories.place_candidates import PlaceCandidateRepository

from ..state import PlaceBuilderState

logger = logging.getLogger(__name__)

# Human-readable labels for each confidence field — used by frontend ConfidenceBar
_FIELD_LABELS: dict[str, str] = {
    "name": "Tên địa điểm",
    "location": "Tọa độ GPS",
    "provinceId": "Tỉnh/Thành phố",
    "elevationMeters": "Độ cao",
    "description": "Mô tả",
    "difficulty": "Độ khó",
    "tags": "Tags",
    "externalRefs_osm": "OSM ID",
    "externalRefs_wikidata": "Wikidata ID",
}

# Warnings tied to specific fields (subset of _FIELD_WEIGHTS keys)
_FIELD_WARNINGS: dict[str, str] = {
    "provinceId": "Cần điền provinceId trước khi duyệt",
    "location": "Tọa độ có thể không chính xác — kiểm tra trước khi duyệt",
}


def _build_field_scores(
    field_confidence: dict[str, int],
    warnings: list[str],
) -> list[dict]:
    """
    Convert field_confidence dict → frontend-compatible fieldScores array.

    Format: [{ field, label, score, confidence, warning? }]
    Both `score` and `confidence` are included so normalizeCandidateDoc
    can read either key interchangeably.
    """
    scores: list[dict] = []
    for field, label in _FIELD_LABELS.items():
        score = field_confidence.get(field, 0)
        entry: dict = {
            "field": field,
            "label": label,
            "score": score,
            "confidence": score,  # alias — frontend reads either key
        }
        # Attach per-field warning when confidence is low
        if score == 0:
            entry["warning"] = _FIELD_WARNINGS.get(field) or f"Không tìm thấy dữ liệu cho {label}"
        elif field in _FIELD_WARNINGS and field not in ["location"]:
            # provinceId present but still shows reminder (it's always None from pipeline)
            pass
        scores.append(entry)

    # provinceId is always None from pipeline — always show warning
    for entry in scores:
        if entry["field"] == "provinceId" and entry["score"] == 0:
            entry["warning"] = "Cần điền provinceId trước khi duyệt"

    return scores


async def save_candidate(
    state: PlaceBuilderState,
    repo: PlaceCandidateRepository,
) -> PlaceBuilderState:
    """
    Persist candidate to place_candidates collection.
    Sets final status to PENDING_REVIEW.

    quality structure (matches what normalizeCandidateDoc reads):
      overallScore   — integer 0-100 (main confidence score)
      confidence     — alias for overallScore
      fieldScores    — [{field, label, score, confidence, warning?}]
      fieldConfidence — raw dict (kept for backward compat)
      warnings       — string[]
    """
    if state.final_status == "FAILED":
        # Update record to FAILED status (repo call happens in graph.py)
        return state

    field_scores = _build_field_scores(state.field_confidence, state.warnings)

    # Sources: normalize field names to match frontend expectations
    # Frontend reads: name, type, url, externalId, fetchedAt
    normalized_sources = []
    for src in state.sources:
        normalized_sources.append({
            "name": src.get("provider") or src.get("name") or "Unknown",
            "type": _provider_to_type(src.get("provider") or src.get("name") or ""),
            "url": src.get("url"),
            "externalId": src.get("sourceId"),
            "fetchedAt": src.get("retrievedAt") or src.get("fetchedAt"),
        })

    update_data = {
        "status": "PENDING_REVIEW",
        "candidate": state.candidate,
        "sources": normalized_sources,
        "quality": {
            # Primary keys (read by normalizeCandidateDoc)
            "overallScore": state.confidence_score,
            "confidence": state.confidence_score,  # alias
            "fieldScores": field_scores,
            # Keep raw dict for backward compat
            "confidenceScore": state.confidence_score,
            "fieldConfidence": state.field_confidence,
            "warnings": state.warnings,
        },
        "duplicateCheck": {
            "isPotentialDuplicate": state.is_potential_duplicate,
            "matchedPlaceId": state.matched_place_id,
            "score": state.duplicate_score,
            "reason": state.duplicate_reason,
            # matches array format expected by normalizeCandidateDoc
            "matches": _build_duplicate_matches(state),
        },
    }

    await repo.update_by_job_id(state.job_id, update_data)
    state.final_status = "PENDING_REVIEW"

    logger.info(
        "Candidate saved: job_id=%s status=PENDING_REVIEW confidence=%d sources=%d images=%d",
        state.job_id,
        state.confidence_score,
        len(normalized_sources),
        len((state.candidate or {}).get("productionPayload", {}).get("images") or []),
    )
    return state


def _provider_to_type(provider: str) -> str:
    """Map source provider name to frontend SourceType enum."""
    p = provider.lower()
    if "osm" in p or "openstreetmap" in p or "overpass" in p:
        return "OSM"
    if "wikidata" in p:
        return "WIKIDATA"
    if "wiki" in p or "web" in p or "crawl" in p:
        return "WEBSITE"
    return "OTHER"


def _build_duplicate_matches(state: PlaceBuilderState) -> list[dict]:
    """Build matches array for duplicateCheck.matches."""
    if not state.is_potential_duplicate or not state.matched_place_id:
        return []
    return [
        {
            "placeId": state.matched_place_id,
            "id": state.matched_place_id,
            "name": "",          # trekking-service didn't return name
            "similarity": state.duplicate_score,
        }
    ]
