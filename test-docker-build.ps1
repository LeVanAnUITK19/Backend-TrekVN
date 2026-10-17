#!/usr/bin/env pwsh
# Test Docker builds locally before deploying to Render

param(
    [ValidateSet("all", "auth", "checkin", "trekking", "gateway", "agent")]
    [string]$Service = "all"
)

$ErrorActionPreference = "Stop"

Write-Host "🐳 Testing Docker builds for TrekVN Backend" -ForegroundColor Cyan
Write-Host ""

$services = @()

if ($Service -eq "all") {
    $services = @("auth-service", "checkin-service", "trekking-service", "api-gateway")
} else {
    $services = @("$Service-service")
}

$results = @()

foreach ($svc in $services) {
    $svcPath = "backend/services/$svc"
    $dockerfile = "$svcPath/Dockerfile"
    
    if (-not (Test-Path $dockerfile)) {
        Write-Host "⚠️  Skipping $svc (no Dockerfile)" -ForegroundColor Yellow
        continue
    }
    
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
    Write-Host "Building: $svc" -ForegroundColor Magenta
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
    
    $imageName = "trekvn-$svc-test"
    
    try {
        # Build Docker image
        $startTime = Get-Date
        
        docker build `
            -t $imageName `
            -f $dockerfile `
            $svcPath `
            2>&1 | Out-String | Write-Host
        
        if ($LASTEXITCODE -ne 0) {
            throw "Docker build failed with exit code $LASTEXITCODE"
        }
        
        $duration = (Get-Date) - $startTime
        
        Write-Host ""
        Write-Host "✅ $svc build succeeded" -ForegroundColor Green
        Write-Host "   Duration: $($duration.TotalSeconds)s" -ForegroundColor Gray
        Write-Host ""
        
        $results += [PSCustomObject]@{
            Service = $svc
            Status = "✅ Success"
            Duration = "{0:N1}s" -f $duration.TotalSeconds
            Image = $imageName
        }
        
        # Test npm ci in container
        Write-Host "🧪 Testing npm ci inside container..." -ForegroundColor Cyan
        
        $npmTest = docker run --rm $imageName npm --version
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "   npm version: $npmTest" -ForegroundColor Gray
        }
        
    } catch {
        Write-Host ""
        Write-Host "❌ $svc build failed" -ForegroundColor Red
        Write-Host "   Error: $_" -ForegroundColor Red
        Write-Host ""
        
        $results += [PSCustomObject]@{
            Service = $svc
            Status = "❌ Failed"
            Duration = "-"
            Image = "-"
        }
    }
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host "📊 Build Summary" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
$results | Format-Table -AutoSize

$failed = $results | Where-Object { $_.Status -like "*Failed*" }

if ($failed) {
    Write-Host ""
    Write-Host "❌ $($failed.Count) build(s) failed" -ForegroundColor Red
    Write-Host "   Fix issues before deploying to Render!" -ForegroundColor Yellow
    exit 1
} else {
    Write-Host ""
    Write-Host "✅ All builds succeeded!" -ForegroundColor Green
    Write-Host "   Ready to deploy to Render 🚀" -ForegroundColor Cyan
    
    Write-Host ""
    Write-Host "🧹 Cleanup built images:" -ForegroundColor Gray
    Write-Host "   docker rmi $($results.Image -join ' ')" -ForegroundColor DarkGray
}
