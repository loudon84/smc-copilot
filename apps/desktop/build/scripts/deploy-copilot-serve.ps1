# team_v1.7 / ver5.3.4 — Deploy copilot-serve + Portal monorepo into SMC-Copilot runtime (V5.3 serve layout + V5.4 desktop.exe)
param(
    [string]$InstallRoot = "$env:LOCALAPPDATA\Programs\SMC-Copilot",
    [string]$RepoUrl = "http://git.superic.com/aiplatform/copilot-serve.git",
    [string]$Branch = "master",
    [int]$Port = 8765,
    [string]$PortalRepoUrl = "http://git.superic.com/aiplatform/copilot-full.git",
    [string]$PortalBranch = "master",
    [switch]$Force,
    [switch]$SkipServe,
    [switch]$SkipPortal,
    [switch]$RestartDesktop
)

$ErrorActionPreference = "Stop"

$RuntimeRoot = Join-Path $InstallRoot "runtime"
$ServeRuntimeRoot = Join-Path $RuntimeRoot "serve"
$ServeSourceRoot = Join-Path $ServeRuntimeRoot "src"
$ServeVenv = Join-Path $ServeRuntimeRoot "venv"
$PortalRuntimeRoot = Join-Path $RuntimeRoot "portal"
$PortalMonorepoRoot = Join-Path $PortalRuntimeRoot "src"
$DeployLog = Join-Path $RuntimeRoot "logs\deploy-copilot-serve.log"
$StateFile = Join-Path $RuntimeRoot "deploy-state.json"
$DesktopRuntimeConfig = Join-Path $RuntimeRoot "desktop-runtime.json"

function Assert-LastExit([string]$Step) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with exit code $LASTEXITCODE"
    }
}

function Write-DeployLog([string]$Message) {
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Write-Host $line
    $logDir = Split-Path $DeployLog -Parent
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
    Add-Content -Path $DeployLog -Value $line
}

# git/uv 常把进度写到 stderr；在 Stop 模式下会误报为失败，仅以 $LASTEXITCODE 为准。
function Invoke-DeployNative([string]$Step, [scriptblock]$Command) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $Command 2>&1 | ForEach-Object {
            $text = if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.ToString() } else { "$_" }
            if ($text) { Write-DeployLog $text }
        }
        Assert-LastExit $Step
    } finally {
        $ErrorActionPreference = $prev
    }
}

function Invoke-DeployNativeRetry([string]$Step, [int]$MaxAttempts, [scriptblock]$Command) {
    $attempt = 0
    $lastError = $null
    while ($attempt -lt $MaxAttempts) {
        $attempt++
        try {
            if ($attempt -gt 1) {
                Write-DeployLog "$Step retry $attempt/$MaxAttempts..."
                Start-Sleep -Seconds ([Math]::Min(15, 3 * $attempt))
            }
            Invoke-DeployNative $Step $Command
            return
        } catch {
            $lastError = $_
            Write-DeployLog "$Step attempt $attempt failed: $_"
        }
    }
    throw $lastError
}

function Test-WindowsVersion {
    $ver = [System.Environment]::OSVersion.Version
    if ($ver.Major -lt 10) {
        throw "Windows 10 or later required (detected $($ver.Major).$($ver.Minor))"
    }
}

function Test-Git {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw "Git not found. Install Git for Windows and ensure git is on PATH."
    }
}

function Get-Python312 {
    $candidates = @(
        @{ Cmd = "python"; Args = @() },
        @{ Cmd = "python3.12"; Args = @() },
        @{ Cmd = "py"; Args = @("-3.12") },
        @{ Cmd = "python3"; Args = @() }
    )
    foreach ($c in $candidates) {
        try {
            $out = & $c.Cmd @($c.Args + "--version") 2>&1 | Out-String
            if ($out -match "3\.12") {
                return $c
            }
        } catch { }
    }
    throw "Python 3.12 not found. Install Python 3.12.x."
}

function Ensure-Uv {
    if (Get-Command uv -ErrorAction SilentlyContinue) { return }
    Write-DeployLog "Installing uv via pip..."
    $py = Get-Python312
    & $py.Cmd @($py.Args + "-m", "pip", "install", "uv")
    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
        throw "uv not available after install"
    }
}

function Test-Node {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw "Node.js not found. Install Node.js 18+ (24.x recommended)."
    }
    $version = (& node --version 2>&1 | Out-String).Trim()
    if ($version -notmatch "^v(\d+)") {
        throw "Unable to parse Node.js version: $version"
    }
    $major = [int]$Matches[1]
    if ($major -lt 18) {
        throw "Node.js 18+ required (detected $version)"
    }
    Write-DeployLog "Node.js $version"
}

function Ensure-Pnpm {
    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        $pnpmVersion = (& pnpm --version 2>&1 | Out-String).Trim()
        Write-DeployLog "pnpm $pnpmVersion"
        return
    }
    if (Get-Command corepack -ErrorAction SilentlyContinue) {
        Write-DeployLog "Enabling pnpm via corepack..."
        Invoke-DeployNative "corepack enable" { corepack enable }
        Invoke-DeployNative "corepack prepare pnpm" { corepack prepare pnpm@9.15.4 --activate }
    }
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        Write-DeployLog "Installing pnpm globally via npm..."
        Invoke-DeployNative "npm install -g pnpm" { npm install -g pnpm@9.15.4 }
    }
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        throw "pnpm not available after install"
    }
}

function Remove-Tree([string]$Path) {
    if (Test-Path $Path) {
        Write-DeployLog "Removing $Path for fresh clone"
        Remove-Item -Recurse -Force $Path -ErrorAction Stop
    }
}

function Clone-GitRepoFresh([string]$TargetRoot, [string]$Url, [string]$RefBranch) {
    $parent = Split-Path $TargetRoot -Parent
    if (-not (Test-Path $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    Write-DeployLog "git clone $Url (branch $RefBranch) -> $TargetRoot"
    Invoke-DeployNativeRetry "git clone" 3 {
        git -c http.postBuffer=524288000 `
            -c http.lowSpeedLimit=0 `
            -c http.lowSpeedTime=999999 `
            -c http.version=HTTP/1.1 `
            clone --branch $RefBranch --depth 1 --single-branch $Url $TargetRoot
    }
}

function Sync-GitRepo {
    param(
        [string]$TargetRoot,
        [string]$Url,
        [string]$RefBranch,
        [string]$MarkerFile
    )

    $gitDir = Join-Path $TargetRoot ".git"
    $repoComplete = (Test-Path $MarkerFile) -and (Test-Path $gitDir)

    if ($Force -or -not $repoComplete) {
        Remove-Tree $TargetRoot
        Clone-GitRepoFresh $TargetRoot $Url $RefBranch
    } else {
        Write-DeployLog "git update in $TargetRoot (shallow fetch)"
        $updateFailed = $false
        Push-Location $TargetRoot
        try {
            Invoke-DeployNativeRetry "git fetch" 3 {
                git -c http.postBuffer=524288000 `
                    -c http.lowSpeedLimit=0 `
                    -c http.lowSpeedTime=999999 `
                    -c http.version=HTTP/1.1 `
                    fetch --depth 1 origin $RefBranch
            }
            Invoke-DeployNative "git checkout" { git checkout -f $RefBranch }
            Invoke-DeployNative "git reset" { git reset --hard "origin/$RefBranch" }
        } catch {
            Write-DeployLog "git update failed ($_), re-cloning fresh..."
            $updateFailed = $true
        } finally {
            Pop-Location
        }
        if ($updateFailed) {
            Remove-Tree $TargetRoot
            Clone-GitRepoFresh $TargetRoot $Url $RefBranch
        }
    }

    if (-not (Test-Path $MarkerFile)) {
        throw "Expected marker file missing after sync: $MarkerFile (branch '$RefBranch' unavailable?)"
    }
}

function Test-PortalMonorepoLayout([string]$Root) {
    foreach ($name in @("package.json", "backend", "frontend")) {
        $path = Join-Path $Root $name
        if (-not (Test-Path $path)) {
            throw "Portal monorepo layout invalid at $Root (missing $name)"
        }
    }
}

function Write-ServeEnv {
    $hermesHome = Join-Path $env:USERPROFILE ".hermes"
    $sqlite = Join-Path $hermesHome "desktop\sqlite.db"
    $envContent = @"
COPILOT_HOST=127.0.0.1
COPILOT_PORT=$Port

SQLITE_PATH=$sqlite
HERMES_HOME=$hermesHome
LOG_DIR=./data/logs

DEFAULT_GATEWAY_PORT=8642
HERMES_GATEWAY_COMMAND=hermes gateway

AIOS_TEAM_HUB_USE_STUB=true

COPILOT_REQUIRE_TOKEN=false
CORS_ALLOW_ORIGINS=http://127.0.0.1,http://localhost
"@
    $envPath = Join-Path $ServeRuntimeRoot ".env"
    Set-Content -Path $envPath -Value $envContent -Encoding UTF8
    Write-DeployLog "Wrote $envPath"
}

function Set-ServeUserEnvVars {
    $venvPython = Join-Path $ServeVenv "Scripts\python.exe"
    [Environment]::SetEnvironmentVariable("COPILOT_SERVE_ROOT", $ServeSourceRoot, "User")
    [Environment]::SetEnvironmentVariable("COPILOT_SERVE_PYTHON", $venvPython, "User")
    [Environment]::SetEnvironmentVariable("COPILOT_SERVE_PORT", [string]$Port, "User")
    Write-DeployLog "Set user env: COPILOT_SERVE_ROOT, COPILOT_SERVE_PYTHON, COPILOT_SERVE_PORT"
}

function Set-PortalUserEnvVars {
    [Environment]::SetEnvironmentVariable("COPILOT_PORTAL_ROOT", $PortalMonorepoRoot, "User")
    [Environment]::SetEnvironmentVariable("COPILOT_PORTAL_RUNTIME_ROOT", $PortalRuntimeRoot, "User")
    Write-DeployLog "Set user env: COPILOT_PORTAL_ROOT=$PortalMonorepoRoot"
    Write-DeployLog "Set user env: COPILOT_PORTAL_RUNTIME_ROOT=$PortalRuntimeRoot"
}

function Update-DesktopRuntimeConfig {
    $merged = @{}
    if (Test-Path $DesktopRuntimeConfig) {
        try {
            $existing = Get-Content -Path $DesktopRuntimeConfig -Raw | ConvertFrom-Json
            foreach ($prop in $existing.PSObject.Properties) {
                $merged[$prop.Name] = $prop.Value
            }
        } catch {
            Write-DeployLog "Warning: desktop-runtime.json unreadable, rewriting minimal config"
        }
    }

    $merged["installDir"] = if ($merged.ContainsKey("installDir")) { $merged["installDir"] } else { $InstallRoot }
    $merged["runtimeRoot"] = if ($merged.ContainsKey("runtimeRoot")) { $merged["runtimeRoot"] } else { $RuntimeRoot }
    $merged["binDir"] = if ($merged.ContainsKey("binDir")) { $merged["binDir"] } else { (Join-Path $InstallRoot "bin") }

    if (-not $SkipServe) {
        $merged["serveRuntimeRoot"] = $ServeRuntimeRoot
        $merged["serveSourceRoot"] = $ServeSourceRoot
        $merged["copilotServeDir"] = $ServeSourceRoot
        $merged["copilotServePort"] = $Port
    }

    if (-not $SkipPortal) {
        $merged["portalRuntimeRoot"] = $PortalRuntimeRoot
        $merged["portalSourceRoot"] = $PortalMonorepoRoot
    }

    ($merged | ConvertTo-Json -Depth 6) | Set-Content -Path $DesktopRuntimeConfig -Encoding UTF8
    Write-DeployLog "Updated $DesktopRuntimeConfig"
}

function Write-DeployState {
    param(
        [string]$Status,
        [string]$ServeStatus = "skipped",
        [string]$PortalStatus = "skipped",
        [string]$ErrorMsg = $null
    )

    $state = @{
        status = $Status
        completedAt = (Get-Date).ToString("o")
        installRoot = $InstallRoot
        serveRuntimeRoot = if ($SkipServe) { $null } else { $ServeRuntimeRoot }
        serveSourceRoot = if ($SkipServe) { $null } else { $ServeSourceRoot }
        serveStatus = $ServeStatus
        servePort = if ($SkipServe) { $null } else { $Port }
        serveBranch = if ($SkipServe) { $null } else { $Branch }
        portalRoot = if ($SkipPortal) { $null } else { $PortalMonorepoRoot }
        portalRuntimeRoot = if ($SkipPortal) { $null } else { $PortalRuntimeRoot }
        portalStatus = $PortalStatus
        portalBranch = if ($SkipPortal) { $null } else { $PortalBranch }
        error = $ErrorMsg
    }
    $state | ConvertTo-Json -Depth 4 | Set-Content -Path $StateFile -Encoding UTF8
}

function Deploy-Serve {
    Write-DeployLog "=== deploy copilot-serve (runtime/serve) ==="
    $null = Get-Python312
    Ensure-Uv

    New-Item -ItemType Directory -Path $ServeRuntimeRoot -Force | Out-Null
    Sync-GitRepo -TargetRoot $ServeSourceRoot -Url $RepoUrl -RefBranch $Branch -MarkerFile (Join-Path $ServeSourceRoot "pyproject.toml")

    Push-Location $ServeSourceRoot
    try {
        if ($Force) {
            if (Test-Path $ServeVenv) {
                Remove-Item -Recurse -Force $ServeVenv
            }
            $legacyVenvInSrc = Join-Path $ServeSourceRoot ".venv"
            if (Test-Path $legacyVenvInSrc) {
                Remove-Item -Recurse -Force $legacyVenvInSrc
            }
        }
        if (-not (Test-Path (Join-Path $ServeVenv "Scripts\python.exe"))) {
            Write-DeployLog "uv venv $ServeVenv --python 3.12"
            Invoke-DeployNative "uv venv" { uv venv $ServeVenv --python 3.12 }
        }
        $prevUvEnv = $env:UV_PROJECT_ENVIRONMENT
        $env:UV_PROJECT_ENVIRONMENT = $ServeVenv
        try {
            Write-DeployLog "uv sync --extra service"
            Invoke-DeployNative "uv sync --extra service" { uv sync --extra service }

            Write-ServeEnv

            Write-DeployLog "alembic upgrade head"
            Invoke-DeployNative "alembic upgrade head" { uv run alembic upgrade head }
        } finally {
            if ($null -eq $prevUvEnv) {
                Remove-Item Env:UV_PROJECT_ENVIRONMENT -ErrorAction SilentlyContinue
            } else {
                $env:UV_PROJECT_ENVIRONMENT = $prevUvEnv
            }
        }
    } finally {
        Pop-Location
    }

    Set-ServeUserEnvVars
    Write-DeployLog "=== copilot-serve deploy success ==="
}

function Deploy-Portal {
    Write-DeployLog "=== deploy Portal monorepo ==="
    Test-Node
    Ensure-Pnpm

    New-Item -ItemType Directory -Path $PortalRuntimeRoot -Force | Out-Null
    Sync-GitRepo -TargetRoot $PortalMonorepoRoot -Url $PortalRepoUrl -RefBranch $PortalBranch -MarkerFile (Join-Path $PortalMonorepoRoot "package.json")
    Test-PortalMonorepoLayout $PortalMonorepoRoot

    Push-Location $PortalMonorepoRoot
    try {
        if (Test-Path "pnpm-lock.yaml") {
            Write-DeployLog "pnpm install --frozen-lockfile"
            Invoke-DeployNative "pnpm install" { pnpm install --frozen-lockfile }
        } else {
            Write-DeployLog "pnpm install"
            Invoke-DeployNative "pnpm install" { pnpm install }
        }
    } finally {
        Pop-Location
    }

    Set-PortalUserEnvVars
    Write-DeployLog "=== Portal monorepo deploy success ==="
}

function Restart-DesktopApp {
    if (-not $RestartDesktop) { return }
    $desktopExe = $null
    foreach ($candidate in @(
            (Join-Path $InstallRoot "desktop.exe"),
            (Join-Path $InstallRoot "smc-ai-copilot.exe"),
            (Join-Path $InstallRoot "SMCCopilot.exe")
        )) {
        if (Test-Path $candidate) {
            $desktopExe = $candidate
            break
        }
    }
    if ($desktopExe) {
        Write-DeployLog "Restarting desktop ($desktopExe)..."
        foreach ($procName in @("desktop", "smc-ai-copilot")) {
            Get-Process -Name $procName -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 2
        Start-Process $desktopExe
    } else {
        Write-DeployLog "Desktop executable not found (desktop.exe / legacy); skip restart"
    }
}

$serveStatus = "skipped"
$portalStatus = "skipped"

try {
    Write-DeployLog "=== deploy-runtime start (ver5.3.4) ==="
    Write-DeployLog "InstallRoot=$InstallRoot SkipServe=$SkipServe SkipPortal=$SkipPortal"

    Test-WindowsVersion
    Test-Git
    New-Item -ItemType Directory -Path (Join-Path $RuntimeRoot "logs") -Force | Out-Null

    if (-not $SkipServe) {
        Deploy-Serve
        $serveStatus = "success"
    }

    if (-not $SkipPortal) {
        Deploy-Portal
        $portalStatus = "success"
    }

    Update-DesktopRuntimeConfig
    Write-DeployState -Status "success" -ServeStatus $serveStatus -PortalStatus $portalStatus

    Restart-DesktopApp

    Write-DeployLog "=== deploy-runtime success ==="
} catch {
    Write-DeployLog "ERROR: $_"
    Write-DeployState -Status "failed" -ServeStatus $serveStatus -PortalStatus $portalStatus -ErrorMsg $_.ToString()
    throw
}
