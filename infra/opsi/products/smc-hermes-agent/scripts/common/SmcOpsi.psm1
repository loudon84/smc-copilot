#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-SmcOpsiRoot {
    if ($env:ProgramData) {
        return (Join-Path $env:ProgramData "SMC\opsi")
    }
    return "C:\ProgramData\SMC\opsi"
}

function Get-SmcRedactionPattern {
    return [regex]'(?i)(api[_-]?key|secret|token|password|authorization|bearer\s+[A-Za-z0-9._\-]+|https?://[^/\s]+:[^@/\s]+@)'
}

function Protect-SmcText {
    param([AllowNull()][string]$Text)
    if ([string]::IsNullOrEmpty($Text)) { return "" }
    $pattern = Get-SmcRedactionPattern
    return $pattern.Replace($Text, "[REDACTED]")
}

function Write-SmcJsonAtomic {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][hashtable]$Object
    )
    $dir = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $json = $Object | ConvertTo-Json -Compress -Depth 8
    $json = Protect-SmcText -Text $json
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

function Test-SmcRequestIdempotent {
    param([string]$RequestId)
    $path = Get-SmcSeenRequestPath -RequestId $RequestId
    return (Test-Path -LiteralPath $path)
}

function Register-SmcRequestSeen {
    param([string]$RequestId)
    $path = Get-SmcSeenRequestPath -RequestId $RequestId
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $path) | Out-Null
    Set-Content -LiteralPath $path -Value (Get-Date -Format o) -Encoding ascii
}

function Write-SmcActionResult {
    param(
        [Parameter(Mandatory = $true)][string]$RequestId,
        [Parameter(Mandatory = $true)][string]$ClientId,
        [Parameter(Mandatory = $true)][string]$Status,
        [string]$ErrorCode = "",
        [string]$Message = "",
        [string]$UserContext = "UNKNOWN"
    )
    $root = Get-SmcOpsiRoot
    $payload = [ordered]@{
        schema      = "smc.opsi.action-result.v1"
        requestId   = $RequestId
        clientId    = $ClientId
        status      = $Status
        timestamp   = [DateTime]::UtcNow.ToString("o")
        errorCode   = $ErrorCode
        message     = Protect-SmcText -Text $Message
        redacted    = $true
        userContext = $UserContext
        sha256      = "0" * 64
        bytes       = 0
    }
    $json = ($payload | ConvertTo-Json -Compress)
    $json = Protect-SmcText -Text $json
    $sha = Get-SmcSha256Text -Text $json
    $payload.sha256 = $sha
    $payload.bytes = [System.Text.Encoding]::UTF8.GetByteCount($json)
    $path = Join-Path $root "results\$RequestId.json"
    Write-SmcJsonAtomic -Path $path -Object $payload
    $marker = "SMC_ACTION_RESULT request_id=$RequestId client_id=$ClientId sha256=$sha status=$Status bytes=$($payload.bytes) redacted=true"
    $logDir = Join-Path $root "logs"
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    Add-Content -LiteralPath (Join-Path $logDir "instlog-marker.txt") -Value $marker -Encoding ascii
    return $payload
}

function Get-SmcLoggedOnSid {
    try {
        $key = Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Authentication\LogonUI" -ErrorAction SilentlyContinue
        if ($key -and $key.LastLoggedOnUserSID) { return [string]$key.LastLoggedOnUserSID }
    } catch {}
    return ""
}

function Test-SmcSystemProfilePath {
    param([string]$Path)
    return $Path -match 'systemprofile'
}

Export-ModuleMember -Function *
