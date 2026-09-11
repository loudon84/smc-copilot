---
work_item_id: RM-04
version: 1.0.0
status: APPROVED
target_branch: work/prd-v4.2
review_verdict: PASS
approved_at: 2026-09-11T11:23:19+08:00
source_revision: AD-WORK-v4.2-UNIFIED-CONVERSATION-EXECUTION-PROVIDER@1.0.1/RM-04
grounded_commit: d3300138
---

# Work v4.2 RM-04 Duplicate Presentation Removal and Rollback Closure

## Scope

RM-04 completes the approved two-mode conversation presentation by removing
the remaining Skill Run-specific transcript card and duplicate status-bar
activity history. Native `ChatMessage → MessageList` remains the sole normal
transcript presentation for original Chat and new Skill Run. Compact Skill Run
controls and non-destructive rollback remain available; this PRD does not add
a mode, Provider, migration, or Expert/HermesTask path.

## Non-Goals

- Do not change Main Skill Run execution, sanitization, audit/continuation,
  Session classification/cache, original Chat, or the remote Provider contract.
- Do not create another transcript/list, control surface, store, IPC, feature
  registry, raw event channel, or Renderer-to-Main writer.
- Do not move approval, cancel, phase, artifact retry, or artifact identity
  into transcript rows; File Platform remains the ManagedFile/Session Files owner.
- Do not add Expert/HermesTask recognition, historic compatibility, migration,
  backfill, or any third Session/provider class.

## Current Capability Inventory

| Capability | Current State | Production Owner | Grounded Observation |
|---|---|---|---|
| Native Skill Run projection | EXISTS | Renderer Skill Run adapter and Native Chat presentation | Accepted/live/reopen Skill Runs already map to user, Native activity, and assistant rows by stable request/event/call identity. |
| Legacy card union and renderer branch | EXISTS/CONFLICT | Renderer Chat types and `MessageList` | `SkillRunMessage`, `kind: skill_run`, `SkillRunTranscriptCard`, and a MessageList card branch remain, even though the normal adapter uses Native rows. |
| Legacy history mapping | EXISTS/CONFLICT | Renderer session-history mapper | Main `skill_run` history data can still become a `SkillRunMessage`, retaining an alternate transcript representation. |
| Compact control surface | EXISTS | `SkillRunStatusBar` | Approval, cancel, retry, phase/error summary, and an activity list are currently reachable, but the activity list duplicates Native transcript history. |
| Safe rollback inputs | EXISTS | Existing feature mode plus Main durable classification/audit/File owners | Presentation can change without deleting classification, audit, continuation, or ManagedFile identity. |

## Target End-State Inventory

| Capability | Target State | Production Owner | Boundary / Observable Result |
|---|---|---|---|
| Normal transcript presentation | REMOVE | Renderer Chat legacy card branch | No `SkillRunMessage`, `skill_run` MessageList branch, or `SkillRunTranscriptCard` participates in normal Chat transcript or session-history mapping. |
| Native Skill Run rows | KEEP | Existing RM-03 adapter and `MessageList` | Native prompt/reasoning/tool/read-only notice/result rows remain the sole transcript presentation. |
| Compact controls | MODIFY | Existing `SkillRunStatusBar` | Approval, cancel, current phase/error and artifact retry remain reachable; duplicate activity-history rendering is absent. |
| Rollback | MODIFY | Existing feature/presentation boundary | Disabling/re-enabling presentation does not delete or downgrade durable metadata, Skill audit/continuation, cache identity, or File Platform identity, and does not require re-backfill. |
| Artifact resources | KEEP | Main File Platform and Session Files | Artifacts remain ManagedFile resources, not transcript rows or card-owned payloads. |

## Change Classification

| Change ID | Classification | Requirement | Production Owner | Boundary |
|---|---|---|---|---|
| C01 | REMOVE | Remove `SkillRunMessage`, `skill_run` transcript rendering, and `SkillRunTranscriptCard` from the normal Renderer conversation/history path. | Existing Renderer Chat/skill-run presentation | Native rows remain; no second transcript presentation is substituted. |
| C02 | REMOVE | Remove duplicate activity-history display from the compact status surface. | Existing `SkillRunStatusBar` | Compact controls retain only current control/status affordances; historical activity belongs to Native transcript rows. |
| C03 | MODIFY | Preserve compact approval, cancel, current phase/error, and artifact-retry reachability after the removals. | Existing compact control owner | Controls call their existing safe IPC/action owners and do not become transcript semantics. |
| C04 | MODIFY | Prove presentation rollback/re-enable is non-destructive and reuses existing durable Session/audit/File identities. | Existing feature/presentation boundary and Main durable owners | No deletion, downgrade, cache rewrite, or re-backfill is allowed. |
| C05 | KEEP | Preserve RM-03 Native row identity/order, original Chat behavior, Main execution/audit/continuation, and File Platform ownership. | Existing owners | No Provider, transcript-store, or classification ownership moves. |
| C06 | PROHIBIT | Exclude Expert/HermesTask, third mode/provider, registry, compatibility migration, and raw Provider exposure. | Closed v4.2 Architecture | The product remains original Chat plus new Skill Run only. |

## Behaviour and Boundaries

The normal transcript has one presentation owner: Native `MessageList`. A
Skill Run appears only as the RM-03 Native prompt, activity, and assistant
rows; re-opening a session cannot revive a `skill_run` card. The compact
surface still exposes active phase/error and approval, cancel, and artifact
retry actions, but no longer repeats reasoning/tool/clarify/approval activity
as a second transcript/history list.

Presentation rollback changes only whether the existing Native projection is
shown. It must not remove, reclassify, rewrite, or backfill Main-owned Session
metadata/cache; delete Skill Run audit/continuation; or alter ManagedFile and
Session Files identity. Re-enable reuses the same accepted Session and run
identities. The Renderer continues to consume only sanitized data and has no
execution, audit, classification, Provider, or File write authority.

## Acceptance Criteria

- **AC-01**: [C01] A live, reopened, or restarted Skill Run renders only through Native `ChatMessage → MessageList` rows; no `SkillRunMessage`, `skill_run` MessageList branch, or `SkillRunTranscriptCard` is reachable from the normal transcript/history path.
- **AC-02**: [C01/C05] Original Chat and RM-03 Native Skill Run prompt/reasoning/tool/read-only notice/result ordering and stable identities remain unchanged; no second MessageList, transcript store, or presentation adapter is introduced.
- **AC-03**: [C02/C03] During an active Skill Run, current phase/error, approval allow/deny, cancel, and artifact retry remain reachable through the compact control surface, while reasoning/tool/clarify/approval activity is not repeated there as a second history list.
- **AC-04**: [C03] Compact controls preserve their existing safe action boundaries and do not fabricate Local Chat clarify semantics, raw Provider data, or transcript-owned artifact data.
- **AC-05**: [C04] Feature rollback/re-enable preserves classified Session rows, accepted Skill Run audit/continuation, and ManagedFile/Session Files identity without deletion, downgrade, cache/classification rewrite, or destructive re-backfill.
- **AC-06**: [C05/C06] Main execution/audit/continuation and File Platform remain their current owners; Renderer receives no raw SSE/JWT/endpoint/payload and adds no write channel, Expert/HermesTask path, third mode, registry, or migration branch.

## Definition of Done

- **DOD-01**: Focused renderer/history tests prove the removed card/union/branch cannot reappear for live, reopen, or restart, while RM-03 Native rows retain ordering and identity.
- **DOD-02**: Focused compact-control tests prove approval, cancel, phase/error, and artifact retry remain reachable and activity history is not duplicated.
- **DOD-03**: Rollback/re-enable tests prove durable classification, audit/continuation, cache and File Platform identities are non-destructive and reusable.
- **DOD-04**: Existing Main Skill Run, Session, File Platform, and original Chat coverage remains passing with no new public Provider/IPC contract or Renderer writer.
- **DOD-05**: All blocking claims have fresh recorded evidence before RM-04 is marked DONE.

## Evidence Baseline

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason |
|---|---|---|---|---|---|---|---|
| CL01 | AC-01 | Normal transcript/history cannot create a legacy card. | YES | RM-03 Native projection delivery evidence. | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Legacy union/branches still exist. |
| CL02 | AC-02 | Native Chat and Skill Run presentation stays singular and ordered. | YES | RM-03 delivery evidence. | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Removing legacy variants changes union/history routing. |
| CL03 | AC-03/AC-04 | Compact controls survive while activity list is absent. | YES | Existing status-bar tests. | RESIDUAL_GAP | NEW_EVIDENCE | Control/history separation is new. |
| CL04 | AC-05 | Rollback/re-enable is presentation-only and non-destructive. | YES | RM-01/RM-02 durable identity evidence. | PROVEN_BUT_AFFECTED | TARGETED_RERUN | RM-04 removes presentation code. |
| CL05 | AC-06 | Closed owner/trust/two-mode boundaries remain intact. | YES | APPROVED AD and RM-03 evidence. | PROVEN_REQUIREMENT | NEW_EVIDENCE | Final removal must prove no replacement owner/branch appears. |
