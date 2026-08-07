# Hermes Desktop V1.2 — 编码任务规划

**文档版本**: v1.0  
**创建日期**: 2026-05-16  
**基线**: V1.1 → V1.2  
**对应规格**: `.codeartsdoer/specs/hermes-v1.2/spec.md`  
**对应设计**: `.codeartsdoer/specs/hermes-v1.2/design.md`

---

## 里程碑定义

| 里程碑 | 达成条件 | 目标日期 |
|--------|----------|----------|
| **M1: Runtime 稳定性就绪** | Phase 1 全部任务完成，Gateway 崩溃可自动重启、端口冲突/启动超时可检测、App 重启后状态可恢复 | Week 2 |
| **M2: DB 治理就绪** | Phase 2 全部任务完成，migration 可执行/回滚、备份/恢复可用、导入 diff/回滚可用 | Week 3 |
| **M3: 入口体验就绪** | Phase 3 全部任务完成，Profile Entry 列表/搜索/置顶/状态徽章/快捷操作/会话恢复可用 | Week 4 |
| **M4: 委托编排就绪** | Phase 4 全部任务完成，委托任务完整生命周期、并行分发、结果合并、超时/重试/取消可用 | Week 5 |
| **M5: 治理增强就绪** | Phase 5 全部任务完成，技能矩阵/回滚、上下文 TTL/撤销/摘要/使用历史可用 | Week 6 |
| **M6: V1.2 全功能交付** | Phase 6 全部任务完成，Web Operator 深度集成、策略引擎、审计查询、可观测性、部署向导可用 | Week 9 |

---

## Phase 1: Runtime 稳定性（P0）

> 对应需求: FR-RT-001 ~ FR-RT-008  
> 目标: 增强 Gateway Supervisor 和 Profile Runtime Manager，实现崩溃检测、自动重启、端口冲突检测、启动超时检测、App 重启后状态恢复、日志查看

### T1.1 扩展 runtime_instances 数据模型与 Shared 契约

- [ ] 扩展 `runtime_instances` 表新增 5 个字段: `restart_count`, `last_exit_code`, `last_crash_at`, `auto_restart`, `health_fail_count`
- [ ] 在 `src/shared/profile-runtime/profile-runtime-contract.ts` 中扩展 `RuntimeInstanceRecord` 类型，新增上述 5 个字段
- [ ] 在 `src/shared/profile-runtime/profile-runtime-contract.ts` 中新增 `RuntimeReconcileResult` 类型
- [ ] 在 `src/shared/profile-runtime/profile-runtime-errors.ts` 中新增 `PROFILE_STARTUP_TIMEOUT` 错误码

**涉及文件**: `src/shared/profile-runtime/profile-runtime-contract.ts`, `src/shared/profile-runtime/profile-runtime-errors.ts`  
**依赖**: 无  
**复杂度**: S  
**验收标准**: TypeScript 类型编译通过，新增字段类型与 SQL DDL 一致

---

### T1.2 实现 Gateway Log Collector

- [ ] 新建 `src/main/gateway-log-collector.ts`，实现 `GatewayLogCollector` 类
- [ ] 实现 `startCollecting(profileId, pid)` — 捕获 Gateway 子进程 stdout/stderr
- [ ] 实现 `stopCollecting(profileId)` — 停止日志收集
- [ ] 实现 `getHistory(profileId, options?)` — 返回历史日志（支持 limit / level 过滤）
- [ ] 实现 `onNewLog(profileId, callback)` — 实时日志推送订阅
- [ ] 定义 `LogEntry` 接口: `{ timestamp, level, message }`

**涉及文件**: `src/main/gateway-log-collector.ts`  
**依赖**: 无  
**复杂度**: M  
**验收标准**: 可收集 Gateway stdout/stderr，支持历史查询与实时推送，内存日志缓冲区有上限保护

---

### T1.3 增强 GatewaySupervisor：自动重启与健康失败计数

- [ ] 修改 `src/main/gateway-supervisor.ts`，增强 `startSupervision` 接受 `{ autoRestart, maxRestartCount, startupTimeoutMs }` 选项
- [ ] 实现连续健康检查失败 ≥ 阈值时标记 status=failed 并递增 `health_fail_count`（FR-RT-001）
- [ ] 实现 `auto_restart=true` 时自动重启逻辑，超过 `maxRestartCount`(默认 3) 次停止自动重启（FR-RT-003）
- [ ] 健康检查恢复成功时重置 `health_fail_count`

**涉及文件**: `src/main/gateway-supervisor.ts`  
**依赖**: T1.1  
**复杂度**: M  
**验收标准**: 连续 3 次健康检查失败 → status=failed, health_fail_count 递增; auto_restart=true → 15 秒内自动重启; 超过 3 次重启停止

---

### T1.4 增强 ProfileRuntimeManager：崩溃检测/端口冲突/启动超时

- [ ] 修改 `src/main/profile-runtime-manager.ts`，增加端口冲突检测逻辑（启动前检测端口占用，返回 `PROFILE_PORT_CONFLICT`）（FR-RT-004）
- [ ] 增加启动超时检测（setTimeout + kill），超时后标记 status=failed，reason=startup_timeout（FR-RT-005）
- [ ] 监听子进程 exit 事件，非零 exit code 时检测崩溃，记录 `last_exit_code`/`last_crash_at`/递增 `restart_count`（FR-RT-002）
- [ ] 崩溃后若 `auto_restart=true`，触发自动重启流程
- [ ] 整合 `GatewayLogCollector.startCollecting()` 于 Gateway 启动流程

**涉及文件**: `src/main/profile-runtime-manager.ts`, `src/main/profile-runtime-db.ts`  
**依赖**: T1.2, T1.3  
**复杂度**: L  
**验收标准**: 端口冲突 → PROFILE_PORT_CONFLICT; 30 秒未通过健康检查 → startup_timeout; 手动 kill Gateway → failed 状态 + exit_code 记录; auto_restart=true → 自动重启

---

### T1.5 实现 RuntimeReconciler：App 重启后状态恢复

- [ ] 新建 `src/main/runtime-reconciler.ts`，实现 `RuntimeReconciler` 类
- [ ] 实现 `reconcile()` — 扫描所有 runtime_instance 记录，检查对应 Gateway 进程是否存活，校正状态（running→stopped 若进程不存在）
- [ ] 实现 `isPortOccupied(port)` — 检测端口占用
- [ ] 在 App 启动时（`app.on('ready')` 或 `createWindow` 后）调用 `RuntimeReconciler.reconcile()`
- [ ] 在 10 秒内完成所有实例状态恢复（FR-RT-006）

**涉及文件**: `src/main/runtime-reconciler.ts`, `src/main/profile-runtime-manager.ts`  
**依赖**: T1.4  
**复杂度**: M  
**验收标准**: App 重启前有 2 个 running Profile → 重启后 10 秒内恢复; 若进程已不存在 → 标记 stopped

---

### T1.6 新增 Preload IPC 与 Renderer 日志查看 UI

- [ ] 在 `src/preload/profile-runtime-api.ts` 新增 `getGatewayLogs`, `onRuntimeStatusChanged`, `setAutoRestart` 通道
- [ ] 在 `src/main/profile-runtime-ipc.ts` 新增对应 IPC handler
- [ ] 增强 `src/renderer/src/screens/ProfileRuntime/ProfileRuntimeScreen.tsx` 的 StatusBadge：failed 红色 + 错误原因 tooltip
- [ ] 新增 LogViewer 子面板：显示 Gateway 日志，支持实时 tail 和历史查看，按 level 过滤

**涉及文件**: `src/preload/profile-runtime-api.ts`, `src/main/profile-runtime-ipc.ts`, `src/renderer/src/screens/ProfileRuntime/ProfileRuntimeScreen.tsx`, `src/renderer/src/screens/ProfileRuntime/LogViewer.tsx`  
**依赖**: T1.2, T1.5  
**复杂度**: M  
**验收标准**: 点击 Profile"查看日志" → 显示 stdout/stderr 日志，支持实时滚动; StatusBadge 正确显示 running/stopped/failed/starting 状态

---

### T1.7 Phase 1 集成测试

- [ ] 编写 GatewaySupervisor 自动重启集成测试（模拟健康检查连续失败）
- [ ] 编写端口冲突检测测试（模拟端口占用）
- [ ] 编写启动超时测试（模拟 Gateway 不响应健康检查）
- [ ] 编写 RuntimeReconciler 状态恢复测试
- [ ] 编写 GatewayLogCollector 日志收集与推送测试
- [ ] 验证 FR-RT-001 ~ FR-RT-008 所有验收条件

**涉及文件**: `tests/`  
**依赖**: T1.6  
**复杂度**: M  
**验收标准**: 全部测试通过，覆盖 FR-RT-001~008 验收条件

---

## Phase 2: SQLite Governance（P0）

> 对应需求: FR-DB-001 ~ FR-DB-008  
> 目标: 实现 schema 版本化迁移、DB 备份/恢复/校验、配置导入 diff 预览与回滚、Profile 删除/禁用、孤立实例清理

### T2.1 实现 MigrationRunner：版本化迁移框架

- [ ] 新建 `src/main/migration-runner.ts`，实现 `MigrationRunner` 类
- [ ] 实现 `run(db)` — 读取 `schema_version` 当前版本，按序执行未应用的迁移脚本，事务内执行
- [ ] 实现 `getAppliedVersions()` — 返回已应用的迁移版本列表
- [ ] 实现 `rollback(db, targetVersion)` — 回滚到指定版本
- [ ] 迁移失败时自动回滚当前迁移，保持上一版本 schema（FR-REL-004）

**涉及文件**: `src/main/migration-runner.ts`  
**依赖**: T1.1  
**复杂度**: M  
**验收标准**: 初始化/升级 → schema_version 正确记录; 迁移失败 → 回滚到上一版本

---

### T2.2 编写 Migration V2 脚本

- [ ] 新建 `src/main/migrations/v2.ts`，实现 `migrateV2(db)`
- [ ] 包含 runtime_instances 5 个新增字段 ALTER TABLE
- [ ] 包含 profile_entries 2 个新增字段 ALTER TABLE
- [ ] 包含 profile_skills 2 个新增字段 ALTER TABLE
- [ ] 包含 shared_contexts 4 个新增字段 ALTER TABLE
- [ ] 包含 delegation_tasks / delegation_sub_tasks / operation_policies / context_usage_history 4 个新表 CREATE TABLE
- [ ] 包含所有新增索引 CREATE INDEX
- [ ] 更新 schema_version 为 2

**涉及文件**: `src/main/migrations/v2.ts`  
**依赖**: T2.1  
**复杂度**: M  
**验收标准**: V1.1 DB 执行 migrateV2 后结构正确，所有新字段有默认值，新表/索引创建成功

---

### T2.3 实现 DbGovernance：备份/恢复/校验/清理

- [ ] 新建 `src/main/db-governance.ts`，实现 `DbGovernance` 类
- [ ] 实现 `backup()` — 创建带时间戳的 DB 副本，计算 SHA-256 校验和，返回 `DbBackupResult`（FR-DB-002）
- [ ] 实现 `restore(backupPath)` — 校验 checksum 后替换当前 DB，重新初始化内存状态，返回 `DbRestoreResult`（FR-DB-003）
- [ ] 实现 `verifyChecksum(backupPath, expectedChecksum)` — 校验备份文件完整性（FR-REL-003）
- [ ] 实现 `cleanOrphanInstances()` — 检测并清理无对应 Profile 的 runtime_instance，返回 `OrphanCleanupResult`（FR-DB-008）

**涉及文件**: `src/main/db-governance.ts`  
**依赖**: T2.2  
**复杂度**: M  
**验收标准**: 备份 → 生成 .bak 文件 + SHA-256; 恢复 → 校验通过后替换 + 状态刷新; checksum 不匹配 → 拒绝恢复; 清理孤立 → 返回清理数量

---

### T2.4 增强 ConfigImporter：导入 Diff 预览与回滚

- [ ] 修改 `src/main/config-importer.ts`，新增 `computeConfigDiff(yamlContent)` — 计算当前配置与新 YAML 的差异，返回 `ConfigDiffResult`（FR-DB-004）
- [ ] 新增 `applyImportWithBackup(yamlContent)` — 导入前先备份当前配置，再写入新配置（FR-DB-005 前置）
- [ ] 新增 `rollbackImport()` — 从预备份恢复到导入前状态（FR-DB-005）
- [ ] diff 预览中标记破坏性变更（删除运行中 Profile），`hasDestructiveChanges` 标记
- [ ] 在 `src/shared/profile-runtime/profile-runtime-contract.ts` 新增 `ConfigDiffResult`, `ConfigDiffItem` 类型

**涉及文件**: `src/main/config-importer.ts`, `src/shared/profile-runtime/profile-runtime-contract.ts`  
**依赖**: T2.3  
**复杂度**: L  
**验收标准**: 导入 YAML → 显示差异预览(新增/修改/删除); 确认导入 → 带备份写入; 回滚 → 恢复到导入前; 破坏性变更高亮警告

---

### T2.5 增强 ProfileRuntimeDB：Profile 删除/禁用

- [ ] 修改 `src/main/profile-runtime-db.ts`，新增 `deleteProfile(profileId, deleteHome?)` — 级联删除 Profile 及所有关联记录（runtime_instance / profile_entry / profile_capabilities / profile_skills / skill_sync_events / shared_contexts / delegation_events / operation_policies）（FR-DB-006）
- [ ] 新增 `disableProfile(profileId, disabled)` — 设置 enabled 字段，若禁用则停止运行中 Gateway，阻止后续运行操作（FR-DB-007）
- [ ] 删除 running 状态的 Profile 时先停止 Gateway 进程

**涉及文件**: `src/main/profile-runtime-db.ts`, `src/main/profile-runtime-manager.ts`  
**依赖**: T2.2  
**复杂度**: M  
**验收标准**: 删除 Profile → 所有关联记录移除; 禁用 → enabled=false, Gateway 停止, 无法启动/委托

---

### T2.6 新增 Preload IPC 与 Renderer UI：备份/恢复/Diff/删除/禁用

- [ ] 在 `src/preload/profile-runtime-api.ts` 新增 `backupDb`, `restoreDb`, `computeImportDiff`, `applyImportWithBackup`, `rollbackImport`, `deleteProfile`, `disableProfile`, `cleanOrphanInstances`, `getMigrationVersions`
- [ ] 在 `src/main/profile-runtime-ipc.ts` 新增对应 IPC handler
- [ ] 新增 `ImportDiffDialog` 组件：展示配置差异预览，支持逐项确认，破坏性变更二次确认
- [ ] 新增 `DbBackupRestorePanel` 子面板：备份/恢复操作 + 备份列表 + 校验状态
- [ ] 在 `src/shared/profile-runtime/profile-runtime-contract.ts` 新增 `DbBackupResult`, `DbRestoreResult`, `OrphanCleanupResult`, `MigrationRecord` 类型

**涉及文件**: `src/preload/profile-runtime-api.ts`, `src/main/profile-runtime-ipc.ts`, `src/renderer/src/screens/ProfileRuntime/ImportDiffDialog.tsx`, `src/renderer/src/screens/ProfileRuntime/DbBackupRestorePanel.tsx`, `src/shared/profile-runtime/profile-runtime-contract.ts`  
**依赖**: T2.4, T2.5  
**复杂度**: L  
**验收标准**: UI 可触发备份/恢复; 导入 YAML → diff 预览 → 确认/回滚; 删除/禁用 Profile 操作可用

---

### T2.7 Phase 2 集成测试

- [ ] 编写 MigrationRunner 迁移/回滚测试
- [ ] 编写 Migration V2 升级测试（V1.1 DB → V2）
- [ ] 编写 DbGovernance 备份/恢复/校验测试
- [ ] 编写 ConfigImporter diff 计算/回滚测试
- [ ] 编写 deleteProfile 级联删除测试
- [ ] 编写 disableProfile 禁用/启用测试
- [ ] 编写 cleanOrphanInstances 孤立清理测试
- [ ] 验证 FR-DB-001 ~ FR-DB-008 所有验收条件

**涉及文件**: `tests/`  
**依赖**: T2.6  
**复杂度**: M  
**验收标准**: 全部测试通过，覆盖 FR-DB-001~008 验收条件

---

## Phase 3: Profile Entry UX（P0）

> 对应需求: FR-UX-001 ~ FR-UX-008  
> 目标: 实现最近访问/置顶/搜索/状态徽章/快捷操作/会话恢复/AI-OS 首页聚合看板/Specialist Workspace 增强

### T3.1 扩展 profile_entries 数据模型与 Shared 契约

- [ ] profile_entries 新增 `last_accessed_at`/`is_pinned` 字段（Migration V2 已包含）
- [ ] 在 `src/shared/profile-runtime/profile-runtime-contract.ts` 新增 `ProfileEntryWithStatus`, `RecentProfileResult`, `ProfileSearchResult` 类型
- [ ] 扩展 `ProfileEntryAPI` 接口新增方法签名

**涉及文件**: `src/shared/profile-runtime/profile-runtime-contract.ts`  
**依赖**: T2.2  
**复杂度**: S  
**验收标准**: TypeScript 类型编译通过，新类型与 DB schema 一致

---

### T3.2 增强 ProfileRuntimeDB：最近访问/置顶/搜索

- [ ] 修改 `src/main/profile-runtime-db.ts`，新增 `getRecentProfiles(limit)` — 按 `last_accessed_at` 降序返回最近访问的 Profile（FR-UX-001）
- [ ] 新增 `searchProfiles(query)` — 按名称/display_name/description 模糊搜索（FR-UX-003）
- [ ] 新增 `toggleProfilePin(profileId, pinned)` — 切换置顶状态（FR-UX-002）
- [ ] 新增 `updateLastAccessedAt(profileId)` — 更新最近访问时间
- [ ] 新增 `getLastSession(profileId)` — 获取上次会话信息（FR-UX-006）

**涉及文件**: `src/main/profile-runtime-db.ts`  
**依赖**: T3.1  
**复杂度**: M  
**验收标准**: 最近访问 → 按时间降序返回; 搜索 → 模糊匹配; 置顶 → 置顶 Profile 在列表顶部

---

### T3.3 新增 Preload IPC 与实现 ProfileEntryList UI

- [ ] 在 `src/preload/profile-entry-api.ts` 新增 `getRecentProfiles`, `searchProfiles`, `togglePin`, `getLastSession`, `updateLastAccessed` 通道
- [ ] 在 `src/main/profile-runtime-ipc.ts` 新增对应 IPC handler
- [ ] 新建 `src/renderer/src/screens/ProfileWorkspace/ProfileEntryList.tsx` — Profile 列表组件
- [ ] 实现置顶 Profile 置顶显示（FR-UX-002）
- [ ] 实现搜索输入 debounce 300ms（FR-UX-003）
- [ ] 每项显示 StatusBadge（running 绿/failed 红/stopped 灰/starting 黄旋转）（FR-UX-004）
- [ ] 每项提供快捷操作：start/stop/view logs/open browser（可用性依赖当前状态）（FR-UX-005）

**涉及文件**: `src/preload/profile-entry-api.ts`, `src/main/profile-runtime-ipc.ts`, `src/renderer/src/screens/ProfileWorkspace/ProfileEntryList.tsx`  
**依赖**: T3.2  
**复杂度**: L  
**验收标准**: 列表显示最近访问 + 置顶; 搜索 debounce 生效; 状态徽章正确; 快捷操作可用性正确

---

### T3.4 实现 SessionResumeDialog：上次会话恢复

- [ ] 新建 `src/renderer/src/screens/ProfileWorkspace/SessionResumeDialog.tsx` — 会话恢复提示对话框
- [ ] 用户点击有历史会话的 Profile → 弹出"恢复上次会话?"确认对话框（FR-UX-006）
- [ ] 确认后加载历史会话; 若 Gateway 未运行 → 提示先启动
- [ ] 在 ProfileWorkspaceScreen 中集成 SessionResumeDialog

**涉及文件**: `src/renderer/src/screens/ProfileWorkspace/SessionResumeDialog.tsx`, `src/renderer/src/screens/ProfileWorkspace/ProfileWorkspaceScreen.tsx`  
**依赖**: T3.3  
**复杂度**: S  
**验收标准**: 点击有历史会话的 Profile → 提示恢复; Gateway 未运行 → 提示先启动

---

### T3.5 实现 AIOSHomeDashboard：AI-OS 首页聚合看板

- [ ] 新建 `src/renderer/src/screens/AIOSWorkspace/AIOSHomeDashboard.tsx` — 首页聚合看板
- [ ] 显示所有 Profile 状态卡片（FR-UX-007）
- [ ] 显示最近任务/最近委托/待确认操作
- [ ] 显示 Web Operator 快捷入口
- [ ] 在 AIOSWorkspaceScreen 中嵌入 AIOSHomeDashboard 替换原简单状态列表

**涉及文件**: `src/renderer/src/screens/AIOSWorkspace/AIOSHomeDashboard.tsx`, `src/renderer/src/screens/AIOSWorkspace/AIOSWorkspaceScreen.tsx`  
**依赖**: T3.3  
**复杂度**: M  
**验收标准**: 首页显示 Profile 状态卡片 + 最近任务 + 最近委托 + 待确认 + Web Operator 快捷入口

---

### T3.6 增强 Specialist Workspace 页面

- [ ] 修改 Specialist Workspace 页面，显示当前 Profile 状态（FR-UX-008）
- [ ] 显示上次会话/技能快捷列表/共享上下文列表/运行日志
- [ ] 在 ProfileWorkspaceScreen 中嵌入 ProfileEntryList

**涉及文件**: `src/renderer/src/screens/ProfileWorkspace/ProfileWorkspaceScreen.tsx`  
**依赖**: T3.4, T3.5  
**复杂度**: M  
**验收标准**: Specialist Workspace 显示 Profile 状态/上次会话/技能列表/共享上下文/运行日志

---

### T3.7 Phase 3 集成测试

- [ ] 编写 getRecentProfiles/searchProfiles/togglePin DB 测试
- [ ] 编写 ProfileEntryList UI 组件测试（搜索 debounce、置顶排序、状态徽章）
- [ ] 编写 SessionResumeDialog 测试
- [ ] 编写 AIOSHomeDashboard 渲染测试
- [ ] 验证 FR-UX-001 ~ FR-UX-008 所有验收条件

**涉及文件**: `tests/`  
**依赖**: T3.6  
**复杂度**: S  
**验收标准**: 全部测试通过，覆盖 FR-UX-001~008 验收条件

---

## Phase 4: Delegation Orchestration（P0）

> 对应需求: FR-DLG-001 ~ FR-DLG-009  
> 目标: 将 DelegationCapability 增强为完整任务编排器，支持 task_id 生命周期、多 Profile 并行分发、结果合并、超时/重试/取消

### T4.1 扩展 Shared 契约与错误码

- [ ] 在 `src/shared/profile-runtime/profile-runtime-contract.ts` 新增 `DelegationTaskStatus` 枚举: created | dispatching | running | succeeded | failed | timeout | cancelled
- [ ] 新增 `DelegationTaskRecord`, `DelegationSubTask`, `CreateDelegationTaskRequest`, `DelegationTaskResult`, `DelegationTaskSummary` 类型
- [ ] 在 `src/shared/profile-runtime/profile-runtime-errors.ts` 新增 `DELEGATION_NOT_ALLOWED`, `DELEGATION_TASK_TIMEOUT`, `DELEGATION_TARGET_NOT_RUNNING` 错误码

**涉及文件**: `src/shared/profile-runtime/profile-runtime-contract.ts`, `src/shared/profile-runtime/profile-runtime-errors.ts`  
**依赖**: T2.2  
**复杂度**: S  
**验收标准**: TypeScript 类型编译通过，枚举值与 DB CHECK 约束一致

---

### T4.2 增强 ProfileRuntimeDB：delegation_tasks CRUD

- [ ] 修改 `src/main/profile-runtime-db.ts`，新增 delegation_tasks / delegation_sub_tasks 表 CRUD 方法
- [ ] 实现 `insertDelegationTask(record)` — 创建委托任务记录（FR-DLG-001）
- [ ] 实现 `updateDelegationTaskStatus(taskId, status, timestamp)` — 更新任务状态，记录状态流转时间戳（FR-DLG-002）
- [ ] 实现 `getDelegationTask(taskId)` — 查询单个委托任务详情
- [ ] 实现 `listDelegationTasks(profileId?, status?)` — 列表查询（支持按 Profile/状态过滤）
- [ ] 实现 `insertDelegationSubTask` / `updateDelegationSubTaskStatus` — 子任务 CRUD

**涉及文件**: `src/main/profile-runtime-db.ts`  
**依赖**: T4.1  
**复杂度**: M  
**验收标准**: CRUD 操作正确，status 流转时间戳记录，外键级联删除生效

---

### T4.3 实现 DelegationOrchestrator：委托任务编排

- [ ] 新建 `src/main/delegation-orchestrator.ts`，实现 `DelegationOrchestrator` 类
- [ ] 实现 `createTask(request)` — 创建 DelegationTask 记录，status=created（FR-DLG-001）
- [ ] 实现 `dispatch(taskId)` — 并行分发到所有 target Profiles，维护 sub-task 状态（FR-DLG-002/003）
- [ ] 实现结果合并：全部完成 → status=succeeded，合并结果面板（FR-DLG-004）
- [ ] 实现超时控制：超过 timeout_seconds → status=timeout，终止等待（FR-DLG-006）
- [ ] 实现 `retryTask(taskId)` — 创建新 DelegationTask，相同输入（FR-DLG-005）
- [ ] 实现 `cancelTask(taskId)` — status=cancelled，终止目标 Profile 调用（FR-DLG-009）
- [ ] context_refs 解析：附加共享上下文到委托请求（FR-DLG-007）
- [ ] 状态流转审计：每次状态变更写入 audit_events（FR-DLG-008）
- [ ] 目标 Profile 未运行时标记 sub-task 为 failed，不影响其他 sub-task

**涉及文件**: `src/main/delegation-orchestrator.ts`  
**依赖**: T4.2  
**复杂度**: XL  
**验收标准**: 完整生命周期: created→dispatching→running→succeeded/failed/timeout/cancelled; 并行分发; 结果合并; 超时终止; 重试创建新 task; 取消终止调用; context_refs 附加; 审计记录

---

### T4.4 重构 DelegationCapability 适配 Orchestrator

- [ ] 修改 `src/main/delegation-capability.ts`，内部委托 `DelegationOrchestrator`
- [ ] 保留 `invoke` 兼容接口，内部转为 `createTask` + `dispatch`
- [ ] 确保既有委托调用路径不受影响

**涉及文件**: `src/main/delegation-capability.ts`  
**依赖**: T4.3  
**复杂度**: S  
**验收标准**: 既有委托调用正常，内部走 Orchestrator 路径

---

### T4.5 新增 Preload IPC 与实现 DelegationPanel UI

- [ ] 在 `src/preload/profile-runtime-api.ts` 新增 `createDelegationTask`, `cancelDelegationTask`, `retryDelegationTask`, `listDelegationTasks`, `getDelegationTask` 通道
- [ ] 在 `src/main/profile-runtime-ipc.ts` 新增对应 IPC handler + `onDelegationStatusChanged` 推送通道
- [ ] 新建 `src/renderer/src/screens/ProfileWorkspace/DelegationPanel.tsx` — 委托面板
- [ ] 实现委托任务列表（按 profileId/status 过滤）
- [ ] 实现结果合并面板（各 Profile 贡献 + 来源标注）
- [ ] 实现审计时间线（who/when/what）
- [ ] 新建 `src/renderer/src/screens/ProfileWorkspace/DelegationTaskDetail.tsx` — 任务详情
- [ ] 详情显示 sub-task 状态 + 结果 + 重试/取消操作
- [ ] 在 ProfileWorkspaceScreen 中嵌入 DelegationPanel

**涉及文件**: `src/preload/profile-runtime-api.ts`, `src/main/profile-runtime-ipc.ts`, `src/renderer/src/screens/ProfileWorkspace/DelegationPanel.tsx`, `src/renderer/src/screens/ProfileWorkspace/DelegationTaskDetail.tsx`, `src/renderer/src/screens/ProfileWorkspace/ProfileWorkspaceScreen.tsx`  
**依赖**: T4.4  
**复杂度**: L  
**验收标准**: UI 可创建/查看/取消/重试委托; 结果合并面板正确; 审计时间线显示状态变更

---

### T4.6 Phase 4 集成测试

- [ ] 编写 DelegationOrchestrator 全生命周期测试（create → dispatch → succeed/fail/timeout/cancel）
- [ ] 编写并行分发测试（多目标 Profile）
- [ ] 编写超时/重试/取消测试
- [ ] 编写 context_refs 解析测试
- [ ] 编写审计时间线记录测试
- [ ] 编写 DelegationCapability 兼容性测试
- [ ] 验证 FR-DLG-001 ~ FR-DLG-009 所有验收条件

**涉及文件**: `tests/`  
**依赖**: T4.5  
**复杂度**: M  
**验收标准**: 全部测试通过，覆盖 FR-DLG-001~009 验收条件

---

## Phase 5: Skill/Context Governance（P1）

> 对应需求: FR-SK-001~005, FR-CTX-001~006  
> 目标: 增强技能版本/校验和/依赖/矩阵/回滚，增强上下文 version/TTL/tags/status/usage/revoke

### T5.1 扩展 Shared 契约：Skill/Context Governance 类型

- [ ] 在 `src/shared/profile-runtime/profile-runtime-contract.ts` 新增 `SkillCopyPreview`, `SkillMatrixEntry` 类型
- [ ] 新增 `ContextGovernanceInfo`, `ContextUsageRecord`, `ContextStatus` 类型
- [ ] profile_skills 新增 `skill_version`/`dependencies` 字段（Migration V2 已包含）
- [ ] shared_contexts 新增 `version`/`ttl_seconds`/`tags`/`last_summary_at` 字段（Migration V2 已包含）

**涉及文件**: `src/shared/profile-runtime/profile-runtime-contract.ts`  
**依赖**: T2.2  
**复杂度**: S  
**验收标准**: TypeScript 类型编译通过，新类型与 DB schema 一致

---

### T5.2 增强 SkillSyncCapability：版本/校验和/依赖/回滚/矩阵

- [ ] 修改 `src/main/skill-sync-capability.ts`
- [ ] 新增 `previewSkillCopy()` — 返回版本/校验和对比/依赖冲突预览（FR-SK-002）
- [ ] 新增 `executeSkillCopyWithRollback()` — 创建回滚点后复制技能（FR-SK-003）
- [ ] 新增 `rollbackSkillCopy(syncEventId)` — 恢复到覆盖前版本
- [ ] 新增 `installBundledSkill(archivePath, targetProfileId)` — 解压、解析依赖、自动安装依赖技能（FR-SK-005）
- [ ] 安装时计算 SHA-256 checksum 填入 profile_skills（FR-SK-001）
- [ ] 依赖缺失时阻止安装并列出缺失列表

**涉及文件**: `src/main/skill-sync-capability.ts`  
**依赖**: T5.1  
**复杂度**: L  
**验收标准**: 预览显示版本/校验和/依赖; 覆盖后可回滚; bundled skill 安装含依赖解析; checksum 自动计算

---

### T5.3 增强 SessionShareCapability：version/TTL/tags/revoke/summary/usage

- [ ] 修改 `src/main/session-share-capability.ts`
- [ ] 新增 version/TTL/tags 参数支持（FR-CTX-001）
- [ ] 新增 `revokeContext(contextId)` — 标记 status=revoked，阻止后续委托引用（FR-CTX-006）
- [ ] 新增 `regenerateSummary(contextId)` — 重新生成上下文摘要（FR-CTX-003）
- [ ] 新增 `trackContextUsage(contextId, delegationTaskId)` — 记录使用历史（FR-CTX-004）
- [ ] 实现 TTL 过期检测：过期 → status=expired，委托默认不引用（FR-CTX-002）
- [ ] 附加上下文到委托时验证未过期（FR-CTX-005）

**涉及文件**: `src/main/session-share-capability.ts`  
**依赖**: T5.1  
**复杂度**: M  
**验收标准**: TTL 过期 → expired; 撤销 → revoked; 摘要可重生成; 使用历史可追踪; 附加过期上下文 → 提示续期

---

### T5.4 增强 ProfileRuntimeDB：Skill 矩阵/Context 治理查询

- [ ] 修改 `src/main/profile-runtime-db.ts`
- [ ] 新增 `getSkillMatrix()` — 返回 Profile × Skills 二维矩阵（FR-SK-004）
- [ ] 新增 `getContextUsageHistory(contextId)` — 返回上下文使用历史
- [ ] 新增 `revokeContext(contextId)` / `updateContextStatus(contextId, status)` — 状态更新
- [ ] 新增 context_usage_history 表 CRUD

**涉及文件**: `src/main/profile-runtime-db.ts`  
**依赖**: T5.2, T5.3  
**复杂度**: M  
**验收标准**: Skill 矩阵返回正确; 上下文使用历史可查; 状态更新正确

---

### T5.5 新增 Preload IPC 与实现 Skill/Context Governance UI

- [ ] 在 `src/preload/profile-runtime-api.ts` 新增 `previewSkillCopy`, `rollbackSkillCopy`, `installBundledSkill`, `getSkillMatrix`, `revokeContext`, `regenerateContextSummary`, `getContextUsageHistory`
- [ ] 在 `src/main/profile-runtime-ipc.ts` 新增对应 IPC handler
- [ ] 新建 `src/renderer/src/screens/ProfileRuntime/SkillMatrixView.tsx` — Profile × Skills 二维矩阵视图
- [ ] 新建 `src/renderer/src/screens/ProfileWorkspace/ContextGovernancePanel.tsx` — 上下文治理面板
- [ ] 上下文面板显示：版本/TTL/标签/摘要/使用历史/撤销操作

**涉及文件**: `src/preload/profile-runtime-api.ts`, `src/main/profile-runtime-ipc.ts`, `src/renderer/src/screens/ProfileRuntime/SkillMatrixView.tsx`, `src/renderer/src/screens/ProfileWorkspace/ContextGovernancePanel.tsx`  
**依赖**: T5.4  
**复杂度**: L  
**验收标准**: 技能矩阵二维表格正确显示; 技能复制预览/回滚 UI 可用; 上下文治理面板显示版本/TTL/标签/摘要/使用历史

---

### T5.6 Phase 5 集成测试

- [ ] 编写 SkillSyncCapability 预览/回滚/bundled 安装测试
- [ ] 编写 SessionShareCapability TTL/revoke/summary/usage 测试
- [ ] 编写 getSkillMatrix 测试
- [ ] 编写 context_usage_history CRUD 测试
- [ ] 验证 FR-SK-001~005, FR-CTX-001~006 所有验收条件

**涉及文件**: `tests/`  
**依赖**: T5.5  
**复杂度**: M  
**验收标准**: 全部测试通过，覆盖 FR-SK-001~005, FR-CTX-001~006 验收条件

---

## Phase 6: Web Operator 深度集成 + Security + Observability + Audit + Deployment（P0/P1）

> 对应需求: FR-WO-001~008, FR-SEC-007~013, FR-AUD-001~003, FR-OBS-005~009, FR-DEP-001~007  
> 目标: Web Operator Profile-Aware 深度集成、策略引擎、审计查询 UI、可观测性页面、Windows 部署向导

### 6A: Web Operator Profile-Aware

#### T6.1 Browser Partition 动态隔离与 BrowserActionRecorder

- [ ] 修改 `src/main/browser/browser-view-manager.ts`，`createView` 接受 `profileId` 参数，partition 改为 `persist:profile-{profileId}`（FR-WO-002）
- [ ] 修改 `src/main/browser/browser-types.ts`，新增 `BROWSER_PARTITION_PROFILE` 常量
- [ ] 新建 `src/main/browser/browser-action-recorder.ts`，实现 `BrowserActionRecorder` 类
- [ ] 实现 `recordStep(profileId, step)` — 记录 DOM 快照/截图/CSS selector（FR-WO-006/007）
- [ ] 实现 `getRecording(taskId)` — 获取完整录制
- [ ] 实现 `replayTask(taskId, onStep?)` — 按步骤回放（FR-WO-008）
- [ ] 实现 `getDomHistory(profileId, limit?)` — 获取 DOM/截图历史

**涉及文件**: `src/main/browser/browser-view-manager.ts`, `src/main/browser/browser-types.ts`, `src/main/browser/browser-action-recorder.ts`  
**依赖**: T1.4  
**复杂度**: L  
**验收标准**: Web 操作使用 profile 专属 partition; DOM 快照/截图/selector 记录; 回放按步骤执行

---

#### T6.2 增强 WebOperatorProfileBridge：Action Plan/敏感确认/回放

- [ ] 修改 `src/main/web-operator-profile-bridge.ts`
- [ ] 新增 `createActionPlan(profileId, steps)` — 返回操作序列预览（FR-WO-004）
- [ ] 新增 `executePlanWithConfirm(taskId)` — 逐步执行，敏感操作暂停等待确认（FR-WO-005）
- [ ] 新增 `recordAction()` — 记录每步快照/selector
- [ ] 新增 `replayTask(taskId)` — 回放录制任务
- [ ] 在 `src/shared/browser/browser-contract.ts` 新增 `BrowserToolRequest`, `ActionPlan`, `ActionStep`, `WebTaskRecording` 类型
- [ ] 修改 `src/main/browser/browser-audit.ts`，增强审计记录含 sourceProfile（FR-WO-001）
- [ ] 新增 `src/main/browser/browser-security.ts`，域名白名单校验逻辑（占位，Phase 6B 完整实现）

**涉及文件**: `src/main/web-operator-profile-bridge.ts`, `src/shared/browser/browser-contract.ts`, `src/main/browser/browser-audit.ts`, `src/main/browser/browser-security.ts`  
**依赖**: T6.1  
**复杂度**: L  
**验收标准**: 操作计划预览 → 确认后执行; 敏感操作 → 暂停确认; 回放按步骤执行; 审计含 sourceProfile

---

#### T6.3 实现 Web Operator Renderer UI

- [ ] 新建 `src/renderer/src/screens/WebOperator/ActionPlanPreview.tsx` — 操作计划预览对话框
- [ ] 新建 `src/renderer/src/screens/WebOperator/SensitiveActionDialog.tsx` — 敏感操作确认对话框
- [ ] 新建 `src/renderer/src/screens/WebOperator/WebTaskReplay.tsx` — Web 任务回放组件
- [ ] 新建 `src/renderer/src/screens/WebOperator/DomHistoryPanel.tsx` — DOM/截图历史浏览面板
- [ ] 新增 browser IPC 通道: `browser:createActionPlan`, `browser:executePlan`, `browser:replayTask`, `browser:getDomHistory`
- [ ] 在 Preload 新增对应 API 方法

**涉及文件**: `src/renderer/src/screens/WebOperator/ActionPlanPreview.tsx`, `src/renderer/src/screens/WebOperator/SensitiveActionDialog.tsx`, `src/renderer/src/screens/WebOperator/WebTaskReplay.tsx`, `src/renderer/src/screens/WebOperator/DomHistoryPanel.tsx`, `src/preload/profile-runtime-api.ts`, `src/main/profile-runtime-ipc.ts`  
**依赖**: T6.2  
**复杂度**: L  
**验收标准**: UI 可预览操作计划; 敏感操作弹出确认; 可回放历史任务; 可浏览 DOM/截图历史

---

### 6B: Security & Policy Engine

#### T6.4 实现 PolicyEngine：统一策略评估引擎

- [ ] 新建 `src/main/policy-engine.ts`，实现 `PolicyEngine` 类
- [ ] 实现 `evaluate(profileId, policyType, action)` → 返回 `PolicyDecision` (allow/deny/confirm_required)
- [ ] 实现 `isDomainAllowed(profileId, domain)` — 域名白名单校验（FR-SEC-009 / FR-SEC-002）
- [ ] 实现 `isToolAllowed(profileId, toolName)` — 工具白名单校验（FR-SEC-010 / FR-SEC-003）
- [ ] 实现 `isSkillInstallAllowed(profileId, skillSource)` — 技能安装策略（FR-SEC-011 / FR-SEC-004）
- [ ] 实现 `isDelegationAllowed(profileId, targetProfileId)` — 委托白名单（FR-SEC-012 / FR-SEC-005）
- [ ] 实现 `isSensitiveAction(profileId, action)` — 敏感操作策略（FR-SEC-008 / FR-SEC-001）
- [ ] 实现 `getConfig` / `setConfig` — 策略配置 CRUD
- [ ] 策略冲突时 deny 优先；白名单未配置时默认允许所有

**涉及文件**: `src/main/policy-engine.ts`, `src/main/profile-runtime-db.ts`  
**依赖**: T4.3  
**复杂度**: L  
**验收标准**: 域名/工具/技能/委托白名单校验正确; 敏感操作确认拦截; deny 优先; 未配置默认允许

---

#### T6.5 实现 PolicyConfigPage UI

- [ ] 新建 `src/renderer/src/screens/ProfileRuntime/PolicyConfigPage.tsx` — 策略配置 UI
- [ ] 支持按 Profile 配置 5 种策略类型（domain_allowlist / tool_allowlist / skill_install / delegation_allowlist / sensitive_action）
- [ ] 白名单编辑（添加/删除条目）
- [ ] 策略启用/禁用开关
- [ ] 新增 policy IPC 通道: `policy:evaluate`, `policy:getConfig`, `policy:setConfig`
- [ ] 在 Preload 新增 policyApi

**涉及文件**: `src/renderer/src/screens/ProfileRuntime/PolicyConfigPage.tsx`, `src/preload/profile-runtime-api.ts`, `src/main/profile-runtime-ipc.ts`  
**依赖**: T6.4  
**复杂度**: M  
**验收标准**: UI 可配置 5 种策略; 白名单可编辑; 策略评估结果正确

---

### 6C: Audit Query UI

#### T6.6 实现 AuditQueryPage：审计查询与导出

- [ ] 新建 `src/renderer/src/screens/AIOSWorkspace/AuditQueryPage.tsx` — 审计查询页面
- [ ] 筛选条件：时间范围 / profile_id / event_type / actor / result（FR-AUD-001）
- [ ] 分页表格 + 排序列 + 可展开详情行（FR-AUD-002）
- [ ] 导出为 CSV 或 JSON（FR-AUD-003）
- [ ] 修改 `src/main/profile-runtime-db.ts`，新增 `queryAuditEvents(filter)` — 支持筛选 + 分页 + 排序
- [ ] 新增 `exportAuditEvents(filter, format)` — 导出文件
- [ ] 在 `src/shared/profile-runtime/profile-runtime-contract.ts` 扩展 `AuditEventFilter` 增加 timeRange/actor/result/sortBy/sortOrder; 新增 `AuditQueryResult`
- [ ] 新增 audit IPC 通道 + Preload 方法

**涉及文件**: `src/renderer/src/screens/AIOSWorkspace/AuditQueryPage.tsx`, `src/main/profile-runtime-db.ts`, `src/shared/profile-runtime/profile-runtime-contract.ts`, `src/preload/profile-runtime-api.ts`, `src/main/profile-runtime-ipc.ts`  
**依赖**: T4.3  
**复杂度**: L  
**验收标准**: 查询支持 5 种筛选 + 分页 + 排序; 展开行查看详情; 导出 CSV/JSON 正确

---

### 6D: Observability

#### T6.7 实现 ObservabilityPage：7 面板可观测性页面

- [ ] 新建 `src/renderer/src/screens/ProfileRuntime/ObservabilityPage.tsx` — 可观测性页面容器
- [ ] 新建 `panels/GatewayLogsPanel.tsx` — Gateway 日志面板（实时 tail + level 过滤 + 搜索）（FR-OBS-006）
- [ ] 新建 `panels/RuntimeEventsPanel.tsx` — Runtime 事件时间线（start/stop/crash/restart/health_change）（FR-OBS-007）
- [ ] 新建 `panels/DelegationTimelinePanel.tsx` — 委托时间线（状态标记 + 展开详情）（FR-OBS-008）
- [ ] 新建 `panels/WebOperatorAuditPanel.tsx` — Web Operator 审计面板
- [ ] 新建 `panels/SkillSyncHistoryPanel.tsx` — 技能同步历史面板
- [ ] 新建 `panels/ContextShareHistoryPanel.tsx` — 上下文共享历史面板
- [ ] 新建 `panels/DiagnosticsPanel.tsx` — 诊断面板（CPU/内存/磁盘/进程/DB 统计）（FR-OBS-009）
- [ ] 在 Main Process 新增 `getDiagnostics`, `getRuntimeEvents`, `getSkillSyncHistory`, `getContextShareHistory` IPC handler
- [ ] 在 Preload 新增 observabilityApi

**涉及文件**: `src/renderer/src/screens/ProfileRuntime/ObservabilityPage.tsx`, `src/renderer/src/screens/ProfileRuntime/panels/*.tsx`, `src/main/profile-runtime-ipc.ts`, `src/preload/profile-runtime-api.ts`  
**依赖**: T1.6, T4.5, T5.5  
**复杂度**: XL  
**验收标准**: Observability 页面显示 7 个面板; Gateway 日志实时; 事件时间线正确; 诊断面板显示资源使用

---

### 6E: Windows Deployment

#### T6.8 实现 DeployManager：一键部署编排

- [ ] 新建 `src/main/deploy-manager.ts`，实现 `DeployManager` 类
- [ ] 实现 `checkDependencies()` — 检测 Python/Node.js/Git 等环境依赖（FR-DEP-002）
- [ ] 实现 `downloadFromGit(repoUrl, auth)` — 从私有 Git 仓库下载（FR-DEP-001）
- [ ] 实现 `install(installDir)` — 安装到指定目录（FR-DEP-003）
- [ ] 实现 `oneClickDeploy(config)` — 编排: 依赖检测→下载→安装→配置→启动（FR-DEP-004）
- [ ] 实现 `checkForUpdates(repoUrl)` — 检查新版本（FR-DEP-005）
- [ ] 实现 `getInstallLog()` — 安装日志历史（FR-DEP-007）
- [ ] 新增 deploy IPC 通道 + Preload deployApi

**涉及文件**: `src/main/deploy-manager.ts`, `src/preload/profile-runtime-api.ts`, `src/main/profile-runtime-ipc.ts`  
**依赖**: T2.3  
**复杂度**: L  
**验收标准**: 依赖检测列出已安装/缺失; 一键部署编排执行; Git 下载成功; 版本检查可用; 安装日志可查

---

#### T6.9 实现 DeployWizard UI 与 InstallLogViewer

- [ ] 新建 `src/renderer/src/screens/AIOSWorkspace/DeployWizard.tsx` — 部署向导 UI
- [ ] 分步显示: 依赖检测 → 下载 → 安装 → 配置 → 启动，每步显示状态与进度
- [ ] 新建 `src/renderer/src/screens/AIOSWorkspace/InstallLogViewer.tsx` — 安装日志查看器
- [ ] 支持配置 Git 仓库地址/凭据/安装路径
- [ ] 部署失败时显示错误与重试

**涉及文件**: `src/renderer/src/screens/AIOSWorkspace/DeployWizard.tsx`, `src/renderer/src/screens/AIOSWorkspace/InstallLogViewer.tsx`  
**依赖**: T6.8  
**复杂度**: M  
**验收标准**: 向导分步显示部署进度; 日志查看器显示历史; 失败时可重试

---

### T6.10 Phase 6 集成测试

- [ ] 编写 BrowserActionRecorder 录制/回放测试
- [ ] 编写 PolicyEngine 策略评估测试（5 种策略类型 + 冲突优先级）
- [ ] 编写 AuditQueryPage 筛选/分页/导出测试
- [ ] 编写 Observability 各面板数据获取测试
- [ ] 编写 DeployManager 依赖检测/下载/安装测试
- [ ] 验证 FR-WO-001~008, FR-SEC-007~013, FR-AUD-001~003, FR-OBS-005~009, FR-DEP-001~007 所有验收条件

**涉及文件**: `tests/`  
**依赖**: T6.9  
**复杂度**: L  
**验收标准**: 全部测试通过，覆盖 Phase 6 所有需求验收条件

---

## 任务依赖关系（DAG）

```
T1.1 ─→ T1.3 ─→ T1.4 ─→ T1.5 ─→ T1.6 ─→ T1.7
T1.2 ─→ T1.4
T1.2 ─→ T1.6

T1.1 ─→ T2.1 ─→ T2.2 ─→ T2.3 ─→ T2.4 ─→ T2.6 ─→ T2.7
T2.2 ─→ T2.5 ─→ T2.6

T2.2 ─→ T3.1 ─→ T3.2 ─→ T3.3 ─→ T3.4 ─→ T3.6 ─→ T3.7
T3.3 ─→ T3.5 ─→ T3.6

T2.2 ─→ T4.1 ─→ T4.2 ─→ T4.3 ─→ T4.4 ─→ T4.5 ─→ T4.6

T2.2 ─→ T5.1 ─→ T5.2 ─→ T5.4 ─→ T5.5 ─→ T5.6
T5.1 ─→ T5.3 ─→ T5.4

T1.4 ─→ T6.1 ─→ T6.2 ─→ T6.3
T4.3 ─→ T6.4 ─→ T6.5
T4.3 ─→ T6.6
T1.6 ─→ T6.7
T4.5 ─→ T6.7
T5.5 ─→ T6.7
T2.3 ─→ T6.8 ─→ T6.9 ─→ T6.10
T6.3 ─→ T6.10
T6.5 ─→ T6.10
T6.6 ─→ T6.10
T6.7 ─→ T6.10
```

---

## 任务汇总

| Phase | 任务数 | 复杂度分布 | 核心需求覆盖 |
|-------|--------|-----------|-------------|
| Phase 1: Runtime 稳定性 | 7 | S×1, M×4, L×1, (T1.7=M) | FR-RT-001~008 |
| Phase 2: SQLite Governance | 7 | S×0, M×4, L×2, (T2.7=M) | FR-DB-001~008 |
| Phase 3: Profile Entry UX | 7 | S×2, M×3, L×1, (T3.7=S) | FR-UX-001~008 |
| Phase 4: Delegation Orchestration | 6 | S×2, M×2, L×1, XL×1 | FR-DLG-001~009 |
| Phase 5: Skill/Context Governance | 6 | S×1, M×3, L×2 | FR-SK-001~005, FR-CTX-001~006 |
| Phase 6: 深度集成 | 10 | M×3, L×5, XL×1, (T6.10=L) | FR-WO-001~008, FR-SEC-007~013, FR-AUD-001~003, FR-OBS-005~009, FR-DEP-001~007 |
| **合计** | **43** | **S×6, M×17, L×11, XL×1** | **43 项需求全覆盖** |
