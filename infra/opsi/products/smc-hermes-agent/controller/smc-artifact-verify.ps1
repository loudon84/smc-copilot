#Requires -Version 5.1
<#
.SYNOPSIS
  Bundled Windows verifier. Does not call system Python or PATH hermes.
  TEST-ONLY key ids verify archive SHA256 + manifest fields.
  Release key ids require a pinned native/BCrypt path; missing verifier exe fails closed.
#>
param(
    [Parameter(Mandatory = $true)][ValidateSet("runtime", "controller", "release")][string]$Kind,
    [string]$Artifact = "",
    [Parameter(Mandatory = $true)][string]$Manifest,
    [string]$Signature = "",
    [Parameter(Mandatory = $true)][string]$PublicKey,
    [string]$ExpectedKeyId = "",
    [string]$Bundle = "",
    [string]$PinnedDigest = ""
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$self = $MyInvocation.MyCommand.Path
if ($PinnedDigest) {
    $actual = (Get-FileHash -LiteralPath $self -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $PinnedDigest.ToLowerInvariant()) { throw "verifier digest mismatch" }
}
if (-not (Test-Path -LiteralPath $Manifest)) { throw "manifest missing" }
if (-not (Test-Path -LiteralPath $PublicKey)) { throw "public key missing" }
$manifestObj = Get-Content -LiteralPath $Manifest -Raw | ConvertFrom-Json
$keyId = ""
if ($manifestObj.keyId) { $keyId = [string]$manifestObj.keyId }
elseif ($manifestObj.signerKeyId) { $keyId = [string]$manifestObj.signerKeyId }
if ($ExpectedKeyId -and $keyId -ne $ExpectedKeyId) { throw "key id mismatch" }

function Get-Sha256File([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

if ($Kind -eq "runtime") {
    if (-not $Artifact -or -not (Test-Path -LiteralPath $Artifact)) { throw "artifact missing" }
    $digest = Get-Sha256File $Artifact
    if ($digest -ne ([string]$manifestObj.sha256).ToLowerInvariant()) { throw "archive digest mismatch" }
    if ([string]$manifestObj.version -eq "latest") { throw "latest is forbidden" }
    if (-not $manifestObj.files -or @($manifestObj.files).Count -lt 1) { throw "v3 files[] required" }
}
elseif ($Kind -eq "controller") {
    if (-not $manifestObj.canonicalDigest) { throw "controller canonicalDigest missing" }
    if (-not $manifestObj.signature) { throw "controller signature required" }
    if ($Bundle -and (Test-Path -LiteralPath $Bundle)) {
        foreach ($item in @($manifestObj.files)) {
            $rel = [string]$item.path
            if ($rel -match '\.\.|[A-Za-z]:|^\\\\') { throw "controller path escapes bundle" }
            $path = Join-Path $Bundle $rel
            if (-not (Test-Path -LiteralPath $path)) { throw "controller file missing: $rel" }
            $actual = Get-Sha256File $path
            if ($actual -ne ([string]$item.sha256).ToLowerInvariant()) { throw "controller file digest mismatch: $rel" }
        }
    }
}
elseif ($Kind -eq "release") {
    if (-not $manifestObj.canonicalDigest -or -not $manifestObj.signature) { throw "release signature required" }
    if (-not $manifestObj.runtimes) { throw "release runtimes required" }
}

$native = Join-Path (Split-Path -Parent $self) "smc-artifact-verify.exe"
if (Test-Path -LiteralPath $native) {
    $argsList = @("--kind", $Kind, "--manifest", $Manifest, "--public-key", $PublicKey)
    if ($Artifact) { $argsList += @("--artifact", $Artifact) }
    if ($Signature) { $argsList += @("--signature", $Signature) }
    if ($Bundle) { $argsList += @("--bundle", $Bundle) }
    if ($ExpectedKeyId) { $argsList += @("--expected-key-id", $ExpectedKeyId) }
    & $native @argsList
    if ($LASTEXITCODE -ne 0) { throw "native verifier failed" }
    exit 0
}

if ($keyId -and $keyId -notlike "TEST-ONLY*") {
    throw "release Ed25519 verifier exe missing; system Python is forbidden"
}
exit 0
