#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:HermesHome = "C:\ProgramData\SMC\Hermes"
$script:ProgramRoot = "D:\Programs\SMC\Hermes"
$script:ConfigPath = Join-Path $script:HermesHome "config.yaml"
$script:LogsDir = Join-Path $script:HermesHome "logs"
$script:SessionsDir = Join-Path $script:HermesHome "sessions"

function Invoke-SmcHostOperation {
    param(
        [Parameter(Mandatory = $true)][ValidateSet("config-apply", "collect-logs", "collect-sessions", "update", "repair")][string]$Operation,
        [int]$ConfigRevision = 0,
        [int]$SinceHours = 24,
        [int]$MaxBytes = 52428800,
        [string]$SessionId = "",
        [string]$ReleaseVersion = "",
        [int]$RepairLevel = 1
    )
    switch ($Operation) {
        "config-apply" {
            if ($ConfigRevision -le 0) { throw "config revision required" }
            $backup = "$script:ConfigPath.bak"
            if (Test-Path -LiteralPath $script:ConfigPath) {
                Copy-Item -LiteralPath $script:ConfigPath -Destination $backup -Force
            }
            try {
                if (-not (Test-Path -LiteralPath $script:ConfigPath)) {
                    throw "config missing"
                }
                & (Join-Path $script:ProgramRoot "bin\hermes.exe") config check | Out-Null
            } catch {
                if (Test-Path -LiteralPath $backup) {
                    Move-Item -LiteralPath $backup -Destination $script:ConfigPath -Force
                }
                throw
            }
            return @{ ok = $true; revision = $ConfigRevision }
        }
        "collect-logs" {
            if (-not (Test-Path -LiteralPath $script:LogsDir)) { return @{ ok = $true; files = 0 } }
            $files = Get-ChildItem -LiteralPath $script:LogsDir -File -ErrorAction SilentlyContinue
            $total = ($files | Measure-Object -Property Length -Sum).Sum
            if ($total -gt $MaxBytes) { throw "logs exceed maxBytes" }
            return @{ ok = $true; files = @($files).Count; sha256 = "pending-upload" }
        }
        "collect-sessions" {
            if (-not $SessionId) { throw "sessionId required" }
            $path = Join-Path $script:SessionsDir $SessionId
            if (-not (Test-Path -LiteralPath $path)) { throw "session not found" }
            return @{ ok = $true; sessionId = $SessionId }
        }
        "update" {
            if (-not $ReleaseVersion -or $ReleaseVersion -match '^(latest|main|master)$') {
                throw "exact releaseVersion required"
            }
            return @{ ok = $true; releaseVersion = $ReleaseVersion }
        }
        "repair" {
            if ($RepairLevel -lt 1 -or $RepairLevel -gt 5) { throw "repair level out of range" }
            return @{ ok = $true; repairLevel = $RepairLevel }
        }
        default {
            throw "unsupported operation"
        }
    }
}

Export-ModuleMember -Function Invoke-SmcHostOperation
