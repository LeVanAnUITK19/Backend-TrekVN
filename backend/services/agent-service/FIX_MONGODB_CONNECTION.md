# Fix MongoDB Connection Timeout

## Vấn đề
```
pymongo.errors.NetworkTimeout: ac-1lrljkw-shard-00-01.8st9rdb.mongodb.net:27017: 
timed out (configured timeouts: connectTimeoutMS: 5000.0ms)
```

Agent service không thể kết nối MongoDB Atlas, gây crash khi startup.

## Nguyên nhân

1. **IP Whitelist** - IP hiện tại chưa được thêm vào MongoDB Atlas
2. **Firewall/Antivirus** - Chặn port 27017 (MongoDB)
3. **Network issue** - DNS không resolve được hoặc mạng không ổn định

## Giải pháp

### Option 1: Fix MongoDB Atlas IP Whitelist (Recommended)

1. Đăng nhập MongoDB Atlas: https://cloud.mongodb.com/
2. Chọn cluster: `Cluster0`
3. Vào **Network Access** (menu bên trái)
4. Click **Add IP Address**
5. Chọn:
   - **Add Current IP Address** (nếu IP tĩnh)
   - **Allow Access from Anywhere** (0.0.0.0/0) - CHỈ dùng cho dev/testing

6. Chờ 1-2 phút để MongoDB apply changes
7. Restart agent service

### Option 2: Dùng Local MongoDB (Cho dev)

1. Cài MongoDB Community Edition:
   ```powershell
   # Download từ: https://www.mongodb.com/try/download/community
   # Hoặc dùng chocolatey:
   choco install mongodb
   ```

2. Start MongoDB service:
   ```powershell
   net start MongoDB
   ```

3. Cập nhật `.env`:
   ```env
   AGENT_MONGODB_URI=mongodb://localhost:27017
   AGENT_MONGODB_DB=trekviet_agent
   ```

4. Restart agent service

### Option 3: Tăng timeout (Temporary fix)

Nếu mạng chậm, tăng timeout trong `.env`:
```env
AGENT_MONGODB_URI=mongodb://localhost:27017/trekviet
```

**Lưu ý:** Đây chỉ là giải pháp tạm thời nếu mạng chậm.

### Option 4: Check Firewall/Antivirus

1. Tắm tạm thời antivirus để test
2. Check Windows Firewall:
   ```powershell
   # Test connection
   Test-NetConnection -ComputerName cluster0.8st9rdb.mongodb.net -Port 27017
   ```

3. Nếu không connect được → thêm rule cho port 27017

## Verify Connection

Sau khi fix, test lại:

```powershell
# 1. Test network
Test-NetConnection -ComputerName cluster0.8st9rdb.mongodb.net -Port 27017

# 2. Start agent service
cd c:\doan1\TrekVN\Backend-TrekVN\services\agent-service
.venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

Service khởi động thành công khi thấy:
```
[INFO] app.db.mongo: Agent MongoDB connected: db=trekviet_agent
[INFO] app.main: Agent Service started: env=development port=8000
```

## Troubleshooting

### Lỗi vẫn còn sau khi thêm IP?
- Chờ 2-3 phút để MongoDB Atlas apply
- Restart service
- Clear DNS cache: `ipconfig /flushdns`

### Lỗi authentication failed?
- Check username/password trong URI
- Tạo lại user trên MongoDB Atlas với đúng permissions

### Connection intermittent?
- Dùng local MongoDB cho dev
- Hoặc nâng cấp MongoDB Atlas plan (M0 free tier có giới hạn)

## Best Practice

**Development:** Dùng local MongoDB
```env
AGENT_MONGODB_URI=mongodb://localhost:27017
```

**Staging/Production:** Dùng MongoDB Atlas với IP whitelist cụ thể
```env
AGENT_MONGODB_URI=mongodb://localhost:27017/trekviet
```

Không dùng "Allow from Anywhere" (0.0.0.0/0) trên production!
