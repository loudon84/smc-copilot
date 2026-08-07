# Lessons Learned

## 2026-05-07 项目地图创建

- hermes-desktop 严格遵循 Electron 三层隔离，所有渲染进程通信必须经过 preload
- Gateway 默认端口 8642，健康检测 1500ms 超时
- sendMessage() 有三条路径：远程API → 本地API → CLI Fallback
- SSE 自定义事件 `hermes.tool.progress` 用于工具进度推送
- 会话 ID 通过响应头 `X-Hermes-Session-Id` 获取
- better-sqlite3 对 state.db 只读，不写入
- MEMORY.md 限制 2200 字符，USER.md 限制 1375 字符
- i18n 4 语言 x 20 模块 = 80 个翻译文件
- 修改 API Key / Token 时自动触发 Gateway 重启
- config.yaml 首次启动自动注入 api_server 配置
