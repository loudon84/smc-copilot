#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][string]$HermesExe,
    [Parameter(Mandatory = $true)][string]$HermesHome,
    [string]$Profile = "default",
    [int]$Port = 8642,
    [string]$Bind = "127.0.0.1",
    [ValidateSet("start", "status", "stop")][string]$GatewayAction = "start"
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $HermesExe)) { throw "Hermes exe missing" }
if (-not $HermesHome) { throw "HERMES_HOME required" }
$env:HERMES_HOME = $HermesHome
switch ($GatewayAction) {
    "start" { & $HermesExe gateway start --bind $Bind --port $Port --profile $Profile; exit $LASTEXITCODE }
    "status" { & $HermesExe gateway status --port $Port; exit $LASTEXITCODE }
    "stop" { & $HermesExe gateway stop --port $Port; exit $LASTEXITCODE }
    default { throw "unreachable gateway action" }
}
