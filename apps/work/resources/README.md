# Work packaging notes (`apps/work`)

本目录是 Electron 打包时的运行时资源根（`resources/**`）。下面记录近期踩过的坑与正确打包方式，供本地 / CI 发版对照。

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
| `hermes-bootstrap/` | 预留 `install.ps1`（T5 发版阶段拷入；本地常仅 `.gitkeep`） | 目录在 asarUnpack；脚本视发版阶段 |
| `artifact-preview/` | 预览静态页 | 随 `resources/**` |
| `icon.png` | 应用图标资源 | 是 |
| `work-build-info.json` | 构建身份（`generate-work-build-info.mjs` 生成） | 是（extraResources） |
| `work-registry-config.json` | Discover Registry 描述符（**按打包环境生成**） | 仅当企业 profile 生效时存在并拷贝 |

**不会**把整个 `hermes-agent` Git 仓库打进安装包。Agent checkout 由运行时 Bootstrap 按 `release-source.json` 拉到本机 Hermes Home（例如 `%LOCALAPPDATA%\hermes\hermes-agent`）。

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
3. `dist/win-unpacked/resources/app.asar` 可读且 `package.json` 合法。
4. 企业包存在 `work-registry-config.json`，内容与 profile 语义一致。
5. `win-unpacked\smc-copilot.exe` 冒烟可启动；Registry 日志 `source=build`（企业）或符合预期的 default。

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
