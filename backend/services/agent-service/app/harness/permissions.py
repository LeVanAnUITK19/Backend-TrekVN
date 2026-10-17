"""
Permission matrix enforced at the application layer.

This is a hard-coded safety boundary — NOT relying on LLM prompt instructions.
Checks are called from service methods before any sensitive operation.

Matrix:
  Assistant:
    ✓ LLM chat
    ✓ search_app_docs (read-only)
    ✓ read-only analytics API calls
    ✗ production write (place/route/badge/user)
    ✗ R2 upload
    ✗ run Place Builder
    ✗ run Map Builder from chat

  Place Builder:
    ✓ OSM / Wikidata / web (read enrichment)
    ✓ Agent DB write (candidates, events)
    ✓ production read (duplicate check via trekking-service API)
    ✓ production write → ONLY via explicit /approve endpoint
    ✗ R2 upload

  Map Builder:
    ✓ map commands (osmium, tilemaker, gdal) within workdir
    ✓ temp filesystem write within MAP_WORK_ROOT
    ✓ production read (place/route existence check)
    ✓ R2 upload → ONLY via explicit /approve endpoint
    ✓ production offline-map update → ONLY after R2 upload success + approve
"""

from __future__ import annotations

from enum import Enum


class Capability(str, Enum):
    # Assistant
    ASSISTANT_LLM_CHAT = "ASSISTANT_LLM_CHAT"
    ASSISTANT_SEARCH_DOCS = "ASSISTANT_SEARCH_DOCS"
    ASSISTANT_READ_ANALYTICS = "ASSISTANT_READ_ANALYTICS"

    # Badge write (requires admin approval in chat before execution)
    BADGE_WRITE = "BADGE_WRITE"
    BADGE_WRITE_APPROVED = "BADGE_WRITE_APPROVED"

    # Place Builder
    PLACE_BUILDER_RUN = "PLACE_BUILDER_RUN"
    PLACE_BUILDER_APPROVE = "PLACE_BUILDER_APPROVE"

    # Map Builder
    MAP_BUILDER_RUN = "MAP_BUILDER_RUN"
    MAP_BUILDER_APPROVE = "MAP_BUILDER_APPROVE"
    MAP_BUILDER_R2_UPLOAD = "MAP_BUILDER_R2_UPLOAD"

    # Forbidden everywhere in V1
    PRODUCTION_WRITE_DIRECT = "PRODUCTION_WRITE_DIRECT"
    PRODUCTION_MONGODB_DIRECT = "PRODUCTION_MONGODB_DIRECT"


# Only ADMIN role may use any agent capability
_ADMIN_ALLOWED: set[Capability] = {
    Capability.ASSISTANT_LLM_CHAT,
    Capability.ASSISTANT_SEARCH_DOCS,
    Capability.ASSISTANT_READ_ANALYTICS,
    Capability.BADGE_WRITE,
    Capability.BADGE_WRITE_APPROVED,
    Capability.PLACE_BUILDER_RUN,
    Capability.PLACE_BUILDER_APPROVE,
    Capability.MAP_BUILDER_RUN,
    Capability.MAP_BUILDER_APPROVE,
    Capability.MAP_BUILDER_R2_UPLOAD,
}

# These capabilities are NEVER granted regardless of role
_ALWAYS_DENIED: set[Capability] = {
    Capability.PRODUCTION_WRITE_DIRECT,
    Capability.PRODUCTION_MONGODB_DIRECT,
}

# Assistant is hard-blocked from these workflow capabilities (V1)
# BADGE_WRITE is NOT in this set — assistant CAN propose badge writes,
# but must request admin approval before executing.
_ASSISTANT_DENIED: set[Capability] = {
    Capability.PLACE_BUILDER_RUN,
    Capability.MAP_BUILDER_RUN,
    Capability.MAP_BUILDER_R2_UPLOAD,
    Capability.PRODUCTION_WRITE_DIRECT,
    Capability.PRODUCTION_MONGODB_DIRECT,
}


class PermissionDenied(Exception):
    def __init__(self, capability: Capability, reason: str = ""):
        super().__init__(f"Permission denied: {capability.value}. {reason}")
        self.capability = capability


def require_admin(role: str) -> None:
    """Raise PermissionDenied if user is not ADMIN."""
    if role != "ADMIN":
        raise PermissionDenied(
            Capability.ASSISTANT_LLM_CHAT,
            "Only ADMIN role may access agent capabilities",
        )


def check_capability(capability: Capability, context: str = "assistant") -> None:
    """
    Hard-check a capability against the permission matrix.

    context: 'assistant' | 'place_builder' | 'map_builder'
    """
    if capability in _ALWAYS_DENIED:
        raise PermissionDenied(capability, "This capability is permanently denied")

    if context == "assistant" and capability in _ASSISTANT_DENIED:
        raise PermissionDenied(
            capability,
            "Assistant cannot trigger workflow capabilities. "
            "Use the Place Builder or Map Builder pages.",
        )
