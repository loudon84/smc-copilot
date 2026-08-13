#Requires -Version 5.1
<#
.SYNOPSIS
  Report local minion pubkey fingerprint for Salt Control accept (client never accepts keys).
  Live: POST /salt/v1/enrollments/{id}/fingerprint and poll status. DryRun still OK.
#>
param(
    [Parameter(Mandatory = $true)][string]$EndpointId,
    [Parameter(Mandatory = $true)][string]$BackendUrl,
    [Parameter(Mandatory = $true)][string]$EnrollmentToken,
    [string]$SaltControlUrl = "",
    [string]$EnrollmentId = "",
    [string]$MinionKeyDir = "$env:ProgramData\Salt Project\Salt\conf\pki\minion",
    [int]$PollAttempts = 30,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$pub = Join-Path $MinionKeyDir "minion.pub"
$fingerprint = $null
if (Test-Path -LiteralPath $pub) {
    $serviceExe = (Get-CimInstance Win32_Service -Filter "Name='salt-minion'").PathName.Trim('"')
    $python = Join-Path (Split-Path -Parent $serviceExe) "Scripts\python.exe"
    if (-not (Test-Path -LiteralPath $python)) {
        $python = Join-Path (Split-Path -Parent (Get-Command salt-call.exe -ErrorAction Stop).Source) "Scripts\python.exe"
    }
    $fingerprint = (& $python -c "import salt.utils.crypt; print(salt.utils.crypt.pem_finger(r'$pub'))").Trim()
}

if ($DryRun) {
    @{
        ok            = $true
        dryRun        = $true
        endpointId    = $EndpointId
        enrollmentId  = $EnrollmentId
        fingerprint   = $fingerprint
        pubkeyPath    = $pub
        pubkeyExists  = [bool](Test-Path -LiteralPath $pub)
        saltControlUrl = $SaltControlUrl
        note          = "Client reports fingerprint only; Master auto_accept must stay false."
    } | ConvertTo-Json -Compress
    exit 0
}

if (-not $fingerprint) {
    @{ ok = $false; error = "minion_pubkey_missing"; path = $pub } | ConvertTo-Json -Compress
    exit 2
}

$reportDir = Join-Path $env:ProgramData "SMC\enrollment"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

if ($SaltControlUrl -and $EnrollmentId) {
    $here = Split-Path -Parent $MyInvocation.MyCommand.Path
    $saltRoot = Split-Path -Parent (Split-Path -Parent $here)
    $py = @"
import json, sys, time
from pathlib import Path
sys.path.insert(0, r'$saltRoot')
from client.salt_control_client import SaltControlClient
from client.device_credential import DeviceCredentialStore

store = DeviceCredentialStore(
    Path(r'$env:ProgramData') / 'SMC' / 'credentials' / 'device.dat',
)
client = SaltControlClient(r'$SaltControlUrl', credential_store=store)
reported = client.report_fingerprint(
    r'$EnrollmentId',
    endpoint_id=r'$EndpointId',
    fingerprint=r'$fingerprint',
)
status = client.poll_until(r'$EnrollmentId', max_attempts=$PollAttempts, sleep_fn=lambda s: time.sleep(min(s, 0.01)))
print(json.dumps({'ok': True, 'reported': reported, 'status': status}))
"@
    $result = python -c $py
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $parsed = $result | ConvertFrom-Json
    $reportPath = Join-Path $reportDir "$EndpointId.json"
    @{
        endpointId      = $EndpointId
        enrollmentId    = $EnrollmentId
        fingerprint     = $fingerprint
        saltControlUrl  = $SaltControlUrl
        status          = $parsed.status
        reportedAt      = (Get-Date).ToString("o")
    } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $reportPath -Encoding UTF8
    @{ ok = $true; endpointId = $EndpointId; enrollmentId = $EnrollmentId; fingerprint = $fingerprint; reportPath = $reportPath; polled = $true } | ConvertTo-Json -Compress
    exit 0
}

# Without SaltControlUrl: local report only (lab / offline).
$report = @{
    endpointId       = $EndpointId
    fingerprint      = $fingerprint
    backendUrl       = $BackendUrl
    enrollmentToken  = "***"
    reportedAt       = (Get-Date).ToString("o")
    note             = "local report; set -SaltControlUrl for live POST+poll"
}
$reportPath = Join-Path $reportDir "$EndpointId.json"
$report | ConvertTo-Json | Set-Content -LiteralPath $reportPath -Encoding UTF8

@{ ok = $true; endpointId = $EndpointId; fingerprint = $fingerprint; reportPath = $reportPath } | ConvertTo-Json -Compress
exit 0
