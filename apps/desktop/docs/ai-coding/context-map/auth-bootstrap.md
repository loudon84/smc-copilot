# Context Map — Auth 与启动门控

## 生命周期路由

```text
splash → login → welcome → installing → setup → main (Layout)
```

实现：`src/renderer/src/hooks/useStartupGate.ts` → `window.smcShell.resolveStartupDecision()`

## Main 模块

| 模块 | 路径 |
|------|------|
| 启动决策 | `src/main/startup/startup-decision.ts` |
| 启动 IPC | `src/main/startup/startup-ipc.ts` |
| Auth 客户端 | `src/main/auth/auth-client.ts` |
| Token 存储 | `src/main/auth/token-store.ts`（keytar → safeStorage） |
| Endpoint 配置 | `src/main/auth/auth-endpoint-config-store.ts` |
| Token 注入 | `src/main/auth/token-header-injector.ts` |
| Bootstrap | `src/main/user-config/user-config-client.ts` |

## Preload

- `window.desktopAuth` — **不向 Renderer 暴露 token**
- `window.desktopUserConfig` — bootstrap apply / diff
- `window.smcShell` — `resolveStartupDecision`

## 默认 Endpoint（V3.3.1）

- Backend：`http://127.0.0.1:8000`
- Auth：`/api/v1/auth`
- Portal Home：`http://127.0.0.1:3000`
- 登录字段：`email` + `password`（非 username）

## Bootstrap

默认本地合成 `local-v1`（`HERMES_USE_REMOTE_USER_CONFIG=true` 才 HTTP 拉远程）。

## Portal 嵌入

- partition：`persist:aios-home`
- `portal-view-coordinator`：bootstrap 后 deactivate，切 portal tab 才显示

## 文档

- `docs/renderer/APP_STARTUP.md`
- `docs/API_CONTRACTS.md` § Auth / Startup
- `AGENTS.md` § Auth + Bootstrap
