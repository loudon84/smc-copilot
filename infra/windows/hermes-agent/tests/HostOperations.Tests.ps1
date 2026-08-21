# Pester 3.4 compatible
Describe "HostOperations" {
    BeforeAll {
        $script:TestRoot = Join-Path "C:\ProgramData\SMC\ManagedTests" ("hostops-" + [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Force -Path $script:TestRoot | Out-Null
        $env:SMC_HERMES_MANAGED_TEST_ROOT = $script:TestRoot
        $env:SMC_HERMES_INSTALLER_SKIP_GATEWAY = "1"
        $env:SMC_HERMES_INSTALLER_SKIP_NATIVE_CONFIG = "1"
        $managed = Join-Path $PSScriptRoot "..\scripts\SmcHermesManaged.psm1"
        $script:Module = Join-Path $PSScriptRoot "..\scripts\HostOperations.psm1"
        Import-Module $managed -Force -DisableNameChecking
        # Dot-source operations after Managed is visible in this scope.
        . (Join-Path $PSScriptRoot "..\scripts\HostOperations.ps1")
        $script:Layout = Get-SmcHermesManagedLayout
        New-Item -ItemType Directory -Force -Path $script:Layout.HermesHome | Out-Null
        New-Item -ItemType Directory -Force -Path (Join-Path $script:Layout.HermesHome "logs") | Out-Null
    }

    AfterAll {
        Remove-Item Env:SMC_HERMES_MANAGED_TEST_ROOT -ErrorAction SilentlyContinue
        Remove-Item Env:SMC_HERMES_INSTALLER_SKIP_GATEWAY -ErrorAction SilentlyContinue
        Remove-Item Env:SMC_HERMES_INSTALLER_SKIP_NATIVE_CONFIG -ErrorAction SilentlyContinue
        Remove-Item Env:SMC_HERMES_MANAGED_APPLY_PYTHON -ErrorAction SilentlyContinue
        if ($script:TestRoot -and (Test-Path -LiteralPath $script:TestRoot)) {
            Remove-Item -LiteralPath $script:TestRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    It "rejects latest release alias" {
        $threw = $false
        try {
            Invoke-SmcHostOperation -Operation update -ReleaseVersion "latest"
        } catch {
            $threw = $true
        }
        $threw | Should Be $true
    }

    It "collects logs within maxBytes" {
        $result = Invoke-SmcHostOperation -Operation collect-logs -MaxBytes 1048576
        $result.ok | Should Be $true
    }

    It "requires sessionId for collect-sessions" {
        $threw = $false
        try {
            Invoke-SmcHostOperation -Operation collect-sessions -SessionId ""
        } catch {
            $threw = $true
        }
        $threw | Should Be $true
    }

    It "uses managed layout as single path SOT" {
        $hostLayout = Get-SmcHostLayout
        $hostLayout.HermesHome | Should Be $script:Layout.HermesHome
        $hostLayout.ProgramRoot | Should Be $script:Layout.ProgramRoot
        $hostLayout.WorkspaceRoot | Should Be $script:Layout.WorkspaceRoot
        $hostLayout.TempRoot | Should Be $script:Layout.TempRoot
        $source = Get-Content -LiteralPath (Join-Path $PSScriptRoot "..\scripts\HostOperations.ps1") -Raw
        $source | Should Not Match '\$script:HermesHome\s*=\s*"C:\\ProgramData\\SMC\\Hermes"'
        $source | Should Not Match '\$script:ProgramRoot\s*=\s*"D:\\Programs\\SMC\\Hermes"'
    }

    It "doctor reports managed runtime layout checks" {
        Set-Content -LiteralPath $script:Layout.ConfigPath -Value "models:`n  default: x`n" -Encoding utf8
        Set-SmcHermesManagedTerminalConfig | Out-Null
        New-Item -ItemType Directory -Force -Path $script:Layout.WorkspaceRoot | Out-Null
        New-Item -ItemType Directory -Force -Path $script:Layout.TempRoot | Out-Null
        $report = Invoke-SmcHostOperation -Operation doctor
        $report.ok | Should Be $true
        ($report.checks | Where-Object { $_.name -eq "Workspace Root" }).status | Should Be "PASS"
        ($report.checks | Where-Object { $_.name -eq "Temp Root" }).status | Should Be "PASS"
        ($report.checks | Where-Object { $_.name -eq "terminal.cwd" }).status | Should Be "PASS"
        $report.layout.workspaceRoot | Should Be $script:Layout.WorkspaceRoot
    }
}
