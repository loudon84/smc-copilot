#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][string]$RequestId,
    [Parameter(Mandatory = $true)][string]$HermesVersion,
    [Parameter(Mandatory = $true)][string]$Root,
    [switch]$Update
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\common\SmcOpsi.psm1") -Force

if (-not (Test-SmcExactVersion -Version $HermesVersion)) {
    throw "HermesVersion must be exact (not latest)"
}

$staging = Join-Path $Root "staging\$HermesVersion"
$versions = Join-Path $Root "versions\$HermesVersion"
$lkg = Join-Path $Root "versions\last-known-good"
New-Item -ItemType Directory -Force -Path $staging, (Split-Path $versions) | Out-Null

Write-SmcJsonAtomic -Path (Join-Path $Root "state\journal.json") -Object @{
    phase     = "prepare"
    requestId = $RequestId
    version   = $HermesVersion
    update    = [bool]$Update
}

# Artifact is expected at managed\artifacts\hermes-<version>.zip with sibling .sha256
$artifact = Join-Path $Root "managed\artifacts\hermes-$HermesVersion.zip"
$shaFile = "$artifact.sha256"
if (Test-Path -LiteralPath $artifact) {
    $expected = (Get-Content -LiteralPath $shaFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if (-not $expected) { throw "missing artifact sha256" }
    $actual = Get-FileHash -LiteralPath $artifact -Algorithm SHA256
    if ($actual.Hash.ToLowerInvariant() -ne $expected.Trim().ToLowerInvariant()) {
        throw "artifact sha256 mismatch"
    }
    New-Item -ItemType Directory -Force -Path $staging | Out-Null
    if (Get-Command Expand-Archive -ErrorAction SilentlyContinue) {
        Expand-Archive -LiteralPath $artifact -DestinationPath $staging -Force
    }
}

Write-SmcJsonAtomic -Path (Join-Path $Root "state\journal.json") -Object @{ phase = "apply"; version = $HermesVersion }
if (Test-Path -LiteralPath $versions) {
    if (Test-Path -LiteralPath $lkg) { Remove-Item -LiteralPath $lkg -Recurse -Force }
    Copy-Item -LiteralPath $versions -Destination $lkg -Recurse -Force
}
if (Test-Path -LiteralPath $staging) {
    New-Item -ItemType Directory -Force -Path $versions | Out-Null
    Copy-Item -Path (Join-Path $staging "*") -Destination $versions -Recurse -Force
}

$versionJson = Join-Path $Root "state\version.json"
Write-SmcJsonAtomic -Path $versionJson -Object @{
    version   = $HermesVersion
    owner     = "opsi"
    updatedAt = [DateTime]::UtcNow.ToString("o")
}

$ownerPath = Join-Path (Split-Path $Root) "control-owner.json"
Write-SmcJsonAtomic -Path $ownerPath -Object @{ hermes = "opsi" }

if (Test-SmcSystemProfilePath -Path $versions) {
    throw "refusing systemprofile install path"
}

Write-SmcJsonAtomic -Path (Join-Path $Root "state\journal.json") -Object @{ phase = "verify"; version = $HermesVersion }
Write-SmcJsonAtomic -Path (Join-Path $Root "state\journal.json") -Object @{ phase = "commit"; version = $HermesVersion }
