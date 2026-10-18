# GitHub Secrets Setup - Quick Guide

## 🎯 Mục đích

Hướng dẫn cấu hình GitHub Secrets và Variables cho CI/CD pipeline.

## 🔑 Required Secrets

### 1. SONAR_TOKEN (Bắt buộc cho SonarQube)

**Cách lấy từ SonarCloud:**

1. Truy cập: https://sonarcloud.io
2. Đăng nhập bằng GitHub account
3. Click vào **My Account** (avatar góc phải)
4. Chọn **Security** tab
5. Trong mục **Generate Tokens**:
   - Name: `TrekVN-CI`
   - Type: `User Token`
   - Click **Generate**
6. **Copy token** (chỉ hiện 1 lần!)

**Thêm vào GitHub:**

1. GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `SONAR_TOKEN`
4. Value: paste token vừa copy
5. Click **Add secret**

### 2. SONAR_HOST_URL (Variable)

1. GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Chọn tab **Variables** (bên cạnh Secrets)
3. Click **New repository variable**
4. Name: `SONAR_HOST_URL`
5. Value: `https://sonarcloud.io`
6. Click **Add variable**

## 📝 Setup SonarCloud Projects

Sau khi có token, cần tạo project cho mỗi service:

### Tạo Organization (1 lần)

1. SonarCloud → **+** (góc phải) → **Analyze new project**
2. Choose **GitHub**
3. Select organization: chọn GitHub org của bạn
4. Install SonarCloud GitHub App (nếu chưa có)

### Tạo Projects (cho từng service)

SonarQube sẽ tự động tạo project khi CI chạy lần đầu, nhưng bạn cũng có thể tạo thủ công:

1. SonarCloud → **+** → **Analyze new project**
2. Select repository: `Backend-TrekVN`
3. SonarCloud sẽ scan và tự động detect các services
4. Hoặc tạo manual:
   - Project key: `trekvn-api-gateway`
   - Display name: `TrekVN API Gateway`
   - Repeat cho các services khác

### Service Names for SonarCloud

```
trekvn-api-gateway
trekvn-auth-service
trekvn-checkin-service
trekvn-trekking-service
trekvn-agent-service
```

## ⚙️ Configure SonarQube Properties (Optional)

Tạo file `sonar-project.properties` trong từng service nếu cần custom:

**Example:** `backend/services/api-gateway/sonar-project.properties`

```properties
# Required metadata
sonar.projectKey=trekvn-api-gateway
sonar.projectName=TrekVN API Gateway
sonar.organization=your-org

# Source code location
sonar.sources=src
sonar.tests=tests

# JavaScript/TypeScript specific
sonar.javascript.lcov.reportPaths=coverage/lcov.info
sonar.testExecutionReportPaths=coverage/test-reporter.xml

# Exclude files
sonar.exclusions=**/node_modules/**,**/dist/**,**/coverage/**,**/*.spec.js

# Coverage exclusions
sonar.coverage.exclusions=**/*.test.js,**/*.spec.js,**/tests/**
```

## 🚫 Tạm thời Disable SonarQube

Nếu chưa muốn setup SonarQube ngay, comment out trong workflow files:

**File:** `.github/workflows/reusable-node.yml`
**File:** `.github/workflows/reusable-python.yml`

```yaml
# Comment out these steps:

# - name: Require Sonar token
#   env:
#     SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
#   run: |
#     if [ -z "$SONAR_TOKEN" ]; then
#       echo '::error::Configure repository secret SONAR_TOKEN'
#       exit 1
#     fi

# - name: SonarQube scan and Quality Gate
#   uses: SonarSource/sonarqube-scan-action@v8.3.0
#   with:
#     projectBaseDir: backend/services/${{ inputs.service }}
#   env:
#     SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
#     SONAR_HOST_URL: ${{ vars.SONAR_HOST_URL }}
```

Pipeline vẫn chạy bình thường với Trivy scan và tests.

## 🔄 Optional: Deploy Hooks (Nếu dùng Option B)

Nếu muốn control deployment timing (không dùng Render auto-deploy):

### Lấy Deploy Hook từ Render

1. Render Dashboard: https://dashboard.render.com
2. Chọn service (e.g., api-gateway)
3. Settings → Deploy Hook
4. Copy URL: `https://api.render.com/deploy/srv-xxxxx?key=yyyyy`

### Thêm vào GitHub Secrets

Tạo secret cho mỗi service:

```
RENDER_DEPLOY_HOOK_API_GATEWAY
RENDER_DEPLOY_HOOK_AUTH_SERVICE
RENDER_DEPLOY_HOOK_CHECKIN_SERVICE
RENDER_DEPLOY_HOOK_TREKKING_SERVICE
RENDER_DEPLOY_HOOK_AGENT_SERVICE
```

Value: paste deploy hook URL

### Uncomment Deploy Hook Code

File: `.github/workflows/deploy.yml`

Tìm và uncomment:

```yaml
# Optional: If you want explicit webhook triggers, uncomment and configure:
WEBHOOK_URL="${{ secrets.RENDER_DEPLOY_HOOK_API_GATEWAY }}"  # Replace with correct service name
if [[ -n "$WEBHOOK_URL" ]]; then
  curl -X POST "$WEBHOOK_URL"
  echo "✅ Webhook triggered for $SERVICE"
fi
```

## ✅ Verification Checklist

Sau khi setup xong, verify:

- [ ] `SONAR_TOKEN` secret được add
- [ ] `SONAR_HOST_URL` variable được add
- [ ] SonarCloud organization connected với GitHub
- [ ] Trigger CI pipeline bằng cách push code
- [ ] Check Actions logs để verify Trivy scan pass
- [ ] Check SonarCloud dashboard để verify project được tạo
- [ ] Check Render dashboard để verify auto-deploy hoạt động

## 🐛 Troubleshooting

### Error: "Configure repository secret SONAR_TOKEN"

**Cause:** `SONAR_TOKEN` chưa được add vào GitHub secrets

**Fix:** Follow steps trong section "SONAR_TOKEN" ở trên

### Error: "Could not find a default branch"

**Cause:** SonarCloud chưa analyze repository lần đầu

**Fix:** 
1. Push code to trigger CI
2. SonarCloud sẽ tự động analyze
3. Sau đó Quality Gate sẽ hoạt động

### Error: "Project key already exists"

**Cause:** Project đã được tạo trước đó

**Fix:** Không cần làm gì, pipeline sẽ reuse project đã có

### SonarCloud không hiện kết quả

**Cause:** SonarCloud cần thời gian process results (1-2 phút)

**Fix:** Chờ 1-2 phút rồi refresh SonarCloud dashboard

## 📚 Resources

- **SonarCloud Documentation:** https://docs.sonarcloud.io/
- **GitHub Secrets:** https://docs.github.com/en/actions/security-guides/encrypted-secrets
- **Render Deploy Hooks:** https://render.com/docs/deploy-hooks

---

**Last Updated:** 2026-10-17  
**Version:** 1.0
