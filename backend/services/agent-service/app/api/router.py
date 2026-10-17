"""
Central API router — mounts all sub-routers.

Path mapping (after gateway strips /api/v1/agent prefix):
  Spec path (gateway)              FastAPI path (this service)
  ─────────────────────────────── ─────────────────────────────
  GET  /agent/conversations        GET  /api/v1/agent/conversations
  POST /agent/conversations        POST /api/v1/agent/conversations
  PATCH /agent/conversations/:id   PATCH /api/v1/agent/conversations/:id
  DELETE /agent/conversations/:id  DELETE /api/v1/agent/conversations/:id
  POST /agent/conversations/:id/messages
  GET  /agent/tasks                GET  /api/v1/agent/tasks
  GET  /agent/tasks/:id            GET  /api/v1/agent/tasks/:id
  # POST /agent/place-jobs           POST /api/v1/agent/place-jobs — DISABLED
  # GET  /agent/place-jobs/:id       GET  /api/v1/agent/place-jobs/:id — DISABLED
  # GET  /agent/candidates           GET  /api/v1/agent/candidates — DISABLED
  # POST /agent/candidates/:id/review — DISABLED
  POST /agent/map-jobs             POST /api/v1/agent/map-jobs
  GET  /agent/map-jobs/:id         GET  /api/v1/agent/map-jobs/:id
  POST /agent/map-jobs/:id/approve
  POST /agent/map-jobs/:id/reject
  GET  /agent/map-artifacts/:id
  GET  /agent/map-artifacts/:id/download
  GET  /llm/providers              GET  /api/v1/llm/providers

Note: The gateway proxies /api/v1/agent/* → this service's /api/v1/agent/*
      and /api/v1/llm/* → this service's /api/v1/llm/*
      (path is preserved unchanged by gateway).
"""

from __future__ import annotations

from fastapi import APIRouter

from .assistant import legacy_router as assistant_legacy_router
from .assistant import router as assistant_router
from .health import router as health_router
from .llm_providers import router as llm_router
from .map_builder import legacy_router as map_builder_legacy_router
from .map_builder import router as map_builder_router
# from .place_builder import legacy_router as place_builder_legacy_router
# from .place_builder import router as place_builder_router
from .tasks import router as tasks_router

# ── Top-level router (no prefix) — health endpoints ──────────────────────────
root_router = APIRouter()
root_router.include_router(health_router)

# ── Versioned API router ──────────────────────────────────────────────────────
api_v1 = APIRouter(prefix="/api/v1")

# Spec-aligned routers (admin web uses these)
api_v1.include_router(assistant_router)    # /api/v1/agent/conversations/*
api_v1.include_router(tasks_router)        # /api/v1/agent/tasks/*
# api_v1.include_router(place_builder_router)  # /api/v1/agent/place-jobs/*, /api/v1/agent/candidates/* — DISABLED
api_v1.include_router(map_builder_router)    # /api/v1/agent/map-jobs/*, /api/v1/agent/map-artifacts/*
api_v1.include_router(llm_router)          # /api/v1/llm/providers

# Legacy routers (backward compat — keep old paths working)
api_v1.include_router(assistant_legacy_router)      # /api/v1/assistant/conversations/*
# api_v1.include_router(place_builder_legacy_router)  # /api/v1/place-builder/* — DISABLED
api_v1.include_router(map_builder_legacy_router)    # /api/v1/map-builder/*
