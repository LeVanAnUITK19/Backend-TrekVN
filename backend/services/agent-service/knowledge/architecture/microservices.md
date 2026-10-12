---
title: TrekViet Microservices Architecture
category: architecture
active: true
---

# Microservices Architecture

## Service Topology

```
Flutter App
    │
    ▼
API Gateway (:3000)        ← rate limiting, CORS, auth proxy
    │
    ├── auth-service (:3001)      ← users, JWT, ranks, XP
    ├── trekking-service (:3003)  ← places, routes, journeys, badges
    ├── checkin-service (:3002)   ← GPS check-in, province/place visits
    ├── community-service (:3004) ← posts, comments, reactions
    └── agent-service (:8000)     ← AI Assistant, Place Builder, Map Builder
```

## Communication

- **Synchronous:** REST (HTTP/JSON) qua API Gateway
- **Async events:** RabbitMQ
  - `TREKKING_JOURNEY_COMPLETED` → auth-service (cộng XP)
  - `TREKKING_CONTRIBUTION_APPROVED` → auth-service (cộng XP)
- **Service-to-service:** agent-service gọi trekking-service trực tiếp (bypass gateway) bằng `TREKVIET_INTERNAL_TOKEN`
- **Checkin-service ↔ trekking-service:** qua internal endpoint `/internal/v1/milestones/:id/checkin-context`

## Database Isolation

Mỗi service có MongoDB database riêng:

| Service | Database |
|---------|----------|
| auth-service | trekviet_auth |
| trekking-service | trekviet_trekking |
| checkin-service | trekviet_checkin |
| community-service | trekviet_community |
| agent-service | trekviet_agent |

**Không service nào kết nối DB của service khác trực tiếp.**
Cross-service references là logical IDs (string), không phải foreign keys.

## Gateway Routes

| Path prefix | Proxied to |
|-------------|-----------|
| `/api/v1/auth/*` | auth-service |
| `/api/v1/places/*` | trekking-service |
| `/api/v1/routes/*` | trekking-service |
| `/api/v1/journeys/*` | trekking-service |
| `/api/v1/checkins/*` | checkin-service |
| `/api/v1/visits/*` | checkin-service |
| `/api/v1/contributions/*` | trekking-service |
| `/api/v1/badges/*` | trekking-service |
| `/api/v1/posts/*` | community-service |
| `/api/v1/agent/*` | agent-service |
| `/api/v1/llm/*` | agent-service |
| `/api/v1/admin/*` | routed per domain |

## Auth Flow

```
Client → API Gateway
         → verify JWT (local decode, shared JWT_SECRET)
         → forward with X-User-Id header
         → downstream service trusts userId from token
```

Agent-service verifies admin JWT by:
1. Calling `GET {auth_service_url}/api/v1/auth/verify`
2. Locally decoding JWT with shared `JWT_SECRET`
3. Checking `role === "ADMIN"`
