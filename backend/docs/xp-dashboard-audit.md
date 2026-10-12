# Kiểm tra XP, level và dashboard — cập nhật 11/10/2026

## Nguồn XP đã có

| Hoạt động được xác nhận | XP |
| --- | ---: |
| Hoàn thành hành trình | 150 |
| Mỗi km trọn vẹn trong hành trình hoàn thành | 5 |
| Mỗi 100m độ cao trọn vẹn trong hành trình hoàn thành | 10 |
| Check-in CHECKPOINT / VIEWPOINT / CAMP / SUMMIT / FINISH | 10 / 15 / 20 / 50 / 20 |
| Check-in loại khác | 5 |
| Lần đầu xác minh ghé một tỉnh | 100 |
| Lần đầu ghé một địa điểm đủ điều kiện | 50 |
| Nhận huy hiệu COMMON / RARE / EPIC / LEGENDARY | 50 / 150 / 400 / 1000 |
| Đóng góp địa điểm / cung đường được duyệt | 200 / 300 |

Đủ XP chưa chắc lên hạng: còn phải đủ số hành trình, tỉnh, huy hiệu và các điều kiện do admin cấu hình.

## Các lỗi đã sửa

- Sự kiện đóng góp gửi `type` nhưng consumer cũ đọc `contributionType`, làm đóng góp địa điểm nhận nhầm 300 XP. Consumer hiện hỗ trợ cả hai trường.
- XP ledger, tổng XP, thống kê, lịch sử hạng và receipt sự kiện được ghi trong cùng MongoDB transaction. Khi lỗi, tất cả rollback và RabbitMQ đưa sự kiện trở lại hàng đợi.
- Giữ quãng đường dưới 1km và độ cao dưới 100m trong thống kê, dù chưa đủ một đơn vị XP thưởng.
- Không cộng lại XP khi sự kiện được giao lại hoặc một nguồn hoạt động có event ID mới.
- Không mất mục tiêu lên hạng khi admin tắt một level ở giữa.
- Bỏ hai khai báo index trùng gây lỗi khởi tạo collection rank/profile.
- Outbox trekking giữ sự kiện ở PENDING khi RabbitMQ bị tắt; thiếu channel được retry thay vì đánh dấu PUBLISHED. Sự kiện duyệt đóng góp được đưa vào outbox.

## App

- Khi đang dùng app: tải lại XP/hạng mỗi 15 giây và khi quay lại từ nền.
- Sau check-in, đồng bộ check-in hoặc hoàn thành hành trình thành công: kiểm tra lại sau 1, 3, 6 giây để chờ consumer/badge evaluator.
- Thông báo trong app khi XP tăng hoặc level tăng; không hiển thị thông báo cho lần tải đầu và không lặp lại với cùng dữ liệu.
- Reset trạng thái quan sát khi đăng xuất/hết phiên; bỏ qua response cũ.
- Icon 10 level giống web-admin. Nếu rank có `iconUrl`, cả hai dùng URL đó; nếu trống hoặc tải ảnh lỗi, dùng emoji theo rank code. Admin có thể sửa URL icon trong hộp chỉnh sửa rank.
- Đây là thông báo trong app, chưa phải push notification khi app đã đóng.

## Dashboard

- Auth tổng hợp dữ liệu qua các endpoint `/internal/v1/dashboard` của trekking/checkin bằng JWT của admin. Hai endpoint mới kiểm tra quyền ADMIN.
- Tổng địa điểm, loại huy hiệu, hành trình và đóng góp được đếm từ collection gốc của trekking. Bao gồm định nghĩa không hoạt động và mọi trạng thái hành trình; không lấy tổng hành trình từ projection `completedJourneyCount`.
- Tổng check-in được đếm từ collection checkin, không phụ thuộc consumer XP đã xử lý hay chưa.
- Tỷ lệ đóng góp, đóng góp gần đây và huy hiệu vừa nhận dùng dữ liệu thực. Draft/cancelled không được đưa vào tỷ lệ đóng góp đã gửi xét duyệt.
- Auth bổ sung tên người dùng cho các dữ liệu từ service khác và ghi `lastLoginAt` khi đăng nhập bằng mật khẩu/Google để widget người dùng gần đây hoạt động.
- Biểu đồ dùng ngày Việt Nam và hiển thị người dùng mới, check-in, hành trình.
- Web-admin tải lại sau mutation thành công, khi quay lại tab và mỗi 30 giây.
- Service lỗi trả `null` cho chỉ số liên quan, UI hiển thị `—` và tình trạng thiếu dữ liệu, thay vì số 0 gây hiểu nhầm.
- `community-service` trong workspace chưa được triển khai, nên tổng bài viết hiện là `—`.

## Cấu hình và kết quả kiểm tra ngày 11/10

- Local dùng GAMIFICATION_HTTP_ENABLED=true ở checkin/trekking khi RabbitMQ tắt. Worker đọc outbox, gửi HTTP nội bộ đến auth và trekking; chỉ xác nhận giao khi consumer xử lý thành công. Lỗi mạng/5xx được thử lại với thời gian chờ tối đa 5 phút, không bỏ sự kiện sau 10 lần. Claim của worker bị crash được thu hồi sau 60 giây.
- TREKVIET_INTERNAL_TOKEN phải giống nhau giữa auth, trekking, checkin. Đã cập nhật cấu hình local; không đưa secret vào source hay tài liệu. Auth URL mặc định localhost:3001, trekking localhost:3003, checkin localhost:3002. Docker phải cấu hình hostname theo service.
- MongoDB phải hỗ trợ transaction (Atlas/replica set), có rank NEWBIE. Consumer XP ghi ledger, counters, hạng và receipt trong một transaction. Consumer trekking tăng checkinCount và receipt trong cùng transaction, chống trùng theo checkinId.
- Mã tỉnh trong catalog như ho_chi_minh được ánh xạ thành ObjectId của danh mục tỉnh checkin, gồm alias tp_ho_chi_minh. Không tìm thấy tỉnh trả 503 để giữ receipt offline chờ sửa catalog.
- Check-in lưu bền sự kiện trước khi xác nhận; gửi lại cùng clientCheckinId phục hồi bước visit/outbox bị lỗi mà không tạo check-in mới. Phần thưởng tỉnh/địa điểm được deduplicate theo user và tỉnh/địa điểm.
- Huy hiệu nhận số tỉnh, địa điểm, SUMMIT và độ cao thật từ checkin-service; đã thêm altitudeMeters từ metadata cột mốc. Bản ghi cũ thiếu độ cao được xem là 0.
- Chi tiết user lấy tổng hành trình, check-in và đóng góp từ service sở hữu dữ liệu. Service không khả dụng trả null và admin hiển thị —. Drawer tự lấy bản mới cùng profile mỗi 30 giây; tiến độ XP sử dụng ngưỡng rank backend thay vì mock.
- App đọc đúng milestoneCheckinId khi đồng bộ và cache lịch sử, tránh ghi đè check-in khác. Khi nâng cấp, app thử lại một lần receipt FAILED do lỗi Milestone không tồn tại của provider cũ; backend kiểm tra lại GPS gốc. Lỗi ngoài bán kính không được tự chấp nhận.
- Profile cũ chưa được khởi tạo được tạo NEWBIE khi tải profile. Quy tắc hiện tại không thưởng XP cho tạo/bắt đầu hành trình, đánh giá hay đóng góp chưa duyệt. Đủ XP vẫn phải đạt điều kiện rank khác.

## Kiểm chứng và phục hồi

- Đã chạy kiểm thử MongoDB tạm cho mã tỉnh, replay sau lỗi ghi outbox, HTTP cần service token, XP/hạng/rollback/chống trùng, số check-in khi giao đồng thời và thống kê huy hiệu; production build và 62 test web-admin pass. App kiểm thử offline, ID chuẩn, phục hồi receipt cũ và tự cập nhật rank pass. Dart analyze không có error/warning; còn lint info của file offline_store.
- API local thực tế của Shopee4 trả totalJourneys=1, totalCheckins=0; dashboard trả totalJourneys=10, totalCheckins=0. Các server đều trả health 200.
- Đã chạy scripts/replay-gamification.js --apply tại checkin/trekking. Nguồn dữ liệu hiện có 0 check-in server, 0 hành trình hoàn thành, 0 huy hiệu đã nhận, 0 đóng góp duyệt; chưa có hoạt động server để cộng bù XP. Không tạo check-in hay XP giả.
- Receipt còn trong SQLite của điện thoại cần chạy bản app mới và kết nối backend để tự gửi lại. Chưa xác nhận trực tiếp trên điện thoại người dùng.
- Công cụ replay có thể chạy lại để phục hồi sự kiện từ bản ghi server; ledger XP chống cộng trùng theo nguồn. Nếu một sự kiện lỗi vĩnh viễn bị đánh FAILED, kiểm tra lastError trong EventOutbox trước khi sửa và giao lại.
