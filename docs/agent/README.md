# TrekViet Agent Service

Agent Service là Python FastAPI microservice cung cấp 3 capability AI cho Admin TrekViet.

## 3 Capabilities

| Capability | Mô tả | Workflow |
|---|---|---|
| **AI Assistant** | Chat, Q&A, read-only analytics | Conversational |
| **Place Builder** | Tự động thu thập & chuẩn hoá dữ liệu địa điểm | Fixed pipeline |
| **Map Builder** | Build offline map package cho Flutter/MapLibre | Fixed pipeline |

**Quy tắc quan trọng nhất:**
- Assistant **không được** trigger Place Builder hoặc Map Builder từ chat
- Mọi production write **đều phải** qua bước Admin approval riêng biệt
- Agent Service **không được** kết nối trực tiếp production MongoDB

## Tài liệu

| File | Nội dung |
|---|---|
| [architecture.md](architecture.md) | Tổng quan kiến trúc, Mermaid diagram |
| [database.md](database.md) | Agent DB schema (trekviet_agent) |
| [assistant.md](assistant.md) | AI Assistant scope, conversation, tools |
| [llm-providers.md](llm-providers.md) | UIT / Groq / OpenAI / Auto selection |
| [place-builder.md](place-builder.md) | Place Builder workflow chi tiết |
| [map-builder.md](map-builder.md) | Map Builder pipeline, format, R2 publish |
| [api.md](api.md) | Tất cả endpoints + request/response examples |
| [environment.md](environment.md) | Tất cả environment variables |
| [security.md](security.md) | Boundaries, secrets, permission matrix |
| [local-development.md](local-development.md) | Chạy local từ đầu |

## Tech Stack

```
Python 3.11+ · FastAPI · Pydantic v2 · Motor (async MongoDB)
httpx · python-jose · boto3 (R2/S3)
pytest · pytest-asyncio
osmium-tool · tilemaker 3 · gdal (required for full OSM+DEM map pipeline; included in Docker)
```

## Quick Start

```bash
cd services/agent-service
cp .env.example .env   # điền các biến cần thiết
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Xem [local-development.md](local-development.md) để hướng dẫn đầy đủ.
