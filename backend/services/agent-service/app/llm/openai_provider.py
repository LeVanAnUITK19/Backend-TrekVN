"""
OpenAI provider (optional).
Uses the official OpenAI base URL — treated the same as any OpenAI-compatible endpoint.
"""

from __future__ import annotations

from app.config import Settings

from .openai_compatible import OpenAICompatibleProvider

_OPENAI_BASE_URL = "https://api.openai.com/v1"


def build_openai_provider(settings: Settings) -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(
        provider_id="openai",
        display_name="OpenAI",
        base_url=_OPENAI_BASE_URL,
        api_key=settings.openai_api_key,
        default_model=settings.openai_model,
        timeout=60.0,
    )
