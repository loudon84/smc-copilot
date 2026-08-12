#Requires -Version 5.1
<#
.SYNOPSIS
  Fresh PC: bootstrap Salt Minion then wait for highstate Hermes install + Gateway.
  Writes control-owner=salt only after bootstrap journal reaches COMPLETED (health+work probe).
#>
param(
    [Parameter(Mandatory = $true)][string]$Master,
    [Parameter(Mandatory = $true)][string]$MasterFingerprint,
    [Parameter(Mandatory = $true)][string]$EnrollmentToken,
    [Parameter(Mandatory = $true)][string]$BackendUrl,
    [string]$SaltControlUrl = "",
    [string]$ArtifactBaseUrl = "",
    [switch]$DryRun,
    [switch]$MarkCompleted
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$smc = Join-Path $env:ProgramData "SMC"
$journalPath = Join-Path $smc "bootstrap-journal.json"

& (Join-Path $here "bootstrap.ps1") `
    -Master $Master `
    -MasterFingerprint $MasterFingerprint `
    -EnrollmentToken $EnrollmentToken `
    -BackendUrl $BackendUrl `
    -SaltControlUrl $SaltControlUrl `
    -ArtifactBaseUrl $ArtifactBaseUrl `
    -WorkMode fresh `
    -DryRun:$DryRun
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($DryRun) {
    @{
        ok = $true
        dryRun = $true
        journalPath = $journalPath
        next = @("enroll accept", "saltutil.sync_all", "state.highstate", "health+work probe", "journal COMPLETED", "write control-owner salt")
        note = "Owner switch only after journal COMPLETED (see client/handover.py)."
    } | ConvertTo-Json -Compress
    exit 0
}

# Do not write control-owner=salt until journal COMPLETED (ops or handover marks it).
$completed = $false
if (Test-Path -LiteralPath $journalPath) {
    $journal = Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json
    $completed = ($journal.state -eq "COMPLETED")
}
if ($MarkCompleted) {
    # Operator / canary confirms health+work probe already passed.
    @{
        state = "COMPLETED"
        updatedAt = (Get-Date).ToString("o")
        extra = @{ source = "fresh-install.MarkCompleted" }
    } | ConvertTo-Json | Set-Content -LiteralPath $journalPath -Encoding UTF8
    $completed = $true
}

if (-not $completed) {
    @{
        ok = $true
        controlOwner = "unchanged"
        journalPath = $journalPath
        note = "Await journal COMPLETED after highstate+health+work probe before writing control-owner salt."
    } | ConvertTo-Json -Compress
    exit 0
}

$owner = Join-Path $smc "control-owner.json"
New-Item -ItemType Directory -Force -Path (Split-Path $owner) | Out-Null
Set-Content -LiteralPath $owner -Value "{ `"hermes`": `"salt`" }`n" -Encoding UTF8
@{ ok = $true; controlOwner = "salt"; ownerPath = $owner; journalPath = $journalPath } | ConvertTo-Json -Compress
exit 0
