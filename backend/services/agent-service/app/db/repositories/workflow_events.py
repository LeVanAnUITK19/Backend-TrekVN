"""Repository for workflow_events collection."""

from __future__ import annotations

from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.utils.time import hours_from_now, utcnow


class WorkflowEventRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self._col = db["workflow_events"]

    async def log(
        self,
        job_id: str,
        workflow_type: str,
        event: str,
        level: str,
        message: Optional[str] = None,
        metadata: Optional[dict] = None,
        ttl_hours: int = 90,
    ) -> dict:
        doc: dict[str, Any] = {
            "workflowEventId": __import__("app.utils.ids", fromlist=["new_uuid"]).new_uuid(),
            "jobId": job_id,
            "workflowType": workflow_type,
            "event": event,
            "level": level,
            "message": message,
            "createdAt": utcnow(),
            "expiresAt": hours_from_now(ttl_hours * 24),
        }
        if metadata:
            # Only include safe, small metadata
            doc["metadata"] = metadata
        await self._col.insert_one(doc)
        return doc

    async def find_by_job(
        self, job_id: str, limit: int = 100
    ) -> list[dict]:
        cursor = (
            self._col.find({"jobId": job_id})
            .sort("createdAt", 1)
            .limit(limit)
        )
        return await cursor.to_list(length=limit)

    async def find_by_job_id(
        self, job_id: str, limit: int = 100
    ) -> list[dict]:
        """Alias for find_by_job — used by tasks API."""
        return await self.find_by_job(job_id, limit=limit)
