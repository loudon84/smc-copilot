# Pester 3.4 compatible
Describe "smc-hermes-agent adapter contracts" {
    BeforeAll {
        $script:Product = Join-Path $PSScriptRoot "..\products\smc-hermes-agent"
    }

    It "dispatcher exists" {
        Test-Path (Join-Path $script:Product "scripts\Invoke-SmcHermesAgent.ps1") | Should Be $true
    }

    It "custom.opsiscript allowlists operations" {
        $text = Get-Content (Join-Path $script:Product "CLIENT_DATA\custom.opsiscript") -Raw
        $text | Should Match "status"
        $text | Should Match "unknown custom_operation"
    }

    It "redacts bearer tokens in module" {
        $text = Get-Content (Join-Path $script:Product "scripts\common\SmcOpsi.psm1") -Raw
        $text | Should Match "REDACTED"
        $text | Should Match "bearer"
    }

    It "transaction journal scripts exist" {
        Test-Path (Join-Path $script:Product "scripts\transaction\Start-SmcTransaction.ps1") | Should Be $true
        Test-Path (Join-Path $script:Product "scripts\transaction\Rollback-SmcTransaction.ps1") | Should Be $true
    }

    It "pending is not treated as SUCCEEDED in adapter" {
        $text = Get-Content (Join-Path $script:Product "scripts\Invoke-SmcHermesAgent.ps1") -Raw
        $text | Should Match "USER_CONTEXT_PENDING"
        $text | Should Match "exit 10"
        $text | Should Not Match "LastLoggedOnUserSID"
    }

    It "smoke packaging helper refuses .opsi suffix" {
        $text = Get-Content (Join-Path $script:Product "packaging\makepackage.py") -Raw
        $text | Should Match "smoke.zip"
        $text | Should Match "must not emit .opsi"
    }

    It "uninstall does not delete .hermes user data" {
        $text = Get-Content (Join-Path $script:Product "scripts\install\Uninstall-OpsiManaged.ps1") -Raw
        $text | Should Match "Never delete user Hermes data"
        $text | Should Match "retained"
    }
}
