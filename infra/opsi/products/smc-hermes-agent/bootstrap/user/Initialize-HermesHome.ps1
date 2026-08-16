#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$ManagedUserSid,
    [Parameter(Mandatory = $true)][string]$HermesVersion,
    [Parameter(Mandatory = $true)][string]$RequestId,
    [Parameter(Mandatory = $true)][string]$ClientId,
    [int]$GatewayPort = 8642,
    [string]$ManagedProfile = "default"
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\..\scripts\common\SmcOpsi.psm1") -Force

if ($ClientId -eq "local" -or [string]::IsNullOrWhiteSpace($ClientId)) {
    throw "clientId=local is forbidden"
}

$currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
if ($currentSid -ne $ManagedUserSid) {
    throw "refusing to initialize Hermes Home for a non-bound user"
}

$home = $env:HERMES_HOME
if (-not $home) {
    $profile = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$ManagedUserSid" -ErrorAction SilentlyContinue).ProfileImagePath
    if ($profile) { $home = Join-Path $profile ".hermes" }
}
if (-not $home) { throw "USER_CONTEXT_PENDING: cannot resolve HERMES_HOME" }
if (Test-SmcSystemProfilePath -Path $home) { throw "refusing systemprofile Hermes Home" }

New-Item -ItemType Directory -Force -Path $home | Out-Null
$cli = Resolve-SmcHermesCli -Root $Root
& $cli --version | Out-Null
try { & $cli config check | Out-Null } catch { throw "hermes config check failed" }
$gwTask = "SMC-Hermes-Gateway-$ManagedUserSid"
try { Start-SmcManagedTask -TaskName $gwTask } catch { throw "refusing SYSTEM CLI gateway start fallback" }
$ok = $false
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$GatewayPort/health" -UseBasicParsing -TimeoutSec 3
    $ok = ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300)
} catch {}
if (-not $ok) { throw "gateway health failed; restoring previous owner" }

$outboxDir = Join-Path $Root "continuations"
New-Item -ItemType Directory -Force -Path $outboxDir | Out-Null
$continuation = [ordered]@{
    parentRequestId = $RequestId
    clientId        = $ClientId
    status          = "SUCCEEDED"
    cliVersion      = $HermesVersion
}
$canonical = ConvertTo-SmcCanonicalJson -Object $continuation
$digest = Get-SmcSha256Text -Text $canonical
$continuation.contentDigest = $digest
Write-SmcJsonAtomic -Path (Join-Path $outboxDir "$RequestId.json") -Object $continuation

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
Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status "SUCCEEDED" -UserContext "USER"
