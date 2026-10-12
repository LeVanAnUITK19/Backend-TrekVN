"""
MongoDB connection manager for the Agent Service.

Uses Motor (async MongoDB driver).
Connects to a SEPARATE database (trekviet_agent) —
NEVER to the production trekking MongoDB.
"""

from __future__ import annotations

import logging
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config import Settings

logger = logging.getLogger(__name__)

_client: Optional[AsyncIOMotorClient] = None
_db: Optional[AsyncIOMotorDatabase] = None


async def connect_db(settings: Settings) -> None:
    """Create Motor client and verify connectivity (fail-fast)."""
    global _client, _db

    logger.info("Connecting to Agent MongoDB …")
    _client = AsyncIOMotorClient(
        settings.agent_mongodb_uri,
        serverSelectionTimeoutMS=5_000,
        connectTimeoutMS=5_000,
    )
    _db = _client[settings.agent_mongodb_db]

    # Fail-fast: ping to confirm connectivity
    try:
        await _client.admin.command("ping")
        logger.info("Agent MongoDB connected: db=%s", settings.agent_mongodb_db)
    except Exception as exc:
        logger.error("Failed to connect to Agent MongoDB: %s", exc)
        raise


async def close_db() -> None:
    """Close Motor client on shutdown."""
    global _client
    if _client:
        _client.close()
        _client = None
        logger.info("Agent MongoDB connection closed")


def get_db() -> AsyncIOMotorDatabase:
    if _db is None:
        raise RuntimeError("Database not initialised. Call connect_db() first.")
    return _db
