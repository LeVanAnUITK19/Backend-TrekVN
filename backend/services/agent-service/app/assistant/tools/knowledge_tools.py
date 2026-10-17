"""
Knowledge tools for the AI Assistant.

Wraps KnowledgeService behind the BaseAssistantTool interface so the
assistant dispatch loop treats knowledge and production-API tools uniformly.

Tools:
  ListKnowledgeDocumentsTool  — list_knowledge_documents()
  SearchKnowledgeTool         — search_knowledge(query, category, top_k)
  ReadKnowledgeDocumentTool   — read_knowledge_document(document_id)

Security:
  - LLM cannot pass raw filesystem paths
  - document_id must be in the catalog (controlled by KnowledgeService)
  - All security checks enforced by KnowledgeService / security.py

Permissions:
  ALLOW: list, search, read
  DENY:  write, delete, modify (enforced at KnowledgeService layer)
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.knowledge.service import get_knowledge_service

from .base import BaseAssistantTool, ToolResult

logger = logging.getLogger(__name__)


class ListKnowledgeDocumentsTool(BaseAssistantTool):
    """
    List all available knowledge documents.
    Use this first when the admin asks an architecture/design/business-rule question
    to discover which documents are available before searching.
    """

    name = "list_knowledge_documents"
    description = (
        "List all available internal knowledge documents (SRS, DB schema, API docs, "
        "architecture guides, business rules). "
        "Returns documentId, title, category, and file type for each document. "
        "Use this to discover what documents exist before calling search_knowledge or "
        "read_knowledge_document."
    )
    parameters = {
        "type": "object",
        "properties": {},
        "required": [],
    }

    async def run(self, **kwargs: Any) -> ToolResult:
        try:
            svc = get_knowledge_service()
        except RuntimeError:
            return ToolResult(
                name=self.name, success=False,
                error="Knowledge service not initialised",
            )

        if not svc.available:
            return ToolResult(
                name=self.name, success=True,
                data={
                    "available": False,
                    "documents": [],
                    "note": "Knowledge base not available — directory may not be mounted.",
                },
            )

        docs = svc.list_documents()
        return ToolResult(
            name=self.name,
            success=True,
            data={
                "available": True,
                "count": len(docs),
                "documents": docs,
                "sourceType": "KNOWLEDGE",
            },
        )


class SearchKnowledgeTool(BaseAssistantTool):
    """
    Search the internal knowledge base by keyword.
    Returns the most relevant document chunks with source metadata.
    """

    name = "search_knowledge"
    description = (
        "Search the TrekViet internal knowledge base (SRS, DB schema, API docs, "
        "architecture, business rules) by keyword or phrase. "
        "Returns relevant document excerpts with source citations. "
        "Use for: architecture questions, DB schema questions, API contract questions, "
        "business rules, design decisions. "
        "Optional: filter by category (srs | database | api | architecture | business-rules). "
        "Prefer this over read_knowledge_document for targeted questions."
    )
    parameters = {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Search query (keywords or phrase)",
            },
            "category": {
                "type": "string",
                "enum": ["srs", "database", "api", "architecture", "business-rules"],
                "description": "Optional: filter by document category",
            },
            "top_k": {
                "type": "integer",
                "description": "Number of results to return (default: 5, max: 10)",
                "default": 5,
            },
        },
        "required": ["query"],
    }

    async def run(
        self,
        query: str,
        category: Optional[str] = None,
        top_k: int = 5,
        **kwargs: Any,
    ) -> ToolResult:
        if not query or not query.strip():
            return ToolResult(
                name=self.name, success=False,
                error="query parameter is required",
            )

        try:
            svc = get_knowledge_service()
        except RuntimeError:
            return ToolResult(
                name=self.name, success=False,
                error="Knowledge service not initialised",
            )

        if not svc.available:
            return ToolResult(
                name=self.name, success=True,
                data={
                    "available": False,
                    "results": [],
                    "note": "Knowledge base not available.",
                },
            )

        # Cap top_k to avoid flooding LLM context
        effective_top_k = min(max(1, top_k), 10)
        results = svc.search(query=query.strip(), category=category, top_k=effective_top_k)

        return ToolResult(
            name=self.name,
            success=True,
            data={
                "query": query,
                "category": category,
                "count": len(results),
                "results": results,
                "sourceType": "KNOWLEDGE",
            },
        )


class ReadKnowledgeDocumentTool(BaseAssistantTool):
    """
    Read the full content of a specific knowledge document by its documentId.
    Use after list_knowledge_documents to get the exact documentId.
    """

    name = "read_knowledge_document"
    description = (
        "Read the full content of a specific internal knowledge document by its documentId. "
        "The documentId must come from list_knowledge_documents (e.g. 'srs/trek-viet-srs-v4', "
        "'database/trek-viet-trekking', 'api/trekking-service-api', "
        "'architecture/offline-first', 'business-rules/gamification'). "
        "Use search_knowledge first if you only need specific sections — "
        "read_knowledge_document returns the whole document (bounded)."
    )
    parameters = {
        "type": "object",
        "properties": {
            "document_id": {
                "type": "string",
                "description": "Document ID from list_knowledge_documents (e.g. 'srs/trek-viet-srs-v4')",
            },
        },
        "required": ["document_id"],
    }

    async def run(self, document_id: str, **kwargs: Any) -> ToolResult:
        if not document_id or not document_id.strip():
            return ToolResult(
                name=self.name, success=False,
                error="document_id parameter is required",
            )

        try:
            svc = get_knowledge_service()
        except RuntimeError:
            return ToolResult(
                name=self.name, success=False,
                error="Knowledge service not initialised",
            )

        if not svc.available:
            return ToolResult(
                name=self.name, success=False,
                error="Knowledge base not available.",
            )

        doc = svc.read_document(document_id.strip())
        if doc is None:
            # List available docs to help LLM correct itself
            available_ids = [d["documentId"] for d in svc.list_documents()]
            return ToolResult(
                name=self.name,
                success=False,
                error=(
                    f"Document '{document_id}' not found. "
                    f"Available documentIds: {available_ids}"
                ),
            )

        return ToolResult(
            name=self.name,
            success=True,
            data=doc,
        )
