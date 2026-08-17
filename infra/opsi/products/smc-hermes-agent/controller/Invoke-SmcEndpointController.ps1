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
if ($env:ScriptPath -and $here.StartsWith($env:ScriptPath)) {
    throw "installed controller must not run from OPSI ScriptPath cache"
}

$common = Join-Path $here "scripts\common\SmcOpsi.psm1"
if (-not (Test-Path -LiteralPath $common)) {
    $common = Join-Path $here "..\scripts\common\SmcOpsi.psm1"
}
Import-Module $common -Force
$controllerMod = Join-Path $here "SmcController.psm1"
Import-Module $controllerMod -Force

$root = Get-SmcOpsiRoot
$scripts = Join-Path $here "scripts"
if (-not (Test-Path -LiteralPath $scripts)) {
    throw "installed controller scripts missing"
}

if ($Action -eq "recover") {
    Get-ChildItem -LiteralPath (Join-Path $root "transactions") -Filter "*.json" -ErrorAction SilentlyContinue | ForEach-Object {
        $jid = [IO.Path]::GetFileNameWithoutExtension($_.Name)
        Resume-SmcJournalV2 -RequestId $jid | Out-Null
    }
    exit 0
}

if (-not (Test-SmcAllowlistedParam -Name "RequestId" -Value $RequestId -MaxLength 80 -Pattern '^req_[A-Za-z0-9_-]{8,64}$')) {
    throw "RequestId must match req_*"
}
if ($ClientId -and -not (Test-SmcAllowlistedParam -Name "ClientId" -Value $ClientId -MaxLength 128 -Pattern '^[A-Za-z0-9._-]+$')) {
    throw "ClientId must be a validated OPSI FQDN id, not COMPUTERNAME"
}

$allowedCustom = @("status", "collect-log", "apply-config", "restart-gateway", "diagnose", "repair", "reconcile-controller")
if ($Action -eq "custom" -and $allowedCustom -notcontains $CustomOperation) {
    Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status "FAILED" -ErrorCode "UNKNOWN_OPERATION" -Message "custom_operation not allowlisted"
    exit 2
}

$payloadDigest = Get-SmcSha256Text -Text "$Action|$RequestId|$ClientId|$HermesVersion|$CustomOperation|$ConfigRevision|$ManagedUserSid|$ConfigDigest"
$seen = Get-SmcSeenRequest -RequestId $RequestId
if ($seen -and $seen.status -in @("SUCCEEDED", "FAILED") -and $seen.payloadDigest -eq $payloadDigest) {
    Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status $seen.status -Message "idempotent replay" -UserContext "UNKNOWN"
    exit 0
}

New-Item -ItemType Directory -Force -Path $root | Out-Null

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
    Start-SmcJournalV2 -RequestId $RequestId -DesiredDigest $payloadDigest -Operation $Action -PreviousOwner $previousOwner -PreviousVersion $previousVersion | Out-Null

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
        Add-SmcUserCommand -Sid $ManagedUserSid -Command ([ordered]@{
                requestId     = $RequestId
                clientId      = $ClientId
                sid           = $ManagedUserSid
                desiredDigest = $payloadDigest
                operation     = $CustomOperation
                deadline      = ""
            }) | Out-Null
        $userContext = "USER_CONTEXT_PENDING"
        Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status "RUNNING" -ErrorCode "USER_CONTEXT_PENDING" -Message "queued for SID user controller" -UserContext $userContext
        Set-SmcJournalCheckpoint -RequestId $RequestId -Phase "user_pending" | Out-Null
        Register-SmcRequestSeen -RequestId $RequestId -PayloadDigest $payloadDigest -Status "RUNNING"
        exit 10
    }

    switch ($Action) {
        "setup" {
            $owner = Get-SmcControlOwner
            if ($owner -in @("salt", "runtime")) {
                throw "owner conflict: refusing implicit migration from $owner"
            }
            & (Join-Path $scripts "install\Install-Hermes.ps1") -RequestId $RequestId -HermesVersion $HermesVersion -Root $root -ManagedUserSid $ManagedUserSid
        }
        "update" {
            & (Join-Path $scripts "install\Install-Hermes.ps1") -RequestId $RequestId -HermesVersion $HermesVersion -Root $root -ManagedUserSid $ManagedUserSid -Update
        }
        "uninstall" {
            & (Join-Path $scripts "install\Uninstall-OpsiManaged.ps1") -Root $root -ManagedUserSid $ManagedUserSid
        }
        "custom" {
            switch ($CustomOperation) {
                "status" { & (Join-Path $scripts "health\Get-HermesStatus.ps1") -Root $root -ClientId $ClientId -GatewayPort $GatewayPort -RequestId $RequestId -AckToken $AckToken -ManagedUserSid $ManagedUserSid }
                "collect-log" { & (Join-Path $scripts "diagnostics\Collect-Diagnostics.ps1") -Root $root -RequestId $RequestId -ClientId $ClientId -LogLines $DiagnosticLogLines }
                "diagnose" { & (Join-Path $scripts "diagnostics\Collect-Diagnostics.ps1") -Root $root -RequestId $RequestId -ClientId $ClientId -LogLines $DiagnosticLogLines }
                "reconcile-controller" { Resume-SmcJournalV2 -RequestId $RequestId | Out-Null }
                default { throw "unreachable custom operation" }
            }
        }
        default { throw "unreachable action" }
    }

    if ($userContext -eq "USER_CONTEXT_PENDING" -and $Action -in @("setup", "update")) {
        Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status "RUNNING" -ErrorCode "USER_CONTEXT_PENDING" -Message "machine staged; waiting for user logon" -UserContext $userContext
        $bootstrap = Join-Path $here "bootstrap\machine\Register-UserBootstrap.ps1"
        & $bootstrap -Root $root -ManagedUserSid $ManagedUserSid -ManagedUserAccount $ManagedUserAccount -HermesVersion $HermesVersion -RequestId $RequestId -ClientId $ClientId -GatewayPort $GatewayPort -ManagedProfile $ManagedProfile -GatewayAutostart $GatewayAutostart | Out-Null
        Set-SmcJournalCheckpoint -RequestId $RequestId -Phase "user_pending" | Out-Null
        Register-SmcRequestSeen -RequestId $RequestId -PayloadDigest $payloadDigest -Status "RUNNING"
        exit 10
    }
    Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status "SUCCEEDED" -UserContext $userContext
    Set-SmcJournalCheckpoint -RequestId $RequestId -Phase "finalized" | Out-Null
    Register-SmcRequestSeen -RequestId $RequestId -PayloadDigest $payloadDigest -Status "SUCCEEDED"
    exit 0
}
catch {
    $msg = Protect-SmcText -Text ([string]$_)
    $rollback = Join-Path $scripts "transaction\Rollback-SmcTransaction.ps1"
    if (Test-Path -LiteralPath $rollback) {
        & $rollback -Root $root -ErrorMessage $msg | Out-Null
    }
    Write-SmcActionResult -RequestId $RequestId -ClientId $ClientId -Status "FAILED" -ErrorCode "ADAPTER_FAILED" -Message $msg -UserContext $userContext
    Register-SmcRequestSeen -RequestId $RequestId -PayloadDigest $payloadDigest -Status "FAILED"
    exit 1
}
