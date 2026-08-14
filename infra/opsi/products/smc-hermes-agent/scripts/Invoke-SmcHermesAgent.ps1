#Requires -Version 5.1
<#
.SYNOPSIS
  Short-lived OPSI management adapter. No listener, no Chat proxy.
#>
param(
    [Parameter(Mandatory = $true)][ValidateSet("setup", "update", "uninstall", "custom")][string]$Action,
    [Parameter(Mandatory = $true)][string]$RequestId,
    [string]$CustomOperation = "",
    [string]$HermesVersion = "",
    [string]$ClientId = $env:COMPUTERNAME,
    [int]$ConfigRevision = 0,
    [int]$AutoRepairLevel = 1,
    [int]$GatewayPort = 8642
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Import-Module (Join-Path $here "common\SmcOpsi.psm1") -Force

if ($RequestId -notmatch '^req_[A-Za-z0-9_-]{8,64}$') {
    throw "RequestId must match req_*"
}

$allowedCustom = @("status", "collect-log", "apply-config", "restart-gateway", "diagnose", "repair")
if ($Action -eq "custom" -and $allowedCustom -notcontains $CustomOperation) {
    Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status "FAILED" -ErrorCode "UNKNOWN_OPERATION" -Message "custom_operation not allowlisted"
    exit 2
}

if ($HermesVersion -eq "latest") {
    Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status "FAILED" -ErrorCode "VERSION_NOT_PINNED" -Message "latest is forbidden"
    exit 3
}

if (Test-SmcRequestIdempotent -RequestId $RequestId) {
    Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status "SUCCEEDED" -Message "idempotent replay" -UserContext "UNKNOWN"
    exit 0
}

$root = Get-SmcOpsiRoot
New-Item -ItemType Directory -Force -Path $root | Out-Null
$journal = Join-Path $root "state\journal.json"
$sid = Get-SmcLoggedOnSid
$userContext = if ([string]::IsNullOrWhiteSpace($sid)) { "USER_CONTEXT_PENDING" } else { "USER" }

try {
    switch ($Action) {
        "setup" {
            & (Join-Path $here "install\Install-Hermes.ps1") -RequestId $RequestId -HermesVersion $HermesVersion -Root $root
        }
        "update" {
            & (Join-Path $here "install\Install-Hermes.ps1") -RequestId $RequestId -HermesVersion $HermesVersion -Root $root -Update
        }
        "uninstall" {
            & (Join-Path $here "install\Uninstall-OpsiManaged.ps1") -Root $root
        }
        "custom" {
            switch ($CustomOperation) {
                "status" { & (Join-Path $here "health\Get-HermesStatus.ps1") -Root $root -ClientId $ClientId -GatewayPort $GatewayPort }
                "collect-log" { & (Join-Path $here "diagnostics\Collect-Diagnostics.ps1") -Root $root -RequestId $RequestId -ClientId $ClientId }
                "apply-config" { & (Join-Path $here "config\Apply-ManagedConfig.ps1") -Root $root -Revision $ConfigRevision }
                "restart-gateway" { & (Join-Path $here "gateway\Restart-Gateway.ps1") -GatewayPort $GatewayPort }
                "diagnose" { & (Join-Path $here "diagnostics\Collect-Diagnostics.ps1") -Root $root -RequestId $RequestId -ClientId $ClientId }
                "repair" { & (Join-Path $here "repair\Repair-Hermes.ps1") -Level $AutoRepairLevel -GatewayPort $GatewayPort }
                default { throw "unreachable custom operation" }
            }
        }
        default {
            throw "unreachable action"
        }
    }

    if ($userContext -eq "USER_CONTEXT_PENDING" -and $Action -in @("setup", "update")) {
        Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status "SUCCEEDED" -Message "machine staged; waiting for user logon" -UserContext $userContext
        & (Join-Path $here "bootstrap\machine\Register-UserBootstrap.ps1") -Root $root | Out-Null
    }
    else {
        Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status "SUCCEEDED" -UserContext $userContext
    }
    Write-SmcJsonAtomic -Path $journal -Object @{ phase = "commit"; requestId = $RequestId }
    Register-SmcRequestSeen -RequestId $RequestId
    exit 0
}
catch {
    $msg = Protect-SmcText -Text ([string]$_)
    Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status "FAILED" -ErrorCode "ADAPTER_FAILED" -Message $msg -UserContext $userContext
    exit 1
}
