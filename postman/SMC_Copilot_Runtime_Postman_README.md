# SMC Copilot Runtime Postman Debug Pack

## 目标
先完全绕开 Desktop，单独确认 `127.0.0.1:8765` Runtime 与 Hermes Gateway / Chat Runtime 正常。

## 导入
导入 Collection 和 Environment，选择 `SMC Copilot Runtime - Local`。

## 执行顺序
1. `00 - Public Health & Pairing`
2. `01 - Runtime Control Plane`
3. `02 - Default Hermes Instance & Gateway`
4. `03 - Hermes Gateway Functional Probe`
5. `04 - Chat Runtime v2 Minimal E2E`
6. `05 - Direct Instance Chat SSE`（可选）

### 关键判定
`01.2 Runtime Readiness - STRICT`
- `service.ready = true`
- `execution.ready = true`
- `execution.chatReady = true`
- `maintenance.ready = false` 可以接受，Manifest 缺失不应阻止 Chat。

`02` 正常目标：
- `desired.state = running`
- `processState = alive`
- `ownershipState = owned | adopted`
- `gateway.reachable = true`
- `gateway.authenticated = true`
- `gateway.healthy = true`
- `executionEligible = true`

### 当前问题专用操作
执行 `02.6 Reconcile Ownership` 后，**等待 10 秒**，再执行：
- `02.7 State After Reconcile - STRICT`
- `02.8 Health After Reconcile - STRICT`

如果先变成 `adopted/eligible`，10 秒后又回到 `conflict/exited`：
问题仍在 Runtime 周期 Health Worker / State Projection，不要启动 Desktop。

### Chat 前置条件
`03.1 List Chat Models - STRICT` 必须：
- `status = ok`
- `models.length > 0`

然后才执行 `04`。

## 安全说明
Collection 故意没有自动包含 Stop/Restart，避免 Runner 中断当前 Gateway。
如需生命周期调试，再手工创建：
- `POST /api/v1/instances/{{instanceId}}/start`
- `POST /api/v1/instances/{{instanceId}}/stop`
- `POST /api/v1/instances/{{instanceId}}/restart`
