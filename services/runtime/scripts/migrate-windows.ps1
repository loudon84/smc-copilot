# Run Alembic migrations (Windows)
param(
    [string]$RepoRoot = $PSScriptRoot + "\.."
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path $RepoRoot).Path
Set-Location $RepoRoot

if (-not (Test-Path (Join-Path $RepoRoot "pyproject.toml"))) {
    throw "pyproject.toml not found in $RepoRoot"
}

if (Get-Command uv -ErrorAction SilentlyContinue) {
    Write-Host "alembic upgrade head (uv)..."
    & uv run alembic upgrade head
} else {
    $venvPython = Join-Path $RepoRoot ".venv\Scripts\python.exe"
    if (-not (Test-Path $venvPython)) {
        throw ".venv not found. Run scripts/bootstrap-windows.ps1 first."
    }
    Write-Host "alembic upgrade head (venv python)..."
    & $venvPython -m alembic upgrade head
}

Write-Host "Migration complete."
