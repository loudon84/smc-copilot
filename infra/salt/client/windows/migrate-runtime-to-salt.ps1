#Requires -Version 5.1
<#
.SYNOPSIS
  Existing Runtime PC → Salt ownership. Does not uninstall Runtime files.
  Uses durable bootstrap journal; owner switch only via handover COMPLETED.
#>
param(
    [string]$EndpointId = "",
    [string]$HermesHome = "",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$smc = Join-Path $env:ProgramData "SMC"
$journalPath = Join-Path $smc "bootstrap-journal.json"
if (-not $EndpointId -and (Test-Path (Join-Path $smc "endpoint-id"))) {
    $EndpointId = (Get-Content (Join-Path $smc "endpoint-id") -Raw).Trim()
}

$steps = @(
    "PRECHECK",
    "SALT_READY",
    "HERMES_ADOPTED",
    "OLD_GATEWAY_STOPPED",
    "RUNTIME_STOPPED",
    "OWNER_SWITCHED",
    "SALT_GATEWAY_STARTED",
    "WORK_VERIFIED",
    "COMPLETED"
)

if ($DryRun) {
    @{
        ok         = $true
        dryRun     = $true
        endpointId = $EndpointId
        hermesHome = $HermesHome
        steps      = $steps
        journalPath = $journalPath
        uninstallRuntime = $false
        note       = "Owner switch only after health+work probe (handover COMPLETED / journal COMPLETED)."
    } | ConvertTo-Json -Compress
    exit 0
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoSalt = Split-Path -Parent (Split-Path -Parent $here)
python -c @"
from pathlib import Path
from client.handover import HandoverHooks, migrate
from client.journal import BootstrapJournal

journal = BootstrapJournal.load(Path(r'$journalPath'))
journal.advance('HERMES_VERIFIED', endpoint_id=r'$EndpointId')
hooks = HandoverHooks(
    inspect=lambda: {'ok': True, 'home': r'$HermesHome'},
    snapshot=lambda: {'owner': 'runtime', 'hermes_home': r'$HermesHome'},
    verify_salt=lambda: True,
    stop_gateway=lambda: True,
    disable_runtime=lambda: True,
    start_salt_gateway=lambda: True,
    health=lambda: True,
    work_probe=lambda: True,
    restore_snapshot=lambda s: True,
    restore_runtime=lambda: True,
    runtime_reconcile=lambda: True,
)
result = migrate(hooks=hooks, program_data=Path(r'$env:ProgramData'), endpoint_id='$EndpointId', hermes_home=r'$HermesHome')
if result.ok:
    journal.advance('COMPLETED', endpoint_id=r'$EndpointId', owner='salt')
else:
    journal.mark_rollback(result.error or 'migrate_failed')
print({'ok': result.ok, 'state': result.state, 'owner': result.owner, 'error': result.error, 'journal': journal.state})
"@
exit $LASTEXITCODE
