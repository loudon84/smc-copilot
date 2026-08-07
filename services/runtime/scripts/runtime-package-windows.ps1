# Hermes Runtime package (Windows) — PRD v1.2 §22
# Builds a distributable folder under dist/windows-package/ with:
#   - wheel (uv build)
#   - install bootstrap scripts
#   - VERSION file
#   - SHA256 checksums
#   - Alembic migrations copy
#   - service scripts (if present)
#
# Distinct from provision-windows (which runs install/provision on a machine).
param(
    [string]$RepoRoot = $PSScriptRoot + "\..",
    [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path $RepoRoot).Path
Set-Location $RepoRoot

if (-not $OutDir) {
    $OutDir = Join-Path $RepoRoot "dist\windows-package"
}

Write-Host "== runtime-package-windows =="
Write-Host "  RepoRoot: $RepoRoot"
Write-Host "  OutDir:   $OutDir"

if (Test-Path $OutDir) {
    Remove-Item -Recurse -Force $OutDir
}
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$wheelsDir = Join-Path $OutDir "wheels"
$scriptsDir = Join-Path $OutDir "scripts"
$migrationsDir = Join-Path $OutDir "migrations"
$serviceDir = Join-Path $OutDir "service"
New-Item -ItemType Directory -Path $wheelsDir, $scriptsDir, $migrationsDir, $serviceDir -Force | Out-Null

# 1) Build wheel via uv
Write-Host "Building wheel (uv build)..."
$distBuild = Join-Path $RepoRoot "dist"
& uv build --out-dir $distBuild
if ($LASTEXITCODE -ne 0) { throw "uv build failed" }

$wheels = Get-ChildItem -Path $distBuild -Filter "*.whl" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending
if (-not $wheels) {
    throw "No .whl produced under $distBuild"
}
Copy-Item -Path $wheels[0].FullName -Destination $wheelsDir -Force
Write-Host "  wheel: $($wheels[0].Name)"

# Also copy sdist if present (optional)
$sdists = Get-ChildItem -Path $distBuild -Filter "*.tar.gz" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending
if ($sdists) {
    Copy-Item -Path $sdists[0].FullName -Destination $wheelsDir -Force
}

# 2) Install / provision bootstrap scripts
$bootstrapScripts = @(
    "runtime-install-windows.ps1",
    "runtime-install-windows.cmd",
    "runtime-provision-windows.ps1",
    "runtime-provision-windows.cmd",
    "runtime-precheck-windows.ps1",
    "bootstrap-windows.ps1",
    "migrate-windows.ps1",
    "runtime-start-windows.cmd",
    "runtime-smoke-test-windows.ps1",
    "runtime-upgrade-windows.ps1",
    "runtime-uninstall-windows.ps1"
)
foreach ($name in $bootstrapScripts) {
    $src = Join-Path $PSScriptRoot $name
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination $scriptsDir -Force
    }
}

# 3) Version file from pyproject.toml
$pyproject = Get-Content (Join-Path $RepoRoot "pyproject.toml") -Raw
if ($pyproject -match '(?m)^version\s*=\s*"([^"]+)"') {
    $version = $Matches[1]
} else {
    throw "Could not parse version from pyproject.toml"
}
$versionPath = Join-Path $OutDir "VERSION"
Set-Content -Path $versionPath -Value $version -Encoding UTF8
Write-Host "  VERSION: $version"

# 4) Manifest
$manifest = @{
    name = "smc-copilot-runtime"
    version = $version
    builtAt = (Get-Date).ToUniversalTime().ToString("o")
    wheel = $wheels[0].Name
    components = @("wheel", "scripts", "migrations", "service", "VERSION", "SHA256SUMS")
} | ConvertTo-Json -Depth 4
Set-Content -Path (Join-Path $OutDir "manifest.json") -Value $manifest -Encoding UTF8

# 5) Migrations copy
$migSrc = Join-Path $RepoRoot "migrations"
if (Test-Path $migSrc) {
    Copy-Item -Path (Join-Path $migSrc "*") -Destination $migrationsDir -Recurse -Force
    Copy-Item -Path (Join-Path $RepoRoot "alembic.ini") -Destination $OutDir -Force -ErrorAction SilentlyContinue
}

# 6) Service scripts
$serviceScripts = @(
    "service-install.ps1",
    "service-uninstall.ps1",
    "service-start.ps1",
    "service-stop.ps1",
    "service-status.ps1",
    "service-dev.ps1"
)
foreach ($name in $serviceScripts) {
    $src = Join-Path $PSScriptRoot $name
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination $serviceDir -Force
    }
}

# 7) SHA256 checksums for package contents
Write-Host "Writing SHA256SUMS..."
$sumsPath = Join-Path $OutDir "SHA256SUMS"
$lines = @()
Get-ChildItem -Path $OutDir -Recurse -File | Where-Object { $_.Name -ne "SHA256SUMS" } | ForEach-Object {
    $hash = (Get-FileHash -Path $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $rel = $_.FullName.Substring($OutDir.Length).TrimStart("\", "/") -replace "\\", "/"
    $lines += "$hash  $rel"
}
Set-Content -Path $sumsPath -Value ($lines -join "`n") -Encoding UTF8

Write-Host "Runtime Windows package ready: $OutDir"
Write-Host "  files: $($lines.Count)"
