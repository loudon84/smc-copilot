---
roadmap_id: ROADMAP-WORK-KNOWLEDGE-v1.0-INDEPENDENT-VIEW
version: 1.1.0
status: ACTIVE
architecture_decision: docs/work/AD-WORK-KNOWLEDGE-v1.0-independent-view.md
source_revision: AD-WORK-KNOWLEDGE-v1.0-INDEPENDENT-VIEW@1.0.0
target_branch: work/prd-v5.0
updated_at: 2026-09-15T09:27:37.358617Z
implementation_plan_required: true
---

# Work Knowledge 独立 View 集成 Roadmap

This Roadmap delivers the approved Knowledge integration foundation: a Work Layout independent View, host-scoped module routing, a Main-owned Knowledge Upload Job, a distinguishable File Platform consumer, identity partition, and fail-closed upload/read behaviour while no real Knowledge provider exists.

## Architecture Decision

[AD-WORK-KNOWLEDGE-v1.0-INDEPENDENT-VIEW](AD-WORK-KNOWLEDGE-v1.0-independent-view.md)

## Delivery Invariants

- One Roadmap Item maps to one active Stage PRD.
- RM-01 may close only with fail-closed unavailable/empty behaviour; real provider success belongs to RM-02.
- Roadmap Items freeze outcomes and dependencies only; exact files, symbols, Todo ownership and test bindings belong to the canonical Plan.
- An Item reaches DONE only with an APPROVED Stage PRD, validated canonical Plan, fresh completion/review/verification evidence and a real implementation commit.

## Roadmap Items

| Item ID | Outcome | Depends On | Status | Exit Criteria | PRD | Plan | Implementation Commit | Verification Evidence |
|---|---|---|---|---|---|---|---|---|
| RM-01 | Knowledge is a retained Work Layout View with module-state routing, Main-owned upload jobs, Knowledge Job file association, identity partition, and fail-closed upload plus entity reads when no real provider exists. | - | DONE | Home/Bases/Sets/Documents/Uploads/Chat pages are reachable inside the Knowledge View without a window URL router; hiding the View keeps Chat Run unchanged and does not own Job execution; import never forges a Chat sessionId; no provider yields unavailable/empty rather than mock lists, mock Q&A, fake progress or fake completed; Chat/Skill Run/Settings behaviour is unchanged; Work does not runtime-import apps/knowledge. | docs/work/PRD-WORK-KNOWLEDGE-v1.0-independent-view-integration.md | .cursor/plans/work-knowledge-01-independent-view.plan.md | ac83fcd450e1adce7767d803648977a1adbb3d72 | docs_agent/evidence/WORK-KNOWLEDGE-01-evidence.json |
| RM-02 | A real Knowledge provider completes end-to-end upload and entity read success through the same Main Job Owner and capability gate. | RM-01 | BACKLOG | Requires a new APPROVED Architecture Decision and its own Stage PRD; capability probe is replaced by a real provider rather than a test adapter; blocking end-to-end success is not claimed on RM-01. | - | - | - | - |
