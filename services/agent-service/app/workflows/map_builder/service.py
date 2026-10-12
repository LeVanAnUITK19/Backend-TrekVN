"""
Map Builder Service — orchestrates job lifecycle and approve/reject.

approve flow:
  PENDING_REVIEW → APPROVED → PUBLISHING → UPLOAD_R2 → UPDATE_PRODUCTION_OFFLINE_MAP → PUBLISHED
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any, Optional

from app.config import Settings
from app.db.repositories.map_jobs import MapJobRepository
from app.db.repositories.workflow_events import WorkflowEventRepository
from app.tools.r2 import R2Client
from app.tools.trekking_service import TrekkingServiceClient
from app.utils.ids import new_map_job_id, new_uuid, slugify
from app.utils.time import utcnow

from .pipeline import run_map_builder_pipeline
from .state import MapBuilderState

logger = logging.getLogger(__name__)


class MapBuilderService:
    def __init__(
        self,
        settings: Settings,
        job_repo: MapJobRepository,
        event_repo: WorkflowEventRepository,
    ):
        self._settings = settings
        self._jobs = job_repo
        self._events = event_repo

    # ── Job creation ──────────────────────────────────────────────────────

    async def create_job(
        self,
        admin_id: str,
        trekking_place_id: str,
        place_name: str,
        publish_target_type: str,
        publish_target_id: str,
        bbox: dict[str, float],
        min_zoom: int,
        max_zoom: int,
    ) -> dict[str, Any]:
        """Create job record and launch pipeline as background task. Returns 202."""
        job_id = new_map_job_id()
        map_job_id = new_uuid()
        place_slug = slugify(place_name)
        now = utcnow()

        # Determine version: check existing published jobs for this place
        current_version = await self._latest_version(trekking_place_id)
        map_version = current_version + 1

        doc: dict[str, Any] = {
            "mapJobId": map_job_id,
            "jobId": job_id,
            "adminId": admin_id,
            "trekkingPlaceId": trekking_place_id,
            "trekkingRouteId": None,
            "placeName": place_name,
            "publishTarget": {
                "type": publish_target_type,
                "targetId": publish_target_id,
            },
            "input": {
                "bbox": bbox,
                "minZoom": min_zoom,
                "maxZoom": max_zoom,
            },
            "status": "QUEUED",
            "progress": {"currentStep": None, "percent": 0, "steps": []},
            "output": None,
            "review": None,
            "publish": None,
            "error": None,
        }
        await self._jobs.create(doc)

        asyncio.create_task(
            self._run_pipeline_bg(
                job_id=job_id,
                trekking_place_id=trekking_place_id,
                place_name=place_name,
                place_slug=place_slug,
                publish_target_type=publish_target_type,
                publish_target_id=publish_target_id,
                bbox=bbox,
                min_zoom=min_zoom,
                max_zoom=max_zoom,
                admin_id=admin_id,
                map_version=map_version,
            ),
            name=f"map-builder-{job_id}",
        )

        logger.info("Map Builder job created: %s for '%s'", job_id, place_name)
        return {"jobId": job_id, "mapJobId": map_job_id, "status": "QUEUED"}

    async def _latest_version(self, trekking_place_id: str) -> int:
        """Find the highest published version for this place to auto-increment."""
        jobs = await self._jobs.find_list(
            trekking_place_id=trekking_place_id, status="PUBLISHED", limit=1
        )
        if not jobs:
            return 0
        latest = jobs[0]
        meta = (latest.get("output") or {}).get("metadata") or {}
        return int(meta.get("version", 0))

    async def _run_pipeline_bg(
        self,
        job_id: str,
        trekking_place_id: str,
        place_name: str,
        place_slug: str,
        publish_target_type: str,
        publish_target_id: str,
        bbox: dict[str, float],
        min_zoom: int,
        max_zoom: int,
        admin_id: str,
        map_version: int,
    ) -> None:
        state = MapBuilderState(
            job_id=job_id,
            trekking_place_id=trekking_place_id,
            place_name=place_name,
            place_slug=place_slug,
            publish_target_type=publish_target_type,
            publish_target_id=publish_target_id,
            bbox_min_lon=bbox["minLon"],
            bbox_min_lat=bbox["minLat"],
            bbox_max_lon=bbox["maxLon"],
            bbox_max_lat=bbox["maxLat"],
            min_zoom=min_zoom,
            max_zoom=max_zoom,
            admin_id=admin_id,
            map_version=map_version,
        )
        try:
            await run_map_builder_pipeline(
                state=state,
                settings=self._settings,
                job_repo=self._jobs,
                event_repo=self._events,
            )
        except Exception as exc:
            logger.exception("Map Builder pipeline crashed job=%s: %s", job_id, exc)
            await self._jobs.update(job_id, {
                "status": "FAILED",
                "error": {"message": str(exc)},
            })

    # ── Queries ───────────────────────────────────────────────────────────

    async def get_job(self, job_id: str) -> Optional[dict[str, Any]]:
        return await self._jobs.find_by_job_id(job_id)

    async def list_jobs(
        self,
        admin_id: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
    ) -> dict[str, Any]:
        skip = (page - 1) * limit
        items = await self._jobs.find_list(
            admin_id=admin_id, status=status, skip=skip, limit=limit
        )
        total = await self._jobs.count(admin_id=admin_id, status=status)
        return {"items": items, "total": total, "page": page, "limit": limit}

    # ── Artifact download ─────────────────────────────────────────────────

    async def get_artifact_path(self, job_id: str, admin_id: str) -> Optional[Path]:
        """
        Return the temp file path for streaming to Admin.
        Available for completed builds during review/publish while the ZIP is retained.
        Never exposes arbitrary filesystem paths.
        """
        job = await self._jobs.find_by_job_id(job_id)
        if not job:
            return None
        if job["adminId"] != admin_id:
            return None
        if job["status"] not in {"PENDING_REVIEW", "APPROVED", "PUBLISHING", "UPLOAD_R2", "PUBLISHED"}:
            return None

        output = job.get("output") or {}
        temp_path_str = output.get("tempPath")
        if not temp_path_str:
            return None

        temp_path = Path(temp_path_str)

        # Security: ensure path is within MAP_WORK_ROOT
        allowed_root = Path(self._settings.map_work_root)
        try:
            temp_path.resolve().relative_to(allowed_root.resolve())
        except ValueError:
            logger.error("Path traversal attempt in get_artifact_path: %s", temp_path)
            return None

        if not temp_path.is_file():
            return None
        return temp_path

    # ── Approve ───────────────────────────────────────────────────────────

    async def approve(self, job_id: str, admin_id: str, note: Optional[str] = None) -> dict[str, Any]:
        """
        State machine: PENDING_REVIEW → APPROVED → PUBLISHING → UPLOAD_R2 →
                       UPDATE_PRODUCTION_OFFLINE_MAP → PUBLISHED

        Cho phép retry nếu job đang stuck ở UPLOAD_R2
        (R2 đã upload xong nhưng trekking-service chưa update được).
        """
        job = await self._jobs.find_by_job_id(job_id)
        if not job:
            raise ValueError(f"Job {job_id} not found")
        if job["adminId"] != admin_id:
            raise ValueError("Forbidden")

        current_status = job["status"]

        if current_status in ("PENDING_REVIEW", "UPLOAD_R2"):
            await self._validate_publish_artifact(job)

        # Cho phép retry từ UPLOAD_R2 (R2 ok nhưng production update failed trước đó)
        if current_status == "UPLOAD_R2":
            logger.info("Job %s stuck at UPLOAD_R2 — retrying production update", job_id)
            asyncio.create_task(
                self._publish_bg(job_id=job_id, job=job),
                name=f"map-publish-retry-{job_id}",
            )
            return {"jobId": job_id, "status": "PUBLISHING"}

        if current_status != "PENDING_REVIEW":
            raise ValueError(
                f"Cannot approve job in status '{current_status}'. Must be PENDING_REVIEW."
            )

        now = utcnow()
        await self._jobs.update(job_id, {
            "status": "APPROVED",
            "review": {
                "reviewedBy": admin_id,
                "reviewedAt": now.isoformat(),
                "note": note,
            },
            "publish": {"approved": True},
        })
        await self._events.log(
            job_id=job_id, workflow_type="MAP_BUILDER", event="APPROVED",
            level="INFO", message=f"Map approved by {admin_id}"
        )

        # Launch publish flow as background task
        asyncio.create_task(
            self._publish_bg(job_id=job_id, job=job),
            name=f"map-publish-{job_id}",
        )

        return {"jobId": job_id, "status": "PUBLISHING"}

    async def _validate_publish_artifact(self, job: dict) -> None:
        """Revalidate legacy jobs too; an old empty ZIP must never reach R2."""
        from .steps.validate_output import validate_output
        output = job.get("output") or {}
        meta = output.get("metadata") or {}
        if meta.get("mock"):
            raise ValueError("Mock map packages cannot be approved for publication")
        path = Path(output.get("tempPath") or "")
        try:
            path.resolve().relative_to(Path(self._settings.map_work_root).resolve())
        except ValueError:
            raise ValueError("Map artifact is outside MAP_WORK_ROOT")
        bounds = meta.get("bounds") or (job.get("input") or {}).get("bbox") or {}
        state = MapBuilderState(
            job_id=job["jobId"], trekking_place_id=job.get("trekkingPlaceId", ""),
            place_name=job.get("placeName", ""), place_slug=slugify(job.get("placeName", "")),
            publish_target_type="PLACE", publish_target_id="", admin_id=job["adminId"],
            bbox_min_lon=bounds["minLon"], bbox_min_lat=bounds["minLat"],
            bbox_max_lon=bounds["maxLon"], bbox_max_lat=bounds["maxLat"],
            min_zoom=meta.get("minZoom", 10), max_zoom=meta.get("maxZoom", 14),
            map_version=meta.get("version", 1), zip_path=path, zip_sha256=output.get("sha256"),
        )
        await validate_output(state)
        if state.final_status == "FAILED":
            raise ValueError("Cannot publish incomplete offline map: " + "; ".join(state.errors))

    async def _publish_bg(self, job_id: str, job: dict) -> None:
        """Upload to R2 then update production DB."""
        await self._jobs.set_status(job_id, "PUBLISHING")
        await self._events.log(
            job_id=job_id, workflow_type="MAP_BUILDER",
            event="PUBLISHING_START", level="INFO", message="Starting R2 upload"
        )

        output = job.get("output") or {}
        temp_path_str = output.get("tempPath")
        file_name = output.get("fileName", "")
        sha256_hex = output.get("sha256")
        size_bytes = output.get("fileSizeBytes")
        meta = output.get("metadata") or {}

        place_name = job.get("placeName", "")
        place_slug = slugify(place_name)
        map_version = meta.get("version", 1)
        publish_target = job.get("publishTarget") or {}

        # ── Upload to R2 ──────────────────────────────────────────────────
        try:
            r2 = R2Client(self._settings)
            object_key = r2.build_object_key(place_slug, map_version, file_name)

            # Idempotency: if already uploaded, skip re-upload
            already_uploaded = False
            existing_publish = job.get("publish") or {}
            existing_r2 = existing_publish.get("r2") or {}
            if existing_r2.get("uploaded") and existing_r2.get("objectKey") == object_key:
                already_uploaded = True
                logger.info("R2 already uploaded for job %s — skipping re-upload", job_id)

            if not already_uploaded:
                # Run synchronous boto3 upload in thread pool
                loop = asyncio.get_event_loop()
                r2_result = await loop.run_in_executor(
                    None,
                    lambda: r2.upload_file(
                        local_path=temp_path_str,
                        object_key=object_key,
                        content_type="application/zip",
                        sha256_hex=sha256_hex,
                    ),
                )

                await self._jobs.update(job_id, {
                    "status": "UPLOAD_R2",
                    "publish.r2": {
                        "uploaded": True,
                        "bucket": r2_result["bucket"],
                        "objectKey": object_key,
                        "uploadedAt": r2_result["uploadedAt"],
                    },
                })
                await self._events.log(
                    job_id=job_id, workflow_type="MAP_BUILDER",
                    event="R2_UPLOADED", level="INFO",
                    message=f"Uploaded to R2: {object_key}"
                )
            else:
                object_key = existing_r2["objectKey"]

        except Exception as exc:
            logger.error("R2 upload failed for job %s: %s", job_id, exc)
            await self._jobs.update(job_id, {
                "status": "FAILED",
                "error": {"message": f"R2 upload failed: {exc}", "stage": "UPLOAD_R2"},
                "publish.r2.uploaded": False,
            })
            await self._events.log(
                job_id=job_id, workflow_type="MAP_BUILDER",
                event="R2_FAILED", level="ERROR", message=str(exc)
            )
            return

        # ── Update production trekking-service ────────────────────────────
        try:
            target_type = publish_target.get("type", "PLACE")
            target_id = publish_target.get("targetId", "").strip()

            # Nếu không có targetId → skip update production, vẫn PUBLISHED
            # (bản đồ đã có trên R2, admin có thể gán thủ công sau)
            if not target_id:
                logger.warning(
                    "Job %s has empty publishTarget.targetId — skipping production update, "
                    "map is on R2 but NOT linked to any place/route",
                    job_id,
                )
                await self._jobs.update(job_id, {
                    "status": "PUBLISHED",
                    "publish.productionOfflineMap": {
                        "updated": False,
                        "skipped": True,
                        "reason": "publishTarget.targetId was empty — no place/route to update",
                        "updatedAt": utcnow().isoformat(),
                    },
                })
                await self._events.log(
                    job_id=job_id, workflow_type="MAP_BUILDER",
                    event="PUBLISHED_NO_TARGET", level="WARN",
                    message="R2 upload OK but no targetId — skipped production update"
                )
                logger.info("Map Builder job %s PUBLISHED (no target link)", job_id)
                return

            trekking = TrekkingServiceClient(self._settings)
            bounds = meta.get("bounds") or {}

            offline_map_payload = {
                "available": True,
                "version": map_version,
                "objectKey": object_key,          # only key stored, URL built at runtime
                "sizeBytes": size_bytes,
                "checksum": sha256_hex,
                "minZoom": meta.get("minZoom"),
                "maxZoom": meta.get("maxZoom"),
                "bounds": {
                    "minLon": bounds.get("minLon"),
                    "minLat": bounds.get("minLat"),
                    "maxLon": bounds.get("maxLon"),
                    "maxLat": bounds.get("maxLat"),
                },
            }

            target_type = publish_target.get("type", "PLACE")
            target_id = publish_target.get("targetId")

            if target_type == "PLACE":
                await trekking.update_place_offline_map(target_id, offline_map_payload)
            elif target_type == "ROUTE":
                await trekking.update_route_offline_map(target_id, offline_map_payload)
            else:
                raise ValueError(f"Unknown publishTarget.type: {target_type}")

            await self._jobs.update(job_id, {
                "status": "PUBLISHED",
                "publish.productionOfflineMap": {
                    "updated": True,
                    "updatedAt": utcnow().isoformat(),
                    "lastError": None,
                },
            })
            await self._events.log(
                job_id=job_id, workflow_type="MAP_BUILDER",
                event="PUBLISHED", level="INFO",
                message=f"Production offline map updated for {target_type}/{target_id}"
            )
            logger.info("Map Builder job %s PUBLISHED", job_id)

        except Exception as exc:
            logger.error(
                "Production DB update failed for job %s (R2 uploaded, retrying): %s", job_id, exc
            )
            # R2 already uploaded — keep r2.uploaded=True, mark production update as failed
            await self._jobs.update(job_id, {
                "status": "UPLOAD_R2",   # stay at UPLOAD_R2, not FAILED
                "publish.productionOfflineMap": {
                    "updated": False,
                    "lastError": str(exc),
                },
            })
            await self._events.log(
                job_id=job_id, workflow_type="MAP_BUILDER",
                event="PRODUCTION_UPDATE_FAILED", level="ERROR", message=str(exc)
            )

    # ── Reject ────────────────────────────────────────────────────────────

    async def reject(self, job_id: str, admin_id: str, note: Optional[str] = None) -> dict[str, Any]:
        job = await self._jobs.find_by_job_id(job_id)
        if not job:
            raise ValueError(f"Job {job_id} not found")
        if job["adminId"] != admin_id:
            raise ValueError("Forbidden")
        if job["status"] in ("PUBLISHED", "PUBLISHING", "UPLOAD_R2"):
            raise ValueError(f"Cannot reject job in status '{job['status']}'")

        now = utcnow()
        await self._jobs.update(job_id, {
            "status": "REJECTED",
            "review": {
                "reviewedBy": admin_id,
                "reviewedAt": now.isoformat(),
                "note": note,
            },
        })

        # Clean up temp artifact
        output = job.get("output") or {}
        temp_path_str = output.get("tempPath")
        if temp_path_str:
            temp_path = Path(temp_path_str)
            allowed_root = Path(self._settings.map_work_root)
            try:
                temp_path.resolve().relative_to(allowed_root.resolve())
                if temp_path.exists():
                    temp_path.unlink()
                    logger.info("Deleted temp artifact: %s", temp_path)
                # Also clean up the job directory
                job_dir = temp_path.parent
                if job_dir.exists() and job_dir != allowed_root:
                    import shutil
                    shutil.rmtree(job_dir, ignore_errors=True)
            except ValueError:
                logger.error("Suspicious temp path during reject cleanup: %s", temp_path_str)

        await self._events.log(
            job_id=job_id, workflow_type="MAP_BUILDER",
            event="REJECTED", level="INFO",
            message=f"Map rejected by {admin_id} — temp artifact deleted"
        )
        return {"jobId": job_id, "status": "REJECTED"}
