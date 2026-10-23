# Script để chạy agent service local
# Sử dụng: .\run-local.ps1

Write-Host "🚀 Starting Agent Service..." -ForegroundColor Green

# Activate venv
& .\.venv\Scripts\Activate.ps1

# Run uvicorn using python -m (tránh lỗi launcher)
python -m uvicorn app.main:app --reload --port 8000 --host 0.0.0.0

Write-Host "✅ Agent Service stopped" -ForegroundColor Yellow
