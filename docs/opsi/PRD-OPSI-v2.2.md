---
work_item_id: OPSI-PRD-v2.2
version: 2.2.0
status: APPROVED
target_branch: work/prd-3.0
review_verdict: PASS
approved_at: 2026-08-24T17:14:30.2004357+08:00
---

# OPSI-PRD v2.2 — SMC Hermes Windows Installer & Release Packaging Closure

This PRD replaces the v2.1.5 product decision that persistent Machine/User PATH is always immutable. It does not restore a PowerShell or runtime PATH writer. The target model grants one narrowly scoped persistent PATH owner to Windows Installer while retaining the existing prohibition for PowerShell lifecycle code and User PATH.

## Scope

### In scope

- Correct the installed Hermes CLI's observable install directory and install method without changing the global meaning of the Hermes code root.
- Publish `HERMES_INSTALL_ROOT` as a dedicated Machine/process variable for the fixed managed layout.
- Register the fixed Hermes `bin` directory once in Machine PATH through Windows Installer ownership.
- Preserve the Gateway's existing process-local managed PATH and add the install-root context it consumes.
- Align runtime metadata and release verification with the installer-managed PATH contract.
- Align the PowerShell release wrapper with the existing Python `hermes-installer` stage.
- Certify silent MSI install, repair, major upgrade, uninstall, rollback, CLI discovery, and Gateway readiness on Windows 10/11 x64.

### Out of scope

- OPSI Server/Client Agent capability, OPSI RPC/API, config or skill distribution, log collection, Work Desktop, Gateway protocol, Windows Service migration, custom install directories, and custom Burn UI.
- Changes to `infra/salt`, `services/salt-control`, `contracts/salt-control-api`, `services/runtime`, or `contracts/runtime-api`.
- Replacing the existing Gateway Scheduled Task or changing `HERMES_HOME` data-preservation semantics.
- Online dependency acquisition during endpoint installation.

## Current Capability Inventory

| Capability | Existing Owner | Current Behaviour | Evidence | Result |
| --- | --- | --- | --- | --- |
| Managed Windows layout | `SmcHermesManaged.psm1` | Separates `ProgramRoot=D:\Programs\SMC\Hermes` from `HermesHome=C:\ProgramData\SMC\Hermes`; defines CLI, Node, workspace, and temp roots. | `infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1#Get-SmcHermesManagedLayout` | EXISTS |
| Dedicated Hermes Machine variables | `SmcHermesManaged.psm1` | Owns `HERMES_HOME`, `HERMES_AGENT_ROOT`, and `HERMES_NODE_ROOT` for Machine and current process; removes them on uninstall. It does not own `HERMES_INSTALL_ROOT`. | `infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1#Set-SmcHermesEnvironment`, `#Remove-SmcHermesEnvironment` | PARTIAL |
| Gateway runtime context | `InstallerCore.psm1` | Injects managed bin/scripts/node into process PATH and publishes the existing Hermes variables to the Scheduled Task process. It does not publish `HERMES_INSTALL_ROOT`. | `infra/windows/hermes-agent/installer/InstallerCore.psm1#Get-SmcHermesGatewayTaskSpec` | PARTIAL |
| Persistent PATH policy and release gate | `path_policy_gate.py` | Forbids every Machine/User PATH writer, explicitly rejects WiX `<Environment Name="PATH">`, and requires metadata policy `immutable`. Release and runtime verification call this owner. | `tools/release/hermes/path_policy_gate.py#assert_hermes_path_policy`, `#assert_path_policy_metadata`; `tools/release/client/verify_client_release.py#verify_hermes_installer_release`; `tools/release/hermes/verify_runtime.py#verify_bundle_tree` | CONFLICT |
| Legacy Hermes PATH token handling | v2.1.5 PATH-immutability lifecycle contract | Existing `D:\Programs\SMC\Hermes\bin` entries, including ones left by older releases, are preserved through upgrade and uninstall; no lifecycle owner may adopt or remove them. | `docs/opsi/PRD-OPSI-v2.1.5.md#PATH-013`, `#AC-21511` | CONFLICT |
| MSI/Burn packaging | `Product.wxs` and `Bundle.wxs` | Builds a per-machine MSI with silent deferred lifecycle actions and a standard Burn bundle. MSI currently owns no PATH component and contains no WixUI completion flow. | `infra/windows/hermes-agent/installer/Product.wxs#Package`; `infra/windows/hermes-agent/installer/Bundle.wxs#Bundle` | PARTIAL |
| PowerShell lifecycle PATH guard | `InstallerCore.psm1` | Snapshots Machine/User PATH around PowerShell lifecycle operations and fails if that inner lifecycle mutates PATH. | `infra/windows/hermes-agent/installer/InstallerCore.psm1#Get-SmcEnvironmentPathSnapshot`, `#Assert-SmcEnvironmentPathUnchanged` | EXISTS |
| Windows runtime assembly | `windows_runtime.py` | Installs the Hermes wheel into embedded Python `site-packages` and assembles the fixed runtime tree. It does not create a code-scoped install-method stamp. | `tools/release/hermes/windows_runtime.py#build_windows_runtime` | PARTIAL |
| Release file inventory | `release_v2.py` | Recursively inventories every non-empty runtime-tree file and records size/SHA-256 in `release-manifest.json`. A stamp present before release assembly is already covered; no second manifest owner is needed. | `tools/release/hermes/release_v2.py#inventory_tree`, `#build_release_manifest` | EXISTS |
| Runtime PATH metadata | `build_runtime.py` | Emits `environment.path.policy=immutable`. | `tools/release/hermes/build_runtime.py#write_runtime_build` | CONFLICT |
| Release stage routing | Python release orchestrator plus PowerShell wrapper | Python `STAGES` already includes `hermes-installer`; the wrapper `ValidateSet` omits it. | `tools/release/client/build_client_release.py#STAGES`; `scripts/build-client-release.ps1#param` | PARTIAL |
| Hermes source binding | `client-release.yaml` plus `build_client_release.py` | The default config names `D:/git/hermes-agent`, while the verified source is supplied from `E:/smc-build/source/hermes-agent`; the existing CLI can already accept an explicit `--hermes-repo` override before source freeze. | `release/client-release.yaml#hermes.repo`; `tools/release/client/build_client_release.py#run_preflight` | PARTIAL |
| Hermes install-directory display | `hermes_cli/_startup_fast.py` | Fast version output displays `project_root_str()`, which resolves to the installed Python code root. | `hermes-agent@ae17b582:hermes_cli/_startup_fast.py#project_root_str`, `#print_fast_version_info` | PARTIAL |
| Hermes install-method reporting | `hermes_cli/_startup_fast.py` and `hermes_cli/config.py` | The fast version reader reads only `HERMES_HOME/.install_method`; `detect_install_method()` defines the authoritative code-scoped-first order but accepts only `docker`, `nix`, `nixos`, `git`, and `unknown`. `HERMES_MANAGED` feeds managed-system semantics, not a display-only label. | `hermes-agent@ae17b582:hermes_cli/_startup_fast.py#read_install_method`; `hermes-agent@ae17b582:hermes_cli/config.py#detect_install_method`, `#get_managed_system` | CONFLICT |
| Real MSI lifecycle certification | Windows release/certification workflow | Existing Pester coverage tests module behavior and MSI construction, but no grounded owner proves the full real-MSI install/repair/major-upgrade/uninstall PATH contract on Win10/Win11. | `infra/windows/hermes-agent/tests/Installer.Tests.ps1` | MISSING |

## Target End-State Inventory

| Capability | Target Production Owner | Target Behaviour | Classification |
| --- | --- | --- | --- |
| Managed layout | `SmcHermesManaged.psm1` | Fixed Program/Data roots remain the only layout SOT. | KEEP |
| Dedicated Hermes variables | `SmcHermesManaged.psm1` | Adds/removes `HERMES_INSTALL_ROOT=<ProgramRoot>` together with the existing dedicated Hermes variables; User environment remains untouched. | MODIFY |
| Gateway runtime context | `InstallerCore.psm1` | Continues its private process PATH and additionally injects `HERMES_INSTALL_ROOT`; it never writes persistent PATH. | MODIFY |
| Machine PATH entry | Windows Installer component in `Product.wxs` | Owns exactly one fixed `D:\Programs\SMC\Hermes\bin` Machine PATH entry across install, repair, major upgrade, rollback, and uninstall. | ADD |
| Persistent PATH enforcement | `path_policy_gate.py` | Enforces `installer-managed`: only the declared MSI component may own the fixed Machine PATH entry; PowerShell, runtime, OPSI scripts, registry writers, `setx`, User PATH, and any other WiX PATH owner remain forbidden. | REPLACE |
| Legacy Hermes PATH token migration | Windows Installer component in `Product.wxs` | On first v2.2 enrollment, adopts the bounded canonical Hermes-bin equivalence set, converges it to one canonical Machine PATH entry, and removes the adopted entry at rollback/uninstall. | REPLACE |
| PowerShell lifecycle PATH guard | `InstallerCore.psm1` | Continues to prove that PowerShell lifecycle code itself does not mutate Machine/User PATH. It is not used to deny the outer MSI transaction's declared Environment-table action. | KEEP |
| Runtime install-method stamp | `windows_runtime.py` | Writes the Hermes-consumed code-scoped stamp after wheel installation and validates it before release assembly. The exact location/value remain conditional on external Hermes-source verification. | MODIFY |
| Release manifest inventory | `release_v2.py` | Continues to inventory/hash the entire assembled tree, including the stamp automatically. | KEEP |
| Runtime PATH metadata | `build_runtime.py` | Declares `policy=installer-managed`, owner `windows-installer`, and the single fixed entry; release verification validates the same semantics. | REPLACE |
| Release stage routing | `build-client-release.ps1` | Accepts the already-existing Python `hermes-installer` stage. Python remains the stage SOT. | MODIFY |
| Hermes source binding | `build_client_release.py` invocation/configuration | Resolves an existing explicit Hermes source location before normal clean-source freeze; the local build path is configuration/argument data, not a new hard-coded repository SOT. | MODIFY |
| Hermes version display | `hermes_cli/_startup_fast.py` | Displays a validated `HERMES_INSTALL_ROOT` when supplied; otherwise retains the current code-root display. `project_root_str()` remains unchanged. | MODIFY |
| Hermes install-method reporting | `hermes_cli/config.py` as the authority; `_startup_fast.py` as its fast-version consumer | Extends the authoritative code-scoped stamp contract with `smc-managed`; the fast version path reports the same resolved contract rather than independently reading a home-scoped stamp. `HERMES_MANAGED` remains uninvolved. | REPLACE |
| MSI interaction | `Product.wxs` / standard Windows Installer | MSI stays enterprise/silent with no completion UI, browser launch, or custom BA. Burn keeps its standard bootstrapper interaction. | KEEP |
| Windows lifecycle certification | Windows release/certification workflow | Provides real-artifact Win10/Win11 evidence for silent install, repair, upgrade, uninstall, rollback, PATH uniqueness/cleanup, CLI discovery, data preservation, and Gateway readiness. | ADD |

## Architecture and Behaviour Contract

### Single-owner boundaries

- Windows Installer is the only production owner allowed to persist the fixed Hermes `bin` entry in Machine PATH.
- `SmcHermesManaged.psm1` remains the only owner of dedicated `HERMES_*` Machine variables.
- `InstallerCore.psm1` owns lifecycle orchestration and Gateway process context, but not persistent PATH.
- `release_v2.py` remains the only release file-inventory/hash owner. Runtime assembly must not create a parallel manifest writer.
- Hermes source remains the owner of CLI version/install-method interpretation; SMC runtime assembly only supplies the code-scoped stamp accepted by that source.

### PATH semantics

- Fresh install produces one fixed Machine PATH entry for the managed CLI and no User PATH entry.
- Repair and major upgrade preserve one logical entry; they must not duplicate it.
- Uninstall and MSI rollback remove only the Windows Installer-owned entry and preserve unrelated PATH content with Windows Installer semantics.
- v2.2 treats existing canonical Hermes-bin tokens as product-owned migration input: comparison is case-insensitive after removing one optional trailing `\` from the fixed literal `D:\Programs\SMC\Hermes\bin`. It adopts that bounded set into one canonical MSI-owned entry; it does not expand environment variables, resolve short paths, trim arbitrary text, or normalize any other PATH token.
- All noncanonical tokens, including other spellings or malformed historical content, remain unrelated PATH content and are preserved byte-for-byte. The MSI-owned canonical entry is placed with CLI precedence, so a newly started shell resolves the managed `hermes.exe` without rewriting unrelated entries.
- PowerShell lifecycle code must continue to observe Machine/User PATH as unchanged within its own operation boundary and must never call a persistent PATH writer.
- Gateway startup continues to prepend its private bin/scripts/node paths to its process PATH so readiness does not depend on environment propagation to an already-running process.

### Hermes metadata semantics

- `HERMES_INSTALL_ROOT`, when present and valid, affects only the displayed product install directory. It must not redefine project/code root, resource lookup, skill/plugin discovery, update detection, or non-Windows behavior.
- `detect_install_method()` is the authoritative resolver: it reads `<installed code root>/.install_method` before legacy home-scoped signals. The fast version path must report that resolved contract, not independently interpret `HERMES_HOME/.install_method`.
- `smc-managed` is added to the authoritative resolver's accepted stamp values. `HERMES_MANAGED` must not be introduced merely to obtain a display label because its non-empty value participates in managed-system behavior.
- Production release must freeze a clean external Hermes repository branch, commit, source version, and relevant tests before packaging.

### Silent/UI semantics

- MSI install, repair, upgrade, and uninstall support `/qn /norestart`, return Windows Installer success/failure codes, and do not wait for user interaction in SYSTEM/OPSI sessions.
- No WixUI, completion dialog, MessageBox, browser launch, README launch, Desktop launch, or custom Bootstrapper Application is added.
- The existing Burn standard bootstrapper may retain its normal interactive behavior; enterprise deployment uses MSI.

## Change Classification

| Capability | Classification | Reason |
| --- | --- | --- |
| Managed layout and data preservation | KEEP | Existing owner and fixed roots already satisfy the target. |
| Dedicated environment variables | MODIFY | Existing owner is extended with one related variable; no second environment owner is created. |
| Gateway process context | MODIFY | Existing lifecycle owner propagates the new variable while retaining its process-only PATH. |
| MSI Machine PATH registration | ADD | No current MSI PATH component exists; Windows Installer is the required unique owner. |
| Global persistent PATH immutability policy | REPLACE | v2.1.5 explicitly forbids the target WiX component and must be superseded, not reinterpreted. |
| Legacy Hermes PATH token preservation | REPLACE | v2.1.5 preserves the bounded canonical product token; v2.2 transfers that token to the single MSI owner so it can converge and remove it. |
| Old immutable metadata/static/release assertions | REMOVE | Assertions that require `immutable` or reject every WiX PATH Environment entry cannot coexist with the target. |
| Scoped PowerShell PATH prohibition | KEEP | It remains a valid enforcement boundary under the new owner model. |
| Runtime install-method stamp | MODIFY | Existing assembler is the correct place to add verified runtime metadata. |
| Release inventory/hash generation | KEEP | Existing recursive inventory already covers every assembled file. |
| Runtime PATH metadata | REPLACE | Observable release contract changes from `immutable` to `installer-managed`. |
| PowerShell release wrapper stage set | MODIFY | It must expose the existing Python stage rather than introduce another orchestrator. |
| Hermes source binding | MODIFY | Existing release entry already supports an explicit source override; its configured/default invocation must resolve a real freezeable repository. |
| Hermes install-directory display | MODIFY | Existing fast version owner changes only its display projection; code-root semantics remain owned by `project_root_str()`. |
| Hermes install-method reporting | REPLACE | The existing fast home-scoped reader conflicts with the authoritative code-scoped resolver; one resolver must own the observable result. |
| Real MSI lifecycle certification | ADD | No existing capability proves the complete real-artifact lifecycle matrix. |

## Replacement / Removal Matrix

| Replaced capability | Replacement | Required removal | Removal condition |
| --- | --- | --- | --- |
| v2.1.5 `Machine/User PATH immutable for every installer lifecycle` | `Machine PATH installer-managed; User PATH immutable; PowerShell/runtime PATH writers forbidden` | Remove the unconditional WiX PATH rejection and global immutable assertion from production release gates. | Same change set proves the new allowlist rejects every owner except the single declared MSI component and fixed entry. |
| v2.1.5 preservation of existing Hermes PATH entries | v2.2 bounded canonical-token adoption by the Windows Installer component | Remove the v2.1.5 rule that Upgrade/Uninstall must preserve a pre-existing canonical Hermes-bin token. | The v2.2 component converges the defined canonical equivalence set to one entry and removes it at MSI rollback/uninstall; all other PATH tokens are preserved. |
| `environment.path.policy=immutable` | `installer-managed` metadata with owner and entry | Remove all validators/tests that require the literal `immutable` value. | Runtime bundle and client-release verification both validate the new schema/semantics. |
| Static rule “any WiX PATH Environment is forbidden” | Scoped rule “only the declared MSI PATH component/value/scope is allowed” | Remove the unconditional `assert_wix_no_path_environment` behavior from production gate. | Negative tests prove alternate component, scope, value, duplicate entry, and non-WiX writers fail closed. |
| Fast `HERMES_HOME/.install_method` version reader | Authoritative code-scoped install-method resolution | Remove the independent fast-path home-stamp interpretation from observable version output. | Fast and non-fast version paths return `smc-managed` from the same code-scoped stamp; legacy home-scoped behavior remains only inside the authoritative resolver's documented fallback order. |

There is no indefinite compatibility path: artifacts built under the old metadata remain historical evidence; v2.2 production artifacts expose only the new policy.

## Compatibility Contract

| Field | Contract |
| --- | --- |
| Current Consumer | Endpoints upgrading from releases governed by the v2.1.5 rule that retained pre-existing Hermes PATH tokens. |
| Reason | The target requires one CLI-precedence entry and exact uninstall/rollback cleanup; a retained canonical product token would otherwise create duplicate or unowned lifecycle state. |
| Compatibility Behaviour | At v2.2 install/upgrade/repair, the Windows Installer component alone adopts tokens equal to `D:\Programs\SMC\Hermes\bin` under the bounded canonical equivalence rule in PATH semantics, converges them to one canonical entry, and owns its removal. No PowerShell, runtime, OPSI script, `setx`, or direct registry writer participates. |
| Removal Condition | The MSI transaction rolls back or the v2.2 product is uninstalled; then no adopted canonical Hermes-bin token remains, while noncanonical/unrelated tokens remain unchanged. |
| Removal Version | v2.2 uninstall; no compatibility adapter or secondary PATH owner survives the product lifecycle. |

## Source Anchors

- `docs/adr/ADR-031-opsi-parallel-endpoint-control-plane.md#Decision`
- `docs/adr/ADR-037-opsi-managed-endpoint-v2.md#Decision`
- `infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1#Set-SmcHermesEnvironment`
- `infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1#Remove-SmcHermesEnvironment`
- `infra/windows/hermes-agent/installer/InstallerCore.psm1#Get-SmcHermesGatewayTaskSpec`
- `infra/windows/hermes-agent/installer/InstallerCore.psm1#Assert-SmcEnvironmentPathUnchanged`
- `infra/windows/hermes-agent/installer/Product.wxs#Package`
- `infra/windows/hermes-agent/installer/Bundle.wxs#Bundle`
- `tools/release/hermes/windows_runtime.py#build_windows_runtime`
- `tools/release/hermes/build_runtime.py#write_runtime_build`
- `tools/release/hermes/release_v2.py#inventory_tree`
- `tools/release/hermes/path_policy_gate.py#assert_hermes_path_policy`
- `tools/release/hermes/path_policy_gate.py#assert_path_policy_metadata`
- `docs/opsi/PRD-OPSI-v2.1.5.md#PATH-013`, `#AC-21511`
- `tools/release/client/build_client_release.py#STAGES`
- `tools/release/client/build_client_release.py#run_preflight`
- `release/client-release.yaml#hermes.repo`
- `scripts/build-client-release.ps1#param`
- `hermes-agent@ae17b582a9679a926aaa3be2eaf209ed1bd540f8:hermes_cli/_startup_fast.py#project_root_str`, `#read_install_method`, `#print_fast_version_info`
- `hermes-agent@ae17b582a9679a926aaa3be2eaf209ed1bd540f8:hermes_cli/config.py#detect_install_method`, `#_install_method_project_root`, `#get_managed_system`
- `hermes-agent@ae17b582a9679a926aaa3be2eaf209ed1bd540f8:tests/hermes_cli/test_startup_fast_guards.py#test_fast_version_reports_install_method_stamp`
- `hermes-agent@ae17b582a9679a926aaa3be2eaf209ed1bd540f8:tests/hermes_cli/test_pip_install_detection.py#test_stamp_install_method_writes_code_scoped`

## Acceptance Criteria

- **AC-220-01**: A production build freezes a clean Hermes source revision and verifies the `ae17b582`-grounded version-display and install-method contracts before packaging.
- **AC-220-01a**: Release invocation resolves an existing Hermes source repository through configuration or the existing explicit override before source freeze; no developer-machine path is introduced as a production source-of-truth.
- **AC-220-02**: Installed CLI reports the fixed product root and `smc-managed`; both fast and non-fast version paths derive the method from the same authoritative code-scoped stamp contract, not a `HERMES_HOME` stamp.
- **AC-220-03**: Without `HERMES_INSTALL_ROOT`, Hermes preserves its verified upstream install-directory display and all non-SMC code-root behavior.
- **AC-220-04**: Install/repair/upgrade publish the four dedicated Machine variables with fixed managed-layout values; uninstall/rollback remove only values owned by this product while preserving existing data policy.
- **AC-220-05**: A newly started PowerShell resolves `hermes` to `D:\Programs\SMC\Hermes\bin\hermes.exe` through Machine PATH; User PATH is unchanged.
- **AC-220-06**: Fresh install, repeated repair, and major upgrade leave exactly one Windows Installer-owned Hermes `bin` entry; uninstall and rollback remove it without removing or rewriting unrelated entries.
- **AC-220-06a**: Starting with a pre-existing token equal to the bounded canonical Hermes-bin equivalence set, v2.2 install/upgrade/repair leaves exactly one canonical MSI-owned entry; MSI rollback/uninstall removes that adopted entry.
- **AC-220-06b**: A noncanonical, malformed, or otherwise unrelated PATH token remains byte-for-byte unchanged during all v2.2 lifecycle operations; the canonical MSI entry still has CLI precedence in a new shell.
- **AC-220-07**: No PowerShell, Python runtime, OPSI script, `setx`, or direct registry code persists PATH. Static/release gates allow only the single declared MSI component/value/scope and reject all parallel owners.
- **AC-220-08**: The PowerShell lifecycle PATH snapshot/equality gate remains green because the PowerShell lifecycle boundary itself does not mutate Machine/User PATH.
- **AC-220-09**: Gateway Scheduled Task context contains `HERMES_INSTALL_ROOT` and the existing private bin/scripts/node PATH; Gateway reaches TCP `:8642`, `/health`, and authenticated `/v1/models` without relying on Machine PATH propagation.
- **AC-220-10**: The code-scoped `.install_method` stamp exists at the installed Hermes code root consumed by `detect_install_method()`, contains the accepted `smc-managed` value, and is included automatically in the signed release file inventory/SHA-256 coverage.
- **AC-220-11**: Runtime and client-release verification accept only `installer-managed` metadata with owner `windows-installer` and the single fixed entry; old unconditional `immutable` assertions are removed in the same change.
- **AC-220-12**: The PowerShell wrapper and Python orchestrator accept the same `hermes-installer` stage, with Python remaining the stage SOT.
- **AC-220-13**: MSI install, repair, major upgrade, and uninstall run with `/qn /norestart`, do not display or launch UI, and return standard Windows Installer status.
- **AC-220-14**: Repair/upgrade preserve `config.yaml`, `.env`, workspace, endpoint secret, and existing managed-home data according to the current lifecycle contract; uninstall does not broaden data deletion.
- **AC-220-15**: Real signed artifacts pass the Fresh Install, Repair, Upgrade, Uninstall, rollback, reinstall, reboot recovery, CLI discovery, metadata, PATH uniqueness/cleanup, and Gateway readiness matrix on Windows 10 x64 and Windows 11 x64. Operator evidence is required and is not replaced by unit/static tests.
- **AC-220-16**: OPSI silent deployment invokes the MSI without UI, receives the real MSI result, and verifies CLI metadata and Gateway readiness without adding a second lifecycle owner.
