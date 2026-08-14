#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:SmcSecretKeyPattern = [regex]'(?i)^(api[_-]?key|secret|token|password|authorization|bearer|hostkey|private[_-]?key)$'
$script:SmcSecretValuePattern = [regex]'(?i)(bearer\s+[A-Za-z0-9._\-]+|https?://[^/\s]+:[^@/\s]+@)'

function Get-SmcOpsiRoot {
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
        [string]$PropertyDigest = ""
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

Export-ModuleMember -Function *
