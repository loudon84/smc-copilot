#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:SmcInstallerExitSuccess = 0
$script:SmcInstallerExitFailure = 1
$script:SmcInstallerExitValidation = 2
$script:SmcInstallerExitOwnerConflict = 3
$script:SmcGatewayTaskName = "SMC Hermes Gateway"
$script:SmcAllowedKeyIds = @("smc-hermes-release-ed25519-v1", "TEST-ONLY-ed25519")

$script:SmcManagedModuleCandidates = @(
    (Join-Path $PSScriptRoot "scripts\SmcHermesManaged.psm1"),
    (Join-Path $PSScriptRoot "..\scripts\SmcHermesManaged.psm1")
)
$script:SmcManagedModule = $script:SmcManagedModuleCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $script:SmcManagedModule) {
    throw "SmcHermesManaged.psm1 missing next to InstallerCore"
}
Import-Module $script:SmcManagedModule -Force

function Get-SmcInstallerLayout {
    param(
        [string]$InstallDir,
        [string]$HermesHome
    )
    $managed = Get-SmcHermesManagedLayout
    if ([string]::IsNullOrWhiteSpace($InstallDir)) { $InstallDir = $managed.ProgramRoot }
    if ([string]::IsNullOrWhiteSpace($HermesHome)) { $HermesHome = $managed.HermesHome }
    Assert-SmcHermesManagedPath -Path $InstallDir -Kind Program
    Assert-SmcHermesManagedPath -Path $HermesHome -Kind Home
    return [pscustomobject]@{
        ProgramRoot = $InstallDir
        HermesHome  = $HermesHome
        CliPath     = Join-Path $InstallDir "bin\hermes.exe"
        StateDir    = Join-Path $HermesHome ".smc"
        StatePath   = Join-Path $HermesHome ".smc\installer-state.json"
        OwnerPath   = Join-Path ([System.IO.Path]::GetDirectoryName($HermesHome)) "control-owner.json"
    }
}

function ConvertTo-SmcInstallerArgs {
    param([string[]]$ArgumentList)
    $parsed = @{
        Operation = ""
        Silent    = $false
        InstallDir = ""
        HermesHome = ""
        PayloadRoot = ""
        RepairLevel = 1
    }
    foreach ($arg in @($ArgumentList)) {
        $text = [string]$arg
        switch -Regex ($text) {
            '^/install$' { $parsed.Operation = "install"; continue }
            '^/upgrade$' { $parsed.Operation = "upgrade"; continue }
            '^/repair$' { $parsed.Operation = "repair"; continue }
            '^/uninstall$' { $parsed.Operation = "uninstall"; continue }
            '^/silent$' { $parsed.Silent = $true; continue }
            '^/install-dir$' { continue }
            '^/hermes-home$' { continue }
            '^/payload-root$' { continue }
            '^/repair-level$' { continue }
            default {
                if ($text -match '^/') { throw "unsupported installer flag: $text" }
            }
        }
    }
    for ($i = 0; $i -lt $ArgumentList.Count; $i++) {
        $token = [string]$ArgumentList[$i]
        if ($token -eq "/install-dir" -and $i + 1 -lt $ArgumentList.Count) {
            $parsed.InstallDir = [string]$ArgumentList[$i + 1]
        }
        if ($token -eq "/hermes-home" -and $i + 1 -lt $ArgumentList.Count) {
            $parsed.HermesHome = [string]$ArgumentList[$i + 1]
        }
        if ($token -eq "/payload-root" -and $i + 1 -lt $ArgumentList.Count) {
            $parsed.PayloadRoot = [string]$ArgumentList[$i + 1]
        }
        if ($token -eq "/repair-level" -and $i + 1 -lt $ArgumentList.Count) {
            $parsed.RepairLevel = [int]$ArgumentList[$i + 1]
        }
    }
    if (-not $parsed.Operation) { throw "installer operation required" }
    return [pscustomobject]$parsed
}

function Get-SmcInstallerState {
    param([string]$StatePath)
    if (-not (Test-Path -LiteralPath $StatePath)) {
        return [pscustomobject]@{ current = ""; previous = ""; ownerCommitted = $false }
    }
    return Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
}

function Set-SmcInstallerState {
    param(
        [string]$StatePath,
        [object]$State
    )
    $dir = Split-Path -Parent $StatePath
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    $tmp = "$StatePath.tmp"
    ($State | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath $tmp -Encoding utf8
    Move-Item -LiteralPath $tmp -Destination $StatePath -Force
}

function Test-SmcHermesReleaseFiles {
    param(
        [Parameter(Mandatory = $true)][string]$PayloadRoot
    )
    $archive = Join-Path $PayloadRoot "hermes-windows-amd64.zip"
    $manifestPath = Join-Path $PayloadRoot "release-manifest.json"
    if (-not (Test-Path -LiteralPath $archive)) { throw "release archive missing" }
    if (-not (Test-Path -LiteralPath $manifestPath)) { throw "release manifest missing" }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ([string]$manifest.schema -ne "smc.hermes.release.v2") { throw "unsupported release schema" }
    if ($script:SmcAllowedKeyIds -notcontains [string]$manifest.signerKeyId) { throw "untrusted signerKeyId" }
    $digest = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($digest -ne [string]$manifest.sha256) { throw "release digest mismatch" }
    # Endpoint trust is Authenticode plus release-manifest SHA256.
    # Python signature verification stays in Build/CI and is not invoked here.
    return $manifest
}

function Expand-SmcHermesReleasePayload {
    param(
        [Parameter(Mandatory = $true)][string]$PayloadRoot,
        [Parameter(Mandatory = $true)][string]$ExtractRoot
    )
    $null = Test-SmcHermesReleaseFiles -PayloadRoot $PayloadRoot
    if (Test-Path -LiteralPath $ExtractRoot) { Remove-Item -LiteralPath $ExtractRoot -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $ExtractRoot | Out-Null
    Expand-Archive -LiteralPath (Join-Path $PayloadRoot "hermes-windows-amd64.zip") -DestinationPath $ExtractRoot -Force
    return $ExtractRoot
}

function Install-SmcHermesProgramTree {
    param(
        [Parameter(Mandatory = $true)][string]$ExtractRoot,
        [Parameter(Mandatory = $true)][string]$ProgramRoot,
        [Parameter(Mandatory = $true)][object]$Manifest
    )
    $programParent = Split-Path -Parent $ProgramRoot
    if (-not (Test-Path -LiteralPath $programParent)) {
        New-Item -ItemType Directory -Force -Path $programParent | Out-Null
    }
    $staging = Join-Path $programParent (".hermes-staging-" + [guid]::NewGuid().ToString("N"))
    if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $staging | Out-Null
    Copy-Item -Path (Join-Path $ExtractRoot "*") -Destination $staging -Recurse -Force
    foreach ($item in @($Manifest.files)) {
        $rel = [string]$item.path
        $source = Join-Path $staging $rel
        if (-not (Test-Path -LiteralPath $source)) { throw "release file missing after extract: $rel" }
        $hash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($hash -ne [string]$item.sha256) { throw "release file digest mismatch: $rel" }
    }
    if (Test-Path -LiteralPath $ProgramRoot) {
        Remove-Item -LiteralPath $ProgramRoot -Recurse -Force
    }
    Move-Item -LiteralPath $staging -Destination $ProgramRoot
}

function Set-SmcHermesGatewayTask {
    param(
        [Parameter(Mandatory = $true)][string]$ProgramRoot,
        [Parameter(Mandatory = $true)][string]$HermesHome
    )
    if ([Environment]::GetEnvironmentVariable("SMC_HERMES_INSTALLER_SKIP_GATEWAY", "Process") -eq "1") {
        return
    }
    $cli = Join-Path $ProgramRoot "bin\hermes.exe"
    if (-not (Test-Path -LiteralPath $cli)) { throw "hermes cli missing" }
    if ([Environment]::GetEnvironmentVariable("SMC_HERMES_INSTALLER_SKIP_GATEWAY", "Process") -eq "1") {
        return
    }
    $action = New-ScheduledTaskAction -Execute $cli -Argument "gateway run" -WorkingDirectory $ProgramRoot
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    Register-ScheduledTask -TaskName $script:SmcGatewayTaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
    $env:HERMES_HOME = $HermesHome
}

function Remove-SmcHermesGatewayTask {
    $existing = Get-ScheduledTask -TaskName $script:SmcGatewayTaskName -ErrorAction SilentlyContinue
    if ($null -ne $existing) {
        Unregister-ScheduledTask -TaskName $script:SmcGatewayTaskName -Confirm:$false
    }
}

function Get-SmcHermesCliVersion {
    param([Parameter(Mandatory = $true)][string]$CliPath)
    if (-not (Test-Path -LiteralPath $CliPath)) { return $null }
    try {
        $output = & $CliPath --version 2>&1
        if ($LASTEXITCODE -eq 0) { return ([string]$output).Trim() }
    } catch {
    }
    $text = Get-Content -LiteralPath $CliPath -Raw -ErrorAction SilentlyContinue
    if ($text -match 'SMC Hermes\s+(\S+)') { return $Matches[1] }
    if ($text -match 'echo\s+(\S+)') { return $Matches[1] }
    return $null
}

function Test-SmcHermesReady {
    param(
        [Parameter(Mandatory = $true)][string]$ProgramRoot,
        [Parameter(Mandatory = $true)][string]$HermesHome,
        [string]$ExpectedVersion = ""
    )
    $cli = Join-Path $ProgramRoot "bin\hermes.exe"
    if (-not (Test-Path -LiteralPath $cli)) { return $false }
    $env:HERMES_HOME = $HermesHome
    $versionText = Get-SmcHermesCliVersion -CliPath $cli
    if (-not $versionText) { return $false }
    if ($ExpectedVersion -and ($versionText -notmatch [regex]::Escape($ExpectedVersion))) { return $false }
    if ([Environment]::GetEnvironmentVariable("SMC_HERMES_INSTALLER_SKIP_GATEWAY", "Process") -eq "1") {
        return $true
    }
    $task = Get-ScheduledTask -TaskName $script:SmcGatewayTaskName -ErrorAction SilentlyContinue
    if ($null -eq $task) { return $false }
    return $true
}

function Commit-SmcControlOwner {
    param(
        [Parameter(Mandatory = $true)][string]$OwnerPath,
        [string]$Provider = "opsi"
    )
    if (Test-Path -LiteralPath $OwnerPath) {
        $existing = Get-Content -LiteralPath $OwnerPath -Raw | ConvertFrom-Json
        $current = [string]$existing.hermes
        if ($current -and $current -ne $Provider) {
            throw "control-owner conflict: $current"
        }
        if ($current -eq $Provider) { return }
    }
    $dir = Split-Path -Parent $OwnerPath
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $body = (@{ hermes = $Provider } | ConvertTo-Json -Compress)
    $tmp = "$OwnerPath.tmp"
    $body | Set-Content -LiteralPath $tmp -Encoding ascii
    Move-Item -LiteralPath $tmp -Destination $OwnerPath -Force
}

function Restore-SmcControlOwner {
    param([Parameter(Mandatory = $true)][string]$OwnerPath)
    if (-not (Test-Path -LiteralPath $OwnerPath)) { return }
    $existing = Get-Content -LiteralPath $OwnerPath -Raw | ConvertFrom-Json
    if ([string]$existing.hermes -eq "opsi") {
        Remove-Item -LiteralPath $OwnerPath -Force
    }
}

function Install-SmcHermesAgent {
    param(
        [Parameter(Mandatory = $true)][string]$PayloadRoot,
        [string]$InstallDir = "",
        [string]$HermesHome = "",
        [switch]$Silent
    )
    $layout = Get-SmcInstallerLayout -InstallDir $InstallDir -HermesHome $HermesHome
    $manifest = Test-SmcHermesReleaseFiles -PayloadRoot $PayloadRoot
    $extract = Join-Path $env:TEMP ("smc-hermes-release-" + [guid]::NewGuid().ToString("N"))
    try {
        $null = Expand-SmcHermesReleasePayload -PayloadRoot $PayloadRoot -ExtractRoot $extract
        Install-SmcHermesProgramTree -ExtractRoot $extract -ProgramRoot $layout.ProgramRoot -Manifest $manifest
        $null = Initialize-SmcHermesManagedHome -ProgramRoot $layout.ProgramRoot -HermesHome $layout.HermesHome
        Set-SmcHermesGatewayTask -ProgramRoot $layout.ProgramRoot -HermesHome $layout.HermesHome
        if (-not (Test-SmcHermesReady -ProgramRoot $layout.ProgramRoot -HermesHome $layout.HermesHome -ExpectedVersion $manifest.hermesVersion)) {
            throw "install readiness checks failed"
        }
        Commit-SmcControlOwner -OwnerPath $layout.OwnerPath
        Set-SmcInstallerState -StatePath $layout.StatePath -State @{
            current = [string]$manifest.releaseVersion
            previous = ""
            ownerCommitted = $true
            programRoot = $layout.ProgramRoot
            hermesHome = $layout.HermesHome
        }
    } catch {
        Remove-SmcHermesGatewayTask
        if (Test-Path -LiteralPath $layout.ProgramRoot) { Remove-Item -LiteralPath $layout.ProgramRoot -Recurse -Force -ErrorAction SilentlyContinue }
        throw
    } finally {
        if (Test-Path -LiteralPath $extract) { Remove-Item -LiteralPath $extract -Recurse -Force -ErrorAction SilentlyContinue }
    }
    return $script:SmcInstallerExitSuccess
}

function Upgrade-SmcHermesAgent {
    param(
        [Parameter(Mandatory = $true)][string]$PayloadRoot,
        [string]$InstallDir = "",
        [string]$HermesHome = ""
    )
    $layout = Get-SmcInstallerLayout -InstallDir $InstallDir -HermesHome $HermesHome
    $state = Get-SmcInstallerState -StatePath $layout.StatePath
    $backup = Join-Path $layout.StateDir "program-backup"
    if (Test-Path -LiteralPath $layout.ProgramRoot) {
        if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Recurse -Force }
        Copy-Item -LiteralPath $layout.ProgramRoot -Destination $backup -Recurse -Force
    }
    try {
        $code = Install-SmcHermesAgent -PayloadRoot $PayloadRoot -InstallDir $layout.ProgramRoot -HermesHome $layout.HermesHome -Silent
        $manifest = Test-SmcHermesReleaseFiles -PayloadRoot $PayloadRoot
        Set-SmcInstallerState -StatePath $layout.StatePath -State @{
            current = [string]$manifest.releaseVersion
            previous = [string]$state.current
            ownerCommitted = $true
            programRoot = $layout.ProgramRoot
            hermesHome = $layout.HermesHome
        }
        if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Recurse -Force }
        return $code
    } catch {
        if (Test-Path -LiteralPath $backup) {
            if (Test-Path -LiteralPath $layout.ProgramRoot) { Remove-Item -LiteralPath $layout.ProgramRoot -Recurse -Force }
            Move-Item -LiteralPath $backup -Destination $layout.ProgramRoot
        }
        throw
    }
}

function Repair-SmcHermesAgent {
    param(
        [Parameter(Mandatory = $true)][string]$PayloadRoot,
        [string]$InstallDir = "",
        [string]$HermesHome = "",
        [int]$RepairLevel = 1
    )
    $layout = Get-SmcInstallerLayout -InstallDir $InstallDir -HermesHome $HermesHome
    if ($RepairLevel -le 1) {
        Restart-SmcHermesGatewayTask
        return $script:SmcInstallerExitSuccess
    }
    if ($RepairLevel -le 4) {
        Initialize-SmcHermesManagedHome -ProgramRoot $layout.ProgramRoot -HermesHome $layout.HermesHome | Out-Null
        if (-not (Test-SmcHermesReady -ProgramRoot $layout.ProgramRoot -HermesHome $layout.HermesHome)) {
            throw "repair readiness failed"
        }
        return $script:SmcInstallerExitSuccess
    }
    return Upgrade-SmcHermesAgent -PayloadRoot $PayloadRoot -InstallDir $layout.ProgramRoot -HermesHome $layout.HermesHome
}

function Restart-SmcHermesGatewayTask {
    $task = Get-ScheduledTask -TaskName $script:SmcGatewayTaskName -ErrorAction SilentlyContinue
    if ($null -eq $task) { throw "gateway task missing" }
    Stop-ScheduledTask -TaskName $script:SmcGatewayTaskName -ErrorAction SilentlyContinue
    Start-ScheduledTask -TaskName $script:SmcGatewayTaskName
}

function Uninstall-SmcHermesAgent {
    param(
        [string]$InstallDir = "",
        [string]$HermesHome = ""
    )
    $layout = Get-SmcInstallerLayout -InstallDir $InstallDir -HermesHome $HermesHome
    Remove-SmcHermesGatewayTask
    if (Test-Path -LiteralPath $layout.ProgramRoot) {
        Remove-Item -LiteralPath $layout.ProgramRoot -Recurse -Force
    }
    Restore-SmcControlOwner -OwnerPath $layout.OwnerPath
    if (Test-Path -LiteralPath $layout.StatePath) { Remove-Item -LiteralPath $layout.StatePath -Force }
    return $script:SmcInstallerExitSuccess
}

function Invoke-SmcHermesLifecycle {
    param([string[]]$ArgumentList)
    $args = ConvertTo-SmcInstallerArgs -ArgumentList $ArgumentList
    if (-not $args.PayloadRoot -and $args.Operation -ne "uninstall") {
        throw "payload-root required"
    }
    switch ($args.Operation) {
        "install" { return Install-SmcHermesAgent -PayloadRoot $args.PayloadRoot -InstallDir $args.InstallDir -HermesHome $args.HermesHome -Silent:$args.Silent }
        "upgrade" { return Upgrade-SmcHermesAgent -PayloadRoot $args.PayloadRoot -InstallDir $args.InstallDir -HermesHome $args.HermesHome }
        "repair" { return Repair-SmcHermesAgent -PayloadRoot $args.PayloadRoot -InstallDir $args.InstallDir -HermesHome $args.HermesHome -RepairLevel $args.RepairLevel }
        "uninstall" { return Uninstall-SmcHermesAgent -InstallDir $args.InstallDir -HermesHome $args.HermesHome }
        default { throw "unsupported operation: $($args.Operation)" }
    }
}

Export-ModuleMember -Function Invoke-SmcHermesLifecycle, Install-SmcHermesAgent, Upgrade-SmcHermesAgent, Repair-SmcHermesAgent, Uninstall-SmcHermesAgent, ConvertTo-SmcInstallerArgs, Test-SmcHermesReleaseFiles, Test-SmcHermesReady
