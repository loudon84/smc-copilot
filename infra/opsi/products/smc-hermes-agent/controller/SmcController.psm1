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

function Get-SmcControllerFileDigest {
    param([Parameter(Mandatory = $true)][string]$Root)
    $parts = @()
    Get-ChildItem -LiteralPath $Root -Recurse -File | Sort-Object FullName | ForEach-Object {
        $rel = $_.FullName.Substring($Root.Length).TrimStart("\").Replace("\", "/")
        if ($rel -eq "controller.manifest.json") { return }
        if ($rel -match '\.\.|[A-Za-z]:|^\\\\') { throw "controller path escapes managed root: $rel" }
        $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        $parts += "$rel|$($_.Length)|$hash"
    }
    return (Get-SmcSha256Text -Text ($parts -join "`n"))
}

function Install-SmcControllerBundle {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Revision,
        [string]$Digest = ""
    )
    $layout = Get-SmcControllerLayout
    $staging = Join-Path $layout.Controller ("staging\" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $staging | Out-Null
    Copy-Item -Path (Join-Path $Source "*") -Destination $staging -Recurse -Force
    if (-not (Test-Path -LiteralPath (Join-Path $staging "scripts"))) {
        $parent = Split-Path -Parent $Source
        foreach ($rel in @("scripts", "bootstrap")) {
            $origin = Join-Path $parent $rel
            if (Test-Path -LiteralPath $origin) {
                Copy-Item -Path $origin -Destination (Join-Path $staging $rel) -Recurse -Force
            }
        }
    }
    $manifestPath = Join-Path $staging "controller.manifest.json"
    if (Test-Path -LiteralPath $manifestPath) {
        $verifier = Join-Path $staging "smc-artifact-verify.ps1"
        if (-not (Test-Path -LiteralPath $verifier)) { throw "bundled verifier missing" }
        $pub = Join-Path $staging "scripts\..\..\keys\release-public-key.pem"
        $keyGuess = @(
            (Join-Path $Source "..\CLIENT_DATA\keys\release-public-key.pem"),
            (Join-Path $Source "..\keys\release-public-key.pem"),
            (Join-Path (Get-SmcOpsiRoot) "keys\release-public-key.pem")
        )
        $public = $null
        foreach ($candidate in $keyGuess) {
            $full = [System.IO.Path]::GetFullPath($candidate)
            if (Test-Path -LiteralPath $full) { $public = $full; break }
        }
        if ($public) {
            & $verifier -Kind controller -Manifest $manifestPath -PublicKey $public -Bundle $staging
            if ($LASTEXITCODE -ne 0) {
                Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
                throw "controller manifest verify failed"
            }
        }
        $man = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        $Digest = [string]$man.canonicalDigest
        if (-not $Digest) { throw "controller canonicalDigest missing" }
    }
    else {
        $Digest = Get-SmcControllerFileDigest -Root $staging
    }
    $short = $Digest.Substring(0, [Math]::Min(12, $Digest.Length))
    $dest = Join-Path $layout.Controller "releases\$Revision-$short"
    if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
    New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
    Move-Item -LiteralPath $staging -Destination $dest
    $previous = ""
    $previousDigest = ""
    if (Test-Path -LiteralPath $layout.Current) {
        try {
            $prev = Get-Content -LiteralPath $layout.Current -Raw | ConvertFrom-Json
            $previous = [string]$prev.path
            $previousDigest = [string]$prev.digest
        } catch {}
    }
    Write-SmcJsonAtomic -Path $layout.Current -Object ([ordered]@{
            schema          = "smc.opsi.endpoint-controller.v1"
            revision        = $Revision
            digest          = $Digest
            path            = $dest
            previous        = $previous
            previousDigest  = $previousDigest
            entrypoint      = "Invoke-SmcEndpointController.ps1"
            updatedAt       = [DateTime]::UtcNow.ToString("o")
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

function ConvertTo-SmcVersionBound {
    param([Parameter(Mandatory = $true)][string]$Bound)
    $text = $Bound.Trim()
    if ($text -match '^\d+$') { return [version]"$text.0.0" }
    if ($text -match '^\d+\.\d+$') { return [version]"$text.0" }
    return [version]$text
}

function Test-SmcVersionRange {
    param([Parameter(Mandatory = $true)][string]$Actual, [Parameter(Mandatory = $true)][string]$Range)
    $verMatch = [regex]::Match($Actual, "(\d+)\.(\d+)(?:\.(\d+))?")
    if (-not $verMatch.Success) { return $false }
    $actualVer = [version]::Parse(("{0}.{1}.{2}" -f $verMatch.Groups[1].Value, $verMatch.Groups[2].Value, $(if ($verMatch.Groups[3].Value) { $verMatch.Groups[3].Value } else { "0" })))
    foreach ($clause in $Range.Split(",")) {
        $item = $clause.Trim()
        if ($item.StartsWith(">=")) {
            if ($actualVer -lt (ConvertTo-SmcVersionBound -Bound $item.Substring(2).Trim())) { return $false }
        }
        elseif ($item.StartsWith("<=")) {
            if ($actualVer -gt (ConvertTo-SmcVersionBound -Bound $item.Substring(2).Trim())) { return $false }
        }
        elseif ($item.StartsWith("<")) {
            if ($actualVer -ge (ConvertTo-SmcVersionBound -Bound $item.Substring(1).Trim())) { return $false }
        }
        elseif ($item.StartsWith(">")) {
            if ($actualVer -le (ConvertTo-SmcVersionBound -Bound $item.Substring(1).Trim())) { return $false }
        }
    }
    return $true
}

function Assert-SmcClientPrerequisites {
    param(
        [string]$PythonRange = ">=3.12,<3.13",
        [string]$NodeRange = ">=22,<23"
    )
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) { throw "PREREQUISITE_FAILED: Python missing" }
    $pyVer = & python -c "import platform,sys; print(sys.version.split()[0]); print(platform.machine())" 2>$null
    $lines = @($pyVer)
    $actualPy = [string]$lines[0]
    $arch = [string]$lines[1]
    if ($arch -notmatch 'AMD64|x86_64|x64') { throw "PREREQUISITE_FAILED: Python architecture must be AMD64 actual=$arch" }
    if (-not (Test-SmcVersionRange -Actual $actualPy -Range $PythonRange)) {
        throw "PREREQUISITE_FAILED: Python $PythonRange actual=$actualPy"
    }
    $venvCheck = & python -c "import venv" 2>$null
    if ($LASTEXITCODE -ne 0) { throw "PREREQUISITE_FAILED: Python venv module missing" }
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { throw "PREREQUISITE_FAILED: Node missing" }
    $nodeVer = & node -v 2>$null
    if (-not (Test-SmcVersionRange -Actual ([string]$nodeVer) -Range $NodeRange)) {
        throw "PREREQUISITE_FAILED: Node $NodeRange actual=$nodeVer"
    }
    $npm = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $npm) { throw "PREREQUISITE_FAILED: npm missing" }
}

function Install-SmcRuntimeSlot {
    param(
        [Parameter(Mandatory = $true)][string]$Extract,
        [Parameter(Mandatory = $true)][string]$Version,
        [Parameter(Mandatory = $true)][string]$Digest,
        [Parameter(Mandatory = $true)]$Files,
        [string]$InstallType = "binary-zip",
        [string]$RuntimeEntrypoint = "",
        [string]$RequiresPython = ">=3.12,<3.13",
        [string]$RequiresNode = ">=22,<23"
    )
    $layout = Get-SmcControllerLayout
    $short = $Digest.Substring(0, [Math]::Min(12, $Digest.Length))
    $slot = Join-Path $layout.Runtime "versions\$Version-$short"
    $previous = ""
    if (Test-Path -LiteralPath $layout.Active) {
        try { $previous = [string]((Get-Content -LiteralPath $layout.Active -Raw | ConvertFrom-Json).active) } catch {}
    }
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
    $entrypoint = "hermes.exe"
    foreach ($item in @($Files)) {
        if ([string]$item.path -match 'hermes\.exe$') { $entrypoint = [string]$item.path; break }
    }
    if ($RuntimeEntrypoint) { $entrypoint = $RuntimeEntrypoint }
    if ($InstallType -eq "python-wheelhouse") {
        Assert-SmcClientPrerequisites -PythonRange $RequiresPython -NodeRange $RequiresNode
        $venv = Join-Path $slot "venv"
        & python -m venv $venv
        if ($LASTEXITCODE -ne 0) { throw "venv creation failed" }
        $pip = Join-Path $venv "Scripts\pip.exe"
        $wheels = Join-Path $slot "python\wheels"
        $hermesWheel = Get-ChildItem -LiteralPath (Join-Path $slot "app") -Filter "*.whl" | Select-Object -First 1
        if (-not $hermesWheel) { throw "missing python dependency" }
        & $pip install --no-index --find-links $wheels $hermesWheel.FullName
        if ($LASTEXITCODE -ne 0) { throw "offline wheel install failed" }
        $nodeRoot = Join-Path $slot "node"
        if (Test-Path -LiteralPath $nodeRoot) {
            $nodeLock = Join-Path $nodeRoot "package-lock.json"
            if (Test-Path -LiteralPath $nodeLock) {
                & npm ci --prefix $nodeRoot --offline --omit=dev
                if ($LASTEXITCODE -ne 0) { throw "offline node ci failed" }
            }
            else {
                $nodePkgs = Join-Path $nodeRoot "packages"
                if (Test-Path -LiteralPath $nodePkgs) {
                    Get-ChildItem -LiteralPath $nodePkgs -Filter "*.tgz" | ForEach-Object {
                        & npm install --prefix $nodeRoot --offline --omit=dev $_.FullName
                        if ($LASTEXITCODE -ne 0) { throw "offline node install failed" }
                    }
                }
            }
            $profilePath = Join-Path $slot "runtime-profile.json"
            if (Test-Path -LiteralPath $profilePath) {
                $profile = Get-Content -LiteralPath $profilePath -Raw | ConvertFrom-Json
                foreach ($pkg in @($profile.profile.node.packages)) {
                    $name = [string]$pkg.name
                    if ($name -match "^(@[^/]+)/(.+)$") {
                        $rel = Join-Path $nodeRoot ("node_modules\" + $Matches[1] + "\" + $Matches[2])
                    }
                    else {
                        $rel = Join-Path $nodeRoot ("node_modules\" + $name)
                    }
                    if (-not (Test-Path -LiteralPath $rel)) { throw "missing node dependency: $name" }
                }
            }
        }
        if (-not $RuntimeEntrypoint) { $entrypoint = "venv\Scripts\hermes.exe" }
        $runtimeDoc = [ordered]@{
            version     = $Version
            digest      = $Digest
            installType = $InstallType
            entrypoint  = $entrypoint
        }
        if (Test-Path -LiteralPath (Join-Path $nodeRoot "node_modules")) {
            $runtimeDoc["NodeDependencyStatus"] = "PASS"
        }
        Write-SmcJsonAtomic -Path (Join-Path $slot "runtime.json") -Object $runtimeDoc
        $cli = Join-Path $slot $entrypoint
        $verOut = & $cli --version 2>$null | Select-Object -First 1
        if ("$verOut" -notmatch [regex]::Escape($Version)) { throw "CLI version mismatch: expected $Version" }
        & $cli gateway status 2>$null | Out-Null
    }
    Write-SmcJsonAtomic -Path $layout.Active -Object ([ordered]@{
            schema         = "smc.opsi.runtime-active.v1"
            active         = $slot
            previous       = $previous
            version        = $Version
            digest         = $Digest
            manifestDigest = $Digest
            entrypoint     = $entrypoint
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
