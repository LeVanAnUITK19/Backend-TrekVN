"""
Base HTTP client helpers shared across all service clients.

Provides:
- _safe_get()   — GET with timeout + retry + error normalisation
- _build_params() — strips None values from query-param dicts
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

# Shared safe limits
MAX_LIMIT = 100        # hard cap on any single page request
DEFAULT_TIMEOUT = 12.0 # seconds


def _build_params(**kwargs: Any) -> dict[str, Any]:
    """Strip None values so callers don't need to guard every optional param."""
    return {k: v for k, v in kwargs.items() if v is not None}


async def _safe_get(
    url: str,
    *,
    headers: dict[str, str],
    params: Optional[dict] = None,
    timeout: float = DEFAULT_TIMEOUT,
    service_name: str = "service",
    correlation_id: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """
    Perform a single GET request.

    Returns:
        Parsed JSON dict on 2xx
        None on 404
    Raises:
        RuntimeError on other non-2xx HTTP responses or network errors.
    """
    effective_headers = dict(headers)
    if correlation_id:
        effective_headers["X-Correlation-ID"] = correlation_id

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url, headers=effective_headers, params=params or {})
    except httpx.TimeoutException:
        raise RuntimeError(f"{service_name} timeout: GET {url}")
    except httpx.RequestError as exc:
        raise RuntimeError(f"{service_name} network error: GET {url}: {exc}")

    if resp.status_code == 404:
        return None
    if not resp.is_success:
        snippet = resp.text[:300]
        raise RuntimeError(
            f"{service_name} HTTP {resp.status_code} on GET {url}: {snippet}"
        )

    try:
        return resp.json()
    except Exception:
        return {"_raw": resp.text[:2000]}
