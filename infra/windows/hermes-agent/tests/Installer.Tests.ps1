# Pester 3.4 compatible
Describe "Hermes installer core" {
    BeforeAll {
        $script:Root = Split-Path -Parent $PSScriptRoot
        $script:TestRoot = Join-Path "C:\ProgramData\SMC\InstallerTests" ([guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Force -Path $script:TestRoot | Out-Null
        $env:SMC_HERMES_MANAGED_TEST_ROOT = $script:TestRoot
        $env:SMC_HERMES_INSTALLER_SKIP_GATEWAY = "1"
        Import-Module (Join-Path $script:Root "scripts\SmcHermesManaged.psm1") -Force
        $script:Layout = Get-SmcHermesManagedLayout
        Import-Module (Join-Path $script:Root "installer\InstallerCore.psm1") -Force
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
        (Test-SmcHermesReady -ProgramRoot $script:Layout.ProgramRoot -HermesHome $script:Layout.HermesHome -ExpectedVersion "0.22.0") | Should Be $true
        Test-Path -LiteralPath $script:OwnerPath | Should Be $true
        $owner = Get-Content -LiteralPath $script:OwnerPath -Raw | ConvertFrom-Json
        $owner.hermes | Should Be "opsi"
    }

    It "repairs without deleting preserved home data" {
        $config = Join-Path $script:Layout.HermesHome "config.yaml"
        if (-not (Test-Path -LiteralPath (Split-Path -Parent $config))) {
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $config) | Out-Null
        }
        Set-Content -LiteralPath $config -Value "keep-me" -Encoding ascii
        $code = Repair-SmcHermesAgent `
            -PayloadRoot $script:Payload `
            -InstallDir $script:Layout.ProgramRoot `
            -HermesHome $script:Layout.HermesHome `
            -RepairLevel 4
        $code | Should Be 0
        (Get-Content -LiteralPath $config -Raw).Trim() | Should Be "keep-me"
    }

    It "uninstalls program and owner while preserving home data" {
        $config = Join-Path $script:Layout.HermesHome "config.yaml"
        if (-not (Test-Path -LiteralPath $config)) {
            Set-Content -LiteralPath $config -Value "keep-me" -Encoding ascii
        }
        $code = Uninstall-SmcHermesAgent `
            -InstallDir $script:Layout.ProgramRoot `
            -HermesHome $script:Layout.HermesHome
        $code | Should Be 0
        Test-Path -LiteralPath $script:Layout.ProgramRoot | Should Be $false
        Test-Path -LiteralPath $config | Should Be $true
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
}
