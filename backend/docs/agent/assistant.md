# AI Assistant

## Scope V1

### ALLOW
- Chat / Q&A về TrekViet (architecture, business logic, tính năng)
- Giải thích dữ liệu trekking (địa điểm, tuyến đường, check-in)
- Read-only analytics (qua trekking-service public API)
- Tìm kiếm trong docs (local markdown search)
- Gợi ý badge, tính năng, UX
- Summarize / explain

### DENY (hard-coded, không chỉ dựa prompt)
- Create / update / delete production data
- Chạy Place Builder Workflow từ chat
- Chạy Map Builder Workflow từ chat
- Upload lên Cloudflare R2
- Kết nối trực tiếp production MongoDB

## Conversation Flow

```
POST /api/v1/agent/assistant/conversations
  → tạo conversation document

POST /api/v1/agent/assistant/conversations/:id/messages
  { "content": "...", "provider": "auto", "model": null }
  → persist user message
  → build LLM context (system prompt + capped history)
  → call LLMProviderManager
  → persist assistant message (với llm metadata)
  → return response
```

## Provider Selection Per Message

Admin có thể chọn provider theo 2 cách:
1. **Conversation-level default:** set khi tạo conversation (`selectedProvider`)
2. **Message-level override:** gửi `provider` trong request body

Provider hierarchy:
```
message.provider
  → conversation.selectedProvider
  → LLM_DEFAULT_PROVIDER (từ env, thường "auto")
```

## Context Window Management

- Chỉ gửi `ASSISTANT_MAX_CONTEXT_MESSAGES` (default: 20) messages gần nhất tới LLM
- System messages bị lọc ra khỏi history (không gửi lại)
- Content > 4000 chars bị truncate trước khi inject vào prompt
- Không dump toàn bộ MongoDB collection vào context

## System Prompt

System prompt enforce các boundaries V1 trực tiếp trong prompt text. Tuy nhiên, boundaries chính được enforce ở code layer (tool list = read-only).

Xem: `app/assistant/prompt.py`

## Read-Only Tools (V1)

| Tool | Mô tả | API |
|---|---|---|
| `search_app_docs` | Tìm kiếm trong `/docs` markdown files | Local file search |
| `get_places_summary` | Tóm tắt danh sách địa điểm | `GET /api/v1/places` |
| `get_badges_summary` | Tóm tắt badges (TODO) | Pending endpoint |
| `get_journey_statistics` | Thống kê journeys (TODO) | Pending endpoint |

Tất cả tools phải implement `mode = "READ_ONLY"`.

Tool output được giới hạn size (`_MAX_RESULT_CHARS`) để không flood context.

## Endpoints

```
POST /api/v1/agent/assistant/conversations
GET  /api/v1/agent/assistant/conversations
GET  /api/v1/agent/assistant/conversations/:id
GET  /api/v1/agent/assistant/conversations/:id/messages
POST /api/v1/agent/assistant/conversations/:id/messages
```

## Response Format

```json
{
  "success": true,
  "data": {
    "message": {
      "id": "uuid",
      "role": "assistant",
      "content": "Hệ thống rank...",
      "createdAt": "2026-10-04T..."
    },
    "llm": {
      "provider": "groq",
      "model": "llama3-8b-8192",
      "latencyMs": 350
    }
  }
}
```
