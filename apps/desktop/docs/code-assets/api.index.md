# API Index

## 主进程模块导出

| 模块 | 路径 | 核心导出 | 说明 |
|---|---|---|---|
| hermes | src/main/hermes.ts | sendMessage, startGateway, stopGateway, restartGateway, isRemoteMode, isGatewayRunning | Gateway 通信核心 |
| installer | src/main/installer.ts | checkInstall, startInstall, getHermesVersion, runDoctor, runUpdate | 安装管理 |
| config | src/main/config.ts | getEnv, setEnv, getConfig, setConfig, getModelConfig, setModelConfig, getConnectionConfig | 配置读写 |
| sessions | src/main/sessions.ts | listSessions, getSessionMessages, searchSessions | 会话查询(SQLite) |
| session-cache | src/main/session-cache.ts | listCachedSessions, syncSessionCache, updateSessionTitle | 会话缓存 |
| models | src/main/models.ts | listModels, addModel, removeModel, updateModel | 模型 CRUD |
| profiles | src/main/profiles.ts | listProfiles, createProfile, deleteProfile, setActiveProfile | 配置档案 |
| memory | src/main/memory.ts | readMemory, addMemoryEntry, updateMemoryEntry, removeMemoryEntry | 记忆管理 |
| soul | src/main/soul.ts | readSoul, writeSoul, resetSoul | 人格管理 |
| tools | src/main/tools.ts | getToolsets, setToolsetEnabled | 工具集 |
| skills | src/main/skills.ts | listInstalledSkills, listBundledSkills, getSkillContent, installSkill | 技能管理 |
| cronjobs | src/main/cronjobs.ts | listCronJobs, createCronJob, removeCronJob, pauseCronJob, triggerCronJob | 定时任务 |
| claw3d | src/main/claw3d.ts | claw3dStatus, claw3dSetup, claw3dStartAll, claw3dStopAll | Claw3D 管理 |
| sse-parser | src/main/sse-parser.ts | parseSseBlock, processCustomEvent, parseSseStream | SSE 解析 |
| locale | src/main/locale.ts | getLocale, setLocale | 语言设置 |
| utils | src/main/utils.ts | stripAnsi, profileHome, escapeRegex, safeWriteFile | 工具函数 |

## 外部 API 依赖

| 服务 | 端点 | 用途 | 认证 |
|---|---|---|---|
| Hermes Gateway | http://127.0.0.1:8642 | 本地 API Server | 无(本地) |
| Hermes Gateway (远程) | 用户配置的 remoteUrl | 远程 API Server | Bearer Token |
| Hermes CLI | child_process.spawn | CLI Fallback | 无 |
| GitHub Releases | github.com/fathah/hermes-desktop | 自动更新 | 无 |

## 文件系统依赖

| 路径 | 用途 | 读写 |
|---|---|---|
| ~/.hermes/ | Hermes Home 目录 | 读写 |
| ~/.hermes/config.yaml | Agent 配置 | 读写 |
| ~/.hermes/.env | 环境变量/API Keys | 读写 |
| ~/.hermes/desktop.json | Desktop 连接配置 | 读写 |
| ~/.hermes/state.db | 会话数据库(SQLite) | 只读 |
| ~/.hermes/models.json | 模型配置 | 读写 |
| ~/.hermes/MEMORY.md | 记忆文件 | 读写 |
| ~/.hermes/USER.md | 用户画像 | 读写 |
| ~/.hermes/SOUL.md | 人格文件 | 读写 |
| ~/.hermes/gateway.pid | Gateway PID | 读写 |
| ~/.hermes/profiles/ | 配置档案目录 | 读写 |
