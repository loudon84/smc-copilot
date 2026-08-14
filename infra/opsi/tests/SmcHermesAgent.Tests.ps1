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

    It "uninstall does not delete .hermes user data" {
        $text = Get-Content (Join-Path $script:Product "scripts\install\Uninstall-OpsiManaged.ps1") -Raw
        $text | Should Match "Never delete user Hermes data"
        $text | Should Match "retained"
    }
}
