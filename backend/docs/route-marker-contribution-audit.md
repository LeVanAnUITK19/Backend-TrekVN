# Bản đồ, cột mốc user và đóng góp — 11/10/2026

## Dữ liệu thực tế

Kiểm tra lần đầu có 2 JourneyMarker; lần đối chiếu log điện thoại mới nhất có 4 JourneyMarker và vẫn 0 RouteSubmission, 0 PlaceSuggestion. Log user chỉ có POST /journeys/:id/markers → 201, không có POST /contributions/routes. Nút lưu & đồng bộ đang lưu cột mốc riêng, chưa tạo yêu cầu duyệt. Không tự chuyển các cột mốc cũ thành đóng góp.

## Luồng người dùng

1. Bắt đầu hành trình, tạo cột mốc tại GPS hiện tại. App giữ ảnh/tọa độ/thời gian và đồng bộ theo hàng đợi.
2. Ngay khi ACTIVE/PAUSED hoặc sau COMPLETED, chọn **Gửi cột mốc cho admin** trên bản đồ hoặc thông báo sau lưu. App mở màn chọn cột mốc, gửi `contributionKind: MARKERS` qua /contributions/routes. Đề xuất toàn bộ cung đường vẫn cần COMPLETED. Màn đóng góp chọn sẵn các marker của hành trình; user có thể bỏ chọn.
3. Nếu offline, app báo **Đã lưu đóng góp / Chờ đồng bộ**. Khi các thao tác tạo hành trình, bắt đầu, marker và hoàn thành đã đồng bộ, app gửi đóng góp với ID server của marker.
4. Backend tạo submission PENDING_REVIEW và snapshot marker; admin thấy danh sách, thông tin user và cột mốc để duyệt. Thay đổi marker riêng sau khi gửi không thay đổi snapshot.

## Những lỗi đã sửa

- API admin trước đây trả `{routes, places}` hoặc `{items, total}`; web-admin đọc `{data, total, page, limit, totalPages}`. Đã chuẩn hóa danh sách, gộp hai loại cùng phân trang, tìm kiếm tên và chuẩn hóa chi tiết. Giữ phần contribution/markers của chi tiết để tương thích API cũ.
- Tên người đóng góp được lấy từ auth-service qua endpoint nội bộ có service token; service không khả dụng vẫn hiển thị dữ liệu submission và user ID.
- Web-admin tự làm mới danh sách mỗi 15 giây.
- Admin có bộ lọc Đóng góp cột mốc riêng, số điểm đính kèm, tên user, ghi chú an toàn, hành trình nguồn và trạng thái từng điểm. Lỗi tải marker được báo rõ cùng nút thử lại, không bị hiển thị thành danh sách trống. Có nút Làm mới và sửa bố cục danh sách/chi tiết.
- Đóng góp MARKERS gắn với route gốc của journey, không tạo route mới khi duyệt và không nhận phần thưởng XP dành cho đề xuất route mới. Marker phải thuộc đúng user và journey. Giữ các snapshot độc lập với ghi chú riêng.
- Lỗi đồng bộ vĩnh viễn của một thao tác không chặn các đóng góp độc lập phía sau; phụ thuộc chưa có server ID vẫn chờ đồng bộ.
- Chặn gửi marker của user khác và truy cập submission của user khác thông qua trùng clientOperationId. Địa điểm route submission lấy từ journey thực tế.
- Nếu lưu snapshot thất bại, bỏ submission chưa hoàn chỉnh để retry với cùng operation ID có thể tạo lại đúng nội dung.
- Retry marker đã lưu vẫn được chấp nhận khi journey sau đó đã hoàn thành; không tạo marker trùng.
- App chỉ cho tạo marker mới khi ACTIVE/PAUSED, phù hợp backend. Đã hoàn thành thì user vẫn có thể chỉnh marker riêng và gửi đóng góp.
- Bản đồ hiện tên/thứ tự cột mốc, tên marker user lớn hơn với viền tương phản, tránh bị nhãn nền che. Có danh sách tên để chạm tìm điểm; marker user màu xanh, điểm check-in màu cam/xanh lá. Khung camera gồm route và các điểm, có khoảng trống cho panel dưới.
- Preview route tải danh sách milestone; chạm milestone trong preview chỉ định vị điểm, không mở check-in với journey ID trống.
- Thông báo lưu marker nói rõ đây là cột mốc riêng; có thao tác gửi admin ngay trong hành trình. Đóng góp offline báo đã lưu/chờ đồng bộ, chỉ báo đã gửi khi server nhận thành công.

## Kiểm chứng

- Backend: các test tích hợp marker/contribution và test mới cho danh sách/chi tiết admin, phân trang hai loại, tìm kiếm ký tự đặc biệt, quyền sở hữu, lỗi snapshot và retry sau COMPLETED đều pass.
- Flutter: 40 test liên quan offline/marker/đóng góp/check-in pass. Các màn thay đổi được phân tích Dart; chưa kiểm tra trực tiếp render MapLibre trên điện thoại người dùng.
- Web-admin: test hiển thị submission và snapshot marker qua API pass; production build pass.
- Gateway đang chạy trả HTTP 200 cho danh sách admin đúng cấu trúc mới; lookup tên Shopee4 thành công. Không tạo đóng góp thử trên database thật.
