# M1 Main/Preload Dark Foundation — Independent PRD Review

Mode: `initial` (six gates). Evidence reuse: `source_revision` `WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.1/RM-02`, `grounded_commit` `ac88d25ea93722126a1d3661ac55404ed92e7eef`. Skill Run source under that commit is unchanged; this pass does not re-run discovery. The PRD is already `APPROVED` from an earlier PASS; this review does not modify it.

## Verdict

PASS

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| G1 Scope | PASS | In/Out freeze M1 to Main/Preload dark foundation, default-off, and focused evidence. Live replay, `skill-first` default, real start/recovery/artifact, Layout/Chat selection UI, P1, and Expert removal stay out. |
| G2 Existing capability | PASS | Inventory reuses shared DTO, consumer lock, Gateway, Service, IPC, and Preload. No parallel client, session, or file owner is added. Existing Renderer skill-run UI and later-milestone IPC methods remain owned by later items, not claimed as M1 deliverables. |
| G3 Production ownership | PASS | Main `SkillRunGatewayClient` / `SkillRunService` remain the only Backend/lifecycle owners; `src/shared/skill-run.ts` remains the cross-process DTO owner; Preload is an IPC wrapper; Renderer is limited to sanitized DTO. |
| G4 Classification | PASS | C01–C05 are KEEP against an EXISTS baseline. Test-only repair is bounded to existing owners and a proven direct regression, which is not an ADD. |
| G5 Contract and security | PASS | Bundle input stays checksum-valid `contracts/skill-run/<version>/`. Missing lock or `capabilityKind` is `contract-unsupported`. Default `expert-compat` rejects `start` before `tools/call`. Start IPC validates sender, auth generation, required fields, and length. Renderer does not gain token, origin, raw event, or bytes. |
| G6 Behaviour to AC | PASS | AC1–AC6 make the unique IPC surface, fail-closed catalog, default no-request path, start validation, and focused suites observable. AC7 keeps RM-01 live proof as the RM-04/production execution gate. |

## Findings

No OPEN BLOCKER or MAJOR finding.

### NOTE

- Roadmap `RM-02` is still `IN_PRD` while this Stage PRD is already `APPROVED`. That is delivery-state lag, not a PRD architecture defect.
- `skill-run-contract-parser.ts` is an existing Main collaborator of Gateway/Service, not a second production owner. Exact private file listing belongs in Plan, not a PRD MAJOR.
- Preload already exposes cancel/rehydrate/artifact/session methods. M1 KEEP of the existing wrapper does not enable those lifecycles; RM-04/RM-05 retain behavioural ownership.
- Roadmap M1 narrative still mentions Expert focused regression. This Stage PRD does not modify Expert, so omitting that AC is consistent with unique-owner scope.

## Routing

PASS, and the PRD is already `APPROVED` with `review_verdict: PASS`. Do not re-enter `smc-prd-converge`. Next governed step is `smc-plan-from-approved-prd-ponytail` for RM-02.
