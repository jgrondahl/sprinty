Set-Location "C:\Users\jgron\Repos\splinty"
$env:CI = "true"
$output = & "C:\Users\jgron\.bun\bin\bun.exe" test 2>&1
# Print only summary lines + errors (filter out verbose output logs)
$output | Where-Object { 
    $_ -match "^\(pass\)|^\(fail\)|^error:|^\s+\^|pass$|fail$|Ran \d+|BLOCKED|expect\(received\)" 
} | ForEach-Object { Write-Output $_ }
Write-Output "---FULL TAIL---"
$output | Select-Object -Last 20 | ForEach-Object { Write-Output $_ }
