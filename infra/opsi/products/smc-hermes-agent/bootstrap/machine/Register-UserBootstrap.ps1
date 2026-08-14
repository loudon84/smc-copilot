#Requires -Version 5.1
param([Parameter(Mandatory = $true)][string]$Root)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\..\common\SmcOpsi.psm1") -Force

# SYSTEM registers a logon trigger. Does not initialize Hermes Home.
$taskName = "SMC-Hermes-User-Bootstrap"
$userScript = Join-Path $Root "bootstrap\user\Initialize-HermesHome.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$userScript`" -Root `"$Root`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
try {
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Force | Out-Null
} catch {
    # Lab/CI without ScheduledTask cmdlets: write definition only.
    Write-SmcJsonAtomic -Path (Join-Path $Root "bootstrap\machine\task-definition.json") -Object @{
        name    = $taskName
        script  = $userScript
        trigger = "AtLogOn"
    }
}
