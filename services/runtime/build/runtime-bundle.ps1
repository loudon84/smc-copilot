# Build self-contained Runtime bundle (PRD v1.5 FR-01).
# Output: runtime-bundle-<version>-win-x64.zip
# Refuses placeholder python/site-packages — Stable must ship real embeddable Python.
param(
    [string]$RepoRoot = "",
    [string]$OutputDir = "",
    [string]$Version = "1.6.0",
    [string]$EmbeddablePythonZip = "",
    [string]$SitePackagesSource = "",
    [string]$LauncherExe = "",
    [switch]$AllowDevPlaceholder
)

$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}
$RepoRoot = (Resolve-Path $RepoRoot).Path

if (-not $OutputDir) {
    $OutputDir = Join-Path $RepoRoot "dist"
}
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$staging = Join-Path $env:TEMP ("runtime-bundle-" + [guid]::NewGuid().ToString("n"))
$bundleRoot = Join-Path $staging "bundle"
New-Item -ItemType Directory -Force -Path $bundleRoot | Out-Null

$dirs = @("runtime", "python", "site-packages", "scripts", "migrations", "config")
foreach ($d in $dirs) {
    New-Item -ItemType Directory -Force -Path (Join-Path $bundleRoot $d) | Out-Null
}

# runtime: application source
$runtimeDest = Join-Path $bundleRoot "runtime"
Copy-Item -Path (Join-Path $RepoRoot "src") -Destination (Join-Path $runtimeDest "src") -Recurse -Force
if (Test-Path (Join-Path $RepoRoot "pyproject.toml")) {
    Copy-Item -Path (Join-Path $RepoRoot "pyproject.toml") -Destination $runtimeDest -Force
}

# scripts
$scriptsDest = Join-Path $bundleRoot "scripts"
Get-ChildItem -Path (Join-Path $RepoRoot "scripts") -File | Copy-Item -Destination $scriptsDest -Force

# migrations
$migrationsDest = Join-Path $bundleRoot "migrations"
Copy-Item -Path (Join-Path $RepoRoot "migrations\*") -Destination $migrationsDest -Recurse -Force

# config
$configDest = Join-Path $bundleRoot "config"
if (Test-Path (Join-Path $RepoRoot ".env.example")) {
    Copy-Item -Path (Join-Path $RepoRoot ".env.example") -Destination (Join-Path $configDest ".env.example") -Force
}

# --- Embeddable Python (required for Stable) ---
$pythonDir = Join-Path $bundleRoot "python"
if ($EmbeddablePythonZip -and (Test-Path $EmbeddablePythonZip)) {
    Write-Host "Extracting embeddable Python from $EmbeddablePythonZip"
    Expand-Archive -Path $EmbeddablePythonZip -DestinationPath $pythonDir -Force
} elseif ($env:RUNTIME_EMBEDDABLE_PYTHON_ZIP -and (Test-Path $env:RUNTIME_EMBEDDABLE_PYTHON_ZIP)) {
    Write-Host "Extracting embeddable Python from `$env:RUNTIME_EMBEDDABLE_PYTHON_ZIP"
    Expand-Archive -Path $env:RUNTIME_EMBEDDABLE_PYTHON_ZIP -DestinationPath $pythonDir -Force
} elseif ($AllowDevPlaceholder) {
    Write-Warning "AllowDevPlaceholder: copying host python layout markers only (NOT for Stable)"
    @"
# DEV PLACEHOLDER — not a shippable runtime
"@ | Set-Content -Path (Join-Path $pythonDir "DEV_PLACEHOLDER") -Encoding UTF8
} else {
    throw "Embeddable Python zip required (pass -EmbeddablePythonZip or set RUNTIME_EMBEDDABLE_PYTHON_ZIP). Refuse placeholder README."
}

$pythonExe = Join-Path $pythonDir "python.exe"
if (-not (Test-Path $pythonExe) -and -not $AllowDevPlaceholder) {
    throw "python\python.exe missing after extract — aborting bundle"
}

# --- site-packages ---
$siteDest = Join-Path $bundleRoot "site-packages"
if ($SitePackagesSource -and (Test-Path $SitePackagesSource)) {
    Copy-Item -Path (Join-Path $SitePackagesSource "*") -Destination $siteDest -Recurse -Force
} elseif ($env:RUNTIME_SITE_PACKAGES_DIR -and (Test-Path $env:RUNTIME_SITE_PACKAGES_DIR)) {
    Copy-Item -Path (Join-Path $env:RUNTIME_SITE_PACKAGES_DIR "*") -Destination $siteDest -Recurse -Force
} elseif ($AllowDevPlaceholder) {
    Write-Warning "AllowDevPlaceholder: empty site-packages (NOT for Stable)"
} else {
    # Install project into target using host pip
    Write-Host "Installing project deps into site-packages via pip --target"
    & python -m pip install --upgrade pip
    & python -m pip install --target $siteDest (Join-Path $RepoRoot ".")
    if ($LASTEXITCODE -ne 0) {
        throw "pip install --target site-packages failed"
    }
}

$pyFiles = Get-ChildItem -Path $siteDest -Recurse -Filter "*.py" -ErrorAction SilentlyContinue
if (-not $pyFiles -and -not $AllowDevPlaceholder) {
    throw "site-packages appears empty — refuse README-only placeholder"
}

# runtime-launcher: prefer real PyInstaller CopilotRuntime.exe (PRD v1.6 FR-002)
if ($LauncherExe -and (Test-Path $LauncherExe)) {
    Copy-Item -Path $LauncherExe -Destination (Join-Path $bundleRoot "CopilotRuntime.exe") -Force
    Write-Host "Bundled real launcher: $LauncherExe"
} elseif ($env:RUNTIME_LAUNCHER_EXE -and (Test-Path $env:RUNTIME_LAUNCHER_EXE)) {
    Copy-Item -Path $env:RUNTIME_LAUNCHER_EXE -Destination (Join-Path $bundleRoot "CopilotRuntime.exe") -Force
}

$launcherPs1 = Join-Path $bundleRoot "runtime-launcher.ps1"
@"
# Runtime launcher shim (v1.6) — prefer CopilotRuntime.exe when present
param([Parameter(ValueFromRemainingArguments=`$true)][string[]]`$ArgsRest)
`$ErrorActionPreference = 'Stop'
`$Root = Split-Path -Parent `$MyInvocation.MyCommand.Path
`$Exe = Join-Path `$Root 'CopilotRuntime.exe'
if (Test-Path `$Exe) {
  & `$Exe --install-root `$Root @ArgsRest
  exit `$LASTEXITCODE
}
`$Py = Join-Path `$Root 'python\python.exe'
`$Env:PYTHONPATH = (Join-Path `$Root 'runtime\src') + [IO.Path]::PathSeparator + (Join-Path `$Root 'site-packages')
if (-not (Test-Path `$Py)) { throw 'python\python.exe not found in bundle' }
& `$Py -m main @ArgsRest
exit `$LASTEXITCODE
"@ | Set-Content -Path $launcherPs1 -Encoding UTF8

# Also expose a .cmd for Windows double-click / installer (fallback only)
@"
@echo off
if exist "%~dp0CopilotRuntime.exe" (
  "%~dp0CopilotRuntime.exe" --install-root "%~dp0." %*
  exit /b %ERRORLEVEL%
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0runtime-launcher.ps1" %*
"@ | Set-Content -Path (Join-Path $bundleRoot "runtime-launcher.cmd") -Encoding ASCII

$manifest = @{
    name = "runtime-bundle"
    version = $Version
    platform = "windows"
    architecture = "x86_64"
    artifactType = "runtime-bundle"
    builtAt = (Get-Date).ToUniversalTime().ToString("o")
    placeholder = [bool]$AllowDevPlaceholder
    layout = @{
        runtime = "Application source (src/, pyproject.toml)"
        python = "Embeddable CPython 3.12"
        sitePackages = "Pre-installed Python dependencies"
        scripts = "Windows provisioning and service scripts"
        migrations = "Alembic migrations"
        config = "Enterprise config templates"
        launcher = "CopilotRuntime.exe / runtime-launcher.ps1 / runtime-launcher.cmd"
    }
} | ConvertTo-Json -Depth 6
Set-Content -Path (Join-Path $bundleRoot "manifest.json") -Value $manifest -Encoding UTF8

if ($AllowDevPlaceholder) {
    Write-Warning "Bundle marked placeholder=true — must not enter Stable channel"
}

$zipName = "runtime-bundle-$Version-win-x64.zip"
$zipPath = Join-Path $OutputDir $zipName
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $bundleRoot "*") -DestinationPath $zipPath -Force

# Compatibility alias used by older CI
$aliasPath = Join-Path $OutputDir "runtime-bundle-win-x64.zip"
Copy-Item -Path $zipPath -Destination $aliasPath -Force

Remove-Item -Path $staging -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Built $zipPath"
exit 0
