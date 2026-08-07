# Context Map — Preload 与 IPC 契约

## 原则

Renderer 只调用 `window.*`；Preload 是唯一桥；契约类型在 `src/shared/`。

## 新能力五步

```text
1. src/shared/<domain>/          — 类型 / 常量
2. src/main/<domain>.ts 或 *-ipc.ts
3. src/main/index.ts             — ipcMain.handle 注册
4. src/preload/index.ts 或 *-api.ts
5. src/preload/index.d.ts
6. docs/API_CONTRACTS.md         — 必更新
```

## Preload 全局 API 索引

完整表见 `AGENTS.md` § Preload 暴露的全局 API。高频：

| API | 文件 |
|-----|------|
| `hermesAPI` | `src/preload/index.ts` |
| `smcShell` | `src/preload/shell-api.ts` |
| `desktopAuth` | `src/preload/auth-api.ts` |
| `aiosBrowser` | `src/preload/browser-api.ts` |
| `profileRuntime` | `src/preload/profile-runtime-api.ts` |
| `hermesExperts` | `src/preload/hermes-experts-api.ts` |
| `work` | `src/preload/work-api.ts` |
| `mcpSkillGatewayRuntime` | `src/preload/mcp-skill-gateway-runtime-api.ts` |

## 事件监听约定

```typescript
// Preload：必须返回 unsubscribe
onX: (cb) => {
  const listener = (_, payload) => cb(payload);
  ipcRenderer.on("channel", listener);
  return () => ipcRenderer.removeListener("channel", listener);
};

// Renderer：useEffect 清理
useEffect(() => {
  const off = window.hermesAPI.onChatChunk(handler);
  return off;
}, []);
```

## 权威文档

- `docs/API_CONTRACTS.md` — channel 全表
- `.cursor/rules/003-ipc-contract.mdc`

## 验证

```bash
npm run typecheck
npm test -- ipc-handlers preload-api-surface
```
