# Community: hồ sơ, QR, chat cá nhân và nhóm

Source triển khai ngày 29/10/2026. Giữ API bài viết/bình luận cũ; mở rộng trong cùng `community-service`, MongoDB riêng. **Không cần kết bạn**: bất kỳ tài khoản đang hoạt động nào cũng tìm và nhắn cho tài khoản khác. Không có tài khoản/tin nhắn mẫu khi server lỗi.

## Các giao diện

Flutter Community có **Bài viết – Tin nhắn – Cá nhân**. Tab Hành trình cũ được thay bằng Tin nhắn; bài chia sẻ hành trình vẫn xuất hiện trong feed như trước.

- Bài viết: chạm avatar mở trang cá nhân của tác giả. Icon tìm người ở đầu màn dẫn tới tìm email đầy đủ hoặc quét QR.
- Tin nhắn: hội thoại cá nhân/nhóm, số tin chưa đọc, phân trang; tạo nhóm bằng cách chọn người qua email/QR. Bấm hội thoại để đọc/gửi tin chữ. Giữ tin của mình để thu hồi, giữ tin người khác để báo cáo. Tin lỗi giữ bản nháp; bấm gửi lại giữ cùng mã retry nếu nội dung không đổi.
- Cá nhân: tên/avatar lấy từ tài khoản Auth, giới thiệu Community có thể sửa, bài đăng của mình (kể cả PRIVATE), QR và cấp lại QR. Người khác chỉ thấy bài PUBLIC chưa ẩn/xóa, không thấy email hay QR riêng của chủ tài khoản. Trang cá nhân người khác có nút Nhắn tin.
- Nhóm: chủ đổi tên, thêm/mời thành viên ra, chuyển quyền chủ. Thành viên tự rời nhóm. Chủ phải chuyển quyền trước khi rời. Nhóm tối đa 50 người. Thành viên mới hoặc được mời lại chỉ xem tin từ sau lần tham gia hiện tại; người bị mời ra mất quyền đọc/gửi.
- Web Admin `/community` → **Nhóm & báo cáo tin nhắn**: xem metadata nhóm, tạm ngưng/mở lại nhóm; đọc nội dung tin được báo cáo và quyết định gỡ/bỏ qua với lý do. Không có endpoint Admin liệt kê chat riêng hoặc toàn bộ lịch sử tin nhắn.

## Quyền, xác thực, kết nối

Mọi API dưới `/api/v1/community` cần Bearer JWT và **phiên hiện tại** được xác minh trực tiếp với Auth; không chỉ tin role/JWT đã phát. Admin cần ADMIN hiện tại cả ở Gateway và khi gọi thẳng service. Auth gián đoạn trả 503, không bỏ qua kiểm tra quyền. Gateway proxy nguyên `/api/v1/community/**` tới `COMMUNITY_SERVICE_URL`; WebSocket vẫn ở `/api/v1/community/ws`.

`AUTH_SERVICE_URL` phải là origin auth-service trực tiếp. `TREKVIET_INTERNAL_TOKEN` (hoặc alias `SERVICE_TOKEN`) cần đồng nhất giữa Community và Auth. Community gọi **`POST /internal/v1/users/community-lookup`** với `{email}` hoặc `{userIds:[...]}` (1–50 ID), `X-Service-Token`. Auth chỉ tìm email chính xác sau trim/lowercase hoặc ID, lọc status ACTIVE, trả `[{id,name,avatarUrl}]`. Không trả email, hash mật khẩu, bio tài khoản, tokenVersion. Route nội bộ không được expose qua Gateway.

Thông tin công khai là tên, avatar, giới thiệu Community. Email chỉ dùng làm đầu vào tìm kiếm chính xác; không có tìm gần đúng/tra toàn bộ danh bạ. QR là `trekviet://community/user/<48 ký tự hex ngẫu nhiên>`, không chứa email/JWT. Chỉ chủ xem QR tại `/people/me`; người nhận QR phải đăng nhập để resolve. Cấp lại token vô hiệu mã cũ ngay; không ảnh hưởng cuộc trò chuyện đã có. Scanner chỉ nhận đúng scheme/pattern này và không tự mở URL khác.

## API hồ sơ và tìm kiếm

Prefix **`/api/v1/community`**. Thành công HTTP 200 `{success:true,data:...}`; lỗi `{success:false,error:{code,message}}`. ID phải là ObjectId hex 24 ký tự. Unknown body/query bị từ chối. Cache-Control `private, no-store`.

| Method | Path | Request / kết quả |
|---|---|---|
| GET | `/people/me` | Profile của mình + `qr` |
| PATCH | `/people/me` | `{bio}` trim, 0–500 ký tự |
| POST | `/people/me/qr` | Cấp lại, trả `{qr}` |
| GET | `/people/discover?email=...` | Email đầy đủ, tối đa 254 ký tự |
| GET | `/people/discover?qr=...` | QR encode bằng queryParameters/URLSearchParams; không truyền cả email và QR |
| GET | `/people/:userId` | Profile công khai trong quyền người xem |

Profile: `{userId,name,avatarUrl,bio,postCount,isMe,qr?}`. `qr` chỉ có nếu người xem là chủ. `postCount` theo đúng quyền xem; bài của profile dùng **API cũ `GET /api/v1/posts?userId=<id>`**, phân trang `data.items` và cùng bộ lọc privacy/moderation. Tên/avatar thuộc hồ sơ tài khoản Auth, không được ghi đè bằng PATCH Community.

## Hội thoại và thành viên

| Method | Path | Body / hành vi |
|---|---|---|
| GET | `/conversations` | `page=1&limit=20`, tối đa 100, page tối đa 10000 |
| POST | `/conversations/direct` | `{userId}` → lấy/tạo DM duy nhất cho cặp user; cấm tự nhắn chính mình |
| POST | `/conversations/groups` | `{name,memberIds:[...]}`; tên 1–100, 1–49 ID unique; creator tự vào và làm chủ |
| GET | `/conversations/:conversationId` | Chi tiết cho thành viên hiện tại |
| PATCH | `/conversations/:conversationId` | Chủ nhóm: `{name? , ownerId?}`, ít nhất 1 field; chủ mới phải đang là thành viên |
| POST | `/conversations/:conversationId/members` | Chủ nhóm: `{userId}`; thêm lại người đang là thành viên là idempotent |
| DELETE | `/conversations/:conversationId/members/:userId` | Chủ mời ra hoặc chính mình rời nhóm; không sửa thành viên DM |

Danh sách: `{items,total,page,limit,totalPages}`, mới có tin trước (lastMessageAt DESC, _id DESC).

Conversation: `{conversationId,kind:DIRECT|GROUP,name,ownerId,members:[{userId,name,avatarUrl}],sequence,readSequence,unreadCount,disabled,moderationReason,lastMessageAt,createdAt}`. DM dùng tên người còn lại ở UI; `name` DM rỗng. Không gửi message preview trong danh sách. `unreadCount` đếm tin chưa đọc của người khác, bỏ tin đã thu hồi.

## Tin nhắn và retry

| Method | Path dưới `/conversations/:conversationId` | Body / hành vi |
|---|---|---|
| GET | `/messages?limit=50&before=<sequence>` | Mới nhất trước; cursor exclusive, tối đa 100 |
| POST | `/messages` | `{content,clientMessageId}`; nội dung trim 1–4000; mã 8–80 `[a-zA-Z0-9_-]` |
| POST | `/read` | `{sequence}` integer >=0; chỉ tăng, clamp đến sequence mới nhất |
| DELETE | `/messages/:messageId` | Chỉ tác giả và còn là thành viên; redact nội dung, giữ tombstone |
| POST | `/messages/:messageId/report` | Thành viên có quyền đọc tin chưa thu hồi; `{reason}` trim 3–1000 |

Message: `{messageId,conversationId,senderId,sequence,clientMessageId,content,deleted,createdAt}`. GET trả `{items:[Message],nextBefore:number|null}`. Lấy trang tiếp theo bằng nextBefore; client sắp xếp sequence tăng khi vẽ danh sách. Thu hồi trả `deleted:true,content:""`, giữ sequence. Không khôi phục nội dung đã thu hồi.

Sequence cấp và ghi tin trong cùng transaction với write fence trên conversation; thay đổi thành viên, read cursor, disable nhóm và thu hồi cũng dùng fence này. Compound unique `(conversationId,senderId,clientMessageId)` chặn gửi trùng khi retry; trả cùng messageId cho cùng nội dung/key, không cấp sequence mới. Dùng cùng key cho nội dung khác của tin còn tồn tại trả 409. Retry tin đã thu hồi trả tombstone gốc, không hồi sinh nội dung. Cặp DM được sort vào directKey có partial unique index, kể cả hai phía tạo đồng thời.

Flutter giữ bản nháp và key trong phiên màn chat; không có outbox chat bền vững qua tắt app. UI không báo gửi thành công khi chỉ ghi local. Khi một refresh không thể xác nhận quyền đọc, màn chat bỏ nội dung đang hiển thị và cho retry. Logout/dispose bỏ socket và response đang chờ để tránh lộ cache phiên cũ.

## WebSocket

Dùng chung socket native đã có: `wss://<gateway>/api/v1/community/ws`, frame đầu `{"type":"auth","token":"<accessToken>"}` → `ready`. Reconnect/resume phải đọc lại REST. Server xác minh lại phiên định kỳ và đóng khi hết hạn/thu hồi.

Social events: `conversation.updated`, `message.created`, `message.deleted`, `conversation.read`. Payload chỉ `{type,conversationId,messageId?,eventId,occurredAt}`; không có nội dung tin, email, danh sách người nhận, read cursor của người khác. Server fan-out theo danh sách thành viên lấy tại commit. Thay đổi thành viên có thể gửi conversation.updated cho thành viên vừa bị gỡ để client đóng/làm mới màn. REST vẫn kiểm tra quyền hiện tại; client không dùng socket để gửi tin hoặc join tùy ý.

Event chỉ phát sau commit; Redis Pub/Sub tùy chọn fan-out nhiều instance. Đây là invalidation best effort, không queue/replay/delivery guarantee. Tin lưu bền trong MongoDB; sau reconnect client refetch lịch sử đang tải, bao gồm tombstone, để bù event bỏ lỡ. Không có push notification khi app bị tắt.

## API Web Admin

Prefix **`/api/v1/admin/community`**, current ADMIN.

| Method | Path | Body / query |
|---|---|---|
| GET | `/groups` | `page,limit,disabled=true|false`; chỉ GROUP, metadata, không message/member email |
| PATCH | `/groups/:conversationId/disable` | `{reason}` 3–1000; nhóm vẫn đọc được nhưng cấm gửi/thêm/đổi tên/chuyển chủ |
| PATCH | `/groups/:conversationId/enable` | `{reason}` mở lại |
| GET | `/message-reports` | `page,limit,status=OPEN|RESOLVED|DISMISSED`; snapshots tin được báo cáo |
| PATCH | `/message-reports/:reportId` | `{action:REMOVE|DISMISS,reason}`; chỉ report OPEN |

Report lưu reporterId, senderId, messageId, conversationId, contentSnapshot, reason, status, resolution, resolvedBy, resolvedAt, timestamps. ID report trong danh sách là `_id`. Gửi lặp cùng reporter/message trả báo cáo cũ. REMOVE redact tin và đổi RESOLVED; DISMISS giữ tin và đổi DISMISSED. Snapshot giữ bằng chứng ngay cả khi tác giả thu hồi sau báo cáo. Người dùng được thông báo rằng báo cáo chia sẻ nội dung tin đó với quản trị viên; không gửi cả đoạn hội thoại.

Moderation và `social_moderation_logs` commit cùng transaction; lỗi ghi log rollback thao tác. Lịch sử bài/bình luận vẫn dùng moderation_logs riêng. Nhóm tạm ngưng vẫn cho rời nhóm/thu hồi tin của chính mình. Báo cáo đã xử lý không xử lý lại (409).

## DB, Swagger, triển khai

Thêm collection `community_profiles`, `conversations`, `conversation_members`, `messages`, `message_reports`, `social_moderation_logs`. Schema/index thực tế: [runtime DBML](database/runtime/community-service.dbml), [schema JSON](database/runtime/schemas.json); thiết kế: [community.dbml](database/services/community.dbml). Index unique, cursor và membership fence là bắt buộc. Service init tạo collection/index; không cần backfill dữ liệu bài cũ. Cần MongoDB Atlas/replica set có transaction.

Swagger chạy trực tiếp **Community `/api-docs` và `/api-docs.json`**; Auth `/api-docs` có contract internal discovery. Snapshot: [Community OpenAPI](openapi/community-service.json), [Auth OpenAPI](openapi/auth-service.json). Xuất lại từ backend: `node scripts/export-contracts.js community-service`, `node scripts/export-contracts.js auth-service`. Các route social đều có request/response contract, không chỉ danh sách route.

Deploy theo thứ tự **Auth → Community → Gateway**, giữ JWT_SECRET và internal token đồng nhất, URL service trực tiếp chính xác. Sau đó rebuild Web Admin (VITE_API_MODE=real, VITE_API_BASE_URL là origin Gateway không có /api/v1) và Flutter (API_BASE_URL/COMMUNITY_BASE_URL có /api/v1). Flutter thêm `qr_flutter`, `mobile_scanner` và quyền Camera Android/iOS; cần full rebuild cài app, hot reload không thêm được native plugin. Camera chỉ mở khi vào màn quét; từ chối quyền vẫn nhập mã/email được.

Smoke test hai user thật: tìm email → mở profile → DM hai chiều và unread; QR của mình → quét bằng user khác → cấp lại và kiểm tra mã cũ bị từ chối; tạo nhóm → thêm/gỡ/chuyển chủ/rời → kiểm tra lịch sử theo lần join; mất mạng gửi lại không nhân đôi; logout không giữ chat; báo cáo tin thử → Admin REMOVE/DISMISS; disable/enable nhóm. Kiểm thử camera phải chạy trên Android/iOS thật hoặc emulator có camera.

Phạm vi hiện tại là chat chữ, không friendship, cuộc gọi, file/ảnh trong chat, typing/presence hay push khi app tắt. Các tính năng đăng bài có ảnh và chia sẻ hành trình giữ nguyên.

## Kiểm chứng cục bộ

- Community: lint và 45 test đạt; Gateway: lint và 83 test đạt. Auth discovery có test tích hợp với MongoDB tạm, xác minh token service và loại bỏ tài khoản bị khóa/chờ xác minh.
- `npm run test:e2e` tại Community đạt: Gateway + Community thật, MongoDB replica set tạm, Auth HTTP contract stub. Kiểm tra bài viết/kiểm duyệt và DM REST/WS, bảo đảm outsider nhận 404 và không nhận event DM.
- Flutter: 42 test Community đạt, bao gồm tạo nhóm qua UI tìm email, retry cùng key, logout hủy response chat/profile, QR và dark theme điện thoại; build APK debug Android thành công. Chưa kiểm tra quét camera trực tiếp trên thiết bị thật hoặc build iOS.
- Web Admin: 12 test Community đạt, lint phần thay đổi và production build đạt. Các kiểm thử này dùng API fixture cục bộ.
- Đây là kết quả source/local, chưa deploy hoặc dùng hai tài khoản production để kiểm tra trên Render. Cần smoke test sau deploy theo hướng dẫn trên.

Tham khảo thư viện QR: [qr_flutter](https://pub.dev/packages/qr_flutter), [mobile_scanner](https://pub.dev/packages/mobile_scanner).
