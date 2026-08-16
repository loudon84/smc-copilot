#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$ManagedUserSid,
    [Parameter(Mandatory = $true)][string]$ManagedUserAccount,
    [Parameter(Mandatory = $true)][string]$HermesVersion,
    [Parameter(Mandatory = $true)][string]$RequestId,
    [Parameter(Mandatory = $true)][string]$ClientId,
    [int]$GatewayPort = 8642,
    [string]$ManagedProfile = "default",
    [string]$GatewayAutostart = "true"
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\..\scripts\common\SmcOpsi.psm1") -Force

if (-not (Test-SmcUserBinding -Sid $ManagedUserSid -Account $ManagedUserAccount)) {
    Write-Output "USER_CONTEXT_PENDING: profile not ready"
}

$controllerDir = Join-Path $Root "controller"
$currentPtr = Join-Path $controllerDir "current.json"
$userScript = Join-Path $Root "bootstrap\user\Initialize-HermesHome.ps1"
if (Test-Path -LiteralPath $currentPtr) {
    try {
        $ptr = Get-Content -LiteralPath $currentPtr -Raw | ConvertFrom-Json
        $installedUser = Join-Path ([string]$ptr.path) "Invoke-SmcUserController.ps1"
        if (Test-Path -LiteralPath $installedUser) { $userScript = $installedUser }
    } catch {}
}

$bootstrapName = "SMC-Hermes-User-Bootstrap-$ManagedUserSid"
$gatewayName = "SMC-Hermes-Gateway-$ManagedUserSid"
$userControllerName = "SMC-Hermes-Controller-User-$ManagedUserSid"
$arg = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$userScript`" -Root `"$Root`" -ManagedUserSid `"$ManagedUserSid`" -HermesVersion `"$HermesVersion`" -RequestId `"$RequestId`" -ClientId `"$ClientId`" -GatewayPort $GatewayPort -ManagedProfile `"$ManagedProfile`""
Register-SmcManagedTask -TaskName $bootstrapName -Execute "powershell.exe" -Argument $arg -UserId $ManagedUserAccount | Out-Null
Register-SmcManagedTask -TaskName $userControllerName -Execute "powershell.exe" -Argument $arg -UserId $ManagedUserAccount | Out-Null

$cli = Resolve-SmcHermesCli -Root $Root
$profilePath = ""
try {
    $profile = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$ManagedUserSid" -ErrorAction SilentlyContinue).ProfileImagePath
    if ($profile) { $profilePath = Join-Path $profile ".hermes" }
} catch {}
$gwArg = "gateway start --bind 127.0.0.1 --port $GatewayPort --profile $ManagedProfile"
if ($GatewayAutostart -eq "false") { $gwArg = "gateway status --port $GatewayPort" }
$envPrefix = ""
if ($profilePath) { $envPrefix = "set HERMES_HOME=$profilePath&& " }
Register-SmcManagedTask -TaskName $gatewayName -Execute $cli -Argument $gwArg -UserId $ManagedUserAccount | Out-Null

$taskDigest = Get-SmcSha256Text -Text "$cli|$gwArg|$profilePath|$ManagedProfile|$GatewayPort"
Write-SmcJsonAtomic -Path (Get-SmcTaskManifestPath) -Object ([ordered]@{
        bootstrapTask      = $bootstrapName
        gatewayTask        = $gatewayName
        userControllerTask = $userControllerName
        sid                = $ManagedUserSid
        account            = $ManagedUserAccount
        cli                = $cli
        hermesHome         = $profilePath
        profile            = $ManagedProfile
        bind               = "127.0.0.1"
        port               = $GatewayPort
        autostart          = $GatewayAutostart
        version            = $HermesVersion
        taskDigest         = $taskDigest
        registered         = $true
    })
Write-SmcJsonAtomic -Path (Join-Path $Root "state\tasks.json") -Object ([ordered]@{
        gateway   = $gatewayName
        bootstrap = $bootstrapName
        user      = $userControllerName
        digest    = $taskDigest
    })
