# TrekVN Web Admin — API Documentation

**Base URL (qua Gateway):** `http://localhost:3000/api/v1`
**Auth:** Bearer Token (JWT) — `Authorization: Bearer <accessToken>`
**Refresh Token:** HttpOnly Cookie `refreshToken` (set tự động khi login)

> Tất cả request đi qua **API Gateway** (`port 3000`).
> Gateway forward đến đúng service theo prefix — xem bảng routing ở cuối file.

---

## Quy ước chung

### Response thành công
```json
{ "success": true, "data": { ... } }
```

### Danh sách phân trang
```json
{
  "success": true,
  "data": {
    "data": [...],
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

### Lỗi
```json
{ "success": false, "message": "...", "statusCode": 400 }
```

### HTTP Status Codes thường gặp

| Code | Ý nghĩa |
|------|---------|
| 200 | OK |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request / Validation Error |
| 401 | Unauthorized (thiếu hoặc hết hạn token) |
| 403 | Forbidden (không đủ role) |
| 404 | Not Found |
| 409 | Conflict (đã được xử lý bởi Admin khác) |
| 422 | Business Rule Violation |
| 429 | Rate Limit — response có header `Retry-After` |
| 500 | Internal Server Error |

---

## 1. Auth — Xác thực Admin

**→ Service:** `auth-service`

### POST `/auth/login`

Đăng nhập Admin. Backend kiểm tra `role === ADMIN` và `status === ACTIVE`.
Refresh token được set vào **HttpOnly Cookie** tự động.

**Request:**
```json
{ "email": "admin@trekviet.vn", "password": "admin123" }
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "user": {
      "id": "u4",
      "email": "admin@trekviet.vn",
      "name": "Admin TrekViệt",
      "role": "ADMIN",
      "status": "ACTIVE",
      "avatarUrl": null,
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  }
}
```

**Response 403 — Không phải Admin:**
```json
{ "success": false, "message": "Tài khoản không có quyền truy cập Admin Portal" }
```

---

### POST `/auth/logout`

Vô hiệu hóa refresh token. Truyền token qua Cookie hoặc body.
**Auth:** Bearer token (optional — có thể đã hết hạn).

**Response 200:**
```json
{ "success": true, "message": "Đăng xuất thành công" }
```

---

### GET `/auth/me`

Lấy thông tin admin đang đăng nhập (dùng khi restore session).
**Auth:** 🔒 Bearer token + ADMIN role.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "u4",
    "email": "admin@trekviet.vn",
    "name": "Admin TrekViệt",
    "role": "ADMIN",
    "status": "ACTIVE",
    "avatarUrl": null,
    "createdAt": "..."
  }
}
```

---

### POST `/auth/refresh`

Làm mới access token. Ưu tiên đọc từ **Cookie `refreshToken`**, fallback `body.refreshToken`.

**Request (optional body):**
```json
{ "refreshToken": "..." }
```

**Response 200:**
```json
{ "success": true, "data": { "accessToken": "eyJ..." } }
```

> Cookie `refreshToken` được rotate tự động (Refresh Token Rotation).

---

## 2. Dashboard

**→ Service:** `auth-service`
**Auth:** 🔒 ADMIN

### GET `/admin/dashboard`

Toàn bộ dữ liệu trang tổng quan với bộ lọc khoảng thời gian.

**Query params:**
| Param | Type | Mô tả |
|-------|------|-------|
| `range` | string | `7d` \| `30d` \| `90d` - Khoảng thời gian thống kê (mặc định `7d`) |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "stats": {
      "totalUsers": 12548,
      "userGrowthPercent": 12.5,
      "totalJourneys": 4821,
      "journeyGrowthPercent": 8.3,
      "totalPlaces": 1236,
      "placeGrowthPercent": 3.2,
      "totalPosts": 428,
      "postGrowthPercent": 15.7,
      "totalCheckins": 38402,
      "checkinGrowthPercent": 11.2,
      "pendingContributions": 18,
      "contributionGrowthPercent": -5.3,
      "totalBadgeTypes": 24,
      "badgeGrowthPercent": 0,
      "totalRanks": 10,
      "rankGrowthPercent": 0
    },
    "activityChart": [
      { "date": "2026-09-01", "users": 25, "checkins": 150, "journeys": 12 }
    ],
    "contributionRatio": {
      "approved": 198,
      "pending": 18,
      "rejected": 26,
      "needsRevision": 38
    },
    "leaderboard": [
      {
        "userId": "u1",
        "name": "Nguyễn Minh Đức",
        "avatarUrl": null,
        "rankName": "Trek Master",
        "rankCode": "TREK_MASTER",
        "totalXp": 15420,
        "badgeCount": 18
      }
    ],
    "recentBadges": [
      {
        "badgeId": "b1",
        "name": "Nhà chinh phục đỉnh núi",
        "iconUrl": "/icons/badge-mountain.svg",
        "rarity": "EPIC",
        "userName": "Nguyễn Văn An",
        "earnedAt": "2026-10-09T14:30:00.000Z"
      }
    ],
    "activeUsers": [
      {
        "userId": "u10",
        "name": "Nguyễn Minh Đức",
        "avatarUrl": null,
        "lastActive": "2026-10-09T15:30:00.000Z"
      }
    ],
    "recentContributions": []
  }
}
```

**Notes:**
- `growthPercent` dương = tăng trưởng, âm = giảm so với kỳ trước
- `activityChart` chứa dữ liệu theo ngày trong khoảng thời gian được chọn
- `leaderboard` sắp xếp theo `totalXp` giảm dần (top 5)
- `recentBadges` sắp xếp theo `earnedAt` giảm dần (5 mục mới nhất)
- `activeUsers` sắp xếp theo `lastActive` giảm dần (5 mục gần nhất)
```

---

## 3. Users — Quản lý người dùng

**→ Service:** `auth-service`
**Auth:** 🔒 ADMIN

### GET `/admin/users`

Danh sách users với filter và phân trang.

**Query params:**
| Param | Type | Mô tả |
|-------|------|-------|
| `page` | number | Mặc định 1 |
| `limit` | number | Mặc định 10, tối đa 100 |
| `search` | string | Tìm theo tên / email |
| `status` | `ACTIVE\|BLOCKED\|INACTIVE` | |
| `role` | `ADMIN\|USER` | |
| `sortBy` | string | `createdAt`, `displayName`, `email` |
| `sortOrder` | `asc\|desc` | Mặc định `desc` |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "u1",
        "name": "Nguyễn Văn An",
        "email": "an@gmail.com",
        "role": "USER",
        "status": "ACTIVE",
        "avatarUrl": null,
        "phoneNumber": null,
        "bio": null,
        "createdAt": "...",
        "updatedAt": "...",
        "lastLoginAt": null,
        "totalJourneys": 12,
        "totalCheckins": 48,
        "totalContributions": 3
      }
    ],
    "total": 100,
    "page": 1,
    "limit": 10,
    "totalPages": 10
  }
}
```

---

### GET `/admin/users/:id`

Chi tiết một user.
**Response 200:** User object (giống item trong danh sách).

---

### PATCH `/admin/users/:id`

Cập nhật thông tin user.

**Request:**
```json
{
  "displayName": "Tên mới",
  "bio": "Mô tả mới"
}
```

**Response 200:** User object đã cập nhật.

---

### POST `/admin/users/:id/block`

Khóa tài khoản user.

**Request:**
```json
{ "reason": "Vi phạm điều khoản sử dụng" }
```

**Response 200:** User object với `status: "BLOCKED"`.

**Response 403:** Không thể khóa tài khoản Admin.

---

### POST `/admin/users/:id/unblock`

Mở khóa tài khoản.
**Response 200:** User object với `status: "ACTIVE"`.

---

### GET `/admin/users/:id/rank-profile`

Hồ sơ rank và thống kê trekking của user.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "urp-u1",
    "userId": "u1",
    "currentRankId": "rank-04",
    "currentRankCode": "TREKKER",
    "currentRankName": "Trekker",
    "currentRankLevel": 4,
    "totalXp": 4250,
    "completedJourneyCount": 12,
    "totalDistanceMeters": 148300,
    "totalElevationGain": 9200,
    "verifiedCheckinCount": 48,
    "visitedProvinceCount": 4,
    "visitedPlaceCount": 11,
    "badgeCount": 6,
    "approvedContributionCount": 3,
    "lastCalculatedAt": "...",
    "nextRank": {
      "code": "PATHFINDER",
      "name": "Người tìm đường",
      "level": 5,
      "minXp": 7000,
      "minCompletedJourneys": 20,
      "minVisitedProvinces": 5,
      "minBadgeCount": 8
    },
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

### GET `/admin/users/:id/xp-transactions`

Lịch sử XP của user.

**Query params:** `page`, `limit`, `transactionType` (`EARN|REVERSAL|ADMIN_ADJUSTMENT`), `sourceType`, `dateFrom`, `dateTo`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "xp-001",
        "userId": "u1",
        "transactionType": "EARN",
        "sourceType": "JOURNEY_COMPLETED",
        "sourceId": "j-001",
        "xpAmount": 150,
        "description": "Hoàn thành hành trình Fansipan",
        "idempotencyKey": "journey_completed:j-001",
        "createdAt": "..."
      }
    ],
    "total": 30,
    "page": 1,
    "limit": 20,
    "totalPages": 2
  }
}
```

---

### POST `/admin/users/:id/xp-adjustments`

Tạo điều chỉnh XP thủ công (BR-39). **Bắt buộc có `reason`.**

**Request:**
```json
{
  "xpAmount": -200,
  "reason": "Phát hiện check-in không hợp lệ tháng 9",
  "description": "Ghi chú thêm (tùy chọn)"
}
```

> `xpAmount` có thể âm (trừ XP) hoặc dương (cộng XP).

**Response 201:** XpTransaction object vừa tạo.

**Response 400:** Thiếu `reason` hoặc `xpAmount = 0`.

---

### GET `/admin/users/:id/rank-history`

Lịch sử thay đổi rank của user.

**Query params:** `page`, `limit`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "rh-001",
        "userId": "u1",
        "previousRankCode": "EXPLORER",
        "previousRankName": "Nhà thám hiểm",
        "newRankCode": "TREKKER",
        "newRankName": "Trekker",
        "xpAtChange": 3500,
        "changeType": "PROMOTION",
        "changedAt": "2026-09-10T10:00:00Z"
      }
    ],
    "total": 5,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

> `changeType`: `PROMOTION` | `DEMOTION` | `RECALCULATION`

---

## 4. Rank Definitions — Cấu hình cấp rank

**→ Service:** `auth-service`
**Auth:** 🔒 ADMIN

### GET `/admin/ranks`

Danh sách 10 cấp rank, sắp xếp theo `level` tăng dần.

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "rank-01",
      "code": "NEWBIE",
      "name": "Tân binh",
      "description": "Người mới bắt đầu khám phá trekking",
      "level": 1,
      "minXp": 0,
      "minCompletedJourneys": 0,
      "minVisitedProvinces": 0,
      "minBadgeCount": 0,
      "minDistanceMeters": 0,
      "minApprovedContributions": 0,
      "iconUrl": "/icons/rank-newbie.svg",
      "status": "ACTIVE",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

---

### PATCH `/admin/ranks/:id`

Cập nhật rank. **Không được đổi `code` hoặc `level`.**
NEWBIE không thể bị đặt `status: "INACTIVE"`.

**Request:**
```json
{
  "name": "Trekker Pro",
  "description": "...",
  "minXp": 4000,
  "minCompletedJourneys": 12,
  "minVisitedProvinces": 4,
  "minBadgeCount": 6,
  "status": "ACTIVE"
}
```

**Response 200:** RankDefinition đã cập nhật.

**Response 400:** Thử đổi `code`/`level` hoặc tắt NEWBIE.

---

## 5. Audit Logs

**→ Service:** `auth-service`
**Auth:** 🔒 ADMIN

### GET `/admin/audit-logs`

Lịch sử thao tác của Admin (read-only).

**Query params:**
| Param | Type | Giá trị |
|-------|------|---------|
| `page` | number | |
| `limit` | number | Max 100 |
| `adminId` | string | |
| `action` | string | `CREATE\|UPDATE\|DELETE\|BLOCK\|UNBLOCK\|APPROVE\|REJECT\|HIDE\|PUBLISH\|DISABLE\|LOGIN\|LOGOUT\|XP_ADJUSTMENT` |
| `entityType` | string | `USER\|PLACE\|ROUTE\|MILESTONE\|CONTRIBUTION\|POST\|COMMENT\|REVIEW\|BADGE\|OFFLINE_MAP\|RANK` |
| `dateFrom` | ISO date | |
| `dateTo` | ISO date | |
| `result` | `SUCCESS\|FAILURE` | |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "al1",
        "timestamp": "2026-10-04T10:00:00.000Z",
        "adminId": "u4",
        "adminName": "admin01",
        "adminEmail": "admin01@trekviet.vn",
        "action": "APPROVE",
        "entityType": "CONTRIBUTION",
        "entityId": "c3",
        "beforeSummary": null,
        "afterSummary": { "status": "APPROVED" },
        "result": "SUCCESS",
        "ipAddress": "192.168.1.1",
        "note": null
      }
    ],
    "total": 500,
    "page": 1,
    "limit": 20,
    "totalPages": 25
  }
}
```

---

## 6. Places — Địa điểm trekking

**→ Service:** `trekking-service` (path: `/admin/trekking/places`)
**Auth:** 🔒 ADMIN

### GET `/admin/trekking/places`

**Query params:** `page`, `limit`, `search`, `province`, `difficulty` (`EASY|MODERATE|HARD|EXPERT`), `status` (`ACTIVE|INACTIVE`)

**Response 200:**
```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "p1",
        "name": "Núi Bà Đen",
        "province": "Tây Ninh",
        "description": "...",
        "difficulty": "MODERATE",
        "coordinates": { "type": "Point", "coordinates": [106.166, 11.387] },
        "coverImage": null,
        "images": [],
        "tags": ["núi"],
        "status": "ACTIVE",
        "totalRoutes": 3,
        "dataOrigin": "MANUAL",
        "createdAt": "...",
        "updatedAt": "..."
      }
    ],
    "total": 50,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

---

### GET `/admin/trekking/places/:id`

Chi tiết place.

---

### POST `/admin/trekking/places`

Tạo place mới.

**Request:**
```json
{
  "name": "Núi Chứa Chan",
  "provinceId": "province-dong-nai",
  "description": "...",
  "difficulty": "MODERATE",
  "location": {
    "type": "Point",
    "coordinates": [107.402, 10.819]
  },
  "tags": ["núi"],
  "status": "ACTIVE"
}
```

**Response 201:** Place object.

---

### PUT `/admin/trekking/places/:id`

Cập nhật toàn bộ place.
**Request:** Tương tự POST.
**Response 200:** Place object.

---

### PATCH `/admin/trekking/places/:id/status`

Chỉ cập nhật status.

**Request:** `{ "status": "INACTIVE" }`
**Response 200:** Place object.

---

### DELETE `/admin/trekking/places/:id`

Soft delete — đặt `status = INACTIVE`.
**Response 200:** `{ "success": true }`

---

## 7. Routes — Tuyến đường

**→ Service:** `trekking-service` (path: `/admin/trekking/routes`)
**Auth:** 🔒 ADMIN

### GET `/admin/trekking/routes`

**Query params:** `page`, `limit`, `search`, `placeId`, `difficulty`, `status`

**Response 200:** PaginatedResponse\<TrekkingRoute\>

```json
{
  "id": "r1",
  "name": "Cung chính",
  "trekkingPlaceId": "p1",
  "difficulty": "MODERATE",
  "distanceMeters": 8500,
  "estimatedDurationMinutes": 240,
  "elevationGain": 850,
  "status": "ACTIVE",
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

### GET `/admin/trekking/routes/:id` · POST `/admin/trekking/routes` · PUT `/admin/trekking/routes/:id`

Pattern tương tự Places.

**POST request body:**
```json
{
  "trekkingPlaceId": "p1",
  "name": "Cung chính",
  "description": "...",
  "difficulty": "MODERATE",
  "distanceMeters": 8500,
  "estimatedDurationMinutes": 240,
  "elevationGain": 850,
  "status": "ACTIVE"
}
```

---

### PATCH `/admin/trekking/routes/:id/status`

**Request:** `{ "status": "INACTIVE" }`

---

### DELETE `/admin/trekking/routes/:id`

Soft delete — `status = INACTIVE`.
**Response 200:** `{ "success": true }`

---

## 8. Milestones — Mốc check-in

**→ Service:** `trekking-service`
**Auth:** 🔒 ADMIN

### GET `/admin/trekking/milestones`

Flat list tất cả milestones (không cần biết routeId).

**Query params:** `routeId` (filter), `page`, `limit`

**Response 200:** PaginatedResponse với mỗi item:
```json
{
  "id": "m1",
  "trekkingRouteId": "r1",
  "name": "Cổng Thiên",
  "type": "WAYPOINT",
  "sequence": 2,
  "location": { "type": "Point", "coordinates": [106.163, 11.385] },
  "checkinRadiusMeters": 100,
  "description": null,
  "status": "ACTIVE",
  "createdAt": "...",
  "updatedAt": "..."
}
```

> **MilestoneType:** `START` | `CHECKPOINT` | `VIEWPOINT` | `REST_POINT` | `WATER_POINT` | `CAMP` | `SUMMIT` | `FINISH`

---

### GET `/admin/trekking/milestones/:milestoneId`

Chi tiết milestone.

---

### PUT `/admin/trekking/milestones/:milestoneId`

Cập nhật milestone.

---

### DELETE `/admin/trekking/milestones/:milestoneId`

Xóa milestone.
**Response 200:** `{ "success": true }`

---

### GET `/admin/trekking/routes/:routeId/milestones`

Milestones của một route (nested, có thứ tự `sequence`).

### POST `/admin/trekking/routes/:routeId/milestones`

Tạo milestone trong route.

**Request:**
```json
{
  "name": "Đỉnh chính",
  "type": "SUMMIT",
  "sequence": 5,
  "latitude": 11.391,
  "longitude": 106.168,
  "checkinRadiusMeters": 150,
  "description": null,
  "status": "ACTIVE"
}
```

**Response 201:** Milestone object.

---

### PUT `/admin/trekking/routes/:routeId/milestones/:milestoneId`

Cập nhật milestone (nested route).

### DELETE `/admin/trekking/routes/:routeId/milestones/:milestoneId`

Xóa milestone.
**Response 204:** No Content.

---

## 9. Contributions — Đóng góp người dùng

**→ Service:** `trekking-service` (path: `/admin/contributions`)
**Auth:** 🔒 ADMIN

### GET `/admin/contributions`

**Query params:** `page`, `limit`, `type` (`ROUTE_SUBMISSION|PLACE_SUGGESTION`), `status`, `userId`, `province`, `search`, `dateFrom`, `dateTo`

> `ContributionStatus`: `DRAFT` | `PENDING_REVIEW` | `NEEDS_REVISION` | `APPROVED` | `REJECTED` | `CANCELLED`

**Response 200:** PaginatedResponse\<Contribution\>

---

### GET `/admin/contributions/:id`

Chi tiết contribution.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "type": "ROUTE_SUBMISSION",
    "contribution": {
      "id": "c1",
      "status": "PENDING_REVIEW",
      "userId": "u5",
      "submittedAt": "...",
      "adminNote": null,
      "reviewedBy": null,
      "reviewedAt": null
    },
    "markers": []
  }
}
```

---

### PATCH `/admin/contributions/:id/review`

Duyệt / từ chối / yêu cầu chỉnh sửa.
Trả **409** nếu đã được Admin khác xử lý (BR-20).

**Request:**
```json
{
  "decision": "APPROVED",
  "adminNote": "Dữ liệu đầy đủ",
  "resultingRouteId": "route_xyz"
}
```

> `decision`: `APPROVED` | `REJECTED` | `NEEDS_REVISION`

**Response 200:** Contribution object đã cập nhật.

---

### GET `/admin/contributions/:submissionId/markers`

Danh sách Journey Markers snapshot trong route submission (FR-ADM-21).
Snapshot không thay đổi dù user sửa marker gốc sau khi submit (BR-28).

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "sm-001",
      "routeSubmissionId": "c1",
      "sourceJourneyMarkerId": "jm-001",
      "name": "Ngã ba rẽ trái",
      "type": "INTERSECTION",
      "description": "Rẽ trái theo đường mòn màu đỏ",
      "location": { "type": "Point", "coordinates": [104.2456, 21.2956] },
      "altitude": 1240,
      "images": [],
      "sequence": 2,
      "reviewStatus": "PENDING",
      "adminNote": null,
      "resultingMilestoneId": null,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

---

### POST `/admin/contributions/:submissionId/markers/:markerId/review`

Duyệt hoặc từ chối một Journey Marker (FR-ADM-21, BR-26).
Khi `APPROVE`: có thể link/tạo Official Milestone.

**Request:**
```json
{
  "action": "APPROVE",
  "adminNote": "Đã liên kết với milestone vm-201",
  "resultingMilestoneId": "vm-201"
}
```

> `action`: `APPROVE` | `REJECT`

**Response 200:** SubmittedMarker object đã cập nhật.

---

## 10. Badges — Huy hiệu

**→ Service:** `trekking-service` (path: `/admin/badges`)
**Auth:** 🔒 ADMIN

### GET `/admin/badges`

**Query params:** `page`, `limit`, `search`, `status`, `category`, `rarity`

**Response 200:** PaginatedResponse\<Badge\>

```json
{
  "id": "b1",
  "name": "Nhà thám hiểm mới",
  "description": "...",
  "iconUrl": "/icons/badge-explorer.svg",
  "category": "TREKKING",
  "rarity": "COMMON",
  "condition": { "type": "CHECKIN_COUNT", "threshold": 5 },
  "status": "ACTIVE",
  "totalAwarded": 1842,
  "createdAt": "...",
  "updatedAt": "..."
}
```

> **Category:** `TREKKING` | `EXPLORATION` | `DISTANCE` | `PROVINCE`
> **Rarity + XP:** `COMMON` +50 XP · `RARE` +150 XP · `EPIC` +400 XP · `LEGENDARY` +1000 XP

---

### GET `/admin/badges/:badgeId`

Chi tiết badge.

---

### POST `/admin/badges`

Tạo badge mới.

**Request:**
```json
{
  "name": "Chinh phục 5 tỉnh",
  "description": "...",
  "iconUrl": "https://...",
  "category": "EXPLORATION",
  "rarity": "RARE",
  "conditionType": "PROVINCE_COUNT",
  "conditionThreshold": 5,
  "status": "ACTIVE"
}
```

**Response 201:** Badge object.

---

### PUT `/admin/badges/:badgeId`

**⚠️ DEPRECATED - Sử dụng PATCH thay thế**

Cập nhật badge.

---

### PATCH `/admin/badges/:badgeId`

Cập nhật thông tin badge (không bao gồm status).

**Request:**
```json
{
  "name": "Nhà thám hiểm mới",
  "description": "Mô tả cập nhật",
  "condition": {
    "type": "CHECKIN_COUNT",
    "value": 10
  }
}
```

**Response 200:** Badge object đã cập nhật.

**Note:**
- Không thể cập nhật `code` (immutable sau khi tạo)
- Không thể cập nhật `status` qua endpoint này (phải dùng `/status` endpoint)

---

### PATCH `/admin/badges/:badgeId/status`

**Request:** `{ "status": "INACTIVE" }`

---

## 11. Offline Map Packages

**→ Service:** `trekking-service` (path: `/admin/trekking/offline-maps`)
**Auth:** 🔒 ADMIN

### GET `/admin/trekking/offline-maps`

**Query params:** `page`, `limit`, `search`, `status`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "om1",
        "name": "Bản đồ miền Bắc",
        "version": "2.1.0",
        "description": "...",
        "checksum": "sha256:abc123...",
        "downloadUrl": "https://cdn.trekviet.vn/maps/north-v2.1.0.zip",
        "fileSizeBytes": 524288000,
        "status": "PUBLISHED",
        "regionCode": "NORTH",
        "createdAt": "...",
        "updatedAt": "...",
        "publishedAt": "..."
      }
    ],
    "total": 4,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

> `status`: `DRAFT` | `PUBLISHED` | `DEPRECATED`
> `regionCode`: `NORTH` | `CENTRAL` | `SOUTH` | `ALL`

---

### GET `/admin/trekking/offline-maps/:id`

Chi tiết package.

---

### POST `/admin/trekking/offline-maps`

Tạo package mới (trạng thái DRAFT).

**Request:**
```json
{
  "name": "Bản đồ miền Bắc",
  "version": "2.1.0",
  "description": "...",
  "objectKey": "maps/north/v2.1.0/north.zip",
  "checksum": "sha256:abc123...",
  "fileSizeBytes": 524288000,
  "regionCode": "NORTH"
}
```

**Response 201:** OfflineMapPackage object.

---

### PUT `/admin/trekking/offline-maps/:id`

Cập nhật thông tin package.

---

### DELETE `/admin/trekking/offline-maps/:id`

Xóa package. **Không thể xóa khi đang PUBLISHED** — phải DEPRECATED trước.
**Response 200:** `{ "success": true }`

---

### POST `/admin/trekking/offline-maps/:id/publish`

Xuất bản package: `status → PUBLISHED`, ghi `publishedAt`.
Package phải có `objectKey` (file đã upload R2).

**Response 200:** OfflineMapPackage đã cập nhật.

**Response 400:** Package chưa có file hoặc đã PUBLISHED.

---

## 12. Journeys — Hành trình (read-only)

**→ Service:** `trekking-service` (path: `/admin/trekking/journeys`)
**Auth:** 🔒 ADMIN
> Admin chỉ xem, không sửa raw GPS / check-in lịch sử (FR-ADM-12, BR-13).

### GET `/admin/trekking/journeys`

**Query params:** `page`, `limit`, `search`, `userId`, `status`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "j1",
        "userId": "u1",
        "trekkingPlaceId": "p1",
        "placeName": "Núi Bà Đen",
        "trekkingRouteId": "r1",
        "routeName": "Cung chính",
        "provinceId": "prov-tay-ninh",
        "name": "Hành trình tháng 10",
        "status": "COMPLETED",
        "startedAt": "...",
        "completedAt": "...",
        "statistics": {
          "distanceMeters": 8500,
          "durationSeconds": 14400,
          "elevationGain": 850,
          "maxAltitude": 986,
          "averageSpeed": 2.1
        },
        "checkinCount": 5,
        "markerCount": 3,
        "createdAt": "...",
        "updatedAt": "..."
      }
    ],
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

---

### GET `/admin/trekking/journeys/:id`

Chi tiết hành trình.

---

## 13. AI Agent — LLM Providers

**→ Service:** `agent-service`
**Auth:** 🔒 ADMIN

### GET `/llm/providers`

Danh sách LLM providers khả dụng.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "providers": [
      {
        "id": "auto",
        "name": "auto",
        "available": true,
        "models": ["auto"]
      },
      {
        "id": "uit-llm",
        "name": "uit-llm",
        "available": true,
        "models": ["UIT-LLM-v2"]
      },
      {
        "id": "groq",
        "name": "groq",
        "available": false,
        "models": []
      }
    ],
    "default": "auto"
  }
}
```

---

## 14. AI Agent — Assistant

**→ Service:** `agent-service`
**Auth:** 🔒 ADMIN

### POST `/agent/conversations`

Tạo conversation mới.

**Request:**
```json
{ "title": "Phân tích tháng 10" }
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "conversationId": "conv-001",
    "adminId": "u4",
    "title": "Phân tích tháng 10",
    "status": "ACTIVE",
    "messageCount": 0,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

### GET `/agent/conversations`

Danh sách conversations của admin đang đăng nhập.

**Query params:** `status`, `page`, `limit`

---

### GET `/agent/conversations/:id`

Chi tiết conversation.

---

### PATCH `/agent/conversations/:id`

Đổi tên conversation.

**Request:** `{ "title": "Tên mới" }`
**Response 200:** Conversation object.

---

### DELETE `/agent/conversations/:id`

Xóa conversation và toàn bộ messages.
**Response 200:** `{ "success": true }`

---

### POST `/agent/conversations/:id/messages`

Gửi tin nhắn và nhận AI reply.

**Request:**
```json
{ "content": "Phân tích top 5 tỉnh check-in nhiều nhất", "provider": "uit-llm" }
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "message": {
      "id": "msg-001",
      "role": "user",
      "content": "Phân tích top 5 tỉnh check-in nhiều nhất",
      "createdAt": "..."
    },
    "llm": {
      "provider": "UIT LLM",
      "model": "UIT-LLM-v2",
      "latencyMs": 521
    }
  }
}
```

---

## 15. AI Agent — Tasks

**→ Service:** `agent-service`
**Auth:** 🔒 ADMIN

### GET `/agent/tasks`

Danh sách tất cả agent tasks (Place Builder + Map Builder tổng hợp).

**Query params:** `page`, `limit`, `type` (`PLACE_BUILDER|MAP_BUILDER`), `status`, `search`, `from`, `to`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "task-001",
        "jobId": "PL-00025",
        "type": "PLACE_BUILDER",
        "name": "Núi Bà Đen - Tây Ninh",
        "description": "Tây Ninh",
        "createdBy": "u4",
        "status": "PUBLISHED",
        "createdAt": "...",
        "updatedAt": "...",
        "completedAt": "...",
        "executionTimeMs": null,
        "resultRef": "candidate-001"
      }
    ],
    "total": 50,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

> **AgentTaskStatus:** `QUEUED` | `PROCESSING` | `PENDING_REVIEW` | `APPROVED` | `REJECTED` | `PUBLISHING` | `PUBLISHED` | `FAILED` | `CANCELLED` | `NEEDS_FIX`

---

### GET `/agent/tasks/:id`

Chi tiết task với steps và logs.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "task-001",
    "type": "PLACE_BUILDER",
    "status": "PENDING_REVIEW",
    "steps": [
      { "label": "Khởi tạo tác vụ", "status": "done", "timestamp": "..." },
      { "label": "Thu thập dữ liệu OSM", "status": "done", "timestamp": "..." },
      { "label": "Chờ Admin duyệt", "status": "active" }
    ],
    "logs": [
      { "timestamp": "...", "level": "info", "message": "Khởi tạo tác vụ PL-00025" }
    ]
  }
}
```

> `step.status`: `done` | `active` | `pending` | `error`

---

## 16. AI Agent — Place Builder

**→ Service:** `agent-service`
**Auth:** 🔒 ADMIN

### POST `/agent/place-jobs`

Tạo tác vụ thu thập dữ liệu địa điểm từ AI.

**Request:**
```json
{
  "placeName": "Núi Bà Đen",
  "locationHint": "Tây Ninh",
  "operation": "CREATE",
  "targetPlaceId": null
}
```

> `operation`: `CREATE` | `UPDATE`

**Response 201:** AgentTask object.

---

### GET `/agent/place-jobs/:id`

Trạng thái + tiến trình place job.

---

### GET `/agent/candidates`

Danh sách place candidates.

**Query params:** `status`, `page`, `limit`

---

### GET `/agent/candidates/:id`

Chi tiết candidate đầy đủ.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "placeCandidateId": "candidate-001",
    "jobId": "PL-00025",
    "status": "PENDING_REVIEW",
    "input": { "placeName": "Núi Bà Đen", "locationHint": "Tây Ninh" },
    "candidate": {
      "name": "Núi Bà Đen",
      "province": "Tây Ninh",
      "coordinates": { "lat": 11.387, "lng": 106.166 },
      "elevation": 986,
      "placeType": "MOUNTAIN",
      "shortDescription": "..."
    },
    "quality": {
      "overallConfidence": 92,
      "fieldConfidences": [
        { "field": "name", "confidence": 100 },
        { "field": "difficulty", "confidence": 50, "warning": "Cần Admin kiểm tra" }
      ]
    },
    "createdAt": "..."
  }
}
```

---

### PATCH `/agent/candidates/:id`

Chỉnh sửa dữ liệu candidate trước khi duyệt.

**Request:**
```json
{ "candidate": { "name": "Núi Bà Đen (hiệu chỉnh)", "difficulty": "HARD" } }
```

---

### POST `/agent/candidates/:id/review`

Duyệt / từ chối / yêu cầu chỉnh sửa.
Khi `APPROVE`: backend tạo `trekking_places` với `dataOrigin = AI_AGENT`.

**Request:**
```json
{ "action": "APPROVE", "reason": null }
```

> `action`: `APPROVE` | `REJECT` | `REQUEST_REVISION`

**Response 200:** Candidate object với status đã cập nhật.

---

## 17. AI Agent — Map Builder

**→ Service:** `agent-service`
**Auth:** 🔒 ADMIN

### POST `/agent/map-jobs`

Tạo tác vụ build bản đồ offline.

**Request:**
```json
{
  "trekking_place_id": "place-nui-ba-den",
  "place_name": "Núi Bà Đen",
  "publish_target": { "type": "PLACE", "target_id": "place-nui-ba-den" },
  "bbox": { "min_lon": 106.139, "min_lat": 11.361, "max_lon": 106.191, "max_lat": 11.412 },
  "min_zoom": 10,
  "max_zoom": 14
}
```

**Response 201:** AgentTask object.

---

### GET `/agent/map-jobs/:id`

Tiến trình build (poll mỗi 3–5 giây khi `PROCESSING`).

**Response 200:**
```json
{
  "success": true,
  "data": {
    "jobId": "MP-00015",
    "placeName": "Núi Bà Đen",
    "status": "PROCESSING",
    "progress": { "progressPercent": 55, "elapsedMs": 154000 },
    "steps": [
      { "label": "Validate BBOX", "status": "done" },
      { "label": "Build MBTiles", "status": "active" },
      { "label": "Package ZIP", "status": "pending" }
    ]
  }
}
```

---

### POST `/agent/map-jobs/:id/approve`

Admin duyệt và xuất bản bản đồ lên R2/CDN.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "objectKey": "maps/nui-ba-den/v1/nui-ba-den-v1-flutter.zip",
    "version": 1,
    "sizeBytes": 19292160,
    "publishedAt": "..."
  }
}
```

---

### POST `/agent/map-jobs/:id/reject`

**Request:** `{ "note": "BBOX quá rộng" }`
**Response 200:** `{ "success": true }`

---

### GET `/agent/map-artifacts/:id`

Thông tin artifact bản đồ.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "map-artifact-task-002",
    "taskId": "task-002",
    "fileName": "nui-ba-den-v1-flutter.zip",
    "sizeBytes": 19292160,
    "checksum": "sha256:a3f2c1...",
    "version": 1,
    "r2ObjectKey": "maps/nui-ba-den/v1/...",
    "downloadUrl": null,
    "publishedAt": "..."
  }
}
```

---

### GET `/agent/map-artifacts/:id/download`

Lấy URL tải file (signed URL ngắn hạn hoặc stream endpoint).

**Response 200:**
```json
{ "success": true, "data": { "url": "https://cdn.trekviet.vn/maps/...?signed=..." } }
```

---

## API Gateway — Route Mapping (Web Admin)

| Prefix gửi từ Web Admin | → Service | Port |
|-------------------------|-----------|------|
| `POST /auth/login` | auth-service | 3001 |
| `POST /auth/logout` | auth-service | 3001 |
| `POST /auth/refresh` | auth-service | 3001 |
| `GET /auth/me` | auth-service | 3001 |
| `GET/POST /admin/users/**` | auth-service | 3001 |
| `GET/PATCH /admin/ranks/**` | auth-service | 3001 |
| `GET /admin/dashboard` | auth-service | 3001 |
| `GET /admin/audit-logs` | auth-service | 3001 |
| `GET/POST/PUT/PATCH/DELETE /admin/trekking/**` | trekking-service | 3003 |
| `GET/POST/PUT/DELETE /admin/trekking/milestones/**` | trekking-service | 3003 |
| `GET/PATCH /admin/contributions/**` | trekking-service | 3003 |
| `GET/POST/PUT/PATCH/DELETE /admin/badges/**` | trekking-service | 3003 |
| `GET/POST/PUT/DELETE /admin/trekking/offline-maps/**` | trekking-service | 3003 |
| `GET /admin/trekking/journeys/**` | trekking-service | 3003 |
| `GET/PATCH/DELETE /admin/community/**` | community-service | 3004 |
| `GET /llm/providers` | agent-service | 8000 |
| `ALL /agent/**` | agent-service | 8000 |

> **Base URL qua Gateway:** `http://localhost:3000/api/v1`

---

## Chạy Backend local (Web Admin dev)

```bash
# Terminal 1 — Auth Service
cd Backend-TrekVN/services/auth-service
npm install
npm run dev
# → http://localhost:3001

# Terminal 2 — Trekking Service
cd Backend-TrekVN/services/trekking-service
npm install
npm run dev
# → http://localhost:3003

# Terminal 3 — Agent Service (Python)
cd Backend-TrekVN/services/agent-service
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# → http://localhost:8000

# Terminal 4 — API Gateway (sau khi các service đã up)
cd Backend-TrekVN/services/api-gateway
npm install
npm run dev
# → http://localhost:3000

# Test login admin:
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@trekviet.vn","password":"admin123"}'
```

---

## Notes quan trọng cho Web Admin dev

1. **Cookie-based refresh:** `/auth/refresh` đọc `refreshToken` từ HttpOnly Cookie. Web Admin phải dùng `credentials: 'include'` (hoặc `withCredentials: true` với axios).

2. **Bearer token:** Tất cả `/admin/*`, `/agent/*`, `/llm/*` đều cần `Authorization: Bearer <accessToken>`.

3. **Contribution review** dùng field `decision` (không phải `action`) vì đây là endpoint cũ trong trekking-service.

4. **Marker review** dùng field `action` (POST endpoint mới).

5. **Trekking admin prefix:** Các endpoint place/route/milestone admin đều có prefix `/admin/trekking/` (không phải `/admin/places/`).

6. **Flat milestone vs nested:** Có 2 cách truy cập milestone:
   - Flat: `GET /admin/trekking/milestones?routeId=xxx`
   - Nested: `GET /admin/trekking/routes/:routeId/milestones`

7. **Community service:** Đã triển khai `/admin/community/posts`, `/admin/community/comments`, chi tiết bài, ẩn/hiển thị lại/xóa với lý do. Xem [contract Community](community-service-api.md#quản-trị-community-web-admin). Riêng danh sách Community dùng `data.items`, không dùng `data.data`. Không dùng các đường cũ `/admin/posts`, `/admin/comments`, `/admin/reviews`; đánh giá địa điểm thuộc trekking-service.
