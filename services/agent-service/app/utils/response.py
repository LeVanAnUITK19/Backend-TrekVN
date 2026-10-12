"""
Safe JSON response helper for FastAPI endpoints.

Wraps fastapi.responses.JSONResponse to always run _convert()
which handles ObjectId → str and datetime → ISO string.
Import and use `ok()` / `created()` instead of returning raw dicts.
"""

from __future__ import annotations

from typing import Any

from fastapi.responses import JSONResponse

from .serialize import _convert


def ok(data: Any) -> JSONResponse:
    """200 OK response with safe serialization."""
    return JSONResponse(
        status_code=200,
        content={"success": True, "data": _convert(data)},
    )


def created(data: Any) -> JSONResponse:
    """201 Created response with safe serialization."""
    return JSONResponse(
        status_code=201,
        content={"success": True, "data": _convert(data)},
    )


def no_content() -> JSONResponse:
    """Success response with no data payload."""
    return JSONResponse(
        status_code=200,
        content={"success": True},
    )
