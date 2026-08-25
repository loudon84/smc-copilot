# OPSI PRD v2.2 — Hermes Windows Installer & Release Packaging Implementation Plan

## Approved PRD

[PRD-OPSI-v2.2.md](docs/opsi/PRD-OPSI-v2.2.md) (`OPSI-PRD-v2.2`, status `APPROVED`).

## Scope

Implement the approved Hermes Windows installer and release-packaging closure: code-scoped `smc-managed` identity, `HERMES_INSTALL_ROOT`, an installer-owned Machine PATH token, release-policy verification, and signed-artifact certification procedures.

Out of scope: Salt, Runtime, all API contracts, OPSI endpoint-control behavior, UI/Burn bootstrapper work, interactive installer UX, and a second PATH writer or migration adapter.

## Immediate Read

- `docs/opsi/PRD-OPSI-v2.2.md`
- `docs/adr/ADR-031-opsi-parallel-endpoint-control-plane.md`
- `infra/windows/hermes-agent/installer/Product.wxs`
- `infra/windows/hermes-agent/installer/InstallerCore.psm1`
- `infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1`
- `tools/release/hermes/windows_runtime.py`
- `tools/release/hermes/build_runtime.py`
- `tools/release/hermes/path_policy_gate.py`
- `tools/release/client/build_client_release.py`
- `tools/release/client/verify_client_release.py`
- `E:/smc-build/source/hermes-agent/AGENTS.md`
- `E:/smc-build/source/hermes-agent/hermes_cli/_startup_fast.py`
- `E:/smc-build/source/hermes-agent/hermes_cli/config.py`

## Triggered Read

- Before editing WiX sequencing: `infra/windows/hermes-agent/installer/build.ps1` and the exact WiX v4 Environment element documentation already used by the build toolchain.
- Before editing lifecycle behavior: direct callers of `Get-SmcEnvironmentPathSnapshot`, `Assert-SmcEnvironmentPathUnchanged`, `Set-SmcHermesEnvironment`, and `Get-SmcHermesGatewayTaskSpec` in `InstallerCore.psm1` and `SmcHermesManaged.psm1`.
- Before changing release schema/gates: `tools/release/hermes/verify_runtime.py`, `tools/release/client/verify_client_release.py`, `tools/release/hermes/release_v2.py`, and their direct tests.
- Before changing Hermes install-method behavior: `tests/hermes_cli/test_startup_fast_guards.py` and `tests/hermes_cli/test_pip_install_detection.py` in `E:/smc-build/source/hermes-agent`.
- Before real certification: the generated MSI/WiX logs, release manifest/signature, and the target Windows 10/11 lab hosts; do not scan archived builds or runtime data.

## Change Matrix

| File / Symbol | Action | Existing Owner | Target State | PRD Capability | New File? |
| --- | --- | --- | --- | --- | --- |
| `E:/smc-build/source/hermes-agent/hermes_cli/_startup_fast.py#read_install_method`, `#print_fast_version_info` | MODIFY | Hermes fast startup | Read the code-scoped install stamp through the same authoritative contract and show `HERMES_INSTALL_ROOT` when present, otherwise `project_root_str()`; retain global project-root semantics. | FR-215-2, FR-215-3 | no |
| `E:/smc-build/source/hermes-agent/hermes_cli/config.py#detect_install_method` | MODIFY | Hermes configuration | Accept `smc-managed` only as a code-scoped method and retain legacy fallback rules without using `HERMES_MANAGED` as an SMC display marker. | FR-215-4, FR-215-5 | no |
| `E:/smc-build/source/hermes-agent/tests/hermes_cli/test_startup_fast_guards.py`, `test_pip_install_detection.py` | MODIFY | Hermes pytest coverage | Exercise code-scoped `smc-managed`, install-root display/fallback, and precedence over a conflicting home-scoped marker. | AC-215-2, AC-215-3 | no |
| `tools/release/hermes/windows_runtime.py#build_windows_runtime` | MODIFY | Windows runtime assembly | After wheel extraction, stamp the actual installed `hermes_cli` code root with `.install_method` containing `smc-managed\n`, then validate the path and bytes before packaging. | FR-215-4, AC-215-2 | no |
| `tools/release/hermes/build_runtime.py#write_runtime_build`, `tools/release/hermes/verify_runtime.py#verify_bundle_tree` | MODIFY | Runtime metadata and verifier | Emit and require `environment.path = { policy: installer-managed, owner: windows-installer, entries: [D:\\Programs\\SMC\\Hermes\\bin] }`; preserve release-v2 manifest inventory as the sole runtime-tree inventory owner. | FR-215-15, FR-215-20 | no |
| `tools/release/hermes/path_policy_gate.py` | MODIFY | Release static policy gate | Replace the global WiX PATH ban with a narrow allowlist for exactly the per-machine Windows Installer component/value/scope; continue rejecting every PowerShell/runtime/direct registry/setx/User PATH writer and unrelated WiX PATH mutation. | FR-215-14, FR-215-16, FR-215-20 | no |
| `tools/release/tests/test_hermes_builder.py`, `tools/release/tests/test_path_policy_gate.py` | MODIFY | Release pytest coverage | Assert the code-scoped stamp, metadata schema, exact accepted WiX component, and rejection of all malformed or alternate persistent PATH writers. | AC-215-2, AC-215-10, AC-215-12 | no |
| `infra/windows/hermes-agent/installer/Product.wxs` | MODIFY | WiX MSI installer | Add the sole persistent Machine PATH Environment component for `[ProgramFiles64Folder]`-independent fixed `D:\\Programs\\SMC\\Hermes\\bin` semantics; declare deterministic adopt/converge/remove behavior for case-insensitive single-trailing-slash canonical tokens across install, major upgrade, rollback, and uninstall. Keep the MSI silent and UI-free. | FR-215-13 through FR-215-19, AC-215-4 through AC-215-10 | no |
| `infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1#Set-SmcHermesEnvironment`, `#Remove-SmcHermesEnvironment`, `#Initialize-SmcHermesManagedHome` | MODIFY | Managed-home environment lifecycle | Set/remove and snapshot/rollback Machine and process `HERMES_INSTALL_ROOT = D:\\Programs\\SMC\\Hermes` alongside existing Hermes variables; retain the internal PowerShell prohibition on Machine/User PATH writes. | FR-215-1, FR-215-7, FR-215-12 | no |
| `infra/windows/hermes-agent/installer/InstallerCore.psm1#Get-SmcHermesGatewayTaskSpec`, `#Set-SmcHermesGatewayTask`, `#Get-SmcEnvironmentPathSnapshot`, `#Assert-SmcEnvironmentPathUnchanged` | MODIFY | Installer lifecycle and gateway task | Propagate `HERMES_INSTALL_ROOT` into launcher/process/readiness context; preserve config, secret, workspace, data-home and inner lifecycle PATH snapshot contracts while no longer treating the MSI outer Environment-table action as an internal PowerShell write. | FR-215-6, FR-215-8, FR-215-9, FR-215-12, FR-215-21 | no |
| `infra/windows/hermes-agent/tests/SmcHermesManaged.Tests.ps1`, `infra/windows/hermes-agent/tests/Installer.Tests.ps1` | MODIFY | Installer Pester coverage | Verify new env-variable lifecycle and gateway context, retain User PATH immutability and PowerShell no-writer assertions, and add fixture-level canonical-token lifecycle expectations for MSI handoff. | AC-215-1, AC-215-4 through AC-215-10, AC-215-12 | no |
| `tools/release/client/verify_client_release.py#verify_client_release`, `tools/release/tests/test_client_release.py` | MODIFY | Client release verification | Require the installer-managed runtime policy and signed MSI/EXE evidence in release verification while preserving fail-closed, non-live behavior for test keys/unsigned artifacts. | FR-215-20, FR-215-24, AC-215-13 | no |
| `scripts/build-client-release.ps1` | MODIFY | PowerShell release wrapper | Add `hermes-installer` to the wrapper stage validation so it exactly exposes Python `STAGES` without becoming a second stage authority. | FR-215-22 | no |

## Implementation Decisions

- Treat `D:\\Programs\\SMC\\Hermes` and `C:\\ProgramData\\SMC\\Hermes` as fixed contracts. Do not derive the PATH token from an alternate install directory.
- Define canonical PATH equality only as case-insensitive equality after stripping one optional trailing backslash from the fixed bin token. Do not expand variables, resolve short paths, trim arbitrary tokens, or rewrite unrelated malformed values.
- The WiX Environment-table component is the only durable Machine PATH owner. WiX handles legacy-token adoption and v2.2 removal; PowerShell only verifies its own non-PATH lifecycle boundary.
- Keep `HERMES_MANAGED` reserved for upstream managed/Nix semantics. The SMC identity is `.install_method` at the installed code root and `HERMES_INSTALL_ROOT` only for the display/context contract.
- Do not add a parallel release inventory or a broad migration script. The runtime tree remains inventoried by `release_v2.py`, and the bounded v2.2 compatibility period ends at v2.2 uninstall.
- Preserve silent MSI invocation (`/qn /norestart`) and existing config/env/workspace/endpoint-secret/data-deletion behavior.

## Todo 1 — Hermes code identity and fast version output

Goal: a managed wheel installation has one authoritative code-scoped identity, and `hermes --version` explains its actual install location without changing upstream global root semantics.

Anchors: `E:/smc-build/source/hermes-agent/hermes_cli/_startup_fast.py#read_install_method`, `#print_fast_version_info`; `hermes_cli/config.py#detect_install_method`.

Changes:

1. Refactor fast-path stamp reading to share the code-root authority used by the regular detector, while keeping fast-path imports lightweight.
2. Add `smc-managed` to the recognized code-scoped values; do not promote it through the home-scoped legacy compatibility path.
3. Make fast output prefer non-empty `HERMES_INSTALL_ROOT` for `Install directory`, with `project_root_str()` as the exact fallback.
4. Extend the two existing pytest modules with behavior contracts for code-versus-home precedence, display fallback, and no `HERMES_MANAGED` coupling.

Stop conditions: both external pytest modules pass through the Hermes test wrapper, and the standard and fast detection paths return the same method for a code-root `smc-managed` stamp.

Triggered reads: inspect any startup import-cycle guard before sharing helpers; do not add a heavyweight `config` import to the fast path.

## Todo 2 — Managed runtime stamp and release-policy schema

Goal: the packaged runtime carries its installation identity and release metadata precisely describes installer-owned PATH behavior.

Anchors: `tools/release/hermes/windows_runtime.py#build_windows_runtime`; `tools/release/hermes/build_runtime.py#write_runtime_build`; `tools/release/hermes/verify_runtime.py#verify_bundle_tree`; `tools/release/hermes/path_policy_gate.py`.

Changes:

1. Stamp and validate `smc-managed\n` immediately after wheel installation at the installed `hermes_cli` code root; assert this artifact remains in the runtime tree so the existing release-v2 inventory records it.
2. Replace immutable-path metadata with the approved policy, owner, and one fixed entry; make bundle and client-release verification fail closed for an absent, extra, or altered field.
3. Convert the static PATH gate from absolute WiX rejection to exact component/value/scope recognition, retaining rejection of all other persistent writers and all User PATH writes.
4. Extend existing release tests using temp trees/fixtures rather than source-text snapshots or a new test module.

Stop conditions: `test_hermes_builder.py` proves the built runtime contains the stamp; metadata and policy-gate tests prove only the approved WiX shape passes; release verification rejects old immutable or malformed installer-managed metadata.

Triggered reads: trace `release_v2.py` manifest construction before adding validation, confirming it already inventories the new stamp automatically.

## Todo 3 — MSI-owned PATH lifecycle and managed gateway context

Goal: MSI is the single durable PATH writer and all managed Hermes processes expose the approved install root.

Anchors: `infra/windows/hermes-agent/installer/Product.wxs`; `scripts/SmcHermesManaged.psm1#Set-SmcHermesEnvironment`; `installer/InstallerCore.psm1#Get-SmcHermesGatewayTaskSpec`; `#Assert-SmcEnvironmentPathUnchanged`.

Changes:

1. Add one per-machine WiX Environment component that adds/converges the exact fixed bin token, adopts only its canonical legacy forms, and removes it on rollback/uninstall according to the v2.2 compatibility contract.
2. Ensure the component is sequenced with normal MSI install/repair/major-upgrade/uninstall behavior, leaving existing deferred PowerShell actions, silent mode, and UI-free package behavior intact.
3. Extend managed environment set/remove/rollback state with `HERMES_INSTALL_ROOT`, then inject it in the scheduled-task launcher, process env, and readiness context.
4. Retain all PowerShell lifecycle PATH snapshots as a boundary guard: they must continue to prove no internal script modifies Machine/User PATH, while allowing the outer WiX action to own its approved token.
5. Update existing Pester tests to check variable restoration/removal, launcher propagation, canonical-token migration expectations, unchanged User PATH, and rejection of PowerShell PATH writer regressions.

Stop conditions: Pester passes without a PowerShell Machine/User PATH writer; WiX build succeeds; upgrade/rollback/uninstall logic has automated fixture coverage for exact/case/trailing-slash canonical forms and preserves unrelated raw PATH tokens.

Triggered reads: inspect WiX Environment semantics and installer `build.ps1` before finalizing component attributes; trace every `Assert-SmcEnvironmentPathUnchanged` caller before changing its scope or assertions.

## Todo 4 — Release routing and real signed-artifact certification

Goal: the release entry point exposes the installer stage and a signed MSI can be certified without fabricating live evidence.

Anchors: `scripts/build-client-release.ps1`; `tools/release/client/build_client_release.py#STAGES`; `tools/release/client/verify_client_release.py#verify_client_release`; `tools/release/tests/test_client_release.py`.

Changes:

1. Add the already-supported `hermes-installer` stage to the PowerShell wrapper `ValidateSet`; leave Python `STAGES` as SOT.
2. Extend client-release verification/tests to require valid installer artifacts and the installer-managed policy, preserving test-key/unsigned fail-closed behavior.
3. Execute the existing release stage against the pinned external repo with `--hermes-repo E:\\smc-build\\source\\hermes-agent`, then certify generated signed MSI/EXE on separate Windows 10 and Windows 11 hosts.
4. Record operator evidence only after the real signed artifact run: install, repair, major upgrade, rollback/failure path, uninstall, `hermes --version`, `Get-Command hermes`, Machine/User PATH before/after byte comparisons, and preservation of config/env/workspace/endpoint-secret/data-home contracts.

Stop conditions: wrapper/Python stage parity is covered; release verification passes for valid signed artifacts and fails for invalid evidence; Win10 and Win11 evidence is available from real execution rather than unit-test claims.

Triggered reads: use the generated installer and manifest as the certification source of truth; if code-signing authority or lab access is unavailable, leave certification pending rather than marking release live.

## Verification

1. Validate the plan before implementation:

   `python tools/agent-skills/validate_plan.py .cursor/plans/opsi-prd-v2.2-hermes-windows-installer-release.plan.md`

2. In `E:/smc-build/source/hermes-agent`, run the existing Hermes wrapper for the touched fast-startup/install-method tests:

   `scripts/run_tests.sh tests/hermes_cli/test_startup_fast_guards.py tests/hermes_cli/test_pip_install_detection.py`

3. In this repository, run the exact release and policy tests:

   `python -m pytest tools/release/tests/test_hermes_builder.py tools/release/tests/test_path_policy_gate.py tools/release/tests/test_client_release.py`

4. Run the affected installer Pester modules and build a smoke MSI/EXE with the existing WiX build path:

   `Invoke-Pester infra/windows/hermes-agent/tests/SmcHermesManaged.Tests.ps1,infra/windows/hermes-agent/tests/Installer.Tests.ps1`

   `powershell -NoProfile -ExecutionPolicy Bypass -File infra/windows/hermes-agent/installer/build.ps1 -ReleaseVersion <approved-release-version> -Smoke`

5. Run the installer release stage with the pinned external source and a production signing identity. Certify only on real signed artifacts with `/qn /norestart` on Windows 10 and Windows 11; retain the operator logs and before/after PATH values as release evidence.
