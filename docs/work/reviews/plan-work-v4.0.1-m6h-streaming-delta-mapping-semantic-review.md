# RM-14 M6h Streaming Delta Mapping — Semantic Plan Review

Review scope is the canonical `RM-14` v3.5 Plan and its approved M6h PRD. The router required this review because the Plan declares Integration Hotspots on the shared parser and `SkillRunService`. The Plan also carries `acceptance_contract: smc.acceptance.v1`, so Actual Semantic Review is mandatory even though every Verification is `LOCAL`. This review does not implement mapping, mark RM-14 DONE, or change Provider bytes.

## Verdict

PASS

## Semantic Gates

| Gate | Result | Review evidence |
|---|---|---|
| Grounding / minimality | PASS | Current `parseSkillRunEvent` maps `assistant.message` to `text` and sends `assistant.delta` through `default` → `rawUnknown`. Sole production caller is the SSE loop in `createSkillRunService`, which assigns `patch.text = event.text` as whole-string replace. C01/C02 modify those two existing symbols; C03 KEEP because `skill-run-transcript.ts` already copies `projection.text` to `resultText`. |
| Eligibility consumption | PASS | T1 calls existing `hasSkillRunStreamingDeltaBundle()` and must not change checksum/capability semantics. C05 KEEP names the lock helper; T1/T2 consume it. v1.2.1–v1.4 remain ineligible. |
| Snapshot authority | PASS | Parser keeps snapshot `text`. Service seals per-`message_id` buffer on `assistant.message`. Replay fixture `sse-assistant-delta-replay.json` is delta「正在分析」then snapshot「正在分析完整结果」; T2 oracle equals snapshot, not concatenation. Missing snapshot `message_id` keeps today's replace-all. |
| Fail-closed / seq merge | PASS | Missing/non-string fields, helper false, and unenumerated types stay `rawUnknown` and must not write `text` or activity. Duplicate `(message_id, delta_seq)` ignores increment; `delta_seq` gap does not invent tokens or unseal a snapshot. Existing SSE `seenEventIds` still advances the cursor. |
| Single writer / hotspots | PASS | T1 writes only parser + parser tests. T2 writes only `ActiveRun` / `createSkillRunService` / service tests. T3 writes LAT. Parser and service files are explicit hotspots so neither Todo can add a second codec or a second merge owner. `SkillRunActivityKind` stays the RM-08 four kinds. |
| Scope boundary | PASS | No new IPC, preload DTO, Renderer owner, Chat/Session/File store, sidecar activity row, Local Chat streaming, `approvalExpiry`, download-by-ref, or clarify respond. Roadmap DONE is excluded from this implementation Plan. |
| Lifecycle / data flow | PASS | Eligible delta has an in-memory buffer writer (`createSkillRunService` via `updateProjection`). Snapshot is the seal/success writer for the same `message_id`. Failure writer is `rawUnknown` with no `text`. Transport remains existing SSE parse → parser → service → existing projection IPC + RM-15 sidecar `text`. |
| Verification / acceptance | PASS | V01–V05 are LOCAL unit/document commands; Live Scenario/Environment matrices are empty by design. Claims CLM-01–CLM-10 are blocking and share `TARGETED_RERUN` with concrete invalidation reasons. No LIVE/FAULT/EXTERNAL command is claimed. V03 must keep RM-14 not DONE and reject new activity kinds. |

## Findings

No OPEN BLOCKER or MAJOR finding against the Plan specification.

| ID | Severity | Note |
|---|---|---|
| N1 | NOTE | V03 oracle looks for the literal substring `projection text` in LAT. T3 must write that phrasing (or equivalent lowercased) when replacing the import-only / RM-14 BACKLOG sentences. |
| N2 | NOTE | Delivery workspace currently has pre-existing dirty `apps/work/src/main/skill-run/skill-run-service.test.ts` (unrelated indentation in an extraParameters test). That path is a T2 write target, so `workspace.py init` must fail `DELIVERY_TARGET_CONFLICT` until the file is restored or committed outside this Plan. Do not stash. |
| N3 | NOTE | T1 must not assign the delta chunk to `ParsedSkillRunEvent.text`. Current service still does whole-string `event.text` replace; putting the chunk on `text` would skip the seq buffer and violate AC-02 if a snapshot later concatenates or is omitted. |

Semantic verdict is PASS for the current Plan content. Record this exact Plan hash through `review_record.py` before implementation.
