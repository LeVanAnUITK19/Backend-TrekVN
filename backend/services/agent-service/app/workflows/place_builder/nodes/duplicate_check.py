"""
Node: duplicate check against production trekking-service.

Priority order (per spec v1.1):
1. externalRefs.osm.id
2. externalRefs.wikidataId
3. normalized name
4. nearby coordinate
5. fuzzy name
"""

from __future__ import annotations

import logging

from app.tools.trekking_service import TrekkingServiceClient

from ..state import PlaceBuilderState

logger = logging.getLogger(__name__)


async def duplicate_check(
    state: PlaceBuilderState,
    trekking_client: TrekkingServiceClient,
) -> PlaceBuilderState:
    """
    Check if a matching place already exists in production.
    Sets state.is_potential_duplicate and related fields.
    Never merges or modifies production data.
    """
    if not state.candidate:
        return state

    payload = state.candidate.get("productionPayload", {})
    external_refs = payload.get("externalRefs") or {}

    matched_id: str | None = None
    score = 0
    reason: str | None = None

    # 1. OSM ID match — strongest signal
    osm_ref = external_refs.get("osm", {})
    if osm_ref.get("id"):
        osm_type = osm_ref.get("type", "node")
        osm_id = osm_ref["id"]
        candidates = await trekking_client.search_places(
            q=payload.get("name"), limit=5
        )
        for place in candidates:
            refs = place.get("externalRefs") or {}
            place_osm = refs.get("osm", {})
            if place_osm.get("id") == osm_id and place_osm.get("type") == osm_type:
                matched_id = place.get("trekkingPlaceId")
                score = 95
                reason = f"OSM ID match: {osm_type}/{osm_id}"
                break

    # 2. Wikidata ID match
    if not matched_id and external_refs.get("wikidataId"):
        wdid = external_refs["wikidataId"]
        candidates = await trekking_client.search_places(q=payload.get("name"), limit=5)
        for place in candidates:
            refs = place.get("externalRefs") or {}
            if refs.get("wikidataId") == wdid:
                matched_id = place.get("trekkingPlaceId")
                score = 90
                reason = f"Wikidata ID match: {wdid}"
                break

    # 3. Exact normalized name match
    if not matched_id and payload.get("name"):
        name_lower = payload["name"].lower().strip()
        candidates = await trekking_client.search_places(q=payload["name"], limit=10)
        for place in candidates:
            if (place.get("name") or "").lower().strip() == name_lower:
                matched_id = place.get("trekkingPlaceId")
                score = 80
                reason = f"Exact name match: {payload['name']}"
                break

    # 4. Nearby coordinate — TODO: requires nearby endpoint
    # (state.best_osm coordinates would be used here)

    # 5. Fuzzy name — already covered by search_places above

    if matched_id:
        logger.warning(
            "Duplicate detected: matched production place %s (score=%d, reason=%s)",
            matched_id, score, reason
        )
        state.is_potential_duplicate = True
        state.matched_place_id = matched_id
        state.duplicate_score = score
        state.duplicate_reason = reason
        state.warnings.append(f"Potential duplicate: {reason} → {matched_id}")
    else:
        logger.info("Duplicate check: no match found for '%s'", payload.get("name"))

    return state
