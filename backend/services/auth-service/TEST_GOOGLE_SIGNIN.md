# Test Google Sign-In Backend

## Prerequisites
1. Backend đang chạy: `npm run dev`
2. MongoDB connected
3. GOOGLE_CLIENT_ID configured trong `.env`

## Test với Thunder Client / Postman

### 1. Lấy Google ID Token (từ Flutter app hoặc test tool)

**Option A: Từ Flutter Debug**
- Thêm debug log trong `google_signin_service.dart`:
```dart
if (kDebugMode) {
  debugPrint('[GoogleSignInService] ID Token: $idToken');
}
```
- Chạy app, sign in, copy token từ console

**Option B: Sử dụng Google OAuth Playground**
1. Truy cập: https://developers.google.com/oauthplayground/
2. Step 1: Select & authorize APIs → chọn "Google OAuth2 API v2"
   - Chọn scopes: `userinfo.email`, `userinfo.profile`, `openid`
3. Click "Authorize APIs"
4. Step 2: Exchange authorization code for tokens
5. Copy `id_token` từ response

### 2. Test API Endpoint

**Endpoint**: `POST http://localhost:3001/api/v1/auth/google`

**Headers**:
```
Content-Type: application/json
```

**Body**:
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjI3N..."
}
```

### 3. Expected Responses

#### Success (200 OK)
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "a3f9b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9",
    "user": {
      "userId": "64f1a2b3c4d5e6f7a8b9c0d1",
      "email": "user@gmail.com",
      "displayName": "User Name",
      "avatarUrl": "https://lh3.googleusercontent.com/...",
      "role": "USER",
      "status": "ACTIVE",
      "emailVerifiedAt": "2024-01-15T08:05:00.000Z",
      "createdAt": "2024-01-15T08:05:00.000Z",
      "updatedAt": "2024-01-15T08:05:00.000Z"
    }
  }
}
```

#### Error: Missing idToken (400)
```json
{
  "success": false,
  "message": "Validation error",
  "errors": ["\"idToken\" is required"]
}
```

#### Error: Invalid/Expired Token (401)
```json
{
  "success": false,
  "message": "Google ID Token không hợp lệ hoặc đã hết hạn"
}
```

#### Error: Google Client ID not configured (400)
```json
{
  "success": false,
  "message": "Google Sign-In chưa được cấu hình"
}
```

#### Error: Blocked User (403)
```json
{
  "success": false,
  "message": "Tài khoản đã bị khóa"
}
```

## Test Scenarios

### Scenario 1: New User (First Time Google Sign-In)
1. Send request with valid ID Token
2. Backend creates:
   - New User (status: ACTIVE, passwordHash: null)
   - Google auth_identity
   - User settings (default values)
   - Rank profile (NEWBIE)
3. Returns tokens
4. Verify trong MongoDB:
   - `users` collection có user mới
   - `auth_identities` collection có record provider=GOOGLE
   - `user_settings` collection có settings
   - `rank_profiles` collection có profile với currentRank=NEWBIE

### Scenario 2: Existing User (Already signed up with email/password)
1. User A đăng ký bằng email: `test@gmail.com`
2. User A sign in bằng Google với cùng email
3. Backend:
   - Không tạo user mới
   - Link Google identity vào user hiện tại
   - Nếu user đang PENDING_VERIFICATION và Google verified → chuyển sang ACTIVE
4. Returns tokens của user hiện tại

### Scenario 3: Returning Google User
1. User đã từng sign in bằng Google trước đó
2. Backend tìm thấy auth_identity với provider=GOOGLE
3. Load user và return tokens
4. Không tạo record mới

### Scenario 4: Expired Token
1. Sử dụng ID Token đã hết hạn (>1 giờ)
2. Backend verify với Google → fail
3. Returns 401 error

### Scenario 5: Wrong Client ID
1. ID Token được tạo cho Client ID khác
2. Backend verify với GOOGLE_CLIENT_ID trong .env → audience mismatch
3. Returns 401 error

## Check Database

### Users Collection
```javascript
db.users.findOne({ email: "test@gmail.com" })
```

Expected:
```json
{
  "_id": ObjectId("..."),
  "email": "test@gmail.com",
  "passwordHash": null,  // null cho Google-only user
  "displayName": "Test User",
  "avatarUrl": "https://lh3.googleusercontent.com/...",
  "role": "USER",
  "status": "ACTIVE",
  "emailVerifiedAt": ISODate("2024-01-15T08:05:00.000Z"),
  "createdAt": ISODate("2024-01-15T08:05:00.000Z"),
  "updatedAt": ISODate("2024-01-15T08:05:00.000Z")
}
```

### Auth Identities Collection
```javascript
db.auth_identities.findOne({ userId: ObjectId("...") })
```

Expected:
```json
{
  "_id": ObjectId("..."),
  "userId": ObjectId("..."),
  "provider": "GOOGLE",
  "providerUserId": "108234567890123456789",  // Google sub
  "createdAt": ISODate("2024-01-15T08:05:00.000Z")
}
```

### User Settings Collection
```javascript
db.user_settings.findOne({ userId: ObjectId("...") })
```

Expected:
```json
{
  "_id": ObjectId("..."),
  "userId": ObjectId("..."),
  "language": "vi",
  "theme": "light",
  "distanceUnit": "km",
  "notificationEnabled": true,
  "createdAt": ISODate("..."),
  "updatedAt": ISODate("...")
}
```

### Rank Profiles Collection
```javascript
db.rank_profiles.findOne({ userId: ObjectId("...") })
```

Expected:
```json
{
  "_id": ObjectId("..."),
  "userId": ObjectId("..."),
  "currentRank": "NEWBIE",
  "totalXp": 0,
  "createdAt": ISODate("..."),
  "updatedAt": ISODate("...")
}
```

## Logs to Check

### Backend console should show:
```
[info] Google Sign-In: User logged in successfully
[info] User ID: 64f1a2b3c4d5e6f7a8b9c0d1
```

### MongoDB logs (if enabled):
```
Created user: test@gmail.com
Created auth_identity: GOOGLE
Created user_settings
Created rank_profile: NEWBIE
```

## Troubleshooting

### "GOOGLE_CLIENT_ID not configured"
- Check `.env` file has `GOOGLE_CLIENT_ID`
- Restart backend after adding env variable

### "Token verification failed"
- ID Token expired (>1 hour old)
- Wrong Client ID in .env
- Network issue connecting to Google servers

### "Duplicate key error"
- User already exists with same email
- Should not happen - check logic in `googleAuth.service.js`

### "RabbitMQ connection failed" (warning only)
- Non-critical if RABBITMQ_ENABLED=false
- Gamification events won't be published but user creation still works

## Performance Benchmarks

- Token verification with Google: ~200-500ms
- Database operations: ~50-100ms
- Total response time: <1 second

## Security Checks

- [ ] ID Token verified with Google (not just decoded)
- [ ] Email from verified payload (not from client)
- [ ] No plaintext token stored in database
- [ ] Refresh token properly hashed
- [ ] Access token expires in 15 minutes
- [ ] Refresh token expires in 30 days

## Integration with Frontend

After backend test passes:
1. Frontend sends ID Token → Backend
2. Backend returns accessToken + refreshToken
3. Frontend stores tokens in secure storage
4. Frontend navigates to home screen
5. Subsequent API calls use accessToken in Authorization header

---

**Test Checklist**:
- [ ] Test with new user (first Google sign-in)
- [ ] Test with existing email/password user
- [ ] Test with returning Google user
- [ ] Test with expired token
- [ ] Test with invalid token
- [ ] Test with missing idToken
- [ ] Verify database records created
- [ ] Verify tokens work for authenticated endpoints
- [ ] Test token refresh flow
- [ ] Test logout flow
