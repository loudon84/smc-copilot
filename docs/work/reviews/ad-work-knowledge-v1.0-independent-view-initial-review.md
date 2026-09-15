# Architecture Review — AD-WORK-KNOWLEDGE-v1.0-INDEPENDENT-VIEW

**Mode:** initial  
**Verdict:** PASS  
**Reviewed artifact:** `docs/work/AD-WORK-KNOWLEDGE-v1.0-independent-view-DRAFT.md` v1.0.0  
**Source revision:** `PRD-WORK-KNOWLEDGE-01@v1.3.0/f1-read-gate-revision`  
**Grounded commit:** `fa02f4c00d8f425a2b24787cca592ac7ecb5875d`  
**Evidence freshness:** REUSE（HEAD 与 `grounded_commit` 一致）  

Review 只读，不修改 Architecture Decision。独立判断 A1–A8，不重复 full grounding。输入约束来自已 APPROVED 的 Stage PRD `WORK-KNOWLEDGE-01`，本闸门检查的是架构决策本身，不是复述 PRD。

## A1 Problem Necessity

PASS。仓库当前没有 Knowledge View、没有 ingestion Job Owner、没有非 Chat 导入消费者、没有真实 provider。这是已证明的缺口，不是为未来 tabs/registry 预建抽象。Stage 被正确限制为 integration foundation。

## A2 Existing Capability / Reuse

PASS。Layout 保活、File Platform 字节、Auth、`FileAssociation` 可选 `sessionId` 被扩展而不是复制。`FileJobQueue` / `file-job:*` 被正确判定为本地 parse，不能冒充远端 ingestion。拒绝 WebView、跨根 import、Chatbox 归档 KB，避免第二套宿主。NEW_OWNER 只覆盖 Job / capability / 恢复。

## A3 Alternatives

PASS。Option A–H 覆盖导航宿主、运行时嵌入、parse queue 复用、伪造 sessionId、mock 生产数据、过早 registry、问答并入 Chat。拒绝理由与 Revisit When 具体，不是惯性否定。

## A4 Ownership / Boundary

PASS。顶层 View、Chat/Skill Run、Auth、File Platform 字节、Job Coordinator、Renderer 模块状态、远端 provider OUT 均有唯一 Owner。实体读取的权威落在 Job Coordinator 的 capability probe，Renderer 只展示 unavailable/empty，没有第二数据 Owner。信任边界：token / 绝对路径 / provider 原始错误不进 Renderer；分区键由 Main 派生。

## A5 Dependencies / Cascading Effects

PASS。draft Job 先于 association、probe 先于任何上传/列表 UI、身份切换切断 cache 与命令、隐藏 View 停止 UI-only effect，这些顺序足够驱动 Roadmap。RM-02 被标明必须新开 Architecture，避免把外部依赖塞进 RM-01。

## A6 Security / Operability

PASS。`{workProfileId, authSubject, tenantScope}`、命令拒绝、重启单调进入 interrupted/unavailable、无生产 provider URL 即 fail-closed、引用感知清理，构成可执行的安全/运维边界。精确表与 channel 名留给 Plan，符合分层。

## A7 Pre-mortem / Kill Criteria

PASS。失败模式对齐真实风险：timer 推进 Job、fixture 列表、伪造 sessionId、混用 `file-job:*`、跨身份串用、跨根 import、用 mock 关闭 RM。Kill 后要求回到 Architecture/PRD，禁止 Plan 改 Owner。

## A8 Roadmap Decomposability

PASS。RM-01 是当前可交付 Stage，并绑定已有 PRD。RM-02 是真实 provider，依赖 RM-01 且需要新 AD。多页签、深链、Chat 引用、源应用归档、RAG 被排除出编号 Stage，没有把四项未来工作 ste 成一个假 RM。未嵌入 exact file/Todo。

## Blocking Findings

无。

## Major Findings

无。

## Minor Findings

N1. Evidence Baseline 把“可复用 FileJobQueue primitive”标为 INFERENCE，Decision 正文已限制不得复用 `file-job:*`。Plan 若发现队列 primitive 无法安全隔离，应回退为独立调度器，而不是放宽事件合同。不升 MAJOR。

N2. 已知 PRD 扫描误报 `RISK_FACT_CONTRADICTION:live_acceptance` 与本 AD 的 `无外部 LIVE provider` 一致，不改产品事实。

## Roadmap Notes

- RM-01 因 Stage PRD 已存在，Roadmap 状态应为 **IN_PRD**（不是未绑定 PRD 的 READY）。
- RM-02 在 RM-01 DONE 前为 BACKLOG。
- 不得把 RM-01 的 blocking claim 降级给 RM-02。

## Closure Table

本轮无 OPEN BLOCKER/MAJOR。

## Conclusion

**PASS。** 选择 Option A 成立：扩展 Layout / File Platform / Auth，新增唯一 Main Knowledge Upload Job Coordinator，读取与上传共用 capability probe，拒绝 mock 生产数据与伪造 Chat Session。

下一步：`smc-architecture-decision` mode=`converge`，然后 `smc-roadmap create`。在 Architecture APPROVED 与 Roadmap Item 绑定之前，不得生成实施 Plan。
