# Hermes Runtime provision — end-to-end Windows setup (v1.3.1 FR-13)
# Order: precheck → install Runtime → health → /runtime/install → poll →
#        verify → instance → secret → start → smoke → UserDaemon (last)
param(
    [string]$RepoRoot = $PSScriptRoot + "\..",
    [string]$PythonPath = "",
    [string]$NodePath = "",
    [string]$GitPath = "",
    [string]$VenvDir = "",
    [string]$HermesInstallDir = "D:\Programs\HermesAgent",
    [string]$RuntimeDataDir = "",
    [string]$BaseUrl = "http://127.0.0.1:8765",
    [string]$HermesVersion = "latest",
    [string]$Channel = "stable",
    [string]$ProviderSecretName = "",
    [string]$ProviderSecretValue = "",
    [switch]$AllowExistingRuntime,
    [switch]$SkipUserDaemon,
    [switch]$SkipProgramsCheck
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path $RepoRoot).Path
Set-Location $RepoRoot

Write-Host "== runtime-provision-windows =="

function Wait-Job([string]$JobId, [int]$TimeoutSec = 900) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $job = Invoke-RestMethod -Uri "$BaseUrl/api/v1/runtime/jobs/$JobId" -Method GET
        Write-Host "  job status=$($job.status) phase=$($job.phase)"
        if ($job.status -in @("succeeded", "failed", "cancelled")) {
            return $job
        }
        Start-Sleep -Seconds 2
    }
    throw "Install job timed out: $JobId"
}

# 1. Precheck
& "$PSScriptRoot\runtime-precheck-windows.ps1" `
    -RepoRoot $RepoRoot `
    -PythonPath $PythonPath -NodePath $NodePath -GitPath $GitPath `
    -VenvDir $VenvDir -HermesInstallDir $HermesInstallDir `
    -AllowExistingRuntime:$AllowExistingRuntime

# 2. Install Runtime scaffolding (no UserDaemon yet)
$installArgs = @{
    RepoRoot = $RepoRoot
    PythonPath = $PythonPath
    NodePath = $NodePath
    GitPath = $GitPath
    VenvDir = $VenvDir
    HermesInstallDir = $HermesInstallDir
    RuntimeDataDir = $RuntimeDataDir
}
if ($SkipProgramsCheck) { $installArgs.SkipProgramsCheck = $true }
& "$PSScriptRoot\runtime-install-windows.ps1" @installArgs

# Ensure PythonPath in .env (FR-11)
if ($PythonPath) {
    $envFile = Join-Path $RepoRoot ".env"
    if (Test-Path $envFile) {
        $content = Get-Content $envFile -Raw
        $line = "TOOLCHAIN_PYTHON_PATH=$PythonPath"
        if ($content -match "(?m)^TOOLCHAIN_PYTHON_PATH=") {
            $content = [regex]::Replace($content, "(?m)^TOOLCHAIN_PYTHON_PATH=.*$", $line)
            Set-Content -Path $envFile -Value $content -Encoding UTF8 -NoNewline
        } else {
            Add-Content $envFile "`n$line"
        }
    }
}

# 3. Start Runtime if needed
try {
    $null = Invoke-RestMethod -Uri "$BaseUrl/api/v1/health" -Method GET -TimeoutSec 3
    Write-Host "Runtime already healthy at $BaseUrl"
} catch {
    Write-Host "Starting Runtime Service..."
    $proc = Start-Process -FilePath "uv" -ArgumentList @(
        "run", "uvicorn", "main:app", "--app-dir", "src",
        "--host", "127.0.0.1", "--port", "8765"
    ) -WorkingDirectory $RepoRoot -PassThru -WindowStyle Hidden
    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 1
        try {
            $null = Invoke-RestMethod -Uri "$BaseUrl/api/v1/health" -Method GET -TimeoutSec 2
            $ready = $true
            break
        } catch { }
    }
    if (-not $ready) { throw "Runtime failed to become healthy" }
    Write-Host "Runtime started (pid=$($proc.Id))"
}

# 4. Install Hermes artifact
Write-Host "POST /api/v1/runtime/install ..."
$installBody = @{
    version = $HermesVersion
    channel = $Channel
    createDefaultInstance = $true
}
if ($PythonPath) {
    $installBody.toolchain = @{ pythonPath = $PythonPath }
}
$accept = Invoke-RestMethod -Uri "$BaseUrl/api/v1/runtime/install" -Method POST -Body ($installBody | ConvertTo-Json -Depth 5) -ContentType "application/json"
$job = Wait-Job $accept.jobId
if ($job.status -ne "succeeded") {
    throw "Hermes install failed: $($job.errorCode) $($job.errorMessage)"
}
$result = $job.result
if (-not $result) { $result = $job }
if ($null -eq $result.realExecutableVerified -or $result.realExecutableVerified -ne $true) {
    throw "Install succeeded but realExecutableVerified is not true (stub=$($result.stub))"
}
if ($result.stub -eq $true) {
    throw "Install result reports stub=true; refusing to continue provision"
}
Write-Host "Hermes installed: version=$($result.resolvedVersion) exe=$($result.executablePath)"

# 5. Optional provider secret
if ($ProviderSecretName -and $ProviderSecretValue) {
    Write-Host "Putting secret $ProviderSecretName ..."
    $null = Invoke-RestMethod -Uri "$BaseUrl/api/v1/secrets/default/$ProviderSecretName" `
        -Method PUT -Body (@{ value = $ProviderSecretValue } | ConvertTo-Json) -ContentType "application/json"
}

# 6. Start default instance
$instances = Invoke-RestMethod -Uri "$BaseUrl/api/v1/instances" -Method GET
$default = $instances | Where-Object { $_.name -eq "default" } | Select-Object -First 1
if (-not $default) { throw "Default instance not found after install" }
Write-Host "Starting instance $($default.id) ..."
$null = Invoke-RestMethod -Uri "$BaseUrl/api/v1/instances/$($default.id)/start" -Method POST

# 7. Smoke
& "$PSScriptRoot\runtime-smoke-test-windows.ps1" -BaseUrl $BaseUrl -RequireHermes -RequireGateway

# 8. UserDaemon last (FR-15)
if (-not $SkipUserDaemon) {
    Write-Host "Installing UserDaemon (ONLOGON) after successful smoke..."
    & uv run python -m local_service.windows_user_daemon install
    try {
        schtasks /Run /TN "HermesRuntimeUserDaemon" 2>$null
    } catch {
        Write-Host "WARN: could not immediately run scheduled task"
    }
}

Write-Host "Provision complete."
exit 0
