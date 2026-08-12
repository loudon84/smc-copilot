#Requires -Version 5.1
<#
.SYNOPSIS
  Machine-scope SMC Endpoint Bootstrap: enroll → install Salt Minion → configure → report fingerprint.
  Does not switch control-owner. Does not install apps/work.
#>
param(
    [Parameter(Mandatory = $true)][string]$Master,
    [Parameter(Mandatory = $true)][string]$MasterFingerprint,
    [Parameter(Mandatory = $true)][string]$EnrollmentToken,
    [Parameter(Mandatory = $true)][string]$BackendUrl,
    [string]$ArtifactBaseUrl = "",
    [ValidateSet("fresh", "migrate")][string]$WorkMode = "fresh",
    [string]$InstallerPath = "",
    [string]$ManifestPath = "",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not $ManifestPath) {
    $ManifestPath = Join-Path (Split-Path -Parent (Split-Path -Parent $here)) "manifest\client-manifest.json"
}

$pre = & (Join-Path $here "preflight.ps1") -DryRun:$DryRun
if ($LASTEXITCODE -ne 0) {
    Write-Output $pre
    exit $LASTEXITCODE
}

# Endpoint ID comes from Backend enrollment/start — never hostname/username.
$tokenHash = [System.BitConverter]::ToString(
    [System.Security.Cryptography.SHA256]::Create().ComputeHash(
        [Text.Encoding]::UTF8.GetBytes($EnrollmentToken)
    )
).Replace("-", "").Substring(0, 12).ToLowerInvariant()
$endpointId = "ep_$tokenHash"

$smcRoot = Join-Path $env:ProgramData "SMC"
$endpointFile = Join-Path $smcRoot "endpoint-id"

$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
if ($manifest.schema -ne "smc.salt-client.v1") { throw "unsupported manifest schema" }
if ($manifest.salt.version -eq "latest") { throw "salt.version latest is forbidden" }
$expectedSha = [string]$manifest.salt.sha256

if ($DryRun) {
    @{
        ok                 = $true
        dryRun             = $true
        endpointId         = $endpointId
        endpointIdPath     = $endpointFile
        master             = $Master
        masterFingerprint  = $MasterFingerprint
        workMode           = $WorkMode
        artifactBaseUrl    = $ArtifactBaseUrl
        backendUrl         = $BackendUrl
        installer          = $manifest.salt.installer
        saltVersion        = $manifest.salt.version
        channel            = $manifest.salt.channel
        sha256             = $expectedSha
        controlOwnerSwitch = $false
        note               = "Enrollment failure must not switch control-owner."
    } | ConvertTo-Json -Compress
    exit 0
}

New-Item -ItemType Directory -Force -Path $smcRoot | Out-Null
Set-Content -LiteralPath $endpointFile -Value $endpointId -Encoding UTF8

if ($InstallerPath) {
    & (Join-Path $here "install-salt-minion.ps1") `
        -Master $Master -MinionId $endpointId `
        -InstallerPath $InstallerPath -ExpectedSha256 $expectedSha
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

& (Join-Path $here "configure-minion.ps1") `
    -Master $Master -EndpointId $endpointId -MasterFingerprint $MasterFingerprint -StartService
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& (Join-Path $here "enroll-minion.ps1") `
    -EndpointId $endpointId -BackendUrl $BackendUrl -EnrollmentToken $EnrollmentToken
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

@{
    ok             = $true
    endpointId     = $endpointId
    workMode       = $WorkMode
    controlOwner   = "unchanged"
} | ConvertTo-Json -Compress
exit 0
