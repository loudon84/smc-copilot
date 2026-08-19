#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$expectedHome = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0"
if (-not [string]::Equals($PSHOME, $expectedHome, [StringComparison]::OrdinalIgnoreCase)) {
    throw "bootstrap must run under $expectedHome (got $PSHOME)"
}

Import-Module (Join-Path $PSScriptRoot "InstallerCore.psm1") -Force -DisableNameChecking
$payload = Join-Path $PSScriptRoot "payload"
if (-not (Test-Path -LiteralPath $payload)) {
    throw "payload root missing: $payload"
}
exit (Invoke-SmcHermesLifecycle -ArgumentList (@("/payload-root", $payload) + $args))
