# Hermes Desktop V1.2.1 — 企业级一键部署安装方案 编码任务规划

**文档版本**: v1.0
**创建日期**: 2026-05-16
**基线规格**: `.codeartsdoer/specs/hermes-v1.2.1/spec.md`
**基线设计**: `.codeartsdoer/specs/hermes-v1.2.1/design.md`
**总预估工时**: 20 人天（8 Phase）
**技术栈**: Electron 28+ / TypeScript 5 / Zod / better-sqlite3 / React 18

---

## Phase 1: Deployment Config 基础（预计 2 天）

> 目标：建立 deployment.json 配置加载与 Zod 校验基础设施，为所有后续 Phase 提供类型安全的配置访问。

### 1.1 创建共享类型与常量基础

- [ ] 创建 `src/shared/enterprise/` 目录结构
- [ ] 实现 `src/shared/enterprise/enterprise-constants.ts`：定义 InstallStage 枚举、PreflightSeverity、PreflightStatus、RepairLevel、RollbackTarget、DoctorCheckStatus 等常量与错误码枚举（E_DEPLOY_SCHEMA_INVALID 等 21 个错误码）
  - 验收：所有枚举值与 spec.md 5.5 / design.md 7 错误码表一一对应
  - 涉及文件：`src/shared/enterprise/enterprise-constants.ts`
  - 依赖：无
  - 复杂度：低

- [ ] 实现 `src/shared/enterprise/enterprise-schema.ts`：共享 Zod schema（DeploymentConfigSchema、InstallMarkerSchema、InstallLogEntrySchema、DoctorCheckResultSchema、DoctorReportSchema、InstallProgressEventSchema），供 Main Process 和 Preload 共用校验
  - 验收：schema 覆盖 spec.md 6.1-6.4 全部字段约束
  - 涉及文件：`src/shared/enterprise/enterprise-schema.ts`
  - 依赖：无
  - 复杂度：中

- [ ] 实现 `src/shared/enterprise/enterprise-contract.ts`：导出 TS 类型（`DeploymentConfig = z.infer<typeof DeploymentConfigSchema>` 等）+ EnterpriseInstallAPI 接口定义（13 个方法签名）
  - 验收：前后端可引用 `DeploymentConfig`、`InstallMarker`、`EnterpriseInstallAPI` 类型
  - 涉及文件：`src/shared/enterprise/enterprise-contract.ts`
  - 依赖：1.1.2（enterprise-schema.ts）
  - 复杂度：中

### 1.2 Deployment Schema 与 Config 加载

- [ ] 实现 `src/main/enterprise/deployment-schema.ts`：Main Process 专用 Zod schema（包含 `.refine()` 条件校验：bundleUrl/sourceType 联动、gitUrl/branch/sourceType 联动），复用 `enterprise-schema.ts` 基础定义
  - 验收：非法 deployment.json 返回字段级错误；合法 JSON 通过校验
  - 涉及文件：`src/main/enterprise/deployment-schema.ts`
  - 依赖：1.1.2（enterprise-schema.ts）
  - 复杂度：中

- [ ] 实现 `src/main/enterprise/deployment-config.ts`：`loadDeploymentConfig(configPath?)` 函数——读取 deployment.json → Zod parse → 返回 `LoadConfigResult`；`getDefaultConfig()` 函数——返回内置默认配置（7 Profile + 8642-8648 端口 + windows-native）
  - 验收：文件不存在时返回 `{ok:true, usedDefault:true}`；schema 校验失败时返回 `{ok:false, error:ZodError详情}`
  - 涉及文件：`src/main/enterprise/deployment-config.ts`
  - 依赖：1.2.1（deployment-schema.ts）
  - 复杂度：中

### 1.3 集成点改造

- [ ] 在 `src/main/` 入口处预留 Enterprise 模块加载钩子（不改动现有 `installer.ts`，仅新增 import 路径注册点）
  - 涉及文件：`src/main/index.ts` 或对应入口
  - 验收：现有安装流程不受影响，Enterprise 模块可被按需加载
  - 依赖：1.2.2（deployment-config.ts）
  - 复杂度：低

---

## Phase 2: Runtime Bundle Manager（预计 2 天）

> 目标：实现 Bundle 获取（在线下载/离线路径/内嵌）、SHA-256 校验、解压，为 Agent 安装提供运行时基础。

### 2.1 Checksum Verifier

- [ ] 实现 `src/main/enterprise/checksum-verifier.ts`：`verifySha256(filePath, expectedHash)` 流式 SHA-256 计算（`crypto.createHash('sha256').update(chunk)`）+ `verifyManifestSignature(manifestPath)` 可选数字签名校验
  - 验收：1GB 文件 < 10s 校验完成；校验失败返回 `{ok:false, actualHash}`
  - 涉及文件：`src/main/enterprise/checksum-verifier.ts`
  - 依赖：无（独立模块）
  - 复杂度：中

### 2.2 Runtime Bundle Manager

- [ ] 实现 `src/main/enterprise/runtime-bundle-manager.ts`：`resolveRuntimeBundle(config, onProgress)` —— sourceType 三分支（bundleUrl → HTTP 下载 + Range 断点续传；offlineBundlePath → 本地路径校验；embedded → process.resourcesPath 提取）→ SHA-256 校验 → 解压到 `%LOCALAPPDATA%\AIOS-Hermes\runtime\` → 复用检测（install-marker 中的 bundleSha256 匹配则 skip）
  - 验收：bundleUrl 模式支持断点续传（临时文件 `.part`）；校验失败报 `E_BUNDLE_SHA256_MISMATCH`；解压后包含 `agent/` + `wheels/` 子目录；相同 SHA-256 跳过下载/解压
  - 涉及文件：`src/main/enterprise/runtime-bundle-manager.ts`
  - 依赖：2.1（checksum-verifier.ts）、Phase 1（DeploymentConfig 类型）
  - 复杂度：高

- [ ] 实现下载重试逻辑：网络不可达时指数退避重试 3 次，仍失败报 `E_BUNDLE_DOWNLOAD_FAILED`；解压空间不足报 `E_BUNDLE_DISK_FULL`
  - 验收：3 次重试后终止安装并上报错误码
  - 涉及文件：`src/main/enterprise/runtime-bundle-manager.ts`
  - 依赖：2.2.1
  - 复杂度：中

---

## Phase 3: Preflight Checker（预计 2 天）

> 目标：实现 20 项环境预检（10 P0 + 5 P1 + 5 P2），禁止修改任何系统状态。

### 3.1 P0 阻断检查（10 项）

- [ ] 实现 `src/main/enterprise/preflight-checker.ts` 中 P0 检查项：P0-WIN-VERSION（`os.release()` 解析）、P0-DISK-SPACE（`fs.statfs` / `wmic`）、P0-INSTALL-DIR-WRITABLE（`fs.access W_OK`）、P0-HERMES-HOME-WRITABLE、P0-PORT-AVAILABLE（复用 `profile-runtime-manager.isPortOccupied()`）、P0-PYTHON-AVAILABLE（`which python` / `which python3`）、P0-VENV-CREATABLE（临时 venv 创建 + 清理）、P0-BUNDLE-SHA256（委托 checksum-verifier）、P0-PROFILE-DB-CREATABLE（SQLite 内存测试）、P0-DEPLOY-SCHEMA（Zod parse 结果）
  - 验收：P0 有失败项 → `p0Passed=false`；单项超时 5s 标记 `unknown` 归入 P1
  - 涉及文件：`src/main/enterprise/preflight-checker.ts`
  - 依赖：Phase 1（DeploymentConfig）、Phase 2（checksum-verifier）、现有 `src/main/profile-runtime-manager.ts`（`isPortOccupied`）
  - 复杂度：高

### 3.2 P1 警告 + P2 信息检查（10 项）

- [ ] 实现 P1 检查项：P1-WIN-EOL（Windows 10 版本接近 EOL）、P1-OLLAMA-MISSING、P1-PYPI-UNREACHABLE（内网 PyPI 不可达）、P1-GIT-UNAVAILABLE（非 Git clone 模式可忽略）、P1-ANTIVIRUS-WARN
  - 验收：P1 有警告 → `p1Warnings > 0`，不阻断但需用户确认
  - 涉及文件：`src/main/enterprise/preflight-checker.ts`
  - 依赖：3.1
  - 复杂度：中

- [ ] 实现 P2 信息检查项：P2-WIN-VERSION-DETAIL、P2-PYTHON-VERSION、P2-GIT-VERSION、P2-HERMES-DIR-STATUS、P2-EXISTING-INSTALL-MARKER
  - 验收：P2 结果仅展示，不暂停安装
  - 涉及文件：`src/main/enterprise/preflight-checker.ts`
  - 依赖：3.1
  - 复杂度：低

### 3.3 Preflight 编排

- [ ] 实现 `runPreflight(config)` 入口函数：`Promise.allSettled` 并发执行 20 项检查，汇总为 `PreflightReport`，全量检查 < 30s
  - 验收：返回 `{checks, p0Passed, p1Warnings, p2Infos, totalDurationMs}`
  - 涉及文件：`src/main/enterprise/preflight-checker.ts`
  - 依赖：3.1、3.2
  - 复杂度：中

---

## Phase 4: Hermes Agent Installer + Python Venv（预计 3 天）

> 目标：实现 Agent 源码获取（git-clone / bundle）和 Python 虚拟环境创建与依赖安装。

### 4.1 Hermes Agent Source Installer

- [ ] 实现 `src/main/enterprise/hermes-agent-source-installer.ts`：`installHermesAgentSource(config, runtimePath, onProgress)` —— sourceType=bundle 时从 `runtime/agent/` 提取；sourceType=git-clone 时构造 git clone 命令（注入 SSH/PAT 认证，PAT 通过 `child_process.env` 注入不落盘）
  - 验收：bundle 模式直接提取；git-clone 模式完成 clone + checkout branch；PAT 不出现在文件和日志中；版本不匹配报 `E_AGENT_VERSION_MISMATCH`
  - 涉及文件：`src/main/enterprise/hermes-agent-source-installer.ts`
  - 依赖：Phase 1（DeploymentConfig）
  - 复杂度：高

- [ ] 实现 Git 认证策略：authMode=none（无认证）、authMode=ssh-key（使用 `~/.ssh/id_rsa`）、authMode=personal-access-token（`HTTPS_AIO_TOKEN` 环境变量注入）；clone 失败报 `E_GIT_CLONE_FAILED` / `E_GIT_AUTH_FAILED`
  - 验收：三种认证模式均可正常工作；PAT 不落盘不进日志
  - 涉及文件：`src/main/enterprise/hermes-agent-source-installer.ts`
  - 依赖：4.1.1
  - 复杂度：中

### 4.2 Python Venv Installer

- [ ] 实现 `src/main/enterprise/python-venv-installer.ts`：`createOrReuseSharedVenv(config, installBasePath)` —— 检测已有 venv → 复用或新建（Windows: `venv\Scripts\python.exe`）→ 返回 `{venvPath, pythonPath, isNewVenv}`
  - 验收：已有有效 venv 时复用；新建 venv 在 `%LOCALAPPDATA%\AIOS-Hermes\venv\`；创建失败报 `E_VENV_CREATE_FAILED`
  - 涉及文件：`src/main/enterprise/python-venv-installer.ts`
  - 依赖：Phase 1（DeploymentConfig）
  - 复杂度：中

- [ ] 实现 `installPythonDependencies(config, venvPath, agentPath, onProgress)`：优先使用 uv（如可用），fallback 到 pip；wheelhousePath 有值时 `pip install --find-links=<wheelhousePath>`，否则 `pip install -i <pipIndexUrl>`；重试一次，仍失败报 `E_PIP_INSTALL_FAILED`
  - 验收：wheels 优先路径生效；pipIndexUrl fallback 路径生效；安装失败有重试
  - 涉及文件：`src/main/enterprise/python-venv-installer.ts`
  - 依赖：4.2.1
  - 复杂度：中

### 4.3 Runtime Bootstrapper（Python 检测与配置）

- [ ] 实现 `src/main/enterprise/runtime-bootstrapper.ts`：检测系统 Python 版本、判断是否使用 bundled Python、配置 Python 路径到 DeploymentConfig
  - 验收：useBundledPython=true 时使用内置 Python；否则检测系统 Python ≥ 3.11
  - 涉及文件：`src/main/enterprise/runtime-bootstrapper.ts`
  - 依赖：Phase 1（DeploymentConfig）
  - 复杂度：低

### 4.4 Enterprise Config Provisioner

- [ ] 实现 `src/main/enterprise/enterprise-config-provisioner.ts`：`provisionDefaultHermesHome(config, agentPath, venvPath)` —— 创建 `%USERPROFILE%\.hermes\` 目录结构、生成 `config.yaml`（gateway host/port/log）、生成 `.env`（API keys 占位）；已有配置保留，新配置写 `.new` 后缀
  - 验收：首次安装创建完整目录；已有配置冲突时保留用户现有配置
  - 涉及文件：`src/main/enterprise/enterprise-config-provisioner.ts`
  - 依赖：Phase 1（DeploymentConfig）
  - 复杂度：中

---

## Phase 5: Profile Runtime Bootstrapper（预计 3 天）

> 目标：实现 7 Profile 独立引导、端口分配、Skills 安装、Policy 只读标记、Gateway 启动。

### 5.1 Profile 引导核心

- [ ] 实现 `src/main/enterprise/profile-runtime-bootstrapper.ts`：`bootstrapProfiles(config, agentPath, venvPath, onProgress)` —— 对每个 enabled Profile：创建 HERMES_HOME（`%USERPROFILE%\.hermes\profiles\<name>\`）→ 初始化 profile-runtime.db（复用 `profile-runtime-db.initProfileRuntimeDb`）→ 写入 `runtime_instances` 表 → 分配端口（检测占用 → 递增分配）→ 调用 profile-policy-installer → 保留已有用户数据
  - 验收：7 个独立 HERMES_HOME 创建；7 个独立 profile-runtime.db 初始化；端口递增分配生效；已有用户数据不覆盖
  - 涉及文件：`src/main/enterprise/profile-runtime-bootstrapper.ts`
  - 依赖：Phase 1（DeploymentConfig）、现有 `src/main/profile-runtime-db.ts`（`initProfileRuntimeDb`）、现有 `src/main/profile-runtime-manager.ts`（`isPortOccupied`）
  - 复杂度：高

- [ ] 实现 `allocatePort(preferred)` 端口递增策略：`while (port < preferred + 100 && isPortOccupied(port)) port++`；耗尽报 `E_PORT_EXHAUSTED`
  - 验收：端口 8642 被占用时自动分配 8643；100 个端口均占用时报错
  - 涉及文件：`src/main/enterprise/profile-runtime-bootstrapper.ts`
  - 依赖：5.1.1
  - 复杂度：低

### 5.2 Profile Policy Installer

- [ ] 实现 `src/main/enterprise/profile-policy-installer.ts`：`installBundledSkills(config, profileName, profileHome, runtimePath)` —— 按 deployment.json policy 策略将 Bundle 中的 Skills 复制到对应 Profile 的 skills 目录
  - 验收：policy 指定 default 安装 skill-a → default Profile skills 目录包含 skill-a
  - 涉及文件：`src/main/enterprise/profile-policy-installer.ts`
  - 依赖：Phase 1（DeploymentConfig）
  - 复杂度：中

- [ ] 实现 `applyPolicyReadOnly(profileId)`：在 profile-runtime.db 中设置 `policy_readonly=1`；运行时修改 Policy 的请求被拒绝
  - 验收：安装完成后 policy_readonly=1；尝试修改 Policy 返回错误
  - 涉及文件：`src/main/enterprise/profile-policy-installer.ts`
  - 依赖：5.2.1
  - 复杂度：低

### 5.3 Gateway Supervisor 集成

- [ ] 扩展现有 `src/main/gateway-supervisor.ts`：增加 `startupTimeoutMs` 可配置化参数（从 deployment.json gateway.startupTimeoutMs 读取），启动后执行 health check（`fetch(http://127.0.0.1:<port>/health)`）
  - 验收：default Gateway 启动后 health check 通过；超时报 `E_GATEWAY_STARTUP_TIMEOUT`
  - 涉及文件：`src/main/gateway-supervisor.ts`（改造）
  - 依赖：Phase 1（DeploymentConfig）
  - 复杂度：中

- [ ] 扩展现有 `src/main/profile-runtime-manager.ts`：增加端口递增分配逻辑（`isPortOccupied` → `allocatePort`），启动 autoStart Profile 列表中的 Gateway
  - 验收：autoStart 包含 writer → 安装完成后 writer Gateway 自动启动
  - 涉及文件：`src/main/profile-runtime-manager.ts`（改造）
  - 依赖：5.1.1、5.3.1
  - 复杂度：中

### 5.4 profile-runtime.db 扩展

- [ ] 在 profile-runtime.db 中新增 `install_events` 和 `runtime_doctor_reports` 表，以及 `profiles` 表增加 `policy_readonly` 字段（DDL 见 design.md 3.2.6）
  - 验收：新表创建成功；policy_readonly 字段默认值为 0
  - 涉及文件：`src/main/profile-runtime-db.ts`（改造）
  - 依赖：无（独立改造）
  - 复杂度：低

---

## Phase 6: Enterprise Installer 流水线编排（预计 2 天）

> 目标：串联所有模块为 20 步有序安装流水线，实现 Install Lock / Marker / Log / 进度推送 / 取消清理。

### 6.1 Install Lock

- [ ] 实现 `src/main/enterprise/install-lock.ts`：`acquireInstallLock(timeoutMs=10000)` —— `fs.open(lockPath, 'wx')` 独占创建；创建失败等待重试直到 timeout；`release()` 删除锁文件；stale lock 检测（>5min 自动清理）
  - 验收：并发安装互斥；超时报 `E_INSTALL_LOCK_TIMEOUT`；App 崩溃后 stale lock 自动清理
  - 涉及文件：`src/main/enterprise/install-lock.ts`
  - 依赖：无
  - 复杂度：中

### 6.2 Install Marker

- [ ] 实现 `src/main/enterprise/install-marker.ts`：`writeInstallMarker(marker)` / `readInstallMarker()` / `existsInstallMarker()` —— 读写 `%LOCALAPPDATA%\AIOS-Hermes\install-marker.json`，包含 schemaVersion、installedAt、desktopVersion、agentVersion、installPath、hermesHomePath、profiles、deploymentConfigHash、doctorResult、rollbackSnapshots
  - 验收：写入后可读取完整元数据；写入失败重试 3 次
  - 涉及文件：`src/main/enterprise/install-marker.ts`
  - 依赖：Phase 1（enterprise-contract 类型）
  - 复杂度：中

### 6.3 Install Log

- [ ] 实现 `src/main/enterprise/install-log.ts`：`createInstallLogger(logDir)` —— JSON Lines 格式写入 `install-<timestamp>.log`；自动脱敏（匹配 `/token|password|secret|key|auth/i` 替换为 `***`）；日志级别 info/warn/error
  - 验收：每条日志包含 timestamp/stage/level/message/errorCode；无明文敏感信息
  - 涉及文件：`src/main/enterprise/install-log.ts`
  - 依赖：Phase 1（enterprise-constants InstallStage）
  - 复杂度：中

### 6.4 Enterprise Installer 流水线

- [ ] 实现 `src/main/enterprise/enterprise-installer.ts`：`executeEnterpriseInstallPipeline(config?, onProgress?, cancellationToken?)` —— 20 步有序执行（checkEnterpriseInstall → loadDeploymentConfig → acquireInstallLock → runPreflight → resolveRuntimeBundle → verifyBundleChecksum → installRuntimeTools → installHermesAgentSource → createOrReuseSharedVenv → installPythonDependencies → provisionDefaultHermesHome → bootstrapProfileRuntimeDb → bootstrapProfiles → installBundledSkills → applyPolicy → startDefaultGateway → optionalStartAutoStartProfiles → runRuntimeDoctor → writeInstallMarker → openAIOSWorkspace）
  - 验收：按 STAGES 有序执行；每步开始推送 `{stage, status:'running'}`；每步完成推送 `{stage, status:'completed', progress}%`；任一步失败终止流水线并推送 `{stage, status:'failed'}`；已有安装检测 → marker 存在则跳过
  - 涉及文件：`src/main/enterprise/enterprise-installer.ts`
  - 依赖：6.1、6.2、6.3、Phase 1-5 全部模块
  - 复杂度：高

- [ ] 实现进度权重映射：20 步各自权重百分比（checkEnterpriseInstall 2%、loadDeploymentConfig 3%、acquireInstallLock 1%、runPreflight 5%、resolveRuntimeBundle 15%、verifyBundleChecksum 3%、installRuntimeTools 5%、installHermesAgentSource 10%、createOrReuseSharedVenv 8%、installPythonDependencies 15%、provisionDefaultHermesHome 2%、bootstrapProfileRuntimeDb 3%、bootstrapProfiles 10%、installBundledSkills 3%、applyPolicy 2%、startDefaultGateway 5%、optionalStartAutoStartProfiles 3%、runRuntimeDoctor 3%、writeInstallMarker 1%、openAIOSWorkspace 0%）
  - 验收：全局 progress 0→100% 线性递增
  - 涉及文件：`src/main/enterprise/enterprise-installer.ts`
  - 依赖：6.4.1
  - 复杂度：低

- [ ] 实现取消与清理：检查 `cancellationToken.cancelled` → 删除安装过程中创建的临时文件和目录 → 释放 Install Lock → 推送取消事件
  - 验收：取消后无残留临时文件；Install Lock 已释放
  - 涉及文件：`src/main/enterprise/enterprise-installer.ts`
  - 依赖：6.4.1、6.1
  - 复杂度：中

### 6.5 Enterprise IPC Handler 注册

- [ ] 实现 `src/main/enterprise/enterprise-ipc.ts`：`setupEnterpriseInstallIPC(mainWindow)` —— 注册 13 个 ipcMain.handle（enterprise-install:check/getConfig/start/cancel/runPreflight/runDoctor/exportDoctor/checkUpdates/updateAgent/repair/listSnapshots/rollback/getLogPath）+ 进度推送（`mainWindow.webContents.send("enterprise-install:progress", event)`）
  - 验收：13 个 IPC handler 全部注册；进度事件可推送到 Renderer
  - 涉及文件：`src/main/enterprise/enterprise-ipc.ts`
  - 依赖：6.4（enterprise-installer.ts）、Phase 8（updater/repair/rollback/doctor，可先占位后填充）
  - 复杂度：中

---

## Phase 7: Enterprise Install UI（预计 3 天）

> 目标：实现 11 态状态机驱动的安装界面，含 8+ Panel 组件和 IPC 订阅。

### 7.1 Preload 桥接

- [ ] 实现 `src/preload/enterprise-install-api.ts`：`enterpriseInstallApi` 对象——13 个方法映射到 `ipcRenderer.invoke` / `ipcRenderer.on`；`onInstallProgress` 返回 unsubscribe 函数
  - 验收：`window.hermesAPI.enterpriseInstall` 所有方法可用
  - 涉及文件：`src/preload/enterprise-install-api.ts`
  - 依赖：Phase 1（enterprise-contract EnterpriseInstallAPI 类型）
  - 复杂度：中

- [ ] 在 `src/preload/index.ts` 中集成：`hermesAPI.enterpriseInstall = enterpriseInstallApi`
  - 验收：Renderer 可通过 `window.hermesAPI.enterpriseInstall` 访问
  - 涉及文件：`src/preload/index.ts`（改造）
  - 依赖：7.1.1
  - 复杂度：低

### 7.2 状态机 Hook

- [ ] 实现 `src/renderer/src/screens/EnterpriseInstall/use-install-state-machine.ts`：11 态（splash / checkInstall / load-deployment-config / preflight / runtime-bundle / install-agent / bootstrap-profiles / start-gateway / doctor / setup / main）+ 状态转换规则 + 错误处理 + 取消方法
  - 验收：状态转换符合 design.md 4.1 转换表；非法转换被拒绝
  - 涉及文件：`src/renderer/src/screens/EnterpriseInstall/use-install-state-machine.ts`
  - 依赖：Phase 1（enterprise-contract 类型）
  - 复杂度：高

### 7.3 IPC 订阅 Hook

- [ ] 实现 `src/renderer/src/screens/EnterpriseInstall/use-install-ipc.ts`：订阅 `enterprise-install:progress` 事件 → 根据事件自动推进状态机（completed → transition、failed → setError）
  - 验收：进度事件实时更新 UI 状态
  - 涉及文件：`src/renderer/src/screens/EnterpriseInstall/use-install-ipc.ts`
  - 依赖：7.2、7.1
  - 复杂度：中

### 7.4 Panel 组件

- [ ] 实现 `src/renderer/src/screens/EnterpriseInstall/SplashScreen.tsx`：品牌展示 + loading 动画
  - 涉及文件：`src/renderer/src/screens/EnterpriseInstall/SplashScreen.tsx`
  - 依赖：无
  - 复杂度：低

- [ ] 实现 `src/renderer/src/screens/EnterpriseInstall/DeploymentConfigPanel.tsx`：展示 deployment.json 配置摘要，核心字段（schemaVersion/installMode/installScope）只读
  - 涉及文件：`src/renderer/src/screens/EnterpriseInstall/DeploymentConfigPanel.tsx`
  - 依赖：Phase 1（DeploymentConfig 类型）
  - 复杂度：中

- [ ] 实现 `src/renderer/src/screens/EnterpriseInstall/PreflightPanel.tsx`：展示 P0/P1/P2 检查结果（P0 红色/fail、P1 黄色/warn、P2 蓝色/info）+ P1 确认继续按钮 + P0 阻断取消
  - 涉及文件：`src/renderer/src/screens/EnterpriseInstall/PreflightPanel.tsx`
  - 依赖：Phase 1（PreflightReport 类型）
  - 复杂度：中

- [ ] 实现 `src/renderer/src/screens/EnterpriseInstall/RuntimeBundlePanel.tsx`：Bundle 下载/解压进度条 + 百分比 + 阶段描述
  - 涉及文件：`src/renderer/src/screens/EnterpriseInstall/RuntimeBundlePanel.tsx`
  - 依赖：7.3
  - 复杂度：低

- [ ] 实现 `src/renderer/src/screens/EnterpriseInstall/InstallProgressPanel.tsx`：通用安装进度条 + 百分比 + 阶段描述 + 取消按钮
  - 涉及文件：`src/renderer/src/screens/EnterpriseInstall/InstallProgressPanel.tsx`
  - 依赖：7.3
  - 复杂度：低

- [ ] 实现 `src/renderer/src/screens/EnterpriseInstall/ProfileBootstrapPanel.tsx`：7 Profile 逐个展示引导状态（pending/running/completed/failed）+ 百分比
  - 涉及文件：`src/renderer/src/screens/EnterpriseInstall/ProfileBootstrapPanel.tsx`
  - 依赖：7.3
  - 复杂度：中

- [ ] 实现 `src/renderer/src/screens/EnterpriseInstall/DoctorPanel.tsx`：9 项 Doctor 检查结果（pass/fail/warn/error）+ 导出 JSON 按钮
  - 涉及文件：`src/renderer/src/screens/EnterpriseInstall/DoctorPanel.tsx`
  - 依赖：Phase 1（DoctorReport 类型）
  - 复杂度：中

- [ ] 实现 `src/renderer/src/screens/EnterpriseInstall/InstallSuccessPanel.tsx`：安装成功摘要 + Doctor 结果摘要 + 继续按钮（进入 AIOSWorkspace）
  - 涉及文件：`src/renderer/src/screens/EnterpriseInstall/InstallSuccessPanel.tsx`
  - 依赖：Phase 1（InstallMarker、DoctorReport 类型）
  - 复杂度：低

- [ ] 实现 `src/renderer/src/screens/EnterpriseInstall/InstallErrorPanel.tsx`：错误码 + 错误描述 + 建议操作（重试/跳过/取消/查看日志）按钮
  - 涉及文件：`src/renderer/src/screens/EnterpriseInstall/InstallErrorPanel.tsx`
  - 依赖：无
  - 复杂度：低

### 7.5 主屏幕

- [ ] 实现 `src/renderer/src/screens/EnterpriseInstall/EnterpriseInstallScreen.tsx`：主容器组件——根据状态机 state 渲染对应 Panel；集成 `useInstallStateMachine` + `useInstallIPC`
  - 验收：安装过程按状态机顺序切换 Panel；错误时显示 InstallErrorPanel
  - 涉及文件：`src/renderer/src/screens/EnterpriseInstall/EnterpriseInstallScreen.tsx`
  - 依赖：7.2、7.3、7.4 全部 Panel
  - 复杂度：中

### 7.6 路由集成

- [ ] 在 Renderer 路由中注册 EnterpriseInstall 路由，App 启动时根据 `checkEnterpriseInstall` 结果决定进入安装流程或主界面
  - 验收：首次启动进入安装流程；已安装直接进入 AIOSWorkspace
  - 涉及文件：Renderer 路由配置文件
  - 依赖：7.5、6.5
  - 复杂度：低

---

## Phase 8: Update / Repair / Rollback + Runtime Doctor（预计 3 天）

> 目标：实现安装后运维能力——9 项 Doctor 诊断、Desktop/Agent 更新、L1-L5 修复、五维度回滚。

### 8.1 Runtime Doctor（9 项检查）

- [ ] 实现 `src/main/enterprise/doctor/check-gateway-reachable.ts`：`fetch(http://127.0.0.1:<port>/health)` 验证 Gateway 可达性
  - 涉及文件：`src/main/enterprise/doctor/check-gateway-reachable.ts`
  - 依赖：Phase 1（DeploymentConfig）
  - 复杂度：低

- [ ] 实现 `src/main/enterprise/doctor/check-python-deps.ts`：`venv\Scripts\python.exe -c "import requirements"` 验证 Python 依赖完整性
  - 涉及文件：`src/main/enterprise/doctor/check-python-deps.ts`
  - 依赖：无
  - 复杂度：低

- [ ] 实现 `src/main/enterprise/doctor/check-agent-files.ts`：核心入口文件 exists + SHA-256 抽查
  - 涉及文件：`src/main/enterprise/doctor/check-agent-files.ts`
  - 依赖：Phase 2（checksum-verifier）
  - 复杂度：低

- [ ] 实现 `src/main/enterprise/doctor/check-profile-db.ts`：SQLite `PRAGMA integrity_check`
  - 涉及文件：`src/main/enterprise/doctor/check-profile-db.ts`
  - 依赖：无
  - 复杂度：低

- [ ] 实现 `src/main/enterprise/doctor/check-skills.ts`：遍历 profile-runtime.db skills 表 + 文件系统校验
  - 涉及文件：`src/main/enterprise/doctor/check-skills.ts`
  - 依赖：无
  - 复杂度：低

- [ ] 实现 `src/main/enterprise/doctor/check-policy.ts`：DB readonly 标记与实际文件权限对比
  - 涉及文件：`src/main/enterprise/doctor/check-policy.ts`
  - 依赖：无
  - 复杂度：低

- [ ] 实现 `src/main/enterprise/doctor/check-port-binding.ts`：`isPortOccupied(port)` + 确认绑定 127.0.0.1
  - 涉及文件：`src/main/enterprise/doctor/check-port-binding.ts`
  - 依赖：现有 `profile-runtime-manager.ts`
  - 复杂度：低

- [ ] 实现 `src/main/enterprise/doctor/check-dir-permission.ts`：Windows ACL 读取校验
  - 涉及文件：`src/main/enterprise/doctor/check-dir-permission.ts`
  - 依赖：无
  - 复杂度：中

- [ ] 实现 `src/main/enterprise/doctor/check-config-validity.ts`：config.yaml / .env Zod schema 校验
  - 涉及文件：`src/main/enterprise/doctor/check-config-validity.ts`
  - 依赖：Phase 1（DeploymentConfig schema）
  - 复杂度：低

- [ ] 实现 `src/main/enterprise/doctor/runtime-doctor.ts`：`runAllChecks(config, marker)` 并发执行 9 项检查（单项超时 10s），汇总 `DoctorReport`；`exportDoctorReport(report, exportPath)` 导出为 `doctor-report-<timestamp>.json`
  - 验收：9 项检查总耗时 < 60s；单项异常标记为 error 不影响其他项
  - 涉及文件：`src/main/enterprise/doctor/runtime-doctor.ts`
  - 依赖：8.1.1-8.1.9
  - 复杂度：中

### 8.2 Enterprise Updater

- [ ] 实现 `src/main/enterprise/enterprise-updater.ts`：`checkForUpdates(config)` → `UpdateCheckResult`；`updateDesktop()` 委托 electron-updater（NSIS oneClick perMachine:false）；`updateAgent(config, onProgress)` 流程：停止 Gateway → 备份当前 agent → 下载新版本 → 校验 → 替换 → Doctor → 启动
  - 验收：Desktop 更新通过 electron-updater 完成；Agent 更新后自动执行 Doctor；版本不兼容时自动回滚
  - 涉及文件：`src/main/enterprise/enterprise-updater.ts`
  - 依赖：8.1（runtime-doctor）、Phase 2（checksum-verifier）、8.4（enterprise-rollback 备份）
  - 复杂度：高

### 8.3 Enterprise Repair

- [ ] 实现 `src/main/enterprise/enterprise-repair.ts`：`executeRepair(level, config, onProgress)` —— L1 检查/重启 Gateway pid → L2 重建 venv → L3 校验/修复 agent 文件 → L4 校验/修复 profile-runtime.db → L5 重建 Profile；递进执行（LN 包含 L1..LN-1）
  - 验收：选择 L3 → 依次执行 L1+L2+L3；修复后自动执行 Doctor
  - 涉及文件：`src/main/enterprise/enterprise-repair.ts`
  - 依赖：8.1（runtime-doctor）、Phase 4（python-venv-installer）、Phase 5（profile-runtime-bootstrapper）
  - 复杂度：高

### 8.4 Enterprise Rollback

- [ ] 实现 `src/main/enterprise/enterprise-rollback.ts`：`createRollbackSnapshot(target, sourcePath)` 备份到 `%LOCALAPPDATA%\AIOS-Hermes\rollback\<target>-<timestamp>\`；`executeRollback(target, snapshot)` 校验备份 checksum → 停止相关服务 → 恢复 → Doctor；`listRollbackSnapshots()` 读取 install-marker 中的 rollbackSnapshots
  - 验收：备份前自动创建快照；回滚前校验 SHA-256；回滚后自动执行 Doctor；备份损坏报 `E_ROLLBACK_CHECKSUM_MISMATCH`
  - 涉及文件：`src/main/enterprise/enterprise-rollback.ts`
  - 依赖：8.1（runtime-doctor）、Phase 2（checksum-verifier）、6.2（install-marker）
  - 复杂度：高

### 8.5 IPC Handler 补全

- [ ] 补全 `src/main/enterprise/enterprise-ipc.ts` 中 Phase 8 相关的 IPC handler：enterprise-install:checkUpdates / updateAgent / repair / listSnapshots / rollback / runDoctor / exportDoctor
  - 验收：13 个 IPC handler 全部实现（Phase 6 已占位的此处填充真实实现）
  - 涉及文件：`src/main/enterprise/enterprise-ipc.ts`
  - 依赖：8.1-8.4
  - 复杂度：中

### 8.6 扩展 profile-runtime-ipc.ts

- [ ] 扩展现有 `src/main/profile-runtime-ipc.ts`：新增 Enterprise 相关 IPC handler 注册入口（调用 `setupEnterpriseInstallIPC`）
  - 涉及文件：`src/main/profile-runtime-ipc.ts`（改造）
  - 依赖：6.5、8.5
  - 复杂度：低

---

## 测试任务规划

### T1: Phase 1 单元测试

- [ ] DeploymentConfigSchema Zod 校验测试：合法 JSON 通过、非法 JSON 字段级错误、条件校验（bundleUrl/sourceType 联动、gitUrl/branch/sourceType 联动）
  - 涉及文件：`src/main/enterprise/__tests__/deployment-config.test.ts`
  - 依赖：Phase 1
  - 复杂度：中

- [ ] loadDeploymentConfig 测试：文件不存在返回默认配置 + usedDefault=true、IO 错误返回 ok=false
  - 涉及文件：`src/main/enterprise/__tests__/deployment-config.test.ts`
  - 依赖：Phase 1
  - 复杂度：低

### T2: Phase 2 单元测试

- [ ] checksum-verifier 测试：SHA-256 流式校验正确性、大文件性能（1GB < 10s）
  - 涉及文件：`src/main/enterprise/__tests__/checksum-verifier.test.ts`
  - 依赖：Phase 2
  - 复杂度：中

- [ ] runtime-bundle-manager 测试：三种 sourceType 分支、复用检测、断点续传、校验失败报错
  - 涉及文件：`src/main/enterprise/__tests__/runtime-bundle-manager.test.ts`
  - 依赖：Phase 2
  - 复杂度：高

### T3: Phase 3 单元测试

- [ ] preflight-checker 测试：20 项检查 mock、P0 阻断逻辑、P1 警告逻辑、P2 信息逻辑、单项超时处理、并发执行
  - 涉及文件：`src/main/enterprise/__tests__/preflight-checker.test.ts`
  - 依赖：Phase 3
  - 复杂度：高

### T4: Phase 4 单元测试

- [ ] hermes-agent-source-installer 测试：bundle 模式提取、git-clone 模式 mock、PAT 不落盘验证
  - 涉及文件：`src/main/enterprise/__tests__/hermes-agent-source-installer.test.ts`
  - 依赖：Phase 4
  - 复杂度：中

- [ ] python-venv-installer 测试：venv 创建/复用、依赖安装 wheels/pip 优先级
  - 涉及文件：`src/main/enterprise/__tests__/python-venv-installer.test.ts`
  - 依赖：Phase 4
  - 复杂度：中

### T5: Phase 5 单元测试

- [ ] profile-runtime-bootstrapper 测试：7 Profile 目录创建、端口递增分配、用户数据保留、Skills 安装
  - 涉及文件：`src/main/enterprise/__tests__/profile-runtime-bootstrapper.test.ts`
  - 依赖：Phase 5
  - 复杂度：高

### T6: Phase 6 单元测试

- [ ] enterprise-installer 流水线测试：20 步有序执行、失败终止、进度推送、取消清理、已有安装检测
  - 涉及文件：`src/main/enterprise/__tests__/enterprise-installer.test.ts`
  - 依赖：Phase 6
  - 复杂度：高

- [ ] install-lock 测试：并发互斥、stale lock 清理、超时
  - 涉及文件：`src/main/enterprise/__tests__/install-lock.test.ts`
  - 依赖：Phase 6
  - 复杂度：中

- [ ] install-log 测试：JSON Lines 格式、脱敏规则、日志级别
  - 涉及文件：`src/main/enterprise/__tests__/install-log.test.ts`
  - 依赖：Phase 6
  - 复杂度：低

### T7: Phase 7 组件测试

- [ ] EnterpriseInstallScreen 渲染测试：11 态切换、Panel 对应渲染、错误展示
  - 涉及文件：`src/renderer/src/screens/EnterpriseInstall/__tests__/EnterpriseInstallScreen.test.tsx`
  - 依赖：Phase 7
  - 复杂度：中

- [ ] use-install-state-machine Hook 测试：状态转换规则、非法转换拒绝、错误处理
  - 涉及文件：`src/renderer/src/screens/EnterpriseInstall/__tests__/use-install-state-machine.test.ts`
  - 依赖：Phase 7
  - 复杂度：中

### T8: Phase 8 单元测试

- [ ] runtime-doctor 测试：9 项检查 mock、单项异常不影响其他项、总耗时 < 60s、报告导出
  - 涉及文件：`src/main/enterprise/doctor/__tests__/runtime-doctor.test.ts`
  - 依赖：Phase 8
  - 复杂度：高

- [ ] enterprise-repair 测试：L1-L5 递进执行、修复后 Doctor
  - 涉及文件：`src/main/enterprise/__tests__/enterprise-repair.test.ts`
  - 依赖：Phase 8
  - 复杂度：中

- [ ] enterprise-rollback 测试：备份创建、checksum 校验、恢复、无备份时灰显
  - 涉及文件：`src/main/enterprise/__tests__/enterprise-rollback.test.ts`
  - 依赖：Phase 8
  - 复杂度：中

### T9: 集成测试

- [ ] 端到端安装流水线集成测试：从 checkEnterpriseInstall 到 openAIOSWorkspace 完整执行（mock 外部依赖：HTTP 下载、Git clone、Python venv）
  - 涉及文件：`src/main/enterprise/__tests__/integration/install-pipeline.test.ts`
  - 依赖：Phase 1-8 全部
  - 复杂度：高

- [ ] IPC 端到端测试：Preload → IPC → Main Process handler 调用链路验证（13 个 IPC 通道）
  - 涉及文件：`src/main/enterprise/__tests__/integration/ipc-e2e.test.ts`
  - 依赖：Phase 6-8
  - 复杂度：高

### T10: 安全测试

- [ ] 安全策略验证测试：Gateway 绑定 127.0.0.1 强制约束、不写 HKLM、不改 PATH、不创建 Service、Token 不落盘不进日志、目录 ACL 设置
  - 涉及文件：`src/main/enterprise/__tests__/security/security-policy.test.ts`
  - 依赖：Phase 1-8 全部
  - 复杂度：高

---

## 任务依赖关系与并行可能性

### 串行依赖链（不可并行）

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8
```

### Phase 内可并行任务

| Phase | 可并行任务组 | 说明 |
|-------|-------------|------|
| Phase 1 | 1.1.1 ∥ 1.1.2 | enterprise-constants.ts 与 enterprise-schema.ts 无互相依赖 |
| Phase 2 | 2.1 ∥ (Phase 1) | checksum-verifier.ts 为独立模块，可与 Phase 1 后半段并行 |
| Phase 3 | 3.1 ∥ 3.2（P0 与 P1/P2 检查项实现可并行） | 但 runPreflight 编排依赖全部检查项 |
| Phase 4 | 4.1 ∥ 4.2 ∥ 4.3 ∥ 4.4 | Agent Installer / Venv Installer / Runtime Bootstrapper / Config Provisioner 互不依赖 |
| Phase 5 | 5.1 ∥ 5.2 | Profile Bootstrapper 与 Policy Installer 核心逻辑可并行（Policy Installer 被 Bootstrapper 调用，需先完成接口定义） |
| Phase 7 | 7.4 全部 Panel 组件可并行开发 | 各 Panel 互不依赖，仅需类型定义 |
| Phase 8 | 8.1.1-8.1.9 全部 Doctor 检查可并行 | 9 项检查互不依赖 |

### 关键路径

```
Phase 1 (2d) → Phase 2 (2d) → Phase 3 (2d) → Phase 4 (3d) → Phase 5 (3d) → Phase 6 (2d) → Phase 7 (3d) → Phase 8 (3d)
```

**关键路径总时长**: 20 天（串行）；利用 Phase 内并行可压缩至约 16 天。

---

## 与现有代码的集成点汇总

| 现有模块 | 改造策略 | 改造 Phase |
|---------|---------|-----------|
| `src/main/installer.ts` | 保留为 fallback；新增 `enterprise/enterprise-installer.ts` 为主入口 | Phase 6 |
| `src/main/gateway-supervisor.ts` | 增加 `startupTimeoutMs` 可配置化 | Phase 5 |
| `src/main/profile-runtime-manager.ts` | 增加 `isPortOccupied` 端口递增分配逻辑 | Phase 5 |
| `src/main/profile-runtime-db.ts` | 新增 `install_events` / `runtime_doctor_reports` 表 + `policy_readonly` 字段 | Phase 5 |
| `src/main/profile-runtime-ipc.ts` | 扩展 Enterprise IPC handler 注册入口 | Phase 8 |
| `src/preload/index.ts` | 新增 `enterpriseInstall` 命名空间 | Phase 7 |
| `src/shared/profile-runtime/` | 扩展 Enterprise 类型与合约 | Phase 1 |
| `src/renderer/src/screens/Install/Install.tsx` | 保留为旧安装流程；新增 `EnterpriseInstall/` 屏幕 | Phase 7 |
