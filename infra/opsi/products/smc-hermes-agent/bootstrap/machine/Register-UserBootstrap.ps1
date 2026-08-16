#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$ManagedUserSid,
    [Parameter(Mandatory = $true)][string]$ManagedUserAccount,
    [Parameter(Mandatory = $true)][string]$HermesVersion,
    [Parameter(Mandatory = $true)][string]$RequestId,
    [Parameter(Mandatory = $true)][string]$ClientId
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\..\scripts\common\SmcOpsi.psm1") -Force

if (-not (Test-SmcUserBinding -Sid $ManagedUserSid -Account $ManagedUserAccount)) {
    Write-Output "USER_CONTEXT_PENDING: profile not ready"
}

$bootstrapName = "SMC-Hermes-User-Bootstrap-$ManagedUserSid"
$gatewayName = "SMC-Hermes-Gateway-$ManagedUserSid"
$userScript = Join-Path $Root "bootstrap\user\Initialize-HermesHome.ps1"
$arg = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$userScript`" -Root `"$Root`" -ManagedUserSid `"$ManagedUserSid`" -HermesVersion `"$HermesVersion`" -RequestId `"$RequestId`" -ClientId `"$ClientId`""
Register-SmcManagedTask -TaskName $bootstrapName -Execute "powershell.exe" -Argument $arg -UserId $ManagedUserAccount | Out-Null

$cli = Resolve-SmcHermesCli -Root $Root
$gwArg = "gateway start"
Register-SmcManagedTask -TaskName $gatewayName -Execute $cli -Argument $gwArg -UserId $ManagedUserAccount | Out-Null

Write-SmcJsonAtomic -Path (Get-SmcTaskManifestPath) -Object ([ordered]@{
        bootstrapTask = $bootstrapName
        gatewayTask   = $gatewayName
        sid           = $ManagedUserSid
        account       = $ManagedUserAccount
        cli           = $cli
        version       = $HermesVersion
        registered    = $true
    })
