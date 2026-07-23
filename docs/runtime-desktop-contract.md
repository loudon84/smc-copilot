# Desktop 与 Runtime 契约

## 发现服务

Desktop 连接到 `http://127.0.0.1:8765`（可配置）。生产环境 Desktop **默认不得** spawn Runtime。

## 握手流程

1. `GET /api/v1/health`
2. `GET /api/v1/runtime/status` 与 `/runtime/capabilities`
3. 若未配对：`POST /api/v1/pairings/start` → 用户确认 → `POST /api/v1/pairings/{id}/confirm`
4. 将 `deviceToken` 仅保存在 Desktop Main（不得进入 Renderer）

## Runtime Job

安装 / 更新 / 回滚 / Doctor 均为异步 Job。轮询 `GET /runtime/jobs/{id}` 或订阅 SSE `/events`。

## Instance

Gateway 生命周期使用 `/api/v1/instances`。过渡期仍保留遗留接口 `/api/v1/profiles`。
