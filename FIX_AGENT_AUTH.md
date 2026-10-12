# 🔧 Fix Agent-Service Authentication - Implementation Guide

## 📋 Tóm tắt các thay đổi

### ✅ Đã sửa:

1. **agent-service/app/clients/*.py** - Bỏ `Authorization: Bearer` header, chỉ gửi `X-Service-Token`
2. **auth-service/.env** - Thêm `TREKVIET_INTERNAL_TOKEN` variable
3. **auth-service/src/middlewares/authenticateService.js** - Hỗ trợ cả 2 tên env variable
4. **auth-service/src/routes/admin.routes.js** - Thêm endpoint `/admin/statistics`

## 🚀 Các bước thực hiện

### Bước 1: Restart Auth Service

```powershell
# Từ thư mục Backend-TrekVN/services/auth-service
npm start
# hoặc nếu dùng nodemon:
npm run dev
```

**Kiểm tra log startup:**
```
[Auth-Service] SERVICE_TOKEN configured: true
[Auth-Service] TREKVIET_INTERNAL_TOKEN configured: true
```

### Bước 2: Restart Agent Service

```powershell
# Từ thư mục Backend-TrekVN/services/agent-service

# Kích hoạt virtual environment (nếu có)
.\.venv\Scripts\Activate.ps1

# Chạy service
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Bước 3: Test Service-to-Service Authentication

```powershell
# Từ thư mục Backend-TrekVN
.\test_service_auth.ps1
```

**Expected Output:**
```
=== Testing Service-to-Service Authentication ===

[1] Testing auth-service /admin/statistics...
✓ SUCCESS
Response: { "success": true, "data": { ... } }

[2] Testing auth-service /admin/dashboard...
✓ SUCCESS
Total Users: 10

[3] Testing trekking-service /admin/trekking/places...
✓ SUCCESS
Total Places: 25

[4] Testing auth-service /admin/ranks...
✓ SUCCESS
Ranks Count: 5

=== Test Complete ===
```

### Bước 4: Test từ Web-Admin

1. Mở Web-Admin-TrekVN
2. Login với tài khoản ADMIN
3. Vào trang Assistant (Agent)
4. Gửi câu hỏi test:
   - "Cho tôi biết thống kê người dùng"
   - "Hiển thị danh sách các địa điểm trekking"
   - "Có bao nhiêu user trong hệ thống?"

**Expected:** Agent có thể trả lời dựa trên dữ liệu thực từ APIs

### Bước 5: Kiểm tra Log

**Agent-service log (không còn 401):**
```
2026-10-06 10:00:00 [INFO] httpx: HTTP Request: GET http://localhost:3001/api/v1/admin/statistics "HTTP/1.1 200 OK"
2026-10-06 10:00:00 [INFO] app.assistant.tools: tool_call service=auth tool=get_user_statistics endpoint=get_user_statistics duration_ms=45 status=ok result_count=1
```

**Trekking-service log:**
```
2026-10-06 10:00:00 [INFO] GET /api/v1/admin/trekking/places 200 - 52ms
```

## 🔍 Troubleshooting

### Vấn đề: Vẫn còn 401 Unauthorized

**Nguyên nhân có thể:**
1. Service chưa restart → **Giải pháp:** Restart lại service
2. Env file chưa được load → **Giải pháp:** Kiểm tra file `.env` có đúng vị trí không
3. Cache cũ → **Giải pháp:** Clear cache và restart

**Kiểm tra:**
```powershell
# Check auth-service có nhận được env không
curl -H "X-Service-Token: f3fd5a051bcb5274e4ee3982eeb876664a3ef1af9e0a18094d20e6233d082332e91679fb77ed3fc17b009228423093c8" http://localhost:3001/api/v1/admin/dashboard
```

### Vấn đề: Statistics endpoint trả empty data

**Nguyên nhân:** Database chưa có dữ liệu
**Giải pháp:** Kiểm tra MongoDB connection và seed data nếu cần

### Vấn đề: Agent không call API

**Kiểm tra:**
1. LLM provider có hoạt động không? (Groq rate limit?)
2. Tool definitions có đúng không?
3. Agent có permission gọi tools không?

**Debug:**
```python
# Trong agent-service, thêm log
logger.info(f"Headers being sent: {self._headers()}")
```

## 📝 Các file đã thay đổi

```
Backend-TrekVN/
├── services/
│   ├── agent-service/
│   │   └── app/clients/
│   │       ├── auth_client.py          ✓ MODIFIED
│   │       ├── trekking_client.py      ✓ MODIFIED
│   │       └── checkin_client.py       ✓ MODIFIED
│   │
│   └── auth-service/
│       ├── .env                         ✓ MODIFIED
│       ├── src/middlewares/
│       │   └── authenticateService.js   ✓ MODIFIED
│       └── src/routes/
│           └── admin.routes.js          ✓ MODIFIED
│
└── test_service_auth.ps1                ✓ CREATED
```

## ✅ Verification Checklist

- [ ] Auth-service đã restart và load TREKVIET_INTERNAL_TOKEN
- [ ] Agent-service đã restart
- [ ] Test script `test_service_auth.ps1` chạy thành công (4/4 tests pass)
- [ ] Web-Admin có thể login
- [ ] Agent Assistant trong Web-Admin có thể gọi được tools
- [ ] Logs không còn hiện 401 errors
- [ ] Agent có thể trả lời câu hỏi về user statistics
- [ ] Agent có thể trả lời câu hỏi về trekking places

## 🎯 Next Steps

### 1. Monitoring (Khuyến nghị)
- Thêm metrics cho service-to-service auth failures
- Setup alerting cho 401 errors
- Track API latency

### 2. Security Hardening (Production)
- Rotate `TREKVIET_INTERNAL_TOKEN` thành random strong token
- Không commit token vào git
- Dùng secrets management (AWS Secrets Manager, Azure Key Vault, etc.)
- Implement token rotation mechanism

### 3. Documentation Update
- Document service-to-service authentication pattern
- Update API documentation với authentication requirements
- Thêm examples vào Postman collection

### 4. Testing
- Viết integration tests cho service auth
- Thêm E2E tests cho agent workflows
- Load testing để verify performance

## 📚 References

- [Báo cáo phân tích chi tiết](./AGENT_AUTH_ISSUE_REPORT.md)
- [Auth Service API Docs](./docs/auth-service-api.md)
- [Agent Service Architecture](./docs/agent/architecture.md)
- [Security Guidelines](./docs/agent/security.md)

---

**Ngày tạo:** 2026-10-06  
**Người thực hiện:** Kiro AI  
**Status:** ✅ READY TO TEST
