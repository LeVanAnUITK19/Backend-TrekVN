"""
TrekViet Agent Service — FastAPI application entry point.

Startup sequence:
  1. Load settings (fail-fast on missing required env vars)
  2. Connect Agent MongoDB (fail-fast if unreachable)
  3. Create indexes idempotently
  4. Initialise LLM provider manager
  5. Start FastAPI

Shutdown:
  - Close MongoDB connection
"""

from __future__ import annotations

import json
import logging
import sys
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_v1, root_router
from app.config import get_settings
from app.db.indexes import create_indexes
from app.db.mongo import close_db, connect_db, get_db
from app.llm.manager import init_llm_manager
from app.utils.serialize import _convert

# ── Logging setup ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[type-arg]
    """Startup / shutdown lifecycle."""
    settings = get_settings()

    # Adjust log level from config
    logging.getLogger().setLevel(settings.log_level.upper())

    # 1. Connect MongoDB (fail-fast in production, warn in dev)
    try:
        await connect_db(settings)
        logger.info("✅ MongoDB connected successfully")
    except Exception as exc:
        logger.critical("Cannot connect to Agent MongoDB: %s", exc)
        if settings.app_env == "production":
            sys.exit(1)
        else:
            logger.warning("⚠️  Running without MongoDB in dev mode - conversation history will NOT be saved")
            # Skip MongoDB init in dev mode
            pass

    # 2. Create indexes idempotently
    try:
        await create_indexes(get_db())
    except Exception as exc:
        logger.error("Index creation failed (non-fatal): %s", exc)

    # 3. Init LLM manager
    try:
        init_llm_manager(settings)
    except Exception as exc:
        logger.warning("LLM manager init warning: %s", exc)

    # 4. Init knowledge service
    try:
        from app.knowledge import init_knowledge_service
        init_knowledge_service(settings)
        logger.info("Knowledge service initialized")
    except Exception as exc:
        logger.error("Knowledge service init failed: %s", exc)
        # Non-fatal: allow service to start even if knowledge unavailable

    logger.info(
        "Agent Service started: env=%s port=%d",
        settings.app_env, settings.port,
    )

    yield

    # Shutdown
    await close_db()
    logger.info("Agent Service shut down")


# ── App factory ───────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="TrekViet Agent Service",
        version="1.1.0",
        description=(
            "AI Assistant, Place Builder, and Map Builder for TrekViet Admin. "
            "All production writes require explicit Admin approval."
        ),
        lifespan=lifespan,
        # Disable docs in production (they expose internal API structure)
        docs_url="/docs" if settings.app_env != "production" else None,
        redoc_url="/redoc" if settings.app_env != "production" else None,
        openapi_url="/openapi.json" if settings.app_env != "production" else None,
    )

    # ── CORS ──────────────────────────────────────────────────────────────
    # allow_origins=["*"] + allow_credentials=True là invalid combination theo CORS spec.
    # Phải dùng origin cụ thể khi credentials=True.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routers ───────────────────────────────────────────────────────────
    app.include_router(root_router)   # /health, /health/ready
    app.include_router(api_v1)        # /api/v1/...

    # ── Global exception handler ──────────────────────────────────────────
    from fastapi.exceptions import HTTPException

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        detail = exc.detail
        if settings.app_env == "production" and exc.status_code >= 500:
            detail = {"code": "INTERNAL_ERROR", "message": "Internal server error"}
        return JSONResponse(status_code=exc.status_code, content={"detail": detail}, headers=exc.headers)

    # Catches unhandled exceptions INCLUDING PydanticSerializationError
    # which FastAPI doesn't catch itself (happens during response serialization).
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        import traceback
        tb = traceback.format_exc()
        logger.error(
            "Unhandled exception on %s %s: %s\n%s",
            request.method, request.url.path, exc, tb,
        )
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "Internal server error",
                    "details": {} if settings.app_env == "production" else {"exception": type(exc).__name__, "msg": str(exc)},
                },
            },
        )

    return app


app = create_app()
