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
        $boot = Get-Content (Join-Path $script:Product "scripts\Invoke-SmcHermesAgent.ps1") -Raw
        $boot | Should Match "current.json"
        $boot | Should Not Match "LastLoggedOnUserSID"
        $installed = Get-Content (Join-Path $script:Product "controller\Invoke-SmcEndpointController.ps1") -Raw
        $installed | Should Match "USER_CONTEXT_PENDING"
        $installed | Should Match "exit 10"
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
        $text | Should Match "Remove-SmcManagedTask"
        $text | Should Match "bootstrapTask"
    }

    It "resolves managed CLI from temp root and rejects traversal" {
        Import-Module (Join-Path $script:Product "scripts\common\SmcOpsi.psm1") -Force
        $root = Join-Path $env:TEMP ("smc-opsi-" + [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Force -Path (Join-Path $root "versions\current") | Out-Null
        Set-Content -LiteralPath (Join-Path $root "versions\current\hermes.exe") -Value "fixture" -Encoding ascii
        $cli = Resolve-SmcHermesCli -Root $root -Entrypoint "hermes.exe"
        $cli | Should Match "hermes.exe"
        $threw = $false
        $message = ""
        try {
            Resolve-SmcHermesCli -Root $root -Entrypoint "..\..\Windows\System32\cmd.exe" -ErrorAction Stop
        } catch {
            $threw = $true
            $message = "$_"
        }
        $threw | Should Be $true
        $message | Should Match "escapes managed root"
        Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
    }

    It "forbids clientId=local in user continuation" {
        $init = Get-Content (Join-Path $script:Product "bootstrap\user\Initialize-HermesHome.ps1") -Raw
        $init | Should Match "clientId=local is forbidden"
        $status = Get-Content (Join-Path $script:Product "scripts\health\Get-HermesStatus.ps1") -Raw
        $status | Should Match "clientId=local forbidden"
    }

    It "verifies artifact before Expand-Archive and pins key ids" {
        $text = Get-Content (Join-Path $script:Product "scripts\install\Install-Hermes.ps1") -Raw
        $verify = $text.IndexOf("Assert-SmcArtifactSignature")
        $expand = $text.IndexOf("Expand-Archive")
        ($verify -ge 0 -and $expand -gt $verify) | Should Be $true
        $text | Should Match "untrusted artifact keyId"
        $text | Should Not Match "Get-Command hermes"
    }

    It "registers SID-scoped bootstrap and gateway tasks" {
        $text = Get-Content (Join-Path $script:Product "bootstrap\machine\Register-UserBootstrap.ps1") -Raw
        $text | Should Match "SMC-Hermes-User-Bootstrap-"
        $text | Should Match "SMC-Hermes-Gateway-"
        $text | Should Match "Register-SmcManagedTask"
        $text | Should Match "Start-SmcHermesGateway.ps1"
        $text | Should Match "HermesHome"
        $wrap = Get-Content (Join-Path $script:Product "controller\Start-SmcHermesGateway.ps1") -Raw
        $wrap | Should Match '\$env:HERMES_HOME = \$HermesHome'
        $mod = Get-Content (Join-Path $script:Product "scripts\common\SmcOpsi.psm1") -Raw
        $mod | Should Match "function Register-SmcManagedTask"
        $mod | Should Match "Get-ScheduledTask"
    }

    It "honors SMC_OPSI_ROOT and installs controller after cache delete" {
        Import-Module (Join-Path $script:Product "scripts\common\SmcOpsi.psm1") -Force
        Import-Module (Join-Path $script:Product "controller\SmcController.psm1") -Force
        $root = Join-Path $env:TEMP ("smc-ctrl-" + [guid]::NewGuid().ToString("N"))
        $env:SMC_OPSI_ROOT = $root
        $src = Join-Path $root "cache"
        New-Item -ItemType Directory -Force -Path $src | Out-Null
        Set-Content -LiteralPath (Join-Path $src "Invoke-SmcEndpointController.ps1") -Value "# fixture" -Encoding ascii
        $installed = Install-SmcControllerBundle -Source $src -Revision "1" -Digest ("ab" * 32)
        Remove-Item -LiteralPath $src -Recurse -Force
        Test-Path -LiteralPath (Join-Path $installed "Invoke-SmcEndpointController.ps1") | Should Be $true
        $journal = Start-SmcJournalV2 -RequestId "req_pester01" -DesiredDigest ("aa" * 32) -Operation "setup" -PreviousOwner "salt" -PreviousVersion "0.21.0"
        $journal.previousOwner | Should Be "salt"
        Set-SmcJournalCheckpoint -RequestId "req_pester01" -Phase "runtime_activated"
        $resumed = Resume-SmcJournalV2 -RequestId "req_pester01"
        $resumed.phase | Should Be "recovering"
        Restore-SmcPreviousOwner
        $blocked = Invoke-SmcTwoPhaseUninstall -Residual
        $blocked | Should Be "UNINSTALL_BLOCKED"
        Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item Env:SMC_OPSI_ROOT -ErrorAction SilentlyContinue
    }

    It "resolves CLI from runtime active pointer" {
        Import-Module (Join-Path $script:Product "scripts\common\SmcOpsi.psm1") -Force
        $root = Join-Path $env:TEMP ("smc-slot-" + [guid]::NewGuid().ToString("N"))
        $slot = Join-Path $root "runtime\versions\0.22.0-aabbccdd"
        New-Item -ItemType Directory -Force -Path $slot | Out-Null
        Set-Content -LiteralPath (Join-Path $slot "hermes.exe") -Value "fixture" -Encoding ascii
        $active = Join-Path $root "runtime\active.json"
        @{ active = $slot; entrypoint = "hermes.exe" } | ConvertTo-Json | Set-Content -LiteralPath $active -Encoding ascii
        $cli = Resolve-SmcHermesCli -Root $root -Entrypoint "hermes.exe"
        $cli | Should Match "hermes.exe"
        Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
    }

    It "does not call system python for artifact verify" {
        $mod = Get-Content (Join-Path $script:Product "scripts\common\SmcOpsi.psm1") -Raw
        $mod | Should Not Match "Get-Command python"
        $mod | Should Match "smc-artifact-verify"
        Test-Path (Join-Path $script:Product "controller\smc-artifact-verify.ps1") | Should Be $true
        Test-Path (Join-Path $script:Product "controller\Start-SmcHermesGateway.ps1") | Should Be $true
    }

    It "gateway wrapper injects HERMES_HOME and task uses wrapper" {
        $wrap = Get-Content (Join-Path $script:Product "controller\Start-SmcHermesGateway.ps1") -Raw
        $wrap | Should Match '\$env:HERMES_HOME = \$HermesHome'
        $reg = Get-Content (Join-Path $script:Product "bootstrap\machine\Register-UserBootstrap.ps1") -Raw
        $reg | Should Match "Start-SmcHermesGateway.ps1"
        $reg | Should Not Match "set HERMES_HOME="
    }

    It "thin bootstrap dispatches installed controller after cache delete" {
        Import-Module (Join-Path $script:Product "scripts\common\SmcOpsi.psm1") -Force
        Import-Module (Join-Path $script:Product "controller\SmcController.psm1") -Force
        $root = Join-Path $env:TEMP ("smc-disp-" + [guid]::NewGuid().ToString("N"))
        $env:SMC_OPSI_ROOT = $root
        $src = Join-Path $script:Product "controller"
        $installed = Install-SmcControllerBundle -Source $src -Revision "2"
        $entry = Join-Path $installed "Invoke-SmcEndpointController.ps1"
        Test-Path -LiteralPath $entry | Should Be $true
        Test-Path -LiteralPath (Join-Path $installed "scripts") | Should Be $true
        $boot = Get-Content (Join-Path $script:Product "scripts\Invoke-SmcHermesAgent.ps1") -Raw
        $boot | Should Match "current.json"
        $boot | Should Not Match "install\\Install-Hermes.ps1"
        Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item Env:SMC_OPSI_ROOT -ErrorAction SilentlyContinue
    }

    It "wheelhouse install checks prerequisites and stays offline" {
        $ctrl = Get-Content (Join-Path $script:Product "controller\SmcController.psm1") -Raw
        $ctrl | Should Match "PREREQUISITE_FAILED"
        $ctrl | Should Match "--no-index"
        $ctrl | Should Match "python-wheelhouse"
        $install = Get-Content (Join-Path $script:Product "scripts\install\Install-Hermes.ps1") -Raw
        $install | Should Match "runtimeEntrypoint"
        $install | Should Match "InstallType"
    }
}
