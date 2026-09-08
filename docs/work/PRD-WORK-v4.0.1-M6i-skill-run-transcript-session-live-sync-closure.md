---
work_item_id: RM-15
version: v1.0.0
status: APPROVED
target_branch: work/prd-v4.1
review_verdict: PASS
approved_at: 2026-09-08T13:33:25Z
source_revision: AD-WORK-v4.0.1-SKILL-RUN-TRANSCRIPT-LIVE-SYNC@1.0.0/RM-15
grounded_commit: 7c9e295b3b773539c769772953d47c0c43f47c12
grounding_mode: discover
proposal_source: docs/work/PRD-WORK-v4.0.1-M6i.md@1.0.0
---

# WORK PRD v4.0.1 M6i — Skill Run Transcript & Session Live-Sync Closure

本 Stage PRD 关闭 Roadmap RM-15：把现有 Skill Run sanitized Projection 接入唯一 Chat transcript，由 Existing Session Owner 在同一 `state.db` 保存完整 execution audit，并在 profile session cache 变化后即时通知 Sidebar。它不新增 Skill Chat、Session DB、历史 IPC 或 File store，不把 Provider raw event 塞入 Hermes `tool_calls`，也不包含 RM-13/RM-14 streaming delta。

## Evidence Baseline

| 项 | 值 |
|---|---|
| Roadmap Item | `RM-15` / M6i Skill Run Transcript & Session Live-Sync Closure，状态 `READY` |
| Architecture | `AD-WORK-v4.0.1-SKILL-RUN-TRANSCRIPT-LIVE-SYNC@1.0.0`：Existing Session-owned sidecar、single Chat、sanitized Main boundary、bounded live/complete durable、no streaming delta |
| Repository baseline | `7c9e295b3b773539c769772953d47c0c43f47c12`（APPROVED Decision + RM-15 READY） |
| Existing lifecycle | RM-04/RM-05/RM-08/RM-09 已 DONE。Main 已拥有 start、idempotency、SSE/poll、cancel、continuation、Result/Artifact、sanitized activity 与 approval decision。 |
| Current live gap | Renderer store只按 `clientRequestId` 保存 Projection并提供每 Session 最新一条；Chat 仅把 `activeSkillProjection` 渲染到 Composer 上方 `SkillRunStatusBar`，没有 Projection → `messages` bridge。 |
| Current persistence gap | Session materializer只写两条普通 message；user content 使用 120 字 `promptSummary`；assistant content只保留 running/terminal fallback；activity/event identity没有 terminal durable history。 |
| Current bounded state | `SkillRunProjection.activities` 是 Work sanitized DTO，按 `eventId` 去重且最多 32 条；`ActiveRun.request` 在进程内保留完整 Prompt。 |
| Existing history owner | Main `getSessionMessages()` 读取 Hermes messages并合并 local overlays/continuation；Renderer `dbItemsToChatMessages()` 是 resume映射入口。 |
| Current Sidebar gap | `upsertCachedSession()` 已更新 profile-scoped `sessions.json`，但不通知 Renderer；Sidebar 依赖 open/focus/slow timer/context-folder 事件刷新。 |
| Existing File/Approval | Artifact 继续由 File Platform + Session Files拥有；Allow/Deny 继续调用现有 Skill Run decision API；Clarify 没有 response contract，保持只读。 |
| External proposal | `docs/work/PRD-WORK-v4.0.1-M6i.md` 提供问题复现、完整历史、Sidebar 即时更新和 100 activity 场景；它是 proposal，不是已批准实施计划。 |

## Problem and Outcome

Skill execution 当前可以成功并实时更新状态条，但不成为 Chat turn：用户 Prompt、过程、调用链、Result/Error没有原位进入中央 transcript；重开 Session 只能看到截断 Prompt和粗粒度 assistant文本；新 Session虽已写 DB/cache，Sidebar React state仍旧，必须 focus、定时刷新或人工动作后才出现。

完成后，每次 Skill submit 立即产生一个完整 user bubble和一个以 `clientRequestId` 为永久身份的 pending Skill Card；SSE/poll Projection 原位更新同一 Card。普通 messages继续保存完整 Prompt与可读 fallback；Existing Session Owner的同库 sidecar保存完整 sanitized activity audit。重开或重启经现有 `getSessionMessages()` 恢复同一 Card且不重复；Sidebar在 cache mutation后只重读 JSON cache即可即时显示。

## Scope

- In: Live Skill transcript adapter/card；每 Session 多 Projection读取；完整 Prompt materialization；Main sanitized activity pre-cap durable delta；Existing Session-owned run/activity sidecar；session history merge/delete；session-cache changed sanitized event；Sidebar cache-only refresh；restart、dedupe、100 activity、multi-run与回归证据。
- Out: Provider Bundle变化；raw Provider event persistence/IPC；第二 Chat/Session/File Owner；独立 Skill history IPC；Hermes `tool_calls`语义复用；streaming/token delta；未合同化 clarify response、tool args/result；Artifact transport重写；Expert removal或Local Chat改造。
- Production Owner: Main `SkillRunService`/parser拥有 lifecycle和 sanitized delta；Existing Main Session persistence拥有 messages、sidecar、history merge和delete；Existing Chat/MessageList拥有 live/history Skill Card presentation；Existing session-cache + IPC/Preload + Sidebar拥有 cache mutation signal和读取；File Platform、continuation和approval command保持原 Owner。

## Current Capability Inventory

| Capability | Existing Owner | Current State | Classification |
|---|---|---|---|
| Skill lifecycle / sanitized activity | Main SkillRunService + parser | 完整执行链已存在；activity进入 Projection前已清洗，但 durable consumer只看到 capped Projection | PARTIAL |
| Live projection cache | Renderer `modules/skill-run` | 按 request保存；只查询 Session最新一条；不形成 Chat message | PARTIAL |
| Chat transcript model/rendering | Existing Chat / MessageList | 已是 union model并支持结构化 reasoning/tool/clarify；无 Skill Card variant | PARTIAL |
| Session materialization | Existing Skill Run session materializer | accepted后写 session + user/assistant；Prompt被摘要化，assistant仅 fallback | PARTIAL |
| Durable typed Skill timeline | Existing Session persistence | 无适合 NoDeskClaw sanitized activity的 durable sidecar；continuation不持久化 activities | MISSING under existing owner |
| Session history loader | Main sessions + Renderer sessionHistory | 已合并 messages/local overlays/continuation；无 Skill history item和 fallback replacement | PARTIAL |
| Session cache | Main session-cache | JSON cache可直接 upsert/list；无跨进程 changed signal | PARTIAL |
| Sidebar recent sessions | Existing SidebarRecentSessions | 有分页/cache读取与refresh；依赖 focus/timer/借用 context-folder event | PARTIAL |
| Continuation / rehydrate | Existing continuation owner | non-terminal恢复和防重复start已存在 | EXISTS |
| Artifact / Session Files | Existing File Platform | run-scoped identity、preview/Save As/materialize已存在 | EXISTS |
| Approval / Clarify | Existing Skill decision + activity | approval可操作；clarify只读 | EXISTS / KEEP |
| Local Chat / Expert history | Existing owners | 独立消息、stream、history reader | EXISTS / KEEP |

## Target End-State Inventory

| Capability | Target Owner | Target State | Classification |
|---|---|---|---|
| Sanitized durable delta | Existing SkillRunService/parser | 每个已枚举 activity在 Live 32条窗口截断前交给 Session persistence；未知/raw事件不进入 durable payload | MODIFY |
| Session-owned execution audit | Existing Session persistence | 同一 `state.db` 内保存 run和不可变 sanitized activity；按 `(clientRequestId,eventId)`去重；按 Session批量读取；随 Session删除 | ADD under existing owner |
| Full Prompt + fallback rows | Existing Session materializer | 从 Main start request持久化完整 Prompt；普通 assistant row仍作为可读兼容 fallback并使用稳定 request identity | MODIFY |
| Session history merge | Existing `getSessionMessages` + renderer history mapper | 合并 messages + sidecar + non-terminal continuation；按 request替换匹配 fallback assistant；稳定排序且不重复 | MODIFY |
| Live Skill transcript | Existing Chat / MessageList + renderer Skill store | submit立即出现 user + pending Card；所有 Session projections可查询；Projection按 request原位更新；后台 mounted Chat继续更新 | MODIFY |
| Sidebar live sync | Existing session-cache / IPC / Preload / Sidebar | cache mutation成功后发 sanitized `{sessionId, reason}`；Sidebar只重新 list cache，不执行 full DB sync | MODIFY |
| Live StatusBar | Existing SkillRunStatusBar | 保留当前 active phase/cancel/approval/artifact retry；不承担历史 SOT | KEEP |
| Continuation / File / Approval / Clarify | Existing owners | recovery、Artifact、decision保持；Clarify仍只读 | KEEP |
| Streaming delta | RM-13/RM-14 | 保持 BACKLOG；未来复用同一 Card text更新边界 | KEEP absent |

## Change Classification

| Change ID | Capability | Action | Rationale |
|---|---|---|---|
| C01 | Skill lifecycle → durable sanitized delta | MODIFY | 完整 history必须在 Projection cap之前接收每个已枚举 activity；不得让 Renderer或raw event成为writer。 |
| C02 | Session-owned Skill execution audit | ADD | Existing messages没有可安全承载 typed NoDeskClaw activity的字段；新增同库 sidecar但不新增 Session/Conversation Owner或历史IPC。 |
| C03 | Complete Prompt and compatible session rows | MODIFY | `promptSummary`不能作为用户事实；Main start request已有完整 Prompt。普通 rows继续兼容旧 Session/无 sidecar fallback。 |
| C04 | Existing session history loader/merge/delete | MODIFY | 唯一历史入口扩展为typed Skill item，按 request替换fallback并批量读取；Session删除必须清理sidecar。 |
| C05 | Existing Chat live/history Skill Card | MODIFY | Chat仍是唯一 transcript；新增union variant/adapter/presentation并按 `clientRequestId` upsert，不新增页面或MessageList。 |
| C06 | Existing session-cache change signal and Sidebar refresh | MODIFY | cache mutation已有事实，只缺轻量通知；Renderer只读JSON cache避免DB hammer。 |
| C07 | Continuation、StatusBar、File Platform、Approval、Clarify、Local/Expert、Provider/Streaming | KEEP | 分属现有 Owner或后续Item；本项只能做回归和负向证明。 |

## Replacement / Removal Matrix

本 Item 无 Production Capability REPLACE。历史加载存在一项呈现替换规则：sidecar Skill Card存在时，匹配 `clientRequestId` 的普通 assistant fallback row不得再次显示；fallback row仍保留在 DB，供旧版本、sidecar缺失或损坏时降级读取。不得删除现有 messages、continuation、StatusBar或Session cache。

## Behaviour

1. **Immediate turn.** Skill submit在调用 Main start前，以同一个 `clientRequestId` 立即追加完整 user bubble和pending Skill Card。Start被本地/合同/Auth拒绝时原位显示失败，不追加第二 Card；不得只toast而丢失用户turn。
2. **Live update.** 每次同 request Projection只更新对应Card的phase、display stage、activities、Result/Error、Artifact references。后台 mounted Chat继续接收自己的Session更新；切换active tab不得改变身份或创建副本。
3. **Activity presentation.** reasoning、tool、approval、clarify只使用Work sanitized DTO。tool started/completed/failed按`callId`在live Card原位合并；同`eventId`不重复。Approval按钮复用现有decision command；Clarify保持只读。
4. **Bounded vs complete.** IPC/Projection最多保留32条activity。Main durable path必须在该cap之前收到每条已枚举activity，完整history不得从bounded数组反推。100条activity场景中Live仍≤32，Session reopen恢复100条且顺序稳定。
5. **Full Prompt.** 完整Prompt只从Main start request写入profile本地DB和普通user message。Projection、telemetry、Sidebar event不得新增Prompt正文。Sidebar title使用完整首条Prompt经现有title policy生成。
6. **Durable audit.** Sidecar保存run identity、phase/result/error和sanitized activity payload；唯一invocation identity是`clientRequestId`，event identity是`eventId`。不得保存raw payload、headers、credential、Provider URL、tool arguments/output或artifact bytes。
7. **History merge.** Reopen经现有`getSessionMessages()`一次读取run集合、一次批量读取activities，并与messages/local overlays/non-terminal continuation稳定合并。匹配的普通assistant fallback被Skill Card替换；user row保留。一个Session连续A/A/B三次调用显示三个独立Card。
8. **Restart.** 非终态仍由continuation rehydrate且不第二次start；SSE replay与sidecar unique identity共同去重。Restart后的Projection继续更新同一Card，terminal后continuation可清理而sidecar/history保留。
9. **Sidebar.** Session create/materialize/title/message-count/delete等cache mutation成功后发`created|updated|deleted`语义事件。事件不带Session内容。Sidebar收到后只调用cache list并更新已加载窗口；不得每个Projection触发state.db full sync。首次accepted Skill Session在500ms产品预算内可见。
10. **Failure and cleanup.** DB/sidecar/cache通知失败不得改写Provider run phase或静默伪造完整history；Live继续，失败可诊断，后续Projection可幂等重试run state。删除Session必须清理sidecar，无orphan。
11. **Artifacts.** Card只显示Artifact descriptor/ManagedFile reference；Preview、Save As、materialize和Session Files继续走File Platform。Artifact discovery失败不把succeeded Run改成failed。
12. **Compatibility.** 老Session无sidecar时按普通messages显示。Local Chat、Expert、remote session、Attachment、Approval和现有Artifact路径语义不变。新文案只写English source locale。

## Contract and Security Boundary

- Main parser/SkillRunService仍是Provider合同与sanitization边界。Renderer只接收既有bounded Projection和现有session history DTO，不拿raw event、Backend origin、JWT、download URL、absolute path或bytes。
- Durable payload是Work-owned typed schema；只允许已枚举activity字段。未知事件fail-soft但不得textify/persist为raw JSON。
- Sidecar是Existing Session persistence的内部extension，不暴露第二list/get/delete IPC；历史仍只经`getSessionMessages()`。
- 完整Prompt/result允许保存在用户profile本地DB，但telemetry只允许outcome、phase、count和不可逆fingerprint，禁止正文。
- Cache changed事件只含session identity和有限reason；Preload必须提供unsubscribe并验证payload shape。
- RM-13/RM-14仍是唯一streaming delta合同进口/映射Owner。本项不得猜`assistant.delta`或token payload。

## Acceptance Criteria

1. 选择Skill并发送后，在Main返回accepted前，中央Chat立即显示完整user Prompt和一个pending Skill Card；start拒绝/异常原位变为失败且不重复。
2. reasoning、tool call、approval、clarify、phase、Result和Error随Projection实时进入同一Card；相同`clientRequestId`始终一张Card，同`callId`原位更新且相同`eventId`不重复。
3. 同一Session连续执行Skill A、A、B后，Live和reopen均按稳定顺序显示三个独立Card；身份只使用三个不同`clientRequestId`。
4. 产生100条已枚举activity时，任一Live Projection最多32条，关闭并重开Session后恢复100条且无重复；durable payload不含raw Provider字段。
5. 超过120字符的首条Prompt在reopen后逐字保持；Sidebar title由完整Prompt按现有title policy产生，Projection仍可只保留summary。
6. accepted Skill Session无需refresh/focus/slow timer，在500ms产品预算内出现在Sidebar；更新通知只触发cache list，不触发full DB sync。
7. 运行中退出并重启后恢复原Run和原Card，不发第二次`tools/call`；SSE replay不重复activity或Result；terminal后history仍在。
8. 历史加载有sidecar时不显示匹配assistant fallback副本；无sidecar的旧Session仍正常显示普通user/assistant rows。
9. 删除Session后对应run/activity sidecar均删除；DB不可用/写失败不改变Provider terminal truth，且不会宣称缺失timeline完整。
10. Approval操作仍调用现有decision API且幂等；Clarify只读；Artifact操作仍只经File Platform，Artifact discovery failure不改变Run succeeded。
11. Renderer/Preload无法取得raw Provider event、Provider endpoint、auth token、tool arguments/output、artifact bytes或本机绝对路径；Sidebar事件不含Prompt/Result。
12. Local Chat send/stream/reasoning/tool/history、Expert reader/history、remote session、Attachment和现有Skill StatusBar/cancel/retry均无回归；RM-13/RM-14状态与合同均不变。

## Acceptance Claim Baseline

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason |
|---|---|---|---|---|---|---|---|
| CL-01 | Immediate user + one pending Skill Card | Submit后无需accepted即可见；reject原位失败 | Yes | 当前Chat只显示StatusBar，submit失败只toast | FAILED | NEW_EVIDENCE | RM-15关闭已观察产品缺口 |
| CL-02 | Live typed activity/result/error原位更新 | request/card identity和tool call compact可观察 | Yes | RM-08/09证明sanitized activity/decision；未接Chat messages | PROVEN_BUT_AFFECTED | REUSE_EVIDENCE（parser/decision）+ NEW_EVIDENCE（transcript） | 新Chat adapter/Card |
| CL-03 | Full Prompt durable且title正确 | >120字符reopen逐字一致；title来自完整Prompt | Yes | 当前materializer使用`promptSummary` | FAILED | NEW_EVIDENCE | 数据完整性修复 |
| CL-04 | Live≤32、durable 100完整 | Live和reopen计数/顺序可观察 | Yes | RM-08证明cap32；无durable activities | FAILED | REUSE_EVIDENCE（cap）+ NEW_EVIDENCE（pre-cap durable path） | 新sidecar与writer |
| CL-05 | Multi-run/session history无fallback重复 | A/A/B三Card；旧Sessionfallback保留 | Yes | 当前store只latest，history无Skill item | NOT_TESTED | NEW_EVIDENCE | 新history merge |
| CL-06 | Restart恢复原Card且event去重 | 零第二`tools/call`、零重复event/result | Yes | RM-04 continuation/idempotency已PASS | PROVEN_BUT_AFFECTED | TARGETED_RERUN + NEW_EVIDENCE（same card/history） | 新durable writer和history identity |
| CL-07 | Sidebar cache changed即时且不DB hammer | accepted后≤500ms；事件路径零`syncSessionCache` | Yes | cache upsert存在；Sidebar只靠focus/timer/借用事件 | FAILED | NEW_EVIDENCE | 新Main/Preload/Sidebar信号 |
| CL-08 | Sidecar cleanup/failure semantics | Session delete零orphan；写失败不改run phase | Yes | 现有delete无sidecar；materializer已有cache fallback | NOT_TESTED | NEW_EVIDENCE | 新持久化数据 |
| CL-09 | File/Approval/Clarify边界保持 | 零第二IPC/File store；clarify无respond | Yes | RM-05/08/09已PASS | PROVEN_BUT_AFFECTED | REUSE_EVIDENCE + TARGETED_RERUN | Card新增展示/操作入口 |
| CL-10 | Local/Expert/remote history无回归 | focused regression均PASS | Yes | 对应现有测试 | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Chat union、MessageList和session loader被扩展 |
| CL-11 | Security/telemetry边界 | durable/IPC/cache事件不含禁止字段 | Yes | RM-04/05/08已有sanitized边界 | PROVEN_BUT_AFFECTED | TARGETED_RERUN + NEW_EVIDENCE | 新sidecar、history DTO和事件 |
| CL-12 | Streaming delta保持out | RM-13/RM-14仍BACKLOG；无delta parser/fixture写入 | Yes | Roadmap/AD已冻结 | PROVEN_FRESH | REUSE_EVIDENCE + scope negative | 本Item不触碰Provider合同 |

## Definition of Done

1. C01–C06全部由canonical Plan、Completion Audit、Implementation Review和FRESH blocking verification证明；C07通过既有证据复用与受影响回归证明。
2. CL-01–CL-12全部PASS；任何FAILED/NOT_TESTED blocking claim不得以deferred理由进入DONE。
3. Verification至少覆盖immediate/reject、live activity/result/error、100 activity、multi-run、restart/replay、history fallback replacement、Sidebar cache-only refresh、delete/failure/security以及Local/Expert/File/Approval回归。
4. implementation commit不得包含RM-15 DONE；Roadmap状态在evidence manifest可解析且implementation commit存在后独立更新。
5. 若实施需要第二Session/history IPC、raw event、Hermes `tool_calls`复用、Provider合同变化、streaming delta、clarify response或Artifact transport重写，必须RETURN_ARCHITECTURE/RETURN_PRD，不得混入。

## Source Anchors

- `apps/work/src/main/skill-run/skill-run-service.ts`
- `apps/work/src/main/skill-run/skill-run-ipc.ts`
- `apps/work/src/main/skill-run/skill-run-session-materialize.ts`
- `apps/work/src/shared/skill-run.ts`
- `apps/work/src/main/sessions.ts`
- `apps/work/src/main/session-cache.ts`
- `apps/work/src/main/session-continuation-store.ts`
- `apps/work/src/preload/index.ts`
- `apps/work/src/preload/index.d.ts`
- `apps/work/src/renderer/src/modules/skill-run/store.ts`
- `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx`
- `apps/work/src/renderer/src/screens/Chat/Chat.tsx`
- `apps/work/src/renderer/src/screens/Chat/types.ts`
- `apps/work/src/renderer/src/screens/Chat/MessageList.tsx`
- `apps/work/src/renderer/src/screens/Chat/sessionHistory.ts`
- `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.tsx`
- `docs/work/AD-WORK-v4.0.1-skill-run-transcript-live-sync.md`
- `docs/work/PRD-WORK-v4.0.1-skill-first-layout-run-integration.md`
- `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md`
