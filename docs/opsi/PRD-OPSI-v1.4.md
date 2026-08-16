# SMC Copilot OPSI Endpoint Control Plane v1.4 PRD

**Real Lab + Hermes Windows Runtime Closure**

- 基线分支：`opsi/prd-v1.0`
- 规划基线：`a82bf81`（OPSI v1.3 engineering implementation）
- 目标 API：`opsiControlApi 1.4.0`
- 目标 Product：`smc-hermes-agent` package revision 2
- 状态：Planning；所有 Production Ring mutation 保持冻结

## 1. 文档定位

v1.1～v1.3 已完成 Action、Pilot/Production Campaign、Multi-Depot、Freeze、Rollback、Compliance 和 Evidence 的工程目录，当前自动化基线为：

```text
opsi-control pytest     58 passed / 1 skipped
opsi-control ruff       passed
infra/opsi pytest       6 passed
PowerShell Pester       7 passed
contracts:check         passed
Live Lab / Windows      not_proven / NO-GO
```

这些测试主要证明契约、状态机和静态脚本约束，尚不能证明“干净 Windows 通过真实 OPSI 安装 Hermes、在绑定用户上下文启动 Gateway，并由真实 opsi-control 观测和管理”。

v1.4 是修复型版本，不继续增加 Fleet/HA 功能。它要关闭真实 Lab 装配、权威 Inventory、Artifact 验签、CLI/Gateway Task、用户 continuation result relay、Owner commit 和卸载清理，然后用 2 台 Clean Windows 与 3～5 台快速 Pilot 完成人工证明。

```text
Freeze v1.3 Production
        ↓
Real Lab HttpOpsiJsonRpc + Existing Internal PostgreSQL
        ↓
OPSI RPC + Endpoint Evidence → Persisted Inventory
        ↓
Real Hermes Artifact + Endpoint Ed25519 Verify
        ↓
Exact CLI + SID Gateway Task + User Continuation Relay
        ↓
Owner Commit only after Gateway Health
        ↓
Win10/Win11 Clean Install Proof
        ↓
3～5 Endpoint Accelerated Pilot / 1-Day Observation
        ↓
v1.5 Production Re-entry Go / No-Go
```

## 2. 当前代码结论

以下不是单纯缺少人工签名，而是 Live Lab 前必须修复的代码缺口：

### 2.1 环境装配

- `SMC_OPSI_ENV=lab` 与 `test` 一样进入 `build_test_state()`，使用 `FakeOpsiJsonRpc`、内存 Repository 和写死 facts。
- `.env.example`/Runbook 虽要求真实 opsiconfd URL/账号，Lab 应用实际不会使用这些连接信息。
- 只有 `production` 使用 `HttpOpsiJsonRpc + PostgreSQL`，导致 Lab 无法安全验证真实集成。

### 2.2 Inventory

- `EndpointInventorySnapshot` 类型已经存在，但 `RolloutService` 仍依赖构造参数 `facts`。
- Production 装配使用 `facts={}`，无法从 OPSI RPC、Product Result、Client Binding 自动形成 snapshot。
- 当前模型强制 previous version/digest，无法表达干净机器的 `ABSENT` baseline。
- Action Result 只有 SHA-256 marker，不含密码学签名；checksum 不能被称为“签名 Result”。

### 2.3 Pilot Policy

- 代码仍使用 10～20 台、Canary 24h、后续 Batch 6h、最终 7 天。
- 当前验证路线已收缩为 3～5 台、Canary 4h、后续 Batch 1h、最终 1 天。
- Policy 仍是模块常量，不是带 revision 的可测试 Campaign policy。

### 2.4 Windows Runtime

- Artifact 解压到 `versions\current` 后不验证 manifest entrypoint/`hermes.exe`/真实 CLI version。
- Endpoint 只检查公钥存在和 signature 长度，没有执行 Ed25519 verify。
- Smoke Artifact 只有 `README.txt`；release builder 在缺 key 时还能自动生成 key，不能作为稳定信任链。
- 用户脚本依赖 `Get-Command hermes`。PATH 无 CLI 时会跳过 config/start/health，之后仍写 `{ "hermes": "opsi" }`。
- 只注册 `SMC-Hermes-User-Bootstrap-{SID}`，没有注册 Gateway autostart Task；restart 脚本却查找固定 `SMC-Hermes-Gateway`。
- Task 注册失败会写一个 JSON fallback 后吞掉异常，调用方不能区分“已注册”和“仅有定义文件”。
- 用户 bootstrap 结果写 `clientId=local`，与 OPSI client id 不匹配。
- 用户 Scheduled Task 的输出只在 Endpoint 本地，`opsi-control` 的 `log_read` 无法看到原请求最终结果。
- 卸载注销固定 `SMC-Hermes-User-Bootstrap`，无法删除带 SID 后缀的实际任务。

## 3. 产品目标

v1.4 必须完成：

- `test` 只允许 Fake/Memory；`lab` 使用真实 Http OPSI RPC，并通过配置连接公司现有 PostgreSQL；`production` 保持 OIDC/Secret Provider 强门禁。
- 通过 OPSI RPC、client-specific binding 和 Endpoint status evidence 形成持久化、带 TTL/来源摘要的 Inventory Snapshot。
- 区分 `ABSENT` 与 `INSTALLED` rollback baseline，使干净机器可以安全 enrollment。
- Release 构建必须输入真实 Hermes Windows Artifact 和固定 release signing key；禁止 release 路径自动生成 key。
- Endpoint 按 Builder 完全相同的 canonical payload 执行 Ed25519 验签，失败时不解压、不写版本、不写 Owner。
- 从 manifest 的相对 entrypoint 解析 `versions\current` 下的 Hermes CLI，所有动作使用绝对路径，不依赖全局 PATH。
- 注册、验证、启动并可卸载 SID-scoped Bootstrap/Gateway Tasks。
- CLI/version/config/Gateway health 全部通过后才原子写 `owner=opsi` 和最终 `SUCCEEDED`。
- 用户 continuation 的最终 Result 能经后续 OPSI action relay 到 instlog，并由原 request id 收敛。
- Pilot 使用 versioned `accelerated-v1.4` policy：3～5 台、Canary 2 台/4h、后续最多 3 台/1h、最终 24h。
- 在 1 台 Windows 10 + 1 台 Windows 11 Clean Endpoint 完整证明后，再执行 3～5 台 Pilot。

## 4. 非目标

v1.4 不建设：

```text
Work Rollout UI / window.opsiApi
Repair L3+ 自动执行
21～500 Production Rings 的 Live rollout
多 OPSI Config Server、OPSI HA/DR
超过 500 台或 8 Depot
Salt/Runtime ↔ OPSI 自动迁移或跨 Provider 回滚
opsi-control 直连 Endpoint（SSH/WinRM/HTTP）
管理任意 Hermes 附加 Windows Service
全局修改 Machine PATH 作为 CLI 发现机制
完整 Diagnostic Bundle 中央上传/下载
设备私钥生命周期或把 checksum 伪装为 device signature
```

v1.4 的 Windows runtime contract 是“受信 Artifact 中的 Hermes CLI + 用户态 Gateway `:8642`”。若未来 Hermes 增加必须托管的其它 Windows Service，需单独 manifest contract、权限模型和 ADR；本版本不把短生命周期 OPSI Adapter 变成通用 Windows Service Manager。

## 5. 架构与信任边界

### 5.1 环境装配

```text
test        FakeOpsiJsonRpc + Memory Repository + test fixtures
lab         HttpOpsiJsonRpc + Existing Internal PostgreSQL + Lab JWT
production  HttpOpsiJsonRpc + Existing Internal PostgreSQL + OIDC/JWKS
```

规则：

- `build_test_state()` 只接受 `opsi_env=test`。
- 新增 `build_lab_state()`，拒绝 Fake RPC、Memory Repository、SQLite 和空 RPC URL。
- `database_url` 指向公司现有 PostgreSQL 服务中的 OPSI Control 专用 database/schema；不在 Endpoint 或 OPSI Server 安装 PostgreSQL。
- OPSI Control 使用独立最小权限数据库用户；不得访问、联表、迁移或备份 OPSI Server 自有数据库。
- PostgreSQL 的容量、备份、HA 和监控沿用公司内部数据库平台；本项目只负责自身 schema、Alembic migration 和连接池配置。
- Lab RPC 必须 HTTPS；可使用显式 Lab CA bundle。`verify=false` 只允许独立 enrollment 工具，不允许 opsi-control。
- Lab 可使用环境变量密码或 secret ref，但不得写日志、API、Evidence 或提交 `.env`。
- `/ready` 返回无敏感信息的 `rpcBackend=http`、`persistence=postgresql`、DB migration/OPSI/Worker 状态；Fake Lab 必须 readiness fail。

### 5.2 Artifact Trust

Builder 生成 canonical signed envelope：

```text
schema/version/platform/arch/entrypoint
artifact bytes + SHA-256
Hermes version/package revision
signer key id
canonical manifest bytes + artifact digest
Ed25519 detached signature
```

Endpoint 信任 OPSI Product 中固定的 public key/key id，并对 canonical manifest + artifact digest 执行真实 Ed25519 verify。仅检查 `.sig` 长度、公钥文件存在或 SHA-256 相等都不构成签名验证。

### 5.3 Result Trust

v1.4 Result 信任级别定义为 `OPSI_AUTHENTICATED_CHECKSUM`：

- request id、client-specific property digest、OPSI client id 和 actionRequest 绑定。
- 通过 TLS opsiconfd 的 ProductOnClient/instlog 通道读取。
- canonical result payload 有内容 SHA-256 和 replay protection。

这证明相关性与传输边界内的完整性，不等价于设备私钥签名。v1.4 不在没有密钥注册/轮换/撤销方案的情况下新增一个虚假的 `signature` 字段。

## 6. Inventory 与 Enrollment Baseline

### 6.1 Inventory Sources

新增持久化 `InventoryCollector`，合并：

- OPSI RPC：host/client id、last seen、client→depot、ProductOnClient/ProductOnDepot。
- Client-specific Product Properties：managed SID/account、request/property digest、目标 config/version。
- Endpoint `status` Evidence：OS、disk、owner、installed manifest/digest、CLI path/version、Gateway/task/health。
- Operator Binding Record：首次 enrollment 的 SID/account、审批、observedAt 和 source evidence。

每个字段保存 source、observedAt 和 freshness；缺字段不能由默认值补齐。

### 6.2 Baseline Kind

- `ABSENT`：没有 OPSI-managed Hermes；previous artifact 不需要存在。Rollback 删除本次受管文件/任务并恢复 frozen previous owner。
- `INSTALLED`：必须有 previous version/artifact/config/task manifest，Rollback 恢复 exact baseline。
- `CONFLICT`：owner 为 `salt|runtime` 或受管路径身份不明；必须 INELIGIBLE。

`direct|empty → opsi` 只允许作为显式 enrollment Campaign，并保留 previous owner；不构成 Salt/Runtime migration。

### 6.3 Inventory Evidence

新增 `smc.opsi.endpoint-inventory.v1`，至少包含：

- client id、request id、timestamp、source trust level。
- OS/build、free disk、owner/baseline kind。
- Artifact manifest/version/digest、resolved CLI relative path/version。
- User Binding source/SID；account 在日志/Evidence 中默认脱敏。
- Bootstrap/Gateway task names/states、Gateway port/reachable。
- canonical content digest、redacted flag。

Inventory Result 从 OPSI instlog 恢复后写入公司内部 PostgreSQL 的 OPSI Control 专用 schema，不再注入 `RolloutService(facts=...)`。

### 6.4 数据库职责边界

```text
Windows Endpoint SQLite
  Hermes/Work 本地业务数据；v1.4 不改变

OPSI Server 自有数据库
  由 OPSI Server 管理；opsi-control 只经 JSON-RPC 使用

公司内部 PostgreSQL
  opsi-control 的 Action/Campaign/Lease/Approval/Inventory/Audit/Evidence
```

允许 Lab 与 Production 连接同一内部 PostgreSQL 集群，但应使用环境隔离的 database/schema、账号和 migration history。禁止跨环境共享业务表。

## 7. Windows Runtime Closure

### 7.1 Deterministic CLI Resolution

- manifest 的 `entrypoint` 必须是相对路径，不能含 `..`、盘符、UNC 或 escape `versions\current`。
- `Resolve-SmcHermesCli` 返回 `C:\ProgramData\SMC\opsi\versions\current\<entrypoint>`。
- 解压后验证文件存在、非目录、SHA-256（若 manifest 提供）和 `hermes --version == target version`。
- status、config、restart、repair、bootstrap 全部调用绝对路径；禁止 `Get-Command hermes` 决定成功路径。
- 可选 managed shim 只能位于 OPSI Root；不修改 Machine PATH。

### 7.2 SID-scoped Tasks

每个绑定 SID 管理两个精确名称：

- `SMC-Hermes-User-Bootstrap-{SID}`：首次登录/版本变更 continuation。
- `SMC-Hermes-Gateway-{SID}`：用户登录启动 exact CLI/Gateway，带 restart policy。

任务定义保存到受管 task manifest，包含 SID/account、CLI path、HERMES_HOME、Gateway port、version、task names 和 registration result。JSON 文件不能替代成功的 `Register-ScheduledTask`。

### 7.3 Owner Commit Transaction

Owner commit 必须满足：

1. Artifact/manifest/signature verified。
2. CLI resolved，exact version 通过。
3. User Binding 与当前 SID 匹配，HERMES_HOME 非 systemprofile。
4. Bootstrap/Gateway Task 注册与 read-back 正确。
5. `hermes config check` 成功。
6. Gateway Task 启动，`127.0.0.1:8642/health` 成功。
7. Endpoint Inventory Evidence 已写入 continuation outbox。

任一失败都不得写 `owner=opsi`/`SUCCEEDED`；transaction rollback 恢复 previous owner、version 和 tasks。

### 7.4 Continuation Result Relay

用户 Scheduled Task 不在 opsiclientd instlog 上下文内，因此新增明确 relay：

- 用户 task 写 `continuations/{original_request_id}.json`，包含真实 OPSI client id、状态和 content digest。
- Reconciler 对 `USER_CONTEXT_PENDING` 安排受限 `status` poll action，不直连 Endpoint。
- 下一次 OPSI `custom=status` 的 SYSTEM adapter 先读取、校验和发布 pending continuation marker 到当前 instlog。
- marker 包含 `parent_request_id`，Control 将 status poll 与原 install/update Action 关联。
- relay 成功后才将原 Action/Target 标为 SUCCEEDED；重复 relay 幂等，过期/不匹配 fail closed。

### 7.5 Uninstall/Rollback

- 从 task manifest 精确注销 Bootstrap/Gateway SID tasks，并 read-back 确认不存在。
- 仅停止 executable path/Task identity 属于 OPSI Root 的 Gateway；不杀其它 Hermes/Python 进程。
- 删除 staging/current/managed runtime state，但保留用户 `.hermes`、Profiles、Memory、Sessions、Credentials 和 Workspace。
- 显式 uninstall 恢复 frozen previous owner；rollback 恢复 exact previous version/tasks/owner。

## 8. Build 与 Package Pipeline

### 8.1 Smoke Lane

- Smoke Artifact 是明确的 non-release CLI contract fixture，不得只有 `README.txt`。
- Smoke builder 只写临时/output 目录，不写或覆盖 source tree public key，不生成可误用的 release key。
- 文件名继续 `.smoke.zip`，永不输出 `.opsi`。
- 静态测试之外增加行为测试：entrypoint、missing CLI、version mismatch、invalid signature、path traversal。

### 8.2 Release Lane

- Linux OPSI Builder 必须有 `opsi-makepackage` 和真实 Hermes Windows release Artifact。
- Release signing key 必须由受控 secret/key provider 注入；缺 key 立即失败，禁止自动生成。
- 产出 `.opsi`、package SHA-256、signed envelope、SBOM/provenance summary 和 public key id。
- 安装到 Lab Depot 后用 OPSI RPC read-back exact Product/package；CI smoke 不能替代此 Evidence。

## 9. Accelerated Pilot Policy

移除散落的全局 Pilot timing/size 常量，使用 frozen policy revision：

```text
policy                  accelerated-v1.4
targetCount             3..5
canaryCount             2
canaryObservation       4h
followOnBatchMax        3
followOnObservation     1h
finalObservation        24h
```

- v1.4 Live Gate 只接受该 policy digest。
- 历史 v1.2/v1.3 Evidence 保留原文，不回写成已完成。
- 旧 10～20 payload 的 API compatibility 通过显式 legacy policy 处理，但不能满足 v1.4 Gate。
- Production mode 21～500 的代码继续存在，但 start 保持 freeze，直到 v1.5 Production Re-entry GO。

## 10. API 与契约

新增/调整：

```text
PUT  /api/v1/opsi/clients/{client_id}/binding
POST /api/v1/opsi/clients/{client_id}/inventory-refresh
GET  /api/v1/opsi/clients/{client_id}/inventory-evidence
POST /api/v1/opsi/rollouts                         增加 pilotPolicyRevision
GET  /ready                                       返回 backend/persistence kind
```

Contract：

- `endpoint-inventory.schema.json` → `smc.opsi.endpoint-inventory.v1`。
- `runtime-artifact-manifest.schema.json` → signed envelope v2。
- `action-result.schema.json` 增加 optional `parentRequestId/resultKind/contentSha256/trustLevel`，保持 v1 reader compatibility。
- `rollout-campaign` 增加 versioned pilot policy digest。
- `opsiControlApi` 提升至 `1.4.0`；OpenAPI/Schema 仍由 FastAPI/Pydantic SOT 生成。

所有 Binding/Inventory mutation 使用 Idempotency-Key、If-Match、RBAC、reason/change ticket。Account/SID 不出现在普通 metrics/list API。

## 11. 测试与验收

### AC-01 Real Lab Wiring

`SMC_OPSI_ENV=lab` 启动后容器为 Http RPC，并连接配置指定的公司内部 PostgreSQL；故意注入 Fake/Memory/SQLite 时 startup/readiness 失败。真实 `backend_info`、host/product read 成功。

### AC-02 Inventory Refresh

Clean Endpoint 通过 status action 形成 persisted snapshot；重启 API/Worker 后仍可读。缺 SID/owner/depot/evidence 时 preflight fail closed。

### AC-03 Signature Negative Tests

正确 Artifact 验签通过；篡改 zip、manifest、signature、key id 或替换 public key 均在解压/owner commit 前失败。

### AC-04 Clean Install

Artifact 中 exact CLI 被解析，CLI/version/config/Tasks/Gateway health 全部通过后才写 owner。删除 CLI 或让 health 失败时 owner 不为 opsi。

### AC-05 User Continuation

未登录时 Action 为 RUNNING/USER_CONTEXT_PENDING；绑定用户登录后写 continuation；下一次 OPSI status relay 使用真实 client id 将原请求收敛为 SUCCEEDED。

### AC-06 Task Lifecycle

Bootstrap/Gateway SID tasks 注册/read-back 成功；update 不重复；uninstall/rollback 精确清理/恢复，不删除用户 `.hermes`。

### AC-07 Action Matrix

setup/update/uninstall/status/collect-log/diagnose/apply-config/restart-gateway/repair L0-L2 全部在 exact managed CLI 上执行；无 PATH 依赖或假成功。

### AC-08 Clean Windows Pair

1 台 Windows 10 + 1 台 Windows 11 从无 Hermes/无 OPSI owner 开始，真实 `.opsi` 安装、用户登录、Gateway/Work smoke、update/rollback/uninstall 全矩阵 proven。

### AC-09 Accelerated Pilot

3～5 台执行 Canary 2/4h、后续≤3/1h、最终 24h；owner conflict/false success/unknown/secret leak 为 0，rollback drill 100%。

## 12. 发布阶段

```text
Phase 0  Freeze Production + Baseline Truth
Phase 1  Real Lab Assembly
Phase 2  Persisted Inventory + Enrollment Baseline
Phase 3  Artifact Contract + Real Ed25519 Verification + Release Builder
Phase 4  Exact CLI + SID Tasks + Owner Transaction
Phase 5  User Continuation Result Relay + Reconciliation
Phase 6  Accelerated Pilot Policy + Contracts/CI/Runbooks
Phase 7  Win10/Win11 Clean Pair（人工门禁）
Phase 8  3～5 Endpoint / 1-Day Pilot（人工门禁）
Phase 9  v1.5 Production Re-entry Go / No-Go
```

Cursor/CI 只能写 `implemented/verified`。Phase 7～9 只能由 Operator Evidence 推进。

## 13. Definition of Done

- [ ] `lab` 使用真实 HttpOpsiJsonRpc，并连接公司内部 PostgreSQL 的隔离 database/schema；Fake/Memory 仅存在于 `test`。
- [ ] Endpoint 与 OPSI Server 均不新增 PostgreSQL；opsi-control 不访问 OPSI 自有数据库。
- [ ] Runbook/.env/readiness 与真实 Lab 装配一致，凭据不泄露。
- [ ] Inventory 由 RPC + Binding + Endpoint Evidence 持久化，不再依赖 seeded facts。
- [ ] Clean install 的 `ABSENT` baseline 与 installed rollback baseline 均正确。
- [ ] Release Artifact 使用固定 key，Endpoint 执行真实 Ed25519 verify。
- [ ] Smoke 不写 release key/source tree，Release `.opsi` 由 Linux `opsi-makepackage` 产出并 read-back。
- [ ] 所有 Product 动作使用 managed absolute CLI，不依赖 PATH。
- [ ] Bootstrap/Gateway SID tasks 注册、read-back、update、rollback、uninstall 正确。
- [ ] CLI/version/config/Gateway health 前不得写 `owner=opsi`。
- [ ] 用户 continuation 以真实 client id 经 OPSI instlog relay 到原 Action。
- [ ] Pilot policy 为 3～5 / 4h / 1h / 24h，legacy policy 不满足 v1.4 Gate。
- [ ] API 1.4.0、Schema/OpenAPI、migration、Product/Pester/Control/Contract tests 通过。
- [ ] Work Direct Hermes/OPSI Offline Continuity 通过，Salt/Runtime diff 为空。
- [ ] Win10/Win11 Clean Pair Evidence 由 Operator 签为 `proven`。
- [ ] 3～5 Endpoint 1-Day Pilot Evidence 由 Operator 签为 `proven`。
- [ ] v1.5 Production Re-entry Go/No-Go 已归档；未 GO 时 Production Rings 继续冻结。
