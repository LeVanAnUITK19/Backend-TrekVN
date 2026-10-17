"""
Wikidata enrichment client.

Fetches supplementary data (alternative names, elevation, description, link)
for a named place. Optional step — soft-fail if unavailable.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

_WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql"
_WIKIDATA_API_URL = "https://www.wikidata.org/w/api.php"
_TIMEOUT = 15.0
_USER_AGENT = "TrekVietAgentService/1.0 (https://trekviet.app)"


class WikidataClient:
    def __init__(self, timeout: float = _TIMEOUT):
        self._timeout = timeout

    async def search_place(
        self, place_name: str, location_hint: Optional[str] = None
    ) -> Optional[dict[str, Any]]:
        """
        Search Wikidata for a geographic entity matching place_name.
        Returns a dict with enrichment data, or None on failure.
        """
        try:
            entity = await self._search_entity(place_name)
            if not entity:
                return None
            qid = entity.get("id")
            if not qid:
                return None
            details = await self._fetch_entity_details(qid)
            return self._parse_enrichment(entity, details, qid)
        except Exception as exc:
            logger.warning("Wikidata soft-fail for '%s': %s", place_name, exc)
            return None

    async def _search_entity(self, place_name: str) -> Optional[dict]:
        """Use Wikidata search API to find the entity."""
        params = {
            "action": "wbsearchentities",
            "search": place_name,
            "language": "vi",
            "uselang": "vi",
            "limit": 3,
            "format": "json",
        }
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(
                _WIKIDATA_API_URL,
                params=params,
                headers={"User-Agent": _USER_AGENT},
            )
        if not resp.is_success:
            return None
        data = resp.json()
        results = data.get("search", [])
        if not results:
            return None
        # Return best match (first result)
        return results[0]

    async def _fetch_entity_details(self, qid: str) -> dict:
        """Fetch entity claims via the Wikidata API."""
        params = {
            "action": "wbgetentities",
            "ids": qid,
            "props": "claims|labels|descriptions|sitelinks",
            "languages": "vi|en",
            "format": "json",
        }
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(
                _WIKIDATA_API_URL,
                params=params,
                headers={"User-Agent": _USER_AGENT},
            )
        if not resp.is_success:
            return {}
        data = resp.json()
        entities = data.get("entities", {})
        return entities.get(qid, {})

    def _parse_enrichment(
        self, entity: dict, details: dict, qid: str
    ) -> dict[str, Any]:
        """Extract useful fields from Wikidata entity."""
        claims = details.get("claims", {})
        labels = details.get("labels", {})
        descriptions = details.get("descriptions", {})

        # Elevation: P2044 (elevation above sea level)
        elevation_m = self._claim_quantity(claims, "P2044")

        # Coordinate location: P625
        coordinates = self._claim_coordinate(claims, "P625")

        # Description in Vietnamese / English
        description_vi = (descriptions.get("vi") or {}).get("value")
        description_en = (descriptions.get("en") or {}).get("value")

        # Alternative names
        label_vi = (labels.get("vi") or {}).get("value")
        label_en = (labels.get("en") or {}).get("value")

        return {
            "wikidataId": qid,
            "wikidataUrl": f"https://www.wikidata.org/wiki/{qid}",
            "labelVi": label_vi,
            "labelEn": label_en,
            "descriptionVi": description_vi,
            "descriptionEn": description_en,
            "elevationMeters": elevation_m,
            "coordinates": coordinates,  # { lat, lon } or None
        }

    def _claim_quantity(self, claims: dict, prop: str) -> Optional[int]:
        entries = claims.get(prop, [])
        if not entries:
            return None
        try:
            val = entries[0]["mainsnak"]["datavalue"]["value"]["amount"]
            # Wikidata amounts may start with '+' or '-'
            return int(float(val))
        except (KeyError, ValueError, TypeError):
            return None

    def _claim_coordinate(self, claims: dict, prop: str) -> Optional[dict]:
        entries = claims.get(prop, [])
        if not entries:
            return None
        try:
            val = entries[0]["mainsnak"]["datavalue"]["value"]
            return {"lat": val.get("latitude"), "lon": val.get("longitude")}
        except (KeyError, TypeError):
            return None
