#Requires -Version 5.1
<#
.SYNOPSIS
  Report local minion pubkey fingerprint for Salt Integration accept (client never accepts keys).
#>
param(
    [Parameter(Mandatory = $true)][string]$EndpointId,
    [Parameter(Mandatory = $true)][string]$BackendUrl,
    [Parameter(Mandatory = $true)][string]$EnrollmentToken,
    [string]$MinionKeyDir = "$env:ProgramData\Salt Project\Salt\conf\pki\minion",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$pub = Join-Path $MinionKeyDir "minion.pub"
$fingerprint = $null
if (Test-Path -LiteralPath $pub) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.IO.File]::ReadAllBytes($pub)
        $hash = ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join ""
        $fingerprint = ($hash -replace ".{2}", "$0:").TrimEnd(":")
    } finally {
        $sha.Dispose()
    }
}

if ($DryRun) {
    @{
        ok            = $true
        dryRun        = $true
        endpointId    = $EndpointId
        fingerprint   = $fingerprint
        pubkeyPath    = $pub
        pubkeyExists  = [bool](Test-Path -LiteralPath $pub)
        note          = "Client reports fingerprint only; Master auto_accept must stay false."
    } | ConvertTo-Json -Compress
    exit 0
}

if (-not $fingerprint) {
    @{ ok = $false; error = "minion_pubkey_missing"; path = $pub } | ConvertTo-Json -Compress
    exit 2
}

# Repo-only: write a local report file. Production posts to Salt Integration / Backend.
$reportDir = Join-Path $env:ProgramData "SMC\enrollment"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
$report = @{
    endpointId       = $EndpointId
    fingerprint      = $fingerprint
    backendUrl       = $BackendUrl
    enrollmentToken  = "***"
    reportedAt       = (Get-Date).ToString("o")
}
$reportPath = Join-Path $reportDir "$EndpointId.json"
$report | ConvertTo-Json | Set-Content -LiteralPath $reportPath -Encoding UTF8

@{ ok = $true; endpointId = $EndpointId; fingerprint = $fingerprint; reportPath = $reportPath } | ConvertTo-Json -Compress
exit 0
