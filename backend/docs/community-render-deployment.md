# Community: kiểm tra API FE và cấu hình Render

Kiểm tra tại workspace ngày 2026-10-29:

- `community-service`: lint qua, 33 tests qua; line coverage 95,47% (bao gồm kiểm duyệt Admin).
- `npm run test:e2e`: qua. Gateway và community thật, MongoDB replica set tạm; auth là HTTP contract stub cục bộ.
- Flutter `test/community`: gồm API, phân quyền thao tác UI, quyền riêng tư, sửa/xóa, reconnect, lifecycle và tombstone bình luận bị ẩn.
- Kiểm tra này xác nhận code/contract tại local. Cần smoke test sau deploy để xác nhận URL, secrets, MongoDB Atlas, mạng giữa service và upload Cloudinary thực tế.

## 1. Tạo service trên Render

Với repository gốc là `Backend-TrekVN`:

| Cài đặt | Giá trị |
|---|---|
| Loại service | Web Service |
| Runtime | Node nếu chạy bằng npm; Docker nếu dùng Dockerfile |
| Root Directory | `backend/services/community-service` |
| Build Command (Node) | `npm ci --omit=dev --ignore-scripts --no-audit --no-fund` |
| Start Command (Node) | `npm start` |
| Health Check Path | `/ready` |
| Node version (Node runtime) | `NODE_VERSION=22` |
| Dockerfile (Docker runtime, trong root trên) | `Dockerfile` |

Dockerfile đã có CMD `node src/index.js`; không đặt Docker Command thành `npm start` vì runtime image đã loại npm. Nếu kết nối Render với repository tổng `TrekVN`, root directory phải thêm `Backend-TrekVN/` phía trước.

Server dùng biến `PORT` do Render cấp, fallback local 3004. Không cần cấu hình cổng WebSocket riêng: HTTP và WS dùng cùng server.

## 2. Environment của community-service

```dotenv
NODE_ENV=production
NODE_VERSION=22
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/community_db?<options>
JWT_SECRET=<giống auth-service>
TREKVIET_INTERNAL_TOKEN=<giống auth-service>
AUTH_SERVICE_URL=<origin trực tiếp của auth-service>
TREKKING_SERVICE_URL=<origin trực tiếp của trekking-service>
ALLOWED_ORIGINS=<origin FE web nếu có, phân cách bằng dấu phẩy>
WS_SESSION_CHECK_MS=60000
WS_MAX_CONNECTIONS=1000
```

- `AUTH_SERVICE_URL`, `TREKKING_SERVICE_URL`: bắt buộc đặt đúng khi deploy; giá trị mặc định localhost chỉ dành cho chạy local. Dùng origin đầy đủ có `https://` hoặc `http://`, **không thêm `/api/v1`**.
- Auth URL phải tới **auth-service trực tiếp**, không dùng Gateway: community còn gọi `/internal/v1/users/lookup` để lấy tên/avatar, còn Gateway không expose internal API.
- MongoDB phải là Atlas/replica set, database riêng `community_db`; tài khoản DB cần quyền đọc/ghi, tạo collection/index, và cấu hình Atlas Network Access để Render kết nối được.
- `TREKVIET_INTERNAL_TOKEN` cần khớp auth-service; thiếu/sai token lookup thì API vẫn trả bài nhưng tác giả sẽ có tên fallback `Trekker`.
- `ALLOWED_ORIGINS` là origin giao diện **trình duyệt**, ví dụ `https://admin.example.com`, không kèm path và không phải URL backend. Flutter Android/iOS không gửi browser Origin khi mở socket.
- `METRICS_TOKEN`: đặt nếu expose `/metrics` ra public. `TRUSTED_PROXIES`: cấu hình theo reverse proxy thực tế, tránh bật trust toàn bộ theo phỏng đoán.
- `REDIS_URL` để trống nếu chạy một instance. Nếu chạy nhiều instance, cấu hình cùng Redis/channel để các client nhận event giữa instance.

**Render Free:** service Free không nhận private network traffic. Nếu auth, trekking hoặc community chạy Free, dùng URL HTTPS công khai của service đích, ví dụ `https://<tên-thực-tế>.onrender.com`. Với service hỗ trợ private network cùng workspace/region, lấy chính xác Internal URL trong Connect, gồm protocol và port. Không tự dùng hostname private của service Free.

## 3. Deploy/cập nhật các service liên quan

### CI/CD qua GitHub Actions

Community dùng cùng pipeline với các service còn lại: lint, test/coverage, Trivy, Sonar Quality Gate, build/scan Docker và publish GHCR. Khi push `main`, sau khi CI thành công, job Render triển khai đúng commit đã kiểm tra nếu community có thay đổi. Pull request và push `develop` chỉ chạy CI. `workflow_dispatch` chạy kiểm tra toàn bộ service, không triển khai Render.

Repository secrets dành cho Community:

- `RENDER_COMMUNITY_SERVICE_ID`: service ID trên Render, dạng `srv-...`.
- `RENDER_COMMUNITY_SERVICE_KEY`: Render API key có quyền deploy service đó.

Workflow truyền hai secret này vào reusable Render job dưới tên `RENDER_SERVICE_ID` và `RENDER_API_KEY`. Dùng chung `SMTP_USERNAME`, `SMTP_PASSWORD`, `NOTIFY_EMAIL` cho thông báo kết quả như các service khác. Các biến môi trường runtime trong mục 2 vẫn phải được cấu hình ở Render. Tắt Auto-Deploy trực tiếp của Render để deployment chỉ chạy sau khi CI qua.

### Các service cần cập nhật

1. Community-service với cấu hình ở trên.
2. Gateway: deploy bản có REST proxy và HTTP upgrade WebSocket; đặt `COMMUNITY_SERVICE_URL=<origin community-service>` rồi redeploy Gateway.
3. Trekking-service: deploy bản hỗ trợ `purpose=COMMUNITY_POST` ở `/api/v1/uploads/presign`; credentials Cloudinary phải hợp lệ.
4. Auth-service cần có `/api/v1/auth/verify` và `/internal/v1/users/lookup` như code hiện tại, cùng JWT/internal token như trên.

Chỉ deploy community mà không cấu hình Gateway sẽ khiến app vẫn gọi upstream localhost mặc định và nhận lỗi kết nối.

## 4. Contract đối với Flutter hiện tại

| Tác vụ FE | API qua Gateway | Trạng thái |
|---|---|---|
| Feed, phân trang, lọc cá nhân/hành trình | `GET /api/v1/posts` | Đã khớp |
| Đăng/sửa/xóa bài, public/private, ảnh | `POST /posts`, `PUT/PATCH/DELETE /posts/:id` dưới `/api/v1` | Đã khớp |
| Like/unlike bài | `POST/DELETE /api/v1/posts/:id/like` | Đã khớp, idempotent |
| Bình luận/reply | `GET/POST /api/v1/posts/:id/comments` | Đã khớp, có root/parent ID |
| Sửa/xóa/like bình luận | `PUT/DELETE /comments/:id`, `POST/DELETE /comments/:id/like` dưới `/api/v1` | Đã khớp |
| Chọn địa điểm/hành trình | `GET /api/v1/places`, `GET /api/v1/journeys` | Dùng trekking-service qua Gateway |
| Upload ảnh | `POST /api/v1/uploads/presign`, purpose `COMMUNITY_POST` | Dùng trekking + Cloudinary |
| Real-time | `wss://<gateway>/api/v1/community/ws` | Auth frame đầu, reconnect, refetch REST |

Response danh sách là `{success:true,data:{items,total,page,limit,totalPages}}`; FE đã parse `postId`, `commentId`, author, counter và `isLiked`. Tombstone bình luận được redact và hiển thị nhãn đã xóa. Tên địa điểm đầy đủ (`trekPlaceName`) chưa được enrich trong response; UI có nhãn fallback, không ảnh hưởng parse API.

Build app với Gateway URL (dùng tên host thực tế):

```powershell
flutter build apk --dart-define=APP_ENV=production --dart-define=API_BASE_URL=https://<gateway>.onrender.com/api/v1 --dart-define=COMMUNITY_BASE_URL=https://<gateway>.onrender.com/api/v1 --dart-define=TREKKING_BASE_URL=https://<gateway>.onrender.com/api/v1 --dart-define=CHECKIN_BASE_URL=https://<gateway>.onrender.com/api/v1
```

Không dùng `/api/v1/trekking` hay `/api/v1/checkin`: Gateway hiện route bằng `/places`, `/journeys`, `/checkins`, `/visits` trực tiếp dưới `/api/v1`.
`COMMUNITY_BASE_URL` mặc định bằng `API_BASE_URL`; WS URL tự đổi https thành wss. FE tích hợp cần được build từ source hiện tại; APK cũ dùng mock sẽ không tự thay đổi khi chỉ deploy backend.

## 5. Smoke test sau khi Render báo Live

1. Community `GET /health` và `/ready` trả 200; `/ready` xác nhận DB connected.
2. Qua Gateway, `GET /api/v1/posts` không token phải trả 401. Dùng access token từ đăng nhập bình thường, request trả 200 với đúng `data.items`.
3. Từ app: tạo bài chữ, sửa, like/unlike, thêm bình luận/reply, xóa. Mở hai phiên để kiểm tra counter và sự kiện cập nhật.
4. Đăng bài riêng tư: tài khoản khác không thấy trong feed và đọc chi tiết trả 404.
5. Thêm ảnh và gắn hành trình: kiểm tra presign/upload Cloudinary và việc xác minh journey qua trekking-service.
6. WebSocket qua Gateway phải nhận `ready` sau frame `{"type":"auth","token":"<accessToken>"}` rồi nhận sự kiện khi tạo bài/bình luận. Không truyền token vào query URL.

## 6. Web Admin quản lý bài viết/bình luận

Triển khai lại **community-service và api-gateway** từ source có `/api/v1/admin/community`, sau đó build/deploy Web Admin. Không chỉ deploy giao diện: Gateway hoặc Community cũ sẽ trả 404.

Web Admin dùng cấu hình build:

```dotenv
VITE_API_MODE=real
VITE_API_BASE_URL=https://api-gateway-trekvn.onrender.com
VITE_API_VERSION=v1
```

`VITE_API_BASE_URL` là origin Gateway, **không thêm `/api/v1`** vì axios client tự ghép. Cho phép origin Web Admin ở `ALLOWED_ORIGINS` của Gateway; Community cần `AUTH_SERVICE_URL` trực tiếp để kiểm tra quyền ADMIN. MongoDB model mới tự tạo collection `moderation_logs` và indexes khi khởi động; bản ghi cũ không có `hidden` được xem là đang hiển thị, không cần sửa dữ liệu thủ công.

Đăng nhập bằng tài khoản ADMIN thật → `/community`: xem bài/bình luận, tìm kiếm/lọc, mở chi tiết và thao tác ẩn/hiện lại trên nội dung thử nghiệm có thể khôi phục. Mọi thao tác yêu cầu lý do, hiển thị lỗi nếu API từ chối. Xác nhận USER bị 403, thiếu token bị 401; app nhận invalidation sau thao tác. Xóa là redact không khôi phục, chỉ kiểm thử trên dữ liệu dành riêng cho test. Lịch sử nằm trong chi tiết bài, không nằm trong trang audit logs chung.

Nhóm/chat/report và badge attachment có xác minh chưa thuộc phạm vi triển khai. Realtime là invalidation best effort; sau reconnect FE đọc lại REST để bù event bị lỡ. Các test local chưa thay thế việc kiểm tra tải thực tế trên gói Render đã chọn.

Tham khảo chính thức Render: [Node/Express](https://render.com/docs/deploy-node-express-app), [Node version](https://render.com/docs/node-version), [WebSocket](https://render.com/docs/websocket), [private network](https://render.com/docs/private-network), [health checks](https://render.com/docs/health-checks).
