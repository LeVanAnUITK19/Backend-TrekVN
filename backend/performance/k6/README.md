# TrekVN: đo tải với k6

Chạy từ máy của bạn, không chạy bên trong các backend Render. Không tự gắn vào
CI push và không tự gọi các server khi chỉ import/inspect script.

## Workload hiện có

| SERVICE | GET được gọi luân phiên | Token |
| --- | --- | --- |
| gateway | `/api/v1/places?page=1&limit=10`, `/api/v1/routes?page=1&limit=10`, `/api/v1/gamification/ranks` | Không |
| auth | `/api/v1/gamification/ranks` | Không |
| trekking | `/api/v1/places?page=1&limit=10`, `/api/v1/routes?page=1&limit=10` | Không |
| checkin | `/api/v1/checkins/me?page=1&limit=10` | JWT của user test |
| agent | `/api/v1/agent/conversations?page=1&limit=10` | JWT admin test |

Đặt BASE_URL là domain thật của service tương ứng, không có path. Test chỉ GET,
không đăng ký/login hàng loạt, không gửi OTP, tạo checkin, gọi LLM hoặc build map.
Agent ở đây chỉ đo API đọc danh sách hội thoại, không đo năng lực suy luận LLM.
Gateway đo đường đi Gateway → Auth/Trekking; chưa phải mọi hành trình người dùng.
Có thể dùng WORKLOAD=health để kiểm tra hạ tầng nhanh, nhưng kết quả `/health`
không đại diện cho tải API/DB. Script không thay đổi cấu hình server.

## 1. Smoke trước (PowerShell)

Máy này đã có `k6`; kiểm tra bằng `k6 version`. Từ root repository:

```powershell
Set-Location backend/performance/k6
New-Item -ItemType Directory -Force results | Out-Null
$env:BASE_URL = 'https://api-gateway-trekvn.onrender.com'
$env:SERVICE = 'gateway'
$env:PROFILE = 'smoke'
$env:REPORT_PREFIX = 'results/gateway-smoke'
k6 run load.js
```

Mặc định smoke: 1 VU, giữ 15 giây; mỗi iteration 1 GET rồi nghỉ 1 giây.
Preflight gọi mỗi endpoint một lần; gặp status khác 200 sẽ dừng trước khi tăng tải.
Nếu Render cold start, mở app trước, đợi sẵn sàng rồi chạy lại để đo tải ổn định.
Không tự retry qua lỗi token/404/429 và không coi các lỗi đó là thành công.
`.env.example` chỉ minh họa; k6 không tự đọc `.env`.

## 2. Đo từng mức cố định

```powershell
$env:PROFILE = 'capacity'
$env:VUS = '10'
$env:HOLD_SECONDS = '120'
$env:REPORT_PREFIX = 'results/gateway-10vus'
k6 run load.js
```

Lặp lại với VUS=20, 50, 100 khi mức trước đã ổn. Dùng tên report khác để không
ghi đè. Cho server/quota hồi phục giữa các lần, theo dõi Grafana và CPU máy chạy
k6. Với mức gần giới hạn, giữ 5–10 phút rồi lặp lại để xác nhận.

## 3. Tự tăng qua các mức

```powershell
$env:PROFILE = 'stress'
$env:VU_STEPS = '1,5,10,20,50,100'
$env:HOLD_SECONDS = '120'
$env:REPORT_PREFIX = 'results/gateway-stress'
k6 run load.js
```

Mỗi mức là một scenario: tăng từ 0 trong 15 giây, giữ 120 giây, giảm trong
15 giây rồi có khoảng nghỉ. Đây là các vòng tăng tải có hồi phục, không phải
soak test liên tục. Tối đa 500 VUs trong cấu hình; không phải gợi ý chạy ngay
500 VUs. `RAMP_SECONDS`, `GAP_SECONDS`, `THINK_SECONDS`, `P95_MS` có thể chỉnh.
Không thêm `--vus`/`--duration` vì script đã quản lý tải bằng scenarios.

## 4. Chạy riêng từng backend

Giữ PROFILE=smoke cho lần đầu, rồi chuyển capacity/stress. Ví dụ Auth:

```powershell
$env:SERVICE = 'auth'
$env:BASE_URL = 'https://backend-trekvn.onrender.com'
$env:PROFILE = 'smoke'
$env:REPORT_PREFIX = 'results/auth-smoke'
k6 run load.js
```

Trekking: SERVICE=trekking, BASE_URL=https://trekking-service-trekvn.onrender.com.
Checkin: SERVICE=checkin, BASE_URL=https://checkin-service-trekvn.onrender.com.
Agent: SERVICE=agent, BASE_URL=https://agent-service-trekvn.onrender.com.
Xác nhận domain theo dashboard Render thực tế.

Checkin cần JWT user test; Agent cần JWT admin test. Nhập token không hiện trên màn hình:

```powershell
$secureToken = Read-Host 'JWT test' -AsSecureString
$env:AUTH_TOKEN = [System.Net.NetworkCredential]::new('', $secureToken).Password
# Đặt SERVICE, BASE_URL, PROFILE, REPORT_PREFIX rồi k6 run load.js
# Khi chạy xong:
Remove-Item Env:AUTH_TOKEN
```

Một token được dùng chung cho VUs: mô phỏng session đồng thời cùng tài khoản,
không phải nhiều người dùng với dữ liệu/quyền riêng. Muốn đánh giá nhiều user thật
cần bộ tài khoản test/JWT riêng và workload phản ánh cách app thực sự được dùng.
Không dùng METRICS_TOKEN hay Render API key làm AUTH_TOKEN.

## Đọc kết quả

Console và `results/*.txt` có từng mức VUs, số request, p95, tỷ lệ lỗi, tỷ lệ 429.
`results/*.json` có summary đầy đủ để phân tích; không chứa Authorization header
do script ghi ra. Không bật HTTP debug khi dùng JWT. Kết quả được Git bỏ qua.

- PASS mặc định: p95 < 1500 ms, HTTP khác 200 < 1%, 429 < 1%, có request thực tế.
- Dừng toàn bài nếu tỷ lệ lỗi >= 10%, 429 >= 5% hoặc p95 vượt ngưỡng bảo vệ
  max(5000 ms, 3 × P95_MS), sau tối thiểu 30 giây từ lúc chạy. Mỗi mức có metric
  riêng để mức đầu tốt không che mức sau lỗi. Mức bị cắt ngắn không được dùng làm
  chứng nhận capacity dù số liệu tạm thời có vẻ tốt; mức chưa chạy ghi NOT RUN.
- Mã thoát khác 0 khi fail threshold/preflight; đừng bỏ qua exit code trong báo cáo.
- Theo dõi thêm Grafana: `up`, requests/s, p95, 5xx, CPU, RAM, kết nối DB.

429 thường là quota theo IP/tài khoản. Một máy phát tải có chung IP, nên có thể
bị giới hạn trước khi CPU/DB hết khả năng xử lý. Không giả X-Forwarded-For để né
limiter. Muốn đo capacity thuần, dùng staging và cấu hình quota phù hợp tại đó;
giữ riêng bài đo rate limit ở cấu hình production.

VU là virtual user luân phiên gửi request và chờ, không phải số request cùng lúc.
Ví dụ 50 VUs với think=1s có throughput phụ thuộc latency. Chỉ kết luận
"mức cao nhất đã kiểm tra đạt SLO với workload X"; nếu 100 VUs vẫn PASS thì chưa
tìm được trần. Nếu 50 PASS, 100 FAIL, thử thêm 60/70/80 và kiểm tra nguyên nhân.
Không suy ra capacity toàn hệ thống từ tổng capacity các service riêng lẻ.

Grafana đang có dashboard metrics backend nên vẫn xem được khi k6 chạy. Summary
k6 nằm tại máy phát tải; nó không tự xuất vào datasource Prometheus hiện tại.

Tài liệu: https://grafana.com/docs/k6/latest/using-k6/scenarios/
và https://grafana.com/docs/k6/latest/using-k6/thresholds/.
