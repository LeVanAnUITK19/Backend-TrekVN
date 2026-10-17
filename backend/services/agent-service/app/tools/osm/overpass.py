"""
OpenStreetMap data client.

Strategy (each step is a fallback):
  1. Photon geocoder  (photon.komoot.io) — returns name, coords, OSM ID, state
  2. OSM Element API  (api.openstreetmap.org/api/0.6) — enriches with ele, full tags
  3. Overpass API     (overpass-api.de) — last resort, often rate-limited

Neither Nominatim nor Wikidata are used here (rate-limited from this server).
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

_TIMEOUT = 30.0
_MAX_RESULTS = 5
_PHOTON_URL = "https://photon.komoot.io/api/"
_OSM_ELEMENT_URL = "https://api.openstreetmap.org/api/0.6"
_OVERPASS_URL = "https://overpass-api.de/api/interpreter"
_USER_AGENT = "TrekVietAgentService/1.0 (admin@trekviet.app)"

_OSM_TYPE_MAP = {"N": "node", "W": "way", "R": "relation"}


class OverpassClient:
    """
    OSM place lookup client.
    Interface is identical to the old Overpass-only client — no other code changes needed.
    """

    def __init__(self, overpass_url: str = _OVERPASS_URL, timeout: float = _TIMEOUT):
        self._overpass_url = overpass_url
        self._timeout = timeout

    async def search_place(
        self,
        place_name: str,
        location_hint: Optional[str] = None,
        radius_km: float = 50.0,
    ) -> list[dict[str, Any]]:
        """
        Search for a named place and return OSM-shaped element dicts.
        """
        # Step 1: Photon geocoder
        results = await self._photon_search(place_name, location_hint)
        if results:
            # Step 2: Enrich each result with full OSM element data (ele, tags, etc.)
            enriched = []
            for r in results[:_MAX_RESULTS]:
                enriched.append(await self._enrich_with_osm_api(r))
            return enriched

        # Step 3: Overpass fallback
        logger.warning("Photon returned no results for '%s', trying Overpass", place_name)
        try:
            return await self._overpass_search(place_name, location_hint)
        except Exception as exc:
            logger.warning("Overpass fallback also failed: %s", exc)
            return []

    # ── Photon ────────────────────────────────────────────────────────────

    async def _photon_search(
        self,
        place_name: str,
        location_hint: Optional[str],
    ) -> list[dict[str, Any]]:
        """Query Photon geocoder."""
        query = f"{place_name} {location_hint}" if location_hint else place_name
        params: dict[str, Any] = {"q": query, "limit": _MAX_RESULTS}

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.get(
                    _PHOTON_URL,
                    params=params,
                    headers={"User-Agent": _USER_AGENT, "Accept": "application/json"},
                )
            resp.raise_for_status()
            data = resp.json()
        except httpx.TimeoutException:
            logger.warning("Photon timeout for '%s'", place_name)
            return []
        except Exception as exc:
            logger.warning("Photon error for '%s': %s", place_name, exc)
            return []

        features = data.get("features", [])
        if not features:
            return []

        results = []
        for f in features:
            parsed = self._parse_photon_feature(f)
            if parsed:
                results.append(parsed)

        logger.info("Photon: %d results for '%s'", len(results), place_name)
        return results

    def _parse_photon_feature(self, feature: dict) -> Optional[dict[str, Any]]:
        """Convert a Photon GeoJSON feature to our OSM element shape."""
        props = feature.get("properties", {})
        geo = feature.get("geometry", {})
        coords = geo.get("coordinates", [None, None])

        if not coords[0] or not coords[1]:
            return None

        lon, lat = float(coords[0]), float(coords[1])

        osm_type_short = props.get("osm_type", "")
        osm_type = _OSM_TYPE_MAP.get(osm_type_short, osm_type_short.lower())
        osm_id = props.get("osm_id")

        name = props.get("name", "")
        osm_key = props.get("osm_key", "")
        osm_value = props.get("osm_value", "")

        source_url = (
            f"https://www.openstreetmap.org/{osm_type}/{osm_id}"
            if osm_type and osm_id else None
        )

        # Province/state from Photon address fields
        address = {
            "state": props.get("state"),
            "city": props.get("city"),
            "county": props.get("county"),
            "country": props.get("country"),
        }

        return {
            "osmType": osm_type,
            "osmId": str(osm_id) if osm_id else None,
            "name": name,
            "nameEn": None,   # will be filled by OSM element enrichment
            "nameVi": None,   # will be filled by OSM element enrichment
            "natural": osm_value if osm_key == "natural" else None,
            "tourism": osm_value if osm_key == "tourism" else None,
            "leisure": osm_value if osm_key == "leisure" else None,
            "elevation": None,   # will be filled by OSM element enrichment
            "latitude": lat,
            "longitude": lon,
            "tags": {
                "name": name,
                "natural": osm_value if osm_key == "natural" else None,
                "tourism": osm_value if osm_key == "tourism" else None,
            },
            "sourceUrl": source_url,
            "address": address,
            "_osmType": osm_type,
            "_osmId": osm_id,
        }

    # ── OSM Element API enrichment ─────────────────────────────────────────

    async def _enrich_with_osm_api(self, element: dict[str, Any]) -> dict[str, Any]:
        """
        Fetch full OSM element data (including ele tag) via the OSM API.
        Soft-fail: returns element unchanged if API call fails.
        """
        osm_type = element.get("_osmType") or element.get("osmType")
        osm_id = element.get("_osmId") or element.get("osmId")

        if not osm_type or not osm_id or osm_type not in ("node", "way", "relation"):
            return element

        url = f"{_OSM_ELEMENT_URL}/{osm_type}/{osm_id}.json"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    url,
                    headers={"User-Agent": _USER_AGENT, "Accept": "application/json"},
                )
            if not resp.is_success:
                return element
            data = resp.json()
            osm_el = data.get("elements", [{}])[0]
            tags = osm_el.get("tags", {})

            # Enrich element with full OSM tags
            element["name"] = tags.get("name:vi") or tags.get("name") or element["name"]
            element["nameVi"] = tags.get("name:vi")
            element["nameEn"] = tags.get("name:en")
            element["elevation"] = tags.get("ele") or tags.get("elevation")
            element["natural"] = tags.get("natural") or element.get("natural")
            element["tourism"] = tags.get("tourism") or element.get("tourism")
            element["leisure"] = tags.get("leisure") or element.get("leisure")
            element["tags"] = tags
            # Update lat/lon from OSM API (more accurate for ways/relations)
            if osm_type == "node":
                element["latitude"] = osm_el.get("lat", element["latitude"])
                element["longitude"] = osm_el.get("lon", element["longitude"])

            logger.debug(
                "OSM element enriched: %s/%s name='%s' ele=%s",
                osm_type, osm_id, element["name"], element["elevation"]
            )
        except Exception as exc:
            logger.debug("OSM element enrichment soft-fail for %s/%s: %s", osm_type, osm_id, exc)

        return element

    # ── Overpass fallback ─────────────────────────────────────────────────

    async def _overpass_search(
        self,
        place_name: str,
        location_hint: Optional[str],
    ) -> list[dict[str, Any]]:
        query = self._build_overpass_query(place_name, location_hint)
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                self._overpass_url,
                data={"data": query},
                headers={"Accept": "application/json, */*", "User-Agent": _USER_AGENT},
            )
        resp.raise_for_status()
        data = resp.json()
        elements = data.get("elements", [])
        return self._parse_overpass_elements(elements[:_MAX_RESULTS])

    def _build_overpass_query(self, place_name: str, location_hint: Optional[str]) -> str:
        safe = place_name.replace('"', '\\"').replace("\\", "\\\\")
        if location_hint:
            hint = location_hint.replace('"', '\\"')
            return (
                f'[out:json][timeout:25];\narea["name"~"{hint}",i]->.a;\n'
                f'(\n  node["name"~"{safe}",i]["natural"](area.a);\n'
                f'  way["name"~"{safe}",i]["natural"](area.a);\n'
                f'  relation["name"~"{safe}",i]["natural"](area.a);\n'
                f');\nout center {_MAX_RESULTS};'
            )
        return (
            f'[out:json][timeout:25];\n(\n'
            f'  node["name"~"{safe}",i]["natural"];\n'
            f'  way["name"~"{safe}",i]["natural"];\n'
            f'  relation["name"~"{safe}",i]["natural"];\n'
            f');\nout center {_MAX_RESULTS};'
        )

    def _parse_overpass_elements(self, elements: list[dict]) -> list[dict[str, Any]]:
        results = []
        for el in elements:
            tags = el.get("tags", {})
            lat = el.get("lat") or (el.get("center") or {}).get("lat")
            lon = el.get("lon") or (el.get("center") or {}).get("lon")
            results.append({
                "osmType": el.get("type"),
                "osmId": str(el.get("id", "")),
                "name": tags.get("name:vi") or tags.get("name"),
                "nameEn": tags.get("name:en"),
                "nameVi": tags.get("name:vi"),
                "natural": tags.get("natural"),
                "tourism": tags.get("tourism"),
                "leisure": tags.get("leisure"),
                "elevation": tags.get("ele"),
                "latitude": lat,
                "longitude": lon,
                "tags": tags,
                "sourceUrl": (
                    f"https://www.openstreetmap.org/{el.get('type')}/{el.get('id')}"
                    if el.get("type") and el.get("id") else None
                ),
                "address": {},
            })
        return results
