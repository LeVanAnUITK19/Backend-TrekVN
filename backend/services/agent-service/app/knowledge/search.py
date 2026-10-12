"""
Lexical search engine for the knowledge subsystem (V1).

V1 uses keyword-frequency scoring (TF-style) — no vector DB required.
Abstraction is designed so the scoring backend can later be replaced with
MongoDB Atlas Vector Search, FAISS, Qdrant, or Elasticsearch without
changing the Assistant tool interface.

Algorithm:
  1. Tokenise query into lowercase keywords
  2. For each chunk: count keyword occurrences (case-insensitive)
  3. Score = sum(occurrences) weighted by keyword importance
  4. Return top-K chunks sorted by score desc

Improvements possible without interface change:
  - BM25 scoring
  - Field boosting (title > section > body)
  - Bigram matching
  - Vector similarity
"""

from __future__ import annotations

import re
from typing import Sequence

from .models import KnowledgeChunk

# Words to ignore when scoring (not worth matching)
_STOP_WORDS = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "to", "of", "in", "on",
    "at", "by", "for", "with", "from", "as", "and", "or", "but", "not",
    "this", "that", "it", "its", "they", "them", "their", "we", "our",
    "you", "your", "i", "my", "me",
    # Vietnamese stop words
    "là", "và", "của", "trong", "có", "được", "với", "cho", "khi",
    "các", "một", "những", "không", "nếu", "thì", "này", "đó",
}


def _tokenise(text: str) -> list[str]:
    """Lowercase, split on non-alphanumeric boundaries, remove stop words."""
    tokens = re.findall(r"[a-zA-Z0-9_\u00C0-\u024F\u1EA0-\u1EF9]+", text.lower())
    return [t for t in tokens if t not in _STOP_WORDS and len(t) >= 2]


def score_chunk(chunk: KnowledgeChunk, query_tokens: list[str]) -> float:
    """
    Score a single chunk against a list of query tokens.

    Scoring:
    - Title / section match: 3× weight
    - Body match: 1× weight
    - Normalised by total number of query tokens (so short queries don't dominate)
    """
    if not query_tokens:
        return 0.0

    title_tokens = _tokenise(chunk.title + " " + chunk.section)
    body_tokens = _tokenise(chunk.text)

    score = 0.0
    for qt in query_tokens:
        # Title/section hits weighted more
        score += title_tokens.count(qt) * 3.0
        score += body_tokens.count(qt) * 1.0

    # Normalise by query length so multi-word queries don't get raw advantage
    return score / len(query_tokens)


def search_chunks(
    chunks: Sequence[KnowledgeChunk],
    query: str,
    top_k: int = 5,
    category_filter: str | None = None,
) -> list[KnowledgeChunk]:
    """
    Search chunks by lexical scoring.

    Args:
        chunks:           All indexed chunks (from KnowledgeService)
        query:            Free-text search query
        top_k:            Maximum number of results to return
        category_filter:  If set, only return chunks from this category

    Returns:
        Sorted list of KnowledgeChunk with `score` field populated, best first.
        Returns empty list if no query tokens after stop-word removal.
    """
    query_tokens = _tokenise(query)
    if not query_tokens:
        return []

    candidates = chunks
    if category_filter:
        candidates = [c for c in chunks if c.category == category_filter]

    scored: list[tuple[float, KnowledgeChunk]] = []
    for chunk in candidates:
        s = score_chunk(chunk, query_tokens)
        if s > 0.0:
            scored.append((s, chunk))

    # Sort by score desc, then document_id+chunk_index for determinism
    scored.sort(key=lambda t: (-t[0], t[1].document_id, t[1].chunk_index))

    results: list[KnowledgeChunk] = []
    for raw_score, chunk in scored[:top_k]:
        # Return a copy with the score populated
        results.append(
            KnowledgeChunk(
                document_id=chunk.document_id,
                category=chunk.category,
                title=chunk.title,
                section=chunk.section,
                chunk_index=chunk.chunk_index,
                text=chunk.text,
                score=min(raw_score / max(len(query_tokens) * 4, 1), 1.0),
                truncated=chunk.truncated,
            )
        )

    return results
