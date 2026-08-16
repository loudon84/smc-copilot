#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][int]$Revision,
    [string]$ConfigDigest = ""
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\common\SmcOpsi.psm1") -Force

$currentPath = Join-Path $Root "managed\config\current.json"
$backupPath = Join-Path $Root "managed\config\backup-$Revision.json"
$incomingPath = Join-Path $Root "managed\config\incoming.json"

$currentRev = 0
$currentDigest = ""
if (Test-Path -LiteralPath $currentPath) {
    $current = Get-Content -LiteralPath $currentPath -Raw | ConvertFrom-Json
    $currentRev = [int]$current.revision
    if ($current.digest) { $currentDigest = [string]$current.digest }
    if ($Revision -lt $currentRev) { throw "stale revision $Revision < $currentRev" }
    if ($Revision -eq $currentRev) {
        if ($ConfigDigest -and $currentDigest -and $ConfigDigest -ne $currentDigest) {
            throw "revision conflict: same revision different digest"
        }
        return
    }
}

if (-not (Test-Path -LiteralPath $incomingPath)) {
    throw "missing incoming managed config (revision-only apply is forbidden)"
}

$incoming = Get-Content -LiteralPath $incomingPath -Raw | ConvertFrom-Json
if ($incoming.schema -ne "smc.opsi.managed-config.v1") { throw "invalid managed-config schema" }
if ([int]$incoming.revision -ne $Revision) { throw "incoming revision mismatch" }

$allow = @("gateway_port", "gateway_bind", "gateway_autostart", "managed_profile", "diagnostics_enabled", "diagnostic_log_lines", "auto_repair_level")
$keys = @{}
foreach ($name in $allow) {
    if ($incoming.keys.PSObject.Properties.Name -contains $name) {
        $keys[$name] = $incoming.keys.$name
    }
}

$canonical = ConvertTo-SmcCanonicalJson -Object ([ordered]@{ revision = $Revision; keys = $keys })
$digest = Get-SmcSha256Text -Text $canonical
if ($ConfigDigest -and $ConfigDigest -ne $digest) { throw "config digest mismatch" }

if (Test-Path -LiteralPath $currentPath) {
    Copy-Item -LiteralPath $currentPath -Destination $backupPath -Force
}

$merged = @{
    schema   = "smc.opsi.managed-config.v1"
    revision = $Revision
    keys     = $keys
    digest   = $digest
}
try {
    Write-SmcJsonAtomic -Path $currentPath -Object $merged
    $hermesHome = $env:HERMES_HOME
    if ($hermesHome) {
        $hermesCfg = Join-Path $hermesHome "config.json"
        $existing = @{}
        if (Test-Path -LiteralPath $hermesCfg) {
            try { $existing = Get-Content -LiteralPath $hermesCfg -Raw | ConvertFrom-Json } catch { $existing = @{} }
        }
        $allow | ForEach-Object {
            if ($keys.ContainsKey($_)) { $existing | Add-Member -NotePropertyName $_ -NotePropertyValue $keys[$_] -Force }
        }
        Write-SmcJsonAtomic -Path $hermesCfg -Object $existing
    }
    $cli = Resolve-SmcHermesCli -Root $Root
    & $cli config check
    if ($LASTEXITCODE -ne 0) { throw "hermes config check failed" }
}
catch {
    if (Test-Path -LiteralPath $backupPath) {
        Copy-Item -LiteralPath $backupPath -Destination $currentPath -Force
    }
    throw
}
