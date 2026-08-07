# SplashScreen

## 1. 路径

```text
src/renderer/src/screens/SplashScreen/
```

## 2. 入口

由 `App.tsx` 在启动门控 `useStartupGate` 解析前渲染，作为应用启动过渡屏。

## 3. 职责

- 应用启动时的过渡画面
- 展示品牌 Logo / 加载指示器
- 等待 `resolveStartupDecision()` 完成后自动切换到下一路由（login / welcome / main）

## 4. 关键文件

| 文件 | 作用 |
|---|---|
| `SplashScreen.tsx` | 唯一组件：品牌画面 + 加载动画 |

## 5. 数据来源

| 来源 | API |
|---|---|
| Props | 无（纯展示） |

## 6. 状态流

```text
App.tsx mount
  → SplashScreen 渲染
  → useStartupGate → smcShell.resolveStartupDecision()
  → 决策完成 → 路由切换（login / welcome / install / setup / main）
```

## 7. 约束

- 不直接访问 Node.js
- 不新增未登记 IPC
- 不跨层 import main/preload
- 不执行任何业务逻辑，仅展示

## 8. 相关文档

- `docs/API_CONTRACTS.md` § Startup
- `docs/renderer/WORKSPACE_ROUTING.md`
