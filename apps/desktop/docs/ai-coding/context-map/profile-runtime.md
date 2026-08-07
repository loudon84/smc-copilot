# Context Map — 多 Profile Runtime

## 模型

7 个 Profile，端口 8642–8648（default + 6 specialist）。

| Profile | 端口 |
|---------|------|
| default | 8642 |
| writer … agenter | 8643–8648 |

## Main 链

```text
profile-runtime-ipc.ts
  → profile-runtime-manager.ts
  → hermes-local-adapter.ts
  → gateway-supervisor.ts
  → gateway-log-collector.ts
  → runtime-reconciler.ts
  → profile-runtime-db.ts
```

## 控制面存储

- DB：`~/.hermes/desktop/profile-runtime.db`
- 配置：`~/.hermes/desktop/profile-runtime.yaml`
- 状态机：`not_deployed → starting → running → stopping → stopped | failed`

## Preload

`window.profileRuntime` — 20 方法（启停、健康、日志、自动重启）

## V4.0 专家角色

- `src/main/profile-roles/`
- `window.profileRole`
- Settings → multi-profiles UI

## UI

- SettingsDrawer → server / HermesRuntimePanel
- `modules/hermes-runtime/`

## 类型

`src/shared/profile-runtime/profile-runtime-contract.ts`

## 规则

- 所有 profile 路径经 `profileHome(profile?)`
- 禁止跨 profile 混用 state.db / memory

## 文档

- `AGENTS.md` § Multi Profile Runtime
- `docs/API_CONTRACTS.md` § Profile Runtime
