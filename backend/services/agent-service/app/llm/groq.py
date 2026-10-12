"""
Groq provider — uses OpenAI-compatible endpoint at api.groq.com.
"""

from __future__ import annotations

from app.config import Settings

from .openai_compatible import OpenAICompatibleProvider

_GROQ_BASE_URL = "https://api.groq.com/openai/v1"


def build_groq_provider(settings: Settings) -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(
        provider_id="groq",
        display_name="Groq",
        base_url=_GROQ_BASE_URL,
        api_key=settings.groq_api_key,
        default_model=settings.groq_model,
        timeout=30.0,
    )
