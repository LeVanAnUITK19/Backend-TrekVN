# Đánh giá địa điểm

Mỗi người dùng có một đánh giá cho mỗi địa điểm, cần có hành trình COMPLETED tại chính địa điểm đó. PUT cho phép chỉnh sửa một lần, bằng cập nhật có điều kiện atomic. POST không ghi đè đánh giá. Đánh giá đã bị người dùng xóa hoặc admin gỡ vẫn giữ bản ghi để chặn tạo lại.

App hiển thị phần đánh giá ở chi tiết hành trình COMPLETED và chi tiết địa điểm: nút tạo/sửa dựa trên eligibility từ backend, ba bình luận gần nhất và liên kết xem tất cả. Form sửa giữ ảnh cũ, cho phép xóa nội dung/ảnh, thêm ảnh từ thư viện (tối đa 10 ảnh).

Web-admin hiển thị bình luận, số sao, userId, trạng thái ẩn danh, ngày tạo, số lượt sửa, ảnh và video trong chi tiết địa điểm. Gỡ đánh giá xóa mềm, cập nhật tổng sao/số đánh giá và làm mới dữ liệu admin. API quản trị yêu cầu JWT với quyền ADMIN.

## API

- GET /api/v1/places/:placeId/reviews/eligibility (JWT): `{ review, canCreate, canEdit }`.
- POST /api/v1/places/:placeId/reviews: 403 nếu chưa hoàn thành; 409 nếu đã đánh giá.
- PUT /api/v1/places/:placeId/reviews/:reviewId: 409 nếu hết lượt sửa; chỉ chủ đánh giá được sửa.
- GET /api/v1/admin/trekking/places/:id/reviews: phân trang đánh giá đang hiển thị, kể cả địa điểm không ACTIVE.
- DELETE /api/v1/admin/trekking/places/:id/reviews/:reviewId: gỡ đánh giá của địa điểm tương ứng.

## Database cũ

Để bảo đảm chặn hai POST đồng thời, cần chuyển index `{ trekkingPlaceId: 1, userId: 1 }` từ thường sang unique. Đổi schema Mongoose không tự chuyển index đang tồn tại.

Chạy từ services/trekking-service với MONGODB_URI của môi trường cần triển khai:

```powershell
node scripts/migrate-review-index.js
# Dừng trekking-service trước khi áp dụng; sau đó khởi động phiên bản mới.
node scripts/migrate-review-index.js --apply
```

Lệnh mặc định chỉ kiểm tra. Nếu có bản ghi trùng (kể cả đã gỡ), script dừng và báo ID để đối soát, không tự xóa dữ liệu. Bản ghi cũ chưa có editCount được cấp một lần chỉnh sửa vì trước đây không lưu số lần sửa. Dry run trên database được cấu hình trong phiên này không phát hiện đánh giá trùng; chưa chạy --apply hay triển khai.

## Kiểm tra

- Backend: tests/integration/review.test.js bao phủ điều kiện hoàn thành đúng địa điểm/chủ sở hữu, sao 1–5, ẩn danh, tính tổng sao, hai POST/PUT đồng thời, giới hạn sửa, phân quyền gỡ và không tạo lại sau gỡ.
- App: test/trekking/place_review_section_test.dart bao phủ bình luận, nút tạo, khóa lượt sửa/gỡ và PUT giữ ảnh cũ. Hai bộ test chi tiết địa điểm/hành trình kiểm tra hồi quy layout và thao tác.
- Web-admin: PlaceReviews.test.tsx kiểm tra hiển thị thông tin, gọi DELETE và làm mới tổng sao; hủy xác nhận không gỡ.

Kết quả phiên làm việc: 9 test backend, 14 test app và 2 test web-admin đạt; web-admin build thành công. Phân tích các file luồng đánh giá không còn lỗi, có 5 nhắc nhở style ở repository/màn hình hành trình hiện hữu. Phân tích toàn app còn cảnh báo/style ở các module khác, không được sửa trong phạm vi này.

Ảnh tham chiếu người dùng nhắc đến không có trong tin nhắn phiên này, nên chưa đối chiếu bố cục trực tiếp với ảnh. Chưa chạy end-to-end trên thiết bị với backend đã triển khai.
