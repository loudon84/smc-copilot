# Existing minion adoption canary (v2.3) — repo contracts + hardware Manual Gate.
# Invoke-Pester -Path infra/salt/tests/canary/ExistingMinionAdoption.Tests.ps1

BeforeAll {
    $RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")
    $SaltRoot = Join-Path $RepoRoot "infra\salt"
}

Describe "ADOPT-301 repo contracts" {
    It "adopt-existing-minion.ps1 exists" {
        Test-Path (Join-Path $SaltRoot "client\windows\adopt-existing-minion.ps1") | Should Be $true
    }
    It "minion_identity.py exists" {
        Test-Path (Join-Path $SaltRoot "client\minion_identity.py") | Should Be $true
    }
    It "configure-minion DryRun single master has no salt-b.internal" {
        $out = & (Join-Path $SaltRoot "client\windows\configure-minion.ps1") `
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
        { & (Join-Path $SaltRoot "client\windows\configure-minion.ps1") `
            -Master "192.168.102.104" `
            -EndpointId "ep_test" `
            -MasterFingerprint ("sha256:" + ("ab" * 32)) `
            -MasterB "salt-b.internal" `
            -DryRun } | Should Throw
    }
    It "adopt DryRun lists revoke-after-success semantics" {
        $out = & (Join-Path $SaltRoot "client\windows\adopt-existing-minion.ps1") `
            -EndpointId "ep_test" `
            -Master "192.168.102.104" `
            -MasterFingerprint ("sha256:" + ("ab" * 32)) `
            -OldMinionId "ITBJB0676" `
            -DryRun | ConvertFrom-Json
        $out.ok | Should Be $true
        $out.note | Should Match "Old key remains accepted"
    }
}

Describe "ADOPT-301 live ITBJB0676 to ep_*" {
    It "requires Master operator Manual Gate" {
        Set-ItResult -Skipped -Because "Manual Gate: Master accept/ping/highstate/revoke on 192.168.102.104"
    }
}
