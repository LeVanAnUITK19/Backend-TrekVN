# 🎯 SonarCloud Setup Guide - TrekVN Backend

## ✅ Configuration Complete!

All 5 microservices have been configured with SonarCloud projects:

| Service | Project Key | Display Name |
|---------|------------|--------------|
| auth-service | `levanan_auth-service-trekking-vn` | auth-service-trekking-vn |
| checkin-service | `levanan_checkin-service-trekking-vn` | checkin-service-trekking-vn |
| trekking-service | `levanan_trekking-service-trekking-vn` | trekking-service-trekking-vn |
| community-service | `levanan_community-service-trekking-vn` | community-service-trekking-vn |
| agent-service | `levanan_agent-service-trekking-vn` | agent-service-trekking-vn |

**Organization:** `levanan`

---

## 🔐 Next Steps: Configure GitHub Secrets

### 1. Get SonarCloud Token

1. Login to https://sonarcloud.io
2. Go to **My Account** → **Security** → **Generate Tokens**
3. Generate a new token with name: `GitHub Actions - TrekVN Backend`
4. **Copy the token** (you won't see it again!)

### 2. Set GitHub Repository Secrets

Go to your GitHub repo:
```
https://github.com/YOUR_USERNAME/YOUR_REPO/settings/secrets/actions
```

Click **"New repository secret"** and add:

#### Secret 1: SONAR_TOKEN
```
Name: SONAR_TOKEN
Value: <paste-the-token-from-sonarcloud>
```

### 3. Set GitHub Repository Variables

Go to:
```
https://github.com/YOUR_USERNAME/YOUR_REPO/settings/variables/actions
```

Click **"New repository variable"** and add:

#### Variable 1: SONAR_HOST_URL
```
Name: SONAR_HOST_URL
Value: https://sonarcloud.io
```

---

## 🚀 Testing the Setup

### Test Locally (Optional)

You can test SonarQube scan locally before pushing:

#### For Node.js services (auth, checkin, trekking, community):
```bash
cd services/auth-service
npm ci
npm run lint
npm run test:ci

# Install sonar-scanner (if not installed)
npm install -g sonar-scanner

# Run scan (requires SONAR_TOKEN)
sonar-scanner \
  -Dsonar.token=YOUR_SONAR_TOKEN \
  -Dsonar.host.url=https://sonarcloud.io
```

#### For Python service (agent):
```bash
cd services/agent-service
pip install -r requirements.txt -r requirements-dev.txt
ruff check .
pytest -q --cov=. --cov-report=xml:coverage.xml

# Run scan
sonar-scanner \
  -Dsonar.token=YOUR_SONAR_TOKEN \
  -Dsonar.host.url=https://sonarcloud.io
```

### Test via CI/CD

Simply push your changes to trigger the CI pipeline:

```bash
git add .
git commit -m "chore: configure SonarCloud for all services"
git push origin main
```

The CI will:
1. Detect which services changed
2. Run lint + tests for those services
3. Run Trivy security scans
4. Upload results to SonarCloud
5. Wait for Quality Gate to pass
6. Build and publish Docker images (if on main branch)

---

## 📊 Viewing Results

After the CI runs, view your projects on SonarCloud:

- **Dashboard:** https://sonarcloud.io/organizations/levanan/projects
- **Auth Service:** https://sonarcloud.io/project/overview?id=levanan_auth-service-trekking-vn
- **Checkin Service:** https://sonarcloud.io/project/overview?id=levanan_checkin-service-trekking-vn
- **Trekking Service:** https://sonarcloud.io/project/overview?id=levanan_trekking-service-trekking-vn
- **Community Service:** https://sonarcloud.io/project/overview?id=levanan_community-service-trekking-vn
- **Agent Service:** https://sonarcloud.io/project/overview?id=levanan_agent-service-trekking-vn

---

## 🐛 Troubleshooting

### Issue: "Project not found"
**Solution:** Make sure you created all 5 projects manually on SonarCloud with the exact project keys listed above.

### Issue: "Quality Gate failed"
**Solution:** Check the SonarCloud project dashboard for issues (bugs, code smells, security hotspots) and fix them.

### Issue: "SONAR_TOKEN not set"
**Solution:** Verify the GitHub secret is set correctly in repository settings.

### Issue: "Coverage not showing"
**Solution:** 
- For Node.js: Ensure `npm run test:ci` generates `coverage/lcov.info`
- For Python: Ensure pytest generates `coverage.xml`

---

## 📋 Configuration Files Updated

✅ `services/auth-service/sonar-project.properties`
✅ `services/checkin-service/sonar-project.properties`
✅ `services/trekking-service/sonar-project.properties`
✅ `services/community-service/sonar-project.properties`
✅ `services/agent-service/sonar-project.properties`

---

## 🎉 What's Next?

1. **Set GitHub Secrets** (SONAR_TOKEN, SONAR_HOST_URL)
2. **Push this configuration** to trigger CI
3. **Check SonarCloud** for the first analysis results
4. **Fix any quality issues** reported by SonarCloud
5. **Enjoy automated code quality checks** on every PR! 🚀

---

**Organization:** levanan  
**Platform:** SonarCloud (https://sonarcloud.io)  
**CI/CD:** GitHub Actions with path-based filtering
