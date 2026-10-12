"""
AI Assistant service.

Handles:
- Create conversation
- Send message (user → LLM → persist response)
- Persist conversation history
- Return provider/model/latency metadata
- Badge write with admin approval gate

Badge write flow:
  1. Agent proposes via propose_badge_create / propose_badge_update tool.
  2. Tool returns ToolResult with data['pending_approval'] = True.
  3. AssistantService detects this, persists a pending_approvals document,
     and returns a special PENDING_APPROVAL content block in the assistant message.
  4. Admin sees an approval card in the chat UI and clicks Approve or Reject.
  5. approve_action() / reject_action() are called by the API layer.
  6. On approve: execute_approved_action() calls TrekkingWriteClient.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.config import Settings
from app.db.repositories.agent_runs import AgentRunRepository
from app.db.repositories.conversations import ConversationRepository
from app.db.repositories.messages import MessageRepository
from app.db.repositories.pending_approvals import PendingApprovalRepository
from app.llm.base import LLMProviderError
from app.llm.manager import LLMProviderManager
from app.utils.ids import new_uuid
from app.utils.time import hours_from_now, utcnow

from .context import build_llm_messages
from .tools import (
    GetBadgesTool,
    GetCheckinStatsTool,
    GetContributionsTool,
    GetMilestonesTool,
    GetPlaceReviewsTool,
    GetPlaceTool,
    GetPlaceVisitStatsTool,
    GetProvincesTool,
    GetRankDistributionTool,
    GetRanksTool,
    GetRouteTool,
    GetRoutesByPlaceTool,
    GetSystemOverviewTool,
    GetUserStatisticsTool,
    GetUserSummaryTool,
    ListKnowledgeDocumentsTool,
    ProposeBadgeCreateTool,
    ProposeBadgeUpdateTool,
    ReadKnowledgeDocumentTool,
    SearchKnowledgeTool,
    SearchPlacesTool,
    SearchUsersTool,
)
from .tools.base import BaseAssistantTool

logger = logging.getLogger(__name__)

# Max context messages pulled from DB per request
_MAX_CONTEXT_MESSAGES = 20
# Agent run TTL
_RUN_TTL_HOURS = 90 * 24


class AssistantService:
    def __init__(
        self,
        settings: Settings,
        llm_manager: LLMProviderManager,
        conversation_repo: ConversationRepository,
        message_repo: MessageRepository,
        agent_run_repo: AgentRunRepository,
        pending_approval_repo: Optional[PendingApprovalRepository] = None,
    ):
        self._settings = settings
        self._llm = llm_manager
        self._conversations = conversation_repo
        self._messages = message_repo
        self._runs = agent_run_repo
        self._approvals = pending_approval_repo

        # Instantiate ALL tools (knowledge + production read + badge write proposals)
        self._tools: list[BaseAssistantTool] = [
            # Knowledge tools
            ListKnowledgeDocumentsTool(),
            SearchKnowledgeTool(),
            ReadKnowledgeDocumentTool(),
            # Trekking tools
            SearchPlacesTool(settings),
            GetPlaceTool(settings),
            GetRoutesByPlaceTool(settings),
            GetRouteTool(settings),
            GetMilestonesTool(settings),
            GetPlaceReviewsTool(settings),
            GetBadgesTool(settings),
            GetContributionsTool(settings),
            # Checkin tools
            GetProvincesTool(settings),
            GetCheckinStatsTool(settings),
            GetPlaceVisitStatsTool(settings),
            # User / gamification tools
            SearchUsersTool(settings),
            GetUserSummaryTool(settings),
            GetUserStatisticsTool(settings),
            GetRanksTool(settings),
            GetRankDistributionTool(settings),
            # Analytics
            GetSystemOverviewTool(settings),
            # Badge write proposals (require admin approval before execution)
            ProposeBadgeCreateTool(),
            ProposeBadgeUpdateTool(),
        ]
        self._tool_map = {tool.name: tool for tool in self._tools}

    # ── Conversations ─────────────────────────────────────────────────────

    async def create_conversation(
        self,
        admin_id: str,
        title: Optional[str] = None,
        provider: Optional[str] = None,
        model: Optional[str] = None,
    ) -> dict[str, Any]:
        conv_id = new_uuid()
        doc = {
            "conversationId": conv_id,
            "adminId": admin_id,
            "title": title or "Cuộc hội thoại mới",
            "status": "ACTIVE",
            "selectedProvider": provider,
            "selectedModel": model,
            "messageCount": 0,
            "lastMessageAt": None,
            "summary": None,
        }
        return await self._conversations.create(doc)

    async def list_conversations(
        self,
        admin_id: str,
        status: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
    ) -> dict[str, Any]:
        skip = (page - 1) * limit
        items = await self._conversations.find_by_admin(admin_id, status=status, skip=skip, limit=limit)
        total = await self._conversations.count_by_admin(admin_id, status=status)
        return {"items": items, "total": total, "page": page, "limit": limit}

    async def get_conversation(
        self, conversation_id: str, admin_id: str
    ) -> Optional[dict[str, Any]]:
        conv = await self._conversations.find_by_id(conversation_id)
        if not conv or conv["adminId"] != admin_id:
            return None
        return conv

    # ── Messages ──────────────────────────────────────────────────────────

    async def send_message(
        self,
        conversation_id: str,
        admin_id: str,
        content: str,
        provider: Optional[str] = None,
        model: Optional[str] = None,
        admin_token: Optional[str] = None,  # <-- ADD: Bearer token của admin
    ) -> dict[str, Any]:
        """
        Persist user message → call LLM → persist assistant response.
        Returns assistant message with LLM metadata.

        SECURITY: this method has no write tools — it cannot create/update
        production places, routes, or any other production data.
        """
        # 1. Verify conversation exists and belongs to this admin
        conv = await self._conversations.find_by_id(conversation_id)
        if not conv or conv["adminId"] != admin_id:
            raise ValueError(f"Conversation {conversation_id} not found")

        # Resolve provider: use conversation-level default if not overridden per-message
        resolved_provider = provider or conv.get("selectedProvider") or "auto"
        resolved_model = model or conv.get("selectedModel")

        now = utcnow()

        # 2. Persist user message
        user_msg_id = new_uuid()
        user_msg = {
            "messageId": user_msg_id,
            "conversationId": conversation_id,
            "adminId": admin_id,
            "role": "USER",
            "content": content,
            "llm": None,
            "toolCalls": None,
            "error": None,
            "createdAt": now,
        }
        await self._messages.create(user_msg)
        await self._conversations.increment_message_count(conversation_id, now)

        # 3. Build LLM context from recent history (excluding the message we just saved)
        history = await self._messages.find_recent_for_context(
            conversation_id,
            max_messages=self._settings.assistant_max_context_messages,
        )
        # history already includes the new user message since we just inserted it;
        # but find_recent_for_context filters out SYSTEM role and returns sorted ascending.
        # Exclude the very last one (the user msg we just saved) to avoid duplication
        # because build_llm_messages appends new_user_content separately.
        prior_history = [m for m in history if m["messageId"] != user_msg_id]

        llm_messages = build_llm_messages(
            prior_history,
            new_user_content=content,
            max_messages=self._settings.assistant_max_context_messages,
        )

        # 4. Create agent run record
        run_id = new_uuid()
        run_doc = {
            "agentRunId": run_id,
            "runType": "ASSISTANT_CHAT",
            "conversationId": conversation_id,
            "workflowId": None,
            "adminId": admin_id,
            "provider": resolved_provider,
            "model": resolved_model,
            "status": "RUNNING",
            "startedAt": now,
            "expiresAt": hours_from_now(_RUN_TTL_HOURS),
        }
        await self._runs.create(run_doc)

        # 5. Call LLM with ReAct tool use loop
        llm_error: Optional[dict] = None
        assistant_content = ""
        llm_meta: Optional[dict] = None
        tool_summary: list = []

        try:
            from app.llm.base import ChatMessage
            from app.assistant.react_parser import extract_tool_calls, strip_tool_calls, is_pure_tool_call

            # Build tool schemas (for providers that support native function calling)
            tool_schemas = [tool.get_schema() for tool in self._tools]

            # Initial LLM call
            llm_resp = await self._llm.chat(
                llm_messages,
                provider=resolved_provider,
                model=resolved_model,
                max_tokens=self._settings.assistant_max_output_tokens,
                tools=tool_schemas if tool_schemas else None,
            )

            llm_meta = {
                "provider": llm_resp.provider,
                "model": llm_resp.model,
                "latencyMs": llm_resp.latency_ms,
                "usage": llm_resp.usage,
            }

            # ReAct loop — handles both:
            #   a) Native function calling (llm_resp.tool_calls populated)
            #   b) Text-format tool calls from providers without function calling
            max_iterations = 5
            current_messages = list(llm_messages)

            for iteration in range(max_iterations):
                # Detect tool calls — native first, then text-format
                native_tool_calls = llm_resp.tool_calls or []
                text_tool_calls = extract_tool_calls(llm_resp.content) if not native_tool_calls else []
                all_tool_calls = native_tool_calls or text_tool_calls

                if not all_tool_calls:
                    # No tool calls → final answer
                    assistant_content = llm_resp.content
                    break

                logger.info(
                    "ReAct iteration %d: %d tool call(s) detected (native=%d, text=%d)",
                    iteration + 1, len(all_tool_calls), len(native_tool_calls), len(text_tool_calls),
                )

                # Execute each tool
                tool_result_parts: list[str] = []
                pending_approvals_this_turn: list[dict] = []

                for tc in all_tool_calls:
                    tool_name = tc.get("name", "")
                    tool_args = tc.get("arguments") or {}

                    tool = self._tool_map.get(tool_name)
                    if not tool:
                        result_text = f"[TOOL RESULT: {tool_name}]\nError: Tool '{tool_name}' không tồn tại."
                        logger.warning("Tool not found: %s", tool_name)
                    else:
                        try:
                            # Inject admin token vào tool kwargs để client có thể dùng
                            tool_kwargs = {**tool_args, "_user_token": admin_token}
                            result = await tool.run(**tool_kwargs)
                            import json as _json

                            # ── Detect pending approval from write-propose tools ──
                            if (
                                result.success
                                and isinstance(result.data, dict)
                                and result.data.get("pending_approval") is True
                            ):
                                approval_data = result.data
                                approval_id = approval_data["approval_id"]

                                # Persist to DB if repo is available
                                if self._approvals is not None:
                                    approval_doc = {
                                        "approvalId": approval_id,
                                        "conversationId": conversation_id,
                                        "adminId": admin_id,
                                        "action": approval_data["action"],
                                        "payload": approval_data["payload"],
                                        "display": approval_data["display"],
                                        "status": "PENDING",
                                    }
                                    await self._approvals.create(approval_doc)
                                    logger.info(
                                        "Pending approval persisted: id=%s action=%s",
                                        approval_id, approval_data["action"],
                                    )

                                pending_approvals_this_turn.append(approval_data)
                                # Tell LLM that approval was queued
                                result_text = (
                                    f"[TOOL RESULT: {tool_name}]\n"
                                    f"Đã gửi yêu cầu phê duyệt (approval_id={approval_id}). "
                                    f"Hành động sẽ được thực hiện sau khi Admin xác nhận."
                                )
                                tool_summary.append({
                                    "tool": tool_name,
                                    "args": tool_args,
                                    "success": True,
                                    "pendingApproval": True,
                                    "approvalId": approval_id,
                                })
                            else:
                                result_data = _json.dumps(result.data, ensure_ascii=False, default=str) if result.success else str(result.error)
                                # Truncate large results to prevent context overflow
                                if len(result_data) > 3000:
                                    result_data = result_data[:3000] + "\n... (truncated)"
                                result_text = f"[TOOL RESULT: {tool_name}]\n{result_data}"
                                tool_summary.append({
                                    "tool": tool_name,
                                    "args": tool_args,
                                    "success": result.success,
                                })
                            logger.info("Tool %s executed successfully", tool_name)
                        except Exception as exc:
                            result_text = f"[TOOL RESULT: {tool_name}]\nError: {str(exc)}"
                            tool_summary.append({"tool": tool_name, "args": tool_args, "success": False, "error": str(exc)})
                            logger.error("Tool %s failed: %s", tool_name, exc)

                    tool_result_parts.append(result_text)

                # Feed tool results back to LLM
                # Append: assistant turn (what AI said) + tool results as user turn
                current_messages.append(ChatMessage(role="assistant", content=llm_resp.content or ""))
                tool_results_combined = "\n\n".join(tool_result_parts)
                current_messages.append(ChatMessage(role="user", content=tool_results_combined))

                # Call LLM again with results
                llm_resp = await self._llm.chat(
                    current_messages,
                    provider=resolved_provider,
                    model=resolved_model,
                    max_tokens=self._settings.assistant_max_output_tokens,
                    tools=tool_schemas if native_tool_calls else None,  # only pass tools if provider supports native
                )
                # Update meta with latest call's latency
                llm_meta["latencyMs"] += llm_resp.latency_ms
                if llm_resp.usage:
                    for k in ("promptTokens", "completionTokens", "totalTokens"):
                        llm_meta["usage"][k] = llm_meta["usage"].get(k, 0) + llm_resp.usage.get(k, 0)
            else:
                # Exceeded max iterations
                assistant_content = llm_resp.content
                logger.warning("ReAct loop hit max iterations (%d) for conversation %s", max_iterations, conversation_id)

        except LLMProviderError as exc:
            logger.error("LLM call failed for conversation %s: %s", conversation_id, exc)
            assistant_content = (
                "Xin lỗi, tôi đang gặp sự cố kết nối với LLM. "
                "Vui lòng thử lại hoặc chọn provider khác."
            )
            llm_error = {"code": "LLM_PROVIDER_ERROR", "message": str(exc), "provider": exc.provider}

        # 6. Persist assistant message
        asst_msg_id = new_uuid()
        asst_msg_created_at = utcnow()
        # Gather all pending approvals from tool_summary for embedding in response
        pending_approvals_in_response = [
            ts for ts in tool_summary if ts.get("pendingApproval") is True
        ]
        # Fetch full display data for each pending approval
        pending_approval_cards: list[dict] = []
        if pending_approvals_in_response and self._approvals is not None:
            for pa in pending_approvals_in_response:
                approval_doc = await self._approvals.find_by_id(pa["approvalId"])
                if approval_doc:
                    pending_approval_cards.append({
                        "approvalId": approval_doc["approvalId"],
                        "action": approval_doc["action"],
                        "display": approval_doc["display"],
                        "status": approval_doc["status"],
                    })

        asst_msg = {
            "messageId": asst_msg_id,
            "conversationId": conversation_id,
            "adminId": admin_id,
            "role": "ASSISTANT",
            "content": assistant_content,
            "llm": llm_meta,
            "toolCalls": tool_summary if tool_summary else None,
            "pendingApprovals": pending_approval_cards if pending_approval_cards else None,
            "error": llm_error,
            "createdAt": asst_msg_created_at,
        }
        await self._messages.create(asst_msg)
        await self._conversations.increment_message_count(conversation_id, asst_msg_created_at)

        # 7. Finish agent run
        await self._runs.finish(
            run_id,
            status="SUCCESS" if not llm_error else "FAILED",
            error=llm_error,
            usage=llm_meta.get("usage") if llm_meta else None,
            tool_summary=tool_summary if tool_summary else None,
        )

        return {
            "userMessage": {
                "id": user_msg_id,
                "role": "user",
                "content": content,
                "createdAt": now.isoformat(),
            },
            "assistantMessage": {
                "id": asst_msg_id,
                "role": "assistant",
                "content": assistant_content,
                "pendingApprovals": pending_approval_cards if pending_approval_cards else None,
                "createdAt": asst_msg_created_at.isoformat(),
            },
            "message": {  # Keep for backward compatibility
                "id": asst_msg_id,
                "role": "assistant",
                "content": assistant_content,
                "createdAt": asst_msg_created_at.isoformat(),
            },
            "llm": llm_meta or {"provider": "unknown", "model": "unknown", "latencyMs": 0},
        }

    async def list_messages(
        self,
        conversation_id: str,
        admin_id: str,
        page: int = 1,
        limit: int = 50,
    ) -> Optional[dict[str, Any]]:
        conv = await self._conversations.find_by_id(conversation_id)
        if not conv or conv["adminId"] != admin_id:
            return None
        skip = (page - 1) * limit
        items = await self._messages.find_by_conversation(conversation_id, limit=limit, skip=skip)
        return {"items": items, "total": conv.get("messageCount", 0), "page": page, "limit": limit}

    async def rename_conversation(
        self,
        conversation_id: str,
        admin_id: str,
        title: str,
    ) -> Optional[dict[str, Any]]:
        """PATCH /agent/conversations/:id — đổi tên conversation."""
        conv = await self._conversations.find_by_id(conversation_id)
        if not conv or conv["adminId"] != admin_id:
            return None
        updated = await self._conversations.update(
            conversation_id,
            {"title": title, "updatedAt": utcnow()},
        )
        return updated

    async def delete_conversation(
        self,
        conversation_id: str,
        admin_id: str,
    ) -> bool:
        """DELETE /agent/conversations/:id — xóa conversation và messages."""
        conv = await self._conversations.find_by_id(conversation_id)
        if not conv or conv["adminId"] != admin_id:
            return False
        await self._messages.delete_by_conversation(conversation_id)
        await self._conversations.delete(conversation_id)
        return True

    # ── Badge approval actions ────────────────────────────────────────────

    async def approve_action(
        self,
        conversation_id: str,
        admin_id: str,
        approval_id: str,
        admin_token: str,
    ) -> dict[str, Any]:
        """
        Execute a pending badge write action after admin approval.

        1. Verify the approval belongs to this admin + conversation.
        2. Call TrekkingWriteClient with the stored payload.
        3. Persist the result and mark approval as APPROVED.
        4. Return the created/updated badge.
        """
        from app.clients.trekking_write_client import TrekkingWriteClient

        if self._approvals is None:
            raise ValueError("Approval repository not available")

        approval = await self._approvals.find_by_id(approval_id)
        if not approval:
            raise ValueError(f"Approval {approval_id} not found")
        if approval["adminId"] != admin_id:
            raise PermissionError("Approval belongs to a different admin")
        if approval["conversationId"] != conversation_id:
            raise ValueError("Approval belongs to a different conversation")
        if approval["status"] != "PENDING":
            raise ValueError(f"Approval is already {approval['status']}")

        claimed = await self._approvals.claim(approval_id, admin_id, conversation_id, "EXECUTING")
        if not claimed:
            raise ValueError("Approval expired or already consumed")

        client = TrekkingWriteClient(self._settings, admin_token=admin_token)
        action = approval["action"]
        payload = approval["payload"]

        try:
            if action == "CREATE_BADGE":
                result = await client.create_badge(payload)
                logger.info(
                    "Badge created via approval: approval_id=%s badge_name=%s",
                    approval_id, payload.get("name"),
                )
            elif action == "UPDATE_BADGE":
                badge_id = payload["badge_id"]
                fields = payload.get("fields", {})
                status_value = payload.get("status")

                result = {}
                if fields:
                    result = await client.update_badge(badge_id, fields)
                if status_value:
                    result = await client.update_badge_status(badge_id, status_value)
                logger.info(
                    "Badge updated via approval: approval_id=%s badge_id=%s",
                    approval_id, badge_id,
                )
            else:
                raise ValueError(f"Unknown action: {action}")

        except Exception as exc:
            await self._approvals.update_status(
                approval_id, "FAILED", result={"error": str(exc)}
            )
            raise

        await self._approvals.update_status(approval_id, "APPROVED", result=result)
        return {
            "approvalId": approval_id,
            "action": action,
            "status": "APPROVED",
            "result": result,
        }

    async def reject_action(
        self,
        conversation_id: str,
        admin_id: str,
        approval_id: str,
        reason: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Reject a pending badge write action — no write is performed.
        """
        if self._approvals is None:
            raise ValueError("Approval repository not available")

        approval = await self._approvals.find_by_id(approval_id)
        if not approval:
            raise ValueError(f"Approval {approval_id} not found")
        if approval["adminId"] != admin_id:
            raise PermissionError("Approval belongs to a different admin")
        if approval["conversationId"] != conversation_id:
            raise ValueError("Approval belongs to a different conversation")
        if approval["status"] != "PENDING":
            raise ValueError(f"Approval is already {approval['status']}")

        claimed = await self._approvals.claim(approval_id, admin_id, conversation_id, "REJECTED")
        if not claimed:
            raise ValueError("Approval expired or already consumed")

        await self._approvals.update_status(
            approval_id, "REJECTED", result={"reason": reason or "Admin từ chối"}
        )
        logger.info("Approval rejected: approval_id=%s reason=%s", approval_id, reason)
        return {
            "approvalId": approval_id,
            "action": approval["action"],
            "status": "REJECTED",
            "reason": reason or "Admin từ chối",
        }
