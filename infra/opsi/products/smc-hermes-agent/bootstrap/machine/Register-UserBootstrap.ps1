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
$common = Join-Path $PSScriptRoot "..\..\scripts\common\SmcOpsi.psm1"
if (-not (Test-Path -LiteralPath $common)) {
    $common = Join-Path $PSScriptRoot "..\..\SmcOpsi.psm1"
}
Import-Module $common -Force

if (-not (Test-SmcUserBinding -Sid $ManagedUserSid -Account $ManagedUserAccount)) {
    Write-Output "USER_CONTEXT_PENDING: profile not ready"
}

$controllerDir = Join-Path $Root "controller"
$currentPtr = Join-Path $controllerDir "current.json"
$userScript = Join-Path $Root "bootstrap\user\Initialize-HermesHome.ps1"
$wrapper = Join-Path $PSScriptRoot "..\..\controller\Start-SmcHermesGateway.ps1"
$installedPath = ""
if (Test-Path -LiteralPath $currentPtr) {
    try {
        $ptr = Get-Content -LiteralPath $currentPtr -Raw | ConvertFrom-Json
        $installedPath = [string]$ptr.path
        $installedUser = Join-Path $installedPath "Invoke-SmcUserController.ps1"
        if (Test-Path -LiteralPath $installedUser) { $userScript = $installedUser }
        $installedWrap = Join-Path $installedPath "Start-SmcHermesGateway.ps1"
        if (Test-Path -LiteralPath $installedWrap) { $wrapper = $installedWrap }
    } catch {}
}
if (-not (Test-Path -LiteralPath $wrapper)) {
    $wrapper = Join-Path $installedPath "Start-SmcHermesGateway.ps1"
}
if (-not (Test-Path -LiteralPath $wrapper)) { throw "Start-SmcHermesGateway wrapper missing" }

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
$gwAction = "start"
if ($GatewayAutostart -eq "false") { $gwAction = "status" }
$gwArg = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$wrapper`" -HermesExe `"$cli`" -HermesHome `"$profilePath`" -Profile `"$ManagedProfile`" -Port $GatewayPort -Bind 127.0.0.1 -GatewayAction $gwAction"
Register-SmcManagedTask -TaskName $gatewayName -Execute "powershell.exe" -Argument $gwArg -UserId $ManagedUserAccount | Out-Null

$taskDigest = Get-SmcSha256Text -Text "$wrapper|$cli|$profilePath|$ManagedProfile|$GatewayPort|$gwAction"
Write-SmcJsonAtomic -Path (Get-SmcTaskManifestPath) -Object ([ordered]@{
        bootstrapTask      = $bootstrapName
        gatewayTask        = $gatewayName
        userControllerTask = $userControllerName
        sid                = $ManagedUserSid
        account            = $ManagedUserAccount
        wrapper            = $wrapper
        cli                = $cli
        hermesHome         = $profilePath
        profile            = $ManagedProfile
        bind               = "127.0.0.1"
        port               = $GatewayPort
        autostart          = $GatewayAutostart
        version            = $HermesVersion
        taskDigest         = $taskDigest
        desired            = @{ exe = $cli; home = $profilePath; wrapper = $wrapper }
        observed           = @{ exe = $cli; home = $profilePath; wrapper = $wrapper }
        registered         = $true
    })
Write-SmcJsonAtomic -Path (Join-Path $Root "state\tasks.json") -Object ([ordered]@{
        gateway   = $gatewayName
        bootstrap = $bootstrapName
        user      = $userControllerName
        digest    = $taskDigest
        wrapper   = $wrapper
        exe       = $cli
        home      = $profilePath
    })
