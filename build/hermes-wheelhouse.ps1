# Build Hermes offline wheelhouse artifact (FR-15).
# Output: hermes-agent-<version>-win-x64.zip
param(
    [string]$OutputDir = "",
    [string]$Version = "0.0.0-dev",
    [string]$PackageName = "",
    [string]$PythonPath = "python",
    [string]$RequirementsLock = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputDir) {
    $OutputDir = Join-Path $RepoRoot "dist"
}
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$staging = Join-Path $env:TEMP ("hermes-wheelhouse-" + [guid]::NewGuid().ToString("n"))
$artifactRoot = Join-Path $staging "artifact"
New-Item -ItemType Directory -Force -Path $artifactRoot | Out-Null

$wheelhouseDir = Join-Path $artifactRoot "wheelhouse"
New-Item -ItemType Directory -Force -Path $wheelhouseDir | Out-Null

$whlName = "hermes_agent-$Version-py3-none-any.whl"
$whlPath = Join-Path $artifactRoot $whlName
$downloaded = $false

if ($PackageName) {
    Write-Host "Downloading $PackageName==$Version into wheelhouse..."
    & $PythonPath -m pip download `
        --dest $wheelhouseDir `
        --only-binary=:all: `
        "$PackageName==$Version"
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "pip download failed; scaffolding empty wheelhouse"
    } else {
        $downloadedWhls = Get-ChildItem -Path $wheelhouseDir -Filter "*.whl" -ErrorAction SilentlyContinue
        if ($downloadedWhls) {
            $primary = $downloadedWhls | Where-Object { $_.Name -like "hermes*" } | Select-Object -First 1
            if (-not $primary) { $primary = $downloadedWhls | Select-Object -First 1 }
            Copy-Item -Path $primary.FullName -Destination $whlPath -Force
            $downloaded = $true
            $whlName = $primary.Name
        }
    }
}

if (-not (Test-Path $whlPath)) {
    @"
# Placeholder wheel for $PackageName $Version
# Replace with real hermes_agent wheel before publishing.
"@ | Set-Content -Path $whlPath -Encoding UTF8
}

if ($RequirementsLock -and (Test-Path $RequirementsLock)) {
    Copy-Item -Path $RequirementsLock -Destination (Join-Path $artifactRoot "requirements.lock") -Force
} else {
    @"
# requirements.lock
# Pin transitive deps used by pip download into wheelhouse/
$PackageName==$Version
"@ | Set-Content -Path (Join-Path $artifactRoot "requirements.lock") -Encoding UTF8
}

$artifactJson = @{
    name = "hermes-agent"
    version = $Version
    platform = "windows"
    architecture = "x86_64"
    artifactType = "wheel-bundle"
    wheel = $whlName
    wheelhouse = "wheelhouse"
    offlineInstall = @{
        command = "python -m pip install --no-index --find-links wheelhouse $whlName"
    }
    pipDownloadAttempted = [bool]$PackageName
    pipDownloadSucceeded = $downloaded
    builtAt = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json -Depth 6
Set-Content -Path (Join-Path $artifactRoot "artifact.json") -Value $artifactJson -Encoding UTF8

$zipName = "hermes-agent-$Version-win-x64.zip"
$zipPath = Join-Path $OutputDir $zipName
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $artifactRoot "*") -DestinationPath $zipPath -Force

Remove-Item -Path $staging -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Built $zipPath"
exit 0
