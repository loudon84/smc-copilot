#Requires -Version 5.1
<#
.SYNOPSIS
  Repair Salt-managed endpoint: reconfigure minion, re-enroll fingerprint, leave Hermes home intact.
  Updates bootstrap journal; does not switch control-owner.
#>
param(
    [Parameter(Mandatory = $true)][string]$Master,
    [Parameter(Mandatory = $true)][string]$MasterFingerprint,
    [Parameter(Mandatory = $true)][string]$BackendUrl,
    [string]$EnrollmentToken = "repair",
    [string]$SaltControlUrl = "",
    [string]$EnrollmentId = "",
    [string]$MasterB = "salt-b.internal",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$endpointFile = Join-Path $env:ProgramData "SMC\endpoint-id"
$journalPath = Join-Path $env:ProgramData "SMC\bootstrap-journal.json"
$endpointId = if (Test-Path $endpointFile) { (Get-Content $endpointFile -Raw).Trim() } else { "" }

if ($DryRun) {
    @{
        ok         = $true
        dryRun     = $true
        endpointId = $endpointId
        journalPath = $journalPath
        steps      = @("configure-minion", "enroll-minion", "sync_all/highstate (Salt Integration)")
        preserveHermesHome = $true
        controlOwnerSwitch = $false
    } | ConvertTo-Json -Compress
    exit 0
}

if (-not $endpointId) { throw "endpoint-id missing; run bootstrap first" }

& (Join-Path $here "configure-minion.ps1") -Master $Master -MasterB $MasterB -EndpointId $endpointId -MasterFingerprint $MasterFingerprint -StartService
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& (Join-Path $here "enroll-minion.ps1") `
    -EndpointId $endpointId `
    -BackendUrl $BackendUrl `
    -EnrollmentToken $EnrollmentToken `
    -SaltControlUrl $SaltControlUrl `
    -EnrollmentId $EnrollmentId
exit $LASTEXITCODE
