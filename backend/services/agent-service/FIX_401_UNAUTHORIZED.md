# Fix 401 Unauthorized - Agent Service

## Tóm tắt vấn đề

Agent gọi API `/api/v1/admin/badges` từ `trekking-service` nhưng nhận về **401 Unauthorized** vì không truyền Bearer token.

## Nguyên nhân

File `app/api/assistant.py` có **duplicate code** - có 2 bản của các endpoint. Bản thứ 2 (được Python sử dụng) **KHÔNG truyền `admin_token`** vào `svc.send_message()`.

## Thay đổi

### File: `app/api/assistant.py`

**ĐÃ XÓA:** Phần duplicate code (các định nghĩa endpoint bị lặp lại)

**ĐÃ SỬA:** Đảm bảo endpoint `send_message` truyền token:

```python
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
            admin_token=admin_token,  # ✅ Truyền token
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
```

## Flow xác thực (sau khi fix)

```
[Web Admin]
   ↓ Bearer token
[agent-service /api/v1/agent/conversations/:id/messages]
   ↓ get_current_admin() verifies token ✅
   ↓ returns {userId, role, email, _token} ✅
[assistant.py send_message()]
   ↓ admin_token = admin.get("_token") ✅
   ↓ svc.send_message(..., admin_token=admin_token) ✅
[AssistantService.send_message()]
   ↓ admin_token được truyền vào ✅
[Tool execution: get_badges(**tool_kwargs)]
   ↓ tool_kwargs = {**tool_args, "_user_token": admin_token} ✅
   ↓ user_token = kwargs.get("_user_token") ✅
[TrekkingReadClient.__init__(user_token=admin_token)]
   ↓ self._user_token = admin_token ✅
[TrekkingReadClient._headers()]
   ↓ if self._user_token: ✅ TRUE
   ↓     headers["Authorization"] = f"Bearer {self._user_token}" ✅
[HTTP Request to trekking-service]
   GET /api/v1/admin/badges
   Headers: Authorization: Bearer xxx ✅
   ↓
   200 OK ✅
```

## Test

1. **Khởi động lại agent-service:**
   ```bash
   cd services/agent-service
   # Stop existing process if running
   # Then start:
   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

2. **Test từ Web Admin:**
   - Đăng nhập với tài khoản ADMIN
   - Vào trang Agent Assistant
   - Gửi tin nhắn: "cho tui danh sách huy hiệu của app hiện tại"
   - Xem log agent-service, kỳ vọng:
     ```
     [INFO] send_message: admin_token present=True
     [INFO] SearchPlacesTool: user_token present=True
     [INFO] httpx: HTTP Request: GET http://localhost:3003/api/v1/admin/badges "HTTP/1.1 200 OK"
     [INFO] tool_call service=trekking tool=get_badges endpoint=get_badges duration_ms=XXX status=ok result_count=X
     ```

3. **Log kỳ vọng:**
   - ✅ `admin_token present=True`
   - ✅ `user_token present=True` trong tool
   - ✅ HTTP 200 OK (không còn 401)

## Các component đã được verify

| Component | Status | Ghi chú |
|-----------|--------|---------|
| `dependencies.py` | ✅ OK | `get_current_admin()` trả về `_token` |
| `assistant.py` | ✅ FIXED | Đã xóa duplicate, truyền token |
| `service.py` | ✅ OK | Inject `_user_token` vào tool kwargs |
| `trekking_tools.py` | ✅ OK | Extract `_user_token` từ kwargs |
| `trekking_client.py` | ✅ OK | Dùng Bearer token khi có user_token |
| `auth_client.py` | ✅ OK | Same logic |
| `checkin_client.py` | ✅ OK | Same logic |
| `analytics_tools.py` | ✅ OK | Truyền user_token vào clients |

## Kiến trúc auth token forwarding

```
┌─────────────────┐
│   Web Admin     │ Bearer: admin_token
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ agent-service   │
│  /api/v1/agent  │
│                 │
│ Middleware:     │
│  get_current_   │──► Verify với auth-service
│  admin()        │◄── Return {userId, role, _token}
│                 │
│ send_message(): │
│  admin_token =  │
│  admin["_token"]│
│                 │
│ AssistantService│
│  .send_message()│
│                 │
│ Tool execution: │
│  kwargs = {     │
│    **tool_args, │
│    "_user_token"│
│     : admin_token│
│  }              │
│                 │
│ TrekkingRead    │
│ Client:         │
│  if user_token: │
│    Bearer token │─────┐
│  else:          │     │
│    Service token│     │
└─────────────────┘     │
                        │
         ┌──────────────┘
         │
         ▼
┌─────────────────┐
│ trekking-service│
│ /api/v1/admin/* │
│                 │
│ Auth middleware │
│  verifyToken()  │
│                 │
│ ✅ 200 OK       │
└─────────────────┘
```

## Lưu ý

- **Admin endpoints** (`/api/v1/admin/*`) PHẢI dùng **Bearer token** của user
- **Service token** (`X-Service-Token`) chỉ dùng cho internal service-to-service calls hoặc public endpoints
- Tất cả các client (trekking, auth, checkin) đều follow pattern này

## Các file đã sửa

- ✅ `services/agent-service/app/api/assistant.py` - XÓA duplicate, TRUYỀN token
