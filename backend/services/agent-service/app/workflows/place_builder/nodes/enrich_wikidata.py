"""Node: enrich with Wikidata (optional/soft-fail)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.tools.wikidata import WikidataClient

from ..state import PlaceBuilderState

logger = logging.getLogger(__name__)


async def enrich_wikidata(
    state: PlaceBuilderState,
    wikidata_client: WikidataClient,
) -> PlaceBuilderState:
    """
    Fetch Wikidata enrichment — elevation, description, alternative names.
    Soft-fail: if this step fails, pipeline continues with a warning.

    Does NOT overwrite OSM data without logging a conflict warning.
    """
    try:
        result = await wikidata_client.search_place(
            state.place_name,
            location_hint=state.location_hint,
        )
        state.wikidata = result

        if result:
            qid = result.get("wikidataId")
            logger.info("Wikidata: found %s for '%s'", qid, state.place_name)
            state.sources.append({
                "provider": "Wikidata",
                "sourceId": qid,
                "url": result.get("wikidataUrl"),
                "retrievedAt": datetime.now(tz=timezone.utc).isoformat(),
                "fields": ["elevation", "description", "altNames", "coordinates"],
            })

            # Check for coordinate conflict with OSM
            if state.best_osm and result.get("coordinates"):
                wd_coords = result["coordinates"]
                osm_lon = state.best_osm.get("longitude")
                osm_lat = state.best_osm.get("latitude")
                if osm_lon and osm_lat and wd_coords.get("lat") and wd_coords.get("lon"):
                    delta = abs(wd_coords["lat"] - osm_lat) + abs(wd_coords["lon"] - osm_lon)
                    if delta > 0.1:  # ~11km
                        state.warnings.append(
                            "Wikidata coordinates differ significantly from OSM — OSM preferred"
                        )
        else:
            logger.info("Wikidata: no result for '%s'", state.place_name)
            state.failed_steps.append("enrich_wikidata")

    except Exception as exc:
        logger.warning("Wikidata soft-fail: %s", exc)
        state.warnings.append(f"Wikidata enrichment unavailable: {exc}")
        state.failed_steps.append("enrich_wikidata")

    return state
