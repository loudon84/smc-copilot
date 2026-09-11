---
roadmap_id: ROADMAP-WORK-v4.2-UNIFIED-CONVERSATION-EXECUTION-PROVIDER
version: 1.1.0
status: ACTIVE
architecture_decision: docs/work/AD-WORK-v4.2-UNIFIED-CONVERSATION-EXECUTION-PROVIDER.md
source_revision: AD-WORK-v4.2-UNIFIED-CONVERSATION-EXECUTION-PROVIDER@1.0.1
target_branch: work/prd-v4.2
updated_at: 2026-09-11T00:53:47.125971Z
implementation_plan_required: true
---

# Work v4.2 Unified Conversation / Execution Provider Roadmap

This Roadmap delivers the approved closed two-mode architecture: original Chat and Skill Run share one Native conversation presentation while retaining separate execution truth and explicit Session classification.

## Roadmap Items

| Item ID | Outcome | Depends On | Status | Exit Criteria | PRD | Plan | Implementation Commit | Verification Evidence |
|---|---|---|---|---|---|---|---|---|
| RM-01 | Establish the Main-owned scoped Session metadata and index foundation for `chat/hermes-chat` and `work/skill-run`. | - | DONE | A logical Session is durably keyed by trusted Main scope, profile and session identity; every supported cache producer returns explicit valid classification; accepted Skill Run is `work/skill-run`, pre-accept failure creates no Work history, and remaining supported Chat data is `chat/hermes-chat`; two-class backfill is idempotent; missing/corrupt metadata fails closed and targeted repair, deletion cleanup, sanitized diagnostics and non-destructive rollback all converge without Renderer inference. | docs/work/PRD-WORK-v4.2-RM-01-session-metadata-index-foundation.md | .cursor/plans/work-v4.2-rm-01-session-metadata-index-foundation.plan.md | 5a4693ce581ed29ff9697c058db681d80afb47d2 | smc-evidence:WORK-v4.2-RM-01-session-metadata-index-foundation@sha256:7a2aa717fde6c5d547f572c9e3c12ee85554b6d4637d299c0efd72c712baaef9 |
| RM-02 | Publish classified Chat and Work history immediately through the existing Sidebar/session index without duplicate rows. | RM-01 | IN_PRD | New original Chat appears in Chat history after its first valid Session becomes visible; accepted Skill Run appears in Work history; neither path requires focus, timer or manual refresh; each Session appears once using Pinned → Projects → Chat history/Work history precedence; context folder remains independent of classification and project rows retain their explicit kind. | docs/work/PRD-WORK-v4.2-RM-02-history-classification-live-publication.md | - | - | - |
| RM-03 | Project Skill Run execution into the Native Chat transcript with deterministic live, reopen and restart parity. | RM-01 | BACKLOG | Original Chat and Skill Run both render through Native `ChatMessage → MessageList`; prompt precedes reasoning/tools/result; reasoning and tool rows use stable Provider identities and sequence; one tool row updates `started → completed/failed`; lifecycle-only tools do not fabricate arguments/results; 10+ tools fold through the existing group; assistant delta ordering and authoritative snapshot are preserved; artifacts remain File Platform resources; replay/restart produces the same ordered transcript without duplicate rows or raw Provider/JWT/endpoint exposure. | - | - | - | - |
| RM-04 | Remove the duplicate Skill Run transcript presentation while preserving its compact control surface and safe rollback. | RM-02, RM-03 | BACKLOG | The main transcript has no Skill Run-specific MessageList/result/activity-history branch; active skill, phase, approval, cancel and artifact retry remain reachable only in the compact control surface; terminal control UI unmounts as specified; feature rollback changes presentation/Sidebar consumption only and never deletes or downgrades durable classification, audit or File identity; re-enable requires no destructive re-backfill. | - | - | - | - |

## Delivery Invariants

- One Roadmap Item maps to one active Stage PRD.
- Expert/HermesTask remains outside every v4.2 Item; no compatibility or migration branch may be added.
- Roadmap Items freeze outcomes and dependencies only; exact files, symbols, Todo ownership and test bindings belong to the canonical Plan.
- An Item reaches DONE only with an APPROVED Stage PRD, validated canonical Plan, fresh completion/review/verification evidence and a real implementation commit.
