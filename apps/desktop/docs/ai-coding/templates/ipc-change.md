# IPC 变更模板

新/改 IPC channel 时逐步勾选。

## 1. 设计

- [ ] 输入/输出类型定义在 `src/shared/<domain>/`
- [ ] channel 命名：`domain:action`（与现有表一致）
- [ ] 是否需要 profile 参数 `profile?: string`
- [ ] 是否 long-running（需进度事件 + unsubscribe）

## 2. Main

- [ ] 逻辑在 `src/main/<domain>.ts` 或 `*-ipc.ts`
- [ ] `src/main/index.ts` 注册 `ipcMain.handle`（薄 handler）
- [ ] 路径经 `profileHome()`（若 profile-scoped）
- [ ] 错误码可诊断（非裸 Error 字符串）

## 3. Preload

- [ ] `src/preload/index.ts` 或 `*-api.ts` 封装
- [ ] `src/preload/index.d.ts` 类型声明（无 `any`）
- [ ] 事件 API 返回 unsubscribe

## 4. Renderer

- [ ] 仅 `window.*` 调用
- [ ] loading / empty / error 状态（若 UI 暴露）

## 5. 契约与测试

- [ ] `docs/API_CONTRACTS.md` 增量更新
- [ ] `tests/ipc-handlers.test.ts` 或域测试
- [ ] `npm run typecheck`

## 6. 文档（功能收尾）

- [ ] `.cursor/rules/007-sync-project-docs.mdc` checklist
- [ ] `AGENTS.md` / `docs/INDEX.md`（若版本或 API 表变更）

## 参考

- `docs/ai-coding/context-map/preload-ipc.md`
- `.cursor/rules/003-ipc-contract.mdc`
