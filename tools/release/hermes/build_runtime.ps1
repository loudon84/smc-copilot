param(
    [Parameter(Mandatory = $true)][string]$Repo,
    [Parameter(Mandatory = $true)][string]$Dest,
    [Parameter(Mandatory = $true)][string]$Wheelhouse,
    [string]$Profile = "smc-managed",
    [string]$HermesVersion = "",
    [string]$NodeRoot = "",
    [string]$Wheel = "",
    [switch]$AllowDirty
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$argsList = @(
    (Join-Path $PSScriptRoot "build_runtime.py"),
    "--repo", $Repo,
    "--dest", $Dest,
    "--wheelhouse", $Wheelhouse,
    "--profile", $Profile
)
if ($HermesVersion) { $argsList += @("--hermes-version", $HermesVersion) }
if ($NodeRoot) { $argsList += @("--node-root", $NodeRoot) }
if ($Wheel) { $argsList += @("--wheel", $Wheel) }
if ($AllowDirty) { $argsList += "--allow-dirty" }
& python @argsList
if ($LASTEXITCODE -ne 0) { throw "hermes runtime build failed" }
