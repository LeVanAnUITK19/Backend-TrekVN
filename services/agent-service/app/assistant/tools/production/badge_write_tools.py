"""
Badge WRITE tools for the AI Assistant.

APPROVAL FLOW:
  1. Agent calls ProposeBadgeCreateTool or ProposeBadgeUpdateTool.
  2. Tool validates input and returns a PendingApprovalResult (NOT a ToolResult).
     The actual HTTP call to trekking-service is NOT made here.
  3. AssistantService detects PendingApprovalResult and:
     a. Persists the pending action in MongoDB.
     b. Returns a PENDING_APPROVAL message to the frontend with a unique approval_id.
  4. Admin sees an approval card in the chat UI with the proposed badge data.
  5. Admin clicks Approve → POST /agent/conversations/:id/approve?approval_id=...
     or Reject → POST /agent/conversations/:id/reject?approval_id=...
  6. On approve: AssistantService.execute_approved_action() calls TrekkingWriteClient.
  7. On reject: the pending action is marked REJECTED, no write happens.

Security:
  - Tool.run() never writes to production — it only validates and proposes.
  - The actual write in execute_approved_action() re-verifies admin token + capability.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from app.utils.ids import new_uuid

from ..base import BaseAssistantTool, ToolResult

logger = logging.getLogger(__name__)

# Valid condition types (mirrors trekking-service badge.validator.js)
_VALID_CONDITION_TYPES = {
    "CHECKIN_COUNT",
    "JOURNEY_COUNT",
    "PROVINCE_COUNT",
    "CONTRIBUTION_APPROVED",
    "SPECIFIC_PLACE",
    "ELEVATION_TOTAL",
    "DISTANCE_TOTAL",
}

_VALID_RARITY = {"COMMON", "RARE", "EPIC", "LEGENDARY"}
_VALID_STATUS = {"ACTIVE", "INACTIVE"}
# For update_badge_status endpoint — matches updateStatus Joi validator
_VALID_STATUS_UPDATE = {"ACTIVE", "INACTIVE", "DISABLED"}


# ── Pending Approval data structure ──────────────────────────────────────────

@dataclass
class PendingApprovalResult:
    """
    Returned by write tools instead of ToolResult.
    AssistantService detects this type and handles the approval flow.
    """
    approval_id: str
    action: str          # "CREATE_BADGE" | "UPDATE_BADGE"
    payload: dict        # The exact payload that will be sent to trekking-service
    display: dict        # Human-readable summary for the approval card
    tool_name: str


# ── Helpers ──────────────────────────────────────────────────────────────────

def _condition_label(ctype: str) -> str:
    return {
        "CHECKIN_COUNT": "Số lần check-in",
        "JOURNEY_COUNT": "Số hành trình hoàn thành",
        "PROVINCE_COUNT": "Số tỉnh đã đi",
        "CONTRIBUTION_APPROVED": "Đóng góp được duyệt",
        "SPECIFIC_PLACE": "Địa điểm cụ thể",
        "ELEVATION_TOTAL": "Tổng độ cao tích lũy (m)",
        "DISTANCE_TOTAL": "Tổng quãng đường (km)",
    }.get(ctype, ctype)


# ── ProposeBadgeCreateTool ────────────────────────────────────────────────────

class ProposeBadgeCreateTool(BaseAssistantTool):
    """
    Propose creating a new badge. Returns a pending approval request — does NOT
    write to the database immediately. Admin must approve in the chat UI.

    Use this when admin asks to create a badge or when suggesting new badges.
    """

    name = "propose_badge_create"
    description = (
        "Propose creating a new badge in the TrekViet gamification system. "
        "This does NOT create the badge immediately — it sends an approval request to the admin. "
        "Admin must click Approve in the chat to confirm. "
        "Use this when asked to create badges or suggest new ones.\n\n"
        "code: unique identifier, UPPERCASE letters/numbers/underscore only (e.g. EXPLORER_10)\n"
        "conditionType options: CHECKIN_COUNT, JOURNEY_COUNT, PROVINCE_COUNT, "
        "CONTRIBUTION_APPROVED, SPECIFIC_PLACE, ELEVATION_TOTAL, DISTANCE_TOTAL\n"
        "conditionValue: required integer >= 1 for ALL condition types\n"
        "rarity options: COMMON, RARE, EPIC, LEGENDARY (default: COMMON)\n"
        "status options: ACTIVE, INACTIVE (default: ACTIVE)"
    )
    mode = "PROPOSE_WRITE"
    parameters = {
        "type": "object",
        "properties": {
            "code": {
                "type": "string",
                "description": (
                    "Unique badge code — UPPERCASE letters, numbers and underscore only. "
                    "Example: EXPLORER_10, CONQUEROR_NORTH. Min 2, max 100 chars."
                ),
                "minLength": 2,
                "maxLength": 100,
            },
            "name": {
                "type": "string",
                "description": "Tên huy hiệu (VD: Nhà thám hiểm mới)",
                "minLength": 2,
            },
            "description": {
                "type": "string",
                "description": "Mô tả điều kiện đạt huy hiệu (tối đa 2000 ký tự)",
            },
            "condition_type": {
                "type": "string",
                "enum": list(_VALID_CONDITION_TYPES),
                "description": "Loại điều kiện",
            },
            "condition_value": {
                "type": "integer",
                "minimum": 1,
                "description": "Ngưỡng điều kiện — bắt buộc với MỌI loại điều kiện, kể cả SPECIFIC_PLACE",
            },
            "rarity": {
                "type": "string",
                "enum": list(_VALID_RARITY),
                "description": "Độ hiếm (mặc định COMMON)",
                "default": "COMMON",
            },
            "status": {
                "type": "string",
                "enum": list(_VALID_STATUS),
                "description": "Trạng thái ban đầu (mặc định ACTIVE)",
                "default": "ACTIVE",
            },
            "reason": {
                "type": "string",
                "description": "Lý do tạo huy hiệu này (AI sẽ giải thích cho admin)",
            },
        },
        "required": ["code", "name", "condition_type", "condition_value"],
    }

    async def run(
        self,
        code: str,
        name: str,
        condition_type: str,
        condition_value: int,
        description: Optional[str] = None,
        rarity: str = "COMMON",
        status: str = "ACTIVE",
        reason: Optional[str] = None,
        **kwargs: Any,
    ) -> ToolResult:
        start = time.monotonic()
        import re

        # ── Validation ────────────────────────────────────────────────────
        errors: list[str] = []

        # code: UPPERCASE, alphanumeric + underscore, 2-100 chars
        code_clean = code.strip().upper()
        if not re.match(r'^[A-Z0-9_]{2,100}$', code_clean):
            errors.append(
                "code chỉ được dùng chữ HOA, số và dấu _ (VD: EXPLORER_10). "
                "Không được có dấu cách hay ký tự đặc biệt."
            )

        if len(name.strip()) < 2:
            errors.append("Tên huy hiệu phải từ 2 ký tự")
        if condition_type not in _VALID_CONDITION_TYPES:
            errors.append(f"conditionType không hợp lệ: {condition_type}")
        if condition_value is None or condition_value < 1:
            errors.append("conditionValue phải ≥ 1")
        if rarity not in _VALID_RARITY:
            errors.append(f"rarity không hợp lệ: {rarity}. Dùng: COMMON, RARE, EPIC, LEGENDARY")
        if status not in _VALID_STATUS:
            errors.append(f"status không hợp lệ: {status}. Dùng: ACTIVE, INACTIVE")

        if errors:
            return ToolResult(
                name=self.name,
                success=False,
                error="Dữ liệu không hợp lệ:\n" + "\n".join(f"- {e}" for e in errors),
            )

        # ── Build payload (matches trekking-service createBadge Joi schema) ─
        # condition.value is required for ALL types per the validator
        condition: dict[str, Any] = {
            "type": condition_type,
            "value": condition_value,
        }

        api_payload: dict[str, Any] = {
            "code": code_clean,
            "name": name.strip(),
            "condition": condition,
            "rarity": rarity,
            "status": status,
        }
        if description and description.strip():
            api_payload["description"] = description.strip()

        # ── Build display for approval card ───────────────────────────────
        display = {
            "action": "CREATE_BADGE",
            "code": code_clean,
            "name": name.strip(),
            "description": (description or "").strip() or "—",
            "conditionType": condition_type,
            "conditionLabel": _condition_label(condition_type),
            "conditionValue": condition_value,
            "rarity": rarity,
            "status": status,
            "reason": reason or "Không có lý do bổ sung",
        }

        approval_id = new_uuid()
        duration_ms = int((time.monotonic() - start) * 1000)
        logger.info(
            "ProposeBadgeCreateTool: approval_id=%s code=%s name=%s duration_ms=%d",
            approval_id, code_clean, name, duration_ms,
        )

        return ToolResult(
            name=self.name,
            success=True,
            data={
                "pending_approval": True,
                "approval_id": approval_id,
                "action": "CREATE_BADGE",
                "payload": api_payload,
                "display": display,
            },
        )


# ── ProposeBadgeUpdateTool ────────────────────────────────────────────────────

class ProposeBadgeUpdateTool(BaseAssistantTool):
    """
    Propose updating an existing badge. Returns a pending approval request — does NOT
    write to the database immediately. Admin must approve in the chat UI.

    Use this when admin asks to edit/update an existing badge.
    Provide badge_id (badgeId from get_badges tool result) and only the fields to change.
    """

    name = "propose_badge_update"
    description = (
        "Propose updating an existing badge. Does NOT update immediately — sends an "
        "approval request to admin first. Admin must click Approve in the chat.\n"
        "Provide badge_id and only the fields to change.\n"
        "To get badge_id, use the get_badges tool first."
    )
    mode = "PROPOSE_WRITE"
    parameters = {
        "type": "object",
        "properties": {
            "badge_id": {
                "type": "string",
                "description": "Badge ID (từ kết quả get_badges)",
            },
            "badge_name_hint": {
                "type": "string",
                "description": "Tên badge (để hiển thị trong approval card)",
            },
            "name": {
                "type": "string",
                "description": "Tên mới (nếu muốn đổi)",
            },
            "description": {
                "type": "string",
                "description": "Mô tả mới (nếu muốn đổi)",
            },
            "condition_type": {
                "type": "string",
                "enum": list(_VALID_CONDITION_TYPES),
                "description": "Loại điều kiện mới (nếu muốn đổi)",
            },
            "condition_value": {
                "type": "integer",
                "minimum": 1,
                "description": "Ngưỡng mới",
            },
            "rarity": {
                "type": "string",
                "enum": list(_VALID_RARITY),
                "description": "Độ hiếm mới",
            },
            "status": {
                "type": "string",
                "enum": ["ACTIVE", "INACTIVE", "DISABLED"],
                "description": "Trạng thái mới — DISABLED chỉ dùng được qua endpoint /status riêng",
            },
            "reason": {
                "type": "string",
                "description": "Lý do chỉnh sửa",
            },
        },
        "required": ["badge_id"],
    }

    async def run(
        self,
        badge_id: str,
        badge_name_hint: Optional[str] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
        condition_type: Optional[str] = None,
        condition_value: Optional[int] = None,
        rarity: Optional[str] = None,
        status: Optional[str] = None,
        reason: Optional[str] = None,
        **kwargs: Any,
    ) -> ToolResult:
        start = time.monotonic()

        # ── Validation ────────────────────────────────────────────────────
        errors: list[str] = []
        if not badge_id or not badge_id.strip():
            errors.append("badge_id là bắt buộc")
        if name is not None and len(name.strip()) < 2:
            errors.append("Tên huy hiệu phải từ 2 ký tự")
        if description is not None and len(description.strip()) < 5:
            errors.append("Mô tả phải từ 5 ký tự")
        if condition_type is not None and condition_type not in _VALID_CONDITION_TYPES:
            errors.append(f"conditionType không hợp lệ: {condition_type}")
        if rarity is not None and rarity not in _VALID_RARITY:
            errors.append(f"rarity không hợp lệ: {rarity}")
        if status is not None and status not in _VALID_STATUS_UPDATE:
            errors.append(f"status không hợp lệ: {status}. Dùng: ACTIVE, INACTIVE, DISABLED")

        # Check at least one field to update
        update_fields = [name, description, condition_type, condition_value, rarity, status]
        if all(f is None for f in update_fields):
            errors.append("Phải cung cấp ít nhất một trường cần cập nhật")

        if errors:
            return ToolResult(
                name=self.name,
                success=False,
                error="Dữ liệu không hợp lệ:\n" + "\n".join(f"- {e}" for e in errors),
            )

        # ── Build payload ─────────────────────────────────────────────────
        # Split: fields payload vs status payload (trekking-service has separate endpoints)
        fields_payload: dict[str, Any] = {}
        if name:
            fields_payload["name"] = name.strip()
        if description:
            fields_payload["description"] = description.strip()
        if condition_type is not None or condition_value is not None:
            condition: dict[str, Any] = {}
            if condition_type:
                condition["type"] = condition_type
            # condition.value is required by updateBadge Joi schema when condition is provided
            if condition_value is not None and condition_value >= 0:
                condition["value"] = condition_value
            elif condition_type is not None and condition_value is None:
                # Warn: value not provided — will be rejected by trekking-service
                errors.append("conditionValue phải >= 1 khi thay đổi loại điều kiện")
            if condition:
                fields_payload["condition"] = condition
        if rarity:
            fields_payload["rarity"] = rarity

        if errors:
            return ToolResult(
                name=self.name,
                success=False,
                error="Dữ liệu không hợp lệ:\n" + "\n".join(f"- {e}" for e in errors),
            )

        # Build changes summary for display
        changes: list[str] = []
        if "name" in fields_payload:
            changes.append(f"Tên: → {fields_payload['name']}")
        if "description" in fields_payload:
            changes.append(f"Mô tả: → {fields_payload['description'][:60]}...")
        if "condition" in fields_payload:
            c = fields_payload["condition"]
            ctype = c.get("type", condition_type or "")
            cval = c.get("value", condition_value)
            changes.append(f"Điều kiện: {_condition_label(ctype)} = {cval}")
        if "rarity" in fields_payload:
            changes.append(f"Độ hiếm: → {rarity}")
        if status:
            changes.append(f"Trạng thái: → {status}")

        api_payload: dict[str, Any] = {
            "badge_id": badge_id.strip(),
            "fields": fields_payload,
        }
        if status:
            api_payload["status"] = status

        display = {
            "action": "UPDATE_BADGE",
            "badge_id": badge_id.strip(),
            "badge_name_hint": badge_name_hint or badge_id,
            "changes": changes,
            "reason": reason or "Không có lý do bổ sung",
            "fields_payload": fields_payload,
            "status": status,
        }

        approval_id = new_uuid()
        duration_ms = int((time.monotonic() - start) * 1000)
        logger.info(
            "ProposeBadgeUpdateTool: approval_id=%s badge_id=%s changes=%d duration_ms=%d",
            approval_id, badge_id, len(changes), duration_ms,
        )

        return ToolResult(
            name=self.name,
            success=True,
            data={
                "pending_approval": True,
                "approval_id": approval_id,
                "action": "UPDATE_BADGE",
                "payload": api_payload,
                "display": display,
            },
        )
