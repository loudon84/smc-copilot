# Single-repo Windows bootstrap: venv, deps, .env, migrate
# 约定：RuntimeRoot 须在允许的程序目录下；Monorepo 开发态允许 D:\Programs\smc-copilot\services\runtime。
param(
    [string]$RepoRoot = $PSScriptRoot + "\..",
    [string]$PythonPath = "",
    [switch]$Force,
    [switch]$SkipProgramsCheck
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path $RepoRoot).Path
Set-Location $RepoRoot

$ProgramsRoot = "D:\Programs"
if (-not $SkipProgramsCheck) {
    $repoFull = [System.IO.Path]::GetFullPath($RepoRoot)
    $rootFull = [System.IO.Path]::GetFullPath($ProgramsRoot)
    if (-not $repoFull.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "RuntimeRoot 必须位于允许的程序目录下（当前: $repoFull）。Monorepo 开发态路径允许：D:\Programs\smc-copilot\services\runtime"
    }
}

function Resolve-Python312 {
    if ($PythonPath) {
        if (-not (Test-Path $PythonPath)) {
            throw "PythonPath not found: $PythonPath"
        }
        $out = & $PythonPath --version 2>&1 | Out-String
        if ($out -notmatch "3\.12") {
            throw "PythonPath must be Python 3.12, got: $out"
        }
        Write-Host "Using explicit PythonPath: $PythonPath"
        return $PythonPath
    }
    $candidates = @(
        @{ Cmd = "py"; Args = @("-3.12", "--version") },
        @{ Cmd = "python"; Args = @("--version") }
    )
    foreach ($c in $candidates) {
        try {
            $out = & $c.Cmd @($c.Args) 2>&1 | Out-String
            if ($out -match "3\.12") {
                if ($c.Cmd -eq "py") { return "py -3.12" }
                return "python"
            }
        } catch { }
    }
    throw "Python 3.12 not found. Pass -PythonPath or install Python 3.12."
}

function Ensure-Uv {
    param([string]$ResolvedPython)
    if (Get-Command uv -ErrorAction SilentlyContinue) { return }
    Write-Host "Installing uv via: $ResolvedPython"
    if ($ResolvedPython -match '^py(\s|$)') {
        Invoke-Expression "& $ResolvedPython -m pip install uv"
    } else {
        & $ResolvedPython -m pip install uv
    }
    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
        throw "uv not found after install attempt"
    }
}

Write-Host "== bootstrap-windows =="
Write-Host "Repo: $RepoRoot"

$resolvedPython = Resolve-Python312
Write-Host "Python OK: $resolvedPython"

Ensure-Uv -ResolvedPython $resolvedPython

$venvPython = Join-Path $RepoRoot ".venv\Scripts\python.exe"
if ($Force -and (Test-Path (Join-Path $RepoRoot ".venv"))) {
    Remove-Item -Recurse -Force (Join-Path $RepoRoot ".venv")
}

if (-not (Test-Path $venvPython)) {
    Write-Host "Creating venv under repo (must be under D:\Programs)..."
    if ($PythonPath) {
        & uv venv --python $PythonPath
    } else {
        & uv venv --python 3.12
    }
}

Write-Host "uv sync --extra service..."
& uv sync --extra service

$envFile = Join-Path $RepoRoot ".env"
if ($Force -or -not (Test-Path $envFile)) {
    Write-Host "Writing .env from .env.example..."
    Copy-Item (Join-Path $RepoRoot ".env.example") $envFile -Force
}

if ($PythonPath) {
    $content = Get-Content $envFile -Raw
    $line = "TOOLCHAIN_PYTHON_PATH=$PythonPath"
    if ($content -match "(?m)^TOOLCHAIN_PYTHON_PATH=") {
        $content = [regex]::Replace($content, "(?m)^TOOLCHAIN_PYTHON_PATH=.*$", $line)
        Set-Content -Path $envFile -Value $content -Encoding UTF8 -NoNewline
    } else {
        Add-Content $envFile "`n$line"
    }
    Write-Host "Wrote TOOLCHAIN_PYTHON_PATH to .env"
}

Write-Host "alembic upgrade head..."
& uv run alembic upgrade head

Write-Host "Bootstrap complete. Start with:"
Write-Host "  uv run uvicorn main:app --app-dir src --host 127.0.0.1 --port 8765"
