# Auth Service — API Documentation

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
