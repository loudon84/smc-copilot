#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$ClientId,
    [int]$GatewayPort = 8642
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\common\SmcOpsi.psm1") -Force

$versionPath = Join-Path $Root "state\version.json"
$version = "unknown"
$revision = 0
if (Test-Path -LiteralPath $versionPath) {
    try {
        $vj = Get-Content -LiteralPath $versionPath -Raw | ConvertFrom-Json
        if ($vj.version) { $version = [string]$vj.version }
    } catch {}
}
$configPath = Join-Path $Root "managed\config\current.json"
$configStatus = "UNKNOWN"
if (Test-Path -LiteralPath $configPath) {
    try {
        $cfg = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
        $revision = [int]$cfg.revision
        $configStatus = "CURRENT"
    } catch { $configStatus = "FAILED" }
}

$cliOk = $false
$doctor = "unknown"
$cli = Get-Command hermes -ErrorAction SilentlyContinue
if ($cli) {
    $cliOk = $true
    try { & hermes --version | Out-Null } catch { $cliOk = $false }
    try { & hermes config check | Out-Null } catch { $configStatus = "FAILED" }
    try { $doctor = ((& hermes doctor 2>$null | Out-String).Trim()) } catch { $doctor = "failed" }
}

$reachable = $false
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$GatewayPort/health" -UseBasicParsing -TimeoutSec 2
    $reachable = ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300)
} catch {}

$diskFree = 0
try {
    $drive = Get-PSDrive -Name ($Root.Substring(0, 1)) -ErrorAction SilentlyContinue
    if ($drive) { $diskFree = [int64]$drive.Free }
} catch {}

$health = "UNKNOWN"
if ($reachable -and $cliOk -and $configStatus -ne "FAILED") { $health = "HEALTHY" }
elseif ($version -and $version -ne "unknown") { $health = "WARNING" }
else { $health = "OFFLINE" }

$state = [ordered]@{
    schema    = "smc.hermes.state.v1"
    owner     = "opsi"
    clientId  = $ClientId
    timestamp = [DateTime]::UtcNow.ToString("o")
    hermes    = @{ version = $version; profile = "default" }
    gateway   = @{ port = $GatewayPort; reachable = $reachable }
    config    = @{ revision = $revision; status = $configStatus }
    health    = $health
}
Write-SmcJsonAtomic -Path (Join-Path $Root "state\hermes.json") -Object $state
Write-SmcJsonAtomic -Path (Join-Path $Root "state\probes.json") -Object @{
    cli       = $cliOk
    doctor    = [string]$doctor.Substring(0, [Math]::Min(64, ([string]$doctor).Length))
    diskFree  = $diskFree
    userSid   = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    ownerFile = Get-SmcControlOwner
}
Write-SmcJsonAtomic -Path (Join-Path $Root "state\hermes.json") -Object $state
$state | ConvertTo-Json -Compress -Depth 8
