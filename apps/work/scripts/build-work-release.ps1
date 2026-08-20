param(
  [string]$ReleaseNotesPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$packageJsonPath = Join-Path $repoRoot "package.json"
$guardScript = Join-Path $PSScriptRoot "lib/work-release-guard.mjs"
$dotenvPath = Join-Path $repoRoot ".env"

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][scriptblock]$Action
  )

  Write-Host "==> $Label"
  & $Action
}

function Import-DotEnvFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*(?:#.*)?$') {
      continue
    }
    if ($line -notmatch '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
      continue
    }

    $name = $matches[1]
    $value = $matches[2].Trim()
    if (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    if (-not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($name))) {
      continue
    }
    Set-Item -Path "Env:$name" -Value $value
  }
}

function Require-CleanGitTree {
  $status = git -C $repoRoot status --porcelain
  if ($LASTEXITCODE -ne 0) {
    throw "git status failed"
  }
  if ($status) {
    throw "Refusing release build with a dirty git tree"
  }
}

function Require-ValidUpdateUrl {
  if (-not $env:SMC_WORK_UPDATE_URL) {
    throw "SMC_WORK_UPDATE_URL is required"
  }
  node $guardScript validate-url $env:SMC_WORK_UPDATE_URL
  if ($LASTEXITCODE -ne 0) {
    throw "Invalid SMC_WORK_UPDATE_URL"
  }
}

function Assert-Authenticode {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  if ($env:SMC_WORK_RELEASE_ALLOW_UNSIGNED -eq "1") {
    Write-Warning "Skipping Authenticode gate because SMC_WORK_RELEASE_ALLOW_UNSIGNED=1"
    return $false
  }

  $expectedPublisher = $env:SMC_WORK_EXPECTED_PUBLISHER
  if (-not $expectedPublisher) {
    throw "SMC_WORK_EXPECTED_PUBLISHER is required for signed release builds"
  }

  $signature = Get-AuthenticodeSignature -FilePath $Path
  if ($signature.Status -ne "Valid") {
    throw "Authenticode signature is not valid: $($signature.Status)"
  }
  $subject = [string]$signature.SignerCertificate.Subject
  if ($subject -notmatch $expectedPublisher) {
    throw "Unexpected release publisher: $subject"
  }
  return $true
}

function Add-ReleaseNotesToLatestYml {
  param(
    [Parameter(Mandatory = $true)][string]$LatestPath,
    [Parameter(Mandatory = $true)][string]$NotesPath
  )

  $notes = Get-Content -Raw -LiteralPath $NotesPath
  $yamlLines = New-Object System.Collections.Generic.List[string]
  $skipNotes = $false
  foreach ($line in Get-Content -LiteralPath $LatestPath) {
    if ($line -match "^releaseNotes\s*:") {
      $skipNotes = $true
      continue
    }
    if ($skipNotes -and $line -match "^\s") {
      continue
    }
    $skipNotes = $false
    $yamlLines.Add($line)
  }
  $yamlLines.Add("releaseNotes: |")
  foreach ($noteLine in ($notes -split "`r?`n")) {
    $yamlLines.Add("  $noteLine")
  }
  Set-Content -LiteralPath $LatestPath -Value $yamlLines -Encoding utf8
}

function Get-PackageVersion {
  $packageJson = Get-Content -Raw -LiteralPath $packageJsonPath | ConvertFrom-Json
  if (-not $packageJson.version) {
    throw "package.json missing version"
  }
  return [string]$packageJson.version
}

Push-Location $repoRoot
try {
  Import-DotEnvFile -Path $dotenvPath
  $version = Get-PackageVersion
  if (-not $ReleaseNotesPath) {
    $ReleaseNotesPath = Join-Path $repoRoot "release-notes\$version.md"
  }
  if (-not (Test-Path -LiteralPath $ReleaseNotesPath)) {
    throw "Release notes required for $version : $ReleaseNotesPath"
  }
  $distDir = Join-Path $repoRoot "dist"
  $releaseDir = Join-Path $repoRoot "release/work/$version"
  $installerName = "smc-copilot-$version-setup.exe"
  $blockmapName = "$installerName.blockmap"
  $installerPath = Join-Path $distDir $installerName
  $blockmapPath = Join-Path $distDir $blockmapName
  $latestPath = Join-Path $distDir "latest.yml"
  $appUpdateYml = Join-Path $distDir "win-unpacked\resources\app-update.yml"

  Invoke-Step "Check git state" { Require-CleanGitTree }
  Invoke-Step "Validate update URL" { Require-ValidUpdateUrl }
  Invoke-Step "Generate build identity" {
    $env:SMC_WORK_BUILD_FAIL_DIRTY = "1"
    node (Join-Path $PSScriptRoot "generate-work-build-info.mjs")
  }
  if ($LASTEXITCODE -ne 0) { throw "generate-work-build-info.mjs failed" }
  Invoke-Step "Install dependencies" { npm ci }
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
  Invoke-Step "Run guards" { npm run guard }
  if ($LASTEXITCODE -ne 0) { throw "npm run guard failed" }
  Invoke-Step "Run typecheck" { npm run typecheck }
  if ($LASTEXITCODE -ne 0) { throw "npm run typecheck failed" }
  Invoke-Step "Run tests" { npm test }
  if ($LASTEXITCODE -ne 0) { throw "npm test failed" }
  Invoke-Step "Build Windows NSIS artifact" { node (Join-Path $PSScriptRoot "run-electron-builder.mjs") --win nsis --x64 --publish never }
  if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }

  foreach ($path in @($installerPath, $blockmapPath, $latestPath, $appUpdateYml)) {
    if (-not (Test-Path -LiteralPath $path)) {
      throw "Missing build artifact: $path"
    }
  }

  Invoke-Step "Verify packaged update feed" {
    node $guardScript validate-app-update-yml $appUpdateYml
    if ($LASTEXITCODE -ne 0) { throw "Packaged app-update.yml feed verification failed" }
  }

  $gitCommit = (git -C $repoRoot rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "git rev-parse HEAD failed"
  }

  $unpackedResources = Join-Path $repoRoot "dist\win-unpacked\resources"
  $buildInfoPath = Join-Path $unpackedResources "work-build-info.json"
  Invoke-Step "Verify packaged build identity" {
    node $guardScript validate-build-info $buildInfoPath $version $gitCommit
    if ($LASTEXITCODE -ne 0) { throw "Packaged work-build-info.json verification failed" }
  }

  $signed = Assert-Authenticode -Path $installerPath

  Invoke-Step "Verify latest.yml sha512 against signed installer" {
    node $guardScript validate-sha512 $distDir $version
    if ($LASTEXITCODE -ne 0) { throw "latest.yml sha512 does not match the signed installer" }
  }

  Invoke-Step "Refuse overwrite of an existing version directory" {
    node $guardScript assert-immutable $releaseDir
    if ($LASTEXITCODE -ne 0) { throw "Release directory already exists (immutable)" }
  }

  New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null

  Copy-Item -LiteralPath $installerPath -Destination (Join-Path $releaseDir $installerName)
  Copy-Item -LiteralPath $blockmapPath -Destination (Join-Path $releaseDir $blockmapName)
  Copy-Item -LiteralPath $latestPath -Destination (Join-Path $releaseDir "latest.yml")
  Add-ReleaseNotesToLatestYml -LatestPath (Join-Path $releaseDir "latest.yml") -NotesPath $ReleaseNotesPath

  $hash = (Get-FileHash -LiteralPath (Join-Path $releaseDir $installerName) -Algorithm SHA256).Hash.ToLowerInvariant()

  @(
    "$hash  $installerName"
    "$((Get-FileHash -LiteralPath (Join-Path $releaseDir $blockmapName) -Algorithm SHA256).Hash.ToLowerInvariant())  $blockmapName"
    "$((Get-FileHash -LiteralPath (Join-Path $releaseDir 'latest.yml') -Algorithm SHA256).Hash.ToLowerInvariant())  latest.yml"
  ) | Set-Content -LiteralPath (Join-Path $releaseDir "SHA256SUMS.txt") -NoNewline:$false

  $manifest = [ordered]@{
    schema        = "smc.work.release.v1"
    version       = $version
    gitCommit     = $gitCommit
    platform      = "windows"
    arch          = "x64"
    updateChannel = "stable"
    updateUrl     = $env:SMC_WORK_UPDATE_URL
    installer     = $installerName
    sha256        = $hash
    signed        = [bool]$signed
    publisher     = [string]($env:SMC_WORK_EXPECTED_PUBLISHER)
    createdAt     = [DateTime]::UtcNow.ToString("o")
  }
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $releaseDir "release-manifest.json")

  Invoke-Step "Validate release directory" { powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "validate-work-release.ps1") -ReleaseDir $releaseDir }
  if ($LASTEXITCODE -ne 0) { throw "validate-work-release.ps1 failed" }

  Write-Host "Release artifacts ready at $releaseDir"
} finally {
  Pop-Location
}
