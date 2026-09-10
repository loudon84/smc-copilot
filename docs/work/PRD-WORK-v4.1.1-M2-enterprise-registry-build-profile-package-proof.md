---
work_item_id: RM-02
version: 1.0.1
status: APPROVED
target_branch: work/prd-v4.1
review_verdict: PASS
approved_at: 2026-09-10T13:26:46+08:00
source_revision: AD-WORK-v4.1.1-SKILL-REGISTRY-ENDPOINT-CONFIGURATION@1.0.1/RM-02 + user-input:2026-09-10-ci-profile-file
grounded_commit: 96e73e7bfa76f2ec02dba3466bd4430ff6d2ca6c
---

# PRD-WORK-v4.1.1-M2 — Enterprise Registry Build Profile & Package Proof

RM-02 extends the existing Work build pipeline so a CI or release machine can provide one complete, non-secret Registry profile JSON, preflight it, package the resulting descriptor only for an enterprise build, and prove the Windows package contains the selected resource.

## Outcome

An enterprise Work package deterministically embeds exactly one validated `WorkRegistryEndpointDescriptor` as `work-registry-config.json`; a Community package embeds none and continues to use RM-01's public default descriptor. Invalid, partial, unsafe, or unreadable enterprise input fails before Electron packaging and cannot leave a stale descriptor in a subsequent Community package.

## Scope

### In

- A Main-build-only CI/release input contract for one complete enterprise Registry profile JSON, selected through `SMC_WORK_REGISTRY_BUILD_PROFILE_FILE`.
- Deterministic preflight and generation of the package resource consumed by RM-01's existing `build` source.
- Conditional Electron resource inclusion: enterprise packages contain the generated descriptor; Community packages contain no Registry descriptor resource.
- Uniform profile preparation for every supported Work platform package entry point before Electron packaging; Windows remains the final unpacked-package proof target for this stage.
- Existing Windows release/package validation extended to inspect the unpacked package resource and prove profile selection, absence, and descriptor integrity.
- Build-oriented regression evidence, LAT documentation, and no-secret diagnostic behavior.

### Out

- Changes to `apps/work/src/main/registry.ts`, descriptor source precedence, Registry IPC/preload, Renderer UI/CSP, Hermes Runtime descriptor, Agent/CLI, Skill Run, authentication, or Registry service behavior.
- Partial endpoint environment-variable overrides, provider/host inference, Git adapter logic, credential/header injection, TLS/certificate deployment, and Registry content governance.
- A committed enterprise endpoint/profile, installer signing/publishing policy changes, or a new UI/profile selector.

## Build Profile Contract

`SMC_WORK_REGISTRY_BUILD_PROFILE_FILE` is optional for ordinary Community builds. When set, it must name an absolute, readable regular JSON file supplied by CI or the release operator. Its JSON value is a complete RM-01 `WorkRegistryEndpointDescriptor`, not a partial overlay: it includes the supported schema version, safe `registryId`, and every required `indexUrl`, `modelsUrl`, `contentBaseUrl`, `treeUrl`, and `webBaseUrl`; `iconBaseUrl` remains optional and HTTPS-only.

The generator applies the same externally observable descriptor validity rules as the RM-01 consumer: absolute HTTP(S) endpoint URLs, no URL userinfo, no credentials, no unknown schema version, and no field merging. It writes the normalized descriptor to the sole packaged resource name `work-registry-config.json`. The input path, raw JSON, complete endpoint URLs, userinfo, and any unexpected parser exception are not emitted to normal build diagnostics.

An unset profile selection means Community mode. Community mode removes or excludes any generated Registry descriptor before package assembly; it must never reuse a descriptor left by an earlier enterprise build in the same checkout or workspace.

## Package and Ownership Boundary

The existing Work build pipeline remains the only owner of profile preflight, generated build resources, Electron resource selection, and package inspection. The existing RM-01 Main Registry owner remains the only runtime consumer of a packaged descriptor. Electron packaging includes the resource conditionally, rather than introducing a second descriptor loader or a Renderer-readable configuration surface.

The selected profile mode applies before Electron packaging for every supported Work platform package entry point. For enterprise mode, the unpacked Windows application resource is semantically equal to the validated complete profile selected for that build. For Community mode, that resource is absent, allowing RM-01 to select its in-code public default. The build input file itself is never copied as an arbitrary profile artifact.

The existing release verification path proves the actual unpacked Windows package resource, not merely a source-tree file. It rejects a missing, malformed, unexpected, or semantically mismatched enterprise descriptor and rejects an unexpected descriptor in a Community package. Diagnostics identify the failure category without printing secret-bearing input.

## Current Capability Inventory

| Capability | State | Production Owner | Grounding |
|---|---|---|---|
| Complete Registry descriptor consumption | EXISTS | Work Main Registry owner | RM-01 implementation in `apps/work/src/main/registry.ts`; packaged descriptor is already the highest-priority runtime source. |
| Work build identity resource generation | EXISTS | Work build pipeline | `apps/work/scripts/generate-work-build-info.mjs` deterministically writes `resources/work-build-info.json`. |
| Electron resource injection | EXISTS | Work electron-builder configuration | `apps/work/electron-builder.yml` injects the generated build identity via `extraResources`. |
| Windows release/package inspection | EXISTS | Work release pipeline | `apps/work/scripts/build-work-release.ps1` inspects `dist/win-unpacked/resources/work-build-info.json`; release guard validates its contract. |
| Enterprise Registry profile preflight and generated descriptor | MISSING | Extend existing Work build pipeline | No profile ingress, descriptor generator, or safety gate exists. |
| Conditional Registry resource selection | MISSING | Extend existing Work build pipeline | Current electron-builder resource list has no Registry descriptor rule. |
| Package-level Registry descriptor proof | MISSING | Extend existing Work release pipeline | Existing proof covers build identity only. |

## Target End-State Inventory

| Capability | Target State | Production Owner | Boundary |
|---|---|---|---|
| Enterprise complete profile ingress and preflight | MODIFY | Existing Work build pipeline | One explicit CI/release file yields one validated descriptor; invalid input stops before package assembly. |
| Generated Registry package resource | MODIFY | Existing Work build pipeline | Enterprise only; generated deterministically and no raw profile artifact is copied. |
| Electron resource selection | MODIFY | Existing Work electron-builder configuration | Enterprise includes exactly the generated descriptor; Community includes none. |
| Windows package validation | MODIFY | Existing Work release pipeline | Inspect the final unpacked resource for selection, absence, schema, and semantic integrity. |
| RM-01 Registry runtime consumer | KEEP | Existing Work Main Registry owner | Continues to resolve build > runtime > default; receives no new package-selection behavior. |
| Renderer/IPC/Runtime/Agent/CLI/Skill Run | KEEP | Existing owners | No new config access, protocol, or ownership. |

## Change Classification

| Change ID | Classification | Capability | Required change | Production Owner |
|---|---|---|---|---|
| C01 | MODIFY | Existing Work build pipeline | Accept the explicit complete profile-file contract; preflight, normalize, and generate the enterprise descriptor without logging confidential input. | Existing Work build pipeline |
| C02 | MODIFY | Existing Electron resource selection | Include the generated descriptor only for enterprise packages and ensure Community builds cannot inherit a stale resource. | Existing Work electron-builder configuration |
| C03 | MODIFY | Existing Windows release/package validation | Validate the unpacked Windows resource according to enterprise/Community selection and descriptor integrity. | Existing Work release pipeline |
| C04 | MODIFY | Existing build regression coverage | Prove profile preflight, Community absence, enterprise packaging selection, and fail-closed behavior using the established build/release test boundary. | Existing Work build pipeline |
| C05 | MODIFY | Work LAT | Record build-profile ownership, selection, resource proof, and the preserved RM-01 runtime boundary. | Work LAT |
| C06 | KEEP | Registry Main consumer, IPC/preload/Renderer, Hermes Runtime, Agent/CLI, Skill Run | Preserve all runtime behavior and ownership from RM-01; no new configuration surface or provider-specific logic. | Existing owners |

## Behaviour Requirements

### Enterprise build

When `SMC_WORK_REGISTRY_BUILD_PROFILE_FILE` identifies a valid complete profile, the build pipeline selects enterprise mode, writes one normalized descriptor resource, and packages that resource. The enterprise resource must make RM-01 select `build` even if a runtime descriptor environment variable is present at application launch.

### Community build

When no enterprise profile file is selected, the build pipeline selects Community mode and packages no Registry descriptor. It removes or excludes stale generated output before Electron package assembly, so RM-01 selects the public `default` descriptor in the packaged application.

### Cross-platform package preparation

Every supported Work platform package entry point runs the same enterprise/Community profile preparation before it invokes Electron packaging. This stage requires final unpacked-resource proof on Windows; it does not claim an installer proof for other platforms, but they cannot bypass preflight or silently select a different profile mode.

### Fail-closed preflight

When the environment variable is empty, relative, unreadable, non-regular, malformed, incomplete, unsupported-version, credential-bearing, or otherwise unsafe, the enterprise build fails before Electron packaging. It neither falls back to Community mode nor packages a prior generated descriptor.

### Package proof and secrecy

The Windows release/package path verifies the final unpacked application resource for the chosen mode. Validation failures are stable and actionable but do not print the profile path, raw document, endpoint query/userinfo, token, or arbitrary exception text. The generated descriptor and package logs contain no credentials because the contract forbids them.

## Acceptance Criteria

- **AC-01**: A CI/release build can select enterprise mode only through a complete descriptor file designated by `SMC_WORK_REGISTRY_BUILD_PROFILE_FILE`; no partial endpoint override or provider inference exists.
- **AC-02**: A valid enterprise profile is preflighted before every supported Work platform package assembly and produces exactly one normalized `work-registry-config.json` package resource with the same descriptor semantics.
- **AC-03**: An unset enterprise profile produces Community package output with no Registry descriptor resource; stale enterprise output cannot affect a later Community build in the same workspace.
- **AC-04**: Any present but invalid enterprise profile fails closed before Electron packaging and does not fall back to Community or preserve/package an old descriptor.
- **AC-05**: A final unpacked Windows enterprise package is verified to contain a valid descriptor matching the selected profile; a Community package is verified to omit it.
- **AC-06**: Package/profile diagnostics and committed fixtures contain no credential, URL userinfo, raw profile body, or profile path; build output does not copy arbitrary input files.
- **AC-07**: The delivered enterprise package still uses RM-01's existing `build > runtime > default` consumer semantics, while Community packaging preserves `default`; no Registry Main, IPC/preload, Renderer, Runtime, Agent/CLI, or Skill Run contract changes occur.
- **AC-08**: Existing Work guard, Node/Web typecheck, relevant build/package regression checks, and `lat check` pass.
- **AC-09**: Every supported Work platform package entry point applies the same profile preparation before Electron packaging. Windows package proof verifies the final unpacked resource; non-Windows package paths cannot bypass preflight or select a different mode.

## Evidence Baseline

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason |
|---|---|---|---|---|---|---|---|
| CL-01 | AC-01 | Existing build scripts generate a package resource but have no Registry profile ingress. | yes | `generate-work-build-info.mjs`; `electron-builder.yml` | PROVEN_BUT_AFFECTED | TARGETED_RERUN | C01 introduces a new build-time trust boundary. |
| CL-02 | AC-02 | A valid complete profile becomes the single packaged Registry descriptor. | yes | No existing Registry resource generator | NOT_TESTED | NEW_EVIDENCE | New enterprise package capability. |
| CL-03 | AC-03 | Community packaging omits the Registry resource even after an enterprise build. | yes | No existing conditional resource rule | NOT_TESTED | NEW_EVIDENCE | New stale-artifact prevention behavior. |
| CL-04 | AC-04 | Invalid selected profile stops packaging without fallback or stale output. | yes | Existing build identity guard only checks dirty Git state | NOT_TESTED | NEW_EVIDENCE | New preflight and failure boundary. |
| CL-05 | AC-05 | The final unpacked Windows package, rather than source output, proves profile selection and descriptor integrity. | yes | Existing release path verifies `work-build-info.json` in `win-unpacked` | PROVEN_BUT_AFFECTED | TARGETED_RERUN | C03 extends the package proof contract. |
| CL-06 | AC-06 | No secrets or raw profile content are emitted or copied. | yes | RM-01 descriptor contract forbids credentials | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Build ingress and diagnostics are new. |
| CL-07 | AC-07 | RM-01 consumer and unrelated owners remain unchanged. | yes | RM-01 evidence manifest `WORK-V4.1.1-REGISTRY-RM-01` | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Packaging is added at the descriptor's build source boundary. |
| CL-08 | AC-08 | Work regression and LAT checks remain green. | yes | RM-01 V03–V05, V07 fresh evidence | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Build/release and LAT behavior changes. |
| CL-09 | AC-09 | All supported platform package paths apply the same selected profile preparation before Electron packaging. | yes | Current package entry points are not uniform | FAILED | NEW_EVIDENCE | Cross-entry-point profile behavior is absent. |

## Source Anchors

| Capability | Evidence anchor |
|---|---|
| Existing Registry build-source consumer | `apps/work/src/main/registry.ts` |
| Existing generated package resource | `apps/work/scripts/generate-work-build-info.mjs` |
| Existing Electron resource inclusion | `apps/work/electron-builder.yml` |
| Existing Windows package/resource proof | `apps/work/scripts/build-work-release.ps1`; `apps/work/scripts/lib/work-release-guard.mjs` |
| Existing build/release configuration regression boundary | `apps/work/tests/release-builder-config.test.ts`; `apps/work/tests/work-release-scripts.test.ts` |
| Approved architecture decision | `docs/work/AD-WORK-v4.1.1-skill-registry-endpoint-configuration.md` |
| Roadmap item | `docs/work/ROADMAP-WORK-v4.1.1-skill-registry-endpoint-configuration.md` RM-02 |

## Definition of Done

- **DOD-01**: C01–C06 are delivered through one canonical RM-02 Plan; no other Plan or Roadmap item is implemented.
- **DOD-02**: CL-01–CL-09 have fresh blocking evidence or valid targeted reuse; current FAIL/NOT_TESTED evidence is not treated as complete.
- **DOD-03**: Completion Audit, independent implementation review, all blocking verification, and durable evidence manifest pass before the implementation commit.
- **DOD-04**: RM-02 moves to DONE only with a real implementation commit and parseable evidence reference from the Windows package proof.
- **DOD-05**: Any need to add credentials/auth headers, partial endpoint inputs, host/provider inference, Runtime descriptor mutation, Renderer configuration access, HTTP icon/CSP changes, or a new Registry client returns to Architecture review.
