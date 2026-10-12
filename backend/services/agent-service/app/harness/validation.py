"""Common validation helpers used across workflows."""

from __future__ import annotations

import re
from typing import Any

# Characters that could be used for command injection in place names
_DANGEROUS_CHARS = re.compile(r'[;&|`$()<>\\"\n\r\t]')


def sanitize_place_name(name: str) -> str:
    """Strip dangerous characters from place names used in commands."""
    cleaned = _DANGEROUS_CHARS.sub("", name).strip()
    if not cleaned:
        raise ValueError("placeName is empty after sanitisation")
    return cleaned


def validate_bbox(min_lon: float, min_lat: float, max_lon: float, max_lat: float) -> None:
    """Raise ValueError on invalid bbox values."""
    if not (-180 <= min_lon <= 180 and -180 <= max_lon <= 180):
        raise ValueError(f"Longitude out of range: [{min_lon}, {max_lon}]")
    if not (-90 <= min_lat <= 90 and -90 <= max_lat <= 90):
        raise ValueError(f"Latitude out of range: [{min_lat}, {max_lat}]")
    if min_lon >= max_lon:
        raise ValueError("minLon must be less than maxLon")
    if min_lat >= max_lat:
        raise ValueError("minLat must be less than maxLat")


def limit_tool_output(data: Any, max_chars: int = 3000) -> Any:
    """
    Truncate string outputs to prevent context overflow when
    tool results are injected into LLM prompts.
    """
    if isinstance(data, str) and len(data) > max_chars:
        return data[:max_chars] + "\n[… output truncated …]"
    return data
