# Build self-contained Runtime bundle (FR-14).
# Output: runtime-bundle-win-x64.zip
param(
    [string]$RepoRoot = "",
    [string]$OutputDir = "",
    [string]$Version = "0.0.0-dev"
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

# config placeholder
$configDest = Join-Path $bundleRoot "config"
@"
# Runtime bundle config
# Copy .env.example values here for enterprise installs.
"@ | Set-Content -Path (Join-Path $configDest "README.md") -Encoding UTF8
if (Test-Path (Join-Path $RepoRoot ".env.example")) {
    Copy-Item -Path (Join-Path $RepoRoot ".env.example") -Destination (Join-Path $configDest ".env.example") -Force
}

# site-packages placeholder (CI may populate via pip install --target)
@"
# site-packages
#
# CI should populate this directory with wheel-installed dependencies
# (pip install --target site-packages -r requirements.lock).
"@ | Set-Content -Path (Join-Path $bundleRoot "site-packages\README.md") -Encoding UTF8

# python: embeddable CPython placeholder (CI replaces with real embeddable Python)
$pythonReadme = @"
# Embeddable Python (win-amd64)

This folder is a placeholder. CI must replace it with the official
Windows embeddable Python 3.12 package:

  https://www.python.org/downloads/windows/

Extract embeddable zip contents here so that:

  python\python.exe
  python\python312._pth

exist before shipping runtime-bundle-win-x64.zip.

Employees should not need a system Python install when this bundle is complete.
"@
Set-Content -Path (Join-Path $bundleRoot "python\README.md") -Value $pythonReadme -Encoding UTF8

$manifest = @{
    name = "runtime-bundle"
    version = $Version
    platform = "windows"
    architecture = "x86_64"
    artifactType = "runtime-bundle"
    builtAt = (Get-Date).ToUniversalTime().ToString("o")
    layout = @{
        runtime = "Application source (src/, pyproject.toml)"
        python = "Embeddable CPython 3.12 (CI-populated)"
        sitePackages = "Pre-installed Python dependencies"
        scripts = "Windows provisioning and service scripts"
        migrations = "Alembic migrations"
        config = "Enterprise config templates"
    }
} | ConvertTo-Json -Depth 6
Set-Content -Path (Join-Path $bundleRoot "manifest.json") -Value $manifest -Encoding UTF8

$zipName = "runtime-bundle-win-x64.zip"
$zipPath = Join-Path $OutputDir $zipName
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $bundleRoot "*") -DestinationPath $zipPath -Force

Remove-Item -Path $staging -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Built $zipPath"
exit 0
