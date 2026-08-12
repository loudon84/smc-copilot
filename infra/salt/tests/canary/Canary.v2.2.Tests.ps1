# v2.2 Windows canary — repo contract assertions + hardware Manual Gate skips.
# Invoke-Pester -Path infra/salt/tests/canary
# Hardware cases require self-hosted runner label: smc-salt-canary

BeforeAll {
    $RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")
    $SaltRoot = Join-Path $RepoRoot "infra\salt"
}

Describe "SALT-201 repo contracts exist" {
    It "Salt Control client module exists" {
        Test-Path (Join-Path $SaltRoot "client\salt_control_client.py") | Should Be $true
    }
    It "device credential module exists" {
        Test-Path (Join-Path $SaltRoot "client\device_credential.py") | Should Be $true
    }
    It "bootstrap journal module exists" {
        Test-Path (Join-Path $SaltRoot "client\journal.py") | Should Be $true
    }
    It "multimaster failover.conf exists" {
        Test-Path (Join-Path $SaltRoot "master\master.d\failover.conf") | Should Be $true
    }
    It "rollout rings.yaml exists" {
        Test-Path (Join-Path $SaltRoot "rollout\rings.yaml") | Should Be $true
    }
    It "Ed25519 sign tool exists" {
        Test-Path (Join-Path $SaltRoot "tools\sign_artifact_manifest.py") | Should Be $true
    }
}

Describe "SALT-102 manifest pins 3008 LTS" {
    It "client manifest pins 3008 LTS" {
        $manifest = Join-Path $SaltRoot "manifest\client-manifest.json"
        if (-not (Test-Path $manifest)) {
            $manifest = Join-Path $SaltRoot "manifest\client-manifest.example.json"
        }
        $json = Get-Content $manifest -Raw | ConvertFrom-Json
        $json.salt.channel | Should Be "3008-lts"
        $json.salt.version | Should Not Be "latest"
    }
}

Describe "BOOT-201 bootstrap.ps1 DryRun contract" {
    It "bootstrap DryRun succeeds without SaltControlUrl" {
        $manifest = Join-Path $SaltRoot "manifest\client-manifest.example.json"
        & (Join-Path $SaltRoot "client\windows\bootstrap.ps1") `
            -Master "salt-a.internal" `
            -MasterFingerprint ("sha256:" + ("aa" * 32)) `
            -EnrollmentToken "canary-token" `
            -BackendUrl "https://backend.example" `
            -ManifestPath $manifest `
            -DryRun
        $LASTEXITCODE | Should Be 0
    }
}

Describe "GATEWAY-102 no System fallback" {
    It "gateway.sls refuses System user" {
        $sls = Get-Content (Join-Path $SaltRoot "states\gateway.sls") -Raw
        $sls | Should Match "waiting_user_binding"
        $sls | Should Not Match "or 'System'"
    }
}

Describe "Case A Fresh Windows 11" {
    It "requires self-hosted smc-salt-canary runner" {
        Set-ItResult -Skipped -Because "requires self-hosted smc-salt-canary runner"
    }
}

Describe "Case B Existing Runtime to Salt" {
    It "requires self-hosted smc-salt-canary runner" {
        Set-ItResult -Skipped -Because "requires self-hosted smc-salt-canary runner"
    }
}

Describe "Case C User A to User B" {
    It "requires self-hosted smc-salt-canary runner" {
        Set-ItResult -Skipped -Because "requires self-hosted smc-salt-canary runner"
    }
}

Describe "Case D Master Backend Offline" {
    It "requires self-hosted smc-salt-canary runner" {
        Set-ItResult -Skipped -Because "requires self-hosted smc-salt-canary runner"
    }
}

Describe "Case E Upgrade Failed Rollback" {
    It "requires self-hosted smc-salt-canary runner" {
        Set-ItResult -Skipped -Because "requires self-hosted smc-salt-canary runner"
    }
}

Describe "Case F Salt to Runtime break-glass" {
    It "requires self-hosted smc-salt-canary runner" {
        Set-ItResult -Skipped -Because "requires self-hosted smc-salt-canary runner"
    }
}
