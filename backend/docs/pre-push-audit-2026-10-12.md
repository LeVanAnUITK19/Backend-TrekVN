# Backend pre-push review — 12/10/2026

## Kết luận

Working tree backend đã được sửa các lỗi xác nhận được và đủ điều kiện commit/push source để tiếp tục CI. Đây không phải chứng nhận production đã triển khai an toàn: Docker/image scan và Sonar/GitHub CI chưa chạy trong môi trường này. Không thực hiện push, thay đổi database thật hoặc viết lại lịch sử Git.

Repo cần commit là `C:\doan1\TrekVN\Backend-TrekVN`, có `.git` riêng. Repo cha `C:\doan1\TrekVN` chỉ đang quản lý một README và nhìn backend/frontend/admin như các thư mục chưa track; không dùng repo cha để tạo commit backend.

## Những vấn đề đã sửa

| Vấn đề | Thay đổi |
|---|---|
| Access JWT giữ quyền ADMIN/trạng thái cũ | Auth middleware kiểm tra tài khoản ACTIVE và quyền hiện tại; Gateway/Agent dùng kết quả xác minh hiện tại để chặn admin đã hạ quyền |
| Đổi mật khẩu vẫn giữ access session cũ | `users.tokenVersion` được tăng khi đổi/reset password; verify từ chối session có version cũ |
| Refresh token bị dùng đồng thời | Consume bằng `findOneAndUpdate` với điều kiện token chưa revoke và chưa hết hạn |
| Reset JWT có thể dùng lại | Hash reset token lưu trong `passwordresettokens`, unique + TTL; consume bằng `findOneAndDelete`, mỗi token dùng một lần |
| BLOCKED user có thể đi lại luồng OTP đăng ký | Verify/resend chỉ dành cho PENDING_VERIFICATION |
| Google activate tài khoản pending giữ mật khẩu chưa xác minh | Xóa passwordHash chưa được xác minh khi Google activate; regression test ngăn mật khẩu cũ đăng nhập |
| Client có thể gửi service/identity headers qua Gateway | Proxy xóa X-Service-Token, X-User-Id, X-User-Role, X-Admin-Id; ghi đè forwarded IP |
| Rate-limit Auth đọc trực tiếp header IP do client gửi | Dùng Express req.ip và chỉ trust proxy IP/CIDR cấu hình qua TRUSTED_PROXIES |
| Badge approval có thể bị thực thi hai lần, reject sai conversation | Atomic claim scoped admin/conversation, expiry 24h, index approvalId/TTL |
| Exception/credential lộ trong response/log | Agent production che exception details, tắt OpenAPI/docs; bỏ log request headers chứa service token; đồng nhất token audit với TREKVIET_INTERNAL_TOKEN |
| Dependency runtime có advisory | Cập nhật Multer, Google auth, FastAPI/Starlette, PyMongo/multipart; dùng PyJWT thay python-jose; crypto.randomUUID thay uuid; bỏ glob proxy dependency; nâng Jest và dùng node --watch thay nodemon |
| Git/Docker ignore thiếu hoặc sai | Ignore mọi .env.* trừ template, keys, venv, cache/QA, map binaries, audit output; giữ .dockerignore và lockfiles để commit |
| CI không chạy được theo cấu trúc hiện tại | Sửa tên reusable-python.yml, thêm test:ci, thêm Gateway lint/Docker/Sonar/CI, bỏ Community placeholder khỏi job chạy, sửa lint errors |
| Swagger/API docs lệch route và cấu trúc sai | Export từ route/Joi, sửa đường dẫn contributions/badges/admin, bổ sung route thiếu, sửa YAML schema key và response definitions; tất cả 4 OpenAPI validate thành công |
| DB/services/knowledge docs cũ | Export 32 physical Node collections + index/enum/default/subdocument snapshot, 7 Agent collection indexes; thêm pending approval schema, đồng bộ knowledge, sửa README/roadmap/service inventory |

## Kết quả kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| Auth Jest | 115 tests pass |
| Checkin Jest | 64 tests pass |
| Trekking Jest | 104 tests pass |
| Gateway Jest | 66 tests pass, có proxy body/path/query/header và binary streaming regression |
| Agent pytest | 103 tests pass, có current-role/approval ownership/concurrent-consumption regression |
| Tổng | **452 tests pass** |
| ESLint/Ruff | Không có error; còn cảnh báo no-console/require-await trong code cũ |
| OpenAPI parser | auth/checkin/trekking/agent đều hợp lệ |
| Online npm audit --omit=dev | 0 advisory cho cả 4 service Node |
| pip-audit requirements.txt | 0 advisory trong 38 dependency production được resolve |
| pip check | Không có requirement conflict |
| Secret pattern scan | 0 findings trong Git candidates và toàn bộ local Git history; chỉ scan text/blob ≤5MB và các pattern đã định nghĩa, không thay thế secret scanner chuyên dụng |
| Git ignore | Env thực, keys, venv/QA/maps/log/audit được bỏ qua; template, Docker ignore, source và lockfile vẫn publishable |
| git diff --check | Không có whitespace error |
| Workflow | 5 YAML/config files parse được; reusable workflow paths và file/script bắt buộc tồn tại |

## Những giới hạn còn lại

1. **Dependency development:** mỗi Node service còn 19 cảnh báo moderate trong dependency chain của Jest, bắt nguồn từ [sprintf-js DoS advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c). Không có high/critical trong kết quả audit Node; production không cài dev dependencies. Chưa có bản vá tương thích được npm đề xuất mà giải quyết triệt để chain này. Không dùng audit fix --force để downgrade/thay đổi tooling tùy tiện.
2. **Swagger detail:** đủ 155 Node method/path entries và 18 Agent paths theo router hiện tại. 57 Node operations vẫn chỉ có route/auth/basic response documentation (`x-contract-detail: route-only`); chưa đủ response schema chi tiết để dùng làm typed SDK contract. Các request có Joi được export theo validator đang chạy. Markdown API guide vẫn là tài liệu business rules; dữ liệu mô tả trong comment không chứng minh response thực tế.
3. **Database design:** các DBML trong `database/services/` và `server.dbml` giữ vai trò thiết kế conceptual, chưa phải schema physical hoàn toàn. Dùng `database/runtime/` làm nguồn exact fields/collection/index. Community/mobile diagrams là design references. Không có migration/duplicate scan trên database production thật trong lần này.
4. **CI/Deployment:** máy không có Docker CLI nên chưa build image hoặc chạy Trivy image scan. SONAR_TOKEN, SONAR_HOST_URL và Sonar project keys/organization trên GitHub cần tồn tại. Gateway dùng project key `levanan_api-gateway-trekking-vn`; chưa xác nhận project này đã được tạo. Không tuyên bố remote Quality Gate pass khi chưa chạy.
5. **Network/session boundary:** chỉ expose Gateway ra Internet. Node downstream tự verify JWT nhưng không tự đọc trạng thái/version từ auth DB; nếu expose trực tiếp, có thể dùng session cũ đến lúc JWT hết hạn. TRUSTED_PROXIES phải khớp địa chỉ Gateway thật. Gateway readiness hiện là liveness-style, chưa kiểm tra sức khỏe tất cả upstream.
6. **Legacy admin auth:** Web Admin dùng shared `/auth/login`/`refresh` handlers. Cookie-admin login/logout/refresh trùng path và bị shared router mount trước che khuất; chưa chuyển frontend sang luồng cookie riêng. `/auth/me` vẫn active. Services docs nêu rõ hành vi thực tế.
7. **Scope:** rà soát source/config/contracts và chạy test đã có + regression mới; không phải pentest, fuzzing toàn bộ API hoặc kiểm chứng Flutter/Web Admin E2E. Các thay đổi app có sẵn trước phiên này được giữ lại trong working tree.

## Sau khi pull/deploy bản này

- Runtime Node 22; Agent Python 3.11+ (local tests chạy Python 3.13). Cài lại từ package-lock/requirements mới.
- Request reset-password mới phải lấy token qua verify-reset-otp; reset JWT được cấp trước bản này sẽ bị từ chối.
- Review index mới của passwordresettokens/pending_approvals và dữ liệu legacy trước khi triển khai. Pending approvals cũ không có expiresAt chưa được backfill.
- `node scripts/export-contracts.js` → Python Agent venv chạy `scripts/export-agent-openapi.py` → `python scripts/sync-agent-knowledge.py` sau mỗi thay đổi API/model.
- Mẫu env không chứa credential thật. JWT/internal/reset secrets cần tự sinh ngẫu nhiên và lưu trong secret manager; không dùng giá trị placeholder trong production.

Nguồn đối chiếu: [Multer security advisory](https://github.com/expressjs/multer/security/advisories/GHSA-fjgf-rc76-4x9p), [Express proxy trust documentation](https://expressjs.com/en/guide/behind-proxies/), online npm advisory metadata và pip-audit results lưu cục bộ trong `.audit/` (Git ignored).
