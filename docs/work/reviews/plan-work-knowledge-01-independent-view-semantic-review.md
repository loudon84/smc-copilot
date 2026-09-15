# WORK-KNOWLEDGE-01 Independent View — Plan Semantic Review

**Plan:** `.cursor/plans/work-knowledge-01-independent-view.plan.md`
**Mode:** REQUIRED / FULL
**Verdict:** REVISE
**Grounded commit:** `fa02f4c00d8f425a2b24787cca592ac7ecb5875d`
**plan_sha256:** `sha256:3e201b0bb96ff336a08228973a222c292c7c795902f99bd05cf633962c8ecba7`
**Packet:** `.smc/runs/WORK-KNOWLEDGE-01/review/plan-semantic-review-packet.json`

## Review Basis

Router forced FULL because the Plan has `new_owner`, `public_contract_change`, `security_boundary_change`, `schema_migration`, `protocol_change`, `lifecycle_contract_change`, `ownership_transfer`, and `cross_domain_contract_change`. Generation integrity and Plan v3.7 static validation already PASS. This review is independent of Plan Author conversation and is bound to the semantic Plan hash above.

Approved inputs: Stage PRD v1.3.0 APPROVED; Architecture Decision `AD-WORK-KNOWLEDGE-v1.0-INDEPENDENT-VIEW` APPROVED Option A.

## Findings

No OPEN BLOCKER.

### MAJOR

**M1 — `apps/knowledge` is not in the committed baseline.**  
`git ls-tree HEAD apps/` is only `apps/work`. `apps/knowledge/` is untracked (`??`) and `HEAD:apps/knowledge` does not exist. The Plan still declares `grounding_source: committed_baseline` and `working_tree_fingerprint: clean`, while C03/C06/C10/C13 grounding and T2/T3 Immediate Reads treat `apps/knowledge/src/utils/routes.ts` and `apps/knowledge/src/features/*` as PASS copy sources. Those files exist on disk, so the source is real but not durable at `fa02f4c`. Isolated worktrees at the grounded commit cannot reproduce T2/T3.

**M2 — Sidebar/page copy has no owned i18n write.**  
T1 must add a `PINNED_NAV_ITEMS` `labelKey` (Layout pattern at `navigation.ts`). HEAD `apps/work/src/shared/i18n/locales/en/navigation.ts` has no `knowledge` key. `check:i18n-source-locale-only` only rejects mixed en/non-en locale package changes, so the Plan's Triggered Read ("If Layout i18n guard fails") cannot fire. Fail-closed page copy for AC-09/AC-11 also has no Change Matrix owner. Result: required English locale writes are unowned.

**M3 — Knowledge import path does not enforce Main partition.**  
AC-04 / AD require Renderer not to self-report or override profile/tenant. T5 only rejects mixed/empty consumer keys at `importOnePath`. Current `file-import-service.ts` derives `profileId` from `context.profile` and always writes `assoc.sessionId`. The Plan does not require Main to resolve `knowledgeJobId` against the coordinator store or bind the association to the Job's Main-derived `{workProfileId, authSubject, tenantScope}`. V04 oracles do not include unknown-Job or cross-partition rejection.

**M4 — Draft Job is not bound to a target knowledge base.**  
PRD Q05 and AD Decision both require: Main first creates a draft Job bound to current identity **and the target knowledge base**. Contract/Data Flow Closure and T4 list `jobId`, partition, `attempt`, `status` only. This Stage must not invent a remote API, but it still needs an opaque persisted `knowledgeBaseId` (or an explicit fail-closed sentinel) on the draft Job.

**M5 — Blocking Vitest commands can pass with zero tests.**  
`apps/work/vitest.config.ts` sets `passWithNoTests: true`. V01/V05 target `.ts` files that must render React (`Layout` / fail-closed pages). Existing convention is `.tsx` (`Chat.layout.test.tsx`). If Delivery renames to `.tsx` without updating commands, blocking evidence exits 0 with an empty suite.

### MINOR

- **m1 — LIVE_VISUAL vs LOCAL proof.** Frontend Quality Ledger copies PRD `LIVE_VISUAL` (intent-binding EXACT; Plan must not silently rewrite it). Approved acceptance is LOCAL (`live_acceptance=false`). Not a Plan/PRD contradiction; do not downgrade the ledger without a PRD revision.
- **m2 — DOD-04 names `lat check`; V06 does not.** This Stage PRD also says product `lat.md/` is not updated here, and Work lat auto-hooks are disabled. Treat as a Delivery note, not a silent AC miss.
- **m3 — AC-05 hidden-effect counters sit on V03 (Main coordinator test).** State explicitly that V03 renders a hidden KnowledgeView, or move the oracle.
- **m4 — `stageClipboardImport` still reads `context.sessionId`.** T5 specifies the discriminated consumer only on `importOnePath`. Say Knowledge does not use clipboard staging, or extend the same rule.
- **m5 — `docs_agent/test-assets/` is new.** Schema-valid for v3.7 NEW assets; no prior repo convention.

## Semantic Checks

| Check | Verdict | Evidence |
|---|---|---|
| Grounding and minimality | FAIL (M1) | committed_baseline cannot see `apps/knowledge`; minimality of Layout/`createFilesApi`/association reuse is otherwise sound |
| Scope and Option A boundary | PASS with M4 | No URL router, mock provider, `file-job:*` ingestion, forged Chat `sessionId`, or `apps/knowledge` runtime import in planned writes; draft Job KB field is missing |
| Single writer and dependency DAG | PASS | `KnowledgeView.tsx` → T2; `KnowledgePages.tsx` → T3; coordinator → T4; hotspots `preload/index.ts` and `register.ts` → T4; DAG T1←T2, T3←T2+T4, T5←T4 |
| Lifecycle and transaction closure | PARTIAL (M3, m4) | Job states, restart, hide/show keep-alive are closed; import association lacks Job/partition validation |
| Cross-boundary security | PARTIAL (M3) | Coordinator command path is Main-derived and sanitized; file-import path still trusts Renderer `profile` and an unvalidated Job ID |
| Verification fitness | FAIL (M2, M5) | Commands exist and NEW tests are owned; i18n write is unowned; V01/V05 can false-pass under `passWithNoTests` |

## Confirmed OK

- Option A owners and KEEP Chat/Skill Run/Settings/`FileJobQueue` parse semantics are preserved in Plan text.
- `FileAssociation.sessionId?` is already optional; Chat KEEP via required Chat `sessionId` plus Knowledge `knowledgeJobId` is compatible with the AD if M3 is added.
- Domain Activation Ledger unique trigger sets match resolve(); `isolated_store` extra rows do not drop required domain coverage.
- No RETURN_PRD: all MAJORs are Plan grounding/ownership/verification gaps inside the approved PRD/AD.

## Conclusion

**REVISE.** The canonical Plan is not yet suitable for `smc-plan-delivery`. Do not implement `apps/work` product code against this hash. Plan Author should edit the same Plan in place (no second Plan) and re-run static validation plus a fresh FULL review bound to the new `plan_sha256`.

Required Plan edits: M1 grounding declaration or durable `apps/knowledge` baseline; M2 owned `locales/en` writes; M3 Main-side Job/partition check on Knowledge import; M4 opaque `knowledgeBaseId` on draft Jobs; M5 `.tsx` (or JSX-free) blocking test paths that cannot empty-pass.
