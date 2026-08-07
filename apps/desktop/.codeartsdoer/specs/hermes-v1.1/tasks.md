# Profile Runtime V1.1 — 编码任务规划

**基线版本**: V1.0 → V1.1  
**需求规格**: `.codeartsdoer/specs/profile-runtime/spec.md` v2.0  
**技术设计**: `.codeartsdoer/specs/profile-runtime/design.md` v2.0  

---

## 1. Phase 1: SQLite Runtime DB

> 核心交付：profile-runtime.db 建表 + 迁移机制  
> 依赖：无（项目已有 better-sqlite3）  
> 预估复杂度：中 | 优先级：P0（基础层，所有后续 Phase 依赖）

- [ ] 创建 `src/main/profile-runtime-db.ts`，实现 ProfileRuntimeDB 类
  - 使用 better-sqlite3 创建 `~/.hermes/desktop/profile-runtime.db`
  - 启用 WAL 模式：`db.pragma('journal_mode = WAL')`
  - 设置 busy_timeout：`db.pragma('busy_timeout = 5000')`
- [ ] 实现 9 张表 DDL 创建：profiles、runtime_instances、profile_entries、profile_capabilities、profile_skills、skill_sync_events、shared_contexts、delegation_events、audit_events
  - 严格遵循 design.md §4.2 DDL 定义（字段类型、约束、CHECK、索引）
  - 创建 schema_version 表管理迁移版本
- [ ] 创建所有必要索引：idx_profiles_name、idx_profiles_enabled、idx_profiles_auto_start、idx_runtime_status、idx_runtime_port、idx_profile_entries_nav、idx_capabilities_profile、idx_skills_profile、idx_skills_category、idx_skill_sync_source、idx_skill_sync_target、idx_shared_ctx_source、idx_shared_ctx_target、idx_delegation_source、idx_delegation_target、idx_audit_profile、idx_audit_operation、idx_audit_timestamp
- [ ] 实现迁移机制：`runMigrations()` — 版本管理 + 幂等执行 + 事务保护
  - schema_version 表记录已应用版本
  - 已应用版本自动跳过
  - 单个迁移在事务内执行，失败自动回滚
- [ ] 实现 Profile CRUD：insertProfile、getProfile、listProfiles、deleteProfile
- [ ] 实现 Runtime Instance CRUD：getRuntimeInstance、updateRuntimeStatus
- [ ] 实现 Profile Entry CRUD：getProfileEntry、listProfileEntries、updateProfileEntryLayout
- [ ] 实现 Capability CRUD：insertCapability、getCapabilities
- [ ] 实现 Skill CRUD：insertSkill、listSkills
- [ ] 实现 Event 写入：insertSkillSyncEvent、insertSharedContext、insertDelegationEvent、insertAuditEvent
- [ ] 实现 Event 查询：listAuditEvents、listDelegationEvents、listSkillSyncEvents、listSharedContexts
- [ ] 实现事务支持：`transaction<T>(fn)` 方法
- [ ] 实现 `close()` 方法，关闭 SQLite 连接
- [ ] 编写单元测试 `tests/profile-runtime-db.test.ts`
  - 验证：建表成功、WAL 模式、迁移幂等、CRUD 正确性、事务回滚

**验收标准**：profile-runtime.db 可初始化，9 张表 + 索引创建正确，迁移幂等，CRUD 操作通过，WAL 模式生效  
**涉及文件**：`src/main/profile-runtime-db.ts`（新增）、`tests/profile-runtime-db.test.ts`（新增）  
**V1.0 集成点**：复用 better-sqlite3（sessions.ts 已引入），不影响现有 state.db

---

## 2. Phase 2: Config Importer

> 核心交付：YAML 解析 + 校验 + 目录创建 + DB 写入  
> 依赖：Phase 1（ProfileRuntimeDB）  
> 预估复杂度：高 | 优先级：P0（导入是功能入口）

- [ ] 安装 YAML 解析依赖：`yaml` 或 `js-yaml`（需确认选型）
- [ ] 创建 `src/main/config-importer.ts`，实现 ConfigImporter 类
- [ ] 实现 `parseYaml(content)` — YAML 格式解析，支持 profile-runtime.yaml v1 格式
  - 解析 version 字段、profiles 数组
  - 每个 Profile 定义：name、display_name、role、runtime_type、port、auto_start、soul_prompt、capabilities、skills
- [ ] 实现 `validateConfig(config)` — 校验链
  - YAML 格式校验（version、profiles 字段存在性）
  - 名称合法性校验（kebab-case，2-32 字符，仅小写字母/数字/连字符）
  - 名称唯一性校验 `checkNameUniqueness()`
  - 端口唯一性校验 `checkPortUniqueness()`（与 DB 已有 Profile 端口比对）
  - 端口范围校验（1024-65535）
  - Adapter 可用性校验 `checkAdapterAvailability()`（runtime_type 在 PluginRegistry 中存在）
- [ ] 实现 `createProfileDirectories(profile)` — 通过 profileHome(name) 创建 Profile 目录结构
  - 创建 `~/.hermes/profiles/{name}/` 目录
  - 创建子目录：config.yaml、.env、SOUL.md、state.db（占位）、skills/、memories/、desktop/、shared-context/
- [ ] 实现 `writeProfileToDB(profile, tx)` — 在事务内写入
  - 写入 profiles 表
  - 写入 runtime_instances 表（初始状态 not_deployed）
  - 写入 profile_capabilities 表
  - 写入 profile_skills 表
  - 写入 profile_entries 表（根据 role 生成 route_path、screen_type、nav_group）
- [ ] 实现 `importConfig(yamlContent, options?)` — 编排方法
  - parse → validate → 事务(目录创建 + DB 写入 + 审计写入) → 返回 ImportResult
- [ ] 实现 `rollback(createdDirs, profileNames)` — 事务回滚
  - 删除已创建的目录
  - 回滚 DB 事务（由 SQLite transaction 保障）
- [ ] 实现错误码：PROFILE_ALREADY_EXISTS、PROFILE_INVALID_NAME、PROFILE_CONFIG_INVALID、PROFILE_PORT_CONFLICT、PROFILE_ADAPTER_NOT_FOUND
- [ ] 编写单元测试 `tests/config-importer.test.ts`
  - 验证：YAML 解析、名称/端口冲突检测、目录创建、DB 写入一致性、事务回滚

**验收标准**：profile-runtime.yaml 可导入，校验链完整，目录结构正确，DB 记录完整，部分失败时事务回滚  
**涉及文件**：`src/main/config-importer.ts`（新增）、`tests/config-importer.test.ts`（新增）  
**V1.0 集成点**：profileHome() 复用现有 `~/.hermes/` 目录逻辑，default Profile 目录指向 `~/.hermes/`

---

## 3. Phase 3: Runtime Adapter + Gateway Supervisor

> 核心交付：HermesLocalRuntimeAdapter + 健康检查 + 进程监管 + ProfileRuntimeManager  
> 依赖：Phase 1（ProfileRuntimeDB）  
> 预估复杂度：高 | 优先级：P0（核心运行时）

- [ ] 创建 `src/main/runtime-adapter.ts`，定义 RuntimeAdapter 接口
  - type、validate、deploy、start、stop、restart、health、sendMessage 方法签名
  - SendMessageOptions、ChatHandle、ValidationResult、DeployResult、StartResult、StopResult、HealthResult 类型
- [ ] 创建 `src/main/capability-plugin.ts`，定义 CapabilityPlugin 接口
  - name、initialize?(db) 方法签名
- [ ] 创建 `src/main/plugin-registry.ts`，实现 PluginRegistry 类
  - registerAdapter / registerCapability / getAdapter / getCapability / listAdapterTypes / listCapabilityNames
- [ ] 创建 `src/main/hermes-local-adapter.ts`，实现 HermesLocalRuntimeAdapter
  - 复用 `src/main/hermes.ts` 的 spawn/kill/health 逻辑
  - **关键修改**：端口从硬编码 8642 变为参数化 `port`
  - **关键修改**：profileHome 从默认路径变为参数化 `profileHome`
  - `validate(config)` — 校验 hermes-local 所需配置
  - `deploy(profileHome, config)` — 确保 Gateway 二进制存在
  - `start(profileHome, port, config)` — spawn Gateway 进程 + 等待 /health 200
  - `stop(profileId)` — kill 进程 + PID 文件清理
  - `restart(profileId)` — stop + start
  - `health(port)` — GET http://127.0.0.1:{port}/health，1500ms 超时
  - `sendMessage(profileId, message, options)` — POST /v1/chat/completions，复用 SSE 解析
- [ ] 修改 `src/main/hermes.ts` — 端口参数化改造
  - `startGateway(profile?, port?)` 支持传入端口和 profileHome
  - `getApiUrl()` 扩展支持按 profile/port 获取 API URL
  - 保持向后兼容：无参数时使用原默认行为（port=8642）
- [ ] 创建 `src/main/gateway-supervisor.ts`，实现 GatewaySupervisorCapability
  - `startSupervision(profileId, port)` — 每 15 秒检测 /health
  - `onHealthFailure(profileId, consecutiveFailures)` — 连续 3 次失败（间隔 2 秒）标记 failed
  - `startAllSupervision()` / `stopAllSupervision()`
- [ ] 创建 `src/main/profile-runtime-manager.ts`，实现 ProfileRuntimeManager 类
  - 构造函数：初始化 DB、Registry、Supervisor
  - `startProfile(profileId)` — 状态流转 stopped→starting→running，调用 Adapter.start()，启动 Supervisor
  - `stopProfile(profileId)` — 状态流转 running→stopping→stopped，调用 Adapter.stop()，停止 Supervisor
  - `restartProfile(profileId)` — stop + start
  - `startAll()` — 按序启动所有 enabled 且 stopped 的 Profile
  - `stopAll()` — 按序停止所有 running 的 Profile
  - `listProfiles()` / `getProfile()` / `getRuntimeStatus()`
  - `onBeforeQuit()` — App 退出前停止所有 Profile + 关闭 DB
  - 状态流转保护：仅允许合法路径（stopped→starting→running、running→stopping→stopped、*→failed）
  - 每次操作后写入 audit_events
- [ ] 注册 hermes-local Adapter 到 PluginRegistry
- [ ] 编写单元测试 `tests/hermes-local-adapter.test.ts`、`tests/plugin-registry.test.ts`
  - 验证：Adapter 接口实现、validate/start/stop/health、PluginRegistry 注册查询

**验收标准**：Profile 可启动/停止/重启，状态流转正确，7 个 Profile 可同时运行，健康检查工作，App 退出时正确清理  
**涉及文件**：`src/main/runtime-adapter.ts`（新增）、`src/main/capability-plugin.ts`（新增）、`src/main/plugin-registry.ts`（新增）、`src/main/hermes-local-adapter.ts`（新增）、`src/main/gateway-supervisor.ts`（新增）、`src/main/profile-runtime-manager.ts`（新增）、`src/main/hermes.ts`（修改，端口参数化）、`tests/hermes-local-adapter.test.ts`（新增）、`tests/plugin-registry.test.ts`（新增）  
**V1.0 集成点**：hermes.ts 端口参数化需保持向后兼容，默认行为不变；App before-quit 扩展

---

## 4. Phase 4: IPC + Preload

> 核心交付：window.profileRuntime + window.profileEntry + 类型定义  
> 依赖：Phase 2（ConfigImporter）、Phase 3（ProfileRuntimeManager）  
> 预估复杂度：中 | 优先级：P0（Renderer 通信基础）

- [ ] 创建 `src/shared/profile-runtime-contract.ts`，完整 TypeScript 类型定义
  - RuntimeStatus、RuntimeType、ProfileRole、ShareMode、NavGroup、AuditActor、AuditResult 枚举
  - ProfileListItem、ProfileDetail、RuntimeOperationResult 接口
  - ImportOptions、ImportResult、ImportError 接口
  - DelegationOptions、DelegationResult 接口
  - SkillSyncOptions、SkillSyncResult、ProfileSkillInfo 接口
  - ShareResult、SharedContextInfo 接口
  - ProfileEntryInfo、ProfileEntryScreenConfig 接口
  - AuditEventInfo、ProfileCapabilityInfo 接口
  - ProfileErrorCode 联合类型（18 个错误码）
  - ProfileErrorResult 接口
- [ ] 创建 `src/main/profile-runtime-ipc.ts`，注册所有 `profile-runtime:*` IPC handler
  - profile-runtime:importConfig → ConfigImporter.importConfig()
  - profile-runtime:listProfiles → Manager.listProfiles()
  - profile-runtime:getProfile → Manager.getProfile()
  - profile-runtime:startProfile → Manager.startProfile()
  - profile-runtime:stopProfile → Manager.stopProfile()
  - profile-runtime:restartProfile → Manager.restartProfile()
  - profile-runtime:startAll → Manager.startAll()
  - profile-runtime:stopAll → Manager.stopAll()
  - profile-runtime:getRuntimeStatus → Manager.getRuntimeStatus()
  - profile-runtime:delegate → DelegationCapability.invoke()（Phase 6 实现，先占位）
  - profile-runtime:listProfileSkills → DB.listSkills()
  - profile-runtime:copySkill → SkillSyncCapability.copySkill()（Phase 7 实现，先占位）
  - profile-runtime:listProfileSessions → 查询会话
  - profile-runtime:shareSessionContext → SessionShareCapability（Phase 8 实现，先占位）
  - profile-runtime:listSharedContexts → DB.listSharedContexts()
  - profile-runtime:deleteSharedContext → 删除共享上下文
  - profile-runtime:listAuditEvents → DB.listAuditEvents()
  - profile-runtime:listProfileEntries → ProfileEntryRouter（Phase 5 实现，先占位）
  - profile-runtime:getProfileEntry → ProfileEntryRouter
  - profile-runtime:openProfileEntry → ProfileEntryRouter
  - profile-runtime:getProfilePageLayout → ProfileEntryRouter
  - profile-runtime:updateProfilePageLayout → ProfileEntryRouter
- [ ] 创建 `src/preload/profile-runtime-api.ts`，封装 window.profileRuntime Preload API
  - 所有方法通过 ipcRenderer.invoke('profile-runtime:*') 调用
  - 不暴露 Node.js / SQLite / FS 直接访问
- [ ] 创建 `src/preload/profile-entry-api.ts`，封装 window.profileEntry Preload API
  - 所有方法通过 ipcRenderer.invoke('profile-runtime:*') 调用
- [ ] 修改 `src/preload/index.ts`
  - 新增 contextBridge.exposeInMainWorld('profileRuntime', profileRuntimeApi)
  - 新增 contextBridge.exposeInMainWorld('profileEntry', profileEntryApi)
- [ ] 修改 `src/preload/index.d.ts`
  - 扩展 Window 接口：profileRuntime 和 profileEntry 类型声明
- [ ] 修改 `src/main/index.ts`
  - 在 setupIPC() 中调用 setupProfileRuntimeIPC()
  - 在 app.on('before-quit') 中调用 ProfileRuntimeManager.onBeforeQuit()
- [ ] 实现 IPC 推送事件（Main → Renderer）
  - profile-runtime:status_changed：Profile 状态变更通知
  - profile-runtime:delegation_chunk：委托调用 SSE 流式块（Phase 6）
  - profile-runtime:delegation_done：委托调用完成
  - profile-runtime:delegation_error：委托调用错误
- [ ] 添加 i18n 翻译模块 `src/shared/i18n/locales/{en,zh-CN,es,pt-BR}/profile-runtime.ts`
  - Profile Runtime 相关的 UI 文案

**验收标准**：Renderer 可通过 window.profileRuntime / window.profileEntry 调用所有 IPC 方法，类型检查通过，Preload 不暴露 Node.js/SQLite/FS  
**涉及文件**：`src/shared/profile-runtime-contract.ts`（新增）、`src/main/profile-runtime-ipc.ts`（新增）、`src/preload/profile-runtime-api.ts`（新增）、`src/preload/profile-entry-api.ts`（新增）、`src/preload/index.ts`（修改）、`src/preload/index.d.ts`（修改）、`src/main/index.ts`（修改）、`src/shared/i18n/locales/*/profile-runtime.ts`（新增×4）  
**V1.0 集成点**：不修改现有 window.hermesAPI，IPC 命名空间隔离（profile-runtime: 前缀）

---

## 5. Phase 5: Profile Entry Router + UI Shell

> 核心交付：AIOSWorkspaceScreen + ProfileWorkspaceScreen + 导航分组  
> 依赖：Phase 4（IPC + Preload）  
> 预估复杂度：高 | 优先级：P1（UI 入口）

- [ ] 创建 `src/main/profile-entry-router.ts`，实现 ProfileEntryRouter 类
  - `listProfileEntries()` — 从 DB 查询 profile_entries
  - `getProfileEntry(profileId)` — 查询单个 Entry
  - `openProfileEntry(profileId)` — 返回 ProfileEntryScreenConfig
  - `resolveScreenType(profileId)` — default → AIOSWorkspaceScreen，其他 → ProfileWorkspaceScreen
  - `checkRouteConflict(routePath)` — 检查路由唯一性
  - `getProfilePageLayout()` / `updateProfilePageLayout()` — 布局持久化
- [ ] 创建 `src/renderer/screens/ProfileRuntime/ProfileRuntimeScreen.tsx`
  - Profile Runtime 管理面板主页面
  - 包含：Profile 列表、运行状态、启停控制、配置导入入口
- [ ] 创建 `src/renderer/components/profile-runtime/ProfileListPanel.tsx`
  - 显示所有 Profile 列表及运行状态
  - 启停/重启按钮
  - startAll / stopAll 批量操作
- [ ] 创建 `src/renderer/components/profile-runtime/RuntimeStatusPanel.tsx`
  - 显示各 Profile 运行状态（not_deployed/stopped/starting/running/stopping/failed）
  - 状态变更实时更新（监听 profile-runtime:status_changed 事件）
- [ ] 创建 `src/renderer/components/profile-runtime/ConfigImportPanel.tsx`
  - 选择 profile-runtime.yaml 文件导入
  - 显示导入结果（成功/失败/冲突详情）
- [ ] 创建 `src/renderer/screens/AIOSWorkspace/AIOSWorkspaceScreen.tsx`
  - default Profile 主控工作台
  - 布局：主控对话 + 多 Profile 状态概览 + 委派入口 + Web Operator 入口 + 结果汇总
- [ ] 创建 `src/renderer/screens/ProfileWorkspace/ProfileWorkspaceScreen.tsx`
  - specialist Profile 独立工作台
  - 布局：独立 chat + skills 面板 + context 面板 + audit 面板
- [ ] 创建 `src/renderer/components/profile-runtime/CapabilityPanel.tsx`
  - 显示 Profile 能力配置（delegation/skill-sync/session-share/gateway-supervisor 启用状态）
- [ ] 创建 `src/renderer/components/profile-runtime/AuditPanel.tsx`
  - 显示审计事件列表（时间线视图）
- [ ] 修改 Layout 侧边栏导航分组
  - 新增导航分组：AI-OS（default 主控）、Experts（specialist 列表）、Runtime（管理面板）、Operator（Web Operator）
  - 从 profile_entries 表动态读取 specialist Profile 列表生成 Experts 菜单项
  - 不修改原 14 视图结构
- [ ] 实现路由注册
  - /profile-runtime → ProfileRuntimeScreen
  - /aios-workspace → AIOSWorkspaceScreen
  - /profile-workspace/:profileId → ProfileWorkspaceScreen
  - 从 profile_entries 动态生成路由
- [ ] 编写单元测试 `tests/profile-entry-router.test.ts`
  - 验证：路由冲突检测、screenType 映射、布局持久化

**验收标准**：用户可通过侧边栏导航到各 Profile 独立页面，Runtime 管理面板可启停 Profile，导航分组正确，路由无冲突  
**涉及文件**：`src/main/profile-entry-router.ts`（新增）、`src/renderer/screens/ProfileRuntime/ProfileRuntimeScreen.tsx`（新增）、`src/renderer/screens/AIOSWorkspace/AIOSWorkspaceScreen.tsx`（新增）、`src/renderer/screens/ProfileWorkspace/ProfileWorkspaceScreen.tsx`（新增）、`src/renderer/components/profile-runtime/`（新增目录及组件）、Layout 侧边栏（修改）、`tests/profile-entry-router.test.ts`（新增）  
**V1.0 集成点**：不修改原 Layout 14 视图结构，新增导航分组挂载

---

## 6. Phase 6: Delegation Capability

> 核心交付：委托调用 + stream + context refs + 审计  
> 依赖：Phase 3（ProfileRuntimeManager）、Phase 4（IPC）  
> 预估复杂度：高 | 优先级：P1（跨 Profile 核心能力）

- [ ] 创建 `src/main/delegation-capability.ts`，实现 DelegationCapability 类
  - implements CapabilityPlugin
  - 构造函数注入 ProfileRuntimeDB
- [ ] 实现 `invoke(sourceProfileId, targetProfileId, message, options?)` 方法
  - 检查目标 Profile 运行状态（必须为 running）
  - 解析 context refs（读取目标 Profile shared-context/ 目录）
  - 组装请求消息（注入 context refs 内容）
  - POST http://127.0.0.1:{targetPort}/v1/chat/completions
  - 记录 delegation_events（source、target、request_summary、response_summary、context_refs、status）
  - 记录 audit_events
- [ ] 实现 Stream 模式
  - POST 请求携带 stream: true
  - 解析 SSE 流，通过 IPC 推送 profile-runtime:delegation_chunk 事件给 Renderer
  - 流结束后推送 profile-runtime:delegation_done
  - 流错误推送 profile-runtime:delegation_error
- [ ] 实现 context refs 解析 `resolveContextRefs(contextRefs)`
  - 读取目标 Profile 的 shared-context/ 目录中对应的 context.md 文件
  - 无效引用跳过（记录 warning），不阻断委托调用
- [ ] 实现请求超时：默认 30000ms，可配置
- [ ] 实现错误处理
  - 目标未运行 → PROFILE_RUNTIME_NOT_DEPLOYED
  - 请求失败 → PROFILE_DELEGATION_FAILED
  - Profile 不存在 → PROFILE_NOT_FOUND
- [ ] 注册 DelegationCapability 到 PluginRegistry
- [ ] 补全 Phase 4 的 IPC 占位实现：profile-runtime:delegate → DelegationCapability.invoke()
- [ ] 创建 `src/renderer/components/profile-runtime/DelegationPanel.tsx`
  - 委托调用 UI：选择目标 Profile、输入消息、选择 context refs
  - 显示委托结果（流式/非流式）
  - 委托历史列表
- [ ] 编写单元测试 `tests/delegation-capability.test.ts`
  - 验证：目标状态检查、context refs 解析、SSE 流式转发、超时处理、事件记录

**验收标准**：default Profile 可向 specialist Profile 发起委托调用，支持 stream 模式，context refs 注入正确，委托事件和审计记录完整  
**涉及文件**：`src/main/delegation-capability.ts`（新增）、`src/renderer/components/profile-runtime/DelegationPanel.tsx`（新增）、`src/main/profile-runtime-ipc.ts`（修改，补全 delegate handler）、`tests/delegation-capability.test.ts`（新增）  
**V1.0 集成点**：复用现有 SSE 解析逻辑（hermes.ts），URL 从 LOCAL_API_URL 变为 http://127.0.0.1:{port}

---

## 7. Phase 7: Skill Sync

> 核心交付：技能复制 + 冲突策略 + 校验和 + 审计  
> 依赖：Phase 3（ProfileRuntimeManager）、Phase 4（IPC）  
> 预估复杂度：中 | 优先级：P1（跨 Profile 能力）

- [ ] 创建 `src/main/skill-sync-capability.ts`，实现 SkillSyncCapability 类
  - implements CapabilityPlugin
  - 构造函数注入 ProfileRuntimeDB
- [ ] 实现 `copySkill(sourceProfileId, targetProfileId, skillName, options?)` 方法
  - 解析源技能路径 `resolveSkillPath(sourceProfileId, skillName)`
  - 检查源技能存在性（不存在 → PROFILE_SKILL_NOT_FOUND）
  - 检查目标文件冲突
  - 冲突策略：overwrite=false → 跳过（action=skipped），overwrite=true → 备份后覆盖（action=overwritten）
  - 备份原文件：`{原文件名}.backup.{timestamp}`
  - 复制文件 `copyFile(source, target)`
  - 校验和验证 `verifyChecksum()` — SHA-256
  - 记录 skill_sync_events + audit_events
- [ ] 实现 `syncAllSkills(sourceProfileId, targetProfileId, options?)` 方法
  - 批量同步源 Profile 所有技能
  - 返回每个技能的 SkillSyncResult
- [ ] 实现 `calculateChecksum(filePath)` — 使用 crypto.createHash('sha256')
- [ ] 实现 `backupTarget(filePath)` — 备份文件命名规则
- [ ] 实现错误回滚：复制失败时删除不完整目标文件
- [ ] 注册 SkillSyncCapability 到 PluginRegistry
- [ ] 补全 Phase 4 的 IPC 占位实现：profile-runtime:copySkill → SkillSyncCapability.copySkill()
- [ ] 创建 `src/renderer/components/profile-runtime/SkillSyncPanel.tsx`
  - 技能同步 UI：选择源/目标 Profile、选择技能、设置 overwrite 策略
  - 显示同步结果（copied/skipped/overwritten/failed）
  - 同步历史列表
- [ ] 编写单元测试 `tests/skill-sync-capability.test.ts`
  - 验证：复制/冲突跳过/覆盖备份/校验和/回滚/事件记录

**验收标准**：技能可跨 Profile 复制，冲突策略正确（跳过/覆盖），SHA-256 校验和验证通过，备份恢复正确，同步事件和审计记录完整  
**涉及文件**：`src/main/skill-sync-capability.ts`（新增）、`src/renderer/components/profile-runtime/SkillSyncPanel.tsx`（新增）、`src/main/profile-runtime-ipc.ts`（修改，补全 copySkill handler）、`tests/skill-sync-capability.test.ts`（新增）  
**V1.0 集成点**：技能文件路径基于 profileHome(name)/skills/，复用现有目录结构

---

## 8. Phase 8: Session Context Share

> 核心交付：上下文导出 + 三种模式 + shared-context 目录  
> 依赖：Phase 3（ProfileRuntimeManager）、Phase 4（IPC）  
> 预估复杂度：中 | 优先级：P1（跨 Profile 能力）

- [ ] 创建 `src/main/session-share-capability.ts`，实现 SessionShareCapability 类
  - implements CapabilityPlugin
  - 构造函数注入 ProfileRuntimeDB
- [ ] 实现 `shareSessionContext(sourceProfileId, targetProfileId, sessionId, mode)` 方法
  - 读取源 Profile 会话数据 `readSessionData()`（通过 SQLite 读取源 Profile 的 state.db，不直接复制）
  - 生成 context.md `generateContextMd(data, mode)`
  - 写入目标 Profile shared-context/ 目录 `writeContextToTarget()`
  - 写入路径：`~/.hermes/profiles/{target}/shared-context/{source}-{sessionId}.md`
  - 记录 shared_contexts + audit_events
- [ ] 实现 snapshot 模式：完整快照，包含所有消息原文及元数据
- [ ] 实现 summary 模式：仅包含关键信息摘要（用户意图 + assistant 结论）
- [ ] 实现 full 模式：完整消息历史，包含所有 role/content/timestamp
- [ ] 实现 `listSharedContexts(profileId)` — 查询共享上下文列表
- [ ] 实现 `deleteSharedContext(contextId)` — 删除共享上下文文件及 DB 记录
- [ ] 实现错误处理
  - 源会话不存在 → PROFILE_CONTEXT_SOURCE_SESSION_NOT_FOUND
  - 目标目录不可写 → PROFILE_CONTEXT_SHARE_FAILED
  - 上下文生成失败 → 不写入不完整文件
- [ ] 注册 SessionShareCapability 到 PluginRegistry
- [ ] 补全 Phase 4 的 IPC 占位实现：profile-runtime:shareSessionContext → SessionShareCapability.shareSessionContext()
- [ ] 创建 `src/renderer/components/profile-runtime/ContextSharePanel.tsx`
  - 上下文共享 UI：选择源 Profile、选择会话、选择目标 Profile、选择模式（snapshot/summary/full）
  - 显示共享结果和上下文预览
  - 共享上下文列表管理（查看/删除）
- [ ] 编写单元测试 `tests/session-share-capability.test.ts`
  - 验证：三种模式 context.md 格式、目录放置、禁止直接复制 state.db、事件记录

**验收标准**：会话上下文可跨 Profile 共享，三种模式（snapshot/summary/full）生成正确，context.md 格式正确，shared-context 目录管理正确，禁止直接复制 state.db  
**涉及文件**：`src/main/session-share-capability.ts`（新增）、`src/renderer/components/profile-runtime/ContextSharePanel.tsx`（新增）、`src/main/profile-runtime-ipc.ts`（修改，补全 shareSessionContext handler）、`tests/session-share-capability.test.ts`（新增）  
**V1.0 集成点**：读取源 Profile 的 state.db 使用 better-sqlite3 只读方式，不修改现有会话数据

---

## 9. Phase 9: Web Operator Profile-Aware

> 核心交付：profileId 溯源 + Tool Bridge 扩展 + 审计  
> 依赖：Phase 3（ProfileRuntimeManager）、Phase 4（IPC）  
> 预估复杂度：中 | 优先级：P2（增强现有模块）

- [ ] 创建 `src/main/web-operator-profile-bridge.ts`，实现 WebOperatorProfileBridge 类
  - 构造函数注入 ProfileRuntimeDB 和 allowedProfiles
- [ ] 实现 `executeAction(profileId, action, params)` 方法
  - 校验 profileId 权限 `checkProfileAllowed(profileId)`
  - 注入 sourceProfile 字段 `injectSourceProfile(params, profileId)`
  - 执行 BrowserController 操作
  - 写入审计 `writeAudit(profileId, action, url)`
- [ ] 实现敏感操作确认
  - 敏感操作类型：文件删除、表单提交、支付操作等
  - 通过 IPC 弹窗请求 Desktop UI 用户确认
  - 用户拒绝 → 取消操作，记录审计
- [ ] 实现 Profile 权限校验：profileId 必须在 allowedProfiles Set 中
  - 不在允许列表 → WEB_OPERATOR_PROFILE_NOT_ALLOWED
- [ ] 修改 `src/main/browser/browser-ipc.ts`
  - IPC handler 新增 profileId 参数
  - browser.open、browser.navigate、browser.click 等操作携带 profileId
- [ ] 修改 `src/main/browser/browser-tool-bridge.ts`
  - handleToolCall() 注入 sourceProfile 字段到工具调用请求
- [ ] 修改 `src/main/browser/browser-audit.ts`
  - log() 方法新增 profileId 字段
  - 审计记录写入 profile-runtime.db 的 audit_events
- [ ] 修改 `src/preload/` 相关 Browser API
  - browser API 新增 profileId 可选参数（向后兼容）
- [ ] 编写单元测试（覆盖权限校验、审计写入、敏感操作确认）

**验收标准**：Web Operator 操作携带 profileId 溯源，Tool Bridge 请求包含 sourceProfile，审计记录完整，敏感操作需用户确认，Profile 权限校验正确  
**涉及文件**：`src/main/web-operator-profile-bridge.ts`（新增）、`src/main/browser/browser-ipc.ts`（修改）、`src/main/browser/browser-tool-bridge.ts`（修改）、`src/main/browser/browser-audit.ts`（修改）、`src/preload/` browser API（修改）  
**V1.0 集成点**：browser IPC 参数向后兼容（profileId 可选，默认为 default），不破坏现有 Web Operator 功能

---

## 10. 集成验证与测试

> 核心交付：端到端集成验证 + V1.0 兼容性确认  
> 依赖：Phase 1-9 全部完成  
> 预估复杂度：中 | 优先级：P0（发布前必过）

- [ ] 集成测试：配置导入完整流程
  - YAML → DB + FS 一致性验证
  - 部分失败时事务回滚验证
- [ ] 集成测试：Profile 启停生命周期
  - 状态流转：stopped → starting → running → stopping → stopped
  - 异常流转：starting → failed（健康检查超时）
- [ ] 集成测试：7 Profile 同时运行
  - 端口隔离验证（8642-8648 无冲突）
  - 独立 Gateway 进程验证
  - 内存占用监控
- [ ] 集成测试：Delegation 跨 Profile 调用
  - SSE 流式转发验证
  - context refs 注入验证
  - 目标未运行错误处理
- [ ] 集成测试：Skill Sync 复制与校验
  - SHA-256 校验和一致性验证
  - 备份恢复验证
- [ ] 集成测试：Session Share 三种模式
  - context.md 格式验证
  - 目录放置验证
- [ ] 集成测试：Web Operator 溯源
  - audit_events 记录 profileId 验证
- [ ] 集成测试：App before-quit
  - 所有 Gateway 进程停止
  - SQLite 连接关闭
  - PID 文件清理
- [ ] V1.0 向后兼容验证
  - 不导入配置时，等价于 V1.0 单 Profile 模式
  - default Profile 无缝升级（原 ~/.hermes/ 作为 default profile home）
  - window.hermesAPI 完全保留，功能不受影响
  - hermes.ts 默认参数行为不变（port=8642）
  - Web Operator 不传 profileId 时默认行为不变
- [ ] E2E 测试路径 1：用户导入配置 → 查看 Profile 列表 → 启动 Profile → 发起委托调用
- [ ] E2E 测试路径 2：用户同步技能 → 查看同步结果 → 验证文件存在
- [ ] E2E 测试路径 3：用户共享上下文 → 目标 Profile 加载上下文 → 验证内容
- [ ] E2E 测试路径 4：用户导航 Experts → 打开 specialist Profile → 独立 chat

**验收标准**：所有集成测试通过，V1.0 向后兼容无回归，E2E 测试路径全部通过  
**涉及文件**：`tests/integration/`（新增集成测试）、`tests/e2e/`（新增 E2E 测试）

---

## 11. 文档与收尾

> 核心交付：文档同步 + 代码清理  
> 依赖：Phase 10 完成  
> 预估复杂度：低 | 优先级：P1

- [ ] 更新 `docs/ARCHITECTURE.md` — 新增 Profile Runtime 模块说明
- [ ] 更新 `docs/INDEX.md` — 新增 Profile Runtime 相关文件索引
- [ ] 新增 `docs/MODULES.md` Profile Runtime 章节 — 模块职责与边界说明
- [ ] 新增 `docs/API_CONTRACTS.md` Profile Runtime 章节 — IPC 契约文档
- [ ] 更新 i18n 翻译 — 确保所有 4 语言 Profile Runtime 文案完整
- [ ] 代码 lint + typecheck 通过
- [ ] 更新 `package.json` 依赖（yaml/js-yaml）

**验收标准**：文档与代码一致，lint/typecheck 无错误，4 语言翻译完整  
**涉及文件**：`docs/ARCHITECTURE.md`、`docs/INDEX.md`、`docs/MODULES.md`、`docs/API_CONTRACTS.md`、`package.json`

---

## 依赖拓扑与执行顺序

```
Phase 1 (SQLite DB)
  ↓
Phase 2 (Config Importer) ← 依赖 Phase 1
  ↓
Phase 3 (Runtime Adapter + Manager) ← 依赖 Phase 1
  ↓
Phase 4 (IPC + Preload) ← 依赖 Phase 2 + Phase 3
  ↓
Phase 5 (UI Shell) ← 依赖 Phase 4
  ↓
Phase 6 (Delegation) ← 依赖 Phase 3 + Phase 4  ─┐
Phase 7 (Skill Sync) ← 依赖 Phase 3 + Phase 4   ├─ 可并行
Phase 8 (Session Share) ← 依赖 Phase 3 + Phase 4 ─┘
  ↓
Phase 9 (Web Operator) ← 依赖 Phase 3 + Phase 4
  ↓
Phase 10 (集成验证) ← 依赖 Phase 1-9
  ↓
Phase 11 (文档收尾) ← 依赖 Phase 10
```

**可并行阶段**：Phase 6/7/8 互相无依赖，可并行开发  
**关键路径**：Phase 1 → Phase 3 → Phase 4 → Phase 5 → Phase 10 → Phase 11

---

## 复杂度与优先级汇总

| Phase | 名称 | 复杂度 | 优先级 | 预估工时 | 新增文件数 | 修改文件数 |
|-------|------|--------|--------|----------|-----------|-----------|
| 1 | SQLite Runtime DB | 中 | P0 | 6h | 2 | 0 |
| 2 | Config Importer | 高 | P0 | 8h | 2 | 0 |
| 3 | Runtime Adapter + Supervisor | 高 | P0 | 10h | 7 | 1 |
| 4 | IPC + Preload | 中 | P0 | 6h | 6 | 3 |
| 5 | UI Shell | 高 | P1 | 12h | 9 | 1 |
| 6 | Delegation | 高 | P1 | 8h | 3 | 1 |
| 7 | Skill Sync | 中 | P1 | 6h | 3 | 1 |
| 8 | Session Share | 中 | P1 | 6h | 3 | 1 |
| 9 | Web Operator | 中 | P2 | 6h | 1 | 4 |
| 10 | 集成验证 | 中 | P0 | 8h | 2 | 0 |
| 11 | 文档收尾 | 低 | P1 | 4h | 0 | 5 |
| **合计** | | | | **80h** | **38** | **17** |
