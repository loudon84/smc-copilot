# Single-repo Windows bootstrap: venv, deps, .env, migrate
# 约定：RepoRoot 应在 D:\Programs 下（如 D:\Programs\copilot-serve），.venv 随之落在 Programs 内。
param(
    [string]$RepoRoot = $PSScriptRoot + "\..",
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
        throw "RepoRoot 必须位于 $ProgramsRoot 下（当前: $repoFull）。请 clone 到 D:\Programs\copilot-serve"
    }
}

function Test-Python312 {
    $candidates = @(
        @{ Cmd = "py"; Args = @("-3.12", "--version") },
        @{ Cmd = "python"; Args = @("--version") }
    )
    foreach ($c in $candidates) {
        try {
            $out = & $c.Cmd @($c.Args) 2>&1 | Out-String
            if ($out -match "3\.12") { return $c }
        } catch { }
    }
    throw "Python 3.12 not found. 请先手工安装 Python 3.12 到 D:\Programs 并确保 'py -3.12' 或 'python' 可用。"
}

function Ensure-Uv {
    if (Get-Command uv -ErrorAction SilentlyContinue) { return }
    Write-Host "Installing uv..."
    & py -3.12 -m pip install uv
    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
        throw "uv not found after install attempt"
    }
}

Write-Host "== bootstrap-windows =="
Write-Host "Repo: $RepoRoot"

$py = Test-Python312
Write-Host "Python OK: $($py.Cmd) $($py.Args -join ' ')"

Ensure-Uv

$venvPython = Join-Path $RepoRoot ".venv\Scripts\python.exe"
if ($Force -and (Test-Path (Join-Path $RepoRoot ".venv"))) {
    Remove-Item -Recurse -Force (Join-Path $RepoRoot ".venv")
}

if (-not (Test-Path $venvPython)) {
    Write-Host "Creating venv under repo (must be under D:\Programs)..."
    & uv venv --python 3.12
}

Write-Host "uv sync --extra service..."
& uv sync --extra service

$envFile = Join-Path $RepoRoot ".env"
if ($Force -or -not (Test-Path $envFile)) {
    Write-Host "Writing .env from .env.example..."
    Copy-Item (Join-Path $RepoRoot ".env.example") $envFile -Force
}

Write-Host "alembic upgrade head..."
& uv run alembic upgrade head

Write-Host "Bootstrap complete. Start with:"
Write-Host "  uv run uvicorn main:app --app-dir src --host 127.0.0.1 --port 8765"
