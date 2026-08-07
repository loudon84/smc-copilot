# 12 — Main / Preload 边界

## 1. 目标

Renderer Agent **不越界**到 Main/Preload；需要新能力时走标准扩展流。

## 2. 涉及文件（只读参考）

| 层 | 路径 |
|----|------|
| Main | `src/main/hermes-experts/*` |
| Preload | `src/preload/hermes-experts-api.ts` |
| 类型 | `src/shared/hermes-experts/*` |
| 契约 | `docs/API_CONTRACTS.md` |

## 3. 扩展流（必须顺序）

```text
1. src/shared/<domain>/ 类型
2. src/main/<domain>.ts 或 *-ipc.ts
3. src/main/index.ts 注册 ipcMain.handle
4. src/preload/*.ts 封装
5. src/preload/index.d.ts
6. workApi / hermesDefaultApi
7. features hook
8. page UI
```

## 4. 禁止

- Renderer `import` from `electron` / `fs` / `path`  
- Renderer 持有 token  
- Renderer fetch nodeskclaw / Expert MCP endpoint  

## 5. 验收标准

- [ ] v1.3 Hermes UI 任务 diff 不含 `src/main/`（除非用户明确要求 IPC）  

## 6. Cursor 执行提示

用户说「加个 IPC」→ 单独任务，不与页面 UI 同 PR。
