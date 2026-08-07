# Context Map — 路由索引

> 任务归属不明时读本文件，再打开对应域地图。

## 决策树

```text
任务涉及本地文件/进程/安装？
  ├─ 是 → main.md 或 install-enterprise.md
  └─ 否 → 继续

任务涉及 Renderer UI？
  ├─ Local Hermes / Experts / Work 专家台 → hermes-workbench.md
  ├─ Web Operator / 浏览器 → web-operator.md
  ├─ 顶栏 Tab / Workspace / Layout → renderer-layout.md
  └─ 其他 Screen → renderer-layout.md → docs/renderer/screens/

任务涉及跨进程通信？
  └─ preload-ipc.md + docs/API_CONTRACTS.md

任务涉及登录/启动？
  └─ auth-bootstrap.md

任务涉及多 Profile Gateway？
  └─ profile-runtime.md

任务涉及 MCP / GeneHub / Expert 远程目录？
  └─ mcp-genehub-experts.md

任务涉及 Work 任务窗口 SSE？
  └─ work-tasks.md

仍不确定？
  └─ architecture.md + AGENTS.md 目录地图
```

## 文件修改归属（速查）

| 改什么 | 主要目录 | Context Map |
|--------|----------|-------------|
| IPC handler | `src/main/` | main.md + preload-ipc.md |
| Preload API | `src/preload/` | preload-ipc.md |
| React 页面 | `src/renderer/src/screens/` | renderer-layout.md |
| Hermes 内页 | `src/renderer/src/screens/Hermes/` | hermes-workbench.md |
| 共享类型 | `src/shared/` | preload-ipc.md |
| i18n | `src/shared/i18n/locales/` | renderer-layout.md |
| 企业安装 | `src/main/enterprise/` | install-enterprise.md |
| 文档同步 | `docs/`、`AGENTS.md` | README.md § 007 rule |

## 不要读入上下文的内容

见根目录 `.cursorignore`：构建产物、`node_modules/`、`out/`、`**/*.db` 等。

## 相关 Rules

| Rule | 触发 |
|------|------|
| `000-ai-coding-entry.mdc` | 每次任务入口 |
| `001-electron-architecture.mdc` | main / preload |
| `003-ipc-contract.mdc` | IPC 变更 |
| `workbuddy-product-line.mdc` | `screens/Hermes/**` |
| `008-loudon-command-comments.mdc` | 任何含 loudon 标记的文件 |
