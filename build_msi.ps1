# Mycelium Build & Package Script (MSI)
# This script ensures a consistent build process every time.

$ProjectRoot = Get-Location
# Extract version from Cargo.toml
$CargoToml = Get-Content "$ProjectRoot\backend\Cargo.toml" -Raw
$Version = ([regex]::Match($CargoToml, 'version\s*=\s*"([^"]+)"')).Groups[1].Value
if (!$Version) { $Version = "1.0.0" }

Write-Host "--- Stage 1: Building Frontend ---" -ForegroundColor Cyan
Set-Location "$ProjectRoot\frontend"
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Frontend build failed"; exit 1 }

Write-Host "--- Stage 2: Building Backend (Release) ---" -ForegroundColor Cyan
Set-Location "$ProjectRoot\backend"
# Kill existing process if running to avoid file lock
taskkill /F /IM celium-backend.exe /FI "STATUS eq RUNNING" 2>$null
cargo build --release
if ($LASTEXITCODE -ne 0) { Write-Error "Backend build failed"; exit 1 }

Write-Host "--- Stage 3: Packaging MSI Installer ---" -ForegroundColor Cyan
if (!(Test-Path "target\wix")) { New-Item -ItemType Directory -Path "target\wix" }

# WiX v6 Build Command
wix build wix\main.wxs wix\resources.wxs `
    -d Version=$Version `
    -d CargoTargetBinDir=target\release `
    -d ResourceDir=resources `
    -ext WixToolset.UI.wixext `
    -ext WixToolset.Util.wixext `
    -o target\wix\Mycelium-$Version.msi

if ($LASTEXITCODE -ne 0) { 
    Write-Error "MSI Packaging failed"
    Set-Location $ProjectRoot
    exit 1 
}

Write-Host "`nSuccessfully created: $ProjectRoot\backend\target\wix\Mycelium-$Version.msi" -ForegroundColor Green
Set-Location $ProjectRoot
