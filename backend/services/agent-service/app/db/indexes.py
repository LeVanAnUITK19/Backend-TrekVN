"""
Idempotent index creation for all agent-service collections.
Called once on service startup after DB connection is established.
"""

from __future__ import annotations

import logging

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING, IndexModel

logger = logging.getLogger(__name__)


async def create_indexes(db: AsyncIOMotorDatabase) -> None:
    logger.info("Creating Agent DB indexes …")

    # ── conversations ─────────────────────────────────────────────────────
    await db["conversations"].create_indexes([
        IndexModel([("adminId", ASCENDING)]),
        IndexModel([("status", ASCENDING)]),
        IndexModel([("adminId", ASCENDING), ("updatedAt", DESCENDING)]),
        IndexModel([("status", ASCENDING), ("updatedAt", DESCENDING)]),
    ])

    # ── messages ──────────────────────────────────────────────────────────
    await db["messages"].create_indexes([
        IndexModel([("conversationId", ASCENDING)]),
        IndexModel([("adminId", ASCENDING)]),
        IndexModel([("conversationId", ASCENDING), ("createdAt", ASCENDING)]),
        IndexModel([("adminId", ASCENDING), ("createdAt", DESCENDING)]),
    ])

    # ── agent_runs ────────────────────────────────────────────────────────
    await db["agent_runs"].create_indexes([
        IndexModel([("runType", ASCENDING)]),
        IndexModel([("adminId", ASCENDING)]),
        IndexModel([("status", ASCENDING)]),
        IndexModel([("workflowId", ASCENDING)]),
        IndexModel([("createdAt", DESCENDING)]),
        IndexModel([("runType", ASCENDING), ("createdAt", DESCENDING)]),
        IndexModel([("adminId", ASCENDING), ("createdAt", DESCENDING)]),
        # TTL index — documents expire after expiresAt
        IndexModel([("expiresAt", ASCENDING)], expireAfterSeconds=0, sparse=True),
    ])

    # ── place_candidates ──────────────────────────────────────────────────
    await db["place_candidates"].create_indexes([
        IndexModel([("jobId", ASCENDING)], unique=True),
        IndexModel([("adminId", ASCENDING)]),
        IndexModel([("targetPlaceId", ASCENDING)], sparse=True),
        IndexModel([("status", ASCENDING)]),
        IndexModel([("createdAt", DESCENDING)]),
        IndexModel([("status", ASCENDING), ("createdAt", DESCENDING)]),
        IndexModel([("adminId", ASCENDING), ("createdAt", DESCENDING)]),
    ])

    # ── map_jobs ──────────────────────────────────────────────────────────
    await db["map_jobs"].create_indexes([
        IndexModel([("jobId", ASCENDING)], unique=True),
        IndexModel([("adminId", ASCENDING)]),
        IndexModel([("trekkingPlaceId", ASCENDING)]),
        IndexModel([("trekkingRouteId", ASCENDING)], sparse=True),
        IndexModel([("status", ASCENDING)]),
        IndexModel([("createdAt", DESCENDING)]),
        IndexModel([("trekkingPlaceId", ASCENDING), ("createdAt", DESCENDING)]),
        IndexModel([("trekkingRouteId", ASCENDING), ("createdAt", DESCENDING)], sparse=True),
        IndexModel([("status", ASCENDING), ("createdAt", DESCENDING)]),
        IndexModel([("adminId", ASCENDING), ("createdAt", DESCENDING)]),
    ])

    # ── workflow_events ───────────────────────────────────────────────────
    await db["workflow_events"].create_indexes([
        IndexModel([("jobId", ASCENDING)]),
        IndexModel([("workflowType", ASCENDING)]),
        IndexModel([("level", ASCENDING)]),
        IndexModel([("createdAt", DESCENDING)]),
        IndexModel([("jobId", ASCENDING), ("createdAt", ASCENDING)]),
        IndexModel([("workflowType", ASCENDING), ("createdAt", DESCENDING)]),
        # TTL index
        IndexModel([("expiresAt", ASCENDING)], expireAfterSeconds=0, sparse=True),
    ])

    await db["pending_approvals"].create_indexes([
        IndexModel([("approvalId", ASCENDING)], unique=True),
        IndexModel([("conversationId", ASCENDING), ("status", ASCENDING), ("createdAt", DESCENDING)]),
        IndexModel([("adminId", ASCENDING), ("createdAt", DESCENDING)]),
        IndexModel([("expiresAt", ASCENDING)], expireAfterSeconds=0, sparse=True),
    ])

    logger.info("Agent DB indexes created/verified")
