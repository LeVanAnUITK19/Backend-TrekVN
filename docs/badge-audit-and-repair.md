# Kiểm tra và sửa luồng huy hiệu — 11/10/2026

## Nguyên nhân

Database có 29 huy hiệu ACTIVE nhưng UserBadge trống. Admin lưu CHECKIN_COUNT, JOURNEY_COUNT, PROVINCE_COUNT, ELEVATION_TOTAL và CONTRIBUTION_APPROVED; evaluator trước đây không hỗ trợ các tên này. Sự kiện đã PUBLISHED/đã có receipt nên sửa evaluator đơn thuần không cấp lại huy hiệu cho hoạt động cũ.

Ngưỡng DISTANCE_TOTAL trên dữ liệu/admin dùng km (FIRST_5KM = 5), evaluator trước đây so trực tiếp với totalDistanceMeters. App chỉ refresh rank, không refresh danh sách huy hiệu sau hoạt động. Admin bật/tắt gửi PATCH thông tin rỗng trước PATCH status nên bị Joi từ chối; danh sách admin mặc định lọc ACTIVE và không trả totalAwarded thực tế.

Tám huy hiệu mặc định cấu hình nhầm CHECKIN_COUNT: FIRST_SUMMIT/SUMMIT_HUNTER/SUMMIT_MASTER mô tả cột mốc Summit khác nhau; FIRST_PLACE/PLACE_5/PLACE_20/PLACE_50/PLACE_100 mô tả địa điểm khác nhau. Đã chuyển sang SUMMIT_CHECKIN_COUNT và PLACE_VISITED_COUNT theo đúng mô tả, giữ ngưỡng cũ.

## Thay đổi

- Dùng chung badgeCondition cho các điều kiện admin và tên cũ của backend. DISTANCE_TOTAL mặc định km; unit METERS hỗ trợ quy tắc cần mét. Joi từ chối điều kiện không hỗ trợ, ngưỡng không dương và SPECIFIC_PLACE thiếu ID địa điểm.
- badgeStats lấy hành trình hoàn thành, quãng đường/độ cao tích lũy, số check-in VERIFIED, tỉnh/địa điểm, đỉnh đã check-in và đóng góp APPROVED từ nguồn thực tế. Summit được đếm theo milestoneId khác nhau; không đếm lại cùng đỉnh ở hành trình khác. Độ cao lớn nhất xét cả check-in lẫn hành trình hoàn thành.
- Xét huy hiệu khi có check-in, hành trình hoàn thành, tỉnh/địa điểm mới và đóng góp được duyệt. Không giới hạn evaluator ở 500 định nghĩa. UserBadge có unique userId+badgeId; sự kiện/XP có khóa chống trùng theo nguồn.
- Admin trả cả ACTIVE/INACTIVE và tổng số lần cấp; danh sách tự refresh. Bật/tắt chỉ gọi endpoint status. Form hỗ trợ các điều kiện thật, ID địa điểm, đơn vị quãng đường, độ hiếm/XP và URL biểu tượng.
- App refresh huy hiệu cùng rank sau hoạt động và trong vòng polling hiện có. Giữ huy hiệu đã nhận kể cả admin tắt định nghĩa. Chặn response cũ sau logout/refresh mới, loại dữ liệu huy hiệu/ngày nhận minh họa trong detail, hiển thị đúng đơn vị của quy tắc.

## Cấp bù đã thực hiện

Chạy từ services/trekking-service:

```powershell
# Chỉ đối soát, không ghi:
node scripts/reconcile-badges.js --repair-default-rules
# Sửa các quy tắc mặc định đã đối soát, cấp bù và chuyển sự kiện XP qua auth:
node scripts/reconcile-badges.js --repair-default-rules --apply
```

Đã áp dụng trên database cấu hình của workspace. Hai tài khoản đủ điều kiện nhận EXPLORE01, EXPLORE02, FIRST_PLACE, FIRST_PROVINCE — 4 huy hiệu/tài khoản, tổng 8. Mỗi tài khoản được thêm 200 XP. Tài khoản chưa có hoạt động không nhận huy hiệu.

| Hoạt động | Huy hiệu | XP sau cấp bù | Hạng |
| --- | --- | --- | --- |
| 2 hành trình hoàn thành, 6 check-in | 4 | 720 | HIKER |
| 1 hành trình hoàn thành, 3 check-in | 4 | 535 | NEWBIE |

Ngưỡng HIKER **thực tế đang cấu hình**: 505 XP, 2 hành trình hoàn thành, 1 tỉnh thành, 1 huy hiệu. Vì vậy tài khoản 535 XP vẫn thiếu một hành trình; không tự thăng hạng chỉ bằng XP.

Đã chạy lại `reconcile-badges.js --apply`: không cấp thêm huy hiệu; XP giữ nguyên, chỉ có 8 giao dịch BADGE_EARNED, không có sự kiện huy hiệu chưa PUBLISHED. Script không thay đổi ngưỡng hạng, số liệu hành trình hoặc tự tạo hoạt động.

## Xác minh

- Trekking: 20 test cho điều kiện/cấp huy hiệu, admin, event check-in và outbox.
- Checkin: 4 test cho thống kê VERIFIED, Summit khác nhau, dữ liệu visit và độ bền sự kiện.
- Auth: 14 test cho XP, điều kiện thăng hạng, phát lại, concurrent events và dữ liệu admin.
- App: 11 test cho rank/profile, tự refresh huy hiệu, giữ huy hiệu đã nhận, logout và layout.
- Web-admin: 2 test cho bật/tắt và chỉnh sửa đơn vị; build TypeScript/Vite thành công.

Đã xác minh dữ liệu thật và giao nhận sự kiện với các service đang chạy. Chưa thao tác end-to-end trên thiết bị Flutter thật; thay đổi app cần chạy bản code mới. Các kiểm thử trên tập trung vào huy hiệu/hạng và các luồng liên quan.
