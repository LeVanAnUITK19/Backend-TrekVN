"""Simple async retry decorator for external service calls."""

from __future__ import annotations

import asyncio
import logging
from functools import wraps
from typing import Any, Callable, Tuple, Type

logger = logging.getLogger(__name__)


def async_retry(
    max_attempts: int = 3,
    delay_seconds: float = 1.0,
    backoff: float = 2.0,
    exceptions: Tuple[Type[Exception], ...] = (Exception,),
):
    """
    Decorator: retry an async function up to *max_attempts* times.

    delay_seconds: initial wait between attempts.
    backoff: multiplier applied to delay on each failure.
    exceptions: tuple of exception types that trigger a retry.
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            delay = delay_seconds
            last_exc: Exception | None = None
            for attempt in range(1, max_attempts + 1):
                try:
                    return await func(*args, **kwargs)
                except exceptions as exc:
                    last_exc = exc
                    if attempt < max_attempts:
                        logger.warning(
                            "%s attempt %d/%d failed: %s — retrying in %.1fs",
                            func.__name__, attempt, max_attempts, exc, delay,
                        )
                        await asyncio.sleep(delay)
                        delay *= backoff
                    else:
                        logger.error(
                            "%s failed after %d attempts: %s",
                            func.__name__, max_attempts, exc,
                        )
            raise last_exc  # type: ignore[misc]
        return wrapper
    return decorator
