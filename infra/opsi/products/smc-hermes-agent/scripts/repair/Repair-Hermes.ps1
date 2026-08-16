#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][int]$Level,
    [int]$GatewayPort = 8642,
    [string]$Root = "",
    [string]$ClientId = "local"
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\common\SmcOpsi.psm1") -Force

if ($Level -gt 2) {
    throw "MANUAL_ACTION_REQUIRED: auto_repair_level $Level exceeds approved automation (L0-L2)"
}
if (-not $Root) { $Root = Get-SmcOpsiRoot }

switch ($Level) {
    0 { }
    1 {
        & (Join-Path $PSScriptRoot "..\gateway\Restart-Gateway.ps1") -GatewayPort $GatewayPort -Root $Root
    }
    2 {
        $cli = Resolve-SmcHermesCli -Root $Root
        & $cli doctor
        & (Join-Path $PSScriptRoot "..\gateway\Restart-Gateway.ps1") -GatewayPort $GatewayPort -Root $Root
    }
    default { throw "MANUAL_ACTION_REQUIRED" }
}

& (Join-Path $PSScriptRoot "..\health\Get-HermesStatus.ps1") -Root $Root -ClientId $ClientId -GatewayPort $GatewayPort | Out-Null
