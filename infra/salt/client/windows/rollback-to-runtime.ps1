#Requires -Version 5.1
<#
.SYNOPSIS
  Restore prior ownership from snapshot (runtime/direct/absent). Does not invent runtime.
#>
param(
    [string]$HooksModule = "",
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
            "control-owner = snapshot.owner (runtime|direct|absent)",
            "restore Runtime/Direct startup",
            "reconcile/start Gateway",
            "verify /health",
            "journal ROLLBACK"
        )
        uninstallRuntime = $false
    } | ConvertTo-Json -Compress
    exit 0
}

$envName = if ($env:SMC_SALT_ENV) { $env:SMC_SALT_ENV } else { "lab" }
if ($envName -eq "production" -and -not $HooksModule) {
    throw "production rollback requires -HooksModule with real adapters"
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoSalt = Split-Path -Parent (Split-Path -Parent $here)
$env:PYTHONPATH = "$repoSalt;$env:PYTHONPATH"

if ($HooksModule) {
    python -c @"
from pathlib import Path
import importlib
from client.handover import rollback
from client.journal import BootstrapJournal
mod = importlib.import_module('$HooksModule')
hooks = mod.build_hooks(hermes_home='', endpoint_id='')
journal = BootstrapJournal.load(Path(r'$journalPath'))
result = rollback(hooks=hooks, program_data=Path(r'$env:ProgramData'))
journal.mark_rollback(result.error or 'rollback_to_prior_owner')
print({'ok': result.ok, 'state': result.state, 'owner': result.owner, 'journal': journal.state})
"@
} else {
    python -c @"
import os
from pathlib import Path
from client.handover import HandoverHooks, rollback
from client.journal import BootstrapJournal

if os.environ.get('SMC_SALT_ENV', 'lab').lower() == 'production':
    raise SystemExit('stub hooks forbidden in production')

def _ok():
    return True

journal = BootstrapJournal.load(Path(r'$journalPath'))
hooks = HandoverHooks(
    inspect=lambda: {'ok': True},
    snapshot=lambda: {},
    verify_salt=_ok,
    stop_gateway=_ok,
    disable_runtime=_ok,
    start_salt_gateway=_ok,
    health=_ok,
    work_probe=_ok,
    restore_snapshot=lambda s: True,
    restore_runtime=_ok,
    runtime_reconcile=_ok,
)
result = rollback(hooks=hooks, program_data=Path(r'$env:ProgramData'))
journal.mark_rollback(result.error or 'rollback_to_prior_owner')
print({'ok': result.ok, 'state': result.state, 'owner': result.owner, 'journal': journal.state})
"@
}
exit $LASTEXITCODE
