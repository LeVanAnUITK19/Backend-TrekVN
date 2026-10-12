# LLM Providers

## Providers

### UIT LLM (OpenAI-compatible)

Endpoint của trường Đại học Công nghệ Thông tin.
Sử dụng OpenAI Chat Completions API format.

```env
UIT_LLM_ENABLED=true
UIT_LLM_BASE_URL=https://...   # không hard-code IP trường
UIT_LLM_API_KEY=...
UIT_LLM_MODEL=...
```

**Lưu ý:** UIT có thể unavailable khi không ở mạng trường.
Service vẫn chạy bình thường với Groq/OpenAI.

---

### Groq

Fast inference API, OpenAI-compatible.

```env
GROQ_ENABLED=true
GROQ_API_KEY=...
GROQ_MODEL=llama3-8b-8192
```

Docs: https://console.groq.com

---

### OpenAI (optional)

```env
OPENAI_ENABLED=false   # disabled by default
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
```

---

## Auto Selection

```env
LLM_DEFAULT_PROVIDER=auto
LLM_PROVIDER_PRIORITY=uit,groq,openai
```

Behavior khi `provider=auto`:

```
Try UIT  →  unavailable?
Try Groq →  unavailable?
Try OpenAI (nếu enabled)
All fail → raise LLMProviderError
```

## Manual Selection — No Silent Fallback

Khi Admin chọn provider cụ thể (e.g. `provider="uit"`):
- Nếu UIT fail → **trả error ngay**, không fallback sang Groq
- Chỉ `auto` mới fallback

## Health Check

```
GET /api/v1/agent/llm/providers
→ {
    "providers": [
      { "id": "uit",  "name": "UIT LLM", "available": true,  "models": ["..."] },
      { "id": "groq", "name": "Groq",    "available": true,  "models": ["llama3-8b-8192"] }
    ],
    "default": "auto"
  }

GET /api/v1/agent/llm/providers/:id/health
```

Provider availability **không làm service unready**.
Health endpoint tách biệt với `/health/ready`.

## Thêm Provider Mới

1. Tạo class kế thừa `BaseLLMProvider` trong `app/llm/`
2. Implement `chat()` và `health()`
3. Register trong `LLMProviderManager._build_providers()`
4. Thêm config vào `Settings` và `.env.example`

API key **không bao giờ** được trả về trong bất kỳ API response nào.
