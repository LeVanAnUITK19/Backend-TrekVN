# Trekking Service — API Documentation

**Review 2026-10-12:** [All implemented routes](api-route-inventory.md), [OpenAPI snapshot](openapi/trekking-service.json), [physical MongoDB fields/indexes](database/README.md). Admin catalog routes use `/api/v1/admin/trekking/...`; internal APIs are private. Swagger request schemas are derived from current Joi validators where available.

**Base URL:** `http://localhost:3003/api/v1`
**Swagger UI:** `http://localhost:3003/api-docs`
**Internal Base:** `http://localhost:3003/internal/v1` *(service-to-service only, không qua Gateway)*

---

## Authentication

Các endpoint có dấu 🔒 yêu cầu header:

```
Authorization: Bearer <accessToken>
```

Các endpoint có dấu 👑 yêu cầu thêm **role ADMIN**.

Token cấp bởi **auth-service**. Trekking Service tự verify JWT bằng `JWT_SECRET` dùng chung — không gọi lại auth-service mỗi request.

> **Bảo mật:** `userId` luôn lấy từ JWT payload. Client không được inject `userId` qua body — validator sẽ `stripUnknown` tất cả field lạ.

---

## Idempotency (Offline-first)

Với các operation tạo mới có thể retry khi mất mạng, client nên gửi:

```
Idempotency-Key: <uuid>
```

Hoặc sử dụng `clientJourneyId` / `clientMarkerId` / `clientOperationId` trong body.
Retry cùng key/id trả về kết quả đã tạo, không tạo bản ghi mới.

---

## Response Format

### Thành công
```json
{ "success": true, "data": {} }
```

### Thành công có pagination
```json
{
  "success": true,
  "data": {
    "items": [],
    "total": 50,
    "page": 1,
    "limit": 20
  }
}
```

### Lỗi
```json
{
  "success": false,
  "error": {
    "code": "JOURNEY_INVALID_STATE",
    "message": "Trạng thái journey không hợp lệ: hiện là \"COMPLETED\", cần \"ACTIVE\"",
    "details": { "current": "COMPLETED", "expected": "ACTIVE" }
  },
  "requestId": "abc-123"
}
```

---

## Error Codes

| Code | HTTP | Mô tả |
|------|------|-------|
| `VALIDATION_ERROR` | 400 | Dữ liệu đầu vào không hợp lệ |
| `UNAUTHORIZED` | 401 | Token thiếu hoặc hết hạn |
| `FORBIDDEN` | 403 | Không có quyền |
| `NOT_FOUND` | 404 | Resource không tồn tại |
| `PLACE_NOT_FOUND` | 404 | Địa điểm không tồn tại hoặc INACTIVE |
| `ROUTE_NOT_FOUND` | 404 | Tuyến đường không tồn tại hoặc INACTIVE |
| `MILESTONE_NOT_FOUND` | 404 | Cột mốc không tồn tại |
| `JOURNEY_NOT_FOUND` | 404 | Hành trình không tồn tại |
| `MARKER_NOT_FOUND` | 404 | Marker không tồn tại |
| `REVIEW_NOT_FOUND` | 404 | Đánh giá không tồn tại |
| `CONTRIBUTION_NOT_FOUND` | 404 | Đóng góp không tồn tại |
| `BADGE_NOT_FOUND` | 404 | Badge không tồn tại |
| `CONFLICT` | 409 | Trùng lặp dữ liệu |
| `MARKER_DUPLICATE` | 409 | clientMarkerId đã tồn tại |
| `JOURNEY_ALREADY_COMPLETED` | 409 | Journey đã hoàn thành |
| `CONTRIBUTION_ALREADY_REVIEWED` | 409 | Contribution đã được admin khác review |
| `IDEMPOTENCY_CONFLICT` | 409 | Idempotency key đang được xử lý |
| `JOURNEY_INVALID_STATE` | 422 | Chuyển trạng thái không hợp lệ |
| `JOURNEY_NOT_OWNER` | 403 | Journey không thuộc user này |
| `MARKER_NOT_OWNER` | 403 | Marker không thuộc user này |
| `CONTRIBUTION_INVALID_STATE` | 422 | Trạng thái contribution không cho phép thao tác này |
| `INTERNAL_ERROR` | 500 | Lỗi server nội bộ |

---

## Places

---

### GET /places

Danh sách địa điểm trekking. **Chỉ trả về địa điểm ACTIVE.**

**Query params:**

| Param | Type | Mô tả |
|-------|------|-------|
| `q` | string | Tìm kiếm theo tên hoặc mô tả |
| `provinceId` | string | Lọc theo tỉnh |
| `difficulty` | string | `EASY` \| `MODERATE` \| `HARD` \| `EXPERT` |
| `tags` | string | Tag phân cách bằng dấu phẩy, ví dụ `mountain,camping` |
| `page` | integer | Mặc định 1 |
| `limit` | integer | Mặc định 20, tối đa 100 |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "trekkingPlaceId": "64f1a2b3c4d5e6f7a8b9c0d1",
        "name": "Núi Langbiang",
        "slug": "nui-langbiang",
        "provinceId": "lam_dong",
        "address": "Lạc Dương, Lâm Đồng",
        "location": { "type": "Point", "coordinates": [108.441, 12.05] },
        "description": "Đỉnh núi cao nhất Đà Lạt...",
        "difficulty": "HARD",
        "averageDurationMinutes": 240,
        "images": ["https://cdn.example.com/langbiang1.jpg"],
        "imageMapUrl": "https://cdn.example.com/langbiang-map.jpg",
        "tags": ["mountain", "cloud-hunting"],
        "ratingAverage": 4.7,
        "ratingCount": 128,
        "status": "ACTIVE"
      }
    ],
    "total": 42,
    "page": 1,
    "limit": 20
  }
}
```

---

### GET /places/:placeId

Chi tiết địa điểm. Trả 404 nếu INACTIVE.

---

### GET /places/:placeId/routes

Danh sách tuyến đường của địa điểm. **Chỉ trả về route ACTIVE.**

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "trekkingRouteId": "64f1a2b3c4d5e6f7a8b9c0d2",
      "trekkingPlaceId": "64f1a2b3c4d5e6f7a8b9c0d1",
      "name": "Route Langbiang chính",
      "difficulty": "HARD",
      "distanceMeters": 12800,
      "estimatedDurationMinutes": 240,
      "elevationGain": 870,
      "maxElevation": 2167,
      "offlineMap": {
        "available": true,
        "version": 3,
        "objectKey": "langbiang/v3/langbiang-v3-flutter.zip",
        "sizeBytes": 48000000,
        "checksum": "sha256:abc123...",
        "minZoom": 10,
        "maxZoom": 16
      },
      "status": "ACTIVE"
    }
  ]
}
```

---

## Reviews

---

### GET /places/:placeId/reviews

Danh sách đánh giá của địa điểm.

**Query:** `?page=1&limit=20`

---

### GET /places/:placeId/reviews/me 🔒

Đánh giá của tôi cho địa điểm này. Trả `data: null` nếu chưa đánh giá.

---

### POST /places/:placeId/reviews 🔒

Tạo hoặc cập nhật đánh giá *(upsert — mỗi user chỉ có 1 review / địa điểm)*.

**Request Body:**
```json
{
  "point": 5,
  "content": "Cung đường tuyệt vời, view đẹp!",
  "imagesUrl": ["https://cdn.example.com/review1.jpg"],
  "videoUrl": []
}
```

| Field | Bắt buộc | Mô tả |
|-------|----------|-------|
| `point` | ✅ | Rating 1–5 |
| `content` | | Nội dung tối đa 5000 ký tự |
| `imagesUrl` | | Tối đa 10 URL |
| `videoUrl` | | Tối đa 3 URL |

**Response 201:**
```json
{
  "success": true,
  "data": {
    "detailEvaluateId": "64f1a2b3c4d5e6f7a8b9c0d3",
    "trekkingPlaceId": "64f1a2b3c4d5e6f7a8b9c0d1",
    "userId": "user_abc123",
    "point": 5,
    "content": "Cung đường tuyệt vời, view đẹp!",
    "imagesUrl": [],
    "deleted": false,
    "createdAt": "2026-10-01T08:00:00Z"
  }
}
```

Sau khi tạo/sửa/xóa, `ratingAverage` và `ratingCount` của Place được tính lại tự động.

| Status | Code | Khi nào |
|--------|------|---------|
| 400 | `VALIDATION_ERROR` | `point` ngoài 1–5 |
| 401 | `UNAUTHORIZED` | Thiếu token |
| 404 | `PLACE_NOT_FOUND` | Place không tồn tại hoặc INACTIVE |

---

### PUT /places/:placeId/reviews/:reviewId 🔒

Cập nhật đánh giá. Chỉ owner được sửa.

---

### DELETE /places/:placeId/reviews/:reviewId 🔒

Soft delete đánh giá. Chỉ owner được xóa. **Response 204.**

---

## Routes & Milestones

---

### GET /routes/:routeId

Chi tiết tuyến đường. Trả 404 nếu INACTIVE.

---

### GET /routes/:routeId/milestones

Danh sách cột mốc chính thức của tuyến đường, **sắp xếp theo `sequence` tăng dần**.

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "milestoneId": "64f1a2b3c4d5e6f7a8b9c0d4",
      "trekkingRouteId": "64f1a2b3c4d5e6f7a8b9c0d2",
      "name": "Điểm xuất phát",
      "type": "START",
      "sequence": 1,
      "location": { "type": "Point", "coordinates": [108.441, 12.04] },
      "altitude": 1500,
      "checkinRadiusMeters": 50,
      "required": true,
      "qualifiesPlaceVisit": false
    },
    {
      "milestoneId": "64f1a2b3c4d5e6f7a8b9c0d5",
      "name": "Đỉnh Langbiang",
      "type": "SUMMIT",
      "sequence": 3,
      "altitude": 2167,
      "checkinRadiusMeters": 100,
      "qualifiesPlaceVisit": true
    }
  ]
}
```

**Milestone types:** `START` | `CHECKPOINT` | `VIEWPOINT` | `REST_POINT` | `WATER_POINT` | `CAMP` | `SUMMIT` | `FINISH`

---

## Offline Package

---

### GET /routes/:routeId/offline-package

Trả về toàn bộ dữ liệu để Flutter cache offline: place, route, milestones và map manifest.

> **Quan trọng:**
> - Gateway **không proxy** file map. Client tải file ZIP trực tiếp từ `mapManifest.downloadUrl`.
> - `downloadUrl` được **backend build tại runtime**: `R2_PUBLIC_BASE_URL + "/" + objectKey`.
> - `R2_PUBLIC_BASE_URL` chỉ cấu hình trong `.env` server — **không hard-code** trong Flutter.
> - Flutter **chỉ dùng `downloadUrl`** từ response này để download.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "place": { "trekkingPlaceId": "...", "name": "Núi Langbiang" },
    "route": {
      "trekkingRouteId": "...",
      "name": "Route Langbiang chính",
      "distanceMeters": 12800
    },
    "milestones": [
      { "milestoneId": "...", "type": "START", "sequence": 1 },
      { "milestoneId": "...", "type": "SUMMIT", "sequence": 3 }
    ],
    "mapManifest": {
      "available": true,
      "version": 3,
      "sizeBytes": 48000000,
      "downloadUrl": "https://pub-c429007bbe324419a00997f91770fc06.r2.dev/langbiang/v3/langbiang-v3-flutter.zip",
      "checksum": "sha256:abc123def456",
      "minZoom": 10,
      "maxZoom": 16,
      "bounds": {
        "minLat": 11.9,
        "minLon": 108.3,
        "maxLat": 12.2,
        "maxLon": 108.6
      }
    }
  }
}
```

> **Lưu ý:** DB lưu `objectKey` (ví dụ `langbiang/v3/langbiang-v3-flutter.zip`), không lưu `downloadUrl`.
> Backend build: `downloadUrl = R2_PUBLIC_BASE_URL + "/" + objectKey`.

**Flutter flow tải map:**
1. Gọi API lấy `mapManifest.downloadUrl`
2. Download file ZIP trực tiếp từ `downloadUrl` (Cloudflare R2 public)
3. Hiển thị progress
4. Verify checksum nếu `checksum` không rỗng
5. Unzip và lưu map local
6. Cập nhật `downloaded_maps` status: `DOWNLOADING → READY` (hoặc `FAILED`)

**Update map (version mới):**
- Backend thay `objectKey` và tăng `version` (ví dụ `ba-den/v2/ba-den-v2-flutter.zip`, version=2)
- Flutter gọi `/offline-package/check`, nhận `hasUpdate: true`
- Flutter đánh dấu `OUTDATED`, cho user chọn cập nhật

---

### GET /routes/:routeId/offline-package/check

Kiểm tra version để biết có cần update map package không.

**Query:** `?version=2` *(version hiện tại của client)*

**Response 200:**
```json
{
  "success": true,
  "data": {
    "hasUpdate": true,
    "serverVersion": 3,
    "available": true,
    "downloadUrl": "https://pub-c429007bbe324419a00997f91770fc06.r2.dev/langbiang/v3/langbiang-v3-flutter.zip",
    "checksum": "sha256:abc123def456"
  }
}
```

> Flutter nhận `hasUpdate: true` → đánh dấu map `OUTDATED` → dùng `downloadUrl` mới để cập nhật.

---

## Journeys

**State Machine:**
```
PLANNED ──start──► ACTIVE ──pause──► PAUSED
   │                  │                 │
cancel             complete           resume → ACTIVE
   │                  │                 │
   ▼                  ▼               cancel
CANCELLED          COMPLETED        CANCELLED
```

---

### GET /journeys 🔒

Danh sách hành trình của tôi.

**Query params:**

| Param | Mô tả |
|-------|-------|
| `status` | `PLANNED` \| `ACTIVE` \| `PAUSED` \| `COMPLETED` \| `CANCELLED` |
| `page` | Mặc định 1 |
| `limit` | Mặc định 20, tối đa 100 |
| `sort` | Mặc định `-createdAt` |

---

### GET /journeys/statistics 🔒

Thống kê tổng hợp từ các journey COMPLETED của tôi.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "totalJourneys": 12,
    "totalDistanceMeters": 145000,
    "totalElevationGain": 8200,
    "totalDurationSeconds": 172800
  }
}
```

---

### POST /journeys 🔒

Tạo hành trình mới.

**Headers:**
```
Idempotency-Key: <uuid>    ← tùy chọn, chống duplicate khi offline retry
```

**Request Body:**
```json
{
  "trekkingPlaceId": "64f1a2b3c4d5e6f7a8b9c0d1",
  "trekkingRouteId": "64f1a2b3c4d5e6f7a8b9c0d2",
  "name": "Leo Langbiang tháng 10",
  "clientJourneyId": "local_journey_abc123",
  "note": "Ghi chú tùy ý",
  "participantCount": 3,
  "plannedStartAt": "2026-10-05T06:00:00Z",
  "plannedEndAt": "2026-10-05T14:00:00Z"
}
```

| Field | Bắt buộc | Mô tả |
|-------|----------|-------|
| `trekkingPlaceId` | ✅ | ObjectId của địa điểm |
| `trekkingRouteId` | ✅ | ObjectId của tuyến đường |
| `name` | ✅ | Tên hành trình, tối đa 200 ký tự |
| `clientJourneyId` | | ID local để map offline ↔ server |
| `note` | | Ghi chú, tối đa 2000 ký tự |
| `participantCount` | | Số người, mặc định 1 |
| `plannedStartAt` | | ISO datetime |
| `plannedEndAt` | | ISO datetime |

**Response 201:**
```json
{
  "success": true,
  "data": {
    "journeyId": "64f1a2b3c4d5e6f7a8b9c0d6",
    "userId": "user_abc123",
    "trekkingPlaceId": "64f1a2b3c4d5e6f7a8b9c0d1",
    "trekkingRouteId": "64f1a2b3c4d5e6f7a8b9c0d2",
    "clientJourneyId": "local_journey_abc123",
    "name": "Leo Langbiang tháng 10",
    "status": "PLANNED",
    "participantCount": 3,
    "checkinCount": 0,
    "markerCount": 0,
    "createdAt": "2026-10-01T09:00:00Z"
  }
}
```

---

### GET /journeys/:journeyId 🔒

Chi tiết hành trình. Chỉ owner mới xem được (404 nếu không phải của mình).

---

### POST /journeys/:journeyId/start 🔒

Bắt đầu hành trình: `PLANNED → ACTIVE`.

**Request Body** *(optional):*
```json
{ "startedAt": "2026-10-05T06:30:00Z" }
```

**Response 200:** Journey với `status: "ACTIVE"`, `startedAt` được set.

| Status | Code | Khi nào |
|--------|------|---------|
| 404 | `JOURNEY_NOT_FOUND` | Journey không tồn tại hoặc không thuộc user |
| 422 | `JOURNEY_INVALID_STATE` | Không ở trạng thái PLANNED |
| 409 | `JOURNEY_ALREADY_COMPLETED` | Journey đã hoàn thành |

---

### POST /journeys/:journeyId/pause 🔒

Tạm dừng hành trình: `ACTIVE → PAUSED`.

---

### POST /journeys/:journeyId/resume 🔒

Tiếp tục hành trình: `PAUSED → ACTIVE`.

---

### POST /journeys/:journeyId/complete 🔒

Hoàn thành hành trình: `ACTIVE → COMPLETED`.

**Headers:**
```
Idempotency-Key: <uuid>    ← khuyến nghị để chống duplicate khi offline retry
```

**Request Body:**
```json
{
  "completedAt": "2026-10-05T14:15:00Z",
  "statistics": {
    "distanceMeters": 12840,
    "durationSeconds": 27900,
    "elevationGain": 870,
    "maxAltitude": 2167,
    "averageSpeed": 1.84
  },
  "track": {
    "encodedPolyline": "_p~iF~ps|U_ulLnnqC_mqNvxq`@"
  }
}
```

> Raw GPS array không được gửi lên server. Client tính toán statistics và encode polyline trước.

Sau khi hoàn thành, service publish event `TREKKING_JOURNEY_COMPLETED` lên RabbitMQ để auth/gamification service cộng XP.

---

### POST /journeys/:journeyId/cancel 🔒

Hủy hành trình: `PLANNED/ACTIVE/PAUSED → CANCELLED`.

---

## Journey Markers

Cột mốc do người dùng tự đánh dấu trong hành trình. Khác với Official Milestone — không tự động trở thành dữ liệu chuẩn.

**Marker types (canonical):** `VIEWPOINT` | `REST_POINT` | `WATER_POINT` | `DANGER` | `INTERSECTION` | `CAMP` | `PHOTO_SPOT` | `LANDMARK` | `SUMMIT` | `OTHER`

**Alias được chấp nhận:** `WATER_SOURCE → WATER_POINT`, `JUNCTION → INTERSECTION`, `CAMPING → CAMP`

---

### GET /journeys/:journeyId/markers 🔒

Danh sách markers của hành trình, sắp xếp `markedAt` tăng dần. Chỉ owner mới xem được.

---

### POST /journeys/:journeyId/markers 🔒

Tạo marker. Journey phải ở trạng thái **ACTIVE** hoặc **PAUSED**.

**Request Body:**
```json
{
  "clientMarkerId": "local_marker_001",
  "name": "Điểm ngắm cảnh đỉnh",
  "type": "VIEWPOINT",
  "note": "View rất đẹp lúc 7h sáng",
  "location": {
    "type": "Point",
    "coordinates": [108.441, 12.05]
  },
  "altitude": 2100,
  "accuracyMeters": 8,
  "images": ["https://cdn.example.com/photo1.jpg"],
  "markedAt": "2026-10-05T07:30:00Z"
}
```

| Field | Bắt buộc | Mô tả |
|-------|----------|-------|
| `name` | ✅ | Tối đa 200 ký tự |
| `type` | ✅ | Xem danh sách canonical types |
| `location` | ✅ | GeoJSON Point, lng ∈ [-180,180], lat ∈ [-90,90] |
| `markedAt` | | Mặc định thời điểm server nhận |
| `clientMarkerId` | | Idempotency key cho offline retry |
| `accuracyMeters` | | GPS accuracy — nếu > 50m nên cảnh báo trên UI |

Sau khi tạo marker, `journey.markerCount` tự động tăng 1.

**Response 201:**
```json
{
  "success": true,
  "data": {
    "journeyMarkerId": "64f1a2b3c4d5e6f7a8b9c0d7",
    "journeyId": "64f1a2b3c4d5e6f7a8b9c0d6",
    "userId": "user_abc123",
    "clientMarkerId": "local_marker_001",
    "name": "Điểm ngắm cảnh đỉnh",
    "type": "VIEWPOINT",
    "location": { "type": "Point", "coordinates": [108.441, 12.05] },
    "altitude": 2100,
    "accuracyMeters": 8,
    "markedAt": "2026-10-05T07:30:00Z"
  }
}
```

| Status | Code | Khi nào |
|--------|------|---------|
| 400 | `VALIDATION_ERROR` | GeoJSON không hợp lệ, name thiếu |
| 409 | `MARKER_DUPLICATE` | `clientMarkerId` đã tồn tại |
| 422 | `JOURNEY_INVALID_STATE` | Journey không ở ACTIVE hoặc PAUSED |

---

### PUT /journeys/:journeyId/markers/:markerId 🔒

Cập nhật marker. Chỉ owner được sửa. Có thể cập nhật: `name`, `type`, `note`, `images`, `location`, `altitude`.

---

### DELETE /journeys/:journeyId/markers/:markerId 🔒

Xóa marker. Chỉ owner được xóa. `journey.markerCount` tự động giảm 1.
**Response 204.**

---

## Contributions

---

### POST /contributions/routes 🔒

Gửi đóng góp cung đường từ **Journey đã COMPLETED**.

**Request Body:**
```json
{
  "clientOperationId": "op_route_001",
  "sourceJourneyId": "64f1a2b3c4d5e6f7a8b9c0d6",
  "trekkingPlaceId": "64f1a2b3c4d5e6f7a8b9c0d1",
  "proposedName": "Cung Langbiang cạnh rừng thông",
  "description": "Cung đường đi qua rừng thông...",
  "notes": "Dốc đứng đoạn km 8, cẩn thận mưa trơn",
  "encodedPolyline": "_p~iF~ps|U_ulLnnqC...",
  "statistics": {
    "distanceMeters": 13500,
    "durationSeconds": 28800,
    "elevationGain": 920,
    "maxAltitude": 2200,
    "averageSpeed": 1.72
  },
  "images": ["https://cdn.example.com/route1.jpg"],
  "markerIds": ["64f1a2b3c4d5e6f7a8b9c0d7", "64f1a2b3c4d5e6f7a8b9c0d8"]
}
```

`markerIds` là danh sách Journey Marker user **chọn** chia sẻ. Các marker này được **snapshot** vào `route_submission_markers` — chỉnh sửa marker gốc sau khi submit không ảnh hưởng dữ liệu đang review.

**Response 201:** `{ "data": { "routeSubmissionId": "...", "status": "PENDING_REVIEW" } }`

| Status | Code | Khi nào |
|--------|------|---------|
| 422 | `CONTRIBUTION_INVALID_STATE` | Journey chưa COMPLETED |
| 404 | `JOURNEY_NOT_FOUND` | Journey không thuộc user |

---

### POST /contributions/places 🔒

Gửi đề xuất địa điểm mới.

**Request Body:**
```json
{
  "clientOperationId": "op_place_001",
  "provinceId": "lam_dong",
  "proposedName": "Thác Pongour mùa lũ",
  "address": "Huyện Đức Trọng, Lâm Đồng",
  "location": {
    "type": "Point",
    "coordinates": [108.2611, 11.6422]
  },
  "description": "Thác cao nhất Tây Nguyên vào mùa mưa...",
  "difficulty": "EASY",
  "tags": ["waterfall", "picnic"],
  "images": ["https://cdn.example.com/pongour.jpg"]
}
```

---

### GET /contributions/me 🔒

Lịch sử đóng góp của tôi (route submissions + place suggestions).

**Query:** `?status=PENDING_REVIEW&page=1&limit=20`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "routes": {
      "items": [{ "routeSubmissionId": "...", "status": "PENDING_REVIEW" }],
      "total": 3
    },
    "places": {
      "items": [{ "placeSuggestionId": "...", "status": "APPROVED" }],
      "total": 1
    }
  }
}
```

---

### GET /contributions/me/:id 🔒

Chi tiết một đóng góp kèm snapshot markers (nếu là route submission).

---

### POST /contributions/me/:id/resubmit 🔒

Gửi lại contribution sau khi nhận `NEEDS_REVISION`. Trạng thái quay về `PENDING_REVIEW`.

---

### POST /contributions/me/:id/cancel 🔒

Hủy contribution. Chỉ được hủy khi ở trạng thái `DRAFT`, `PENDING_REVIEW` hoặc `NEEDS_REVISION`.
**Response 204.**

---

## Badges

---

### GET /badges

Danh sách badges ACTIVE của hệ thống.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "badgeId": "64f1a2b3c4d5e6f7a8b9c0e1",
        "code": "FIRST_SUMMIT",
        "name": "Đỉnh Đầu Tiên",
        "description": "Hoàn thành check-in SUMMIT lần đầu",
        "iconUrl": "https://cdn.example.com/badges/first_summit.png",
        "category": "TREKKING",
        "rarity": "COMMON",
        "condition": { "type": "SUMMIT_CHECKIN_COUNT", "value": 1 }
      }
    ]
  }
}
```

---

### GET /badges/me 🔒

Danh sách badges tôi đã đạt.

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "userBadgeId": "64f1a2b3c4d5e6f7a8b9c0e2",
      "userId": "user_abc123",
      "badgeId": { "code": "FIRST_SUMMIT", "name": "Đỉnh Đầu Tiên", "rarity": "COMMON" },
      "journeyId": "64f1a2b3c4d5e6f7a8b9c0d6",
      "earnedAt": "2026-10-05T14:30:00Z"
    }
  ]
}
```

---

## Admin — Trekking Data 👑

> Tất cả endpoint `/admin/*` yêu cầu role **ADMIN**.

---

### GET /admin/trekking/places 👑

Danh sách tất cả địa điểm (bao gồm INACTIVE), hỗ trợ filter `?status=INACTIVE`.

---

### POST /admin/trekking/places 👑

Tạo địa điểm mới.

**Request Body:**
```json
{
  "name": "Núi Bà Đen",
  "provinceId": "tay_ninh",
  "location": { "type": "Point", "coordinates": [106.098, 11.401] },
  "description": "Núi cao nhất Nam Bộ...",
  "difficulty": "MODERATE",
  "tags": ["mountain", "cable-car"],
  "status": "ACTIVE"
}
```

---

### GET /admin/trekking/places/:id 👑

---

### PUT /admin/trekking/places/:id 👑

---

### PATCH /admin/trekking/places/:id/status 👑

```json
{ "status": "INACTIVE" }
```

---

### GET /admin/trekking/routes 👑

---

### POST /admin/trekking/routes 👑

---

### GET /admin/trekking/routes/:id 👑

---

### PUT /admin/trekking/routes/:id 👑

---

### PATCH /admin/trekking/routes/:id/status 👑

---

### GET /admin/trekking/routes/:routeId/offline-map 👑

Lấy metadata offline map của route.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "available": true,
    "version": 3,
    "objectKey": "langbiang/v3/langbiang-v3-flutter.zip",
    "sizeBytes": 48000000,
    "downloadUrl": "https://pub-c429007bbe324419a00997f91770fc06.r2.dev/langbiang/v3/langbiang-v3-flutter.zip",
    "checksum": "sha256:abc123",
    "minZoom": 10,
    "maxZoom": 16
  }
}
```

> `downloadUrl` được build từ `R2_PUBLIC_BASE_URL + "/" + objectKey` — không lưu trong DB.

---

### PUT /admin/trekking/routes/:routeId/offline-map 👑

Cập nhật metadata offline map (sau khi upload file lên R2 thủ công).

**Request Body:**
```json
{
  "available": true,
  "version": 4,
  "objectKey": "langbiang/v4/langbiang-v4-flutter.zip",
  "sizeBytes": 52000000,
  "checksum": "sha256:xyz789",
  "minZoom": 10,
  "maxZoom": 16,
  "bounds": {
    "minLat": 11.9,
    "minLon": 108.3,
    "maxLat": 12.2,
    "maxLon": 108.6
  }
}
```

> Chỉ cần gửi `objectKey` — **không gửi `downloadUrl`**. Backend tự build URL từ env.

---

### GET /admin/trekking/routes/:routeId/milestones 👑

---

### POST /admin/trekking/routes/:routeId/milestones 👑

Tạo milestone mới. `sequence` tự động gán nếu không cung cấp.

**Request Body:**
```json
{
  "name": "Điểm xuất phát",
  "type": "START",
  "sequence": 1,
  "location": { "type": "Point", "coordinates": [108.431, 12.041] },
  "altitude": 1500,
  "checkinRadiusMeters": 50,
  "required": true
}
```

---

### PUT /admin/trekking/routes/:routeId/milestones/:milestoneId 👑

---

### DELETE /admin/trekking/routes/:routeId/milestones/:milestoneId 👑

**Response 204.**

---

## Admin — Contributions 👑

---

### GET /admin/contributions 👑

Danh sách tất cả contributions để duyệt.

**Query params:**

| Param | Mô tả |
|-------|-------|
| `type` | `ROUTE_SUBMISSION` \| `PLACE_SUGGESTION` |
| `status` | `PENDING_REVIEW` \| `NEEDS_REVISION` \| `APPROVED` \| `REJECTED` \| ... |
| `userId` | Lọc theo user |
| `page` | Mặc định 1 |
| `limit` | Mặc định 20 |

---

### GET /admin/contributions/:id 👑

Chi tiết contribution kèm snapshot markers (nếu là route submission).

---

### PATCH /admin/contributions/:id/review 👑

Duyệt contribution. **Chống concurrent review** — nếu contribution đã được admin khác review → `409 CONTRIBUTION_ALREADY_REVIEWED`.

**Request Body:**
```json
{
  "decision": "APPROVED",
  "adminNote": "Chất lượng tốt, tuyến đường hợp lệ",
  "resultingRouteId": "64f1a2b3c4d5e6f7a8b9c0d2"
}
```

| Field | Mô tả |
|-------|-------|
| `decision` | `APPROVED` \| `REJECTED` \| `NEEDS_REVISION` |
| `adminNote` | Ghi chú cho user |
| `resultingRouteId` | ObjectId route đã tồn tại để link (nếu không cung cấp, route mới sẽ được tạo tự động khi APPROVED) |
| `resultingPlaceId` | ObjectId place đã tồn tại để link (cho place suggestion) |

Khi `APPROVED`:
- Route submission → tạo/link `TrekkingRoute`, lưu `resultingRouteId`
- Place suggestion → tạo/link `TrekkingPlace`, lưu `resultingPlaceId`
- Publish event `TREKKING_CONTRIBUTION_APPROVED` (auth/gamification service cộng XP)

| Status | Code | Khi nào |
|--------|------|---------|
| 409 | `CONTRIBUTION_ALREADY_REVIEWED` | Đã APPROVED/REJECTED bởi admin khác |
| 422 | `CONTRIBUTION_INVALID_STATE` | Contribution ở trạng thái không review được |

---

### PATCH /admin/contributions/routes/:submissionId/markers/:markerId/review 👑

Duyệt từng submitted marker. Có thể convert thành Official Milestone.

**Request Body:**
```json
{
  "decision": "APPROVED",
  "adminNote": "Vị trí chính xác, đặt làm CHECKPOINT",
  "createOfficialMilestone": true
}
```

Nếu `createOfficialMilestone: true` và submission đã có `resultingRouteId` → tự động tạo `Milestone` thuộc route đó và lưu `resultingMilestoneId`.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "routeSubmissionMarkerId": "...",
    "reviewStatus": "APPROVED",
    "resultingMilestoneId": "64f1a2b3c4d5e6f7a8b9c0d9"
  }
}
```

---

## Admin — Badges 👑

---

### GET /admin/badges 👑

---

### POST /admin/badges 👑

**Request Body:**
```json
{
  "code": "SUMMIT_MASTER",
  "name": "Summit Master",
  "description": "Chinh phục 10 đỉnh SUMMIT",
  "iconUrl": "https://cdn.example.com/badges/summit_master.png",
  "category": "TREKKING",
  "rarity": "EPIC",
  "condition": { "type": "SUMMIT_CHECKIN_COUNT", "value": 10 },
  "status": "ACTIVE"
}
```

---

### PUT /admin/badges/:badgeId 👑

---

### PATCH /admin/badges/:badgeId/status 👑

```json
{ "status": "INACTIVE" }
```

---

## Internal API *(service-to-service)*

> **Không đi qua API Gateway.** Endpoint này dành riêng cho checkin-service khi chạy với `TREKKING_PROVIDER=http`.

---

### GET /internal/v1/milestones/:milestoneId/checkin-context

Trả về context cần thiết để checkin-service verify check-in GPS.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "milestoneId": "64f1a2b3c4d5e6f7a8b9c0d5",
    "trekkingRouteId": "64f1a2b3c4d5e6f7a8b9c0d2",
    "trekkingPlaceId": "64f1a2b3c4d5e6f7a8b9c0d1",
    "provinceId": "lam_dong",
    "name": "Đỉnh Langbiang",
    "type": "SUMMIT",
    "location": { "type": "Point", "coordinates": [108.441, 12.05] },
    "checkinRadiusMeters": 100,
    "qualifiesPlaceVisit": true
  }
}
```

**Response 404:** `{ "success": false, "error": { "code": "MILESTONE_NOT_FOUND" } }`

---

## Health

### GET /health

```json
{ "status": "ok", "service": "trekking-service" }
```

### GET /ready

```json
{
  "status": "ready",
  "db": "connected"
}
```

`503` nếu MongoDB chưa kết nối.

---

## RabbitMQ Events

Trekking-service publish các event sau **sau khi dữ liệu đã persist thành công**. Nếu publish thất bại, request chính không bị fail (logged only).

**Format chung:**
```json
{
  "eventId": "uuid-v4",
  "eventType": "TREKKING_JOURNEY_COMPLETED",
  "eventVersion": 1,
  "occurredAt": "2026-10-05T14:15:00Z",
  "payload": {}
}
```

| Event | Trigger | Payload |
|-------|---------|---------|
| `TREKKING_JOURNEY_STARTED` | POST `/journeys/:id/start` | `userId, journeyId, trekkingPlaceId, trekkingRouteId, startedAt` |
| `TREKKING_JOURNEY_COMPLETED` | POST `/journeys/:id/complete` | `userId, journeyId, trekkingPlaceId, trekkingRouteId, provinceId, distanceMeters, elevationGain, durationSeconds` |
| `TREKKING_CONTRIBUTION_SUBMITTED` | POST `/contributions/*` | `userId, submissionId, type, sourceJourneyId` |
| `TREKKING_CONTRIBUTION_APPROVED` | Admin PATCH review → APPROVED | `adminId, contributionId, userId, type` |
| `TREKKING_CONTRIBUTION_REJECTED` | Admin PATCH review → REJECTED | `adminId, contributionId, userId, type` |

> **auth/gamification service** consume các event này để cộng XP. Trekking-service **không** trực tiếp cộng XP.

---

## Contribution Status Flow

```
                  ┌──────────────────────────────────────────────────────────┐
 User submit      │  DRAFT → PENDING_REVIEW                                  │
                  │  NEEDS_REVISION → PENDING_REVIEW (resubmit)              │
                  │  PENDING_REVIEW/DRAFT/NEEDS_REVISION → CANCELLED (user)  │
 Admin review     │  PENDING_REVIEW/NEEDS_REVISION → APPROVED                │
                  │  PENDING_REVIEW/NEEDS_REVISION → REJECTED                │
                  │  PENDING_REVIEW/NEEDS_REVISION → NEEDS_REVISION          │
                  └──────────────────────────────────────────────────────────┘
```

---

## Business Rules

### Journey

- User chỉ đọc/sửa Journey của chính mình (404 nếu không phải owner)
- `clientJourneyId` phải unique per user — dùng để map offline ID ↔ server ID
- Complete Journey không nhận raw GPS array — chỉ nhận `encodedPolyline` và statistics
- Retry complete với `Idempotency-Key` trả về kết quả cũ, không emit XP event trùng

### Markers

- Chỉ được tạo marker khi Journey ở `ACTIVE` hoặc `PAUSED`
- `clientMarkerId` unique per journey+user — chống duplicate khi offline retry
- Xóa marker giảm `journey.markerCount` atomically
- User chỉ sửa/xóa marker của chính mình

### Reviews

- Mỗi user chỉ có 1 review / địa điểm (POST tự động upsert)
- `ratingAverage` và `ratingCount` được tính lại sau mỗi create/update/delete

### Contributions

- Route submission chỉ tạo từ Journey **COMPLETED** (BR-17)
- Marker trong submission là **snapshot** — thay đổi marker gốc sau submit không ảnh hưởng review (BR-28)
- `clientOperationId` unique — chống duplicate khi offline retry
- Contribution không tự publish — mặc định `PENDING_REVIEW` (BR-18)
- Concurrent admin review được phát hiện: chỉ 1 admin review thắng (NFR-ADM-03)

### Offline Map

- DB lưu `objectKey` (không lưu `downloadUrl`) — dễ đổi CDN/base URL mà không cần migration
- `downloadUrl` được build tại runtime: `R2_PUBLIC_BASE_URL + "/" + objectKey`
- `R2_PUBLIC_BASE_URL` chỉ cấu hình trong `.env` server — **không đưa vào Flutter**
- Client tải file ZIP trực tiếp từ `downloadUrl` — gateway không proxy file lớn
- `checksum` để client verify integrity sau khi tải
- Khi update map: tăng `version` + đổi `objectKey` → Flutter phát hiện `OUTDATED` qua `/check`
- `objectKey` convention: `<slug>/<vN>/<slug>-v<N>-flutter.zip`
  - Bà Đen v1: `ba-den/v1/ba-den-v1-flutter.zip`
  - Langbiang v1: `langbiang/v1/langbiang-v1-flutter.zip`
  - Fansipan v1: `fansipan/v1/fansipan-v1-flutter.zip`
  - Tà Năng–Phan Dũng v1: `ta-nang-phan-dung/v1/ta-nang-phan-dung-v1-flutter.zip`

---

## Ghi chú Database

- **MongoDB Atlas** — database `trekkingt-service-trekVN`
- ID xuyên service (`userId`, `provinceId`) là **logical reference** — không có FK vật lý
- `checkinCount` trong Journey là projection summary — chi tiết check-in do checkin-service quản lý

---

## Place Offline Package (v4.0 — new)

### GET /places/:placeId/offline-package

**Mô tả:** Gói dữ liệu offline cấp địa điểm. Trả về place metadata, danh sách routes ACTIVE và offline map manifest. **Không proxy file map lớn** — client tải trực tiếp từ `downloadUrl` (R2/CDN).

`downloadUrl` = `R2_PUBLIC_BASE_URL` + `"/"` + `offlineMap.objectKey` (built at runtime, không lưu trong DB).

**Response 200:**
```json
{
  "success": true,
  "data": {
    "place": { "trekkingPlaceId": "...", "name": "Núi Bà Đen", ... },
    "routes": [{ "trekkingRouteId": "...", "name": "Cung Đường Chính", ... }],
    "mapManifest": {
      "scope": "PLACE",
      "available": true,
      "version": 1,
      "downloadUrl": "https://pub-xxx.r2.dev/maps/nui-ba-den/v1/ba-den-v1.zip",
      "sizeBytes": 19300000,
      "checksum": "sha256...",
      "minZoom": 10,
      "maxZoom": 14,
      "bounds": { "minLat": 11.36, "minLon": 106.14, "maxLat": 11.41, "maxLon": 106.19 }
    }
  }
}
```

**mapManifest khi chưa có map:**
```json
{ "scope": "PLACE", "available": false, "version": 0, "downloadUrl": null, ... }
```

---

### GET /places/:placeId/offline-package/check?version=X

**Mô tả:** Kiểm tra version map. Client gửi version hiện tại, server trả status.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "status": "UP_TO_DATE",
    "serverVersion": 2,
    "available": true,
    "downloadUrl": "https://...",
    "checksum": "sha256..."
  }
}
```

**status values:** `UP_TO_DATE` | `OUTDATED` | `NOT_AVAILABLE`

---

## Media Upload Presign (v4.0 — new)

### POST /uploads/presign 🔒

**Mô tả:** Lấy Cloudinary presigned upload credentials. Client upload trực tiếp lên Cloudinary rồi gửi `publicUrl` về server.

**Request Body:**
```json
{
  "purpose": "JOURNEY_MARKER",
  "fileName": "marker_photo.jpg",
  "contentType": "image/jpeg",
  "fileSizeBytes": 2048000
}
```

**purpose values:** `JOURNEY_MARKER` | `PLACE_REVIEW` | `ROUTE_CONTRIBUTION` | `PLACE_SUGGESTION` | `GPX`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://api.cloudinary.com/v1_1/mycloud/image/upload",
    "objectKey": "trekvn/markers/userId/1234_photo.jpg",
    "publicUrl": "https://res.cloudinary.com/...",
    "expiresIn": 900,
    "uploadParams": {
      "api_key": "...",
      "timestamp": 1700000000,
      "signature": "abc...",
      "folder": "trekvn/markers",
      "public_id": "trekvn/markers/userId/1234_photo.jpg"
    }
  }
}
```

**Client upload flow:**
```
POST uploadUrl
  multipart: file (field="file") + all uploadParams fields
→ Cloudinary returns { secure_url, public_id, ... }

PUT /api/v1/journeys/:journeyId/markers/:markerId
  Body: { "images": ["<publicUrl>"] }
```

---

## Place Search — Region Filter (v4.0)

### GET /places?region=SOUTH

`region=NORTH|CENTRAL|SOUTH` maps directly to the place's `mien=mien-bac|mien-trung|mien-nam`. It works together with `q` and `provinceId`, without a checkin-service call. The `mien` parameter takes precedence when explicitly provided. Places must have their `mien` field set for these filters.

Other legacy region values still use the checkin-service province lookup. An unavailable lookup returns an empty result for those legacy values.

`sort=popular` orders by `ratingCount DESC`, `ratingAverage DESC`, then `_id DESC`; unrated places remain visible. `includeRoutes=true` adds an array of ACTIVE routes to each place on the page, using one batch query instead of requiring one API call per place. Existing callers without this option keep the previous response shape.

### Rate limits and deployment

Gateway, trekking-service and checkin-service default to 600 requests per verified user per 15 minutes. Anonymous requests remain IP-limited; credential operations have separate IP buckets per operation. Auth defaults to 300 per bucket. Override via `RATE_LIMIT_MAX_REQUESTS` on gateway and `RATE_LIMIT_MAX` on the services; `RATE_LIMIT_WINDOW_MS` configures the window. Existing deployment environment overrides still take precedence. Health/ready probes do not consume quota. See [rate limiting and deployment](rate-limiting.md).

Set `TRUSTED_PROXIES` to the actual upstream proxy IPs/CIDRs for each hop: reverse proxy at gateway, gateway at downstream services. Gateway does not trust forwarded headers by default; downstream services default to loopback for local development. Without the correct deployment values, users behind the proxy may share a rate-limit bucket. Do not use a universal trust setting.

Deploy backend changes before updating the app. New clients request bundled routes, but fall back to individual route calls against older backends. Profile rank/badge polling runs every minute while the app is active; activity-triggered refreshes remain enabled.

---

## RabbitMQ Events (v4.0)

### Events Published by Trekking Service

| Event | Routing Key | Trigger |
|-------|-------------|---------|
| `TREKKING_JOURNEY_COMPLETED` | `trekking.journey.completed` | Journey complete — via **Outbox** |
| `TREKKING_BADGE_EARNED` | `trekking.badge.earned` | Badge awarded by BadgeEvaluator |
| `TREKKING_CONTRIBUTION_APPROVED` | `trekking.contribution.approved` | Admin approves contribution |

### Outbox Worker

- Polls `event_outbox` every `OUTBOX_POLL_INTERVAL_MS` (default 5s)
- Retries up to `OUTBOX_MAX_RETRY` (default 10) with exponential backoff
- After max retry: status → `FAILED` (dead-letter, no automatic recovery)
- Only runs when `RABBITMQ_ENABLED=true`
