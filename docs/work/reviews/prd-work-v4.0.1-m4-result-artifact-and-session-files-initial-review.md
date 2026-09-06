# M4 Result, Artifact, and Session Files — Initial PRD Review

Review scope is RM-05 Stage PRD v1.0.0 (`REVIEW_REQUIRED`). Evidence freshness is `REUSE` against `grounded_commit` `2820d5f8d69a77289b5f6741e10a095fb1a4e85f` and `source_revision` `WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.1/RM-05`; this review does not re-ground the repository. It does not approve a Plan, mark RM-01 or RM-05 DONE, or authorize production-default `skill-first`.

## Verdict

PASS

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| G1 Scope | PASS | In is File Platform identity, Bundle Artifact consume, provider-dispatched transfer, Session `agent-output`, fail-soft retry, and fixture/focused proof. Out keeps RM-01 DONE, M5 production default, P1, Expert removal, Skill download IPC, and `SkillArtifactCards`. Live Checkpoint B is an RM-05 Roadmap `DONE` bar (AC-10), not an implementation-commit prerequisite, matching Roadmap M4/Checkpoint B without expanding into M5. |
| G2 Existing capability | PASS | Reuses File Platform store/upsert/preview/Save As/Session Files and existing Skill discovery/retry/materialize. Does not ADD a second file, session, or download owner. Expert transfer remains Expert-only after C02. |
| G3 Production ownership | PASS | File Platform owns ManagedFile, Preview, Save As, materialize, Session Files. `SkillRunService` only lists/adapts/retries discovery. Gateway only consumes Bundle `/api/v1/runs/{run_id}/artifacts*`. Renderer consumes sanitized `ManagedFileView` plus existing `hermesAPI.files` and `skillRun.retryArtifactDiscovery`. |
| G4 Classification | PASS | C01/C02/C04/C05 MODIFY existing owners. C03 REMOVE has a Removal Condition and does not rewrite Expert. C06 KEEP compact Result, files IPC, and `expert-compat`. Save As CONFLICT is resolved by dispatching existing File Platform transfer, not by replacing File Platform. Architecture KEEP for Skill Artifact is closed by these MODIFY/REMOVE gaps, not by a new owner. |
| G5 Contract and security | PASS | Production upsert requires v1.2.1 `PublicArtifactList` / `PublicArtifactDescriptor`. Download is only Bundle `GET /api/v1/runs/{run_id}/artifacts/{artifact_id}/download`. Missing `run_id` fail-closed. Renderer cannot receive JWT, download URL, absolute cache path, raw bytes, or `remoteRunId`. No Skill download IPC. Discovery/transfer failure cannot flip `succeeded`. Expert rows stay a separate provider identity. |
| G6 Behaviour to AC | PASS | AC-01 Result bubble + fail-soft; AC-02 Bundle descriptor consume; AC-03 run-scoped isolation; AC-04 Session Files `agent-output` + sanitization; AC-05/AC-06 provider dispatch and unscoped-path removal; AC-07 Expert-safe migration; AC-08 retry without second `tools/call`; AC-09 no second file UI; AC-10 live Checkpoint B as Roadmap DONE only. |
| G7 External contract maturity | PASS | In-repo v1.2.1 already defines artifact list, descriptor, checksum, and download path. Incomplete RM-01 live does not BLOCK C01–C06 authoring. Missing Bundle required fields fail-closed rather than inventing a private envelope. |
| G8 Cross-repo ownership | PASS | Work consumes `contracts/skill-run/v1.2.1/` only. File Platform and Skill Run remain in `apps/work`. PRD forbids Provider-source inspection, Hermes Task download, and unscoped `/api/v1/artifacts/{id}/download`. |
| G9 Change traceability | PASS | C01–C05 implement parent architecture AC-18/AC-19 (File Platform Artifact, no parallel file SoT / no direct download IPC) without completing parent Expert removal or M5 default. C06 preserves compatibility mode and compact Result from M3. |

## Findings

No OPEN BLOCKER or MAJOR finding.

| ID | Severity | Note |
|---|---|---|
| N1 | NOTE | C05 把 File Platform association 与 Skill discovery retry 写在同一 Change ID。Owner 仍可分清：upsert/`agent-output` 属 File Platform，retry 命令属既有 `skillRun.retryArtifactDiscovery`。Plan 应拆成两个 Todo，避免 Session Files 变成第二套 discovery owner。 |
| N2 | NOTE | Target 对 retry UI 写了 “StatusBar or Session Files”。可观察行为是用户能显式重试且不二次 `tools/call`；具体控件落点属 Plan。优先 StatusBar，以保持 File Platform 不拥有 Run discovery。 |
| N3 | NOTE | AC-02 把 `content_type` 与必填 Bundle 字段并列。v1.2.1 descriptor 必填的是 `artifact_id` / `name` / `size_bytes` / `checksum_sha256`；`content_type` 可空。实施 fail-closed 应以 schema required 为准。 |
| N4 | NOTE | AC-08 点名 IPC `skillRun.retryArtifactDiscovery`。对 PRD 足够的是“用户可重试、不发第二次 `tools/call`、无 Run 则 fail-closed”。IPC 名称留给 Plan。 |
| N5 | NOTE | AC-10 是 Roadmap `DONE` 闸门，不是 C01–C05 implementation commit 闸门。与 2026-09-04 RM-01 live 延后并存：fixture 不能宣称 Checkpoint B live PASS，live 未跑也不能把 RM-05 标 DONE。 |
| N6 | NOTE | Replacement Matrix 把 C01 私有信封适配也列为 replaced path。那是 MODIFY adapter，不是 REPLACE File Platform。C03 仍是唯一 REMOVE Change。 |

PASS -> `smc-prd-converge`. This review does not modify the PRD and does not create a git commit.
