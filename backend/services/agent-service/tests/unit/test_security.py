from unittest.mock import AsyncMock, MagicMock, patch

import jwt
import pytest
from fastapi import HTTPException

from app.dependencies import get_current_admin
from app.assistant.service import AssistantService


@pytest.mark.asyncio
async def test_admin_guard_uses_current_role_from_auth_service(test_settings):
    token = jwt.encode({"id": "admin-1", "role": "ADMIN"}, test_settings.jwt_secret, algorithm="HS256")
    response = MagicMock(status_code=200, is_success=True)
    response.json.return_value = {"success": True, "data": {"id": "admin-1", "role": "USER"}}
    with patch("app.dependencies.httpx.AsyncClient") as client:
        client.return_value.__aenter__.return_value.get = AsyncMock(return_value=response)
        with pytest.raises(HTTPException) as error:
            await get_current_admin("Bearer " + token, test_settings)
    assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_already_consumed_approval_cannot_write(test_settings):
    approvals = AsyncMock()
    approvals.find_by_id.return_value = {"approvalId": "a", "adminId": "admin-1", "conversationId": "c", "status": "PENDING"}
    approvals.claim.return_value = None
    service = AssistantService(test_settings, MagicMock(), MagicMock(), MagicMock(), MagicMock(), approvals)
    with patch("app.clients.trekking_write_client.TrekkingWriteClient") as client:
        with pytest.raises(ValueError, match="consumed"):
            await service.approve_action("c", "admin-1", "a", "fake-token")
        client.assert_not_called()


@pytest.mark.asyncio
async def test_reject_requires_matching_conversation(test_settings):
    approvals = AsyncMock()
    approvals.find_by_id.return_value = {"adminId": "admin-1", "conversationId": "other", "status": "PENDING"}
    service = AssistantService(test_settings, MagicMock(), MagicMock(), MagicMock(), MagicMock(), approvals)
    with pytest.raises(ValueError, match="conversation"):
        await service.reject_action("c", "admin-1", "a")
    approvals.claim.assert_not_called()
