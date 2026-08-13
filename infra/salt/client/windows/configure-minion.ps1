#Requires -Version 5.1
<#
.SYNOPSIS
  Write minion.d\smc.conf. Single Master uses scalar master:; MasterB only when provided.
#>
param(
    [Parameter(Mandatory = $true)][string]$Master,
    [Parameter(Mandatory = $true)][string]$EndpointId,
    [Parameter(Mandatory = $true)][string]$MasterFingerprint,
    [string]$MasterB = "",
    [string]$ConfDir = "$env:ProgramData\Salt Project\Salt\conf\minion.d",
    [switch]$StartService,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

if (-not $MasterFingerprint -or $MasterFingerprint.Trim().Length -lt 10) {
    throw "MasterFingerprint is required and must be non-empty"
}
if ($MasterFingerprint -notmatch '^sha256:') {
    throw "MasterFingerprint must start with sha256:"
}
# Never default to salt-b.internal
if ($MasterB -eq "salt-b.internal") {
    throw "MasterB placeholder salt-b.internal is forbidden; omit MasterB for single-master"
}

if ($MasterB -and $MasterB.Trim().Length -gt 0) {
    $conf = @"
master:
  - $Master
  - $MasterB
master_type: failover
random_master: True
master_alive_interval: 60
verify_master_pubkey_sign: True
id: $EndpointId
master_finger: $MasterFingerprint
log_level: info
"@
}
else {
    $conf = @"
master: $Master
id: $EndpointId
master_finger: $MasterFingerprint
verify_master_pubkey_sign: True
log_level: info
"@
}

$target = Join-Path $ConfDir "smc.conf"
$backup = "$target.bak"

if ($DryRun) {
    @{
        ok       = $true
        dryRun   = $true
        path     = $target
        minionId = $EndpointId
        singleMaster = -not [bool]$MasterB
        content  = $conf
    } | ConvertTo-Json -Compress
    exit 0
}

New-Item -ItemType Directory -Force -Path $ConfDir | Out-Null
if (Test-Path -LiteralPath $target) {
    Copy-Item -LiteralPath $target -Destination $backup -Force
}

$tmp = "$target.tmp"
try {
    Set-Content -LiteralPath $tmp -Value $conf -Encoding UTF8
    Move-Item -LiteralPath $tmp -Destination $target -Force
}
catch {
    if (Test-Path -LiteralPath $backup) {
        Copy-Item -LiteralPath $backup -Destination $target -Force
    }
    throw
}

if ($StartService) {
    $service = Get-Service -Name "salt-minion" -ErrorAction Stop
    if ($service.Status -eq "Running") {
        Restart-Service -Name "salt-minion" -Force -ErrorAction Stop
    }
    else {
        Start-Service -Name "salt-minion" -ErrorAction Stop
    }
}

@{
    ok             = $true
    path           = $target
    minionId       = $EndpointId
    serviceStarted = [bool]$StartService
    singleMaster   = -not [bool]$MasterB
} | ConvertTo-Json -Compress
exit 0
