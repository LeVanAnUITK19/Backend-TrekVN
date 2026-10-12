"""
MongoDB document serialization helpers.

Motor/PyMongo returns documents with `_id: ObjectId` which Pydantic v2
cannot serialize. These helpers convert ObjectId (and any other BSON types)
to JSON-safe Python primitives before the response is built.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from bson import ObjectId


def _convert(value: Any) -> Any:
    """Recursively convert BSON-specific types to JSON-safe types."""
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _convert(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_convert(item) for item in value]
    return value


def sanitize_doc(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    """Convert a single MongoDB document — removes _id or converts to str."""
    if doc is None:
        return None
    result = _convert(doc)
    # Remove internal _id from API responses (we use custom *Id fields)
    result.pop("_id", None)
    return result


def sanitize_docs(docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert a list of MongoDB documents."""
    return [sanitize_doc(doc) for doc in docs if doc is not None]  # type: ignore[misc]
