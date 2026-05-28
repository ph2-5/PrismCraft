$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$env:BUILD_TARGET = "electron"

$nextCacheDir = Join-Path $projectDir ".next"
if (Test-Path $nextCacheDir) {
    Remove-Item -Path $nextCacheDir -Recurse -Force
    Write-Host "Cleared .next cache for clean build"
}

$apiDir = Join-Path $projectDir "src\app\api"
$apiBackupDir = Join-Path $projectDir "src\app\_api_build_backup"
$apiBackedUp = $false

if (Test-Path $apiDir) {
    Move-Item -Path $apiDir -Destination $apiBackupDir -Force
    $apiBackedUp = $true
    Write-Host "Temporarily moved API routes for static export compatibility"
}

try {
    $buildResult = 0
    try {
        $ErrorActionPreference = "Continue"
        npx next build 2>&1 | ForEach-Object { Write-Host $_ }
        $buildResult = $LASTEXITCODE
        $ErrorActionPreference = "Stop"
    } catch {
        $buildResult = 1
    }

    if ($buildResult -ne 0 -and -not (Test-Path (Join-Path $projectDir "out\index.html"))) {
        Write-Error "Next.js build failed with exit code $buildResult"
        exit $buildResult
    }

    $ErrorActionPreference = "Continue"
    npx tsc -p electron/tsconfig.json 2>&1 | ForEach-Object { Write-Host $_ }
    $tscResult = $LASTEXITCODE
    $ErrorActionPreference = "Stop"
    if ($tscResult -ne 0 -and -not (Test-Path (Join-Path $projectDir "electron\dist\main.js"))) {
        Write-Error "Electron TypeScript compilation failed"
        exit $tscResult
    }

    if (-not (Test-Path "out")) {
        New-Item -ItemType Directory -Path "out" -Force | Out-Null
    }

    Copy-Item -Path "electron\dist\*" -Destination "out\" -Recurse -Force

    $docsOutDir = Join-Path $projectDir "out\docs"
    if (-not (Test-Path -LiteralPath $docsOutDir)) {
        New-Item -ItemType Directory -Path $docsOutDir -Force | Out-Null
    }
    Copy-Item -Path (Join-Path $projectDir "docs\plugin-spec.schema.json") -Destination $docsOutDir -Force
    Copy-Item -Path (Join-Path $projectDir "docs\plugin-specification.md") -Destination $docsOutDir -Force
    Write-Host "Copied plugin docs to out/docs"

    Write-Host "Electron build completed successfully!"
} finally {
    if ($apiBackedUp -and (Test-Path $apiBackupDir)) {
        if (Test-Path $apiDir) {
            Remove-Item -Path $apiDir -Recurse -Force
        }
        Move-Item -Path $apiBackupDir -Destination $apiDir -Force
        Write-Host "Restored API routes"
    }
}
