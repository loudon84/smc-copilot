# Pester 3.4 compatible
Describe "HostOperations" {
    BeforeAll {
        $script:Module = Join-Path $PSScriptRoot "..\scripts\HostOperations.psm1"
        if (-not (Test-Path -LiteralPath $script:Module)) {
            $ps1 = Join-Path $PSScriptRoot "..\scripts\HostOperations.ps1"
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $script:Module) | Out-Null
            @"
#Requires -Version 5.1
. (Join-Path `$PSScriptRoot 'HostOperations.ps1')
"@ | Set-Content -LiteralPath $script:Module -Encoding utf8
        }
        Import-Module $script:Module -Force
    }

    AfterAll {
        if ($script:TestHome -and (Test-Path -LiteralPath $script:TestHome)) {
            Remove-Item -LiteralPath $script:TestHome -Recurse -Force -ErrorAction SilentlyContinue
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
}
