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
Import-Module $script:SmcManagedModule -Force -DisableNameChecking

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

function Stop-SmcHermesProgramProcesses {
    param(
        [Parameter(Mandatory = $true)][string]$ProgramRoot,
        [int]$GracefulTimeoutMs = 5000
    )
    # Phase 1: graceful — stop the scheduled task and wait for the gateway to exit
    $task = Get-ScheduledTask -TaskName $script:SmcGatewayTaskName -ErrorAction SilentlyContinue
    if ($null -ne $task -and $task.State -eq "Running") {
        Stop-ScheduledTask -TaskName $script:SmcGatewayTaskName -ErrorAction SilentlyContinue
        $waited = 0
        while ($waited -lt $GracefulTimeoutMs) {
            $hermesProcs = @(Get-Process -Name hermes -ErrorAction SilentlyContinue)
            if ($hermesProcs.Count -eq 0) { break }
            Start-Sleep -Milliseconds 500
            $waited += 500
        }
    } elseif ($null -ne $task) {
        Stop-ScheduledTask -TaskName $script:SmcGatewayTaskName -ErrorAction SilentlyContinue
    }
    # Phase 2: forceful — kill any remaining processes under ProgramRoot
    Get-Process -Name hermes -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    if (-not (Test-Path -LiteralPath $ProgramRoot)) {
        Start-Sleep -Milliseconds 200
        return
    }
    $root = [System.IO.Path]::GetFullPath($ProgramRoot).TrimEnd("\") + "\"
    $targets = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $path = ""
        try { $path = [string]$_.Path } catch { $path = "" }
        if ([string]::IsNullOrWhiteSpace($path)) { return $false }
        return [System.IO.Path]::GetFullPath($path).StartsWith($root, [StringComparison]::OrdinalIgnoreCase)
    })
    foreach ($proc in $targets) {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 400
}

function Remove-SmcDirectoryRetry {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [int]$Attempts = 6
    )
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $last = $null
    for ($i = 1; $i -le $Attempts; $i++) {
        try {
            Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
            return
        } catch {
            $last = $_
            Start-Sleep -Milliseconds (250 * $i)
        }
    }
    $parked = "$Path.pending-delete"
    if (Test-Path -LiteralPath $parked) {
        Remove-Item -LiteralPath $parked -Recurse -Force -ErrorAction SilentlyContinue
    }
    try {
        Move-Item -LiteralPath $Path -Destination $parked -Force -ErrorAction Stop
        Remove-Item -LiteralPath $parked -Recurse -Force -ErrorAction SilentlyContinue
        return
    } catch {
        $last = $_
    }
    throw "program files locked under $Path : $($last.Exception.Message)"
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
    Set-SmcHermesProgramAcl -Path $staging
    Copy-Item -Path (Join-Path $ExtractRoot "*") -Destination $staging -Recurse -Force
    foreach ($item in @($Manifest.files)) {
        $rel = [string]$item.path
        $source = Join-Path $staging $rel
        if (-not (Test-Path -LiteralPath $source)) { throw "release file missing after extract: $rel" }
        $hash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($hash -ne [string]$item.sha256) { throw "release file digest mismatch: $rel" }
    }
    if (Test-Path -LiteralPath $ProgramRoot) {
        Stop-SmcHermesProgramProcesses -ProgramRoot $ProgramRoot
        Remove-SmcDirectoryRetry -Path $ProgramRoot
    }
    Move-Item -LiteralPath $staging -Destination $ProgramRoot
}

function Get-SmcHermesEnvPath {
    param([Parameter(Mandatory = $true)][string]$HermesHome)
    return Join-Path $HermesHome ".env"
}

function Get-SmcHermesEnvValue {
    param(
        [Parameter(Mandatory = $true)][string]$EnvPath,
        [Parameter(Mandatory = $true)][string]$Key
    )
    if (-not (Test-Path -LiteralPath $EnvPath)) { return "" }
    foreach ($line in @(Get-Content -LiteralPath $EnvPath -ErrorAction SilentlyContinue)) {
        if ($line -match ("^\s*" + [regex]::Escape($Key) + "\s*=\s*(.*)$")) {
            return [string]$Matches[1].Trim()
        }
    }
    return ""
}

function Set-SmcHermesEndpointSecret {
    param(
        [Parameter(Mandatory = $true)][string]$HermesHome,
        [switch]$ForceNew
    )
    Assert-SmcHermesManagedPath -Path $HermesHome -Kind Home
    $envPath = Get-SmcHermesEnvPath -HermesHome $HermesHome
    $existing = Get-SmcHermesEnvValue -EnvPath $envPath -Key "API_SERVER_KEY"
    $key = $existing
    if ($ForceNew -or [string]::IsNullOrWhiteSpace($key) -or $key.Length -lt 24) {
        $bytes = New-Object byte[] 32
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
        $key = [Convert]::ToBase64String($bytes).TrimEnd("=")
    }
    $lines = @(
        "API_SERVER_ENABLED=true",
        "API_SERVER_HOST=127.0.0.1",
        "API_SERVER_PORT=8642",
        "API_SERVER_KEY=$key"
    )
    $dir = Split-Path -Parent $envPath
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    $tmp = "$envPath.tmp"
    [System.IO.File]::WriteAllText($tmp, (($lines -join "`n") + "`n"), [System.Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $tmp -Destination $envPath -Force
    try {
        $acl = New-Object System.Security.AccessControl.FileSecurity
        $acl.SetAccessRuleProtection($true, $false)
        $system = New-Object System.Security.Principal.SecurityIdentifier "S-1-5-18"
        $admins = New-Object System.Security.Principal.SecurityIdentifier "S-1-5-32-544"
        $allow = [System.Security.AccessControl.AccessControlType]::Allow
        $fc = [System.Security.AccessControl.FileSystemRights]::FullControl
        $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($system, $fc, $allow)))
        $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($admins, $fc, $allow)))
        Set-Acl -LiteralPath $envPath -AclObject $acl
    } catch {
        # ACL tighten best-effort; secret file still written.
    }
    return [pscustomobject]@{
        EnvPath = $envPath
        Host    = "127.0.0.1"
        Port    = 8642
        # Key intentionally omitted from return object for callers that log objects.
        HasKey  = (-not [string]::IsNullOrWhiteSpace($key))
    }
}

function Get-SmcHermesGatewayTaskSpec {
    param(
        [Parameter(Mandatory = $true)][string]$ProgramRoot,
        [Parameter(Mandatory = $true)][string]$HermesHome
    )
    $layout = Get-SmcHermesManagedLayout
    $cli = Join-Path $ProgramRoot "bin\hermes.exe"
    $workspaceRoot = $layout.WorkspaceRoot
    $tempRoot = $layout.TempRoot
    $agentRoot = $layout.AgentRoot
    $nodeRoot = $layout.NodeRoot
    $binPath = $layout.BinPath
    $scriptsPath = $layout.ScriptsPath
    $envPath = Get-SmcHermesEnvPath -HermesHome $HermesHome
    $contextJson = (@{
            event = "managed_runtime_context"
            hermesHome = $HermesHome
            workspaceRoot = $workspaceRoot
            tempRoot = $tempRoot
            terminalCwd = $workspaceRoot
        } | ConvertTo-Json -Compress)
    $managedPathLiteral = (@($binPath, $scriptsPath, $nodeRoot) -join ";")
    $launcher = @(
        "`$env:HERMES_HOME = '$HermesHome'",
        "`$env:HERMES_AGENT_ROOT = '$agentRoot'",
        "`$env:HERMES_NODE_ROOT = '$nodeRoot'",
        "`$env:TERMINAL_CWD = '$workspaceRoot'",
        "`$env:TEMP = '$tempRoot'",
        "`$env:TMP = '$tempRoot'",
        "`$managedPath = '$managedPathLiteral'",
        "if ([string]::IsNullOrEmpty([string]`$env:PATH)) { `$env:PATH = `$managedPath } else { `$env:PATH = (`$managedPath + ';' + [string]`$env:PATH) }",
        "`$env:API_SERVER_ENABLED = 'true'",
        "`$env:API_SERVER_HOST = '127.0.0.1'",
        "`$env:API_SERVER_PORT = '8642'",
        "if (Test-Path -LiteralPath '$envPath') { Get-Content -LiteralPath '$envPath' | ForEach-Object { if (`$_ -match '^API_SERVER_KEY=(.*)$') { `$env:API_SERVER_KEY = `$Matches[1] } } }",
        "Set-Location -LiteralPath '$workspaceRoot'",
        "Write-Output '$contextJson'",
        "& '$cli' gateway run"
    ) -join "; "
    return [pscustomobject]@{
        CliPath          = $cli
        WorkingDirectory = $workspaceRoot
        LauncherScript   = $launcher
        TerminalCwd      = $workspaceRoot
        TempRoot         = $tempRoot
        AgentRoot        = $agentRoot
        NodeRoot         = $nodeRoot
        BinPath          = $binPath
        ScriptsPath      = $scriptsPath
        ManagedPath      = $managedPathLiteral
        EnvPath          = $envPath
    }
}

function Set-SmcHermesGatewayTask {
    param(
        [Parameter(Mandatory = $true)][string]$ProgramRoot,
        [Parameter(Mandatory = $true)][string]$HermesHome
    )
    if ([Environment]::GetEnvironmentVariable("SMC_HERMES_INSTALLER_SKIP_GATEWAY", "Process") -eq "1") {
        return
    }
    $layout = Get-SmcHermesManagedLayout
    if (-not (Test-Path -LiteralPath $layout.WorkspaceRoot)) {
        throw "workspace root missing before gateway task registration"
    }
    if (-not (Test-Path -LiteralPath $layout.TempRoot)) {
        throw "temp root missing before gateway task registration"
    }
    $spec = Get-SmcHermesGatewayTaskSpec -ProgramRoot $ProgramRoot -HermesHome $HermesHome
    if (-not (Test-Path -LiteralPath $spec.CliPath)) { throw "hermes cli missing" }
    $psExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
    $encoded = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($spec.LauncherScript))
    $command = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand $encoded"
    $action = New-ScheduledTaskAction -Execute $psExe -Argument $command -WorkingDirectory $spec.WorkingDirectory
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    Register-ScheduledTask -TaskName $script:SmcGatewayTaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
    $env:HERMES_HOME = $HermesHome
    $env:HERMES_AGENT_ROOT = $spec.AgentRoot
    $env:HERMES_NODE_ROOT = $spec.NodeRoot
}

function Get-SmcHermesGatewayTaskContractFailure {
    param(
        [Parameter(Mandatory = $true)][string]$ProgramRoot,
        [Parameter(Mandatory = $true)][string]$HermesHome
    )
    if ([Environment]::GetEnvironmentVariable("SMC_HERMES_INSTALLER_SKIP_GATEWAY", "Process") -eq "1") {
        return ""
    }
    $layout = Get-SmcHermesManagedLayout
    $task = Get-ScheduledTask -TaskName $script:SmcGatewayTaskName -ErrorAction SilentlyContinue
    if ($null -eq $task) { return "task missing" }
    $action = $task.Actions | Select-Object -First 1
    if ($null -eq $action) { return "task action missing" }
    try {
        $wd = ConvertTo-SmcFullPath -Path ([string]$action.WorkingDirectory)
        $want = ConvertTo-SmcFullPath -Path $layout.WorkspaceRoot
        if (-not [string]::Equals($wd, $want, [StringComparison]::OrdinalIgnoreCase)) {
            return "WorkingDirectory mismatch got=$wd want=$want"
        }
    } catch {
        return "WorkingDirectory invalid: $($_.Exception.Message)"
    }
    $argsText = [string]$action.Arguments
    if ($argsText -notmatch 'EncodedCommand\s+(\S+)') { return "EncodedCommand missing" }
    try {
        $bytes = [Convert]::FromBase64String($Matches[1])
        $decoded = [System.Text.Encoding]::Unicode.GetString($bytes)
    } catch {
        return "EncodedCommand decode failed: $($_.Exception.Message)"
    }
    $spec = Get-SmcHermesGatewayTaskSpec -ProgramRoot $ProgramRoot -HermesHome $HermesHome
    # Use IndexOf/Contains — avoid -like wildcards ([]) colliding with PowerShell types in launcher.
    if ($decoded.IndexOf("TERMINAL_CWD", [StringComparison]::Ordinal) -lt 0 -or
        $decoded.IndexOf([string]$spec.TerminalCwd, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
        return "TERMINAL_CWD missing"
    }
    if ($decoded.IndexOf([string]$spec.TempRoot, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
        return "TEMP/TMP root missing"
    }
    if ($decoded.IndexOf('$env:TEMP', [StringComparison]::Ordinal) -lt 0) { return "TEMP assignment missing" }
    if ($decoded.IndexOf('$env:TMP', [StringComparison]::Ordinal) -lt 0) { return "TMP assignment missing" }
    if ($decoded.IndexOf('$env:PATH', [StringComparison]::Ordinal) -lt 0) { return "PATH assignment missing" }
    if ($decoded.IndexOf([string]$spec.ManagedPath, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
        return "ManagedPath missing"
    }
    $setLoc = "Set-Location -LiteralPath '$($spec.WorkingDirectory)'"
    if ($decoded.IndexOf($setLoc, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
        return "Set-Location missing"
    }
    if ($decoded.IndexOf("managed_runtime_context", [StringComparison]::Ordinal) -lt 0) {
        return "managed_runtime_context missing"
    }
    return ""
}

function Test-SmcHermesGatewayTaskContract {
    param(
        [Parameter(Mandatory = $true)][string]$ProgramRoot,
        [Parameter(Mandatory = $true)][string]$HermesHome
    )
    return [string]::IsNullOrEmpty((Get-SmcHermesGatewayTaskContractFailure -ProgramRoot $ProgramRoot -HermesHome $HermesHome))
}

function Remove-SmcHermesGatewayTask {
    $existing = Get-ScheduledTask -TaskName $script:SmcGatewayTaskName -ErrorAction SilentlyContinue
    if ($null -ne $existing) {
        Stop-ScheduledTask -TaskName $script:SmcGatewayTaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $script:SmcGatewayTaskName -Confirm:$false
    }
}

function Get-SmcHermesCliVersion {
    param(
        [Parameter(Mandatory = $true)]
        [string]$CliPath
    )

    if (-not (Test-Path -LiteralPath $CliPath)) {
        throw "hermes cli missing: $CliPath"
    }

    $output = & $CliPath --version 2>&1
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        throw "hermes --version failed: exit=$exitCode output=$($output -join ' ')"
    }

    $version = ([string]($output -join "`n")).Trim()

    if ([string]::IsNullOrWhiteSpace($version)) {
        throw "hermes --version returned empty output"
    }

    return $version
}

function Test-SmcHermesGatewayHttp {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [hashtable]$Headers = @{},
        [int]$TimeoutSec = 5
    )
    try {
        $request = [System.Net.HttpWebRequest]::Create($Url)
        $request.Method = "GET"
        $request.Timeout = [Math]::Max(1000, $TimeoutSec * 1000)
        foreach ($key in $Headers.Keys) {
            if ($key -eq "Authorization") {
                $request.Headers["Authorization"] = [string]$Headers[$key]
            } else {
                $request.Headers.Add([string]$key, [string]$Headers[$key])
            }
        }
        $response = $request.GetResponse()
        try {
            return [int]$response.StatusCode
        } finally {
            $response.Close()
        }
    } catch [System.Net.WebException] {
        $resp = $_.Exception.Response
        if ($null -ne $resp) {
            return [int]$resp.StatusCode
        }
        return 0
    } catch {
        return 0
    }
}

function Write-SmcInstallerTrace {
    param([Parameter(Mandatory = $true)][string]$Message)
    $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-ddTHH:mm:ss"), $Message
    Write-Verbose $line
    try {
        $logPath = Join-Path $PSScriptRoot "install.log"
        $utf8 = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::AppendAllText($logPath, ($line + "`r`n"), $utf8)
    } catch {
    }
}

function Get-SmcHermesGatewayProbeDetail {
    param(
        [Parameter(Mandatory = $true)][string]$HermesHome,
        [string]$HostName = "127.0.0.1",
        [int]$Port = 8642
    )
    $envPath = Get-SmcHermesEnvPath -HermesHome $HermesHome
    $apiKey = Get-SmcHermesEnvValue -EnvPath $envPath -Key "API_SERVER_KEY"
    if ([string]::IsNullOrWhiteSpace($apiKey)) {
        return "API_SERVER_KEY missing"
    }
    $tcpOk = $false
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $iar = $client.BeginConnect($HostName, $Port, $null, $null)
        $tcpOk = $iar.AsyncWaitHandle.WaitOne(1000, $false) -and $client.Connected
        $client.Close()
    } catch {
        $tcpOk = $false
    }
    if (-not $tcpOk) {
        return "tcp ${HostName}:${Port} not listening"
    }
    $health = Test-SmcHermesGatewayHttp -Url "http://${HostName}:${Port}/health" -TimeoutSec 3
    if ($health -ne 200) {
        return "GET /health status=$health"
    }
    $auth = Test-SmcHermesGatewayHttp -Url "http://${HostName}:${Port}/v1/models" -Headers @{ Authorization = "Bearer $apiKey" } -TimeoutSec 5
    if ($auth -ne 200) {
        return "GET /v1/models status=$auth"
    }
    return ""
}

function Test-SmcHermesGatewayReady {
    param(
        [Parameter(Mandatory = $true)][string]$HermesHome,
        [string]$HostName = "127.0.0.1",
        [int]$Port = 8642,
        [int]$Attempts = 45,
        [int]$DelayMs = 1000
    )
    $envPath = Get-SmcHermesEnvPath -HermesHome $HermesHome
    $apiKey = Get-SmcHermesEnvValue -EnvPath $envPath -Key "API_SERVER_KEY"
    if ([string]::IsNullOrWhiteSpace($apiKey)) { return $false }
    $healthUrl = "http://${HostName}:${Port}/health"
    $modelsUrl = "http://${HostName}:${Port}/v1/models"
    for ($i = 1; $i -le $Attempts; $i++) {
        $tcpOk = $false
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $iar = $client.BeginConnect($HostName, $Port, $null, $null)
            $tcpOk = $iar.AsyncWaitHandle.WaitOne(1000, $false) -and $client.Connected
            $client.Close()
        } catch {
            $tcpOk = $false
        }
        if ($tcpOk) {
            $health = Test-SmcHermesGatewayHttp -Url $healthUrl -TimeoutSec 3
            if ($health -eq 200) {
                $auth = Test-SmcHermesGatewayHttp -Url $modelsUrl -Headers @{ Authorization = "Bearer $apiKey" } -TimeoutSec 5
                if ($auth -eq 200) { return $true }
                if ($auth -in @(401, 403)) { return $false }
            }
        }
        Start-Sleep -Milliseconds $DelayMs
    }
    return $false
}

function Start-SmcHermesGatewayTaskForReadiness {
    param([Parameter(Mandatory = $true)][string]$TaskName)
    Write-SmcInstallerTrace "readiness: Start-ScheduledTask name=$TaskName"
    try {
        Start-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    } catch {
        return "gateway Start-ScheduledTask failed: $($_.Exception.Message)"
    }
    # Confirm scheduler accepted the start request (Running, or Ready after a brief handoff).
    for ($i = 1; $i -le 10; $i++) {
        $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        if ($null -eq $task) {
            return "gateway task missing after Start-ScheduledTask"
        }
        $state = [string]$task.State
        if ($state -eq "Running") {
            Write-SmcInstallerTrace "readiness: gateway task state=Running"
            return ""
        }
        $info = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue
        $lastResult = if ($null -ne $info) { [int]$info.LastTaskResult } else { -1 }
        # 267009 = SCHED_S_TASK_RUNNING; 267011 = has not yet run (still transitioning).
        if (($lastResult -ne 0) -and ($lastResult -ne 267009) -and ($lastResult -ne 267011) -and ($i -ge 3)) {
            return "gateway task start rejected (state=$state lastResult=$lastResult)"
        }
        Start-Sleep -Milliseconds 500
    }
    $final = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    $finalState = if ($null -ne $final) { [string]$final.State } else { "missing" }
    Write-SmcInstallerTrace "readiness: gateway task post-start state=$finalState (continuing probe)"
    return ""
}

function Get-SmcHermesReadinessFailure {
    param(
        [Parameter(Mandatory = $true)][string]$ProgramRoot,
        [Parameter(Mandatory = $true)][string]$HermesHome,
        [string]$ExpectedVersion = ""
    )
    $cli = Join-Path $ProgramRoot "bin\hermes.exe"
    if (-not (Test-Path -LiteralPath $cli)) {
        return "hermes cli missing: $cli"
    }
    $layout = Get-SmcHermesManagedLayout
    if (-not (Test-Path -LiteralPath $layout.HermesHome)) {
        return "managed home missing: $($layout.HermesHome)"
    }
    if (-not (Test-Path -LiteralPath $layout.ConfigPath)) {
        return "config.yaml missing: $($layout.ConfigPath)"
    }
    if (-not (Test-Path -LiteralPath $layout.WorkspaceRoot)) {
        return "workspace root missing: $($layout.WorkspaceRoot)"
    }
    if (-not (Test-Path -LiteralPath $layout.TempRoot)) {
        return "temp root missing: $($layout.TempRoot)"
    }

    # FR-216-14: Config Valid is independent of Gateway Valid.
    try {
        Assert-SmcHermesManagedTerminalConfig -ConfigPath $layout.ConfigPath -WorkspaceRoot $layout.WorkspaceRoot -HermesHome $HermesHome
        Invoke-SmcHermesConfigCheck -ConfigPath $layout.ConfigPath -HermesHome $HermesHome -CliPath $cli -ProgramRoot $ProgramRoot
        Write-SmcInstallerTrace "config.standard_yaml=PASS"
        Write-SmcInstallerTrace "config.hermes_native=PASS"
        Write-SmcInstallerTrace "config.fallback_detected=false"
    } catch {
        Write-SmcInstallerTrace "config gate FAILED: $($_.Exception.Message)"
        return "config gate failed: $($_.Exception.Message)"
    }

    $env:HERMES_HOME = $HermesHome
    $env:HERMES_AGENT_ROOT = $layout.AgentRoot
    $env:HERMES_NODE_ROOT = $layout.NodeRoot

    # Certification must never run with skip/test-root flags (FR-216-24).
    $certMode = [Environment]::GetEnvironmentVariable("SMC_HERMES_INSTALLER_CERTIFICATION", "Process")
    if ($certMode -eq "1") {
        foreach ($flag in @(
            "SMC_HERMES_INSTALLER_SKIP_GATEWAY",
            "SMC_HERMES_INSTALLER_SKIP_NATIVE_CONFIG",
            "SMC_HERMES_MANAGED_TEST_ROOT"
        )) {
            $val = [Environment]::GetEnvironmentVariable($flag, "Process")
            if (-not [string]::IsNullOrWhiteSpace($val)) {
                return "certification forbids test mode flag: $flag=$val"
            }
        }
    }

    # SKIP_GATEWAY only skips Gateway / Scheduled Task / network — never config (FR-216-13).
    if ([Environment]::GetEnvironmentVariable("SMC_HERMES_INSTALLER_SKIP_GATEWAY", "Process") -eq "1") {
        Write-SmcInstallerTrace "install.readiness=PASS (gateway skipped; config validated)"
        return ""
    }
    try {
        $versionText = Get-SmcHermesCliVersion -CliPath $cli
    } catch {
        return "hermes --version failed: $($_.Exception.Message)"
    }
    if (-not $versionText) {
        return "hermes --version empty"
    }
    if (Test-SmcHermesConfigFallbackOutput -OutputText $versionText) {
        return "CONFIG_FALLBACK_DETECTED: hermes --version reported config fallback"
    }
    if ($ExpectedVersion -and ($versionText -notmatch [regex]::Escape($ExpectedVersion))) {
        return "hermes version mismatch: expected=$ExpectedVersion actual=$versionText"
    }
    $task = Get-ScheduledTask -TaskName $script:SmcGatewayTaskName -ErrorAction SilentlyContinue
    if ($null -eq $task) {
        return "gateway scheduled task missing: $($script:SmcGatewayTaskName)"
    }
    $contractFailure = Get-SmcHermesGatewayTaskContractFailure -ProgramRoot $ProgramRoot -HermesHome $HermesHome
    if (-not [string]::IsNullOrEmpty($contractFailure)) {
        return "gateway task contract failed: $contractFailure"
    }
    $startFailure = Start-SmcHermesGatewayTaskForReadiness -TaskName $script:SmcGatewayTaskName
    if (-not [string]::IsNullOrEmpty($startFailure)) {
        Write-SmcInstallerTrace "readiness FAILED: $startFailure"
        return $startFailure
    }
    # Cold start can take tens of seconds on first install (bounded wait, not infinite).
    Write-SmcInstallerTrace "readiness: probing gateway health/auth (attempts=45 delayMs=1000)"
    if (-not (Test-SmcHermesGatewayReady -HermesHome $HermesHome -Attempts 45 -DelayMs 1000)) {
        $taskState = ""
        try { $taskState = [string](Get-ScheduledTask -TaskName $script:SmcGatewayTaskName -ErrorAction SilentlyContinue).State } catch {}
        $infoState = ""
        try { $infoState = [string](Get-ScheduledTaskInfo -TaskName $script:SmcGatewayTaskName -ErrorAction SilentlyContinue).LastTaskResult } catch {}
        $probe = Get-SmcHermesGatewayProbeDetail -HermesHome $HermesHome
        if ([string]::IsNullOrEmpty($probe)) { $probe = "probe inconclusive" }
        $reason = "gateway not ready within timeout ($probe; taskState=$taskState lastResult=$infoState)"
        Write-SmcInstallerTrace "readiness FAILED: $reason"
        return $reason
    }
    Write-SmcInstallerTrace "gateway.health=PASS"
    Write-SmcInstallerTrace "gateway.auth=PASS"
    Write-SmcInstallerTrace "install.readiness=PASS"
    return ""
}

function Test-SmcHermesReady {
    param(
        [Parameter(Mandatory = $true)][string]$ProgramRoot,
        [Parameter(Mandatory = $true)][string]$HermesHome,
        [string]$ExpectedVersion = ""
    )
    $reason = Get-SmcHermesReadinessFailure -ProgramRoot $ProgramRoot -HermesHome $HermesHome -ExpectedVersion $ExpectedVersion
    return [string]::IsNullOrEmpty($reason)
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

function Get-SmcPathSha256 {
    param([AllowNull()][object]$Raw)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        if ($null -eq $Raw) {
            $bytes = [System.Text.Encoding]::UTF8.GetBytes([char]0 + "NULL")
        } else {
            $bytes = [System.Text.Encoding]::UTF8.GetBytes([string]$Raw)
        }
        $hash = $sha.ComputeHash($bytes)
        return ([BitConverter]::ToString($hash) -replace "-", "").ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
}

function Test-SmcRawPathEqual {
    param([AllowNull()][object]$Left, [AllowNull()][object]$Right)
    if ($null -eq $Left -and $null -eq $Right) { return $true }
    if ($null -eq $Left -or $null -eq $Right) { return $false }
    return [string]::Equals([string]$Left, [string]$Right, [StringComparison]::Ordinal)
}

function Get-SmcEnvironmentPathSnapshot {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("install", "upgrade", "repair", "uninstall")]
        [string]$Operation
    )
    $machineRaw = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userRaw = [Environment]::GetEnvironmentVariable("Path", "User")
    return [pscustomobject]@{
        schema             = "smc.windows.environment-snapshot.v1"
        capturedAt         = [DateTime]::UtcNow.ToString("o")
        operation          = $Operation
        machinePathRaw     = $machineRaw
        userPathRaw        = $userRaw
        machinePathSha256  = (Get-SmcPathSha256 -Raw $machineRaw)
        userPathSha256     = (Get-SmcPathSha256 -Raw $userRaw)
    }
}

function Write-SmcEnvironmentPathGateLog {
    param(
        [Parameter(Mandatory = $true)]$Before,
        [Parameter(Mandatory = $true)]$After,
        [Parameter(Mandatory = $true)][bool]$MachineUnchanged,
        [Parameter(Mandatory = $true)][bool]$UserUnchanged
    )
    Write-Host ("environment.path.policy=immutable")
    Write-Host ("machinePath.before.sha256=" + [string]$Before.machinePathSha256)
    Write-Host ("machinePath.after.sha256=" + [string]$After.machinePathSha256)
    Write-Host ("machinePath.unchanged=" + ($(if ($MachineUnchanged) { "true" } else { "false" })))
    Write-Host ("userPath.before.sha256=" + [string]$Before.userPathSha256)
    Write-Host ("userPath.after.sha256=" + [string]$After.userPathSha256)
    Write-Host ("userPath.unchanged=" + ($(if ($UserUnchanged) { "true" } else { "false" })))
}

function Assert-SmcEnvironmentPathUnchanged {
    param(
        [Parameter(Mandatory = $true)]$Before,
        [string]$Operation = ""
    )
    $op = if (-not [string]::IsNullOrWhiteSpace($Operation)) { $Operation } else { [string]$Before.operation }
    $after = Get-SmcEnvironmentPathSnapshot -Operation $op
    $machineOk = Test-SmcRawPathEqual -Left $Before.machinePathRaw -Right $after.machinePathRaw
    $userOk = Test-SmcRawPathEqual -Left $Before.userPathRaw -Right $after.userPathRaw
    Write-SmcEnvironmentPathGateLog -Before $Before -After $after -MachineUnchanged:$machineOk -UserUnchanged:$userOk
    if (-not ($machineOk -and $userOk)) {
        throw ("ENVIRONMENT_PATH_MUTATED operation=" + $op +
            " machine.before=" + [string]$Before.machinePathSha256 +
            " machine.after=" + [string]$after.machinePathSha256 +
            " user.before=" + [string]$Before.userPathSha256 +
            " user.after=" + [string]$after.userPathSha256)
    }
    return $after
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
    $pathBefore = Get-SmcEnvironmentPathSnapshot -Operation install
    try {
        Stop-SmcHermesProgramProcesses -ProgramRoot $layout.ProgramRoot
        $null = Expand-SmcHermesReleasePayload -PayloadRoot $PayloadRoot -ExtractRoot $extract
        Install-SmcHermesProgramTree -ExtractRoot $extract -ProgramRoot $layout.ProgramRoot -Manifest $manifest
        $null = Initialize-SmcHermesManagedHome -ProgramRoot $layout.ProgramRoot -HermesHome $layout.HermesHome
        $null = Set-SmcHermesEndpointSecret -HermesHome $layout.HermesHome
        if (Get-Command Merge-SmcHermesManagedConfig -ErrorAction SilentlyContinue) {
            $null = Merge-SmcHermesManagedConfig -ProgramRoot $layout.ProgramRoot -HermesHome $layout.HermesHome -CliPath (Join-Path $layout.ProgramRoot "bin\hermes.exe")
        }
        $null = Set-SmcHermesManagedTerminalConfig -HermesHome $layout.HermesHome -CliPath (Join-Path $layout.ProgramRoot "bin\hermes.exe")
        Set-SmcHermesGatewayTask -ProgramRoot $layout.ProgramRoot -HermesHome $layout.HermesHome
        Write-SmcInstallerTrace "install: gateway task registered; running readiness (start+probe)"
        $readyFailure = Get-SmcHermesReadinessFailure -ProgramRoot $layout.ProgramRoot -HermesHome $layout.HermesHome -ExpectedVersion $manifest.hermesVersion
        if (-not [string]::IsNullOrEmpty($readyFailure)) {
            Write-SmcInstallerTrace "install readiness FAILED: $readyFailure"
            throw "install readiness checks failed: $readyFailure"
        }
        Write-SmcInstallerTrace "install readiness OK"
        Assert-SmcEnvironmentPathUnchanged -Before $pathBefore -Operation install | Out-Null
        Commit-SmcControlOwner -OwnerPath $layout.OwnerPath
        Set-SmcInstallerState -StatePath $layout.StatePath -State @{
            current = [string]$manifest.releaseVersion
            previous = ""
            ownerCommitted = $true
            programRoot = $layout.ProgramRoot
            hermesHome = $layout.HermesHome
        }
    } catch {
        $orig = $_
        Remove-SmcHermesGatewayTask
        if (Test-Path -LiteralPath $layout.ProgramRoot) { Remove-Item -LiteralPath $layout.ProgramRoot -Recurse -Force -ErrorAction SilentlyContinue }
        try {
            Assert-SmcEnvironmentPathUnchanged -Before $pathBefore -Operation install | Out-Null
        } catch {
            throw
        }
        throw $orig
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
    $pathBefore = Get-SmcEnvironmentPathSnapshot -Operation upgrade
    if (Test-Path -LiteralPath $layout.ProgramRoot) {
        if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Recurse -Force }
        Copy-Item -LiteralPath $layout.ProgramRoot -Destination $backup -Recurse -Force
    }
    try {
        $code = Install-SmcHermesAgent -PayloadRoot $PayloadRoot -InstallDir $layout.ProgramRoot -HermesHome $layout.HermesHome -Silent
        $manifest = Test-SmcHermesReleaseFiles -PayloadRoot $PayloadRoot
        Assert-SmcEnvironmentPathUnchanged -Before $pathBefore -Operation upgrade | Out-Null
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
        $orig = $_
        if (Test-Path -LiteralPath $backup) {
            if (Test-Path -LiteralPath $layout.ProgramRoot) { Remove-Item -LiteralPath $layout.ProgramRoot -Recurse -Force }
            Move-Item -LiteralPath $backup -Destination $layout.ProgramRoot
        }
        try {
            Assert-SmcEnvironmentPathUnchanged -Before $pathBefore -Operation upgrade | Out-Null
        } catch {
            throw
        }
        throw $orig
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
    if ($RepairLevel -ge 5) {
        return Upgrade-SmcHermesAgent -PayloadRoot $PayloadRoot -InstallDir $layout.ProgramRoot -HermesHome $layout.HermesHome
    }
    $pathBefore = Get-SmcEnvironmentPathSnapshot -Operation repair
    try {
        # Level 1+ reconcile managed dirs, terminal.cwd, secrets, and gateway execution context.
        Initialize-SmcHermesManagedHome -ProgramRoot $layout.ProgramRoot -HermesHome $layout.HermesHome | Out-Null
        $null = Set-SmcHermesEndpointSecret -HermesHome $layout.HermesHome
        if (Get-Command Merge-SmcHermesManagedConfig -ErrorAction SilentlyContinue) {
            $null = Merge-SmcHermesManagedConfig -ProgramRoot $layout.ProgramRoot -HermesHome $layout.HermesHome -CliPath (Join-Path $layout.ProgramRoot "bin\hermes.exe")
        }
        $null = Set-SmcHermesManagedTerminalConfig -HermesHome $layout.HermesHome -CliPath (Join-Path $layout.ProgramRoot "bin\hermes.exe")
        if (Test-Path -LiteralPath $layout.ProgramRoot) {
            Set-SmcHermesProgramAcl -Path $layout.ProgramRoot
        }
        Set-SmcHermesGatewayTask -ProgramRoot $layout.ProgramRoot -HermesHome $layout.HermesHome
        if ($RepairLevel -le 1) {
            if ([Environment]::GetEnvironmentVariable("SMC_HERMES_INSTALLER_SKIP_GATEWAY", "Process") -ne "1") {
                Restart-SmcHermesGatewayTask
            }
        }
        Write-SmcInstallerTrace "repair: running readiness (start+probe)"
        $readyFailure = Get-SmcHermesReadinessFailure -ProgramRoot $layout.ProgramRoot -HermesHome $layout.HermesHome
        if (-not [string]::IsNullOrEmpty($readyFailure)) {
            Write-SmcInstallerTrace "repair readiness FAILED: $readyFailure"
            throw "repair readiness failed: $readyFailure"
        }
        Write-SmcInstallerTrace "repair readiness OK"
        Assert-SmcEnvironmentPathUnchanged -Before $pathBefore -Operation repair | Out-Null
        return $script:SmcInstallerExitSuccess
    } catch {
        $orig = $_
        try {
            Assert-SmcEnvironmentPathUnchanged -Before $pathBefore -Operation repair | Out-Null
        } catch {
            throw
        }
        throw $orig
    }
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
    $managed = Get-SmcHermesManagedLayout
    $pathBefore = Get-SmcEnvironmentPathSnapshot -Operation uninstall
    try {
        Stop-SmcHermesProgramProcesses -ProgramRoot $layout.ProgramRoot
        Remove-SmcHermesGatewayTask
        if (Test-Path -LiteralPath $layout.ProgramRoot) {
            Remove-SmcDirectoryRetry -Path $layout.ProgramRoot
        }
        # Remove Installer-owned dedicated env vars only; Machine/User PATH stay immutable
        Remove-SmcHermesEnvironment
        try {
            $null = Clear-SmcHermesManagedTemp -TempRoot $managed.TempRoot -HermesHome $layout.HermesHome -RemoveAllSafe
        } catch {
            Write-Warning "temp cleanup skipped: $($_.Exception.Message)"
        }
        Restore-SmcControlOwner -OwnerPath $layout.OwnerPath
        if (Test-Path -LiteralPath $layout.StatePath) { Remove-Item -LiteralPath $layout.StatePath -Force }
        Assert-SmcEnvironmentPathUnchanged -Before $pathBefore -Operation uninstall | Out-Null
        return $script:SmcInstallerExitSuccess
    } catch {
        $orig = $_
        try {
            Assert-SmcEnvironmentPathUnchanged -Before $pathBefore -Operation uninstall | Out-Null
        } catch {
            throw
        }
        throw $orig
    }
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

Export-ModuleMember -Function Invoke-SmcHermesLifecycle, Install-SmcHermesAgent, Upgrade-SmcHermesAgent, Repair-SmcHermesAgent, Uninstall-SmcHermesAgent, ConvertTo-SmcInstallerArgs, Test-SmcHermesReleaseFiles, Test-SmcHermesReady, Test-SmcHermesGatewayReady, Get-SmcHermesReadinessFailure, Get-SmcHermesGatewayProbeDetail, Set-SmcHermesEndpointSecret, Get-SmcHermesEnvValue, Get-SmcHermesGatewayTaskSpec, Test-SmcHermesGatewayTaskContract, Get-SmcHermesGatewayTaskContractFailure, Get-SmcEnvironmentPathSnapshot, Assert-SmcEnvironmentPathUnchanged, Get-SmcPathSha256, Test-SmcRawPathEqual
