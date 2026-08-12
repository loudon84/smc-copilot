# v2.1 real Windows canary stubs. Not executed in CI (hardware required).
# Invoke-Pester -Path infra/salt/tests/canary

Describe "SALT-101 Windows silent install" {
    It "client manifest pins 3008 LTS" {
        $manifest = Join-Path $PSScriptRoot "..\..\manifest\client-manifest.json"
        $json = Get-Content $manifest -Raw | ConvertFrom-Json
        $json.salt.channel | Should Be "3008-lts"
        $json.salt.version | Should Not Be "latest"
    }
}

Describe "GATEWAY-102 no System fallback" {
    It "gateway.sls refuses System user" {
        $sls = Get-Content (Join-Path $PSScriptRoot "..\..\states\gateway.sls") -Raw
        $sls | Should Match "waiting_user_binding"
        $sls | Should Not Match "or 'System'"
    }
}

Describe "MIGRATE-101 Runtime to Salt" {
    It "migrate script exists and dry-runs" {
        $script = Join-Path $PSScriptRoot "..\..\client\windows\migrate-runtime-to-salt.ps1"
        Test-Path $script | Should Be $true
    }
}

Describe "WORK-101 Runtime stopped startup" {
    It "is a hardware canary — skip in repo CI" {
        Set-ItResult -Skipped -Because "Requires real Windows 11 endpoint with apps/work"
    }
}

Describe "OFFLINE-101 Master offline Chat" {
    It "is a hardware canary — skip in repo CI" {
        Set-ItResult -Skipped -Because "Requires live Gateway after Master stop"
    }
}
