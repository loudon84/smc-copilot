# 任务简报模板

复制到 `docs/superpowers/plans/` 或任务 Issue 描述。

---

## 元信息

| 项 | 值 |
|----|-----|
| 日期 | YYYY-MM-DD |
| 域 | <!-- hermes-workbench / preload-ipc / … --> |
| PRD / Plan | <!-- 链接 --> |
| 预估 touched files | <!-- 3–8 --> |

## 目标

<!-- 一句话可验证结果 -->

## Context Map（必读）

- [ ] `docs/ai-coding/context-map/<domain>.md`
- [ ] `AGENTS.md` § <!-- 相关节 -->
- [ ] <!-- 其他 L3 文件，最多 3 个 -->

## 范围

### 做

- 

### 不做

- 

## 约束

- [ ] 不改 `Layout.tsx` / `MainPage`（若 Hermes 内页任务）
- [ ] 新 IPC 走 API_CONTRACTS 五步
- [ ] 不触碰 `#command by loudon` 注释块

## 验收

```bash
npm run typecheck
<!-- npm test / npm run lint 如需要 -->
```

## 任务分解

- [ ] Task 1：…
- [ ] Task 2：…
