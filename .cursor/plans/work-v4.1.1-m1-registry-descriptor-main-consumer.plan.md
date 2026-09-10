---
name: Work v4.1.1 Registry Descriptor Main Consumer
overview: Add one validated, source-aware endpoint descriptor to the existing Main Registry owner while preserving Renderer, Hermes Runtime, and RM-02 packaging boundaries.
todos:
  - id: t1-descriptor-resolution-unified-registry-owner
    content: "T1 — Descriptor resolution and unified Registry owner [C01, C02, C03, C04, C05]"
    status: completed
  - id: t2-registry-lat-closure
    content: "T2 — Registry LAT closure [C07]"
    status: completed
isProject: false
plan_contract: smc.plan.v3.5
plan_id: WORK-V4.1.1-REGISTRY-RM-01
domain_contract: smc.ges.domain-activation.v1
consumer_profile: generic@1.0.0
domain_policy_digest: sha256:78167a10490bbe109ad2f006cfe74ff1390b2187cb6728004964448f2a5c5907
commit_policy: post_review
acceptance_contract: smc.acceptance.v1
source_revision: AD-WORK-v4.1.1-SKILL-REGISTRY-ENDPOINT-CONFIGURATION@1.0.1/RM-01
grounded_commit: 2afa1963934432cae28c1000e91a678d739c6a8d
grounding_source: committed_baseline
working_tree_fingerprint: clean
---

# Work v4.1.1 Registry Descriptor Main Consumer Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.1.1-M1-registry-descriptor-main-consumer.md)

## Scope

- In: complete Registry descriptor validation; packaged/runtime/default source resolution; one-source URL/path construction; catalog/model/tree cache identity; stable sanitized Registry errors and initialization telemetry; focused tests and LAT.
- Out: enterprise endpoint values, build profile generator/CLI, electron-builder resource inclusion, installer/package proof, authentication, Git-host inference, Hermes Agent/CLI, Hermes Runtime descriptor, Skill Run, new Registry IPC/settings, HTTP icons, CSP changes, or Main icon proxy.
- Production Owner inherited from PRD: existing `apps/work/src/main/registry.ts` remains the single Registry network/cache/detail/install owner; existing Main IPC/preload and Renderer surfaces remain consumers.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/registry.ts` | GitHub constants close over one public source; no descriptor schema/validator | Existing file and constants resolve at grounded commit | `toItem`, `fetchRegistry`, `fetchModelRegistry`, `tryFetchText`, `fetchManifest`, `listFolderFiles`, `downloadFolder` consume them | `build-info.ts` supplies packaged-resource precedent; stdlib `fs/path/URL` is sufficient; add descriptor/validator inside existing owner | PASS |
| C02 | `apps/work/src/main/registry.ts` | No build/runtime/default source resolver | Existing lazy Registry exports and module caches resolve | Existing IPC handlers invoke exports on demand, allowing one decision before network | `build-info.ts#loadWorkBuildInfo` and `load-env.ts` provide resource/env precedents; add cached resolver/reset seam without Hermes Runtime config changes | PASS |
| C03 | `apps/work/src/main/registry.ts` | Catalog/detail/tree/download/homepage/icon URLs use fixed GitHub constants | All required symbols resolve at grounded commit | Discover/Tools/install/detail converge on this module | Module constants are the shared root cause; modify owner once and validate content paths before URL construction | PASS |
| C04 | `apps/work/src/main/registry.ts` | Catalog/model/tree caches have timestamps only | `cache`, `modelCache`, `treeCache` resolve | All cache readers/writers are local | Reuse current TTL caches and add descriptor identity/reset without a second store | PASS |
| C05 | `apps/work/src/main/registry.ts`; `apps/work/src/shared/registry.ts` | Free-form errors, swallowed detail failures, no stable source log | Existing result interfaces/exports resolve; no focused Registry test exists | Existing IPC forwards DTOs; Renderer consumes error/homepage/icon | Extend existing DTOs/logging, preserve HTTPS icon presentation, and add no IPC/CSP/UI | PASS |
| C06 | `apps/work/src/main/app/start.ts`; unrelated Work subsystems | Existing CSP and subsystem ownership resolve at grounded commit | Registry Main owner does not require writes to Renderer, Runtime, Agent/CLI, Skill Run, Chat, Session, MCP, Profile, Cron or Kanban | Scope search confirms the descriptor can remain inside the existing Registry owner | Keep existing files and boundaries unchanged; guard/diff verification owns the negative proof | PASS |
| C07 | `apps/work/lat.md/lat.md`; `apps/work/lat.md/registry-endpoint-configuration.md` | LAT root exists; descriptor node absent at grounded commit | Root resolves; dedicated node is new | Work `AGENTS.md` requires architecture/test behavior in LAT | Reuse index/node pattern with one focused node/link; keep RM-02 future | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | Public default — With no build/runtime source, the resolver selects `default`; catalog, models, detail and install transport use the public complete descriptor and existing normalized DTO shapes remain compatible. | BEHAVIOR | C01, C02, C03, C05 | T1 | V06 | INTEGRATION | yes |
| AC-02 | AC | Atomic precedence — Valid build + valid `HERMES_SKILL_REGISTRY_CONFIG_FILE` selects build; absent build + valid runtime file selects runtime; both absent selects default. No descriptor is assembled by merging fields from different sources, and `HERMES_SKILL_REGISTRY_URL` is never read. | LIFECYCLE | C01, C02 | T1 | V01 | UNIT | yes |
| AC-03 | AC | Invalid selected source — Present but empty/unreadable/malformed, unsupported-version, partial, non-HTTP(S), relative or userinfo-bearing build/runtime input returns `SKILL_REGISTRY_CONFIG_INVALID` and performs zero Registry network requests and zero fallback requests. A set runtime path must be absolute and point to a readable regular JSON file. | SECURITY | C01, C02, C05 | T1 | V01 | UNIT | yes |
| AC-04 | AC | Unified source — For each source, catalog, models, detail, manifest, tree, download, homepage and optional icon derive from the same selected descriptor. Tree accepts only the frozen `{tree:[{path,type}]}` contract; content paths cannot escape `contentBaseUrl`; `iconBaseUrl` accepts HTTPS only, and its absence produces no icon/public icon request; no hostname/provider-specific adapter is used. | CONTRACT | C01, C03 | T1 | V06 | INTEGRATION | yes |
| AC-05 | AC | Unavailable source — A validated selected Registry that returns network, status or response-shape failure produces `SKILL_REGISTRY_UNAVAILABLE`; it does not access a lower-priority source and does not expose raw response/body/path/credentials. | SECURITY | C03, C05 | T1 | V02 | INTEGRATION | yes |
| AC-06 | AC | Cache isolation — Catalog/model/tree data from one descriptor identity is never returned after initialization with a different identity; same-identity navigation retains cache behavior. | LIFECYCLE | C02, C04 | T1 | V02 | UNIT | yes |
| AC-07 | AC | Existing boundary — Renderer cannot provide/read the Registry descriptor or base endpoint configuration and no new configuration IPC exists. Existing Registry IPC remains the only UI bridge; compatible catalog/action DTO may retain Main-derived item homepage/HTTPS icon plus sanitized error code/message. | SECURITY | C03, C05 | T1 | V06, V07 | DIFF_SCOPE | yes |
| AC-08 | AC | Observability — Initialization records exactly one source decision with `source` and `registryId`; logs and returned errors contain no token, userinfo, query, response body, absolute local path or stack. | OPERATIONS | C02, C05 | T1 | V01, V02 | UNIT | yes |
| AC-09 | AC | Ownership/regression — Hermes Runtime descriptor, Hermes Agent/CLI, Skill Run, Chat, Session, MCP, Profile, Cron and Kanban contracts remain unchanged; Renderer CSP is not broadened; Work guard and package-wide Node/Web typecheck pass. | SCOPE | C06 | T1 | V04, V07 | DIFF_SCOPE | yes |
| AC-10 | AC | RM-02 boundary — RM-01 does not add enterprise profile values, profile CLI, electron-builder resource generation or installer claims. The consumer seam accepts deterministic build fixtures so RM-02 can connect packaging without changing runtime semantics. | SCOPE | C01, C02, C06 | T1 | V07 | DIFF_SCOPE | yes |
| AC-11 | AC | LAT — Work LAT documents complete descriptor ownership, source precedence, selected-source fail-closed behavior, identity-bound cache and the RM-02 packaging boundary; `lat check` passes. | OPERATIONS | C07 | T2 | V05 | DOCUMENT_SEMANTIC | yes |
| DOD-01 | DOD | C01–C07 are delivered by one canonical RM-01 Plan derived from this APPROVED PRD; RM-02 packaging/profile work is absent. | EVIDENCE | C01, C02, C03, C04, C05, C06, C07 | T1, T2 | V03, V05, V07 | DIFF_SCOPE | yes |
| DOD-02 | DOD | CL-01–CL-11 have fresh blocking evidence or explicitly valid reused evidence; no current FAIL/NOT_TESTED claim is treated as complete. | EVIDENCE | C01, C02, C03, C04, C05, C06, C07 | T1, T2 | V01, V02, V03, V05, V06, V07 | DOCUMENT_SEMANTIC | yes |
| DOD-03 | DOD | Completion Audit, independent Implementation Review, all blocking verification and durable evidence manifest pass before implementation commit. | EVIDENCE | C01, C02, C03, C04, C05, C06, C07 | T1, T2 | V05 | DOCUMENT_SEMANTIC | yes |
| DOD-04 | DOD | Roadmap RM-01 moves to DONE only with the real implementation commit and parseable evidence reference; RM-02 becomes READY only after that separate status update. | OPERATIONS | C07 | T2 | V05 | DOCUMENT_SEMANTIC | yes |
| DOD-05 | DOD | Any need for Git-host inference, credentials/auth headers, Renderer descriptor/base endpoint selection, HTTP icon/CSP broadening, Main icon proxy, Hermes Runtime descriptor mutation or provider-specific adapter returns to Architecture instead of expanding the Plan. | SCOPE | C06 | T1 | V03, V07 | DIFF_SCOPE | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Registry source selection | AC-01, AC-02, AC-03, AC-08 | First Registry operation after process/test reset | unresolved; no request begins | Registry singleton stores one validated source/descriptor and logs once | Same singleton stores/returns sanitized config failure; no lower source | V01 |
| Registry data caching | AC-06 | Catalog/model/tree read after selection | lookup requires matching identity and TTL | Existing cache writer records identity/timestamp/data | Failed request does not populate success cache; explicit reset clears source and all caches | V02 |
| Registry content/install | AC-04, AC-05 | Valid catalog path reaches detail/tree/download | relative path remains under content base; source immutable | Existing detail/install owner writes result/success | Invalid path or transport/shape failure writes stable sanitized error; no alternate source | V02 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|
| Packaged descriptor seam | AC-02, AC-03, AC-10 | RM-02 package resource; deterministic RM-01 fixture | `work-registry-config.json`, complete descriptor | Main Registry resolver | schemaVersion, registryId, index/models/content/tree/web URLs, optional icon | Registry validator | present invalid → config-invalid; no runtime/default | process-lifetime source; test reset only | V01, V03 |
| Runtime descriptor | AC-02, AC-03 | `HERMES_SKILL_REGISTRY_CONFIG_FILE` | absolute path to complete JSON descriptor | Main Registry resolver | same complete descriptor; unset alone is absent | Registry validator | set empty/relative/missing/unreadable/invalid → config-invalid | process-lifetime source; test reset only | V01 |
| Descriptor to transport | AC-01, AC-04, AC-05 | Validated descriptor | Credential-free HTTP(S), tree `{tree:[{path,type}]}`, bounded response/path | Existing fetch/detail/install owner | atomic descriptor and safe relative path; optional HTTPS icon; no provider-specific auth/header behavior | Main Registry owner | network/status/shape/bounds → unavailable; no source fallback/raw body | existing force/TTL within registryId | V02, V06 |
| Registry result to UI | AC-05, AC-07 | Existing Registry exports | Existing IPC/preload DTOs | Discover/Tools/Registry Browser | compatible fields, optional code/message, derived homepage/HTTPS icon | Main sanitizer + existing IPC | descriptor/base/path/body/stack absent | existing request; no new channel | V02, V03 |
| LAT state | AC-11, DOD-04 | Implemented behavior | LAT node/index | Maintainers/RM-02 | owner, precedence, failure, cache, icon, stage boundary | `lat check` + audit | stale planned wording/package claim blocks completion | Plan scope fingerprint | V05 |

## Acceptance Claim Ledger

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason | Verification IDs |
|---|---|---|---|---|---|---|---|---|
| CLM-01 | AC-01 | No-config preserves complete public Registry behavior and DTOs | yes | Fixed public Registry implementation | PROVEN_BUT_AFFECTED | TARGETED_RERUN | C01–C03 replace constants | V06 |
| CLM-02 | AC-02 | Resolution is build > runtime > default, atomic, and ignores single URL | yes | No resolver | NOT_TESTED | NEW_EVIDENCE | New capability | V01 |
| CLM-03 | AC-03 | Invalid selected source fails before network/fallback | yes | No validator | NOT_TESTED | NEW_EVIDENCE | New trust boundary | V01 |
| CLM-04 | AC-04 | Every operation uses one descriptor and frozen tree/content contract | yes | Shared GitHub constants | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Endpoint/path logic changes | V06 |
| CLM-05 | AC-05 | Unavailable source emits sanitized code without fallback | yes | Free-form/empty fallback | FAILED | NEW_EVIDENCE | Stable code/no-fallback absent | V02 |
| CLM-06 | AC-06 | Caches cannot cross identity | yes | Unkeyed module caches | FAILED | NEW_EVIDENCE | Identity isolation absent | V02 |
| CLM-07 | AC-07 | IPC stays selection-free and preserves derived item URLs | yes | Current IPC/Renderer | PROVEN_BUT_AFFECTED | TARGETED_RERUN | DTO gains optional code | V06, V07 |
| CLM-08 | AC-08 | One sanitized source/identity event appears | yes | No current event | NOT_TESTED | NEW_EVIDENCE | New operability behavior | V01, V02 |
| CLM-09 | AC-09 | Unrelated owners/CSP/guard/typecheck remain green | yes | RM-18 typecheck evidence | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Main/shared code changes | V04, V07 |
| CLM-10 | AC-10 | No RM-02 generator/profile/package implementation appears | yes | Approved stage split | PROVEN_FRESH | TARGETED_RERUN | Implementation candidate must prove the packaging boundary remains absent | V07 |
| CLM-11 | AC-11 | LAT describes delivered RM-01 and future RM-02 | yes | Approved target-only LAT node | NOT_TESTED | NEW_EVIDENCE | Delivery wording required | V05 |
| CLM-12 | DOD-01 | One canonical Plan owns C01–C07 | yes | Plan identity/ledger | NOT_TESTED | NEW_EVIDENCE | New delivery | V03, V05 |
| CLM-13 | DOD-02 | No failed/untested claim completes without evidence | yes | PRD baseline | NOT_TESTED | NEW_EVIDENCE | Evidence not recorded | V01, V02, V03, V05 |
| CLM-14 | DOD-03 | Post-review evidence gates commit | yes | SMC contract | PROVEN_FRESH | NEW_EVIDENCE | Audit rechecks | V05 |
| CLM-15 | DOD-04 | Roadmap update stays separate and evidence-bound | yes | RM-01 IN_PRD / RM-02 BACKLOG | PROVEN_FRESH | NEW_EVIDENCE | No status write in scope | V05 |
| CLM-16 | DOD-05 | Forbidden architecture expansions are absent | yes | Architecture v1.0.1 | PROVEN_FRESH | NEW_EVIDENCE | Scope audit rechecks | V03 |

## Live Scenario Matrix

| Scenario ID | Claim IDs | Verification IDs | Subject / Fixture | Required Capabilities | Preconditions | Stimulus | Oracle | Environment ID |
|---|---|---|---|---|---|---|---|---|

## Live Environment Matrix

| Environment ID | Required Env Vars | Preflight Command | Fault Driver Env | Candidate Mode | Candidate Probe |
|---|---|---|---|---|---|

## Verification Ledger

| Verification ID | Claim IDs | Level | Acceptance Mode | Entry Point / Command | Oracle | Negative / Regression | Evidence Policy | Environment | Evidence Action | Blocking |
|---|---|---|---|---|---|---|---|---|---|---|
| V01 | CLM-02, CLM-03, CLM-08, CLM-13 | UNIT | LOCAL | `npm --prefix apps/work exec -- vitest run src/main/registry.test.ts --pool=threads --maxWorkers=1` | runtime/build/default resolution, validation and one sanitized init event pass | build blocks runtime; invalid selected source blocks default/network; single URL ignored; malformed/version/protocol/userinfo/file failures | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V02 | CLM-05, CLM-06, CLM-08, CLM-13 | INTEGRATION | LOCAL | `npm --prefix apps/work exec -- vitest run src/main/registry.test.ts --pool=threads --maxWorkers=1` | fake transport proves stable sanitized failure, identity cache isolation and one decision log | traversal, response bounds/network/status, cross-identity cache, raw leakage and lower-source fallback | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V03 | CLM-12, CLM-13, CLM-16 | STATIC | LOCAL | `npm --prefix apps/work run guard` | existing boundary guards pass; completion audit confirms only C01–C07 Plan targets changed | new IPC/settings, Renderer descriptor/fetch, CSP, Runtime config, Agent/CLI/Skill Run/build-profile/auth change | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V04 | CLM-09 | STATIC | LOCAL | `npm --prefix apps/work run typecheck` | Node/Web TypeScript exit 0 | stale consumers or invalid test/config types | LOCAL_TRANSIENT | local apps/work | TARGETED_RERUN | yes |
| V05 | CLM-11, CLM-12, CLM-13, CLM-14, CLM-15 | DOCUMENT_SEMANTIC | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('lat check', cwd='apps/work', shell=True))"` | LAT passes and RM-02/package claims remain future | planned-only RM-01 wording, false package claim, missing owner/cache/icon boundary, premature Roadmap mutation | REPO_SUMMARY | local repository | NEW_EVIDENCE | yes |
| V06 | CLM-01, CLM-04, CLM-07 | INTEGRATION | LOCAL | `npm --prefix apps/work exec -- vitest run src/main/registry.test.ts --pool=threads --maxWorkers=1` | default behavior remains compatible and every catalog/content/tree/homepage/icon operation uses one provider-neutral descriptor | mixed public request, unsafe path, missing-icon fallback, endpoint exposure, or any `Authorization`/GitHub-specific header when token env vars are set | LOCAL_TRANSIENT | local apps/work | TARGETED_RERUN | yes |
| V07 | CLM-07, CLM-09, CLM-10 | DIFF_SCOPE | LOCAL | `npm --prefix apps/work run guard` | guard plus completion audit preserve existing IPC/Renderer/CSP/Runtime boundaries and exclude RM-02 packaging | new configuration channel, Renderer endpoint selection, CSP/icon proxy, Hermes Runtime field, provider adapter/auth, generator/profile/resource/installer write | LOCAL_TRANSIENT | local repository | TARGETED_RERUN | yes |

## Immediate Read

- `apps/work/src/main/registry.ts#fetchRegistry`
- `apps/work/src/main/registry.ts#fetchModelRegistry`
- `apps/work/src/main/registry.ts#fetchRegistryDetail`
- `apps/work/src/main/registry.ts#installRegistryItem`
- `apps/work/src/shared/registry.ts#RegistryCatalog`
- `apps/work/src/shared/registry.ts#RegistryDetail`
- `apps/work/src/shared/registry.ts#ModelRegistry`
- `apps/work/src/main/ipc/register.ts#registerIpcHandlers`
- `apps/work/src/preload/index.ts`
- `apps/work/src/renderer/src/screens/Discover/Discover.tsx#Discover`
- `apps/work/src/renderer/src/screens/Tools/Tools.tsx#McpLogo`
- `apps/work/src/main/app/start.ts#startMainProcess`
- `apps/work/src/main/build-info.ts#loadWorkBuildInfo`
- `apps/work/lat.md/registry-endpoint-configuration.md`

## Triggered Read

- If preload/global declarations reject optional `errorCode`, read the exact consumer and revise the Plan before adding a write.
- If icons require HTTP Renderer images or proxying, return to Architecture; do not modify CSP/protocol/IPC/Renderer.
- If enterprise endpoints require host inference/authentication, keep RM-02 BACKLOG and return upstream.
- Otherwise do not read Hermes Runtime, Agent/CLI, Skill Run, build profile/installer or unrelated Renderer domains.

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/registry.ts` | PROD | MODIFY | Existing Main Registry owner | T1 | Complete descriptor/default/validation in existing owner | Complete Registry Descriptor contract | no |
| C02 | `apps/work/src/main/registry.ts` | PROD | MODIFY | Existing Main Registry owner | T1 | Cached source resolver with package/runtime seams and reset | Source resolution | no |
| C03 | `apps/work/src/main/registry.ts` | PROD | MODIFY | Existing Main Registry owner | T1 | Every Registry URL/path uses selected descriptor without credential/provider-specific request behavior | Registry network/detail/install flow | no |
| C04 | `apps/work/src/main/registry.ts` | PROD | MODIFY | Existing Main Registry owner | T1 | TTL caches include descriptor identity | Registry caches | no |
| C05 | `apps/work/src/main/registry.ts` | PROD | MODIFY | Existing Registry/observability owner | T1 | Sanitized stable errors and one source event; derived URLs compatible | Existing Registry result boundary and observability | no |
| C05 | `apps/work/src/shared/registry.ts` | PROD | MODIFY | Shared Registry DTO owner | T1 | Optional stable error code/message fields only | Existing Registry result boundary and observability | no |
| C01 | `apps/work/src/main/registry.test.ts` | TEST | ADD | No focused Registry suite | T1 | Descriptor/default validation matrix | Complete Registry Descriptor contract | yes |
| C02 | `apps/work/src/main/registry.test.ts` | TEST | ADD | No focused Registry suite | T1 | Source precedence/failure matrix | Source resolution | yes |
| C03 | `apps/work/src/main/registry.test.ts` | TEST | ADD | No focused Registry suite | T1 | Full fake-transport/path-safety matrix | Registry network/detail/install flow | yes |
| C04 | `apps/work/src/main/registry.test.ts` | TEST | ADD | No focused Registry suite | T1 | Cache identity/reuse matrix | Registry caches | yes |
| C05 | `apps/work/src/main/registry.test.ts` | TEST | ADD | No focused Registry suite | T1 | Sanitized error/log/derived URL matrix | Existing Registry result boundary and observability | yes |
| C06 | `apps/work/src/main/app/start.ts` | PROD | KEEP | Existing Main CSP owner | - | Renderer CSP remains unchanged | Ownership and regression boundary | no |
| C07 | `apps/work/lat.md/registry-endpoint-configuration.md` | DOC | ADD | Work LAT | T2 | Delivered RM-01 semantics; RM-02 future | Work LAT | yes |
| C07 | `apps/work/lat.md/lat.md` | DOC | MODIFY | Work LAT index | T2 | Link Registry endpoint node | Work LAT | no |

## Domain Activation Ledger

None

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | MINIMAL_NEW | `registry.ts` owns constants and already imports `fs/path`; stdlib URL/JSON suffice | Add missing contract inside owner; no config service/file/dependency |
| C02 | MODIFY_EXISTING | Lazy exports and module caches already define lifecycle | Add one resolver/cache/reset; no bootstrap/Runtime config change |
| C03 | MODIFY_EXISTING | All URL consumers and the current GitHub token/header branch converge in `registry.ts` | Fix shared root once; remove credential/provider-specific request behavior; no Renderer/IPC patches |
| C04 | MODIFY_EXISTING | Existing three caches own TTL reuse | Add identity/reset; no second store |
| C05 | MODIFY_EXISTING | DTOs already flow through current IPC; console logging exists | Add optional codes/sanitization/log without channel/service/UI |
| C07 | MINIMAL_NEW | No LAT node owns this descriptor contract | One node plus index is minimum truthful documentation |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C01, C02, C03, C04, C05 | `apps/work/src/main/registry.ts`; `apps/work/src/shared/registry.ts`; `apps/work/src/main/registry.test.ts` | Existing Registry IPC/preload/Discover/Tools; `build-info.ts`; `app/start.ts` CSP | - | no |
| T2 | C07 | `apps/work/lat.md/registry-endpoint-configuration.md`; `apps/work/lat.md/lat.md` | `apps/work/src/main/registry.ts`; approved Architecture/PRD; Roadmap | T1 | no |

## Integration Hotspots

| File | Owner Todo | Reason |
|---|---|---|
| `apps/work/src/main/registry.ts` | T1 | Descriptor, source selection, URL consumers and caches share one lifecycle; no other Todo writes it. |
| `apps/work/src/main/registry.test.ts` | T1 | One suite proves the source/transport/error/cache matrix with temp files and fake fetch only. |

## Generated Outputs Ledger

None — RM-01 consumes but does not generate/package `work-registry-config.json`; RM-02 owns generation and electron-builder inclusion.

## New File Justification

| Change ID | File | Necessity | Owner Impact |
|---|---|---|---|
| C01 | `apps/work/src/main/registry.test.ts` | No focused suite proves complete descriptor/default validation. | Test-only coverage of the existing Main Registry owner. |
| C02 | `apps/work/src/main/registry.test.ts` | No focused suite proves build/runtime/default precedence and reset. | Test-only coverage of the existing Main Registry owner. |
| C03 | `apps/work/src/main/registry.test.ts` | No focused suite proves all Registry operations share one descriptor and safe paths. | Test-only coverage of the existing Main Registry owner. |
| C04 | `apps/work/src/main/registry.test.ts` | No focused suite proves descriptor-identity cache isolation. | Test-only coverage of the existing Main Registry owner. |
| C05 | `apps/work/src/main/registry.test.ts` | No focused suite proves sanitized failures, one decision log, and compatible URLs. | Test-only coverage of the existing Main Registry owner. |
| C07 | `apps/work/lat.md/registry-endpoint-configuration.md` | Existing Runtime/provider/MCP LAT nodes do not own the complete Registry descriptor/source/cache contract. | Adds one focused Work LAT node under the existing LAT index. |

## Todo T1 — Descriptor resolution and unified Registry owner

**Owns Changes**
- C01
- C02
- C03
- C04
- C05

**Goal**

Extend the existing Main Registry owner with one complete descriptor/source lifecycle and route every Registry operation/cache/error through it without changing IPC channels, Renderer selection, CSP, Hermes Runtime or RM-02 packaging.

**Immediate anchors**
- `apps/work/src/main/registry.ts#fetchRegistry`
- `apps/work/src/main/registry.ts#fetchModelRegistry`
- `apps/work/src/main/registry.ts#fetchRegistryDetail`
- `apps/work/src/main/registry.ts#installRegistryItem`
- `apps/work/src/shared/registry.ts#RegistryCatalog`

**Changes**
- Replace fixed constants with the public descriptor and one resolver. Build input is complete `work-registry-config.json` under packaged resources; runtime input is the absolute file in `HERMES_SKILL_REGISTRY_CONFIG_FILE`; only absence advances precedence.
- Validate schema/id/complete URLs, HTTP(S), HTTPS-only icon, no userinfo, frozen tree shape, bounds and safe POSIX paths; never read `HERMES_SKILL_REGISTRY_URL`.
- Route item/catalog/models/detail/manifest/tree/download/homepage/icon through the descriptor; keep derived item URLs but hide descriptor/base endpoints. Remove the existing `GITHUB_TOKEN`/`GH_TOKEN` Authorization branch and do not send credential or provider-specific headers to descriptor URLs.
- Scope catalog/model/tree caches to identity and add one test reset clearing source and all caches.
- Extend DTOs with optional stable codes; sanitize failures, log source/id once, and add the focused temp-file/fake-fetch suite.

**Stop conditions**
- [ ] V01 source/validation/log matrix passes with zero forbidden fallback/network calls.
- [ ] V02 and V06 full-path/path-safety/error/cache/default matrix passes without mixed-source requests or credential/provider-specific headers.
- [ ] No new IPC, Renderer, CSP, Runtime, Agent/CLI, Skill Run, build-profile or installer write appears.
- [ ] Existing DTO consumers compile without exposing descriptor/base fields.

**Triggered reads**
- Follow only the Triggered Read conditions; any extra write requires Plan revision or return upstream.

## Todo T2 — Registry LAT closure

**Owns Changes**
- C07

**Goal**

Document delivered RM-01 behavior while keeping enterprise generation and package proof assigned to RM-02.

**Immediate anchors**
- `apps/work/lat.md/lat.md`
- `apps/work/lat.md/registry-endpoint-configuration.md`
- `apps/work/src/main/registry.ts`

**Changes**
- Link the Registry node and replace planned-only wording with implemented owner, descriptor, precedence, fail-closed, cache, sanitized-error and HTTPS icon exception semantics.
- Keep `work-registry-config.json` generation, enterprise values, electron-builder inclusion and installer/package evidence explicitly future RM-02.

**Stop conditions**
- [ ] LAT matches T1 behavior and preserves ownership/security/RM-02 boundaries.
- [ ] V05 `lat check` passes.

**Triggered reads**
- None unless T1 changes a named behavior; then update only this node/index.

## Verification

Run all blocking Verification Ledger entries through `smc-plan-delivery/scripts/evidence.py`. V01/V02/V06 share one focused suite but record distinct claim/oracle sets; V03/V07 pair guard with the mandatory completion audit for diff-scope truth. No enterprise credentials or live endpoint are required.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all Cursor todos completed; completion audit FRESH PASS; implementation review FRESH PASS; V01–V07 FRESH PASS; CLM-01–CLM-16 PASS; durable Evidence Manifest FRESH | V01, V02, V03, V04, V05, V06, V07 plus durable manifest |
| IMPLEMENTED_NOT_PROVEN | implementation exists but Todo/audit/review/verification/claim/manifest proof is pending or stale | pending/stale ids |
| BLOCKED | environment/dependency prevents implementation or proof after in-scope retries | blocker record with command/owner/sanitized diagnostic |
| RETURN_PRD | approved descriptor/owner/icon/security/RM-02 boundary conflicts with reality | upstream revision request; no Plan-local repair |
