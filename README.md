<div align="center">

<img src="https://img.shields.io/badge/TrekViệt-Backend-2D7D46?style=for-the-badge&logo=mountain&logoColor=white" alt="TrekViệt Backend" />

# 🏔️ TrekViệt — Backend

**Nền tảng backend microservices cho ứng dụng trekking Việt Nam**

[![Node.js](https://img.shields.io/badge/Node.js-20-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://mongodb.com)
[![Docker](https://img.shields.io/badge/Docker-Containerized-2496ED?style=flat-square&logo=docker&logoColor=white)](https://docker.com)
[![CI](https://img.shields.io/badge/CI-GitHub_Actions-2088FF?style=flat-square&logo=github-actions&logoColor=white)](/.github/workflows)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

</div>

---

## 📖 Giới thiệu

**TrekViệt** là ứng dụng mobile hỗ trợ người dùng khám phá, lên kế hoạch và theo dõi các hành trình trekking trên khắp lãnh thổ Việt Nam — từ những cung đường đèo hùng vĩ ở Tây Bắc đến các cánh rừng nguyên sinh ở Tây Nguyên.

Ứng dụng được thiết kế với triết lý **offline-first**: hoạt động đầy đủ trong điều kiện mạng yếu hoặc mất kết nối hoàn toàn, đảm bảo người dùng luôn có thể ghi lại từng bước chân của mình dù ở giữa vùng núi không có sóng.

### ✨ Tính năng nổi bật

| Tính năng | Mô tả |
|-----------|-------|
| 🗺️ **Bản đồ Offline** | Tải trước bản đồ MBTiles, hoạt động không cần Internet |
| 📍 **GPS Tracking** | Ghi lại toàn bộ lộ trình bằng GPS theo thời gian thực |
| 🏁 **Check-in Cột mốc** | Xác minh vị trí GPS khi đến từng milestone |
| 🔄 **Backtrack** | Xem lại và đi ngược đường đã đi |
| 🌏 **Bản đồ Tỉnh thành** | Theo dõi số tỉnh/thành đã khám phá trên bản đồ Việt Nam |
| 🏅 **Hệ thống Huy hiệu** | Nhận thành tích theo quãng đường, độ cao, số tỉnh... |
| 👥 **Cộng đồng** | Chia sẻ hành trình, bài viết và tương tác với người dùng khác |
| 🔁 **Đồng bộ Offline** | Lưu check-in và GPS khi mất mạng, đồng bộ tự động khi có kết nối |

---

## 🏗️ Kiến trúc hệ thống

TrekViệt Backend theo mô hình **Microservices**, mỗi service độc lập, giao tiếp qua REST API và được quản lý qua API Gateway.

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT (Flutter)                     │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                       API Gateway                           │
│              (Routing · Auth · Rate Limit)                  │
└────┬──────────────┬──────────────┬──────────────┬───────────┘
     │              │              │              │
     ▼              ▼              ▼              ▼
┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐
│  Auth   │  │ Trekking │  │ Check-in │  │  Community   │
│ Service │  │ Service  │  │ Service  │  │  Service     │
└────┬────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘
     │              │              │              │
     └──────────────┴──────────────┴──────────────┘
                           │
                    ┌──────▼───────┐
                    │  MongoDB     │
                    │  Atlas       │
                    └──────────────┘
```

### Offline-First Flow

```
Flutter App
 ├── SQLite (local)
 │    ├── Cached Routes & Places
 │    ├── GPS Track Points
 │    ├── Offline Check-ins
 │    └── Sync Queue  ──────► Server (khi có mạng)
 └── MBTiles
      └── Offline Maps
```

---

## 📁 Cấu trúc thư mục

```
Backend-TrekVN/
│
├── 📂 services/
│   ├── api-gateway/          # Reverse proxy, routing, rate limiting
│   ├── auth-service/         # Đăng ký, đăng nhập, JWT, OTP
│   ├── trekking-service/     # Địa điểm, cung đường, hành trình, GPS
│   ├── checkin-service/      # Check-in milestone, đồng bộ offline
│   └── community-service/    # Bài viết, bình luận, chia sẻ thành tích
│
├── 📂 docs/                  # API documentation (Swagger/Markdown)
├── 📂 deployment/            # Docker Compose, Kubernetes manifests
├── 📂 infrastructure/        # Terraform, cloud configs
└── 📂 .github/workflows/     # CI/CD pipelines (GitHub Actions)
```

### Auth Service — cấu trúc chi tiết

```
auth-service/
├── src/
│   ├── config/          # Database, Logger, Mailer
│   ├── controllers/     # Request handlers
│   ├── middlewares/     # Auth, Validate, ErrorHandler
│   ├── models/          # Mongoose schemas (User, RefreshToken, OTP...)
│   ├── repositories/    # Data access layer
│   ├── routes/          # Express route definitions
│   ├── services/        # Business logic
│   ├── utils/           # Helpers, email templates, error classes
│   └── validators/      # Joi validation schemas
└── tests/
    ├── integration/     # Supertest + mongodb-memory-server
    ├── unit/
    └── setup/
```

---

## 🛠️ Công nghệ sử dụng

<table>
<tr>
<td valign="top" width="50%">

**📱 Mobile**
- Flutter / Dart
- SQLite (offline storage)
- MapLibre + OpenStreetMap
- MBTiles (offline maps)

**⚙️ Backend**
- Node.js 20 + Express.js
- REST API · Microservices
- JWT · bcryptjs · Nodemailer
- Swagger / OpenAPI 3.0

</td>
<td valign="top" width="50%">

**🗄️ Database**
- MongoDB Atlas
- SQLite (client-side)

**🚀 DevOps**
- Docker + Docker Compose
- GitHub Actions (CI/CD)
- Trivy (container security scan)
- npm audit (dependency audit)

**📊 Monitoring**
- Prometheus + Grafana
- Winston (structured logging)

</td>
</tr>
</table>

---

## 🚀 Khởi chạy nhanh

### Yêu cầu

- **Node.js** >= 20
- **Docker** & Docker Compose
- **MongoDB** (Atlas hoặc local)

### 1. Clone & cài đặt

```bash
git clone https://github.com/your-org/Backend-TrekVN.git
cd Backend-TrekVN/services/auth-service

npm install
```

### 2. Cấu hình môi trường

```bash
cp .env.example .env
# Chỉnh sửa .env với thông tin MongoDB, JWT secret, email config...
```

### 3. Chạy development

```bash
npm run dev
# Server khởi động tại http://localhost:3001
# Swagger UI tại  http://localhost:3001/api-docs
```

### 4. Chạy với Docker

```bash
docker build -t trekvn-auth-service .
docker run -p 3001:3001 --env-file .env trekvn-auth-service
```

---

## 🧪 Kiểm thử

```bash
# Tất cả tests
npm test

# Chỉ integration tests (Supertest + in-memory MongoDB)
npm run test:integration

# Coverage report
npm run test:coverage

# Lint
npm run lint
```

---

## 🔄 CI/CD Pipeline

Mỗi service có pipeline GitHub Actions riêng, tự động kích hoạt khi có thay đổi trong thư mục tương ứng.

```
Push / Pull Request
        │
        ▼
  ┌─── test ──────────────────────────────┐
  │  ESLint → Unit Tests → Integration   │
  │  Tests → Coverage → npm audit        │
  └───────────────────────────────────────┘
        │ (pass)
        ▼
  ┌─── docker ────────────────────────────┐
  │  Build Image → Trivy Security Scan   │
  └───────────────────────────────────────┘
```

---

## 📡 API Endpoints (Auth Service)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `POST` | `/api/v1/auth/register` | Đăng ký tài khoản |
| `POST` | `/api/v1/auth/verify-email` | Xác minh email bằng OTP |
| `POST` | `/api/v1/auth/login` | Đăng nhập |
| `POST` | `/api/v1/auth/refresh-token` | Làm mới access token |
| `POST` | `/api/v1/auth/logout` | Đăng xuất |
| `POST` | `/api/v1/auth/forgot-password` | Quên mật khẩu |
| `POST` | `/api/v1/auth/reset-password` | Đặt lại mật khẩu |
| `GET`  | `/api/v1/users/me` | Lấy thông tin người dùng |
| `PATCH`| `/api/v1/users/me` | Cập nhật hồ sơ |
| `GET`  | `/health` | Health check |

> 📄 Tài liệu đầy đủ: [`docs/auth-service-api.md`](docs/auth-service-api.md) hoặc Swagger UI tại `/api-docs`

---

## 🗺️ Roadmap

- [x] Auth Service — Đăng ký, đăng nhập, JWT, OTP, quản lý người dùng
- [ ] Trekking Service — Địa điểm, cung đường, hành trình, GPS tracking
- [ ] Check-in Service — Milestone check-in, offline sync
- [ ] Community Service — Bài viết, bình luận, chia sẻ thành tích
- [ ] API Gateway — Routing, authentication, rate limiting
- [ ] Monitoring — Prometheus + Grafana dashboard
- [ ] Deployment — Docker Compose full stack

---

<div align="center">

Made with ❤️ for the Vietnamese trekking community

</div>
