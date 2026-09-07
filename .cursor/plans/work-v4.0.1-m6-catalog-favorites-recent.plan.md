---
name: M6f Catalog Favorites and Recent
overview: Add auth-scoped local favorites and accepted-start recents on the existing Main Catalog overlay and Catalog Panel. Do not add a second tools/list owner, org recommendations, or Approval/Attachment work.
todos:
  - id: t1-preference-store-overlay-and-start-recent
    content: "T1 — Preference store overlay and start recent [C01, C02, C04]"
    status: completed
  - id: t2-catalog-panel-favorite-recent-groups
    content: "T2 — Catalog Panel favorite recent groups [C03]"
    status: completed
isProject: false
plan_contract: smc.plan.v3.4
plan_id: RM-12
commit_policy: post_review
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1/RM-12
grounded_commit: 4bfaa452ea147901a23c8ba94a946b7fbb991a69
grounding_source: committed_baseline
working_tree_fingerprint: clean
---

# M6f Catalog Favorites and Recent Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.0.1-M6-catalog-favorites-recent.md)

## Scope

- In: a Main auth-scoped favorite/recent name store; overlay those names onto the current Catalog `tools` after existing `listCatalog` / `refreshCatalog`; one narrow `skillRun` IPC to toggle favorites; record recent only when Work `skillRun.start` returns `accepted: true`; show Favorites and Recent groups on the existing Catalog Panel without inventing cards.
- Out: org recommendations / curated HTTP; a second Catalog list endpoint or bypass of `tools/list` cache; telemetry JSONL as recent SOT; session-mode or feature-mode reuse; Approval / Attachment / form-engine work; Bundle edits; local Hermes `screens/Skills`; Expert favorites; cloud sync.
- Production Owner inherited from PRD: Main owns preference persistence, auth-scope partition, and name ∩ current Catalog membership. Gateway Catalog cache remains the only `tools/list` HTTP owner. Renderer `modules/skill-run` owns Favorites/Recent grouping and the favorite gesture. Chat remains the only Skill selection / submit owner.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/skill-run/skill-run-catalog-preference-store.ts#createSkillRunCatalogPreferenceStore` | absent at `4bfaa452`; `feature-mode-store.ts` persists only `{mode}` under userData; `skill-run-session-mode-store.ts` keys by `session_id` not auth scope | new factory; pattern from `getSkillRunFeatureMode` / `setSkillRunFeatureMode` (fs + userData JSON) | IPC `registerSkillRunIpc` and `createSkillRunService` `start` / `listCatalog` are the production callers; Renderer has no Main filesystem | do not reuse session-mode sqlite or telemetry JSONL; do not add sqlite; STDLIB `fs` like feature-mode | PASS |
| C02 | `apps/work/src/shared/skill-run.ts#SkillCatalogToolItem` | exists; projects callability / invocationMode / extraStringFields; no favorite or recent flags. `createSkillRunService` `listCatalog` / `refreshCatalog` return Gateway catalog unchanged. `SkillRunGatewayClient` has no `getAuthScopeKey()` even though `createSkillRunGatewayClient` already computes scope as base URL then user:id | `export interface SkillCatalogToolItem`; `export function createSkillRunService`; `export interface SkillRunGatewayClient` | Catalog IPC already ships `SkillCatalogToolItem[]`; Renderer store only mirrors that response | overlay after cached `listCatalog`; export the existing scope formula on the Gateway client; do not add `skill-run:list-favorites` | PASS |
| C03 | `apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.tsx#SkillCatalogPanel` | exists; search + category filter over `catalog.tools`; cards are `<button role="option">`; selection gated by `callability === "callable"`; no groups | `export const SkillCatalogPanel` | Chat mounts the Panel and owns `onSelectSkill`; `store.fetchSkillRunCatalog` is the only Catalog fetch | group overlayed flags on the existing Panel; reuse `skill-catalog-*` classes; English-only `locales/en/skillRun.ts`; do not edit `screens/Skills` | PASS |
| C04 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | `start` returns `{ accepted: true }` after bind + persist `pending-submit` (including duplicate `clientRequestId`); `rejectStart` paths never persist a user recent list; `callSkill` is later and is not the Work accepted gate | `export function createSkillRunService` `start` | IPC START is the only production caller; Chat selection does not call `start` | record recent only on Work accepted; do not read telemetry; do not wait for Provider `tools/call` success | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | 用户收藏当前 Catalog 中的可调用工具后，同一 auth scope 再次打开 Catalog 能在 Favorites 分组看到该项，且选择后仍走现有 Chat selection。 | BEHAVIOR | C01, C02, C03 | T1, T2 | V01, V02, V04 | UNIT | yes |
| AC-02 | AC | 收藏一个当前 Catalog 不存在的名字（伪造 IPC）：Main 拒绝或交集后不出现该卡片，不得因此新增 tools/list 请求去「找回」它。 | SECURITY | C01, C02, C05 | T1 | V02, V03, V05 | UNIT | yes |
| AC-03 | AC | 一次 accepted Skill start 之后，该 toolName 出现在 Recent 分组（若仍在当前 Catalog）。现有搜索/分类过滤同样作用于分组；任何分组都不得插入当前 Catalog tools 中不存在的项。 | BEHAVIOR | C02, C03, C04 | T1, T2 | V03, V04 | UNIT | yes |
| AC-04 | AC | rejected start 或仅选择不发送：Recent 不增加该次记录。 | LIFECYCLE | C04 | T1 | V03 | UNIT | yes |
| AC-05 | AC | 切换到另一 auth scope 后，看不到上一 scope 的收藏/最近使用。 | SECURITY | C01, C02 | T1 | V01, V03 | UNIT | yes |
| AC-06 | AC | Catalog 为 contract-unsupported / unauthorized / empty 时，不展示幽灵收藏卡片。 | NEGATIVE | C02, C03 | T1, T2 | V03, V04 | UNIT | yes |
| AC-07 | AC | 不出现组织推荐分区；源码与 Bundle 不因本 Item 增加 recommend endpoint。不新增第二套 Catalog HTTP owner。Local Chat / Expert 回归不因收藏改变默认入口。 | SCOPE | C05, C06, C07 | T2 | V05, V06, V07 | UNIT | yes |
| DOD-01 | DOD | C01–C04 有 Main 偏好 / 交集 / Catalog 分组 / accepted-start recent 的 focused tests，并覆盖 AC-02/AC-04/AC-05/AC-06 负向。C05–C07 由既有 Catalog cache、Expert/Local、Bundle unsupported 套件回归。 | EVIDENCE | C01, C02, C03, C04, C05, C06, C07 | T1, T2 | V01, V02, V03, V04, V05, V06 | UNIT | yes |
| DOD-02 | DOD | RM-12 只有在本 PRD AC 全部通过后，才以独立 Roadmap status commit 标为 DONE。implementation commit 不得包含该 status 更新。 | OPERATIONS | C03 | T2 | V07 | DOCUMENT_SEMANTIC | yes |
| DOD-03 | DOD | 发现需要组织推荐合同、云同步、第二 Catalog、Approval 或 Attachment 的工作，必须返回对应 Roadmap Item / Provider，不得混入本 Item。 | SCOPE | C05, C06, C07 | T1, T2 | V07 | DOCUMENT_SEMANTIC | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Favorite toggle | AC-01, AC-02, AC-05 | existing `hermesAPI.skillRun.setCatalogFavorite` after Catalog membership check | preference JSON write for the current auth scope | `createSkillRunCatalogPreferenceStore` `setFavorite` then overlayed `SkillCatalogResponse` | unknown toolName, catalog not ready, or favorites already at 50 reject before adding; duplicate favorite is idempotent and does not grow the set | V01, V02, V03 |
| Recent on accepted start | AC-03, AC-04 | existing `skillRun.start` after bind success, including duplicate `clientRequestId` replay | existing `pending-submit` (unchanged) | `createSkillRunService` `start` calls `recordRecent` only on `{ accepted: true }` using the validated `toolName` | `rejectStart` (feature-mode, lock, catalog, bind, already-active) must not write recent; Chat selection-only never reaches `start` | V03 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Favorite write | AC-01, AC-02, AC-05 | Catalog Panel favorite control | existing `window.hermesAPI.skillRun` plus `SKILL_RUN_IPC_CHANNELS.SET_CATALOG_FAVORITE` (`skill-run:set-catalog-favorite`); input `{ toolName, favorited }`; returns overlayed `SkillCatalogResponse` | Main preference store then Renderer catalog store | `toolName` non-empty string length ≤ 256; `favorited` boolean | IPC length/type then Main membership against current cached Catalog tools | unknown name / not ready / cap 50 → throw; no `refreshCatalog`; no extra `tools/list` | favorite identity is `toolName` within auth scope; repeat favorite is idempotent | V01, V02, V03 |
| Catalog overlay read | AC-03, AC-05, AC-06 | Gateway cached `listCatalog` then preference overlay | existing LIST_CATALOG / REFRESH_CATALOG DTO `SkillCatalogToolItem.favorited` and `recentRank` | `SkillCatalogPanel` groups | flags only on tools already in `catalog.tools`; non-ready statuses keep empty `tools` | Main overlay; Renderer must not invent names | contract-unsupported / unauthorized / empty → no ghost cards | existing auth-scoped Catalog cache key (base URL then user:id) | V03, V04, V05 |
| Recent write | AC-03, AC-04 | `createSkillRunService` `start` accepted path | in-process store write; no new IPC | overlay on later list/refresh | validated `toolName` from bind | Service only after `{ accepted: true }` | rejected start / selection-only do not write | recent identity is `toolName`; repeat accepted start moves the name to head; cap 20 drops oldest | V03 |
| Forbidden recommend / second list / Bundle | AC-07, DOD-03 | none | none | none | none | Plan forbids recommend channels, `screens/Skills` edits, and Bundle edits | tests and source grep assert absence | None | V05, V07 |

## Verification Ledger

| Verification ID | Level | Entry Point / Command | Oracle | Negative / Regression | Evidence Policy | Environment | Blocking |
|---|---|---|---|---|---|---|---|
| V01 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-catalog-preference-store.test.ts --pool=threads --maxWorkers=1', shell=True))"` | favorites cap 50 fail-closed; duplicate favorite idempotent; recent cap 20 drops oldest and re-use moves to head; two auth scopes never mix names; overlay intersects current tools only | forged name not in the provided catalog set is rejected; overlay of unauthorized/empty catalog emits no tools | LOCAL_TRANSIENT | local apps/work | yes |
| V02 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-ipc.test.ts --pool=threads --maxWorkers=1', shell=True))"` | `SET_CATALOG_FAVORITE` accepts `{toolName, favorited}` and forwards to service; existing list/refresh/start checks still pass | missing/non-string toolName, over-long toolName, non-boolean favorited rejected; unknown toolName does not call `refreshCatalog`; channel object includes `SET_CATALOG_FAVORITE` and has no recommend/list-recommend name | LOCAL_TRANSIENT | local apps/work | yes |
| V03 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-service.test.ts --pool=threads --maxWorkers=1', shell=True))"` | `listCatalog` / `refreshCatalog` overlay `favorited` / `recentRank` without extra Gateway HTTP beyond existing list/refresh; accepted start records recent; duplicate accepted clientRequestId moves recent to head | `rejectStart` does not record recent; unknown favorite does not call `gateway.clearCache` or extra `listCatalog` HTTP; overlay of contract-unsupported / unauthorized keeps `tools: []`; prompt-first start still reaches `callSkill` | LOCAL_TRANSIENT | local apps/work | yes |
| V04 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/renderer/src/modules/skill-run/SkillCatalogPanel.test.tsx --pool=threads --maxWorkers=1', shell=True))"` | ready catalog shows Favorites and Recent headings for overlayed tools; search/category still filter groups; callable favorite card still calls `onSelectSkill` | contract-unsupported / unauthorized / empty show no ghost favorite cards; names missing from `catalog.tools` never render; no Recommended heading; non-callable cards stay unselectable | LOCAL_TRANSIENT | local apps/work | yes |
| V05 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-gateway-client.test.ts --pool=threads --maxWorkers=1', shell=True))"` | second `listCatalog` in one scope still uses cache; lock-absent catalog still returns contract-unsupported without fetch | this Item must not add a second `tools/list` client or skip the cache | LOCAL_TRANSIENT | local apps/work | yes |
| V06 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/expert/expert-run-service.test.ts --pool=threads --maxWorkers=1', shell=True))"` | Expert run service regression still passes | this Item must not create ExpertTask on Skill failure or change Expert default entry | LOCAL_TRANSIENT | local apps/work | yes |
| V07 | DOCUMENT | `python -c "from pathlib import Path; import sys; r=Path('docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md').read_text(encoding='utf-8'); lat=Path('apps/work/lat.md/skill-run.md').read_text(encoding='utf-8'); ch=Path('apps/work/src/shared/skill-run.ts').read_text(encoding='utf-8'); bun=Path('contracts/skill-run/v1.2.1/capabilities/unsupported.schema.json').read_text(encoding='utf-8'); pref=Path('apps/work/src/main/skill-run/skill-run-catalog-preference-store.ts'); p=chr(124); row=next(x for x in r.splitlines() if x.startswith(p+' RM-12 ')); keys='LIST_CATALOG REFRESH_CATALOG START CANCEL GET_FEATURE_MODE GET_PROJECTION LIST_PROJECTIONS REHYDRATE_SESSION RETRY_ARTIFACT_DISCOVERY GET_SESSION_MODE SET_SESSION_MODE ON_PROJECTION_CHANGED SET_CATALOG_FAVORITE'.split(); ok=(row.split(p)[4].strip()!='DONE' and 'Favorites' in lat and 'Recent' in lat and 'Approval' in lat and 'Attachment' in lat and 'Org recommendation' in lat and all(k in ch for k in keys) and 'skill-run:list-recommend' not in ch and 'skill-run:set-catalog-favorite' in ch and 'recommend' not in bun and (not pref.exists() or 'tools/list' not in pref.read_text(encoding='utf-8'))); sys.exit(0 if ok else 1)"` | implementation tree keeps RM-12 not DONE; lat.md documents Favorites/Recent and still treats Approval / Attachment / Org recommendation as out; IPC adds only `SET_CATALOG_FAVORITE`; preference store has no `tools/list`; Bundle unsupported schema is unchanged | implementation commit must not mark RM-12 DONE, must not edit `contracts/skill-run/v1.2.1`, and must not add a recommend endpoint | LOCAL_TRANSIENT | local repo | yes |

## Immediate Read

- `docs/work/PRD-WORK-v4.0.1-M6-catalog-favorites-recent.md`
- `apps/work/src/main/skill-run/skill-run-catalog-preference-store.ts` (created by T1)
- `apps/work/src/main/skill-run/feature-mode-store.ts`
- `apps/work/src/main/skill-run/skill-run-session-mode-store.ts`
- `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient`
- `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`
- `apps/work/src/main/skill-run/skill-run-ipc.ts#registerSkillRunIpc`
- `apps/work/src/shared/skill-run.ts#SkillCatalogToolItem`
- `apps/work/src/shared/skill-run.ts#SKILL_RUN_IPC_CHANNELS`
- `apps/work/src/shared/skill-run.ts#SkillRunApi`
- `apps/work/src/preload/skill-run-api.ts#createSkillRunApi`
- `apps/work/src/renderer/src/modules/skill-run/store.ts`
- `apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.tsx#SkillCatalogPanel`
- `apps/work/src/shared/i18n/locales/en/skillRun.ts`
- `apps/work/lat.md/skill-run.md`

## Triggered Read

- If `SkillRunApi` compile fails without a preload method: update `apps/work/src/preload/skill-run-api.ts#createSkillRunApi` on the existing skill-run surface only
- If `SkillRunGatewayClient` mocks fail to type-check: add `getAuthScopeKey` to `createMockGateway` and the IPC service mock; do not duplicate the scope formula in Renderer
- If a nested favorite control is invalid inside the current card `<button>`: change that card to `div role="option"` in `SkillCatalogPanel` and reuse `skill-catalog-*` classes; do not add a CSS file
- If favorite membership looks like it needs a network refresh: stop; use cached `gateway.listCatalog()` only
- If enabling org recommendations or reading telemetry JSONL looks like a one-line shortcut: stop; that is out of this Item
- Do not read Provider source, do not edit the Bundle, do not add Approval/Attachment IPC, do not edit `screens/Skills`

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/skill-run/skill-run-catalog-preference-store.ts#createSkillRunCatalogPreferenceStore` | PROD | ADD | n/a | T1 | userData JSON `skill-run-catalog-preferences.json` keyed by Catalog auth scope; favorites set cap 50 fail-closed; recent ordered list cap 20; names only; overlay helper intersects current Catalog tools | Auth-scoped favorite + recent preference store | yes |
| C01 | `apps/work/src/main/skill-run/skill-run-catalog-preference-store.test.ts` | TEST | ADD | n/a | T1 | cap / idempotent favorite / recent LRU / scope isolation / overlay intersection / unknown-name reject | Auth-scoped favorite + recent preference store | yes |
| C01 | `apps/work/src/shared/skill-run.ts#SKILL_RUN_IPC_CHANNELS` | PROD | MODIFY | Skill Run DTO | T1 | add `SET_CATALOG_FAVORITE: "skill-run:set-catalog-favorite"` only; do not add list-favorites, list-recent, or recommend channels | Auth-scoped favorite + recent preference store | no |
| C01 | `apps/work/src/shared/skill-run.ts#SkillRunApi` | PROD | MODIFY | Skill Run DTO | T1 | add `setCatalogFavorite({ toolName, favorited })` returning overlayed `SkillCatalogResponse`; do not add a second catalog list method | Auth-scoped favorite + recent preference store | no |
| C01 | `apps/work/src/main/skill-run/skill-run-ipc.ts#registerSkillRunIpc` | PROD | MODIFY | Skill Run IPC | T1 | validate toolName string ≤ 256 and favorited boolean; call service; register and remove the new handler | Auth-scoped favorite + recent preference store | no |
| C01 | `apps/work/src/preload/skill-run-api.ts#createSkillRunApi` | PROD | MODIFY | Skill Run preload | T1 | invoke `SET_CATALOG_FAVORITE` only | Auth-scoped favorite + recent preference store | no |
| C01 | `apps/work/src/main/skill-run/skill-run-service.ts#SkillRunService` | PROD | MODIFY | SkillRunService | T1 | add `setCatalogFavorite`; inject preference store + `gateway.getAuthScopeKey()` | Auth-scoped favorite + recent preference store | no |
| C01 | `apps/work/src/main/skill-run/skill-run-ipc.test.ts` | TEST | MODIFY | Skill Run IPC tests | T1 | favorite accept/reject; unknown tool does not refresh; channel key includes `SET_CATALOG_FAVORITE` and excludes recommend | Auth-scoped favorite + recent preference store | no |
| C02 | `apps/work/src/shared/skill-run.ts#SkillCatalogToolItem` | PROD | MODIFY | Skill Run DTO | T1 | optional `favorited?: boolean` and `recentRank?: number`; Renderer must not invent names | Overlay 当前 Catalog 成员 | no |
| C02 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#SkillRunGatewayClient` | PROD | MODIFY | Skill Run Gateway | T1 | add `getAuthScopeKey(): string` exposing the existing cache-key formula | Overlay 当前 Catalog 成员 | no |
| C02 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient` | PROD | MODIFY | Skill Run Gateway | T1 | return `getAuthScopeKey`; do not change `listCatalog` cache or `tools/list` | Overlay 当前 Catalog 成员 | no |
| C02 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | PROD | MODIFY | SkillRunService | T1 | `listCatalog` / `refreshCatalog` / `setCatalogFavorite` overlay flags after Gateway catalog; membership uses cached list only | Overlay 当前 Catalog 成员 | no |
| C02 | `apps/work/src/main/skill-run/skill-run-service.test.ts` | TEST | MODIFY | SkillRunService tests | T1 | overlay flags; unknown favorite rejects without `clearCache`; non-ready catalog has empty tools; `createMockGateway` supplies `getAuthScopeKey` | Overlay 当前 Catalog 成员 | no |
| C03 | `apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.tsx#SkillCatalogPanel` | PROD | MODIFY | modules/skill-run | T2 | Favorites / Recent / remaining groups from overlay flags; unique option ids; callable-only favorite control; selection still `onSelectSkill` | Catalog Panel Favorites / Recent 分组 | no |
| C03 | `apps/work/src/renderer/src/modules/skill-run/store.ts` | PROD | MODIFY | modules/skill-run | T2 | helper invokes `setCatalogFavorite` and `setSkillRunCatalogState`; do not add localStorage SOT | Catalog Panel Favorites / Recent 分组 | no |
| C03 | `apps/work/src/shared/i18n/locales/en/skillRun.ts` | PROD | MODIFY | Work i18n English | T2 | English-only Favorites / Recent / favorite-limit strings | Catalog Panel Favorites / Recent 分组 | no |
| C03 | `apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.test.tsx` | TEST | MODIFY | modules/skill-run tests | T2 | groups, search filter, no ghost cards, no Recommended heading; keep jsdom pragma + cleanup + jest-dom | Catalog Panel Favorites / Recent 分组 | no |
| C03 | `apps/work/lat.md/skill-run.md` | DOC | MODIFY | work lat skill-run | T2 | document Favorites/Recent overlay; keep Approval / Attachment / Org recommendation / unrestricted schema out | Catalog Panel Favorites / Recent 分组 | no |
| C04 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | PROD | MODIFY | SkillRunService | T1 | `recordRecent` on every Work `{ accepted: true }` including duplicate clientRequestId; never on `rejectStart` | Accepted start 写入 recent | no |
| C05 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#listCatalog` | PROD | KEEP | Skill Run Gateway | - | auth-scope `tools/list` cache and refresh/`clearCache` behaviour unchanged | Gateway Catalog cache / tools/list | no |
| C06 | `apps/work/src/shared/skill-run.ts#SKILL_RUN_IPC_CHANNELS` | PROD | KEEP | Skill Run DTO | - | no recommend / list-recommended / list-favorites channel; START remains the only execution channel | Org recommendations | no |
| C07 | `contracts/skill-run/v1.2.1/capabilities/unsupported.schema.json` | PROD | KEEP | Provider Bundle | - | `approval` / `attachments` stay unsupported; no Bundle edit | Approval / Attachment / Bundle / Expert / 表单 | no |
| C07 | `apps/work/src/renderer/src/screens/Chat/Chat.tsx#Chat` | PROD | KEEP | Chat Skill submit | - | Chat remains selection / submit owner; Local Chat default entry unchanged | Approval / Attachment / Bundle / Expert / 表单 | no |
| C07 | `apps/work/src/renderer/src/screens/Skills/Skills.tsx#Skills` | PROD | KEEP | local Hermes Skills page | - | not an employee Catalog; do not add favorites here | Approval / Attachment / Bundle / Expert / 表单 | no |

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | MINIMAL_NEW | No user-level Catalog preference owner exists. `feature-mode-store.ts` is mode-only. `skill-run-session-mode-store.ts` is per `session_id`. Telemetry JSONL is not product truth. | Add one fs JSON store beside feature-mode and expose it through the existing `skillRun` IPC object; do not add sqlite or a second Catalog HTTP client |
| C02 | MODIFY_EXISTING | Catalog DTO already crosses IPC. Gateway already caches by base URL then user:id but does not expose the key. Service `listCatalog` currently forwards Gateway output | Stamp `favorited` / `recentRank` on current tools after cached list; export `getAuthScopeKey`; do not add list-favorites |
| C03 | MODIFY_EXISTING | `SkillCatalogPanel` is the only employee Catalog UI; Chat already owns `onSelectSkill` | Group overlayed tools on that Panel; do not add a Catalog page or edit `screens/Skills` |
| C04 | MODIFY_EXISTING | `createSkillRunService` `start` is already the Work accepted writer (`accepted: true` after bind/persist, before `callSkill`) | Call `recordRecent` on that path only; do not treat Provider HTTP success or Chat selection as use |

## New File Justification

| Change ID | File | Necessity | Owner Impact |
|---|---|---|---|
| C01 | `apps/work/src/main/skill-run/skill-run-catalog-preference-store.ts` | Feature-mode store cannot hold a scoped name set. Session-mode sqlite is the wrong key (`session_id`). Mixing favorites into `skill-run-service.ts` would hide a new persistence owner inside start/catalog logic | New Main persistence owner beside existing Skill Run stores; service/IPC call it; Renderer never opens the file |
| C01 | `apps/work/src/main/skill-run/skill-run-catalog-preference-store.test.ts` | Cap, scope isolation, and overlay intersection are not covered by current service tests without a dedicated store | Test-only; no production owner change |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C01, C02, C04 | `apps/work/src/main/skill-run/skill-run-catalog-preference-store.ts#createSkillRunCatalogPreferenceStore`<br>`apps/work/src/main/skill-run/skill-run-catalog-preference-store.test.ts`<br>`apps/work/src/shared/skill-run.ts#SKILL_RUN_IPC_CHANNELS`<br>`apps/work/src/shared/skill-run.ts#SkillRunApi`<br>`apps/work/src/main/skill-run/skill-run-ipc.ts#registerSkillRunIpc`<br>`apps/work/src/preload/skill-run-api.ts#createSkillRunApi`<br>`apps/work/src/main/skill-run/skill-run-service.ts#SkillRunService`<br>`apps/work/src/main/skill-run/skill-run-ipc.test.ts`<br>`apps/work/src/shared/skill-run.ts#SkillCatalogToolItem`<br>`apps/work/src/main/skill-run/skill-run-gateway-client.ts#SkillRunGatewayClient`<br>`apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient`<br>`apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`<br>`apps/work/src/main/skill-run/skill-run-service.test.ts` | `apps/work/src/main/skill-run/feature-mode-store.ts`<br>`apps/work/src/main/skill-run/skill-run-session-mode-store.ts`<br>`apps/work/src/main/skill-run/skill-run-gateway-client.ts#listCatalog` | - | no |
| T2 | C03 | `apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.tsx#SkillCatalogPanel`<br>`apps/work/src/renderer/src/modules/skill-run/store.ts`<br>`apps/work/src/shared/i18n/locales/en/skillRun.ts`<br>`apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.test.tsx`<br>`apps/work/lat.md/skill-run.md` | `apps/work/src/shared/skill-run.ts#SkillCatalogToolItem`<br>`apps/work/src/shared/skill-run.ts#SkillRunApi`<br>`apps/work/src/renderer/src/modules/skill-run/store.ts#fetchSkillRunCatalog` | T1 | no |

## Integration Hotspots

| File | Owner Todo | Reason |
|---|---|---|
| `apps/work/src/shared/skill-run.ts` | T1 | favorite IPC, Catalog overlay fields, and KEEP-no-recommend channel set share one DTO file |
| `apps/work/src/main/skill-run/skill-run-service.ts` | T1 | overlay, setFavorite, and accepted-start recent share `createSkillRunService` |
| `apps/work/src/main/skill-run/skill-run-ipc.ts` | T1 | new favorite handler shares auth/session validation with existing Catalog/start channels |
| `apps/work/src/main/skill-run/skill-run-gateway-client.ts` | T1 | `getAuthScopeKey` is added in the same factory that KEEP-caches `listCatalog` |

## Generated Outputs Ledger

None

## Todo T1 — Preference store overlay and start recent

**Owns Changes**
- C01
- C02
- C04

**Goal**

Persist auth-scoped favorite and recent `toolName`s in Main, overlay them onto the current Catalog DTO, toggle favorites through the existing skill-run IPC surface, and record recent only when Work start is accepted.

**Immediate anchors**
- `apps/work/src/main/skill-run/feature-mode-store.ts`
- `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient`
- `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`
- `apps/work/src/main/skill-run/skill-run-ipc.ts#registerSkillRunIpc`
- `apps/work/src/shared/skill-run.ts#SkillRunApi`

**Changes**
- Add `createSkillRunCatalogPreferenceStore` using Node `fs` and `app.getPath("userData")` / `skill-run-catalog-preferences.json`. Partition `{ favorites: string[], recent: string[] }` by the Gateway auth scope key. Store names only. Do not store schema, JWT, or inputSchema.
- Freeze `FAVORITES_MAX = 50` fail-closed (`FAVORITE_LIMIT_REACHED` when adding a new name at cap). Duplicate favorite is idempotent. `RECENT_MAX = 20`; insert/move-to-head; drop oldest. Do not LRU-evict favorites.
- Overlay: if catalog `status !== "ready"`, return the Gateway catalog unchanged (`tools` stay empty). If ready, copy each current tool and set `favorited` / `recentRank` (1 = most recent) from the scope record. Names missing from `tools` are not resurrected. Do not prune disk on overlay.
- Expose `getAuthScopeKey()` on `SkillRunGatewayClient` using the existing `${base}|user:${id}` formula. Do not change `listCatalog` cache semantics.
- Add `SET_CATALOG_FAVORITE`. IPC validates `toolName` (non-empty string ≤ 256) and `favorited` boolean. Service checks membership against cached `gateway.listCatalog()` tools and then writes the store. Return the overlayed catalog. Never call `refreshCatalog` / `clearCache` to hunt a forged name.
- `SkillRunService.setCatalogFavorite` plus injectable store for tests. Update `createMockGateway` with `getAuthScopeKey`.
- On `start`, after bind success and on the duplicate-`clientRequestId` accepted replay, call `recordRecent(scope, validatedToolName)` before returning `{ accepted: true }`. Do not record on `rejectStart`. Do not wait for `callSkill`. Do not read telemetry JSONL.
- Preload forwards the new method. Do not add list-favorites / list-recent / recommend channels. Do not edit `contracts/skill-run/v1.2.1`.
- Tests: new store unit file; IPC favorite accept/reject; service overlay, accepted recent, rejected start does not write, unknown favorite does not `clearCache`.

**Stop conditions**
- [ ] V01 PASS
- [ ] V02 PASS
- [ ] V03 PASS
- [ ] V05 PASS
- [ ] favorites cap 50 rejects new names instead of evicting
- [ ] recent writes only on Work `accepted: true`
- [ ] no second `tools/list` owner and no recommend channel

**Triggered reads**
- If `SkillRunApi` compile fails: update `createSkillRunApi` on the existing skill-run surface only
- If Gateway mocks fail to type-check: add `getAuthScopeKey` there; do not copy the scope formula into Renderer
- If membership looks like it needs `refreshCatalog`: stop and use cached `listCatalog`
- Do not read Provider source, do not edit the Bundle, do not reuse session-mode / feature-mode / telemetry as SOT

## Todo T2 — Catalog Panel favorite recent groups

**Owns Changes**
- C03

**Goal**

Show Favorites and Recent on the existing Catalog Panel from overlayed Catalog flags, keep Chat as selection owner, and document the boundary in English i18n and lat.md.

**Immediate anchors**
- `apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.tsx#SkillCatalogPanel`
- `apps/work/src/renderer/src/modules/skill-run/store.ts`
- `apps/work/src/shared/skill-run.ts#SkillCatalogToolItem`

**Changes**
- After existing search/category filter, render unique tools as: Favorites (`favorited`, store order), then Recent (`recentRank`, excluding names already in Favorites), then remaining catalog order. Section headings are not `role="option"`. Option ids stay unique (`skill-option-${toolName}`).
- Favorite control only when `callability === "callable"`. It must not select the skill. If the card is currently a `<button>`, switch the card container to `div role="option"` so the favorite control can be a nested button. Reuse `skill-catalog-*` classes. Do not add a CSS file.
- Store helper calls `window.hermesAPI.skillRun.setCatalogFavorite` then `setSkillRunCatalogState`. Panel must not open a second Catalog HTTP client or localStorage SOT.
- Selection and keyboard Enter still require `callability === "callable"` and still call `onSelectSkill`. Chat remains the selection owner; do not edit `Chat.tsx`.
- English-only strings for Favorites, Recent, favorite, and limit-reached. Do not add other locale packages.
- Update `lat.md/skill-run.md` with an M6f Favorites/Recent overlay section. Keep Approval, Attachment, unrestricted schema, and Org recommendation in Still Out. Do not mark Roadmap RM-12 `DONE`. Do not edit `screens/Skills`.
- CatalogPanel tests must stay jsdom-self-contained (`// @vitest-environment jsdom`, cleanup, jest-dom). Cover groups, search, ghost-card absence, and no Recommended heading.

**Stop conditions**
- [ ] V04 PASS
- [ ] V06 PASS
- [ ] V07 PASS
- [ ] no Recommended group and no `screens/Skills` edit
- [ ] Roadmap RM-12 status is not DONE in this implementation tree
- [ ] no new CSS file

**Triggered reads**
- If nested favorite control is invalid inside a button card: change the card container in this Panel only
- If i18n is needed: `locales/en/skillRun.ts` only
- Do not edit Chat, Expert, Bundle, or `screens/Skills`

## Verification

Run all blocking Verification Ledger entries through `smc-plan-delivery/scripts/evidence.py`.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all Cursor todos completed; completion audit FRESH PASS; implementation review FRESH PASS; all blocking Verification FRESH PASS; durable Evidence Manifest FRESH | V01, V02, V03, V04, V05, V06, V07 via SMC evidence ledger + durable Evidence Manifest |
| IMPLEMENTED_NOT_PROVEN | implementation exists but proof is pending/stale | pending/stale gate IDs |
| BLOCKED | environment/dependency prevents proof | blocker record |
| RETURN_PRD | approved owner/boundary conflicts | PRD revision request |
