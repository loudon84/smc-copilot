# SettingsDrawer

## 1. 路径

```text
src/renderer/src/screens/SettingsDrawer/
```

## 2. 入口

由 `Layout.tsx` 在 drawer layer 中渲染，通过 `openSettingsDrawer(panel?)` 控制打开/关闭。

## 3. 职责

- V3.6.3 统一设置抽屉，替代分散的设置入口
- Server Panel：Hermes Agent 管理 + Copilot Serve + 全局 Profile
- General Panel：外观 / 语言 / 网络 / 备份
- Profiles Panel：多 Profile 管理
- Auth Panel：认证配置
- Runtime Panel：Gateway 运维
- User Config Sync：桌面配置同步

## 4. 关键文件

| 文件 | 作用 |
|---|---|
| `SettingsDrawer.tsx` | 抽屉主组件，Tab 切换各面板 |
| `settings-drawer-types.ts` | 类型定义 |
| `settings-shared.ts` | 共享逻辑 |
| `SettingsDrawer.css` | 样式 |
| `server/ServerPanel.tsx` | Server 面板（Agent + Copilot Serve + 全局 Profile） |
| `server/HermesAgentSection.tsx` | Hermes Agent 段 |
| `server/ConnectionSection.tsx` | 连接配置段 |
| `server/GlobalProfileSection.tsx` | 全局 Profile 段 |
| `server/PortalRuntimeSection.tsx` | Portal Runtime 段 |
| `general/GeneralPanel.tsx` | 通用设置面板（外观/网络/备份） |
| `general/LanguageSelect.tsx` | 语言选择 |
| `multi-profiles/MultiProfilesPanel.tsx` | 多 Profile 管理面板 |
| `multi-profiles/ProfileLogViewer.tsx` | Profile 日志查看器 |
| `multi-profiles/ProfilePresetInstallCard.tsx` | Profile 预设安装卡片 |
| `multi-profiles/ProfileRoleSourceView.tsx` | Profile 角色源视图 |
| `multi-profiles/ProfileRuntimeActions.tsx` | Profile 运行时操作 |
| `ProfilesPanel.tsx` | Profiles 面板 |
| `AuthPanel.tsx` | 认证配置面板 |
| `HermesRuntimePanel.tsx` | Hermes Runtime 运维面板 |
| `UserConfigSyncPanel.tsx` | 用户配置同步面板 |
| `ConfigDiffViewer.tsx` | 配置差异查看器 |

## 5. 数据来源

| 来源 | API |
|---|---|
| Preload | `window.hermesAPI.*`（配置/环境变量/安装） |
| Preload | `window.profileRuntime.*`（启停/状态/日志/端口） |
| Preload | `window.copilotServe.*`（Copilot Serve 生命周期） |
| Preload | `window.aiosRuntime.*`（Portal Runtime 启停/Doctor） |
| Preload | `window.desktopAuth.*`（认证配置） |
| Preload | `window.desktopUserConfig.*`（Bootstrap / Diff） |
| Preload | `window.profileRole.*`（角色预设） |

## 6. 状态流

```text
Layout.openSettingsDrawer(panel?)
  → SettingsDrawer 打开 → 默认选中 panel
  → Tab 切换 → 对应 Panel 渲染
  → Panel 内操作 → Preload API → Main Process
  → 状态更新 → Panel 重新渲染
```

## 7. 约束

- 不直接访问 Node.js
- 不新增未登记 IPC
- 不跨层 import main/preload
- RuntimeGuard 入口统一收敛到此处，禁止独立 Runtime 设置

## 8. 相关文档

- `docs/API_CONTRACTS.md` § Profile Runtime / Copilot Serve / Auth
- `docs/renderer/WORKSPACE_ROUTING.md`
