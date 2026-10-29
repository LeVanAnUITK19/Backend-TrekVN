# TrekVN Backend — Documentation Index

Current implementation review: **2026-10-12**. Start with [services.md](services.md), [implemented route inventory](api-route-inventory.md), [database runtime reference](database/README.md) and [pre-push audit](pre-push-audit-2026-10-12.md). Exported OpenAPI files are in [openapi/](openapi/).

## Services

Community mở rộng 29/10/2026: [Hồ sơ/QR, chat riêng/nhóm và quản trị tin nhắn](community-social-api.md), [API bài viết/bình luận](community-service-api.md).

| Service | Port | API Docs | Swagger |
|---------|------|----------|---------|
| api-gateway | 3000 | — | — |
| auth-service | 3001 | [auth-service-api.md](./auth-service-api.md) | `http://localhost:3001/api-docs` |
| checkin-service | 3002 | [checkin-service-api.md](./checkin-service-api.md) | `http://localhost:3002/api-docs` |
| trekking-service | 3003 | [trekking-service-api.md](./trekking-service-api.md) | `http://localhost:3003/api-docs` |
| agent-service | 8000 | [agent/api.md](./agent/api.md) | `http://localhost:8000/docs` |
| community-service | 3004 | [community-service-api.md](./community-service-api.md) | `http://localhost:3004/api-docs` |

## 🌐 Web Admin API

**→ [web-admin-api.md](./web-admin-api.md)** — Tài liệu tổng hợp tất cả endpoint dành cho Web Admin panel (auth, users, ranks, places, routes, milestones, contributions, badges, offline maps, journeys, AI agent).

## API Gateway — Route Mapping

Tất cả request từ client đều qua `http://localhost:3000`.

| Prefix | → Service | Auth Required |
|--------|-----------|---------------|
| `/api/v1/auth/*` | auth-service | Partial (logout, verify) |
| `/api/v1/users/*` | auth-service | 🔒 /me endpoints |
| `/api/v1/gamification/*` | auth-service | 🔒 /me, /users/* |
| `/api/v1/admin/users/*` | **auth-service** | 🔒 ADMIN |
| `/api/v1/admin/ranks/*` | **auth-service** | 🔒 ADMIN |
| `/api/v1/admin/dashboard` | **auth-service** | 🔒 ADMIN |
| `/api/v1/admin/audit-logs` | **auth-service** | 🔒 ADMIN |
| `/api/v1/checkins/*` | checkin-service | 🔒 All |
| `/api/v1/visits/*` | checkin-service | 🔒 All |
| `/api/v1/posts/*` | community-service | 🔒 All |
| `/api/v1/comments/*` | community-service | 🔒 All |
| `/api/v1/community/ws` | community-service (WebSocket upgrade) | 🔒 First-frame JWT |
| `/api/v1/places/*` | trekking-service | Public read, 🔒 reviews |
| `/api/v1/routes/*` | trekking-service | Public |
| `/api/v1/journeys/*` | trekking-service | 🔒 All |
| `/api/v1/contributions/*` | trekking-service | 🔒 All |
| `/api/v1/badges/*` | trekking-service | 🔒 /me |
| `/api/v1/uploads/*` | trekking-service | 🔒 All |
| `/api/v1/admin/trekking/*` | trekking-service | 🔒 ADMIN |
| `/api/v1/admin/contributions/*` | trekking-service | 🔒 ADMIN |
| `/api/v1/admin/badges/*` | trekking-service | 🔒 ADMIN |
| `/api/v1/admin/trekking/offline-maps/*` | trekking-service | 🔒 ADMIN |
| `/api/v1/admin/trekking/journeys/*` | trekking-service | 🔒 ADMIN |
| `/api/v1/admin/trekking/milestones/*` | trekking-service | 🔒 ADMIN |
| `/api/v1/agent/*` | agent-service | 🔒 ADMIN |
| `/api/v1/llm/*` | agent-service | 🔒 ADMIN |

> **⚠️ Important:** `/api/v1/journeys/:id/checkins` goes to trekking-service (wrong!).
> Use **`/api/v1/checkins/journeys/:journeyId`** to get journey checkins via Gateway.

> **Note:** `/internal/v1/*` (service-internal) **NOT exposed via Gateway**.

## Database Design

- [server.dbml](./database/server.dbml) — Overview toàn bộ server DB
- [database/README.md](./database/README.md) — exact runtime schemas/indexes and conceptual diagram distinctions
- [services/agent.dbml](./database/services/agent.dbml) — separate Agent DB, including pending approval lifecycle
- [services/auth.dbml](./database/services/auth.dbml) — auth_db schema (v3.1 + v4.0 alignment)
- [services/checkin.dbml](./database/services/checkin.dbml) — checkin_db schema
- [services/trekking.dbml](./database/services/trekking.dbml) — trekking_db schema (v3.1 + v4.0 alignment)
- [services/community.dbml](./database/services/community.dbml) — community_db schema
- [mobile.dbml](./database/mobile.dbml) — SQLite local schema

## Cross-service Communication

```
Flutter App
    │
    ▼ HTTPS REST
API Gateway (:3000)
    ├──► auth-service (:3001)       MongoDB: auth_db
    ├──► checkin-service (:3002)    MongoDB: checkin_db
    │        │
    │        ├── internal HTTP ──► trekking-service (:3003)
    │        │                     GET /internal/v1/milestones/:id/checkin-context
    │        │
    │        └── internal HTTP ──► checkin-service self
    │                              GET /internal/v1/provinces?region=X (for trekking region filter)
    └──► trekking-service (:3003)   MongoDB: trekking_db

RabbitMQ Events (backend only — requires RABBITMQ_ENABLED=true):
    checkin-service  ──publish──►  auth-service (gamification consumer)
      CHECKIN_VERIFIED, PROVINCE_FIRST_VISITED, PLACE_FIRST_VISITED

    trekking-service ──publish──►  auth-service (gamification consumer)
      TREKKING_JOURNEY_COMPLETED, TREKKING_BADGE_EARNED, TREKKING_CONTRIBUTION_APPROVED

    checkin-service  ──publish──►  trekking-service (trekking consumer)
      CHECKIN_VERIFIED → Journey.checkinCount++

    trekking-service ──publish──►  trekking-service (self — badge consumer)
      TREKKING_JOURNEY_COMPLETED → BadgeEvaluator
```

## v4.0 Review & Changes

See [backend-v4-review-and-changes.md](./backend-v4-review-and-changes.md) for a complete list of all changes, migrations, and known issues.

## Chạy local

```bash
# 1. Auth service
cd services/auth-service && npm run dev

# 2. Checkin service
cd services/checkin-service && npm run dev

# 3. Trekking service
cd services/trekking-service && npm run dev

# 4. API Gateway (sau khi các service đã up)
cd services/api-gateway && npm run dev
```

Sau đó test qua Gateway: `http://localhost:3000/api/v1/...`

## Seed Data

```bash
# Seed rank definitions (auth-service)
cd services/auth-service && npm run seed:ranks

# TREK_LEGEND minXp corrected to 80000 per SRS v4.0 FR-RANK-16
# Re-run this after every deployment if rank config changes
```

## Migration (v3 → v4.0)

```javascript
// 1. Fix user status values (run on MongoDB Atlas)
db.users.updateMany(
  { status: { $in: ["SUSPENDED", "DISABLED"] } },
  { $set: { status: "BLOCKED" } }
);
db.users.updateMany({ role: "GUIDE" }, { $set: { role: "USER" } });

// 2. Re-seed ranks
// cd services/auth-service && npm run seed:ranks

// 3. Frontend: update journey checkins endpoint
// /api/v1/journeys/:id/checkins → /api/v1/checkins/journeys/:journeyId
```
