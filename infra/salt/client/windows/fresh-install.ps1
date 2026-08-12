#Requires -Version 5.1
<#
.SYNOPSIS
  Fresh PC: bootstrap Salt Minion then wait for highstate Hermes install + Gateway.
#>
param(
    [Parameter(Mandatory = $true)][string]$Master,
    [Parameter(Mandatory = $true)][string]$MasterFingerprint,
    [Parameter(Mandatory = $true)][string]$EnrollmentToken,
    [Parameter(Mandatory = $true)][string]$BackendUrl,
    [string]$ArtifactBaseUrl = "",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

& (Join-Path $here "bootstrap.ps1") `
    -Master $Master `
    -MasterFingerprint $MasterFingerprint `
    -EnrollmentToken $EnrollmentToken `
    -BackendUrl $BackendUrl `
    -ArtifactBaseUrl $ArtifactBaseUrl `
    -WorkMode fresh `
    -DryRun:$DryRun
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($DryRun) {
    @{ ok = $true; dryRun = $true; next = @("enroll accept", "saltutil.sync_all", "state.highstate", "write control-owner salt") } | ConvertTo-Json -Compress
    exit 0
}

$owner = Join-Path $env:ProgramData "SMC\control-owner.json"
New-Item -ItemType Directory -Force -Path (Split-Path $owner) | Out-Null
Set-Content -LiteralPath $owner -Value "{ `"hermes`": `"salt`" }`n" -Encoding UTF8
@{ ok = $true; controlOwner = "salt"; ownerPath = $owner } | ConvertTo-Json -Compress
exit 0
