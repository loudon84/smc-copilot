#Requires -Version 5.1
<#
.SYNOPSIS
  Write minion.d\smc.conf with multimaster failover list and optionally start salt-minion.
#>
param(
    [Parameter(Mandatory = $true)][string]$Master,
    [Parameter(Mandatory = $true)][string]$EndpointId,
    [Parameter(Mandatory = $true)][string]$MasterFingerprint,
    [string]$MasterB = "salt-b.internal",
    [string]$ConfDir = "$env:ProgramData\Salt Project\Salt\conf\minion.d",
    [switch]$StartService,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

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

$target = Join-Path $ConfDir "smc.conf"

if ($DryRun) {
    @{
        ok       = $true
        dryRun   = $true
        path     = $target
        minionId = $EndpointId
        content  = $conf
    } | ConvertTo-Json -Compress
    exit 0
}

New-Item -ItemType Directory -Force -Path $ConfDir | Out-Null
Set-Content -LiteralPath $target -Value $conf -Encoding UTF8

if ($StartService) {
    Start-Service -Name "salt-minion" -ErrorAction SilentlyContinue
}

@{ ok = $true; path = $target; minionId = $EndpointId; serviceStarted = [bool]$StartService } | ConvertTo-Json -Compress
exit 0
