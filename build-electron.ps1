$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiDir = Join-Path $projectDir "src\app\api"
$apiBakDir = Join-Path $projectDir "src\app\_api_bak_electron"

$lockFile = Join-Path $projectDir ".build-electron.lock"

if (Test-Path -LiteralPath $lockFile) {
    Write-Host "WARNING: Stale build lock file found — previous build may have been interrupted"
    Write-Host "Attempting to restore any moved directories..."
    if (Test-Path -LiteralPath $apiBakDir) {
        if (Test-Path -LiteralPath $apiDir) { Remove-Item -LiteralPath $apiDir -Recurse -Force }
        Move-Item -LiteralPath $apiBakDir $apiDir -Force
        Write-Host "Restored api directory from previous interrupted build"
    }
    Remove-Item -LiteralPath $lockFile -Force -ErrorAction SilentlyContinue
}

New-Item -ItemType File -Path $lockFile -Force | Out-Null

function Restore-ApiDir {
    if (Test-Path -LiteralPath $apiBakDir) {
        if (Test-Path -LiteralPath $apiDir) {
            Remove-Item -LiteralPath $apiDir -Recurse -Force
        }
        Move-Item -LiteralPath $apiBakDir $apiDir -Force
        Write-Host "Restored api directory"
    }
    if (Test-Path -LiteralPath $lockFile) {
        Remove-Item -LiteralPath $lockFile -Force -ErrorAction SilentlyContinue
    }
}

try {
    $env:BUILD_TARGET = "electron"

    if (Test-Path -LiteralPath $apiDir) {
        Move-Item -LiteralPath $apiDir $apiBakDir -Force
        Write-Host "Temporarily moved api -> _api_bak_electron"
    }

    $buildResult = 0
    try {
        $ErrorActionPreference = "Continue"
        npx next build 2>&1 | ForEach-Object { Write-Host $_ }
        $buildResult = $LASTEXITCODE
        $ErrorActionPreference = "Stop"
    } finally {
        Restore-ApiDir
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
    Restore-ApiDir
}
