# Setup Local MongoDB cho Development

## Tại sao cần Local MongoDB?

- Không phụ thuộc internet/VPN
- Không cần IP whitelist
- Faster (no network latency)
- Dễ debug và test

## Cài đặt MongoDB Community Edition

### Option 1: Chocolatey (Recommended)

```powershell
# 1. Cài Chocolatey (nếu chưa có)
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# 2. Cài MongoDB
choco install mongodb -y

# 3. Start service
net start MongoDB
```

### Option 2: Download Installer

1. Download: https://www.mongodb.com/try/download/community
   - Version: 7.0 (current)
   - Platform: Windows x64
   - Package: MSI

2. Run installer → chọn "Complete" installation

3. Check "Install MongoDB as a Service" ✅

4. Click Install

### Option 3: MongoDB Compass (GUI + Server)

Download: https://www.mongodb.com/try/download/compass
- Bao gồm GUI tool + local server
- Dễ dùng nhất cho người mới

## Verify Installation

```powershell
# Check service
Get-Service -Name MongoDB

# Should show:
# Status   Name        DisplayName
# ------   ----        -----------
# Running  MongoDB     MongoDB Server
```

## Configure Agent Service

Update `.env`:

```env
# Comment out MongoDB Atlas
# AGENT_MONGODB_URI=mongodb+srv://...

# Use local MongoDB
AGENT_MONGODB_URI=mongodb://localhost:27017
AGENT_MONGODB_DB=trekviet_agent
```

## Start Agent Service

```powershell
cd c:\doan1\TrekVN\Backend-TrekVN\services\agent-service

# Activate venv
.\.venv\Scripts\activate

# Test connection
python scripts\test_mongodb_connection.py

# Should show:
# ✅ Connected successfully!
# MongoDB version: 7.0.x

# Start service
uvicorn app.main:app --reload --port 8000
```

## MongoDB GUI Tools

### Compass (Official)
- Download: https://www.mongodb.com/try/download/compass
- Connect: `mongodb://localhost:27017`

### Studio 3T (Advanced)
- Download: https://studio3t.com/download/
- Free for non-commercial use

### VS Code Extension
- Install: "MongoDB for VS Code"
- Connect: `mongodb://localhost:27017`

## Migrate Data từ Atlas (Optional)

Nếu cần copy data từ MongoDB Atlas về local:

```powershell
# 1. Export from Atlas
mongodump --uri="mongodb://localhost:27017/trekviet"

# 2. Import to local
mongorestore --db=trekviet_agent dump/trekviet_agent
```

## Troubleshooting

### Service không start?

```powershell
# Check logs
Get-EventLog -LogName Application -Source MongoDB -Newest 10

# Manual start
mongod --dbpath "C:\data\db"
```

### Port 27017 đã bị dùng?

```powershell
# Check what's using port
netstat -ano | findstr :27017

# Stop process
taskkill /PID <PID> /F
```

## Production Note

**Local MongoDB chỉ dùng cho development!**

Staging/Production phải dùng:
- MongoDB Atlas (managed cloud)
- Hoặc self-hosted cluster với replica set
- Backup tự động
- SSL/TLS enabled
- Authentication + Authorization

