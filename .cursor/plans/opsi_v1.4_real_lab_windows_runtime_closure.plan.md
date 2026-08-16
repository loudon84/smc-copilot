---
name: OPSI v1.4 Real Lab + Windows Runtime Closure
overview: 基于 a82bf81 已实现但 Live NO-GO 的 v1.1～v1.3 代码，停止继续扩展 Production Fleet，先把 lab 从 Fake/Memory 切到真实 HttpOpsiJsonRpc，并连接公司现有 PostgreSQL 的隔离 database/schema，建立 RPC + Binding + Endpoint Evidence 的持久化 Inventory，完成真实 Hermes Artifact/Ed25519 验签、managed absolute CLI、SID-scoped Bootstrap/Gateway Tasks、Gateway health 后 Owner commit、用户 continuation result relay 和精确卸载，再在真实 OPSI 4.3 对 1 台 Win10 Clean Endpoint 人工证明真实 .opsi、全 Action、continuation、update/rollback/uninstall。
todos:
  - id: opsi-v14-phase0-truth-freeze
    content: "Phase 0: 固化 a82bf81 与 v1.1～v1.3 NO-GO 真值，新增 ADR-033，默认冻结 Production start/stable release，补充针对 Fake Lab、seeded facts、PATH 假成功、无验签、ClientId=local 和 task mismatch 的失败测试"
    status: completed
  - id: opsi-v14-phase1-real-lab
    content: "Phase 1: 拆分 build_test_state/build_lab_state/build_production_state，使 lab 强制 HttpOpsiJsonRpc，并通过 database_url 连接公司现有 PostgreSQL 的隔离 database/schema；不在 Endpoint/OPSI Server 部署 PostgreSQL，同时让 readiness 暴露无敏感信息的 backend/persistence/migration/worker 真值"
    status: completed
  - id: opsi-v14-phase2-inventory
    content: "Phase 2: 实现 OPSI RPC + client binding + Endpoint status evidence 的 InventoryCollector/持久化 snapshot/TTL/source digest，增加 ABSENT/INSTALLED/CONFLICT baseline，移除 RolloutService seeded facts"
    status: completed
  - id: opsi-v14-phase3-artifact-trust
    content: "Phase 3: 定义 signed artifact envelope v2 和 manifest entrypoint，release builder 强制真实 Hermes Artifact/固定 key/Linux opsi-makepackage，Endpoint 执行真实 Ed25519 verify，Smoke 使用隔离 contract fixture 且不写 source/release key"
    status: completed
  - id: opsi-v14-phase4-runtime-tasks
    content: "Phase 4: 实现 Resolve-SmcHermesCli 绝对路径与 exact version，注册/read-back SID-scoped Bootstrap/Gateway Tasks，config/start/health 通过后再提交 owner，并完成 update/rollback/uninstall 精确任务与文件生命周期"
    status: completed
  - id: opsi-v14-phase5-continuation-relay
    content: "Phase 5: 用户 Task 以真实 OPSI client id 写 continuation outbox，Reconciler 安排 status poll，经 OPSI instlog relay parentRequestId/result digest，使原 setup/update 从 USER_CONTEXT_PENDING 权威收敛且支持 restart/replay"
    status: completed
  - id: opsi-v14-phase6-policy-gates
    content: "Phase 6: 将 Pilot 常量改为 versioned accelerated-v1.4 policy（3～5、Canary 2/4h、后续≤3/1h、最终24h），升级 opsiControlApi 1.4.0、Schemas/Migration、行为 Pester/Windows CI、Contracts/Work/isolation 与 Lab Runbooks"
    status: completed
  - id: opsi-v14-phase7-live-proof
    content: "Phase 7（人工门禁）: 在真实 OPSI 4.3 对 1 台 Win10 Clean Endpoint 执行真实 .opsi、全 Action、continuation、update/rollback/uninstall；Cursor 不得自动标记完成"
    status: pending
isProject: false
---

# Cursor Implementation Plan — OPSI v1.4

## 1. 执行依据

- PRD：[`docs/opsi/PRD-OPSI-v1.4.md`](../../docs/opsi/PRD-OPSI-v1.4.md)
- v1.3 PRD：[`docs/opsi/PRD-OPSI-v1.3.md`](../../docs/opsi/PRD-OPSI-v1.3.md)
- v1.3 Evidence：[`docs/opsi/evidence/v1.3/STATUS.md`](../../docs/opsi/evidence/v1.3/STATUS.md)
- OPSI Provider：[`docs/adr/ADR-031-opsi-parallel-endpoint-control-plane.md`](../../docs/adr/ADR-031-opsi-parallel-endpoint-control-plane.md)
- Production Rings：[`docs/adr/ADR-032-opsi-production-rings-multi-depot.md`](../../docs/adr/ADR-032-opsi-production-rings-multi-depot.md)
- Result Transport：[`docs/opsi/decisions/action-result-transport.md`](../../docs/opsi/decisions/action-result-transport.md)
- Machine/User：[`docs/opsi/decisions/machine-user-bootstrap.md`](../../docs/opsi/decisions/machine-user-bootstrap.md)
- Contract Flow：[`docs/architecture/contract-flow.md`](../../docs/architecture/contract-flow.md)
- 基线分支：`opsi/prd-v1.0`
- 规划基线：`a82bf81`

开始实现前读取：

- [`AGENTS.md`](../../AGENTS.md)
- [`apps/work/AGENTS.md`](../../apps/work/AGENTS.md)（仅回归）
- [`contracts/opsi`](../../contracts/opsi)
- [`infra/opsi/products/smc-hermes-agent`](../../infra/opsi/products/smc-hermes-agent)
- [`services/opsi-control`](../../services/opsi-control)

建议实现分支：`opsi/prd-v1.4`。

固定边界：

- 不修改 `infra/salt/**`、`services/salt-control/**`、`contracts/salt-control-api/**`。
- 不向 `services/runtime/**`、`contracts/runtime-api/**` 增加 OPSI 能力。
- Work 不新增 OPSI UI/API/credentials，始终 Direct Hermes。
- Control 不直连 Endpoint/Gateway/Work，不新增 SSH/WinRM/SMB。
- Production Rings、stable production rollout 在 Phase 7 后仍保持冻结，直至后续版本写入受信 `v1.5-production-reentry` Operator GO。
- 本版本只管理受信 Artifact 中的 CLI + Gateway，不成为通用 Windows Service Manager。

## 2. 已验证基线

当前工程门禁：

```text
opsi-control pytest   58 passed / 1 skipped
opsi-control ruff     passed
infra/opsi pytest     6 passed
Pester                7 passed（多数静态断言）
contracts:check       passed
Lab/Win/Pilot         NO-GO / not_proven
```

代码阻塞点及位置：

- `app.py`：`lab` 与 `test` 都调用 `build_test_state()`；Fake RPC + Memory + seeded facts。
- `domain/inventory.py`：typed snapshot 仍要求外部 `facts`；Production 构造没有 provider。
- `domain/snapshot.py`：Pilot 10～20、24h/6h/7d 常量与当前路线不一致。
- `Install-Hermes.ps1`：只验证 digest/signature length；不验证 Ed25519/entrypoint/CLI version。
- `Initialize-HermesHome.ps1`：`Get-Command hermes` 缺失时仍可能提交 owner。
- `Register-UserBootstrap.ps1`：注册失败被吞；没有 Gateway Task。
- continuation：用户 task 写 `clientId=local`，本地 marker 不进入 opsiclientd instlog。
- `Uninstall-OpsiManaged.ps1`：注销名与 SID-scoped 注册名不一致。
- `makepackage.py`：Smoke payload 为 README，且缺 key 时自动生成 signing key。

先为以上每项写一个能失败的行为/contract test，再改实现；不得用更新 snapshot string 的静态测试替代行为证明。

## 3. Phase 0 — Truth、Freeze 与 ADR-033

### 3.1 状态真值

- 保留 v1.1/v1.2/v1.3 Evidence 的 `not_proven/NO-GO`，不回写历史完成状态。
- v1.4 Evidence 新增 `engineering/win10-clean-endpoint` 两层门禁。Windows 11 独立验证与 3～5 台 accelerated Pilot 不作为本版本 Live 门禁。
- 所有 production Campaign start、stable promotion 和 Ring advancement 默认返回 precondition failure。
- Cursor/fixture 不能在 lab/production 写 `proven/GO`。

### 3.2 ADR-033

新增 [`docs/adr/ADR-033-opsi-real-lab-runtime-trust.md`](../../docs/adr/ADR-033-opsi-real-lab-runtime-trust.md)，冻结：

- test/lab/production 三种装配。
- Artifact Ed25519 trust chain 与固定 release key。
- managed absolute CLI、SID tasks、Owner commit transaction。
- OPSI-authenticated checksum Result 的信任级别；不宣称 device signature。
- user continuation outbox → OPSI status relay。
- accelerated-v1.4 Pilot 与 Production freeze。

### 3.3 Red Tests

- lab 容器 backend 必须不是 Fake/Memory。
- empty facts 不再导致永久 INELIGIBLE，而由 Collector 创建真实 snapshot。
- missing CLI/invalid signature/task registration failure/health failure 均不能写 owner。
- `clientId=local`、unrelayed continuation 和卸载 task mismatch 必须测试失败。
- Smoke 生成过程不得改写 source public key 或产生 release `.opsi`。

## 4. Phase 1 — Real Lab Assembly

### 4.1 Wiring

重构：

```text
build_test_state       test only / Fake + Memory
build_lab_state        lab only / Http RPC + Existing Internal PostgreSQL
build_production_state production only / Http RPC + Existing Internal PostgreSQL
```

- `create_app()` 对每个 env 只选择对应 builder；类型断言拒绝交叉装配。
- 抽取共同 `build_real_state(settings, auth_mode, secret_mode)`，但不降低 production guard。
- Lab Repository 包含 Action 与 Rollout SQL store，执行 Alembic head check。
- `database_url` 直接配置为公司现有 PostgreSQL 服务；Lab/Production 使用隔离 database/schema、独立最小权限账号和各自 migration history。
- 不在 Windows Endpoint 或 OPSI Server 安装 PostgreSQL；不得访问、联表或迁移 OPSI Server 自有数据库。
- PostgreSQL 平台的备份、HA、监控由公司内部数据库平台负责；本服务只管理自身 schema 和连接池。
- Workers 默认可启用；Runbook 可在调试时关闭，但 `/ready` 明确显示 worker state。

### 4.2 Lab Security/Readiness

- RPC URL 必须 HTTPS，支持显式 `opsi_rpc_ca_bundle`，不接受 silent TLS bypass。
- Lab 允许 Lab JWT；RPC password 优先 secret ref，direct env password 仅 Lab 且不记录。
- `/ready` 输出 `rpcBackend=http`、`persistence=postgresql`、migration/OPSI/dispatcher/reconciler/rollout。
- Integration test 使用 CI PostgreSQL service；真实 Lab 使用配置指定的内部 PostgreSQL，确认请求实际到 Http client 且重启后状态保留。
- 更新 `.env.example` 和 Runbook，删除“填了真实账号但进 Fake”的误导路径。

完成标准：真实 Lab `backend_info/host/product` read 成功且 DB 持久化在 restart 后保留。

## 5. Phase 2 — Inventory Collector 与 Baseline

### 5.1 Contracts/Persistence

- 新增 `EndpointInventoryEvidence` Pydantic/JSON Schema。
- 新增 `EndpointBindingRecord`、`EndpointInventorySnapshotRow` 和 migration/index。
- Snapshot 字段记录 value/source/observedAt/trustLevel/contentDigest/expiry。
- client/account detail 受 RBAC；普通 list/metrics 默认脱敏。

### 5.2 Collector

- RPC provider 读取 host、last seen、depot mapping、ProductOnClient/Depot 和 client-specific properties。
- Binding API 记录 SID/account、Operator evidence、revision 和 approval；禁止 body 自报 actor。
- Endpoint `status` 采集 OS/disk/owner/manifest/CLI/Gateway/tasks/health。
- Collector 只在所需 sources freshness 有效时生成 snapshot；无默认 OS/owner/disk/health/digest。
- Rollout/preflight/dispatch/rollback 从 Repository 读取 snapshot，不再使用 `self.facts`。

### 5.3 Clean Baseline

- `ABSENT`：无受管 Hermes，允许 `direct|empty` enrollment；rollback 删除本次受管状态并恢复 owner。
- `INSTALLED`：previous manifest/artifact/config/task baseline 必须齐全。
- `CONFLICT`：salt/runtime/未知受管路径直接拒绝。
- 增加 clean/update/owner-conflict/expired snapshot/restart tests。

完成标准：真实 Lab status action 后 API/Worker restart，preflight 仍从内部 PostgreSQL 的隔离 schema 得到同一 digest。

## 6. Phase 3 — Artifact Trust 与 Release Package

### 6.1 Envelope v2

- manifest 增加 schema、entrypoint、keyId、CLI file digest/version/platform/arch。
- Builder 与 Endpoint 共享 canonicalization fixtures；禁止各自不同 JSON 序列化。
- signature payload 固定为 canonical manifest bytes + artifact digest。
- Contract test vectors包括 valid、zip tamper、manifest tamper、signature tamper、wrong key/keyId、path traversal。

### 6.2 Builder

- `makepackage.py --smoke` 在 temp/output tree 创建 non-release CLI fixture，不写 `CLIENT_DATA/artifacts`/keys。
- Smoke key 明确 `TEST-ONLY`，不能与 release key id 相同。
- Release script 接收真实 Hermes Windows zip、manifest 和 external signing key ref；缺任一项失败。
- 禁止 release path 自动 generate private key；private key 永不进入 Product/archive/log。
- Linux Builder 执行 `opsi-makepackage`，产出 `.opsi` + checksums/provenance，并在 Lab Depot read-back。

### 6.3 Endpoint Verify

- 在 PowerShell 5.1/Windows 10 可用的 pinned verifier 中实现 Ed25519 verify；Windows 11 不纳入本版本人工认证矩阵。
- verifier 自身由 Product file manifest/digest 固定；不可从网络下载。
- verify 在 Expand-Archive 前执行；失败清理 staging 并写 FAILED，不写 version/owner。
- public key/key id 固定，支持明确的双 key rotation window，禁止信任任意随包 public key。

完成标准：所有 negative vectors fail closed；真实 Hermes Artifact 通过 Linux Builder 生成可安装 `.opsi`。

## 7. Phase 4 — CLI、Tasks 与 Owner Transaction

### 7.1 Managed CLI

- 新增 `Resolve-SmcHermesCli`，校验 entrypoint 相对路径/Root containment/file digest。
- 安装后执行 absolute `hermes.exe --version` 并与 target exact version 比较。
- status/config/restart/repair/doctor/bootstrap 统一通过 resolver；移除成功路径中的 `Get-Command hermes`。
- 不修改 Machine PATH；可选 shim 仅在 managed Root。

### 7.2 Task Abstraction

- 新增可 mock 的 `Register/Get/Start/Stop/Remove-SmcManagedTask` wrapper。
- `SMC-Hermes-User-Bootstrap-{SID}` 与 `SMC-Hermes-Gateway-{SID}` 均使用 bound account/limited run level。
- Gateway task action 包含 absolute CLI、HERMES_HOME/profile/port，登录触发和受限 restart policy。
- Task registration 后 read-back principal/action/trigger；失败必须 throw，JSON manifest 不能代替注册。
- task manifest 原子保存 exact names/definitions/version。

### 7.3 Transaction/Owner

- machine phase：verify、stage、install、task definition，version state 保持 `pending`。
- user phase：SID/home、CLI version、config check、Gateway task/start/health。
- 全部成功才 atomic owner/version commit；否则恢复 previous version/tasks/owner。
- 用户 profile 未就绪为 RUNNING/PENDING，不是成功或失败 owner commit。
- setup/update/uninstall/rollback crash points 均有恢复测试。

### 7.4 Uninstall

- 读 task manifest 精确删除两类 SID task并 read-back。
- 只停止 managed path identity；保留 `.hermes`/Profiles/Memory/Sessions/Credentials/Workspace。
- cleanup task manifest/staging/current/state，并恢复 frozen previous owner。

## 8. Phase 5 — User Continuation Result Relay

### 8.1 Endpoint Outbox

- Register task传递真实 `ClientId`、RequestId、GatewayPort、manifest digest。
- 用户脚本写 canonical `continuations/{requestId}.json`，禁止 `clientId=local`。
- outbox 包含 parent request、status/error、inventory summary、content digest、redacted/trust level。
- 同一 request/payload 幂等；不同 payload conflict；retention/permissions 明确。

### 8.2 OPSI Relay

- Reconciler 遇到 USER_CONTEXT_PENDING 时创建受限 internal status poll，不直连 Endpoint。
- 下一次 Product `custom=status` 先 relay pending continuation 到当前 instlog，再输出本次 status。
- marker 增加 `parent_request_id/result_kind/content_sha256`；parser 对旧 v1 marker兼容。
- Reconciler 校验 poll→parent、client id、property digest、content digest 后更新原 Action。
- 只有 final user result + ProductOnClient/read-back/Gateway evidence 完成才 SUCCEEDED/HEALTHY。

### 8.3 Failure Tests

- user login before/after poll、API/worker/client reboot。
- duplicate/late/stale/wrong client/wrong parent/tampered digest。
- outbox存在但 status action失败、OPSI offline 后恢复。
- continuation success不会被旧 RUNNING marker覆盖。

完成标准：原 setup/update request 可仅经 OPSI channel 从 PENDING 权威收敛，无 Endpoint side channel。

## 9. Phase 6 — Accelerated Policy、API 与 Gates

### 9.1 Policy

实现 `accelerated-v1.4` immutable policy：

```text
targets 3..5
canary 2 / 4h
follow-on max 3 / 1h
final 24h
```

- Policy 序列化后有 digest，Campaign/Approval/Evidence 绑定。
- 从代码常量移除 size/timing 判断，Legacy policy显式保留但不能满足 v1.4 Gate。
- Production Campaign start强制 frozen，直到 persisted v1.5 re-entry GO。

### 9.2 API/Contracts

- Binding、inventory refresh/evidence routes。
- Result optional parent/resultKind/contentSha256/trustLevel。
- Artifact manifest v2、Inventory schema、pilot policy revision。
- `opsiControlApi=1.4.0`，生成 OpenAPI/Schema，运行 producer/consumer fixtures。
- Migration upgrade/downgrade/upgrade 与 v1.3 historical read compatibility。

### 9.3 Automated Gates

OPSI Product：

```text
python -m pytest infra/opsi/tests -q
Invoke-Pester infra/opsi/tests/SmcHermesAgent.Tests.ps1
```

Pester 必须执行 temp-root 行为测试和 mocked ScheduledTask/CLI/verifier，不再只检查字符串。

OPSI Control：

```text
cd services/opsi-control
uv run ruff check .
uv run ruff format --check .
uv run pytest -q
uv run alembic upgrade head
uv run alembic downgrade -1
uv run alembic upgrade head
```

Repository gates：

```text
npm run contracts:check
python scripts/check-opsi-isolation.py --base <merge-base>
git diff --exit-code <base>...HEAD -- infra/salt services/salt-control contracts/salt-control-api
git diff --exit-code <base>...HEAD -- services/runtime contracts/runtime-api
cd apps/work && lat check && npm run typecheck && npm test && npm run build
```

新增 Runbook：Real Lab service、Linux Builder、Clean Windows、user continuation、task/owner recovery、accelerated Pilot、NO-GO。

## 10. Phase 7 — Live Proof（人工）

本版本 Live 门禁只覆盖 **1 台 Win10 Clean Endpoint**。不要求 Win11，不要求 3～5 台 accelerated Pilot / 24h Observation。

### 10.1 Win10 Clean Endpoint

在真实 OPSI 4.3 单 Config Server/Depot：

1. 1 台 Win10，起始无 managed Hermes/owner/task。
2. 构建真实 Hermes `.opsi`，安装 Depot 并 read-back。
3. Real Lab opsi-control refresh inventory/binding/preflight。
4. setup → pending → user logon → continuation relay → owner/Gateway healthy。
5. 执行全部 management Action，验证 absolute CLI 与 Result correlation。
6. update、失败 rollback、成功 rollback、uninstall；task/owner/files/user-data 检查。
7. 篡改 Artifact/signature/health，证明 fail closed。

### 10.2 本版本不做

- Win11 Clean Endpoint
- 3～5 台 accelerated Pilot / Canary 4h / 24h Observation
- live target / batch / campaign rollback drill（单机 update/rollback/uninstall 除外）

### 10.3 Signoff

Release Owner、Endpoint Ops、Security Owner 复核 Evidence，签署：

- `v1.4 Win10 Clean Endpoint = proven/GO`

`v1.5 Production Re-entry` 仍保持冻结 / `NO-GO`，直到后续版本单独证明 Fleet。Cursor 不得自动完成此 Phase。

## 11. PR 拆分

1. `test(opsi): add v1.4 live-closure red gates`
2. `fix(opsi-control): wire real lab http rpc and internal postgres`
3. `feat(opsi-control): persist endpoint binding and inventory evidence`
4. `fix(opsi): add signed artifact envelope and real ed25519 verify`
5. `fix(opsi): install exact cli and manage sid gateway tasks`
6. `fix(opsi): relay user continuation through opsi result channel`
7. `feat(opsi-control): add accelerated pilot policy and api 1.4`
8. `test(opsi): add behavioral powershell and real-lab integration gates`
9. `docs(opsi): add v1.4 lab builder and pilot runbooks`
10. `test(opsi): archive win10-clean-endpoint evidence`（Operator PR）

Lab wiring/Inventory 先于 Runtime Action；Artifact trust 先于 install；continuation relay 先于 Live Evidence。工程 PR 不包含 `proven` 签名。

## 12. Definition of Done

- [ ] Real Lab 为 Http RPC + 公司内部 PostgreSQL 隔离 schema，Fake/Memory 只在 test。
- [ ] Endpoint/OPSI Server 不新增 PostgreSQL，OPSI Control DB 用户无法访问 OPSI 自有数据库。
- [ ] Inventory/Binding/Evidence 持久化且无 seeded facts/default truth。
- [ ] ABSENT/INSTALLED/CONFLICT baseline与 rollback正确。
- [ ] Release builder/固定 key/real `.opsi`/Endpoint Ed25519 verify通过。
- [ ] Smoke隔离且不写 source/release key。
- [ ] 所有动作使用 managed absolute CLI + exact version。
- [ ] SID Bootstrap/Gateway Tasks与 Owner transaction全生命周期通过。
- [ ] continuation使用真实 client id经 OPSI relay收敛原请求。
- [ ] accelerated-v1.4 policy、API 1.4.0、Schema/Migration通过。
- [ ] Product行为 Pester、Control、Contracts、Work、isolation全部通过。
- [ ] 1 台 Win10 Clean Endpoint 由 Operator 签为 proven（真实 `.opsi`、全 Action、continuation、update/rollback/uninstall）。
- [ ] Win11 与 3～5 台 accelerated Pilot 不作为本版本 Live 门禁。
- [ ] v1.5 Production Re-entry 继续冻结 / NO-GO，直至后续 Fleet 证明。
