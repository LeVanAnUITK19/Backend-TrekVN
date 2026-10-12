# Test script để kiểm tra service-to-service authentication
# Chạy script này sau khi restart các services

$SERVICE_TOKEN = "f3fd5a051bcb5274e4ee3982eeb876664a3ef1af9e0a18094d20e6233d082332e91679fb77ed3fc17b009228423093c8"

Write-Host "=== Testing Service-to-Service Authentication ===" -ForegroundColor Cyan
Write-Host ""

# Test 1: Auth Service - Statistics
Write-Host "[1] Testing auth-service /admin/statistics..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3001/api/v1/admin/statistics" `
        -Method Get `
        -Headers @{
            "X-Service-Token" = $SERVICE_TOKEN
        } `
        -ErrorAction Stop
    
    Write-Host "✓ SUCCESS" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Gray
    $response | ConvertTo-Json -Depth 3
} catch {
    Write-Host "✗ FAILED" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

Write-Host ""

# Test 2: Auth Service - Dashboard
Write-Host "[2] Testing auth-service /admin/dashboard..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3001/api/v1/admin/dashboard" `
        -Method Get `
        -Headers @{
            "X-Service-Token" = $SERVICE_TOKEN
        } `
        -ErrorAction Stop
    
    Write-Host "✓ SUCCESS" -ForegroundColor Green
    Write-Host "Total Users: $($response.data.totalUsers)" -ForegroundColor Gray
} catch {
    Write-Host "✗ FAILED" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 3: Trekking Service - Places
Write-Host "[3] Testing trekking-service /admin/trekking/places..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3003/api/v1/admin/trekking/places?page=1&limit=5" `
        -Method Get `
        -Headers @{
            "X-Service-Token" = $SERVICE_TOKEN
        } `
        -ErrorAction Stop
    
    Write-Host "✓ SUCCESS" -ForegroundColor Green
    Write-Host "Total Places: $($response.data.total)" -ForegroundColor Gray
} catch {
    Write-Host "✗ FAILED" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 4: Auth Service - Ranks
Write-Host "[4] Testing auth-service /admin/ranks..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3001/api/v1/admin/ranks" `
        -Method Get `
        -Headers @{
            "X-Service-Token" = $SERVICE_TOKEN
        } `
        -ErrorAction Stop
    
    Write-Host "✓ SUCCESS" -ForegroundColor Green
    Write-Host "Ranks Count: $($response.data.Count)" -ForegroundColor Gray
} catch {
    Write-Host "✗ FAILED" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Test Complete ===" -ForegroundColor Cyan
