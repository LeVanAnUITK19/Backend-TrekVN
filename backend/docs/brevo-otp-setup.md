# Gửi OTP bằng Brevo trên Render Free

Backend hỗ trợ `EMAIL_PROVIDER=brevo` qua HTTPS API, giữ nguyên mẫu email và luồng
đăng ký/xác minh OTP. Không cần cài SDK mới. Cấu hình nằm ở Auth service; app
Flutter đã phát hành cũng dùng backend mới mà không cần build lại AAB.

## 1. Tạo tài khoản và email người gửi

1. Vào <https://www.brevo.com/>, đăng ký tài khoản và chọn **Free**.
2. Hoàn tất xác minh tài khoản theo yêu cầu trên Brevo.
3. Trong Brevo, vào **Settings → Senders, Domains, IPs → Senders → Add a sender**.
4. From name: `TrekViet`. From email: Gmail bạn quản lý, ví dụ
   `email_cua_ban@gmail.com`. Không dùng `onboarding@resend.dev`.
5. Lưu, mở hộp thư nhận mã 6 số rồi nhập mã vào Brevo để xác minh sender.

Brevo có cơ chế tạm thay địa chỉ gửi từ Gmail/domain chưa xác thực bằng địa chỉ
thuộc domain của họ. Đây là phương án thử nghiệm, không bảo đảm thay thế lâu dài
cho domain riêng đã xác thực. Không cần tạo một domain bất kỳ trong Resend/Wix
để thực hiện các bước này.

Hướng dẫn sender:
<https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email>.

Chính sách thay địa chỉ gửi:
<https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders>.

## 2. Tạo API key

1. Vào **Settings → SMTP & API → API Keys & MCP**.
2. Chọn **Generate API key**, hoàn tất xác minh nếu được yêu cầu.
3. Đặt tên `TrekViet Render OTP` và chọn thời hạn phù hợp.
4. Nếu có phân quyền: chọn **Restricted**, cấp **Transactional email → All**;
   các tài nguyên khác giữ **None**. Quyền Read không cho phép gửi email.
5. Sao chép API key tiêu chuẩn để lưu vào Render. Không chọn tùy chọn đổi key
   thành MCP key. Không dùng SMTP key cho HTTP API.

Hướng dẫn API key:
<https://help.brevo.com/hc/en-us/articles/40159485019794-Create-and-manage-your-API-keys>.

Phân quyền:
<https://help.brevo.com/hc/en-us/articles/40158277171474-About-API-key-permissions>.

## 3. Đổi cấu hình Auth service trên Render

Trong **Render → Auth service → Environment**, đặt:

```dotenv
EMAIL_PROVIDER=brevo
BREVO_API_KEY=<API key Brevo vừa tạo>
EMAIL_FROM=TrekViet <email_cua_ban@gmail.com>
```

Thay email ví dụ bằng **đúng sender đã xác minh tại bước 1**. `EMAIL_FROM` cũng
chấp nhận địa chỉ thuần, ví dụ `email_cua_ban@gmail.com`.

Khi chọn Brevo, backend không dùng `RESEND_API_KEY`, `EMAIL_USER` hoặc
`EMAIL_PASS`. Nếu chạy backend local, đặt cùng ba biến trong `.env` local.
Không đặt API key trong Flutter hoặc commit `.env` lên Git.

Push source có hỗ trợ Brevo lên nhánh mà Render đang deploy. Sau đó lưu cấu hình
và deploy source mới. Chỉ thay biến môi trường trên code cũ sẽ báo
`Unsupported EMAIL_PROVIDER`.

## 4. Kiểm tra OTP

1. Đăng ký bằng một email bạn kiểm soát. Tài khoản đã `pending` có thể đăng ký
   lại bằng cùng email, không cần xóa hay chuyển thủ công thành `ACTIVE`.
2. API trả 201 và app mở bước nhập OTP khi Brevo chấp nhận gửi.
3. Kiểm tra hộp thư, thư rác, rồi nhập OTP để kích hoạt tài khoản.
4. Brevo chấp nhận request không đồng nghĩa email đã tới hộp thư. Khi chưa thấy
   OTP, xem **Transactional → Email → Logs** để kiểm tra delivered, deferred,
   blocked hoặc bounced.

Free hiện có **300 email/ngày**, tính chung email gửi từ tài khoản. Khi chạm
hạn mức, email giao dịch có thể bị giữ trong hàng đợi; OTP chỉ có hiệu lực
10 phút nên cần yêu cầu mã mới sau khi hạn mức được khôi phục.

Gói Free:
<https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans>.

Giới hạn và hàng đợi:
<https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan>.

## Nếu API vẫn trả 503

Xem dòng `[OTP] Failed to send email` trong **Render → Auth service → Logs**.

- `Brevo requires ...`: thiếu biến cấu hình hoặc chưa lưu/deploy.
- `EMAIL_FROM must contain ...`: sender không đúng định dạng hoặc chứa nhiều email.
- `Brevo rejected email (HTTP 401...)`: kiểm tra API key tiêu chuẩn có đang hoạt động.
- `HTTP 400/403`: kiểm tra sender, quyền Transactional email và trạng thái tài khoản;
  dùng mã lỗi ngắn trong log để đối chiếu trên Brevo.
- Nếu log Brevo nêu IP không được phép, đối chiếu outbound IP của Auth service
  trong Render với cấu hình Authorized IPs của Brevo. Không tắt kiểm soát IP để
  khắc phục một cách mặc định.
- `HTTP 429`: giảm tần suất gửi và kiểm tra giới hạn tài khoản.
- Timeout: request HTTPS bị hủy sau 10 giây; API không tự báo gửi thành công hoặc
  chuyển ngầm sang nhà cung cấp khác.

OTP của lần gửi bị từ chối được vô hiệu hóa để có thể thử lại. Log chỉ giữ HTTP
status và mã lỗi ngắn, không in API key, nội dung email hoặc OTP.

Các test local giả lập Brevo; chúng không xác nhận tài khoản/API key của bạn
đã được Brevo duyệt, hay email thật đã được phát đến hộp thư.

API sử dụng:
<https://developers.brevo.com/docs/send-a-transactional-email>.
