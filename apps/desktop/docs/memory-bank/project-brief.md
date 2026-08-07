# Project Brief

## 项目名称

hermes-desktop

## 定位

Hermes Agent 的原生桌面应用，用于安装、配置和与 Hermes Agent 聊天交互。

## 核心价值

- **一键安装**: 自动检测和安装 Hermes Agent Python 环境
- **可视配置**: API Key、模型、工具集、技能等全部 GUI 化配置
- **流式聊天**: SSE 实时流式输出，工具调用进度，Usage 统计
- **多平台消息**: 16 个消息平台（Telegram/Discord/Slack/WhatsApp 等）配置
- **配置档案**: 多 Profile 隔离，独立目录和 API Key
- **国际化**: 4 语言支持（en/es/pt-BR/zh-CN）

## 技术决策

| 决策 | 选择 | 原因 |
|---|---|---|
| 框架 | Electron + React | 跨平台桌面 + 丰富 UI 生态 |
| 构建工具 | electron-vite | Electron 官方推荐，HMR 快 |
| 数据库 | better-sqlite3 | 同步 API，无需连接池，读取 Hermes 会话 |
| 样式 | TailwindCSS 4 | 原子化 CSS，快速开发 |
| 国际化 | i18next | React 生态标准，命名空间支持 |
| Markdown | react-markdown + remark-gfm | GFM 支持，代码高亮 |

## 目标用户

- 需要本地运行 AI Agent 的开发者和技术用户
- 需要多平台消息网关的运营者
- 需要可视化配置 Hermes Agent 的用户
