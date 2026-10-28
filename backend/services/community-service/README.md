# Community service — TrekVN

Node 22, Express, Mongoose; port **3004**, database riêng **community_db**.
Code tổ chức theo `routes → validators/controller → service → repository/models`;
`providers/` gọi auth/trekking, `realtime/` quản lý WebSocket và Redis fan-out.

## Chạy local

```powershell
cd backend/services/community-service
npm ci
Copy-Item .env.example .env
# Điền MONGODB_URI, JWT_SECRET, TREKVIET_INTERNAL_TOKEN trước khi chạy.
npm run dev
```

- MongoDB **Atlas hoặc replica set** là bắt buộc để ghi transaction; MongoDB standalone sẽ bị từ chối ngay lúc startup. Nếu chạy MongoDB local, khởi động với `--replSet rs0`, gọi `rs.initiate()`, rồi dùng URI trong `.env.example`.
- `JWT_SECRET` phải giống auth-service. `MONGODB_URI` phải trỏ đúng database community, không dùng chung database auth/trekking.
- `AUTH_SERVICE_URL` phục vụ xác minh phiên WebSocket và tra tên/avatar qua `/internal/v1/users/lookup`. Điền cùng `TREKVIET_INTERNAL_TOKEN` như auth-service để có tên/avatar. Khi lookup lỗi, bài vẫn trả về với tên `Trekker`; email không được đưa vào response.
- `TREKKING_SERVICE_URL` kiểm tra quyền sở hữu journey và địa điểm được gắn thẻ. Không đọc trực tiếp DB của service khác.
- Gateway: cấu hình `COMMUNITY_SERVICE_URL=http://localhost:3004` (production dùng địa chỉ private của service).
- HTTP: `http://localhost:3000/api/v1/posts`; WS: `ws://localhost:3000/api/v1/community/ws`.
- Swagger trực tiếp: `http://localhost:3004/api-docs`; JSON: `/api-docs.json`; probes: `/health`, `/ready`; Prometheus: `/metrics` (`METRICS_TOKEN` tùy chọn).
- Với nhiều instance, tất cả phải cùng `REDIS_URL` và `COMMUNITY_REDIS_CHANNEL`. Redis chỉ chuyển invalidation; MongoDB là nguồn dữ liệu chính. Không cần sticky session cho giao thức WebSocket thuần này.

## App Flutter

App đã nối feed, đăng/sửa/xóa bài, ảnh, chọn public/private, gắn địa điểm hoặc hành trình của mình, like, bình luận/reply và sửa/xóa bình luận vào API. Chủ bài được xóa bình luận trên bài của mình. Menu theo tài khoản thật; ẩn tác giả áp dụng cho tất cả bài của tác giả trong phiên xem và có hoàn tác. Nút chia sẻ sao chép nội dung/URL ảnh vào clipboard. Không dùng dữ liệu mẫu khi API lỗi.

Khi sửa bài, ảnh cũ được giữ nguyên URL; chỉ ảnh mới cần upload. Gỡ hành trình sẽ xóa liên kết journey/place và đưa bài về `NORMAL`. Bộ chọn chỉ liệt kê hành trình đã đồng bộ từ server. App đóng socket khi về nền, mở lại và refetch khi resume; logout hủy socket và bỏ các response đang chờ để không phục hồi dữ liệu phiên cũ.

```powershell
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1 --dart-define=COMMUNITY_BASE_URL=http://10.0.2.2:3000/api/v1 --dart-define=TREKKING_BASE_URL=http://10.0.2.2:3000/api/v1
```

WS URL tự suy ra từ `COMMUNITY_BASE_URL` (https → wss). `COMMUNITY_BASE_URL` mặc định bằng `API_BASE_URL`; không phải cấu hình thêm cho deployment qua gateway. Upload ảnh gọi trekking `/uploads/presign` với purpose `COMMUNITY_POST`, rồi upload trực tiếp Cloudinary. Trekking phải có credentials Cloudinary đã dùng cho các loại upload khác.

## Kiểm thử và contract

```powershell
npm run lint
npm run test:ci
# Kiểm tra xuyên gateway sau khi npm ci tại cả api-gateway và community-service:
npm run test:e2e
# Từ backend/:
node scripts/export-contracts.js community-service
```

Integration tests tự tạo replica set MongoDB tạm, không dùng DB trong `.env`.
`test:e2e` chạy gateway và community thật trên port tạm, MongoDB replica set tạm, auth HTTP contract stub cục bộ; xác nhận ghi REST qua gateway rồi nhận event trên WebSocket qua gateway. Không gọi auth production, không kiểm tra upload Cloudinary thực tế. Bộ `test:ci` độc lập và không cần cài dependency của gateway.
Lần đầu mongodb-memory-server tải test binary; có thể đặt `MONGOMS_DOWNLOAD_DIR` hoặc `MONGOMS_SYSTEM_BINARY` khi môi trường CI hạn chế network.

API, quyền và giao thức WS: [community-service-api.md](../../docs/community-service-api.md).
DB vật lý được xuất ở [community-service.dbml](../../docs/database/runtime/community-service.dbml).

## Giới hạn phạm vi

`BADGE_SHARE` là loại nội dung như DBML ban đầu, chưa có badge attachment hay quy trình xác thực huy hiệu. Nhóm/chat, report và admin moderation dashboard chưa có trong thiết kế DB này. Nút báo cáo hiện thông báo rõ chưa khả dụng; không hiển thị báo cáo thành công giả.

Realtime là thông báo best effort, không lưu hàng đợi replay. Sau reconnect, app đọc lại REST để lấy trạng thái hiện tại; Redis gián đoạn vẫn cho phép ghi DB và broadcast trong instance hiện tại. Cần refresh hoặc reconnect để bù thông báo bỏ lỡ giữa các instance.
