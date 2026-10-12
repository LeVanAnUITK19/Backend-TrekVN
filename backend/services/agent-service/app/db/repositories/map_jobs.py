"""Repository for map_jobs collection."""

from __future__ import annotations

from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.utils.serialize import sanitize_doc, sanitize_docs
from app.utils.time import utcnow
from .task_history import TaskHistoryRepositoryMixin


class MapJobRepository(TaskHistoryRepositoryMixin):
    def __init__(self, db: AsyncIOMotorDatabase):
        self._col = db["map_jobs"]

    async def create(self, doc: dict[str, Any]) -> dict:
        now = utcnow()
        doc.setdefault("createdAt", now)
        doc.setdefault("updatedAt", now)
        await self._col.insert_one(doc)
        return sanitize_doc(doc)  # type: ignore[return-value]

    async def find_by_id(self, map_job_id: str) -> Optional[dict]:
        return sanitize_doc(await self._col.find_one({"mapJobId": map_job_id}))

    async def find_by_job_id(self, job_id: str) -> Optional[dict]:
        return sanitize_doc(await self._col.find_one({"jobId": job_id}))

    async def find_list(
        self,
        admin_id: Optional[str] = None,
        status: Optional[str] = None,
        trekking_place_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 20,
    ) -> list[dict]:
        q: dict = {}
        if admin_id:
            q["adminId"] = admin_id
        if status:
            q["status"] = status
        if trekking_place_id:
            q["trekkingPlaceId"] = trekking_place_id
        cursor = self._col.find(q).sort("createdAt", -1).skip(skip).limit(limit)
        return sanitize_docs(await cursor.to_list(length=limit))

    async def count(
        self,
        admin_id: Optional[str] = None,
        status: Optional[str] = None,
    ) -> int:
        q: dict = {}
        if admin_id:
            q["adminId"] = admin_id
        if status:
            q["status"] = status
        return await self._col.count_documents(q)

    async def update(self, job_id: str, data: dict[str, Any]) -> Optional[dict]:
        data["updatedAt"] = utcnow()
        return sanitize_doc(await self._col.find_one_and_update(
            {"jobId": job_id},
            {"$set": data},
            return_document=True,
        ))

    async def set_progress(self, job_id: str, progress: dict) -> None:
        await self._col.update_one(
            {"jobId": job_id},
            {"$set": {"progress": progress, "updatedAt": utcnow()}},
        )

    async def set_status(self, job_id: str, status: str) -> None:
        await self._col.update_one(
            {"jobId": job_id},
            {"$set": {"status": status, "updatedAt": utcnow()}},
        )
