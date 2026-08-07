# Setup

## 1. 路径

```text
src/renderer/src/screens/Setup/
```

## 2. 入口

由 `App.tsx` 在启动门控 `screen === "setup"` 时渲染。

## 3. 职责

- 初始配置页面（Hermes 已安装但未配置模型/API Key）
- 配置 API Key、默认模型、平台选择
- 配置完成后可启动 Gateway 并进入主界面

## 4. 关键文件

| 文件 | 作用 |
|---|---|
| `Setup.tsx` | 配置向导主组件 |

## 5. 数据来源

| 来源 | API |
|---|---|
| Preload | `window.hermesAPI.getModels()`、`window.hermesAPI.setEnv()` |
| Preload | `window.hermesAPI.getConfig()`、`window.hermesAPI.saveConfig()` |
| Preload | `window.profileRuntime.start()` |

## 6. 状态流

```text
用户输入 API Key / 选择模型
  → hermesAPI.setEnv() / saveConfig()
  → profileRuntime.start()
  → recheck → 路由切换（main）
```

## 7. 约束

- 不直接访问 Node.js
- 不新增未登记 IPC
- 不跨层 import main/preload

## 8. 相关文档

- `docs/API_CONTRACTS.md` § Hermes / Profile Runtime
- `docs/renderer/WORKSPACE_ROUTING.md`
