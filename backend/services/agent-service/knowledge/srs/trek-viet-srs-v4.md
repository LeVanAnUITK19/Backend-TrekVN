---
title: TrekViet SRS v4.0
version: "4.0"
category: srs
active: true
---

# TrekViet Software Requirements Specification — v4.0

## 1. Tổng quan hệ thống

TrekViet là nền tảng trekking offline-first cho người dùng Việt Nam.

**Tech stack:**
- Mobile: Flutter (iOS/Android), offline-first với SQLite
- Backend: Node.js microservices (Express)
- Agent: Python FastAPI (AI Assistant, Place Builder, Map Builder)
- Database: MongoDB (mỗi service một DB riêng)
- Message broker: RabbitMQ
- File storage: Cloudflare R2 (offline maps, images)
- Maps: MapLibre (Flutter), MBTiles format, offline ZIP package

## 2. Microservices

| Service | Port | Mô tả |
|---------|------|-------|
| api-gateway | 3000 | Reverse proxy, auth middleware, rate limiting |
| auth-service | 3001 | Đăng ký, đăng nhập, JWT, gamification (XP/rank) |
| checkin-service | 3002 | GPS check-in milestone, province/place visit tracking |
| trekking-service | 3003 | Places, routes, milestones, journeys, badges |
| community-service | 3004 | Posts, comments, reactions |
| agent-service | 8000 | AI Assistant, Place Builder, Map Builder |

## 3. Core Features

### 3.1 Địa điểm trekking (Place)

- Mỗi `TrekkingPlace` có: tên, slug, tỉnh, vị trí GeoJSON, mô tả, độ khó, ảnh, tags, ratingAverage
- Có thể có `offlineMap` cấp địa điểm (objectKey trỏ đến R2)
- Status: ACTIVE | INACTIVE
- Nguồn tạo: MANUAL | USER_CONTRIBUTION | AI_AGENT

### 3.2 Tuyến đường (Route)

- Mỗi Place có nhiều Routes
- Route có: tên, độ khó, khoảng cách (mét), thời gian ước tính, độ tăng cao, max elevation
- Route có `offlineMap` (objectKey + version, không lưu downloadUrl)
- `downloadUrl = R2_PUBLIC_BASE_URL + "/" + objectKey`

### 3.3 Milestone check-in

- Mỗi Route có các Official Milestones (START, CHECKPOINT, VIEWPOINT, REST_POINT, WATER_POINT, CAMP, SUMMIT, FINISH)
- Check-in GPS: user phải trong `checkinRadiusMeters` của milestone
- `qualifiesPlaceVisit=true` → cập nhật PlaceVisit khi check-in

### 3.4 Journey

**State machine:**
```
PLANNED → ACTIVE → PAUSED → ACTIVE → COMPLETED
                         ↘ CANCELLED
PLANNED → CANCELLED
```

- Journey có: userId, placeId, routeId, name, status, statistics, track (encodedPolyline)
- Hoàn thành Journey → publish `TREKKING_JOURNEY_COMPLETED` → auth-service cộng XP

### 3.5 Gamification

**XP sources:**
- JOURNEY_COMPLETED
- JOURNEY_DISTANCE
- MILESTONE_CHECKIN
- PROVINCE_VISITED
- PLACE_VISITED
- BADGE_EARNED
- ROUTE_APPROVED (contribution)
- PLACE_APPROVED (contribution)

**Ranks (10 cấp):**
NEWBIE → HIKER → EXPLORER → TREKKER → PATHFINDER → MOUNTAINEER → ADVENTURER → ELITE_TREKKER → TREK_MASTER → TREK_LEGEND

Điều kiện thăng rank: minXp + minCompletedJourneys + minVisitedProvinces + minBadgeCount + minDistanceMeters + minApprovedContributions

### 3.6 Badges

- Badge có: code, name, description, category (TREKKING/EXPLORATION/DISTANCE/PROVINCE), rarity (COMMON/RARE/EPIC/LEGENDARY), condition
- Condition types: SUMMIT_CHECKIN_COUNT, ALTITUDE_REACHED, DISTANCE_TOTAL, PROVINCE_COUNT, ...
- Status: ACTIVE | INACTIVE

### 3.7 Province tracking

- 63 tỉnh Việt Nam
- Visit status: UNVISITED | SELF_REPORTED | VERIFIED
- VERIFIED chỉ từ GPS check-in hợp lệ — không thể downgrade
- SELF_REPORTED tự upgrade lên VERIFIED khi có check-in

### 3.8 Contributions

- User đóng góp Route submissions (từ Journey COMPLETED) và Place suggestions
- Admin duyệt qua `/admin/contributions`
- Trạng thái: PENDING_REVIEW → APPROVED | REJECTED | NEEDS_REVISION

## 4. Offline-first Architecture

- Flutter lưu SQLite local
- GPS track, marker, journey state lưu offline
- Sync lên server khi online: `POST /checkins/sync`, `clientJourneyId`, `clientMarkerId` (idempotency)
- Offline map: Flutter tải ZIP từ `downloadUrl` (R2), unzip, MapLibre render local

## 5. Agent Service

### 5.1 AI Assistant

- Chat-based Q&A cho Admin
- Read-only: không thể ghi production
- Có access đến:
  1. Internal knowledge docs (SRS, DB schema, API docs, architecture)
  2. Production GET APIs (trekking, checkin, auth)

### 5.2 Place Builder

- Admin nhập tên địa điểm → Agent tìm OSM + Wikidata + web → tạo candidate
- Admin review và approve → Agent gọi Trekking Service API tạo place thật

### 5.3 Map Builder

- Admin chọn bbox + zoom → Agent tạo MBTiles offline map
- Admin approve → Agent upload R2 → update Trekking Service metadata

## 6. Security

- JWT HS256, shared secret giữa tất cả services
- Admin role check tại mỗi service
- Service-to-service token (`TREKVIET_INTERNAL_TOKEN`) không expose qua Gateway
- Frontend không nhận internal token, R2 secret, API key
- Production writes phải qua API, không qua direct DB
