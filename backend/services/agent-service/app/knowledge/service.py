"""
KnowledgeService — main service class for the knowledge subsystem.

Responsibilities:
  - Scan AGENT_KNOWLEDGE_ROOT at startup (build_catalog)
  - Parse document metadata from frontmatter
  - Index document chunks for search
  - Provide list / search / read / metadata operations
  - Enforce ALL filesystem security checks

The LLM interacts ONLY via logical document IDs — never raw paths.
All path operations go through security.py safeguards.

Thread safety: read-only after build_catalog(); safe for asyncio.
"""

from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from app.config import Settings

from .chunker import chunk_document
from .models import DocumentMeta, KnowledgeChunk
from .search import search_chunks
from .security import (
    ALLOWED_EXTENSIONS,
    document_id_to_relative_path,
    is_allowed_ext,
    is_blocked_file,
    resolve_safe_path,
)

logger = logging.getLogger(__name__)

# Category inferred from subdirectory name
_DIR_TO_CATEGORY: dict[str, str] = {
    "srs": "srs",
    "database": "database",
    "api": "api",
    "architecture": "architecture",
    "business-rules": "business-rules",
    "business_rules": "business-rules",
}

_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)


def _parse_frontmatter(content: str) -> dict[str, Any]:
    """Parse simple YAML-like frontmatter (key: value only, no nested)."""
    m = _FRONTMATTER_RE.match(content)
    if not m:
        return {}
    result: dict[str, Any] = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            key = k.strip()
            val = v.strip().strip('"').strip("'")
            if val.lower() == "true":
                val_parsed: Any = True
            elif val.lower() == "false":
                val_parsed = False
            else:
                val_parsed = val
            result[key] = val_parsed
    return result


def _strip_frontmatter(content: str) -> str:
    """Remove frontmatter block from content."""
    return _FRONTMATTER_RE.sub("", content, count=1)


def _infer_title(file_path: Path, content: str) -> str:
    """
    Infer document title:
    1. First H1 heading in markdown
    2. Filename (without extension)
    """
    h1 = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    if h1:
        return h1.group(1).strip()
    return file_path.stem.replace("-", " ").replace("_", " ").title()


def _path_to_document_id(root: Path, file_path: Path) -> str:
    """
    Convert an absolute file path to a logical documentId.

    Example:
        root  = /app/knowledge
        path  = /app/knowledge/srs/trek-viet-srs-v4.md
        → "srs/trek-viet-srs-v4"
    """
    rel = file_path.relative_to(root)
    # Remove extension
    parts = list(rel.parts)
    parts[-1] = rel.stem  # strip extension from filename
    return "/".join(parts)


def _infer_category(file_path: Path, root: Path) -> str:
    """Infer category from top-level subdirectory name."""
    try:
        rel = file_path.relative_to(root)
        if len(rel.parts) >= 2:
            return _DIR_TO_CATEGORY.get(rel.parts[0], rel.parts[0])
    except ValueError:
        pass
    return "general"


class KnowledgeService:
    """
    Manages the internal knowledge base for the AI Assistant.

    Usage:
        svc = KnowledgeService(settings)
        await svc.build_catalog()  # Call once at startup

        docs = svc.list_documents()
        results = svc.search("offline map", top_k=5)
        chunk_list = svc.read_document("architecture/offline-first")
        meta = svc.get_metadata("database/trek-viet-trekking")
    """

    def __init__(self, settings: Settings):
        self._root_str = settings.agent_knowledge_root
        self._max_chunk_chars = settings.knowledge_max_chunk_chars
        self._search_top_k = settings.knowledge_search_top_k
        self._max_file_bytes = settings.knowledge_max_file_bytes

        self._documents: dict[str, DocumentMeta] = {}     # documentId → meta
        self._chunks: list[KnowledgeChunk] = []            # all indexed chunks
        self._id_to_path: dict[str, str] = {}              # documentId → relative_path
        self._available = False
        self._error: Optional[str] = None

    # ── Lifecycle ──────────────────────────────────────────────────────────

    def build_catalog(self) -> None:
        """
        Scan AGENT_KNOWLEDGE_ROOT and build the document catalog + search index.

        Safe to call synchronously at startup (blocking file IO, expected once).
        If the knowledge directory does not exist or is empty, the service
        stays available=False but does NOT crash the agent service.
        """
        root_path = Path(self._root_str)

        if not root_path.exists():
            self._available = False
            self._error = f"Knowledge root does not exist: {self._root_str}"
            logger.warning("KnowledgeService: %s", self._error)
            return

        if not root_path.is_dir():
            self._available = False
            self._error = f"Knowledge root is not a directory: {self._root_str}"
            logger.warning("KnowledgeService: %s", self._error)
            return

        root_resolved = root_path.resolve()
        docs_found = 0
        chunks_built = 0

        for file_path in sorted(root_resolved.rglob("*")):
            if not file_path.is_file():
                continue
            if not is_allowed_ext(file_path):
                continue
            if is_blocked_file(file_path):
                logger.warning("KnowledgeService: blocked file skipped: %s", file_path.name)
                continue

            # Size guard
            try:
                size = file_path.stat().st_size
            except OSError:
                continue
            if size > self._max_file_bytes:
                logger.warning(
                    "KnowledgeService: file too large (%d bytes), skipping: %s",
                    size, file_path.name,
                )
                continue

            try:
                content_raw = file_path.read_text(encoding="utf-8", errors="replace")
            except OSError as exc:
                logger.warning("KnowledgeService: cannot read %s: %s", file_path, exc)
                continue

            # Parse frontmatter
            fm = _parse_frontmatter(content_raw)
            content = _strip_frontmatter(content_raw)

            doc_id = _path_to_document_id(root_resolved, file_path)
            category = fm.get("category") or _infer_category(file_path, root_resolved)
            title = fm.get("title") or _infer_title(file_path, content)
            file_type = file_path.suffix.lstrip(".")

            try:
                mtime = file_path.stat().st_mtime
                modified_at = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
            except OSError:
                modified_at = ""

            rel_path = str(file_path.relative_to(root_resolved))

            meta = DocumentMeta(
                document_id=doc_id,
                title=title,
                category=category,
                relative_path=rel_path,
                file_type=file_type,
                size_bytes=size,
                modified_at=modified_at,
                version=str(fm.get("version", "")),
                active=bool(fm.get("active", True)),
            )

            self._documents[doc_id] = meta
            self._id_to_path[doc_id] = rel_path

            # Build chunks for indexing
            doc_chunks = chunk_document(meta, content, max_chars=self._max_chunk_chars)
            self._chunks.extend(doc_chunks)
            chunks_built += len(doc_chunks)
            docs_found += 1

        self._available = docs_found > 0
        logger.info(
            "KnowledgeService: catalog built — %d documents, %d chunks indexed",
            docs_found, chunks_built,
        )

    # ── Public API ─────────────────────────────────────────────────────────

    @property
    def available(self) -> bool:
        return self._available

    @property
    def document_count(self) -> int:
        return len(self._documents)

    def list_documents(self) -> list[dict]:
        """
        Return lightweight metadata for all known documents.
        Safe to return to LLM as a catalog.
        """
        return [
            {
                "documentId": m.document_id,
                "title": m.title,
                "category": m.category,
                "fileType": m.file_type,
                "sizeBytes": m.size_bytes,
                "modifiedAt": m.modified_at,
                "active": m.active,
            }
            for m in sorted(self._documents.values(), key=lambda d: d.document_id)
        ]

    def search(
        self,
        query: str,
        category: Optional[str] = None,
        top_k: Optional[int] = None,
    ) -> list[dict]:
        """
        Search the knowledge base by keyword.

        Returns a list of chunk dicts with source metadata, bounded to top_k.
        Each result is safe to pass to the LLM.
        """
        if not self._available:
            return []

        k = top_k or self._search_top_k
        results = search_chunks(self._chunks, query, top_k=k, category_filter=category)

        return [
            {
                "documentId": c.document_id,
                "title": c.title,
                "category": c.category,
                "section": c.section,
                "content": c.text,
                "score": round(c.score, 3),
                "truncated": c.truncated,
                **c.to_source_dict(),
            }
            for c in results
        ]

    def read_document(
        self,
        document_id: str,
        max_chars: Optional[int] = None,
    ) -> Optional[dict]:
        """
        Read and return document content by documentId.

        The LLM MUST use a documentId from list_documents() —
        arbitrary paths are never accepted.

        Returns None if documentId is not in catalog.
        Content is bounded to max_chars (defaults to 5× chunk size for full reads).
        """
        if not self._available:
            return None

        meta = self._documents.get(document_id)
        if meta is None:
            return None

        rel_path = self._id_to_path.get(document_id)
        if rel_path is None:
            return None

        # Security: resolve path through safety checks
        safe_path = resolve_safe_path(self._root_str, rel_path)
        if safe_path is None or not safe_path.exists():
            logger.warning("KnowledgeService: path resolution failed for %s", document_id)
            return None

        try:
            content_raw = safe_path.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            logger.error("KnowledgeService: read error for %s: %s", document_id, exc)
            return None

        content = _strip_frontmatter(content_raw)
        limit = max_chars or (self._max_chunk_chars * 8)  # reasonable full-read cap
        truncated = len(content) > limit
        bounded_content = content[:limit] if truncated else content

        return {
            "documentId": document_id,
            "title": meta.title,
            "category": meta.category,
            "fileType": meta.file_type,
            "content": bounded_content,
            "truncated": truncated,
            "sizeBytes": meta.size_bytes,
            "modifiedAt": meta.modified_at,
            "sourceType": "KNOWLEDGE",
        }

    def get_metadata(self, document_id: str) -> Optional[dict]:
        """Return metadata for a single document by documentId."""
        meta = self._documents.get(document_id)
        if meta is None:
            return None
        return {
            "documentId": meta.document_id,
            "title": meta.title,
            "category": meta.category,
            "fileType": meta.file_type,
            "relativePath": meta.relative_path,
            "sizeBytes": meta.size_bytes,
            "modifiedAt": meta.modified_at,
            "version": meta.version,
            "active": meta.active,
        }

    def health(self) -> dict:
        """Return health/status dict for the readiness endpoint."""
        return {
            "available": self._available,
            "documents": self.document_count,
            "indexed": len(self._chunks) > 0,
            "error": self._error,
        }


# ── Singleton management ──────────────────────────────────────────────────────

_instance: Optional[KnowledgeService] = None


def init_knowledge_service(settings: Settings) -> KnowledgeService:
    """Create and build the KnowledgeService singleton. Call once at startup."""
    global _instance
    svc = KnowledgeService(settings)
    svc.build_catalog()
    _instance = svc
    return svc


def get_knowledge_service() -> KnowledgeService:
    """Get the KnowledgeService singleton. Raises if not initialised."""
    if _instance is None:
        raise RuntimeError("KnowledgeService not initialised. Call init_knowledge_service() first.")
    return _instance
