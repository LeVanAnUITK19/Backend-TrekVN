"""
Generic OpenAI-compatible provider.

Used for both UIT LLM (university endpoint) and any other
service that exposes the OpenAI Chat Completions API.

Config is passed at construction time — no global state.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Optional

import httpx

from .base import BaseLLMProvider, ChatMessage, LLMProviderError, LLMResponse, ProviderHealth

logger = logging.getLogger(__name__)

_CHAT_PATH = "/chat/completions"
_MODELS_PATH = "/models"


class OpenAICompatibleProvider(BaseLLMProvider):
    """
    OpenAI-compatible chat completions provider.

    Subclass this (or use directly) by supplying base_url, api_key, default_model.
    Never hard-codes any URL or key — all must come from env/config.
    """

    def __init__(
        self,
        provider_id: str,
        display_name: str,
        base_url: str,
        api_key: str,
        default_model: str,
        timeout: float = 30.0,
        supports_function_calling: bool = True,  # New parameter
    ):
        self.provider_id = provider_id
        self.display_name = display_name
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._default_model = default_model
        self._timeout = timeout
        self._supports_tools = supports_function_calling

    def _supports_function_calling(self) -> bool:
        """Check if this provider supports OpenAI function calling."""
        return self._supports_tools

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

    async def chat(
        self,
        messages: list[ChatMessage],
        *,
        model: Optional[str] = None,
        max_tokens: int = 2048,
        temperature: float = 0.7,
        tools: Optional[list[dict[str, Any]]] = None,
    ) -> LLMResponse:
        used_model = model or self._default_model

        payload = {
            "model": used_model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "max_tokens": max_tokens,
            "temperature": temperature,
        }

        # Add tools if provided AND provider supports them
        # UIT LLM (vLLM-based) requires --enable-auto-tool-choice flag which is not set
        # Skip tools for providers that don't support function calling
        supports_tools = self._supports_function_calling()
        if tools and supports_tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
        elif tools and not supports_tools:
            logger.warning(
                "%s: tools requested but provider does not support function calling (skipped)",
                self.display_name
            )

        start = time.monotonic()
        
        # Log request for debugging
        logger.debug(
            "%s: POST %s with model=%s, messages=%d, max_tokens=%d, temp=%.2f, tools=%s",
            self.display_name, f"{self._base_url}{_CHAT_PATH}", used_model,
            len(messages), max_tokens, temperature, bool(tools)
        )
        
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(
                    f"{self._base_url}{_CHAT_PATH}",
                    headers=self._headers(),
                    json=payload,
                )
        except httpx.TimeoutException:
            raise LLMProviderError(self.provider_id, f"{self.display_name} request timed out")
        except httpx.RequestError as exc:
            raise LLMProviderError(self.provider_id, f"{self.display_name} network error: {exc}")

        latency_ms = int((time.monotonic() - start) * 1000)

        if not resp.is_success:
            # Log response body for 4xx errors
            try:
                error_body = resp.text
                logger.error("%s HTTP %d: %s", self.display_name, resp.status_code, error_body)
            except:
                pass
            raise LLMProviderError(
                self.provider_id,
                f"{self.display_name} returned HTTP {resp.status_code}",
                status_code=resp.status_code,
            )

        data = resp.json()
        choice = data.get("choices", [{}])[0]
        message = choice.get("message", {})
        content = message.get("content", "")
        tool_calls_raw = message.get("tool_calls")
        
        # Parse tool calls if present
        tool_calls = None
        if tool_calls_raw:
            tool_calls = []
            for tc in tool_calls_raw:
                args_str = tc.get("function", {}).get("arguments", "{}")
                try:
                    args_dict = json.loads(args_str) if isinstance(args_str, str) else args_str
                except json.JSONDecodeError:
                    args_dict = {}
                tool_calls.append({
                    "id": tc.get("id"),
                    "name": tc.get("function", {}).get("name"),
                    "arguments": args_dict,
                })
        
        usage_raw = data.get("usage", {})
        usage = {
            "promptTokens": usage_raw.get("prompt_tokens", 0),
            "completionTokens": usage_raw.get("completion_tokens", 0),
            "totalTokens": usage_raw.get("total_tokens", 0),
        }

        return LLMResponse(
            content=content,
            provider=self.provider_id,
            model=used_model,
            latency_ms=latency_ms,
            usage=usage,
            tool_calls=tool_calls,
        )

    async def health(self) -> ProviderHealth:
        """
        Try GET /models to check availability.
        Falls back to a lightweight chat ping if models endpoint unavailable.
        """
        if not self._base_url or not self._api_key:
            return ProviderHealth(
                provider_id=self.provider_id,
                name=self.display_name,
                available=False,
                error="Not configured",
            )
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{self._base_url}{_MODELS_PATH}",
                    headers=self._headers(),
                )
            if resp.is_success:
                models_data = resp.json()
                model_ids: list[str] = [
                    m.get("id", "") for m in models_data.get("data", [])
                ]
                return ProviderHealth(
                    provider_id=self.provider_id,
                    name=self.display_name,
                    available=True,
                    models=model_ids or [self._default_model],
                )
            return ProviderHealth(
                provider_id=self.provider_id,
                name=self.display_name,
                available=False,
                error=f"HTTP {resp.status_code}",
            )
        except Exception as exc:
            return ProviderHealth(
                provider_id=self.provider_id,
                name=self.display_name,
                available=False,
                error=str(exc),
            )
