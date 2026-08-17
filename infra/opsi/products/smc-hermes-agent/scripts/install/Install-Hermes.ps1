#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][string]$RequestId,
    [Parameter(Mandatory = $true)][string]$HermesVersion,
    [Parameter(Mandatory = $true)][string]$Root,
    [string]$ManagedUserSid = "",
    [switch]$Update
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\common\SmcOpsi.psm1") -Force

if (-not (Test-SmcExactVersion -Version $HermesVersion)) {
    throw "HermesVersion must be exact (not latest)"
}

$layout = Get-SmcProductLayout -AnchorPath $PSScriptRoot
$scriptPathArtifacts = Join-Path $layout.Artifacts "hermes-$HermesVersion-windows.zip"
$programDataArtifacts = Join-Path $Root "managed\artifacts\hermes-$HermesVersion-windows.zip"
$rootKeys = Join-Path $Root "keys\release-public-key.pem"
$artifact = $null
if (Test-Path -LiteralPath $programDataArtifacts) { $artifact = $programDataArtifacts }
elseif (Test-Path -LiteralPath $scriptPathArtifacts) { $artifact = $scriptPathArtifacts }
if (-not $artifact) {
    throw "artifact missing: hermes-$HermesVersion-windows.zip (fail closed)"
}

$manifestPath = "$artifact.manifest.json"
if (-not (Test-Path -LiteralPath $manifestPath)) { $manifestPath = ($artifact -replace '\.zip$', '.manifest.json') }
if (-not (Test-Path -LiteralPath $manifestPath)) { throw "artifact manifest missing" }
$sigPath = "$artifact.sig"
if (-not (Test-Path -LiteralPath $sigPath)) { $sigPath = ($artifact -replace '\.zip$', '.sig') }
if (-not (Test-Path -LiteralPath $sigPath)) { throw "artifact signature missing" }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.version -ne $HermesVersion) { throw "manifest version mismatch" }
$pub = Join-Path $layout.Keys "release-public-key.pem"
if (Test-Path -LiteralPath $rootKeys) { $pub = $rootKeys }
$allowedKeyIds = @("smc-opsi-release-ed25519-v1", "smc-opsi-release-ed25519-v2")
$keyId = "smc-opsi-release-ed25519-v1"
if ($manifest.keyId) { $keyId = [string]$manifest.keyId }
if ($keyId -eq "TEST-ONLY-ed25519") {
    $smokePub = Join-Path $layout.Keys "smoke-public-key.pem"
    $rootSmoke = Join-Path $Root "keys\smoke-public-key.pem"
    if (Test-Path -LiteralPath $rootSmoke) { $smokePub = $rootSmoke }
    if (-not (Test-Path -LiteralPath $smokePub)) { throw "smoke public key missing" }
    $pub = $smokePub
    $allowedKeyIds += "TEST-ONLY-ed25519"
}
elseif (-not (Test-Path -LiteralPath $pub)) {
    throw "release public key missing"
}
if ($allowedKeyIds -notcontains $keyId) { throw "untrusted artifact keyId" }
Assert-SmcArtifactSignature -Artifact $artifact -ManifestPath $manifestPath -SignaturePath $sigPath -PublicKeyPath $pub -ExpectedKeyId $keyId

$controllerMod = Join-Path $layout.ProductRoot "SmcController.psm1"
if (-not (Test-Path -LiteralPath $controllerMod)) {
    $controllerMod = Join-Path $layout.ProductRoot "controller\SmcController.psm1"
}
if (Test-Path -LiteralPath $controllerMod) { Import-Module $controllerMod -Force }

$versionJson = Join-Path $Root "state\version.json"
$previousVersion = ""
if (Test-Path -LiteralPath $versionJson) {
    try { $previousVersion = [string]((Get-Content -LiteralPath $versionJson -Raw | ConvertFrom-Json).version) } catch {}
}

$stagingDir = Join-Path $Root "staging\$HermesVersion"
if (Test-Path -LiteralPath $stagingDir) { Remove-Item -LiteralPath $stagingDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null
Copy-Item -LiteralPath $artifact, $manifestPath, $sigPath -Destination $stagingDir -Force

$extract = Join-Path $stagingDir "payload"
New-Item -ItemType Directory -Force -Path $extract | Out-Null
Expand-Archive -LiteralPath (Join-Path $stagingDir (Split-Path $artifact -Leaf)) -DestinationPath $extract -Force
if (Test-SmcSystemProfilePath -Path $extract) {
    throw "refusing systemprofile install path"
}

$entrypoint = "hermes.exe"
if ($manifest.runtimeEntrypoint) { $entrypoint = [string]$manifest.runtimeEntrypoint }
elseif ($manifest.entrypoint) { $entrypoint = [string]$manifest.entrypoint }
$installType = "binary-zip"
if ($manifest.installType) { $installType = [string]$manifest.installType }
$cliDigest = ""
if ($installType -ne "python-wheelhouse" -and $manifest.cliSha256) { $cliDigest = [string]$manifest.cliSha256 }
$requiresPython = ">=3.12,<3.13"
$requiresNode = ">=22,<23"
if ($manifest.requires) {
    if ($manifest.requires.python) { $requiresPython = [string]$manifest.requires.python }
    if ($manifest.requires.node) { $requiresNode = [string]$manifest.requires.node }
}
$files = @()
if ($manifest.files) {
    foreach ($item in @($manifest.files)) {
        $files += @{ path = [string]$item.path; size = [string]$item.size; sha256 = [string]$item.sha256 }
    }
}
else {
    Get-ChildItem -LiteralPath $extract -Recurse -File | ForEach-Object {
        $rel = $_.FullName.Substring($extract.Length).TrimStart("\")
        $files += @{
            path   = $rel.Replace("\", "/")
            size   = [string]$_.Length
            sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    }
}

$digest = [string]$manifest.sha256
$slot = $null
if (Get-Command Install-SmcRuntimeSlot -ErrorAction SilentlyContinue) {
    $slot = Install-SmcRuntimeSlot -Extract $extract -Version $HermesVersion -Digest $digest -Files $files -InstallType $installType -RuntimeEntrypoint $entrypoint -RequiresPython $requiresPython -RequiresNode $requiresNode
}
else {
    $short = $digest.Substring(0, [Math]::Min(12, $digest.Length))
    $slot = Join-Path $Root "runtime\versions\$HermesVersion-$short"
    if (Test-Path -LiteralPath $slot) { Remove-Item -LiteralPath $slot -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $slot | Out-Null
    Copy-Item -Path (Join-Path $extract "*") -Destination $slot -Recurse -Force
    $activePath = Join-Path $Root "runtime\active.json"
    $previous = ""
    if (Test-Path -LiteralPath $activePath) {
        try { $previous = [string]((Get-Content -LiteralPath $activePath -Raw | ConvertFrom-Json).active) } catch {}
    }
    Write-SmcJsonAtomic -Path $activePath -Object @{
        schema         = "smc.opsi.runtime-active.v1"
        active         = $slot
        previous       = $previous
        version        = $HermesVersion
        digest         = $digest
        entrypoint     = $entrypoint
        updatedAt      = [DateTime]::UtcNow.ToString("o")
    }
}

$cli = Resolve-SmcHermesCli -Root $Root -Entrypoint $entrypoint -ExpectedDigest $cliDigest
$verOut = & $cli --version 2>$null | Select-Object -First 1
if ("$verOut" -notmatch [regex]::Escape($HermesVersion)) {
    throw "CLI version mismatch: expected $HermesVersion"
}

Write-SmcJsonAtomic -Path $versionJson -Object @{
    version          = $HermesVersion
    previousVersion  = $previousVersion
    packageRevision  = [string]$manifest.packageRevision
    artifactDigest   = [string]$manifest.sha256
    entrypoint       = $entrypoint
    slot             = [string]$slot
    owner            = "pending"
    updatedAt        = [DateTime]::UtcNow.ToString("o")
}
