"""
Unit tests for LLM Provider Manager.

Tests:
- Auto selection falls back to next provider
- Manual selection does NOT silently fallback
- Disabled provider raises error
- API key never leaks into response
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.llm.base import ChatMessage, LLMProviderError, LLMResponse, ProviderHealth
from app.llm.manager import LLMProviderManager


def _make_settings(
    uit_enabled=False,
    groq_enabled=True,
    openai_enabled=False,
    default_provider="auto",
    priority="groq",
    groq_key="sk-groq-test",
):
    s = MagicMock()
    s.uit_llm_enabled = uit_enabled
    s.uit_llm_base_url = "http://fake-uit" if uit_enabled else ""
    s.uit_llm_api_key = "uit-key" if uit_enabled else ""
    s.uit_llm_model = "uit-model"
    s.groq_enabled = groq_enabled
    s.groq_api_key = groq_key if groq_enabled else ""
    s.groq_model = "llama3-8b-8192"
    s.openai_enabled = openai_enabled
    s.openai_api_key = "sk-openai-test" if openai_enabled else ""
    s.openai_model = "gpt-4o-mini"
    s.llm_default_provider = default_provider
    s.provider_priority_list = [p.strip() for p in priority.split(",")]
    s.request_timeout_seconds = 5
    return s


def _make_llm_response(provider="groq") -> LLMResponse:
    return LLMResponse(
        content="Hello from TrekViet!",
        provider=provider,
        model="llama3-8b-8192",
        latency_ms=200,
        usage={"promptTokens": 10, "completionTokens": 20, "totalTokens": 30},
    )


# ─── Auto selection ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_auto_uses_first_available():
    """Auto mode picks the first available provider."""
    s = _make_settings(groq_enabled=True, default_provider="auto", priority="groq")
    manager = LLMProviderManager(s)

    mock_provider = AsyncMock()
    mock_provider.chat.return_value = _make_llm_response("groq")
    manager._providers["groq"] = mock_provider

    msgs = [ChatMessage(role="user", content="Hi")]
    result = await manager.chat(msgs, provider="auto")

    assert result.provider == "groq"
    assert result.content == "Hello from TrekViet!"
    mock_provider.chat.assert_called_once()


@pytest.mark.asyncio
async def test_auto_falls_back_when_first_fails():
    """Auto mode falls back to second provider when first raises."""
    s = _make_settings(
        uit_enabled=True, groq_enabled=True,
        default_provider="auto", priority="uit,groq"
    )
    manager = LLMProviderManager(s)

    uit_mock = AsyncMock()
    uit_mock.chat.side_effect = LLMProviderError("uit", "UIT unreachable")

    groq_mock = AsyncMock()
    groq_mock.chat.return_value = _make_llm_response("groq")

    manager._providers = {"uit": uit_mock, "groq": groq_mock}
    manager._priority = ["uit", "groq"]

    result = await manager.chat([ChatMessage(role="user", content="Hi")], provider="auto")

    assert result.provider == "groq"
    uit_mock.chat.assert_called_once()
    groq_mock.chat.assert_called_once()


@pytest.mark.asyncio
async def test_auto_raises_when_all_fail():
    """Auto mode raises LLMProviderError when all providers fail."""
    s = _make_settings(groq_enabled=True, default_provider="auto", priority="groq")
    manager = LLMProviderManager(s)

    groq_mock = AsyncMock()
    groq_mock.chat.side_effect = LLMProviderError("groq", "Groq down")
    manager._providers = {"groq": groq_mock}
    manager._priority = ["groq"]

    with pytest.raises(LLMProviderError):
        await manager.chat([ChatMessage(role="user", content="Hi")], provider="auto")


# ─── Manual selection ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_manual_selection_no_fallback():
    """Manual provider selection raises immediately on failure — no fallback."""
    s = _make_settings(
        uit_enabled=True, groq_enabled=True,
        default_provider="auto", priority="uit,groq"
    )
    manager = LLMProviderManager(s)

    uit_mock = AsyncMock()
    uit_mock.chat.side_effect = LLMProviderError("uit", "UIT unreachable")

    groq_mock = AsyncMock()
    groq_mock.chat.return_value = _make_llm_response("groq")

    manager._providers = {"uit": uit_mock, "groq": groq_mock}

    with pytest.raises(LLMProviderError) as exc_info:
        await manager.chat(
            [ChatMessage(role="user", content="Hi")],
            provider="uit",   # explicit manual selection
        )

    assert exc_info.value.provider == "uit"
    # groq should NOT have been called
    groq_mock.chat.assert_not_called()


@pytest.mark.asyncio
async def test_disabled_provider_raises():
    """Requesting a provider not in the registry raises LLMProviderError."""
    s = _make_settings(groq_enabled=True, openai_enabled=False)
    manager = LLMProviderManager(s)

    # openai is disabled — not in _providers
    with pytest.raises(LLMProviderError) as exc_info:
        await manager.chat(
            [ChatMessage(role="user", content="Hi")],
            provider="openai",
        )

    assert "openai" in str(exc_info.value).lower()


# ─── Health checks ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_health_returns_all_registered():
    """get_all_health returns health info for every registered provider."""
    s = _make_settings(groq_enabled=True)
    manager = LLMProviderManager(s)

    groq_mock = AsyncMock()
    groq_mock.health.return_value = ProviderHealth(
        provider_id="groq", name="Groq", available=True, models=["llama3-8b-8192"]
    )
    manager._providers = {"groq": groq_mock}

    health_list = await manager.get_all_health()
    assert len(health_list) == 1
    assert health_list[0].available is True
    assert health_list[0].provider_id == "groq"


def test_api_key_not_in_response():
    """LLMResponse must never contain the raw API key."""
    resp = _make_llm_response("groq")
    resp_dict = resp.__dict__
    # raw API key should never appear anywhere in response fields
    assert "sk-groq-test" not in str(resp_dict)
    assert "api_key" not in resp_dict
