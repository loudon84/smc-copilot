---
work_item_id: RM-13
version: v1.0.0
status: APPROVED
target_branch: work/prd-v4.1
review_verdict: PASS
approved_at: 2026-09-09T12:34:00+08:00
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1/AD-WORK-v4.0.1-STREAMING-DELTA@1.0.1/RM-13
grounded_commit: 6e7516bf53d9c2144453c291a8b1405d32af43a9
grounding_mode: discover
provider_contract: SKILL-RUN-CONTRACT v1.5.0
provider_tag: skill-run-contract-v1.5.0
provider_tag_commit: 3a7fa5ac32017d41f7191b8221c861b93d7e7f32
provider_release_commit: e83e39a0883545c35f4c99ba5bbef004c9ffd150
product_decision: user-input:2026-09-09-provider-v150-delivered-local-only
---

# WORK PRD v4.0.1 M6g — Skill Run Streaming Delta Contract Import

本 Stage PRD 只关闭 Roadmap `RM-13`：将 Provider 已发布的、不可变的 `SKILL-RUN-CONTRACT v1.5.0` Bundle 作为 **离线 Work 合同** 进口，并让 Work 的 consumer lock 对 streaming delta 的合同能力单独 fail-closed。它不映射 delta 到 parser、Projection、IPC、Session 或 Renderer；这些是 `RM-14` 的唯一范围。

Provider 输入已经由本地 tag 验证：`E:\git\nodeskclaw` 的 `skill-run-contract-v1.5.0` peeled commit 为 `3a7fa5ac32017d41f7191b8221c861b93d7e7f32`，其 `nodeskclaw-backend/contracts/skill-run/v1.5.0/` 执行 release check PASS。manifest 的 provider release commit `e83e39a0883545c35f4c99ba5bbef004c9ffd150` 是发布证据字段，不等同于 annotated tag 的 peeled commit；Work lock 必须 pin 后者，不能自行重写 Provider manifest。

## Evidence Baseline

| 项 | 值 |
|---|---|
| Roadmap Item | `RM-13` / M6g P1 Streaming delta 合同进口；Roadmap 已转 `READY`。 |
| Architecture | `AD-WORK-v4.0.1-STREAMING-DELTA@1.0.1`：先 import，再由 RM-14 映射；不得把 streaming/token 文本、raw Provider event 或第二 owner 混入 import。 |
| Repository baseline | `6e7516bf53d9c2144453c291a8b1405d32af43a9`。已有完整 v1.2.1、v1.3.0、v1.4.0 Bundle；generic P0 gate 仍允许第一个 checksum-complete Bundle。 |
| Provider delivery | 本地 tag `skill-run-contract-v1.5.0`；tag target `3a7fa5ac32017d41f7191b8221c861b93d7e7f32`；`python nodeskclaw-backend/scripts/contracts.py check --family skill-run --version 1.5.0 --release` PASS。仅将此已发布的目录作为 copy source；不通过 SSH、GitHub 或 Provider 源码猜合同。 |
| v1.5.0 contract facts | `manifest.json` 声明 `streamingDelta=supported`、`assistantMessageSnapshot=supported`。`events/run-event.schema.json` 有独立 `assistant.delta` discriminator；其 payload 要求 `message_id`、`delta_seq`、`delta`。`SHA256SUMS` 为 LF，覆盖 schema、`fixtures/run-event-assistant-delta.json` 与 `fixtures/sse-assistant-delta-replay.json`。 |
| Existing Work lock | `isCompleteSkillRunBundleDir` 校验 Work `consumer-lock.json`、LF checksum、P0 必选文件与每个 listed byte hash；`hasSkillRunApprovalDecisionBundle` / `hasSkillRunAttachmentBundle` 是 version-specific helper。generic `REQUIRED_BUNDLE_PATHS` 不得被 P1 delta 文件扩张。 |
| Compatibility boundary | `WORK_SKILL_RUN_CONTRACT_VERSION` 是 Work DTO 版本，不是 Provider Bundle 版本；本 Item 不变更它。v1.2.1 P0 start/catalog gate、v1.3 decision、v1.4 attachment 均不得被 v1.5 helper 重新定义。 |

## Problem and Outcome

v1.4.0 的公开 Bundle 没有 streaming delta 合同，因此 Work 即使看到 Provider runtime 数据也不得解析或展示。现在 Provider 已交付已枚举、带 fixtures 且 checksum 覆盖的 v1.5.0 版本。若 Work 只判断目录完整，后续 RM-14 仍可能错误地把缺少 delta discriminator、payload 字段或重放 fixture 的版本当作可映射合同。

完成后：

- `contracts/skill-run/v1.5.0/` 含 Provider tag 的完整原始 Bundle；所有 `SHA256SUMS` 覆盖文件逐字保持，不新增、修改或重新计算 Provider checksum。
- Work 在同目录仅新增自己的非 Provider 覆盖文件 `consumer-lock.json`，锁定 contract version、Provider repository、tag、peeled tag commit 及 Provider checksum path。
- `hasSkillRunStreamingDeltaBundle()` 只在完整 v1.5.0 Bundle 同时声明 capability、枚举 `assistant.delta` 和其要求 payload、并含有两个 replay/fixture 文件时返回 true；任一缺失或 checksum 不完整即 false。
- generic P0 gate 继续只依赖原有 P0 paths；v1.2.1 仍能开 Catalog/start。没有新 runtime 行为，也没有 delta 文本进入 Renderer。

## Scope

- In: Provider v1.5.0 Bundle 的受控离线 import；Work-owned `consumer-lock.json`；现有 `skill-run-consumer-lock` 的 v1.5-specific capability helper 与 tests；`apps/work/lat.md/skill-run.md` 的 import-only 状态说明。
- Out: `skill-run-contract-parser.ts`、`SkillRunService`、Gateway、IPC/Preload、shared/Renderer DTO、Chat/Session/File/Artifact、SSE 运行时映射、token UI、delta 持久化、Provider Bundle byte 改写、attachments、`approvalExpiry`、download-by-ref、clarify respond、RM-14 状态变更。
- Production Owner: Provider 拥有 tag、manifest、schemas、fixtures、release check 与 checksum 覆盖字节；现有 Work consumer-lock owner 拥有 import receipt、离线完整性和 v1.5 capability eligibility；LAT 只描述 Work 已消费的架构事实。RM-14 的 parser/service/Renderer owner 本 Item 不写入。

## Current Capability Inventory

| Capability | Existing Owner | Current State | Classification |
|---|---|---|---|
| Generic P0 consumer lock | Work `skill-run-consumer-lock` | 完整目录和 P0 schema 可开 Catalog/start；不理解 streaming delta 语义 | EXISTS |
| v1.3 decision gate | Work consumer lock | 仅 v1.3.0 complete 可用于 decision | KEEP |
| v1.4 attachment gate | Work consumer lock | 仅 v1.4.0 complete 可用于 attachment upload | KEEP |
| v1.5 streaming delta Bundle | Provider | 已在本地 immutable tag/release check 验证，尚未 import 到 Work | EXISTS（external） |
| `assistant.delta` mapping | Work parser/service/Renderer | 无 mapping；AD 明确留给 RM-14 | KEEP absent |
| Provider raw event transport | Provider/Main boundary | Renderer 不持有 raw event | KEEP |

## Target End-State Inventory

| Capability | Target Owner | Target State | Classification |
|---|---|---|---|
| v1.5.0 immutable Bundle copy | Provider bytes + Work contract package | Work 目录保留完整 Provider Bundle；SHA256SUMS 覆盖字节不变 | ADD |
| v1.5.0 receipt lock | Work consumer-lock | pin tag `skill-run-contract-v1.5.0` 与 peeled commit；声明 Provider checksum source path | ADD |
| Streaming-delta eligibility | Existing Work consumer lock | 完整 v1.5 + capabilities + discriminator/payload + fixtures 才 true | MODIFY |
| Generic P0 / decision / attachment gates | Existing Work consumer lock | 语义和必选路径不变 | KEEP |
| Parser, service, IPC, UI mapping | Existing RM-14 owners | 继续没有 delta mapping | KEEP absent |

## Change Classification

| Change ID | Capability | Action | Rationale |
|---|---|---|---|
| C01 | `contracts/skill-run/v1.5.0/` Provider Bundle and Work receipt | ADD | 只复制 Provider published bytes，并在目录中增加不受 Provider SHA 覆盖的 Work lock。 |
| C02 | v1.5-specific streaming-delta eligibility helper | MODIFY | consumer-lock 是唯一离线 eligibility owner；不得把 P1 文件加到 generic P0 path list。 |
| C03 | consumer-lock focused tests | MODIFY | 证明 tag identity、checksum-complete、capability/discriminator/payload/fixtures，以及旧 P0 compatibility。 |
| C04 | `apps/work/lat.md/skill-run.md` | MODIFY | 记录 v1.5 已进口但仍不映射；明确 RM-14 才能消费 delta。 |
| C05 | Existing parser/service/IPC/Renderer and Provider bytes | KEEP | 本 Item 不产生 runtime delta 行为，也不得改 Provider checksum-covered asset。 |

## Replacement / Removal Matrix

本 Item 无 REPLACE 或 REMOVE。已有 v1.2.1/v1.3.0/v1.4.0、P0 lock、Approval、Attachment 及其 tests 都保留。v1.5 是并列的新发布合同，不替换 generic P0 lock 的最小输入。

## Behaviour — Offline contract eligibility

1. 实施从本地 Provider tag 的 `nodeskclaw-backend/contracts/skill-run/v1.5.0/` 复制完整目录到 `contracts/skill-run/v1.5.0/`；目录结构、LF `SHA256SUMS`、每个 listed asset 的 sha256 必须与 tag 一致。
2. Work 只在 v1.5 目录新增 `consumer-lock.json`。其 `contractVersion`、`tagName`、`tagTargetCommit`、`providerSha256sumsPath`、`sha256sumsPath` 必须与已验证 Provider tag 对应；不得修改 manifest 的 `releaseCommit`。
3. `hasSkillRunStreamingDeltaBundle()` 必须先依赖 `isCompleteSkillRunBundleDir(v1.5.0)`，再验证 manifest 的 `streamingDelta` 与 `assistantMessageSnapshot` 都是 `supported`。
4. helper 必须验证 `events/run-event.schema.json` 的 discriminated union 有 `assistant.delta` 分支，且其 payload schema 要求 `message_id`、`delta_seq`、`delta`。不能用单纯字符串 search 把开放 object 当闭合合同。
5. helper 必须要求 checksum 覆盖的 `fixtures/run-event-assistant-delta.json` 和 `fixtures/sse-assistant-delta-replay.json` 都存在；任何缺少、hash 不一致、CRLF checksum、capability/shape 不符合都返回 false。
6. `REQUIRED_BUNDLE_PATHS` 不加入 delta schema 或 fixture；`findSkillRunConsumerLockDir` 的 P0 行为不变。v1.2.1 complete 仍为 true，identity-only v1.0.0 仍为 false。
7. 本 Item 不导出/调用 helper 到 parser、service、Gateway、IPC 或 Renderer；在 RM-14 APPROVED Plan 前，不得宣称 streaming UI 或 token payload 已可用。

## Contract and Security Boundary

- Provider checksum 覆盖的 assets 是 immutable third-party contract input。Work 不伪造 schema、fixture、checksum 或 manifest，也不把本地 Provider source checkout 当 runtime dependency。
- `consumer-lock.json` 仅是 Work receipt；它不得冒充 Provider asset，也不得写入 secret、token、backend URL 或运行时 observation。
- Helper 的输入仅为 Work 已进口的离线 Bundle。运行时不能通过 GitHub、SSH、Provider branch、raw URL 或 live endpoint 补齐字段。
- 不新增 raw Provider SSE 或 delta 经过 Preload 的通道。未知/缺 contract 的后续 mapping 必须 fail-closed，留给 RM-14。

## Acceptance Criteria

1. `contracts/skill-run/v1.5.0/` 是完整 Provider v1.5.0 tag Bundle 的字节级复制；LF `SHA256SUMS` 全部验证通过。Work receipt 精确 pin `skill-run-contract-v1.5.0` 和 `3a7fa5ac32017d41f7191b8221c861b93d7e7f32`，并保留 Provider checksum source path。
2. `hasSkillRunStreamingDeltaBundle()` 仅在 checksum-complete v1.5.0 的 manifest 同时声明 `streamingDelta=supported`、`assistantMessageSnapshot=supported`，并存在可验证的 `assistant.delta` discriminator、`message_id`/`delta_seq`/`delta` payload 及两个 delta fixtures 时为 true。
3. 任一 v1.5 asset 缺失、hash 变更、CRLF SHA256SUMS、capability 缺失、payload field 缺失、fixture 缺失或错误 version 时 helper false；不得降级为 generic P0 complete 的成功结论。
4. v1.2.1 继续 checksum-complete 并可满足 generic P0 gate，v1.3 approval 和 v1.4 attachment helper 保持各自 version-specific。generic P0 required paths 不含 delta files。
5. 本 Item 不修改 parser/service/gateway/IPC/preload/shared Renderer DTO/Chat/Session/File/Artifact，且不引入 `assistant.delta` 的显示、持久化或 raw event transport。RM-14 保持 BACKLOG。
6. LAT 明确说明：v1.5.0 已 import、consumer lock 已能验证 streaming-delta contract readiness，但 Work 仍不消费或展示 delta，等待 RM-14。

## Acceptance Claim Baseline

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason |
|---|---|---|---|---|---|---|---|
| CL-01 | AC-01 | imported assets hash-match Provider v1.5 tag and receipt pins immutable identity | Yes | Provider local release check PASS；Work has no v1.5 copy | PROVEN_FRESH + NOT_TESTED | TARGETED_RERUN + NEW_EVIDENCE | Work import receipt is new |
| CL-02 | AC-02 | v1.5 helper accepts the published capability/schema/fixtures shape | Yes | generic complete gate only | NOT_TESTED | NEW_EVIDENCE | dedicated eligibility is new |
| CL-03 | AC-03 | malformed/missing/tampered contract never qualifies for delta | Yes | generic checksum negative tests | PROVEN_BUT_AFFECTED | TARGETED_RERUN + NEW_EVIDENCE | delta semantic checks are new |
| CL-04 | AC-04 | P0, approval and attachment gates keep their current version boundaries | Yes | existing focused lock tests | PROVEN_BUT_AFFECTED | TARGETED_RERUN | new helper must not widen generic paths |
| CL-05 | AC-05 | no runtime owner/mapping is changed and RM-14 remains BACKLOG | Yes | AD boundary and current source | PROVEN_FRESH | TARGETED_RERUN | import may tempt premature mapping |
| CL-06 | AC-06 | LAT describes exact import-only state | Yes | no v1.5 LAT entry | NOT_TESTED | NEW_EVIDENCE | documentation is new |

## Definition of Done

1. C01–C04 are completed by a single canonical Plan, and focused consumer-lock evidence proves AC-01 through AC-04; no Provider SHA-covered byte has been altered.
2. `lat check` and `npm run guard` pass after the import and documentation update. The implementation evidence must include a static scope proof for AC-05.
3. RM-13 may be marked `DONE` only in a separate Roadmap status commit after all blocking claims are fresh PASS and durable evidence exists. This implementation Plan must not set RM-13 to `DONE`.
4. If v1.5’s published contract requires parser/service/IPC/Renderer behavior, an additional Provider field, altered Provider byte, attachment/expiry/download work, or a raw event route, return to Provider / RM-14 / Architecture rather than expanding RM-13.

## Source Anchors

- `apps/work/src/main/skill-run/skill-run-consumer-lock.ts`
- `apps/work/src/main/skill-run/skill-run-consumer-lock.test.ts`
- `apps/work/lat.md/skill-run.md`
- `contracts/skill-run/v1.4.0/consumer-lock.json`
- `contracts/skill-run/v1.4.0/SHA256SUMS`
- `docs/work/AD-WORK-v4.0.1-streaming-delta.md`
- `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md`
