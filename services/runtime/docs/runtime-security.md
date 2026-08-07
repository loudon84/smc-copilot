# Hermes Runtime 安全

1. 默认仅绑定 `127.0.0.1`（`RUNTIME_HOST`/`RUNTIME_PORT` 优先于 `COPILOT_*`）。
2. 配对后使用 `Authorization: Bearer <device-token>` 鉴权；当 `RUNTIME_ALLOW_LEGACY_TOKEN=true` 时兼容遗留头 `X-Copilot-Desktop-Token`。
3. 配对的 start / confirm 仅允许 loopback。
4. 数据库只存 Token Hash，不存明文。
5. Secret：`GET` 仅返回 `{name, configured}`；Windows 使用 DPAPI，失败默认拒绝（`secret_store_unavailable`）。仅当 `RUNTIME_ALLOW_INSECURE_SECRET_STORE=true` 才允许 XOR 文件回退。Gateway 启动时经 `gateway_environment` 注入 scoped 密钥（日志脱敏）。
6. 禁止 `shell=True`；Gateway CLI 禁止 `--profile`/`--port`；MCP 命令须经 `ExecutablePolicy` 校验。
7. 下载 Artifact 必须校验 SHA-256；禁止 Stub Hermes 激活。
8. 统一错误信封：`{ error: { code, message, details, requestId } }`。
9. 日志与 Instance health 响应不得包含 API Key、Token、完整子进程环境。
