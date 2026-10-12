"""
Agent Tasks API endpoints.

Spec (Admin Web) paths:
  GET /agent/tasks        — danh sách tất cả agent tasks (place-builder + map-builder)
  GET /agent/tasks/:id    — chi tiết task với steps và logs

Tasks được tổng hợp từ:
  - place_candidates collection (type=PLACE_BUILDER)
  - map_jobs collection (type=MAP_BUILDER)
"""

from __future__ import annotations

from typing import Annotated, Optional
from datetime import date, datetime, time, timedelta, timezone
import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse

from app.dependencies import (
    get_current_admin,
    get_agent_run_repo,
    get_map_job_repo,
    get_place_candidate_repo,
    get_workflow_event_repo,
)
from app.db.repositories.map_jobs import MapJobRepository
from app.db.repositories.place_candidates import PlaceCandidateRepository
from app.db.repositories.workflow_events import WorkflowEventRepository
from app.utils.serialize import _convert
from app.db.repositories.task_history import task_history_query
from app.db.repositories.agent_runs import AgentRunRepository

router = APIRouter(prefix="/agent", tags=["Agent Tasks"])


def _format_assistant_task(run: dict) -> dict:
    return {
        "id": run["agentRunId"], "jobId": run["agentRunId"], "type": "ASSISTANT",
        "name": "Trợ lý AI", "description": run.get("conversationId"),
        "createdBy": run.get("adminId"),
        "status": "PROCESSING" if run.get("status") == "RUNNING" else run.get("status") or "QUEUED",
        "createdAt": run.get("createdAt"), "updatedAt": run.get("finishedAt") or run.get("createdAt"),
        "completedAt": run.get("finishedAt"), "executionTimeMs": run.get("durationMs"),
        "errorMessage": (run.get("error") or {}).get("message"),
    }


def _format_place_task(candidate: dict) -> dict:
    """Chuyển place_candidate document sang AgentTask format."""
    return {
        "id": candidate.get("placeCandidateId") or str(candidate.get("_id", "")),
        "jobId": candidate.get("jobId"),
        "type": "PLACE_BUILDER",
        "name": (candidate.get("input") or {}).get("placeName") or candidate.get("placeName"),
        "description": (candidate.get("input") or {}).get("locationHint"),
        "createdBy": candidate.get("adminId"),
        "status": _map_candidate_status(candidate.get("status")),
        "createdAt": candidate.get("createdAt"),
        "updatedAt": candidate.get("updatedAt"),
        "completedAt": candidate.get("review", {}).get("reviewedAt") if candidate.get("review") else None,
        "executionTimeMs": None,
        "resultRef": candidate.get("placeCandidateId"),
        "errorMessage": (candidate.get("error") or {}).get("message"),
    }


def _format_map_task(job: dict) -> dict:
    """Chuyển map_job document sang AgentTask format."""
    return {
        "id": job.get("mapJobId") or str(job.get("_id", "")),
        "jobId": job.get("jobId"),
        "type": "MAP_BUILDER",
        "name": job.get("placeName"),
        "description": f"bbox: {job.get('bbox')}",
        "createdBy": job.get("adminId"),
        "status": job.get("status") or "QUEUED",
        "createdAt": job.get("createdAt"),
        "updatedAt": job.get("updatedAt"),
        "completedAt": job.get("review", {}).get("reviewedAt") if job.get("review") else None,
        "executionTimeMs": job.get("progress", {}).get("elapsedMs") if job.get("progress") else None,
        "resultRef": job.get("mapJobId"),
        "errorMessage": (job.get("error") or {}).get("message") or "; ".join((job.get("error") or {}).get("messages") or []),
    }


def _map_candidate_status(status: Optional[str]) -> str:
    """Map internal candidate status sang AgentTaskStatus."""
    mapping = {
        "PROCESSING": "PROCESSING",
        "PENDING_REVIEW": "PENDING_REVIEW",
        "APPROVED": "APPROVED",
        "REJECTED": "REJECTED",
        "NEEDS_FIX": "PENDING_REVIEW",  # map sang PENDING_REVIEW cho frontend
        "FAILED": "FAILED",
    }
    return mapping.get(status or "", status or "QUEUED")


@router.get("/tasks")
async def list_tasks(
    admin: Annotated[dict, Depends(get_current_admin)],
    place_repo: PlaceCandidateRepository = Depends(get_place_candidate_repo),
    map_repo: MapJobRepository = Depends(get_map_job_repo),
    run_repo: AgentRunRepository = Depends(get_agent_run_repo),
    task_type: Optional[str] = Query(None, alias="type"),
    task_status: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    date_from: Optional[str] = Query(None, alias="from"),
    date_to: Optional[str] = Query(None, alias="to"),
) -> JSONResponse:
    """
    GET /agent/tasks
    Tổng hợp tasks từ tất cả agent workflows.
    Filter: type (PLACE_BUILDER|MAP_BUILDER), status, search, from, to.
    """
    task_type = task_type or None
    task_status = task_status or None
    if task_type not in (None, "PLACE_BUILDER", "MAP_BUILDER", "ASSISTANT"):
        raise HTTPException(status_code=422, detail="Loại tác vụ không hợp lệ")

    def parse_day(value):
        if not value:
            return None
        try:
            return date.fromisoformat(value)
        except ValueError:
            raise HTTPException(status_code=422, detail="Ngày phải có định dạng YYYY-MM-DD")

    first_day, last_day = parse_day(date_from), parse_day(date_to)
    if first_day and last_day and first_day > last_day:
        raise HTTPException(status_code=422, detail="Từ ngày phải trước hoặc bằng đến ngày")
    local_tz = timezone(timedelta(hours=7))
    start_at = datetime.combine(first_day, time.min, local_tz).astimezone(timezone.utc) if first_day else None
    end_at = datetime.combine(last_day + timedelta(days=1), time.min, local_tz).astimezone(timezone.utc) if last_day else None
    skip = (page - 1) * limit
    sources = []
    if task_type in (None, "PLACE_BUILDER"):
        sources.append((place_repo, _format_place_task, True))
    if task_type in (None, "MAP_BUILDER"):
        sources.append((map_repo, _format_map_task, False))
    if task_type in (None, "ASSISTANT"):
        sources.append((run_repo, _format_assistant_task, False))

    async def fetch(repo, formatter, place):
        query = task_history_query(status=task_status, search=(search or "").strip(),
                                   date_from=start_at, date_to=end_at, place=place)
        if formatter is _format_assistant_task:
            query["runType"] = "ASSISTANT_CHAT"
            if task_status == "PROCESSING":
                query["status"] = "RUNNING"
            if search and search.strip():
                import re
                query["$or"] = [{field: {"$regex": re.escape(search.strip()), "$options": "i"}}
                                for field in ("agentRunId", "conversationId", "adminId", "model", "provider")]
        docs, count = await asyncio.gather(
            repo.find_task_history(query, skip + limit), repo.count_task_history(query),
        )
        return [formatter(doc) for doc in docs], count

    results = await asyncio.gather(*(fetch(*source) for source in sources))
    tasks = [task for rows, _ in results for task in rows]
    # Normalize timestamps before comparing mixed legacy ISO strings and BSON dates.
    def sort_key(task):
        raw = task.get("createdAt")
        try:
            dt = raw if isinstance(raw, datetime) else datetime.fromisoformat(raw.replace("Z", "+00:00"))
            stamp = dt.replace(tzinfo=dt.tzinfo or timezone.utc).timestamp()
        except (ValueError, TypeError, AttributeError):
            stamp = 0
        return stamp, task.get("jobId") or "", task["id"]

    tasks.sort(key=sort_key, reverse=True)
    total = sum(count for _, count in results)
    paginated = tasks[skip:skip + limit]

    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "data": _convert({
                "data": paginated,
                "total": total,
                "page": page,
                "limit": limit,
                "totalPages": max(1, (total + limit - 1) // limit),
            }),
        },
    )


@router.get("/tasks/{task_id}")
async def get_task(
    task_id: str,
    admin: Annotated[dict, Depends(get_current_admin)],
    place_repo: PlaceCandidateRepository = Depends(get_place_candidate_repo),
    map_repo: MapJobRepository = Depends(get_map_job_repo),
    event_repo: WorkflowEventRepository = Depends(get_workflow_event_repo),
    run_repo: AgentRunRepository = Depends(get_agent_run_repo),
) -> JSONResponse:
    """
    GET /agent/tasks/:id
    Chi tiết task với steps và logs.
    Tìm trong cả place_candidates và map_jobs.
    """
    # Thử tìm trong place_candidates
    candidate = await place_repo.find_by_id(task_id)
    if not candidate:
        candidate = await place_repo.find_by_job_id(task_id)
    if candidate:
        task = _format_place_task(candidate)
        steps, logs = await _get_steps_and_logs(event_repo, task_id, candidate.get("jobId"))
        return JSONResponse(
            status_code=200,
            content={"success": True, "data": _convert({**task, "steps": steps, "logs": logs, "result": candidate.get("candidate")})},
        )

    job = await map_repo.find_by_id(task_id)
    if not job:
        job = await map_repo.find_by_job_id(task_id)
    if job:
        task = _format_map_task(job)
        steps = _build_map_steps(job)
        logs = await _get_logs(event_repo, task_id, job.get("jobId"))
        return JSONResponse(
            status_code=200,
            content={"success": True, "data": _convert({**task, "steps": steps, "logs": logs})},
        )

    run = await run_repo.find_by_id(task_id)
    if run and run.get("runType") == "ASSISTANT_CHAT":
        task = _format_assistant_task(run)
        logs = await _get_logs(event_repo, task_id, None)
        return JSONResponse(status_code=200, content={"success": True, "data": _convert({
            **task, "steps": [], "logs": logs,
            "metadata": {"provider": run.get("provider") or "", "model": run.get("model") or ""},
            "result": {"usage": run.get("usage"), "tools": run.get("toolSummary")},
        })})

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "TASK_NOT_FOUND", "message": f"Task {task_id} không tồn tại"},
    )


async def _get_steps_and_logs(
    event_repo: WorkflowEventRepository,
    task_id: str,
    job_id: Optional[str],
) -> tuple[list, list]:
    """Lấy steps và logs từ workflow_events."""
    query_id = job_id or task_id
    events = await event_repo.find_by_job_id(query_id)

    steps = []
    logs = []
    seen_steps: set[str] = set()

    for ev in events:
        msg = ev.get("message", "")
        level = _log_level(ev)
        ts = ev.get("createdAt")

        # Build logs
        logs.append({"timestamp": ts, "level": level, "message": msg})

        # Build steps từ events có level INFO và tên bước rõ ràng
        if level == "info" and ev.get("event") and ev["event"] not in seen_steps:
            seen_steps.add(ev["event"])
            steps.append({
                "label": msg or ev["event"],
                "status": "done",
                "timestamp": ts,
            })

    return steps, logs


async def _get_logs(
    event_repo: WorkflowEventRepository,
    task_id: str,
    job_id: Optional[str],
) -> list:
    query_id = job_id or task_id
    events = await event_repo.find_by_job_id(query_id)
    return [
        {
            "timestamp": ev.get("createdAt"),
            "level": _log_level(ev),
            "message": ev.get("message", ""),
        }
        for ev in events
    ]


def _log_level(event: dict) -> str:
    level = (event.get("level") or "info").lower()
    return "warn" if level == "warning" else level if level in ("info", "warn", "error") else "info"


def _build_map_steps(job: dict) -> list:
    """Build steps từ trạng thái map job."""
    progress = job.get("progress") or {}
    if progress.get("steps"):
        status_map = {"DONE": "done", "SUCCESS": "done", "COMPLETED": "done", "RUNNING": "active", "ACTIVE": "active", "PROCESSING": "active", "FAILED": "error", "ERROR": "error"}
        steps = [{"label": step.get("label") or step.get("name") or "Bước xử lý",
                  "status": status_map.get((step.get("status") or "").upper(), "pending"),
                  "message": step.get("error") or step.get("message")}
                 for step in progress["steps"]]
        if job.get("status") in ("PUBLISHED", "SUCCESS"):
            steps.append({"label": "Hoàn thành", "status": "done"})
        elif job.get("status") == "PUBLISHING":
            steps.append({"label": "Upload R2/CDN", "status": "active"})
        return steps
    job_status = job.get("status") or "QUEUED"
    labels = ["Khởi tạo tác vụ", "Validate BBOX", "Build MBTiles", "Package ZIP",
              "Chờ Admin duyệt", "Upload R2/CDN", "Hoàn thành"]
    active_index = {"QUEUED": 0, "PROCESSING": 1, "PENDING_REVIEW": 4,
                    "APPROVED": 5, "PUBLISHING": 5, "PUBLISHED": 7, "SUCCESS": 7}.get(job_status, 0)
    return [
        {"label": label, "status": (
            "done" if index < active_index else
            "error" if index == active_index and job_status == "FAILED" else
            "pending" if job_status in ("REJECTED", "CANCELLED") or index > active_index else "active"
        )}
        for index, label in enumerate(labels)
    ]
