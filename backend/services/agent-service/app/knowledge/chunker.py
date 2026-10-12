"""
Document chunker for the knowledge subsystem.

Chunks documents into smaller pieces for search and LLM context.
Chunking strategy per file type (per spec section 30):

  .md  / .txt  → split on heading lines (# ## ###) + fixed-size fallback
  .dbml        → split on Table/Ref/TableGroup blocks
  other        → fixed-size windows

Each chunk carries source metadata (documentId, section, chunkIndex).

MAX_CHUNK_CHARS cap is applied per chunk — caller must also pass max_chars
to ensure LLM context stays bounded.
"""

from __future__ import annotations

import re
from typing import Iterator

from .models import DocumentMeta, KnowledgeChunk

# Default max chars per chunk (overridden by settings)
_DEFAULT_MAX_CHARS = 1200

# Min chunk size — don't emit empty / near-empty chunks
_MIN_CHUNK_CHARS = 50


def chunk_document(
    meta: DocumentMeta,
    content: str,
    max_chars: int = _DEFAULT_MAX_CHARS,
) -> list[KnowledgeChunk]:
    """
    Split document content into bounded chunks.

    Returns a list of KnowledgeChunk objects, each bounded to max_chars.
    """
    file_type = meta.file_type.lstrip(".")
    if file_type in ("md", "txt"):
        raw_chunks = list(_chunk_markdown(content))
    elif file_type == "dbml":
        raw_chunks = list(_chunk_dbml(content))
    else:
        raw_chunks = list(_chunk_fixed(content, window=max_chars))

    result: list[KnowledgeChunk] = []
    for idx, (section, text) in enumerate(raw_chunks):
        text = text.strip()
        if len(text) < _MIN_CHUNK_CHARS:
            continue
        truncated = len(text) > max_chars
        bounded_text = text[:max_chars] if truncated else text
        result.append(
            KnowledgeChunk(
                document_id=meta.document_id,
                category=meta.category,
                title=meta.title,
                section=section,
                chunk_index=idx,
                text=bounded_text,
                truncated=truncated,
            )
        )
    return result


# ── Markdown chunker ──────────────────────────────────────────────────────────

_MD_HEADING = re.compile(r"^(#{1,3})\s+(.+)$", re.MULTILINE)


def _chunk_markdown(content: str) -> Iterator[tuple[str, str]]:
    """
    Split markdown on H1/H2/H3 headings.
    Yields (section_label, text_block) pairs.
    """
    # Find all heading positions
    matches = list(_MD_HEADING.finditer(content))

    if not matches:
        # No headings — yield whole document as one chunk
        yield ("(full document)", content)
        return

    # Everything before the first heading
    preamble = content[: matches[0].start()].strip()
    if preamble:
        yield ("(preamble)", preamble)

    for i, m in enumerate(matches):
        section_label = m.group(2).strip()
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        block = content[start:end].strip()
        if block:
            yield (section_label, block)


# ── DBML chunker ──────────────────────────────────────────────────────────────

_DBML_TABLE = re.compile(
    r"(Table\s+\w+\s*\{[^}]*\})", re.DOTALL
)
_DBML_REF_BLOCK = re.compile(r"(Ref:[^\n]+)", re.MULTILINE)
_DBML_COMMENT_BLOCK = re.compile(r"(//\s*={10,}.*?//\s*={10,})", re.DOTALL)


def _chunk_dbml(content: str) -> Iterator[tuple[str, str]]:
    """
    Split DBML file into table-level chunks.
    Yields (table_name, block) pairs, plus a refs block.
    """
    # Extract table blocks
    seen_spans: list[tuple[int, int]] = []
    for m in _DBML_TABLE.finditer(content):
        name_match = re.match(r"Table\s+(\w+)", m.group(1))
        table_name = name_match.group(1) if name_match else "table"
        seen_spans.append((m.start(), m.end()))
        yield (f"Table: {table_name}", m.group(1))

    # Collect refs separately (they appear outside table blocks)
    ref_lines = [m.group(1) for m in _DBML_REF_BLOCK.finditer(content)]
    if ref_lines:
        yield ("Relationships (Ref)", "\n".join(ref_lines))

    # If no tables found, fall back to fixed chunking
    if not seen_spans:
        yield from _chunk_fixed(content, window=1200)


# ── Fixed-window chunker ──────────────────────────────────────────────────────

def _chunk_fixed(content: str, window: int = 1200) -> Iterator[tuple[str, str]]:
    """Split content into fixed-size windows, yielding (label, text) pairs."""
    for i in range(0, len(content), window):
        chunk_num = i // window
        yield (f"section_{chunk_num}", content[i : i + window])
