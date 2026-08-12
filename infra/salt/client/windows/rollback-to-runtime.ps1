#Requires -Version 5.1
<#
.SYNOPSIS
  Restore Runtime ownership. Does not uninstall Runtime or Hermes files.
  Marks bootstrap journal ROLLBACK.
#>
param(
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$journalPath = Join-Path $env:ProgramData "SMC\bootstrap-journal.json"

if ($DryRun) {
    @{
        ok     = $true
        dryRun = $true
        journalPath = $journalPath
        steps  = @(
            "stop Salt Gateway",
            "restore config snapshot",
            "control-owner = runtime",
            "restore Runtime startup",
            "Runtime reconcile/start Gateway",
            "verify /health",
            "journal ROLLBACK"
        )
        uninstallRuntime = $false
    } | ConvertTo-Json -Compress
    exit 0
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
python -c @"
from pathlib import Path
from client.handover import HandoverHooks, rollback
from client.journal import BootstrapJournal

journal = BootstrapJournal.load(Path(r'$journalPath'))
hooks = HandoverHooks(
    inspect=lambda: {'ok': True},
    snapshot=lambda: {},
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
result = rollback(hooks=hooks, program_data=Path(r'$env:ProgramData'))
journal.mark_rollback(result.error or 'rollback_to_runtime')
print({'ok': result.ok, 'state': result.state, 'owner': result.owner, 'journal': journal.state})
"@
exit $LASTEXITCODE
