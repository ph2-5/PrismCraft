$ErrorActionPreference = "SilentlyContinue"
$root = "C:\Users\23727\Desktop\重构\ai-animation-studio-source-code"
Set-Location $root
Write-Host "Working dir: $(Get-Location)" -ForegroundColor Yellow

function Get-Files {
    param([string]$Path, [string[]]$Pattern)
    $all = @()
    foreach ($p in $Pattern) {
        $found = @(Get-ChildItem -Path $Path -Recurse -File -Filter $p -ErrorAction SilentlyContinue)
        $all += $found
    }
    return $all | Select-Object -Unique
}

function Count-FilesLines {
    param(
        [string]$Path,
        [string[]]$Pattern,
        [string]$ExcludeRegex = ""
    )
    $files = Get-Files -Path $Path -Pattern $Pattern
    if ($ExcludeRegex) { $files = $files | Where-Object { $_.FullName -notmatch $ExcludeRegex } }
    $total = 0
    foreach ($f in @($files)) {
        $content = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
        if ($null -ne $content) {
            $total += ($content -split "`n").Count
        }
    }
    return [PSCustomObject]@{ Files = @($files).Count; Lines = $total }
}

function Count-Md {
    param([string]$Path, [string]$Filter)
    $files = @(Get-ChildItem -Path $Path -Recurse -File -Filter $Filter -ErrorAction SilentlyContinue)
    $total = 0
    foreach ($f in $files) {
        $content = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
        if ($null -ne $content) { $total += ($content -split "`n").Count }
    }
    return [PSCustomObject]@{ Files = $files.Count; Lines = $total }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " [1] src/  production code" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
$srcProd = Count-FilesLines -Path "src" -Pattern @("*.ts", "*.tsx") -ExcludeRegex "(__tests__|__mocks__)"
Write-Host ("  files: {0}   lines: {1:N0}" -f $srcProd.Files, $srcProd.Lines)

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " [2] src/  test code" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
$srcTest = Count-FilesLines -Path "src" -Pattern @("*.test.ts", "*.test.tsx")
Write-Host ("  files: {0}   lines: {1:N0}" -f $srcTest.Files, $srcTest.Lines)

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " [3] electron/src/  production code" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
$elecProd = Count-FilesLines -Path "electron/src" -Pattern @("*.ts", "*.tsx") -ExcludeRegex "(__tests__)"
Write-Host ("  files: {0}   lines: {1:N0}" -f $elecProd.Files, $elecProd.Lines)

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " [4] electron/src/  test code" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
$elecTest = Count-FilesLines -Path "electron/src" -Pattern @("*.test.ts", "*.test.tsx")
Write-Host ("  files: {0}   lines: {1:N0}" -f $elecTest.Files, $elecTest.Lines)

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " [5] src/modules/*  breakdown" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
$modules = @("story", "video", "shot", "prompt", "asset", "sync", "character", "scene", "persistence")
$moduleRows = @()
foreach ($m in $modules) {
    $modPath = Join-Path "src/modules" $m
    if (Test-Path $modPath) {
        $prod = Count-FilesLines -Path $modPath -Pattern @("*.ts", "*.tsx") -ExcludeRegex "(__tests__|__mocks__)"
        $test = Count-FilesLines -Path $modPath -Pattern @("*.test.ts", "*.test.tsx")
        $moduleRows += [PSCustomObject]@{ Module = $m; PFiles = $prod.Files; PLines = $prod.Lines; TFiles = $test.Files; TLines = $test.Lines }
    }
}
$moduleRows = $moduleRows | Sort-Object PLines -Descending
foreach ($r in $moduleRows) {
    Write-Host ("  {0,-15} prod: {1,4} files {2,7:N0} lines | test: {3,3} files {4,6:N0} lines" -f $r.Module, $r.PFiles, $r.PLines, $r.TFiles, $r.TLines)
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " [6] src/  other layers" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
foreach ($layer in @("app", "domain", "infrastructure", "shared", "config")) {
    $lp = "src/$layer"
    if (Test-Path $lp) {
        $c = Count-FilesLines -Path $lp -Pattern @("*.ts", "*.tsx") -ExcludeRegex "(__tests__|__mocks__)"
        Write-Host ("  {0,-18} {1,4} files  {2,7:N0} lines" -f $layer, $c.Files, $c.Lines)
    }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " [7] contracts & module docs" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
$contractFiles = @(Get-ChildItem -Path "src/modules" -Recurse -File -Filter "contract.json" -ErrorAction SilentlyContinue)
$moduleMdFiles = @(Get-ChildItem -Path "src/modules" -Recurse -File -Filter "MODULE.md" -ErrorAction SilentlyContinue)
$contractLines = 0
foreach ($f in $contractFiles) {
    $content = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
    if ($null -ne $content) { $contractLines += ($content -split "`n").Count }
}
$moduleMdLines = 0
foreach ($f in $moduleMdFiles) {
    $content = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
    if ($null -ne $content) { $moduleMdLines += ($content -split "`n").Count }
}
Write-Host ("  contract.json: {0} files  {1,5:N0} lines" -f $contractFiles.Count, $contractLines)
Write-Host ("  MODULE.md:     {0} files  {1,5:N0} lines" -f $moduleMdFiles.Count, $moduleMdLines)

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " [8] scripts/  utility scripts" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
$scriptProd = Count-FilesLines -Path "scripts" -Pattern @("*.ts", "*.mjs", "*.js", "*.cjs")
Write-Host ("  files: {0}   lines: {1:N0}" -f $scriptProd.Files, $scriptProd.Lines)

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " [9] docs/  documentation" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
$docLines = Count-Md -Path "docs" -Filter "*.md"
Write-Host ("  *.md files: {0}  lines: {1:N0}" -f $docLines.Files, $docLines.Lines)

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " SUMMARY  -  effective code volume" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
$totalProd = $srcProd.Lines + $elecProd.Lines
$totalTest = $srcTest.Lines + $elecTest.Lines
$totalContracts = $contractLines + $moduleMdLines
$totalAll = $totalProd + $totalTest + $totalContracts + $scriptProd.Lines + $docLines.Lines
Write-Host ("  Production code (src + electron/src)   {0,8:N0} lines" -f $totalProd)
Write-Host ("  Test code                              {0,8:N0} lines" -f $totalTest)
Write-Host ("  Contracts & MODULE.md                  {0,8:N0} lines" -f $totalContracts)
Write-Host ("  scripts/ tools                         {0,8:N0} lines" -f $scriptProd.Lines)
Write-Host ("  docs/                                  {0,8:N0} lines" -f $docLines.Lines)
Write-Host ("  ----------------------------------------" -f "")
Write-Host ("  TOTAL                                  {0,8:N0} lines" -f $totalAll) -ForegroundColor Yellow
