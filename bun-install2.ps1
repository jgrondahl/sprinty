$bun = "C:\Users\jgron\.bun\bin\bun.exe"
Set-Location 'C:\Users\jgron\Repos\splinty'
& $bun install 2>&1
Write-Host "Exit: $LASTEXITCODE"
