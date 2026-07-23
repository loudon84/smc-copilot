# Runtime Service v1.3 验收记录

日期：2026-07-23

## 已实现

- [x] 横切基础（`RuntimeSettings`、`ToolchainSettings`、平台路径、错误信封、capabilities）
- [x] 阶段 1 Runtime Core（模型、Job、status、capabilities API、迁移 `003_runtime_core`）
- [x] 阶段 2 Hermes 安装（`EnvironmentProbe`、`ArtifactDownloader`、`ChecksumVerifier`、`InstallationService`、CLI 适配器、toolchain 覆盖）
- [x] 阶段 3 Instance 重构（`instances` 表 + profiles 数据迁移，Instance API，`GatewaySupervisor` 绑定 `RuntimeVersion.executable_path`）
- [x] 阶段 4 更新 / 回滚 / 版本清理
- [x] 阶段 5 配置 / Secret / MCP + `ExecutablePolicy`
- [x] 阶段 6 设备配对 + Bearer 鉴权 + 遗留 Token 桥接
- [x] 阶段 7 Windows 用户级 daemon + 安装脚本；macOS/Linux daemon 占位
- [x] 文档 `docs/runtime-*.md`；已更新 `.env.example`

## 已执行测试

```text
uv run pytest tests/test_runtime_core.py tests/test_checksum.py tests/api/test_desktop_token.py tests/test_v12_integration.py tests/test_port_allocator.py tests/test_gateway_supervisor_boot.py -q
# 30 passed
```

## 说明

- macOS：本轮仅保证跨平台运行时（不做 LaunchAgent 正式打包）。
- Hermes 安装需要 `HERMES_MANIFEST_URL`（测试支持 `file://`）。
- 卸载脚本默认保留 `~/.hermes`。
