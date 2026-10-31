# OTP qua EmailJS trên Render Free

Backend hỗ trợ `EMAIL_PROVIDER=emailjs` bằng REST HTTPS, không cần SDK hoặc domain
riêng. Backend tiếp tục sinh OTP, lưu hash và kiểm tra mã; EmailJS chỉ gửi email.
Không sinh OTP trong Flutter hoặc chuyển bước xác minh sang EmailJS.

## 1. Tạo Email Service

1. Đăng ký tài khoản Free tại <https://dashboard.emailjs.com/> và xác minh email.
2. Vào **Email Services → Add New Service → Gmail**.
3. Kết nối Gmail bạn quản lý theo luồng EmailJS, hoàn tất quyền gửi email được yêu cầu.
4. Tạo service rồi lưu **Service ID**, thường có dạng `service_...`.

Gmail được kết nối trực tiếp với EmailJS. Render chỉ gọi HTTPS nên không phụ
thuộc cổng Gmail SMTP bị chặn trên Render Free.

## 2. Tạo OTP template

Vào **Email Templates → Create New Template**, chọn mẫu **One-Time Password
(OTP)** hoặc tạo template mới. Cấu hình chính xác:

| Trường | Giá trị |
| --- | --- |
| To Email | `{{email}}` |
| From Name | `TrekViet` |
| From Email | Bật **Use Default Email Address** để dùng Gmail của service |
| Subject | `{{subject}}` |
| CC / BCC | Để trống |

Nội dung tối thiểu có thể copy:

```text
TrekViet — {{subject}}

Mã xác minh của bạn: {{passcode}}
Mã có hiệu lực trong {{time}}. Không chia sẻ mã này cho người khác.

Nếu bạn không yêu cầu mã này, hãy bỏ qua email.
```

Hoặc copy HTML từ [emailjs-otp-template.html](emailjs-otp-template.html) vào chế độ
chỉnh HTML/code của template. Các biến chỉ dùng **hai dấu ngoặc nhọn**, không cần
truyền HTML động hoặc dùng ba dấu ngoặc nhọn.

Lưu template và lấy **Template ID** trong Settings, thường dạng `template_...`.
Một template dùng chung cho đăng ký, gửi lại mã và đặt lại mật khẩu; backend
truyền tiêu đề phù hợp. Không cố định To Email thành Gmail của bạn, nếu không OTP
của mọi tài khoản sẽ gửi tới cùng địa chỉ đó.

Các biến backend gửi là:

```json
{
  "email": "email_nguoi_dang_ky@example.com",
  "subject": "[TrekVN] Mã xác minh đăng ký tài khoản",
  "passcode": "012345",
  "time": "10 phút"
}
```

## 3. Public Key và quyền gọi từ backend

1. Vào **Account → General** và copy **Public Key** của EmailJS.
2. Vào **Account → Security**, bật quyền **Allow EmailJS API for non-browser
   applications** để Render/Node.js được gọi API. Theo SDK chính thức, quyền này
   mặc định tắt. Backend không giả mạo trình duyệt để bỏ qua cài đặt này.
3. Nếu bạn bật xác thực bằng Private Key trong EmailJS, lưu private key vào
   `EMAILJS_PRIVATE_KEY` trên Render. Nếu không dùng tính năng này thì bỏ trống
   biến đó. Các key và ID của email provider chỉ cấu hình ở backend.

Đây là Public Key **của EmailJS**, không phải key Resend, Brevo hay Google OAuth.

## 4. Cấu hình Auth service trên Render

Push commit có hỗ trợ EmailJS lên nhánh Render đang theo dõi. Trong **Render →
Auth service → Environment**, đặt:

```dotenv
EMAIL_PROVIDER=emailjs
EMAILJS_SERVICE_ID=service_ID_CUA_BAN
EMAILJS_TEMPLATE_ID=template_ID_CUA_BAN
EMAILJS_PUBLIC_KEY=PUBLIC_KEY_EMAILJS_CUA_BAN
# Chỉ điền nếu dùng xác thực private key ở bước 3:
EMAILJS_PRIVATE_KEY=
```

Các ID và key không phải giá trị ví dụ ở trên. Thay bằng dữ liệu thật từ
dashboard EmailJS. `EMAIL_FROM`, `EMAIL_USER`, `EMAIL_PASS`, `BREVO_API_KEY` và
`RESEND_API_KEY` không được sử dụng khi chọn EmailJS; sender lấy từ Gmail đã kết
nối trong Email Service, nên `EMAIL_FROM` cũ không quyết định địa chỉ gửi nữa.

Lưu biến và deploy **source backend mới**. Chỉ thay biến trên code cũ sẽ báo
`Unsupported EMAIL_PROVIDER`. Không cần build lại AAB chỉ để chuyển provider.
Nếu chạy backend local, dùng cùng các biến trong `.env` local, ngoài Git.

## 5. Test và giới hạn gói Free

- Đăng ký bằng một email bạn kiểm soát. Tài khoản `pending` có thể dùng lại cùng
  email để nhận mã mới. Không chuyển thủ công trạng thái thành ACTIVE.
- EmailJS chấp nhận gửi thì API đăng ký trả 201, app chuyển sang bước OTP.
  Kiểm tra Inbox/Spam và nhập đúng mã. Chấp nhận gửi không đảm bảo đã đến Inbox.
- Nếu chưa nhận được email, xem **Email History** trong EmailJS, đối chiếu
  template và tài khoản Gmail còn được kết nối.
- Free hiện có **200 request/tháng**, **2 template**; `/send` giới hạn
  **1 request/giây**. Đây là giới hạn của EmailJS, không phải 200 mỗi ngày.
  Mã đăng ký và quên mật khẩu dùng chung quota. Thao tác gửi thử cũng dùng quota.
- Backend không tự retry hoặc đổi provider khi bị từ chối, để tránh gửi nhiều
  mã cho cùng một thao tác. OTP chưa gửi được bị vô hiệu hóa để có thể thử lại.

## Nếu lỗi

Xem `[OTP] Failed to send email` trong Render → Auth service → Logs:

- `EmailJS requires ...`: thiếu Service ID, Template ID hoặc Public Key.
- `HTTP 403, non-browser API access disabled`: hoàn tất bước 3 trong Account/Security.
- `HTTP 400/401/403`: đối chiếu key/ID, cấu hình Security và kết nối Gmail; xem
  chi tiết tại Email History. Nếu bật private-key authorization, kiểm tra biến
  `EMAILJS_PRIVATE_KEY` đã được lưu trên Render.
- `HTTP 422`: kiểm tra **To Email = `{{email}}`**, tên biến và địa chỉ nhận.
- `HTTP 429`: gửi quá nhanh hoặc chạm giới hạn; kiểm tra quota trên dashboard.
- Timeout: request bị hủy sau 10 giây. Log không in OTP, key hay toàn bộ request.

Các kiểm thử local giả lập EmailJS. Cần cấu hình tài khoản thật và kiểm tra hộp
thư để xác nhận đã phát email thành công.

## Tài liệu chính thức

- REST send: <https://www.emailjs.com/docs/rest-api/send/>
- Mẫu OTP: <https://www.emailjs.com/docs/user-guide/pre-built-email-templates/>
- Biến template: <https://www.emailjs.com/docs/user-guide/dynamic-variables-templates/>
- Gọi từ Node.js: <https://github.com/emailjs-com/emailjs-nodejs>
- Public/Private Key: <https://www.emailjs.com/docs/sdk/options/>
- Gói Free: <https://www.emailjs.com/pricing/>
