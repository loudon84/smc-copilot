#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$RequestId,
    [string]$ClientId = "",
    [int]$LogLines = 200
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\common\SmcOpsi.psm1") -Force
Import-Module (Join-Path $PSScriptRoot "..\..\controller\SmcController.psm1") -Force

if ($LogLines -gt 500) { $LogLines = 500 }
$bundleRoot = Join-Path $Root "diagnostics\$RequestId"
New-Item -ItemType Directory -Force -Path $bundleRoot | Out-Null

function Read-JsonIfExists {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    return (Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json)
}

function Read-LogTail {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return "" }
    $raw = Get-Content -LiteralPath $Path -TotalCount $LogLines -ErrorAction SilentlyContinue
    return Protect-SmcText -Text (($raw | ForEach-Object { $_ }) -join "`n")
}

$layout = Get-SmcControllerLayout -Root $Root
$active = Read-JsonIfExists -Path $layout.Active
$runtimeJson = $null
if ($active -and $active.active) {
    $runtimePath = Join-Path $active.active "runtime.json"
    $runtimeJson = Read-JsonIfExists -Path $runtimePath
}
$controller = Read-JsonIfExists -Path $layout.Current
$ownership = Read-JsonIfExists -Path $layout.Ownership
$tasks = Read-JsonIfExists -Path $layout.Tasks
$lastTxn = Get-ChildItem -LiteralPath $layout.Transactions -Filter "*.json" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
$lastTxnBody = if ($lastTxn) { Read-JsonIfExists -Path $lastTxn.FullName } else { $null }

$pythonVersion = ""
$pythonArch = ""
try {
    $pyInfo = & python -c "import platform,sys; print(sys.version.split()[0]); print(platform.machine())" 2>$null
    $pyLines = @($pyInfo)
    $pythonVersion = [string]$pyLines[0]
    $pythonArch = [string]$pyLines[1]
} catch {}

$nodeVersion = ""
$npmVersion = ""
try { $nodeVersion = [string](& node -v 2>$null) } catch {}
try { $npmVersion = [string](& npm -v 2>$null) } catch {}

$payload = [ordered]@{
    schema              = "smc.opsi.deployment-diagnostic.v1"
    requestId           = $RequestId
    clientId            = if ($ClientId) { $ClientId } else { [string]$ownership.clientId }
    opsiProductStatus   = [string]$ownership.status
    controllerRevision  = [string]$controller.revision
    controllerDigest    = [string]$controller.digest
    runtimeVersion      = [string]$active.version
    runtimeDigest       = [string]$active.digest
    activeJson          = Protect-SmcObject -InputObject $active
    runtimeJson         = Protect-SmcObject -InputObject $runtimeJson
    pythonVersion       = $pythonVersion
    pythonArchitecture  = $pythonArch
    nodeVersion         = $nodeVersion
    npmVersion          = $npmVersion
    gatewayTask         = [string]$tasks.gatewayTask
    gatewayPort         = [string]$tasks.gatewayPort
    gatewayStatus       = [string]$tasks.gatewayStatus
    lastTransaction     = Protect-SmcObject -InputObject $lastTxnBody
    lastInstallError    = Protect-SmcText -Text ([string]$ownership.lastInstallError)
    logs                = [ordered]@{
        adapter   = Read-LogTail -Path (Join-Path $Root "logs\adapter.log")
        controller = Read-LogTail -Path (Join-Path $Root "logs\controller.log")
        gateway   = Read-LogTail -Path (Join-Path $Root "logs\gateway.log")
        opsi      = Read-LogTail -Path (Join-Path $Root "logs\instlog-marker.txt")
    }
    redacted            = $true
}

$json = ConvertTo-SmcCanonicalJson -Object $payload
Set-Content -LiteralPath (Join-Path $bundleRoot "deployment-diagnostic.json") -Value $json -Encoding utf8
Write-Output $json
