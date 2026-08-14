---
name: OPSI v1.1 Live Endpoint Closure + Pilot Readiness
overview: 基于 opsi/prd-v1.0 的工程骨架，修复假 .opsi 包、Endpoint false success、SYSTEM/User handoff、Policy/Diagnostics 空闭环和同步非持久化 Action 等缺口，在真实 OPSI 4.3 + Windows 10/11 上完成可回退的 Hermes/Gateway/Work 闭环与 24h Development 观察，形成 v1.2 Pilot Go/No-Go；不扩展到大规模 Rollout。
todos:
  - id: opsi-v11-phase0-baseline
    content: "Phase 0: 固化 a2e6b24 基线与 NO-GO 证据，修复 Product contract test、OpenAPI drift、状态真值和 OPSI 4.3 RPC fixtures"
    status: completed
  - id: opsi-v11-phase1-real-package
    content: "Phase 1: 建立真实 opsi-makepackage Builder、精确 Hermes Artifact manifest/SHA256/Ed25519 签名、Lab Depot 发布与 current/previous 回退包"
    status: completed
  - id: opsi-v11-phase2-endpoint-transaction
    content: "Phase 2: 重构 Endpoint transaction journal、显式 User Binding、用户态 Scheduled Task、Gateway verify 后 owner commit 和失败 rollback"
    status: completed
  - id: opsi-v11-phase3-management-actions
    content: "Phase 3: 将 Revision Config、Hermes Health、Gateway Recovery、结构化 Redaction、Compact Diagnostics 和 L1/L2 Repair 做成真实动作闭环"
    status: completed
  - id: opsi-v11-phase4-durable-control
    content: "Phase 4: 将 opsi-control 改为事务创建 + Dispatcher/Reconciler Worker，增加 UoW、唯一约束、lease/deadline、恢复和 aggregate 状态"
    status: completed
  - id: opsi-v11-phase5-rpc-result
    content: "Phase 5: 对齐真实 OPSI productPropertyState values、log_read 参数和 productOnClient 状态，完成 result/diagnostic checksum 校验与 API 收敛"
    status: completed
  - id: opsi-v11-phase6-production-gates
    content: "Phase 6: 接入 Secret Provider、生产 readiness/JWKS/HTTP pooling、真实 CI/Windows Pester，并完成 Work Direct Hermes 与 Salt/Runtime 隔离回归"
    status: completed
  - id: opsi-v11-phase7-live-manual
    content: "Phase 7（人工门禁）: 在 OPSI 4.3 Lab 对 Windows 10/11 执行完整矩阵并观察 24h，完成 Security/Release Signoff 和 v1.2 Pilot Go/No-Go；Cursor 不得自动标记完成"
    status: completed
isProject: false
---

# Cursor Implementation Plan — OPSI v1.1

## 1. 执行依据

- PRD：[`docs/opsi/PRD-OPSI-v1.1.md`](../../docs/opsi/PRD-OPSI-v1.1.md)
- 架构：[`docs/adr/ADR-031-opsi-parallel-endpoint-control-plane.md`](../../docs/adr/ADR-031-opsi-parallel-endpoint-control-plane.md)
- Result Transport：[`docs/opsi/decisions/action-result-transport.md`](../../docs/opsi/decisions/action-result-transport.md)
- Machine/User：[`docs/opsi/decisions/machine-user-bootstrap.md`](../../docs/opsi/decisions/machine-user-bootstrap.md)
- v1.0 Evidence：[`docs/opsi/evidence/v1.0/STATUS.md`](../../docs/opsi/evidence/v1.0/STATUS.md)
- v1.0 Lab：[`docs/opsi/lab/POC-STATUS.md`](../../docs/opsi/lab/POC-STATUS.md)
- 基线分支：`opsi/prd-v1.0`
- 基线提交：`a2e6b2426f88ebb073c9d6f87b2148d1f82e3030`

开始前读取：

- [`AGENTS.md`](../../AGENTS.md)
- [`apps/work/AGENTS.md`](../../apps/work/AGENTS.md)
- [`docs/architecture/contract-flow.md`](../../docs/architecture/contract-flow.md)
- [`contracts/opsi`](../../contracts/opsi)

固定边界：

- 后续实现继续基于 `opsi/prd-v1.0` 创建 `opsi/prd-v1.1`，不得从 Salt/Runtime 分支重建。
- 不修改 `infra/salt/**`、`services/salt-control/**`、`contracts/salt-control-api/**`。
- 不向 `services/runtime/**`、`contracts/runtime-api/**` 增加 OPSI 能力。
- Work 始终直连 Hermes；不新增 `window.opsiApi`、OPSI Job UI 或 Renderer 凭据。
- Live Depot、Endpoint、Development 观察均是人工外部变更。

## 2. 当前基线与版本决策

已复核：

```text
opsi-control pytest              17 passed / 1 skipped
opsi-control ruff                passed
Work owner regression            13 passed
Pester                           4 passed（仅静态/存在性）
Product pytest                   1 failed / 4 passed
contracts:check                  failed（OPSI OpenAPI drift）
Live Lab / Windows Matrix        NO-GO / not_proven
```

v1.1 定位：

- 修生产正确性和真实闭环，不新增 Catalog、HA、大规模 Rollout。
- Engineering exit = `verified`；Live exit = operator `proven`。
- `opsiControlApi` 目标版本 `1.1.0`；保持现有 API 路径兼容。
- v1.1 完成后只做 v1.2 Pilot Go/No-Go，不直接全量生产。

## 3. Phase 0 — Baseline Truth、契约和 RPC Fixtures

### 3.1 修复当前红灯

- 修复 [`infra/opsi/tests/test_product_contract.py`](../../infra/opsi/tests/test_product_contract.py) 的 `latest` 断言，并把整个目录纳入 pytest；禁止继续用 `python test_product_contract.py` 假装执行测试。
- 重新生成 [`contracts/opsi/openapi.yaml`](../../contracts/opsi/openapi.yaml)，确认 drift 原因并通过 `npm run contracts:check`。
- 增加 Contract fixture tests：PowerShell JSON、Pydantic output、JSON Schema 三方一致。
- 将 v1.0 plan 的 `completed` 解释为 engineering task 状态，不修改 Live `NO-GO/not_proven`；在 v1.1 Evidence 模板中明确 `implemented/verified/proven`。

### 3.2 真实 OPSI 4.3 Fixtures

由操作员从 Lab 导出脱敏 fixture：

```text
backend_info
host_getObjects
productOnDepot_getObjects
productOnClient_getObjects
productPropertyState_getObjects
productPropertyState_updateObjects read-back
log_read(instlog, clientId, maxSize)
```

保存到：

```text
services/opsi-control/tests/fixtures/opsi-4.3/
docs/opsi/evidence/v1.1/lab-fixtures/
```

Fixture 不包含 host key、password、token、真实姓名或未脱敏域名。

### 3.3 契约调整

- Action Target 增加 optional `userBinding { sid, account }`；setup/update 在业务验证层强制必填。
- `ProductPropertyState` Adapter 使用 `values: []` 规范化模型，不在业务层传播 OPSI 原始对象。
- Result 增加 attempt、propertyDigest、opsiModificationTime 等可选观测字段。
- `contracts/version.json` 将 `opsiControlApi` 升至 `1.1.0`。

### 退出条件

- [ ] Product pytest 全绿且 CI 真正执行。
- [ ] OpenAPI drift、JSON Schema fixtures 全绿。
- [ ] OPSI 4.3 fixtures 已由操作员脱敏归档，或 Phase 1-5 仅可停留在 mock verified、不得宣称 live proven。
- [ ] Evidence 状态无 false PASS。

## 4. Phase 1 — Real Package、Artifact 与 Release

### 4.1 分离 Smoke 与真实包

- 修改 [`packaging/makepackage.py`](../../infra/opsi/products/smc-hermes-agent/packaging/makepackage.py)：smoke 输出 `.smoke.zip`，不得输出 `.opsi`。
- 新增 OPSI Linux Builder 脚本/容器说明，在 Product 根目录实际运行 `opsi-makepackage`。
- 真实 Builder 产出 `.opsi`、SHA256、manifest、build metadata；CI 上传 artifact，不自动发布 Depot。
- 新增 operator-only Lab publish Runbook：`opsi-package-manager -i`、read-back Product version/package version、unpublish/rollback。

### 4.2 Hermes Release Artifact

在 Product Package 中定义：

```text
CLIENT_DATA/artifacts/hermes-<version>-windows.zip
CLIENT_DATA/artifacts/hermes-<version>-windows.manifest.json
CLIENT_DATA/artifacts/hermes-<version>-windows.sig
CLIENT_DATA/keys/release-public-key.pem
```

- Manifest：version、platform、architecture、bytes、SHA256、package revision、createdAt。
- 使用 Ed25519 release public key 验签；私钥只存在企业 Release Pipeline。
- Package build 校验 `control.toml productVersion == manifest Hermes version`。
- Endpoint 必须从 `%ScriptPath%` 验证并复制到 ProgramData staging；不得期待不存在的外部文件后仍继续。

### 4.3 current/previous

- 记录 current/previous version + package revision + artifact digest。
- 更新前冻结 previous；新版本验证成功后才切 current。
- 保留一个 previous 回退包；清理更旧版本需独立 retention 规则。

### 退出条件

- [ ] Smoke artifact 不再冒充 `.opsi`。
- [ ] 真实 OPSI Builder 能解析 control.toml 并生成可安装 `.opsi`。
- [ ] Artifact missing/hash/signature/version mismatch 全部 fail closed。
- [ ] Lab Depot install/read-back/rollback Runbook 可执行。

## 5. Phase 2 — Endpoint Transaction 与 User Handoff

### 5.1 修复路径和 Property 传递

- 统一 Product layout helper，修复 `scripts` 与 `bootstrap` 的 sibling 路径。
- `.opsiscript` 将 `client_id`、`managed_user_sid/account`、gateway_port/autostart/profile、config_revision、diagnostic lines、repair level 全部按 operation 显式传给 Adapter。
- `client_id` 必须来自 OPSI client-specific property/validated context，不使用 `$env:COMPUTERNAME` 代替 FQDN OPSI ID。
- 所有参数在 `.opsiscript` 与 PowerShell 双层做 allowlist/length/type 校验。

### 5.2 Transaction Journal

新增/重构：

```text
scripts/transaction/Start-SmcTransaction.ps1
scripts/transaction/Resume-SmcTransaction.ps1
scripts/transaction/Rollback-SmcTransaction.ps1
scripts/transaction/Complete-SmcTransaction.ps1
```

Journal 保存 request/payload digest、attempt、phase、previous/target version、previous owner、target SID、timestamps、error。

- Artifact 验证前不得写 version/owner。
- `USER_CONTEXT_PENDING` 写 pending result，退出码/OPSI action result 必须与“尚未完成”语义一致。
- seen request 记录 payload digest 和终态；pending request 可继续，不能直接当 SUCCEEDED replay。
- crash/reboot 后从 journal 恢复或安全 rollback。

### 5.3 User Binding 与 Scheduled Task

- 生产禁用 `LastLoggedOnUserSID` 推断；使用 API/OPSI client-specific `managed_user_sid` + `managed_user_account`。
- 从 ProfileList 校验 SID/account/profile 对应关系。
- Task 使用明确 Principal、Interactive logon、Least privilege、目标 SID 唯一 Task Name。
- User Bootstrap 实际安装/激活 Hermes exact version、执行 `config check`、启动/验证 Gateway。
- Gateway Healthy 后由 User Bootstrap 原子写 `{ "hermes": "opsi" }`；失败恢复 previous owner。
- setup 前 owner=`salt|runtime` 时拒绝，禁止 v1.1 隐式迁移。

### 退出条件

- [ ] 无用户时保持 pending，不 false success。
- [ ] 目标用户登录后继续相同 request 并完成 Gateway health。
- [ ] Task 不以 SYSTEM 操作 HERMES_HOME，不影响非绑定用户。
- [ ] 任一失败恢复 previous version/owner/Gateway。

## 6. Phase 3 — Config、Health、Diagnostics 与 Repair

### 6.1 Managed Config

- Policy Service 将完整 keys 进行 schema validation、canonical JSON、digest、持久化。
- 通过 request manifest/批准的 OPSI 属性引用将 payload 送达 Endpoint；禁止只传 revision。
- Endpoint 将 allowlisted keys merge 到真实 Hermes config，而非只写 OPSI `current.json`。
- 执行 `hermes config check`，必要时 restart Gateway；失败恢复 backup 并再次 health。
- revision/digest 规则：older reject、same+same replay、same+different conflict。

### 6.2 Health

扩展 [`Get-HermesStatus.ps1`](../../infra/opsi/products/smc-hermes-agent/scripts/health/Get-HermesStatus.ps1)：

- Hermes exact version、CLI、profile、config check、doctor。
- Gateway status、port listener identity、HTTP health。
- disk free、user context、owner、current config revision。
- 生成严格符合 `endpoint-state.schema.json` 的状态，并添加 schema validation test。

### 6.3 Redaction 与 Result

- 将文本 regex 替换为 recursive object redaction：敏感 key 整值删除/掩码；header/URI/token pattern 处理 value。
- 构建不含 checksum 字段的 canonical payload → 计算 bytes/SHA256 → 写最终 payload；增加 read-back checksum test。
- marker 必须输出到 opsi-script instlog 可见 stdout，同时写本地结果文件。
- `USER_CONTEXT_PENDING`、FAILED、SUCCEEDED 结果分别有稳定 error/status 语义。

### 6.4 Diagnostics / Repair

- 持续写 adapter/install/update/config/repair 日志，结构化且有 retention。
- 收集 status/doctor/config/gateway 与允许的日志尾部；拒绝 forbidden paths。
- Local Bundle ≤5 MiB；instlog compact diagnostic ≤256 KiB，分块包含 request/client/index/total/digest。
- Reconciler 可还原 compact diagnostic 并写 DiagnosticRecord。
- Repair L0/L1/L2 执行后都重新 health；L3/L4 仍需人工。

### 退出条件

- [ ] Config 12→13 成功，invalid 14 回滚 13。
- [ ] Health 覆盖 PRD 全部 probe 且 schema-valid。
- [ ] Result SHA/bytes 与最终文件一致。
- [ ] Secret canary 不出现在 property、instlog、result、diagnostic、service log。
- [ ] Diagnostics API 有真实 producer，不再是只读空表。

## 7. Phase 4 — Durable `opsi-control`

### 7.1 API 只持久化

- `POST /actions` 使用单事务创建 Action、Targets、payload digest、Audit，返回 QUEUED。
- 相同 ID/same digest 返回幂等 replay；different digest 409；并发 create 由 DB unique 保障。
- 禁止在 HTTP request 内逐 target 调 OPSI RPC。
- Policy payload 独立持久化并与 Action/Revision/Digest 关联。

### 7.2 数据模型 / Migration

新增字段/约束：

```text
action_requests: updated_at, deadline, aggregate_version
action_targets: unique(request_id, client_id), attempt, lease_owner, lease_until,
                property_digest, opsi_action, opsi_modification_time, last_observed_at
action_results: unique(request_id, client_id), bytes, error_code, body_digest
diagnostics: unique(request_id, client_id), manifest_digest
worker_heartbeats
managed_policies: revision, payload_digest, payload_json
```

- 增加 FK/cascade/index。
- Request-scoped UoW；Repository 不得每个字段更新独立 commit。
- Migration 验证空库、v1.0→v1.1、downgrade/upgrade cycle。

### 7.3 Workers

- Dispatcher：`FOR UPDATE SKIP LOCKED`/lease claim，read-before-write，dispatch snapshot，bounded attempts。
- Reconciler：poll coarse state + bounded instlog，校验 result/diagnostic，更新 target 和 aggregate。
- lifespan 启动模式或独立 worker 模式二选一并写 ADR；禁止 API 多 worker 各自重复启相同后台循环。
- heartbeat、graceful shutdown、lease recovery、backoff、deadline/UNKNOWN terminal。

### 7.4 Aggregate

- 全部成功 → SUCCEEDED。
- 任一 QUEUED/DISPATCHED/RUNNING → 对应 active aggregate。
- 全部终态且含 FAILED → FAILED。
- deadline 后仍无可证明结果 → UNKNOWN。
- Partial failure 保留每 target 事实，不覆盖已成功结果。

### 退出条件

- [ ] 200-target API 不同步等待 RPC。
- [ ] 双 worker 不重复 dispatch。
- [ ] API/worker/DB 重启后继续收敛。
- [ ] 所有 target/aggregate 状态由持久化事实重建。

## 8. Phase 5 — OPSI RPC 与 Result Closure

### 8.1 Adapter

- 引入业务层 normalized DTO，隔离 OPSI 原始 JSON。
- 修正 `productPropertyState` 为真实 `values` list；精确 filter product/property/object。
- 修正 `log_read("instlog", clientId, maxSize)`；response size 和 tail 界限双重限制。
- `productOnClient` 映射 actionRequest/progress/result/installation/lastAction/modificationTime。
- 写调用 timeout 后做 read-after-write；仅对幂等 read 使用自动 retry。

### 8.2 Dispatch Preconditions

- Client 必须存在且类型正确。
- Depot 必须存在目标 productVersion/packageVersion。
- setup/update 必须 exact Hermes version + verified user binding。
- custom operation 必须对应 client-specific request properties。
- properties 写入后 normalized read-back 全量匹配，再写 actionRequest。

### 8.3 Result / Diagnostic

- Marker parser 选择当前 request 的最后一个有效 marker，拒绝 stale/duplicate digest mismatch。
- 读取 compact JSON/chunks，schema validate、SHA/bytes validate、redacted=true validate。
- 写 ResultRecord、DiagnosticRecord、target status、Audit，并 recompute aggregate。
- malformed/oversize/secret canary 结果转 FAILED/UNKNOWN + security audit，不返回原始 body。

### 退出条件

- [ ] Fake fixtures 和 Live OPSI 4.3 调用形状一致。
- [ ] API→Property→Action→instlog→Result 的 request/client/digest 完整关联。
- [ ] Endpoint offline/reconnect、stale log、duplicate marker、RPC timeout 均可收敛。

## 9. Phase 6 — Production Gates 与 Work Regression

### 9.1 Production Composition

- 实现 `SecretProvider` Protocol + production HTTP/Vault adapter；Settings 只保留 secret reference，不保存 production OPSI password。
- 复用 `httpx.AsyncClient` 连接池，设置 TLS/CA、timeout、max connections；关停时 close。
- 缓存/刷新 JWKS，验证 issuer/audience/exp/nbf/kid/scope。
- `/ready` 检查 DB、Alembic head、OPSI RPC、Secret Provider、Dispatcher/Reconciler heartbeat。
- production 拒绝 Fake/InMemory、默认 JWT secret、HTTP RPC、missing migration/worker。

### 9.2 CI

- `opsi-package-ci.yml`：Ubuntu 运行 pytest/schema/smoke；Windows runner 运行 Pester 行为测试；OPSI Builder job 生成真实 package artifact。
- `opsi-control-ci.yml`：PostgreSQL migration cycle、双 worker integration、OpenAPI drift、secret scan、isolation。
- 修正 isolation base：push/PR 均使用可解析 merge base，失败时 fail closed。
- CI 只证明 `verified`，不修改 Live Evidence 为 `proven`。

### 9.3 Work

- 保留当前 `opsi` Availability-only 实现，仅补 Gateway recovery/OPSI offline canary。
- 验证 Main/Renderer 不出现 OPSI API、credentials、job surface。
- Salt enterprise tests 必须继续通过。
- 更新 `apps/work/lat.md/runtime-connection.md`，运行 `lat check`。

### 退出条件

- [ ] Production readiness 所有依赖真实检查。
- [ ] 全量 OPSI CI、contracts check、Work regression 通过。
- [ ] Salt/Runtime implementation diff guard 通过。

## 10. Phase 7 — Live OPSI 4.3 / Windows 10+11（人工）

### Cursor 约束

- 不自动执行 `opsi-package-manager -i` 到生产 Depot。
- 不自动 enroll 或下发真实企业 Endpoint。
- 不把 Template/Fake/Dry Run 写成 Live Evidence。
- 不把 `opsi-v11-phase7-live-manual` 标记 completed。
- 不把 `NO-GO/not_proven` 改成 GO/proven。

### Operator Runbook

1. 归档 OPSI version/license/modules、Depot、两台 Endpoint baseline。
2. 安装真实 v1.1 Package 到 Lab Depot。
3. Windows 10 Fresh Setup，无用户→pending→绑定用户登录→Gateway/Work。
4. Windows 11 同流程。
5. 两 Client 并发不同 request/operation，验证 Property isolation。
6. Config 12→13 与 invalid 14 rollback。
7. Update success 与 health-failure rollback，校验用户数据 hash。
8. status/restart/collect-log/diagnose/L1/L2 repair。
9. reboot/logout/login/port conflict/disk low/Endpoint offline。
10. OPSI Server + opsi-control offline，验证 Work Chat 继续；恢复后 reconcile。
11. Secret canary 扫描 Property/instlog/result/diagnostic/service log。
12. 两台连续观察 24h。
13. Security Owner + Release Owner 签署 v1.2 Pilot Go/No-Go。

### 自动 NO-GO

- false success。
- owner conflict 或 premature owner switch。
- 用户 Hermes 数据损失。
- Secret leak。
- rollback 后 Gateway/Work 不可恢复。
- P0/P1 未关闭。

## 11. PR 拆分

1. `fix(opsi): close v1.0 contract drift and evidence truth`
2. `feat(opsi): build signed real opsi package artifacts`
3. `feat(opsi): add endpoint transaction and user handoff`
4. `feat(opsi): apply real config health diagnostics and repair`
5. `feat(opsi-control): add durable action uow and workers`
6. `fix(opsi-control): align live jsonrpc and result reconciliation`
7. `chore(opsi): add production gates and work regressions`
8. `test(opsi): archive windows lab and 24h evidence`（operator evidence PR）

每个工程 PR 可独立回退；Contract/Migration 先于 producer/consumer 合并。Evidence PR 不与功能代码混合。

## 12. 验证命令

Product：

```text
python -m pytest infra/opsi/tests -q
Invoke-Pester infra/opsi/tests/SmcHermesAgent.Tests.ps1
python infra/opsi/products/smc-hermes-agent/packaging/makepackage.py --smoke
```

OPSI Control：

```text
cd services/opsi-control
uv sync --extra dev
uv run ruff check .
uv run ruff format --check .
uv run pytest -q
uv run alembic upgrade head
uv run alembic downgrade -1
uv run alembic upgrade head
```

Contracts / isolation：

```text
npm run contracts:check
python scripts/check-opsi-isolation.py --base <merge-base>
git diff --exit-code <base>...HEAD -- infra/salt services/salt-control contracts/salt-control-api
git diff --exit-code <base>...HEAD -- services/runtime contracts/runtime-api
```

Work：

```text
cd apps/work
lat check
npm run typecheck
npm run lint
npm test
npm run build
```

## 13. Definition of Done

- [ ] 当前 Product pytest 和 OpenAPI drift 红灯关闭。
- [ ] 真实 `.opsi` 包、签名 Artifact、Lab Depot read-back 完成。
- [ ] Endpoint transaction、pending continuation、rollback、owner commit 正确。
- [ ] Config/Health/Diagnostics/Repair 实际调用 Hermes 并可回退。
- [ ] API 异步持久化，Worker lease/restart/reconcile 正确。
- [ ] OPSI 4.3 RPC/result fixtures 与 Live 调用一致。
- [ ] Production readiness/Secret Provider/CI/Work regression 通过。
- [ ] Windows 10、Windows 11 Live Evidence proven。
- [ ] 24h Development Observation proven。
- [ ] Security + Release Signoff 完成。
- [ ] v1.2 Pilot Go/No-Go 已归档。

