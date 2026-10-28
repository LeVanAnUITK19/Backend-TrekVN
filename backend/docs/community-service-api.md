# Community API và realtime

Triển khai 2026-10-27. Service `:3004`, public client đi qua Gateway `:3000`.
Mọi API bên dưới yêu cầu `Authorization: Bearer <accessToken>` của auth-service.
Swagger: `/api-docs`, OpenAPI JSON: `/api-docs.json` trên service.

## REST

| Method | Path (sau `/api/v1`) | Hành vi |
|---|---|---|
| GET | `/posts` | Feed phân trang, mới nhất trước; public và private của chính mình |
| POST | `/posts` | Tạo bài, HTTP 201 |
| GET | `/posts/:postId` | Chi tiết bài trong quyền xem |
| PUT/PATCH | `/posts/:postId` | Cập nhật một phần bài của mình |
| DELETE | `/posts/:postId` | Xóa mềm bài của mình, xóa nội dung/ảnh và redact bình luận |
| POST | `/posts/:postId/like` | Đảm bảo đã like; gọi lặp không tăng thêm |
| DELETE | `/posts/:postId/like` | Đảm bảo bỏ like; gọi lặp không giảm thêm |
| GET | `/posts/:postId/comments` | Bình luận cũ nhất trước, bao gồm tombstone đã redact |
| POST | `/posts/:postId/comments` | Tạo bình luận hoặc reply, HTTP 201 |
| PUT/PATCH | `/comments/:commentId` | Sửa bình luận của mình |
| DELETE | `/comments/:commentId` | Tác giả bình luận hoặc chủ bài được xóa mềm |
| POST/DELETE | `/comments/:commentId/like` | Like/unlike idempotent |

`GET /posts`: `page=1` (1–10000), `limit=20` (1–100), tùy chọn `userId`, `type`, `trekkingPlaceId`. Lọc theo người khác vẫn không thấy bài private của họ. `GET .../comments` dùng `page`, `limit=50` (tối đa 100). ID tài nguyên là ObjectId hex 24 ký tự; `postId/commentId` là alias của `_id`, không phải cột ID riêng trong MongoDB.

```json
{
  "content": "Chuyến trekking hôm nay",
  "images": ["https://res.cloudinary.com/example/image/upload/photo.jpg"],
  "type": "NORMAL",
  "visibility": "PUBLIC"
}
```

Bài phải có chữ hoặc ảnh, nội dung tối đa 10000 ký tự, tối đa 5 URL HTTPS. `type`: `NORMAL | JOURNEY_SHARE | BADGE_SHARE`. `visibility`: `PUBLIC | PRIVATE`. `journeyId` tùy chọn, bắt buộc với `JOURNEY_SHARE`; trekking-service xác nhận journey thuộc người gọi. `trekkingPlaceId` được suy ra từ journey hoặc kiểm tra bằng API địa điểm. Không tự cho người xem bài quyền đọc track/journey riêng của tác giả.

Sửa bài dùng cùng các trường trên, kiểm tra cả trạng thái sau khi merge. Không nhận `authorId`, bộ đếm hay field ngoài contract. Tạo/sửa bình luận: `{ "content": "...", "parentCommentId": "..." }`; khi sửa chỉ nhận `content`. Nội dung bình luận 1–2000 ký tự. Reply phải trỏ bình luận còn hiệu lực trong cùng bài; `rootCommentId` được server tính để hiển thị nhiều cấp. Người dùng không thể giả tác giả qua body hoặc header `X-User-Id`.

Response chuẩn `{ "success": true, "data": ... }`; list `data` là `{ "items": [...], "total": 0, "page": 1, "limit": 20, "totalPages": 0 }`. Bài có `postId`, `authorId`, `authorName`, `authorAvatar`, `content`, `images`, `type`, `journeyId`, `trekkingPlaceId`, `reactionCount`, `commentCount`, `isLiked`, `visibility`, `createdAt`, `updatedAt`. Bình luận có `commentId`, `postId`, `authorId`, `authorName`, `authorAvatar`, `content`, `deleted`, `parentCommentId`, `rootCommentId`, `likeCount`, `isLiked`, timestamps.

Like trả `{ postId, isLiked, reactionCount }` hoặc `{ commentId, isLiked, likeCount }`. Xóa trả `{ success: true }`. `commentCount` đếm bình luận/reply chưa xóa; xóa parent không xóa reply. Parent đã xóa vẫn xuất hiện với `content: ""`, `authorId: null`, `authorAvatar: null` để giữ cây reply. App hiển thị nhãn “Bình luận đã bị xóa”.

Lỗi: `{ "success": false, "error": { "code": "...", "message": "..." } }`. HTTP 400 sai input/ID, 401 sai phiên, 403 sửa nội dung người khác, 404 không tồn tại/đã xóa/không có quyền xem, 429 vượt quota, 503 upstream không khả dụng. Không công khai sự tồn tại của bài private qua các API con.

Ghi bình luận, reaction và counter nằm trong cùng transaction; write fence trên bài tuần tự hóa với xóa bài và đổi privacy. Compound unique index `(postId,userId)` và `(commentId,userId)` chặn reaction trùng. Event chỉ được phát sau commit; transaction thất bại không phát event. Post-level serialization ưu tiên tính đúng của counter; bài có lưu lượng ghi lớn cần đo tải trước khi tăng quy mô.

Response `/api/v1/*` có `Cache-Control: private, no-store` để không cache dữ liệu riêng tư hoặc `isLiked` giữa các tài khoản. Gỡ liên kết bằng `journeyId: null`, `trekkingPlaceId: null`; nếu bài là `JOURNEY_SHARE` cần đổi `type: NORMAL` cùng request. Nếu liên kết bị sửa đồng thời trong thời gian xác minh qua trekking-service, trả `409 POST_CHANGED`; tải lại trước khi sửa tiếp.

## WebSocket

Kết nối **`ws(s)://gateway/api/v1/community/ws`**, URL chính xác, không query token.
Gửi frame đầu trong 6 giây:

```json
{"type":"auth","token":"<accessToken>"}
```

Service kiểm tra JWT HS256, hạn token và xác minh phiên hiện tại qua auth-service `/api/v1/auth/verify`. Thành công trả `{ "type": "ready" }`. Client đọc lại feed/comments sau `ready` để bù sự kiện khi offline. Không có thao tác tạo/sửa bài qua socket; mọi mutation dùng REST để có validation, quota và response rõ ràng.

Kết nối đang mở được xác minh lại qua auth-service mỗi `WS_SESSION_CHECK_MS` (mặc định 60 giây); tài khoản bị khóa, đổi mật khẩu/thu hồi phiên hoặc auth không còn xác minh được sẽ đóng socket với `4401`. Handshake cũng kiểm tra ID do auth xác minh khớp ID trong JWT. Flutter đóng socket khi app ở nền và reconnect khi resume, có auth deadline phía client và bỏ kết nối cũ khi tài khoản thay đổi.

Event: `post.created`, `post.updated`, `post.deleted`, `post.reaction.updated`, `comment.created`, `comment.updated`, `comment.deleted`, `comment.reaction.updated`.

```json
{
  "type": "comment.created",
  "postId": "507f1f77bcf86cd799439011",
  "eventId": "uuid",
  "occurredAt": "2026-10-27T03:00:00.000Z"
}
```

Không truyền nội dung hoặc thông tin người phản ứng trong invalidation. Client tải lại bài/bình luận qua REST để nhận dữ liệu theo quyền và trạng thái `isLiked` của chính mình. Bài public phát tới các client đã xác thực; bài private chỉ tới tác giả. Đổi public → private vẫn gửi một invalidation ID cho người đã xem để gỡ bài; các thao tác private sau đó chỉ gửi tác giả. Không lưu dữ liệu journey/track trong event.

Socket đóng với `4401` khi auth lỗi/hết hạn (app thực hiện REST read để interceptor refresh token, rồi reconnect); `1008` khi client gửi frame ngoài auth; `1013` khi client quá chậm. Giới hạn frame 8 KiB, buffer 256 KiB, mặc định tối đa 1000 connection/instance, auth deadline và ping/pong mỗi 30 giây. `Origin` trình duyệt phải thuộc `ALLOWED_ORIGINS`; mobile không có Origin vẫn phải xác thực. Gateway chỉ forward đúng đường WS, loại service/identity header do client gửi.

Không có replay log; `eventId` giúp nhận diện sự kiện, không phải cursor. Client reconnect theo exponential backoff tối đa 32 giây, debounce thông báo để tránh tải trùng. Redis Pub/Sub tùy chọn fan-out giữa nhiều instance; không thay thế cơ chế persistence hay token auth. Khi Redis lỗi, thông báo giữa instance có thể bị bỏ lỡ; REST vẫn là nguồn dữ liệu chính.

Nguồn tham khảo kỹ thuật: [ws API](https://github.com/websockets/ws/blob/master/doc/ws.md), [Mongoose 7 transactions](https://mongoosejs.com/docs/7.x/docs/transactions.html).
