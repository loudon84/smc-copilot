---
name: PRD v1.5.1 Gateway Ownership Hotfix
overview: 实现 PRD v1.5.1 Hotfix：Gateway Ownership Recovery & Dev Reload Stability，解决 Runtime reload 后 ownership 丢失导致的 GATEWAY_PORT_OWNERSHIP_CONFLICT，同时保持 Health ≠ Ownership 安全边界。
todos:
  - id: p1
    content: "Phase 1: Fingerprint Persistence — migration 020 + start 时完整落库 + runtime_instance_id"
    status: completed
  - id: p2
    content: "Phase 2: Ownership Inspector — GatewayOwnershipService + OwnershipState(adopted/conflict)"
    status: completed
  - id: p3
    content: "Phase 3: Restart Reconcile — 决策矩阵 + adopted 恢复"
    status: completed
  - id: p4
    content: "Phase 4: Dev Safe Adoption — 配置 + 全证据校验 + safe_adopted/conflict"
    status: completed
  - id: p5
    content: "Phase 5: Orphan Prevention — process watcher + reload 保活 shutdown + fingerprint 清理规则"
    status: completed
  - id: p6
    content: "Phase 6: State Projection + reconcile API + 409 + contracts + Desktop UI"
    status: completed
  - id: p7
    content: "Phase 7: 单测/E2E + adoption-safety guard + lat/ADR"
    status: completed
isProject: false
---

## PRD v1.5.1 实施计划（Gateway Ownership Recovery & Dev Reload Stability）

**范围**：`services/runtime`（主）+ `contracts`/`runtime-client-ts` + `apps/desktop`（仅状态展示）。
**关键安全原则**：`/health = 200` 不得直接推导出 `ownership = owned`。

### 1. 现状（v1.5 已实现）
- `OwnershipState`: owned / stale / foreign / unknown（缺 **adopted / conflict**）
- `verify_ownership` + boot reconcile（恢复后仍标 owned，非 adopted）
- `shutdown_all_instances` 在每次 shutdown 无条件停止 Gateway（**reload 根因**）
- 无 `runtime_instance_id`、无完整 fingerprint 持久化（无 exe/hash/started_at/owner/version）、无 process watcher、无 Safe Adoption、无 reconcile API、无 GATEWAY_NOT_OWNED

### 2. Phase 划分（按 PRD §74）

**Phase 1 — Fingerprint Persistence**
- Alembic `020_v1_5_1_gateway_fingerprint`：HermesInstance 新增 `gateway_executable_path`、`gateway_command_hash`、`gateway_started_at`、`gateway_started_by_runtime`、`gateway_owner_runtime_id`、`gateway_fingerprint_version`（复用现有 `process_create_time`；不另建 `gateway_pid`）
- `_start_instance_unlocked`：启动成功后落库完整 fingerprint（含 `command_hash`，输入 exe/profile/`gateway run`/`--external-supervisor`/port，**不含 API_SERVER_KEY**）
- `core/lifecycle.py`：生成 `runtime_instance_id`（启动 UUID），注入 Supervisor/ownership 路径

**Phase 2 — Ownership Inspector**
- 新增 `services/gateway_ownership_service.py` `inspect(instance) -> GatewayOwnershipResult`（state, pid, alive, create_time/exe/port/command/profile/health_authenticated, safe_to_adopt, reason）
- 扩展 `OwnershipState`：`ADOPTED`、`CONFLICT`
- `GatewayOwnershipService` 统一 PID/createTime/exe/cmd/port/health 判断；Windows AccessDenied → unknown，不直接判 foreign

**Phase 3 — Restart Reconcile**
- 升级 `reconcile_instances_on_boot` 按决策矩阵：valid fingerprint + owned port + healthy → `adopted`；stale + free → start；foreign/invalid → conflict；desired=stopped + valid owned → stop
- **不重建** asyncio handle；adopted 后通过 fingerprint + 周期 ownership 验证管理
- Startup 顺序保持：reconcile → autostart → health worker（reconcile 必须先于 start missing）

**Phase 4 — Dev Safe Adoption**
- 配置：`gateway_safe_adoption_enabled`（默认 false）+ `gateway_dev_allow_safe_adoption`（默认 true，仅 development）
- `deployment_mode == "development_stub"` 视为 development
- 仅当 exe/command/profile/port/health/RuntimeVersion 全匹配且无 conflicting owner 才 `safe_adopted`；否则 `conflict`（不 kill/takeover）
- 新增 `SafeAdoptionEvidence` dataclass

**Phase 5 — Orphan Prevention**
- `GatewayProcessManager`：启动 `_watch_process` 子进程 watcher，退出立即置 `process_state=exited` + 事件 `gateway.process.exited`（不等 5s worker）
- 记录 `parent_runtime_pid`（内存）
- `core/lifecycle.py` shutdown：区分 `reload` vs normal；reload/development 下**不停止** owned Gateway（新 worker adopt），formal shutdown 才停止
- fingerprint 清理规则：owned stop/exit/stale/Version 删除/Instance 删除才清；reload/健康失败/鉴权失败/端口查询失败**不清**

**Phase 6 — State Projection + API + Desktop**
- `executionEligible = gateway.healthy AND ownership in (owned, adopted)`；Health 与 Ownership 独立展示（conflict 时 Gateway 可 healthy 但 execution blocked）
- API：新增 `POST /api/v1/instances/{id}/reconcile`（重查 ownership，非 restart/force adopt）；stop/restart 在非 owned/adopted 时返回 409 `GATEWAY_NOT_OWNED`
- `state`/`diagnostics` 增加 fingerprint/ownership source/eligibility 字段（不泄露 secret）
- Capabilities：`hermes.gateway.ownership-recovery`、`hermes.gateway.safe-adoption.dev`、`instances.reconcile`
- Contracts：regenerate `contracts/runtime-api/openapi.yaml` + `packages/runtime-client-ts`（`instances.reconcile/getState/getDiagnostics` 已存在则补 reconcile）
- Desktop：`HermesInstancesSection.tsx` 展示 Desired/Process/Ownership(adopted|conflict)/Gateway/Auth/Port；conflict 显示文案 + Diagnostics/Retry Ownership 按钮；**不**加 Force Kill/Takeover

**Phase 7 — Tests + CI + Docs**
- 单测：runtime reload ownership recovery、verified orphan adoption、reject healthy foreign gateway、stale pid reuse、health≠ownership 回归
- E2E：reload（§61）、full restart（§62）、clean shutdown（§63）、orphan adoption（§64）、foreign healthy（§65）
- CI guard：`check:gateway-adoption-safety`（禁止 `if health_ok: ownership=owned`）
- 更新 `AGENTS.md`、`lat.md`（gateway-supervisor/ownership）、ADR（若新增决策）；`lat check`

### 3. 关键实现落点
- [services/runtime/src/services/instance_gateway_service.py](services/runtime/src/services/instance_gateway_service.py) — fingerprint 落库 + reconcile v2 + shutdown policy
- [services/runtime/src/runtime/gateway_process.py](services/runtime/src/runtime/gateway_process.py) — fingerprint 扩展 + command_hash + watcher
- 新增 [services/runtime/src/services/gateway_ownership_service.py](services/runtime/src/services/gateway_ownership_service.py)
- [services/runtime/src/core/lifecycle.py](services/runtime/src/core/lifecycle.py) — runtime_instance_id + shutdown context + 启动顺序
- [services/runtime/src/api/v1/instances.py](services/runtime/src/api/v1/instances.py) — reconcile + 409 GATEWAY_NOT_OWNED
- [services/runtime/migrations/versions/020_*.py](services/runtime/migrations/versions/) — 新迁移
- [apps/desktop/.../HermesInstancesSection.tsx](apps/desktop/src/renderer/src/screens/SettingsDrawer/server/HermesInstancesSection.tsx) — 状态展示

### 4. 验收（§80 五项）
1. uvicorn --reload 后新 worker 自动认领，不再误报 conflict
2. Runtime restart 后 fingerprint 全匹配恢复 ownership，不重复启动
3. orphan 仅在 exe+command+profile+port+auth health 全满足才 Safe Adoption
4. 健康但无法证明归属的外部 Gateway 不接管不终止
5. 不修改 Chat/Task 逻辑

### 5. 提交策略
按 PRD §75 建议 commit 分阶段提交；不修改 §77 禁止模块。