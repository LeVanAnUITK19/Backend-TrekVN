"""Base class for all V1 read-only Assistant tools."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Optional


@dataclass
class ToolResult:
    name: str
    success: bool
    data: Any = None
    error: Optional[str] = None
    # Hard limit: tool output must never flood the context
    truncated: bool = False


class BaseAssistantTool(ABC):
    """
    V1 constraint: ALL tools are READ-ONLY.
    No tool may write to production DB, call Place Builder, or call Map Builder.
    """

    name: str = ""
    description: str = ""
    mode: str = "READ_ONLY"
    parameters: dict[str, Any] = {}  # JSON schema for parameters

    @abstractmethod
    async def run(self, **kwargs: Any) -> ToolResult:
        ...

    def get_schema(self) -> dict[str, Any]:
        """
        Return OpenAI-compatible tool schema.
        Override this method or set self.parameters if tool needs custom parameter schema.
        """
        # If parameters not defined, use empty object schema
        params_schema = getattr(self, "parameters", None) or {
            "type": "object",
            "properties": {},
            "required": [],
        }
        
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": params_schema,
            },
        }

    def to_summary_dict(self, result: ToolResult) -> dict:
        return {
            "name": self.name,
            "mode": self.mode,
            "success": result.success,
        }
