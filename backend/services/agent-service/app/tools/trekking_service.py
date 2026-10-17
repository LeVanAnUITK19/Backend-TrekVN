"""
Trekking Service API client for Agent Service.

ALL calls use the authenticated service token — never the admin's user token.
This client is ONLY for:
  - READ-ONLY lookups (duplicate check, province resolution, place existence check)
  - Production writes AFTER explicit admin approval (create place, update place, update offline map)

Agent Service NEVER calls production MongoDB directly.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

from app.config import Settings

logger = logging.getLogger(__name__)

_TIMEOUT = 15.0
_RETRY_ATTEMPTS = 2


class TrekkingServiceClient:
    def __init__(self, settings: Settings):
        self._base_url = settings.trekking_service_url.rstrip("/")
        self._token = settings.trekviet_internal_token
        self._timeout = float(settings.request_timeout_seconds)

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
            "X-Agent-Service": "trekviet-agent/1.0",
            # Service-to-service token — trekking-service verify qua requireServiceToken middleware
            "X-Service-Token": self._token,
        }

    # ── READ operations ───────────────────────────────────────────────────

    async def get_place_by_id(self, place_id: str) -> Optional[dict[str, Any]]:
        """GET /api/v1/admin/trekking/places/:id — read-only."""
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.get(
                    f"{self._base_url}/api/v1/admin/trekking/places/{place_id}",
                    headers=self._headers(),
                )
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            return resp.json().get("data")
        except httpx.TimeoutException:
            raise RuntimeError(f"Trekking service timeout (getPlace {place_id})")
        except Exception as exc:
            logger.error("getPlaceById error: %s", exc)
            raise

    async def search_places(
        self,
        q: Optional[str] = None,
        province_id: Optional[str] = None,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """GET /api/v1/places — public search for duplicate check."""
        params: dict = {"limit": limit}
        if q:
            params["q"] = q
        if province_id:
            params["provinceId"] = province_id
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.get(
                    f"{self._base_url}/api/v1/places",
                    params=params,
                    headers={"X-Agent-Service": "trekviet-agent/1.0"},
                )
            resp.raise_for_status()
            data = resp.json()
            return data.get("data", {}).get("items", [])
        except Exception as exc:
            logger.warning("searchPlaces error (soft): %s", exc)
            return []

    async def get_nearby_places(
        self, lon: float, lat: float, radius_km: float = 5.0
    ) -> list[dict[str, Any]]:
        """
        Search nearby places for geospatial duplicate check.
        TODO: requires GET /api/v1/admin/trekking/places/nearby endpoint.
        Currently falls back to name search only.
        """
        # TODO: implement when nearby endpoint is added to trekking-service
        logger.debug("get_nearby_places: nearby API not yet available, skipping")
        return []

    async def get_route_by_id(self, route_id: str) -> Optional[dict[str, Any]]:
        """GET /api/v1/admin/trekking/routes/:id — for map builder validation."""
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.get(
                    f"{self._base_url}/api/v1/admin/trekking/routes/{route_id}",
                    headers=self._headers(),
                )
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            return resp.json().get("data")
        except Exception as exc:
            logger.error("getRouteById error: %s", exc)
            raise

    async def get_public_route_by_id(self, route_id: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.get(f"{self._base_url}/api/v1/routes/{route_id}", headers=self._headers())
        response.raise_for_status()
        return response.json()["data"]

    async def get_place_routes(self, place_id: str) -> list[dict[str, Any]]:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.get(f"{self._base_url}/api/v1/places/{place_id}/routes",
                                        headers=self._headers())
        response.raise_for_status()
        return response.json()["data"]

    async def get_route_milestones(self, route_id: str) -> list[dict[str, Any]]:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.get(f"{self._base_url}/api/v1/routes/{route_id}/milestones",
                                        headers=self._headers())
        response.raise_for_status()
        return response.json()["data"]

    # ── WRITE operations (only called after explicit admin approval) ───────

    async def create_place(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        POST /api/v1/admin/trekking/places — called ONLY after approval.
        """
        logger.info("TrekkingService: creating place '%s'", payload.get("name"))
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{self._base_url}/api/v1/admin/trekking/places",
                headers=self._headers(),
                json=payload,
            )
        if not resp.is_success:
            error_body = resp.text[:500]
            raise RuntimeError(
                f"Trekking service create place failed HTTP {resp.status_code}: {error_body}"
            )
        return resp.json().get("data", {})

    async def update_place(self, place_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        """
        PUT /api/v1/admin/trekking/places/:id — called ONLY after approval.
        """
        logger.info("TrekkingService: updating place '%s'", place_id)
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.put(
                f"{self._base_url}/api/v1/admin/trekking/places/{place_id}",
                headers=self._headers(),
                json=payload,
            )
        if not resp.is_success:
            error_body = resp.text[:500]
            raise RuntimeError(
                f"Trekking service update place failed HTTP {resp.status_code}: {error_body}"
            )
        return resp.json().get("data", {})

    async def update_place_offline_map(
        self, place_id: str, offline_map_data: dict[str, Any]
    ) -> dict[str, Any]:
        """
        PUT /api/v1/admin/trekking/places/:id/offline-map — called ONLY after map approval + R2 upload.
        """
        logger.info("TrekkingService: updating offline map for place '%s'", place_id)
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.put(
                f"{self._base_url}/api/v1/admin/trekking/places/{place_id}/offline-map",
                headers=self._headers(),
                json=offline_map_data,
            )
        if not resp.is_success:
            error_body = resp.text[:500]
            raise RuntimeError(
                f"Trekking service update place offline-map failed HTTP {resp.status_code}: {error_body}"
            )
        return resp.json().get("data", {})

    async def update_route_offline_map(
        self, route_id: str, offline_map_data: dict[str, Any]
    ) -> dict[str, Any]:
        """
        PUT /api/v1/admin/trekking/routes/:routeId/offline-map — called ONLY after map approval + R2 upload.
        """
        logger.info("TrekkingService: updating offline map for route '%s'", route_id)
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.put(
                f"{self._base_url}/api/v1/admin/trekking/routes/{route_id}/offline-map",
                headers=self._headers(),
                json=offline_map_data,
            )
        if not resp.is_success:
            error_body = resp.text[:500]
            raise RuntimeError(
                f"Trekking service update route offline-map failed HTTP {resp.status_code}: {error_body}"
            )
        return resp.json().get("data", {})
