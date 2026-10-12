"""
ReAct (Reasoning + Acting) parser for LLMs without native function calling.

When a provider like UIT LLM (vLLM/Gemma) doesn't support OpenAI function
calling, we parse the LLM's text output for tool-call markers and execute them.

Supported format (instructed in system prompt):
    <tool_call>
    {"name": "get_rank_distribution", "arguments": {}}
    </tool_call>

Also handles legacy shorthand (backward compat):
    call:tool_name{"arg": "value"}
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# Primary format: XML-style tags (easy to parse, hard to accidentally trigger)
_TAG_PATTERN = re.compile(
    r"<tool_call>\s*(.*?)\s*</tool_call>",
    re.DOTALL | re.IGNORECASE,
)

# Legacy shorthand: call:tool_name{...}
_SHORTHAND_PATTERN = re.compile(
    r"call:(\w+)\s*(\{[^}]*\}|\[\]|)",
    re.IGNORECASE,
)


def extract_tool_calls(text: str) -> list[dict[str, Any]]:
    """
    Parse LLM output text for tool call markers.
    Returns list of { name, arguments } dicts.
    """
    calls: list[dict[str, Any]] = []

    # 1. Primary: <tool_call>...</tool_call>
    for match in _TAG_PATTERN.finditer(text):
        raw = match.group(1).strip()
        try:
            parsed = json.loads(raw)
            name = parsed.get("name") or parsed.get("tool") or parsed.get("function")
            args = parsed.get("arguments") or parsed.get("args") or parsed.get("parameters") or {}
            if name:
                calls.append({"name": str(name), "arguments": args if isinstance(args, dict) else {}})
        except (json.JSONDecodeError, AttributeError):
            logger.debug("Failed to parse tool_call JSON: %s", raw[:200])

    if calls:
        return calls

    # 2. Legacy shorthand: call:tool_name{...}
    for match in _SHORTHAND_PATTERN.finditer(text):
        name = match.group(1)
        args_str = match.group(2).strip() or "{}"
        try:
            args = json.loads(args_str) if args_str not in ("{}", "", "[]") else {}
            calls.append({"name": name, "arguments": args})
        except json.JSONDecodeError:
            calls.append({"name": name, "arguments": {}})

    return calls


def strip_tool_calls(text: str) -> str:
    """Remove tool call markers from final response text."""
    text = _TAG_PATTERN.sub("", text)
    text = _SHORTHAND_PATTERN.sub("", text)
    return text.strip()


def is_pure_tool_call(text: str) -> bool:
    """True if response is *only* a tool call with no other useful content."""
    stripped = strip_tool_calls(text).strip()
    return len(stripped) < 20  # Less than 20 chars of real content
