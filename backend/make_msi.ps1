# Mycelium MSI Build Script (WiX v6)
# This script automates the process of building the frontend, backend, and MSI installer.

$Stage = $args[0]
$ErrorActionPreference = "Stop"

Write-Host "🚀 Starting Mycelium Build Process..." -ForegroundColor Cyan

# 1. Frontend Build
if ($Stage -eq "all" -or $null -eq $Stage) {
    Write-Host "`n[1/3] Building Frontend..." -ForegroundColor Yellow
    Push-Location ../frontend
    npm run build
    Pop-Location
}

# 2. Backend Build
if ($Stage -eq "all" -or $Stage -eq "backend" -or $null -eq $Stage) {
    Write-Host "`n[2/3] Building Backend (Release)..." -ForegroundColor Yellow
    # Ensure any running instance is stopped to avoid access errors
    Write-Host "Stopping any running instances..." -ForegroundColor Gray
    Get-Process celium-backend -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Get-Process caddy -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    
    cargo build --release
}

# 3. MSI Packaging (WiX v6)
Write-Host "`n[3/3] Packaging MSI Installer..." -ForegroundColor Yellow

# Ensure build directory exists
if (!(Test-Path "target/wix")) {
    New-Item -ItemType Directory -Path "target/wix" | Out-Null
}

# Add required WiX extensions
Write-Host "Checking WiX extensions..." -ForegroundColor Gray
wix extension add WixToolset.Util.wixext 2>$null
wix extension add WixToolset.UI.wixext 2>$null

# Execute WiX Build
wix build -arch x64 `
    -d Version=1.0.0 `
    -d CargoTargetBinDir=target\release `
    -d ResourceDir=resources `
    -ext WixToolset.Util.wixext `
    -ext WixToolset.UI.wixext `
    wix\main.wxs wix\resources.wxs `
    -o target\wix\Mycelium.msi

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✨ Success! MSI created at: $(Get-Location)\target\wix\Mycelium.msi" -ForegroundColor Green
}
else {
    Write-Host "`n❌ MSI Build Failed." -ForegroundColor Red
}
