# Profile Runtime V1.1 — Multi Profile Runtime 技术设计

**文档版本**: v2.0  
**创建日期**: 2026-05-15  
**编写人**: 华为云码道（CodeArts）代码智能体  
**基线版本**: V1.0 → V1.1 扩展  
**需求基线**: `.codeartsdoer/specs/profile-runtime/spec.md` v2.0

---

# **1. 实现模型**

## **1.1 上下文视图**

### 系统定位

Profile Runtime 是 hermes-desktop 的核心运行时控制平面，位于 Electron Main Process 中，负责多 Profile 的声明式部署、生命周期管理、可插拔 Runtime Adapter 调度、跨 Profile 委托调用、技能同步、会话上下文共享与 Web Operator 溯源，实现本地多 Agent 并行运行的控制平面。

### 模块关系图

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Electron Main Process                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Profile Runtime Control Plane                   │   │
│  │                                                             │   │
│  │  ┌──────────────────┐    ┌──────────────────┐               │   │
│  │  │ ProfileRuntime   │    │ ConfigImporter   │               │   │
│  │  │ Manager          │───▶│ (YAML→DB+FS)     │               │   │
│  │  └────────┬─────────┘    └────────┬─────────┘               │   │
│  │           │                       │                         │   │
│  │  ┌────────┴───────────────────────┴─────────┐              │   │
│  │  │           PluginRegistry                 │              │   │
│  │  │  - RuntimeAdapters (hermes-local/...)    │              │   │
│  │  │  - CapabilityPlugins (delegation/...)    │              │   │
│  │  └────────┬────────────────────────────────┘              │   │
│  │           │                                                │   │
│  │  ┌────────┴──────────────────────────────────────────┐    │   │
│  │  │           Capability Plugins                       │    │   │
│  │  │  ┌─────────────┐ ┌──────────┐ ┌───────────────┐  │    │   │
│  │  │  │ Delegation   │ │SkillSync │ │SessionShare   │  │    │   │
│  │  │  └─────────────┘ └──────────┘ └───────────────┘  │    │   │
│  │  │  ┌─────────────┐ ┌──────────┐                      │    │   │
│  │  │  │ GatewaySupv │ │ AuditCap │                      │    │   │
│  │  │  └─────────────┘ └──────────┘                      │    │   │
│  │  └────────────────────────────────────────────────────┘    │   │
│  │                                                             │   │
│  │  ┌──────────────────┐    ┌──────────────────┐             │   │
│  │  │ ProfileEntry     │    │ WebOperator      │             │   │
│  │  │ Router           │    │ ProfileBridge    │             │   │
│  │  └──────────────────┘    └──────────────────┘             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │         SQLite Control Plane: profile-runtime.db            │   │
│  │  profiles | runtime_instances | profile_entries             │   │
│  │  profile_capabilities | profile_skills                      │   │
│  │  skill_sync_events | shared_contexts | delegation_events    │   │
│  │  audit_events                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │         IPC Handler: profile-runtime-ipc.ts                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              │ IPC (contextBridge)
┌─────────────────────────────┴───────────────────────────────────────┐
│                    Electron Preload Bridge                          │
│  window.profileRuntime  ·  window.profileEntry                    │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────────────┐
│                    Electron Renderer Process                        │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │  Profile Runtime UI (React)                               │     │
│  │  - ProfileRuntimeScreen (Runtime 管理面板)                │     │
│  │  - AIOSWorkspaceScreen (default 主控工作台)               │     │
│  │  - ProfileWorkspaceScreen (specialist 独立工作台)         │     │
│  │  - ProfileListPanel / RuntimeStatusPanel                  │     │
│  │  - CapabilityPanel / SkillSyncPanel / DelegationPanel     │     │
│  │  - ContextSharePanel / AuditPanel                         │     │
│  └───────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
                              │ HTTP SSE / child_process
┌─────────────────────────────┴───────────────────────────────────────┐
│                    Hermes Gateway Processes (×7)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│  │ default  │ │ writer   │ │ coding   │ │ research │             │
│  │ :8642    │ │ :8643    │ │ :8644    │ │ :8645    │             │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                          │
│  │recruiters│ │ finance  │ │ agenter  │                          │
│  │ :8646    │ │ :8647    │ │ :8648    │                          │
│  └──────────┘ └──────────┘ └──────────┘                          │
└─────────────────────────────────────────────────────────────────────┘
```

### 数据流图

```
┌─ 用户操作流 ─────────────────────────────────────────────────────────┐
│                                                                      │
│  UI Click → window.profileRuntime.startProfile("writer")             │
│    → ipcRenderer.invoke("profile-runtime:startProfile", "writer")    │
│    → ipcMain.handle → ProfileRuntimeManager.startProfile("writer")   │
│    → DB: UPDATE runtime_instances SET status='starting'              │
│    → PluginRegistry.getAdapter("hermes-local")                       │
│    → HermesLocalRuntimeAdapter.start(profile)                        │
│    → GatewaySupervisor.spawn("hermes gateway", port=8643)            │
│    → /health 轮询直到 200                                            │
│    → DB: UPDATE runtime_instances SET status='running'               │
│    → DB: INSERT INTO audit_events                                    │
│    → IPC 返回 { success: true, status: 'running' }                   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

┌─ 委托调用流 ─────────────────────────────────────────────────────────┐
│                                                                      │
│  default Profile Chat → delegate(target="coding", msg, contextRefs)  │
│    → DelegationCapability.invoke("coding", msg, refs)                │
│    → DB: SELECT status FROM runtime_instances WHERE profile='coding' │
│    → 检查 status='running'                                           │
│    → 读取 shared-context/ 中 context refs                            │
│    → POST http://127.0.0.1:8644/v1/chat/completions (stream)         │
│    → SSE 流式转发给 default Profile                                  │
│    → DB: INSERT INTO delegation_events                               │
│    → DB: INSERT INTO audit_events                                    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

┌─ App Lifecycle 流 ───────────────────────────────────────────────────┐
│                                                                      │
│  app.on('before-quit')                                               │
│    → ProfileRuntimeManager.stopAll()                                 │
│    → 按序停止所有 running 状态的 Profile                             │
│    → kill Gateway 进程 + PID 文件清理                                │
│    → 关闭 SQLite 连接                                                │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## **1.2 服务/组件总体架构**

### 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 6: Renderer UI (表现层)                                │
│ - ProfileRuntimeScreen / AIOSWorkspaceScreen                 │
│ - ProfileWorkspaceScreen / ProfileListPanel                  │
└─────────────────────────────┬───────────────────────────────┘
                              │ window.profileRuntime / profileEntry
┌─────────────────────────────┴───────────────────────────────┐
│ Layer 5: IPC & Preload (通信层)                              │
│ - profile-runtime-ipc.ts (Main Process IPC 注册)            │
│ - preload/profile-runtime-api.ts (Preload API 封装)         │
│ - preload/profile-entry-api.ts (Preload API 封装)           │
│ - shared/profile-runtime-contract.ts (类型定义)             │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────┐
│ Layer 4: Manager & Orchestrator (编排层)                     │
│ - ProfileRuntimeManager (生命周期总控)                        │
│ - ConfigImporter (YAML→DB+FS 编排)                           │
│ - PluginRegistry (Adapter + Plugin 注册中心)                 │
│ - ProfileEntryRouter (页面路由编排)                           │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────┐
│ Layer 3: Capability Plugins (能力扩展层)                     │
│ - DelegationCapability (委托调用)                            │
│ - SkillSyncCapability (技能同步)                             │
│ - SessionShareCapability (上下文共享)                        │
│ - GatewaySupervisorCapability (进程监管)                     │
│ - AuditCapability (审计日志)                                 │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────┐
│ Layer 2: Runtime Adapters (运行时适配层)                     │
│ - HermesLocalRuntimeAdapter (本地 Gateway)                   │
│ - [预留] HermesRemoteRuntimeAdapter                          │
│ - [预留] ToolOnlyRuntimeAdapter                              │
│ - [预留] DockerHermesRuntimeAdapter                          │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────┐
│ Layer 1: Data Access (数据访问层)                            │
│ - ProfileRuntimeDB (SQLite better-sqlite3)                   │
│ - Schema 初始化 / 迁移                                       │
│ - CRUD Repository                                            │
└─────────────────────────────────────────────────────────────┘
```

---

## **1.3 实现设计文档**

### 1.3.1 ProfileRuntimeManager

**职责**: 多 Profile 生命周期总控，协调 Adapter、Plugin、DB

```typescript
class ProfileRuntimeManager {
  private db: ProfileRuntimeDB;
  private registry: PluginRegistry;
  private supervisor: GatewaySupervisorCapability;
  private activeProcesses: Map<string, ChildProcess>;  // profileId → Gateway process

  constructor(db: ProfileRuntimeDB, registry: PluginRegistry);

  // ─── Profile 生命周期 ───
  startProfile(profileId: string): Promise<RuntimeOperationResult>;
  stopProfile(profileId: string): Promise<RuntimeOperationResult>;
  restartProfile(profileId: string): Promise<RuntimeOperationResult>;
  startAll(): Promise<RuntimeOperationResult[]>;
  stopAll(): Promise<RuntimeOperationResult[]>;

  // ─── Profile 查询 ───
  listProfiles(): Promise<ProfileListItem[]>;
  getProfile(profileId: string): Promise<ProfileDetail | null>;
  getRuntimeStatus(): Promise<Map<string, RuntimeStatus>>;

  // ─── App Lifecycle ───
  onBeforeQuit(): Promise<void>;

  // ─── 内部方法 ───
  private resolveAdapter(runtimeType: string): RuntimeAdapter;
  private transitionStatus(profileId: string, from: RuntimeStatus, to: RuntimeStatus): void;
  private writeAudit(profileId: string, operation: string, actor: string, result: 'success' | 'failure', details?: Record<string, unknown>): void;
}
```

### 1.3.2 ConfigImporter

**职责**: 解析 profile-runtime.yaml → 校验 → 创建目录 → 写入 DB

```typescript
class ConfigImporter {
  private db: ProfileRuntimeDB;
  private registry: PluginRegistry;

  constructor(db: ProfileRuntimeDB, registry: PluginRegistry);

  importConfig(yamlContent: string, options?: ImportOptions): Promise<ImportResult>;

  // ─── 内部方法 ───
  private parseYaml(content: string): ProfileRuntimeYaml;
  private validateConfig(config: ProfileRuntimeYaml): ValidationResult;
  private checkNameUniqueness(profiles: ProfileYamlDef[]): void;
  private checkPortUniqueness(profiles: ProfileYamlDef[]): void;
  private checkAdapterAvailability(profiles: ProfileYamlDef[]): void;
  private createProfileDirectories(profile: ProfileYamlDef): void;
  private writeProfileToDB(profile: ProfileYamlDef, tx: DatabaseTransaction): void;
  private rollback(createdDirs: string[], profileNames: string[]): void;
}
```

### 1.3.3 PluginRegistry

**职责**: 注册和查询 RuntimeAdapter、CapabilityPlugin

```typescript
class PluginRegistry {
  private adapters: Map<string, RuntimeAdapter>;
  private capabilities: Map<string, CapabilityPlugin>;

  registerAdapter(type: string, adapter: RuntimeAdapter): void;
  registerCapability(name: string, plugin: CapabilityPlugin): void;

  getAdapter(type: string): RuntimeAdapter | null;
  getCapability(name: string): CapabilityPlugin | null;

  listAdapterTypes(): string[];
  listCapabilityNames(): string[];
}
```

### 1.3.4 RuntimeAdapter 接口

```typescript
interface RuntimeAdapter {
  readonly type: string;  // 'hermes-local' | 'hermes-remote' | 'tool-only' | 'docker-hermes'

  validate(config: ProfileConfig): ValidationResult;
  deploy(profileHome: string, config: ProfileConfig): Promise<DeployResult>;
  start(profileHome: string, port: number, config: ProfileConfig): Promise<StartResult>;
  stop(profileId: string): Promise<StopResult>;
  restart(profileId: string): Promise<StartResult>;
  health(port: number): Promise<HealthResult>;
  sendMessage(profileId: string, message: string, options: SendMessageOptions): Promise<ChatHandle>;
}

interface SendMessageOptions {
  model?: string;
  history?: Array<{ role: string; content: string }>;
  resumeSessionId?: string;
  stream?: boolean;
}

interface ChatHandle {
  abort: () => void;
}
```

### 1.3.5 HermesLocalRuntimeAdapter

**职责**: 本地 Hermes Gateway 进程管理，复用现有 `hermes.ts` 逻辑

```typescript
class HermesLocalRuntimeAdapter implements RuntimeAdapter {
  readonly type = 'hermes-local';
  private processes: Map<string, ChildProcess>;  // profileId → Gateway process

  validate(config: ProfileConfig): ValidationResult;
  deploy(profileHome: string, config: ProfileConfig): Promise<DeployResult>;
  start(profileHome: string, port: number, config: ProfileConfig): Promise<StartResult>;
  stop(profileId: string): Promise<StopResult>;
  restart(profileId: string): Promise<StartResult>;
  health(port: number): Promise<HealthResult>;
  sendMessage(profileId: string, message: string, options: SendMessageOptions): Promise<ChatHandle>;

  // ─── 内部方法（复用现有 hermes.ts 逻辑） ───
  private spawnGateway(profileHome: string, port: number): ChildProcess;
  private killGateway(profileId: string): boolean;
  private checkHealth(port: number): Promise<boolean>;
}
```

**与 V1.0 集成点**:
- `spawnGateway()` 复用 `hermes.ts` 的 `startGateway()` 进程 spawn 逻辑
- `killGateway()` 复用 `hermes.ts` 的 `stopGateway()` PID 文件 + kill 逻辑
- `checkHealth()` 复用 `hermes.ts` 的 `/health` 端点检测逻辑
- 端口从硬编码 `8642` 变为参数化 `port`

### 1.3.6 DelegationCapability

```typescript
class DelegationCapability implements CapabilityPlugin {
  readonly name = 'delegation';
  private db: ProfileRuntimeDB;

  invoke(sourceProfileId: string, targetProfileId: string, message: string, options?: DelegationOptions): Promise<DelegationResult>;

  // ─── 内部方法 ───
  private checkTargetRunning(targetProfileId: string): Promise<void>;
  private resolveContextRefs(contextRefs: string[]): Promise<ResolvedContext[]>;
  private forwardRequest(targetPort: number, message: string, context: ResolvedContext[], options: DelegationOptions): Promise<DelegationResponse>;
  private recordEvent(event: DelegationEvent): void;
}

interface DelegationOptions {
  stream?: boolean;
  contextRefs?: string[];
  timeout?: number;  // 默认 30000ms
}

interface DelegationResult {
  success: boolean;
  response?: string;
  sessionId?: string;
  error?: string;
}
```

### 1.3.7 SkillSyncCapability

```typescript
class SkillSyncCapability implements CapabilityPlugin {
  readonly name = 'skill-sync';
  private db: ProfileRuntimeDB;

  copySkill(sourceProfileId: string, targetProfileId: string, skillName: string, options?: SkillSyncOptions): Promise<SkillSyncResult>;
  syncAllSkills(sourceProfileId: string, targetProfileId: string, options?: SkillSyncOptions): Promise<SkillSyncResult[]>;

  // ─── 内部方法 ───
  private resolveSkillPath(profileId: string, skillName: string): string;
  private calculateChecksum(filePath: string): Promise<string>;
  private backupTarget(filePath: string): string;
  private copyFile(source: string, target: string): Promise<void>;
  private verifyChecksum(source: string, target: string): Promise<boolean>;
  private recordSyncEvent(event: SkillSyncEvent): void;
}

interface SkillSyncOptions {
  overwrite?: boolean;  // 默认 false
}

interface SkillSyncResult {
  action: 'copied' | 'skipped' | 'overwritten' | 'failed';
  skillName: string;
  checksum?: string;
  error?: string;
}
```

### 1.3.8 SessionShareCapability

```typescript
class SessionShareCapability implements CapabilityPlugin {
  readonly name = 'session-share';
  private db: ProfileRuntimeDB;

  shareSessionContext(sourceProfileId: string, targetProfileId: string, sessionId: string, mode: ShareMode): Promise<ShareResult>;
  listSharedContexts(profileId: string): Promise<SharedContext[]>;
  deleteSharedContext(contextId: string): Promise<void>;

  // ─── 内部方法 ───
  private readSessionData(profileId: string, sessionId: string): Promise<SessionData>;
  private generateContextMd(data: SessionData, mode: ShareMode): string;
  private writeContextToTarget(targetProfileId: string, fileName: string, content: string): string;
  private recordShare(event: SharedContextRecord): void;
}

type ShareMode = 'snapshot' | 'summary' | 'full';

interface ShareResult {
  success: boolean;
  filePath?: string;
  messageCount?: number;
  error?: string;
}
```

### 1.3.9 GatewaySupervisorCapability

```typescript
class GatewaySupervisorCapability implements CapabilityPlugin {
  readonly name = 'gateway-supervisor';
  private db: ProfileRuntimeDB;
  private healthTimers: Map<string, NodeJS.Timer>;  // profileId → interval

  startSupervision(profileId: string, port: number): void;
  stopSupervision(profileId: string): void;
  startAllSupervision(): void;
  stopAllSupervision(): void;

  // ─── 内部方法 ───
  private checkHealth(profileId: string, port: number): Promise<boolean>;
  private onHealthFailure(profileId: string, consecutiveFailures: number): void;
}
```

**健康检查策略**: 每 15 秒检测一次 `/health`，连续 3 次失败（间隔 2 秒）标记为 `failed`

### 1.3.10 ProfileEntryRouter

```typescript
class ProfileEntryRouter {
  private db: ProfileRuntimeDB;

  listProfileEntries(): Promise<ProfileEntry[]>;
  getProfileEntry(profileId: string): Promise<ProfileEntry | null>;
  openProfileEntry(profileId: string): Promise<ProfileEntryScreenConfig>;
  getProfilePageLayout(profileId: string): Promise<Record<string, unknown>>;
  updateProfilePageLayout(profileId: string, layout: Record<string, unknown>): Promise<void>;

  // ─── 内部方法 ───
  private resolveScreenType(profileId: string): 'AIOSWorkspaceScreen' | 'ProfileWorkspaceScreen';
  private checkRouteConflict(routePath: string): boolean;
}

interface ProfileEntryScreenConfig {
  profileId: string;
  routePath: string;
  screenType: 'AIOSWorkspaceScreen' | 'ProfileWorkspaceScreen';
  navGroup: 'ai-os' | 'experts' | 'runtime' | 'operator';
  layoutConfig?: Record<string, unknown>;
}
```

### 1.3.11 WebOperatorProfileBridge

```typescript
class WebOperatorProfileBridge {
  private db: ProfileRuntimeDB;
  private allowedProfiles: Set<string>;

  executeAction(profileId: string, action: BrowserAction, params: BrowserActionParams): Promise<BrowserActionResult>;

  // ─── 内部方法 ───
  private checkProfileAllowed(profileId: string): void;
  private injectSourceProfile(params: BrowserActionParams, profileId: string): BrowserActionParams;
  private writeAudit(profileId: string, action: string, url: string): void;
}
```

### 1.3.12 ProfileRuntimeDB

```typescript
class ProfileRuntimeDB {
  private db: Database;  // better-sqlite3

  constructor(dbPath: string);

  // ─── 初始化与迁移 ───
  initialize(): void;
  runMigrations(): void;

  // ─── Profile CRUD ───
  insertProfile(profile: ProfileRecord, tx?: DatabaseTransaction): void;
  getProfile(profileId: string): ProfileRecord | null;
  listProfiles(): ProfileRecord[];
  deleteProfile(profileId: string): void;

  // ─── Runtime Instance CRUD ───
  getRuntimeInstance(profileId: string): RuntimeInstanceRecord | null;
  updateRuntimeStatus(profileId: string, status: RuntimeStatus, extras?: Partial<RuntimeInstanceRecord>): void;

  // ─── Profile Entry CRUD ───
  getProfileEntry(profileId: string): ProfileEntryRecord | null;
  listProfileEntries(): ProfileEntryRecord[];
  updateProfileEntryLayout(profileId: string, layout: string): void;

  // ─── Capability CRUD ───
  insertCapability(cap: ProfileCapabilityRecord, tx?: DatabaseTransaction): void;
  getCapabilities(profileId: string): ProfileCapabilityRecord[];

  // ─── Skill CRUD ───
  insertSkill(skill: ProfileSkillRecord, tx?: DatabaseTransaction): void;
  listSkills(profileId: string): ProfileSkillRecord[];

  // ─── Events ───
  insertSkillSyncEvent(event: SkillSyncEventRecord): void;
  insertSharedContext(ctx: SharedContextRecord): void;
  insertDelegationEvent(event: DelegationEventRecord): void;
  insertAuditEvent(event: AuditEventRecord): void;

  // ─── Query ───
  listAuditEvents(profileId?: string, limit?: number): AuditEventRecord[];
  listDelegationEvents(profileId: string): DelegationEventRecord[];
  listSkillSyncEvents(profileId: string): SkillSyncEventRecord[];
  listSharedContexts(profileId: string): SharedContextRecord[];

  // ─── 事务 ───
  transaction<T>(fn: (tx: DatabaseTransaction) => T): T;
  close(): void;
}
```

### 1.3.13 CapabilityPlugin 接口

```typescript
interface CapabilityPlugin {
  readonly name: string;
  initialize?(db: ProfileRuntimeDB): void;
}
```

---

# **2. 接口设计**

## **2.1 总体设计**

1. **命名空间隔离**: 所有新增 IPC 使用 `profile-runtime:` 前缀，不与现有 IPC 冲突
2. **双 API 暴露**: `window.profileRuntime`（运行时管理）+ `window.profileEntry`（页面路由）
3. **类型安全**: 完整 TypeScript 类型定义，Renderer 通过 `.d.ts` 获得编译时检查
4. **进程隔离**: Preload 不暴露 Node.js / SQLite / FS 直接访问能力
5. **审计覆盖**: 所有管理操作自动记录审计日志
6. **向后兼容**: 不修改现有 `window.hermesAPI`，独立暴露新 API

---

## **2.2 接口清单**

### 2.2.1 window.profileRuntime API

| 方法 | IPC Channel | 参数 | 返回值 | 说明 |
|------|-------------|------|--------|------|
| `importConfig` | `profile-runtime:importConfig` | `filePath: string, options?: ImportOptions` | `ImportResult` | 导入 profile-runtime.yaml |
| `listProfiles` | `profile-runtime:listProfiles` | — | `ProfileListItem[]` | 获取 Profile 列表 |
| `getProfile` | `profile-runtime:getProfile` | `profileId: string` | `ProfileDetail \| null` | 获取 Profile 详情 |
| `startProfile` | `profile-runtime:startProfile` | `profileId: string` | `RuntimeOperationResult` | 启动 Profile |
| `stopProfile` | `profile-runtime:stopProfile` | `profileId: string` | `RuntimeOperationResult` | 停止 Profile |
| `restartProfile` | `profile-runtime:restartProfile` | `profileId: string` | `RuntimeOperationResult` | 重启 Profile |
| `startAll` | `profile-runtime:startAll` | — | `RuntimeOperationResult[]` | 启动所有 stopped Profile |
| `stopAll` | `profile-runtime:stopAll` | — | `RuntimeOperationResult[]` | 停止所有 running Profile |
| `getRuntimeStatus` | `profile-runtime:getRuntimeStatus` | — | `Record<string, RuntimeStatus>` | 获取所有 Profile 运行状态 |
| `delegate` | `profile-runtime:delegate` | `targetProfileId, message, options?` | `DelegationResult` | 发起委托调用 |
| `listProfileSkills` | `profile-runtime:listProfileSkills` | `profileId: string` | `ProfileSkillInfo[]` | 列出 Profile 技能 |
| `copySkill` | `profile-runtime:copySkill` | `source, target, skillName, options?` | `SkillSyncResult` | 复制技能 |
| `listProfileSessions` | `profile-runtime:listProfileSessions` | `profileId: string` | `SessionInfo[]` | 列出 Profile 会话 |
| `shareSessionContext` | `profile-runtime:shareSessionContext` | `source, target, sessionId, mode` | `ShareResult` | 共享上下文 |
| `listSharedContexts` | `profile-runtime:listSharedContexts` | `profileId: string` | `SharedContextInfo[]` | 列出共享上下文 |
| `deleteSharedContext` | `profile-runtime:deleteSharedContext` | `contextId: string` | `void` | 删除共享上下文 |
| `listAuditEvents` | `profile-runtime:listAuditEvents` | `profileId?, limit?` | `AuditEventInfo[]` | 列出审计事件 |

### 2.2.2 window.profileEntry API

| 方法 | IPC Channel | 参数 | 返回值 | 说明 |
|------|-------------|------|--------|------|
| `listProfileEntries` | `profile-runtime:listProfileEntries` | — | `ProfileEntryInfo[]` | 列出所有 Entry |
| `getProfileEntry` | `profile-runtime:getProfileEntry` | `profileId: string` | `ProfileEntryInfo \| null` | 获取单个 Entry |
| `openProfileEntry` | `profile-runtime:openProfileEntry` | `profileId: string` | `ProfileEntryScreenConfig` | 打开 Profile Entry 页面 |
| `getProfilePageLayout` | `profile-runtime:getProfilePageLayout` | `profileId: string` | `Record<string, unknown>` | 获取页面布局配置 |
| `updateProfilePageLayout` | `profile-runtime:updateProfilePageLayout` | `profileId, layout` | `void` | 更新页面布局配置 |

### 2.2.3 类型定义

```typescript
// ─── 枚举与基础类型 ───

type RuntimeStatus =
  | 'not_deployed'
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'failed';

type RuntimeType = 'hermes-local' | 'hermes-remote' | 'tool-only' | 'docker-hermes';
type ProfileRole = 'default' | 'specialist';
type ShareMode = 'snapshot' | 'summary' | 'full';
type NavGroup = 'ai-os' | 'experts' | 'runtime' | 'operator';
type AuditActor = 'user' | 'system' | 'delegation' | 'tool-bridge';
type AuditResult = 'success' | 'failure';

// ─── Profile 类型 ───

interface ProfileListItem {
  id: string;
  name: string;
  displayName: string;
  role: ProfileRole;
  runtimeType: RuntimeType;
  port: number;
  profileHome: string;
  enabled: boolean;
  autoStart: boolean;
  status?: RuntimeStatus;
  pid?: number;
}

interface ProfileDetail extends ProfileListItem {
  capabilities: ProfileCapabilityInfo[];
  skills: ProfileSkillInfo[];
  entry?: ProfileEntryInfo;
  errorMessage?: string;
  lastHealthCheckAt?: string;
  startedAt?: string;
}

// ─── Runtime 操作结果 ───

interface RuntimeOperationResult {
  success: boolean;
  profileId: string;
  status?: RuntimeStatus;
  error?: string;
  code?: ProfileErrorCode;
}

// ─── Import 类型 ───

interface ImportOptions {
  overwriteExisting?: boolean;
}

interface ImportResult {
  success: boolean;
  profiles: string[];
  errors: ImportError[];
}

interface ImportError {
  profile: string;
  error: string;
  code?: ProfileErrorCode;
}

// ─── Delegation 类型 ───

interface DelegationOptions {
  stream?: boolean;
  contextRefs?: string[];
  timeout?: number;
}

interface DelegationResult {
  success: boolean;
  response?: string;
  sessionId?: string;
  error?: string;
  code?: ProfileErrorCode;
}

// ─── Skill Sync 类型 ───

interface SkillSyncOptions {
  overwrite?: boolean;
}

interface SkillSyncResult {
  action: 'copied' | 'skipped' | 'overwritten' | 'failed';
  skillName: string;
  checksum?: string;
  error?: string;
}

interface ProfileSkillInfo {
  name: string;
  category: string;
  description: string;
  path: string;
}

// ─── Session Share 类型 ───

interface ShareResult {
  success: boolean;
  filePath?: string;
  messageCount?: number;
  error?: string;
  code?: ProfileErrorCode;
}

interface SharedContextInfo {
  id: string;
  sourceProfileId: string;
  targetProfileId: string;
  sourceSessionId: string;
  shareMode: ShareMode;
  filePath: string;
  messageCount?: number;
  timestamp: string;
}

// ─── Profile Entry 类型 ───

interface ProfileEntryInfo {
  profileId: string;
  routePath: string;
  screenType: 'AIOSWorkspaceScreen' | 'ProfileWorkspaceScreen';
  navGroup: NavGroup;
  layoutConfig?: Record<string, unknown>;
}

interface ProfileEntryScreenConfig extends ProfileEntryInfo {
  displayName: string;
  profileHome: string;
  port: number;
}

// ─── Audit 类型 ───

interface AuditEventInfo {
  id: string;
  profileId: string;
  operation: string;
  actor: AuditActor;
  result: AuditResult;
  details?: Record<string, unknown>;
  timestamp: string;
}

// ─── Capability 类型 ───

interface ProfileCapabilityInfo {
  capabilityType: string;
  enabled: boolean;
  config?: Record<string, unknown>;
}

// ─── 错误码 ───

type ProfileErrorCode =
  | 'PROFILE_NOT_FOUND'
  | 'PROFILE_ALREADY_EXISTS'
  | 'PROFILE_INVALID_NAME'
  | 'PROFILE_CONFIG_INVALID'
  | 'PROFILE_PORT_CONFLICT'
  | 'PROFILE_RUNTIME_NOT_DEPLOYED'
  | 'PROFILE_RUNTIME_START_FAILED'
  | 'PROFILE_RUNTIME_STOP_FAILED'
  | 'PROFILE_GATEWAY_HEALTH_TIMEOUT'
  | 'PROFILE_ADAPTER_NOT_FOUND'
  | 'PROFILE_CAPABILITY_NOT_ENABLED'
  | 'PROFILE_DELEGATION_FAILED'
  | 'PROFILE_SKILL_NOT_FOUND'
  | 'PROFILE_SKILL_COPY_FAILED'
  | 'PROFILE_CONTEXT_SOURCE_SESSION_NOT_FOUND'
  | 'PROFILE_CONTEXT_SHARE_FAILED'
  | 'PROFILE_ENTRY_NOT_FOUND'
  | 'PROFILE_ENTRY_ROUTE_CONFLICT'
  | 'WEB_OPERATOR_PROFILE_NOT_ALLOWED';

// ─── 错误响应 ───

interface ProfileErrorResult {
  success: false;
  error: string;
  code: ProfileErrorCode;
  details?: Record<string, unknown>;
}
```

### 2.2.4 IPC 推送事件 (Main → Renderer)

| 事件 Channel | 数据类型 | 说明 |
|---|---|---|
| `profile-runtime:status_changed` | `{ profileId: string; status: RuntimeStatus }` | Profile 状态变更通知 |
| `profile-runtime:delegation_chunk` | `{ profileId: string; content: string }` | 委托调用 SSE 流式块 |
| `profile-runtime:delegation_done` | `{ profileId: string; sessionId?: string }` | 委托调用完成 |
| `profile-runtime:delegation_error` | `{ profileId: string; error: string }` | 委托调用错误 |

---

# **4. 数据模型**

## **4.1 设计目标**

1. **职责分离**: Profile Runtime 数据独立于 Hermes `state.db`，避免污染会话数据
2. **全局控制**: 单一 `profile-runtime.db` 管理所有 Profile 元数据与运行状态
3. **关系完整**: 外键约束保证数据一致性，CASCADE 删除避免孤立记录
4. **查询高效**: 关键查询字段建立索引，支持 1000 条记录内 <100ms 响应
5. **迁移友好**: Schema 版本化管理，迁移脚本幂等可重复执行
6. **WAL 模式**: 启用 WAL 支持并发读取，busy_timeout=5000ms

---

## **4.2 模型实现**

### 实体关系图

```
profiles (1) ──→ (1) runtime_instances
profiles (1) ──→ (1) profile_entries
profiles (1) ──→ (N) profile_capabilities
profiles (1) ──→ (N) profile_skills

profiles (1) ──→ (N) skill_sync_events    [source / target]
profiles (1) ──→ (N) shared_contexts      [source / target]
profiles (1) ──→ (N) delegation_events    [source / target]
profiles (1) ──→ (N) audit_events
```

### 数据库位置

```
~/.hermes/desktop/profile-runtime.db
```

### 完整 DDL（9 张表）

```sql
-- ──────────────────────────────────────────────
-- Schema 版本管理
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ──────────────────────────────────────────────
-- 1. profiles — Profile 定义
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id              TEXT PRIMARY KEY,            -- UUID
  name            TEXT NOT NULL UNIQUE,        -- 唯一标识，kebab-case
  display_name    TEXT NOT NULL,               -- 用户可读名称
  role            TEXT NOT NULL DEFAULT 'specialist',  -- 'default' | 'specialist'
  runtime_type    TEXT NOT NULL DEFAULT 'hermes-local', -- RuntimeType 枚举
  port            INTEGER NOT NULL UNIQUE,     -- Gateway 监听端口
  profile_home    TEXT NOT NULL,               -- profileHome(name) 路径
  enabled         INTEGER NOT NULL DEFAULT 1,  -- 是否启用
  auto_start      INTEGER NOT NULL DEFAULT 0,  -- 是否随 App 自启
  soul_prompt     TEXT,                        -- SOUL.md 内容
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (port >= 1024 AND port <= 65535),
  CHECK (role IN ('default', 'specialist')),
  CHECK (runtime_type IN ('hermes-local', 'hermes-remote', 'tool-only', 'docker-hermes'))
);

CREATE INDEX IF NOT EXISTS idx_profiles_name ON profiles(name);
CREATE INDEX IF NOT EXISTS idx_profiles_enabled ON profiles(enabled);
CREATE INDEX IF NOT EXISTS idx_profiles_auto_start ON profiles(auto_start);

-- ──────────────────────────────────────────────
-- 2. runtime_instances — 运行实例状态
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS runtime_instances (
  profile_id            TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  status                TEXT NOT NULL DEFAULT 'not_deployed',
  pid                   INTEGER,                     -- Gateway 进程 PID
  port                  INTEGER NOT NULL,            -- 冗余存储便于查询
  health_check_url      TEXT NOT NULL,               -- http://127.0.0.1:{port}/health
  last_health_check_at  TEXT,                        -- ISO 8601
  error_message         TEXT,                        -- 最近错误消息
  started_at            TEXT,                        -- 启动时间
  stopped_at            TEXT,                        -- 停止时间
  CHECK (status IN ('not_deployed', 'stopped', 'starting', 'running', 'stopping', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_runtime_status ON runtime_instances(status);
CREATE INDEX IF NOT EXISTS idx_runtime_port ON runtime_instances(port);

-- ──────────────────────────────────────────────
-- 3. profile_entries — Profile 页面入口
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profile_entries (
  profile_id    TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  route_path    TEXT NOT NULL UNIQUE,                -- 页面路由路径
  screen_type   TEXT NOT NULL,                       -- 'AIOSWorkspaceScreen' | 'ProfileWorkspaceScreen'
  nav_group     TEXT NOT NULL DEFAULT 'experts',     -- 'ai-os' | 'experts' | 'runtime' | 'operator'
  layout_config TEXT,                                -- JSON 格式布局配置
  CHECK (screen_type IN ('AIOSWorkspaceScreen', 'ProfileWorkspaceScreen')),
  CHECK (nav_group IN ('ai-os', 'experts', 'runtime', 'operator'))
);

CREATE INDEX IF NOT EXISTS idx_profile_entries_nav ON profile_entries(nav_group);

-- ──────────────────────────────────────────────
-- 4. profile_capabilities — 能力绑定
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profile_capabilities (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id      TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  capability_type TEXT NOT NULL,                     -- 'delegation' | 'skill-sync' | 'session-share' | 'gateway-supervisor'
  enabled         INTEGER NOT NULL DEFAULT 1,
  config          TEXT,                              -- JSON 格式能力配置
  UNIQUE(profile_id, capability_type),
  CHECK (capability_type IN ('delegation', 'skill-sync', 'session-share', 'gateway-supervisor'))
);

CREATE INDEX IF NOT EXISTS idx_capabilities_profile ON profile_capabilities(profile_id);

-- ──────────────────────────────────────────────
-- 5. profile_skills — Profile 技能清单
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profile_skills (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill_name  TEXT NOT NULL,
  skill_path  TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'general',
  description TEXT,
  UNIQUE(profile_id, skill_name)
);

CREATE INDEX IF NOT EXISTS idx_skills_profile ON profile_skills(profile_id);
CREATE INDEX IF NOT EXISTS idx_skills_category ON profile_skills(category);

-- ──────────────────────────────────────────────
-- 6. skill_sync_events — 技能同步记录
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS skill_sync_events (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  source_profile_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_profile_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill_name          TEXT NOT NULL,
  action              TEXT NOT NULL,                 -- 'copied' | 'skipped' | 'overwritten' | 'failed'
  checksum            TEXT,                          -- SHA-256
  backup_path         TEXT,                          -- 备份路径
  timestamp           TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (action IN ('copied', 'skipped', 'overwritten', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_skill_sync_source ON skill_sync_events(source_profile_id);
CREATE INDEX IF NOT EXISTS idx_skill_sync_target ON skill_sync_events(target_profile_id);

-- ──────────────────────────────────────────────
-- 7. shared_contexts — 共享上下文记录
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shared_contexts (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  source_profile_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_profile_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source_session_id   TEXT NOT NULL,                -- 源会话 ID
  share_mode          TEXT NOT NULL,                 -- 'snapshot' | 'summary' | 'full'
  file_path           TEXT NOT NULL,                 -- context.md 在目标 Profile 的路径
  message_count       INTEGER,                       -- 共享消息数量
  timestamp           TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (share_mode IN ('snapshot', 'summary', 'full'))
);

CREATE INDEX IF NOT EXISTS idx_shared_ctx_source ON shared_contexts(source_profile_id);
CREATE INDEX IF NOT EXISTS idx_shared_ctx_target ON shared_contexts(target_profile_id);

-- ──────────────────────────────────────────────
-- 8. delegation_events — 委托调用记录
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delegation_events (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  source_profile_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_profile_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  request_summary     TEXT NOT NULL,                 -- 最大 1024 字符
  response_summary    TEXT,                          -- 最大 2048 字符
  context_refs        TEXT,                          -- JSON 数组
  status              TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'completed' | 'failed'
  stream              INTEGER NOT NULL DEFAULT 0,   -- 是否流式
  timestamp           TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (status IN ('pending', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_delegation_source ON delegation_events(source_profile_id);
CREATE INDEX IF NOT EXISTS idx_delegation_target ON delegation_events(target_profile_id);

-- ──────────────────────────────────────────────
-- 9. audit_events — 审计日志
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id  TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  operation   TEXT NOT NULL,                         -- 操作类型
  actor       TEXT NOT NULL,                         -- 'user' | 'system' | 'delegation' | 'tool-bridge'
  result      TEXT NOT NULL,                         -- 'success' | 'failure'
  details     TEXT,                                  -- JSON 操作详情
  timestamp   TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (result IN ('success', 'failure'))
);

CREATE INDEX IF NOT EXISTS idx_audit_profile ON audit_events(profile_id);
CREATE INDEX IF NOT EXISTS idx_audit_operation ON audit_events(operation);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_events(timestamp);
```

### 迁移策略

1. **版本管理**: `schema_version` 表记录已应用的迁移版本
2. **幂等执行**: 迁移脚本可重复执行，已应用版本自动跳过
3. **事务保护**: 单个迁移在事务内执行，失败自动回滚
4. **向后兼容**: 新迁移不破坏旧数据，只增不改字段
5. **初始迁移**: V1 创建全部 9 张表 + 索引

### profile-runtime.yaml 配置格式

```yaml
version: 1

profiles:
  - name: default
    display_name: "AI-OS Main"
    role: default
    runtime_type: hermes-local
    port: 8642
    auto_start: true
    soul_prompt: |
      You are the main AI-OS assistant...
    capabilities:
      - type: delegation
        enabled: true
      - type: skill-sync
        enabled: true
      - type: session-share
        enabled: true
      - type: gateway-supervisor
        enabled: true

  - name: writer
    display_name: "Writing Expert"
    role: specialist
    runtime_type: hermes-local
    port: 8643
    auto_start: false
    soul_prompt: |
      You are a specialized writing assistant...
    capabilities:
      - type: skill-sync
        enabled: true
      - type: session-share
        enabled: true

  - name: coding
    display_name: "Coding Expert"
    role: specialist
    runtime_type: hermes-local
    port: 8644
    capabilities:
      - type: delegation
        enabled: false
      - type: skill-sync
        enabled: true

  - name: research
    display_name: "Research Expert"
    role: specialist
    runtime_type: hermes-local
    port: 8645

  - name: recruiters
    display_name: "Recruitment Expert"
    role: specialist
    runtime_type: hermes-local
    port: 8646

  - name: finance
    display_name: "Finance Expert"
    role: specialist
    runtime_type: hermes-local
    port: 8647

  - name: agenter
    display_name: "Agent Orchestrator"
    role: specialist
    runtime_type: hermes-local
    port: 8648
```

---

# 5. 错误处理策略

## 5.1 错误分类与错误码

| 错误码 | 错误类型 | 触发场景 | 处理策略 |
|--------|---------|---------|---------|
| `PROFILE_NOT_FOUND` | NotFoundError | 查询/操作不存在的 profileId | 直接返回错误 |
| `PROFILE_ALREADY_EXISTS` | ConflictError | 导入同名 Profile | 返回冲突详情 |
| `PROFILE_INVALID_NAME` | ValidationError | 名称含非法字符或超长 | 返回命名规则说明 |
| `PROFILE_CONFIG_INVALID` | ValidationError | YAML 格式错误或缺字段 | 返回校验错误详情 |
| `PROFILE_PORT_CONFLICT` | ConflictError | 端口已被其他 Profile 占用 | 返回冲突的 Profile 和端口 |
| `PROFILE_RUNTIME_NOT_DEPLOYED` | StateError | 启动未部署的 Profile | 返回当前状态 |
| `PROFILE_RUNTIME_START_FAILED` | RuntimeError | Gateway 进程启动异常 | 标记 failed，记录错误日志 |
| `PROFILE_RUNTIME_STOP_FAILED` | RuntimeError | Gateway 进程停止异常 | 尝试 force kill，标记 failed |
| `PROFILE_GATEWAY_HEALTH_TIMEOUT` | TimeoutError | /health 端点响应超时 | 标记 failed，通知 UI |
| `PROFILE_ADAPTER_NOT_FOUND` | NotFoundError | 请求未实现的 runtime_type | 返回可用 Adapter 列表 |
| `PROFILE_CAPABILITY_NOT_ENABLED` | StateError | 使用未启用的 Capability | 返回能力配置状态 |
| `PROFILE_DELEGATION_FAILED` | RuntimeError | 委托调用执行失败 | 记录失败事件，返回错误 |
| `PROFILE_SKILL_NOT_FOUND` | NotFoundError | 复制不存在的技能 | 返回可用技能列表 |
| `PROFILE_SKILL_COPY_FAILED` | IOError | 文件复制异常 | 回滚，删除不完整文件 |
| `PROFILE_CONTEXT_SOURCE_SESSION_NOT_FOUND` | NotFoundError | 共享不存在的会话 | 返回可用会话列表 |
| `PROFILE_CONTEXT_SHARE_FAILED` | IOError | context.md 生成/写入失败 | 不写入不完整文件 |
| `PROFILE_ENTRY_NOT_FOUND` | NotFoundError | 访问不存在的 Entry | 返回 null |
| `PROFILE_ENTRY_ROUTE_CONFLICT` | ConflictError | 两个 Entry 注册相同路由 | 保留先注册的 Entry |
| `WEB_OPERATOR_PROFILE_NOT_ALLOWED` | PermissionError | Profile 不在操作允许列表 | 记录审计，拒绝操作 |

## 5.2 错误响应格式

```typescript
interface ProfileErrorResult {
  success: false;
  error: string;               // 用户可读错误消息
  code: ProfileErrorCode;      // 错误码
  details?: Record<string, unknown>;  // 详细信息
}
```

## 5.3 错误处理原则

1. **不吞异常**: 所有异常捕获后必须记录日志 + 写入 audit_events
2. **状态机保护**: 状态流转失败时不产生非法状态（如 starting → running 不可跳过）
3. **回滚保证**: 导入/同步/共享操作失败时回滚已执行步骤
4. **用户感知**: 所有错误必须通过 IPC 返回给 Renderer，不在 Main Process 静默失败
5. **错误传播**: Delegation/SkillSync/SessionShare 的子错误向上传播到 Manager

---

# 6. 安全设计

## 6.1 网络安全

1. **Gateway 绑定**: 所有 Gateway 实例仅监听 `127.0.0.1`，禁止绑定 `0.0.0.0`
2. **Tool Server 绑定**: BrowserToolServer 仅绑定 `127.0.0.1`，端口冲突自动递增
3. **端口隔离**: 每个 Profile 端口唯一，跨 Profile 不共享端口

## 6.2 数据安全

1. **敏感配置隔离**: API Key 明文不保存到 `profile-runtime.db`，保留在 Profile 目录的 `.env` 文件中
2. **state.db 隔离**: 禁止 default Profile 直接写 specialist 的 `state.db`，反之亦然
3. **SQLite WAL**: `profile-runtime.db` 启用 WAL 模式，避免并发写入锁死

## 6.3 进程隔离

1. **Preload 安全**: 不暴露 Node.js、SQLite、文件系统直接访问能力给 Renderer
2. **IPC 命名空间**: 新 IPC 使用 `profile-runtime:` 前缀，与现有 IPC 无交叉
3. **contextBridge**: `window.profileRuntime` 和 `window.profileEntry` 通过 contextBridge 独立暴露

## 6.4 操作安全

1. **敏感操作确认**: Web Operator 执行文件删除、表单提交等操作需 Desktop UI 用户确认
2. **审计必写**: 委托调用、技能复制、上下文共享、Web Operator 操作均写入 `audit_events`
3. **Profile 权限校验**: Web Operator 请求的 profileId 必须在允许列表中
4. **技能同步备份**: 覆盖前必须备份原文件（`{原文件名}.backup.{timestamp}`）

---

# 7. 集成方案

## 7.1 与现有 Gateway 管理的集成

**策略**: Profile Runtime 通过 Runtime Adapter 调用现有 Gateway 启停逻辑，不直接修改 `hermes.ts`

**集成点**:
- `HermesLocalRuntimeAdapter.start()` → 复用 `startGateway()` 的 spawn + health check 逻辑
- `HermesLocalRuntimeAdapter.stop()` → 复用 `stopGateway()` 的 PID + kill 逻辑
- `HermesLocalRuntimeAdapter.health()` → 复用 `/health` 端点检测逻辑
- **关键修改**: 端口从硬编码 `8642` 变为参数化 `port`，传入 `profileHome` 确定工作目录
- `sendMessage()` 复用现有 SSE 解析逻辑，URL 从 `LOCAL_API_URL` 变为 `http://127.0.0.1:{port}`

**现有文件修改清单**:
| 文件 | 修改范围 | 说明 |
|------|---------|------|
| `src/main/hermes.ts` | 端口参数化 | `startGateway(profile?, port?)` 支持传入端口 |
| `src/main/hermes.ts` | `getApiUrl()` 扩展 | 支持按 profile 获取 API URL |

## 7.2 与现有 IPC 体系的集成

**策略**: 独立注册 `profile-runtime:*` IPC channel，不修改现有 `hermesAPI`

**集成点**:
- `src/main/profile-runtime-ipc.ts` — 新增文件，注册所有 `profile-runtime:*` handler
- `src/main/index.ts` — 在 `setupIPC()` 中调用 `setupProfileRuntimeIPC()`
- `src/preload/index.ts` — 新增 `contextBridge.exposeInMainWorld('profileRuntime', ...)` 和 `contextBridge.exposeInMainWorld('profileEntry', ...)`
- `src/preload/profile-runtime-api.ts` — 新增文件，封装 Preload API
- `src/preload/profile-entry-api.ts` — 新增文件，封装 Preload API
- `src/preload/index.d.ts` — 扩展 Window 类型定义

## 7.3 与现有 profiles.ts 的集成

**策略**: 现有 `profiles.ts` 的简单 Profile 管理升级为 Profile Runtime 的子集

**集成点**:
- `listProfiles()` → 兼容调用，从 `profile-runtime.db` 读取并转换为 `ProfileInfo` 格式
- `createProfile()` / `deleteProfile()` → 委托给 ConfigImporter / Manager
- `setActiveProfile()` → 保留，与 Profile Runtime 的 `enabled` 字段同步

## 7.4 与 Renderer UI 的集成

**策略**: 作为新视图挂载到 Layout，不修改原 14 视图结构

**集成点**:
- 新增 `ProfileRuntimeScreen` 组件 → 挂载到 `/profile-runtime` 路由
- 新增 `AIOSWorkspaceScreen` 组件 → default Profile 主控工作台
- 新增 `ProfileWorkspaceScreen` 组件 → specialist Profile 独立工作台
- Layout 侧边栏新增导航分组：AI-OS / Experts / Runtime / Operator
- 不修改 `screens/Layout/Layout.tsx` 的现有视图

## 7.5 与 Web Operator 的集成

**策略**: 扩展现有 Browser IPC 和 Tool Bridge 携带 profileId

**集成点**:
- `browser.open` → 新增 `profileId` 参数
- `BrowserToolBridge.handleToolCall()` → 注入 `sourceProfile` 字段
- `BrowserAuditLogger.log()` → 新增 `profileId` 字段
- `WebOperatorProfileBridge` → 新增文件，包装 BrowserController

## 7.6 App Lifecycle 集成

**集成点**:
- `src/main/index.ts` 的 `app.on('before-quit')` → 调用 `ProfileRuntimeManager.stopAll()`
- `ProfileRuntimeDB.close()` → 在 quit 事件中关闭 SQLite 连接

## 7.7 向后兼容策略

1. **数据兼容**: default Profile 无缝升级，原 `~/.hermes/` 作为 default profile home
2. **API 兼容**: 原 `window.hermesAPI` 完全保留，不受影响
3. **配置兼容**: `profile-runtime.yaml` 支持增量字段扩展，不破坏旧配置
4. **单 Profile 模式**: 不导入配置时，等价于 V1.0 单 Profile 模式

---

# 8. 分阶段实施技术方案

## Phase 1: SQLite Runtime DB

**核心交付物**: `profile-runtime.db` 建表 + 迁移机制

**新增文件**:
| 文件 | 职责 |
|------|------|
| `src/main/profile-runtime-db.ts` | SQLite 初始化、迁移、CRUD 操作 |

**实现要点**:
1. 使用 `better-sqlite3` 创建 `~/.hermes/desktop/profile-runtime.db`
2. 启用 WAL 模式：`db.pragma('journal_mode = WAL')`
3. 设置 `busy_timeout`：`db.pragma('busy_timeout = 5000')`
4. 执行 9 张表 DDL + 索引创建
5. 实现 `schema_version` 迁移版本管理
6. 实现完整的 CRUD Repository 方法

**依赖**: better-sqlite3（已存在于项目中，用于 sessions.ts）

---

## Phase 2: Config Importer

**核心交付物**: YAML 解析 + 校验 + 目录创建 + DB 写入

**新增文件**:
| 文件 | 职责 |
|------|------|
| `src/main/config-importer.ts` | profile-runtime.yaml 解析、校验、导入编排 |

**实现要点**:
1. YAML 解析：使用 `yaml` 或 `js-yaml` 库
2. 校验链：格式 → 名称唯一性 → 端口唯一性 → Adapter 可用性 → 名称合法性
3. 目录创建：通过 `profileHome(name)` 创建 Profile 目录结构
4. DB 写入：在事务内写入 `profiles` + `runtime_instances` + `profile_capabilities` + `profile_skills` + `profile_entries`
5. 事务回滚：任一步骤失败回滚 DB + 清理已创建目录
6. 审计记录：写入 `audit_events`

---

## Phase 3: Runtime Adapter + Gateway Supervisor

**核心交付物**: HermesLocalRuntimeAdapter + 健康检查 + 进程监管

**新增文件**:
| 文件 | 职责 |
|------|------|
| `src/main/runtime-adapter.ts` | RuntimeAdapter 接口定义 |
| `src/main/hermes-local-adapter.ts` | HermesLocalRuntimeAdapter 实现 |
| `src/main/gateway-supervisor.ts` | GatewaySupervisorCapability 实现 |
| `src/main/plugin-registry.ts` | PluginRegistry 实现 |
| `src/main/profile-runtime-manager.ts` | ProfileRuntimeManager 实现 |

**实现要点**:
1. `HermesLocalRuntimeAdapter` 复用 `hermes.ts` 的 spawn/kill/health 逻辑，端口参数化
2. `GatewaySupervisorCapability` 实现 15 秒间隔健康轮询，3 次连续失败标记 `failed`
3. `PluginRegistry` 注册 `hermes-local` Adapter + 4 个 Capability Plugin
4. `ProfileRuntimeManager` 实现完整生命周期：start/stop/restart/startAll/stopAll
5. 状态流转保护：仅允许 `stopped → starting → running` 等合法路径
6. App `before-quit` 时调用 `stopAll()`

---

## Phase 4: IPC + Preload

**核心交付物**: `window.profileRuntime` + `window.profileEntry` + 类型定义

**新增文件**:
| 文件 | 职责 |
|------|------|
| `src/main/profile-runtime-ipc.ts` | 所有 `profile-runtime:*` IPC handler 注册 |
| `src/preload/profile-runtime-api.ts` | `window.profileRuntime` Preload 封装 |
| `src/preload/profile-entry-api.ts` | `window.profileEntry` Preload 封装 |
| `src/shared/profile-runtime-contract.ts` | 完整 TypeScript 类型定义 |

**修改文件**:
| 文件 | 修改范围 |
|------|---------|
| `src/main/index.ts` | `setupIPC()` 中调用 `setupProfileRuntimeIPC()` |
| `src/preload/index.ts` | 新增 `contextBridge.exposeInMainWorld('profileRuntime', ...)` 和 `contextBridge.exposeInMainWorld('profileEntry', ...)` |
| `src/preload/index.d.ts` | 扩展 Window 类型定义 |

**实现要点**:
1. IPC 通道统一使用 `profile-runtime:` 前缀
2. Preload 不暴露 Node.js / SQLite / FS 直接访问
3. 推送事件：`profile-runtime:status_changed`、`profile-runtime:delegation_chunk` 等
4. 完整 `.d.ts` 类型定义，Renderer 获得编译时类型检查

---

## Phase 5: Profile Entry Router + UI Shell

**核心交付物**: AIOSWorkspaceScreen + ProfileWorkspaceScreen + 导航分组

**新增文件**:
| 文件 | 职责 |
|------|------|
| `src/main/profile-entry-router.ts` | ProfileEntryRouter 实现 |
| `src/renderer/screens/ProfileRuntime/ProfileRuntimeScreen.tsx` | Runtime 管理面板 |
| `src/renderer/screens/AIOSWorkspace/AIOSWorkspaceScreen.tsx` | default 主控工作台 |
| `src/renderer/screens/ProfileWorkspace/ProfileWorkspaceScreen.tsx` | specialist 独立工作台 |
| `src/renderer/components/profile-runtime/` | 子组件目录 |

**实现要点**:
1. `AIOSWorkspaceScreen`: 主控对话 + 多 Profile 状态概览 + 委派入口 + Web Operator + 结果汇总
2. `ProfileWorkspaceScreen`: 独立 chat + skills + context + audit 面板
3. 导航分组：AI-OS（default）、Experts（specialist 列表）、Runtime（管理面板）、Operator（Web Operator）
4. 路由注册：从 `profile_entries` 表读取，动态生成路由
5. 路由冲突检测：注册时检查 `route_path` 唯一性
6. 布局持久化：保存到 `profile_entries.layout_config`

---

## Phase 6: Delegation Capability

**核心交付物**: 委托调用 + stream + context refs + 审计

**新增文件**:
| 文件 | 职责 |
|------|------|
| `src/main/delegation-capability.ts` | DelegationCapability 实现 |

**实现要点**:
1. `invoke()` 方法：检查目标 running → 解析 context refs → POST /v1/chat/completions → 记录事件
2. Stream 模式：通过 IPC 推送 `profile-runtime:delegation_chunk` 事件给 Renderer
3. Context refs 解析：读取目标 Profile 的 `shared-context/` 目录中的 `context.md`
4. 请求超时：默认 30s，可配置
5. 事件记录：写入 `delegation_events` + `audit_events`
6. 错误处理：目标未运行 → `PROFILE_RUNTIME_NOT_DEPLOYED`，请求失败 → `PROFILE_DELEGATION_FAILED`

---

## Phase 7: Skill Sync

**核心交付物**: 技能复制 + 冲突策略 + 校验和 + 审计

**新增文件**:
| 文件 | 职责 |
|------|------|
| `src/main/skill-sync-capability.ts` | SkillSyncCapability 实现 |

**实现要点**:
1. `copySkill()`: 解析源技能路径 → 检查目标冲突 → 备份(overwrite) → 复制 → 校验和验证
2. 冲突策略：`overwrite=false` 跳过，`overwrite=true` 备份后覆盖
3. 校验和：使用 Node.js `crypto.createHash('sha256')` 计算文件 SHA-256
4. 备份命名：`{原文件名}.backup.{timestamp}`
5. `syncAllSkills()`: 批量同步，返回每个技能的操作结果
6. 事件记录：写入 `skill_sync_events` + `audit_events`
7. 错误回滚：复制失败时删除不完整目标文件

---

## Phase 8: Session Context Share

**核心交付物**: 上下文导出 + 三种模式 + shared-context 目录

**新增文件**:
| 文件 | 职责 |
|------|------|
| `src/main/session-share-capability.ts` | SessionShareCapability 实现 |

**实现要点**:
1. `shareSessionContext()`: 读取源会话数据 → 生成 context.md → 写入目标 shared-context/
2. **snapshot 模式**: 完整快照，包含所有消息原文
3. **summary 模式**: 仅包含关键信息摘要（用户意图 + assistant 结论）
4. **full 模式**: 完整消息历史，包含所有 role/content/timestamp
5. 禁止直接复制 `state.db`：通过 SQLite 读取后重新格式化为 Markdown
6. 写入目录：`~/.hermes/profiles/{target}/shared-context/{source}-{sessionId}.md`
7. 事件记录：写入 `shared_contexts` + `audit_events`
8. 错误处理：源会话不存在 → `PROFILE_CONTEXT_SOURCE_SESSION_NOT_FOUND`

---

## Phase 9: Web Operator Profile-Aware

**核心交付物**: profileId 溯源 + Tool Bridge 扩展 + 审计

**新增文件**:
| 文件 | 职责 |
|------|------|
| `src/main/web-operator-profile-bridge.ts` | WebOperatorProfileBridge 实现 |

**修改文件**:
| 文件 | 修改范围 |
|------|---------|
| `src/main/browser/browser-ipc.ts` | IPC handler 新增 `profileId` 参数 |
| `src/main/browser/browser-tool-bridge.ts` | 注入 `sourceProfile` 字段 |
| `src/main/browser/browser-audit.ts` | 日志新增 `profileId` 字段 |
| `src/preload/browser-api.ts` | API 新增 `profileId` 参数 |

**实现要点**:
1. 所有 browser 操作携带 `profileId`：`browser.open({ url, profileId })` 等
2. Tool Bridge 请求自动注入 `sourceProfile` 字段
3. `WebOperatorProfileBridge` 包装 BrowserController，增加权限校验 + 审计
4. 敏感操作确认：文件删除、表单提交等操作需用户确认
5. Profile 权限校验：profileId 必须在允许列表中
6. 审计写入：所有 browser action 写入 `audit_events`

---

# 9. 测试策略

## 9.1 单元测试范围

| 测试目标 | 测试文件 | 关键断言 |
|---------|---------|---------|
| SQLite 初始化与迁移 | `tests/profile-runtime-db.test.ts` | 建表成功、迁移幂等、WAL 模式 |
| ConfigImporter 校验 | `tests/config-importer.test.ts` | 名称/端口冲突检测、YAML 解析、目录创建 |
| Runtime Adapter | `tests/hermes-local-adapter.test.ts` | validate/start/stop/health 接口 |
| DelegationCapability | `tests/delegation-capability.test.ts` | 目标状态检查、context refs 解析 |
| SkillSyncCapability | `tests/skill-sync-capability.test.ts` | 复制/冲突/校验和/备份 |
| SessionShareCapability | `tests/session-share-capability.test.ts` | 三种模式、context.md 生成 |
| ProfileEntryRouter | `tests/profile-entry-router.test.ts` | 路由冲突检测、screenType 映射 |
| PluginRegistry | `tests/plugin-registry.test.ts` | 注册/查询/列表 |

## 9.2 集成测试场景

| 场景 | 关键验证 |
|------|---------|
| 配置导入完整流程 | YAML → DB + FS 一致性、事务回滚 |
| Profile 启停生命周期 | stopped → starting → running → stopping → stopped |
| 7 Profile 同时运行 | 端口隔离、独立 Gateway 进程 |
| Delegation 跨 Profile 调用 | SSE 流式转发、context refs 注入 |
| Skill Sync 复制与校验 | SHA-256 一致、备份恢复 |
| Session Share 三种模式 | context.md 格式、目录放置 |
| Web Operator 溯源 | audit_events 记录 profileId |
| App before-quit | 所有 Gateway 停止、SQLite 关闭 |

## 9.3 E2E 测试路径

1. 用户导入配置 → 查看 Profile 列表 → 启动 Profile → 发起委托调用
2. 用户同步技能 → 查看同步结果 → 验证文件存在
3. 用户共享上下文 → 目标 Profile 加载上下文 → 验证内容
4. 用户导航 Experts → 打开 specialist Profile → 独立 chat

---

# 10. 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 端口冲突导致启动失败 | Profile 无法运行 | 中 | 导入时校验端口唯一性，运行时检测并提示用户调整 |
| Gateway 进程残留 | 端口被占用 | 中 | 停止时读取 PID 文件 kill 残留进程，启动前检测端口占用 |
| SQLite 锁冲突 | 并发写入失败 | 低 | 启用 WAL 模式，设置 busy_timeout=5000ms |
| 配置导入部分失败 | 数据不一致 | 低 | 使用事务，失败自动回滚 DB + 清理目录 |
| 技能同步校验失败 | 文件损坏 | 低 | 删除目标文件，恢复备份，标记 failed |
| 委托调用超时 | 用户体验差 | 中 | 设置 30s 超时，记录失败事件，支持重试 |
| 7 Gateway 内存占用 | 系统资源耗尽 | 中 | 支持 autoStart=false，默认仅启动 default |
| 健康检查误判 | Profile 误标记 failed | 低 | 3 次连续失败才标记，单次失败仅 warning |
| Renderer 状态不同步 | UI 显示过时 | 低 | 状态变更主动推送 IPC 事件 |

---

**文档结束**
