# Security

**Review 2026-10-12:** ADMIN authorization uses the account's current role from auth-service, plus local HS256 verification using PyJWT. Gateway strips incoming service credentials/identity headers. Pending badge approvals are consumed atomically, scoped to owner and conversation, and expire after 24 hours. Production responses hide internal exception details and disable OpenAPI/docs endpoints. Runtime dependency advisory results are in [the pre-push audit](../pre-push-audit-2026-10-12.md).

## Permission Matrix

```
┌──────────────────────────────────────────────────────────────────┐
│                    CAPABILITY MATRIX                             │
├────────────────────┬──────────────┬───────────────┬─────────────┤
│                    │  Assistant   │ Place Builder │ Map Builder │
├────────────────────┼──────────────┼───────────────┼─────────────┤
│ LLM chat           │      ✓       │       ✗       │      ✗      │
│ Search docs        │      ✓       │       ✗       │      ✗      │
│ Read-only analytics│      ✓       │       ✗       │      ✗      │
│ OSM/Wikidata/Web   │      ✗       │       ✓       │      ✓      │
│ Agent DB write     │      ✗       │       ✓       │      ✓      │
│ Production read    │    via API   │    via API    │   via API   │
│ Production write   │      ✗       │  After approve│      ✗      │
│ Map pipeline cmds  │      ✗       │       ✗       │      ✓      │
│ Temp file write    │      ✗       │       ✗       │  Workdir only│
│ R2 upload          │      ✗       │       ✗       │  After approve│
│ Production offline │      ✗       │       ✗       │  After R2 ✓ │
└────────────────────┴──────────────┴───────────────┴─────────────┘
```

Các boundaries này được enforce tại **code layer**, không chỉ dựa vào prompt.

## Authentication Flow

```
Admin Web → Bearer token → API Gateway
API Gateway: verify via GET auth-service/api/v1/auth/verify
Agent Service: decode JWT (python-jose) → check role=ADMIN
```

- Agent Service **không tin** `adminId` do frontend gửi
- Identity lấy từ JWT payload: `sub | id | userId`
- Role phải là `"ADMIN"`

## Secrets Management

| Secret | Nơi lưu | Không được |
|---|---|---|
| `JWT_SECRET` | Env var | Hard-code, commit `.env` |
| `TREKVIET_INTERNAL_TOKEN` | Env var | Trả về frontend, log ra |
| `GROQ_API_KEY` | Env var | Trả về API response, log ra |
| `R2_ACCESS_KEY_ID` | Env var | Trả về frontend |
| `R2_SECRET_ACCESS_KEY` | Env var | Log, response |
| `AGENT_MONGODB_URI` | Env var | Có thể chứa password trong URI |

**API key KHÔNG BAO GIỜ xuất hiện trong:**
- API responses
- Log output (vì logging được cấu hình để không log headers/env)
- Error messages trả về client

## Command Injection Protection

Map Builder thực thi external commands (osmium, tilemaker, gdal).

Quy tắc:
- Sử dụng `asyncio.create_subprocess_exec(*args)` — **không bao giờ** `shell=True`
- Arguments truyền dưới dạng list riêng biệt, không concatenate string
- `placeName` được sanitize qua `harness.validation.sanitize_place_name()` trước khi dùng trong paths
- Dangerous characters bị strip: `; & | \` $ ( ) < > \\ " \n`
- Path traversal protection: mọi path được verify là nằm trong `MAP_WORK_ROOT`

```python
# ĐÚNG — không shell injection
await run_command("osmium", "cat", osm_path, "--output", pbf_path)

# SAI — KHÔNG làm thế này
subprocess.run(f"osmium cat {user_input}", shell=True)
```

## File & Path Security

- Map Builder chỉ được ghi file vào `${MAP_WORK_ROOT}/map-jobs/{jobId}/`
- `get_artifact_path()` verify path với `relative_to(MAP_WORK_ROOT)` trước khi stream
- Path traversal attempt → `PermissionError`, không stream file

## No Direct Production MongoDB

Agent Service **không bao giờ** kết nối `TREKKING_SERVICE_URL` mongodb connection string.

Tất cả production reads/writes đi qua authenticated HTTP API của trekking-service.

## R2 Upload Security

- R2 credentials (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) chỉ dùng server-side
- Flutter client download từ `R2_PUBLIC_BASE_URL` (CDN public, không cần auth)
- Upload chỉ xảy ra sau khi Admin approve qua `/approve` endpoint
- Idempotency check: nếu object_key đã tồn tại trên R2, skip re-upload

## Audit Trail

Mọi production write operation được log qua:
1. `workflow_events` collection (Agent DB)
2. `harness.audit.log_production_write()` (application log)
3. `harness.audit.log_r2_upload()` (application log)
