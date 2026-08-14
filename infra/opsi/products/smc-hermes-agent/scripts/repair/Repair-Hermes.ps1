#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][int]$Level,
    [int]$GatewayPort = 8642,
    [string]$Root = "",
    [string]$ClientId = "local"
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($Level -gt 2) {
    throw "MANUAL_ACTION_REQUIRED: auto_repair_level $Level exceeds approved automation (L0-L2)"
}

switch ($Level) {
    0 { }
    1 {
        & (Join-Path $PSScriptRoot "..\gateway\Restart-Gateway.ps1") -GatewayPort $GatewayPort
    }
    2 {
        $cli = Get-Command hermes -ErrorAction SilentlyContinue
        if ($cli) { & hermes doctor }
        & (Join-Path $PSScriptRoot "..\gateway\Restart-Gateway.ps1") -GatewayPort $GatewayPort
    }
    default { throw "MANUAL_ACTION_REQUIRED" }
}

if ($Root) {
    & (Join-Path $PSScriptRoot "..\health\Get-HermesStatus.ps1") -Root $Root -ClientId $ClientId -GatewayPort $GatewayPort | Out-Null
}
