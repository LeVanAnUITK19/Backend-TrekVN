"""
Map Builder API endpoints.

Spec (Admin Web) paths — mounted under /agent:
  POST   /agent/map-jobs
  GET    /agent/map-jobs
  GET    /agent/map-jobs/:id
  POST   /agent/map-jobs/:id/approve
  POST   /agent/map-jobs/:id/reject
  GET    /agent/map-artifacts/:id
  GET    /agent/map-artifacts/:id/download   ← signed URL
  GET    /agent/map-artifacts/:id/file       ← authenticated ZIP for download/preview

Legacy paths (backward compat):
  POST   /map-builder/jobs  → same handlers
  ...
"""

from __future__ import annotations

import mimetypes
from pathlib import Path
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse, JSONResponse
from app.utils.serialize import _convert

from app.config import Settings, get_settings
from app.db.repositories.map_jobs import MapJobRepository
from app.db.repositories.workflow_events import WorkflowEventRepository
from app.dependencies import (
    get_current_admin,
    get_map_job_repo,
    get_workflow_event_repo,
)
from app.schemas.map_builder import CreateMapJobRequest, MapReviewActionRequest
from app.workflows.map_builder.service import MapBuilderService

# Spec-aligned router — mounted at /agent by router.py
router = APIRouter(prefix="/agent", tags=["Agent Map Builder"])

# Legacy router — keeps old /map-builder/* paths working
legacy_router = APIRouter(prefix="/map-builder", tags=["Map Builder (legacy)"])


def _get_service(
    settings: Settings = Depends(get_settings),
    repo: MapJobRepository = Depends(get_map_job_repo),
    events: WorkflowEventRepository = Depends(get_workflow_event_repo),
) -> MapBuilderService:
    return MapBuilderService(settings=settings, job_repo=repo, event_repo=events)


# ── Jobs ──────────────────────────────────────────────────────────────────────


@router.post("/map-jobs", status_code=status.HTTP_201_CREATED)
@legacy_router.post("/jobs", status_code=status.HTTP_202_ACCEPTED, include_in_schema=False)
async def create_job(
    body: CreateMapJobRequest,
    admin: Annotated[dict, Depends(get_current_admin)],
    svc: MapBuilderService = Depends(_get_service),
) -> JSONResponse:
    bbox_dict = {
        "minLon": body.bbox.min_lon,
        "minLat": body.bbox.min_lat,
        "maxLon": body.bbox.max_lon,
        "maxLat": body.bbox.max_lat,
    }
    result = await svc.create_job(
        admin_id=admin["userId"],
        trekking_place_id=body.trekking_place_id,
        place_name=body.place_name,
        publish_target_type=body.publish_target.type,
        publish_target_id=body.publish_target.target_id,
        bbox=bbox_dict,
        min_zoom=body.min_zoom,
        max_zoom=body.max_zoom,
    )
    return JSONResponse(status_code=201, content={"success": True, "data": _convert(result)})


@router.get("/map-jobs")
@legacy_router.get("/jobs", include_in_schema=False)
async def list_jobs(
    admin: Annotated[dict, Depends(get_current_admin)],
    svc: MapBuilderService = Depends(_get_service),
    status_filter: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
) -> JSONResponse:
    result = await svc.list_jobs(
        admin_id=admin["userId"],
        status=status_filter,
        page=page,
        limit=limit,
    )
    return JSONResponse(status_code=200, content={"success": True, "data": _convert(result)})


@router.get("/map-jobs/{job_id}")
@legacy_router.get("/jobs/{job_id}", include_in_schema=False)
async def get_job(
    job_id: str,
    admin: Annotated[dict, Depends(get_current_admin)],
    svc: MapBuilderService = Depends(_get_service),
) -> JSONResponse:
    job = await svc.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "JOB_NOT_FOUND", "message": f"Map job {job_id} không tồn tại"},
        )
    return JSONResponse(status_code=200, content={"success": True, "data": _convert(job)})


# ── Approve / Reject ──────────────────────────────────────────────────────────


@router.post("/map-jobs/{job_id}/approve")
@legacy_router.post("/jobs/{job_id}/approve", include_in_schema=False)
async def approve_job(
    job_id: str,
    admin: Annotated[dict, Depends(get_current_admin)],
    svc: MapBuilderService = Depends(_get_service),
    body: Optional[MapReviewActionRequest] = None,
) -> JSONResponse:
    try:
        note = body.note if body else None
        result = await svc.approve(job_id=job_id, admin_id=admin["userId"], note=note)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "APPROVE_ERROR", "message": str(exc)},
        )
    return JSONResponse(status_code=200, content={"success": True, "data": _convert(result)})


@router.post("/map-jobs/{job_id}/reject")
@legacy_router.post("/jobs/{job_id}/reject", include_in_schema=False)
async def reject_job(
    job_id: str,
    admin: Annotated[dict, Depends(get_current_admin)],
    svc: MapBuilderService = Depends(_get_service),
    body: Optional[MapReviewActionRequest] = None,
) -> JSONResponse:
    try:
        note = body.note if body else None
        result = await svc.reject(job_id=job_id, admin_id=admin["userId"], note=note)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "REJECT_ERROR", "message": str(exc)},
        )
    return JSONResponse(status_code=200, content={"success": True, "data": _convert(result)})


# ── Map Artifacts ─────────────────────────────────────────────────────────────


@router.get("/map-artifacts/{job_id}")
@legacy_router.get("/jobs/{job_id}/artifact/metadata", include_in_schema=False)
async def get_map_artifact(
    job_id: str,
    admin: Annotated[dict, Depends(get_current_admin)],
    svc: MapBuilderService = Depends(_get_service),
) -> JSONResponse:
    """
    GET /agent/map-artifacts/:id
    Trả về metadata của artifact bản đồ (không stream file).

    Behavior theo status:
    - PENDING_REVIEW / PUBLISHED → trả artifact metadata
    - FAILED → 422 với error message cụ thể (không phải 404)
    - PROCESSING / QUEUED → 202 với progress info
    - not found → 404
    """
    job = await svc.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "JOB_NOT_FOUND", "message": f"Map job {job_id} không tồn tại"},
        )

    job_status = job.get("status", "")

    # Job FAILED — trả lỗi cụ thể để frontend dừng polling
    if job_status == "FAILED":
        error_info = job.get("error") or {}
        error_msg = (
            error_info.get("message")
            or ("; ".join(error_info.get("messages", [])) if error_info.get("messages") else None)
            or "Pipeline thất bại"
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "JOB_FAILED",
                "message": f"Tạo bản đồ thất bại: {error_msg}",
                "jobStatus": job_status,
            },
        )

    # Job đang xử lý — trả 202 với progress để frontend tiếp tục poll
    if job_status in ("QUEUED", "PROCESSING"):
        progress = job.get("progress") or {}
        raise HTTPException(
            status_code=status.HTTP_202_ACCEPTED,
            detail={
                "code": "JOB_PROCESSING",
                "message": "Bản đồ đang được xử lý",
                "jobStatus": job_status,
                "progress": _convert(progress),
            },
        )

    output = job.get("output") or {}
    if not output:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ARTIFACT_NOT_FOUND", "message": "Artifact chưa sẵn sàng"},
        )

    # Extract data from correct paths
    input_data = job.get("input") or {}
    metadata = output.get("metadata") or {}
    bounds = metadata.get("bounds") or {}

    # Convert backend structure to frontend MapArtifact type
    # Backend uses minLon/maxLon, Frontend expects minLng/maxLng
    bbox = {
        "minLng": bounds.get("minLon"),
        "minLat": bounds.get("minLat"),
        "maxLng": bounds.get("maxLon"),
        "maxLat": bounds.get("maxLat"),
    } if bounds else None

    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "data": _convert({
                "id": f"map-artifact-{job_id}",
                "taskId": job_id,
                "fileName": output.get("fileName"),
                "sizeBytes": output.get("fileSizeBytes"),
                "checksum": output.get("sha256"),
                "version": metadata.get("version", 1),
                "bbox": bbox,
                "zoomMin": metadata.get("minZoom") or input_data.get("minZoom"),
                "zoomMax": metadata.get("maxZoom") or input_data.get("maxZoom"),
                "layers": ["ROADS", "POI", "TERRAIN", "CONTOUR", "HILLSHADE"],
                "scope": job.get("publishTarget", {}).get("type", "PLACE"),
                "placeId": job.get("trekkingPlaceId"),
                "placeName": job.get("placeName"),
                "createdAt": job.get("createdAt"),
                "r2ObjectKey": output.get("r2ObjectKey"),
                "publishedAt": output.get("publishedAt"),
                "downloadUrl": output.get("downloadUrl"),
            }),
        },
    )


@router.get("/map-artifacts/{job_id}/download")
async def get_map_artifact_download_url(
    job_id: str,
    admin: Annotated[dict, Depends(get_current_admin)],
    svc: MapBuilderService = Depends(_get_service),
) -> JSONResponse:
    """
    GET /agent/map-artifacts/:id/download
    Lấy signed download URL (ngắn hạn) hoặc stream artifact trực tiếp.
    """
    artifact_path = await svc.get_artifact_path(job_id, admin["userId"])

    if artifact_path is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "ARTIFACT_NOT_FOUND",
                "message": "Chưa có gói bản đồ hoàn chỉnh hoặc ZIP đã hết thời gian lưu",
            },
        )

    # Nếu R2 đã publish → trả signed URL từ service
    job = await svc.get_job(job_id)
    output = (job or {}).get("output") or {}
    if output.get("downloadUrl"):
        return JSONResponse(
            status_code=200,
            content={"success": True, "data": _convert({"url": output["downloadUrl"]})},
        )

    # Fallback: trả download URL tới endpoint artifact stream (local dev)
    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "data": {"url": f"/api/v1/agent/map-artifacts/{job_id}/file"},
        },
    )


# Legacy artifact download (stream) — giữ nguyên
@router.get("/map-artifacts/{job_id}/file")
@legacy_router.get("/jobs/{job_id}/artifact", include_in_schema=False)
async def download_artifact_legacy(
    job_id: str,
    admin: Annotated[dict, Depends(get_current_admin)],
    svc: MapBuilderService = Depends(_get_service),
) -> FileResponse:
    """Legacy stream endpoint — kept for backward compat. Stream the map.zip."""
    artifact_path = await svc.get_artifact_path(job_id, admin["userId"])

    if artifact_path is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "ARTIFACT_NOT_FOUND",
                "message": "Chưa có gói bản đồ hoàn chỉnh hoặc ZIP đã hết thời gian lưu",
            },
        )

    return FileResponse(
        path=str(artifact_path),
        media_type="application/zip",
        filename=artifact_path.name,
    )
