"""
Data models for the knowledge subsystem.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class DocumentMeta:
    """Metadata for a single knowledge document."""
    document_id: str          # e.g. "srs/trek-viet-srs-v4"
    title: str                # Extracted from frontmatter or filename
    category: str             # srs | database | api | architecture | business-rules | meta
    relative_path: str        # Relative to knowledge root, e.g. "srs/trek-viet-srs-v4.md"
    file_type: str            # md | dbml | txt | json | yaml | yml
    size_bytes: int
    modified_at: str          # ISO datetime string
    version: Optional[str] = None   # from frontmatter
    active: bool = True             # from frontmatter


@dataclass
class KnowledgeChunk:
    """
    A chunk of document content returned by search or read.

    Source metadata is included so the Assistant can cite its source.
    """
    document_id: str
    category: str
    title: str
    section: str              # Heading or section label for this chunk
    chunk_index: int          # Position within the document
    text: str                 # The actual content (bounded)
    score: float = 0.0        # Relevance score (0–1); 0 for read_document results
    truncated: bool = False   # True if text was cut at max_chars boundary

    def to_source_dict(self) -> dict:
        """Return source citation dict to include in tool results."""
        return {
            "sourceType": "KNOWLEDGE",
            "documentId": self.document_id,
            "section": self.section,
            "category": self.category,
        }
