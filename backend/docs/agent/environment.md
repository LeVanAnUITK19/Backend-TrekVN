# Environment Variables

Xem file mẫu đầy đủ tại: `services/agent-service/.env.example`

## App

| Variable | Default | Required | Mô tả |
|---|---|---|---|
| `APP_ENV` | `development` | No | `development` / `production` / `test` |
| `PORT` | `8000` | No | Port cho uvicorn |
| `LOG_LEVEL` | `INFO` | No | `DEBUG` / `INFO` / `WARNING` / `ERROR` |

## Agent MongoDB

| Variable | Default | Required | Mô tả |
|---|---|---|---|
| `AGENT_MONGODB_URI` | — | **Yes** | Connection string cho Agent DB (KHÔNG phải production DB) |
| `AGENT_MONGODB_DB` | `trekviet_agent` | No | Tên database |

## Auth

| Variable | Default | Required | Mô tả |
|---|---|---|---|
| `AUTH_SERVICE_URL` | `http://localhost:3001` | **Yes** | Base URL của auth-service (verify token) |
| `JWT_SECRET` | — | **Yes** | Phải khớp với auth-service JWT_SECRET |

## Trekking Service

| Variable | Default | Required | Mô tả |
|---|---|---|---|
| `TREKKING_SERVICE_URL` | `http://localhost:3003` | **Yes** | Base URL của trekking-service |
| `TREKVIET_INTERNAL_TOKEN` | — | **Yes** | Service-to-service auth token. **Không expose ra frontend** |

## LLM Providers

| Variable | Default | Required | Mô tả |
|---|---|---|---|
| `LLM_DEFAULT_PROVIDER` | `auto` | No | `auto` / `uit` / `groq` / `openai` |
| `LLM_PROVIDER_PRIORITY` | `uit,groq,openai` | No | Thứ tự fallback khi dùng `auto` |
| `UIT_LLM_ENABLED` | `true` | No | |
| `UIT_LLM_BASE_URL` | — | Nếu enabled | OpenAI-compatible base URL |
| `UIT_LLM_API_KEY` | — | Nếu enabled | |
| `UIT_LLM_MODEL` | — | Nếu enabled | |
| `GROQ_ENABLED` | `true` | No | |
| `GROQ_API_KEY` | — | Nếu enabled | |
| `GROQ_MODEL` | `llama3-8b-8192` | No | |
| `OPENAI_ENABLED` | `false` | No | |
| `OPENAI_API_KEY` | — | Nếu enabled | |
| `OPENAI_MODEL` | `gpt-4o-mini` | No | |

## Cloudflare R2

| Variable | Default | Required | Mô tả |
|---|---|---|---|
| `R2_ACCOUNT_ID` | — | For map publish | |
| `R2_ACCESS_KEY_ID` | — | For map publish | **Không expose ra frontend** |
| `R2_SECRET_ACCESS_KEY` | — | For map publish | **Không expose ra frontend** |
| `R2_BUCKET` | — | For map publish | Tên bucket |
| `R2_PUBLIC_BASE_URL` | — | For map publish | CDN URL không trailing slash. E.g. `https://pub-xxx.r2.dev` |
| `R2_ENDPOINT_URL` | — | For map publish | Override endpoint. Auto-built từ `R2_ACCOUNT_ID` nếu để trống |

## Map Builder

| Variable | Default | Required | Mô tả |
|---|---|---|---|
| `MAP_WORK_ROOT` | `/tmp/trekviet-agent` | No | Root thư mục temp cho map pipeline |
| `MAP_ARTIFACT_TTL_HOURS` | `72` | No | Số giờ giữ temp artifact trước khi expire |
| `MAP_DEFAULT_MAX_ZOOM` | `14` | No | |
| `MAP_DEFAULT_MIN_ZOOM` | `10` | No | |
| `MAP_BBOX_MAX_AREA_DEG2` | `0.5` | No | Guard chống bbox quá lớn (deg²) |

## External Services

| Variable | Default | Required | Mô tả |
|---|---|---|---|
| `OSM_OVERPASS_URL` | `https://overpass-api.de/api/interpreter` | No | Overpass API endpoint |
| `REQUEST_TIMEOUT_SECONDS` | `30` | No | Timeout mặc định cho HTTP calls |

## Assistant

| Variable | Default | Required | Mô tả |
|---|---|---|---|
| `ASSISTANT_MAX_CONTEXT_MESSAGES` | `20` | No | Số message tối đa gửi LLM |
| `ASSISTANT_MAX_OUTPUT_TOKENS` | `2048` | No | |
