# Agent Database — trekviet_agent

Runtime/index review: **2026-10-12**. Exact indexes are exported in [agent-indexes.json](../database/runtime/agent-indexes.json).

### pending_approvals

Stores `approvalId`, `adminId`, `conversationId`, `action`, `payload`, `display`, `status`, `executionResult`, `createdAt`, `updatedAt`, `expiresAt`. New proposals expire after 24 hours. Indexes: unique `approvalId`, `(conversationId, status, createdAt)`, `(adminId, createdAt)`, TTL `expiresAt` with `expireAfterSeconds=0`.

Approval is consumed atomically only by its owner and conversation, while still `PENDING` and unexpired. Approve transitions to `EXECUTING`, then `APPROVED` or `FAILED`; reject transitions to `REJECTED`. Concurrent approval/rejection cannot perform the same write twice. Older records without `expiresAt` remain supported; TTL cleanup does not remove them.

Agent Service sử dụng MongoDB database **riêng biệt**: `trekviet_agent`.

**Không bao giờ** kết nối trực tiếp production trekking DB.
Cross-service references chỉ là conceptual IDs (MongoDB không enforce foreign key).

## Collections

### conversations

Chat sessions của Admin.

```json
{
  "conversationId": "uuid",
  "adminId": "ref → users.userId",
  "title": "Tên hội thoại",
  "status": "ACTIVE | ARCHIVED",
  "selectedProvider": "auto | uit | groq | openai",
  "selectedModel": null,
  "messageCount": 5,
  "lastMessageAt": "2026-10-04T...",
  "summary": null,
  "createdAt": "...",
  "updatedAt": "..."
}
```

**Indexes:** `adminId`, `status`, `(adminId, updatedAt)`, `(status, updatedAt)`

---

### messages

Individual chat messages.

```json
{
  "messageId": "uuid",
  "conversationId": "ref → conversations",
  "adminId": "ref → users.userId",
  "role": "USER | ASSISTANT | SYSTEM | TOOL",
  "content": "Nội dung tin nhắn",
  "llm": {
    "provider": "groq",
    "model": "llama3-8b-8192",
    "latencyMs": 350,
    "usage": { "promptTokens": 100, "completionTokens": 50, "totalTokens": 150 }
  },
  "toolCalls": null,
  "error": null,
  "createdAt": "..."
}
```

**Indexes:** `conversationId`, `(conversationId, createdAt)`, `(adminId, createdAt)`

---

### agent_runs

Execution audit log cho mỗi LLM call hoặc workflow run.

```json
{
  "agentRunId": "uuid",
  "runType": "ASSISTANT_CHAT | PLACE_BUILDER | MAP_BUILDER",
  "conversationId": null,
  "workflowId": "PLC-... | MAP-...",
  "adminId": "...",
  "provider": "groq",
  "model": "llama3-8b-8192",
  "status": "RUNNING | SUCCESS | FAILED | CANCELLED",
  "startedAt": "...",
  "finishedAt": "...",
  "durationMs": 1200,
  "usage": { ... },
  "toolSummary": [],
  "error": null,
  "expiresAt": "..."
}
```

**TTL index:** `expiresAt` (recommended retention: 60–90 ngày)

---

### place_candidates

Địa điểm trekking chờ Admin review.

```json
{
  "placeCandidateId": "uuid",
  "jobId": "PLC-20261003-XXXXXXXX",
  "adminId": "...",
  "operation": "CREATE | UPDATE",
  "targetPlaceId": null,
  "input": { "placeName": "Núi Bà Đen", "locationHint": "Tây Ninh" },
  "status": "PROCESSING | PENDING_REVIEW | APPROVED | REJECTED | NEEDS_FIX | FAILED",

  "candidate": {
    "productionPayload": {
      "name": "Núi Bà Đen",
      "slug": "nui-ba-den",
      "provinceId": "...",
      "address": "Tây Ninh",
      "location": { "type": "Point", "coordinates": [106.166, 11.387] },
      "description": "...",
      "difficulty": "MODERATE",
      "averageDurationMinutes": 300,
      "elevationMeters": 986,
      "images": [],
      "imageMapUrl": null,
      "tags": ["mountain", "trekking"],
      "dataOrigin": "AI_AGENT",
      "externalRefs": {
        "osm": { "type": "node", "id": "123456" },
        "wikidataId": "Q123456"
      },
      "lastVerifiedAt": "2026-10-04T..."
    },
    "enrichment": {
      "category": "MOUNTAIN",
      "activities": ["TREKKING", "HIKING"],
      "estimatedDuration": { "minMinutes": 240, "maxMinutes": 360 }
    }
  },

  "sources": [
    {
      "provider": "OpenStreetMap",
      "sourceId": "node:123456",
      "url": "https://www.openstreetmap.org/node/123456",
      "retrievedAt": "...",
      "fields": ["name", "location", "elevation"]
    }
  ],

  "quality": {
    "confidenceScore": 85,
    "fieldConfidence": { "name": 100, "location": 100, "elevationMeters": 100 },
    "warnings": ["Missing: provinceId"]
  },

  "duplicateCheck": {
    "isPotentialDuplicate": false,
    "matchedPlaceId": null,
    "score": 0,
    "reason": null
  },

  "review": { "reviewedBy": null, "reviewedAt": null, "note": null },

  "productionSync": {
    "synced": false,
    "productionPlaceId": null,
    "syncedAt": null,
    "lastError": null
  }
}
```

**Notes:**
- `enrichment` là Agent metadata — **không tự sync vào production**
- `productionPayload.dataOrigin` luôn là `"AI_AGENT"` khi tạo từ Agent
- `lastVerifiedAt` được set tại thời điểm Admin approve
- Không được approve nếu `provinceId` chưa resolve

---

### map_jobs

Map Builder job tracking.

```json
{
  "mapJobId": "uuid",
  "jobId": "MAP-20261003-XXXXXXXX",
  "adminId": "...",
  "trekkingPlaceId": "...",
  "trekkingRouteId": null,
  "placeName": "Núi Bà Đen",
  "publishTarget": { "type": "PLACE", "targetId": "..." },
  "input": {
    "bbox": { "minLon": 106.139, "minLat": 11.361, "maxLon": 106.191, "maxLat": 11.412 },
    "minZoom": 10,
    "maxZoom": 14
  },
  "status": "QUEUED | PROCESSING | PENDING_REVIEW | APPROVED | REJECTED | PUBLISHING | PUBLISHED | FAILED | CANCELLED",
  "progress": { "currentStep": "BUILD_MBTILES", "percent": 55, "steps": [...] },
  "output": {
    "artifactType": "MAP_ZIP",
    "tempPath": "/tmp/trekviet-agent/map-jobs/MAP-xxx/nui-ba-den-v1-flutter.zip",
    "fileName": "nui-ba-den-v1-flutter.zip",
    "fileSizeBytes": 19300000,
    "sha256": "fc20df2e...",
    "metadata": {
      "bounds": { "minLon": 106.139, "minLat": 11.361, "maxLon": 106.191, "maxLat": 11.412 },
      "center": [106.165, 11.386],
      "minZoom": 10,
      "maxZoom": 14,
      "version": 1
    },
    "expiresAt": "2026-10-07T..."
  },
  "review": { "reviewedBy": "admin-1", "reviewedAt": "...", "note": null },
  "publish": {
    "approved": true,
    "r2": {
      "uploaded": true,
      "bucket": "trekviet-maps",
      "objectKey": "maps/nui-ba-den/v1/nui-ba-den-v1-flutter.zip",
      "uploadedAt": "..."
    },
    "productionOfflineMap": {
      "updated": true,
      "updatedAt": "...",
      "lastError": null
    }
  }
}
```

**Quan trọng:**
- Binary map file (`map.zip`, MBTiles, OSM PBF) **không lưu MongoDB**
- Chỉ lưu `tempPath` (metadata)
- Sau publish, chỉ lưu `r2.objectKey` — `downloadUrl` build runtime

---

### workflow_events

Audit log từng step của pipeline.

```json
{
  "workflowEventId": "uuid",
  "jobId": "MAP-... | PLC-...",
  "workflowType": "PLACE_BUILDER | MAP_BUILDER | ASSISTANT",
  "event": "PIPELINE_START | BUILD_MBTILES | APPROVED | ...",
  "level": "DEBUG | INFO | WARN | ERROR",
  "message": "Map Builder started for 'Núi Bà Đen'",
  "metadata": { "osmId": "123456" },
  "createdAt": "...",
  "expiresAt": "..."
}
```

**TTL index:** `expiresAt` (recommended: 30–90 ngày)

## Production vs Agent DB

| Thông tin | Nơi lưu |
|---|---|
| Full source history, enrichment, quality | Agent DB (`place_candidates.sources`, `quality`) |
| Production-ready data | `place_candidates.candidate.productionPayload` |
| Provenance (origin, refs, verified date) | Production `trekking_places.dataOrigin`, `externalRefs`, `lastVerifiedAt` |
| Offline map package file | Cloudflare R2 |
| R2 object key | Production `trekking_places.offlineMap.objectKey` |
| Download URL | Built at runtime: `R2_PUBLIC_BASE_URL + "/" + objectKey` |
