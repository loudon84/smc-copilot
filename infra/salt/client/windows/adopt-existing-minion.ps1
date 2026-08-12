#Requires -Version 5.1
<#
.SYNOPSIS
  Adopt an existing Windows Salt Minion (e.g. ITBJB0676) onto Backend endpointId ep_*.
  Keeps old Master key accepted until new identity passes ping/sync/highstate.
  Failure restores previous minion id/config. Does not revoke old key on failure.
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

$steps = @(
    "BACKUP",
    "STOP_MINION",
    "WRITE_IDENTITY",
    "START_MINION",
    "WAIT_PENDING_KEY",
    "ACCEPT_COMPARE_FINGERPRINT",
    "TEST_PING",
    "SYNC_HIGHSTATE",
    "REVOKE_OLD_KEY_OPTIONAL",
    "COMPLETED"
)

if ($DryRun) {
    @{
        ok               = $true
        dryRun           = $true
        oldMinionId      = $OldMinionId
        endpointId       = $EndpointId
        master           = $Master
        revokeOldKey     = [bool]$RevokeOldKeyWhenDone
        steps            = $steps
        note             = "Old key remains accepted until new identity proven; revoke only after highstate success."
    } | ConvertTo-Json -Compress
    exit 0
}

& (Join-Path $here "backup-minion-state.ps1") -BackupRoot $BackupRoot | Out-Null

$smc = Join-Path $env:ProgramData "SMC"
New-Item -ItemType Directory -Force -Path $smc | Out-Null
$snapshotPath = Join-Path $smc "minion-identity-adoption.json"

python -c @"
from pathlib import Path
from client.minion_identity import plan_adoption, write_snapshot
snap = plan_adoption(
    old_minion_id=r'$OldMinionId',
    new_endpoint_id=r'$EndpointId',
    master_finger=r'$MasterFingerprint',
    conf_backup=r'$BackupRoot',
)
write_snapshot(Path(r'$snapshotPath'), snap)
print({'ok': True, 'snapshot': r'$snapshotPath'})
"@
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Stop service before rewriting identity
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
        ok            = $true
        endpointId    = $EndpointId
        oldMinionId   = $OldMinionId
        snapshot      = $snapshotPath
        nextManualGate = @(
            "Master: wait for pending key $EndpointId",
            "Compare local vs pending fingerprint",
            "Accept $EndpointId",
            "salt $EndpointId test.ping / saltutil.sync_all / state.highstate",
            "Only then revoke old key $OldMinionId"
        )
        revokeOldKey  = $false
        note          = "Key revoke is Manual Gate; script does not call Master APIs."
    } | ConvertTo-Json -Compress
    exit 0
}
catch {
    # Restore previous identity from backup configure if present
    Write-Error $_
    # Best-effort: rewrite id back to old hostname without fake master-b
    try {
        & (Join-Path $here "configure-minion.ps1") `
            -Master $Master `
            -EndpointId $OldMinionId `
            -MasterFingerprint $MasterFingerprint `
            -ConfDir $ConfDir `
            -StartService
    } catch {}
    exit 1
}
