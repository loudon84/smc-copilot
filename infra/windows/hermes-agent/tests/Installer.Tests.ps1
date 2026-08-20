# Pester 3.4 compatible
Describe "Hermes installer core" {
    BeforeAll {
        $script:Root = Split-Path -Parent $PSScriptRoot
        $script:TestRoot = Join-Path "C:\ProgramData\SMC\InstallerTests" ([guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Force -Path $script:TestRoot | Out-Null
        $env:SMC_HERMES_MANAGED_TEST_ROOT = $script:TestRoot
        $env:SMC_HERMES_INSTALLER_SKIP_GATEWAY = "1"
        Import-Module (Join-Path $script:Root "scripts\SmcHermesManaged.psm1") -Force -DisableNameChecking
        $script:Layout = Get-SmcHermesManagedLayout
        Import-Module (Join-Path $script:Root "installer\InstallerCore.psm1") -Force -DisableNameChecking
        # Re-import Managed into the test session after InstallerCore nested import.
        Import-Module (Join-Path $script:Root "scripts\SmcHermesManaged.psm1") -Force -DisableNameChecking
        $script:Layout = Get-SmcHermesManagedLayout
        $fixture = Join-Path $PSScriptRoot "fixtures\release-v2-smoke"
        if (-not (Test-Path -LiteralPath (Join-Path $fixture "hermes-windows-amd64.zip"))) {
            $repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $script:Root))
            $generator = Join-Path $repoRoot "tools\release\hermes\build_installer_smoke_fixture.py"
            & python $generator --dest $fixture | Out-Null
        }
        $script:Payload = Join-Path $env:TEMP ("smc-hermes-payload-" + [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Force -Path $script:Payload | Out-Null
        Copy-Item -Path (Join-Path $fixture "hermes-windows-amd64.zip") -Destination (Join-Path $script:Payload "hermes-windows-amd64.zip") -Force
        Copy-Item -Path (Join-Path $fixture "release-manifest.json") -Destination (Join-Path $script:Payload "release-manifest.json") -Force
        Copy-Item -Path (Join-Path $fixture "release-manifest.sig") -Destination (Join-Path $script:Payload "release-manifest.sig") -Force
        $script:OwnerPath = Join-Path (Split-Path -Parent $script:Layout.HermesHome) "control-owner.json"
    }

    AfterAll {
        Remove-Item Env:SMC_HERMES_MANAGED_TEST_ROOT -ErrorAction SilentlyContinue
        Remove-Item Env:SMC_HERMES_INSTALLER_SKIP_GATEWAY -ErrorAction SilentlyContinue
        if (Test-Path -LiteralPath $script:TestRoot) {
            Remove-Item -LiteralPath $script:TestRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path -LiteralPath $script:Payload) {
            Remove-Item -LiteralPath $script:Payload -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path -LiteralPath $script:OwnerPath) {
            Remove-Item -LiteralPath $script:OwnerPath -Force -ErrorAction SilentlyContinue
        }
    }

    It "parses PRD slash arguments" {
        $parsed = ConvertTo-SmcInstallerArgs -ArgumentList @(
            "/install", "/silent",
            "/install-dir", $script:Layout.ProgramRoot,
            "/hermes-home", $script:Layout.HermesHome,
            "/payload-root", $script:Payload
        )
        $parsed.Operation | Should Be "install"
        $parsed.Silent | Should Be $true
        $parsed.InstallDir | Should Be $script:Layout.ProgramRoot
        $parsed.HermesHome | Should Be $script:Layout.HermesHome
        $parsed.PayloadRoot | Should Be $script:Payload
    }

    It "validates release v2 payload integrity" {
        $manifest = Test-SmcHermesReleaseFiles -PayloadRoot $script:Payload
        $manifest.schema | Should Be "smc.hermes.release.v2"
        $manifest.releaseVersion | Should Be "0.22.0-smc.1"
    }

    It "installs program tree and commits control-owner when READY" {
        if (Test-Path -LiteralPath $script:Layout.ProgramRoot) {
            Remove-Item -LiteralPath $script:Layout.ProgramRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
        $code = Install-SmcHermesAgent `
            -PayloadRoot $script:Payload `
            -InstallDir $script:Layout.ProgramRoot `
            -HermesHome $script:Layout.HermesHome `
            -Silent
        $code | Should Be 0
        Test-Path -LiteralPath (Join-Path $script:Layout.ProgramRoot "bin\hermes.exe") | Should Be $true
        Test-Path -LiteralPath $script:Layout.WorkspaceRoot | Should Be $true
        Test-Path -LiteralPath $script:Layout.TempRoot | Should Be $true
        Assert-SmcHermesManagedTerminalConfig -ConfigPath $script:Layout.ConfigPath -WorkspaceRoot $script:Layout.WorkspaceRoot -HermesHome $script:Layout.HermesHome
        (Test-SmcHermesReady -ProgramRoot $script:Layout.ProgramRoot -HermesHome $script:Layout.HermesHome -ExpectedVersion "0.22.0") | Should Be $true
        Test-Path -LiteralPath $script:OwnerPath | Should Be $true
        $owner = Get-Content -LiteralPath $script:OwnerPath -Raw | ConvertFrom-Json
        $owner.hermes | Should Be "opsi"
    }

    It "gateway task spec uses WorkspaceRoot and process TEMP/TMP only" {
        $spec = Get-SmcHermesGatewayTaskSpec -ProgramRoot $script:Layout.ProgramRoot -HermesHome $script:Layout.HermesHome
        $spec.WorkingDirectory | Should Be $script:Layout.WorkspaceRoot
        $spec.LauncherScript | Should Match "TERMINAL_CWD"
        $spec.LauncherScript | Should Match ([regex]::Escape("`$env:TEMP = '$($script:Layout.TempRoot)'"))
        $spec.LauncherScript | Should Match ([regex]::Escape("`$env:TMP = '$($script:Layout.TempRoot)'"))
        $spec.LauncherScript | Should Match "Set-Location -LiteralPath"
        $spec.LauncherScript | Should Match "managed_runtime_context"
        $core = Get-Content -LiteralPath (Join-Path $script:Root "installer\InstallerCore.psm1") -Raw
        $managed = Get-Content -LiteralPath (Join-Path $script:Root "scripts\SmcHermesManaged.psm1") -Raw
        $core | Should Not Match 'SetEnvironmentVariable\("TEMP"'
        $core | Should Not Match 'SetEnvironmentVariable\("TMP"'
        $managed | Should Not Match 'SetEnvironmentVariable\("TEMP"'
        $managed | Should Not Match 'SetEnvironmentVariable\("HOME"'
        $managed | Should Not Match 'SetEnvironmentVariable\("USERPROFILE"'
    }

    It "repairs without deleting preserved home data" {
        $config = Join-Path $script:Layout.HermesHome "config.yaml"
        if (-not (Test-Path -LiteralPath (Split-Path -Parent $config))) {
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $config) | Out-Null
        }
        Set-Content -LiteralPath $config -Value "models:`n  default: keep-me`n" -Encoding ascii
        $marker = Join-Path $script:Layout.WorkspaceRoot "user-file.txt"
        New-Item -ItemType Directory -Force -Path $script:Layout.WorkspaceRoot | Out-Null
        Set-Content -LiteralPath $marker -Value "preserve-me" -Encoding ascii
        if (Test-Path -LiteralPath $script:Layout.TempRoot) {
            Remove-Item -LiteralPath $script:Layout.TempRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
        $code = Repair-SmcHermesAgent `
            -PayloadRoot $script:Payload `
            -InstallDir $script:Layout.ProgramRoot `
            -HermesHome $script:Layout.HermesHome `
            -RepairLevel 4
        $code | Should Be 0
        (Get-Content -LiteralPath $config -Raw) | Should Match "keep-me"
        Assert-SmcHermesManagedTerminalConfig -ConfigPath $config -WorkspaceRoot $script:Layout.WorkspaceRoot -HermesHome $script:Layout.HermesHome
        Test-Path -LiteralPath $marker | Should Be $true
        Test-Path -LiteralPath $script:Layout.TempRoot | Should Be $true
    }

    It "uninstalls program and owner while preserving workspace data" {
        $config = Join-Path $script:Layout.HermesHome "config.yaml"
        if (-not (Test-Path -LiteralPath $config)) {
            Set-Content -LiteralPath $config -Value "models:`n  default: keep-me`n" -Encoding ascii
        }
        $marker = Join-Path $script:Layout.WorkspaceRoot "user-file.txt"
        New-Item -ItemType Directory -Force -Path $script:Layout.WorkspaceRoot | Out-Null
        Set-Content -LiteralPath $marker -Value "preserve-me" -Encoding ascii
        $staleTemp = Join-Path $script:Layout.TempRoot "stale.tmp"
        New-Item -ItemType Directory -Force -Path $script:Layout.TempRoot | Out-Null
        Set-Content -LiteralPath $staleTemp -Value "temp" -Encoding ascii
        $code = Uninstall-SmcHermesAgent `
            -InstallDir $script:Layout.ProgramRoot `
            -HermesHome $script:Layout.HermesHome
        $code | Should Be 0
        Test-Path -LiteralPath $script:Layout.ProgramRoot | Should Be $false
        Test-Path -LiteralPath $config | Should Be $true
        Test-Path -LiteralPath $marker | Should Be $true
        Test-Path -LiteralPath $staleTemp | Should Be $false
        Test-Path -LiteralPath $script:OwnerPath | Should Be $false
    }

    It "supports lifecycle entrypoint" {
        Install-SmcHermesAgent `
            -PayloadRoot $script:Payload `
            -InstallDir $script:Layout.ProgramRoot `
            -HermesHome $script:Layout.HermesHome | Out-Null
        $code = Invoke-SmcHermesLifecycle -ArgumentList @(
            "/uninstall",
            "/install-dir", $script:Layout.ProgramRoot,
            "/hermes-home", $script:Layout.HermesHome
        )
        $code | Should Be 0
    }

    It "uses fixed WindowsPowerShell path and rejects managed/.NET installer hosts" {
        $product = Get-Content -LiteralPath (Join-Path $script:Root "installer\Product.wxs") -Raw
        $bundle = Get-Content -LiteralPath (Join-Path $script:Root "installer\Bundle.wxs") -Raw
        $build = Get-Content -LiteralPath (Join-Path $script:Root "installer\build.ps1") -Raw
        $core = Get-Content -LiteralPath (Join-Path $script:Root "installer\InstallerCore.psm1") -Raw
        $product | Should Match 'System32\\WindowsPowerShell\\v1\.0\\powershell\.exe'
        $product | Should Not Match 'pwsh\.exe'
        $bundle | Should Match 'MsiPackage'
        $bundle | Should Not Match 'SmcHermesInstallerHost'
        $bundle | Should Not Match 'ManagedBootstrapperApplicationHost'
        $build | Should Not Match 'Compress-Archive'
        $build | Should Not Match 'Move-Item.*\.zip.*\.exe'
        $core | Should Not Match 'python \$verifier'
        $core | Should Not Match 'verify_release_v2\.py'
        $bootstrap = Get-Content -LiteralPath (Join-Path $script:Root "installer\bootstrap.ps1") -Raw
        $bootstrap | Should Match 'WindowsPowerShell\\v1\.0'
        $bootstrap | Should Not Match '\bpython\b'
        $bootstrap | Should Not Match 'pwsh'
    }

    It "rejects tampered payload digests before program write" {
        $tampered = Join-Path $env:TEMP ("smc-hermes-tamper-" + [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Force -Path $tampered | Out-Null
        try {
            Copy-Item -Path (Join-Path $script:Payload "*") -Destination $tampered -Force
            $archive = Join-Path $tampered "hermes-windows-amd64.zip"
            Add-Content -LiteralPath $archive -Value "tamper" -Encoding ascii
            { Test-SmcHermesReleaseFiles -PayloadRoot $tampered } | Should Throw
            Test-Path -LiteralPath (Join-Path $script:Layout.ProgramRoot "bin\hermes.exe") | Should Be $false
        } finally {
            Remove-Item -LiteralPath $tampered -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    It "production sources do not default Hermes roots to USERPROFILE or %TEMP%" {
        $files = @(
            (Join-Path $script:Root "scripts\SmcHermesManaged.psm1"),
            (Join-Path $script:Root "scripts\HostOperations.ps1"),
            (Join-Path $script:Root "installer\InstallerCore.psm1")
        )
        foreach ($path in $files) {
            $text = Get-Content -LiteralPath $path -Raw
            $text | Should Not Match 'HermesHome\s*=\s*\$env:USERPROFILE'
            $text | Should Not Match 'WorkspaceRoot\s*=\s*\$env:TEMP'
            $text | Should Not Match 'TempRoot\s*=\s*\$env:TEMP'
            $text | Should Not Match 'os\.homedir\(\)'
            $text | Should Not Match 'Join-Path \$env:LOCALAPPDATA .*Hermes'
        }
    }

    It "builds native PE with embedded MSI when WiX is available" {
        $wix = Get-Command wix -ErrorAction SilentlyContinue
        if (-not $wix) {
            Write-Host "SKIP: wix.exe not on PATH"
            return
        }
        $out = Join-Path $env:TEMP ("smc-hermes-wix-" + [guid]::NewGuid().ToString("N"))
        try {
            $buildOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $script:Root "installer\build.ps1") `
                -ReleaseVersion "0.22.0-smc.1" `
                -OutputDir $out `
                -Smoke 2>&1 | Out-String
            if ($buildOutput -match 'WIX7015|Open Source Maintenance Fee') {
                Write-Host "SKIP: WiX Toolset EULA not accepted on this machine"
                return
            }
            $exe = ($buildOutput -split "`r?`n" | Where-Object { $_ -like "*smc-hermes-agent_*_windows-amd64.exe" } | Select-Object -Last 1)
            if (-not $exe) { $exe = Join-Path $out "smc-hermes-agent_0.22.0-smc.1_windows-amd64.exe" }
            Test-Path -LiteralPath $exe | Should Be $true
            $msi = Join-Path $out "smc-hermes-agent_0.22.0-smc.1_windows-amd64.msi"
            Test-Path -LiteralPath $msi | Should Be $true
            $fs = [System.IO.File]::OpenRead($exe)
            try {
                $b0 = $fs.ReadByte(); $b1 = $fs.ReadByte()
                ($b0 -eq 0x4D -and $b1 -eq 0x5A) | Should Be $true
            } finally { $fs.Dispose() }
            $ms = [System.IO.File]::OpenRead($msi)
            try {
                $m0 = $ms.ReadByte(); $m1 = $ms.ReadByte()
                ($m0 -eq 0xD0 -and $m1 -eq 0xCF) | Should Be $true
            } finally { $ms.Dispose() }
            ((Get-Item -LiteralPath $exe).Length -gt (Get-Item -LiteralPath $msi).Length) | Should Be $true
            Test-Path -LiteralPath (Join-Path $out "verify_release_v2.py") | Should Be $false
            $product = Get-Content -LiteralPath (Join-Path $script:Root "installer\Product.wxs") -Raw
            $product | Should Match 'WindowsPowerShell\\v1\.0\\powershell\.exe'
        } finally {
            if (Test-Path -LiteralPath $out) {
                Remove-Item -LiteralPath $out -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }
}
