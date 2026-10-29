# Quản lý bản đồ địa điểm và đánh giá

Các endpoint dưới đây dùng prefix `/api/v1/admin/trekking`, yêu cầu Bearer token ADMIN. Gateway đã proxy prefix này đến trekking-service.

## Bản đồ địa điểm

- `GET /places-offline-maps?available=all|true|false&search=...&page=1&limit=20`: mặc định `true` để giữ tương thích. `all` bao gồm cả địa điểm chưa có file, `false` gồm bản đồ tắt và địa điểm chưa cấu hình. Danh sách trả `data: {data,total,page,limit,totalPages}`.
- `GET /places/:id/offline-map`: lấy metadata quản trị, gồm `objectKey`, phiên bản, vùng bao phủ và URL tải do server tạo.
- `GET /places/:id/offline-map/file`: tải ZIP qua backend với xác thực; chỉ cho phép bản đồ đang bật.
- `PUT /places/:id/offline-map`: yêu cầu `available`, `version`. Các field không gửi được giữ nguyên, không thay toàn bộ subdocument. Bật tải yêu cầu file đã cấu hình; kiểm tra thứ tự zoom và tọa độ. Gửi `null` để bỏ metadata tùy chọn.

Tắt bản đồ chỉ ngừng cung cấp tải xuống, không xóa object trên R2. Thay metadata không upload file. Tạo ZIP mới bằng Agent Map Builder rồi duyệt/xuất bản theo luồng hiện có.

## Đánh giá địa điểm

- `GET /reviews?placeId=...&point=1..5&status=ACTIVE|DELETED|ALL&search=...&page=1&limit=20`.
- Mặc định `ACTIVE`. Tìm kiếm literal theo nội dung, user ID hoặc tên địa điểm. Kết quả `{items,total,page,limit,totalPages}`; mỗi item có `detailEvaluateId`, `trekkingPlaceId`, `placeName`, nội dung, ảnh/video, điểm, cờ ẩn danh, trạng thái `deleted` và `removedBy`.
- `DELETE /places/:id/reviews/:reviewId`: dùng endpoint đã có, gỡ mềm, ghi admin thực hiện và tính lại `ratingAverage`/`ratingCount`. Không cho sửa nội dung thay tác giả; chưa có API khôi phục đánh giá đã gỡ.
- Quyền ẩn danh vẫn áp dụng cho API công khai. ADMIN có thể xem user ID để xử lý nội dung.

Deploy trekking-service trước hoặc cùng Web Admin. UI mới dùng `/offline-maps?tab=places` và `/trekking/reviews`; backend cũ chưa hỗ trợ bộ lọc mới hoặc endpoint tổng hợp đánh giá. Không thay lỗi API bằng mock.
