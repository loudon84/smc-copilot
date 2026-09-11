---
work_item_id: RM-03
version: 1.0.0
status: APPROVED
target_branch: work/prd-v4.2
review_verdict: PASS
approved_at: 2026-09-11T09:38:43+08:00
source_revision: AD-WORK-v4.2-UNIFIED-CONVERSATION-EXECUTION-PROVIDER@1.0.1/RM-03
grounded_commit: f62df916dc66726ba735a9663562a3ae18ee502d
---

# Work v4.2 RM-03 Skill Run Native Projection and Reopen Parity

## Scope

RM-03 makes the new Skill Run product path render through the existing Native
`ChatMessage → MessageList` conversation presentation during live execution,
session reopen, and application restart. It preserves the separate Main-owned
Skill Run execution/audit truth and File Platform resource identity. The only
in-scope product modes are original Chat and new Skill Run; this PRD creates no
Expert/HermesTask recognition, compatibility, migration, or historical path.

## Non-Goals

- Do not change original Chat execution, the remote Skill Run Provider public
  contract, or turn remote execution activity into Hermes Chat `tool_calls`.
- Do not add a second MessageList, provider registry, transcript store,
  Renderer-to-Main execution writer, raw-event channel, or artifact transport.
- Do not expose JWT, endpoint, raw SSE, raw tool arguments/results, remote
  artifact locations, credentials, or filesystem paths to the Renderer.
- Do not remove `SkillRunTranscriptCard`, the compact control surface, feature
  rollback, approval, cancel, or artifact retry; RM-04 owns duplicate
  presentation removal and rollback closure.
- Do not add Expert/HermesTask history recognition, migration, classification,
  Provider adaptation, or third execution/session mode.

## Current Capability Inventory

| Capability | Current State | Production Owner | Grounded Observation |
|---|---|---|---|
| Native conversation union and renderer | EXISTS/PARTIAL | Renderer Chat `ChatMessage` and `MessageList` | Native bubbles, reasoning, tool and clarify rows already render in one list, but the union still carries a `skill_run` card variant and `MessageList` delegates it to `SkillRunTranscriptCard`. |
| Live Skill Run projection | EXISTS/PARTIAL | Main `SkillRunService` sanitization plus Renderer skill-run transcript adapter | Main publishes a bounded sanitized `SkillRunProjection`; the current adapter creates/patches one request-keyed `skill_run` card rather than Native rows. |
| Stable provider/durable activity identity | EXISTS/PARTIAL | Main Skill Run service and Session-owned transcript sidecar | Activity is deduplicated by `eventId`; durable records have `clientRequestId`, `eventId`, and ordinal. The Renderer-safe activity projection lacks the durable ordering field needed to prove live/reopen row parity. |
| Result streaming and terminal authority | EXISTS | Main `SkillRunService` | `messageId + deltaSeq` buffers the assistant stream; a terminal snapshot seals/overrides the live delta. |
| Reopen and restart Skill Run history | EXISTS/PARTIAL | Main Sessions reader plus Skill Run transcript store | Reopen reads the Session-owned sidecar, suppresses a matching fallback assistant bubble, appends a `skill_run` history item, then globally sorts by timestamp. This cannot prove turn anchoring or provider-sequence parity. |
| Prompt/assistant durable anchors | EXISTS | Main Skill Run session materializer | Accepted runs have stable user/assistant IDs derived from `clientRequestId`; pre-accept failure remains excluded by RM-01. |
| Artifact identity and user actions | EXISTS | Main File Platform and existing compact control surface | Artifacts already materialize as ManagedFile resources; approval/cancel/retry/current phase remain outside the transcript card's historical activity. |
| Product modes beyond Chat and Skill Run | OUT | No RM-03 owner | The approved architecture excludes Expert/HermesTask and a third Provider/session mode. |

## Target End-State Inventory

| Capability | Target State | Production Owner | Boundary / Observable Result |
|---|---|---|---|
| Skill Run Native conversation projection | MODIFY | Renderer Chat provider adapter and existing Native `ChatMessage → MessageList` | A normal Skill Run turn is represented as the prompt followed by Native reasoning, tool, read-only notice, and assistant-result rows; no provider-specific transcript card is used on the normal path. |
| Native row identity and update rules | MODIFY | Renderer adapter consuming sanitized Main projection | User/assistant anchors derive from `clientRequestId`; reasoning/notice rows derive from stable provider event identity; one tool row derives from `clientRequestId + callId` and updates `started → completed/failed` in place. |
| Sanitized activity ordering projection | MODIFY | Existing Main Skill Run sanitizer/sidecar boundary | The existing sanitized projection carries only the stable identity and ordering facts necessary for Native rendering and parity; it does not forward raw Provider payloads or create a new public Provider contract. |
| Anchored reopen/restart expansion | REPLACE | Main Sessions reader using the existing Session-owned Skill Run sidecar | Durable activity expands inside the matching accepted Skill Run turn, located by its stable anchors; sidecar rows are never appended and globally timestamp-sorted. |
| Live/reopen/restart convergence | MODIFY | Existing Main projection plus Renderer adapter | Duplicate provider events do not duplicate rows; out-of-order/later delta cannot overwrite an authoritative terminal snapshot; live, reopen, and restart yield the same ordered representation for completed durable activity. |
| Existing card and controls | KEEP (rollback-only) | Existing `SkillRunTranscriptCard` and compact control surface | The card is not the normal transcript presentation after RM-03 but remains available only for the approved rollback path until RM-04; approval, cancel, phase, and artifact retry retain their existing owners. |
| File Platform artifacts | KEEP | Main File Platform and Session Files | An artifact remains a ManagedFile/Session Files resource and never becomes a new `ChatMessage` kind or raw remote artifact payload. |

## Change Classification

| Change ID | Classification | Requirement | Production Owner | Boundary |
|---|---|---|---|---|
| C01 | MODIFY | Extend the existing Native conversation projection so a Skill Run turn maps sanitized prompt, reasoning, tool, read-only clarify/approval notice, and result facts into Native rows. | Renderer Chat adapter and existing `ChatMessage → MessageList` | Native rows are presentation only; they do not claim Hermes Chat execution truth or create a provider-specific MessageList. |
| C02 | MODIFY | Change the normal-path request-keyed `skill_run` card projection to the Native projection while retaining the card only as rollback-only compatibility until RM-04. | Existing Renderer Skill Run transcript adapter | One normal transcript presentation exists for a Skill Run turn; no second visible card/list is rendered alongside it. |
| C03 | MODIFY | Preserve and expose the minimum sanitized stable event identity/ordering facts needed to derive deterministic Native row identity and order. | Existing Main Skill Run sanitization and Session-owned transcript sidecar | `clientRequestId`, provider event identity/sequence or durable ordinal, `callId`, and `messageId + deltaSeq` remain internal/sanitized facts; no raw SSE/credential/endpoint/payload is transported. |
| C04 | REPLACE | Replace global timestamp merge of sidecar Skill Run history with stable-anchor expansion inside the matching accepted turn. | Existing Main Sessions history reader | Prompt precedes execution rows and result; timestamp is not a fallback for turn membership or provider order. |
| C05 | KEEP | Preserve Main Skill Run lifecycle/audit/continuation, compact controls, File Platform artifacts, and original Chat behavior. | Existing Main/Renderer owners | Presentation consumes safe projection only; artifacts and controls do not acquire a second transcript owner. |
| C06 | PROHIBIT | Exclude Expert/HermesTask, third Provider/session modes, legacy migration/backfill, and a generic provider registry. | Closed v4.2 Architecture | No historical recognition, compatibility branch, or classification derivation is introduced. |

## Replacement / Removal Matrix

| Replace Change | Removed Behaviour | Removal Condition | Retained Capability / Owner |
|---|---|---|---|
| C04 | The existing reopen merge appends one detached `skill_run` item and globally sorts it with all history by timestamp. | The normal reopen/restart path expands durable activity inside the accepted `clientRequestId` anchor; no global timestamp sort can place provider execution. | Existing Main Sessions reader and Session-owned Skill Run sidecar remain the only history/audit owners. |

## Behaviour and Boundaries

### Native Skill Run turn

After a Skill Run is accepted, the existing durable user anchor is the first
row of its turn. Sanitized provider activity then renders in stable order: a
reasoning summary becomes a Native reasoning row; a tool lifecycle becomes one
Native tool row whose state updates in place from `started` to `completed` or
`failed`; and a clarify or approval lifecycle fact is a read-only Native agent
information row. It must not invoke Local Chat clarify-response semantics or
invent tool arguments/results that the safe projection does not contain. The
assistant result follows the execution rows and uses the established
`messageId + deltaSeq` sequencing; the matching authoritative snapshot wins
over duplicate or later deltas.

The normal-path renderer receives only Main-sanitized projection data. It does
not infer identity/order from timestamps, tool name, prompt text, session ID,
or the current DOM, and it does not write execution/audit/classification data
back to Main. A duplicate provider event maps to the same stable row identity;
two different runs cannot merge merely because they share a tool name, event
text, or wall-clock time.

### Live, reopen, and restart parity

While a run is active, the existing Renderer subscription updates the Native
rows in place. On reopen and restart, Main reads the complete sanitized
Session-owned audit sidecar, locates the run by the accepted durable
`clientRequestId` anchors, and expands the same rows inside that turn. The
system must not append a detached sidecar card and globally sort the complete
history by timestamp. A missing or incomplete audit remains an explicit
incomplete/rollback state; it may not synthesize facts, reinterpret remote
activity as Hermes Chat history, or emit duplicate rows.

### Rollback and resource/control boundaries

RM-03 may retain the existing card strictly as the approved rollback-only
presentation until RM-04. The normal feature path must not render both the
card and Native rows. Approval/cancel/current phase/artifact retry remain in
the compact control surface. Artifacts remain File Platform ManagedFile
resources addressed through existing safe file identity and Session Files;
they do not become a transcript message kind or carry remote paths/URLs.

## Acceptance Criteria

- **AC-01**: [C01/C02] For an accepted Skill Run, the normal transcript renders through Native `ChatMessage → MessageList` rows in this order: durable user prompt, zero or more sanitized reasoning/tool/read-only lifecycle rows in stable provider order, then the assistant result or terminal failure. It does not render a `SkillRunTranscriptCard` alongside those rows.
- **AC-02**: [C01/C03] A reasoning or lifecycle row is deduplicated by stable run/event identity; one tool row is deduplicated by `clientRequestId + callId` and updates in place across `started → completed/failed`. The presentation never fabricates Hermes Chat tool arguments, tool results, or interactive Local Chat clarify handling from Skill Run activity.
- **AC-03**: [C01/C03] Assistant text is ordered by `messageId + deltaSeq`; a matching terminal snapshot is authoritative, and duplicate/out-of-order/later deltas cannot duplicate or overwrite the terminal Native assistant row.
- **AC-04**: [C03/C04] Live subscription, session reopen, and application restart produce the same ordered Skill Run representation for complete durable activity, located inside its accepted `clientRequestId` turn. Global timestamp sorting is not used to infer turn membership or provider activity order.
- **AC-05**: [C04] Prompt-before-execution-before-result holds when adjacent original Chat turns have equal, reversed, or otherwise non-monotonic timestamps; separate Skill Runs with the same tool name or activity text remain separate turns.
- **AC-06**: [C05] Existing original Chat rows, Main Skill Run execution/audit/continuation truth, compact approval/cancel/phase/artifact-retry controls, and File Platform ManagedFile/Session Files identity preserve their current owners and observable behavior.
- **AC-07**: [C03/C05] The Renderer receives only existing or minimally extended sanitized projection facts. No raw Provider SSE/JWT/endpoint/raw payload/remote artifact location enters the transcript, and no Renderer-to-Main execution, audit, or classification write is introduced.
- **AC-08**: [C02/C06] The normal feature path contains exactly original Chat and new Skill Run presentation adapters. It introduces no Expert/HermesTask recognition, compatibility/migration/backfill, third Provider/session class, generic registry, or second MessageList/transcript store.

## Definition of Done

- **DOD-01**: Focused projection tests prove stable Native row identities, in-place tool lifecycle update, read-only lifecycle notices, delta/snapshot authority, duplicate event omission, and no fabricated tool/clarify semantics.
- **DOD-02**: Focused Main history tests prove accepted-anchor expansion, prompt/execution/result order independent of timestamps, distinct concurrent/sequential run identities, and live/reopen/restart parity from the same complete sanitized audit.
- **DOD-03**: Existing Main Skill Run service, parser/sanitization, transcript store, session materialization, File Platform, and original Chat regression coverage remain passing without a new external Provider/public IPC contract or a Renderer write.
- **DOD-04**: Normal-path rendering uses no `SkillRunTranscriptCard` together with Native Skill Run rows; rollback-only card availability and compact control reachability are explicitly proven without RM-04 removal work.
- **DOD-05**: All blocking claims have fresh recorded evidence before RM-03 is marked DONE.

## Evidence Baseline

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason |
|---|---|---|---|---|---|---|---|
| CL01 | AC-01 Native normal path | Accepted Skill Run can occupy one Native transcript turn without a normal-path card. | YES | Existing `skill-run-transcript` and Chat transcript tests. | RESIDUAL_GAP | NEW_EVIDENCE | Current adapter creates a `skill_run` card. |
| CL02 | AC-02 stable activity rows | Provider activity has stable event/call identity and one tool lifecycle is patched in place. | YES | Existing Main dedupe and durable activity tests. | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Renderer-native mapping is new. |
| CL03 | AC-03 result authority | Service buffers ordered deltas and seals a terminal snapshot. | YES | Existing Skill Run service tests. | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Native assistant-row consumer is new. |
| CL04 | AC-04/AC-05 reopen/restart ordering | Reopen expands sidecar activity inside accepted anchors rather than globally timestamp-sorting it. | YES | Existing sessions Skill Run history tests. | RESIDUAL_GAP | NEW_EVIDENCE | Current merge appends cards and sorts by timestamp. |
| CL05 | AC-06 owner preservation | Chat, Main execution/audit, compact controls, and File Platform retain their owners. | YES | APPROVED AD, RM-01/RM-02 evidence, existing subsystem tests. | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Projection crosses Main history and Renderer presentation boundaries. |
| CL06 | AC-07 sanitized boundary | Only safe projection fields reach the renderer and no Renderer write/new public contract is added. | YES | Existing parser/transcript-store forbidden-field checks. | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Minimum ordering identity crosses the projection boundary. |
| CL07 | AC-08 closed two-mode scope | No third mode, Expert/HermesTask branch, second list/store, or registry is added. | YES | APPROVED AD and RM-02 scope evidence. | PROVEN_REQUIREMENT | NEW_EVIDENCE | RM-03 must prove its implementation stays within the closed presentation boundary. |
