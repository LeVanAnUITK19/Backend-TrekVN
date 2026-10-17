"""
Knowledge subsystem for the TrekViet Agent Service.

Provides read-only access to internal documents (SRS, DB schema, API docs,
architecture guides, business rules) stored under AGENT_KNOWLEDGE_ROOT.

Public API:
    KnowledgeService  — main service class (build_catalog, search, read)
    DocumentMeta      — document metadata dataclass
    KnowledgeChunk    — search result chunk dataclass

Security:
    - LLM cannot pass arbitrary paths — only logical document IDs
    - All paths are resolved inside AGENT_KNOWLEDGE_ROOT and verified
    - Path traversal (.., symlinks) is blocked
    - File size is capped at knowledge_max_file_bytes
    - Only allowlisted extensions are readable: .md .txt .dbml .json .yaml .yml
    - .env and secret files are explicitly blocked
"""
from .service import KnowledgeService, init_knowledge_service, get_knowledge_service
from .models import DocumentMeta, KnowledgeChunk

__all__ = [
    "KnowledgeService",
    "DocumentMeta",
    "KnowledgeChunk",
    "init_knowledge_service",
    "get_knowledge_service",
]
