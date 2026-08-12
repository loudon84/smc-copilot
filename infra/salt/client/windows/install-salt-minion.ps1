#Requires -Version 5.1
<#
.SYNOPSIS
  Silent-install Salt Minion MSI from client-manifest (SHA-256 required).
#>
param(
    [Parameter(Mandatory = $true)][string]$Master,
    [Parameter(Mandatory = $true)][string]$MinionId,
    [Parameter(Mandatory = $true)][string]$InstallerPath,
    [Parameter(Mandatory = $true)][string]$ExpectedSha256,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $InstallerPath)) {
    @{ ok = $false; error = "installer_missing"; path = $InstallerPath } | ConvertTo-Json -Compress
    exit 2
}

$actual = (Get-FileHash -LiteralPath $InstallerPath -Algorithm SHA256).Hash.ToLowerInvariant()
$expected = $ExpectedSha256.ToLowerInvariant()
if ($actual -ne $expected) {
    @{ ok = $false; error = "sha256_mismatch"; actual = $actual; expected = $expected } | ConvertTo-Json -Compress
    exit 3
}

$msiArgs = @(
    "/i", $InstallerPath,
    "/quiet", "/norestart",
    "MASTER=$Master",
    "MINION_ID=$MinionId",
    'START_MINION=""'
)

if ($DryRun) {
    @{
        ok            = $true
        dryRun        = $true
        command       = "msiexec $($msiArgs -join ' ')"
        sha256        = $actual
        minionId      = $MinionId
        startMinion   = $false
    } | ConvertTo-Json -Compress
    exit 0
}

$proc = Start-Process -FilePath "msiexec.exe" -ArgumentList $msiArgs -Wait -PassThru
$ok = $proc.ExitCode -eq 0 -or $proc.ExitCode -eq 3010
@{
    ok       = $ok
    exitCode = $proc.ExitCode
    minionId = $MinionId
} | ConvertTo-Json -Compress
if (-not $ok) { exit $proc.ExitCode }
exit 0
