#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][int]$Revision
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\common\SmcOpsi.psm1") -Force

$currentPath = Join-Path $Root "managed\config\current.json"
$backupPath = Join-Path $Root "managed\config\backup-$Revision.json"
$incomingPath = Join-Path $Root "managed\config\incoming.json"

$currentRev = 0
if (Test-Path -LiteralPath $currentPath) {
    $current = Get-Content -LiteralPath $currentPath -Raw | ConvertFrom-Json
    $currentRev = [int]$current.revision
    if ($Revision -lt $currentRev) { throw "stale revision $Revision < $currentRev" }
    if ($Revision -eq $currentRev) { return } # idempotent
}

if (-not (Test-Path -LiteralPath $incomingPath)) {
    throw "missing incoming managed config"
}

$incoming = Get-Content -LiteralPath $incomingPath -Raw | ConvertFrom-Json
if ($incoming.schema -ne "smc.opsi.managed-config.v1") { throw "invalid managed-config schema" }
if ([int]$incoming.revision -ne $Revision) { throw "incoming revision mismatch" }

$allow = @("gateway_port", "gateway_bind", "gateway_autostart", "managed_profile", "diagnostics_enabled", "diagnostic_log_lines", "auto_repair_level")
$keys = @{}
foreach ($name in $allow) {
    if ($incoming.keys.PSObject.Properties.Name -contains $name) {
        $keys[$name] = $incoming.keys.$name
    }
}

if (Test-Path -LiteralPath $currentPath) {
    Copy-Item -LiteralPath $currentPath -Destination $backupPath -Force
}

$merged = @{
    schema   = "smc.opsi.managed-config.v1"
    revision = $Revision
    keys     = $keys
}
try {
    Write-SmcJsonAtomic -Path $currentPath -Object $merged
}
catch {
    if (Test-Path -LiteralPath $backupPath) {
        Copy-Item -LiteralPath $backupPath -Destination $currentPath -Force
    }
    throw
}
