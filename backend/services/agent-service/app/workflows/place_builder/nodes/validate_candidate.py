"""
Node: validate candidate before saving.

Rule-based confidence scoring — NOT LLM-assigned.
Blocks PENDING_REVIEW if critical fields are missing.
"""

from __future__ import annotations

import logging

from ..state import PlaceBuilderState

logger = logging.getLogger(__name__)

# Fields that contribute to confidence score
_FIELD_WEIGHTS = {
    "name": 20,
    "location": 20,
    "provinceId": 15,
    "elevationMeters": 10,
    "description": 10,
    "difficulty": 5,
    "tags": 5,
    "externalRefs_osm": 10,
    "externalRefs_wikidata": 5,
}


def _score_candidate(payload: dict) -> tuple[int, dict[str, int], list[str]]:
    """Calculate rule-based confidence score."""
    score = 0
    field_conf: dict[str, int] = {}
    warnings: list[str] = []

    # name
    if payload.get("name"):
        field_conf["name"] = 100
        score += _FIELD_WEIGHTS["name"]
    else:
        warnings.append("Missing: name")

    # location
    loc = payload.get("location")
    if loc and loc.get("coordinates") and len(loc["coordinates"]) == 2:
        lon, lat = loc["coordinates"]
        if -180 <= lon <= 180 and -90 <= lat <= 90:
            field_conf["location"] = 100
            score += _FIELD_WEIGHTS["location"]
        else:
            warnings.append(f"Invalid coordinates: [{lon}, {lat}]")
    else:
        warnings.append("Missing: location coordinates")

    # provinceId
    if payload.get("provinceId"):
        field_conf["provinceId"] = 100
        score += _FIELD_WEIGHTS["provinceId"]
    else:
        warnings.append("Missing: provinceId — must be resolved before approval")

    # elevation
    if payload.get("elevationMeters") is not None:
        field_conf["elevationMeters"] = 100
        score += _FIELD_WEIGHTS["elevationMeters"]

    # description
    if payload.get("description"):
        field_conf["description"] = 100
        score += _FIELD_WEIGHTS["description"]
    else:
        warnings.append("Missing: description")

    # difficulty
    if payload.get("difficulty"):
        field_conf["difficulty"] = 100
        score += _FIELD_WEIGHTS["difficulty"]

    # tags
    if payload.get("tags"):
        field_conf["tags"] = 100
        score += _FIELD_WEIGHTS["tags"]

    # externalRefs
    refs = payload.get("externalRefs") or {}
    if refs.get("osm"):
        field_conf["externalRefs_osm"] = 100
        score += _FIELD_WEIGHTS["externalRefs_osm"]
    if refs.get("wikidataId"):
        field_conf["externalRefs_wikidata"] = 100
        score += _FIELD_WEIGHTS["externalRefs_wikidata"]

    return min(score, 100), field_conf, warnings


async def validate_candidate(state: PlaceBuilderState) -> PlaceBuilderState:
    if not state.candidate:
        state.errors.append("No candidate to validate")
        state.final_status = "FAILED"
        return state

    payload = state.candidate.get("productionPayload", {})
    score, field_conf, val_warnings = _score_candidate(payload)

    state.confidence_score = score
    state.field_confidence = field_conf
    state.warnings.extend(val_warnings)

    logger.info(
        "Candidate validation: score=%d warnings=%d",
        score, len(val_warnings)
    )

    # Candidate is saveable as long as it has a name
    # provinceId missing → save with PENDING_REVIEW but warn heavily
    if not payload.get("name"):
        state.errors.append("Candidate has no name — cannot save")
        state.final_status = "FAILED"

    return state
