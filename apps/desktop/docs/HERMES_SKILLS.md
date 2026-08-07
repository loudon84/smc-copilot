# Hermes Skills — Agent 参考

> **用途**：Agent 在读取、展示、安装/卸载或变更 Skill 相关逻辑时的单一事实源。  
> **触发词**：`HermesSkillsPage`、`listInstalledSkills`、`listBundledSkills`、`installSkill`、`SKILL.md`、`profileHome/skills`、`resources/skills`、MCP skill bridge。  
> **相关**：IPC 全表见 [`API_CONTRACTS.md`](API_CONTRACTS.md)；模块边界见 [`MODULES.md`](MODULES.md) § skills.ts；V6.1 MCP 见 [`API_CONTRACTS.md`](API_CONTRACTS.md) § Hermes MCP Registry。

---

## TL;DR

| 问题 | 答案 |
|------|------|
| Skills 页走 Gateway HTTP 吗？ | **否**。列表/预览 = Main 扫本地目录；安装/卸载 = Hermes **CLI** |
| 已安装列表从哪来？ | `{profileHome(profile)}/skills/<category>/<name>/SKILL.md` |
| 内置列表从哪来？ | `{getHermesRepo()}/skills/...`（hermes-agent 源码树，**不是** `copilot-desktop/resources/skills`） |
| Local Hermes 用哪个 profile？ | 固定 `"default"` → `~/.hermes` |
| Gateway 与 Skills 页关系？ | 页不调用 Gateway；运行时 Agent 仍从同一 `~/.hermes/skills` 发现 skill |

---

## 进程边界

```
Renderer (HermesSkillsPage)
  → window.hermesAPI.*          # 仅 Preload，禁止 ipcRenderer / Node
Preload (index.ts)
  → ipcRenderer.invoke("list-*-skills" …)
Main (index.ts → skills.ts)
  → 文件系统读 SKILL.md        # 列表、预览
  → execFileSync hermes CLI     # 安装、卸载
Hermes Agent (外部)
  → ~/.hermes/skills 运行时发现  # 与 UI 列表同源，但 UI 不经过 Gateway HTTP
```

**禁止假设**：存在 `GET /v1/skills` 或类似 Gateway REST 端点供 Skills 页使用。

---

## 关键文件索引

| 层级 | 路径 | 职责 |
|------|------|------|
| UI | `src/renderer/src/screens/Hermes/pages/Skills/HermesSkillsPage.tsx` | 双 Tab：installed / bundled；预览 `SKILL.md` |
| Hook | `src/renderer/src/screens/Hermes/hooks/useHermesDefaultSkills.ts` | 并行 `installed()` + `bundled()`；暴露 refresh/install/uninstall/read |
| Context | `src/renderer/src/screens/Hermes/context/HermesDefaultContext.tsx` | 注入 `skills` |
| Renderer API | `src/renderer/src/screens/Hermes/api/hermesDefaultApi.ts` | `skills.*` → `window.hermesAPI`，profile 常量 `"default"` |
| Preload | `src/preload/index.ts` | `listInstalledSkills` / `listBundledSkills` / `getSkillContent` / `installSkill` / `uninstallSkill` |
| IPC 注册 | `src/main/index.ts` | `list-installed-skills` 等 5 个 channel |
| Main 逻辑 | `src/main/skills.ts` | 扫盘、解析 frontmatter、CLI 安装/卸载 |
| Profile 路径 | `src/main/utils.ts` | `profileHome(profile)` |
| Hermes 根路径 | `src/main/installer.ts` + `enterprise/windows/path-resolver.ts` | `getHermesRepo()` / `getHermesPython()` / `getHermesScript()` |
| SSH 远程 | `src/main/ssh-remote.ts` | `sshListInstalledSkills` 等（connection mode = ssh 时） |
| 桌面 bundled 资源 | `resources/skills/` | 安装时拷贝的系统 skill（如 V6.1 `mcp-skill-bridge`），**非** Skills 页 bundled 数据源 |

---

## 调用链（Renderer → Main）

```
HermesSkillsPage
  → useHermesDefault().skills
  → useHermesDefaultSkills()
  → hermesDefaultApi.skills.*
  → window.hermesAPI.*
  → ipcMain.handle("list-*-skills" | "get-skill-content" | "install-skill" | "uninstall-skill")
  → src/main/skills.ts
```

`hermesDefaultApi.skills` 映射（profile = `HERMES_DEFAULT_PROFILE` = `"default"`）：

| Renderer 方法 | Preload | IPC channel | Main 函数 |
|---------------|---------|-------------|-----------|
| `installed()` | `listInstalledSkills(P)` | `list-installed-skills` | `listInstalledSkills(profile)` |
| `bundled()` | `listBundledSkills()` | `list-bundled-skills` | `listBundledSkills()` |
| `read(path)` | `getSkillContent(path)` | `get-skill-content` | `getSkillContent(skillPath)` |
| `install(id)` | `installSkill(id, P)` | `install-skill` | `installSkill(identifier, profile)` |
| `uninstall(name)` | `uninstallSkill(name, P)` | `uninstall-skill` | `uninstallSkill(name, profile)` |

---

## 目录与路径

### Skill 包结构（Hermes 约定）

```text
skills/
  <category>/
    <skill-name>/
      SKILL.md          # 必需；YAML frontmatter: name, description
      ...               # 脚本、资源等
```

### 已安装（installed Tab）

| 项 | 值 |
|----|-----|
| Main | `listInstalledSkills(profile)` |
| 根目录 | `join(profileHome(profile), "skills")` |
| default profile | `profileHome("default")` = `HERMES_HOME`（默认 `%USERPROFILE%\.hermes`） |
| 命名 profile | `~/.hermes/profiles/<name>/skills/...` |
| 元数据 | Main 读 `SKILL.md` frontmatter（`name` / `description`），**不经过 Gateway** |

`profileHome` 规则（`src/main/utils.ts`）：

```typescript
profile && profile !== "default"
  ? join(HERMES_HOME, "profiles", profile)
  : HERMES_HOME;
```

### 内置（bundled Tab）

| 项 | 值 |
|----|-----|
| Main | `listBundledSkills()` |
| 根目录 | `join(getHermesRepo(), "skills")` |
| Windows 企业安装 | `$INSTDIR/runtime/hermes/src/skills/...` |
| 非 Windows / 开发 | `~/.hermes/hermes-agent/skills/...` |
| 返回字段 | `source: "bundled"`；`installed` 由 UI 对比 installed 列表 |

`getHermesRepo()` = 已安装的 **hermes-agent 源码根**（见 `resolveRuntimePaths()`），与 `copilot-desktop/resources/skills` **无关**。

### 易混淆：`resources/skills/`

| 路径 | 用途 | Skills 页是否读取 |
|------|------|-------------------|
| `~/.hermes/skills/` | 用户已安装 skill | ✅ installed Tab |
| `{hermesRepo}/skills/` | hermes-agent 内置 skill  catalog | ✅ bundled Tab |
| `copilot-desktop/resources/skills/` | 桌面打包/安装时 seed 的系统 skill（如 MCP bridge） | ❌ 不直接作为 bundled 数据源 |

---

## 操作说明

### 列表与预览

- **列表**：Main `readdir` 遍历 category → skill 目录，解析各 `SKILL.md` frontmatter。
- **预览**：`getSkillContent(skillPath)` 读取 `{skillPath}/SKILL.md` 全文；installed 项带 `path` 字段，bundled 预览依赖已安装副本或 path 可用性。

### 安装 / 卸载（CLI，非 Gateway REST）

```text
安装: hermes skills install <identifier> --yes [-p <profile>]
卸载: hermes skills uninstall <name> [-p <profile>]
```

Main 通过 `execFileSync(getHermesPython(), [getHermesScript(), "skills", ...], { cwd: getHermesRepo() })` 调用。

安装成功后文件落在 `{profileHome(profile)}/skills/`；UI 需 `skills.refresh()` 重拉列表。

### 未接入 UI 的 API

`skills.ts` 中的 `searchSkills(query)` 调用 `hermes skills browse --query ... --json`。  
**当前 `HermesSkillsPage` 未使用**；页面仅 `installed` + `bundled` 两列表。

---

## 连接模式（SSH）

当 `desktop.json` 连接模式为 **ssh** 时，同一组 IPC 在 `src/main/index.ts` 内路由到 `ssh-remote.ts`：

- `sshListInstalledSkills` / `sshListBundledSkills` / `sshGetSkillContent` / `sshInstallSkill` / `sshUninstallSkill`

Local Hermes 默认仍为本机 `default` profile；远程模式下逻辑在 SSH 目标机执行等价扫盘/CLI。

---

## Agent 变更检查清单

改 Skill 相关代码前：

1. **确认数据源**：改列表/预览 → `src/main/skills.ts` + 目录路径；改 UI → Renderer hook/page；不要新增 Gateway HTTP 假设。
2. **Profile 贯穿**：非 default 场景必须传 `profile?: string` 并使用 `profileHome(profile)`；Local Hermes 页固定 `"default"`。
3. **IPC 四件套**：Main handler → Preload → `index.d.ts` →（有 channel 变更时）`docs/API_CONTRACTS.md`。
4. **区分三套目录**：installed / hermes-agent bundled / `resources/skills` seed，勿混用路径解析。
5. **安装/卸载**：走 CLI；若改参数需对齐 hermes-agent CLI 契约，不在 Electron 内 reimplement 安装逻辑。
6. **V6.1 MCP**：MCP registry 与 skill 绑定是独立域（`src/main/mcp/*`、`HermesMCPPage`）；与 Skills 页列表 IPC 不同，见 API_CONTRACTS § Hermes MCP Registry。

---

## 与 Hermes Agent / Gateway 的关系

| 阶段 | 行为 |
|------|------|
| Skills 页列表/预览 | Desktop Main 直接读磁盘 |
| Skills 页安装/卸载 | Hermes Python CLI |
| Gateway 运行时 | Agent 从 `~/.hermes/skills`（及 profile 目录）发现 skill 并执行；与 UI 数据源一致，但 **UI 不调用 Gateway HTTP** |

---

## 相关文档

| 文档 | 内容 |
|------|------|
| [`API_CONTRACTS.md`](API_CONTRACTS.md) | Skills IPC channel；V6.1 `mcp:*` |
| [`MODULES.md`](MODULES.md) | `skills.ts` 模块职责 |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | 三层进程与 Gateway 边界 |
| [`renderer/screens/INDEX.md`](renderer/screens/INDEX.md) | Local Hermes / Skills 屏 |
| [`AGENTS.md`](../AGENTS.md) | 新增 IPC 与 Profile 规则 |
