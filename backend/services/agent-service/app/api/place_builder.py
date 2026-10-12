"""
Place Builder API endpoints.

Spec (Admin Web) paths — mounted under /agent:
  POST   /agent/place-jobs
  GET    /agent/place-jobs/:id
  GET    /agent/candidates
  GET    /agent/candidates/:id
  PATCH  /agent/candidates/:id
  POST   /agent/candidates/:id/review    ← unified (action: APPROVE|REJECT|REQUEST_REVISION)

Legacy paths (backward compat):
  POST   /place-builder/jobs  → same handlers
  ...
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from app.utils.serialize import _convert

from app.config import Settings, get_settings
from app.db.repositories.place_candidates import PlaceCandidateRepository
from app.db.repositories.workflow_events import WorkflowEventRepository
from app.dependencies import (
    get_current_admin,
    get_place_candidate_repo,
    get_workflow_event_repo,
)
from app.schemas.place_builder import (
    CreatePlaceJobRequest,
    ReviewActionRequest,
    UnifiedReviewRequest,
    UpdateCandidateRequest,
)
from app.workflows.place_builder.service import PlaceBuilderService

# Spec-aligned router — mounted at /agent by router.py
router = APIRouter(prefix="/agent", tags=["Agent Place Builder"])

# Legacy router — keeps old /place-builder/* paths working
legacy_router = APIRouter(prefix="/place-builder", tags=["Place Builder (legacy)"])


def _get_service(
    settings: Settings = Depends(get_settings),
    repo: PlaceCandidateRepository = Depends(get_place_candidate_repo),
    events: WorkflowEventRepository = Depends(get_workflow_event_repo),
) -> PlaceBuilderService:
    return PlaceBuilderService(settings=settings, candidate_repo=repo, event_repo=events)


# ── Jobs ──────────────────────────────────────────────────────────────────────


@router.post("/place-jobs", status_code=status.HTTP_201_CREATED)
@legacy_router.post("/jobs", status_code=status.HTTP_202_ACCEPTED, include_in_schema=False)
async def create_job(
    body: CreatePlaceJobRequest,
    admin: Annotated[dict, Depends(get_current_admin)],
    svc: PlaceBuilderService = Depends(_get_service),
) -> JSONResponse:
    result = await svc.create_job(
        admin_id=admin["userId"],
        place_name=body.place_name,
        location_hint=body.location_hint,
        operation=body.operation,
        target_place_id=body.target_place_id,
    )
    return JSONResponse(status_code=200, content={"success": True, "data": _convert(result)})


@router.get("/place-jobs/{job_id}")
@legacy_router.get("/jobs/{job_id}", include_in_schema=False)
async def get_job(
    job_id: str,
    admin: Annotated[dict, Depends(get_current_admin)],
    svc: PlaceBuilderService = Depends(_get_service),
) -> JSONResponse:
    job = await svc.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "JOB_NOT_FOUND", "message": f"Job {job_id} không tồn tại"},
        )
    return JSONResponse(status_code=200, content={"success": True, "data": _convert(job)})


# ── Candidates ────────────────────────────────────────────────────────────────


@router.get("/candidates")
@legacy_router.get("/candidates", include_in_schema=False)
async def list_candidates(
    admin: Annotated[dict, Depends(get_current_admin)],
    svc: PlaceBuilderService = Depends(_get_service),
    status_filter: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
) -> JSONResponse:
    result = await svc.list_candidates(
        admin_id=admin["userId"],
        status=status_filter,
        page=page,
        limit=limit,
    )
    return JSONResponse(status_code=200, content={"success": True, "data": _convert(result)})


@router.get("/candidates/{candidate_id}")
@legacy_router.get("/candidates/{candidate_id}", include_in_schema=False)
async def get_candidate(
    candidate_id: str,
    admin: Annotated[dict, Depends(get_current_admin)],
    svc: PlaceBuilderService = Depends(_get_service),
) -> JSONResponse:
    candidate = await svc.get_candidate(candidate_id)
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CANDIDATE_NOT_FOUND", "message": "Candidate không tồn tại"},
        )
    return JSONResponse(status_code=200, content={"success": True, "data": _convert(candidate)})


@router.patch("/candidates/{candidate_id}")
@legacy_router.patch("/candidates/{candidate_id}", include_in_schema=False)
async def update_candidate(
    candidate_id: str,
    body: UpdateCandidateRequest,
    admin: Annotated[dict, Depends(get_current_admin)],
    svc: PlaceBuilderService = Depends(_get_service),
) -> JSONResponse:
    try:
        result = await svc.update_candidate(
            candidate_id=candidate_id,
            admin_id=admin["userId"],
            data=body.model_dump(exclude_none=True),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "CANDIDATE_UPDATE_ERROR", "message": str(exc)},
        )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CANDIDATE_NOT_FOUND", "message": "Candidate không tồn tại"},
        )
    return JSONResponse(status_code=200, content={"success": True, "data": _convert(result)})


@router.post("/candidates/{candidate_id}/review")
async def review_candidate(
    candidate_id: str,
    body: UnifiedReviewRequest,
    admin: Annotated[dict, Depends(get_current_admin)],
    svc: PlaceBuilderService = Depends(_get_service),
) -> JSONResponse:
    """
    POST /agent/candidates/:id/review
    Unified review endpoint — action: APPROVE | REJECT | REQUEST_REVISION
    """
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Review request: candidate={candidate_id} action={body.action} reason_len={len(body.reason or '')}")
    try:
        if body.action == "APPROVE":
            result = await svc.approve(
                candidate_id=candidate_id,
                admin_id=admin["userId"],
                note=body.reason,
            )
        elif body.action == "REJECT":
            result = await svc.reject(
                candidate_id=candidate_id,
                admin_id=admin["userId"],
                note=body.reason,
            )
        elif body.action == "REQUEST_REVISION":
            result = await svc.request_revision(
                candidate_id=candidate_id,
                admin_id=admin["userId"],
                note=body.reason,
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "INVALID_ACTION", "message": f"action không hợp lệ: {body.action}"},
            )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "REVIEW_ERROR", "message": str(exc)},
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "PRODUCTION_API_ERROR", "message": str(exc)},
        )
    return JSONResponse(status_code=200, content={"success": True, "data": _convert(result)})


# ── Legacy approve/reject kept for backward compat ────────────────────────────

@legacy_router.post("/candidates/{candidate_id}/approve", include_in_schema=False)
async def approve_candidate_legacy(
    candidate_id: str,
    body: ReviewActionRequest,
    admin: Annotated[dict, Depends(get_current_admin)],
    svc: PlaceBuilderService = Depends(_get_service),
) -> JSONResponse:
    try:
        result = await svc.approve(
            candidate_id=candidate_id,
            admin_id=admin["userId"],
            note=body.note,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"code": "APPROVE_ERROR", "message": str(exc)})
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail={"code": "PRODUCTION_API_ERROR", "message": str(exc)})
    return JSONResponse(status_code=200, content={"success": True, "data": _convert(result)})


@legacy_router.post("/candidates/{candidate_id}/reject", include_in_schema=False)
async def reject_candidate_legacy(
    candidate_id: str,
    body: ReviewActionRequest,
    admin: Annotated[dict, Depends(get_current_admin)],
    svc: PlaceBuilderService = Depends(_get_service),
) -> JSONResponse:
    try:
        result = await svc.reject(
            candidate_id=candidate_id,
            admin_id=admin["userId"],
            note=body.note,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"code": "REJECT_ERROR", "message": str(exc)})
    return JSONResponse(status_code=200, content={"success": True, "data": _convert(result)})
