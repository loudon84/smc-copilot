#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$ManagedUserSid,
    [Parameter(Mandatory = $true)][string]$ManagedUserAccount,
    [Parameter(Mandatory = $true)][string]$HermesVersion,
    [Parameter(Mandatory = $true)][string]$RequestId
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\..\scripts\common\SmcOpsi.psm1") -Force

if (-not (Test-SmcUserBinding -Sid $ManagedUserSid -Account $ManagedUserAccount)) {
    Write-Output "USER_CONTEXT_PENDING: profile not ready"
}

$taskName = "SMC-Hermes-User-Bootstrap-$ManagedUserSid"
$userScript = Join-Path $Root "bootstrap\user\Initialize-HermesHome.ps1"
$arg = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$userScript`" -Root `"$Root`" -ManagedUserSid `"$ManagedUserSid`" -HermesVersion `"$HermesVersion`" -RequestId `"$RequestId`""
try {
    $principal = New-ScheduledTaskPrincipal -UserId $ManagedUserAccount -LogonType Interactive -RunLevel Limited
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arg
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $ManagedUserAccount
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
}
catch {
    Write-SmcJsonAtomic -Path (Join-Path $Root "bootstrap\machine\task-definition.json") -Object @{
        name      = $taskName
        script    = $userScript
        trigger   = "AtLogOn"
        principal = $ManagedUserAccount
        sid       = $ManagedUserSid
    }
}
