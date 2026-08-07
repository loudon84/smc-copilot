# SMC Copilot（`smc-ai-copilot`）

**SMC Copilot** 是基于 Electron 的 **Portal Desktop** 桌面壳，用于承载 [Hermes Agent](https://github.com/loudon84/ai-os-hermes)。本仓库代码由 **hermes-desktop**（单运行时下的安装/配置/聊天）演进为多 Profile 协作文控台，支持跨 Profile 编排与内嵌 Web 自动化。

| | |
|---|---|
| **产品名称** | SMC Copilot |
| **包名 / 可执行文件** | `smc-ai-copilot` |
| **appId** | `com.smc.smc-ai-copilot` |
| **技术栈** | Electron 39 · React 19 · TypeScript · Tailwind CSS 4 |
| **开发文档** | [AGENTS.md](./AGENTS.md) · [docs/INDEX.md](./docs/INDEX.md) |

> **持续开发中。** API、界面与安装流程可能变更。架构与 IPC 契约请参阅 [AGENTS.md](./AGENTS.md) 与 [docs/API_CONTRACTS.md](./docs/API_CONTRACTS.md)。

## 语言

- 英文：[README.md](./README.md)
- 简体中文：`README.zh-CN.md`（本文件）

---

## 项目定位

SMC Copilot **不再只是** Hermes Agent 的安装向导，而是桌面端的 **控制面 + 工作台**，负责：

1. **部署与运维** Hermes Agent（本地安装、企业流水线、PyPI 镜像、Runtime Bundle）。
2. **并行运行多个 Profile Gateway**（default + 专家角色，端口 8642–8648）。
3. **为每个 Profile 提供独立入口**（Portal 工作台、Profile 工作台、运行时面板）。
4. **跨 Profile 协同**（委托调用、技能同步、会话上下文共享）。
5. **通过 Electron WebContentsView 嵌入外部 Web**（Web Operator），让人与 Agent 在 Portal 内共用同一浏览器视口。

Hermes Agent 仍是执行引擎（工具、记忆、消息 Gateway、学习闭环）。SMC Copilot 负责 **桌面壳**、**进程生命周期**、**SQLite 控制面** 与 **统一 UI**。

---

## 功能演进一览

| 阶段 | 重点 | 主要变化 |
|---|---|---|
| **V1.0 — hermes-desktop** | 单运行时桌面 | 引导安装、提供商配置、流式聊天、会话、技能、记忆、16 个消息 Gateway、Claw3D Office |
| **V1.1 — Multi Profile Runtime** | Portal Desktop | 7 个 Profile × 独立 Gateway；`profile-runtime.db` 控制面；Portal 工作台 + 专家 Profile 工作台；入口与布局 |
| **V1.2 — 运行时稳定性** | 运维能力 | 崩溃检测、自动重启、端口冲突检测、启动超时、Gateway 日志、应用重启后状态恢复 |
| **V1.2.1 — Enterprise Install** | 一键部署 | Deployment 配置与 Schema、Runtime Bundle（在线/离线）、20 步预检/安装流水线、Runtime Doctor、安装锁/标记/日志 |
| **V1.4 / V1.4.1 — 桌面壳加固** | 产品化 | 自定义标题栏/窗口 IPC、NSIS 预检、本地 zip/Git 源、PyPI 镜像预设、`agent-deps-installer`、品牌更名为 **SMC Copilot** |

---

## 核心能力

### 基础能力（继承自 hermes-desktop）

- 首次引导安装，支持 **本地 / 远程** 后端模式
- 流式聊天（SSE）、工具进度、Markdown、Token/费用展示
- 会话（SQLite FTS）、模型、提供商、记忆、SOUL 人格、技能、工具集、定时任务
- 16 个消息 Gateway 平台（Telegram、Discord、Slack 等）
- Hermes Office（Claw3D）、备份/导入、日志查看、自动更新
- 国际化：英语、西班牙语、葡萄牙语（巴西）、简体中文

### 多 Profile 运行时（V1.1+）

- **7 个 Profile**：`default`、`writer`、`coding`、`research`、`recruiters`、`finance`、`agenter`
- 每个 Profile **独立 Gateway**，监听 `127.0.0.1:8642`–`8648`
- **Profile Runtime 界面**：启停/重启、状态、配置导入、Gateway 日志（V1.2）
- **SQLite 控制面**：`~/.hermes/desktop/profile-runtime.db`

### 跨 Profile 编排

| 能力 | 说明 |
|---|---|
| **委托调用（Delegation）** | default Profile 调用专家 Profile（`POST /v1/chat/completions`），并写入审计 |
| **技能同步（Skill sync）** | Profile 间复制技能（跳过 / 覆盖并备份，SHA-256 校验） |
| **会话上下文共享** | 将会话导出为 `context.md`（快照 / 摘要 / 全文）— **不合并** `state.db` |

Preload API：`window.profileRuntime`、`window.profileEntry`。

### Portal 工作台与 Web Operator

| 界面 | 路由 | 作用 |
|---|---|---|
| **Portal Workspace** | `/aios-workspace` | default Profile 主控台：对话、多 Profile 状态、委托入口、启动 Web Operator |
| **Profile Workspace** | `/profile-workspace/:profileId` | 专家工作台（独立聊天、技能、上下文、审计） |
| **Profile Runtime** | `/profile-runtime` | 运行时运维与 Gateway 日志 |
| **Web Operator** | `/web-operator` | 三栏布局：Hermes 任务面板 · **WebContentsView** 视口 · 状态/审计面板 |

Web Operator（主进程：`src/main/browser/`）：

- 使用独立分区 `persist:aios-external-web` 的 **WebContentsView**
- 域名白名单、敏感操作确认（`browser.click`、`browser.type`）
- 审计日志（JSONL）：`~/.hermes/desktop/web-operator/`
- 本地 Tool Server：`127.0.0.1`（8765–8775），供 Hermes 工具桥接

Preload API：`window.aiosBrowser`。

### 企业安装与桌面壳（V1.2.1+）

- 20 步企业流水线：预检 → Bundle → Agent → venv → Profile → 安装标记
- Runtime Doctor（9 项检查）、安装锁 / 标记 / 脱敏日志
- 安全约束：Gateway **仅 127.0.0.1**、不写 HKLM/系统 PATH、密钥不写入标记或日志
- **V1.4.1**：本地 zip 或 Git 源、PyPI 镜像 UI（清华 / 阿里 / 腾讯 / 官方 / 自定义）、`desktop-runtime.json`、自定义窗口控制

---

## 架构（摘要）

严格遵循 **Main / Preload / Renderer** 三层隔离：

```
Renderer (React)
  → window.hermesAPI | profileRuntime | profileEntry | aiosBrowser
Preload (contextBridge)  →  src/preload/
Main (Node.js)           →  src/main/  （IPC、文件系统、SQLite、Gateway 进程）
Hermes Python Gateway    →  http://127.0.0.1:<port>/v1/chat/completions
```

新增后端能力须按：**Main 模块 → `ipcMain.handle` → Preload 封装 → `index.d.ts` → Renderer**。详见 [.cursor/rules/](./.cursor/rules/) 与 [AGENTS.md](./AGENTS.md)。

---

## 应用流程

**生命周期界面**（`App.tsx`）：

```
splash → welcome → installing → setup → main (Layout)
```

**主导航**（概览）：

| 分区 | 界面 |
|---|---|
| **Copilot** | 聊天、会话、Agents、模型、提供商、技能、Soul、记忆、工具、定时任务、Gateway、设置 |
| **Portal** | Portal 工作台、Profile 工作台、Profile Runtime、Web Operator |
| **可视化** | Office（Claw3D） |

聊天链路：Renderer → `hermesAPI.sendMessage` → Main `hermes.ts` → 本地 SSE 或 CLI 回退（或远程 HTTPS）。

---

## 安装（终端用户）

从发布渠道下载最新构建（Windows NSIS：`smc-copilot-<version>-setup.exe`）。

| 平台 | 安装包 |
|---|---|
| Windows | `.exe`（NSIS） |
| macOS | `.dmg` |
| Linux | `.AppImage`、`.deb`、`.rpm`、`.snap` |

> **Windows：** 安装包可能未签名，首次运行 SmartScreen 可能提示。

### 常用目录

| 路径 | 内容 |
|---|---|
| `%USERPROFILE%\.hermes\` | Agent 配置、`state.db`、Profile、桌面控制面 |
| `%LOCALAPPDATA%\Programs\SMC Copilot\`（或 `$INSTDIR`） | 程序本体、`runtime/`、`hermes-agent/`、`venv/`、日志 |
| `~/.hermes/desktop/profile-runtime.db` | 多 Profile 运行时状态 |
| `~/.hermes/desktop/web-operator/` | Web Operator 配置与审计日志 |

---

## 开发

### 环境要求

- Node.js 18+ 与 npm
- 首次运行需可访问网络以安装 Hermes/依赖（使用离线 Bundle 时可例外）

### 常用命令

```bash
npm install
npm run dev          # electron-vite 开发模式
npm run build        # 类型检查 + 生产构建
npm run typecheck
npm run test
npm run lint
```

平台打包：

```bash
npm run build:win
npm run build:mac
npm run build:linux
```

### 目录结构

| 目录 | 职责 |
|---|---|
| `src/main/` | 主进程 — IPC、Gateway、企业安装、browser/Web Operator |
| `src/preload/` | contextBridge API |
| `src/renderer/src/` | React UI（`screens/`、`components/`） |
| `src/shared/` | i18n、profile-runtime 与企业契约类型 |
| `resources/profiles/` | Profile 模板 |
| `docs/` | 架构、模块、API 契约 |
| `tests/` | Vitest |

### 文档索引

| 文档 | 适用场景 |
|---|---|
| [AGENTS.md](./AGENTS.md) | Cursor / Agent 编码速查 |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 进程模型、Gateway、V1.x 架构图 |
| [docs/MODULES.md](./docs/MODULES.md) | 各文件模块职责 |
| [docs/API_CONTRACTS.md](./docs/API_CONTRACTS.md) | IPC 通道列表 |
| [docs/READING_GUIDE.md](./docs/READING_GUIDE.md) | 建议阅读顺序 |

---

## 技术栈

- **Electron** 39 + **electron-vite** 5
- **React** 19 + **Tailwind CSS** 4 + **lucide-react**
- **TypeScript** 5.9
- **better-sqlite3** — 会话与 profile-runtime 控制面
- **i18next** — 4 种语言
- **Vitest** + Testing Library
- **electron-updater** — 发布更新

---

## 与 Hermes Agent 的关系

SMC Copilot 是 **桌面宿主**。[Hermes Agent](https://github.com/NousResearch/hermes-agent) 提供 Agent 行为、工具、记忆与 Gateway 集成。桌面应用负责安装配置 Hermes、按 Profile 拉起 Gateway 进程，并通过统一的 Portal UI 呈现运维与协作能力。

---

## 参与贡献

请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md)。较大规模的 UI 或 IPC 变更请遵循 `.cursor/rules/`，并在契约变更时同步更新 `docs/API_CONTRACTS.md`。

## 许可证

MIT — 见 [LICENSE](./LICENSE)。
