"""Repository for pending_approvals collection.

Stores badge write actions proposed by the agent that are awaiting admin approval.
Each document has a short TTL — if not acted on within 24h it expires automatically.
"""

from __future__ import annotations

from typing import Any, Optional
from datetime import timedelta

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.utils.serialize import sanitize_doc, sanitize_docs
from app.utils.time import utcnow


class PendingApprovalRepository:
    COLLECTION = "pending_approvals"

    def __init__(self, db: AsyncIOMotorDatabase):
        self._col = db[self.COLLECTION]

    async def create(self, doc: dict[str, Any]) -> dict:
        """Persist a new pending approval."""
        now = utcnow()
        doc.setdefault("createdAt", now)
        doc.setdefault("updatedAt", now)
        doc.setdefault("status", "PENDING")  # PENDING | APPROVED | REJECTED | EXPIRED
        doc.setdefault("expiresAt", now + timedelta(hours=24))
        await self._col.insert_one(doc)
        return sanitize_doc(doc)  # type: ignore[return-value]

    async def find_by_id(self, approval_id: str) -> Optional[dict]:
        doc = await self._col.find_one({"approvalId": approval_id})
        return sanitize_doc(doc)

    async def claim(self, approval_id: str, admin_id: str, conversation_id: str, status: str) -> Optional[dict]:
        """Atomically consume a pending, unexpired approval owned by this admin."""
        now = utcnow()
        doc = await self._col.find_one_and_update(
            {"approvalId": approval_id, "adminId": admin_id, "conversationId": conversation_id,
             "status": "PENDING", "$or": [{"expiresAt": {"$gt": now}}, {"expiresAt": {"$exists": False}}]},
            {"$set": {"status": status, "updatedAt": now}},
            return_document=True,
        )
        return sanitize_doc(doc)

    async def find_pending_by_conversation(self, conversation_id: str) -> list[dict]:
        """Return all PENDING approvals for a conversation, newest first."""
        cursor = self._col.find(
            {"conversationId": conversation_id, "status": "PENDING"}
        ).sort("createdAt", -1)
        docs = await cursor.to_list(length=50)
        return sanitize_docs(docs)

    async def update_status(
        self,
        approval_id: str,
        status: str,
        result: Optional[dict] = None,
    ) -> Optional[dict]:
        """Mark approval as APPROVED or REJECTED with optional result."""
        update: dict[str, Any] = {"status": status, "updatedAt": utcnow()}
        if result is not None:
            update["executionResult"] = result
        doc = await self._col.find_one_and_update(
            {"approvalId": approval_id},
            {"$set": update},
            return_document=True,
        )
        return sanitize_doc(doc)

    async def find_by_admin(
        self,
        admin_id: str,
        status: Optional[str] = None,
        limit: int = 20,
    ) -> list[dict]:
        q: dict = {"adminId": admin_id}
        if status:
            q["status"] = status
        cursor = self._col.find(q).sort("createdAt", -1).limit(limit)
        docs = await cursor.to_list(length=limit)
        return sanitize_docs(docs)
