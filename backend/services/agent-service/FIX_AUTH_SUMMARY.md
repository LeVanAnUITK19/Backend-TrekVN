# Fix Agent Service Authentication - COMPLETED

**Status:** ✅ Code changes complete, testing in progress

**Date:** 2026-10-06

# Fix Agent Service Authentication

## Vấn đề

Agent service gọi GET API của các service khác (trekking, auth, checkin) bị lỗi 401 Unauthorized.

### Root Cause

- Agent service đang gửi `X-Service-Token` (service-to-service auth) cho tất cả requests
- Nhưng các admin GET endpoints của trekking/auth/checkin service yêu cầu **Bearer token của admin user**
- Các service có middleware `authenticate + requireAdmin` yêu cầu JWT token, không chấp nhận service token cho GET endpoints

### Log Error

```
2026-10-06 10:15:25,181 [INFO] httpx: HTTP Request: GET http://localhost:3003/api/v1/admin/trekking/places?q=&page=1&limit=30 "HTTP/1.1 401 Unauthorized"
```

## Giải pháp

### 1. Thay đổi Client Classes

**Before:**
```python
class TrekkingReadClient:
    def __init__(self, settings: Settings):
        self._token = settings.trekviet_internal_token
    
    def _headers(self):
        return {"X-Service-Token": self._token}
```

**After:**
```python
class TrekkingReadClient:
    def __init__(self, settings: Settings, user_token: str | None = None):
        self._token = settings.trekviet_internal_token
        self._user_token = user_token
    
    def _headers(self):
        if self._user_token:
            # Admin GET endpoints: dùng Bearer token
            return {"Authorization": f"Bearer {self._user_token}"}
        else:
            # Write endpoints: dùng service token
            return {"X-Service-Token": self._token}
```

### 2. Truyền Token qua Tool Execution

**API Layer** (`app/api/assistant.py`):
```python
@router.post("/conversations/{conversation_id}/messages")
async def send_message(
    authorization: Annotated[str | None, Header()] = None,
    ...
):
    admin_token = None
    if authorization and authorization.startswith("Bearer "):
        admin_token = authorization.split(" ", 1)[1]
    
    result = await svc.send_message(
        ...,
        admin_token=admin_token,  # Truyền token xuống service
    )
```

**Service Layer** (`app/assistant/service.py`):
```python
async def send_message(
    ...,
    admin_token: Optional[str] = None,
):
    ...
    # Inject token vào tool kwargs
    tool_kwargs = {**tool_args, "_user_token": admin_token}
    result = await tool.run(**tool_kwargs)
```

**Tool Layer** (e.g., `trekking_tools.py`):
```python
class SearchPlacesTool:
    def __init__(self, settings: Settings):
        self._settings = settings  # Lưu settings thay vì client
    
    async def run(self, ..., **kwargs):
        # Tạo client dynamic với user token
        user_token = kwargs.get("_user_token")
        client = TrekkingReadClient(self._settings, user_token=user_token)
        
        # Gọi service với Bearer token của admin
        result = await client.search_places(...)
```

## Files Changed

### Client Classes (3 files)
1. `app/clients/trekking_client.py` - Added `user_token` parameter
2. `app/clients/auth_client.py` - Added `user_token` parameter
3. `app/clients/checkin_client.py` - Added `user_token` parameter

### Tool Classes (5 files)
4. `app/assistant/tools/production/trekking_tools.py` - 8 tools updated
5. `app/assistant/tools/production/gamification_tools.py` - 5 tools updated
6. `app/assistant/tools/production/checkin_tools.py` - 3 tools updated
7. `app/assistant/tools/production/analytics_tools.py` - 1 tool updated

### Service & API (2 files)
8. `app/assistant/service.py` - Added `admin_token` parameter to `send_message()`
9. `app/api/assistant.py` - Extract Bearer token from request header

## Architecture

```
Web Admin (Bearer token)
    ↓
Agent API (/conversations/:id/messages)
    ↓ Extract Bearer token
Assistant Service (send_message)
    ↓ Inject _user_token into kwargs
Tool (search_places)
    ↓ Create dynamic client with user_token
TrekkingReadClient
    ↓ Authorization: Bearer {user_token}
Trekking Service (/admin/trekking/places)
    ↓ authenticate middleware verifies JWT
    ✓ Success
```

## Security Considerations

- ✅ Agent service vẫn verify admin role trong `get_current_admin()` dependency
- ✅ Chỉ forward token khi có request từ admin
- ✅ Các service downstream vẫn validate JWT độc lập
- ✅ Service token vẫn được dùng cho write operations (POST/PUT/DELETE) sau khi admin approve
- ✅ Token không được lưu trong tool instances (chỉ pass qua kwargs per-request)

## Testing

1. Admin login → get Bearer token
2. Gửi message tới agent: "Liệt kê các địa điểm trekking"
3. Agent gọi `search_places` tool
4. Tool tạo client với user token
5. GET request tới trekking service with `Authorization: Bearer {token}`
6. ✓ Response 200 OK thay vì 401

## Notes

- Knowledge tools không cần token (đọc local files)
- Write tools (Place Builder, Map Builder) vẫn dùng service token sau approval
- Giải pháp này tương thích với API Gateway pattern nếu triển khai sau này
