# API Reference — Agent Service

**Runtime review 2026-10-12:** [Exported OpenAPI](../openapi/agent-service.json) is generated from the mounted FastAPI application. Place Builder HTTP routers are currently disabled; the assistant, task history, map jobs/artifacts and LLM provider endpoints are active. Assistant badge actions are proposals and require owner/conversation-scoped approval before production writes. Production disables `/docs`, `/redoc` and `/openapi.json`.

Base path (via Gateway): `http://localhost:3000/api/v1/agent`

Tất cả endpoints yêu cầu: `Authorization: Bearer <admin-token>`

Response format:
```json
{ "success": true,  "data": { ... } }
{ "success": false, "error": { "code": "...", "message": "..." } }
```

---

## Health

### GET /health
Liveness probe.
```json
{ "status": "ok" }
```

### GET /health/ready
Readiness probe — kiểm tra MongoDB + config.
```json
{ "status": "ready", "checks": { "mongodb": true, ... } }
```

---

## LLM Providers

### GET /api/v1/agent/llm/providers
Danh sách providers + availability.
```json
{
  "success": true,
  "data": {
    "providers": [
      { "id": "uit",  "name": "UIT LLM", "available": true, "models": ["..."] },
      { "id": "groq", "name": "Groq",    "available": true, "models": ["llama3-8b-8192"] }
    ],
    "default": "auto"
  }
}
```

### GET /api/v1/agent/llm/providers/:id/health
```json
{ "success": true, "data": { "id": "groq", "available": true, "error": null } }
```

---

## Assistant

### POST /api/v1/agent/assistant/conversations
Request:
```json
{ "title": "Hỏi về hệ thống", "provider": "auto", "model": null }
```
Response `201`:
```json
{ "success": true, "data": { "conversationId": "...", "adminId": "...", "status": "ACTIVE" } }
```

### GET /api/v1/agent/assistant/conversations
Query: `?status=ACTIVE&page=1&limit=20`

### GET /api/v1/agent/assistant/conversations/:id

### GET /api/v1/agent/assistant/conversations/:id/messages
Query: `?page=1&limit=50`

### POST /api/v1/agent/assistant/conversations/:id/messages
Request:
```json
{
  "content": "Hệ thống rank TrekViet hoạt động thế nào?",
  "provider": "auto",
  "model": null
}
```
Response:
```json
{
  "success": true,
  "data": {
    "message": {
      "id": "...",
      "role": "assistant",
      "content": "Hệ thống rank của TrekViet...",
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

---

## Place Builder

### POST /api/v1/agent/place-builder/jobs
Request:
```json
{
  "placeName": "Núi Bà Đen",
  "locationHint": "Tây Ninh",
  "operation": "CREATE",
  "targetPlaceId": null
}
```
Response `202 Accepted`:
```json
{ "success": true, "data": { "jobId": "PLC-20261003-XXXXXXXX", "status": "PROCESSING" } }
```

### GET /api/v1/agent/place-builder/jobs/:jobId

### GET /api/v1/agent/place-builder/candidates
Query: `?status=PENDING_REVIEW&page=1&limit=20`

### GET /api/v1/agent/place-builder/candidates/:id

### PATCH /api/v1/agent/place-builder/candidates/:id
Request: chỉ cho phép sửa `candidate` và `status` (→ `NEEDS_FIX`)
```json
{
  "candidate": {
    "productionPayload": { "provinceId": "province-taynin-id" }
  }
}
```

### POST /api/v1/agent/place-builder/candidates/:id/approve
Request:
```json
{ "note": "Dữ liệu đã xác minh, approve" }
```
Response:
```json
{ "success": true, "data": { "candidateId": "...", "productionPlaceId": "...", "status": "APPROVED" } }
```

### POST /api/v1/agent/place-builder/candidates/:id/reject
```json
{ "note": "Dữ liệu không chính xác" }
```

---

## Map Builder

### POST /api/v1/agent/map-builder/jobs
Request:
```json
{
  "trekkingPlaceId": "...",
  "placeName": "Núi Bà Đen",
  "publishTarget": { "type": "PLACE", "targetId": "..." },
  "bbox": { "minLon": 106.139, "minLat": 11.361, "maxLon": 106.191, "maxLat": 11.412 },
  "minZoom": 10,
  "maxZoom": 14
}
```
Response `202 Accepted`:
```json
{ "success": true, "data": { "jobId": "MAP-20261003-XXXXXXXX", "status": "QUEUED" } }
```

### GET /api/v1/agent/map-builder/jobs
Query: `?status=PENDING_REVIEW&page=1&limit=20`

### GET /api/v1/agent/map-builder/jobs/:jobId
```json
{
  "success": true,
  "data": {
    "jobId": "MAP-...",
    "status": "PROCESSING",
    "progress": {
      "currentStep": "BUILD_MBTILES",
      "percent": 55,
      "steps": [
        { "name": "VALIDATE_INPUT",  "status": "DONE" },
        { "name": "PREPARE_WORKDIR", "status": "DONE" },
        { "name": "EXTRACT_OSM",     "status": "DONE" },
        { "name": "BUILD_MBTILES",   "status": "RUNNING" }
      ]
    }
  }
}
```

### GET /api/v1/agent/map-builder/jobs/:jobId/artifact
Stream download của `map.zip`.
Chỉ available khi status = `PENDING_REVIEW`.
Headers: `Content-Type: application/zip`, `Content-Disposition: attachment; filename=...`

### POST /api/v1/agent/map-builder/jobs/:jobId/approve
```json
{ "note": "Đã test trên Flutter, bản đồ OK" }
```
Response:
```json
{ "success": true, "data": { "jobId": "...", "status": "PUBLISHING" } }
```

### POST /api/v1/agent/map-builder/jobs/:jobId/reject
```json
{ "note": "Thiếu contour lines, rebuild" }
```

---

## Error Codes

| Code | HTTP | Mô tả |
|---|---|---|
| `UNAUTHORIZED` | 401 | Thiếu hoặc invalid token |
| `FORBIDDEN` | 403 | Không phải ADMIN |
| `CONVERSATION_NOT_FOUND` | 404 | |
| `CANDIDATE_NOT_FOUND` | 404 | |
| `JOB_NOT_FOUND` | 404 | |
| `ARTIFACT_NOT_FOUND` | 404 | Job chưa PENDING_REVIEW hoặc artifact expired |
| `APPROVE_ERROR` | 400 | Status không phải PENDING_REVIEW, thiếu provinceId, v.v. |
| `REJECT_ERROR` | 400 | |
| `PRODUCTION_API_ERROR` | 502 | Trekking-service fail khi approve |
| `LLM_PROVIDER_ERROR` | — | Provider unavailable (returned in message content) |
| `INTERNAL_ERROR` | 500 | |
