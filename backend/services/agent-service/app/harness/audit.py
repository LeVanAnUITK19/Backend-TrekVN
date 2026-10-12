"""Audit logging helpers — production write operations must be audited."""

from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


def log_production_write(
    operation: str,
    admin_id: str,
    job_id: str,
    target_id: Optional[str],
    payload_summary: dict[str, Any],
) -> None:
    """
    Log every production write operation for audit trail.

    Does NOT log full payload (may contain PII / large data).
    Logs a summary: operation, target, fields being written.
    """
    logger.info(
        "[AUDIT] production_write operation=%s admin=%s job=%s target=%s fields=%s",
        operation,
        admin_id,
        job_id,
        target_id,
        list(payload_summary.keys()),
    )


def log_r2_upload(
    admin_id: str,
    job_id: str,
    bucket: str,
    object_key: str,
    size_bytes: int,
) -> None:
    """Log R2 upload audit event. Never logs API keys or secrets."""
    logger.info(
        "[AUDIT] r2_upload admin=%s job=%s bucket=%s key=%s size=%d",
        admin_id, job_id, bucket, object_key, size_bytes,
    )
