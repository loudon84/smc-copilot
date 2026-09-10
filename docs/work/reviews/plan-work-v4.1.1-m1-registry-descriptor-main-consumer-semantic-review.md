# Work v4.1.1 RM-01 Registry Descriptor Main Consumer — Semantic Plan Review

Review scope is canonical Plan `.cursor/plans/work-v4.1.1-m1-registry-descriptor-main-consumer.plan.md` (`plan_id: WORK-V4.1.1-REGISTRY-RM-01`). The router result is `REQUIRED` because the Plan contains multiple minimal-new targets, integration hotspots, and a security/trust boundary. The Plan also declares `acceptance_contract: smc.acceptance.v1`, so this artifact records the required Actual Semantic Review. This review does not execute the Plan or change production code.

## Verdict

PASS

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| Grounding | PASS | At grounded commit `2afa1963934432cae28c1000e91a678d739c6a8d`, `apps/work/src/main/registry.ts` owns fixed catalog/model/content/tree/web/icon URLs, all Registry fetch/install paths, and three timestamp-only caches. Existing IPC/preload and Renderer consume its DTOs. `build-info.ts` establishes the packaged-resource read precedent. |
| Ponytail | PASS | C01–C05 modify the existing Main Registry and shared DTO owners, adding only one focused test file. C07 adds one focused LAT node and index link. No second config service, network owner, IPC surface, Renderer setting, dependency, or RM-02 package generator is introduced. |
| Single writer | PASS | T1 solely owns Registry production/DTO/test writes. T2 solely owns LAT writes and depends on T1. C06 is an explicit KEEP boundary with no Todo writer. Shared Registry hotspots have one writer. |
| Coverage | PASS | AC-01–AC-10 map to source precedence, fail-closed validation, provider-neutral transport, cache identity, sanitized errors, observability, boundary and regression evidence. AC-11 maps to LAT. DOD-01–DOD-05 are explicit, blocking, and tied to V01–V07. |
| Lifecycle | PASS | Source selection names absent versus present-invalid behavior and a process-lifetime decision writer; cache lifecycle names identity/TTL/reset behavior; content/install names path validation, success ownership, and unavailable failure mapping. |
| Boundary | PASS | Build/runtime/default resolve atomically in Main. Descriptor/base endpoints and local paths never cross IPC. Existing Main-derived homepage and HTTPS icon remain the only presentation exception. Authentication, provider inference, CSP broadening, and package generation remain outside RM-01. |
| Verification | PASS | V01/V02/V06 use deterministic temp descriptor files and fake transport to separate new evidence from affected behavior reruns. V04 typechecks affected consumers. V03/V07 pair guard with mandatory completion audit for scope truth. V05 validates LAT and the RM-02 boundary. No live endpoint or credential is required. |
| Acceptance semantics | PASS | All blocking claims have action-homogeneous verification bindings. Current FAIL/NOT_TESTED claims require new evidence; affected behavior uses targeted reruns with explicit invalidation reasons. Empty Live matrices are valid because every verification is LOCAL. |

## Resolved Finding

| ID | Severity | Resolution |
|---|---|---|
| F1 | MAJOR | Current tree fetch reads `GITHUB_TOKEN`/`GH_TOKEN` and emits `Authorization`. The revised Plan now requires C03 to remove credential/provider-specific request behavior and V06 to assert that token environment variables never produce Authorization or GitHub-specific headers for descriptor endpoints. This is required by the already-approved no-auth/provider-neutral boundary, so no PRD revision is needed. |

## Findings

No OPEN BLOCKER or MAJOR finding.

| ID | Severity | Note |
|---|---|---|
| N1 | NOTE | The packaged descriptor consumer should follow the existing packaged-resource candidate pattern, but RM-01 must not generate or include `work-registry-config.json`; that remains RM-02. |
| N2 | NOTE | Selected-source invalidity must be cached as the process-lifetime decision just like success, so repeated page loads cannot fall through or emit duplicate initialization events. |
| N3 | NOTE | Response and path bounds must be deterministic constants covered by the focused suite; raw response bodies, local paths, queries, userinfo, tokens, and stacks must not reach logs or DTOs. |
| N4 | NOTE | V03/V07 command success alone does not replace completion-audit scope proof; delivery must record both before completion. |

PASS means the canonical Plan may be executed through the governed delivery flow. This review itself performs no implementation work.
