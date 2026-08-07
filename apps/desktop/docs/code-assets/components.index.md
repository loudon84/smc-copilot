# Components Index

## 渲染进程组件

| 组件 | 路径 | 用途 | 复用建议 |
|---|---|---|---|
| App | src/renderer/src/App.tsx | 根组件，屏幕路由 | 不应复用，仅作入口 |
| AgentMarkdown | src/renderer/src/components/AgentMarkdown.tsx | Markdown 渲染(代码高亮+GFM) | 聊天消息/技能内容等场景复用 |
| ErrorBoundary | src/renderer/src/components/ErrorBoundary.tsx | React 错误边界 | 包裹风险组件时使用 |
| I18nProvider | src/renderer/src/components/I18nProvider.tsx | i18n Provider | 仅在 main.tsx 使用 |
| ThemeProvider | src/renderer/src/components/ThemeProvider.tsx | 主题 Provider(系统/亮/暗) | 仅在 App.tsx 使用 |
| RemoteNotice | src/renderer/src/components/RemoteNotice.tsx | 远程模式提示横幅 | Layout 中条件展示 |
| Versions | src/renderer/src/components/Versions.tsx | 版本信息展示 | 设置页/关于页使用 |
| HermesLogo | src/renderer/src/components/common/HermesLogo.tsx | Logo 组件 | 启动页/导航栏使用 |

## 页面组件

| 页面 | 路径 | 用途 | 关键 hermesAPI 调用 |
|---|---|---|---|
| SplashScreen | src/renderer/src/screens/SplashScreen/SplashScreen.tsx | 启动动画 | 无 |
| Welcome | src/renderer/src/screens/Welcome/Welcome.tsx | 首次引导 | checkInstall, isRemoteMode |
| Install | src/renderer/src/screens/Install/Install.tsx | 安装流程 | startInstall, onInstallProgress |
| Setup | src/renderer/src/screens/Setup/Setup.tsx | API Key 配置 | setEnv, getModelConfig |
| Layout | src/renderer/src/screens/Layout/Layout.tsx | 主布局+导航 | getLocale, setLocale |
| Chat | src/renderer/src/screens/Chat/Chat.tsx | 聊天主界面 | sendMessage, onChatChunk/Done/Error/Usage |
| Sessions | src/renderer/src/screens/Sessions/Sessions.tsx | 会话列表 | listCachedSessions, searchSessions |
| Agents | src/renderer/src/screens/Agents/Agents.tsx | 配置档案 | listProfiles, createProfile, deleteProfile |
| Office | src/renderer/src/screens/Office/Office.tsx | Claw3D WebView | claw3dStatus, claw3dStartAll |
| Models | src/renderer/src/screens/Models/Models.tsx | 模型管理 | listModels, addModel, removeModel, updateModel |
| Providers | src/renderer/src/screens/Providers/Providers.tsx | API 密钥 | getEnv, setEnv, getCredentialPool |
| Skills | src/renderer/src/screens/Skills/Skills.tsx | 技能管理 | listInstalledSkills, installSkill |
| Soul | src/renderer/src/screens/Soul/Soul.tsx | 人格编辑 | readSoul, writeSoul, resetSoul |
| Memory | src/renderer/src/screens/Memory/Memory.tsx | 记忆管理 | readMemory, addMemoryEntry |
| Tools | src/renderer/src/screens/Tools/Tools.tsx | 工具集开关 | getToolsets, setToolsetEnabled |
| Schedules | src/renderer/src/screens/Schedules/Schedules.tsx | 定时任务 | listCronJobs, createCronJob, triggerCronJob |
| Gateway | src/renderer/src/screens/Gateway/Gateway.tsx | 平台配置 | getPlatformEnabled, setPlatformEnabled |
| Settings | src/renderer/src/screens/Settings/Settings.tsx | 通用设置 | getLocale, setLocale, checkForUpdates |
