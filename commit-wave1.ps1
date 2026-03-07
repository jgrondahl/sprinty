Set-Location 'C:\Users\jgron\Repos\splinty'
git add -A
# Remove temp helper scripts from staging
git reset HEAD setup.ps1 find-bun.ps1 find-bun2.ps1 find-bun3.ps1 install-bun.ps1 bun-install.ps1 run-tests.ps1 check-runtime.ps1 2>&1
# Delete temp scripts
Remove-Item -Force -ErrorAction SilentlyContinue setup.ps1, find-bun.ps1, find-bun2.ps1, find-bun3.ps1, install-bun.ps1, bun-install.ps1, run-tests.ps1, check-runtime.ps1
git add -A
git status
git commit -m "chore(scaffold): init monorepo, types, state machine, workspace, handoff, ledger"
Write-Host "Commit done: $LASTEXITCODE"
