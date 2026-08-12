#Requires -Version 5.1
<#
.SYNOPSIS
  Backup Minion/Hermes/owner state before identity or handover changes (v2.3 Phase 0/4).
  Never copies private keys into the repo. Writes a redacted manifest under ProgramData\SMC\backups.
#>
param(
    [string]$BackupRoot = "$env:ProgramData\SMC\backups",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dest = Join-Path $BackupRoot $stamp

$minionConf = "$env:ProgramData\Salt Project\Salt\conf"
$smc = Join-Path $env:ProgramData "SMC"

$items = @(
    @{ name = "minion_conf"; path = $minionConf; copy = $true; redactPrivate = $true },
    @{ name = "endpoint_id"; path = (Join-Path $smc "endpoint-id"); copy = $true },
    @{ name = "control_owner"; path = (Join-Path $smc "control-owner.json"); copy = $true },
    @{ name = "bootstrap_journal"; path = (Join-Path $smc "bootstrap-journal.json"); copy = $true }
)

$manifest = [ordered]@{
    schema       = "smc.minion-backup.v1"
    createdAt    = (Get-Date).ToUniversalTime().ToString("o")
    destination  = $dest
    dryRun       = [bool]$DryRun
    saltService  = $null
    hermesLocal  = $null
    items        = @()
    warnings     = @()
}

try {
    $svc = Get-Service -Name "salt-minion" -ErrorAction Stop
    $manifest.saltService = @{ status = "$($svc.Status)"; startType = "$($svc.StartType)" }
} catch {
    $manifest.warnings += "salt-minion service missing"
}

try {
    $hs = Get-Service -Name "HermesLocalService" -ErrorAction SilentlyContinue
    if ($hs) { $manifest.hermesLocal = @{ status = "$($hs.Status)"; startType = "$($hs.StartType)" } }
} catch {}

if ($DryRun) {
    $manifest | ConvertTo-Json -Depth 6
    exit 0
}

New-Item -ItemType Directory -Force -Path $dest | Out-Null
foreach ($item in $items) {
    $entry = [ordered]@{ name = $item.name; source = $item.path; present = (Test-Path $item.path); copied = $false }
    if ($entry.present -and $item.copy) {
        $target = Join-Path $dest $item.name
        if ((Get-Item $item.path).PSIsContainer) {
            New-Item -ItemType Directory -Force -Path $target | Out-Null
            Get-ChildItem $item.path -Recurse -File | Where-Object {
                $_.Name -notmatch '(?i)(private|\.pem$|master\.pem|minion\.pem)'
            } | ForEach-Object {
                $rel = $_.FullName.Substring($item.path.Length).TrimStart('\')
                $out = Join-Path $target $rel
                New-Item -ItemType Directory -Force -Path (Split-Path $out -Parent) | Out-Null
                Copy-Item $_.FullName $out -Force
            }
            $entry.copied = $true
            $entry.note = "private key material excluded"
        } else {
            Copy-Item $item.path $target -Force
            $entry.copied = $true
        }
    }
    $manifest.items += $entry
}

$manifestPath = Join-Path $dest "manifest.json"
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
@{ ok = $true; backup = $dest; manifest = $manifestPath } | ConvertTo-Json -Compress
exit 0
