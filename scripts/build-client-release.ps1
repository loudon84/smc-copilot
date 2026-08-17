param(
    [ValidateSet("preflight", "work", "hermes", "runtime", "opsi-stage", "opsi-package", "assemble", "verify", "all")]
    [string]$Stage = "all",
    [string]$HermesRepo = "",
    [string]$OpsiClientInstaller = "",
    [string]$SigningKeyRef = "",
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
$argsList = @($py, $Stage)
if ($HermesRepo) { $argsList += @("--hermes-repo", $HermesRepo) }
if ($OpsiClientInstaller) { $argsList += @("--opsi-client-installer", $OpsiClientInstaller) }
if ($SigningKeyRef) { $argsList += @("--signing-key-ref", $SigningKeyRef) }
if ($Output) { $argsList += @("--output", $Output) }
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
