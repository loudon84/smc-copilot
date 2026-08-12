#Requires -Version 5.1
<#
.SYNOPSIS
  Machine-scope SMC Endpoint Bootstrap: enroll 鈫?install Salt Minion 鈫?configure 鈫?report fingerprint.
  Does not switch control-owner. Does not install apps/work.
  Live mode (-SaltControlUrl): POST /salt/v1/enrollments; Endpoint ID never from token hash.
  Without -SaltControlUrl: DryRun-only path (token-hash stand-in for local planning).
#>
param(
    [Parameter(Mandatory = $true)][string]$Master,
    [Parameter(Mandatory = $true)][string]$MasterFingerprint,
    [Parameter(Mandatory = $true)][string]$EnrollmentToken,
    [Parameter(Mandatory = $true)][string]$BackendUrl,
    [string]$SaltControlUrl = "",
    [string]$MasterB = "",
    [string]$ArtifactBaseUrl = "",
    [ValidateSet("fresh", "migrate")][string]$WorkMode = "fresh",
    [string]$InstallerPath = "",
    [string]$ManifestPath = "",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$smcRoot = Join-Path $env:ProgramData "SMC"
$journalPath = Join-Path $smcRoot "bootstrap-journal.json"

function Write-JournalState {
    param([string]$State, [hashtable]$Extra = @{})
    New-Item -ItemType Directory -Force -Path $smcRoot | Out-Null
    $payload = @{
        state       = $State
        endpointId  = $Extra.endpointId
        enrollmentId = $Extra.enrollmentId
        updatedAt   = (Get-Date).ToString("o")
        extra       = $Extra
    }
    $payload | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $journalPath -Encoding UTF8
}

if (-not $ManifestPath) {
    $ManifestPath = Join-Path (Split-Path -Parent (Split-Path -Parent $here)) "manifest\client-manifest.json"
}

Write-JournalState -State "PREFLIGHT"
$pre = & (Join-Path $here "preflight.ps1") -DryRun:$DryRun
if ($LASTEXITCODE -ne 0) {
    Write-Output $pre
    exit $LASTEXITCODE
}

$endpointId = $null
$enrollmentId = $null
$masters = @($Master)
$deviceCredential = $null

if ($SaltControlUrl) {
    # Live: Salt Control issues endpointId 鈥?forbid local token-hash derivation.
    $py = @"
import json, platform, hashlib, uuid, os, sys
from pathlib import Path
sys.path.insert(0, r'$(Split-Path -Parent (Split-Path -Parent $here))')
from client.salt_control_client import SaltControlClient, DeviceInfo
from client.device_credential import DeviceCredentialStore
from client.enrollment import assert_endpoint_id_not_token_hash

guid = os.environ.get('COMPUTERNAME', 'unknown')
mgh = hashlib.sha256(guid.encode()).hexdigest()
store = DeviceCredentialStore(Path(r'$smcRoot') / 'credentials' / 'device.dat', force_file_backend=True)
client = SaltControlClient(r'$SaltControlUrl', credential_store=store)
device = DeviceInfo(hostname=platform.node() or guid, machine_guid_hash=mgh, windows_build=0, arch=platform.machine() or 'AMD64')
result = client.create_enrollment(r'$EnrollmentToken', device)
assert_endpoint_id_not_token_hash(result.endpoint_id, r'$EnrollmentToken')
print(json.dumps({
  'endpointId': result.endpoint_id,
  'enrollmentId': result.enrollment_id,
  'masters': result.masters,
  'masterFingerprints': result.master_fingerprints,
}))
"@
    $enrollJson = python -c $py
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $enroll = $enrollJson | ConvertFrom-Json
    $endpointId = [string]$enroll.endpointId
    $enrollmentId = [string]$enroll.enrollmentId
    if ($enroll.masters -and $enroll.masters.Count -gt 0) {
        $masters = @($enroll.masters)
    }
    Write-JournalState -State "ENROLLMENT_CREATED" -Extra @{ endpointId = $endpointId; enrollmentId = $enrollmentId }
}
elseif ($DryRun) {
    # DryRun-only stand-in (not for production live mode).
    $tokenHash = [System.BitConverter]::ToString(
        [System.Security.Cryptography.SHA256]::Create().ComputeHash(
            [Text.Encoding]::UTF8.GetBytes($EnrollmentToken)
        )
    ).Replace("-", "").Substring(0, 12).ToLowerInvariant()
    $endpointId = "ep_$tokenHash"
}
else {
    throw "Live bootstrap requires -SaltControlUrl (or pass -DryRun for planning). Token-hash endpoint id is forbidden in live mode."
}

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
        masters            = $masters
        masterFingerprint  = $MasterFingerprint
        workMode           = $WorkMode
        artifactBaseUrl    = $ArtifactBaseUrl
        backendUrl         = $BackendUrl
        saltControlUrl     = $SaltControlUrl
        installer          = $manifest.salt.installer
        saltVersion        = $manifest.salt.version
        channel            = $manifest.salt.channel
        sha256             = $expectedSha
        controlOwnerSwitch = $false
        journalPath        = $journalPath
        note               = "Enrollment failure must not switch control-owner. Live mode forbids token-hash endpoint id."
    } | ConvertTo-Json -Compress
    exit 0
}

New-Item -ItemType Directory -Force -Path $smcRoot | Out-Null
Set-Content -LiteralPath $endpointFile -Value $endpointId -Encoding UTF8

$masterA = $masters[0]
$masterB = if ($masters.Count -gt 1) { [string]$masters[1] } else { $MasterB }
if ($masterB -eq "salt-b.internal") { $masterB = "" }

if ($InstallerPath) {
    Write-JournalState -State "MSI_VERIFIED" -Extra @{ endpointId = $endpointId; enrollmentId = $enrollmentId }
    & (Join-Path $here "install-salt-minion.ps1") `
        -Master $masterA -MinionId $endpointId `
        -InstallerPath $InstallerPath -ExpectedSha256 $expectedSha
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-JournalState -State "MINION_INSTALLED" -Extra @{ endpointId = $endpointId; enrollmentId = $enrollmentId }
}

if ($masterB) {
    & (Join-Path $here "configure-minion.ps1") `
        -Master $masterA -MasterB $masterB -EndpointId $endpointId -MasterFingerprint $MasterFingerprint -StartService
} else {
    & (Join-Path $here "configure-minion.ps1") `
        -Master $masterA -EndpointId $endpointId -MasterFingerprint $MasterFingerprint -StartService
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-JournalState -State "MINION_CONFIGURED" -Extra @{ endpointId = $endpointId; enrollmentId = $enrollmentId }

& (Join-Path $here "enroll-minion.ps1") `
    -EndpointId $endpointId `
    -BackendUrl $BackendUrl `
    -EnrollmentToken $EnrollmentToken `
    -SaltControlUrl $SaltControlUrl `
    -EnrollmentId $enrollmentId
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-JournalState -State "KEY_REPORTED" -Extra @{ endpointId = $endpointId; enrollmentId = $enrollmentId }

@{
    ok             = $true
    endpointId     = $endpointId
    enrollmentId   = $enrollmentId
    workMode       = $WorkMode
    controlOwner   = "unchanged"
    journalPath    = $journalPath
    note           = "control-owner salt only after journal COMPLETED (health+work probe)"
} | ConvertTo-Json -Compress
exit 0
