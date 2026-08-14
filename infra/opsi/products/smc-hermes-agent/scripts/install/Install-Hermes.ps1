#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][string]$RequestId,
    [Parameter(Mandatory = $true)][string]$HermesVersion,
    [Parameter(Mandatory = $true)][string]$Root,
    [string]$ManagedUserSid = "",
    [switch]$Update
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\common\SmcOpsi.psm1") -Force

if (-not (Test-SmcExactVersion -Version $HermesVersion)) {
    throw "HermesVersion must be exact (not latest)"
}

$layout = Get-SmcProductLayout -AnchorPath $PSScriptRoot
$scriptPathArtifacts = Join-Path $layout.Artifacts "hermes-$HermesVersion-windows.zip"
$programDataArtifacts = Join-Path $Root "managed\artifacts\hermes-$HermesVersion-windows.zip"
$artifact = $null
if (Test-Path -LiteralPath $scriptPathArtifacts) { $artifact = $scriptPathArtifacts }
elseif (Test-Path -LiteralPath $programDataArtifacts) { $artifact = $programDataArtifacts }
if (-not $artifact) {
    throw "artifact missing: hermes-$HermesVersion-windows.zip (fail closed)"
}

$manifestPath = "$artifact.manifest.json"
if (-not (Test-Path -LiteralPath $manifestPath)) { $manifestPath = ($artifact -replace '\.zip$', '.manifest.json') }
if (-not (Test-Path -LiteralPath $manifestPath)) { throw "artifact manifest missing" }
$sigPath = "$artifact.sig"
if (-not (Test-Path -LiteralPath $sigPath)) { $sigPath = ($artifact -replace '\.zip$', '.sig') }
if (-not (Test-Path -LiteralPath $sigPath)) { throw "artifact signature missing" }
$pub = Join-Path $layout.Keys "release-public-key.pem"
if (-not (Test-Path -LiteralPath $pub)) { throw "release public key missing" }

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.version -ne $HermesVersion) { throw "manifest version mismatch" }
$actual = Get-FileHash -LiteralPath $artifact -Algorithm SHA256
if ($actual.Hash.ToLowerInvariant() -ne ([string]$manifest.sha256).ToLowerInvariant()) {
    throw "artifact sha256 mismatch"
}
$sigItem = Get-Item -LiteralPath $sigPath
if ($sigItem.Length -lt 64) { throw "artifact signature too small" }

$stagingDir = Join-Path $env:ProgramData "SMC\opsi\staging\$HermesVersion"
New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null
Copy-Item -LiteralPath $artifact, $manifestPath, $sigPath -Destination $stagingDir -Force

$current = Join-Path $Root "versions\current"
$previous = Join-Path $Root "versions\previous"
$versionJson = Join-Path $Root "state\version.json"
$previousVersion = ""
if (Test-Path -LiteralPath $versionJson) {
    try { $previousVersion = [string]((Get-Content -LiteralPath $versionJson -Raw | ConvertFrom-Json).version) } catch {}
}
if ($Update -and (Test-Path -LiteralPath $current)) {
    if (Test-Path -LiteralPath $previous) { Remove-Item -LiteralPath $previous -Recurse -Force }
    Copy-Item -LiteralPath $current -Destination $previous -Recurse -Force
}

$extract = Join-Path $stagingDir "payload"
New-Item -ItemType Directory -Force -Path $extract | Out-Null
if (Get-Command Expand-Archive -ErrorAction SilentlyContinue) {
    Expand-Archive -LiteralPath (Join-Path $stagingDir (Split-Path $artifact -Leaf)) -DestinationPath $extract -Force
}
New-Item -ItemType Directory -Force -Path $current | Out-Null
Copy-Item -Path (Join-Path $extract "*") -Destination $current -Recurse -Force

if (Test-SmcSystemProfilePath -Path $current) {
    throw "refusing systemprofile install path"
}

Write-SmcJsonAtomic -Path $versionJson -Object @{
    version          = $HermesVersion
    previousVersion  = $previousVersion
    packageRevision  = [string]$manifest.packageRevision
    artifactDigest   = [string]$manifest.sha256
    owner            = "pending"
    updatedAt        = [DateTime]::UtcNow.ToString("o")
}
# Owner file is written only after Gateway health by user bootstrap.
