#!/usr/bin/env pwsh
# Verify all package-lock.json files are in sync with package.json

$ErrorActionPreference = "Stop"

Write-Host "🔍 Verifying package-lock.json sync" -ForegroundColor Cyan
Write-Host ""

$services = @(
    "backend/services/auth-service",
    "backend/services/checkin-service",
    "backend/services/trekking-service",
    "backend/services/api-gateway"
)

$results = @()
$allGood = $true

foreach ($svc in $services) {
    $serviceName = Split-Path $svc -Leaf
    
    if (-not (Test-Path "$svc/package.json")) {
        Write-Host "⚠️  Skipping $serviceName (no package.json)" -ForegroundColor Yellow
        continue
    }
    
    Write-Host "Checking $serviceName..." -ForegroundColor Gray
    
    Push-Location $svc
    
    try {
        # Test npm ci dry-run
        $output = npm ci --dry-run 2>&1 | Out-String
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✅ Lock file is in sync" -ForegroundColor Green
            
            $results += [PSCustomObject]@{
                Service = $serviceName
                Status = "✅ Synced"
                Issue = "-"
            }
        } else {
            Write-Host "  ❌ Lock file OUT OF SYNC" -ForegroundColor Red
            
            # Extract missing packages
            $missing = $output | Select-String -Pattern "Missing: (.+?) from lock file" -AllMatches
            
            if ($missing) {
                $missingPkgs = $missing.Matches | ForEach-Object { $_.Groups[1].Value }
                Write-Host "     Missing: $($missingPkgs -join ', ')" -ForegroundColor Yellow
                
                $results += [PSCustomObject]@{
                    Service = $serviceName
                    Status = "❌ Out of sync"
                    Issue = $missingPkgs -join ', '
                }
            } else {
                $results += [PSCustomObject]@{
                    Service = $serviceName
                    Status = "❌ Out of sync"
                    Issue = "Unknown issue"
                }
            }
            
            $allGood = $false
        }
        
    } catch {
        Write-Host "  ❌ Error checking lock file" -ForegroundColor Red
        Write-Host "     $_" -ForegroundColor Red
        
        $results += [PSCustomObject]@{
            Service = $serviceName
            Status = "❌ Error"
            Issue = $_.Exception.Message
        }
        
        $allGood = $false
    } finally {
        Pop-Location
    }
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host "📊 Verification Summary" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
$results | Format-Table -AutoSize -Wrap

if (-not $allGood) {
    Write-Host ""
    Write-Host "❌ Some lock files are out of sync!" -ForegroundColor Red
    Write-Host ""
    Write-Host "🔧 To fix, run for each affected service:" -ForegroundColor Yellow
    Write-Host "   cd backend/services/<service-name>" -ForegroundColor Gray
    Write-Host "   rm package-lock.json" -ForegroundColor Gray
    Write-Host "   npm install" -ForegroundColor Gray
    Write-Host "   git add package-lock.json" -ForegroundColor Gray
    Write-Host "   git commit -m 'fix: regenerate package-lock.json'" -ForegroundColor Gray
    Write-Host ""
    exit 1
} else {
    Write-Host ""
    Write-Host "✅ All lock files are in sync!" -ForegroundColor Green
    Write-Host "   Safe to deploy 🚀" -ForegroundColor Cyan
    Write-Host ""
}
