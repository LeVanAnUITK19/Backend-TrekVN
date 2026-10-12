# Auth Service — API Documentation

**Review 2026-10-12:** [All implemented routes](api-route-inventory.md), [OpenAPI snapshot](openapi/auth-service.json), [physical MongoDB schema](database/runtime/auth-service.dbml).

Security behavior: `/auth/verify` checks the current ACTIVE account, current role and `tokenVersion`. Password change/reset increments the version, revoking existing access sessions through Gateway. Refresh rotation atomically consumes the old token. Reset JWTs expire after 15 minutes and are single-use via the `passwordresettokens` collection; outstanding reset tokens issued before this change must be replaced through a new OTP flow. Registration verification/resend cannot reactivate BLOCKED accounts. Google activation of a PENDING local account clears its unverified password to prevent account pre-hijacking.

**Base URL:** `http://localhost:3001/api/v1`
**Swagger UI:** `http://localhost:3001/api-docs`

---

## Authentication

Các endpoint có dấu 🔒 yêu cầu header:

```
Authorization: Bearer <accessToken>
```

---

## Luồng xử lý

### Đăng ký
```
POST /auth/register  →  Gửi OTP qua email
POST /auth/verify-email  →  Xác minh OTP → nhận accessToken + refreshToken
```

### Quên mật khẩu
```
POST /auth/forgot-password  →  Gửi OTP qua email
POST /auth/verify-reset-otp  →  Xác minh OTP → nhận resetToken (15 phút)
POST /auth/reset-password  →  Đặt mật khẩu mới bằng resetToken
```

---

## Auth Endpoints

---

### POST /auth/register

**Mô tả:** Đăng ký tài khoản mới — Bước 1: gửi OTP xác minh đến email.
**Authentication:** Không yêu cầu.

**Request Body:**
```json
{
  "email": "an@gmail.com",
  "password": "Abc@1234",
  "displayName": "Nguyễn Văn An"
}
```

**Response 201 — OTP đã gửi:**
```json
{
  "success": true,
  "data": {
    "message": "OTP xác minh đã được gửi đến email của bạn",
    "expiresAt": "2024-01-15T08:10:00.000Z"
  }
}
```

**Response 400 — Email đã tồn tại:**
```json
{
  "success": false,
  "message": "Email đã được sử dụng"
}
```

---

### POST /auth/verify-email

**Mô tả:** Xác minh OTP đăng ký — Bước 2: kích hoạt tài khoản và nhận token.
**Authentication:** Không yêu cầu.

**Request Body:**
```json
{
  "email": "an@gmail.com",
  "otp": "482910"
}
```

**Response 200 — Thành công:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "a3f9b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9",
    "user": {
      "userId": "64f1a2b3c4d5e6f7a8b9c0d1",
      "email": "an@gmail.com",
      "displayName": "Nguyễn Văn An",
      "role": "USER",
      "status": "ACTIVE",
      "emailVerifiedAt": "2024-01-15T08:05:00.000Z"
    }
  }
}
```

**Response 400 — OTP sai:**
```json
{
  "success": false,
  "message": "OTP không đúng. Còn 4 lần thử"
}
```

**Response 400 — OTP hết hạn:**
```json
{
  "success": false,
  "message": "OTP không hợp lệ hoặc đã hết hạn"
}
```

**Response 429 — Quá số lần thử:**
```json
{
  "success": false,
  "message": "Vượt quá số lần thử. Vui lòng yêu cầu OTP mới"
}
```

---

### POST /auth/resend-verification-otp

**Mô tả:** Gửi lại OTP xác minh email.
**Authentication:** Không yêu cầu.

**Request Body:**
```json
{
  "email": "an@gmail.com"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "message": "OTP đã được gửi lại",
    "expiresAt": "2024-01-15T08:15:00.000Z"
  }
}
```

**Response 400 — Đã xác minh rồi:**
```json
{
  "success": false,
  "message": "Email đã được xác minh"
}
```

---

### POST /auth/login

**Mô tả:** Đăng nhập vào hệ thống.
**Authentication:** Không yêu cầu.

**Request Body:**
```json
{
  "email": "an@gmail.com",
  "password": "Abc@1234"
}
```

**Response 200 — Thành công:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "a3f9b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9",
    "user": {
      "userId": "64f1a2b3c4d5e6f7a8b9c0d1",
      "email": "an@gmail.com",
      "displayName": "Nguyễn Văn An",
      "role": "USER",
      "status": "ACTIVE"
    }
  }
}
```

**Response 401 — Sai thông tin:**
```json
{
  "success": false,
  "message": "Email hoặc mật khẩu không đúng"
}
```

**Response 403 — Chưa xác minh:**
```json
{
  "success": false,
  "message": "Tài khoản chưa được xác minh email"
}
```

**Response 403 — Bị khóa:**
```json
{
  "success": false,
  "message": "Tài khoản đã bị khóa"
}
```

---

### POST /auth/refresh

**Mô tả:** Cấp accessToken mới bằng refreshToken (Refresh Token Rotation — token cũ bị revoke ngay).
**Authentication:** Không yêu cầu.

**Request Body:**
```json
{
  "refreshToken": "a3f9b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "b4g0c3d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1"
  }
}
```

**Response 401:**
```json
{
  "success": false,
  "message": "Refresh token không hợp lệ hoặc đã hết hạn"
}
```

---

### POST /auth/logout 🔒

**Mô tả:** Đăng xuất — revoke refresh token. Nếu không gửi `refreshToken`, toàn bộ sessions bị revoke.
**Authentication:** Yêu cầu Bearer token.

**Request Body** _(optional):_
```json
{
  "refreshToken": "a3f9b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9"
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Đăng xuất thành công"
}
```

---

### GET /auth/verify 🔒

**Mô tả:** Xác thực accessToken và trả về payload — dùng nội bộ bởi API Gateway.
**Authentication:** Yêu cầu Bearer token.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "email": "an@gmail.com",
    "role": "USER",
    "iat": 1700000000,
    "exp": 1700000900
  }
}
```

---

### POST /auth/forgot-password

**Mô tả:** Yêu cầu OTP reset mật khẩu — Bước 1. Luôn trả về 200 (không tiết lộ email có tồn tại hay không).
**Authentication:** Không yêu cầu.

**Request Body:**
```json
{
  "email": "an@gmail.com"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "message": "Nếu email tồn tại, OTP sẽ được gửi đến hộp thư của bạn",
    "expiresAt": "2024-01-15T08:10:00.000Z"
  }
}
```

---

### POST /auth/verify-reset-otp

**Mô tả:** Xác minh OTP reset password — Bước 2. Trả về `resetToken` (hiệu lực 15 phút).
**Authentication:** Không yêu cầu.

**Request Body:**
```json
{
  "email": "an@gmail.com",
  "otp": "193847"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "resetToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Response 400:**
```json
{
  "success": false,
  "message": "OTP không hợp lệ hoặc đã hết hạn"
}
```

---

### POST /auth/reset-password

**Mô tả:** Đặt mật khẩu mới bằng `resetToken` — Bước 3. Sau khi đặt lại, toàn bộ refresh token bị revoke.
**Authentication:** Yêu cầu `resetToken` trong body (không phải Bearer).

**Request Body:**
```json
{
  "resetToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "newPassword": "NewPass@456"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "message": "Mật khẩu đã được đặt lại thành công"
  }
}
```

**Response 401:**
```json
{
  "success": false,
  "message": "Reset token không hợp lệ hoặc đã hết hạn"
}
```

---

## User Endpoints

---

### GET /users/me 🔒

**Mô tả:** Lấy thông tin profile của user đang đăng nhập.
**Authentication:** Yêu cầu Bearer token.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "userId": "64f1a2b3c4d5e6f7a8b9c0d1",
    "email": "an@gmail.com",
    "displayName": "Nguyễn Văn An",
    "avatarUrl": "https://example.com/avatar.jpg",
    "bio": "Yêu thích leo núi và khám phá",
    "role": "USER",
    "status": "ACTIVE",
    "emailVerifiedAt": "2024-01-15T08:05:00.000Z",
    "createdAt": "2024-01-15T08:00:00.000Z",
    "updatedAt": "2024-01-15T08:00:00.000Z"
  }
}
```

---

### PATCH /users/me 🔒

**Mô tả:** Cập nhật thông tin profile.
**Authentication:** Yêu cầu Bearer token.

**Request Body** _(ít nhất 1 trường):_
```json
{
  "displayName": "Nguyễn Văn An (updated)",
  "avatarUrl": "https://example.com/new-avatar.jpg",
  "bio": "Yêu thích trekking và thiên nhiên Việt Nam"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "userId": "64f1a2b3c4d5e6f7a8b9c0d1",
    "email": "an@gmail.com",
    "displayName": "Nguyễn Văn An (updated)",
    "avatarUrl": "https://example.com/new-avatar.jpg",
    "bio": "Yêu thích trekking và thiên nhiên Việt Nam",
    "role": "USER",
    "status": "ACTIVE"
  }
}
```

---

### PATCH /users/me/password 🔒

**Mô tả:** Đổi mật khẩu khi đang đăng nhập. Sau khi đổi, toàn bộ sessions bị revoke.
**Authentication:** Yêu cầu Bearer token.

**Request Body:**
```json
{
  "currentPassword": "Abc@1234",
  "newPassword": "NewPass@456"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "message": "Đổi mật khẩu thành công. Vui lòng đăng nhập lại"
  }
}
```

**Response 400 — Mật khẩu hiện tại sai:**
```json
{
  "success": false,
  "message": "Mật khẩu hiện tại không đúng"
}
```

**Response 400 — Mật khẩu mới trùng cũ:**
```json
{
  "success": false,
  "message": "Mật khẩu mới phải khác mật khẩu hiện tại"
}
```

---

### GET /users/me/settings 🔒

**Mô tả:** Lấy cài đặt cá nhân.
**Authentication:** Yêu cầu Bearer token.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "userSettingId": "64f1a2b3c4d5e6f7a8b9c0d2",
    "userId": "64f1a2b3c4d5e6f7a8b9c0d1",
    "language": "vi",
    "theme": "dark",
    "distanceUnit": "km",
    "notificationEnabled": true,
    "createdAt": "2024-01-15T08:00:00.000Z",
    "updatedAt": "2024-01-15T08:00:00.000Z"
  }
}
```

---

### PATCH /users/me/settings 🔒

**Mô tả:** Cập nhật cài đặt cá nhân.
**Authentication:** Yêu cầu Bearer token.

**Request Body** _(ít nhất 1 trường):_
```json
{
  "language": "en",
  "theme": "light",
  "distanceUnit": "km",
  "notificationEnabled": false
}
```

| Field | Type | Values |
|-------|------|--------|
| `language` | string | `vi`, `en` |
| `theme` | string | `light`, `dark` |
| `distanceUnit` | string | `km`, `mi` |
| `notificationEnabled` | boolean | `true`, `false` |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "userSettingId": "64f1a2b3c4d5e6f7a8b9c0d2",
    "userId": "64f1a2b3c4d5e6f7a8b9c0d1",
    "language": "en",
    "theme": "light",
    "distanceUnit": "km",
    "notificationEnabled": false,
    "updatedAt": "2024-01-16T10:30:00.000Z"
  }
}
```

---

### POST /users/me/avatar 🔒

**Mô tả:** Tải ảnh đại diện lên Cloudinary. Ảnh được resize về 400×400, crop face, tối ưu chất lượng tự động. Mỗi user chỉ có 1 slot avatar — upload mới sẽ overwrite cũ.
**Authentication:** Yêu cầu Bearer token.
**Content-Type:** `multipart/form-data`

**Giới hạn:** JPEG / PNG / WebP / GIF, tối đa 5 MB.

**Form field:**

| Field | Type | Mô tả |
|-------|------|-------|
| `avatar` | file | Ảnh đại diện (required) |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "userId": "64f1a2b3c4d5e6f7a8b9c0d1",
    "displayName": "Nguyễn Văn An",
    "avatarUrl": "https://res.cloudinary.com/dfp5hzdsy/image/upload/v1234/trekvn/avatars/user_64f1.jpg"
  }
}
```

**Response 400 — Không có file:**
```json
{
  "success": false,
  "message": "Không có file ảnh được gửi lên"
}
```

**Response 400 — Loại file không hợp lệ:**
```json
{
  "success": false,
  "message": "Chỉ chấp nhận ảnh JPEG, PNG, WebP hoặc GIF"
}
```

---

### PATCH /users/me/bio 🔒

**Mô tả:** Cập nhật bio (giới thiệu bản thân). Truyền `null` hoặc `""` để xóa bio.
**Authentication:** Yêu cầu Bearer token.

**Request Body:**
```json
{
  "bio": "Yêu thích khám phá núi rừng Việt Nam 🏔️"
}
```

| Field | Type | Validation |
|-------|------|------------|
| `bio` | string \| null | Required, tối đa 500 ký tự, cho phép `null` hoặc `""` |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "userId": "64f1a2b3c4d5e6f7a8b9c0d1",
    "bio": "Yêu thích khám phá núi rừng Việt Nam 🏔️"
  }
}
```

**Response 400 — Bio quá dài:**
```json
{
  "success": false,
  "message": "Validation error",
  "errors": ["Bio không được quá 500 ký tự"]
}
```

---

## Error Responses chung

| Status | Mô tả |
|--------|-------|
| 400 | Dữ liệu đầu vào không hợp lệ |
| 401 | Chưa xác thực hoặc token không hợp lệ |
| 403 | Tài khoản không được phép thực hiện hành động |
| 404 | Không tìm thấy resource |
| 429 | Quá giới hạn request |
| 500 | Lỗi server nội bộ |

---

## Ghi chú bảo mật

- **Refresh Token Rotation**: mỗi lần dùng `/auth/refresh`, token cũ bị revoke ngay lập tức và token mới được cấp.
- **OTP**: 6 chữ số, hiệu lực 10 phút, tối đa 5 lần thử sai. OTP cũ bị hủy khi gửi OTP mới.
- **Reset Token**: JWT ngắn hạn 15 phút, ký bằng secret riêng, chỉ dùng 1 lần.
- **Email enum attack**: `/auth/forgot-password` luôn trả về 200 bất kể email có tồn tại hay không.
- **Password change**: Đổi mật khẩu hoặc reset mật khẩu → revoke toàn bộ refresh token (force logout tất cả thiết bị).

---

## Gamification Endpoints

Hệ thống rank, XP và thống kê trekking. User tự động nhận rank **NEWBIE** sau khi xác minh email.

---

### GET /gamification/me 🔒

**Mô tả:** Lấy hồ sơ rank hiện tại — endpoint chính cho màn **Profile**.
**Authentication:** Yêu cầu Bearer token.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "rank": {
      "code": "PATHFINDER",
      "name": "Pathfinder",
      "level": 5,
      "iconUrl": "https://..."
    },
    "totalXp": 7850,
    "statistics": {
      "completedJourneys": 24,
      "totalDistanceMeters": 287500,
      "totalElevationGain": 12450,
      "verifiedCheckins": 86,
      "visitedProvinces": 8,
      "visitedPlaces": 17,
      "badgeCount": 15,
      "approvedContributions": 3
    },
    "nextRank": {
      "code": "MOUNTAINEER",
      "name": "Mountaineer",
      "level": 6,
      "minXp": 12000
    },
    "updatedAt": "2026-10-01T13:30:00Z"
  }
}
```

`nextRank` là `null` nếu user đã đạt rank tối đa (**TREK_LEGEND**).

**Response 401:** Chưa xác thực
**Response 404:** Hồ sơ gamification chưa được khởi tạo

---

### GET /gamification/me/progress 🔒

**Mô tả:** Tiến trình chi tiết để lên rank tiếp theo — dùng cho màn **Next Rank Progress**.
**Authentication:** Yêu cầu Bearer token.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "currentRank": {
      "code": "PATHFINDER",
      "name": "Pathfinder",
      "level": 5
    },
    "nextRank": {
      "code": "MOUNTAINEER",
      "name": "Mountaineer",
      "level": 6
    },
    "requirements": {
      "xp": {
        "current": 7850,
        "required": 12000,
        "completed": false
      },
      "completedJourneys": {
        "current": 24,
        "required": 30,
        "completed": false
      },
      "visitedProvinces": {
        "current": 8,
        "required": 8,
        "completed": true
      },
      "badges": {
        "current": 15,
        "required": 12,
        "completed": true
      },
      "distanceMeters": {
        "current": 287500,
        "required": 250000,
        "completed": true
      },
      "approvedContributions": {
        "current": 3,
        "required": 0,
        "completed": true
      }
    },
    "overallProgressPercent": 82
  }
}
```

Khi đã đạt rank tối đa: `nextRank` là `null`, `requirements` là `{}`, `overallProgressPercent` là `100`.

---

### GET /gamification/ranks

**Mô tả:** Danh sách toàn bộ rank sắp xếp theo level — dùng cho màn **Rank Overview**.
**Authentication:** Không yêu cầu.

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "code": "NEWBIE",
      "name": "Newbie",
      "level": 1,
      "description": "Người mới bắt đầu hành trình trekking.",
      "minXp": 0,
      "iconUrl": null,
      "requirements": {
        "completedJourneys": 0,
        "visitedProvinces": 0,
        "badges": 0,
        "distanceMeters": 0,
        "approvedContributions": 0
      }
    },
    {
      "code": "HIKER",
      "name": "Hiker",
      "level": 2,
      "description": "...",
      "minXp": 500,
      "iconUrl": null,
      "requirements": {
        "completedJourneys": 2,
        "visitedProvinces": 1,
        "badges": 1,
        "distanceMeters": 0,
        "approvedContributions": 0
      }
    }
  ]
}
```

---

### GET /gamification/ranks/:rankCode

**Mô tả:** Chi tiết một rank theo code.
**Authentication:** Không yêu cầu.

**Path param:** `rankCode` — một trong 10 giá trị: `NEWBIE`, `HIKER`, `EXPLORER`, `TREKKER`, `PATHFINDER`, `MOUNTAINEER`, `ADVENTURER`, `ELITE_TREKKER`, `TREK_MASTER`, `TREK_LEGEND`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "code": "MOUNTAINEER",
    "name": "Mountaineer",
    "level": 6,
    "description": "Người trekking có nhiều kinh nghiệm...",
    "iconUrl": null,
    "requirements": {
      "minXp": 12000,
      "minCompletedJourneys": 30,
      "minVisitedProvinces": 8,
      "minBadgeCount": 12,
      "minDistanceMeters": 250000,
      "minApprovedContributions": 0
    }
  }
}
```

**Response 404:** Rank không tồn tại

---

### GET /gamification/me/xp-history 🔒

**Mô tả:** Lịch sử XP với cursor-based pagination (mới nhất trước).
**Authentication:** Yêu cầu Bearer token.

**Query params:**

| Param | Type | Default | Mô tả |
|-------|------|---------|-------|
| `limit` | integer | `20` | Số item mỗi trang (tối đa 100) |
| `cursor` | string | — | ISO date string của item cuối trang trước |

**Ví dụ:** `GET /gamification/me/xp-history?limit=20&cursor=2026-10-01T10:25:00.000Z`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "xpTransactionId": "64f1a2b3c4d5e6f7a8b9c0d1",
      "transactionType": "EARN",
      "sourceType": "JOURNEY_COMPLETED",
      "sourceId": "journey_123",
      "xpAmount": 150,
      "description": "Hoàn thành hành trình Núi Bà Đen",
      "createdAt": "2026-10-01T10:30:00Z"
    },
    {
      "xpTransactionId": "64f1a2b3c4d5e6f7a8b9c0d2",
      "transactionType": "EARN",
      "sourceType": "MILESTONE_CHECKIN",
      "sourceId": "checkin_456",
      "xpAmount": 50,
      "description": "Chinh phục Summit Núi Bà Đen",
      "createdAt": "2026-10-01T10:25:00Z"
    }
  ],
  "pagination": {
    "nextCursor": "2026-10-01T10:25:00.000Z"
  }
}
```

`nextCursor` là `null` khi không còn trang tiếp.

**sourceType** có thể là: `JOURNEY_COMPLETED`, `JOURNEY_DISTANCE`, `JOURNEY_ELEVATION`, `MILESTONE_CHECKIN`, `PROVINCE_VISITED`, `PLACE_VISITED`, `BADGE_EARNED`, `ROUTE_APPROVED`, `PLACE_APPROVED`, `ADMIN_ADJUSTMENT`

---

### GET /gamification/me/rank-history 🔒

**Mô tả:** Lịch sử thay đổi rank (mới nhất trước).
**Authentication:** Yêu cầu Bearer token.

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "previousRank": {
        "code": "TREKKER",
        "name": "Trekker"
      },
      "newRank": {
        "code": "PATHFINDER",
        "name": "Pathfinder"
      },
      "xpAtChange": 7040,
      "changeType": "PROMOTION",
      "changedAt": "2026-09-10T08:20:00Z"
    },
    {
      "previousRank": null,
      "newRank": {
        "code": "NEWBIE",
        "name": "Newbie"
      },
      "xpAtChange": 0,
      "changeType": "PROMOTION",
      "changedAt": "2026-01-01T00:00:00Z"
    }
  ]
}
```

`previousRank` là `null` cho entry đầu tiên (khi user vừa đăng ký).
`changeType`: `PROMOTION` | `DEMOTION` | `RECALCULATION`

---

### GET /gamification/users/:userId

**Mô tả:** Xem gamification profile công khai của user khác — dùng cho màn **Community / User Profile**.
**Authentication:** Không yêu cầu.

**Path param:** `userId` — MongoDB ObjectId của user cần xem.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "userId": "64f1a2b3c4d5e6f7a8b9c0d1",
    "rank": {
      "code": "ELITE_TREKKER",
      "name": "Elite Trekker",
      "level": 8,
      "iconUrl": null
    },
    "totalXp": 35450,
    "statistics": {
      "completedJourneys": 72,
      "distanceMeters": 820400,
      "visitedProvinces": 20,
      "badgeCount": 29
    }
  }
}
```

Thông tin **không** được trả về (private): lịch sử XP, điều kiện rank chi tiết, admin adjustment.

**Response 404:** Người dùng hoặc hồ sơ gamification không tồn tại

---

## Bảng 10 Rank

| Level | Code | Name | Min XP |
|-------|------|------|--------|
| 1 | `NEWBIE` | Newbie | 0 |
| 2 | `HIKER` | Hiker | 500 |
| 3 | `EXPLORER` | Explorer | 1500 |
| 4 | `TREKKER` | Trekker | 3500 |
| 5 | `PATHFINDER` | Pathfinder | 7000 |
| 6 | `MOUNTAINEER` | Mountaineer | 12000 |
| 7 | `ADVENTURER` | Adventurer | 20000 |
| 8 | `ELITE_TREKKER` | Elite Trekker | 32000 |
| 9 | `TREK_MASTER` | Trek Master | 50000 |
| 10 | `TREK_LEGEND` | Trek Legend | 75000 |

> Giá trị XP và các điều kiện bổ sung được quản lý qua seed script và có thể điều chỉnh trong DB.

---

## Google Sign-In (Added in v4.0)

### POST /auth/google

**Mô tả:** Đăng nhập hoặc đăng ký bằng Google ID Token. Backend verify token — không tin thông tin từ client.

**Authentication:** Không yêu cầu.

**Request Body:**
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Flow:**
1. Backend verify `idToken` với Google (audience = `GOOGLE_CLIENT_ID`)
2. Lấy `sub`, `email`, `name`, `picture` từ verified payload
3. Tìm `auth_identity` với `provider=GOOGLE` và `providerUserId=sub`
   - **Tồn tại** → load User, kiểm tra BLOCKED, issue tokens
   - **Chưa tồn tại, email chưa có User** → tạo User mới (ACTIVE) + GOOGLE identity + settings + NEWBIE rank → issue tokens
   - **Chưa tồn tại, email đã có LOCAL User** → link GOOGLE identity → issue tokens
4. User BLOCKED → 403

**Response 200:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "a3f9b2c1d4e5...",
    "user": {
      "userId": "64f1a2b3c4d5e6f7a8b9c0d1",
      "email": "user@gmail.com",
      "displayName": "Nguyễn Văn An",
      "role": "USER",
      "status": "ACTIVE"
    }
  }
}
```

**Error codes:**

| HTTP | Message | Meaning |
|------|---------|---------|
| 400 | Thiếu idToken | Missing body |
| 401 | Google ID Token không hợp lệ hoặc đã hết hạn | Token verify failed |
| 403 | Tài khoản đã bị khóa | User is BLOCKED |

**Env required:** `GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com`

---

## User Status Values (v4.0)

| Status | Description |
|--------|-------------|
| `PENDING_VERIFICATION` | Registered but email not verified |
| `ACTIVE` | Fully active account |
| `BLOCKED` | Blocked by admin (was `SUSPENDED` in v3 — **breaking change**) |

> **Migration:** `db.users.updateMany({ status: "SUSPENDED" }, { $set: { status: "BLOCKED" } })`

---

## Rank Definitions (v4.0 — corrected)

| Level | Code | Name | minXp |
|-------|------|------|-------|
| 1 | `NEWBIE` | Newbie | 0 |
| 2 | `HIKER` | Hiker | 500 |
| 3 | `EXPLORER` | Explorer | 1500 |
| 4 | `TREKKER` | Trekker | 3500 |
| 5 | `PATHFINDER` | Pathfinder | 7000 |
| 6 | `MOUNTAINEER` | Mountaineer | 12000 |
| 7 | `ADVENTURER` | Adventurer | 20000 |
| 8 | `ELITE_TREKKER` | Elite Trekker | 32000 |
| 9 | `TREK_MASTER` | Trek Master | 50000 |
| 10 | `TREK_LEGEND` | Trek Legend | **80000** (corrected from 75000) |

> Re-run `npm run seed:ranks` after deploying v4.0.
