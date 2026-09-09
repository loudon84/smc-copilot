---
work_item_id: RM-16
version: v1.0.0
status: APPROVED
target_branch: work/prd-v4.1
review_verdict: PASS
approved_at: 2026-09-09T17:08:17+08:00
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1/RM-16/user-input-2026-09-09-v1
grounded_commit: 0cb5b34a6fa2684a826456583cace8a3a5e350ad
grounding_mode: discover
provider_contract: SKILL-RUN-CONTRACT v1.5.0
product_decision: user-input:2026-09-09-session-files-explicit-open-only
---

# WORK PRD v4.0.1 M6j — Skill Session UX and Terminal Result Closure

本 Stage PRD 只关闭 Roadmap `RM-16`：修复现有 Skill Run 会话中的三个一致性缺陷——新会话创建后 Session Files 自动展开、首个 Skill Run 已 accepted 后仍可清除或更换技能、以及 Provider 已成功并产出报告但 Work Skill Card 没有收敛终态文本。

三项修复共用现有 Chat、Session、Main SkillRunService、Gateway Client、Transcript 和 File Platform Owner。本 Item 不新增 Chat 页面、Session/File store、Provider schema、raw event IPC 或第二套执行生命周期；也不修改 nodeskclaw v1.5.0 Bundle。

## Evidence Baseline

| 项 | 值 |
|---|---|
| Roadmap Item | `RM-16` / M6j；依赖 `RM-14`、`RM-15` 均已 `DONE`，建项时为 `READY`。 |
| Product decision | 用户于 2026-09-09 冻结：Session Files 新会话默认折叠；只有用户主动点击文件/预览入口或显式打开面板时才显示。Session 创建、Run 状态和 Artifact 到达不得自动展开。 |
| Repository baseline | `0cb5b34a6fa2684a826456583cace8a3a5e350ad`。当前工作树另有 Managed Hermes Runtime Ownership Closure 的未提交改动，不属于本 Item；Grounding 未将其纳入 RM-16。 |
| Session Files current state | Chat panel visibility 使用跨会话 local preference，缺省值为 visible；一旦 prompt submit 创建 `sessionId`，现有 Chat 条件即挂载 Session Files。当前布局测试明确固化了“defaults visible”。 |
| Skill selection current state | Catalog 选择时 Renderer 立即写 session mode；首个 Run accepted 后再次写入。Selection Bar 始终暴露 clear action，Main session-mode store/IPC 允许 UPSERT，因此没有“accepted 后 write-once”的权威锁。 |
| Result current state | v1.5.0 endpoint matrix 分离 `GET /api/v1/runs/{run_id}` 与 safe-retry `GET /api/v1/runs/{run_id}/result`；`runs/result.schema.json` 才定义可选 `text`。现有 Gateway 保存 `resultPath`，但只实现 snapshot 读取。 |
| Terminal race current state | Service 同时运行 SSE 与 poll。poll 先看到 `COMPLETED` 时以 snapshot 的缺省 `resultText` 更新 projection 并确认 terminal；terminal update 随即 abort SSE。SSE 的 `run.completed` 也可在没有文本时直接终结，因此已到达或随后到达的 `assistant.message`/delta 可能不进入最终 Card。 |
| Existing presentation | `SkillRunTranscriptCard` 只有在 `resultText` 非空时展示报告；Artifact 存在时可显示“结果已就绪”，所以当前 UI 可同时出现“Skill completed successfully / 结果已就绪”但没有 Provider 报告正文。 |
| Existing durable path | RM-15 已把 sanitized projection 写入现有 Session-owned sidecar，并在 reopen/restart 恢复同一 Skill Card；本 Item 必须修复该路径中的终态输入，不新建历史表。 |
| Focused baseline | 现有 gateway/service/selection/layout focused suites共 77 tests PASS；它们证明当前实现稳定，但包含“Session Files 默认显示”预期且未覆盖 poll `COMPLETED` 抢先于 `assistant.message`/`/result` 的竞态，不能作为修复证据。 |

## Problem and Outcome

当前 UI 把“会话已分配 sessionId”误当成“用户想查看 Session Files”；把“当前选中技能”当成可随时清除的临时筛选；又把“Provider Run 已终态”误当成“终态结果文本已收敛”。这三个状态提前量会造成布局跳变、同一会话的技能身份可变，以及成功执行只有状态和文件、没有报告正文。

完成后，新会话在 prompt submit、session 创建和 Artifact 到达期间始终保持 Session Files 折叠，只有明确用户动作才打开。技能可在首个 accepted Run 之前切换，但 accepted 后同一 Session 永久锁定该 `tool_name`，后续只允许再次运行同一技能。Work 在 SSE/poll 任一先后的情况下都通过 v1.5.0 `/result` 收敛终态结果，并保证空值不会清除已经显示或持久化的合法文本。

## Scope

- In: 现有 Chat 的 Session Files 可见性状态与显式打开动作；现有 Skill Selection Bar 的锁定态；Main session-mode 的 accepted 后 write-once 权威规则；现有 Gateway 对 v1.5.0 result endpoint 的消费；现有 SkillRunService 的终态协调、文本单调性、结果失败诊断与恢复；现有 transcript/card、session sidecar 和 focused tests；相关 LAT 状态。
- Out: Provider Bundle/schema/fixture/checksum 修改；新的 Chat、Session、File、Gateway 或 transcript owner；新的 raw SSE/HTTP IPC；让 Renderer 持有 token/URL；直接读取 hermes-agent workspace；改变 Skill 参数表单、approval、attachment upload、artifact download-by-ref；Expert/Local Chat lifecycle；Managed Hermes Runtime Ownership Closure。
- Production Owner: Chat 继续拥有面板可见性和 selection UX；Main Skill Run session-mode owner 继续拥有会话技能身份；现有 Gateway Client 继续拥有 Provider HTTP 适配；现有 SkillRunService 继续拥有 poll/SSE/terminal projection；Session sidecar、`modules/skill-run` 和 File Platform 保持各自既有职责。

## Current Capability Inventory

| Capability | Existing Owner | Current State | Classification |
|---|---|---|---|
| Session Files panel | Existing Chat layout + File Platform | 有 show/hide 与文件 preview 路径，但 visibility 跨会话持久化且缺省 visible | PARTIAL |
| Session creation | Existing Chat/Session owner | Prompt submit 可立即取得 sessionId；该事实会触发 panel mount | EXISTS |
| Skill selection | Existing Chat + SkillSelectionBar | 可选、可清除；Catalog 选择即写 session mode | PARTIAL |
| Session skill mode | Main session-mode store/IPC | 可保存并恢复 tool identity，但是可覆盖 UPSERT，不表达 accepted lock | PARTIAL |
| Immutable submitted request | SkillRunService | 每次 start 已携带 immutable tool snapshot | EXISTS |
| Public Run snapshot | Existing Gateway Client | 已读取 run status；Public Run schema没有终态正文 `text` | EXISTS |
| Public Run result | Existing Gateway Client routes | `resultPath` 已解析，但没有 result fetch capability | PARTIAL |
| SSE/poll lifecycle | Existing SkillRunService | 有去重、重连、terminal monotonic；任一 terminal patch 会中止 SSE | PARTIAL |
| Delta/message text | Existing parser + SkillRunService | v1.5 delta 与 snapshot 已映射；合法文本可 live 更新同一 projection | EXISTS |
| Durable transcript | Existing Session sidecar | projection text/phase/activity 可保存和恢复 | EXISTS |
| Artifact discovery and Session Files content | SkillRunService + File Platform | 成功终态后可独立发现文件；不等于报告正文已取得 | EXISTS |
| Raw Provider boundary | Main/Preload | Renderer 只接收 sanitized DTO | EXISTS |

## Target End-State Inventory

| Capability | Target Owner | Target State | Classification |
|---|---|---|---|
| Session Files visibility | Existing Chat layout | 新会话初始折叠；只由显式 show 或用户点击文件/preview 动作从 hidden 变为 visible；不继承其他会话的 visible 状态 | MODIFY |
| Skill selection UX | Existing Chat + SkillSelectionBar | accepted 前仍可切换/清除；accepted 后显示不可变 selection，不再提供 clear/switch 动作 | MODIFY |
| Authoritative session skill lock | Existing Main session-mode owner | 首个 accepted request 的 tool identity write-once；同 tool 重放/再次运行幂等，冲突 tool fail-closed；reopen/restart 恢复 | MODIFY |
| Provider result retrieval | Existing Gateway Client | 使用已解析的 same-origin `resultPath` 读取并严格适配 v1.5.0 Public Run Result | MODIFY |
| Terminal result convergence | Existing SkillRunService | SSE/poll 共享单一 terminal resolver；成功终态先收敛 `/result` 或现有合法 message text，再完成 projection/abort | MODIFY |
| Projection text monotonicity | Existing SkillRunService + sidecar | `undefined`、`null`、空终态字段不得清除已存在的非空 delta/message/result text | MODIFY |
| Result-unavailable state | Existing projection + Skill Card | Run 成功事实保持 succeeded，但结果取得失败时显示 sanitized、可恢复的“结果暂不可用”，不得误报“结果已就绪” | MODIFY |
| Artifact and File Platform | Existing owners | Artifact discovery 与结果正文独立；可继续 Preview/Save As，且不会自动展开 Session Files | KEEP |
| Provider/raw-data boundary | Existing Main/Preload | 无 raw event、URL、token、workspace path 到 Renderer | KEEP |

## Change Classification

| Change ID | Capability | Action | Rationale |
|---|---|---|---|
| C01 | Session Files explicit-open visibility | MODIFY | 复用现有 Chat panel owner，移除 sessionId/artifact/跨会话 preference 造成的自动显示。 |
| C02 | Accepted-aware Skill Selection Bar | MODIFY | accepted 前保持可编辑；锁定后在现有 selection 展示面移除 clear/switch affordance。 |
| C03 | Main authoritative session skill lock | MODIFY | 把现有 session mode 从 selection-time 可覆盖状态收敛为 accepted-time write-once identity，并在 Main 拒绝冲突。 |
| C04 | v1.5.0 Public Run Result adapter | MODIFY | 现有 Gateway 已持有 `resultPath`，应消费 Provider 已发布 endpoint，而不是从 Public Run snapshot 猜正文。 |
| C05 | Order-independent terminal resolver and monotonic text | MODIFY | 复用现有 SkillRunService，协调 SSE/poll/result 并防止空终态 patch 覆盖合法文本或过早 abort。 |
| C06 | Result closure presentation/recovery | MODIFY | 复用现有 projection/Card/sidecar，区分 succeeded、result pending/available/unavailable，并支持无重复 Run 的恢复。 |
| C07 | Test specification and LAT status | MODIFY | 用新产品规则替换当前默认-visible 测试，并记录终态 result closure、selection lock 和安全边界。 |

## Replacement / Removal Matrix

本 Item 没有 Production Owner REPLACE。C01 会移除“全局 visible preference 可令新会话自动展开”的旧行为；C03 会移除“Catalog selection 即持久化且后续可覆盖 session skill mode”的旧行为；C05 会移除“任一 terminal status 立即 abort，且空 snapshot text 可覆盖已有文本”的旧行为。移除条件分别由 AC-01/AC-02、AC-03/AC-04、AC-05/AC-06 的新证据覆盖。

## Behaviour — Session Files explicit-open only

1. 新 Chat 尚无 sessionId，以及首次 prompt submit 创建 sessionId 后，Session Files 都保持折叠。sessionId 是数据归属标识，不是 UI 打开意图。
2. hidden → visible 只允许来自本次视图中的明确用户动作：点击现有“Show session files”入口，或点击某个 attachment/context/agent-output 文件以 preview/use。文件点击可同时打开既有 preview 和 Session Files；不得由后台 effect 模拟点击。
3. Skill Run accepted、phase/activity/result 更新、Artifact descriptor upsert、Session cache refresh、Sidebar 更新和窗口 focus 均不得自动展开 Session Files。
4. 新会话不得继承另一个会话曾经 visible 的全局状态。当前会话内用户显式 hide 后保持 hidden，直到再次显式 show 或点击文件。
5. 本阶段不增加 Session Files 内容 owner，也不改变文件搜索、分组、preview、Save As、checksum 或 remote materialization。

## Behaviour — Session skill identity lock

1. 用户仅选择 Skill、编辑参数或发生 start validation/rejection 时，会话仍未锁定；用户可以清除或切换 selection。
2. 首个 `accepted: true` 的 Skill Run 以该 request 的 immutable `tool_name`/title 建立会话锁。accepted 后的 cancelled、failed 或 succeeded 都不会解锁；新会话才可选择不同技能。
3. 锁定会话可再次提交同一 `tool_name`，不得因锁定破坏 queue/retry/replay。尝试通过 Renderer、Preload 或 IPC 写入不同 tool 时，Main 以稳定、sanitized 的 conflict 结果 fail-closed，且不得发出 Provider `tools/call`。
4. Renderer 从 Main/Session 的权威锁恢复 selection。锁定时 Selection Bar 可显示当前技能，但没有可操作 clear 按钮，Catalog 也不能替换它；禁用必须同时具备视觉和 keyboard/a11y 语义。
5. reopen/restart 后锁仍存在。对升级前会话，仅当已有 durable accepted run identity/transcript 可以证明会话执行过 Skill 时才视为 locked；只有 provisional selection、没有 accepted run 的旧会话不得被误锁。
6. Renderer 的临时 selection 不是锁的 SOT；Main 和 durable Session identity 才是跨刷新、绕过调用和恢复的权威。

## Behaviour — Terminal result closure

1. Work 必须保持 Provider 合同分层：Public Run snapshot 提供 status；Public Run Result 提供终态 `text`。不得继续从 snapshot 的非合同字段猜报告正文。
2. SSE 或 poll 首次观察到成功终态时，Service 进入单一 terminal resolution。并发观察者复用同一 resolution，不得重复终态副作用、Artifact discovery 或 Provider start。
3. 成功终态使用 Gateway 的 safe GET `/api/v1/runs/{run_id}/result` 收敛结果。非空 `result.text` 是 terminal report 的权威值；到达前，合法 `assistant.delta`/`assistant.message` 仍可作为同一 Card 的 live text。
4. poll 先看到 `COMPLETED`、SSE 先收到 `run.completed`、`assistant.message` 先于/后于 terminal、以及 SSE replay 后 snapshot 覆盖 delta，都必须得到相同最终报告。Service 不得在 terminal content resolution 完成前用 abort 丢掉仍可消费的合法文本。
5. `undefined`、`null` 或空 result/snapshot 字段不得清除 projection/sidecar 中已经存在的非空合法文本。旧事件也不得把 terminal phase 或 terminal report 回退。
6. Provider 明确返回成功但 `result.text` 合法为空时，保留最新合法 message/delta 文本；如果两者都没有，UI 显示“完成但无文本结果”，不得伪造报告。
7. Result GET 暂时失败时，Provider run phase 仍保持 succeeded，Artifact discovery 仍可继续；Skill Card 显示 sanitized “结果暂不可用/可重试”状态，不显示误导性的“结果已就绪”。reopen/rehydrate 或现有显式恢复动作可再次 safe GET，且绝不重新 `tools/call`。
8. 终态报告与 result diagnostic 继续写入 RM-15 现有 sanitized sidecar，并原位更新同一 Skill Card；不得新增第二 transcript/history store。

## Contract, Security, and Trust Boundary

- 仅消费 checksum-locked `SKILL-RUN-CONTRACT v1.5.0` 的 `http/endpoint-matrix.json`、`runs/public-run.schema.json` 和 `runs/result.schema.json`。本 Item 不修改 Bundle 字节，不从 GitHub/SSH/live schema 补合同。
- Gateway 继续执行现有 same-origin path、auth scope、logout/org/origin/generation invalidation、no-store 和 response bounds。`result_url` 只能经现有 route sanitizer 变成 API path；Renderer 不接收 URL 或 bearer token。
- Result adapter 只投影已发布 Public Run Result 字段；unknown/internal 字段丢弃。错误消息必须 sanitized，不含 response body、workspace absolute path、credential 或 internal routing。
- Skill lock 必须在 Main 执行边界生效，不能只靠隐藏 X。冲突请求不得到达 Provider，也不得 silent fallback Expert/Local Chat。
- Session Files 行为只改变显示时机，不改变文件 ACL、remote identity、download、checksum 或 materialization trust boundary。

## Acceptance Criteria

1. 新会话在空白、首次 submit、sessionId 创建、Skill Run accepted/terminal 和 Artifact 到达后均保持 Session Files 折叠；不会继承其他会话的 visible 状态。
2. 用户点击现有 show 入口或实际文件/preview 入口后 Session Files 才显示；用户 hide 后，后台状态变化不能再次打开，直至下一次显式动作。
3. Skill selection 在首个 accepted Run 前可清除/切换；accepted 后同一会话的 clear/switch 不可操作，cancel/fail/success 不解锁。
4. reload/reopen/restart 恢复 accepted skill lock；Main 允许同 tool 的幂等写/后续 run，拒绝不同 tool 且不调用 Provider。升级前无 accepted 证据的 provisional selection 不被误锁。
5. Provider run 成功且 v1.5.0 `/result` 返回非空报告时，同一 Skill Card 最终显示并持久化该报告，而不是只显示 completed/result-ready；Artifact 是否存在不影响报告取得。
6. poll-first、SSE-terminal-first、message-before-terminal、message-after-terminal 和 replay 五类顺序得到一致 terminal report；空 snapshot/result 不会清除已有 delta/message/result text，terminal phase 不回退。
7. Result GET 暂时失败时，run 仍是 succeeded、Artifact 仍可用，Card 显示 sanitized result-unavailable 而非 false-ready；恢复只做 safe GET，不创建第二个 Provider Run。
8. Renderer 看不到 raw Provider event、result URL、token、response body、absolute workspace/cache path；冲突 skill 不 silent fallback Expert/Local Chat。
9. 现有 v1.5 delta snapshot authority、RM-15 单 Card/durable transcript、queue/idempotency/cancel/restart、File Platform Preview/Save As 和 Local/Expert regression 行为保持通过。
10. LAT 明确记录：Session Files explicit-open-only、accepted-time session skill lock、Public Run status 与 Result 的终态收敛，以及 result failure 不改变 Provider succeeded truth。

## Acceptance Claim Baseline

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason |
|---|---|---|---|---|---|---|---|
| CL-01 | AC-01 | 新会话在 session/run/artifact 变化后仍折叠 | Yes | 当前 layout test 固化 default visible | PROVEN_CONTRARY | NEW_EVIDENCE | product decision replaces current behavior |
| CL-02 | AC-02 | 只有显式 show/file click 打开，hide 后无自动重开 | Yes | show/hide/preview callbacks 已存在 | PROVEN_BUT_AFFECTED | TARGETED_RERUN + NEW_EVIDENCE | visibility trigger set changes |
| CL-03 | AC-03 | accepted 前可变，accepted 后 UI 不可变 | Yes | SelectionBar 始终可 clear | PROVEN_CONTRARY | NEW_EVIDENCE | accepted-aware state is new |
| CL-04 | AC-04 | Main write-once lock 跨恢复且冲突不发 call | Yes | session mode 可 UPSERT；durable transcript 已存在 | PROVEN_BUT_AFFECTED | NEW_EVIDENCE | authority semantics change |
| CL-05 | AC-05 | succeeded run 从 `/result` 收敛并持久化报告 | Yes | resultPath/schema 存在；Gateway 未读取 endpoint | NOT_TESTED | NEW_EVIDENCE | terminal result adapter is new |
| CL-06 | AC-06 | SSE/poll 五类先后顺序结果一致且文本单调 | Yes | delta/snapshot tests PASS；poll terminal race未覆盖 | PROVEN_BUT_AFFECTED | NEW_EVIDENCE | terminal abort/order changes |
| CL-07 | AC-07 | result failure 不改 succeeded/artifact，恢复不重跑 | Yes | artifact discovery failure已独立；result failure无状态 | NOT_TESTED | NEW_EVIDENCE | result recovery is new |
| CL-08 | AC-08 | raw data/credential/URL 不越界，无 fallback | Yes | existing guard and sanitized IPC suites | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Gateway/IPC path changes |
| CL-09 | AC-09 | Skill/Session/File 与 Local/Expert 回归 | Yes | focused baseline 77 PASS；RM-14/RM-15 evidence PASS | PROVEN_BUT_AFFECTED | TARGETED_RERUN | shared Chat/service behavior changes |
| CL-10 | AC-10 | LAT 与新产品和合同语义一致 | Yes | LAT 尚未记录本 bug-fix | NOT_TESTED | NEW_EVIDENCE | documentation is new |

## Definition of Done

1. C01–C07 由一个独立 canonical Plan 实施；本 PRD 不与 Managed Hermes Runtime Ownership Closure 或 Provider Bundle 变更合并。
2. CL-01–CL-10 均有 fresh PASS；至少包含 Session Files user-intent、accepted lock/Main bypass、terminal order matrix、result retry/no-second-run、sanitized boundary 和回归证据。
3. 实施不能新增第二 Chat/Session/File/Gateway/transcript owner，不能只隐藏 clear X 而省略 Main lock，也不能以延迟/固定 sleep 掩盖 SSE/poll race。
4. 若实现需要改变 Provider v1.5.0 wire schema、把 result 放进 Public Run snapshot、引入新 raw IPC，或改变 accepted/idempotency 定义，必须返回 Provider contract/Architecture，不得在 Plan 中扩大范围。
5. RM-16 仅在 APPROVED PRD、canonical Plan、实现提交、Completion Audit/Review/Verification PASS 和可解析 evidence reference 全部具备后标为 `DONE`；Roadmap status commit 与 implementation commit 分离。

## Source Anchors

- `apps/work/src/renderer/src/screens/Chat/useChatPanelLayout.ts`
- `apps/work/src/renderer/src/screens/Chat/Chat.tsx`
- `apps/work/src/renderer/src/screens/Chat/session-files/SessionFilesPanel.tsx`
- `apps/work/src/renderer/src/modules/skill-run/SkillSelectionBar.tsx`
- `apps/work/src/main/skill-run/skill-run-session-mode-store.ts`
- `apps/work/src/main/skill-run/skill-run-ipc.ts`
- `apps/work/src/main/skill-run/skill-run-gateway-client.ts`
- `apps/work/src/main/skill-run/skill-run-service.ts`
- `apps/work/src/main/skill-run/skill-run-transcript-store.ts`
- `apps/work/src/shared/skill-run.ts`
- `apps/work/src/renderer/src/modules/skill-run/SkillRunTranscriptCard.tsx`
- `apps/work/src/renderer/src/screens/Chat/sessionHistory.ts`
- `apps/work/lat.md/skill-run.md`
- `contracts/skill-run/v1.5.0/http/endpoint-matrix.json`
- `contracts/skill-run/v1.5.0/runs/public-run.schema.json`
- `contracts/skill-run/v1.5.0/runs/result.schema.json`
- `docs/work/PRD-WORK-v4.0.1-M6h-streaming-delta-mapping.md`
- `docs/work/PRD-WORK-v4.0.1-M6i-skill-run-transcript-session-live-sync-closure.md`
- `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md`
