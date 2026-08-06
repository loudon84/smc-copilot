# Build Hermes offline wheelhouse artifact (PRD v1.5 FR-02).
# Output: hermes-agent-<version>-win-x64.zip
# Refuses placeholder wheels — Stable must ship hashed real packages.
param(
    [string]$OutputDir = "",
    [string]$Version = "0.0.0-dev",
    [string]$PackageName = "",
    [string]$PythonPath = "python",
    [string]$RequirementsLock = "",
    [string]$WheelSource = "",
    [switch]$AllowDevPlaceholder
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

$whlName = $null
$whlPath = $null
$downloaded = $false

if ($WheelSource -and (Test-Path $WheelSource)) {
    $src = Get-Item $WheelSource
    if ($src.PSIsContainer) {
        Copy-Item -Path (Join-Path $WheelSource "*") -Destination $wheelhouseDir -Recurse -Force
        $primary = Get-ChildItem -Path $wheelhouseDir -Filter "*.whl" | Select-Object -First 1
        if (-not $primary) { throw "WheelSource directory has no .whl files" }
        $whlName = $primary.Name
        $whlPath = Join-Path $artifactRoot $whlName
        Copy-Item -Path $primary.FullName -Destination $whlPath -Force
        $downloaded = $true
    } else {
        $whlName = $src.Name
        $whlPath = Join-Path $artifactRoot $whlName
        Copy-Item -Path $src.FullName -Destination $whlPath -Force
        Copy-Item -Path $src.FullName -Destination (Join-Path $wheelhouseDir $whlName) -Force
        $downloaded = $true
    }
} elseif ($PackageName) {
    Write-Host "Downloading $PackageName==$Version into wheelhouse (offline preference: provide -WheelSource)..."
    & $PythonPath -m pip download `
        --dest $wheelhouseDir `
        --only-binary=:all: `
        "$PackageName==$Version"
    if ($LASTEXITCODE -ne 0) {
        if ($AllowDevPlaceholder) {
            Write-Warning "pip download failed; AllowDevPlaceholder set"
        } else {
            throw "pip download failed for $PackageName==$Version — refuse placeholder wheel"
        }
    } else {
        $downloadedWhls = Get-ChildItem -Path $wheelhouseDir -Filter "*.whl" -ErrorAction SilentlyContinue
        if ($downloadedWhls) {
            $primary = $downloadedWhls | Where-Object { $_.Name -like "hermes*" } | Select-Object -First 1
            if (-not $primary) { $primary = $downloadedWhls | Select-Object -First 1 }
            $whlName = $primary.Name
            $whlPath = Join-Path $artifactRoot $whlName
            Copy-Item -Path $primary.FullName -Destination $whlPath -Force
            $downloaded = $true
        }
    }
}

if (-not $whlPath -or -not (Test-Path $whlPath)) {
    if ($AllowDevPlaceholder) {
        Write-Warning "AllowDevPlaceholder: writing non-shippable marker (NOT for Stable)"
        $whlName = "hermes_agent-$Version-py3-none-any.PLACEHOLDER"
        $whlPath = Join-Path $artifactRoot $whlName
        "DEV_PLACEHOLDER" | Set-Content -Path $whlPath -Encoding UTF8
    } else {
        throw "No real hermes wheel produced. Pass -WheelSource or -PackageName with reachable index. Placeholder wheels are forbidden."
    }
}

# Reject text placeholders posing as wheels
$contentSample = Get-Content -Path $whlPath -TotalCount 1 -ErrorAction SilentlyContinue
if ($contentSample -match "Placeholder|DEV_PLACEHOLDER" -and -not $AllowDevPlaceholder) {
    throw "Detected placeholder wheel content — abort"
}
if ($whlPath -like "*.whl") {
    # ZIP/wheel magic: PK
    $bytes = [System.IO.File]::ReadAllBytes($whlPath)
    if ($bytes.Length -lt 4 -or $bytes[0] -ne 0x50 -or $bytes[1] -ne 0x4B) {
        if (-not $AllowDevPlaceholder) {
            throw "Wheel file is not a valid ZIP (missing PK header)"
        }
    }
}

if ($RequirementsLock -and (Test-Path $RequirementsLock)) {
    Copy-Item -Path $RequirementsLock -Destination (Join-Path $artifactRoot "requirements.lock") -Force
} else {
    $lockLines = @()
    Get-ChildItem -Path $wheelhouseDir -Filter "*.whl" -ErrorAction SilentlyContinue | ForEach-Object {
        $hash = (Get-FileHash -Path $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        $lockLines += "$($_.Name) --hash=sha256:$hash"
    }
    if (-not $lockLines -and $PackageName) {
        $lockLines = @("$PackageName==$Version")
    }
    if (-not $lockLines -and -not $AllowDevPlaceholder) {
        throw "requirements.lock would be empty — refuse"
    }
    Set-Content -Path (Join-Path $artifactRoot "requirements.lock") -Value ($lockLines -join "`n") -Encoding UTF8
}

# Minimal SPDX SBOM
$sbom = @{
    spdxVersion = "SPDX-2.3"
    dataLicense = "CC0-1.0"
    SPDXID = "SPDXRef-DOCUMENT"
    name = "hermes-agent-$Version"
    documentNamespace = "https://smc.local/spdx/hermes-agent/$Version"
    creationInfo = @{
        created = (Get-Date).ToUniversalTime().ToString("o")
        creators = @("Tool: hermes-wheelhouse.ps1")
    }
    packages = @(
        @{
            name = "hermes-agent"
            SPDXID = "SPDXRef-hermes-agent"
            versionInfo = $Version
            downloadLocation = "NOASSERTION"
        }
    )
} | ConvertTo-Json -Depth 6
Set-Content -Path (Join-Path $artifactRoot "SBOM.spdx.json") -Value $sbom -Encoding UTF8

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
    placeholder = [bool]$AllowDevPlaceholder
    builtAt = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json -Depth 6
Set-Content -Path (Join-Path $artifactRoot "artifact.json") -Value $artifactJson -Encoding UTF8

if ($AllowDevPlaceholder) {
    Write-Warning "Wheelhouse marked placeholder=true — must not enter Stable channel"
}

$zipName = "hermes-agent-$Version-win-x64.zip"
$zipPath = Join-Path $OutputDir $zipName
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $artifactRoot "*") -DestinationPath $zipPath -Force

Remove-Item -Path $staging -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Built $zipPath"
exit 0
