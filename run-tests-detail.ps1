Set-Location "C:\Users\jgron\Repos\splinty"
$env:CI = "true"
$output = & "C:\Users\jgron\.bun\bin\bun.exe" test 2>&1
# Print orchestrator and error lines with context
$inBlock = $false
$output | ForEach-Object {
    $line = $_
    if ($line -match "^\(fail\)|error:|expect\(received\)|BLOCKED|story reaches|story-1|story-2|story-fail|commitSha|story reaches") {
        $inBlock = $true
    }
    if ($inBlock) {
        Write-Output $line
        if ($line -match "^\s+at <anonymous>") {
            $inBlock = $false
            Write-Output "---"
        }
    }
}
Write-Output ""
$output | Select-Object -Last 5 | ForEach-Object { Write-Output $_ }
