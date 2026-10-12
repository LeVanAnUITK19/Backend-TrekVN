"""
Place Builder Service — orchestrates job lifecycle and approval/reject.

Responsibilities:
- Create job record
- Launch pipeline as background task
- Handle approve (→ production write) and reject
- Never writes to production without explicit approve call
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from app.config import Settings
from app.db.repositories.place_candidates import PlaceCandidateRepository
from app.db.repositories.workflow_events import WorkflowEventRepository
from app.tools.trekking_service import TrekkingServiceClient
from app.utils.ids import new_place_job_id, new_uuid
from app.utils.time import utcnow

from .graph import run_place_builder_pipeline
from .state import PlaceBuilderState

logger = logging.getLogger(__name__)


class PlaceBuilderService:
    def __init__(
        self,
        settings: Settings,
        candidate_repo: PlaceCandidateRepository,
        event_repo: WorkflowEventRepository,
    ):
        self._settings = settings
        self._candidates = candidate_repo
        self._events = event_repo

    # ── Job creation ──────────────────────────────────────────────────────

    async def create_job(
        self,
        admin_id: str,
        place_name: str,
        location_hint: Optional[str],
        operation: str,
        target_place_id: Optional[str],
    ) -> dict[str, Any]:
        """
        Create a place_candidates record and kick off the pipeline
        as a background asyncio task.

        Returns 202 job info immediately.
        """
        job_id = new_place_job_id()
        candidate_id = new_uuid()
        now = utcnow()

        doc: dict[str, Any] = {
            "placeCandidateId": candidate_id,
            "jobId": job_id,
            "adminId": admin_id,
            "operation": operation,
            "targetPlaceId": target_place_id,
            "input": {"placeName": place_name, "locationHint": location_hint},
            "status": "PROCESSING",
            "candidate": None,
            "sources": [],
            "quality": None,
            "duplicateCheck": None,
            "review": None,
            "productionSync": None,
        }
        await self._candidates.create(doc)

        # Fire-and-forget background task
        asyncio.create_task(
            self._run_pipeline_bg(
                job_id=job_id,
                place_name=place_name,
                location_hint=location_hint,
                operation=operation,
                target_place_id=target_place_id,
                admin_id=admin_id,
            ),
            name=f"place-builder-{job_id}",
        )

        logger.info("Place Builder job created: %s for '%s'", job_id, place_name)
        return {"jobId": job_id, "candidateId": candidate_id, "status": "PROCESSING"}

    async def _run_pipeline_bg(
        self,
        job_id: str,
        place_name: str,
        location_hint: Optional[str],
        operation: str,
        target_place_id: Optional[str],
        admin_id: str,
    ) -> None:
        """Run the pipeline in background — catch all exceptions."""
        state = PlaceBuilderState(
            job_id=job_id,
            place_name=place_name,
            location_hint=location_hint,
            operation=operation,
            target_place_id=target_place_id,
            admin_id=admin_id,
        )
        try:
            await run_place_builder_pipeline(
                state=state,
                settings=self._settings,
                candidate_repo=self._candidates,
                event_repo=self._events,
            )
        except Exception as exc:
            logger.exception("Place Builder pipeline crashed for job %s: %s", job_id, exc)
            await self._candidates.update_by_job_id(
                job_id,
                {"status": "FAILED", "quality": {"warnings": [str(exc)]}},
            )

    # ── Queries ───────────────────────────────────────────────────────────

    async def get_job(self, job_id: str) -> Optional[dict[str, Any]]:
        return await self._candidates.find_by_job_id(job_id)

    async def get_candidate(self, candidate_id: str) -> Optional[dict[str, Any]]:
        return await self._candidates.find_by_id(candidate_id)

    async def list_candidates(
        self,
        admin_id: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
    ) -> dict[str, Any]:
        skip = (page - 1) * limit
        items = await self._candidates.find_list(admin_id=admin_id, status=status, skip=skip, limit=limit)
        total = await self._candidates.count(admin_id=admin_id, status=status)
        return {"items": items, "total": total, "page": page, "limit": limit}

    async def update_candidate(
        self, candidate_id: str, admin_id: str, data: dict[str, Any]
    ) -> Optional[dict[str, Any]]:
        """Admin manual edit of candidate before approval."""
        candidate = await self._candidates.find_by_id(candidate_id)
        if not candidate or candidate["adminId"] != admin_id:
            return None
        if candidate["status"] not in ("PENDING_REVIEW", "NEEDS_FIX"):
            raise ValueError(f"Cannot edit candidate in status: {candidate['status']}")
        # Only allow editing the candidate field and status
        allowed_updates: dict[str, Any] = {}
        if "candidate" in data:
            allowed_updates["candidate"] = data["candidate"]
        if "status" in data and data["status"] in ("PENDING_REVIEW", "NEEDS_FIX"):
            allowed_updates["status"] = data["status"]
        return await self._candidates.update(candidate_id, allowed_updates)

    # ── Approve ───────────────────────────────────────────────────────────

    async def approve(
        self, candidate_id: str, admin_id: str, note: Optional[str] = None
    ) -> dict[str, Any]:
        """
        Approve a candidate — triggers production write via trekking-service API.

        Flow:
          load → validate status=PENDING_REVIEW → resolve provinceId check →
          call trekking-service (CREATE or UPDATE) → mark APPROVED
        """
        candidate = await self._candidates.find_by_id(candidate_id)
        if not candidate:
            raise ValueError(f"Candidate {candidate_id} not found")
        if candidate["adminId"] != admin_id:
            raise ValueError("Forbidden: candidate belongs to a different admin")

        if candidate["status"] != "PENDING_REVIEW":
            raise ValueError(
                f"Cannot approve candidate in status '{candidate['status']}'. "
                "Must be PENDING_REVIEW."
            )

        # Re-validate before approving
        payload = (candidate.get("candidate") or {}).get("productionPayload", {})
        if not payload.get("provinceId"):
            raise ValueError(
                "Cannot approve: provinceId is not resolved. "
                "Please update the candidate with a valid provinceId first."
            )
        if not payload.get("name"):
            raise ValueError("Cannot approve: candidate has no name")

        operation = candidate["operation"]
        target_place_id = candidate.get("targetPlaceId")

        trekking = TrekkingServiceClient(self._settings)

        # Set lastVerifiedAt at approval time
        payload["lastVerifiedAt"] = utcnow().isoformat()

        # ── Prepare production payload ────────────────────────────────────
        # Build a clean copy — only send fields trekking-service schema accepts.
        # images: agent stores [{url, caption, source}] objects; trekking-service
        #         stores plain URL strings → convert.
        production_payload = _build_production_payload(payload)

        production_place_id: Optional[str] = None
        try:
            if operation == "CREATE":
                result = await trekking.create_place(production_payload)
                production_place_id = result.get("trekkingPlaceId")
            elif operation == "UPDATE":
                if not target_place_id:
                    raise ValueError("UPDATE requires targetPlaceId")
                result = await trekking.update_place(target_place_id, production_payload)
                production_place_id = result.get("trekkingPlaceId") or target_place_id
            else:
                raise ValueError(f"Unknown operation: {operation}")
        except Exception as exc:
            # Production API failed — do NOT mark as APPROVED, allow retry
            logger.error("Approve failed (production API): %s", exc)
            await self._candidates.update(
                candidate_id,
                {
                    "productionSync": {
                        "synced": False,
                        "lastError": str(exc),
                        "syncedAt": None,
                    },
                    "review": {
                        "reviewedBy": admin_id,
                        "reviewedAt": utcnow().isoformat(),
                        "note": note,
                    },
                },
            )
            raise RuntimeError(
                f"Production API call failed — candidate NOT approved. Retry when service is available. Error: {exc}"
            )

        # Success
        now = utcnow()
        await self._candidates.update(
            candidate_id,
            {
                "status": "APPROVED",
                "review": {
                    "reviewedBy": admin_id,
                    "reviewedAt": now.isoformat(),
                    "note": note,
                },
                "productionSync": {
                    "synced": True,
                    "productionPlaceId": production_place_id,
                    "syncedAt": now.isoformat(),
                    "lastError": None,
                },
            },
        )

        await self._events.log(
            job_id=candidate["jobId"],
            workflow_type="PLACE_BUILDER",
            event="APPROVED",
            level="INFO",
            message=f"Candidate approved by {admin_id} → production place {production_place_id}",
        )

        logger.info(
            "Candidate %s approved → production place %s", candidate_id, production_place_id
        )
        return {"candidateId": candidate_id, "productionPlaceId": production_place_id, "status": "APPROVED"}

    # ── Reject ────────────────────────────────────────────────────────────

    async def reject(
        self, candidate_id: str, admin_id: str, note: Optional[str] = None
    ) -> dict[str, Any]:
        candidate = await self._candidates.find_by_id(candidate_id)
        if not candidate:
            raise ValueError(f"Candidate {candidate_id} not found")
        if candidate["adminId"] != admin_id:
            raise ValueError("Forbidden")

        if candidate["status"] in ("APPROVED",):
            raise ValueError("Cannot reject an already-approved candidate")

        now = utcnow()
        await self._candidates.update(
            candidate_id,
            {
                "status": "REJECTED",
                "review": {
                    "reviewedBy": admin_id,
                    "reviewedAt": now.isoformat(),
                    "note": note,
                },
            },
        )
        await self._events.log(
            job_id=candidate["jobId"],
            workflow_type="PLACE_BUILDER",
            event="REJECTED",
            level="INFO",
            message=f"Candidate rejected by {admin_id}",
        )
        return {"candidateId": candidate_id, "status": "REJECTED"}

    async def request_revision(
        self,
        candidate_id: str,
        admin_id: str,
        note: str | None = None,
    ) -> dict:
        """
        REQUEST_REVISION — yêu cầu chỉnh sửa lại candidate.
        Trạng thái → NEEDS_FIX.
        """
        candidate = await self._candidates.find_by_id(candidate_id)
        if not candidate:
            raise ValueError(f"Candidate {candidate_id} không tồn tại")
        if candidate["status"] not in ("PENDING_REVIEW", "NEEDS_FIX"):
            raise ValueError(f"Candidate ở trạng thái {candidate['status']} không thể yêu cầu chỉnh sửa")

        from app.utils.time import utcnow
        now = utcnow()
        await self._candidates.update(
            candidate_id,
            {
                "status": "NEEDS_FIX",
                "review": {
                    "reviewedBy": admin_id,
                    "reviewedAt": now.isoformat(),
                    "note": note,
                },
            },
        )
        await self._events.log(
            job_id=candidate["jobId"],
            workflow_type="PLACE_BUILDER",
            event="NEEDS_FIX",
            level="INFO",
            message=f"Candidate revision requested by {admin_id}: {note}",
        )
        return {"candidateId": candidate_id, "status": "NEEDS_FIX"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_production_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Build a clean payload to send to trekking-service.

    Transformations:
    - images: [{url, caption, source}] → ["url1", "url2"] (plain URL strings)
    - imageMapUrl: pass through if present (admin-uploaded)
    - Remove agent-internal fields not in trekking_places schema
      (provinceName, enrichment hints, etc.)
    - Only include fields trekking-service POST/PUT accepts
    """
    # ── images: convert object array → URL string array ───────────────────
    raw_images = payload.get("images") or []
    image_urls: list[str] = []
    for img in raw_images:
        if isinstance(img, dict):
            url = img.get("url")
            if url:
                image_urls.append(url)
        elif isinstance(img, str) and img:
            image_urls.append(img)

    # ── Build clean payload ───────────────────────────────────────────────
    clean: dict[str, Any] = {
        "name": payload.get("name"),
        "slug": payload.get("slug"),
        "provinceId": payload.get("provinceId"),
        "address": payload.get("address"),
        "location": payload.get("location"),
        "description": payload.get("description"),
        "difficulty": payload.get("difficulty"),
        "averageDurationMinutes": payload.get("averageDurationMinutes"),
        "elevationMeters": payload.get("elevationMeters"),
        "images": image_urls,
        "imageMapUrl": payload.get("imageMapUrl"),   # admin-set; None is fine
        "tags": payload.get("tags") or [],
        "dataOrigin": payload.get("dataOrigin", "AI_AGENT"),
        "externalRefs": payload.get("externalRefs"),
        "lastVerifiedAt": payload.get("lastVerifiedAt"),
        "status": payload.get("status", "ACTIVE"),
    }

    # Strip None values to avoid overwriting existing data on UPDATE
    return {k: v for k, v in clean.items() if v is not None}
