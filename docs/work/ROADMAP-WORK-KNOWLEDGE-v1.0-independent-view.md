---
roadmap_id: ROADMAP-WORK-KNOWLEDGE-v1.0-INDEPENDENT-VIEW
version: 1.2.0
status: ACTIVE
architecture_decision: docs/work/AD-WORK-KNOWLEDGE-v1.1-mock-mode.md
source_revision: AD-WORK-KNOWLEDGE-v1.1-MOCK-MODE@1.1.0
target_branch: work/prd-v5.1
updated_at: 2026-09-15T12:05:00.000000Z
implementation_plan_required: true
---

# Work Knowledge 独立 View 集成 Roadmap

This Roadmap delivers the approved Knowledge integration foundation and the v1.1 explicit Mock Mode: a Work Layout independent View, host-scoped module routing, a Main-owned Knowledge Upload Job, identity partition, an explicit `dataMode=mock|provider` facade, and Work-native page feature parity on mock data before a real provider exists.

## Architecture Decision

[AD-WORK-KNOWLEDGE-v1.1-MOCK-MODE](AD-WORK-KNOWLEDGE-v1.1-mock-mode.md) supersedes only the v1.0 mock-prohibition clauses. [AD-WORK-KNOWLEDGE-v1.0-INDEPENDENT-VIEW](AD-WORK-KNOWLEDGE-v1.0-independent-view.md) remains the foundation for View, routing, Main Job, File Platform, Auth, and Chat isolation.

## Delivery Invariants

- One Roadmap Item maps to one active Stage PRD.
- RM-01 remains historically DONE with fail-closed foundation evidence; this Roadmap does not reopen or rewrite that result.
- Explicit Mock Mode and page feature parity are new Items. They must not reuse RM-01 or masquerade as RM-02.
- `dataMode=provider` stays fail-closed. Mock content is allowed only in explicit `dataMode=mock` with a visible Mock/Demo identifier and no silent fallback.
- Real provider success belongs to RM-02 and requires the same Provider Facade.
- Roadmap Items freeze outcomes and dependencies only; exact files, symbols, Todo ownership and test bindings belong to the canonical Plan.
- An Item reaches DONE only with an APPROVED Stage PRD, validated canonical Plan, fresh completion/review/verification evidence and a real implementation commit.

## Roadmap Items

| Item ID | Outcome | Depends On | Status | Exit Criteria | PRD | Plan | Implementation Commit | Verification Evidence |
|---|---|---|---|---|---|---|---|---|
| RM-01 | Knowledge is a retained Work Layout View with module-state routing, Main-owned upload jobs, Knowledge Job file association, identity partition, and fail-closed upload plus entity reads when no real provider exists. | - | DONE | Home/Bases/Sets/Documents/Uploads/Chat pages are reachable inside the Knowledge View without a window URL router; hiding the View keeps Chat Run unchanged and does not own Job execution; import never forges a Chat sessionId; no provider yields unavailable/empty rather than mock lists, mock Q&A, fake progress or fake completed; Chat/Skill Run/Settings behaviour is unchanged; Work does not runtime-import apps/knowledge. | docs/work/PRD-WORK-KNOWLEDGE-v1.0-independent-view-integration.md | .cursor/plans/work-knowledge-01-independent-view.plan.md | ac83fcd450e1adce7767d803648977a1adbb3d72 | docs_agent/evidence/WORK-KNOWLEDGE-01-evidence.json |
| RM-03 | Work Knowledge exposes an explicit Main-owned Mock Mode foundation (AD stage RM-MOCK-01): mode controller, provider facade, mock namespace, mode-discriminated Job contract with progress/completed, persistent mock executor, File association isolation, visible mode badge, and no silent fallback. | RM-01 | PLANNED | Main holds `dataMode`; Renderer cannot override or fallback; mock and provider namespaces are isolated; legacy Jobs are `legacy-unclassified` and never default into mock; mock Jobs recover across View hide/reload/restart without a Renderer timer; release/mock entry requires `mode=mock` and `allowSyntheticData=true`; provider mode remains fail-closed. | docs/work/PRD-WORK-KNOWLEDGE-v1.1-RM-MOCK-01-mock-mode-foundation.md | .cursor/plans/work-knowledge-mock-01-mock-mode-foundation.plan.md | - | - |
| RM-04 | Home, Bases, Sets, Documents, Uploads, and Knowledge Chat are Work-native and operable on explicit mock data, excluding Profile and source Shell/Router/UI kit (AD stage RM-MOCK-02). | RM-03 | BACKLOG | Six page domains match the approved information architecture; mock-mode mutations and Q&A work through the facade; provider mode stays unavailable/disabled; Profile/Preferences independent pages are absent; no runtime import of `apps/knowledge`. | docs/work/PRD-WORK-KNOWLEDGE-v1.1-RM-MOCK-02-page-feature-migration.md | - | - | - |
| RM-02 | A real Knowledge provider completes end-to-end upload and entity read success through the same Main Job Owner and Provider Facade. | RM-01, RM-03 | BACKLOG | Requires its own Stage PRD; Remote Adapter replaces the mock adapter under the same facade; provider mode end-to-end success is blocking; default-mode and mock retention/retirement are explicit decisions. | - | - | - | - |
