<div align="center">

<img src="https://img.shields.io/badge/TrekViệt-CheckIn_Service-2D7D46?style=for-the-badge&logo=mountain&logoColor=white" alt="CheckIn Service" />

# 📍 CheckIn Service

**Xử lý check-in GPS milestone trekking, đồng bộ offline và lịch sử ghé thăm**

[![Node.js](https://img.shields.io/badge/Node.js-20-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://mongodb.com)
[![Jest](https://img.shields.io/badge/Tests-45_passed-C21325?style=flat-square&logo=jest&logoColor=white)](./tests)
[![Swagger](https://img.shields.io/badge/Swagger-OpenAPI_3.0-85EA2D?style=flat-square&logo=swagger&logoColor=black)](http://localhost:3002/api-docs)

</div>

---

## 📖 Chức năng

CheckIn Service là service trung tâm xử lý việc **ghi nhận sự hiện diện GPS** của user tại các milestone trên cung đường trekking. Service cũng quản lý toàn bộ lịch sử ghé thăm địa điểm và tỉnh thành.

### Tính năng chính

| Tính năng | Mô tả |
|-----------|-------|
| 📍 **GPS Check-in** | Xác minh vị trí bằng Haversine distance — chỉ VERIFIED khi trong bán kính milestone |
| 🔄 **Offline Sync** | Batch sync check-ins được tạo offline (Flutter SQLite), idempotent retry |
| 🏔️ **Place Visits** | Tự động ghi nhận lịch sử địa điểm trekking đã đến |
| 🗺️ **Province Visits** | Theo dõi tỉnh/thành phố user đã ghé — manual tick + GPS verified |
| 📊 **Visit Summary** | Thống kê nhanh: tỉnh đã đi, địa điểm đã đến, tổng check-in |
| 🔌 **TrekkingProvider** | Abstraction layer — dùng mock khi trekking-service chưa có, HTTP khi sẵn sàng |

---

## 🏗️ Kiến trúc

```
checkin-service/
├── src/
│   ├── config/
│   │   ├── database.js          # Kết nối MongoDB Atlas
│   │   └── logger.js            # Winston structured logging
│   │
│   ├── models/                  # Mongoose schemas
│   │   ├── Province.js          # Tỉnh/thành phố, GeoJSON Point
│   │   ├── ProvinceVisit.js     # Trạng thái user với tỉnh (SELF_REPORTED/VERIFIED)
│   │   ├── PlaceVisit.js        # Lịch sử địa điểm trekking đã đến
│   │   └── MilestoneCheckin.js  # Check-in GPS tại milestone
│   │
│   ├── providers/trekking/      # Abstraction layer cho trekking-service
│   │   ├── TrekkingProvider.js  # Interface/base class
│   │   ├── MockTrekkingProvider.js  # Đọc src/mocks/milestones.json
│   │   ├── HttpTrekkingProvider.js  # Gọi HTTP trekking-service
│   │   └── index.js             # Factory singleton (ENV-based)
│   │
│   ├── mocks/
│   │   └── milestones.json      # Dữ liệu milestone mẫu (development/test)
│   │
│   ├── repositories/            # Data access layer
│   │   ├── milestoneCheckin.repository.js
│   │   ├── placeVisit.repository.js
│   │   ├── provinceVisit.repository.js
│   │   └── province.repository.js
│   │
│   ├── services/                # Business logic
│   │   ├── checkin.service.js   # GPS validation, Haversine, visit update
│   │   └── visit.service.js     # Province/Place visit management
│   │
│   ├── controllers/
│   │   ├── checkin.controller.js
│   │   └── visit.controller.js
│   │
│   ├── routes/
│   │   ├── checkin.routes.js    # /api/v1/checkins (+ Swagger JSDoc)
│   │   ├── visit.routes.js      # /api/v1/visits   (+ Swagger JSDoc)
│   │   ├── journey.routes.js    # /api/v1/journeys (+ Swagger JSDoc)
│   │   └── index.js
│   │
│   ├── middlewares/
│   │   ├── auth.js              # JWT verify, normalize req.user.userId
│   │   ├── validate.js          # Joi validation + stripUnknown
│   │   ├── errorHandler.js      # Error format: { success, error: { code, message, details } }
│   │   └── notFound.js
│   │
│   ├── validators/
│   │   └── checkin.validator.js # createCheckin, sync, manualMark schemas
│   │
│   └── utils/
│       ├── errors.js            # AppError, BusinessError, ConflictError...
│       └── haversine.js         # Haversine distance formula
│
├── tests/
│   ├── integration/
│   │   ├── health.test.js       # 1 test
│   │   ├── checkin.test.js      # 25 tests (online, sync, query, auth)
│   │   └── visit.test.js        # 19 tests (province, place, summary)
│   ├── helpers/
│   │   └── factory.js           # generateToken, checkinPayload, createProvince
│   └── setup/
│       ├── db.js                # MongoMemoryServer connect/disconnect/clear
│       └── env.js               # Test environment variables
│
├── .env.example
├── .env
├── Dockerfile
├── package.json
└── README.md
```

### Request Flow

```
Flutter Client
     │
     │  POST /api/v1/checkins
     │  Authorization: Bearer <JWT from auth-service>
     ▼
auth middleware          ← verify JWT, extract userId
     │
validate middleware      ← Joi schema, stripUnknown (drop userId/placeId từ body)
     │
checkin.controller
     │
checkin.service
  ├── TrekkingProvider.getMilestoneCheckinContext(milestoneId)
  │      └── MockTrekkingProvider  ← src/mocks/milestones.json
  │          HttpTrekkingProvider  ← GET trekking-service/internal/v1/milestones/:id/checkin-context
  │
  ├── GPS accuracy check (accuracyMeters ≤ CHECKIN_MAX_GPS_ACCURACY_METERS)
  ├── Haversine distance (user ↔ milestone)
  ├── Radius check (distance ≤ checkinRadiusMeters)
  ├── Duplicate check (journeyId + milestoneId + userId)
  ├── Save MilestoneCheckin (VERIFIED)
  ├── Update PlaceVisit (if qualifiesPlaceVisit = true)
  └── Update ProvinceVisit (VERIFIED)
     │
     ▼
  201 { success: true, data: MilestoneCheckin }
```

---

## ⚙️ Setup

### Yêu cầu

- **Node.js** >= 20
- **MongoDB** Atlas hoặc local (database: `checkIn-service-trekVN`)
- JWT secret **phải khớp** với auth-service

### 1. Clone & cài đặt

```bash
cd services/checkin-service
npm install
```

### 2. Cấu hình môi trường

```bash
cp .env.example .env
```

Chỉnh sửa `.env`:

```env
# Server
PORT=3002
NODE_ENV=development

# MongoDB — phải dùng database riêng, không dùng chung với auth-service
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster0.xxx.mongodb.net/checkIn-service-trekVN

# JWT — PHẢI khớp với JWT_SECRET của auth-service
JWT_SECRET=your-shared-secret

# Check-in config
CHECKIN_MAX_GPS_ACCURACY_METERS=50

# Trekking Provider
TREKKING_PROVIDER=mock
```

### 3. Chạy development

```bash
npm run dev
```

Service khởi động tại `http://localhost:3002`  
Swagger UI tại `http://localhost:3002/api-docs`

### 4. Chạy với Docker

```bash
docker build -t trekvn-checkin-service .
docker run -p 3002:3002 --env-file .env trekvn-checkin-service
```

---

## 🌐 Environment Variables

| Variable | Required | Default | Mô tả |
|----------|----------|---------|-------|
| `PORT` | — | `3002` | Port lắng nghe |
| `NODE_ENV` | — | `development` | `development` \| `production` \| `test` |
| `MONGODB_URI` | ✅ | — | MongoDB connection string |
| `JWT_SECRET` | ✅ | — | Khớp với auth-service để verify JWT |
| `CHECKIN_MAX_GPS_ACCURACY_METERS` | — | `50` | Ngưỡng GPS accuracy tối đa (mét) |
| `TREKKING_PROVIDER` | — | `mock` | `mock` \| `http` |
| `TREKKING_SERVICE_URL` | khi `http` | — | URL của trekking-service |
| `TREKKING_HTTP_TIMEOUT_MS` | — | `5000` | Timeout HTTP call đến trekking-service (ms) |
| `LOG_LEVEL` | — | `info` | Winston log level |

---

## 🗄️ MongoDB

- **Cluster:** MongoDB Atlas (chung với toàn bộ hệ thống)
- **Database:** `checkIn-service-trekVN`
- **Collections:**

| Collection | Index chính | Mô tả |
|------------|-------------|-------|
| `provinces` | `code` unique, `center` 2dsphere | Tỉnh/thành phố |
| `provincevisits` | `(userId, provinceId)` unique | Trạng thái user × tỉnh |
| `placevisits` | `(userId, trekkingPlaceId)` unique, `(userId, lastVisitedAt)` | Lịch sử địa điểm |
| `milestonecheckins` | `(journeyId, milestoneId, userId)` unique, `(clientCheckinId, userId)` partial | Check-in GPS |

> **Lưu ý:** Không có foreign key vật lý giữa databases. Các ID (`trekkingPlaceId`, `journeyId`) là logical references — string identifiers từ trekking-service.

---

## 🧪 Chạy Tests

```bash
# Tất cả tests (45 tests)
npm test

# Chỉ integration tests
npm run test:integration

# Coverage report
npm run test:coverage

# Lint
npm run lint
npm run lint:fix
```

Tests sử dụng **mongodb-memory-server** — không cần MongoDB thật khi test.

### Kết quả hiện tại

```
Test Suites: 3 passed, 3 total
Tests:       45 passed, 45 total

✓ health.test.js       (1 test)
✓ checkin.test.js      (25 tests) — online checkin, offline sync, auth, GPS validation
✓ visit.test.js        (19 tests) — province/place visits, summary, manual mark
```

---

## 📡 API Endpoints

### Check-in

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| `POST` | `/api/v1/checkins` | 🔒 | Tạo check-in online |
| `POST` | `/api/v1/checkins/sync` | 🔒 | Đồng bộ offline check-ins (idempotent) |
| `GET`  | `/api/v1/checkins/me` | 🔒 | Lịch sử check-in (filter + pagination) |
| `GET`  | `/api/v1/checkins/me/recent` | 🔒 | Check-in gần đây |
| `GET`  | `/api/v1/checkins/:checkinId` | 🔒 | Chi tiết một check-in (chỉ chủ sở hữu) |
| `GET`  | `/api/v1/journeys/:journeyId/checkins` | 🔒 | Check-in trong một Journey |

### Visits

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| `GET`  | `/api/v1/visits/me/summary` | 🔒 | Tổng hợp số liệu (tỉnh, địa điểm, check-in) |
| `GET`  | `/api/v1/visits/provinces/me` | 🔒 | Danh sách tỉnh đã đánh dấu |
| `PATCH`| `/api/v1/visits/provinces/me/:provinceId` | 🔒 | Tick/bỏ tick tỉnh thủ công |
| `GET`  | `/api/v1/visits/provinces/me/:provinceId` | 🔒 | Chi tiết trạng thái một tỉnh |
| `GET`  | `/api/v1/visits/places/me` | 🔒 | Danh sách địa điểm đã đến (pagination) |
| `GET`  | `/api/v1/visits/places/me/recent` | 🔒 | Địa điểm gần đây (Home screen) |
| `GET`  | `/api/v1/visits/places/me/:placeId` | 🔒 | Trạng thái visit một địa điểm |

### Health

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| `GET`  | `/health` | — | Health check |

> 📄 Tài liệu đầy đủ: [`../../docs/checkin-service-api.md`](../../docs/checkin-service-api.md)  
> 🔍 Swagger UI interactive: `http://localhost:3002/api-docs`

---

## 🔌 Mock vs HTTP TrekkingProvider

CheckIn Service cần metadata của milestone (location, bán kính, placeId...) từ trekking-service, nhưng trekking-service **chưa được triển khai**. Service dùng abstraction layer để giải quyết vấn đề này.

### Hiện tại: MockTrekkingProvider (mặc định)

```env
TREKKING_PROVIDER=mock
```

Đọc dữ liệu từ `src/mocks/milestones.json`. Không cần network call. Thích hợp cho development và test.

**Thêm milestone mới vào mock:**

```json
// src/mocks/milestones.json
[
  {
    "milestoneId": "milestone_your_new_summit",
    "trekkingRouteId": "route_your_route_01",
    "trekkingPlaceId": "place_your_place",
    "provinceId": "<ObjectId của Province trong DB>",
    "name": "Đỉnh Núi Mới",
    "type": "SUMMIT",
    "location": {
      "type": "Point",
      "coordinates": [105.123, 21.456]
    },
    "checkinRadiusMeters": 50,
    "qualifiesPlaceVisit": true
  }
]
```

### Khi trekking-service sẵn sàng: HttpTrekkingProvider

```env
TREKKING_PROVIDER=http
TREKKING_SERVICE_URL=http://trekking-service:3003
TREKKING_HTTP_TIMEOUT_MS=5000
```

`HttpTrekkingProvider` sẽ gọi:

```
GET {TREKKING_SERVICE_URL}/internal/v1/milestones/:milestoneId/checkin-context
```

**Không cần thay đổi bất kỳ business logic nào** — chỉ đổi biến môi trường.

### Tự implement Provider khác

```javascript
// src/providers/trekking/MyCustomProvider.js
const TrekkingProvider = require('./TrekkingProvider');

class MyCustomProvider extends TrekkingProvider {
  // eslint-disable-next-line require-await
  async getMilestoneCheckinContext(milestoneId) {
    // trả về object hoặc null nếu không tìm thấy
    return {
      milestoneId,
      trekkingRouteId: '...',
      trekkingPlaceId: '...',
      provinceId: '...',
      name: '...',
      type: 'SUMMIT',
      location: { type: 'Point', coordinates: [lng, lat] },
      checkinRadiusMeters: 50,
      qualifiesPlaceVisit: true,
    };
  }
}

module.exports = MyCustomProvider;
```

Đăng ký trong `src/providers/trekking/index.js`.

---

## 🔐 Authentication

CheckIn Service **không** gọi auth-service để verify token ở mỗi request.  
Nó tự verify JWT bằng `JWT_SECRET` dùng chung.

```
Authorization: Bearer <accessToken>
```

**Middleware `auth.js` làm gì:**
1. Lấy token từ `Authorization` header.
2. `jwt.verify(token, JWT_SECRET)` — decode payload.
3. Normalize thành `req.user = { userId, role, email }`.
   - `userId` lấy từ `payload.sub` → `payload.id` → `payload.userId` (tương thích auth-service).
4. `req.user.userId` được dùng xuyên suốt — client không thể inject.

---

## 🛡️ Bảo mật

| Cơ chế | Mô tả |
|--------|-------|
| **stripUnknown** | Validator tự động loại bỏ các field client inject (`userId`, `placeId`, `provinceId`, ...) |
| **Server-side metadata** | `placeId`, `provinceId`, `radius`, `milestoneType`, tọa độ milestone → luôn lấy từ TrekkingProvider |
| **Duplicate index** | `(journeyId, milestoneId, userId)` unique ngăn race condition tạo duplicate |
| **Idempotency** | `(clientCheckinId, userId)` partial index — retry offline sync không tạo bản ghi mới |
| **GPS validation** | Cả accuracy lẫn radius check đều xử lý server-side |

---

## 📄 Documentation

| Tài liệu | Link |
|---------|------|
| API Reference (Markdown) | [`docs/checkin-service-api.md`](../../docs/checkin-service-api.md) |
| Swagger UI (interactive) | `http://localhost:3002/api-docs` |
| OpenAPI spec | `GET http://localhost:3002/api-docs/swagger.json` |

---

## 🔄 CI/CD

Pipeline tự động chạy khi có thay đổi trong `services/checkin-service/`:

```
Push / Pull Request
       │
       ▼
  ┌─── test ──────────────────────────────────────────┐
  │  ESLint → Integration Tests (45) → Coverage       │
  │  → npm audit (high CVEs)                          │
  └───────────────────────────────────────────────────┘
       │ (pass)
       ▼
  ┌─── docker ────────────────────────────────────────┐
  │  Build Image → Trivy Scan (CRITICAL + HIGH CVEs)  │
  └───────────────────────────────────────────────────┘
```

---

## 🗺️ Roadmap

- [x] GPS check-in với Haversine validation
- [x] Offline sync (batch + idempotency)
- [x] PlaceVisit tracking (visitCount per journey logic)
- [x] ProvinceVisit tracking (manual + verified, no downgrade)
- [x] TrekkingProvider abstraction (mock → http)
- [x] Integration tests 45/45
- [x] Swagger/OpenAPI documentation
- [ ] Kết nối trekking-service thật (đổi `TREKKING_PROVIDER=http`)
- [ ] Seed dữ liệu 63 tỉnh/thành phố vào `provinces` collection
- [ ] Journey validation (kiểm tra journeyId thuộc về user)
