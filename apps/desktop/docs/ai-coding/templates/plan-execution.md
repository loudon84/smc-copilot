# 计划执行模板（Superpowers）

配合 `writing-plans` / `subagent-driven-development` / `executing-plans` 使用。

---

> **面向 AI 代理的工作者：** 必需子技能：`subagent-driven-development`（推荐）或 `executing-plans`。步骤用 `- [ ]` 跟踪。

## 计划信息

| 项 | 值 |
|----|-----|
| 计划文件 | `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` |
| 设计规格 | `docs/superpowers/specs/…`（如有） |
| Context Map | `docs/ai-coding/context-map/<domain>.md` |

## 执行前

- [ ] 读 context-map + 计划全文
- [ ] `using-git-worktrees`（若需隔离分支）
- [ ] `npm run typecheck` 基线通过

## 任务块格式（每任务 2–5 分钟）

### Task N: <标题>

**Files:**
- `path/to/file.ts` — 具体改动

**Step 1:** 写失败测试（TDD）  
**Step 2:** 实现最小代码  
**Step 3:** 验证  

```bash
npm run typecheck
# 或 npm test -- <pattern>
```

- [ ] 完成
- [ ] `requesting-code-review`（任务间）

## 执行后

- [ ] `verification-before-completion` — 贴命令输出
- [ ] `finishing-a-development-branch`
- [ ] 007 文档同步（若有行为/契约变更）

## 禁止

- 偏离计划擅自扩大范围
- 跳过测试直接实现（除非用户明确豁免 TDD）
- 未读 context-map 就批量 Read 源码目录
