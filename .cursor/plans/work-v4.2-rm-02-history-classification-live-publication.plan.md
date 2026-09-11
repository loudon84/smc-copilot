---
name: Work v4.2 RM-02 Classified History Publication
overview: Present Main-owned Chat and Skill Run classifications in the existing Sidebar with live cache-event refresh and one-row precedence.
todos:
  - id: t1-classified-sidebar-history
    content: "T1 — Consume explicit Session classification in the existing Sidebar history [C01, C02, C03, C04, C05]"
    status: completed
isProject: false
plan_contract: smc.plan.v3.5
plan_id: WORK-v4.2-RM-02-history-classification-live-publication
domain_contract: smc.ges.domain-activation.v1
consumer_profile: generic@1.0.0
domain_policy_digest: sha256:78167a10490bbe109ad2f006cfe74ff1390b2187cb6728004964448f2a5c5907
commit_policy: post_review
acceptance_contract: smc.acceptance.v1
source_revision: AD-WORK-v4.2-UNIFIED-CONVERSATION-EXECUTION-PROVIDER@1.0.1/RM-02
grounded_commit: fecd7c755d0b9f78688aa831a920749e96b1970d
grounding_source: committed_baseline
working_tree_fingerprint: clean
---

# Work v4.2 RM-02 Classified History Publication Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.2-RM-02-history-classification-live-publication.md)

## Scope

- In: consume the explicit two-pair cache DTO in the existing Sidebar; render Pinned → Projects → Chat history → Work history with one row per Session ID; reuse cache-only event refresh; add English-source labels and focused proof.
- Out: Main writers/IPC, Provider or transcript changes, a second Sidebar/cache, migration/backfill, Expert/HermesTask handling, and non-English locale edits.
- Production Owner inherited from PRD: Main owns classification/cache; `SidebarRecentSessions` owns RM-02 grouping/rendering only.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.tsx#normalizeRows` | Drops classification from cache rows. | First page, sync, pagination, and cache-event update all pass here. | Preload `listCachedSessions`/`syncSessionCache` already provide the pair. | RM-01 `CachedSession`/preload contract supplies the closed pair. | PASS |
| C02 | `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.tsx#groupSessionsByWorkspace` | Splits only Projects and Chats after Pinned removal. | Existing render section consumes project groups and chats. | Pinned and context-folder actions feed the same local rows. | Extend the existing grouping/sections; no second list. | PASS |
| C03 | `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.tsx` cache-change effect | Rereads cache and calls `applyLoadedWindow` without Main sync. | Existing Main cache event is the only event input. | RM-01 writes cache before its sanitized hint. | Reuse event sink, not a timer/focus/IPC path. | PASS |
| C04 | `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.test.tsx` | Focused action/paging/profile tests exist. | Row actions operate by Session ID. | Existing callbacks retain their Main owners. | Extend current component test seam. | PASS |
| C05 | `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.tsx#normalizeRows` | No Renderer classification branch exists. | It is the first Renderer consumer. | Main/preload allow exactly two pairs. | Exact local guard, no registry/fallback/writer. | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | [C01] The Sidebar retains only explicit valid `chat/hermes-chat` and `work/skill-run` values from the cache DTO; missing, partial, cross-paired, unknown, and third-class values do not appear in a classified history group and never default to Chat. | SECURITY | C01,C05 | T1 | V02 | UNIT | yes |
| AC-02 | AC | [C02] Every loaded Session ID appears at most once with strict Pinned → Projects → Chat history → Work history precedence; project-linked rows retain their explicit classification but do not duplicate into Chat or Work history. | LIFECYCLE | C02 | T1 | V01 | INTEGRATION | yes |
| AC-03 | AC | [C02] Unpinned rows without `contextFolder` render under Chat history only for `chat/hermes-chat` and Work history only for `work/skill-run`; changing `contextFolder` changes only project placement, not classification. | CONTRACT | C02 | T1 | V01 | INTEGRATION | yes |
| AC-04 | AC | [C03] An open Sidebar reflects a newly published original Chat or accepted Skill Run after the existing sanitized cache-change hint without focus, periodic timer expiry, or manual refresh, and the hint path does not trigger a Main DB sync. | LIFECYCLE | C03 | T1 | V02 | INTEGRATION | yes |
| AC-05 | AC | [C04] Pagination, profile changes, pin/unpin, rename, context-folder moves, selection/resume, and deletion preserve current behavior and converge without duplicate rows after repeated cache reads/events. | LIFECYCLE | C04 | T1 | V02 | INTEGRATION | yes |
| AC-06 | AC | [C01/C05] The Renderer contains no inference, write, repair, compatibility, migration, or recognition branch for Expert/HermesTask or any third Session/provider class. | SECURITY | C01,C05 | T1 | V01 | DIFF_SCOPE | yes |
| AC-07 | AC | [C04] The change preserves Main-owned classification, sanitized cache/event boundaries, Chat and Skill Run execution truth, Skill Run audit/continuation truth, and File Platform identity. | SCOPE | C04 | T1 | V02 | INTEGRATION | yes |
| AC-08 | AC | [C02/C04] New visible history labels and accessibility names use the English source locale; no non-English locale package is modified. | CONTRACT | C02,C04 | T1 | V02 | INTEGRATION | yes |
| DOD-01 | DOD | Focused Renderer tests prove the closed two-pair input, precedence, invalid-row omission, event-driven live publication, pagination convergence, and existing row-action regressions. | EVIDENCE | C01,C02,C03,C04,C05 | T1 | V01 | INTEGRATION | yes |
| DOD-02 | DOD | Existing Main cache/classification and pre-accept Skill Run negative-path coverage remains passing without adding a Renderer→Main classification write or a new cache/Provider owner. | SCOPE | C04,C05 | T1 | V02 | INTEGRATION | yes |
| DOD-03 | DOD | The implementation contains no Expert/HermesTask or third-class compatibility/migration branch and no transcript/Provider contract change. | SECURITY | C05 | T1 | V03 | DIFF_SCOPE | yes |
| DOD-04 | DOD | All blocking claims have fresh recorded evidence before RM-02 is marked DONE. | EVIDENCE | C01,C02,C03,C04,C05 | T1 | V01,V02,V03 | INTEGRATION | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Cache-event publication | AC-02,AC-03,AC-04,AC-05,DOD-01 | Existing Main cache-change hint. | Existing loaded Sidebar window remains during reread. | `applyLoadedWindow` validates, de-duplicates, and re-groups the window. | Existing effect ignores failed/cancelled reread and retains prior rows; it never defaults classification. | V01 |
| Pin/project transition | AC-02,AC-03,AC-05 | Existing pin or context-folder action. | Local list can temporarily show prior group. | Existing pin state plus grouping precedence chooses one destination. | Existing action rollback/next cache refresh restores valid window without duplicate append. | V01 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Classified cache to Sidebar | AC-01,AC-02,AC-03,AC-04,AC-06,AC-07 | RM-01 Main `CachedSession`. | Existing preload cache APIs and sanitized event. | `SidebarRecentSessions#normalizeRows` then existing grouping/render. | id, title, contextFolder, sessionKind, executionProvider. | Renderer accepts only exact pairs for display; Main remains authority. | Invalid pair omitted; read failure retains previous window; no repair/default/write. | ID de-duplicates loaded window; precedence chooses one destination. | V01,V02 |

## Acceptance Claim Ledger

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason | Verification IDs |
|---|---|---|---|---|---|---|---|---|
| CLM-01 | AC-01 | Exact pairs only enter history. | yes | RM-01 V01/V05 manifest. | PROVEN_BUT_AFFECTED | TARGETED_RERUN | New Renderer consumer. | V02 |
| CLM-02 | AC-02 | Precedence shows one row per ID. | yes | Existing Sidebar grouping tests. | RESIDUAL_GAP | NEW_EVIDENCE | Chat/Work partition is new. | V01 |
| CLM-03 | AC-03 | Context folder changes placement, not pair. | yes | Existing project grouping. | RESIDUAL_GAP | NEW_EVIDENCE | Pair-aware grouping is new. | V01 |
| CLM-04 | AC-04 | Event refresh is cache-only and immediate. | yes | Existing cache-event test, RM-01 evidence. | PROVEN_BUT_AFFECTED | TARGETED_RERUN | New grouping runs at event sink. | V02 |
| CLM-05 | AC-05 | Existing actions/paging/profile converge. | yes | Existing focused tests. | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Rendered collections change. | V02 |
| CLM-06 | AC-06 | No inference/writer/third-mode behavior. | yes | Approved AD and RM-01 pair contract. | PROVEN_REQUIREMENT | NEW_EVIDENCE | New consumer must prove forbidden absence. | V01 |
| CLM-07 | AC-07 | Main/Provider/transcript/File owners unchanged. | yes | RM-01 manifest and owner anchors. | PROVEN_FRESH | TARGETED_RERUN | Renderer cache-boundary integration. | V02 |
| CLM-08 | AC-08 | New labels are English source-locale and a11y-visible. | yes | Source-locale checker. | RESIDUAL_GAP | TARGETED_RERUN | New headings. | V02 |
| CLM-09 | DOD-01 | Focused proof covers RM-02 behavior. | yes | No RM-02 proof. | NOT_TESTED | NEW_EVIDENCE | New completion evidence. | V01 |
| CLM-10 | DOD-02 | Main cache and pre-accept behavior pass. | yes | RM-01 V02/V03. | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Renderer consumption is new. | V02 |
| CLM-11 | DOD-03 | Scope guards reject forbidden modes/contracts. | yes | Approved AD. | PROVEN_REQUIREMENT | NEW_EVIDENCE | RM-02 scope guard. | V03 |
| CLM-12 | DOD-04 | Every blocking RM-02 claim is fresh. | yes | No RM-02 manifest. | NOT_TESTED | NEW_EVIDENCE | New completion proof. | V03 |

## Live Scenario Matrix

| Scenario ID | Claim IDs | Verification IDs | Subject / Fixture | Required Capabilities | Preconditions | Stimulus | Oracle | Environment ID |
|---|---|---|---|---|---|---|---|---|

## Live Environment Matrix

| Environment ID | Required Env Vars | Preflight Command | Fault Driver Env | Candidate Mode | Candidate Probe |
|---|---|---|---|---|---|

## Verification Ledger

| Verification ID | Claim IDs | Level | Acceptance Mode | Entry Point / Command | Oracle | Negative / Regression | Evidence Policy | Environment | Evidence Action | Blocking |
|---|---|---|---|---|---|---|---|---|---|---|
| V01 | CLM-02,CLM-03,CLM-06,CLM-09 | UNIT | LOCAL | `npm exec vitest -- run src/renderer/src/screens/Layout/SidebarRecentSessions.test.tsx --pool=threads --maxWorkers=1` | Focused Sidebar proof validates pairs, omission, precedence, event-only refresh, and actions/paging. | Invalid/third pair, repeat event/page, profile, pin/project, and no-DB-sync cases pass. | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |
| V02 | CLM-01,CLM-04,CLM-05,CLM-07,CLM-08,CLM-10 | INTEGRATION | LOCAL | `npm exec vitest -- run src/renderer/src/screens/Layout/SidebarRecentSessions.test.tsx src/main/session-cache.test.ts src/main/skill-run/skill-run-session-materialize.test.ts --pool=threads --maxWorkers=1` | Renderer grouping and Main cache/materialization regressions pass together. | Pre-accept creates no Work row and Main remains cache writer. | LOCAL_TRANSIENT | local | TARGETED_RERUN | yes |
| V03 | CLM-11,CLM-12 | REGRESSION | LOCAL | `npm run guard` | Work guards enforce renderer/cache/i18n boundaries. | No non-English locale, renderer HTTP/write, or forbidden contract path. | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |

## Immediate Read

- `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.tsx#normalizeRows`
- `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.tsx#groupSessionsByWorkspace`
- `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.test.tsx`
- `apps/work/src/preload/index.d.ts#ElectronAPI`
- `apps/work/src/main/session-cache.ts#CachedSession`
- `apps/work/src/shared/i18n/locales/en/navigation.ts`
- `apps/work/lat.md/sidebar-navigation.md`

## Triggered Read

- If existing Sidebar disclosure markup cannot carry another section, read only its direct CSS selector; do not add another list surface.
- If a cache row lacks the declared pair, return to RM-01/PRD review rather than adding a Renderer fallback or IPC.
- If an action depends on grouping position rather than Session ID, read its direct callback only; do not alter Main ownership.

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.tsx#RecentSession` | PROD | MODIFY | Existing Sidebar row model | T1 | Retain exact pair and omit invalid rows | closed input | no |
| C01 | `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.tsx#normalizeRows` | PROD | MODIFY | Existing cache normalization | T1 | Validate pair before local state | closed input | no |
| C02 | `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.tsx#groupSessionsByWorkspace` | PROD | MODIFY | Existing grouping | T1 | Pinned/Projects/Chat/Work precedence | classified history | no |
| C03 | `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.tsx` | PROD | MODIFY | Existing cache-event sink | T1 | Reuse cache-only live refresh | live publication | no |
| C04 | `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.tsx` | PROD | MODIFY | Existing integration hotspot | T1 | Preserve actions/paging/profile behavior | regression preservation | no |
| C05 | `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.tsx` | PROD | MODIFY | Existing integration hotspot | T1 | Closed pair, no inference/third branch | scope prohibition | no |
| C01 | `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.test.tsx` | TEST | MODIFY | Existing test seam | T1 | Pair/omission/precedence/event/action proof | C01-C05 proof | no |
| C02 | `apps/work/src/shared/i18n/locales/en/navigation.ts` | PROD | MODIFY | English navigation source | T1 | Chat/Work history labels | source-locale UI | no |
| C02 | `apps/work/lat.md/sidebar-navigation.md` | DOC | MODIFY | Existing Sidebar record | T1 | Explicit-pair grouping/precedence documentation | architecture record | no |

## Domain Activation Ledger

None

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | MODIFY_EXISTING | `normalizeRows` is the shared sink for all Sidebar cache inputs. | Extends one local model/guard; no DTO/IPC. |
| C02 | MODIFY_EXISTING | `groupSessionsByWorkspace` already partitions unpinned rows. | Split existing ungrouped rows by explicit pair; retain pin/project UI. |
| C03 | REUSE_EXISTING | `onSessionCacheChanged` rereads cache and calls `applyLoadedWindow`. | Makes publication immediate without a timer, focus path, or second event. |
| C04 | REUSE_EXISTING | Existing Session-ID callbacks/tests own actions, paging, and profile reload. | Preserve ownership and prove through current seam. |
| C05 | MODIFY_EXISTING | RM-01 pair reaches preload; `normalizeRows` is first consumer. | Exact guard prevents inference/defaulting without registry or compatibility code. |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C01,C02,C03,C04,C05 | `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.tsx`; `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.tsx#RecentSession`; `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.tsx#normalizeRows`; `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.tsx#groupSessionsByWorkspace`; `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.test.tsx`; `apps/work/src/shared/i18n/locales/en/navigation.ts`; `apps/work/lat.md/sidebar-navigation.md` | `apps/work/src/preload/index.d.ts#ElectronAPI`; `apps/work/src/main/session-cache.ts#CachedSession`; existing Sidebar actions | - | no |

## Integration Hotspots

| File | Owner Todo | Reason |
|---|---|---|
| `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.tsx` | T1 | It owns normalization, event refresh, grouping, sections, paging, and row actions; one writer prevents grouping/action drift. |

## Generated Outputs Ledger

None. RM-02 changes handwritten Renderer TypeScript, English source-locale copy, focused tests, and the Sidebar architecture record.

## Todo T1 — Consume explicit Session classification in the existing Sidebar history

**Owns Changes**
- C01
- C02
- C03
- C04
- C05

**Goal**
Render Main-owned Chat and Work classifications in the existing history list with live cache-event updates and one row per loaded Session ID.

**Immediate anchors**
- `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.tsx#normalizeRows`
- `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.tsx#groupSessionsByWorkspace`
- `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.test.tsx`

**Changes**
- Retain the explicit pair and reject non-exact rows; never infer, default, write, or repair it.
- Preserve Pinned then Projects and partition remaining rows as Chat history or Work history.
- Reuse the existing cache-only event refresh for immediate publication.
- Keep Session-ID actions/paging/profile semantics, add focused tests, English labels, and updated Sidebar documentation.

**Stop conditions**
- [ ] Invalid/third rows never render as Chat or Work.
- [ ] Pinned/project/non-project rows have one destination and context folders never alter the pair.
- [ ] Cache-event refresh shows accepted rows without DB sync, focus, timer, or manual refresh.
- [ ] Existing actions, Main cache negative paths, source-locale guard, and two-mode scope regressions pass.

**Triggered reads**
- Only direct CSS/action callbacks under the documented triggers.

## Verification

Run V01-V03 through `smc-plan-delivery/scripts/evidence.py` in `apps/work`. All blocking modes are LOCAL.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all Cursor todos completed; completion audit/review FRESH PASS; V01-V03 FRESH PASS; CLM-01 through CLM-12 PASS; durable manifest FRESH | V01,V02,V03 via SMC evidence ledger and durable Evidence Manifest |
| IMPLEMENTED_NOT_PROVEN | implementation exists but proof/review/manifest is pending or stale | pending/stale gate IDs |
| BLOCKED | environment/dependency prevents implementation or proof | blocker record |
| RETURN_PRD | approved owner/boundary conflicts with current reality | PRD revision request |
