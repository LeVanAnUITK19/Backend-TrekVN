"""
TrekkingWriteClient — WRITE client for trekking-service (badge operations only).

This client is ONLY called after admin explicitly approves an action in the chat.
It NEVER gets called directly from tool.run() — the tool only proposes the action.
The actual execution happens in AssistantService.execute_approved_action().

Security design:
- Uses admin's Bearer token (not service token) so the request is audited as that admin.
- Only badge endpoints are exposed here (POST/PATCH /api/v1/admin/badges/*).
- Base URL comes from Settings — LLM cannot override it.
- Caller must verify BADGE_WRITE_APPROVED capability before calling.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

from app.config import Settings

logger = logging.getLogger(__name__)


class TrekkingWriteClient:
    """Write client for badge operations — requires admin Bearer token."""

    def __init__(self, settings: Settings, admin_token: str):
        if not admin_token:
            raise ValueError("TrekkingWriteClient requires a valid admin_token")
        self._base = settings.trekking_service_url.rstrip("/")
        self._admin_token = admin_token
        self._timeout = float(settings.request_timeout_seconds)

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._admin_token}",
            "Content-Type": "application/json",
            "X-Agent-Service": "trekviet-agent/1.0",
        }

    # ── Badges ────────────────────────────────────────────────────────────

    async def create_badge(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        POST /api/v1/admin/badges
        payload: { name, description, condition: {type, value?}, status?, iconUrl?, rarity?, category? }
        Returns the created badge document.
        """
        url = f"{self._base}/api/v1/admin/badges"
        logger.info("TrekkingWriteClient.create_badge: POST %s name=%s", url, payload.get("name"))
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(url, headers=self._headers(), json=payload)
        except httpx.TimeoutException:
            raise RuntimeError(f"trekking-service timeout on POST /admin/badges")
        except httpx.RequestError as exc:
            raise RuntimeError(f"trekking-service network error on POST /admin/badges: {exc}")

        if not resp.is_success:
            snippet = resp.text[:400]
            raise RuntimeError(
                f"trekking-service HTTP {resp.status_code} on POST /admin/badges: {snippet}"
            )
        result = resp.json()
        return result.get("data", result)

    async def update_badge(self, badge_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        """
        PATCH /api/v1/admin/badges/:badgeId
        payload: { name?, description?, condition?, iconUrl?, rarity?, category? }
        NOTE: 'status' must NOT be in this payload — use update_badge_status() instead.
        Returns the updated badge document.
        """
        # Ensure status is not sent to the wrong endpoint
        payload = {k: v for k, v in payload.items() if k != "status"}
        url = f"{self._base}/api/v1/admin/badges/{badge_id}"
        logger.info("TrekkingWriteClient.update_badge: PATCH %s", url)
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.patch(url, headers=self._headers(), json=payload)
        except httpx.TimeoutException:
            raise RuntimeError(f"trekking-service timeout on PATCH /admin/badges/{badge_id}")
        except httpx.RequestError as exc:
            raise RuntimeError(f"trekking-service network error: {exc}")

        if not resp.is_success:
            snippet = resp.text[:400]
            raise RuntimeError(
                f"trekking-service HTTP {resp.status_code} on PATCH /admin/badges/{badge_id}: {snippet}"
            )
        result = resp.json()
        return result.get("data", result)

    async def update_badge_status(self, badge_id: str, status: str) -> dict[str, Any]:
        """
        PATCH /api/v1/admin/badges/:badgeId/status
        status: ACTIVE | INACTIVE | DISABLED
        Returns the updated badge document.
        """
        url = f"{self._base}/api/v1/admin/badges/{badge_id}/status"
        logger.info("TrekkingWriteClient.update_badge_status: PATCH %s status=%s", url, status)
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.patch(url, headers=self._headers(), json={"status": status})
        except httpx.TimeoutException:
            raise RuntimeError(f"trekking-service timeout on PATCH /admin/badges/{badge_id}/status")
        except httpx.RequestError as exc:
            raise RuntimeError(f"trekking-service network error: {exc}")

        if not resp.is_success:
            snippet = resp.text[:400]
            raise RuntimeError(
                f"trekking-service HTTP {resp.status_code} on PATCH status: {snippet}"
            )
        result = resp.json()
        return result.get("data", result)
