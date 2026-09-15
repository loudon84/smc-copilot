# WORK-KNOWLEDGE-01 Independent View — Plan Semantic Review (round 2)

**Plan:** `.cursor/plans/work-knowledge-01-independent-view.plan.md`
**Mode:** REQUIRED / FULL
**Verdict:** REVISE
**Grounded commit:** `fa02f4c00d8f425a2b24787cca592ac7ecb5875d`
**plan_sha256:** `sha256:8c9764d15676ec96e0ce58402c3a82e14654753e3af7b0ac1ef6fc4a2babcc56`
**Packet:** `.smc/runs/WORK-KNOWLEDGE-01/review/plan-semantic-review-packet.json`
**Prior REVISE (historical):** `docs/work/reviews/plan-work-knowledge-01-independent-view-semantic-review.md` bound to `sha256:3e201b0bb96ff336a08228973a222c292c7c795902f99bd05cf633962c8ecba7`

Independent reviewer: [Plan semantic review](b51573e7-0952-4247-9598-1d569e8d569b). Parent verified source anchors below. This review is independent of Plan Author conversation.

## Review Basis

Router forced FULL because the latest prior review is unresolved, and the Plan still has `new_owner`, `public_contract_change`, `security_boundary_change`, `schema_migration`, `protocol_change`, `lifecycle_contract_change`, `ownership_transfer`, and `cross_domain_contract_change`. Generation integrity and Plan v3.7 static validation PASS. Packet `prior_snapshot` is null.

Approved inputs: Stage PRD v1.3.0 APPROVED; Architecture Decision `AD-WORK-KNOWLEDGE-v1.0-INDEPENDENT-VIEW` APPROVED Option A.

## Findings

No OPEN BLOCKER.

### MAJOR

**M6 — Renderer UI proofs under `src/main/` cannot satisfy V06 typecheck.**
V01 / V03 / V05 place JSX-free `React.createElement` tests at `apps/work/src/main/knowledge/*.test.ts` and import renderer `Layout.tsx` / `KnowledgeView.tsx` / `KnowledgePages.tsx`. `apps/work/tsconfig.node.json` includes `src/main/**/*` with no test exclude and no `jsx`. `tsconfig.web.json` is the only project with `"jsx": "react-jsx"` and `@renderer`. V06 runs `npm --prefix apps/work run typecheck`. Existing working pattern is renderer-side `Chat.layout.test.tsx`. M5’s `.ts` placement avoids frontend `.tsx` activation, but makes blocking V06 unsatisfiable if the oracles are implemented as written.

Required Plan edit: move UI-mounting tests off the node include (for example `apps/work/tests/**/*.test.ts`, already in vitest `include`) or own a tsconfig exclude, without renaming to `.tsx` under `renderer/screens`.

**M7 — T4 / V03 mounts T2-owned `KnowledgeView` with no DAG edge.**
V03 and T4 focused check mount hidden `KnowledgeView` via `React.createElement` for AC-05 counters. `KnowledgeView.tsx` is T2-owned. T4 `Depends On` is empty. Ready set at start is `{T2, T4}`. T4’s V03 stop is not closed under T4’s own writes.

Required Plan edit: `T4 Depends On: T2` and T4 Reads `KnowledgeView.tsx`, or move the hidden-effect oracle to V01/V02 / T2.

**M8 — Knowledge import still trusts Renderer `context.profile` for ManagedFile bytes.**
T5 looks up `knowledgeJobId` and binds **association** `profileId` from the Job. Current `importOnePath` still uses `profileOrDefault(context.profile)` for config, `findByHash`, `storeManagedCopy`, `ManagedFile.profileId`, and `scheduleParseAfterImport` (`file-import-service.ts` 50–51, 86, 115, 131). File index DBs are per-profile. Association on Job `workProfileId` while bytes stay on Renderer profile splits the transaction and lets Renderer override profile/tenant (AC-04 / AD).

Required Plan edit: Knowledge import — all profile-keyed File Platform writes come from the Job partition; reject before any write if the Job is unknown or mismatched.

### MINOR

- **m1 — LIVE_VISUAL vs LOCAL proof.** Frontend Quality Ledger still copies PRD `LIVE_VISUAL`. Approved acceptance is LOCAL. Do not downgrade without a PRD revision.
- **m2 — DOD-04 `lat check`.** V06 now states this Stage does not update Work `lat.md/` and `lat check` is not blocking. Delivery note only.
- **m4 — Chat clipboard after discriminated consumer.** T5 rejects `stageClipboardImport` with `knowledgeJobId`. Chat clipboard still uses `context.sessionId`. State that Chat clipboard still requires `sessionId`.
- **m5 — Knowledge association idempotency.** `insertAssociation` short-circuits only when `assoc.sessionId` is set. Knowledge `sessionId` absent needs `knowledgeJobId` idempotency or V04 can allow duplicate rows.
- **m6 — T3 Reads vs Immediate anchors.** Write-Ownership Reads list 3 copy sources; Todo Immediate anchors list 6. Align them.
- **m7 — Backend Quality C11 owner.** “Remote Provider Adapter” contradicts “do not invent a live HTTP client”. Rename to the coordinator probe only.
- **m8 — C08 frontend file picker.** No renderer write. If this Stage only proves Main import (V04) and UI stays fail-closed, say that; do not use `composerFilePlatform.ts` (it forges `sessionId || "default"`).

## Semantic Checks

| Check | Verdict | Evidence |
|---|---|---|
| Grounding and minimality | PASS | `git ls-tree HEAD apps/` is only `apps/work`; `?? apps/knowledge/`. `grounding_source: working_tree` plus copy-source hashes and fingerprint match. Layout `View` has no `knowledge`; `en/navigation.ts` has no `knowledge` key. Isolated worktree without copy sources is BLOCKED. |
| Scope and Option A boundary | PASS | Independent View via `visitedViews`/`paneStyle`; no URL router, WebView, Settings Modal, `apps/knowledge` runtime import, `file-job:*` ingestion, or Work Chat Run. Draft Job `knowledgeBaseId`/`unbound` is specified. |
| Single writer and dependency DAG | FAIL (M7) | Writers otherwise unique. T1←T2, T3←T2+T4, T5←T4. T4→T2 missing for V03 mount. |
| Lifecycle and transaction closure | PARTIAL (M8, m5) | Job states, restart, hide/show, `knowledgeBaseId` are closed. Knowledge ManagedFile/copy/parse profile and association idempotency are not. |
| Cross-boundary security | PARTIAL (M8) | Job IPC is Main-derived and sanitized. File import bytes/config/parse still trust Renderer `context.profile`. |
| Verification fitness | FAIL (M6, M7) | `--passWithNoTests=false` closes empty-pass. UI proofs under `src/main` vs `tsconfig.node.json` + V06 typecheck cannot succeed as written. |

## Prior MAJOR M1–M5

| ID | Status | Notes |
|---|---|---|
| M1 | CLOSED | `working_tree` + copy-source ledger + fingerprint. |
| M2 | CLOSED | T1 owns `en/navigation.ts`; T3 owns `en/knowledge.ts` and English-only `index.ts#resources`. |
| M3 | CLOSED on stated items; residual = M8 | Job lookup and association partition bind are in the Plan. ManagedFile/copy/parse still `context.profile`. |
| M4 | CLOSED | Draft persists opaque `knowledgeBaseId` or sentinel `unbound`. |
| M5 | CLOSED for empty-pass / `.tsx` trigger | `--passWithNoTests=false`; tests stay `.ts`. Placement created M6. |

## Confirmed OK

- Option A owners and KEEP Chat/Skill Run/Settings/`FileJobQueue` parse semantics.
- `FileAssociation.sessionId?` already optional; Chat KEEP via required Chat `sessionId` XOR Knowledge `knowledgeJobId`.
- Domain Activation Ledger unique trigger sets match resolve(); `isolated_store` extra rows do not drop required domain coverage.
- No RETURN_PRD: remaining MAJORs are Plan verification/ownership gaps inside the approved PRD/AD.

## Conclusion

**REVISE.** The canonical Plan is not yet suitable for `smc-plan-delivery`. Do not implement `apps/work` product code against this hash. Plan Author should edit the same Plan in place (no second Plan) and re-run static validation plus a fresh FULL review bound to the new `plan_sha256`.

Required Plan edits: M6 test placement vs node typecheck; M7 T4→T2 or move AC-05 oracle; M8 Job partition owns all Knowledge File Platform profile writes.
