# Hermes Desktop V1.2.1 — 企业级一键部署安装方案 实现方案

**文档版本**: v1.0  
**创建日期**: 2026-05-16  
**基线规格**: `.codeartsdoer/specs/hermes-v1.2.1/spec.md`  
**技术栈**: Electron 28+ / TypeScript 5 / React 18 / Zod / better-sqlite3 / Node.js child_process

---

# 1. 实现模型

## 1.1 上下文视图

### 系统边界与外部依赖

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Hermes Desktop V1.2.1                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     Main Process (Enterprise)                         │  │
│  │  ┌─────────────┐ ┌──────────────┐ ┌───────────────┐ ┌────────────┐ │  │
│  │  │ Enterprise  │→│ Preflight    │→│ Runtime Bundle│→│ Agent      │ │  │
│  │  │ Installer   │ │ Checker      │ │ Manager       │ │ Installer  │ │  │
│  │  └──────┬──────┘ └──────────────┘ └───────────────┘ └─────┬──────┘ │  │
│  │         │         ┌──────────────┐ ┌───────────────┐       │        │  │
│  │         │→        │ Profile      │→│ Gateway       │→       │        │  │
│  │         │         │ Bootstrapper │ │ Supervisor    │       │        │  │
│  │         │         └──────────────┘ └───────────────┘       │        │  │
│  │         │         ┌──────────────┐ ┌───────────────┐       │        │  │
│  │         │→        │ Runtime      │ │ Enterprise    │←──────┘        │  │
│  │         │         │ Doctor       │ │ Updater/Repair│                │  │
│  │         │         └──────────────┘ └───────────────┘                │  │
│  │  ┌──────┴──────┐ ┌──────────────┐ ┌───────────────┐ ┌────────────┐ │  │
│  │  │ Deployment  │ │ Install      │ │ Checksum      │ │ Install    │ │  │
│  │  │ Config      │ │ Lock/Marker  │ │ Verifier      │ │ Log        │ │  │
│  │  └─────────────┘ └──────────────┘ └───────────────┘ └────────────┘ │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     Preload (IPC Bridge)                              │  │
│  │  EnterpriseInstallAPI → 13 IPC Channels → Main Process Handlers      │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     Renderer (Enterprise Install UI)                  │  │
│  │  11-态状态机 → 8+ Panel 组件 → IPC 订阅进度 → 实时 UI 反馈          │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
         ↕                    ↕                    ↕
  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐
  │ Python Venv   │  │ Artifact     │  │ Windows FS / Proc    │
  │ (shared)      │  │ Server /     │  │ (%LOCALAPPDATA% /    │
  │               │  │ PyPI Mirror  │  │  %USERPROFILE%)      │
  └──────────────┘  └──────────────┘  └──────────────────────┘
```

### 与现有 V1.0 代码的继承关系

| 现有模块 | V1.2.1 改造策略 |
|---------|----------------|
| `src/main/installer.ts` | 保留为 fallback 安装器；新增 `enterprise/enterprise-installer.ts` 为主入口 |
| `src/main/gateway-supervisor.ts` | **复用**，增加 `startupTimeoutMs` 可配置化 |
| `src/main/profile-runtime-manager.ts` | **复用**，增加 `isPortOccupied` 端口递增分配逻辑 |
| `src/main/profile-runtime-db.ts` | **复用**，Enterprise 引导时直接调用 `initProfileRuntimeDb` |
| `src/main/profile-runtime-ipc.ts` | **扩展**，新增 13 个 Enterprise IPC handler |
| `src/preload/index.ts` | **扩展**，新增 `enterpriseInstallApi` 命名空间 |
| `src/shared/profile-runtime/` | **扩展**，新增 Enterprise 类型与合约 |
| `src/renderer/src/screens/Install/` | 保留为旧安装流程；新增 `EnterpriseInstall/` 屏幕 |

## 1.2 服务/组件总体架构

### 模块依赖图

```
enterprise-installer ──→ deployment-config
                     ├──→ preflight-checker
                     ├──→ runtime-bundle-manager ──→ checksum-verifier
                     ├──→ hermes-agent-source-installer
                     ├──→ python-venv-installer
                     ├──→ enterprise-config-provisioner
                     ├──→ profile-runtime-bootstrapper ──→ profile-policy-installer
                     ├──→ install-lock
                     ├──→ install-marker
                     ├──→ install-log
                     └──→ doctor/runtime-doctor

enterprise-updater ──→ runtime-bundle-manager
                  ├──→ hermes-agent-source-installer
                  ├──→ install-marker
                  └──→ doctor/runtime-doctor

enterprise-repair ──→ doctor/runtime-doctor
                 ├──→ python-venv-installer
                 ├──→ hermes-agent-source-installer
                 └──→ profile-runtime-bootstrapper

enterprise-rollback ──→ install-marker
                   └──→ doctor/runtime-doctor
```

### 目录结构

```
src/main/enterprise/
├── deployment-config.ts          # deployment.json 加载与 Zod 校验
├── deployment-schema.ts          # Zod schema 定义
├── runtime-bundle-manager.ts     # Bundle 下载/解压/复用
├── checksum-verifier.ts          # SHA-256 / 数字签名校验
├── preflight-checker.ts          # 环境预检 (P0/P1/P2)
├── runtime-bootstrapper.ts       # Python runtime 检测与配置
├── hermes-agent-source-installer.ts  # Agent 源码获取 (git-clone/bundle)
├── python-venv-installer.ts      # Shared venv 创建/复用/依赖安装
├── enterprise-config-provisioner.ts  # 默认 HERMES_HOME 配置生成
├── profile-runtime-bootstrapper.ts   # 7 Profile 引导
├── profile-policy-installer.ts   # Skills 分配 + Policy 只读标记
├── enterprise-installer.ts       # 安装流水线编排 (12+ 步)
├── enterprise-updater.ts         # Desktop/Agent 更新
├── enterprise-repair.ts          # L1-L5 修复
├── enterprise-rollback.ts        # 多维度回滚
├── install-marker.ts             # install-marker.json 读写
├── install-lock.ts               # 文件锁防并发
├── install-log.ts                # 结构化安装日志
├── enterprise-ipc.ts             # 13 IPC handler 注册
└── doctor/
    ├── runtime-doctor.ts         # Doctor 入口（9 项检查编排）
    ├── check-gateway-reachable.ts
    ├── check-python-deps.ts
    ├── check-agent-files.ts
    ├── check-profile-db.ts
    ├── check-skills.ts
    ├── check-policy.ts
    ├── check-port-binding.ts
    ├── check-dir-permission.ts
    └── check-config-validity.ts

src/shared/enterprise/
├── enterprise-contract.ts        # TS 类型 + API 接口定义
├── enterprise-schema.ts          # 共享 Zod schema（前后端共用校验）
└── enterprise-constants.ts       # 常量（状态枚举/错误码/默认值）

src/preload/
└── enterprise-install-api.ts     # EnterpriseInstallAPI Preload 暴露

src/renderer/src/screens/EnterpriseInstall/
├── EnterpriseInstallScreen.tsx    # 主屏幕（状态机驱动）
├── SplashScreen.tsx              # splash 态
├── DeploymentConfigPanel.tsx      # 配置展示/确认
├── PreflightPanel.tsx            # 预检结果展示
├── RuntimeBundlePanel.tsx        # Bundle 进度
├── InstallProgressPanel.tsx      # 通用安装进度
├── ProfileBootstrapPanel.tsx     # Profile 引导进度
├── DoctorPanel.tsx               # Doctor 结果展示
├── InstallSuccessPanel.tsx       # 安装成功摘要
├── InstallErrorPanel.tsx         # 错误展示与操作
├── use-install-state-machine.ts  # 11 态状态机 Hook
└── use-install-ipc.ts            # IPC 订阅 Hook
```

## 1.3 实现设计文档

### 1.3.1 Deployment Config 模块

**文件**: `src/main/enterprise/deployment-config.ts` + `deployment-schema.ts`

**核心职责**: 加载并校验 deployment.json，提供类型安全的配置访问。

```typescript
// deployment-schema.ts — Zod Schema 定义
import { z } from "zod";

const DeploymentConfigSchema = z.object({
  schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  company: z.string().min(1),
  installMode: z.enum(["windows-native", "wsl2"]),
  installScope: z.enum(["employee", "developer", "offline"]),
  desktop: z.object({
    channel: z.enum(["stable", "beta", "canary"]),
    autoUpdate: z.boolean(),
    updateProvider: z.enum(["github", "internal"]),
    updateUrl: z.string().url().optional(),
  }),
  runtimeBundle: z.object({
    sourceType: z.enum(["bundleUrl", "offlineBundlePath", "embedded"]),
    bundleUrl: z.string().url().optional(),
    bundleSha256: z.string().regex(/^[0-9a-f]{64}$/),
    offlineBundlePath: z.string().optional(),
  }).refine(
    (d) => d.sourceType !== "bundleUrl" || d.bundleUrl !== undefined,
    { message: "bundleUrl required when sourceType is bundleUrl" }
  ).refine(
    (d) => d.sourceType !== "offlineBundlePath" || d.offlineBundlePath !== undefined,
    { message: "offlineBundlePath required when sourceType is offlineBundlePath" }
  ),
  hermesAgent: z.object({
    sourceType: z.enum(["git-clone", "bundle"]),
    version: z.string(),
    gitUrl: z.string().optional(),
    branch: z.string().optional(),
    authMode: z.enum(["none", "ssh-key", "personal-access-token"]).optional(),
  }).refine(
    (d) => d.sourceType !== "git-clone" || (d.gitUrl !== undefined && d.branch !== undefined),
    { message: "gitUrl and branch required when sourceType is git-clone" }
  ),
  runtime: z.object({
    pythonVersion: z.string(),
    useBundledPython: z.boolean(),
    pipIndexUrl: z.string().url().optional(),
    wheelhousePath: z.string().optional(),
  }),
  profiles: z.object({
    enabled: z.array(z.string()).min(1),
    autoStart: z.array(z.string()),
    ports: z.record(z.string(), z.number().int().min(1024).max(65535)),
  }),
  gateway: z.object({
    host: z.literal("127.0.0.1"),
    healthPath: z.string().default("/health"),
    startupTimeoutMs: z.number().int().positive().default(30000),
    healthIntervalMs: z.number().int().positive().default(5000),
    autoRestart: z.boolean().default(true),
  }),
  security: z.object({
    verifyManifest: z.boolean().default(false),
  }),
  policy: z.record(z.string(), z.unknown()).optional(),
});

export type DeploymentConfig = z.infer<typeof DeploymentConfigSchema>;
```

```typescript
// deployment-config.ts — 加载逻辑
export interface LoadConfigResult {
  ok: boolean;
  config?: DeploymentConfig;
  error?: string;
  usedDefault?: boolean;
}

export async function loadDeploymentConfig(
  configPath?: string
): Promise<LoadConfigResult>

export function getDefaultConfig(): DeploymentConfig
// 返回内置默认配置（7 Profile、8642-8648 端口、windows-native 模式）
```

**错误处理**: 
- 文件不存在 → `usedDefault: true`，使用默认配置 + P1 警告
- Schema 校验失败 → `ok: false, error: ZodError.issues` 详情
- 文件读取 IO 错误 → `ok: false, error: 系统错误信息`

### 1.3.2 Preflight Checker 模块

**文件**: `src/main/enterprise/preflight-checker.ts`

**核心职责**: 执行 P0/P1/P2 三级环境预检，禁止修改任何系统状态。

```typescript
export type PreflightSeverity = "P0" | "P1" | "P2";
export type PreflightStatus = "pass" | "fail" | "warn" | "info" | "unknown";

export interface PreflightCheckResult {
  id: string;                // 如 "P0-WIN-VERSION"
  severity: PreflightSeverity;
  status: PreflightStatus;
  title: string;
  detail: string;
  suggestion?: string;
  durationMs: number;
}

export interface PreflightReport {
  checks: PreflightCheckResult[];
  p0Passed: boolean;         // 所有 P0 是否通过
  p1Warnings: number;        // P1 警告数量
  p2Infos: number;           // P2 信息数量
  totalDurationMs: number;
}

export async function runPreflight(
  config: DeploymentConfig
): Promise<PreflightReport>
// 并发执行 20 项检查（10 P0 + 5 P1 + 5 P2），单项超时 5s
```

**P0 检查项实现映射**:

| ID | 检查项 | 实现方式 |
|----|--------|---------|
| P0-WIN-VERSION | Windows ≥ 10 21H2 | `os.release()` 解析 + `child_process.execSync('ver')` |
| P0-DISK-SPACE | 可用 ≥ 2GB | `fs.statfs` (Node 18+) 或 `child_process.execSync('wmic logicaldisk')` |
| P0-INSTALL-DIR-WRITABLE | 安装目录可写 | `fs.access(path, constants.W_OK)` |
| P0-HERMES-HOME-WRITABLE | .hermes 可写 | `fs.access(path, constants.W_OK)` |
| P0-PORT-AVAILABLE | 默认端口未占 | 复用 `profile-runtime-manager.isPortOccupied()` |
| P0-PYTHON-AVAILABLE | Python 可用 | `which python` / `which python3` / bundled 检测 |
| P0-VENV-CREATABLE | venv 可创建 | 尝试临时 venv 创建 + 清理 |
| P0-BUNDLE-SHA256 | Bundle 校验 | 调用 `checksum-verifier.verifySha256()` |
| P0-PROFILE-DB-CREATABLE | DB 可创建 | SQLite 内存测试连接 |
| P0-DEPLOY-SCHEMA | schema 合法 | Zod parse 结果（已在 loadDeploymentConfig 完成） |

### 1.3.3 Runtime Bundle Manager 模块

**文件**: `src/main/enterprise/runtime-bundle-manager.ts`

**核心职责**: 按 sourceType 获取 Bundle，执行 SHA-256 校验，解压到 runtime 目录。

```typescript
export interface BundleResolveResult {
  ok: boolean;
  bundlePath: string;       // 最终 Bundle 文件路径
  extractedPath: string;    // 解压目标路径
  skipped?: boolean;        // 复用已有 Bundle 时为 true
  error?: string;
}

export async function resolveRuntimeBundle(
  config: DeploymentConfig,
  onProgress?: (percent: number, message: string) => void
): Promise<BundleResolveResult>

// 内部实现:
// 1. sourceType=bundleUrl → HTTP 下载（支持 Range 断点续传）
// 2. sourceType=offlineBundlePath → 校验路径存在
// 3. sourceType=embedded → 从 process.resourcesPath 提取
// 4. 复用检测: install-marker.json 中记录的 bundleSha256 匹配 → skip
// 5. 校验: checksum-verifier.verifySha256(bundlePath, config.runtimeBundle.bundleSha256)
// 6. 解压: adm-zip / extract-zip 到 %LOCALAPPDATA%\AIOS-Hermes\runtime\
```

**断点续传设计**:
- 使用 `Range` HTTP header 请求未下载部分
- 临时文件命名 `hermes-runtime-bundle.zip.part`，完成后 rename
- 下载进度通过 `onProgress` 回调实时上报

### 1.3.4 Checksum Verifier 模块

**文件**: `src/main/enterprise/checksum-verifier.ts`

```typescript
export interface VerifyResult {
  ok: boolean;
  actualHash?: string;
  expectedHash: string;
  durationMs: number;
}

export async function verifySha256(
  filePath: string,
  expectedHash: string
): Promise<VerifyResult>
// 流式计算 SHA-256（crypto.createHash('sha256').update(chunk)）
// 避免大文件一次性读入内存

export async function verifyManifestSignature(
  manifestPath: string
): Promise<VerifyResult>
// 可选：使用 Node crypto.verify() 校验数字签名
// 依赖 deployment.json security.verifyManifest 开关
```

### 1.3.5 Hermes Agent Source Installer 模块

**文件**: `src/main/enterprise/hermes-agent-source-installer.ts`

```typescript
export interface AgentInstallResult {
  ok: boolean;
  agentPath: string;       // agent 源码目录
  version: string;         // 实际安装版本
  error?: string;
}

export async function installHermesAgentSource(
  config: DeploymentConfig,
  runtimePath: string,     // runtime/ 目录路径
  onProgress?: (percent: number, message: string) => void
): Promise<AgentInstallResult>

// sourceType=bundle:
//   - 从 runtime/agent/ 提取（已在 Bundle 解压时完成）
//   - 验证 agent --version 输出与 config.hermesAgent.version 匹配
//
// sourceType=git-clone:
//   - 构造 git clone 命令，注入认证（SSH/PAT 通过环境变量 HTTPS_AIO_TOKEN）
//   - PAT 不落盘：通过 child_process.env 注入，不写文件
//   - clone 完成后 checkout branch，验证版本
```

**安全约束**: Git PAT 仅通过 `env` 注入子进程，不写入文件、不输出到日志（install-log 自动脱敏 `***` 替换）。

### 1.3.6 Python Venv Installer 模块

**文件**: `src/main/enterprise/python-venv-installer.ts`

```typescript
export interface VenvInstallResult {
  ok: boolean;
  venvPath: string;        // %LOCALAPPDATA%\AIOS-Hermes\venv\
  pythonPath: string;      // venv 内 python 可执行路径
  isNewVenv: boolean;      // 新建 or 复用
  error?: string;
}

export async function createOrReuseSharedVenv(
  config: DeploymentConfig,
  installBasePath: string
): Promise<VenvInstallResult>

export async function installPythonDependencies(
  config: DeploymentConfig,
  venvPath: string,
  agentPath: string,
  onProgress?: (percent: number, message: string) => void
): Promise<{ ok: boolean; error?: string }>

// 依赖安装策略:
// 1. wheelhousePath 有值 → pip install --find-links=<wheelhousePath>
// 2. 否则 → pip install -i <pipIndexUrl> (默认 https://pypi.org/simple)
// 3. 使用 uv 优先（如可用），fallback 到 pip
// 4. Windows 路径: venv\Scripts\python.exe (非 venv/bin/python)
```

### 1.3.7 Profile Runtime Bootstrapper 模块

**文件**: `src/main/enterprise/profile-runtime-bootstrapper.ts`

```typescript
export interface ProfileBootstrapResult {
  ok: boolean;
  profileName: string;
  profileHome: string;
  port: number;             // 实际分配端口（可能递增）
  dbInitialized: boolean;
  gatewayStarted: boolean;
  error?: string;
}

export async function bootstrapProfiles(
  config: DeploymentConfig,
  agentPath: string,
  venvPath: string,
  onProgress?: (profileName: string, step: string, percent: number) => void
): Promise<ProfileBootstrapResult[]>

// 对每个 enabled Profile:
// 1. 创建 HERMES_HOME: %USERPROFILE%\.hermes\profiles\<name>\
// 2. 初始化 profile-runtime.db（复用 profile-runtime-db.initProfileRuntimeDb）
// 3. 写入 profiles/runtime_instances 表
// 4. 分配端口: 检测占用 → 递增分配
// 5. 调用 profile-policy-installer 安装 Skills + 标记 readonly
// 6. 保留已有用户数据（conversations/history/custom skills 不覆盖）
```

**端口递增策略**: 
```typescript
async function allocatePort(preferred: number): Promise<number> {
  let port = preferred;
  while (port < preferred + 100 && await isPortOccupied(port)) {
    port++;
  }
  if (await isPortOccupied(port)) {
    throw new EnterpriseInstallError("E_PORT_EXHAUSTED", `端口 ${preferred}-${preferred+99} 均被占用`);
  }
  return port;
}
```

### 1.3.8 Profile Policy Installer 模块

**文件**: `src/main/enterprise/profile-policy-installer.ts`

```typescript
export async function installBundledSkills(
  config: DeploymentConfig,
  profileName: string,
  profileHome: string,
  runtimePath: string
): Promise<{ ok: boolean; installedSkills: string[]; error?: string }>

export async function applyPolicyReadOnly(
  profileId: string
): Promise<{ ok: boolean }>
// 在 profile-runtime.db 中设置 policy.readonly = true
// 运行时修改 Policy 的请求将被拒绝
```

### 1.3.9 Enterprise Installer（流水线编排）

**文件**: `src/main/enterprise/enterprise-installer.ts`

**核心职责**: 编排 12+ 步安装流水线，每步有明确的成功/失败/回滚语义。

```typescript
export type InstallStage =
  | "checkEnterpriseInstall"
  | "loadDeploymentConfig"
  | "acquireInstallLock"
  | "runPreflight"
  | "resolveRuntimeBundle"
  | "verifyBundleChecksum"
  | "installRuntimeTools"
  | "installHermesAgentSource"
  | "createOrReuseSharedVenv"
  | "installPythonDependencies"
  | "provisionDefaultHermesHome"
  | "bootstrapProfileRuntimeDb"
  | "bootstrapProfiles"
  | "installBundledSkills"
  | "applyPolicy"
  | "startDefaultGateway"
  | "optionalStartAutoStartProfiles"
  | "runRuntimeDoctor"
  | "writeInstallMarker"
  | "openAIOSWorkspace";

export interface InstallProgressEvent {
  stage: InstallStage;
  status: "running" | "completed" | "failed" | "skipped";
  progress: number;          // 0-100 全局百分比
  message: string;
  error?: string;
  timestamp: string;
}

export interface EnterpriseInstallResult {
  ok: boolean;
  completedStages: InstallStage[];
  failedStage?: InstallStage;
  error?: string;
  doctorResult?: DoctorReport;
  marker?: InstallMarker;
}

export async function executeEnterpriseInstallPipeline(
  config?: DeploymentConfig,
  onProgress?: (event: InstallProgressEvent) => void,
  cancellationToken?: { cancelled: boolean }
): Promise<EnterpriseInstallResult>

// 流水线核心逻辑:
// 1. 有序执行 STAGES 数组中每步
// 2. 每步开始推送 {stage, status:'running'}
// 3. 每步完成推送 {stage, status:'completed'}，推进 progress
// 4. 任一步失败 → 终止流水线，推送 {stage, status:'failed'}
// 5. 检查 cancellationToken.cancelled → 执行清理
// 6. 已有安装检测 (checkEnterpriseInstall) → install-marker 存在则跳过
```

**流水线步骤与进度映射**:

| # | Stage | 权重 | 调用模块 |
|---|-------|------|---------|
| 1 | checkEnterpriseInstall | 2% | install-marker.exists() |
| 2 | loadDeploymentConfig | 3% | deployment-config.loadDeploymentConfig() |
| 3 | acquireInstallLock | 1% | install-lock.acquire() |
| 4 | runPreflight | 5% | preflight-checker.runPreflight() |
| 5 | resolveRuntimeBundle | 15% | runtime-bundle-manager.resolveRuntimeBundle() |
| 6 | verifyBundleChecksum | 3% | checksum-verifier.verifySha256() |
| 7 | installRuntimeTools | 5% | runtime-bootstrapper |
| 8 | installHermesAgentSource | 10% | hermes-agent-source-installer |
| 9 | createOrReuseSharedVenv | 8% | python-venv-installer.createOrReuseSharedVenv() |
| 10 | installPythonDependencies | 15% | python-venv-installer.installPythonDependencies() |
| 11 | provisionDefaultHermesHome | 2% | enterprise-config-provisioner |
| 12 | bootstrapProfileRuntimeDb | 3% | profile-runtime-db.initProfileRuntimeDb() |
| 13 | bootstrapProfiles | 10% | profile-runtime-bootstrapper.bootstrapProfiles() |
| 14 | installBundledSkills | 3% | profile-policy-installer.installBundledSkills() |
| 15 | applyPolicy | 2% | profile-policy-installer.applyPolicyReadOnly() |
| 16 | startDefaultGateway | 5% | profile-runtime-manager.startProfile("default") |
| 17 | optionalStartAutoStartProfiles | 3% | 逐一启动 autoStart Profiles |
| 18 | runRuntimeDoctor | 3% | runtime-doctor.runAllChecks() |
| 19 | writeInstallMarker | 1% | install-marker.write() |
| 20 | openAIOSWorkspace | 0% | IPC 通知 Renderer 切换 |

### 1.3.10 Install Lock 模块

**文件**: `src/main/enterprise/install-lock.ts`

```typescript
export interface InstallLockHandle {
  release: () => void;
  lockPath: string;
}

export async function acquireInstallLock(
  timeoutMs?: number  // 默认 10000
): Promise<InstallLockHandle>

// 实现方式:
// 1. lockPath = %LOCALAPPDATA%\AIOS-Hermes\.install-lock
// 2. 使用 fs.open(lockPath, 'wx') 尝试独占创建
// 3. 创建失败 → 等待并重试直到 timeout
// 4. 超时 → 抛出 EnterpriseInstallError("E_INSTALL_LOCK_TIMEOUT")
// 5. release() → fs.unlink(lockPath)
// 6. App 崩溃时：锁文件残留，下次启动检测 stale lock（>5min 视为 stale 自动清理）
```

### 1.3.11 Install Marker 模块

**文件**: `src/main/enterprise/install-marker.ts`

```typescript
export interface InstallMarker {
  schemaVersion: string;
  installedAt: string;
  desktopVersion: string;
  agentVersion: string;
  installPath: string;
  hermesHomePath: string;
  profiles: Array<{
    name: string;
    port: number;
    status: "bootstrapped" | "failed";
    gatewayStatus: "running" | "stopped";
  }>;
  deploymentConfigHash: string;
  doctorResult: DoctorReportSummary;
  rollbackSnapshots?: RollbackSnapshot[];
}

export async function writeInstallMarker(marker: InstallMarker): Promise<void>
export async function readInstallMarker(): Promise<InstallMarker | null>
export async function existsInstallMarker(): Promise<boolean>
```

### 1.3.12 Install Log 模块

**文件**: `src/main/enterprise/install-log.ts`

```typescript
export type InstallLogLevel = "info" | "warn" | "error";

export interface InstallLogEntry {
  timestamp: string;        // ISO 8601 毫秒精度
  stage: InstallStage;
  level: InstallLogLevel;
  message: string;          // 已脱敏
  errorCode?: string;       // 如 "E_PREFLIGHT_PORT_CONFLICT"
}

// 脱敏规则:
// - 匹配 /token|password|secret|key|auth/i 的值替换为 ***
// - 不记录用户名、主机名、IP 地址明文

export function createInstallLogger(logDir: string): {
  info: (stage: InstallStage, message: string) => void;
  warn: (stage: InstallStage, message: string, errorCode?: string) => void;
  error: (stage: InstallStage, message: string, errorCode: string) => void;
  close: () => void;
  getLogPath: () => string;
}
// JSON Lines 格式写入 install-<timestamp>.log
```

### 1.3.13 Runtime Doctor 模块

**文件**: `src/main/enterprise/doctor/runtime-doctor.ts`

```typescript
export type DoctorCheckStatus = "pass" | "fail" | "warn" | "error";

export interface DoctorCheckResult {
  checkName: string;
  status: DoctorCheckStatus;
  detail: string;
  suggestion?: string;
  durationMs: number;
}

export interface DoctorReport {
  checks: DoctorCheckResult[];
  passCount: number;
  failCount: number;
  warnCount: number;
  totalDurationMs: number;
  timestamp: string;
}

export async function runAllChecks(
  config: DeploymentConfig,
  marker: InstallMarker
): Promise<DoctorReport>
// 并发执行 9 项检查，单项超时 10s

export async function exportDoctorReport(
  report: DoctorReport,
  exportPath: string
): Promise<string>
// 导出为 doctor-report-<timestamp>.json
```

**9 项检查映射**:

| # | 检查项 | 实现 |
|---|--------|------|
| 1 | Gateway 可达性 | `fetch(http://127.0.0.1:<port>/health)` |
| 2 | Python 依赖完整性 | `venv/bin/python -c "import requirements"` |
| 3 | hermes-agent 文件完整性 | 核心入口文件 exists + SHA-256 抽查 |
| 4 | profile-runtime.db 有效性 | SQLite PRAGMA integrity_check |
| 5 | Skills 安装完整性 | 遍历 profile-runtime.db skills 表 + 文件系统校验 |
| 6 | Policy 一致性 | DB readonly 标记与实际文件权限对比 |
| 7 | 端口绑定正确性 | `isPortOccupied(port)` + 确认绑定 127.0.0.1 |
| 8 | 目录权限正确性 | Windows ACL 读取校验 |
| 9 | 配置文件合法性 | config.yaml / .env Zod schema 校验 |

### 1.3.14 Enterprise Updater 模块

**文件**: `src/main/enterprise/enterprise-updater.ts`

```typescript
export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  updateType?: "desktop" | "agent";
}

export async function checkForUpdates(
  config: DeploymentConfig
): Promise<UpdateCheckResult>

export async function updateDesktop(): Promise<{ ok: boolean; error?: string }>
// 委托 electron-updater (NSIS oneClick perMachine:false)

export async function updateAgent(
  config: DeploymentConfig,
  onProgress?: (percent: number, message: string) => void
): Promise<{ ok: boolean; previousVersion: string; newVersion: string; error?: string }>
// 流程: 停止 Gateway → 备份 agent → 下载新版本 → 校验 → 替换 → Doctor → 启动
```

### 1.3.15 Enterprise Repair 模块

**文件**: `src/main/enterprise/enterprise-repair.ts`

```typescript
export type RepairLevel = 1 | 2 | 3 | 4 | 5;

// L1: 检查/重启 Gateway pid
// L2: 重建 venv (createOrReuseSharedVenv + installPythonDependencies)
// L3: 校验/修复 agent 文件 (checksum + 重新解压 Bundle)
// L4: 校验/修复 profile-runtime.db (PRAGMA integrity_check + 重建)
// L5: 重建 Profile (删除 profile home + 重新 bootstrap)

export async function executeRepair(
  level: RepairLevel,
  config: DeploymentConfig,
  onProgress?: (stage: string, percent: number) => void
): Promise<{ ok: boolean; repairedLevels: RepairLevel[]; doctorResult: DoctorReport }>
// 依次执行 L1 到 L(level)，每级包含低级所有修复
```

### 1.3.16 Enterprise Rollback 模块

**文件**: `src/main/enterprise/enterprise-rollback.ts`

```typescript
export type RollbackTarget = "desktop" | "agent" | "runtime-bundle" | "profile-db" | "profile-config";

export interface RollbackSnapshot {
  type: RollbackTarget;
  version: string;
  createdAt: string;
  path: string;            // 备份目录路径
  checksum: string;        // 备份 SHA-256
}

export async function createRollbackSnapshot(
  target: RollbackTarget,
  sourcePath: string
): Promise<RollbackSnapshot>
// 备份到 %LOCALAPPDATA%\AIOS-Hermes\rollback\<target>-<timestamp>\

export async function executeRollback(
  target: RollbackTarget,
  snapshot: RollbackSnapshot
): Promise<{ ok: boolean; doctorResult: DoctorReport; error?: string }>
// 校验备份 checksum → 停止相关服务 → 恢复 → Doctor
```

### 1.3.17 Enterprise Config Provisioner 模块

**文件**: `src/main/enterprise/enterprise-config-provisioner.ts`

```typescript
export async function provisionDefaultHermesHome(
  config: DeploymentConfig,
  agentPath: string,
  venvPath: string
): Promise<{ ok: boolean; hermesHome: string }>
// 1. 创建 %USERPROFILE%\.hermes\ 目录结构
// 2. 生成 config.yaml (gateway host/port/log 等)
// 3. 生成 .env (API keys 占位，不填真实值)
// 4. 已有配置 → 保留，新配置写 .new 后缀
```

---

# 2. 接口设计

## 2.1 总体设计

### IPC 通道命名规范

所有 Enterprise 安装相关 IPC 遵循 `enterprise-install:<action>` 命名空间。

### 通信模式

| 模式 | 使用场景 | 实现方式 |
|------|---------|---------|
| invoke/handle | 请求-响应（查询状态、触发操作） | `ipcMain.handle` / `ipcRenderer.invoke` |
| on/send | 事件推送（进度、状态变更） | `mainWindow.webContents.send` / `ipcRenderer.on` |

## 2.2 接口清单

### EnterpriseInstallAPI（Preload 暴露给 Renderer）

```typescript
// src/shared/enterprise/enterprise-contract.ts

export interface EnterpriseInstallAPI {
  // === 安装流水线 ===
  
  /** 检查是否已完成企业安装 */
  checkEnterpriseInstall(): Promise<boolean>;
  // IPC: enterprise-install:check

  /** 获取 deployment.json 配置（加载后供 UI 展示） */
  getDeploymentConfig(): Promise<DeploymentConfig | null>;
  // IPC: enterprise-install:getConfig

  /** 确认配置并启动安装流水线 */
  startEnterpriseInstall(config?: DeploymentConfig): Promise<void>;
  // IPC: enterprise-install:start

  /** 取消正在进行的安装 */
  cancelEnterpriseInstall(): Promise<void>;
  // IPC: enterprise-install:cancel

  /** 订阅安装进度事件 */
  onInstallProgress(
    callback: (event: InstallProgressEvent) => void
  ): () => void;
  // IPC: enterprise-install:onProgress (main→renderer push)

  // === Preflight ===
  
  /** 单独执行 Preflight 检查（安装前预览） */
  runPreflight(): Promise<PreflightReport>;
  // IPC: enterprise-install:runPreflight

  // === Runtime Doctor ===
  
  /** 执行 Runtime Doctor 诊断 */
  runRuntimeDoctor(): Promise<DoctorReport>;
  // IPC: enterprise-install:runDoctor

  /** 导出 Doctor 报告为 JSON 文件 */
  exportDoctorReport(report: DoctorReport): Promise<string>;
  // IPC: enterprise-install:exportDoctor

  // === 更新 ===
  
  /** 检查可用更新 */
  checkForUpdates(): Promise<UpdateCheckResult>;
  // IPC: enterprise-install:checkUpdates

  /** 执行 Agent 更新 */
  updateAgent(): Promise<{ ok: boolean; error?: string }>;
  // IPC: enterprise-install:updateAgent

  // === 修复 ===
  
  /** 执行修复 */
  executeRepair(level: RepairLevel): Promise<{
    ok: boolean;
    repairedLevels: RepairLevel[];
    doctorResult: DoctorReport;
  }>;
  // IPC: enterprise-install:repair

  // === 回滚 ===
  
  /** 获取可用回滚快照 */
  listRollbackSnapshots(): Promise<RollbackSnapshot[]>;
  // IPC: enterprise-install:listSnapshots

  /** 执行回滚 */
  executeRollback(
    target: RollbackTarget,
    snapshotId: string
  ): Promise<{ ok: boolean; doctorResult: DoctorReport }>;
  // IPC: enterprise-install:rollback

  // === 安装日志 ===
  
  /** 获取安装日志路径 */
  getInstallLogPath(): Promise<string>;
  // IPC: enterprise-install:getLogPath
}
```

### IPC Handler 注册

```typescript
// src/main/enterprise/enterprise-ipc.ts

export function setupEnterpriseInstallIPC(mainWindow: BrowserWindow): void {
  // invoke handlers
  ipcMain.handle("enterprise-install:check", ...);
  ipcMain.handle("enterprise-install:getConfig", ...);
  ipcMain.handle("enterprise-install:start", ...);
  ipcMain.handle("enterprise-install:cancel", ...);
  ipcMain.handle("enterprise-install:runPreflight", ...);
  ipcMain.handle("enterprise-install:runDoctor", ...);
  ipcMain.handle("enterprise-install:exportDoctor", ...);
  ipcMain.handle("enterprise-install:checkUpdates", ...);
  ipcMain.handle("enterprise-install:updateAgent", ...);
  ipcMain.handle("enterprise-install:repair", ...);
  ipcMain.handle("enterprise-install:listSnapshots", ...);
  ipcMain.handle("enterprise-install:rollback", ...);
  ipcMain.handle("enterprise-install:getLogPath", ...);

  // 进度推送 (main → renderer)
  // 在 executeEnterpriseInstallPipeline 的 onProgress 回调中:
  //   mainWindow.webContents.send("enterprise-install:progress", event);
}
```

### Preload 桥接

```typescript
// src/preload/enterprise-install-api.ts

import { contextBridge, ipcRenderer } from "electron";

export const enterpriseInstallApi: EnterpriseInstallAPI = {
  checkEnterpriseInstall: () => ipcRenderer.invoke("enterprise-install:check"),
  getDeploymentConfig: () => ipcRenderer.invoke("enterprise-install:getConfig"),
  startEnterpriseInstall: (config?) => ipcRenderer.invoke("enterprise-install:start", config),
  cancelEnterpriseInstall: () => ipcRenderer.invoke("enterprise-install:cancel"),
  onInstallProgress: (callback) => {
    const handler = (_e: any, event: InstallProgressEvent) => callback(event);
    ipcRenderer.on("enterprise-install:progress", handler);
    return () => ipcRenderer.removeListener("enterprise-install:progress", handler);
  },
  runPreflight: () => ipcRenderer.invoke("enterprise-install:runPreflight"),
  runRuntimeDoctor: () => ipcRenderer.invoke("enterprise-install:runDoctor"),
  exportDoctorReport: (report) => ipcRenderer.invoke("enterprise-install:exportDoctor", report),
  checkForUpdates: () => ipcRenderer.invoke("enterprise-install:checkUpdates"),
  updateAgent: () => ipcRenderer.invoke("enterprise-install:updateAgent"),
  executeRepair: (level) => ipcRenderer.invoke("enterprise-install:repair", level),
  listRollbackSnapshots: () => ipcRenderer.invoke("enterprise-install:listSnapshots"),
  executeRollback: (target, snapshotId) => ipcRenderer.invoke("enterprise-install:rollback", target, snapshotId),
  getInstallLogPath: () => ipcRenderer.invoke("enterprise-install:getLogPath"),
};
```

**在 `src/preload/index.ts` 中集成**:
```typescript
const hermesAPI = {
  // ...existing APIs...
  enterpriseInstall: enterpriseInstallApi,
};
```

---

# 3. 数据模型

## 3.1 设计目标

1. **类型安全**: 所有数据模型通过 Zod schema 定义，运行时校验
2. **前后端共享**: 类型定义放在 `src/shared/enterprise/` 下
3. **向后兼容**: schemaVersion 字段支持配置版本演进
4. **安全脱敏**: Install Log 自动脱敏敏感字段

## 3.2 模型实现

### 3.2.1 DeploymentConfig (deployment.json)

完整 Zod schema 见 1.3.1 节。运行时类型 `DeploymentConfig = z.infer<typeof DeploymentConfigSchema>`。

**默认值**:
```json
{
  "schemaVersion": "1.2.1",
  "company": "AIOS",
  "installMode": "windows-native",
  "installScope": "employee",
  "desktop": { "channel": "stable", "autoUpdate": true, "updateProvider": "github" },
  "runtimeBundle": { "sourceType": "embedded", "bundleSha256": "" },
  "hermesAgent": { "sourceType": "bundle", "version": "1.2.1" },
  "runtime": { "pythonVersion": "3.11.9", "useBundledPython": true },
  "profiles": {
    "enabled": ["default", "writer", "coding", "research", "recruiters", "finance", "agenter"],
    "autoStart": ["default"],
    "ports": { "default": 8642, "writer": 8643, "coding": 8644, "research": 8645, "recruiters": 8646, "finance": 8647, "agenter": 8648 }
  },
  "gateway": { "host": "127.0.0.1", "healthPath": "/health", "startupTimeoutMs": 30000, "healthIntervalMs": 5000, "autoRestart": true },
  "security": { "verifyManifest": false }
}
```

### 3.2.2 InstallMarker (install-marker.json)

```typescript
// src/shared/enterprise/enterprise-contract.ts

export const InstallMarkerSchema = z.object({
  schemaVersion: z.string(),
  installedAt: z.string(),         // ISO 8601
  desktopVersion: z.string(),
  agentVersion: z.string(),
  installPath: z.string(),         // %LOCALAPPDATA%\AIOS-Hermes\
  hermesHomePath: z.string(),      // %USERPROFILE%\.hermes\
  profiles: z.array(z.object({
    name: z.string(),
    port: z.number(),
    status: z.enum(["bootstrapped", "failed"]),
    gatewayStatus: z.enum(["running", "stopped"]),
  })),
  deploymentConfigHash: z.string(),  // SHA-256 of deployment.json
  doctorResult: z.object({
    passCount: z.number(),
    failCount: z.number(),
    warnCount: z.number(),
    timestamp: z.string(),
  }),
  rollbackSnapshots: z.array(z.object({
    type: z.enum(["desktop", "agent", "runtime-bundle", "profile-db", "profile-config"]),
    version: z.string(),
    createdAt: z.string(),
    path: z.string(),
    checksum: z.string(),
  })).optional(),
});

export type InstallMarker = z.infer<typeof InstallMarkerSchema>;
```

**写入路径**: `%LOCALAPPDATA%\AIOS-Hermes\install-marker.json`

### 3.2.3 InstallLogEntry

```typescript
export const InstallLogEntrySchema = z.object({
  timestamp: z.string(),           // ISO 8601 毫秒精度
  stage: z.string(),               // InstallStage 枚举值
  level: z.enum(["info", "warn", "error"]),
  message: z.string(),             // 已脱敏
  errorCode: z.string().optional(),
});
```

**写入路径**: `%LOCALAPPDATA%\AIOS-Hermes\logs\install\install-<timestamp>.log`  
**格式**: JSON Lines（每行一条 `JSON.stringify(entry)`）

### 3.2.4 DoctorReport / DoctorCheckResult

```typescript
export const DoctorCheckResultSchema = z.object({
  checkName: z.string(),
  status: z.enum(["pass", "fail", "warn", "error"]),
  detail: z.string(),
  suggestion: z.string().optional(),
  durationMs: z.number(),
});

export const DoctorReportSchema = z.object({
  checks: z.array(DoctorCheckResultSchema),
  passCount: z.number(),
  failCount: z.number(),
  warnCount: z.number(),
  totalDurationMs: z.number(),
  timestamp: z.string(),
});
```

### 3.2.5 InstallProgressEvent

```typescript
export const InstallProgressEventSchema = z.object({
  stage: z.string(),
  status: z.enum(["running", "completed", "failed", "skipped"]),
  progress: z.number().min(0).max(100),
  message: z.string(),
  error: z.string().optional(),
  timestamp: z.string(),
});
```

### 3.2.6 profile-runtime.db 扩展

Enterprise 安装在现有 `profile-runtime.db` 中**新增**以下表/字段：

```sql
-- 安装事件审计表
CREATE TABLE IF NOT EXISTS install_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK(event_type IN ('install', 'update', 'repair', 'rollback')),
  stage TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('started', 'completed', 'failed', 'cancelled')),
  version TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);

-- Runtime Doctor 报告表
CREATE TABLE IF NOT EXISTS runtime_doctor_reports (
  id TEXT PRIMARY KEY,
  check_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pass', 'fail', 'warn', 'error')),
  detail TEXT,
  suggestion TEXT,
  duration_ms INTEGER NOT NULL,
  run_at TEXT NOT NULL
);

-- Profile Policy 表扩展 readonly 字段
ALTER TABLE profiles ADD COLUMN policy_readonly INTEGER NOT NULL DEFAULT 0;
```

---

# 4. UI 设计

## 4.1 安装 UI 状态机

### 11 态定义

```
splash ──→ checkInstall ──→ load-deployment-config ──→ preflight
    │                                                        │
    │ (已安装)                                                │ (P0 pass)
    │                                                        ↓
    ↓                                                   runtime-bundle
main:AIOSWorkspace                                           │
                                                             ↓
                                                        install-agent
                                                             │
                                                             ↓
                                                     bootstrap-profiles
                                                             │
                                                             ↓
                                                       start-gateway
                                                             │
                                                             ↓
                                                          doctor
                                                             │
                                                             ↓
                                                          setup
                                                             │
                                                             ↓
                                                     main:AIOSWorkspace
```

### 状态机 Hook

```typescript
// src/renderer/src/screens/EnterpriseInstall/use-install-state-machine.ts

export type InstallState =
  | "splash"
  | "checkInstall"
  | "load-deployment-config"
  | "preflight"
  | "runtime-bundle"
  | "install-agent"
  | "bootstrap-profiles"
  | "start-gateway"
  | "doctor"
  | "setup"
  | "main";

export interface InstallStateMachine {
  state: InstallState;
  progress: InstallProgressEvent | null;
  preflightReport: PreflightReport | null;
  doctorReport: DoctorReport | null;
  deploymentConfig: DeploymentConfig | null;
  error: { code: string; message: string; suggestion?: string } | null;
  transition: (next: InstallState) => void;
  cancel: () => void;
}

export function useInstallStateMachine(): InstallStateMachine
```

### 状态转换规则

| 当前状态 | 触发条件 | 目标状态 | 面板组件 |
|---------|---------|---------|---------|
| splash | App 启动完成 | checkInstall | SplashScreen |
| checkInstall | marker 存在 | main | — |
| checkInstall | marker 不存在 | load-deployment-config | — |
| load-deployment-config | 配置加载成功 | preflight | DeploymentConfigPanel |
| load-deployment-config | 配置加载失败(使用默认) | preflight | DeploymentConfigPanel |
| preflight | P0 全通过 | runtime-bundle | PreflightPanel |
| preflight | P0 有失败 | (error) | PreflightPanel |
| preflight | P1 有警告 + 用户确认 | runtime-bundle | PreflightPanel |
| runtime-bundle | Bundle 就绪 | install-agent | RuntimeBundlePanel |
| install-agent | Agent 安装完成 | bootstrap-profiles | InstallProgressPanel |
| bootstrap-profiles | Profile 引导完成 | start-gateway | ProfileBootstrapPanel |
| start-gateway | Gateway 启动 | doctor | InstallProgressPanel |
| doctor | Doctor 完成 | setup | DoctorPanel |
| setup | 用户确认 | main | InstallSuccessPanel |

## 4.2 组件结构

### EnterpriseInstallScreen（主容器）

```tsx
// src/renderer/src/screens/EnterpriseInstall/EnterpriseInstallScreen.tsx

export function EnterpriseInstallScreen() {
  const { state, progress, error, ... } = useInstallStateMachine();
  const ipc = useInstallIPC();  // 订阅 IPC 进度事件

  return (
    <div className="flex h-screen w-screen bg-background">
      {state === "splash" && <SplashScreen />}
      {state === "load-deployment-config" && <DeploymentConfigPanel />}
      {state === "preflight" && <PreflightPanel report={preflightReport} />}
      {state === "runtime-bundle" && <RuntimeBundlePanel progress={progress} />}
      {state === "install-agent" && <InstallProgressPanel progress={progress} />}
      {state === "bootstrap-profiles" && <ProfileBootstrapPanel progress={progress} />}
      {state === "start-gateway" && <InstallProgressPanel progress={progress} />}
      {state === "doctor" && <DoctorPanel report={doctorReport} />}
      {state === "setup" && <InstallSuccessPanel marker={marker} doctor={doctorReport} />}
      {error && <InstallErrorPanel error={error} />}
    </div>
  );
}
```

### 关键组件接口

```typescript
// PreflightPanel — 预检结果展示
interface PreflightPanelProps {
  report: PreflightReport;
  onConfirm?: () => void;   // P1 警告确认继续
  onCancel?: () => void;    // P0 阻断取消
}

// RuntimeBundlePanel — Bundle 进度
interface RuntimeBundlePanelProps {
  progress: InstallProgressEvent | null;
}

// InstallProgressPanel — 通用安装进度
interface InstallProgressPanelProps {
  progress: InstallProgressEvent | null;
  onCancel?: () => void;
}

// ProfileBootstrapPanel — Profile 引导进度
interface ProfileBootstrapPanelProps {
  progress: InstallProgressEvent | null;
  profileResults?: ProfileBootstrapResult[];
}

// DoctorPanel — Doctor 结果展示
interface DoctorPanelProps {
  report: DoctorReport | null;
  onExport?: () => void;
}

// InstallSuccessPanel — 安装成功
interface InstallSuccessPanelProps {
  marker: InstallMarker | null;
  doctor: DoctorReport | null;
  onContinue?: () => void;
}

// InstallErrorPanel — 错误展示
interface InstallErrorPanelProps {
  error: { code: string; message: string; suggestion?: string };
  onRetry?: () => void;
  onCancel?: () => void;
  onViewLog?: () => void;
}
```

## 4.3 IPC 订阅 Hook

```typescript
// src/renderer/src/screens/EnterpriseInstall/use-install-ipc.ts

export function useInstallIPC() {
  const { transition, setError, setProgress, setPreflightReport, setDoctorReport } =
    useInstallStateMachine();

  useEffect(() => {
    const unsubscribe = window.hermesAPI.enterpriseInstall.onInstallProgress((event) => {
      setProgress(event);
      // 根据事件自动推进状态机
      if (event.status === "completed") {
        transition(stageToState(event.stage));
      } else if (event.status === "failed") {
        setError({ code: event.error ?? "UNKNOWN", message: event.message });
      }
    });

    return unsubscribe;
  }, []);

  return {
    startInstall: () => window.hermesAPI.enterpriseInstall.startEnterpriseInstall(),
    cancelInstall: () => window.hermesAPI.enterpriseInstall.cancelEnterpriseInstall(),
    runPreflight: () => window.hermesAPI.enterpriseInstall.runPreflight(),
    runDoctor: () => window.hermesAPI.enterpriseInstall.runRuntimeDoctor(),
  };
}
```

---

# 5. 安全设计

## 5.1 Token 处理

| 场景 | 处理策略 |
|------|---------|
| Git PAT (clone 认证) | 仅通过 `child_process.env` 注入 `HTTPS_AIO_TOKEN`，不落盘、不进日志 |
| 内网 Artifact Server 认证 | HTTP header 注入，不持久化 |
| PyPI Mirror 认证 | pip config 临时配置，安装完成后清除 |
| 日志脱敏 | 匹配 `/token|password|secret|key|auth/i` 的值替换为 `***` |

## 5.2 校验策略

| 校验对象 | 算法 | 时机 | 不可跳过 |
|---------|------|------|---------|
| Runtime Bundle | SHA-256 | 下载/解压后 | 是 |
| Agent 核心文件 | SHA-256 抽查 | Runtime Doctor | 否（仅 warn） |
| Rollback 备份 | SHA-256 | 回滚前 | 是 |
| Bundle manifest 签名 | RSA/ECDSA | 解压后 | 由 `security.verifyManifest` 控制 |

## 5.3 权限控制

| 约束 | 实现方式 |
|------|---------|
| 无 UAC 提权 | 所有操作在用户权限下执行，不调用 ShellExecuteEx(runas) |
| 不写 HKLM | 安装路径全部在 HKCU / %LOCALAPPDATA% 下 |
| 不改 PATH | 不写入系统/用户环境变量，运行时通过 `process.env` 临时注入 |
| 不创建 Service | 不调用 sc.exe / RegisterServiceCtrlHandler |
| 仅 127.0.0.1 | `gateway.host` Zod literal("127.0.0.1") 强制约束 |
| 目录 ACL | 安装后通过 icacls 设置仅当前用户读写 |
| Policy 只读 | profile-runtime.db policy_readonly=1，修改 API 检查此标记拒绝 |

## 5.4 安装目录权限

```
%LOCALAPPDATA%\AIOS-Hermes\     ← 当前用户:RW, Others:None
├── app\                         ← Desktop 可执行文件
├── runtime\                     ← hermes-agent 源码
├── agent\                       ← Agent 安装目录
├── venv\                        ← Shared Python venv
├── logs\install\                ← 安装日志
├── cache\                       ← 下载缓存
├── rollback\                    ← 回滚备份
└── install-marker.json          ← 安装标记

%USERPROFILE%\.hermes\           ← 当前用户:RW, Others:None
├── config.yaml                  ← 全局配置
├── .env                         ← 环境变量（API keys）
├── state.db                     ← 全局状态
└── profiles\
    ├── default\                 ← Profile Home
    ├── writer\
    ├── coding\
    ├── research\
    ├── recruiters\
    ├── finance\
    └── agenter\
```

---

# 6. 分阶段实施计划

## Phase 1: Deployment Config 基础（预计 2 天）

**目标**: 建立配置加载与校验基础设施

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| 定义 Zod schema | `deployment-schema.ts` | schema 覆盖 spec.md 6.1 所有 31 个字段 |
| 实现配置加载 | `deployment-config.ts` | 文件不存在时返回默认配置 + `usedDefault=true` |
| 实现 schema 校验 | `deployment-config.ts` | 非法 JSON 返回 `ok=false` + 字段级错误 |
| 共享类型导出 | `src/shared/enterprise/` | 前后端可引用 `DeploymentConfig` 类型 |
| 默认配置生成 | `getDefaultConfig()` | 7 Profile + 8642-8648 端口 + windows-native |

## Phase 2: Runtime Bundle Manager（预计 2 天）

**目标**: 实现 Bundle 获取、校验、解压

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| SHA-256 流式校验 | `checksum-verifier.ts` | 1GB 文件 < 10s 校验完成 |
| HTTP 下载 + 断点续传 | `runtime-bundle-manager.ts` | 中断后恢复从断点继续 |
| Bundle 解压 | `runtime-bundle-manager.ts` | 解压到 `runtime/`，含 `agent/` + `wheels/` |
| 复用检测 | `runtime-bundle-manager.ts` | 相同 SHA-256 跳过下载/解压 |
| 进度回调 | `onProgress` | 下载/解压进度实时上报 |

## Phase 3: Preflight Checker（预计 2 天）

**目标**: 实现 20 项环境预检

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| 10 项 P0 检查 | `preflight-checker.ts` | P0 有失败 → 流水线终止 |
| 5 项 P1 检查 | `preflight-checker.ts` | P1 有警告 → UI 暂停待确认 |
| 5 项 P2 检查 | `preflight-checker.ts` | P2 仅展示不阻断 |
| 单项超时 5s | 超时处理 | 超时项标记 `unknown`，归入 P1 |
| 并发执行 | `Promise.allSettled` | 全量检查 < 30s |

## Phase 4: Agent Installer + Venv（预计 3 天）

**目标**: 实现 Agent 源码获取和 Python 环境配置

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| Git clone 模式 | `hermes-agent-source-installer.ts` | SSH/PAT 认证，PAT 不落盘 |
| Bundle 模式 | `hermes-agent-source-installer.ts` | 从 runtime/agent/ 提取 |
| Shared venv 创建/复用 | `python-venv-installer.ts` | Windows: `venv\Scripts\python.exe` |
| 依赖安装 | `python-venv-installer.ts` | wheels 优先 → pipIndexUrl fallback |
| 版本验证 | 版本匹配校验 | 版本不一致报错 |

## Phase 5: Profile Bootstrapper（预计 3 天）

**目标**: 实现 7 Profile 引导与 Gateway 启动

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| Profile 目录创建 | `profile-runtime-bootstrapper.ts` | 7 个隔离 HERMES_HOME |
| profile-runtime.db 初始化 | 复用 `profile-runtime-db` | 每个Profile独立db |
| 端口分配 + 递增 | `allocatePort()` | 端口占用时自动递增 |
| Skills 安装 | `profile-policy-installer.ts` | 按 policy 分配到 Profile |
| Policy 只读标记 | `applyPolicyReadOnly()` | `policy_readonly=1` |
| Gateway 启动 | 复用 `profile-runtime-manager` | default + autoStart 启动 |
| 用户数据保留 | 配置冲突检测 | 保留现有，新配置写 `.new` |

## Phase 6: Enterprise Installer 流水线编排（预计 2 天）

**目标**: 串联所有模块为完整安装流水线

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| 20 步流水线 | `enterprise-installer.ts` | 按 STAGES 有序执行 |
| Install Lock | `install-lock.ts` | 并发安装互斥 |
| Install Marker | `install-marker.ts` | 安装完成写入完整元数据 |
| Install Log | `install-log.ts` | JSON Lines + 脱敏 |
| 进度推送 | `onProgress` | 每步开始/完成/失败推送事件 |
| 取消 + 清理 | cancellationToken | 取消后清理临时文件、释放锁 |
| 已有安装检测 | `checkEnterpriseInstall` | marker 存在 → 跳过安装 |

## Phase 7: Install UI（预计 3 天）

**目标**: 实现完整的安装界面

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| 11 态状态机 | `use-install-state-machine.ts` | 状态转换符合 spec 定义 |
| IPC 订阅 | `use-install-ipc.ts` | 进度事件实时更新 UI |
| SplashScreen | 启动画面 | 品牌展示 + loading |
| DeploymentConfigPanel | 配置展示 | 核心字段只读 |
| PreflightPanel | 预检结果 | P0 红/P1 黄/P2 蓝 + 确认按钮 |
| InstallProgressPanel | 进度条 | 百分比 + 阶段描述 + 取消按钮 |
| ProfileBootstrapPanel | Profile 进度 | 7 Profile 逐个展示状态 |
| DoctorPanel | Doctor 结果 | 9 项结果 + 导出按钮 |
| InstallSuccessPanel | 成功摘要 | Doctor 摘要 + 继续按钮 |
| InstallErrorPanel | 错误展示 | 错误码 + 建议 + 重试/查看日志 |

## Phase 8: Update/Repair/Rollback + Runtime Doctor（预计 3 天）

**目标**: 实现安装后运维能力

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| 9 项 Doctor 检查 | `doctor/` | 总耗时 < 60s |
| Doctor 报告导出 | JSON 文件 | 含 9 项结果 + 修复建议 |
| Desktop 更新 | `enterprise-updater.ts` | electron-updater 集成 |
| Agent 更新 | `enterprise-updater.ts` | 停Gateway→备份→下载→校验→替换→Doctor→启 |
| L1-L5 修复 | `enterprise-repair.ts` | 递进执行，LN 包含 L1..LN-1 |
| Rollback 备份 | `enterprise-rollback.ts` | 更新前自动创建快照 |
| Rollback 执行 | `enterprise-rollback.ts` | 校验备份→恢复→Doctor |
| IPC 扩展 | `enterprise-ipc.ts` | 13 个 IPC handler 全部注册 |
| Preload 集成 | `enterprise-install-api.ts` | `window.hermesAPI.enterpriseInstall` 可用 |

---

# 7. 错误码设计

| 错误码 | 含义 | 严重度 |
|--------|------|--------|
| E_DEPLOY_SCHEMA_INVALID | deployment.json schema 校验失败 | 阻断 |
| E_PREFLIGHT_P0_FAILED | P0 预检失败 | 阻断 |
| E_PREFLIGHT_TIMEOUT | 预检超时 | 警告 |
| E_BUNDLE_DOWNLOAD_FAILED | Bundle 下载失败（3次重试后） | 阻断 |
| E_BUNDLE_SHA256_MISMATCH | Bundle SHA-256 校验失败 | 阻断 |
| E_BUNDLE_EXTRACT_FAILED | Bundle 解压失败 | 阻断 |
| E_BUNDLE_DISK_FULL | 磁盘空间不足 | 阻断 |
| E_GIT_CLONE_FAILED | Git clone 失败 | 阻断 |
| E_GIT_AUTH_FAILED | Git 认证失败 | 阻断 |
| E_VENV_CREATE_FAILED | venv 创建失败 | 阻断 |
| E_PIP_INSTALL_FAILED | Python 依赖安装失败 | 阻断 |
| E_AGENT_VERSION_MISMATCH | Agent 版本不一致 | 阻断 |
| E_PROFILE_DB_INIT_FAILED | profile-runtime.db 初始化失败 | 阻断 |
| E_PORT_EXHAUSTED | 端口分配耗尽 | 阻断 |
| E_GATEWAY_STARTUP_TIMEOUT | Gateway 启动超时 | 阻断 |
| E_INSTALL_LOCK_TIMEOUT | 安装锁获取超时 | 阻断 |
| E_MARKER_WRITE_FAILED | install-marker 写入失败 | 警告 |
| E_ROLLBACK_CHECKSUM_MISMATCH | 备份校验失败 | 阻断 |
| E_REPAIR_FAILED | 修复失败 | 警告 |
| E_GATEWAY_BIND_NOT_LOCAL | Gateway 绑定非 127.0.0.1 | 阻断 |
| E_MANIFEST_SIGNATURE_INVALID | Bundle 签名校验失败 | 阻断 |
| E_DIR_PERMISSION_FAILED | 目录权限设置失败 | 警告 |
