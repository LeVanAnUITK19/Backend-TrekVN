# Thay đổi trước khi push — 2026-10-13

## Mốc so sánh

So sánh working tree với `fa5100106794b7c69e258705ac307b87ceaa3882` trên `develop`. Đã kiểm tra trực tiếp bằng `git ls-remote`: `origin/develop` trên GitHub vẫn ở commit này.

## Thay đổi đã có trước lượt kiểm tra này

- Chuyển 532 file từ các thư mục `services/`, `docs/`, `scripts/` và `deployment/` vào `backend/`. Sau khi bỏ qua khác biệt CRLF/LF, 530 file giữ nguyên nội dung; đây là chuyển vị trí, không phải xóa backend.
- Hai file có thay đổi nội dung: consumer gamification của auth hiển thị các lỗi con trong `AggregateError`; `docs/services.md` thêm hướng dẫn xử lý RabbitMQ. Thêm hai unit test cho log lỗi và retry của consumer.
- Thêm Terraform cho bootstrap S3 state, môi trường dev và các module network/security/IAM/ECR/storage/EC2. Hạ tầng bao gồm VPC, public subnet/routing, EC2/EIP, IAM hỗ trợ SSM và các ECR repository. EC2 chỉ mở HTTP/HTTPS public; root EBS được mã hóa.
- Thêm khung `gitops/`; `argocd/root-app.yaml` hiện là file rỗng. Các thư mục rỗng không được Git lưu.
- Xóa thực sự sáu path: `AGENT_SERVICE_SUMMARY_FOR_SRS.md`, `FIX_AGENT_AUTH.md`, `SONARCLOUD_SETUP.md`, `TEST_MAP_BUILDER_WORKFLOW.md`, `test_service_auth.ps1`, `infrastructure/.gitkeep`.

## Điều chỉnh trong lượt kiểm tra này

- `.gitignore` chặn Terraform provider/cache, state và backup, lock state, saved plan, `.tfvars` thực tế, `backend.hcl` thực tế, override, cấu hình CLI có credential, AWS credentials, kubeconfig và các file deployment secret theo quy ước được liệt kê.
- Giữ `.tf`, `.terraform.lock.hcl`, `terraform.example.tfvars`, `backend.hcl.example`, `.env.example`, `.dockerignore` và dependency lockfiles có thể commit. Thêm template và hướng dẫn Terraform; không thay đổi các cấu hình `.env`, `.tfvars` hoặc `backend.hcl` hiện có.
- Cập nhật service paths trong CI filters, working directories, cache, coverage, Trivy, Sonar, Docker build và Dependabot sang `backend/services/`. Thêm Dependabot cho hai Terraform roots.
- Sửa đường dẫn tài liệu, cây thư mục và lệnh chạy trong README root.
- Sửa secret scanner để quét từ Git repository root sau khi chuyển vào `backend/scripts/`.
- Sửa lỗi cú pháp HCL của bootstrap S3 và chuẩn hóa định dạng Terraform. Thêm lockfile bootstrap sau khi tải provider để validate.
- Ghi rõ trạng thái scaffold trong GitOps README.

## Kiểm tra

- `terraform fmt -check -recursive backend/infrastructure/terraform`: đạt.
- `terraform validate` trong `bootstrap-state/` và `environments/dev/`: đạt cả hai. Không chạy Terraform plan/apply hoặc thay đổi tài nguyên AWS.
- Hai unit test consumer: đạt; ESLint trên consumer/test: không lỗi.
- Các GitHub Actions/Dependabot YAML parse được; service paths và các thư mục Dependabot tồn tại.
- Kiểm tra 19 path cần ignore và 8 path cần publish: đạt. `git ls-files -ci --exclude-standard` không có file đã track nhưng cần ignore.
- Quét secret theo mẫu trong các Git candidate: không phát hiện. Các file bị ignore không nằm trong phạm vi kiểm tra; quét theo mẫu không đảm bảo phát hiện mọi dạng secret.
- Các file untracked được phép publish không có Terraform runtime/state/plan/config cá nhân và không có file lớn hơn 10 MB.
- `git diff --check`: không lỗi whitespace.

## Giới hạn

Đây là thay đổi bố cục và scaffold hạ tầng, chưa phải deployment AWS/K3s hoàn chỉnh. Terraform không cài K3s; chưa có manifest RabbitMQ, Helm chart hay Argo CD application chạy được. CI vẫn build/publish GHCR, chưa có luồng publish ECR dù Terraform đã tạo repository ECR. Chưa chạy Docker build hoặc CI/Trivy/Sonar trên GitHub cho layout mới. Chưa chạy lại toàn bộ test suite; lần này chỉ kiểm thử phần consumer thay đổi.

Nội dung commit được lưu ngoài source publish tại `.audit/COMMIT_MESSAGE.txt`. Chưa commit hoặc push tự động.
