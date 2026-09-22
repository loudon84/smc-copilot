# Work packaging notes (`apps/work`)

本目录是 Electron 打包时的运行时资源根（`resources/**`）。下面记录近期踩过的坑与正确打包方式，供本地 / CI 发版对照。

## 硬控（必须先确认再改）

打包规则已锁定（0.7.6–0.7.8 事故复盘）。**修改下列任一内容前，必须在当前对话中向用户说明意图并获得明确同意**，不得擅自改规则：

- `electron-builder.yml` 的 `files` / `asarUnpack` / `extraResources`
- 安装源：`resources/hermes-native/release-source.json`
- Knowledge 源：`SMC_KNOWLEDGE_SERVICE_URL` → `work-knowledge-config.json` 生成链路
- Registry 源：`SMC_WORK_REGISTRY_BUILD_PROFILE_FILE` → `work-registry-config.json`
- Bootstrap 打包：`prepare:hermes-bootstrap` / 运行时 `install.ps1` 解析（禁止恢复本机硬编码路径）
- 与打包强相关的 bootstrap / listen-inspect 就绪语义

Agent 强制规则：仓库 `.cursor/rules/work-packaging-hard-controls.mdc`；入口提醒：`AGENTS.md` → Packaging hard controls。

**允许不经再确认**：仅升 `version` 并按现行规则执行 `npm run build:win`。

---

## 快速打包（Windows 安装包）

在 `apps/work` 下执行（不要依赖已损坏的 Nx `work:package-win` 图，若 monorepo 缺 `desktop` 项目会失败）：

```powershell
cd E:\git\smc-copilot\apps\work
npm run build:win
```

产物：

| 路径 | 说明 |
|------|------|
| `dist/smc-copilot-<version>-setup.exe` | NSIS 安装包 |
| `dist/win-unpacked/` | 未压缩目录，便于冒烟 |

正式发版入口（更严校验）：`npm run release:build:win` → `scripts/build-work-release.ps1`。

版本号来自 `package.json` 的 `version`（可用 `node scripts/set-version.mjs <semver>` 改写）。

---

## asar 完整性（必读）

### 现象

安装后双击 `smc-copilot.exe` 立即退出（exit code 1），无窗口、无新的 `hermes-bootstrap-*.log`。用 Electron 读 `app.asar/package.json` 会得到 HTML 碎片、`JSON.parse` 失败。

### 根因

`electron-builder` 默认 `**/*` 把源码、`.cursor`、docs、prd 等打进 asar（可达数万条目 / 数百 MB），目录头与包体 offset 错位，**入口 `package.json` 不可解析**。

### 现行约束（`electron-builder.yml`）

- 显式包含：`out/**/*`、`package.json`、`resources/**/*`
- 排除非运行时树：`src`、`components`、`.cursor`、`docs`、`prd`、`tests` 等
- **禁止**使用顶层 `"!**/*"` 白名单：同一套 `files` 模式会套到 `nodeModuleFilePatterns`，导致 **生产依赖一个都打不进去**

打包后建议自检：

```powershell
# package.json 必须是合法 JSON，且 integrity 与内容一致
# 冒烟：win-unpacked\smc-copilot.exe 应能拉起窗口（标题 SMC-Copilot）
```

---

## 本目录里有什么、会打进安装包什么

| 路径 | 作用 | 是否进安装包 |
|------|------|----------------|
| `hermes-native/release-source.json` | Hermes Agent 企业源（installUrl / commit pin） | 是（extraResources） |
| `hermes-policy/*.json` | SMC 托管策略 | 是 |
| `hermes-bootstrap/` | Native Bootstrap `install.ps1`（`prepare:hermes-bootstrap` 从 Hermes Agent 仓拷入） | **extraResources**；缺省时运行时 soft-skip |
| `artifact-preview/` | 预览静态页 | 随 `resources/**` |
| `icon.png` | 应用图标资源 | 是 |
| `work-build-info.json` | 构建身份（`generate-work-build-info.mjs` 生成） | 是（extraResources） |
| `work-registry-config.json` | Discover Registry 描述符（**按打包环境生成**） | 仅当企业 profile 生效时存在并拷贝 |
| `work-knowledge-config.json` | Knowledge 服务 origin（**按打包环境生成**） | 仅当 `SMC_KNOWLEDGE_SERVICE_URL` 有值时存在并拷贝 |

**不会**把整个 `hermes-agent` Git 仓库打进安装包。Agent checkout 由运行时 Bootstrap 按 `release-source.json` 拉到本机 Hermes Home（例如 `%LOCALAPPDATA%\hermes\hermes-agent`）。

### Hermes Bootstrap installer（`install.ps1`）

- **打入**：`npm run build` / `build:win` 会跑 `prepare:hermes-bootstrap`，从 `HERMES_BOOTSTRAP_INSTALL_PS1` / 旁路 `hermes-agent` 仓拷贝到 `resources/hermes-bootstrap/install.ps1`，再经 `extraResources` 进安装目录。
- **运行时解析**：仅 `HERMES_INSTALL_PS1` 环境变量覆盖 + 安装包 / 开发 `resources/hermes-bootstrap/install.ps1`。**不再**硬编码本机 `e:/git/hermes-agent/...`。
- **Soft-skip**：若安装包未带 `install.ps1`，但 `%LOCALAPPDATA%\hermes\bin\hermes(.exe)` 存在且 `http://127.0.0.1:8642/health` 为 200 → bootstrap 记 `SOFT_SKIP READY`，本地 chat 可用。

---

## Knowledge 服务 URL 打包

### 原则

- 打包后的 exe **不会**读 `apps/work/.env`（仅 `!app.isPackaged` 时 `loadDotEnvForDev`）。
- 也不会从 `hermes/.env` 的 `SMC_KB_API_*` 反推 Work HTTP Provider 地址。
- 企业包把 origin 写入 `resources/work-knowledge-config.json`，由 `resolveKnowledgeServiceUrl()` 在运行时读取。

### 解析顺序（安装后）

1. 进程环境变量 `SMC_KNOWLEDGE_SERVICE_URL`（运维覆盖）
2. 安装目录 `resources/work-knowledge-config.json`（构建写入）
3. 代码默认 `http://localhost:4530`

### 打包入口

环境变量：`SMC_KNOWLEDGE_SERVICE_URL`（`prepare:knowledge-config` 会先 `loadDotEnvFile(.env)`）

```powershell
cd E:\git\smc-copilot\apps\work
# .env 示例：
# SMC_KNOWLEDGE_SERVICE_URL=http://agent.superic.com:4530
# SMC_WORK_UPDATE_URL=https://release.superic.com/work/stable/
npm run build:win
```

构建日志期望：

```text
[generate-work-knowledge-config] prepared enterprise Knowledge resource serviceUrl=http://agent.superic.com:4530
```

产物校验：

```text
dist/win-unpacked/resources/work-knowledge-config.json
# { "schemaVersion": 1, "serviceUrl": "http://agent.superic.com:4530" }
```

未设置该变量时：Community——删除生成文件，运行时用 loopback 默认。

`SMC_WORK_UPDATE_URL` 仍由 `electron-builder.yml` → `app-update.yml` 注入，与 Knowledge 配置无关。

---

## Discover Registry（Skill 目录）打包

### 原则

- 不能把 Git 仓库 URL（如 `https://github.com/smc-copilot/hermes-registry.git`）直接传给打包器。
- 唯一企业入口环境变量：`SMC_WORK_REGISTRY_BUILD_PROFILE_FILE`
- 值必须是**绝对路径**，指向完整 `WorkRegistryEndpointDescriptor` JSON（`indexUrl` / `modelsUrl` / `contentBaseUrl` / `treeUrl` / `webBaseUrl` 等 HTTP 端点）。
- 未设置时：Community 模式——删除生成的 `work-registry-config.json`，运行时用代码内公开默认描述符。

### 现用企业 profile

仓库内模板（不进 asar，因 `build/` 被排除）：

`apps/work/build/registry-profiles/smc-copilot-hermes-registry.json`

对应公开仓：[smc-copilot/hermes-registry](https://github.com/smc-copilot/hermes-registry)。

### 企业包命令示例

```powershell
cd E:\git\smc-copilot\apps\work
$env:SMC_WORK_REGISTRY_BUILD_PROFILE_FILE = (Resolve-Path ".\build\registry-profiles\smc-copilot-hermes-registry.json").Path
npm run build:win
```

构建日志应出现：

```text
[generate-work-registry-config] prepared enterprise Registry resource
```

产物校验：

```text
dist/win-unpacked/resources/work-registry-config.json
```

启动后主进程日志期望：

```json
{"event":"work_registry_resolution","source":"build","registryId":"enterprise-smc-copilot-hermes-registry-main", ...}
```

若看到 `"source":"default"` 且 `public-*-hermes-registry-main`，说明本次包未嵌入企业描述符（未设环境变量，或生成失败）。

### 与「Open Registry」按钮

Discover 页「Open Registry」是前端链接；列表数据来自 Main `fetchRegistry()` → 当前描述符的 `indexUrl`。两边应指向同一组织的 registry，但**数据源以描述符为准**，不是按钮 href。

运行时覆盖（运维，非打包）：`HERMES_SKILL_REGISTRY_CONFIG_FILE` 指向本机完整描述符。旧名 `HERMES_SKILL_REGISTRY_URL` 已忽略。

---

## 推荐检查清单

1. `npm run typecheck` 通过（打包脚本会跑 typecheck）。
2. 企业包：已设置 `SMC_WORK_REGISTRY_BUILD_PROFILE_FILE` 绝对路径。
3. 企业 Knowledge：`.env` 或环境中有 `SMC_KNOWLEDGE_SERVICE_URL`，产物含 `work-knowledge-config.json`。
4. `dist/win-unpacked/resources/app.asar` 可读且 `package.json` 合法。
5. 企业包存在 `work-registry-config.json`，内容与 profile 语义一致。
6. `app-update.yml` 的 `url` 等于预期的 `SMC_WORK_UPDATE_URL`。
7. `win-unpacked\smc-copilot.exe` 冒烟可启动；Registry 日志 `source=build`（企业）或符合预期的 default。

---

## 相关脚本

| 脚本 | 作用 |
|------|------|
| `scripts/generate-work-registry-config.mjs` | 读 profile → 写/清 `resources/work-registry-config.json` |
| `scripts/lib/work-registry-build-profile.mjs` | profile 规范化与校验 |
| `scripts/generate-work-build-info.mjs` | 写 `work-build-info.json` |
| `scripts/run-electron-builder.mjs` | 调用 electron-builder |
| `scripts/test-work-registry-package.ps1` | 企业 / Community 打包证明 |
| `scripts/build-work-release.ps1` | 正式 Windows 发版流水线 |
