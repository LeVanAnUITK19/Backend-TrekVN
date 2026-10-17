"""Repository for agent_runs collection."""

from __future__ import annotations

from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.utils.serialize import sanitize_doc
from app.utils.time import utcnow
from .task_history import TaskHistoryRepositoryMixin


class AgentRunRepository(TaskHistoryRepositoryMixin):
    def __init__(self, db: AsyncIOMotorDatabase):
        self._col = db["agent_runs"]

    async def create(self, doc: dict[str, Any]) -> dict:
        doc.setdefault("createdAt", utcnow())
        await self._col.insert_one(doc)
        return sanitize_doc(doc)  # type: ignore[return-value]

    async def find_by_id(self, run_id: str) -> Optional[dict]:
        return sanitize_doc(await self._col.find_one({"agentRunId": run_id}))

    async def update(self, run_id: str, data: dict[str, Any]) -> Optional[dict]:
        return sanitize_doc(await self._col.find_one_and_update(
            {"agentRunId": run_id},
            {"$set": data},
            return_document=True,
        ))

    async def finish(
        self,
        run_id: str,
        status: str,
        error: Optional[dict] = None,
        usage: Optional[dict] = None,
        tool_summary: Optional[list] = None,
    ) -> None:
        from datetime import datetime, timezone
        
        now = utcnow()
        run = await self.find_by_id(run_id)
        duration_ms: Optional[int] = None
        if run and run.get("startedAt"):
            started = run["startedAt"]
            # Handle both datetime and string (ISO format from DB)
            if isinstance(started, str):
                # Parse ISO format string (handle both with/without 'Z' or timezone)
                started_str = started.replace('Z', '+00:00')
                started = datetime.fromisoformat(started_str)
            
            # Ensure both datetime objects have timezone info
            if started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)
            if now.tzinfo is None:
                now = now.replace(tzinfo=timezone.utc)
                
            duration_ms = int((now - started).total_seconds() * 1000)

        update: dict[str, Any] = {
            "status": status,
            "finishedAt": now,
        }
        if duration_ms is not None:
            update["durationMs"] = duration_ms
        if error:
            update["error"] = error
        if usage:
            update["usage"] = usage
        if tool_summary:
            update["toolSummary"] = tool_summary

        await self._col.update_one({"agentRunId": run_id}, {"$set": update})
