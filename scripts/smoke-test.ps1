$ErrorActionPreference = "Stop"
$projectDir = $PWD.Path
$outDir = Join-Path $projectDir "out"
$mainJs = Join-Path $outDir "main.js"

if (-not (Test-Path -LiteralPath $mainJs)) {
    Write-Error "main.js not found in out/ — run build-electron.ps1 first"
    exit 1
}

Write-Host "=== Electron Smoke Test ==="
Write-Host ""

$checks = @(
    @{ Name = "out/index.html exists"; Test = { Test-Path (Join-Path $outDir "index.html") } },
    @{ Name = "out/main.js exists"; Test = { Test-Path $mainJs } },
    @{ Name = "out/preload.js exists"; Test = { Test-Path (Join-Path $outDir "preload.js") } },
    @{ Name = "out/docs/ exists"; Test = { Test-Path (Join-Path $outDir "docs") } },
    @{ Name = "out/docs/plugin-spec.schema.json exists"; Test = { Test-Path (Join-Path $outDir "docs\plugin-spec.schema.json") } },
    @{ Name = "main.js references api-server"; Test = { (Get-Content $mainJs -Raw) -match "api-server" } },
    @{ Name = "main.js references database"; Test = { (Get-Content $mainJs -Raw) -match "database" } },
    @{ Name = "preload.js references IPC_PERMISSIONS"; Test = { (Get-Content (Join-Path $outDir "preload.js") -Raw) -match "IPC_PERMISSIONS" } },
    @{ Name = "index.html has root div"; Test = { (Get-Content (Join-Path $outDir "index.html") -Raw) -match "__next" } },
    @{ Name = "No .ts source files in out/"; Test = { -not (Get-ChildItem $outDir -Recurse -Filter "*.ts" | Where-Object { $_.FullName -notmatch "node_modules" } | Select-Object -First 1) } }
)

$passed = 0
$failed = 0

foreach ($check in $checks) {
    try {
        $result = & $check.Test
        if ($result) {
            Write-Host "  [PASS] $($check.Name)" -ForegroundColor Green
            $passed++
        } else {
            Write-Host "  [FAIL] $($check.Name)" -ForegroundColor Red
            $failed++
        }
    } catch {
        Write-Host "  [FAIL] $($check.Name) — $($_.Exception.Message)" -ForegroundColor Red
        $failed++
    }
}

Write-Host ""
Write-Host "Results: $passed passed, $failed failed"

if ($failed -gt 0) {
    exit 1
}

Write-Host ""
Write-Host "All smoke tests passed!" -ForegroundColor Green
