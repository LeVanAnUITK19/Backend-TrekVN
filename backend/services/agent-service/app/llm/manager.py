"""
LLM Provider Manager.

Handles:
- Provider registration based on config
- Auto-selection with fallback (only when provider='auto')
- Manual selection with hard failure (no silent fallback)
- Health checks
- API key is NEVER returned in any public response
"""

from __future__ import annotations

import asyncio
import logging
from functools import lru_cache
from typing import Any, Optional

from app.config import Settings

from .base import BaseLLMProvider, ChatMessage, LLMProviderError, LLMResponse, ProviderHealth

logger = logging.getLogger(__name__)


class LLMProviderManager:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._providers: dict[str, BaseLLMProvider] = {}
        self._priority: list[str] = settings.provider_priority_list
        self._default_provider = settings.llm_default_provider
        self._build_providers()

    def _build_providers(self) -> None:
        s = self._settings

        if s.uit_llm_enabled and s.uit_llm_base_url and s.uit_llm_api_key:
            from .openai_compatible import OpenAICompatibleProvider
            self._providers["uit"] = OpenAICompatibleProvider(
                provider_id="uit",
                display_name="UIT LLM",
                base_url=s.uit_llm_base_url,
                api_key=s.uit_llm_api_key,
                default_model=s.uit_llm_model,
                timeout=float(s.request_timeout_seconds),
                supports_function_calling=False,  # UIT vLLM doesn't have --enable-auto-tool-choice
            )
            logger.info("LLM provider registered: uit")

        if s.groq_enabled and s.groq_api_key:
            from .groq import build_groq_provider
            self._providers["groq"] = build_groq_provider(s)
            logger.info("LLM provider registered: groq")

        if s.openai_enabled and s.openai_api_key:
            from .openai_provider import build_openai_provider
            self._providers["openai"] = build_openai_provider(s)
            logger.info("LLM provider registered: openai")

        if not self._providers:
            logger.warning("No LLM providers configured — assistant will be unavailable")

    def _get_provider(self, provider_id: str) -> BaseLLMProvider:
        p = self._providers.get(provider_id)
        if p is None:
            raise LLMProviderError(
                provider_id, f"Provider '{provider_id}' is not configured or disabled"
            )
        return p

    async def chat(
        self,
        messages: list[ChatMessage],
        *,
        provider: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: int = 2048,
        temperature: float = 0.7,
        tools: Optional[list[dict[str, Any]]] = None,
    ) -> LLMResponse:
        """
        Route a chat request to the correct provider.

        Rules:
        - provider='auto' or None → try providers in priority order; fallback on failure
        - provider=<specific> → call that provider; raise on failure (no silent fallback)
        """
        chosen = provider or self._default_provider

        if chosen == "auto":
            return await self._auto_chat(
                messages, model=model, max_tokens=max_tokens, temperature=temperature, tools=tools
            )

        # Manual selection — hard fail, no silent fallback
        p = self._get_provider(chosen)
        try:
            return await p.chat(
                messages, model=model, max_tokens=max_tokens, temperature=temperature, tools=tools
            )
        except LLMProviderError:
            raise
        except Exception as exc:
            raise LLMProviderError(chosen, f"Unexpected error from provider '{chosen}': {exc}")

    async def _auto_chat(
        self,
        messages: list[ChatMessage],
        *,
        model: Optional[str],
        max_tokens: int,
        temperature: float,
        tools: Optional[list[dict[str, Any]]],
    ) -> LLMResponse:
        """
        Try each provider in priority order.
        Falls back to next on failure.
        Raises LLMProviderError if all fail.
        """
        priority = [pid for pid in self._priority if pid in self._providers]
        if not priority:
            raise LLMProviderError("auto", "No LLM providers available")

        last_error: Optional[Exception] = None
        for pid in priority:
            try:
                logger.debug("AUTO: trying provider=%s", pid)
                result = await self._providers[pid].chat(
                    messages, model=model, max_tokens=max_tokens, temperature=temperature, tools=tools
                )
                logger.info("AUTO: used provider=%s model=%s latency=%dms",
                            pid, result.model, result.latency_ms)
                return result
            except Exception as exc:
                logger.warning("AUTO: provider=%s failed: %s — trying next", pid, exc)
                last_error = exc
                continue

        raise LLMProviderError("auto", f"All providers failed. Last error: {last_error}")

    async def get_all_health(self) -> list[ProviderHealth]:
        """Check health of all registered providers concurrently."""
        tasks = [p.health() for p in self._providers.values()]
        return list(await asyncio.gather(*tasks, return_exceptions=False))

    async def get_provider_health(self, provider_id: str) -> ProviderHealth:
        p = self._providers.get(provider_id)
        if p is None:
            return ProviderHealth(
                provider_id=provider_id,
                name=provider_id,
                available=False,
                error="Not configured",
            )
        return await p.health()

    def list_provider_ids(self) -> list[str]:
        return list(self._providers.keys())

    @property
    def default_provider(self) -> str:
        return self._default_provider


# ── Singleton factory ─────────────────────────────────────────────────────────
# Manager is created once per process (lru_cache on settings means one instance).

_manager_instance: Optional[LLMProviderManager] = None


def init_llm_manager(settings: Settings) -> LLMProviderManager:
    global _manager_instance
    _manager_instance = LLMProviderManager(settings)
    return _manager_instance


def get_llm_manager() -> LLMProviderManager:
    if _manager_instance is None:
        raise RuntimeError("LLM manager not initialised. Call init_llm_manager() first.")
    return _manager_instance
