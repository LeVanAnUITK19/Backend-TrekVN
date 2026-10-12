"""File hashing utilities."""

from __future__ import annotations

import hashlib
from pathlib import Path


def sha256_file(path: str | Path, chunk_size: int = 65536) -> str:
    """Return hex SHA-256 digest of file at *path*."""
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        while chunk := fh.read(chunk_size):
            h.update(chunk)
    return h.hexdigest()
