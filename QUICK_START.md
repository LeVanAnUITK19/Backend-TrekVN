# CI/CD Pipeline - Quick Start Guide

## 🚀 Để bắt đầu ngay

### Bước 1: Setup SonarQube (5 phút)

```bash
# 1. Truy cập SonarCloud
https://sonarcloud.io

# 2. Đăng nhập bằng GitHub

# 3. Tạo token:
My Account → Security → Generate Token
→ Copy token

# 4. Add vào GitHub:
GitHub Repo → Settings → Secrets and variables → Actions
→ New repository secret
→ Name: SONAR_TOKEN
→ Value: paste token
→ Add secret

# 5. Add variable:
→ Tab Variables → New repository variable
→ Name: SONAR_HOST_URL
→ Value: https://sonarcloud.io
→ Add variable
```

### Bước 2: Verify Render Auto-Deploy

```bash
# Render Dashboard: https://dashboard.render.com
# Cho mỗi service (5 services):
→ Settings → Build & Deploy
→ Auto-Deploy: Yes ✅
→ Branch: main
→ GitHub integration: Connected ✅
```

### Bước 3: Test Pipeline

```bash
# 1. Make a small change
echo "# Test" >> README.md

# 2. Commit and push
git add .
git commit -m "test: verify CI/CD pipeline"
git push origin main

# 3. Monitor GitHub Actions
https://github.com/your-repo/actions
→ Watch CI pipeline (5-8 minutes)
→ Should see: ✅ All checks passed

# 4. Monitor Render
https://dashboard.render.com
→ All 5 services should auto-deploy (3-5 minutes each)

# 5. Verify deployment
curl https://api-gateway-trekvn.onrender.com/health
curl https://backend-trekvn.onrender.com/health
curl https://checkin-service-trekvn.onrender.com/health
curl https://trekking-service-trekvn.onrender.com/health
curl https://agent-service-trekvn.onrender.com/health
```

## 📊 Pipeline Flow

```
Push → CI (Trivy + SonarQube) → Auto-Deploy to Render → Health Check
     ↓
  5-8 min
           ↓
        Pass/Fail
                  ↓
               3-5 min per service
                                    ↓
                                  ✅ Live
```

## 🔒 Security Checks

**Trivy scans for:**
- 🔍 CVE vulnerabilities in dependencies
- 🔑 Exposed secrets (API keys, tokens)
- ⚙️ Misconfigurations (Dockerfile, YAML)

**SonarQube checks:**
- 📊 Code coverage ≥ 80%
- 🐛 Bugs and code smells
- 🔐 Security hotspots
- 📈 Technical debt

**Result:** Pipeline FAILS if any HIGH/CRITICAL issues found

## 🎯 Daily Workflow

```bash
# 1. Create feature branch
git checkout -b feature/new-feature

# 2. Make changes
# ... code ...

# 3. Run tests locally
npm test

# 4. Commit
git add .
git commit -m "feat: add new feature"
git push origin feature/new-feature

# 5. Create Pull Request
# → CI runs automatically
# → Review Trivy + SonarQube results

# 6. Merge to main (if CI passes)
# → Auto-deploys to Render

# 7. Verify
curl https://api-gateway-trekvn.onrender.com/health
```

## ⚠️ If Pipeline Fails

### Trivy found vulnerabilities

```bash
# Fix: Update dependencies
npm update
npm audit fix

# Or update specific package
npm install package-name@latest

# Then push again
git add package*.json
git commit -m "fix: update vulnerable dependencies"
git push
```

### SonarQube Quality Gate failed

```bash
# 1. View report
https://sonarcloud.io → Your project

# 2. Fix issues:
- Add tests (increase coverage)
- Fix code smells
- Refactor complex functions

# 3. Push fixes
git push
```

### Render not deploying

```bash
# Check:
1. Render Dashboard → Service → Settings
   → Auto-Deploy = Yes?
   → Branch = main?
   → GitHub connected?

# Manual deploy:
Render Dashboard → Service → Deploy → Deploy Latest Commit
```

## 📁 Files You Need to Know

```
.github/workflows/
├── ci.yml                 # Main CI (runs on every push)
├── reusable-node.yml      # Node.js: Trivy + SonarQube
├── reusable-python.yml    # Python: Trivy + SonarQube
└── deploy.yml             # Auto-deploy after CI (main only)

Documentation:
├── CI_CD_PIPELINE.md      # Complete guide
├── SETUP_SECRETS.md       # Secrets setup
└── QUICK_START.md         # This file
```

## 🆘 Common Commands

```bash
# Check GitHub Actions status
gh run list

# View latest workflow run
gh run view

# Watch workflow run in real-time
gh run watch

# Re-run failed workflow
gh run rerun

# Check Render deploy status (via API)
curl -H "Authorization: Bearer YOUR_RENDER_API_KEY" \
  https://api.render.com/v1/services/YOUR_SERVICE_ID/deploys
```

## ✅ Success Checklist

After setup, verify:

- [ ] `SONAR_TOKEN` secret added to GitHub
- [ ] `SONAR_HOST_URL` variable added to GitHub
- [ ] All 5 Render services have Auto-Deploy enabled
- [ ] Push to main triggers CI pipeline
- [ ] CI pipeline passes (Trivy + SonarQube)
- [ ] Render auto-deploys all services
- [ ] All health endpoints return 200 OK
- [ ] SonarCloud dashboard shows analysis results

## 📞 Need Help?

1. **CI/CD issues:** Check `CI_CD_PIPELINE.md`
2. **Secrets setup:** Check `SETUP_SECRETS.md`
3. **GitHub Actions logs:** `https://github.com/your-repo/actions`
4. **Render logs:** `https://dashboard.render.com` → Service → Logs
5. **SonarQube results:** `https://sonarcloud.io` → Project

## 🎉 That's It!

You now have:
- ✅ Automated security scanning (Trivy)
- ✅ Code quality gate (SonarQube)
- ✅ Auto-deployment to Render
- ✅ Health check monitoring
- ✅ Production-ready CI/CD pipeline

**Next:** Setup Prometheus + Grafana for monitoring 📊

---

**Pro Tip:** Keep dependencies updated regularly to avoid Trivy failures:
```bash
npm update  # Weekly
npm audit fix  # After every npm update
```
