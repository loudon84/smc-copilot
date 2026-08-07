# Login

## 1. 路径

```text
src/renderer/src/modules/auth/LoginScreen.tsx
```

## 2. 入口

由 `App.tsx` 在启动门控 `screen === "login"` 时渲染。

## 3. 职责

- 用户登录界面（email + password）
- Endpoint 配置（backend URL / auth prefix / aiosHomeUrl）
- 登录成功后触发 `desktopUserConfig.bootstrap()` → 本地配置落盘
- 登录成功后 `recheck()` 重新解析路由

## 4. 关键文件

| 文件 | 作用 |
|---|---|
| `LoginScreen.tsx` | 登录表单 + Endpoint 配置 |
| `AuthProvider.tsx` | Auth 状态 Provider |
| `LoginGate.tsx` | 登录门控组件 |
| `BootstrapScreen.tsx` | Bootstrap 执行过渡屏 |
| `last-login-email.ts` | 记忆上次登录邮箱 |
| `ConfigDiffConfirmDrawer.tsx` | 配置差异确认抽屉 |
| `UserMenuDrawer.tsx` | 用户菜单抽屉 |

## 5. 数据来源

| 来源 | API |
|---|---|
| Preload | `window.desktopAuth.login()`、`window.desktopAuth.saveEndpointConfig()` |
| Preload | `window.desktopUserConfig.bootstrap()`、`window.desktopUserConfig.getBootstrapState()` |
| Preload | `window.smcShell.resolveStartupDecision()` |

## 6. 状态流

```text
用户输入 email/password + endpoint config
  → desktopAuth.saveEndpointConfig()
  → desktopAuth.login({ email, password })
  → Auth Client POST {backendUrl}{authPrefix}/login
  → token-store（Main only）
  → desktopUserConfig.bootstrap()
  → user-config-applier apply + refreshPortalView
  → recheck → 路由切换
```

## 7. 约束

- 不直接访问 Node.js
- 不新增未登记 IPC
- 不跨层 import main/preload
- Token 不暴露到渲染进程
- 登录请求体使用 `email`（非 `username`）

## 8. 相关文档

- `docs/API_CONTRACTS.md` § Auth / Bootstrap
- `docs/renderer/WORKSPACE_ROUTING.md`
