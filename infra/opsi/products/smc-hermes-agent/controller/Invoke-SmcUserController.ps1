#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][string]$Sid,
    [Parameter(Mandatory = $true)][string]$RequestId,
    [Parameter(Mandatory = $true)][string]$ClientId,
    [string]$Root = "",
    [int]$GatewayPort = 8642,
    [string]$ManagedProfile = "default",
    [string]$HermesVersion = "",
    [string]$DesiredDigest = ""
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Import-Module (Join-Path $here "..\scripts\common\SmcOpsi.psm1") -Force
Import-Module (Join-Path $here "SmcController.psm1") -Force
if (-not $Root) { $Root = Get-SmcOpsiRoot }
$currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
if ($currentSid -ne $Sid) { throw "user controller refuses non-bound SID" }
$inbox = Join-Path $Root "commands\$Sid\inbox\$RequestId.json"
if (-not (Test-Path -LiteralPath $inbox)) { throw "inbox command missing" }
$command = Get-Content -LiteralPath $inbox -Raw | ConvertFrom-Json
if ($DesiredDigest -and [string]$command.desiredDigest -ne $DesiredDigest) { throw "command digest tamper" }
Complete-SmcUserCommand -Sid $Sid -RequestId $RequestId -Digest ([string]$command.desiredDigest) | Out-Null
exit 0
