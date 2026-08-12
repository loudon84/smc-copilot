#Requires -Version 5.1
<#
.SYNOPSIS
  Backup Salt Master config/PKI/Pillar/Extension/Release metadata for v2.3.1 restore drills.
  Does not copy private key material into git evidence directories.
#>
param(
  [string]$MasterHost = "192.168.102.104",
  [Parameter(Mandatory = $true)]
  [string]$OutputDir,
  [string]$RemoteUser = $env:SMC_SALT_MASTER_USER
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$manifest = [ordered]@{
  schema = "smc.salt-master-backup.v1"
  capturedAt = (Get-Date).ToUniversalTime().ToString("o")
  masterHost = $MasterHost
  items = @()
  secretsPolicy = "no_private_keys_in_git_evidence"
  status = "implemented_script"
  note = "Operator must run against live Master and store fingerprints only in docs/salt/evidence/v2.3.1/"
}

$checklist = @(
  "/etc/salt/master",
  "/etc/salt/master.d",
  "/etc/salt/pki/master/*.pub",
  "/srv/pillar",
  "/srv/salt",
  "/var/cache/salt/master/jobs.meta (optional)"
)

foreach ($item in $checklist) {
  $manifest.items += @{ path = $item; copied = $false; manualGate = $true }
}

$manifestPath = Join-Path $OutputDir "backup-manifest.json"
($manifest | ConvertTo-Json -Depth 6) | Set-Content -Path $manifestPath -Encoding utf8
Write-Host "Wrote $manifestPath"
Write-Host "Remote copy from ${RemoteUser}@${MasterHost} is Manual Gate — use approved jump host / scp."
