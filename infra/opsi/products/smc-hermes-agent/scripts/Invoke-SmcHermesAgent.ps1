#Requires -Version 5.1
<#
.SYNOPSIS
  Thin OPSI bootstrap: validate request, verify/install Controller, dispatch installed entrypoint.
  Does not run Hermes mutation from Product Cache.
#>
param(
    [Parameter(Mandatory = $true)][ValidateSet("setup", "update", "uninstall", "custom")][string]$Action,
    [Parameter(Mandatory = $true)][string]$RequestId,
    [string]$CustomOperation = "",
    [string]$HermesVersion = "",
    [Parameter(Mandatory = $true)][string]$ClientId,
    [int]$ConfigRevision = 0,
    [int]$AutoRepairLevel = 1,
    [int]$GatewayPort = 8642,
    [string]$ManagedUserSid = "",
    [string]$ManagedUserAccount = "",
    [string]$ManagedProfile = "default",
    [int]$DiagnosticLogLines = 200,
    [string]$ConfigDigest = "",
    [string]$ConfigPayload = "",
    [string]$GatewayAutostart = "true",
    [string]$AckToken = "",
    [string]$ControllerRevision = "2"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Import-Module (Join-Path $here "common\SmcOpsi.psm1") -Force
$controllerModule = Join-Path $here "..\controller\SmcController.psm1"
if (Test-Path -LiteralPath $controllerModule) {
    Import-Module $controllerModule -Force
}

if (-not (Test-SmcAllowlistedParam -Name "RequestId" -Value $RequestId -MaxLength 80 -Pattern '^req_[A-Za-z0-9_-]{8,64}$')) {
    throw "RequestId must match req_*"
}
if (-not (Test-SmcAllowlistedParam -Name "ClientId" -Value $ClientId -MaxLength 128 -Pattern '^[A-Za-z0-9._-]+$')) {
    throw "ClientId must be a validated OPSI FQDN id, not COMPUTERNAME"
}

$allowedCustom = @("status", "collect-log", "apply-config", "restart-gateway", "diagnose", "repair", "reconcile-controller")
if ($Action -eq "custom" -and $allowedCustom -notcontains $CustomOperation) {
    Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status "FAILED" -ErrorCode "UNKNOWN_OPERATION" -Message "custom_operation not allowlisted"
    exit 2
}
if ($HermesVersion -eq "latest") {
    Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status "FAILED" -ErrorCode "VERSION_NOT_PINNED" -Message "latest is forbidden"
    exit 3
}

$productController = Join-Path $here "..\controller"
if ((Test-Path -LiteralPath $productController) -and (Get-Command Install-SmcControllerBundle -ErrorAction SilentlyContinue)) {
    Install-SmcControllerBundle -Source $productController -Revision $ControllerRevision | Out-Null
}

$root = Get-SmcOpsiRoot
foreach ($pair in @(
        @{ Src = (Join-Path $here "..\CLIENT_DATA\artifacts"); Dst = (Join-Path $root "managed\artifacts") },
        @{ Src = (Join-Path $here "..\CLIENT_DATA\keys"); Dst = (Join-Path $root "keys") }
    )) {
    if (Test-Path -LiteralPath $pair.Src) {
        New-Item -ItemType Directory -Force -Path $pair.Dst | Out-Null
        Copy-Item -Path (Join-Path $pair.Src "*") -Destination $pair.Dst -Recurse -Force
    }
}
$currentPath = Join-Path $root "controller\current.json"
if (-not (Test-Path -LiteralPath $currentPath)) {
    Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status "FAILED" -ErrorCode "CONTROLLER_MISSING" -Message "installed controller pointer missing"
    exit 1
}
$current = Get-Content -LiteralPath $currentPath -Raw | ConvertFrom-Json
$installed = [string]$current.path
$entryName = [string]$current.entrypoint
if (-not $entryName) { $entryName = "Invoke-SmcEndpointController.ps1" }
$entry = Join-Path $installed $entryName
if (-not (Test-Path -LiteralPath $entry)) {
    Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status "FAILED" -ErrorCode "CONTROLLER_MISSING" -Message "installed entrypoint missing"
    exit 1
}
$selfFull = [System.IO.Path]::GetFullPath($MyInvocation.MyCommand.Path)
$entryFull = [System.IO.Path]::GetFullPath($entry)
if ($selfFull -eq $entryFull) {
    throw "thin bootstrap must not execute as installed entrypoint"
}

$dispatch = @{
    Action               = $Action
    RequestId            = $RequestId
    CustomOperation      = $CustomOperation
    HermesVersion        = $HermesVersion
    ClientId             = $ClientId
    ConfigRevision       = $ConfigRevision
    AutoRepairLevel      = $AutoRepairLevel
    GatewayPort          = $GatewayPort
    ManagedUserSid       = $ManagedUserSid
    ManagedUserAccount   = $ManagedUserAccount
    ManagedProfile       = $ManagedProfile
    DiagnosticLogLines   = $DiagnosticLogLines
    ConfigDigest         = $ConfigDigest
    ConfigPayload        = $ConfigPayload
    GatewayAutostart     = $GatewayAutostart
    AckToken             = $AckToken
}
& $entry @dispatch
exit $LASTEXITCODE
