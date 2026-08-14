---
name: Salt v2.3.1 Single-Master Live Validation
overview: 修复真实 Salt 控制链路的一致性与幂等问题，在单 Master 192.168.102.104 上完成首台真实 Endpoint 的迁移、回滚、重迁移和 24 小时观测，为 v2.4 Ring 0 提供准入证据。v2.3.1 不部署第二 Master，不实施 MultiMaster-PKI，不执行双向故障转移。
todos:
  - id: phase-0
    content: 固化 v2.3 代码、配置、Master、Minion、Hermes 和 Runtime 基线
    status: completed
  - id: phase-1
    content: 修复共享 AsyncSession、重复 Job、Lease、JID 冲突与 Secret 幂等
    status: completed
  - id: phase-2
    content: 完善真实 Control Plane 合约、观测、Rollout、Approval 和 Observer
    status: completed
  - id: phase-3
    content: 把真实 Handover、Rollback、Remigrate 接入统一编排
    status: completed
  - id: phase-4
    content: 把 Live Canary 接入 CI 并验证 apps/work 企业模式
    status: completed
  - id: phase-5
    content: 在首台真实 Windows Endpoint 执行迁移、回滚、重迁移
    status: completed
  - id: phase-6
    content: 完成 24 小时观测、Master 恢复演练和单 Master 风险签署
    status: completed
isProject: false
---

# Salt Migration PRD v2.3.1

## Single-Master Live Validation & Ring 0 Gate

版本：v2.3.1  
项目：smc-copilot  
实施基线：PRD v2.3 已完成  
唯一 Salt Master：192.168.102.104  
目标环境：首台真实 Windows Endpoint  
后续版本：v2.4 Ring 0

---

## 1. 目标

v2.3.1 只解决一个问题：

> 在单 Master 架构下，证明真实 Endpoint 能安全完成 Runtime → Salt 接管，并可回滚、重迁移和持续观测。

完成后输出：

1. 首台真实 Endpoint 的迁移证据包。
2. 24 小时稳定性报告。
3. Master 配置、PKI 与 Release 元数据的备份恢复证据。
4. 单 Master 运行风险接受记录。
5. v2.4 Ring 0 的 Go / No-Go 结论。

---

## 2. 范围调整

### 2.1 v2.3.1 明确不实施

- 不部署第二 Salt Master。
- 不配置 MultiMaster-PKI。
- 不执行 Master A ↔ Master B 双向故障转移。
- 不把 Minion master 配置改为多 Master 列表。
- 不因缺少第二 Master 阻塞首台 Endpoint 验证。
- 不删除 services/runtime。
- 不让 Salt 进入 Chat Data Plane。
- 不在 v2.3.1 扩大到业务用户批量部署。

### 2.2 HA 后移

高可用独立进入后续 v2.5 HA Readiness：

- v2.4 Ring 0 可在单 Master 下进行。
- Ring 1 启动前必须重新评审 Master 高可用方案。
- v2.5 再决定第二 Master、共享 PKI 或 Syndic 等具体模式。

---

## 3. 单 Master 目标架构

### 3.1 Control Plane

SMC Backend  
→ HTTPS salt-api  
→ Salt Master 192.168.102.104  
→ Salt Minion  
→ SMC Hermes Extension  
→ Hermes install / configure / health / rollback

### 3.2 Data Plane

apps/work  
→ Local Hermes Gateway  
→ Hermes Agent

### 3.3 约束

- Salt Master 不代理 Chat、Files、Attachment、Session 或 WebSocket 流量。
- Master 不可用时，已运行的 Hermes Gateway 和 apps/work 必须继续工作。
- Master 不可用时，禁止启动新的 install、upgrade、handover、highstate 和 rollout。
- Master 恢复后必须先 reconcile，再恢复变更任务。
- Runtime 保留为本地迁移回滚边界，直至后续 Decommission 决策。

---

## 4. 当前阻塞项

### P0：不修复禁止首台迁移

1. Worker 并发复用同一 AsyncSession。
2. Redis 入队与数据库轮询可能重复领取同一 Job。
3. Job 缺少原子 claim、lease、heartbeat 和 reclaim。
4. Salt JID 重复时可能错误写入新 Job。
5. Secret 重试时存在重复 scope 插入风险。
6. Live Canary 尚未作为部署前硬门禁。
7. Endpoint、Job、Rollback 真实 Hook 尚未统一触发。

### P1：Ring 0 前完成

1. 24 小时 Observer 和汇总报告。
2. rollout batch、pause、resume、abort 和 approval 状态。
3. apps/work 企业 Salt 模式回归。
4. salt-api eAuth 最小权限收敛。
5. Master 配置、PKI、Pillar、Extension、Release 元数据备份恢复。
6. 单 Master 失联时自动暂停 rollout。

---

## 5. 功能需求

## 5.1 Job 单一所有权

Job 状态：

- queued
- dispatching
- running
- succeeded
- failed
- cancelled
- expired

新增字段：

- claim_token
- lease_owner
- lease_expires_at
- heartbeat_at
- attempt
- salt_jid
- result_digest

规则：

1. Worker 使用独立数据库 Session。
2. 领取 Job 必须通过原子条件更新。
3. claim 成功后才允许调用 salt-api。
4. lease 到期且无 heartbeat 才允许 reclaim。
5. Redis 只负责唤醒，不拥有 Job。
6. 数据库轮询仅领取无有效 lease 的 queued Job。
7. 同一 Job 同一时刻只能有一个有效 lease_owner。
8. 终态不可被后到结果覆盖。

验收：

- Redis 与 DB Poll 同时命中同一 Job，只产生一次 Salt 发布。
- Worker 崩溃后，Job 在 lease 到期后可安全恢复。
- 单元测试和真实 Salt 调用均通过。

## 5.2 Salt JID 冲突处理

规则：

1. salt_jid 唯一约束保留。
2. 发生冲突时不得更新新 Job。
3. 冲突必须写审计事件 salt_jid_conflict。
4. 新 Job 进入 failed，error_code 固定为 SALT_JID_CONFLICT。
5. 响应返回原冲突 Job ID，便于追踪。

验收：

- 构造重复 JID，不出现 ownership 篡改。
- 原 Job 结果与状态保持不变。

## 5.3 Secret 幂等与保密

规则：

1. Secret scope 使用幂等 upsert。
2. 唯一键覆盖 tenant_id、endpoint_id、scope_type、scope_key。
3. Retry、Rollback、Remigrate 不创建重复 scope。
4. 日志、事件、API、Returner 和证据包不得包含 secret value。
5. 只保留 secret_ref、版本、scope 和脱敏校验信息。

验收：

- 同一请求重复执行三次，只保留一个有效 scope。
- 自动扫描证据包和日志，无明文 Secret。

## 5.4 真实 Job 合约

统一 operation：

- install
- configure
- start
- stop
- restart
- health
- diagnose
- rollback
- handover
- remigrate

请求必须包含：

- endpoint_id
- minion_id
- operation
- idempotency_key
- config_revision
- release_id
- requested_by
- correlation_id

响应必须包含：

- job_id
- salt_jid
- status
- accepted_at
- duplicate

禁止使用 debug route 作为正式业务入口。

## 5.5 可观测性

Endpoint 最新状态必须来自：

- heartbeat
- last_job
- rollout
- deployment
- current_release
- current_revision
- gateway_health
- migration_phase
- last_error

新增指标：

- job_dispatch_latency_seconds
- job_duration_seconds
- job_duplicate_total
- job_reclaim_total
- salt_publish_error_total
- endpoint_heartbeat_age_seconds
- gateway_health_failure_total
- handover_failure_total
- rollback_success_total
- master_unavailable_seconds
- rollout_pause_master_unavailable_total

必须可按 endpoint_id、job_id、salt_jid、correlation_id 串联。

## 5.6 Rollout 和 Approval

Rollout 状态：

- draft
- waiting_approval
- approved
- running
- paused
- aborting
- aborted
- completed
- failed

审批动作：

- approve
- reject
- pause
- resume
- abort

单 Master 特殊规则：

1. salt-api 连续不可用达到配置阈值时自动 pause。
2. pause 后不得发布新 Job。
3. Master 恢复后必须人工 resume。
4. 已运行 Job 由 Observer 重新 reconcile。

## 5.7 Observer

Observer 每 60 秒执行：

1. 检查 salt-api 可用性。
2. 聚合 Endpoint heartbeat。
3. 聚合 Gateway health。
4. 聚合 Job 和 Rollout 状态。
5. 处理超时 lease。
6. 发现 Master 失联时暂停 rollout。
7. 输出 1h、6h、24h 稳定性窗口。

---

## 6. 实施阶段

## Phase 0：冻结基线

交付：

- 当前 commit SHA。
- migration DB 版本。
- Master minion key 清单。
- Master 配置与 PKI 指纹。
- Pillar、Extension、Release Artifact 版本。
- 首台 Endpoint 的 Minion、Hermes、Runtime 和 apps/work 版本。
- 已有 Hermes Home、Gateway Task、Secret Scope 清单。

退出条件：

- 所有基线可在证据包中定位。
- 可恢复到迁移前状态。

## Phase 1：Runtime Correctness

实施：

1. 每个 Worker 创建独立 AsyncSession。
2. 增加 Job claim、lease、heartbeat 和 reclaim。
3. Redis 与 DB Poll 收敛为同一 claim 入口。
4. 修复 JID 冲突处理。
5. Secret scope 改为幂等 upsert。
6. 为并发、重试、崩溃恢复补测试。

退出条件：

- 重复发布为零。
- 所有 P0 一致性测试通过。

## Phase 2：Live Control Plane Closure

实施：

1. 正式 operation 接入 Job API。
2. salt-api 请求、JID、Returner、DB 状态闭环。
3. Endpoint 最新状态聚合。
4. Rollout、Approval、Observer 可用。
5. 真实 Endpoint、Job、Rollback Hook 接入。
6. eAuth 收敛到指定 target 和 function。

退出条件：

- 正常、失败、超时、重复、取消均可追踪。
- Hook 与 Event 不包含 Secret。

## Phase 3：Handover / Rollback / Remigrate

Handover 步骤：

1. Preflight。
2. 备份 Runtime 配置、Hermes Home 和 Gateway Task。
3. 停止 Runtime Gateway ownership。
4. 应用 Salt Pillar 与 Release。
5. 创建绑定用户 Gateway Task。
6. 启动并验证健康。
7. 验证 apps/work Chat、Session、Files、Attachment、Slash。
8. 标记 handover_completed。

Rollback 步骤：

1. 停止 Salt 管理的 Gateway Task。
2. 恢复 Runtime ownership。
3. 恢复原配置与任务。
4. 验证 Gateway 与 apps/work。
5. 标记 rollback_completed。

Remigrate：

1. 在同一 Endpoint 上重新执行 Preflight。
2. 复用原 idempotency_key 语义。
3. 再次完成 Salt ownership。
4. 开始 24 小时观察。

退出条件：

- Handover、Rollback、Remigrate 各成功一次。
- 用户数据、会话和 Secret 不丢失。

## Phase 4：CI Live Canary

CI 工作流输入：

- environment
- endpoint_selector
- operation
- release_id
- config_revision
- evidence_dir

允许 operation：

- preflight
- install
- configure
- health
- diagnose
- rollback
- handover
- remigrate

硬门禁：

1. salt-api TLS 验证通过。
2. Master 指纹匹配。
3. Minion accepted 且 online。
4. Extension Sync 成功。
5. Pillar 与 Release 校验通过。
6. Secret 不泄漏。
7. Runtime fallback 可用。

退出条件：

- PR 级模拟测试通过。
- 手工授权的 Live Canary 成功。
- 失败证据自动归档。

## Phase 5：首台真实 Endpoint

目标：

- Master 固定为 192.168.102.104。
- 选择 IT / 开发用途 Windows Endpoint。
- 业务数据可备份。
- 用户同意维护窗口。

执行顺序：

1. Preflight。
2. Test Ping。
3. Sync All。
4. Pillar Dry Run。
5. Install / Configure。
6. Health。
7. Handover。
8. apps/work 回归。
9. Rollback。
10. apps/work 回归。
11. Remigrate。
12. 启动 24 小时观察。

失败规则：

- 任一步失败立即停止后续步骤。
- 自动执行可安全完成的清理。
- Handover 后失败必须触发 Runtime rollback。
- 证据包不完整视为失败。

## Phase 6：24 小时观察与单 Master 准入

观察窗口：

- T+0
- T+1h
- T+6h
- T+24h

阈值：

- Minion heartbeat 连续可用。
- Gateway health 成功率 ≥ 99%。
- Job 重复发布 = 0。
- 未恢复 failed Job = 0。
- Secret 泄漏 = 0。
- apps/work 关键流程成功率 = 100%。
- Runtime rollback 可执行。

Master 恢复演练：

1. 备份 Master 配置、PKI、Pillar、Extension 和 Release 元数据。
2. 在隔离环境恢复。
3. 校验 Master 指纹与 Minion 信任关系。
4. 校验 salt-api、test.ping、sync_all 和 health。
5. 记录 RTO、失败点和恢复步骤。

单 Master 风险接受：

- 仅允许用于首台 Endpoint 和 v2.4 Ring 0。
- Master 不可用时 Control Plane 进入只观测 / 暂停变更状态。
- Data Plane 必须继续运行。
- 业务方、平台负责人和安全负责人共同签署。

---

## 7. v2.4 Ring 0 准入

规模：

- 5 台 IT / 开发 Endpoint。
- 观察期 7 天。
- 继续使用 Master 192.168.102.104。

Go 条件：

1. Phase 0–6 全部完成。
2. 首台 Endpoint 迁移、回滚、重迁移通过。
3. 24 小时阈值全部通过。
4. Master 备份恢复演练通过。
5. 单 Master 风险接受已签署。
6. Runtime fallback 可用。
7. Live Canary 是部署前硬门禁。

No-Go 条件：

- 任一 P0 未关闭。
- Job 出现重复发布或 ownership 错写。
- Secret 泄漏。
- Runtime rollback 失败。
- Master 恢复演练失败。
- apps/work 关键流程失败。
- 证据包不完整。

---

## 8. Ring 0 单 Master 运行规则

1. 每次变更前检查 Master、salt-api、Minion 和 Returner。
2. Master 不可用时自动暂停 rollout。
3. 不允许离线时排队执行破坏性变更。
4. 恢复后先 reconcile，再人工 resume。
5. 每日备份 Master 配置、PKI、Pillar 和 Release 元数据。
6. 每台 Endpoint 保留 Runtime fallback。
7. Ring 0 完成后进入 v2.5 HA Readiness 评审。
8. Ring 1 不得在 HA 决策和演练完成前启动。

---

## 9. 建议提交顺序

1. docs: v2.3.1 baseline and scope
2. fix: isolate worker database sessions
3. feat: add job claim lease heartbeat reclaim
4. fix: handle salt jid conflict safely
5. fix: make secret scopes idempotent
6. feat: close live job observation rollout approval
7. feat: add master availability observer and rollout pause
8. feat: wire handover rollback remigrate hooks
9. test: add apps work enterprise salt canary
10. ci: add manual live canary workflow
11. docs: add first endpoint evidence and single master risk acceptance

每个提交要求：

- 单一职责。
- 包含测试。
- 不混入无关重构。
- 可独立回滚。

---

## 10. Definition of Done

v2.3.1 完成必须同时满足：

- [ ] 共享 AsyncSession 已消除。
- [ ] Job claim / lease / heartbeat / reclaim 已生效。
- [ ] Redis 与 DB Poll 不会重复发布。
- [ ] JID 冲突不会篡改 Job ownership。
- [ ] Secret 重试幂等且无明文泄漏。
- [ ] 真实 Job 合约和观测闭环可用。
- [ ] Rollout / Approval / Observer 可用。
- [ ] Handover / Rollback / Remigrate 各通过一次。
- [ ] apps/work 企业模式关键流程通过。
- [ ] 首台真实 Endpoint 24 小时观察通过。
- [ ] Master 备份恢复演练通过。
- [ ] 单 Master 风险接受已签署。
- [ ] Runtime fallback 已验证。
- [ ] v2.4 Ring 0 Go / No-Go 已签署。

---

## 11. 最终决策

v2.3.1 不建设 Salt Master 高可用。

当前实施顺序固定为：

Runtime Correctness  
→ Live Control Plane Closure  
→ Handover / Rollback / Remigrate  
→ CI Live Canary  
→ First Endpoint  
→ 24h Observation  
→ Master Backup / Restore Drill  
→ Single-Master Risk Acceptance  
→ v2.4 Ring 0

第二 Master、MultiMaster-PKI 和双向故障转移全部移出 v2.3.1；Ring 0 完成后在 v2.5 HA Readiness 中单独设计和验证。
