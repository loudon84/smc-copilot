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
    [Parameter(Mandatory = $true)][string]$ClientId,
    [int]$ConfigRevision = 0,
    [int]$AutoRepairLevel = 1,
    [int]$GatewayPort = 8642,
    [string]$ManagedUserSid = "",
    [string]$ManagedUserAccount = "",
    [string]$ManagedProfile = "default",
    [int]$DiagnosticLogLines = 200,
    [string]$ConfigDigest = "",
    [string]$GatewayAutostart = "true"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Import-Module (Join-Path $here "common\SmcOpsi.psm1") -Force

if (-not (Test-SmcAllowlistedParam -Name "RequestId" -Value $RequestId -MaxLength 80 -Pattern '^req_[A-Za-z0-9_-]{8,64}$')) {
    throw "RequestId must match req_*"
}
if (-not (Test-SmcAllowlistedParam -Name "ClientId" -Value $ClientId -MaxLength 128 -Pattern '^[A-Za-z0-9._-]+$')) {
    throw "ClientId must be a validated OPSI FQDN id, not COMPUTERNAME"
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

$payloadDigest = Get-SmcSha256Text -Text "$Action|$RequestId|$ClientId|$HermesVersion|$CustomOperation|$ConfigRevision|$ManagedUserSid"
$seen = Get-SmcSeenRequest -RequestId $RequestId
if ($seen -and $seen.status -in @("SUCCEEDED", "FAILED") -and $seen.payloadDigest -eq $payloadDigest) {
    Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status $seen.status -Message "idempotent replay" -UserContext "UNKNOWN"
    exit 0
}

$root = Get-SmcOpsiRoot
New-Item -ItemType Directory -Force -Path $root | Out-Null
$userContext = "SYSTEM"
if ($Action -in @("setup", "update")) {
    if (-not $ManagedUserSid -or -not $ManagedUserAccount) {
        Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status "FAILED" -ErrorCode "USER_BINDING_REQUIRED" -Message "managed_user_sid/account required" -UserContext "USER_CONTEXT_PENDING"
        exit 1
    }
    if (-not (Test-SmcUserBinding -Sid $ManagedUserSid -Account $ManagedUserAccount)) {
        $userContext = "USER_CONTEXT_PENDING"
    }
    else {
        $userContext = "USER"
    }
}

try {
    & (Join-Path $here "transaction\Start-SmcTransaction.ps1") -RequestId $RequestId -PayloadDigest $payloadDigest -TargetVersion $HermesVersion -TargetSid $ManagedUserSid | Out-Null
    switch ($Action) {
        "setup" {
            $owner = Get-SmcControlOwner
            if ($owner -in @("salt", "runtime")) {
                throw "owner conflict: refusing implicit migration from $owner"
            }
            & (Join-Path $here "install\Install-Hermes.ps1") -RequestId $RequestId -HermesVersion $HermesVersion -Root $root -ManagedUserSid $ManagedUserSid
        }
        "update" {
            & (Join-Path $here "install\Install-Hermes.ps1") -RequestId $RequestId -HermesVersion $HermesVersion -Root $root -ManagedUserSid $ManagedUserSid -Update
        }
        "uninstall" {
            & (Join-Path $here "install\Uninstall-OpsiManaged.ps1") -Root $root
        }
        "custom" {
            switch ($CustomOperation) {
                "status" { & (Join-Path $here "health\Get-HermesStatus.ps1") -Root $root -ClientId $ClientId -GatewayPort $GatewayPort -RequestId $RequestId }
                "collect-log" { & (Join-Path $here "diagnostics\Collect-Diagnostics.ps1") -Root $root -RequestId $RequestId -ClientId $ClientId -LogLines $DiagnosticLogLines }
                "apply-config" { & (Join-Path $here "config\Apply-ManagedConfig.ps1") -Root $root -Revision $ConfigRevision -ConfigDigest $ConfigDigest }
                "restart-gateway" { & (Join-Path $here "gateway\Restart-Gateway.ps1") -GatewayPort $GatewayPort -Root $root -ManagedUserSid $ManagedUserSid }
                "diagnose" { & (Join-Path $here "diagnostics\Collect-Diagnostics.ps1") -Root $root -RequestId $RequestId -ClientId $ClientId -LogLines $DiagnosticLogLines }
                "repair" { & (Join-Path $here "repair\Repair-Hermes.ps1") -Level $AutoRepairLevel -GatewayPort $GatewayPort -Root $root -ClientId $ClientId }
                default { throw "unreachable custom operation" }
            }
        }
        default {
            throw "unreachable action"
        }
    }

    if ($userContext -eq "USER_CONTEXT_PENDING" -and $Action -in @("setup", "update")) {
        Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status "RUNNING" -ErrorCode "USER_CONTEXT_PENDING" -Message "machine staged; waiting for user logon" -UserContext $userContext
        & (Join-Path $here "bootstrap\machine\Register-UserBootstrap.ps1") -Root $root -ManagedUserSid $ManagedUserSid -ManagedUserAccount $ManagedUserAccount -HermesVersion $HermesVersion -RequestId $RequestId -ClientId $ClientId | Out-Null
        Register-SmcRequestSeen -RequestId $RequestId -PayloadDigest $payloadDigest -Status "RUNNING"
        exit 10
    }
    Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status "SUCCEEDED" -UserContext $userContext
    & (Join-Path $here "transaction\Complete-SmcTransaction.ps1") -RequestId $RequestId -PayloadDigest $payloadDigest | Out-Null
    Register-SmcRequestSeen -RequestId $RequestId -PayloadDigest $payloadDigest -Status "SUCCEEDED"
    exit 0
}
catch {
    $msg = Protect-SmcText -Text ([string]$_)
    & (Join-Path $here "transaction\Rollback-SmcTransaction.ps1") -Root $root -ErrorMessage $msg | Out-Null
    Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status "FAILED" -ErrorCode "ADAPTER_FAILED" -Message $msg -UserContext $userContext
    Register-SmcRequestSeen -RequestId $RequestId -PayloadDigest $payloadDigest -Status "FAILED"
    exit 1
}
