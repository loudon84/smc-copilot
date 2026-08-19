param(
    [ValidateSet("preflight", "work", "hermes", "runtime", "opsi-stage", "opsi-package", "assemble", "verify", "all")]
    [string]$Stage = "all",
    [string]$HermesRepo = "",
    [string]$OpsiClientInstaller = "",
    [string]$Output = "",
    [string]$WorkDist = "",
    [string]$HermesZip = "",
    [string]$OpsiPackage = "",
    [string]$Wheelhouse = "",
    [string]$NodeRoot = "",
    [ValidateSet("online", "offline")][string]$Mode = "online",
    [ValidateSet("zipfile", "native")][string]$OpsiTooling = "native",
    [switch]$AllowDirty
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$py = Join-Path $root "tools\release\client\build_client_release.py"
$outputDir = if ($Output) { $Output } else { Join-Path $root "dist" }
$keyDir = Join-Path $outputDir "keys"
$keyPath = Join-Path $keyDir "TEST-ONLY-hermes-release.pem"
if (-not (Test-Path -LiteralPath $keyDir)) {
    New-Item -ItemType Directory -Force -Path $keyDir | Out-Null
}
if (-not (Test-Path -LiteralPath $keyPath)) {
    $env:SMC_LAB_SIGNING_KEY = $keyPath
    $keyGen = @'
from pathlib import Path
import os
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization
path = Path(os.environ["SMC_LAB_SIGNING_KEY"])
path.parent.mkdir(parents=True, exist_ok=True)
key = Ed25519PrivateKey.generate()
path.write_bytes(
    key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
)
'@
    $keyGen | & python -
    Remove-Item Env:\SMC_LAB_SIGNING_KEY
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $keyPath)) {
        throw "failed to generate lab signing key: $keyPath"
    }
}

$argsList = @($py, $Stage, "--signing-key-ref", $keyPath, "--output", $outputDir)
if ($HermesRepo) { $argsList += @("--hermes-repo", $HermesRepo) }
if ($OpsiClientInstaller) { $argsList += @("--opsi-client-installer", $OpsiClientInstaller) }
if ($WorkDist) { $argsList += @("--work-dist", $WorkDist) }
if ($HermesZip) { $argsList += @("--hermes-zip", $HermesZip) }
if ($OpsiPackage) { $argsList += @("--opsi-package", $OpsiPackage) }
if ($Wheelhouse) { $argsList += @("--wheelhouse", $Wheelhouse) }
if ($NodeRoot) { $argsList += @("--node-root", $NodeRoot) }
if ($Mode) { $argsList += @("--mode", $Mode) }
if ($OpsiTooling) { $argsList += @("--opsi-tooling", $OpsiTooling) }
if ($AllowDirty) { $argsList += "--allow-dirty" }
& python @argsList
if ($LASTEXITCODE -ne 0) { throw "client release build failed" }

$manifest = Get-ChildItem -LiteralPath $outputDir -Recurse -Filter "release-manifest.json" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
if ($null -ne $manifest) {
    $payload = Get-Content -LiteralPath $manifest.FullName -Encoding UTF8 -Raw | ConvertFrom-Json
    if ($payload.PSObject.Properties.Name -contains "releaseVersion" -and $payload.releaseVersion) {
        Write-Output ("releaseVersion={0}" -f [string]$payload.releaseVersion)
    }
}
