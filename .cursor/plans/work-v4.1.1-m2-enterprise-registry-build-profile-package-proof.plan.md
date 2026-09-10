---
name: Work v4.1.1 Enterprise Registry Build Profile Package Proof
overview: Add deterministic enterprise Registry profile preparation and conditional Electron resource proof to the existing Work build pipeline, while preserving RM-01 runtime ownership.
todos:
  - id: t1-registry-build-profile-preparation
    content: "T1 — Registry build profile preparation [C01]"
    status: completed
  - id: t2-conditional-electron-resource-inclusion
    content: "T2 — Conditional Electron resource inclusion [C02]"
    status: completed
  - id: t3-windows-packaged-resource-verification
    content: "T3 — Windows packaged resource verification [C03]"
    status: completed
  - id: t4-cross-entrypoint-package-regression
    content: "T4 — Cross-entrypoint package regression [C04]"
    status: completed
  - id: t5-registry-build-profile-lat-closure
    content: "T5 — Registry build profile LAT closure [C05]"
    status: completed
isProject: false
plan_contract: smc.plan.v3.5
plan_id: WORK-V4.1.1-REGISTRY-RM-02
domain_contract: smc.ges.domain-activation.v1
consumer_profile: generic@1.0.0
domain_policy_digest: sha256:78167a10490bbe109ad2f006cfe74ff1390b2187cb6728004964448f2a5c5907
commit_policy: post_review
acceptance_contract: smc.acceptance.v1
source_revision: AD-WORK-v4.1.1-SKILL-REGISTRY-ENDPOINT-CONFIGURATION@1.0.1/RM-02 + user-input:2026-09-10-ci-profile-file
grounded_commit: 96e73e7bfa76f2ec02dba3466bd4430ff6d2ca6c
grounding_source: committed_baseline
working_tree_fingerprint: clean
---

# Work v4.1.1 Enterprise Registry Build Profile Package Proof Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.1.1-M2-enterprise-registry-build-profile-package-proof.md)

## Scope

- In: complete CI/release profile-file preflight; deterministic descriptor generation; enterprise-only Electron resource inclusion; Windows unpacked-package proof; all supported package entry points use the same preparation; targeted tests and LAT.
- Out: Registry Main resolver behavior, runtime descriptor source resolution, Registry IPC/preload/Renderer, CSP, Hermes Runtime descriptor, Agent/CLI, Skill Run, authentication, provider inference, endpoint credentials, content governance, signing, publishing, and any other Plan.
- Production Owner inherited from PRD: the existing Work build/release pipeline owns profile preparation, resource selection, and package proof. RM-01 `apps/work/src/main/registry.ts` remains the sole runtime descriptor consumer.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `apps/work/scripts/generate-work-build-info.mjs`; `apps/work/package.json`; new `apps/work/scripts/lib/work-registry-build-profile.mjs`; new `apps/work/scripts/generate-work-registry-config.mjs` | Existing generator writes only build identity; package commands do not accept a Registry profile. | `generate-work-build-info.mjs` is invoked by `package.json#scripts.build` and the Windows release script; `readPackageVersion` is already reused from `work-release-guard.mjs`. | `build:unpack`, `build:win`, and `build:rpm` call `build`; `build:mac` and `build:linux` currently bypass it, establishing the shared entry-point gap. | Existing build-resource pattern, Node stdlib `fs/path/URL`, and the new pure build helper can supply one reusable validation/preparation path; no dependency or runtime client is needed. | PASS |
| C02 | `apps/work/electron-builder.yml` | `extraResources` injects only `work-build-info.json`; static Registry resource inclusion is absent. | Declarative file is the single electron-builder resource owner. | The RM-01 build resolver accepts `process.resourcesPath/resources/work-registry-config.json`; an optional filtered resources directory can preserve Community absence. | Reuse electron-builder `extraResources` file-set support; no generated builder config or alternate package owner. | PASS |
| C03 | `apps/work/scripts/build-work-release.ps1`; `apps/work/scripts/lib/work-release-guard.mjs` | Windows release invokes identity generation and verifies `win-unpacked/resources/work-build-info.json`; it has no Registry-resource validator. | `build-work-release.ps1` orchestrates release steps; `work-release-guard.mjs` owns reusable package assertions and Node CLI commands. | `release:build:win` calls the PowerShell script; its final package output is `dist/win-unpacked/resources`. | Extend existing release orchestration and guard helpers; do not add a second release tool. | PASS |
| C04 | new `apps/work/tests/work-registry-package-entrypoints.test.ts`; new `apps/work/scripts/test-work-registry-package.ps1` | Existing builder/release tests assert identity configuration only; no cross-entry-point profile contract or real Windows Registry-resource proof exists. | `vitest` collects `apps/work/tests/*.test.ts`; PowerShell is already the established Windows build-script runner. | New proof script invokes supported package preparation and inspects the generated `win-unpacked` resource; it does not contact a Registry service. | A dedicated test-only package harness is necessary because the current release scripts require signing/publishing prerequisites and do not exercise both enterprise and Community modes. | PASS |
| C05 | `apps/work/lat.md/lat.md`; `apps/work/lat.md/registry-endpoint-configuration.md` | LAT documents RM-01 source consumption and marks enterprise packaging as RM-02 future work. | Root LAT links to the Registry endpoint node. | The delivered build behavior depends on RM-01's build-source path but does not modify its resolver. | Reuse the existing Registry configuration node and root index; no second LAT topic is needed. | PASS |
| C06 | `apps/work/src/main/registry.ts`; Registry IPC/preload/Renderer; Hermes Runtime/Agent/CLI/Skill Run owners | RM-01 descriptor consumer and all listed boundaries are already delivered. | `resolveRegistry` reads a packaged resource as highest-priority `build` source; existing boundaries do not need a write. | Package output is consumed only by the existing Main resolver; no sender/receiver contract changes. | Keep those owners unchanged and prove scope through focused consumer regression, guards, and completion audit. | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | A CI/release build can select enterprise mode only through a complete descriptor file designated by `SMC_WORK_REGISTRY_BUILD_PROFILE_FILE`; no partial endpoint override or provider inference exists. | SECURITY | C01 | T1 | V08 | UNIT | yes |
| AC-02 | AC | A valid enterprise profile is preflighted before every supported Work platform package assembly and produces exactly one normalized `work-registry-config.json` package resource with the same descriptor semantics. | CONTRACT | C01, C02 | T1, T2 | V01, V02, V04 | INTEGRATION | yes |
| AC-03 | AC | An unset enterprise profile produces Community package output with no Registry descriptor resource; stale enterprise output cannot affect a later Community build in the same workspace. | LIFECYCLE | C01, C02 | T1, T2 | V01, V02, V04 | INTEGRATION | yes |
| AC-04 | AC | Any present but invalid enterprise profile fails closed before Electron packaging and does not fall back to Community or preserve/package an old descriptor. | SECURITY | C01 | T1 | V01, V04 | UNIT | yes |
| AC-05 | AC | A final unpacked Windows enterprise package is verified to contain a valid descriptor matching the selected profile; a Community package is verified to omit it. | CONTRACT | C02, C03, C04 | T2, T3, T4 | V04, V08 | CONTRACT_RELEASE | yes |
| AC-06 | AC | Package/profile diagnostics and committed fixtures contain no credential, URL userinfo, raw profile body, or profile path; build output does not copy arbitrary input files. | SECURITY | C01, C03, C04 | T1, T3, T4 | V04, V08 | INTEGRATION | yes |
| AC-07 | AC | The delivered enterprise package still uses RM-01's existing `build > runtime > default` consumer semantics, while Community packaging preserves `default`; no Registry Main, IPC/preload, Renderer, Runtime, Agent/CLI, or Skill Run contract changes occur. | SCOPE | C02, C06 | T2 | V03, V05 | DIFF_SCOPE | yes |
| AC-08 | AC | Existing Work guard, Node/Web typecheck, relevant build/package regression checks, and `lat check` pass. | OPERATIONS | C01, C02, C03, C04, C05 | T1, T2, T3, T4, T5 | V01, V02, V04, V05, V06, V07, V08 | INTEGRATION | yes |
| AC-09 | AC | Every supported Work platform package entry point applies the same profile preparation before Electron packaging. Windows package proof verifies the final unpacked resource; non-Windows package paths cannot bypass preflight or select a different mode. | LIFECYCLE | C01, C04 | T1, T4 | V02, V04 | CONTRACT_RELEASE | yes |
| DOD-01 | DOD | C01–C06 are delivered through one canonical RM-02 Plan; no other Plan or Roadmap item is implemented. | SCOPE | C01, C02, C03, C04, C05, C06 | T1, T2, T3, T4, T5 | V04 | DIFF_SCOPE | yes |
| DOD-02 | DOD | CL-01–CL-09 have fresh blocking evidence or valid targeted reuse; current FAIL/NOT_TESTED evidence is not treated as complete. | EVIDENCE | C01, C02, C03, C04, C05, C06 | T1, T2, T3, T4, T5 | V04 | DOCUMENT_SEMANTIC | yes |
| DOD-03 | DOD | Completion Audit, independent implementation review, all blocking verification, and durable evidence manifest pass before the implementation commit. | EVIDENCE | C01, C02, C03, C04, C05, C06 | T1, T2, T3, T4, T5 | V04 | DOCUMENT_SEMANTIC | yes |
| DOD-04 | DOD | RM-02 moves to DONE only with a real implementation commit and parseable evidence reference from the Windows package proof. | OPERATIONS | C03, C04 | T3, T4 | V04 | CONTRACT_RELEASE | yes |
| DOD-05 | DOD | Any need to add credentials/auth headers, partial endpoint inputs, host/provider inference, Runtime descriptor mutation, Renderer configuration access, HTTP icon/CSP changes, or a new Registry client returns to Architecture review. | SCOPE | C06 | T2 | V09 | DIFF_SCOPE | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Profile preparation and generated-resource lifecycle | AC-01, AC-02, AC-03, AC-04, AC-06, AC-09 | Any supported Work package entry point or Windows release build begins. | Mode is unresolved and prior generated resource may exist. | The single build-profile preparation helper validates a selected complete file, then writes the normalized enterprise resource; absent selection removes/excludes it for Community mode. | The same helper clears the generated Registry resource before reporting a selected-profile failure; no package invocation starts. | V01, V02, V04 |
| Windows package proof | AC-05, AC-06, AC-09, DOD-04 | Local Windows package harness assembles enterprise then Community outputs. | Package output exists but selected resource has not been checked. | Existing release guard validates the unpacked resource against the expected mode/descriptor. | Guard rejects missing, malformed, unexpected, or mismatched resource without using it as a fallback input. | V04 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Enterprise profile to packaged build descriptor | AC-01, AC-02, AC-04, AC-06 | CI/release environment variable and one regular JSON file. | `SMC_WORK_REGISTRY_BUILD_PROFILE_FILE` identifies a complete `WorkRegistryEndpointDescriptor`; generator emits normalized `resources/work-registry-config.json`. | electron-builder copies only the generated resource; RM-01 `resolveRegistry` reads it through existing build paths. | schema version, registry ID, required endpoints, optional HTTPS icon; no credentials/userinfo/partial fields. | Build-profile helper before package assembly. | Invalid/unsafe/missing selected file clears generated resource and exits nonzero; no Community fallback. | Resource path is fixed; each preparation fully replaces/removes the generated artifact for the selected mode. | V01, V02, V03, V04 |
| Packaged resource to Windows proof | AC-05, AC-06, AC-09, DOD-04 | electron-builder unpacked Windows resource directory. | Existing release guard reads the one expected resource name and parses descriptor JSON. | Windows release orchestration and local package harness. | Expected mode; presence/absence; complete normalized descriptor semantics; no credentials/userinfo. | Existing release guard. | Missing/extra/malformed/mismatched resource fails the package verification command. | The checked package output directory is the test run's deterministic target; each mode is verified separately. | V04 |

## Acceptance Claim Ledger

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason | Verification IDs |
|---|---|---|---|---|---|---|---|---|
| CLM-01 | AC-01 | Explicit profile selection accepts only one complete descriptor file. | yes | `generate-work-build-info.mjs`; `electron-builder.yml` | PROVEN_BUT_AFFECTED | TARGETED_RERUN | C01 introduces the build-time trust boundary. | V08 |
| CLM-02 | AC-02 | Valid enterprise profile becomes one normalized packaged descriptor for every package entry point. | yes | - | NOT_TESTED | NEW_EVIDENCE | New enterprise packaging capability. | V01, V02, V04 |
| CLM-03 | AC-03 | Community mode omits the descriptor after enterprise mode in the same workspace. | yes | - | NOT_TESTED | NEW_EVIDENCE | New stale-artifact prevention lifecycle. | V01, V02, V04 |
| CLM-04 | AC-04 | Invalid selected profile stops packaging without fallback or stale output. | yes | Existing build identity dirty-tree guard | NOT_TESTED | NEW_EVIDENCE | Profile preflight failure mapping is new. | V01 |
| CLM-05 | AC-05 | Windows unpacked package proves selected descriptor presence/absence and semantic integrity. | yes | Existing `win-unpacked` build-info verification | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Package proof contract is extended. | V08 |
| CLM-06 | AC-06 | No secret-like input or raw profile data is copied or emitted. | yes | RM-01 descriptor validation and manifest evidence | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Build ingress and diagnostics are new. | V08 |
| CLM-07 | AC-07 | RM-01 consumer and unrelated boundaries remain unchanged. | yes | RM-01 evidence manifest `WORK-V4.1.1-REGISTRY-RM-01` | PROVEN_BUT_AFFECTED | TARGETED_RERUN | New build source producer is attached. | V03, V05 |
| CLM-08 | AC-08 | Focused tests, guards, types, package check, and LAT remain green. | yes | RM-01 V03–V07 evidence | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Build/release and LAT behavior change. | V06, V07, V08 |
| CLM-09 | AC-09 | All supported package entry points invoke common mode preparation. | yes | Current package scripts are non-uniform | FAILED | NEW_EVIDENCE | Cross-entry-point profile handling is absent. | V02, V04 |
| CLM-10 | DOD-01 | Only this canonical RM-02 Plan owns C01–C06 delivery. | yes | - | NOT_TESTED | NEW_EVIDENCE | RM-02 has no prior delivery record. | V04 |
| CLM-11 | DOD-02 | Every blocking claim has current evidence and no failed baseline is asserted complete. | yes | - | NOT_TESTED | NEW_EVIDENCE | RM-02 has no prior delivery record. | V04 |
| CLM-12 | DOD-03 | Delivery review, blocking verification, and durable evidence manifest precede implementation commit. | yes | - | NOT_TESTED | NEW_EVIDENCE | RM-02 has no prior delivery record. | V04 |
| CLM-13 | DOD-04 | Roadmap closure is tied to implementation commit and Windows package proof evidence. | yes | - | NOT_TESTED | NEW_EVIDENCE | RM-02 has no prior delivery record. | V04 |
| CLM-14 | DOD-05 | Scope review rejects unapproved owner, credential, provider, or Renderer/Runtime expansion. | yes | - | NOT_TESTED | NEW_EVIDENCE | RM-02 has no prior delivery record. | V09 |

## Live Scenario Matrix

| Scenario ID | Claim IDs | Verification IDs | Subject / Fixture | Required Capabilities | Preconditions | Stimulus | Oracle | Environment ID |
|---|---|---|---|---|---|---|---|---|

No live scenario is required: every blocking verification is local build, package, or static evidence and needs no provider, candidate, credential, or fault driver.

## Live Environment Matrix

| Environment ID | Required Env Vars | Preflight Command | Fault Driver Env | Candidate Mode | Candidate Probe |
|---|---|---|---|---|---|

No live environment is required: every verification uses the local Work checkout and generated non-secret test inputs.

## Verification Ledger

| Verification ID | Claim IDs | Level | Acceptance Mode | Entry Point / Command | Oracle | Negative / Regression | Evidence Policy | Environment | Evidence Action | Blocking |
|---|---|---|---|---|---|---|---|---|---|---|
| V01 | CLM-02, CLM-03, CLM-04 | UNIT | LOCAL | `npm --prefix apps/work exec -- vitest run tests/work-registry-build-profile.test.ts --pool=threads --maxWorkers=1` | Complete profile normalization, unset Community removal, and selected invalid-profile failure all pass. | Empty/relative/unreadable/non-regular/malformed/partial/unsupported/userinfo/profile values fail before package execution and leave no resource. | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V02 | CLM-02, CLM-03, CLM-09 | INTEGRATION | LOCAL | `npm --prefix apps/work exec -- vitest run tests/work-registry-package-entrypoints.test.ts --pool=threads --maxWorkers=1` | All package entry points use one preparation contract and preserve Community cleanup. | Bypassed macOS/Linux preparation or mode drift fails. | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V03 | CLM-07 | INTEGRATION | LOCAL | `npm --prefix apps/work exec -- vitest run src/main/registry.test.ts --pool=threads --maxWorkers=1` | Existing Main resolver still honors packaged build source and default behavior. | Runtime precedence, invalid descriptor, IPC/Renderer boundary, and provider-neutral consumer regressions fail. | LOCAL_TRANSIENT | local apps/work | TARGETED_RERUN | yes |
| V04 | CLM-02, CLM-03, CLM-04, CLM-09, CLM-10, CLM-11, CLM-12, CLM-13 | CONTRACT_RELEASE | LOCAL | `powershell -NoProfile -ExecutionPolicy Bypass -File apps/work/scripts/test-work-registry-package.ps1` | A real local Windows unpacked enterprise package contains the selected valid descriptor and the subsequent Community package omits it. | Invalid profile aborts before package; stale enterprise resource, missing/mismatched descriptor, raw profile copy, or cross-entrypoint mode drift fails. | LOCAL_DURABLE | local Windows packaging toolchain | NEW_EVIDENCE | yes |
| V05 | CLM-07 | DIFF_SCOPE | LOCAL | `npm --prefix apps/work run guard` | Existing Work boundary guards pass and completion audit confirms only RM-02 scope. | Registry Main/IPC/preload/Renderer/CSP/Runtime/Agent/CLI/Skill Run/auth/provider changes fail scope review. | LOCAL_TRANSIENT | local apps/work | TARGETED_RERUN | yes |
| V06 | CLM-08 | STATIC | LOCAL | `npm --prefix apps/work run typecheck` | Node and Web TypeScript checks exit zero. | Invalid script/test/config integration fails. | LOCAL_TRANSIENT | local apps/work | TARGETED_RERUN | yes |
| V07 | CLM-08 | DOCUMENT_SEMANTIC | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('lat check', cwd='apps/work', shell=True))"` | LAT validates delivered build-profile ownership and RM-01 runtime boundary. | Stale future wording, missing resource lifecycle, or false product behavior fails documentation validation/review. | REPO_SUMMARY | local repository | TARGETED_RERUN | yes |
| V08 | CLM-01, CLM-05, CLM-06, CLM-08 | INTEGRATION | LOCAL | `npm --prefix apps/work exec -- vitest run tests/work-registry-build-profile.test.ts tests/release-builder-config.test.ts tests/work-release-scripts.test.ts --pool=threads --maxWorkers=1` | Profile ingress, builder resource wiring, unpacked-resource guard, and ordinary build regressions pass together. | Arbitrary profile copying, missing/unexpected resource, malformed descriptor, unsafe diagnostics, or build-info resource regression fails. | LOCAL_TRANSIENT | local apps/work | TARGETED_RERUN | yes |
| V09 | CLM-14 | DIFF_SCOPE | LOCAL | `npm --prefix apps/work run guard` | Scope guards and completion audit preserve approved ownership boundaries. | Credential/provider logic, Renderer/Runtime configuration, CSP, or new Registry client changes fail scope review. | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |

## Immediate Read

- `apps/work/scripts/generate-work-build-info.mjs`
- `apps/work/scripts/lib/work-release-guard.mjs#assertWorkBuildInfo`
- `apps/work/electron-builder.yml`
- `apps/work/package.json#scripts`
- `apps/work/scripts/build-work-release.ps1`
- `apps/work/tests/release-builder-config.test.ts`
- `apps/work/tests/work-release-scripts.test.ts`
- `apps/work/src/main/registry.ts#resolveRegistry`
- `apps/work/lat.md/registry-endpoint-configuration.md`

## Triggered Read

- If electron-builder file-set filtering cannot express optional Community absence: inspect its installed configuration contract before selecting a minimal alternative; do not add a second builder owner.
- If a package entry point bypasses the shared preparation path: inspect only that entry point and its direct caller before extending the common build command.
- If local Windows packaging cannot run because a required toolchain is absent: record `VERIFICATION_BLOCKED` with the missing capability; do not substitute source-tree inspection for V04.
- Otherwise: do not read unrelated Work domains, provider repositories, reference trees, build outputs, runtime data, or other Plans.

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/scripts/lib/work-registry-build-profile.mjs` | BUILD | ADD | Existing Work build pipeline | T1 | One complete profile file is validated/prepared before every package command and safely writes/removes the generated resource. | Enterprise profile ingress and generated descriptor | yes |
| C01 | `apps/work/scripts/generate-work-registry-config.mjs` | BUILD | ADD | Existing Work build pipeline | T1 | One complete profile file is validated/prepared before every package command and safely writes/removes the generated resource. | Enterprise profile ingress and generated descriptor | yes |
| C01 | `apps/work/package.json` | CONFIG | MODIFY | Existing Work build pipeline | T1 | One complete profile file is validated/prepared before every package command and safely writes/removes the generated resource. | Enterprise profile ingress and generated descriptor | no |
| C01 | `apps/work/tests/work-registry-build-profile.test.ts` | TEST | ADD | Existing Work build pipeline | T1 | One complete profile file is validated/prepared before every package command and safely writes/removes the generated resource. | Enterprise profile ingress and generated descriptor | yes |
| C02 | `apps/work/electron-builder.yml` | BUILD | MODIFY | Existing Work electron-builder configuration | T2 | Enterprise resource is copied conditionally; Community output carries none. | Conditional Registry resource selection | no |
| C02 | `apps/work/tests/release-builder-config.test.ts` | TEST | MODIFY | Existing Work electron-builder configuration | T2 | Enterprise resource is copied conditionally; Community output carries none. | Conditional Registry resource selection | no |
| C03 | `apps/work/scripts/lib/work-release-guard.mjs` | BUILD | MODIFY | Existing Work release pipeline | T3 | Windows release path prepares the selected mode and validates unpacked descriptor presence/absence and semantics. | Windows package validation | no |
| C03 | `apps/work/scripts/build-work-release.ps1` | BUILD | MODIFY | Existing Work release pipeline | T3 | Windows release path prepares the selected mode and validates unpacked descriptor presence/absence and semantics. | Windows package validation | no |
| C03 | `apps/work/tests/work-release-scripts.test.ts` | TEST | MODIFY | Existing Work release pipeline | T3 | Windows release path prepares the selected mode and validates unpacked descriptor presence/absence and semantics. | Windows package validation | no |
| C04 | `apps/work/scripts/test-work-registry-package.ps1` | TEST | ADD | Existing Work build regression boundary | T4 | Reproducible local Windows enterprise-to-Community proof and all-entrypoint preparation regression coverage exist. | Build/package regression coverage | yes |
| C04 | `apps/work/tests/work-registry-package-entrypoints.test.ts` | TEST | ADD | Existing Work build regression boundary | T4 | Reproducible local Windows enterprise-to-Community proof and all-entrypoint preparation regression coverage exist. | Build/package regression coverage | yes |
| C05 | `apps/work/lat.md/lat.md` | DOC | MODIFY | Work LAT | T5 | LAT records delivered build-profile and package-proof behavior while retaining RM-01 ownership. | Work LAT | no |
| C05 | `apps/work/lat.md/registry-endpoint-configuration.md` | DOC | MODIFY | Work LAT | T5 | LAT records delivered build-profile and package-proof behavior while retaining RM-01 ownership. | Work LAT | no |
| C06 | `apps/work/src/main/registry.ts`; Registry IPC/preload/Renderer; Hermes Runtime/Agent/CLI/Skill Run owners | PROD | KEEP | Existing owners | - | Existing RM-01 runtime source consumption and unrelated boundaries remain unchanged. | Ownership boundary | no |

## Domain Activation Ledger

None

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | MINIMAL_NEW | Existing `generate-work-build-info.mjs` establishes generated-resource convention but has no reusable complete-profile validation; `package.json#scripts` is the common package-entry integration point. | Two small dependency-free build helpers separate profile validation/preparation from immutable build identity and give every entry point one shared operation; no runtime service, client, or dependency is added. |
| C02 | MODIFY_EXISTING | `electron-builder.yml#extraResources` is the sole package-resource mapping; RM-01 already recognizes the packaged `resources/` path. | Extend the existing declarative packaging owner with an optional file-set rule instead of generating a second builder config or changing Main. |
| C03 | MODIFY_EXISTING | `build-work-release.ps1` already orchestrates Windows packaging and `work-release-guard.mjs` already validates final `win-unpacked` resources. | Extend the existing release proof seam rather than create a parallel release command or inspect source output. |
| C04 | MINIMAL_NEW | Existing tests cover build identity/configuration but do not prove enterprise then Community package resources or cross-entrypoint preparation; release command has signing prerequisites. | A test-only PowerShell harness is the smallest reproducible local package proof and leaves production release policy unchanged. |
| C05 | MODIFY_EXISTING | `registry-endpoint-configuration.md` already owns RM-01 descriptor and RM-02 packaging boundary. | Update one existing node and its index reference; no parallel architecture document is needed. |
| C06 | REUSE_EXISTING | `registry.ts#resolveRegistry` consumes `work-registry-config.json` through its existing build source and no boundary requires a new API. | KEEP avoids duplicate runtime configuration or client ownership. |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C01 | `apps/work/scripts/lib/work-registry-build-profile.mjs`; `apps/work/scripts/generate-work-registry-config.mjs`; `apps/work/package.json`; `apps/work/tests/work-registry-build-profile.test.ts` | `apps/work/scripts/generate-work-build-info.mjs`; `apps/work/scripts/lib/work-release-guard.mjs#readPackageVersion`; `apps/work/src/main/registry.ts#resolveRegistry` | - | no |
| T2 | C02 | `apps/work/electron-builder.yml`; `apps/work/tests/release-builder-config.test.ts` | T1 `apps/work/package.json`; `apps/work/src/main/registry.ts#buildDescriptorPaths` | T1 | no |
| T3 | C03 | `apps/work/scripts/lib/work-release-guard.mjs`; `apps/work/scripts/build-work-release.ps1`; `apps/work/tests/work-release-scripts.test.ts` | T1 profile preparation command; T2 electron-builder resource rule | T1, T2 | no |
| T4 | C04 | `apps/work/scripts/test-work-registry-package.ps1`; `apps/work/tests/work-registry-package-entrypoints.test.ts` | T1 package command; T2 resource rule; T3 Windows verifier | T1, T2, T3 | no |
| T5 | C05 | `apps/work/lat.md/lat.md`; `apps/work/lat.md/registry-endpoint-configuration.md` | T1–T4 delivered behavior; approved PRD and Roadmap | T1, T2, T3, T4 | no |

## Integration Hotspots

| File | Owner Todo | Reason |
|---|---|---|
| `apps/work/package.json` | T1 | All supported package scripts use one profile-preparation command before Electron packaging; later Todos may read only. |
| `apps/work/electron-builder.yml` | T2 | Only T2 changes descriptor resource inclusion; it must retain existing build-info inclusion. |
| `apps/work/scripts/lib/work-release-guard.mjs` | T3 | Only T3 extends package assertions; it imports and reuses T1's profile semantics rather than duplicating validation. |
| `apps/work/lat.md/registry-endpoint-configuration.md` | T5 | Only T5 changes final architecture wording after behavior is proven. |

## Generated Outputs Ledger

| Source Change | Generator Owner | Generated Outputs | Command | Drift Check |
|---|---|---|---|---|
| C01 | T1 profile preparation helper | `apps/work/resources/work-registry-config.json` only in enterprise mode; absent in Community mode | `node apps/work/scripts/generate-work-registry-config.mjs` | V01 proves profile normalization/removal; V04 proves final package presence/absence. |
| C02 | electron-builder | `dist/win-unpacked/resources/work-registry-config.json` only in enterprise Windows package | `node apps/work/scripts/run-electron-builder.mjs --win` via T4 harness | V04 compares unpacked resource semantics to selected mode. |

## New File Justification

| Change ID | File | Necessity | Owner Impact |
|---|---|---|---|
| C01 | `apps/work/scripts/lib/work-registry-build-profile.mjs` | One dependency-free pure validator/preparer must be reused by package generation and release proof; neither existing build identity nor release guard owns complete profile semantics. | Build-only helper under the existing Work build pipeline; not a runtime Registry owner. |
| C01 | `apps/work/scripts/generate-work-registry-config.mjs` | The generated descriptor needs one explicit, callable build entry point shared by all package scripts. | Build-only generated-entrypoint wrapper over the shared helper. |
| C01 | `apps/work/tests/work-registry-build-profile.test.ts` | Existing tests do not cover complete profile validation, failure sanitization, and stale-resource lifecycle. | Test-only coverage. |
| C04 | `apps/work/scripts/test-work-registry-package.ps1` | Existing release command requires release/signing inputs and cannot prove both local enterprise and Community packages. | Test-only local packaging harness; does not alter release policy. |
| C04 | `apps/work/tests/work-registry-package-entrypoints.test.ts` | Existing config/release tests do not assert every supported package entry point invokes the shared preparation. | Test-only regression coverage. |

## New Dependency Justification

None — Node.js standard library, existing electron-builder configuration, PowerShell, Vitest, and current release helpers are sufficient.

## Todo T1 — Registry build profile preparation

**Owns Changes**
- C01

**Goal**

Make one complete non-secret profile-file contract the only enterprise selection input, and make every supported package command invoke the same preflight/generation lifecycle.

**Immediate anchors**
- `apps/work/scripts/generate-work-build-info.mjs`
- `apps/work/scripts/lib/work-release-guard.mjs#readPackageVersion`
- `apps/work/package.json#scripts`

**Changes**
- Add a dependency-free build-profile helper that validates/normalizes the complete descriptor contract, clears the known generated resource before selected-profile failure, and produces/removes only the fixed generated resource for enterprise/Community mode.
- Add one callable generation entry point and wire every supported package command to it before Electron packaging, without changing package selection through Runtime or Renderer.
- Add focused red/green coverage for valid enterprise profile, unset Community cleanup, invalid selection, userinfo/credential rejection, and sanitized output.

**Stop conditions**
- [ ] Profile selection is atomic, complete, and never merges fields or infers providers.
- [ ] Enterprise and Community preparation are idempotent for the fixed generated resource.
- [ ] Invalid selected input exits before builder invocation and leaves no stale generated descriptor.
- [ ] T1 focused test passes.

**Triggered reads**
- If existing release helper behavior conflicts with a shared pure validator: read only its direct exports and preserve current identity validation.

## Todo T2 — Conditional Electron resource inclusion

**Owns Changes**
- C02

**Goal**

Make electron-builder include the generated Registry descriptor only when enterprise preparation produced it, while retaining existing Work build identity resources.

**Immediate anchors**
- `apps/work/electron-builder.yml`
- `apps/work/tests/release-builder-config.test.ts`
- `apps/work/src/main/registry.ts#buildDescriptorPaths`

**Changes**
- Extend the existing electron-builder resource mapping with an optional resource rule compatible with RM-01's existing packaged lookup path.
- Add configuration regression coverage for enterprise inclusion capability, Community absence, and unchanged work-build-info mapping.

**Stop conditions**
- [ ] No static Registry descriptor forces Community packages to carry a stale file.
- [ ] Existing `work-build-info.json` packaging remains intact.
- [ ] T2 focused test passes.

**Triggered reads**
- If optional file-set behavior is unsupported by the installed electron-builder version: inspect only its configuration contract and select the smallest existing-config-compatible rule.

## Todo T3 — Windows packaged resource verification

**Owns Changes**
- C03

**Goal**

Extend the existing Windows release seam to prepare the selected mode and validate the actual unpacked Registry resource without copying profile input or exposing sensitive diagnostic content.

**Immediate anchors**
- `apps/work/scripts/build-work-release.ps1`
- `apps/work/scripts/lib/work-release-guard.mjs#assertWorkBuildInfo`
- `apps/work/tests/work-release-scripts.test.ts`

**Changes**
- Reuse the T1 helper semantics from the release pipeline before package assembly.
- Add reusable guard assertions and CLI handling for enterprise descriptor semantic matching and Community absence at the unpacked resource location.
- Add release-helper regression coverage for valid/missing/unexpected/mismatched resources and no secret-bearing diagnostics.

**Stop conditions**
- [ ] Release build proof reads unpacked package output, never only source-tree generation.
- [ ] Guard distinguishes enterprise expected presence from Community required absence.
- [ ] T3 focused test passes.

**Triggered reads**
- If the release manifest needs a descriptor reference to prove package selection: preserve current manifest schema unless an approved PRD revision authorizes an externally visible release contract change.

## Todo T4 — Cross-entrypoint package regression

**Owns Changes**
- C04

**Goal**

Provide reproducible local proof that all package paths use one preparation contract and that a real Windows unpacked enterprise-then-Community sequence has the required resource state.

**Immediate anchors**
- `apps/work/package.json#scripts`
- `apps/work/scripts/run-electron-builder.mjs`
- `apps/work/scripts/build-work-release.ps1`

**Changes**
- Add a test-only entry-point regression suite that covers supported package script preparation uniformly.
- Add a test-only local PowerShell package harness that creates non-secret temporary complete input, assembles enterprise and Community Windows unpacked packages sequentially, and validates each final resource through T3's guard.
- Keep generated package outputs outside tracked source and avoid release signing/publishing paths.

**Stop conditions**
- [ ] Harness performs real local package assembly and checks final unpacked output for both modes.
- [ ] No live Registry endpoint, credential, or release promotion is needed.
- [ ] T4 entry-point regression and V04 package proof pass, or an explicit toolchain blocker is recorded.

**Triggered reads**
- If `--win` packaging requires a missing local capability: identify only that toolchain prerequisite and return a delivery verification blocker rather than replacing package proof with a fixture-only test.

## Todo T5 — Registry build profile LAT closure

**Owns Changes**
- C05

**Goal**

Record the delivered RM-02 profile ownership, conditional package resource lifecycle, Windows proof boundary, and preserved RM-01 runtime consumer behavior.

**Immediate anchors**
- `apps/work/lat.md/lat.md`
- `apps/work/lat.md/registry-endpoint-configuration.md`

**Changes**
- Replace RM-02 future-only wording with the actual build-profile and package-proof contract.
- Keep the Main resolver, Runtime, Renderer, and provider-neutral boundaries explicit.

**Stop conditions**
- [ ] LAT describes both enterprise resource inclusion and Community absence without claiming unimplemented release policy.
- [ ] `lat check` passes.

**Triggered reads**
- None unless an implementation result contradicts the approved PRD, in which case return to PRD review rather than rewriting architecture documentation.

## Verification

Run every Verification Ledger entry through `smc-plan-delivery/scripts/evidence.py`; all are blocking LOCAL evidence. V04 must not be replaced by source-tree inspection when Windows package tooling is unavailable.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | All Cursor todos are completed; completion audit and implementation review are FRESH PASS; V01–V09 and every blocking claim are FRESH PASS; durable evidence manifest is FRESH. | V01, V02, V03, V04, V05, V06, V07, V08, V09 plus durable evidence manifest |
| IMPLEMENTED_NOT_PROVEN | Implementation exists but a package proof, review, claim, or other evidence gate is pending or stale. | Pending or stale gate IDs |
| BLOCKED | A required local Windows packaging capability or approved dependency prevents V04. | Explicit blocker record |
| RETURN_PRD | Implementing the profile/package contract requires an unapproved owner or boundary change. | PRD revision request |
