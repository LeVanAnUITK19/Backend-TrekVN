"""
FastAPI dependency functions.

Provides: current admin user (from verified JWT), DB repositories.
"""

from __future__ import annotations

import logging
from typing import Annotated, Any

import httpx
from fastapi import Depends, Header, HTTPException, status

from app.config import Settings, get_settings
from app.db.mongo import get_db
from app.db.repositories.agent_runs import AgentRunRepository
from app.db.repositories.conversations import ConversationRepository
from app.db.repositories.map_jobs import MapJobRepository
from app.db.repositories.messages import MessageRepository
from app.db.repositories.pending_approvals import PendingApprovalRepository
from app.db.repositories.place_candidates import PlaceCandidateRepository
from app.db.repositories.workflow_events import WorkflowEventRepository

logger = logging.getLogger(__name__)


# ── Auth ──────────────────────────────────────────────────────────────────────


async def get_current_admin(
    authorization: Annotated[str | None, Header()] = None,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """
    Verify Bearer token by calling auth-service GET /api/v1/auth/verify.
    Extract user info from JWT payload.
    Only ADMIN role is allowed.
    Returns dict with userId, role, email, and _token (for forwarding to other services).
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHORIZED", "message": "Thiếu token xác thực"},
        )

    token = authorization.split(" ", 1)[1]

    # Verify with auth-service
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{settings.auth_service_url}/api/v1/auth/verify",
                headers={"Authorization": f"Bearer {token}"},
            )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "SERVICE_UNAVAILABLE", "message": "Auth service timeout"},
        )
    except Exception as exc:
        logger.error("Auth verify network error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "SERVICE_UNAVAILABLE", "message": "Auth service unavailable"},
        )

    if resp.status_code == 401 or resp.status_code == 403:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHORIZED", "message": "Token không hợp lệ hoặc đã hết hạn"},
        )

    if not resp.is_success:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "SERVICE_UNAVAILABLE", "message": "Dịch vụ tạm thời không khả dụng"},
        )

    # Decode JWT payload locally to get role (auth-service already validated sig)
    import jwt as jwt_lib  # PyJWT

    try:
        payload = jwt_lib.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            options={"verify_exp": True},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHORIZED", "message": "Token không hợp lệ"},
        )

    verified = resp.json().get("data", {})
    user_id = verified.get("id") or verified.get("sub") or verified.get("userId")
    role = verified.get("role", "USER")
    email = verified.get("email")
    token_user_id = payload.get("sub") or payload.get("id") or payload.get("userId")
    if not user_id or str(user_id) != str(token_user_id):
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "message": "Token không hợp lệ"})

    if role != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "Chỉ Admin mới có quyền truy cập"},
        )

    return {
        "userId": str(user_id),
        "role": role,
        "email": email,
        "_token": token,  # <-- ADD: lưu token để forward xuống services
    }


# ── Repositories ──────────────────────────────────────────────────────────────


def get_conversation_repo() -> ConversationRepository:
    return ConversationRepository(get_db())


def get_message_repo() -> MessageRepository:
    return MessageRepository(get_db())


def get_agent_run_repo() -> AgentRunRepository:
    return AgentRunRepository(get_db())


def get_place_candidate_repo() -> PlaceCandidateRepository:
    return PlaceCandidateRepository(get_db())


def get_map_job_repo() -> MapJobRepository:
    return MapJobRepository(get_db())


def get_workflow_event_repo() -> WorkflowEventRepository:
    return WorkflowEventRepository(get_db())


def get_pending_approval_repo() -> PendingApprovalRepository:
    return PendingApprovalRepository(get_db())
