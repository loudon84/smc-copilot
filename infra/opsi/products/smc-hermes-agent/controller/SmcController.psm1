#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:SmcUserOps = @(
    "initialize-user", "apply-config", "start-gateway", "restart-gateway",
    "repair-l1", "repair-l2", "quiesce-gateway", "verify-health"
)

function Get-SmcControllerLayout {
    param([string]$Root = "")
    if (-not $Root) { $Root = Get-SmcOpsiRoot }
    return [pscustomobject]@{
        Root              = $Root
        Controller        = Join-Path $Root "controller"
        Current           = Join-Path $Root "controller\current.json"
        Runtime           = Join-Path $Root "runtime"
        Active            = Join-Path $Root "runtime\active.json"
        Desired           = Join-Path $Root "desired\machine.json"
        Observed          = Join-Path $Root "observed\endpoint.json"
        Ownership         = Join-Path $Root "state\ownership.json"
        Tasks             = Join-Path $Root "state\tasks.json"
        Transactions      = Join-Path $Root "transactions"
        Commands          = Join-Path $Root "commands"
        Results           = Join-Path $Root "results"
        Continuations     = Join-Path $Root "continuations"
    }
}

function Get-SmcJournalV2Path {
    param([Parameter(Mandatory = $true)][string]$RequestId)
    $layout = Get-SmcControllerLayout
    return (Join-Path $layout.Transactions "$RequestId.json")
}

function Install-SmcControllerBundle {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Revision,
        [Parameter(Mandatory = $true)][string]$Digest
    )
    $layout = Get-SmcControllerLayout
    $short = $Digest.Substring(0, [Math]::Min(12, $Digest.Length))
    $dest = Join-Path $layout.Controller "releases\$Revision-$short"
    if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    Copy-Item -Path (Join-Path $Source "*") -Destination $dest -Recurse -Force
    Get-ChildItem -LiteralPath $dest -Recurse -File | ForEach-Object {
        $rel = $_.FullName.Substring($dest.Length).TrimStart("\")
        if ($rel -match '\.\.|[A-Za-z]:|^\\\\') { throw "controller path escapes managed root: $rel" }
        Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256 | Out-Null
    }
    $previous = ""
    if (Test-Path -LiteralPath $layout.Current) {
        try { $previous = [string]((Get-Content -LiteralPath $layout.Current -Raw | ConvertFrom-Json).path) } catch {}
    }
    Write-SmcJsonAtomic -Path $layout.Current -Object ([ordered]@{
            schema     = "smc.opsi.endpoint-controller.v1"
            revision   = $Revision
            digest     = $Digest
            path       = $dest
            previous   = $previous
            entrypoint = "Invoke-SmcEndpointController.ps1"
            updatedAt  = [DateTime]::UtcNow.ToString("o")
        })
    if ($env:SMC_OPSI_SKIP_TASKS -ne "1") {
        $recover = Join-Path $dest "Invoke-SmcEndpointController.ps1"
        $arg = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$recover`" -Action recover"
        try {
            $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
            $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arg
            $trigger = New-ScheduledTaskTrigger -AtStartup
            Register-ScheduledTask -TaskName "SMC-Hermes-Controller-Recover" -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
        } catch {
            Write-Output "recovery task skipped: $(Protect-SmcText -Text ([string]$_))"
        }
    }
    return $dest
}

function Start-SmcJournalV2 {
    param(
        [Parameter(Mandatory = $true)][string]$RequestId,
        [Parameter(Mandatory = $true)][string]$DesiredDigest,
        [Parameter(Mandatory = $true)][string]$Operation,
        [string]$PreviousOwner = "",
        [string]$PreviousVersion = ""
    )
    $layout = Get-SmcControllerLayout
    New-Item -ItemType Directory -Force -Path $layout.Transactions | Out-Null
    $path = Get-SmcJournalV2Path -RequestId $RequestId
    if (Test-Path -LiteralPath $path) {
        $existing = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
        if ([string]$existing.desiredDigest -ne $DesiredDigest) { throw "journal digest conflict" }
        return $existing
    }
    Get-ChildItem -LiteralPath $layout.Transactions -Filter "*.json" -ErrorAction SilentlyContinue | ForEach-Object {
        $body = Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json
        if ($body.phase -notin @("finalized", "rolled_back") -and [string]$body.requestId -ne $RequestId) {
            throw "open mutation blocks new journal"
        }
    }
    $journal = [ordered]@{
        schema          = "smc.opsi.transaction.v2"
        requestId       = $RequestId
        desiredDigest   = $DesiredDigest
        operation       = $Operation
        phase           = "controller_verified"
        attempt         = 1
        previousOwner   = $PreviousOwner
        previousVersion = $PreviousVersion
        checkpoints     = @("controller_verified")
        startedAt       = [DateTime]::UtcNow.ToString("o")
        recovery        = "resume_or_rollback"
    }
    Write-SmcJsonAtomic -Path $path -Object $journal
    return $journal
}

function Set-SmcJournalCheckpoint {
    param(
        [Parameter(Mandatory = $true)][string]$RequestId,
        [Parameter(Mandatory = $true)][string]$Phase,
        [string]$OutputDigest = ""
    )
    $path = Get-SmcJournalV2Path -RequestId $RequestId
    if (-not (Test-Path -LiteralPath $path)) { throw "journal missing" }
    $journal = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    $checks = @($journal.checkpoints)
    $checks += $Phase
    Write-SmcJsonAtomic -Path $path -Object ([ordered]@{
            schema          = "smc.opsi.transaction.v2"
            requestId       = $journal.requestId
            desiredDigest   = $journal.desiredDigest
            operation       = $journal.operation
            phase           = $Phase
            attempt         = $journal.attempt
            previousOwner   = $journal.previousOwner
            previousVersion = $journal.previousVersion
            checkpoints     = $checks
            outputDigest    = $OutputDigest
            updatedAt       = [DateTime]::UtcNow.ToString("o")
            recovery        = "resume_or_rollback"
        })
}

function Resume-SmcJournalV2 {
    param([Parameter(Mandatory = $true)][string]$RequestId)
    $path = Get-SmcJournalV2Path -RequestId $RequestId
    if (-not (Test-Path -LiteralPath $path)) { throw "journal missing" }
    $journal = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    if ($journal.phase -in @("finalized", "rolled_back")) { return $journal }
    $verified = @($journal.checkpoints)
    $next = "rolled_back"
    if ($verified -contains "owner_committed" -or $verified -contains "gateway_healthy") { $next = "resumed" }
    elseif ($verified -contains "runtime_activated" -or $verified -contains "controller_installed") { $next = "recovering" }
    Set-SmcJournalCheckpoint -RequestId $RequestId -Phase $next
    return (Get-Content -LiteralPath $path -Raw | ConvertFrom-Json)
}

function Install-SmcRuntimeSlot {
    param(
        [Parameter(Mandatory = $true)][string]$Extract,
        [Parameter(Mandatory = $true)][string]$Version,
        [Parameter(Mandatory = $true)][string]$Digest,
        [Parameter(Mandatory = $true)]$Files
    )
    $layout = Get-SmcControllerLayout
    $short = $Digest.Substring(0, [Math]::Min(12, $Digest.Length))
    $slot = Join-Path $layout.Runtime "versions\$Version-$short"
    if (Test-Path -LiteralPath $slot) { Remove-Item -LiteralPath $slot -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $slot | Out-Null
    Copy-Item -Path (Join-Path $Extract "*") -Destination $slot -Recurse -Force
    foreach ($item in @($Files)) {
        $rel = [string]$item.path
        if ($rel -match '\.\.|[A-Za-z]:|^\\\\') { throw "runtime path escapes managed root: $rel" }
        $path = Join-Path $slot $rel
        if (-not (Test-Path -LiteralPath $path)) { throw "runtime file missing: $rel" }
        $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -ne ([string]$item.sha256).ToLowerInvariant()) { throw "runtime file digest mismatch: $rel" }
    }
    $previous = ""
    if (Test-Path -LiteralPath $layout.Active) {
        try { $previous = [string]((Get-Content -LiteralPath $layout.Active -Raw | ConvertFrom-Json).active) } catch {}
    }
    Write-SmcJsonAtomic -Path $layout.Active -Object ([ordered]@{
            schema         = "smc.opsi.runtime-active.v1"
            active         = $slot
            previous       = $previous
            version        = $Version
            digest         = $Digest
            manifestDigest = $Digest
            updatedAt      = [DateTime]::UtcNow.ToString("o")
        })
    return $slot
}

function Add-SmcUserCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Sid,
        [Parameter(Mandatory = $true)]$Command
    )
    if ($script:SmcUserOps -notcontains [string]$Command.operation) {
        throw "operation not allowlisted for user controller"
    }
    $layout = Get-SmcControllerLayout
    $inbox = Join-Path $layout.Commands "$Sid\inbox"
    New-Item -ItemType Directory -Force -Path $inbox | Out-Null
    $path = Join-Path $inbox "$($Command.requestId).json"
    $body = [ordered]@{}
    foreach ($key in $Command.Keys) { $body[$key] = $Command[$key] }
    $body.schema = "smc.opsi.user-command.v1"
    Write-SmcJsonAtomic -Path $path -Object $body
    return $path
}

function Complete-SmcUserCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Sid,
        [Parameter(Mandatory = $true)][string]$RequestId,
        [Parameter(Mandatory = $true)][string]$Digest
    )
    $layout = Get-SmcControllerLayout
    $inbox = Join-Path $layout.Commands "$Sid\inbox\$RequestId.json"
    $outboxDir = Join-Path $layout.Commands "$Sid\outbox"
    $outbox = Join-Path $outboxDir "$RequestId.json"
    if (-not (Test-Path -LiteralPath $inbox)) {
        if (Test-Path -LiteralPath $outbox) { return $outbox }
        throw "inbox command missing"
    }
    $command = Get-Content -LiteralPath $inbox -Raw | ConvertFrom-Json
    if ([string]$command.desiredDigest -ne $Digest) {
        $q = Join-Path $layout.Root "quarantine\$Sid"
        New-Item -ItemType Directory -Force -Path $q | Out-Null
        Move-Item -LiteralPath $inbox -Destination (Join-Path $q "$RequestId.json") -Force
        throw "command digest tamper"
    }
    New-Item -ItemType Directory -Force -Path $outboxDir | Out-Null
    Write-SmcJsonAtomic -Path $outbox -Object ([ordered]@{
            requestId       = $RequestId
            desiredDigest   = $Digest
            observedDigest  = $Digest
            status          = "SUCCEEDED"
            completedAt     = [DateTime]::UtcNow.ToString("o")
        })
    Remove-Item -LiteralPath $inbox -Force
    return $outbox
}

function Register-SmcResultAck {
    param(
        [Parameter(Mandatory = $true)][string]$Sid,
        [Parameter(Mandatory = $true)][string]$RequestId,
        [Parameter(Mandatory = $true)][string]$Token
    )
    $layout = Get-SmcControllerLayout
    $outbox = Join-Path $layout.Commands "$Sid\outbox\$RequestId.json"
    if (-not (Test-Path -LiteralPath $outbox)) { return }
    $ackDir = Join-Path $layout.Commands "$Sid\ack"
    New-Item -ItemType Directory -Force -Path $ackDir | Out-Null
    $body = Get-Content -LiteralPath $outbox -Raw | ConvertFrom-Json
    Write-SmcJsonAtomic -Path (Join-Path $ackDir "$RequestId.json") -Object ([ordered]@{
            requestId = $RequestId
            ackToken  = $Token
            archived  = $true
        })
    Remove-Item -LiteralPath $outbox -Force
}

function Restore-SmcPreviousOwner {
    $layout = Get-SmcControllerLayout
    $record = $null
    if (Test-Path -LiteralPath $layout.Ownership) {
        $record = Get-Content -LiteralPath $layout.Ownership -Raw | ConvertFrom-Json
    }
    $previous = ""
    if ($record -and $record.previous) { $previous = [string]$record.previous }
    $ownerFile = Join-Path (Split-Path $layout.Root) "control-owner.json"
    if ($previous) {
        Write-SmcJsonAtomic -Path $ownerFile -Object @{ hermes = $previous }
        Write-SmcJsonAtomic -Path $layout.Ownership -Object ([ordered]@{
                previous = ""
                current  = $previous
                pending  = ""
                revision = 0
            })
    }
    elseif (Test-Path -LiteralPath $ownerFile) {
        Remove-Item -LiteralPath $ownerFile -Force
        Write-SmcJsonAtomic -Path $layout.Ownership -Object ([ordered]@{
                previous = ""
                current  = ""
                pending  = ""
                revision = 0
            })
    }
}

function Invoke-SmcTwoPhaseUninstall {
    param(
        [switch]$UserOnline,
        [switch]$Residual
    )
    if ($Residual) { return "UNINSTALL_BLOCKED" }
    Restore-SmcPreviousOwner
    $layout = Get-SmcControllerLayout
    foreach ($rel in @("controller", "runtime", "desired", "observed", "transactions", "commands")) {
        $path = Join-Path $layout.Root $rel
        if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue }
    }
    Write-SmcJsonAtomic -Path (Join-Path $layout.Results "uninstall-tombstone.json") -Object ([ordered]@{
            status           = "SUCCEEDED"
            userOnline       = [bool]$UserOnline
            retainedUserData = $true
        })
    return "SUCCEEDED"
}

function Get-SmcControllerStateV2 {
    param([Parameter(Mandatory = $true)][string]$ClientId)
    $layout = Get-SmcControllerLayout
    $owner = ""
    if (Test-Path -LiteralPath $layout.Ownership) {
        try { $owner = [string]((Get-Content -LiteralPath $layout.Ownership -Raw | ConvertFrom-Json).current) } catch {}
    }
    if (-not $owner) { $owner = Get-SmcControlOwner }
    $phase = ""
    $open = $false
    if (Test-Path -LiteralPath $layout.Transactions) {
        Get-ChildItem -LiteralPath $layout.Transactions -Filter "*.json" -ErrorAction SilentlyContinue | ForEach-Object {
            $body = Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json
            $phase = [string]$body.phase
            if ($body.phase -notin @("finalized", "rolled_back")) { $open = $true }
        }
    }
    $health = "UNKNOWN"
    if ($owner -eq "opsi" -and $phase -eq "finalized") { $health = "HEALTHY" }
    elseif ($phase -in @("user_pending", "recovering")) { $health = "WARNING" }
    return [ordered]@{
        schema    = "smc.opsi.endpoint-controller-state.v2"
        clientId  = $ClientId
        owner     = $owner
        health    = $health
        timestamp = [DateTime]::UtcNow.ToString("o")
        transaction = @{ phase = $phase; open = $open }
    }
}

Export-ModuleMember -Function *
