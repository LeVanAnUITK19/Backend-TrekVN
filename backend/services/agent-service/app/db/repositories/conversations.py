"""Repository for conversations collection."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.utils.serialize import sanitize_doc, sanitize_docs
from app.utils.time import utcnow


class ConversationRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self._col = db["conversations"]

    async def create(self, doc: dict[str, Any]) -> dict:
        now = utcnow()
        doc.setdefault("messageCount", 0)
        doc.setdefault("status", "ACTIVE")
        doc.setdefault("createdAt", now)
        doc.setdefault("updatedAt", now)
        await self._col.insert_one(doc)
        return sanitize_doc(doc)  # type: ignore[return-value]

    async def find_by_id(self, conversation_id: str) -> Optional[dict]:
        doc = await self._col.find_one({"conversationId": conversation_id})
        return sanitize_doc(doc)

    async def find_by_admin(
        self,
        admin_id: str,
        status: Optional[str] = None,
        skip: int = 0,
        limit: int = 20,
    ) -> list[dict]:
        q: dict = {"adminId": admin_id}
        if status:
            q["status"] = status
        cursor = self._col.find(q).sort("updatedAt", -1).skip(skip).limit(limit)
        docs = await cursor.to_list(length=limit)
        return sanitize_docs(docs)

    async def count_by_admin(self, admin_id: str, status: Optional[str] = None) -> int:
        q: dict = {"adminId": admin_id}
        if status:
            q["status"] = status
        return await self._col.count_documents(q)

    async def increment_message_count(
        self, conversation_id: str, last_message_at: datetime
    ) -> None:
        await self._col.update_one(
            {"conversationId": conversation_id},
            {
                "$inc": {"messageCount": 1},
                "$set": {"lastMessageAt": last_message_at, "updatedAt": utcnow()},
            },
        )

    async def update(self, conversation_id: str, data: dict[str, Any]) -> Optional[dict]:
        data["updatedAt"] = utcnow()
        doc = await self._col.find_one_and_update(
            {"conversationId": conversation_id},
            {"$set": data},
            return_document=True,
        )
        return sanitize_doc(doc)

    async def delete(self, conversation_id: str) -> bool:
        result = await self._col.delete_one({"conversationId": conversation_id})
        return result.deleted_count > 0
