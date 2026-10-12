"""
LLM provider info/health API.

GET /api/v1/llm/providers
GET /api/v1/llm/providers/:id/health

IMPORTANT: API key is NEVER returned in any response.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse

from app.dependencies import get_current_admin
from app.llm.base import ProviderHealth
from app.llm.manager import get_llm_manager
from app.utils.serialize import _convert

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/llm", tags=["LLM Providers"])


@router.get("/providers")
async def list_providers(
    admin: Annotated[dict, Depends(get_current_admin)],
) -> JSONResponse:
    manager = get_llm_manager()

    # Use return_exceptions=True so a single failing provider doesn't crash the endpoint
    tasks = [p.health() for p in manager._providers.values()]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    providers = []
    for result in results:
        if isinstance(result, Exception):
            logger.warning("Health check exception: %s", result)
            continue
        h: ProviderHealth = result
        providers.append({
            "id": h.provider_id,
            "name": h.name,
            "available": h.available,
            "models": h.models,
        })

    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "data": {
                "providers": providers,
                "default": manager.default_provider,
            },
        },
    )


@router.get("/providers/{provider_id}/health")
async def get_provider_health(
    provider_id: str,
    admin: Annotated[dict, Depends(get_current_admin)],
) -> JSONResponse:
    manager = get_llm_manager()
    health = await manager.get_provider_health(provider_id)
    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "data": {
                "id": health.provider_id,
                "name": health.name,
                "available": health.available,
                "models": health.models,
                "error": health.error,
            },
        },
    )
