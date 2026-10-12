"""
Filesystem security helpers for the knowledge subsystem.

Provides:
  resolve_safe_path()  — validate a relative path stays inside root
  is_allowed_ext()     — allowlist of readable extensions
  is_blocked_file()    — explicit blocklist (secrets, .env, etc.)

SECURITY RULES (per spec section 36):
  1. Resolve from documentId — never accept raw filesystem path from LLM
  2. Root is fixed = AGENT_KNOWLEDGE_ROOT (config)
  3. Canonicalize resolved path
  4. Verify resolved path still starts with root (no .. escapes)
  5. Block symlinks pointing outside root
  6. Allowlist extension only
  7. Cap file size (knowledge_max_file_bytes)
  8. .env and credential files are always blocked
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

# Allowed file extensions (lowercase)
ALLOWED_EXTENSIONS = {".md", ".txt", ".dbml", ".json", ".yaml", ".yml"}

# Files that must never be readable regardless of location
BLOCKED_FILENAMES = {
    ".env", ".env.local", ".env.production", ".env.development",
    "credentials.json", "secrets.json", "service-account.json",
    ".netrc", ".npmrc", ".pypirc",
}

# Block any filename containing these substrings (case-insensitive)
BLOCKED_SUBSTRINGS = {"secret", "credential", "password", "api_key", "apikey", "token"}


def is_allowed_ext(path: Path) -> bool:
    """Return True if the file extension is in the allowlist."""
    return path.suffix.lower() in ALLOWED_EXTENSIONS


def is_blocked_file(path: Path) -> bool:
    """Return True if the filename is blocked regardless of location."""
    name_lower = path.name.lower()
    if name_lower in BLOCKED_FILENAMES:
        return True
    # Block filenames that contain sensitive substrings
    # (e.g. my-secret-config.yaml)
    for sub in BLOCKED_SUBSTRINGS:
        if sub in name_lower:
            return True
    return False


def resolve_safe_path(
    knowledge_root: str,
    relative_path: str,
) -> Optional[Path]:
    """
    Resolve `relative_path` under `knowledge_root` with full security checks.

    Returns the absolute Path if safe, or None if the path fails any check.

    Checks performed:
    - Path must stay within knowledge_root after canonicalization
    - No symlinks that escape root
    - Extension must be in allowlist
    - Filename must not be in blocklist
    """
    try:
        root = Path(knowledge_root).resolve()
        # Construct candidate path — reject any absolute path from caller
        candidate = (root / relative_path).resolve()

        # 1. Must stay inside root
        candidate.relative_to(root)  # raises ValueError if escapes

        # 2. Check for symlink that escapes root
        if candidate.is_symlink():
            real = candidate.resolve()
            real.relative_to(root)  # raises ValueError if symlink target escapes

        # 3. Extension allowlist
        if not is_allowed_ext(candidate):
            return None

        # 4. Blocked filename
        if is_blocked_file(candidate):
            return None

        return candidate

    except (ValueError, OSError):
        # Path traversal attempt, or symlink resolution error
        return None


def document_id_to_relative_path(
    document_id: str,
    catalog: "dict[str, str]",
) -> Optional[str]:
    """
    Convert a logical documentId to a relative file path using the catalog.

    Catalog maps documentId → relative_path.
    Returns None if documentId is not in the catalog.

    This is the ONLY way the LLM can specify which document to read —
    it must use a known documentId, never a raw path.
    """
    return catalog.get(document_id)
