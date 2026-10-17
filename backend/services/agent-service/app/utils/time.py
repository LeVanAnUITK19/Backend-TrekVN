"""Time utilities."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone


def utcnow() -> datetime:
    return datetime.now(tz=timezone.utc)


def utcnow_isoformat() -> str:
    return utcnow().isoformat()


def hours_from_now(hours: int) -> datetime:
    return utcnow() + timedelta(hours=hours)
