# 本地鉴权与设备配对

服务默认仅监听 `127.0.0.1`，生产用 `RUNTIME_REQUIRE_AUTH=true` 时所有非白名单请求需 `Authorization: Bearer <device-token>`。配对在 loopback 内完成，device token 仅存 Main 进程，不进 Renderer。相关：[[architecture#应用装配]]、[[tests#鉴权与配对]]。

## 鉴权依赖

[[src/api/deps.py#verify_desktop_token]] 是 `/api/v1` 全局依赖。白名单 `AUTH_WHITELIST` 含 `/api/v1/health`、`/api/v1/pairings/start`、`/docs`、`/openapi.json`、`/redoc`，且所有 `/api/v1/pairings/*` 放行。`require_auth()` 综合 `RUNTIME_REQUIRE_AUTH` 与 `COPILOT_REQUIRE_TOKEN`。

Bearer token 经 [[src/services/pairing_service.py#PairingService]] `authenticate_token` 校验（SHA256 比对 active Device），成功则置 `request.state.device_id`。无 Bearer 时回退遗留 header（见下）。[[src/api/deps.py#require_loopback]] 限制配对仅来自 loopback。

## 设备配对

[[src/services/pairing_service.py#PairingService]] `start` 生成 challenge（`secrets.token_urlsafe`），存其 SHA256 与过期时间（默认 300s）。`confirm` 校验 challenge 哈希与未过期后签发 `device_token`（48 字节 urlsafe），创建 `Device`（token 仅哈希入库），置 pairing `confirmed` 并审计 `device.paired`。

`revoke` 置 Device `revoked`。模型见 [[src/db/models/runtime.py#Device]] / [[src/db/models/runtime.py#DevicePairing]]，状态见 [[src/core/runtime_enums.py#DeviceStatus]]。token 明文不落库、不进 Renderer。

## 遗留 Token 兼容

`RUNTIME_ALLOW_LEGACY_TOKEN=true`（默认）时，若 Bearer 缺失则接受 `X-Copilot-Desktop-Token` 与 `effective_legacy_token()`（`RUNTIME_LEGACY_TOKEN` 或 `COPILOT_DESKTOP_TOKEN`）比对，置 `device_id="legacy"`。这是从静态共享 Token 向设备配对迁移的兼容期桥接，生产建议关闭并启用 `RUNTIME_REQUIRE_AUTH`。
