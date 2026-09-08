# M6f Catalog Favorites and Recent — Semantic Plan Review

Review scope is canonical Plan `.cursor/plans/work-v4.0.1-m6-catalog-favorites-recent.plan.md` (`plan_id: RM-12`). Router result was `REQUIRED` (`INTEGRATION_HOTSPOT`, `SECURITY_OR_TRUST_BOUNDARY`). This review does not re-open the APPROVED Stage PRD, does not mark RM-12 DONE, and does not authorize RM-09, RM-11, or any other Plan.

## Verdict

PASS

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| Grounding | PASS | Gateway `listCatalog` already caches by `${base}\|user:${id}` and does not expose the key. Service `listCatalog`/`refreshCatalog` forward Gateway output with no overlay. `start` returns Work `accepted: true` after bind + persist, before `callSkill`; `rejectStart` has no recent writer. `SkillCatalogPanel` filters `catalog.tools` with no groups. `feature-mode-store` is mode-only; `skill-run-session-mode-store` is per `session_id`. No user-level Catalog preference file exists. |
| Ponytail | PASS | C01 is one MINIMAL_NEW fs JSON store beside feature-mode. C02–C04 MODIFY existing DTO/Gateway key/service overlay/start/Panel. One new IPC name on the existing `skillRun` object. No sqlite, no second `tools/list`, no recommend HTTP, no `screens/Skills` edit. KEEP rows leave cache, Bundle `unsupported`, Chat selection, and local Skills page alone. |
| Single writer | PASS | T1 owns the new store, shared DTO overlay/IPC/API, preload, IPC registration, Gateway `getAuthScopeKey`, and `createSkillRunService` overlay + recent. T2 owns Panel/store helper/i18n/lat.md and depends on T1. C05 KEEP `listCatalog` has no Todo writer; T1 must not change cache semantics while adding `getAuthScopeKey`. C06 KEEP forbids recommend channels in the same DTO file T1 writes. |
| Coverage | PASS | AC-01 spans store + overlay + Panel + Chat selection KEEP. AC-02 forged IPC is Main membership against cached tools. AC-03 overlay + Panel groups. AC-04 rejected/selection-only skip `recordRecent`. AC-05 auth-scope partition. AC-06 non-ready catalogs emit no ghost cards. AC-07/DOD-02/DOD-03 Expert suite + not-DONE / no-recommend / no-second-list document checks. |
| Lifecycle / boundary | PASS | Favorite write is scoped JSON + overlayed Catalog IPC; unknown/not-ready/cap 50 fail before add. Recent writer is Work accepted `start` (including duplicate `clientRequestId`); `rejectStart` is the failure writer. Overlay consumer never invents names. No new execution channel. |
| Verification | PASS | V01 new store tests. V02/V03 extend existing IPC/service files. V04 extends jsdom-self-contained CatalogPanel tests. V05 existing Gateway cache suite. V06 Expert regression. V07 avoids markdown table-pipe breakage via `chr(124)` and asserts RM-12 is not DONE. |
| Scope | PASS | Out still forbids org recommendations, telemetry-as-SOT, session-mode reuse, Approval/Attachment, Bundle edits, Expert favorites, and a second Catalog owner. SECURITY trigger is auth-scope partition + forged IPC, not a new auth stack. INTEGRATION_HOTSPOT is shared DTO/service/IPC/Gateway files, not a new owner. |

## Findings

No OPEN BLOCKER or MAJOR finding.

| ID | Severity | Note |
|---|---|---|
| N1 | NOTE | T1 adds `SET_CATALOG_FAVORITE` while C06 KEEP forbids recommend/list-favorites/list-recent names. Do not add a second catalog list method. |
| N2 | NOTE | `createMockGateway` and the IPC service mock must grow `getAuthScopeKey`. Do not duplicate the scope formula in Renderer. |
| N3 | NOTE | Current Catalog cards are `<button role="option">`. Nested favorite control requires changing the card container in T2; do not add a CSS file. |
| N4 | NOTE | Record recent on Work `{ accepted: true }`, including duplicate `clientRequestId`. Do not wait for Provider `tools/call` success. |
| N5 | NOTE | V07 requires RM-12 status is not DONE in the implementation tree. Roadmap DONE is a later separate commit. |

PASS -> `smc-plan-delivery`. This review does not modify the Plan and does not create a git commit.
