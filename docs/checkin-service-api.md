# CheckIn Service — API Documentation

**Base URL:** `http://localhost:3002/api/v1`  
**Swagger UI:** `http://localhost:3002/api-docs`

---

## Authentication

Tất cả endpoint (trừ `/health`) đều yêu cầu:

```
Authorization: Bearer <accessToken>
```

Token cấp bởi **auth-service**. CheckIn Service tự verify JWT bằng `JWT_SECRET` dùng chung — không gọi lại auth-service mỗi request.

> **Bảo mật:** `userId` luôn lấy từ JWT payload. Client không được gửi `userId`, `placeId`, `provinceId`, `radius`, tọa độ milestone trong body — validator sẽ `stripUnknown` trước khi xử lý.

---

## Response Format

### Thành công
```json
{ "success": true, "data": {} }
```

### Lỗi
```json
{
  "success": false,
  "error": {
    "code": "CHECKIN_OUT_OF_RADIUS",
    "message": "Bạn đang ở ngoài bán kính check-in (342m > 50m)",
    "details": { "distanceMeters": 342, "radiusMeters": 50 }
  }
}
```

---

## Error Codes

| Code | HTTP | Mô tả |
|------|------|-------|
| `AUTH_REQUIRED` | 401 | Không có hoặc token hết hạn |
| `FORBIDDEN` | 403 | Không có quyền truy cập resource |
| `VALIDATION_ERROR` | 400 | Dữ liệu đầu vào không hợp lệ |
| `MILESTONE_NOT_FOUND` | 404 | Milestone không tồn tại |
| `CHECKIN_NOT_FOUND` | 404 | Check-in không tồn tại |
| `PROVINCE_NOT_FOUND` | 404 | Tỉnh không tồn tại |
| `CHECKIN_ALREADY_EXISTS` | 409 | Đã check-in milestone này trong journey rồi |
| `CHECKIN_OUT_OF_RADIUS` | 422 | Ngoài bán kính check-in của milestone |
| `GPS_ACCURACY_TOO_LOW` | 422 | Độ chính xác GPS vượt ngưỡng cho phép |
| `INTERNAL_ERROR` | 500 | Lỗi server nội bộ |
| `TREKKING_SERVICE_UNAVAILABLE` | 503 | Không kết nối được trekking-service (HTTP mode) |

---

## API Endpoints

---

### POST /checkins 🔒

**Used by:** online GPS milestone check-in.  
**Automatically:** verifies ProvinceVisit (UNVISITED/SELF_REPORTED → VERIFIED), creates/updates PlaceVisit when `qualifiesPlaceVisit=true`.

**Luồng:**
1. JWT → `userId` từ token (không nhận từ body)
2. TrekkingProvider → metadata milestone (server-side, không tin client)
3. `accuracyMeters ≤ CHECKIN_MAX_GPS_ACCURACY_METERS` (default 50m)
4. Haversine distance userGPS ↔ milestoneGPS
5. `distance > checkinRadiusMeters` → `422 CHECKIN_OUT_OF_RADIUS`
6. Duplicate check `(journeyId, milestoneId, userId)`
7. Save `MilestoneCheckin` VERIFIED
8. `qualifiesPlaceVisit=true` → update `PlaceVisit`
9. Update `ProvinceVisit` VERIFIED

**Request Body:**
```json
{
  "journeyId": "journey_langbiang_2026",
  "milestoneId": "milestone_langbiang_summit",
  "latitude": 12.05,
  "longitude": 108.441,
  "accuracyMeters": 8,
  "checkedAt": "2026-09-21T07:00:00.000Z"
}
```

**Response 201:**
```json
{
  "success": true,
  "message": "Check-in thành công",
  "data": {
    "milestoneCheckinId": "64f1a2b3c4d5e6f7a8b9c0d1",
    "journeyId": "journey_langbiang_2026",
    "userId": "user_abc123",
    "milestoneId": "milestone_langbiang_summit",
    "milestoneType": "SUMMIT",
    "trekkingPlaceId": "place_langbiang",
    "trekkingRouteId": "route_langbiang_01",
    "provinceId": "6849a1b2c3d4e5f6a7b8c9d0",
    "qualifiesPlaceVisit": true,
    "location": { "type": "Point", "coordinates": [108.441, 12.05] },
    "accuracyMeters": 8,
    "distanceToMilestoneMeters": 0,
    "verification": { "method": "GPS", "status": "VERIFIED", "reason": null },
    "syncSource": "ONLINE",
    "checkedAt": "2026-09-21T07:00:00.000Z"
  }
}
```

| Status | Code | Khi nào |
|--------|------|---------|
| 400 | `VALIDATION_ERROR` | Thiếu field bắt buộc, sai kiểu |
| 401 | `AUTH_REQUIRED` | Không có/hết hạn token |
| 404 | `MILESTONE_NOT_FOUND` | milestoneId không tồn tại |
| 409 | `CHECKIN_ALREADY_EXISTS` | Đã check-in cùng milestone trong cùng journey |
| 422 | `CHECKIN_OUT_OF_RADIUS` | Ngoài bán kính |
| 422 | `GPS_ACCURACY_TOO_LOW` | accuracyMeters > ngưỡng |
| 503 | `TREKKING_SERVICE_UNAVAILABLE` | Chỉ khi `TREKKING_PROVIDER=http` |

---

### POST /checkins/sync 🔒

**Used by:** SQLite offline check-in synchronization.

**Đặc điểm:**
- Mỗi item xử lý **độc lập** — một item fail không làm batch fail
- **Idempotent** — retry cùng `clientCheckinId` trả về `serverCheckinId` cũ
- `clientCheckinId` bắt buộc cho mỗi item
- Cùng business logic với `POST /checkins` (reuse `processCheckin`)

**Request Body:**
```json
{
  "items": [
    {
      "clientCheckinId": "local_checkin_001",
      "journeyId": "journey_langbiang_2026",
      "milestoneId": "milestone_langbiang_summit",
      "latitude": 12.05,
      "longitude": 108.441,
      "accuracyMeters": 10,
      "checkedAt": "2026-09-21T07:00:00.000Z"
    }
  ]
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "clientCheckinId": "local_checkin_001",
        "serverCheckinId": "64f1a2b3c4d5e6f7a8b9c0d1",
        "status": "VERIFIED"
      },
      {
        "clientCheckinId": "local_bad_milestone",
        "status": "FAILED",
        "error": { "code": "MILESTONE_NOT_FOUND", "message": "..." }
      }
    ]
  }
}
```

---

### GET /checkins/me 🔒

Lịch sử check-in có filter + pagination.

**Query params:**

| Param | Default | Mô tả |
|-------|---------|-------|
| `page` | 1 | Số trang |
| `limit` | 20 | Số bản ghi / trang (max 100) |
| `journeyId` | — | Lọc theo journey |
| `placeId` | — | Lọc theo `trekkingPlaceId` |
| `routeId` | — | Lọc theo `trekkingRouteId` |
| `status` | — | `VERIFIED` \| `REJECTED` \| `PENDING_VERIFICATION` |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "items": [{ "milestoneCheckinId": "...", "milestoneId": "...", "checkedAt": "..." }],
    "total": 57,
    "page": 1,
    "limit": 20
  }
}
```

---

### GET /checkins/:checkinId 🔒

Chi tiết một check-in. User chỉ xem được check-in của chính mình (403 nếu khác).

---

### GET /journeys/:journeyId/checkins 🔒

**Used by:** Journey milestone progress UI (hiển thị START ✓ / SUMMIT ✓ / FINISH ○).

Trả về tất cả check-in của user trong journey, sắp xếp `checkedAt` tăng dần.

**Response 200:**
```json
{
  "success": true,
  "data": [
    { "milestoneId": "milestone_langbiang_start", "milestoneType": "START", "checkedAt": "..." },
    { "milestoneId": "milestone_langbiang_summit", "milestoneType": "SUMMIT", "checkedAt": "..." }
  ]
}
```

---

### GET /visits/provinces/me 🔒

**Used by:**
- Home Vietnam map (tô màu 34 tỉnh theo `visitStatus`)
- Counter "10 / 34 tỉnh" trên Home
- Province selector bottom sheet ("Tỉnh thành đã đi")
- Xác định màu UNVISITED / SELF_REPORTED / VERIFIED

Trả về **TOÀN BỘ** tỉnh trong collection `provinces`, không chỉ các tỉnh đã visit.  
Mỗi tỉnh được merge với `ProvinceVisit` của user hiện tại.

**Performance:** chỉ 2 queries (provinces + province_visits cho user) rồi merge trong memory.

**`mapFeatureId`** dùng để Flutter match GeoJSON polygon:
```
GET /visits/provinces/me
  └─ mapFeatureId → match GeoJSON feature → visitStatus → tô màu
```

**visitStatus:**
- `UNVISITED` — không có ProvinceVisit
- `SELF_REPORTED` — user tự tick thủ công
- `VERIFIED` — có check-in GPS hợp lệ (không thể downgrade)

**Response 200:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalProvinces": 34,
      "visitedCount": 10,
      "verifiedCount": 4,
      "selfReportedCount": 6
    },
    "provinces": [
      {
        "provinceId": "6849a1b2c3d4e5f6a7b8c9d0",
        "code": "lam_dong",
        "name": "Lâm Đồng",
        "region": "SOUTH",
        "mapFeatureId": "VN-LD",
        "center": { "type": "Point", "coordinates": [108.4419, 11.9465] },
        "visitStatus": "VERIFIED",
        "manualMarked": false,
        "visitCount": 2,
        "firstVisitedAt": "2026-09-21T07:00:00.000Z",
        "lastVisitedAt": "2026-09-21T09:30:00.000Z"
      },
      {
        "provinceId": "6849a1b2c3d4e5f6a7b8c9d3",
        "code": "da_nang",
        "name": "Đà Nẵng",
        "region": "CENTRAL",
        "mapFeatureId": "VN-DN",
        "center": { "type": "Point", "coordinates": [108.2022, 16.0544] },
        "visitStatus": "SELF_REPORTED",
        "manualMarked": true,
        "visitCount": 0,
        "firstVisitedAt": null,
        "lastVisitedAt": null
      },
      {
        "provinceId": "6849a1b2c3d4e5f6a7b8c9d4",
        "code": "ha_noi",
        "name": "Hà Nội",
        "region": "NORTH",
        "mapFeatureId": "VN-HN",
        "center": { "type": "Point", "coordinates": [105.8412, 21.0245] },
        "visitStatus": "UNVISITED",
        "manualMarked": false,
        "visitCount": 0,
        "firstVisitedAt": null,
        "lastVisitedAt": null
      }
    ]
  }
}
```

**summary rules:**
- `totalProvinces` = số tỉnh trong collection `provinces` (không hard-code 34)
- `visitedCount` = `verifiedCount + selfReportedCount`
- `selfReportedCount` = chỉ những tỉnh SELF_REPORTED (chưa VERIFIED)

---

### PATCH /visits/provinces/me/:provinceId 🔒

Tick / bỏ tick tỉnh thủ công.

**Request Body:** `{ "visited": true | false }`

**Rules:**
- `visited: true` → `manualMarked=true`, `verificationStatus=SELF_REPORTED` (nếu chưa VERIFIED)
- `visited: false` + SELF_REPORTED → **xóa** record, trả `data: null`
- `visited: false` + VERIFIED → **giữ** record, `manualMarked=false` (không thể downgrade VERIFIED)

**Response 200 examples:**

Đã tick:
```json
{ "success": true, "message": "Đã đánh dấu tỉnh", "data": { "manualMarked": true, "verificationStatus": "SELF_REPORTED" } }
```

Bỏ tick SELF_REPORTED:
```json
{ "success": true, "message": "Đã bỏ đánh dấu tỉnh", "data": null }
```

Bỏ tick VERIFIED:
```json
{ "success": true, "message": "Đã bỏ đánh dấu tỉnh", "data": { "manualMarked": false, "verificationStatus": "VERIFIED" } }
```

---

### GET /visits/provinces/me/:provinceId 🔒

Chi tiết tỉnh + trạng thái visit của user. `visit` = null nếu chưa đến.

---

### GET /visits/places/me/recent 🔒

**Used by:** Home screen widget "Địa điểm đến gần đây".

Trả về địa điểm trekking user đến gần đây. Chỉ bao gồm địa điểm có `PlaceVisit` từ check-in VERIFIED.  
User **không thể** manually mark trekking place.

**Query:** `?limit=5` (max 20)

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "placeVisitId": "64f1a2b3c4d5e6f7a8b9c0d3",
      "trekkingPlaceId": "place_langbiang",
      "provinceId": "6849a1b2c3d4e5f6a7b8c9d0",
      "lastVisitedAt": "2026-09-21T09:30:00.000Z",
      "visitCount": 2,
      "verificationStatus": "VERIFIED"
    }
  ]
}
```

---

### GET /visits/places/me 🔒

Danh sách tất cả địa điểm đã đến (có pagination).

**Query:** `?page=1&limit=20`

---

### GET /visits/places/me/:placeId 🔒

Trạng thái visit một địa điểm cụ thể. `placeId` là `trekkingPlaceId` (string, không phải ObjectId).  
Trả về `null` nếu chưa từng đến.

---

### GET /visits/me/summary 🔒

Tổng hợp số liệu — dùng cho Profile/Statistics.  
`visitedProvinceCount` thống nhất với `GET /visits/provinces/me → summary.visitedCount`.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "visitedProvinceCount": 10,
    "verifiedProvinceCount": 4,
    "visitedPlaceCount": 15,
    "checkinCount": 57
  }
}
```

---

### GET /health

```json
{ "status": "ok", "service": "checkin-service" }
```

---

## API đã xóa khỏi MVP

| Endpoint | Lý do xóa |
|----------|-----------|
| `GET /checkins/me/recent` | Home không còn hiển thị "check-in gần đây". Thay bằng `GET /visits/places/me/recent` |

---

## Business Rules

### visitCount — PlaceVisit

- Mỗi Journey mới tại một Place → `visitCount += 1`
- Cùng Journey có nhiều qualifying milestone → chỉ tính **1 lần**
- PlaceVisit chỉ tạo bởi check-in VERIFIED — không có manual mark

### ProvinceVisit — không downgrade VERIFIED

- VERIFIED chỉ được tạo bởi check-in GPS hợp lệ
- User bỏ tick VERIFIED → record giữ nguyên với `manualMarked=false`, `verificationStatus=VERIFIED`
- SELF_REPORTED tự động upgrade thành VERIFIED khi có check-in tại tỉnh đó

### GPS & Haversine

- `accuracyMeters` = số nhỏ = chính xác hơn. Phải ≤ `CHECKIN_MAX_GPS_ACCURACY_METERS` (default 50m)
- Distance = Haversine(userGPS, milestoneGPS). Phải ≤ `checkinRadiusMeters` của milestone
- Mọi metadata (radius, tọa độ, placeId) lấy từ TrekkingProvider — client không inject được

### Offline Sync Idempotency

- `clientCheckinId` + partial unique index `(clientCheckinId, userId)` ngăn duplicate khi retry
- Cùng `clientCheckinId` từ cùng `userId` → trả về checkin cũ, không tạo mới

---

## Ghi chú Database

- **MongoDB Atlas** — database `checkIn-service-trekVN`
- `provinces` collection phải được seed với 34 tỉnh trước khi sử dụng (xem `src/mocks/provinces.json`)
- Các ID `trekkingPlaceId`, `journeyId` là logical references đến trekking-service — không có FK vật lý
