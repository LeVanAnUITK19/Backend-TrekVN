"""Shared database filtering for admin task history."""
import re


def task_history_query(*, status=None, search=None, date_from=None, date_to=None, place=False):
    query = {}
    if status:
        query["status"] = {"$in": ["PENDING_REVIEW", "NEEDS_FIX"]} if place and status == "PENDING_REVIEW" else status
    if search:
        fields = ["jobId", "adminId", "placeName"]
        fields += ["placeCandidateId", "input.placeName", "input.locationHint"] if place else ["mapJobId"]
        query["$or"] = [{field: {"$regex": re.escape(search), "$options": "i"}} for field in fields]
    if date_from or date_to:
        # Documents store UTC datetimes; use ISO strings for legacy documents too.
        bounds = {}
        if date_from:
            bounds["$gte"] = date_from
        if date_to:
            bounds["$lt"] = date_to
        query["$and"] = [{"$or": [
            {"createdAt": bounds},
            {"createdAt": {key: value.isoformat() for key, value in bounds.items()}},
        ]}]
    return query


class TaskHistoryRepositoryMixin:
    async def find_task_history(self, query: dict, limit: int) -> list[dict]:
        from app.utils.serialize import sanitize_docs
        id_field = "agentRunId" if query.get("runType") == "ASSISTANT_CHAT" else "jobId"
        cursor = self._col.find(query).sort([("createdAt", -1), (id_field, -1)]).limit(limit)
        return sanitize_docs(await cursor.to_list(length=limit))

    async def count_task_history(self, query: dict) -> int:
        return await self._col.count_documents(query)
