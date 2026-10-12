"""Base interface for all LLM providers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class ChatMessage:
    role: str   # "system" | "user" | "assistant"
    content: str


@dataclass
class LLMResponse:
    content: str
    provider: str
    model: str
    latency_ms: int
    usage: dict[str, int] = field(default_factory=dict)  # promptTokens, completionTokens, totalTokens
    tool_calls: Optional[list[dict[str, Any]]] = None  # Tool calls requested by LLM
    raw: Optional[dict[str, Any]] = None


@dataclass
class ProviderHealth:
    provider_id: str
    name: str
    available: bool
    models: list[str] = field(default_factory=list)
    error: Optional[str] = None


class BaseLLMProvider(ABC):
    """
    Abstract base for all LLM providers.

    Subclasses must implement `chat()` and `health()`.
    Provider IDs: 'uit' | 'groq' | 'openai'
    """

    provider_id: str = ""
    display_name: str = ""

    @abstractmethod
    async def chat(
        self,
        messages: list[ChatMessage],
        *,
        model: Optional[str] = None,
        max_tokens: int = 2048,
        temperature: float = 0.7,
        tools: Optional[list[dict[str, Any]]] = None,
    ) -> LLMResponse:
        """
        Send a chat completion request.
        Args:
            messages: Conversation history
            model: Model name override
            max_tokens: Max completion tokens
            temperature: Sampling temperature
            tools: Tool definitions in OpenAI format (optional)
        Raises: LLMProviderError on failure.
        """
        ...

    @abstractmethod
    async def health(self) -> ProviderHealth:
        """
        Quick health/availability check.
        Must not raise — return ProviderHealth(available=False, error=...) on failure.
        """
        ...


class LLMProviderError(Exception):
    """Raised when the chosen LLM provider fails."""

    def __init__(self, provider: str, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.provider = provider
        self.status_code = status_code
