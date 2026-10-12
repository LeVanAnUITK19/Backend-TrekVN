"""
Assistant API endpoints.

Spec (Admin Web) paths — mounted under /agent:
  POST   /agent/conversations
  GET    /agent/conversations
  GET    /agent/conversations/:id
  PATCH  /agent/conversations/:id        ← đổi tên conversation
  DELETE /agent/conversations/:id
  POST   /agent/conversations/:id/messages

Legacy paths (backward compat):
  POST   /assistant/conversations  → same handlers
  GET    /assistant/conversations  → same handlers
  ...
"""

from __future__ import annotations

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.responses import JSONResponse

from app.config import Settings, get_settings
from app.db.repositories.agent_runs import AgentRunRepository
from app.db.repositories.conversations import ConversationRepository
from app.db.repositories.messages import MessageRepository
from app.db.repositories.pending_approvals import PendingApprovalRepository
from app.dependencies import (
    get_agent_run_repo,
    get_conversation_repo,
    get_current_admin,
    get_message_repo,
    get_pending_approval_repo,
)
from app.llm.manager import get_llm_manager
from app.schemas.assistant import (
    ApproveActionRequest,
    CreateConversationRequest,
    RejectActionRequest,
    RenameConversationRequest,
    SendMessageRequest,
)
from app.utils.serialize import _convert

from ..assistant.service import AssistantService

logger = logging.getLogger(__name__)

# Spec-aligned router — mounted at /agent by router.py
router = APIRouter(prefix="/agent", tags=["Agent Assistant"])

# Legacy router — keeps old /assistant/* paths working
legacy_router = APIRouter(prefix="/assistant", tags=["Assistant (legacy)"])


def _make_response(data: Any, status_code: int = 200) -> JSONResponse:
    """Serialize any data (including datetime/ObjectId) safely via _convert."""
    return JSONResponse(
        status_code=status_code,
        content={"success": True, "data": _convert(data)},
    )


def _get_service(
    settings: Settings = Depends(get_settings),
    conv_repo: ConversationRepository = Depends(get_conversation_repo),
    msg_repo: MessageRepository = Depends(get_message_repo),
    run_repo: AgentRunRepository = Depends(get_agent_run_repo),
    approval_repo: PendingApprovalRepository = Depends(get_pending_approval_repo),
) -> AssistantService:
    return AssistantService(
        settings=settings,
        llm_manager=get_llm_manager(),
        conversation_repo=conv_repo,
        message_repo=msg_repo,
        agent_run_repo=run_repo,
        pending_approval_repo=approval_repo,
    )


# ── Conversations ─────────────────────────────────────────────────────────────


@router.post("/conversations", status_code=status.HTTP_201_CREATED)
@legacy_router.post("/conversations", status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def create_conversation(
    body: CreateConversationRequest,
    admin: Annotated[dict, Depends(get_current_admin)],
    svc: AssistantService = Depends(_get_service),
) -> JSONResponse:
    conv = await svc.create_conversation(
        admin_id=admin["userId"],
        title=body.title,
        provider=body.provider,
        model=body.model,
    )
    return _make_response(conv, status_code=201)


@router.get("/conversations")
@legacy_router.get("/conversations", include_in_schema=False)
async def list_conversations(
    admin: Annotated[dict, Depends(get_current_admin)],
    svc: AssistantService = Depends(_get_service),
    status_filter: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
) -> JSONResponse:
    result = await svc.list_conversations(
        admin_id=admin["userId"],
        status=status_filter,
        page=page,
        limit=limit,
    )
    return _make_response(result)


@router.get("/conversations/{conversation_id}")
@legacy_router.get("/conversations/{conversation_id}", include_in_schema=False)
async def get_conversation(
    conversation_id: str,
    admin: Annotated[dict, Depends(get_current_admin)],
    svc: AssistantService = Depends(_get_service),
) -> JSONResponse:
    conv = await svc.get_conversation(conversation_id, admin["userId"])
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CONVERSATION_NOT_FOUND", "message": "Conversation không tồn tại"},
        )
    return _make_response(conv)


@router.patch("/conversations/{conversation_id}")
async def rename_conversation(
    conversation_id: str,
    body: RenameConversationRequest,
    admin: Annotated[dict, Depends(get_current_admin)],
    svc: AssistantService = Depends(_get_service),
) -> JSONResponse:
    """PATCH /agent/conversations/:id — đổi tên conversation."""
    result = await svc.rename_conversation(
        conversation_id=conversation_id,
        admin_id=admin["userId"],
        title=body.title,
    )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CONVERSATION_NOT_FOUND", "message": "Conversation không tồn tại"},
        )
    return _make_response(result)


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    admin: Annotated[dict, Depends(get_current_admin)],
    svc: AssistantService = Depends(_get_service),
) -> JSONResponse:
    """DELETE /agent/conversations/:id."""
    deleted = await svc.delete_conversation(
        conversation_id=conversation_id,
        admin_id=admin["userId"],
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CONVERSATION_NOT_FOUND", "message": "Conversation không tồn tại"},
        )
    return JSONResponse(status_code=200, content={"success": True})


# ── Messages ──────────────────────────────────────────────────────────────────


@router.get("/conversations/{conversation_id}/messages")
@legacy_router.get("/conversations/{conversation_id}/messages", include_in_schema=False)
async def list_messages(
    conversation_id: str,
    admin: Annotated[dict, Depends(get_current_admin)],
    svc: AssistantService = Depends(_get_service),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
) -> JSONResponse:
    result = await svc.list_messages(conversation_id, admin["userId"], page=page, limit=limit)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CONVERSATION_NOT_FOUND", "message": "Conversation không tồn tại"},
        )
    return _make_response(result)


@router.post("/conversations/{conversation_id}/messages")
@legacy_router.post("/conversations/{conversation_id}/messages", include_in_schema=False)
async def send_message(
    conversation_id: str,
    body: SendMessageRequest,
    admin: Annotated[dict, Depends(get_current_admin)],
    svc: AssistantService = Depends(_get_service),
) -> JSONResponse:
    # get_current_admin đã verify token và trả về trong admin["_token"]
    admin_token = admin.get("_token")
    logger.info("send_message: admin_token present=%s", bool(admin_token))
    
    try:
        result = await svc.send_message(
            conversation_id=conversation_id,
            admin_id=admin["userId"],
            content=body.content,
            provider=body.provider,
            model=body.model,
            admin_token=admin_token,  # <-- Truyền token vào service
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CONVERSATION_NOT_FOUND", "message": str(exc)},
        )
    except Exception as exc:
        logger.exception("send_message unexpected error conv=%s: %s", conversation_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INTERNAL_ERROR", "message": str(exc)},
        )
    return _make_response(result)



# ── Badge Approval Actions ────────────────────────────────────────────────────


@router.post("/conversations/{conversation_id}/approve")
async def approve_action(
    conversation_id: str,
    body: ApproveActionRequest,
    admin: Annotated[dict, Depends(get_current_admin)],
    svc: AssistantService = Depends(_get_service),
) -> JSONResponse:
    """
    POST /agent/conversations/:id/approve
    Admin approves a pending badge write action proposed by the agent.
    Executes the actual write to trekking-service.
    """
    admin_token = admin.get("_token")
    if not admin_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHORIZED", "message": "Token không hợp lệ"},
        )
    try:
        result = await svc.approve_action(
            conversation_id=conversation_id,
            admin_id=admin["userId"],
            approval_id=body.approval_id,
            admin_token=admin_token,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": str(exc)},
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "BAD_REQUEST", "message": str(exc)},
        )
    except Exception as exc:
        logger.exception("approve_action error conv=%s approval=%s", conversation_id, body.approval_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INTERNAL_ERROR", "message": str(exc)},
        )
    return _make_response(result)


@router.post("/conversations/{conversation_id}/reject")
async def reject_action(
    conversation_id: str,
    body: RejectActionRequest,
    admin: Annotated[dict, Depends(get_current_admin)],
    svc: AssistantService = Depends(_get_service),
) -> JSONResponse:
    """
    POST /agent/conversations/:id/reject
    Admin rejects a pending badge write action — no write is performed.
    """
    try:
        result = await svc.reject_action(
            conversation_id=conversation_id,
            admin_id=admin["userId"],
            approval_id=body.approval_id,
            reason=body.reason,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": str(exc)},
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "BAD_REQUEST", "message": str(exc)},
        )
    except Exception as exc:
        logger.exception("reject_action error conv=%s approval=%s", conversation_id, body.approval_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INTERNAL_ERROR", "message": str(exc)},
        )
    return _make_response(result)
