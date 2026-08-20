#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Get-Command Get-SmcHermesManagedLayout -ErrorAction SilentlyContinue)) {
    $managedModule = Join-Path $PSScriptRoot "SmcHermesManaged.psm1"
    if (-not (Test-Path -LiteralPath $managedModule)) {
        throw "SmcHermesManaged.psm1 missing next to HostOperations"
    }
    Import-Module $managedModule -Force -DisableNameChecking
}

function Get-SmcHostLayout {
    $layout = Get-SmcHermesManagedLayout
    return [pscustomobject]@{
        ProgramRoot   = $layout.ProgramRoot
        HermesHome    = $layout.HermesHome
        WorkspaceRoot = $layout.WorkspaceRoot
        TempRoot      = $layout.TempRoot
        ConfigPath    = $layout.ConfigPath
        LogsDir       = Join-Path $layout.HermesHome "logs"
        SessionsDir   = Join-Path $layout.HermesHome "sessions"
        CliPath       = $layout.CliPath
    }
}

function Invoke-SmcHostOperation {
    param(
        [Parameter(Mandatory = $true)][ValidateSet("config-apply", "collect-logs", "collect-sessions", "update", "repair", "doctor")][string]$Operation,
        [int]$ConfigRevision = 0,
        [int]$SinceHours = 24,
        [int]$MaxBytes = 52428800,
        [string]$SessionId = "",
        [string]$ReleaseVersion = "",
        [int]$RepairLevel = 1
    )
    $hostLayout = Get-SmcHostLayout
    switch ($Operation) {
        "config-apply" {
            if ($ConfigRevision -le 0) { throw "config revision required" }
            $backup = "$($hostLayout.ConfigPath).bak"
            if (Test-Path -LiteralPath $hostLayout.ConfigPath) {
                Copy-Item -LiteralPath $hostLayout.ConfigPath -Destination $backup -Force
            }
            try {
                if (-not (Test-Path -LiteralPath $hostLayout.ConfigPath)) {
                    throw "config missing"
                }
                $null = Set-SmcHermesManagedTerminalConfig -ConfigPath $hostLayout.ConfigPath -WorkspaceRoot $hostLayout.WorkspaceRoot -HermesHome $hostLayout.HermesHome -CliPath $hostLayout.CliPath
                Assert-SmcHermesManagedTerminalConfig -ConfigPath $hostLayout.ConfigPath -WorkspaceRoot $hostLayout.WorkspaceRoot -HermesHome $hostLayout.HermesHome
            } catch {
                if (Test-Path -LiteralPath $backup) {
                    Move-Item -LiteralPath $backup -Destination $hostLayout.ConfigPath -Force
                }
                throw
            }
            return @{ ok = $true; revision = $ConfigRevision }
        }
        "collect-logs" {
            if (-not (Test-Path -LiteralPath $hostLayout.LogsDir)) { return @{ ok = $true; files = 0 } }
            $files = @(Get-ChildItem -LiteralPath $hostLayout.LogsDir -File -ErrorAction SilentlyContinue)
            $total = 0
            if ($files.Count -gt 0) {
                $measured = ($files | Measure-Object -Property Length -Sum).Sum
                if ($null -ne $measured) { $total = [int64]$measured }
            }
            if ($total -gt $MaxBytes) { throw "logs exceed maxBytes" }
            return @{ ok = $true; files = $files.Count; sha256 = "pending-upload" }
        }
        "collect-sessions" {
            if (-not $SessionId) { throw "sessionId required" }
            $path = Join-Path $hostLayout.SessionsDir $SessionId
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
            Initialize-SmcHermesManagedHome -ProgramRoot $hostLayout.ProgramRoot -HermesHome $hostLayout.HermesHome | Out-Null
            if (Get-Command Merge-SmcHermesManagedConfig -ErrorAction SilentlyContinue) {
                $null = Merge-SmcHermesManagedConfig -ProgramRoot $hostLayout.ProgramRoot -HermesHome $hostLayout.HermesHome -CliPath $hostLayout.CliPath
            }
            $null = Set-SmcHermesManagedTerminalConfig -ConfigPath $hostLayout.ConfigPath -WorkspaceRoot $hostLayout.WorkspaceRoot -HermesHome $hostLayout.HermesHome -CliPath $hostLayout.CliPath
            return @{ ok = $true; repairLevel = $RepairLevel; workspaceRoot = $hostLayout.WorkspaceRoot; tempRoot = $hostLayout.TempRoot }
        }
        "doctor" {
            $report = Get-SmcHermesManagedDoctorReport -ProgramRoot $hostLayout.ProgramRoot -HermesHome $hostLayout.HermesHome
            return @{
                ok = [bool]$report.ok
                layout = $report.layout
                checks = $report.checks
            }
        }
        default {
            throw "unsupported operation"
        }
    }
}
