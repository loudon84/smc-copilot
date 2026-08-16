#Requires -Version 5.1
param(
    [int]$GatewayPort = 8642,
    [string]$Root = "",
    [Parameter(Mandatory = $true)][string]$ManagedUserSid
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\common\SmcOpsi.psm1") -Force

if (-not $Root) { $Root = Get-SmcOpsiRoot }
if (-not $ManagedUserSid) {
    throw "SYSTEM CLI fallback is forbidden; ManagedUserSid required"
}
$task = "SMC-Hermes-Gateway-$ManagedUserSid"
if (-not (Get-SmcManagedTask -TaskName $task)) {
    throw "exact Gateway task missing for SID; refusing SYSTEM CLI fallback"
}
Start-SmcManagedTask -TaskName $task
exit 0
