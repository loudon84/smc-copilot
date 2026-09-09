# M6h Skill Run Streaming Delta Mapping — Initial PRD Review

Review scope is RM-14 Stage PRD v1.0.0 (`REVIEW_REQUIRED`) grounded at `fbe3316cfa30b64465cd6cfe0c4275c18bd7fcba`. It reviews only the approved streaming-delta AD, Roadmap READY predicate, imported v1.5.0 contract, and current parser/projection/transcript owners. It does not implement mapping, create a Plan, or mark RM-14 DONE.

## Verdict

PASS

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| G1 Scope | PASS | In is enumerated `assistant.delta` mapping onto existing parser, projection `text`, live Skill Card and RM-15 sidecar `text`. Out explicitly keeps new IPC/owner, raw events, Local Chat streaming, activity-kind expansion, Provider bytes, expiry, download-by-ref and clarify respond. |
| G2 Existing capability | PASS | Parser already maps `assistant.message` → `text` and treats `assistant.delta` as `rawUnknown`. Service already patches `text` and persists/emits it. Renderer already shows `projection.text`. Eligibility helper already exists. No second parser/store is proposed. |
| G3 Production ownership | PASS | Event adaptation stays on the existing contract parser; merge stays on `SkillRunService`; presentation stays on `modules/skill-run`; eligibility stays on consumer-lock. MessageList is forbidden as an event owner. Provider still owns payload bytes. |
| G4 KEEP/MODIFY/ADD/REPLACE/REMOVE | PASS | C01/C02 MODIFY existing parser/service. C03–C05/C07 KEEP existing presentation, helper, unknown policy and absent mixed items. C06 MODIFY LAT. No ADD owner, no REPLACE without REMOVE. |
| G5 Contract / IPC / security | PASS | Mapping is gated by the existing v1.5 helper; required payload is the published `message_id`/`delta_seq`/`delta` set; snapshot remains authoritative; Renderer still receives only sanitized projection; no new Preload channel. |
| G6 Behaviour → AC | PASS | Eligibility/required-field fail-closed → AC-03. Merge + replay snapshot authority → AC-01/AC-02/AC-04. No new channel/kind → AC-05. Regression of P0/P1/transcript → AC-06. LAT → AC-07. |
| G7 Evidence integrity | PASS | Seven blocking claims. New merge behaviour is `NEW_EVIDENCE`. Helper/unknown/transcript priors are `PROVEN_BUT_AFFECTED` with invalidation, not silent full live rerun. No blocking FAIL is deferred. AC freeze observables, not test filenames. |

## Spot checks against `grounded_commit`

- `skill-run-contract-parser.ts` maps `assistant.message` to `text` and defaults unknown types, including `assistant.delta`, to `rawUnknown`.
- `skill-run-service.ts` assigns `patch.text = event.text` (replace, not seq-merge) and persists that text through the existing run snapshot path.
- `SkillRunActivityKind` / transcript whitelist still contain only the RM-08 four kinds.
- `hasSkillRunStreamingDeltaBundle()` is present and v1.5-only.
- v1.5.0 schema/fixtures match the PRD required fields and replay order.

## Findings

No OPEN BLOCKER or MAJOR finding.

| ID | Severity | Note |
|---|---|---|
| N1 | NOTE | Behaviour allows fail-soft on gapped `delta_seq` without inventing tokens. Plan must implement this on the existing projection merge, not by adding a second seq store or IPC. |
| N2 | NOTE | Live visibility of incremental `text` is a consequence of C02 plus the existing Skill Card path (C03 KEEP). Implementation review should reject any new activity kind or raw delta row in the sidecar. |
| N3 | NOTE | Roadmap remains `READY` with a Stage PRD assigned so `roadmap_next` still selects RM-14. Do not mark `IN_PRD` until a Plan exists if that would hide the only READY item. |

PASS -> `smc-prd-converge`. This review does not modify the Stage PRD, create an implementation commit, or change Roadmap DONE status.
