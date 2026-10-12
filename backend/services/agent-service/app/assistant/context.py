"""
Conversation context builder.

Responsible for constructing the message list sent to the LLM.
Enforces token/message limits — never dumps the full DB history into a prompt.
"""

from __future__ import annotations

from typing import Any

from app.llm.base import ChatMessage

from .prompt import SYSTEM_PROMPT

# Hard limits to prevent context overflow
_MAX_CONTENT_CHARS = 4000   # per message content truncation
_SYSTEM_MSG_ROLE = "system"


def build_llm_messages(
    history: list[dict[str, Any]],
    new_user_content: str,
    max_messages: int = 20,
) -> list[ChatMessage]:
    """
    Build the final message list for the LLM.

    Structure:
      [system] → [recent history (capped)] → [new user message]

    Rules:
    - System prompt always first
    - Only include USER and ASSISTANT messages from history (skip SYSTEM/TOOL)
    - Cap history at max_messages
    - Truncate long message content to prevent token overflow
    - New user message is always last
    """
    messages: list[ChatMessage] = [
        ChatMessage(role=_SYSTEM_MSG_ROLE, content=SYSTEM_PROMPT)
    ]

    # Filter to USER/ASSISTANT only, take most recent N
    relevant = [
        m for m in history
        if m.get("role") in ("USER", "ASSISTANT")
    ]
    recent = relevant[-max_messages:] if len(relevant) > max_messages else relevant

    for msg in recent:
        role = msg["role"].lower()   # LLM expects lowercase: "user" / "assistant"
        content = msg.get("content", "")
        # Truncate very long historical messages
        if len(content) > _MAX_CONTENT_CHARS:
            content = content[:_MAX_CONTENT_CHARS] + "\n[… truncated …]"
        messages.append(ChatMessage(role=role, content=content))

    # Append the new user turn
    messages.append(ChatMessage(role="user", content=new_user_content))

    return messages
