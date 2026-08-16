#Requires -Version 5.1
<#
.SYNOPSIS
  Thin OPSI bootstrap + installed Endpoint Controller dispatch. No listener, no Chat proxy.
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
    [string]$ConfigPayload = "",
    [string]$GatewayAutostart = "true",
    [string]$AckToken = "",
    [string]$ControllerRevision = "1"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Import-Module (Join-Path $here "common\SmcOpsi.psm1") -Force
$controllerModule = Join-Path $here "..\controller\SmcController.psm1"
if (Test-Path -LiteralPath $controllerModule) {
    Import-Module $controllerModule -Force
}

if (-not (Test-SmcAllowlistedParam -Name "RequestId" -Value $RequestId -MaxLength 80 -Pattern '^req_[A-Za-z0-9_-]{8,64}$')) {
    throw "RequestId must match req_*"
}
if (-not (Test-SmcAllowlistedParam -Name "ClientId" -Value $ClientId -MaxLength 128 -Pattern '^[A-Za-z0-9._-]+$')) {
    throw "ClientId must be a validated OPSI FQDN id, not COMPUTERNAME"
}

$allowedCustom = @("status", "collect-log", "apply-config", "restart-gateway", "diagnose", "repair", "reconcile-controller")
if ($Action -eq "custom" -and $allowedCustom -notcontains $CustomOperation) {
    Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status "FAILED" -ErrorCode "UNKNOWN_OPERATION" -Message "custom_operation not allowlisted"
    exit 2
}

if ($HermesVersion -eq "latest") {
    Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status "FAILED" -ErrorCode "VERSION_NOT_PINNED" -Message "latest is forbidden"
    exit 3
}

$payloadDigest = Get-SmcSha256Text -Text "$Action|$RequestId|$ClientId|$HermesVersion|$CustomOperation|$ConfigRevision|$ManagedUserSid|$ConfigDigest"
$seen = Get-SmcSeenRequest -RequestId $RequestId
if ($seen -and $seen.status -in @("SUCCEEDED", "FAILED") -and $seen.payloadDigest -eq $payloadDigest) {
    Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status $seen.status -Message "idempotent replay" -UserContext "UNKNOWN"
    exit 0
}

$root = Get-SmcOpsiRoot
New-Item -ItemType Directory -Force -Path $root | Out-Null

$productController = Join-Path $here "..\controller"
if ((Test-Path -LiteralPath $productController) -and (Get-Command Install-SmcControllerBundle -ErrorAction SilentlyContinue)) {
    $digest = Get-SmcSha256Text -Text $ControllerRevision
    Install-SmcControllerBundle -Source $productController -Revision $ControllerRevision -Digest $digest | Out-Null
    foreach ($rel in @("scripts", "bootstrap")) {
        $src = Join-Path $here "..\$rel"
        if (Test-Path -LiteralPath $src) {
            $dst = Join-Path $root $rel
            New-Item -ItemType Directory -Force -Path $dst | Out-Null
            Copy-Item -Path (Join-Path $src "*") -Destination $dst -Recurse -Force
        }
    }
}

$userOps = @("apply-config", "restart-gateway", "repair")
$userContext = "SYSTEM"
if ($Action -in @("setup", "update") -or ($Action -eq "custom" -and $userOps -contains $CustomOperation)) {
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

$previousOwner = Get-SmcControlOwner
$previousVersion = ""
$versionJson = Join-Path $root "state\version.json"
if (Test-Path -LiteralPath $versionJson) {
    try { $previousVersion = [string]((Get-Content -LiteralPath $versionJson -Raw | ConvertFrom-Json).version) } catch {}
}

try {
    if (Get-Command Start-SmcJournalV2 -ErrorAction SilentlyContinue) {
        Start-SmcJournalV2 -RequestId $RequestId -DesiredDigest $payloadDigest -Operation $Action -PreviousOwner $previousOwner -PreviousVersion $previousVersion | Out-Null
    }
    else {
        & (Join-Path $here "transaction\Start-SmcTransaction.ps1") -RequestId $RequestId -PayloadDigest $payloadDigest -TargetVersion $HermesVersion -TargetSid $ManagedUserSid -PreviousOwner $previousOwner -PreviousVersion $previousVersion | Out-Null
    }

    if ($ConfigPayload -and $ConfigDigest) {
        $incoming = Join-Path $root "managed\config\incoming.json"
        New-Item -ItemType Directory -Force -Path (Split-Path $incoming) | Out-Null
        $pad = 4 - ($ConfigPayload.Length % 4)
        if ($pad -eq 4) { $pad = 0 }
        $b64 = $ConfigPayload + ("=" * $pad)
        $bytes = [Convert]::FromBase64String(($b64.Replace("-", "+").Replace("_", "/")))
        [IO.File]::WriteAllBytes($incoming, $bytes)
    }

    if ($Action -eq "custom" -and $userOps -contains $CustomOperation) {
        if (Get-Command Add-SmcUserCommand -ErrorAction SilentlyContinue) {
            Add-SmcUserCommand -Sid $ManagedUserSid -Command ([ordered]@{
                    requestId     = $RequestId
                    clientId      = $ClientId
                    sid           = $ManagedUserSid
                    desiredDigest = $payloadDigest
                    operation     = $CustomOperation
                    deadline      = ""
                }) | Out-Null
        }
        $userContext = "USER_CONTEXT_PENDING"
        Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status "RUNNING" -ErrorCode "USER_CONTEXT_PENDING" -Message "queued for SID user controller" -UserContext $userContext
        if (Get-Command Set-SmcJournalCheckpoint -ErrorAction SilentlyContinue) {
            Set-SmcJournalCheckpoint -RequestId $RequestId -Phase "user_pending" | Out-Null
        }
        Register-SmcRequestSeen -RequestId $RequestId -PayloadDigest $payloadDigest -Status "RUNNING"
        exit 10
    }

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
            & (Join-Path $here "install\Uninstall-OpsiManaged.ps1") -Root $root -ManagedUserSid $ManagedUserSid
        }
        "custom" {
            switch ($CustomOperation) {
                "status" { & (Join-Path $here "health\Get-HermesStatus.ps1") -Root $root -ClientId $ClientId -GatewayPort $GatewayPort -RequestId $RequestId -AckToken $AckToken -ManagedUserSid $ManagedUserSid }
                "collect-log" { & (Join-Path $here "diagnostics\Collect-Diagnostics.ps1") -Root $root -RequestId $RequestId -ClientId $ClientId -LogLines $DiagnosticLogLines }
                "diagnose" { & (Join-Path $here "diagnostics\Collect-Diagnostics.ps1") -Root $root -RequestId $RequestId -ClientId $ClientId -LogLines $DiagnosticLogLines }
                "reconcile-controller" {
                    if (Get-Command Resume-SmcJournalV2 -ErrorAction SilentlyContinue) {
                        Resume-SmcJournalV2 -RequestId $RequestId | Out-Null
                    }
                    else {
                        & (Join-Path $here "transaction\Resume-SmcTransaction.ps1") -RequestId $RequestId | Out-Null
                    }
                }
                default { throw "unreachable custom operation" }
            }
        }
        default {
            throw "unreachable action"
        }
    }

    if ($userContext -eq "USER_CONTEXT_PENDING" -and $Action -in @("setup", "update")) {
        Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status "RUNNING" -ErrorCode "USER_CONTEXT_PENDING" -Message "machine staged; waiting for user logon" -UserContext $userContext
        & (Join-Path $here "..\bootstrap\machine\Register-UserBootstrap.ps1") -Root $root -ManagedUserSid $ManagedUserSid -ManagedUserAccount $ManagedUserAccount -HermesVersion $HermesVersion -RequestId $RequestId -ClientId $ClientId -GatewayPort $GatewayPort -ManagedProfile $ManagedProfile -GatewayAutostart $GatewayAutostart | Out-Null
        if (Get-Command Set-SmcJournalCheckpoint -ErrorAction SilentlyContinue) {
            Set-SmcJournalCheckpoint -RequestId $RequestId -Phase "user_pending" | Out-Null
        }
        Register-SmcRequestSeen -RequestId $RequestId -PayloadDigest $payloadDigest -Status "RUNNING"
        exit 10
    }
    Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status "SUCCEEDED" -UserContext $userContext
    if (Get-Command Set-SmcJournalCheckpoint -ErrorAction SilentlyContinue) {
        Set-SmcJournalCheckpoint -RequestId $RequestId -Phase "finalized" | Out-Null
    }
    else {
        & (Join-Path $here "transaction\Complete-SmcTransaction.ps1") -RequestId $RequestId -PayloadDigest $payloadDigest | Out-Null
    }
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
