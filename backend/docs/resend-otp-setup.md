# OTP trên Render Free qua Resend

## Nguyên nhân

Log Android ghi nhận `POST /api/v1/auth/register` hết thời gian chờ sau 30 giây.
Auth service tạo user `PENDING_VERIFICATION`, lưu OTP, rồi mới gửi email.
Trước bản sửa này, Gmail SMTP có thể chờ quá thời gian của app/gateway; lỗi gửi
mail còn bị bỏ qua, trong khi OTP vẫn active và chặn gửi lại.

Render Free chặn SMTP qua các cổng 25/465/587:
<https://render.com/docs/free>. Resend dùng HTTPS nên không cần các cổng này.

## Cấu hình Auth service trên Render

1. Tạo API key gửi email trong tài khoản Resend của bạn.
2. Thêm và xác minh domain gửi email trong Resend bằng các bản ghi DNS được cung cấp.
3. Trong Render → Auth service → Environment, đặt:

   ```dotenv
   EMAIL_PROVIDER=resend
   RESEND_API_KEY=<API key Resend của bạn>
   EMAIL_FROM=TrekViet <no-reply@DOMAIN_DA_XAC_MINH>
   ```

4. Deploy source mới của Auth service. Không chỉ đổi biến môi trường trên code cũ.
5. Build/chạy lại app nếu cần thông báo lỗi mới. Thay đổi Resend nằm ở backend,
   vì vậy bản app đã phát hành cũng dùng được khi backend mới được deploy.

`EMAIL_USER` / `EMAIL_PASS` không được dùng khi chọn `resend`. Mặc định code
vẫn hỗ trợ `EMAIL_PROVIDER=smtp` cho local hoặc môi trường cho phép Gmail SMTP.

Resend yêu cầu sender thuộc domain đã xác minh để gửi tới người dùng bất kỳ.
Sender thử nghiệm `onboarding@resend.dev` chỉ gửi được tới email của chủ tài khoản
Resend; không dùng sender này cho đăng ký thực tế:
<https://resend.com/docs/knowledge-base/403-error-resend-dev-domain>.

## Kiểm tra sau deploy

- Đăng ký bằng một email bạn kiểm soát: API trả 201 rồi app mở màn hình OTP.
- Kiểm tra email thực tế tới hộp thư hoặc thư rác và nhập mã để kích hoạt tài khoản.
- Nếu đã có tài khoản `pending`, đăng ký lại bằng cùng email, không cần xóa user.
- Nếu Resend từ chối hoặc hết thời gian 10 giây: API trả 503 với thông báo gửi OTP
  thất bại; OTP của lần gửi đó bị vô hiệu hóa để không chặn thử lại.
- Không sửa trạng thái user thành `ACTIVE` để bỏ qua xác minh email.

Các kiểm thử dùng mailer/HTTP giả lập và MongoDB tạm; không gửi OTP tới địa chỉ thật.
Kiểm thử local không xác nhận API key, domain hay khả năng gửi email của Render.

API Resend: <https://resend.com/docs/api-reference/emails/send-email>.
