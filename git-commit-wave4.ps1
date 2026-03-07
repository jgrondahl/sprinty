Set-Location "C:\Users\jgron\Repos\splinty"
Write-Host "=== STATUS BEFORE COMMIT ==="
git status
Write-Host ""
Write-Host "=== STAGING ALL ==="
git add -A
Write-Host ""
Write-Host "=== COMMITTING ==="
git commit -m "feat(orchestrator+cli): add sprint orchestrator and CLI with full pipeline"
Write-Host ""
Write-Host "=== LOG AFTER COMMIT ==="
git log --oneline -5
