#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][ValidateSet("setup", "update", "uninstall", "custom", "recover")][string]$Action,
    [string]$RequestId = "req_recover01",
    [string]$CustomOperation = "",
    [string]$HermesVersion = "",
    [string]$ClientId = "",
    [int]$ConfigRevision = 0,
    [int]$AutoRepairLevel = 1,
    [int]$GatewayPort = 8642,
    [string]$ManagedUserSid = "",
    [string]$ManagedUserAccount = "",
    [string]$ManagedProfile = "default",
    [int]$DiagnosticLogLines = 200,
    [string]$ConfigDigest = "",
    [string]$ConfigPayload = "",
    [string]$GatewayAutostart = "true",
    [string]$AckToken = ""
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootGuess = if ($env:SMC_OPSI_ROOT) { $env:SMC_OPSI_ROOT } elseif ($env:ProgramData) { Join-Path $env:ProgramData "SMC\opsi" } else { "C:\ProgramData\SMC\opsi" }
$common = Join-Path $rootGuess "scripts\common\SmcOpsi.psm1"
if (-not (Test-Path -LiteralPath $common)) {
    $common = Join-Path $here "..\scripts\common\SmcOpsi.psm1"
}
if (-not (Test-Path -LiteralPath $common)) {
    $common = Join-Path $here "SmcOpsi.psm1"
}
Import-Module $common -Force
$controllerMod = Join-Path $here "SmcController.psm1"
if (-not (Test-Path -LiteralPath $controllerMod)) {
    $controllerMod = Join-Path $here "..\controller\SmcController.psm1"
}
Import-Module $controllerMod -Force

$root = Get-SmcOpsiRoot
if ($Action -eq "recover") {
    Get-ChildItem -LiteralPath (Join-Path $root "transactions") -Filter "*.json" -ErrorAction SilentlyContinue | ForEach-Object {
        $jid = [IO.Path]::GetFileNameWithoutExtension($_.Name)
        Resume-SmcJournalV2 -RequestId $jid | Out-Null
    }
    exit 0
}

$adapter = Join-Path $here "..\scripts\Invoke-SmcHermesAgent.ps1"
if (-not (Test-Path -LiteralPath $adapter)) {
    $adapter = Join-Path (Get-SmcControllerLayout).Root "scripts\Invoke-SmcHermesAgent.ps1"
}
$params = @{
    Action              = $Action
    RequestId           = $RequestId
    CustomOperation     = $CustomOperation
    HermesVersion       = $HermesVersion
    ClientId            = $ClientId
    ConfigRevision      = $ConfigRevision
    AutoRepairLevel     = $AutoRepairLevel
    GatewayPort         = $GatewayPort
    ManagedUserSid      = $ManagedUserSid
    ManagedUserAccount  = $ManagedUserAccount
    ManagedProfile      = $ManagedProfile
    DiagnosticLogLines  = $DiagnosticLogLines
    ConfigDigest        = $ConfigDigest
    GatewayAutostart    = $GatewayAutostart
}
& $adapter @params -ConfigPayload $ConfigPayload -AckToken $AckToken
exit $LASTEXITCODE
