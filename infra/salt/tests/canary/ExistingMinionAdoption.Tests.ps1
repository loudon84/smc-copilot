# Existing minion adoption canary (v2.3) — repo contracts + hardware Manual Gate.
# Invoke-Pester -Path infra/salt/tests/canary/ExistingMinionAdoption.Tests.ps1
# Compatible with Windows built-in Pester 3.4 (BeforeAll must be inside Describe).

Describe "ADOPT-301 repo contracts" {
    BeforeAll {
        $script:RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")
        $script:SaltRoot = Join-Path $script:RepoRoot "infra\salt"
    }
    It "adopt-existing-minion.ps1 exists" {
        Test-Path (Join-Path $script:SaltRoot "client\windows\adopt-existing-minion.ps1") | Should Be $true
    }
    It "minion_identity.py exists" {
        Test-Path (Join-Path $script:SaltRoot "client\minion_identity.py") | Should Be $true
    }
    It "configure-minion DryRun single master has no salt-b.internal" {
        $out = & (Join-Path $script:SaltRoot "client\windows\configure-minion.ps1") `
            -Master "192.168.102.104" `
            -EndpointId "ep_test" `
            -MasterFingerprint ("sha256:" + ("ab" * 32)) `
            -DryRun | ConvertFrom-Json
        $out.ok | Should Be $true
        $out.singleMaster | Should Be $true
        $out.content | Should Not Match "salt-b.internal"
        $out.content | Should Match "master: 192.168.102.104"
    }
    It "configure-minion rejects placeholder MasterB" {
        { & (Join-Path $script:SaltRoot "client\windows\configure-minion.ps1") `
            -Master "192.168.102.104" `
            -EndpointId "ep_test" `
            -MasterFingerprint ("sha256:" + ("ab" * 32)) `
            -MasterB "salt-b.internal" `
            -DryRun } | Should Throw
    }
    It "adopt DryRun lists revoke-after-success semantics without python or system changes" {
        $out = & (Join-Path $script:SaltRoot "client\windows\adopt-existing-minion.ps1") `
            -EndpointId "ep_test" `
            -Master "192.168.102.104" `
            -MasterFingerprint ("sha256:" + ("ab" * 32)) `
            -OldMinionId "ITBJB0676" `
            -DryRun | ConvertFrom-Json
        $out.ok | Should Be $true
        $out.wroteConfig | Should Be $false
        $out.stoppedService | Should Be $false
        $out.calledMaster | Should Be $false
        $out.note | Should Match "Old key remains accepted"
    }
}

Describe "ADOPT-301 live ITBJB0676 to ep_*" {
    It "requires Master operator Manual Gate" {
        # Live accept/ping/highstate/revoke stays operator-only.
        Set-TestInconclusive
    }
}
