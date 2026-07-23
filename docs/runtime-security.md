# Hermes Runtime 安全

1. 默认仅绑定 `127.0.0.1`。
2. 配对后使用 `Authorization: Bearer <device-token>` 鉴权；当 `RUNTIME_ALLOW_LEGACY_TOKEN=true` 时兼容遗留头 `X-Copilot-Desktop-Token`。
3. 配对的 start / confirm 仅允许 loopback。
4. 数据库只存 Token Hash，不存明文。
5. Secret：`GET` 仅返回 `{name, configured}`；存储使用 DPAPI（Windows）或加密文件（开发环境）。
6. 禁止 `shell=True`；MCP 命令须经 `ExecutablePolicy` 校验。
7. 下载 Artifact 必须校验 SHA-256。
8. 统一错误信封：`{ error: { code, message, details, requestId } }`。
9. 日志不得包含 API Key、Token、`.env` 取值。
