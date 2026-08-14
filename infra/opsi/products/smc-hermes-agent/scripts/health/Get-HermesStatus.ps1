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
$version = ""
if (Test-Path -LiteralPath $versionPath) {
    try { $version = (Get-Content -LiteralPath $versionPath -Raw | ConvertFrom-Json).version } catch {}
}

$reachable = $false
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$GatewayPort/health" -UseBasicParsing -TimeoutSec 2
    $reachable = ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300)
} catch {}

$health = "UNKNOWN"
if ($reachable) { $health = "HEALTHY" }
elseif ($version) { $health = "WARNING" }
else { $health = "OFFLINE" }

$state = @{
    schema    = "smc.hermes.state.v1"
    owner     = "opsi"
    clientId  = $ClientId
    timestamp = [DateTime]::UtcNow.ToString("o")
    hermes    = @{ version = $version; profile = "default" }
    gateway   = @{ port = $GatewayPort; reachable = $reachable }
    config    = @{ revision = 0; status = "UNKNOWN" }
    health    = $health
}
Write-SmcJsonAtomic -Path (Join-Path $Root "state\hermes.json") -Object $state
$state | ConvertTo-Json -Compress
