"""Repository for messages collection."""

from __future__ import annotations

from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.utils.serialize import sanitize_doc, sanitize_docs
from app.utils.time import utcnow


class MessageRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self._col = db["messages"]

    async def create(self, doc: dict[str, Any]) -> dict:
        doc.setdefault("createdAt", utcnow())
        await self._col.insert_one(doc)
        return sanitize_doc(doc)  # type: ignore[return-value]

    async def find_by_id(self, message_id: str) -> Optional[dict]:
        doc = await self._col.find_one({"messageId": message_id})
        return sanitize_doc(doc)

    async def find_by_conversation(
        self,
        conversation_id: str,
        limit: int = 50,
        skip: int = 0,
    ) -> list[dict]:
        cursor = (
            self._col.find({"conversationId": conversation_id})
            .sort("createdAt", 1)
            .skip(skip)
            .limit(limit)
        )
        docs = await cursor.to_list(length=limit)
        return sanitize_docs(docs)

    async def find_recent_for_context(
        self,
        conversation_id: str,
        max_messages: int = 20,
    ) -> list[dict]:
        """
        Return the most recent *max_messages* for LLM context building.
        Sorted ascending (oldest first) for correct prompt ordering.
        """
        cursor = (
            self._col.find(
                {"conversationId": conversation_id, "role": {"$ne": "SYSTEM"}}
            )
            .sort("createdAt", -1)
            .limit(max_messages)
        )
        docs = await cursor.to_list(length=max_messages)
        return sanitize_docs(list(reversed(docs)))

    async def delete_by_conversation(self, conversation_id: str) -> int:
        result = await self._col.delete_many({"conversationId": conversation_id})
        return result.deleted_count
