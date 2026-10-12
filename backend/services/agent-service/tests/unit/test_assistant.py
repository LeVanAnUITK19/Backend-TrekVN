"""
Unit tests for AI Assistant.

Tests:
- conversation creation persists to DB
- send_message persists user + assistant messages
- provider metadata is stored
- assistant has NO write tools
- system prompt contains hard boundaries
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.llm.base import LLMResponse


def _utcnow():
    return datetime.now(tz=timezone.utc)


def _make_mock_repos():
    conv_repo = AsyncMock()
    msg_repo = AsyncMock()
    run_repo = AsyncMock()
    return conv_repo, msg_repo, run_repo


def _make_llm_response(provider="groq") -> LLMResponse:
    return LLMResponse(
        content="Hệ thống TrekViet là...",
        provider=provider,
        model="llama3-8b-8192",
        latency_ms=350,
        usage={"promptTokens": 100, "completionTokens": 50, "totalTokens": 150},
    )


# ─── Conversation creation ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_conversation_persists(test_settings):
    from app.assistant.service import AssistantService

    conv_repo, msg_repo, run_repo = _make_mock_repos()
    now = _utcnow()
    expected_doc = {
        "conversationId": "conv-test-id",
        "adminId": "admin-1",
        "title": "Test conversation",
        "status": "ACTIVE",
        "messageCount": 0,
        "createdAt": now,
        "updatedAt": now,
    }
    conv_repo.create.return_value = expected_doc

    mock_llm = AsyncMock()
    svc = AssistantService(
        settings=test_settings,
        llm_manager=mock_llm,
        conversation_repo=conv_repo,
        message_repo=msg_repo,
        agent_run_repo=run_repo,
    )

    result = await svc.create_conversation(
        admin_id="admin-1", title="Test conversation"
    )

    conv_repo.create.assert_called_once()
    call_doc = conv_repo.create.call_args[0][0]
    assert call_doc["adminId"] == "admin-1"
    assert call_doc["status"] == "ACTIVE"


# ─── send_message persists history ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_send_message_persists_user_and_assistant(test_settings):
    from app.assistant.service import AssistantService

    conv_repo, msg_repo, run_repo = _make_mock_repos()
    now = _utcnow()

    conv_repo.find_by_id.return_value = {
        "conversationId": "conv-1",
        "adminId": "admin-1",
        "status": "ACTIVE",
        "selectedProvider": "auto",
        "selectedModel": None,
        "messageCount": 0,
    }
    msg_repo.find_recent_for_context.return_value = []
    msg_repo.create.return_value = {}
    conv_repo.increment_message_count.return_value = None
    run_repo.create.return_value = {}
    run_repo.find_by_id.return_value = {"startedAt": now}
    run_repo.finish.return_value = None

    mock_llm = AsyncMock()
    mock_llm.chat.return_value = _make_llm_response("groq")

    svc = AssistantService(
        settings=test_settings,
        llm_manager=mock_llm,
        conversation_repo=conv_repo,
        message_repo=msg_repo,
        agent_run_repo=run_repo,
    )

    result = await svc.send_message(
        conversation_id="conv-1",
        admin_id="admin-1",
        content="Hệ thống rank hoạt động thế nào?",
    )

    # Two messages should have been created: user + assistant
    assert msg_repo.create.call_count == 2
    # First call: user message
    user_msg = msg_repo.create.call_args_list[0][0][0]
    assert user_msg["role"] == "USER"
    assert user_msg["content"] == "Hệ thống rank hoạt động thế nào?"
    # Second call: assistant message
    asst_msg = msg_repo.create.call_args_list[1][0][0]
    assert asst_msg["role"] == "ASSISTANT"
    assert asst_msg["llm"] is not None
    assert asst_msg["llm"]["provider"] == "groq"


@pytest.mark.asyncio
async def test_send_message_stores_provider_metadata(test_settings):
    from app.assistant.service import AssistantService

    conv_repo, msg_repo, run_repo = _make_mock_repos()
    now = _utcnow()
    conv_repo.find_by_id.return_value = {
        "conversationId": "conv-1",
        "adminId": "admin-1",
        "status": "ACTIVE",
        "selectedProvider": "groq",
        "selectedModel": None,
        "messageCount": 2,
    }
    msg_repo.find_recent_for_context.return_value = []
    msg_repo.create.return_value = {}
    conv_repo.increment_message_count.return_value = None
    run_repo.create.return_value = {}
    run_repo.find_by_id.return_value = {"startedAt": now}
    run_repo.finish.return_value = None

    mock_llm = AsyncMock()
    mock_llm.chat.return_value = _make_llm_response("groq")

    svc = AssistantService(
        settings=test_settings,
        llm_manager=mock_llm,
        conversation_repo=conv_repo,
        message_repo=msg_repo,
        agent_run_repo=run_repo,
    )

    result = await svc.send_message(
        conversation_id="conv-1",
        admin_id="admin-1",
        content="Hỏi về hệ thống",
    )

    assert result["llm"]["provider"] == "groq"
    assert result["llm"]["latencyMs"] == 350
    # API key must never appear in the result
    assert "sk-groq" not in str(result)
    assert "api_key" not in str(result).lower()


# ─── Assistant has NO write tools ─────────────────────────────────────────────

def test_assistant_tools_only_read_or_propose_approved_badge_actions(test_settings):
    """Assistant tools cannot write directly; only badge proposals are permitted."""
    from app.assistant.service import AssistantService
    from app.assistant.tools.base import BaseAssistantTool

    mock_llm = MagicMock()
    svc = AssistantService(
        settings=test_settings,
        llm_manager=mock_llm,
        conversation_repo=MagicMock(),
        message_repo=MagicMock(),
        agent_run_repo=MagicMock(),
    )

    for tool in svc._tools:
        assert isinstance(tool, BaseAssistantTool)
        if tool.name in {"propose_badge_create", "propose_badge_update"}:
            assert tool.mode == "PROPOSE_WRITE"
        else:
            assert tool.mode == "READ_ONLY", f"Tool '{tool.name}' must be READ_ONLY"


@pytest.mark.asyncio
async def test_badge_proposals_require_approval_and_do_not_create_write_client():
    from app.assistant.tools.production.badge_write_tools import (
        ProposeBadgeCreateTool, ProposeBadgeUpdateTool,
    )
    from unittest.mock import patch

    with patch("app.clients.trekking_write_client.TrekkingWriteClient") as write_client:
        created = await ProposeBadgeCreateTool().run(
            code="HISTORY_TEST", name="History test", condition_type="CHECKIN_COUNT", condition_value=10,
        )
        updated = await ProposeBadgeUpdateTool().run(badge_id="badge-1", name="Updated badge")
        assert created.success and updated.success
        assert created.data["pending_approval"] is True
        assert updated.data["pending_approval"] is True
        assert created.data["action"] == "CREATE_BADGE"
        assert updated.data["action"] == "UPDATE_BADGE"
        assert created.data["approval_id"] and updated.data["approval_id"]
        write_client.assert_not_called()


# ─── System prompt boundaries ─────────────────────────────────────────────────

def test_system_prompt_contains_hard_boundaries():
    """System prompt must explicitly forbid production writes and workflow invocations."""
    from app.assistant.prompt import SYSTEM_PROMPT

    # Must NOT allow production writes
    assert "KHÔNG" in SYSTEM_PROMPT or "không" in SYSTEM_PROMPT
    # Must mention Place Builder restriction
    assert "Place Builder" in SYSTEM_PROMPT
    # Must mention Map Builder restriction
    assert "Map Builder" in SYSTEM_PROMPT
    # Must state read-only nature
    assert "read-only" in SYSTEM_PROMPT.lower() or "chỉ" in SYSTEM_PROMPT.lower()
