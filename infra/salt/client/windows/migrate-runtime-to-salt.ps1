#Requires -Version 5.1
<#
.SYNOPSIS
  Existing Runtime PC → Salt ownership. Does not uninstall Runtime files.
  Production forbids stub hooks; supply -HooksModule or use lab/test env.
#>
param(
    [string]$EndpointId = "",
    [string]$HermesHome = "",
    [string]$HooksModule = "",
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
        note       = "Owner switch only after health+work probe; production rejects stub hooks."
    } | ConvertTo-Json -Compress
    exit 0
}

$envName = if ($env:SMC_SALT_ENV) { $env:SMC_SALT_ENV } else { "lab" }
if ($envName -eq "production" -and -not $HooksModule) {
    throw "production migrate requires -HooksModule with real adapters (stub hooks forbidden)"
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoSalt = Split-Path -Parent (Split-Path -Parent $here)
$env:PYTHONPATH = "$repoSalt;$env:PYTHONPATH"

if ($HooksModule) {
    python -c @"
from pathlib import Path
import importlib
from client.handover import migrate
from client.journal import BootstrapJournal

mod = importlib.import_module('$HooksModule')
hooks = mod.build_hooks(hermes_home=r'$HermesHome', endpoint_id=r'$EndpointId')
journal = BootstrapJournal.load(Path(r'$journalPath'))
result = migrate(hooks=hooks, program_data=Path(r'$env:ProgramData'), endpoint_id='$EndpointId', hermes_home=r'$HermesHome')
if result.ok:
    journal.advance('COMPLETED', endpoint_id=r'$EndpointId', owner='salt')
else:
    journal.mark_rollback(result.error or 'migrate_failed')
print({'ok': result.ok, 'state': result.state, 'owner': result.owner, 'error': result.error, 'journal': journal.state})
"@
} else {
    # lab/test only — explicit env gate
    python -c @"
import os
from pathlib import Path
from client.handover import HandoverHooks, migrate
from client.journal import BootstrapJournal

if os.environ.get('SMC_SALT_ENV', 'lab').lower() == 'production':
    raise SystemExit('stub hooks forbidden in production')

journal = BootstrapJournal.load(Path(r'$journalPath'))
journal.advance('HERMES_VERIFIED', endpoint_id=r'$EndpointId')

def _named_ok():
    return True

def _named_inspect():
    return {'ok': True, 'home': r'$HermesHome'}

def _named_snapshot():
    return {'owner': 'runtime', 'hermes_home': r'$HermesHome'}

hooks = HandoverHooks(
    inspect=_named_inspect,
    snapshot=_named_snapshot,
    verify_salt=_named_ok,
    stop_gateway=_named_ok,
    disable_runtime=_named_ok,
    start_salt_gateway=_named_ok,
    health=_named_ok,
    work_probe=_named_ok,
    restore_snapshot=lambda s: True,
    restore_runtime=_named_ok,
    runtime_reconcile=_named_ok,
)
# restore_snapshot remains lambda only in lab — assert_no_stub_hooks allows lab/test
result = migrate(hooks=hooks, program_data=Path(r'$env:ProgramData'), endpoint_id='$EndpointId', hermes_home=r'$HermesHome')
if result.ok:
    journal.advance('COMPLETED', endpoint_id=r'$EndpointId', owner='salt')
else:
    journal.mark_rollback(result.error or 'migrate_failed')
print({'ok': result.ok, 'state': result.state, 'owner': result.owner, 'error': result.error, 'journal': journal.state})
"@
}
exit $LASTEXITCODE
