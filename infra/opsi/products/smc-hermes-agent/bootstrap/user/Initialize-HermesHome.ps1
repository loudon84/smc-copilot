#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$ManagedUserSid,
    [Parameter(Mandatory = $true)][string]$HermesVersion,
    [Parameter(Mandatory = $true)][string]$RequestId
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\..\scripts\common\SmcOpsi.psm1") -Force

$currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
if ($currentSid -ne $ManagedUserSid) {
    throw "refusing to initialize Hermes Home for a non-bound user"
}

$home = $env:HERMES_HOME
if (-not $home) {
    $cli = Get-Command hermes -ErrorAction SilentlyContinue
    if ($cli) {
        try { $home = (& hermes config path 2>$null | Select-Object -First 1) } catch {}
    }
}
if (-not $home) {
    $profile = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$ManagedUserSid" -ErrorAction SilentlyContinue).ProfileImagePath
    if ($profile) { $home = Join-Path $profile ".hermes" }
}
if (-not $home) { throw "USER_CONTEXT_PENDING: cannot resolve HERMES_HOME" }
if (Test-SmcSystemProfilePath -Path $home) { throw "refusing systemprofile Hermes Home" }

New-Item -ItemType Directory -Force -Path $home | Out-Null
$cli = Get-Command hermes -ErrorAction SilentlyContinue
if ($cli) {
    & hermes --version | Out-Null
    try { & hermes config check | Out-Null } catch { throw "hermes config check failed" }
    try { & hermes gateway start | Out-Null } catch { throw "gateway start failed" }
    $ok = $false
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8642/health" -UseBasicParsing -TimeoutSec 3
        $ok = ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300)
    } catch {}
    if (-not $ok) { throw "gateway health failed; restoring previous owner" }
}

$ownerPath = Join-Path (Split-Path $Root) "control-owner.json"
Write-SmcJsonAtomic -Path $ownerPath -Object @{ hermes = "opsi" }
$versionJson = Join-Path $Root "state\version.json"
$prev = @{}
if (Test-Path -LiteralPath $versionJson) {
    try { $prev = Get-Content -LiteralPath $versionJson -Raw | ConvertFrom-Json } catch { $prev = @{} }
}
Write-SmcJsonAtomic -Path $versionJson -Object @{
    version   = $HermesVersion
    owner     = "opsi"
    requestId = $RequestId
    updatedAt = [DateTime]::UtcNow.ToString("o")
}
Write-SmcActionResult -RequestId $RequestId -ClientId "local" -Status "SUCCEEDED" -UserContext "USER"
