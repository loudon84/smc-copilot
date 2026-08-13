#Requires -Version 5.1
<#
.SYNOPSIS
  Prepare an existing Windows Salt Minion (e.g. ITBJB0676) for Backend endpointId ep_*.
  Script only writes local identity config. Master Accept, old key revoke, and Highstate
  remain a Manual Gate.
#>
param(
    [Parameter(Mandatory = $true)][string]$EndpointId,
    [Parameter(Mandatory = $true)][string]$Master,
    [Parameter(Mandatory = $true)][string]$MasterFingerprint,
    [string]$OldMinionId = $env:COMPUTERNAME,
    [string]$ConfDir = "$env:ProgramData\Salt Project\Salt\conf\minion.d",
    [string]$BackupRoot = "$env:ProgramData\SMC\backups",
    [switch]$RevokeOldKeyWhenDone,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

if ($EndpointId -notmatch '^ep_') {
    throw "EndpointId must start with ep_"
}
if (-not $MasterFingerprint -or $MasterFingerprint -notmatch '^sha256:') {
    throw "MasterFingerprint required (sha256:...)"
}
if ($OldMinionId -match '^ep_') {
    throw "OldMinionId already looks like an endpoint id"
}
if ($RevokeOldKeyWhenDone) {
    throw "RevokeOldKeyWhenDone is a Manual Gate; this script never accepts, revokes, or runs Highstate"
}

$steps = @(
    "BACKUP",
    "STOP_MINION",
    "WRITE_IDENTITY",
    "START_MINION",
    "WAIT_PENDING_KEY",
    "ACCEPT_COMPARE_FINGERPRINT",
    "TEST_PING",
    "SYNC_INSPECT_DOCTOR",
    "PILLAR_GATE",
    "REVOKE_OLD_KEY_OPTIONAL",
    "COMPLETED"
)

function Write-AdoptionSnapshot {
    param(
        [string]$Path,
        [string]$OldId,
        [string]$NewId,
        [string]$Backup,
        [string]$StartType,
        [string]$Finger
    )
    $payload = @{
        schema           = "smc.minion-identity-adoption.v1"
        version          = 1
        oldMinionId      = $OldId
        newEndpointId    = $NewId
        confBackup       = $Backup
        serviceStartType = $StartType
        masterFinger     = $Finger
        revokeOldKeyAllowed = $false
    }
    $dir = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $tmp = "$Path.tmp"
    ($payload | ConvertTo-Json -Compress) | Set-Content -LiteralPath $tmp -Encoding utf8
    Move-Item -LiteralPath $tmp -Destination $Path -Force
}

if ($DryRun) {
    @{
        ok               = $true
        dryRun           = $true
        oldMinionId      = $OldMinionId
        endpointId       = $EndpointId
        master           = $Master
        revokeOldKey     = $false
        steps            = $steps
        wroteConfig      = $false
        stoppedService   = $false
        calledMaster     = $false
        note             = "Old key remains accepted until new identity proven; revoke only after fingerprint compare, accept, ping, sync, inspect/doctor and Pillar Gate."
    } | ConvertTo-Json -Compress
    exit 0
}

$smc = Join-Path $env:ProgramData "SMC"
New-Item -ItemType Directory -Force -Path $smc | Out-Null
$snapshotPath = Join-Path $smc "minion-identity-adoption.json"
$startType = "Automatic"
try {
    $svc = Get-Service -Name "salt-minion" -ErrorAction SilentlyContinue
    if ($svc) { $startType = [string]$svc.StartType }
} catch {}

Write-AdoptionSnapshot -Path $snapshotPath -OldId $OldMinionId -NewId $EndpointId -Backup $BackupRoot -StartType $startType -Finger $MasterFingerprint

if (Test-Path (Join-Path $here "backup-minion-state.ps1")) {
    & (Join-Path $here "backup-minion-state.ps1") -BackupRoot $BackupRoot | Out-Null
}

$confTarget = Join-Path $ConfDir "smc.conf"
$confBackup = "$confTarget.bak"
if (Test-Path -LiteralPath $confTarget) {
    Copy-Item -LiteralPath $confTarget -Destination $confBackup -Force
}

Stop-Service -Name "salt-minion" -Force -ErrorAction SilentlyContinue

try {
    & (Join-Path $here "configure-minion.ps1") `
        -Master $Master `
        -EndpointId $EndpointId `
        -MasterFingerprint $MasterFingerprint `
        -ConfDir $ConfDir `
        -StartService
    if ($LASTEXITCODE -ne 0) { throw "configure-minion failed" }

    Set-Content -LiteralPath (Join-Path $smc "endpoint-id") -Value $EndpointId -Encoding ascii

    @{
        ok             = $true
        endpointId     = $EndpointId
        oldMinionId    = $OldMinionId
        snapshot       = $snapshotPath
        revokeOldKey   = $false
        nextManualGate = @(
            "Master: wait for pending key $EndpointId",
            "Compare local vs pending fingerprint",
            "Accept $EndpointId",
            "salt $EndpointId test.ping / saltutil.sync_all / smc_hermes.inspect / smc_hermes.doctor / pillar gate",
            "Only then revoke old key $OldMinionId"
        )
        note           = "Key revoke is Manual Gate; script does not call Master APIs or Highstate."
    } | ConvertTo-Json -Compress
    exit 0
}
catch {
    Write-Error $_
    try {
        if (Test-Path -LiteralPath $confBackup) {
            Copy-Item -LiteralPath $confBackup -Destination $confTarget -Force
        }
        & (Join-Path $here "configure-minion.ps1") `
            -Master $Master `
            -EndpointId $OldMinionId `
            -MasterFingerprint $MasterFingerprint `
            -ConfDir $ConfDir `
            -StartService
        if ($startType) {
            try { Set-Service -Name "salt-minion" -StartupType $startType } catch {}
        }
    } catch {}
    exit 1
}
