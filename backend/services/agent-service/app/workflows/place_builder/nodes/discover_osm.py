"""Node: discover place on OpenStreetMap (required step)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.tools.osm.extract import best_osm_match
from app.tools.osm.overpass import OverpassClient

from ..state import PlaceBuilderState

logger = logging.getLogger(__name__)


async def discover_osm(
    state: PlaceBuilderState,
    overpass_client: OverpassClient,
) -> PlaceBuilderState:
    """
    Query Overpass for the named place.

    - Important step: failure prevents PENDING_REVIEW
    - Adds OSM source to state.sources
    """
    try:
        elements = await overpass_client.search_place(
            state.place_name,
            location_hint=state.location_hint,
        )
        state.osm_elements = elements
        state.best_osm = best_osm_match(elements, state.place_name)

        if state.best_osm:
            logger.info(
                "OSM: found '%s' (type=%s id=%s)",
                state.best_osm.get("name"),
                state.best_osm.get("osmType"),
                state.best_osm.get("osmId"),
            )
            state.sources.append({
                "provider": "OpenStreetMap",
                "sourceId": f"{state.best_osm.get('osmType')}:{state.best_osm.get('osmId')}",
                "url": state.best_osm.get("sourceUrl"),
                "retrievedAt": datetime.now(tz=timezone.utc).isoformat(),
                "fields": ["name", "location", "elevation", "tags"],
            })
        else:
            logger.warning("OSM: no match found for '%s'", state.place_name)
            state.warnings.append("OSM: no matching place found")
            state.failed_steps.append("discover_osm")

    except Exception as exc:
        logger.error("OSM discovery failed: %s", exc)
        state.warnings.append(f"OSM discovery error: {exc}")
        state.failed_steps.append("discover_osm")
        # OSM is important — mark failed but allow pipeline to continue
        # (candidate will have lower confidence)

    return state
