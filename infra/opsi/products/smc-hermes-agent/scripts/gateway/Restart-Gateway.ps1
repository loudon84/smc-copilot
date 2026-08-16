#Requires -Version 5.1
param(
    [int]$GatewayPort = 8642,
    [string]$Root = "",
    [string]$ManagedUserSid = ""
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\common\SmcOpsi.psm1") -Force

if (-not $Root) { $Root = Get-SmcOpsiRoot }
if ($ManagedUserSid) {
    $task = "SMC-Hermes-Gateway-$ManagedUserSid"
    if (Get-SmcManagedTask -TaskName $task) {
        Start-SmcManagedTask -TaskName $task
        exit 0
    }
}
$cli = Resolve-SmcHermesCli -Root $Root
& $cli gateway restart
exit $LASTEXITCODE
