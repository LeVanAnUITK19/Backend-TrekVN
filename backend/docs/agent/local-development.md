# Local Development

## Prerequisites

- Python 3.11+
- MongoDB 6+ (local hoặc Atlas)
- Node.js 20+ (cho api-gateway và trekking-service)
- (Optional) osmium-tool, tilemaker, gdal cho Map Builder

---

## 1. Clone & setup Python env

```bash
cd Backend-TrekVN/services/agent-service
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
```

---

## 2. Cấu hình .env

```bash
cp .env.example .env
```

Điền tối thiểu:

```env
AGENT_MONGODB_URI=mongodb://localhost:27017
JWT_SECRET=trekvn_jwt_secret_change_in_production   # phải khớp auth-service
AUTH_SERVICE_URL=http://localhost:3001
TREKKING_SERVICE_URL=http://localhost:3003
TREKVIET_INTERNAL_TOKEN=your-internal-token

# Ít nhất một LLM provider
GROQ_ENABLED=true
GROQ_API_KEY=gsk_...
```

---

## 3. Khởi động MongoDB local

```bash
# Dùng Docker (nhanh nhất)
docker run -d -p 27017:27017 --name agent-mongo mongo:7.0
```

Hoặc dùng `docker-compose.dev.yml`:

```bash
docker-compose -f docker-compose.dev.yml up agent-mongodb -d
```

---

## 4. Khởi động Agent Service

```bash
# Development mode với hot-reload
uvicorn app.main:app --reload --port 8000

# Hoặc production mode
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
```

Service sẽ:
- Kết nối MongoDB → fail-fast nếu không connect được
- Tạo indexes idempotently
- Init LLM providers

Kiểm tra: http://localhost:8000/health

---

## 5. Kiểm tra map dependencies (optional)

```bash
python scripts/check_dependencies.py
```

---

## 6. Chạy các service khác

Để test full flow cần auth-service + trekking-service:

```bash
# Terminal 1: auth-service
cd services/auth-service && npm run dev

# Terminal 2: trekking-service
cd services/trekking-service && npm run dev

# Terminal 3: api-gateway
cd services/api-gateway && npm run dev
```

---

## 7. Chạy tests

```bash
cd services/agent-service

# Tất cả tests
pytest

# Một file cụ thể
pytest tests/unit/test_llm_manager.py -v

# Với coverage
pytest --cov=app tests/
```

Tests không cần MongoDB thật — tất cả external calls được mock.

---

## 8. Sample API calls (curl)

### Health check

```bash
curl http://localhost:8000/health
curl http://localhost:8000/health/ready
```

### Lấy token Admin (cần auth-service đang chạy)

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@trekviet.app","password":"your-password"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")
```

### Tạo conversation

```bash
curl -X POST http://localhost:8000/api/v1/assistant/conversations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test chat","provider":"auto"}'
```

### Gửi message

```bash
CONV_ID="<conversationId từ bước trên>"

curl -X POST http://localhost:8000/api/v1/assistant/conversations/$CONV_ID/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hệ thống TrekViet có bao nhiêu service?","provider":"auto"}'
```

### Tạo Place Builder job

```bash
curl -X POST http://localhost:8000/api/v1/place-builder/jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "placeName": "Núi Bà Đen",
    "locationHint": "Tây Ninh",
    "operation": "CREATE"
  }'
```

### Tạo Map Builder job

```bash
curl -X POST http://localhost:8000/api/v1/map-builder/jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "trekkingPlaceId": "YOUR_PLACE_ID",
    "placeName": "Núi Bà Đen",
    "publishTarget": { "type": "PLACE", "targetId": "YOUR_PLACE_ID" },
    "bbox": {
      "minLon": 106.139430,
      "minLat": 11.361570,
      "maxLon": 106.191620,
      "maxLat": 11.412390
    },
    "minZoom": 10,
    "maxZoom": 14
  }'
```

---

## 9. Docker Compose (toàn bộ)

```bash
# Chỉ agent-service + agent-mongodb
docker-compose -f docker-compose.dev.yml up

# Build lại sau khi thay đổi code
docker-compose -f docker-compose.dev.yml up --build
```

---

## Known Limitations & TODO

| Item | Status |
|---|---|
| Map Builder BUILD_TERRAIN / BUILD_CONTOURS / BUILD_HILLSHADE | Skipped — cần DEM source (SRTM/ALOS) |
| provinceId auto-resolve từ locationHint | TODO — cần API checkin-service |
| Geospatial duplicate check (nearby coordinate) | TODO — cần `/nearby` endpoint trên trekking-service |
| Multi-worker support cho background tasks | V1: 1 worker; production cần task queue (Celery/RQ) |
| Full RAG cho Assistant docs | V1: simple keyword search; có thể upgrade lên vector DB |
| service restart không resume in-progress job | V1 limitation — job restart sau khi service restart |
