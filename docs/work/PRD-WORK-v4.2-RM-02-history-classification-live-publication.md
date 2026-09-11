---
work_item_id: RM-02
version: 1.0.0
status: APPROVED
target_branch: work/prd-v4.2
review_verdict: PASS
approved_at: 2026-09-11T08:05:00+08:00
source_revision: AD-WORK-v4.2-UNIFIED-CONVERSATION-EXECUTION-PROVIDER@1.0.1/RM-02
grounded_commit: fecd7c755d0b9f78688aa831a920749e96b1970d
---

# Work v4.2 RM-02 History Classification and Live Publication

## Scope

RM-02 consumes the explicit, Main-owned Session classification delivered by RM-01 to present one Session row in the existing Sidebar history. It adds no execution provider, transcript projection, cache writer, classification migration, or Expert/HermesTask path.

## Non-Goals

- Do not change original Chat execution, Skill Run execution/audit, File Platform ownership, the public Provider contract, or any Main-side classification rule.
- Do not infer classification from `source`, session ID, tool name, message content, `contextFolder`, transport, timer state, or Renderer state.
- Do not alter the Native transcript, add Skill Run transcript rows, or remove `SkillRunTranscriptCard`; those are RM-03/RM-04 concerns.
- Do not add Expert/HermesTask recognition, compatibility, migration, history grouping, or backfill behavior.
- Do not duplicate the existing Sidebar session list, create a second cache, or add a Provider registry.

## Current Capability Inventory

| Capability | Current State | Production Owner | Grounded Observation |
|---|---|---|---|
| Closed Session classification and sanitized cache DTO | EXISTS | Work Main Session metadata/index and preload boundary | RM-01 publishes only `chat/hermes-chat` and `work/skill-run` through `listCachedSessions` and `syncSessionCache`. |
| Cache-change publication | EXISTS | Work Main Session cache | The existing sanitized cache-change event is emitted after targeted cache mutations; Sidebar already rereads the cache on that event. |
| Sidebar recent-session list | EXISTS/PARTIAL | Renderer `SidebarRecentSessions` | It pages and refreshes the cache, pins rows, and groups unpinned rows only as Projects or one undifferentiated Chats section. Its local row model currently discards classification fields. |
| Project association | EXISTS | Main context-folder store and Renderer Sidebar | `contextFolder` is persisted independently and Sidebar groups those rows under Projects. |
| Session selection, rename, move, and delete | EXISTS | Existing Sidebar/menu and Main session owners | These actions operate by Session ID and must remain provider-agnostic. |
| Classified Chat/Work history presentation | MISSING | No Renderer consumer currently owns it | The explicit pair reaches preload but is not retained or rendered by the Sidebar. |

## Target End-State Inventory

| Capability | Target State | Production Owner | Boundary / Observable Result |
|---|---|---|---|
| Classified Sidebar row model | MODIFY | Renderer Sidebar | Retains only the explicit sanitized pair received from the cache DTO; invalid/missing/cross-paired rows are omitted rather than defaulted. |
| Sidebar history precedence | MODIFY | Renderer Sidebar | Each Session appears at most once: Pinned, then Projects when `contextFolder` exists, then Chat history for `chat/hermes-chat`, then Work history for `work/skill-run`. |
| Live cache publication consumption | MODIFY | Renderer Sidebar | A cache-change hint causes the already-open Sidebar to reread its loaded cache window and present accepted Chat/Work rows without focus, timer expiry, or manual refresh. |
| Project association | KEEP | Existing context-folder owner and Sidebar | `contextFolder` keeps its current Projects role and never alters the explicit product classification. |
| Existing row actions and navigation | KEEP | Existing Sidebar/menu and Main session owners | Selecting, renaming, moving, pinning, and deleting retain their current Session-ID behavior irrespective of classification. |
| Renderer classification authority | PROHIBIT | Work Main remains authority | Renderer never derives, writes, repairs, persists, or broadens the two-pair classification contract. |

## Change Classification

| Change ID | Classification | Requirement | Production Owner | Boundary |
|---|---|---|---|---|
| C01 | MODIFY | Preserve and validate explicit cache classification in the existing Sidebar row model. | Renderer Sidebar | Only exact `chat/hermes-chat` and `work/skill-run` pairs are displayable; no fallback/default exists. |
| C02 | MODIFY | Partition unpinned, non-project rows into Chat history and Work history while retaining the existing Pinned/Projects precedence. | Renderer Sidebar | A Session ID has one displayed destination; `contextFolder` remains orthogonal metadata. |
| C03 | MODIFY | Apply existing cache-change hints to the visible loaded window so newly accepted Chat/Work Sessions appear promptly. | Renderer Sidebar consuming existing Main event/cache | Event payload remains sanitized and classification remains read from cache DTOs, never inferred from event content. |
| C04 | KEEP | Preserve existing session row actions, pagination, profile refresh, and cache-only event refresh behavior. | Existing Sidebar/menu and Main owners | No new IPC, cache writer, Provider owner, or transcript path. |
| C05 | PROHIBIT | Exclude all third classes and Expert/HermesTask behavior. | Closed RM-01 classification contract | No compatibility, migration, or historical recognition branch may be introduced. |

## Behaviour and Boundaries

### Closed renderer input

The renderer accepts a cache row for classified history only when the pair is exactly one of:

| `sessionKind` | `executionProvider` | Destination when not pinned/project-linked |
|---|---|---|
| `chat` | `hermes-chat` | Chat history |
| `work` | `skill-run` | Work history |

The pair is Main-owned metadata carried across the existing preload cache API. A row that is absent, partial, cross-paired, unknown, or otherwise invalid is not placed in a classified history group. Renderer omission is a defensive display boundary, not a repair or classification decision.

### Single-row grouping precedence

The existing pin state has first precedence. A pinned Session appears once in Pinned and is removed from all other groups. An unpinned Session with a non-empty `contextFolder` appears once under its existing Project folder, retaining its explicit classification as row data. Only remaining rows enter Chat history or Work history according to the closed pair. Repeated cache reads, cache-change hints, pagination, or a transition between pinned/project/unprojected states converge on one row per Session ID in the loaded window.

### Live publication

RM-01's Main publication order remains authoritative: durable valid classification, cache update, then sanitized cache-change event. On that existing event, an open Sidebar rereads cache data for its loaded window and reapplies the grouping precedence. A new original Chat or an accepted Skill Run therefore becomes visible without relying on window focus, the periodic refresh timer, or a manual refresh. Closed/collapsed Sidebar state retains its existing no-work behavior; reopening performs its normal cache read/sync.

### Ownership preservation

The Sidebar can render headings and row grouping only. It does not mutate Session metadata, issue classification IPC, alter provider lifecycle, materialize transcript content, or expose endpoint/credential/raw event data. Existing selection, rename, context-folder move, pin, delete, pagination, profile switching, and accessibility behavior retain their current owners. English source-locale strings are the only permitted new UI copy source.

## Acceptance Criteria

- **AC-01**: [C01] The Sidebar retains only explicit valid `chat/hermes-chat` and `work/skill-run` values from the cache DTO; missing, partial, cross-paired, unknown, and third-class values do not appear in a classified history group and never default to Chat.
- **AC-02**: [C02] Every loaded Session ID appears at most once with strict Pinned → Projects → Chat history → Work history precedence; project-linked rows retain their explicit classification but do not duplicate into Chat or Work history.
- **AC-03**: [C02] Unpinned rows without `contextFolder` render under Chat history only for `chat/hermes-chat` and Work history only for `work/skill-run`; changing `contextFolder` changes only project placement, not classification.
- **AC-04**: [C03] An open Sidebar reflects a newly published original Chat or accepted Skill Run after the existing sanitized cache-change hint without focus, periodic timer expiry, or manual refresh, and the hint path does not trigger a Main DB sync.
- **AC-05**: [C04] Pagination, profile changes, pin/unpin, rename, context-folder moves, selection/resume, and deletion preserve current behavior and converge without duplicate rows after repeated cache reads/events.
- **AC-06**: [C01/C05] The Renderer contains no inference, write, repair, compatibility, migration, or recognition branch for Expert/HermesTask or any third Session/provider class.
- **AC-07**: [C04] The change preserves Main-owned classification, sanitized cache/event boundaries, Chat and Skill Run execution truth, Skill Run audit/continuation truth, and File Platform identity.
- **AC-08**: [C02/C04] New visible history labels and accessibility names use the English source locale; no non-English locale package is modified.

## Definition of Done

- **DOD-01**: Focused Renderer tests prove the closed two-pair input, precedence, invalid-row omission, event-driven live publication, pagination convergence, and existing row-action regressions.
- **DOD-02**: Existing Main cache/classification and pre-accept Skill Run negative-path coverage remains passing without adding a Renderer→Main classification write or a new cache/Provider owner.
- **DOD-03**: The implementation contains no Expert/HermesTask or third-class compatibility/migration branch and no transcript/Provider contract change.
- **DOD-04**: All blocking claims have fresh recorded evidence before RM-02 is marked DONE.

## Evidence Baseline

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason |
|---|---|---|---|---|---|---|---|
| CL01 | AC-01 closed renderer input | Only the two Main-published pairs enter classified history; invalid rows are omitted. | YES | RM-01 durable manifest V01/V05 at `5a4693ce`. | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Renderer is a new consumer of the pair. |
| CL02 | AC-02/AC-03 precedence and orthogonality | Pin/project/classified destinations produce one row per ID without context-folder inference. | YES | Existing Sidebar grouping and cache tests. | RESIDUAL_GAP | NEW_EVIDENCE | Chat/Work partition is absent today. |
| CL03 | AC-04 live publication | Existing cache-change event updates visible classified rows without a Main sync. | YES | Existing Sidebar cache-only event tests and RM-01 Main publication evidence. | PROVEN_BUT_AFFECTED | TARGETED_RERUN | New grouping must be applied on the event path. |
| CL04 | AC-05 existing interaction convergence | Existing Sidebar interaction/paging/profile behavior survives the new grouping. | YES | Existing `SidebarRecentSessions` focused tests. | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Row partitioning changes the rendered collections. |
| CL05 | AC-06/AC-07 two-mode and owner preservation | No forbidden mode or owner change exists; Main/Provider/transcript/File boundaries stay unchanged. | YES | APPROVED AD and RM-01 manifest. | PROVEN_REQUIREMENT | NEW_EVIDENCE | RM-02 implementation must demonstrate the scoped absence/regression boundary. |
| CL06 | AC-08 source-locale boundary | New UI labels are English-source-only and accessible. | YES | Work i18n repository rule and existing Sidebar labels. | RESIDUAL_GAP | TARGETED_RERUN | New Chat/Work headings require source-locale coverage. |
