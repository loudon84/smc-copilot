# Install

## 1. 路径

```text
src/renderer/src/screens/Install/
```

## 2. 入口

由 `App.tsx` 在启动门控 `screen === "installing"` 时渲染。

## 3. 职责

- Hermes Agent 安装向导界面
- 支持企业 Bundle 一键安装与用户源安装（本地 zip / Git clone）
- PyPI 镜像配置（清华/阿里/腾讯/官方/自定义）
- 展示安装流水线进度（预检 → Bundle → Agent → Venv → Home → Profile Bootstrap → Marker）

## 4. 关键文件

| 文件 | 作用 |
|---|---|
| `Install.tsx` | 安装向导主组件 |
| `AgentSourceSelect.tsx` | Agent 源选择（Bundle / 本地 zip / Git clone）+ PyPI 镜像配置 |
| `install.css` | 安装页样式 |

## 5. 数据来源

| 来源 | API |
|---|---|
| Preload | `window.hermesAPI.startInstall()`、`window.hermesAPI.startInstallWithSource()` |
| Preload | `window.hermesAPI.onInstallProgress()`、`window.hermesAPI.getInstallerPrecheck()` |
| Preload | `window.profileRuntime.*`（Profile Bootstrap） |

## 6. 状态流

```text
用户选择安装源 + PyPI 镜像
  → hermesAPI.startInstallWithSource({ sourceType, localZipPath?, pipIndexUrl, ... })
  → Main enterprise-installer 20 步流水线
  → onInstallProgress 事件 → UI 更新进度
  → 安装完成 → recheck → 路由切换（setup / main）
```

## 7. 约束

- 不直接访问 Node.js
- 不新增未登记 IPC
- 不跨层 import main/preload
- 安装过程不可中断（仅展示进度）

## 8. 相关文档

- `docs/API_CONTRACTS.md` § Enterprise Install
- `docs/renderer/WORKSPACE_ROUTING.md`
