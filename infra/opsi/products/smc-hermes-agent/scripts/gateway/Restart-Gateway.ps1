#Requires -Version 5.1
param(
    [int]$GatewayPort = 8642
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Prefer official Hermes CLI; never kill python.exe by name.
$cli = Get-Command hermes -ErrorAction SilentlyContinue
if ($cli) {
    & hermes gateway restart
    exit $LASTEXITCODE
}

$task = Get-ScheduledTask -TaskName "SMC-Hermes-Gateway" -ErrorAction SilentlyContinue
if ($task) {
    Start-ScheduledTask -TaskName "SMC-Hermes-Gateway"
    exit 0
}

throw "MANUAL_ACTION_REQUIRED: no hermes CLI or versioned gateway task"
