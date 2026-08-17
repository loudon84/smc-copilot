#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:SmcSecretKeyPattern = [regex]'(?i)^(api[_-]?key|secret|token|password|authorization|bearer|hostkey|private[_-]?key)$'
$script:SmcSecretValuePattern = [regex]'(?i)(bearer\s+[A-Za-z0-9._\-]+|https?://[^/\s]+:[^@/\s]+@)'

function Get-SmcOpsiRoot {
    if ($env:SMC_OPSI_ROOT) {
        return $env:SMC_OPSI_ROOT
    }
    if ($env:ProgramData) {
        return (Join-Path $env:ProgramData "SMC\opsi")
    }
    return "C:\ProgramData\SMC\opsi"
}

function Get-SmcProductLayout {
    param([string]$AnchorPath)
    $anchor = if ($AnchorPath) { $AnchorPath } else { $PSScriptRoot }
    $dir = Split-Path -Parent $anchor
    if ((Split-Path -Leaf $dir) -eq "scripts") {
        $productRoot = Split-Path -Parent $dir
        return [pscustomobject]@{
            ProductRoot = $productRoot
            Scripts     = Join-Path $productRoot "scripts"
            Bootstrap   = Join-Path $productRoot "bootstrap"
            ClientData  = Join-Path $productRoot "CLIENT_DATA"
            Artifacts   = Join-Path $productRoot "CLIENT_DATA\artifacts"
            Keys        = Join-Path $productRoot "CLIENT_DATA\keys"
        }
    }
    if ((Split-Path -Leaf $dir) -eq "bootstrap") {
        $productRoot = Split-Path -Parent $dir
        return Get-SmcProductLayout -AnchorPath (Join-Path $productRoot "scripts\common")
    }
    $productRoot = $dir
    return [pscustomobject]@{
        ProductRoot = $productRoot
        Scripts     = Join-Path $productRoot "scripts"
        Bootstrap   = Join-Path $productRoot "bootstrap"
        ClientData  = Join-Path $productRoot "CLIENT_DATA"
        Artifacts   = Join-Path $productRoot "CLIENT_DATA\artifacts"
        Keys        = Join-Path $productRoot "CLIENT_DATA\keys"
    }
}

function Protect-SmcObject {
    param($InputObject)
    if ($null -eq $InputObject) { return $null }
    if ($InputObject -is [string]) {
        return $script:SmcSecretValuePattern.Replace($InputObject, "[REDACTED]")
    }
    if ($InputObject -is [hashtable] -or $InputObject -is [System.Collections.Specialized.OrderedDictionary]) {
        $out = [ordered]@{}
        foreach ($key in @($InputObject.Keys)) {
            if ($script:SmcSecretKeyPattern.IsMatch([string]$key)) { continue }
            $out[$key] = Protect-SmcObject -InputObject $InputObject[$key]
        }
        return $out
    }
    if ($InputObject -is [System.Collections.IEnumerable] -and -not ($InputObject -is [string])) {
        $list = @()
        foreach ($item in $InputObject) { $list += ,(Protect-SmcObject -InputObject $item) }
        return $list
    }
    return $InputObject
}

function Protect-SmcText {
    param([AllowNull()][string]$Text)
    if ([string]::IsNullOrEmpty($Text)) { return "" }
    return $script:SmcSecretValuePattern.Replace($Text, "[REDACTED]")
}

function ConvertTo-SmcCanonicalJson {
    param($Object)
    $protected = Protect-SmcObject -InputObject $Object
    return ($protected | ConvertTo-Json -Compress -Depth 12)
}

function Write-SmcJsonAtomic {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)]$Object
    )
    $dir = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $json = ConvertTo-SmcCanonicalJson -Object $Object
    $tmp = "$Path.tmp"
    Set-Content -LiteralPath $tmp -Value $json -Encoding utf8
    Move-Item -LiteralPath $tmp -Destination $Path -Force
}

function Get-SmcSha256Text {
    param([Parameter(Mandatory = $true)][string]$Text)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    $hash = [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
    return ([System.BitConverter]::ToString($hash) -replace "-", "").ToLowerInvariant()
}

function Test-SmcAllowlistedParam {
    param(
        [string]$Name,
        [string]$Value,
        [int]$MaxLength = 256,
        [string]$Pattern = "."
    )
    if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
    if ($Value.Length -gt $MaxLength) { return $false }
    return $Value -match $Pattern
}

function Test-SmcExactVersion {
    param([string]$Version)
    if ([string]::IsNullOrWhiteSpace($Version)) { return $false }
    if ($Version -eq "latest") { return $false }
    return $Version -match '^[0-9A-Za-z._+-]+$'
}

function Get-SmcSeenRequestPath {
    param([string]$RequestId)
    $root = Get-SmcOpsiRoot
    return (Join-Path $root "state\requests\$RequestId.seen")
}

function Get-SmcSeenRequest {
    param([string]$RequestId)
    $path = Get-SmcSeenRequestPath -RequestId $RequestId
    if (-not (Test-Path -LiteralPath $path)) { return $null }
    try { return (Get-Content -LiteralPath $path -Raw | ConvertFrom-Json) } catch { return $null }
}

function Register-SmcRequestSeen {
    param(
        [Parameter(Mandatory = $true)][string]$RequestId,
        [Parameter(Mandatory = $true)][string]$PayloadDigest,
        [Parameter(Mandatory = $true)][string]$Status
    )
    $path = Get-SmcSeenRequestPath -RequestId $RequestId
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $path) | Out-Null
    Write-SmcJsonAtomic -Path $path -Object ([ordered]@{
            requestId     = $RequestId
            payloadDigest = $PayloadDigest
            status        = $Status
            timestamp     = [DateTime]::UtcNow.ToString("o")
        })
}

function Write-SmcActionResult {
    param(
        [Parameter(Mandatory = $true)][string]$RequestId,
        [Parameter(Mandatory = $true)][string]$ClientId,
        [Parameter(Mandatory = $true)][string]$Status,
        [string]$ErrorCode = "",
        [string]$Message = "",
        [string]$UserContext = "UNKNOWN",
        [int]$Attempt = 1,
        [string]$PropertyDigest = "",
        [string]$ParentRequestId = "",
        [string]$ResultKind = "",
        [string]$ContentSha256 = ""
    )
    $root = Get-SmcOpsiRoot
    $canonical = [ordered]@{
        schema      = "smc.opsi.action-result.v1"
        requestId   = $RequestId
        clientId    = $ClientId
        status      = $Status
        timestamp   = [DateTime]::UtcNow.ToString("o")
        errorCode   = $ErrorCode
        message     = Protect-SmcText -Text $Message
        redacted    = $true
        userContext = $UserContext
        attempt     = $Attempt
    }
    if ($PropertyDigest) { $canonical.propertyDigest = $PropertyDigest }
    if ($ParentRequestId) { $canonical.parentRequestId = $ParentRequestId }
    if ($ResultKind) { $canonical.resultKind = $ResultKind }
    $json = ConvertTo-SmcCanonicalJson -Object $canonical
    $sha = Get-SmcSha256Text -Text $json
    $bytes = [System.Text.Encoding]::UTF8.GetByteCount($json)
    $final = [ordered]@{}
    foreach ($key in $canonical.Keys) { $final[$key] = $canonical[$key] }
    $final.sha256 = $sha
    $final.bytes = $bytes
    $path = Join-Path $root "results\$RequestId.json"
    Write-SmcJsonAtomic -Path $path -Object $final
    $marker = "SMC_ACTION_RESULT request_id=$RequestId client_id=$ClientId sha256=$sha status=$Status bytes=$bytes redacted=true"
    if ($ParentRequestId) { $marker = "$marker parent_request_id=$ParentRequestId" }
    if ($ResultKind) {
        $digest = $ContentSha256
        if (-not $digest) { $digest = $sha }
        $marker = "$marker result_kind=$ResultKind content_sha256=$digest"
    }
    Write-Output $marker
    $logDir = Join-Path $root "logs"
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    Add-Content -LiteralPath (Join-Path $logDir "instlog-marker.txt") -Value $marker -Encoding ascii
    Add-Content -LiteralPath (Join-Path $logDir "adapter.log") -Value $marker -Encoding ascii
    return $final
}

function Test-SmcSystemProfilePath {
    param([string]$Path)
    return $Path -match 'systemprofile'
}

function Test-SmcUserBinding {
    param(
        [Parameter(Mandatory = $true)][string]$Sid,
        [Parameter(Mandatory = $true)][string]$Account
    )
    if ($Sid -notmatch '^S-1-[0-9-]+$') { return $false }
    $profile = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$Sid" -ErrorAction SilentlyContinue
    if (-not $profile) { return $false }
    if ([string]::IsNullOrWhiteSpace($profile.ProfileImagePath)) { return $false }
    if (Test-SmcSystemProfilePath -Path $profile.ProfileImagePath) { return $false }
    return $true
}

function Get-SmcControlOwner {
    $path = Join-Path (Split-Path (Get-SmcOpsiRoot)) "control-owner.json"
    if (-not (Test-Path -LiteralPath $path)) { return "" }
    try { return [string]((Get-Content -LiteralPath $path -Raw | ConvertFrom-Json).hermes) } catch { return "" }
}

function Get-SmcJournalPath {
    return (Join-Path (Get-SmcOpsiRoot) "state\journal.json")
}

function Get-SmcTaskManifestPath {
    return (Join-Path (Get-SmcOpsiRoot) "state\task-manifest.json")
}

function Test-SmcRelativeEntrypoint {
    param([string]$Entrypoint)
    if ([string]::IsNullOrWhiteSpace($Entrypoint)) { return $false }
    if ($Entrypoint -match '\.\.|[A-Za-z]:|^\\\\|^/') { return $false }
    return $true
}

function Resolve-SmcHermesCli {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [string]$Entrypoint = "",
        [string]$ExpectedDigest = ""
    )
    $slot = ""
    $activePath = Join-Path $Root "runtime\active.json"
    if (Test-Path -LiteralPath $activePath) {
        try {
            $active = Get-Content -LiteralPath $activePath -Raw | ConvertFrom-Json
            if ($active.active) { $slot = [string]$active.active }
            if (-not $Entrypoint -and $active.entrypoint) { $Entrypoint = [string]$active.entrypoint }
        } catch { $slot = "" }
    }
    if (-not $Entrypoint) { $Entrypoint = "hermes.exe" }
    if (-not (Test-SmcRelativeEntrypoint -Entrypoint $Entrypoint)) {
        throw "entrypoint escapes managed root"
    }
    if (-not $slot) {
        $slot = Join-Path $Root "versions\current"
    }
    $resolved = Join-Path $slot $Entrypoint
    $full = [System.IO.Path]::GetFullPath($resolved)
    $rootFull = [System.IO.Path]::GetFullPath($slot)
    if (-not $full.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "entrypoint escapes managed root"
    }
    if (-not (Test-Path -LiteralPath $full) -or (Get-Item -LiteralPath $full).PSIsContainer) {
        throw "managed CLI missing: $Entrypoint"
    }
    if ($ExpectedDigest) {
        $actual = (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -ne $ExpectedDigest.ToLowerInvariant()) { throw "CLI digest mismatch" }
    }
    return $full
}

function Assert-SmcArtifactSignature {
    param(
        [Parameter(Mandatory = $true)][string]$Artifact,
        [Parameter(Mandatory = $true)][string]$ManifestPath,
        [Parameter(Mandatory = $true)][string]$SignaturePath,
        [Parameter(Mandatory = $true)][string]$PublicKeyPath,
        [string]$ExpectedKeyId = "smc-opsi-release-ed25519-v1"
    )
    if (-not (Test-Path -LiteralPath $Artifact)) { throw "artifact missing" }
    if (-not (Test-Path -LiteralPath $ManifestPath)) { throw "artifact manifest missing" }
    if (-not (Test-Path -LiteralPath $SignaturePath)) { throw "artifact signature missing" }
    if (-not (Test-Path -LiteralPath $PublicKeyPath)) { throw "release public key missing" }
    $candidates = @(
        (Join-Path $PSScriptRoot "..\..\controller\smc-artifact-verify.ps1"),
        (Join-Path $PSScriptRoot "..\smc-artifact-verify.ps1"),
        (Join-Path (Get-SmcOpsiRoot) "controller\current.json")
    )
    $verifier = $null
    $pinned = ""
    $currentPtr = Join-Path (Get-SmcOpsiRoot) "controller\current.json"
    if (Test-Path -LiteralPath $currentPtr) {
        try {
            $ptr = Get-Content -LiteralPath $currentPtr -Raw | ConvertFrom-Json
            $installed = Join-Path ([string]$ptr.path) "smc-artifact-verify.ps1"
            if (Test-Path -LiteralPath $installed) {
                $verifier = $installed
                $pinned = [string]$ptr.verifierDigest
            }
        } catch {}
    }
    if (-not $verifier) {
        foreach ($item in $candidates) {
            if ($item.EndsWith("current.json")) { continue }
            if (Test-Path -LiteralPath $item) { $verifier = $item; break }
        }
    }
    if (-not $verifier) { throw "bundled verifier missing; system Python is forbidden" }
    $verifyArgs = @{
        Kind          = "runtime"
        Artifact      = $Artifact
        Manifest      = $ManifestPath
        Signature     = $SignaturePath
        PublicKey     = $PublicKeyPath
        ExpectedKeyId = $ExpectedKeyId
    }
    if ($pinned) { $verifyArgs.PinnedDigest = $pinned }
    & $verifier @verifyArgs
    if ($LASTEXITCODE -ne 0) { throw "Ed25519 verify failed" }
}

function Register-SmcManagedTask {
    param(
        [Parameter(Mandatory = $true)][string]$TaskName,
        [Parameter(Mandatory = $true)][string]$Execute,
        [Parameter(Mandatory = $true)][string]$Argument,
        [Parameter(Mandatory = $true)][string]$UserId
    )
    $principal = New-ScheduledTaskPrincipal -UserId $UserId -LogonType Interactive -RunLevel Limited
    $action = New-ScheduledTaskAction -Execute $Execute -Argument $Argument
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $UserId
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
    $read = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    if (-not $read) { throw "task read-back failed: $TaskName" }
    return $read.TaskName
}

function Get-SmcManagedTask {
    param([Parameter(Mandatory = $true)][string]$TaskName)
    return Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}

function Start-SmcManagedTask {
    param([Parameter(Mandatory = $true)][string]$TaskName)
    Start-ScheduledTask -TaskName $TaskName
}

function Stop-SmcManagedTask {
    param([Parameter(Mandatory = $true)][string]$TaskName)
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}

function Remove-SmcManagedTask {
    param([Parameter(Mandatory = $true)][string]$TaskName)
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    $still = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($still) { throw "task still present after uninstall: $TaskName" }
}

Export-ModuleMember -Function *
