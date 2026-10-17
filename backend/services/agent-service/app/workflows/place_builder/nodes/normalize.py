"""
Node: normalize collected data into a production-ready candidate.

Maps raw OSM/Wikidata/web data to the exact trekking_places schema.
LLM is NOT used to invent GPS, elevation, or source data.
LLM may be used (optionally) to normalize description text — not implemented in V1 to keep
the pipeline deterministic.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from app.tools.osm.extract import extract_coordinates, extract_elevation_meters
from app.utils.ids import slugify

from ..state import PlaceBuilderState

logger = logging.getLogger(__name__)

# Mapping from OSM tags to difficulty levels (rule-based, not LLM)
_DIFFICULTY_HINTS = {
    "hiking": "MODERATE",
    "via_ferrata": "HARD",
    "climbing": "EXPERT",
    "peak": "MODERATE",
    "volcano": "HARD",
}


def _infer_difficulty(osm: dict) -> Optional[str]:
    tags = osm.get("tags", {})
    sport = tags.get("sport", "").lower()
    for hint, level in _DIFFICULTY_HINTS.items():
        if hint in sport:
            return level
    natural = (osm.get("natural") or "").lower()
    if natural in ("peak", "volcano"):
        return "MODERATE"
    return None


def _infer_tags(osm: dict) -> list[str]:
    tags: list[str] = []
    natural = (osm.get("natural") or "").lower()
    tourism = (osm.get("tourism") or "").lower()
    leisure = (osm.get("leisure") or "").lower()
    osm_tags = osm.get("tags", {})

    if natural in ("peak", "mountain"):
        tags.append("mountain")
    if natural == "forest":
        tags.append("forest")
    if natural in ("water", "lake"):
        tags.append("lake")
    if tourism in ("attraction", "viewpoint"):
        tags.append("viewpoint")
    if leisure in ("nature_reserve", "park"):
        tags.append("nature")
    if osm_tags.get("sport") == "hiking":
        tags.append("hiking")

    return list(set(tags)) or ["trekking"]


async def normalize(state: PlaceBuilderState) -> PlaceBuilderState:
    """
    Build `productionPayload` from collected data sources.

    Priority:
    1. OSM (most geographically accurate)
    2. Wikidata (supplementary enrichment)
    3. Web (description only)

    LLM NOT used here — all transformations are deterministic.
    """
    osm = state.best_osm or {}
    wd = state.wikidata or {}
    web = state.web_info or {}

    # ── Name ──────────────────────────────────────────────────────────────
    name = (
        osm.get("nameVi")
        or osm.get("name")
        or wd.get("labelVi")
        or state.place_name
    ).strip()

    slug = slugify(name)

    # ── Coordinates ───────────────────────────────────────────────────────
    coords = extract_coordinates(osm)
    if not coords and wd.get("coordinates"):
        wd_c = wd["coordinates"]
        if wd_c.get("lat") and wd_c.get("lon"):
            coords = (float(wd_c["lon"]), float(wd_c["lat"]))

    location = None
    if coords:
        location = {"type": "Point", "coordinates": list(coords)}

    # ── Elevation ─────────────────────────────────────────────────────────
    elevation = extract_elevation_meters(osm)
    if elevation is None and wd.get("elevationMeters"):
        elevation = wd["elevationMeters"]

    # ── Description ───────────────────────────────────────────────────────
    description = (
        wd.get("descriptionVi")
        or web.get("extract")
        or wd.get("descriptionEn")
    )
    if description:
        description = description[:2000]   # cap to reasonable length

    # ── Images ────────────────────────────────────────────────────────────
    # Only use CC-licensed images from Wikipedia (web_info).
    # Images are stored as {url, caption, source} objects.
    images: list[dict[str, Any]] = []
    web_images = web.get("images") or []
    for img in web_images:
        if isinstance(img, dict) and img.get("url"):
            images.append({
                "url": img["url"],
                "caption": img.get("caption") or name,
                "source": img.get("source", "wikipedia"),
            })
        elif isinstance(img, str) and img:
            images.append({"url": img, "caption": name, "source": "unknown"})

    # ── Difficulty (rule-based) ────────────────────────────────────────────
    difficulty = _infer_difficulty(osm) if osm else None

    # ── Tags (rule-based) ─────────────────────────────────────────────────
    tags = _infer_tags(osm) if osm else ["trekking"]

    # ── External refs ─────────────────────────────────────────────────────
    external_refs: dict[str, Any] = {}
    if osm.get("osmType") and osm.get("osmId"):
        external_refs["osm"] = {"type": osm["osmType"], "id": osm["osmId"]}
    if wd.get("wikidataId"):
        external_refs["wikidataId"] = wd["wikidataId"]

    # ── provinceId — extract from Nominatim address if available ────────
    # Nominatim returns address.state or address.province for Vietnamese addresses
    # e.g. {"state": "Tỉnh Tây Ninh", "city": "...", "country": "Vietnam"}
    # provinceId cannot be resolved to DB ID here — stored as None.
    # But we store province display name in address for reference.
    province_id: Optional[str] = None
    osm_address = osm.get("address", {}) or {}
    province_name = (
        osm_address.get("state")
        or osm_address.get("province")
        or osm_address.get("county")
    )
    # Strip "Tỉnh " / "Thành phố " prefix for cleaner display
    if province_name:
        for prefix in ("Tỉnh ", "Thành phố ", "tỉnh ", "thành phố "):
            if province_name.startswith(prefix):
                province_name = province_name[len(prefix):]
                break

    address_display = (
        state.location_hint
        or province_name
        or None
    )

    # Build production payload
    production_payload: dict[str, Any] = {
        "name": name,
        "slug": slug,
        "provinceId": province_id,  # resolved by admin at review time
        "provinceName": province_name or None,  # display-only, from Nominatim address
        "address": address_display,
        "location": location,
        "description": description,
        "difficulty": difficulty,
        "averageDurationMinutes": None,
        "elevationMeters": elevation,
        "images": images,        # list of {url, caption, source} from Wikipedia CC-BY-SA
        "imageMapUrl": None,
        "tags": tags,
        "dataOrigin": "AI_AGENT",
        "externalRefs": external_refs if external_refs else None,
        "lastVerifiedAt": None,   # set at approval time
        "status": "ACTIVE",
    }

    # Enrichment metadata (agent-only, not synced to production by default)
    enrichment: dict[str, Any] = {
        "category": "MOUNTAIN" if "mountain" in tags else "NATURE",
        "activities": ["TREKKING", "HIKING"],
        "estimatedDuration": None,
    }

    state.candidate = {
        "productionPayload": production_payload,
        "enrichment": enrichment,
    }

    logger.info(
        "Normalize: candidate '%s' slug='%s' location=%s elevation=%s",
        name, slug, location, elevation
    )
    return state
