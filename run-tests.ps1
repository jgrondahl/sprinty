Set-Location "C:\Users\jgron\Repos\splinty"
$env:CI = "true"
& "C:\Users\jgron\.bun\bin\bun.exe" test 2>&1
