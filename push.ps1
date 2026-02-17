# push.ps1
param (
    [string]$Message
)

# If message is empty, use current timestamp
if (-not $Message) {
    $Message = "Update: " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
}

Write-Host "--- Git Push Script ---" -ForegroundColor Cyan

# Check if we are in a git repository
if (-not (Test-Path .git)) {
    Write-Host "Error: Not a git repository." -ForegroundColor Red
    exit
}

# Add changes
Write-Host "1. Adding changes..." -ForegroundColor Gray
git add .

# Check if there are changes to commit
$status = git status --porcelain
if (-not $status) {
    Write-Host "Result: No changes to commit." -ForegroundColor Yellow
    exit
}

# Commit
Write-Host "2. Committing with message: '$Message'..." -ForegroundColor Gray
git commit -m "$Message"

# Push
Write-Host "3. Pushing to remote..." -ForegroundColor Gray
$currentBranch = git branch --show-current
if ($null -eq $currentBranch -or $currentBranch -eq "") {
    $currentBranch = "main"
}

git push origin $currentBranch

if ($LASTEXITCODE -eq 0) {
    Write-Host "Success: Changes pushed to '$currentBranch' branch." -ForegroundColor Green
}
else {
    Write-Host "Error: Push failed." -ForegroundColor Red
}
