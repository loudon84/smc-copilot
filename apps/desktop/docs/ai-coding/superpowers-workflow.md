# Superpowers 项目使用规范

> SMC Copilot（ai-os-desktop）与 [Superpowers](https://github.com/obra/superpowers) 插件的协作约定。

## 安装状态

- Cursor 插件：**Superpowers**（marketplace `/add-plugin superpowers`）
- 项目副本：`.cursor/skills/`（14 skills）、`.cursor/commands/`（legacy，优先用 skill）
- 启用配置：`.cursor/settings.json` → `plugins.superpowers.enabled`

## 何时触发哪个 Skill

| 场景 | Skill | 说明 |
|------|-------|------|
| 新功能 / 改行为 / 重构页面前 | `brainstorming` | 先澄清需求与设计，**禁止**直接写代码 |
| 设计已批准 | `writing-plans` | 产出可执行任务计划 |
| 同会话执行计划 | `subagent-driven-development` | 推荐：每任务独立子代理 + 两阶段审查 |
| 跨会话 / 需人工检查点 | `executing-plans` | 分批执行 |
| 写实现代码 | `test-driven-development` | RED → GREEN → REFACTOR |
| Bug / 测试失败 | `systematic-debugging` | 先根因再修复 |
| 任务间 / 合并前 | `requesting-code-review` | 对照计划审查 |
| 收到 review 意见 | `receiving-code-review` | 技术验证后再改 |
| 分支收尾 | `finishing-a-development-branch` | merge / PR / 清理 worktree |
| 宣称完成前 | `verification-before-completion` | 必须跑命令拿证据 |
| 并行独立任务 | `dispatching-parallel-agents` | 无共享状态时 |
| 隔离开发 | `using-git-worktrees` | 执行计划前建 worktree |

## 与本仓库文档的衔接

### 计划与设计落盘

| 类型 | 路径 | 命名 |
|------|------|------|
| 实施计划 | `docs/superpowers/plans/` | `YYYY-MM-DD-<feature>.md` |
| 设计规格 | `docs/superpowers/specs/` | `YYYY-MM-DD-<topic>-design.md` |

`writing-plans` 产出的计划应引用 **context-map** 中的域文件，例如：

```markdown
## 上下文
- 必读：docs/ai-coding/context-map/hermes-workbench.md
- IPC：docs/API_CONTRACTS.md § Hermes Experts
```

### 执行计划时的阅读链

```text
计划文件
  → context-map/<domain>.md（任务域）
  → AGENTS.md（API / 目录一句地图）
  → 计划内列出的源码入口（最多 3–5 个文件）
  → 动手
```

### Hermes Screen（Work 专家台）额外约束

`brainstorming` / `writing-plans` 阶段须纳入：

- `docs/specs/v1.3-workbuddy-product-line/00-overview.md`
- `docs/specs/v1.3-workbuddy-product-line/03-layout-boundary.md`
- `docs/specs/v1.3-workbuddy-product-line/13-ai-coding-structure.md`

## 与本仓库 Rules 的关系

| 层级 | 来源 | 优先级 |
|------|------|--------|
| 用户当次指令 | Chat | 最高 |
| 产品注释 | `#command by loudon` 块 | 不可改（`008-loudon-command-comments.mdc`） |
| 项目 Rules | `.cursor/rules/*.mdc` | 高于 Superpowers 默认行为 |
| Superpowers Skills | 插件 | 填补流程与质量习惯 |
| AGENTS.md | 仓库 | 事实源索引 |

冲突示例：用户说「不要 TDD」→ 跳过 `test-driven-development`；用户未说 → Hermes UI 任务仍遵守 `13-ai-coding-structure.md` Checklist。

## 子代理

插件提供 `code-reviewer` 子代理：主要步骤完成后对照计划做审查。与 `requesting-code-review` skill 配合使用。

## 本地原型目录

Brainstorming 可视化原型可能写入 `.superpowers/`（已加入 `.gitignore`）。**不要**把原型当生产代码合并。

## 验证习惯（verification-before-completion）

完成前至少执行：

```bash
npm run typecheck
```

触及 IPC / Main / Preload 时加 `npm test`；触及 Renderer eslint 区加 `npm run lint`。

## 反模式

```text
❌ 跳过 brainstorming 直接改 screens/Hermes
❌ 计划里写「读整个 prd/ 目录」
❌ 未更新 API_CONTRACTS 就新增 ipcMain.handle
❌ 用 /brainstorm 命令代替 skill（legacy commands 已 deprecated）
```
