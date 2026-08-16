# SMC Copilot OPSI Endpoint Control Plane v1.6 PRD

**Windows Endpoint Controller + Hermes Agent Install-to-Control Closure**

- 基线分支：`opsi/prd-v1.0`
- 规划基线：`52d9679`（OPSI v1.5 engineering implementation）
- 目标 API：`opsiControlApi 1.6.0`
- 目标 Product：`smc-hermes-agent` package revision 3
- 目标 Controller Contract：`smc.opsi.endpoint-controller.v1`
- 状态：Planning；v1.5 Live Evidence 仍为 `not_proven/NO-GO`，Production mutation 保持冻结

## 1. 文档定位

v1.5 已完成服务端 TargetVerification、可恢复 Ring observation、Depot Attestation v2、签名 Re-entry Gate 和 Evidence Manifest v3。当前自动化基线全部通过，但这些能力仍不能证明 Windows Endpoint 上的 Hermes Agent 已经从安装到控制形成真实闭环。

现有 `smc-hermes-agent` 是从 OPSI cache 启动的短生命周期 PowerShell Adapter。它能够验证并解压 Hermes Artifact，也定义了 Bootstrap/Gateway Task 和部分事务脚本；但是本地 Controller 文件没有被安装到持久目录，事务 journal 不可恢复，用户态命令和配置传输不完整，状态与卸载仍可能产生假成功。

v1.6 暂停继续扩大 Fleet，优先建设一个**不监听端口、不常驻进程、可由任务触发并恢复的 Windows Endpoint Controller**，完成：

```text
opsi-control Action
        ↓ TLS JSON-RPC only
opsiconfd / opsiclientd
        ↓
Thin OPSI Bootstrap from Product Cache
        ↓ verify/install
Endpoint Controller under C:\ProgramData\SMC\opsi
        ↓ desired state + durable transaction
Hermes Agent immutable runtime slot
        ↓ bound user command
User Config + Gateway Task + :8642 health
        ↓
Owner commit + authoritative state/result relay
        ↓
status / config / restart / repair / update / rollback / uninstall
```

## 2. 当前代码审计结论

当前自动化为：

```text
opsi-control pytest       91 passed / 1 skipped
opsi-control ruff/format  passed
infra/opsi pytest         12 passed
Product Pester            11 passed
contracts:check           passed
Live Windows lifecycle    not_proven / NO-GO
```

自动化主要验证静态契约和服务端状态机。以下代码缺口会阻断真实 Windows 安装到控制全过程。

### 2.1 Controller 没有安装到持久目录

- OPSI `.opsiscript` 从 `%ScriptPath%` 调用 Adapter；Endpoint 只安装 Hermes Artifact，没有复制/version `scripts`、`bootstrap`、verifier 和 Controller manifest。
- `Register-UserBootstrap.ps1` 把任务指向 `$Root\bootstrap\user\Initialize-HermesHome.ps1`，但现有安装流程没有创建该路径。
- OPSI cache 清理、Product upgrade 或 reboot 后，Scheduled Task 可能引用不存在的脚本。
- Controller 自身没有版本、文件 digest、active pointer、ACL 或 rollback slot。

### 2.2 Transaction 只有记录，没有恢复语义

- `Start-SmcTransaction.ps1` 支持 `previousVersion/previousOwner`，调用方却没有传入这些值。
- `Resume-SmcTransaction.ps1` 只返回 journal，不执行 resume/rollback，也没有任何入口调用它。
- 单一 `state/journal.json` 会被后续 status/custom Action 覆盖，不能表达多个 request 或 user continuation。
- machine phase 返回 `USER_CONTEXT_PENDING` 后 journal 保持 `prepare`；用户成功路径没有完成同一 transaction。
- crash/reboot 后没有 controller startup reconcile，无法确定 active slot、owner、task 和 outbox 是否一致。

### 2.3 Runtime activation 不是不可变原子切换

- update 把 `current` 复制到 `previous`，随后把新 payload overlay 到原 `current`；旧文件可能残留。
- 后续所有动作默认解析 `versions\current\hermes.exe`，没有读取 install 时保存的 manifest `entrypoint/cliSha256`。
- Artifact 只约束入口文件，没有验证完整展开文件清单、ZIP entry containment 和 active slot identity。
- Controller version 与 Hermes runtime version 没有分离，无法单独更新 Controller。

### 2.4 Machine/User 命令边界未闭合

- `apply-config` 的服务端会写 `config_payload/config_digest` Property，但 `custom.opsiscript` 没有读取或落地 payload；Endpoint 因缺 `managed/config/incoming.json` 必然失败。
- `Apply-ManagedConfig.ps1`、restart 和 repair 由 SYSTEM custom Action 启动；SYSTEM 不能写绑定用户 HERMES_HOME，也不应启动用户 Gateway。
- custom Action 没有传 `managed_user_sid/account/profile`；restart 无法定位 SID Task，repair 可能回落为 SYSTEM CLI。
- `ManagedProfile`、`GatewayAutostart` 未进入 Task action；用户 bootstrap health 固定检查 `8642`，忽略配置端口。
- Gateway Task 没有明确 HERMES_HOME、profile、bind、port 和 runtime slot，无法证明启动的是目标实例。

### 2.5 状态、Result 与 Outbox 存在假成功

- Endpoint `Get-HermesStatus.ps1` 固定输出 `owner=opsi`，未以真实 owner/pending/absent 为准。
- 服务端 `/clients/{id}/state` 将 `ProductOnClient installationStatus=installed` 直接映射为 `HEALTHY/reachable=true`，没有读取 Endpoint Controller state。
- status Action 即使 Gateway OFFLINE 仍可返回 Action SUCCEEDED；缺少“命令执行成功”与“目标健康状态”的明确双层模型。
- continuation 文件 relay 后不 ack/delete，会在每次 status 重复输出且没有 retention/poison queue。
- state v1 不包含 controller version、transaction phase、desired/observed digest、task integrity、pending command 或 drift。

### 2.6 Uninstall 与 Owner 恢复不完整

- uninstall 删除部分受管目录，但不会恢复或删除 `control-owner.json`，可能留下 `hermes=opsi` 假所有权。
- journal 没有真实 previous owner，因此 failure rollback 也无法可靠恢复。
- 未定义用户未登录时如何停受管 Gateway、如何等待 user command、如何安全超时。
- running Controller 不能直接删除自身；当前没有两阶段 uninstall/tombstone/finalize 机制。
- continuation、result、managed config、controller releases 和 stale tasks 的 retention/cleanup 不完整。

## 3. 产品目标

v1.6 必须完成：

- 将受信 Controller bundle 安装到 `%ProgramData%\SMC\opsi\controller\releases\<revision>`，验证 manifest/digest/ACL，并用 atomic active pointer 切换。
- Controller 与 Hermes runtime 分版本管理；Controller package upgrade 不强制升级 Hermes。
- 建立 per-request transaction journal v2、endpoint mutex、phase checkpoint、startup/next-action resume 与确定性 rollback。
- 将 Hermes Artifact 安装到 immutable runtime slot，完整验证 archive/file manifest/entrypoint/version/digest 后原子激活。
- 建立 machine desired state 与 bound-user command queue；所有 HERMES_HOME/config/Gateway 操作只在目标 SID 用户上下文执行。
- 让 setup/update/apply-config/restart/repair/uninstall 均支持 `USER_CONTEXT_PENDING → user result → OPSI status relay → final authoritative result`。
- Gateway Task 固定 absolute active CLI、HERMES_HOME、profile、loopback bind、port、autostart 和 restart policy，并支持 task integrity read-back。
- 只有 Controller/runtime/config/task/Gateway health 全部一致后写 `owner=opsi`；pending/failure/rollback 不产生假 owner。
- 输出 Endpoint Controller State v2 和 lifecycle events；服务端 client state 只消费持久化 Controller Evidence，不从 installationStatus 构造 HEALTHY。
- 完成 atomic update、controller/runtime rollback、reboot recovery、repair L0-L2 和两阶段 uninstall，保留用户数据并恢复 previous owner。
- 新增 `v1.6-endpoint-controller` Operator Gate；未 proven/GO 时 v1.5 Production Re-entry、stable/start/next Ring 继续冻结。

## 4. 架构决策

### 4.1 Controller 形态

Endpoint Controller 是已安装的短生命周期 reconcile engine，不是新的常驻 Windows Service：

```text
No listener
No Endpoint inbound port
No Chat proxy
No direct connection to opsi-control
Invoked by opsiclientd / SYSTEM recovery task / bound-user task
Exits after one bounded reconcile cycle
```

建议入口：

```text
controller\current.json
controller\releases\<revision>\Invoke-SmcEndpointController.ps1
```

触发器：

- opsiclientd Action：写 desired command，并调用 machine reconcile。
- `SMC-Hermes-Controller-Recover`：SYSTEM 开机触发，恢复未完成 machine transaction；不启动用户 Gateway。
- `SMC-Hermes-Controller-User-{SID}`：绑定用户登录触发，处理该 SID 的 command inbox。
- `SMC-Hermes-Gateway-{SID}`：只负责启动 exact managed Gateway。

### 4.2 文件布局

```text
C:\ProgramData\SMC\opsi\
  controller\releases\<revision>\       immutable controller bundle
  controller\current.json               active revision + manifest digest
  runtime\versions\<version>-<digest>\ immutable Hermes runtime
  runtime\active.json                    active/previous slot pointers
  desired\machine.json                   server desired state
  observed\endpoint.json                 controller observed state
  state\ownership.json                   previous/current owner transaction
  state\tasks.json                       exact task definitions/digests
  transactions\<requestId>.json          journal v2
  commands\<SID>\inbox|outbox|ack\       bounded user command relay
  results\ / logs\ / quarantine\
```

ACL：Controller/runtime/desired/transactions 仅 SYSTEM/Administrators 写；用户只能读取 runtime、执行允许入口，并写自己 SID 的 outbox。禁止用户替换 Controller、desired state、active pointer 或 trusted keys。

### 4.3 Desired / Observed / Transaction

Machine desired state 至少绑定：

- client id、request id、operation、Controller revision。
- Hermes version/artifact/manifest/entrypoint/full file digest。
- bound SID/account revision、profile、HERMES_HOME resolution policy。
- config revision/digest、Gateway autostart/bind/port。
- previous owner/runtime/config/task baseline digest。

Observed state来自 Controller 本地 read-back，不能由请求直接声明。Transaction journal v2 保存每个 phase 的 input/output digest、attempt、actor context、timestamps 和 recovery decision。

## 5. Endpoint Controller 状态机

### 5.1 安装状态

```text
ABSENT
  → CONTROLLER_VERIFIED
  → CONTROLLER_INSTALLED
  → RUNTIME_VERIFIED
  → RUNTIME_STAGED
  → USER_CONTEXT_PENDING
  → USER_CONFIGURED
  → GATEWAY_HEALTHY
  → OWNER_COMMITTED
  → READY
```

失败路径：

```text
any non-terminal phase
  → RECOVERING
  → RESUMED | ROLLED_BACK | MANUAL_BLOCKED
```

- Phase transition 使用 endpoint-wide named mutex + journal CAS。
- 同 request/same desired digest 幂等 replay；same request/different digest 进入 conflict，不执行副作用。
- open transaction 不允许另一 mutation Action覆盖；status/diagnose 可以只读并发。
- startup recovery 只从已验证 checkpoint resume；不确定时 rollback 或 `MANUAL_BLOCKED`，不猜成功。

### 5.2 Owner Commit

`control-owner.json` 提交前必须同时满足：

1. Controller bundle 当前 revision/digest正确。
2. active runtime slot、entrypoint、CLI version/full file manifest正确。
3. bound SID/profile/HERMES_HOME 非 systemprofile。
4. desired config 已在用户上下文原子合并且 `hermes config check` 成功。
5. Controller User Task、Gateway Task principal/action/trigger/settings read-back一致。
6. Gateway `127.0.0.1:<configured-port>/health` healthy，进程 executable 属于 active runtime slot。
7. final user outbox/result digest 与原 request/client/desired digest 匹配。

Owner commit 与 transaction final result必须可恢复；任一失败恢复 previous owner，不保留 `pending` 假终态。

## 6. Artifact 与 Controller 安装

### 6.1 Controller Bundle

- Product package内包含 controller manifest v1：revision、文件相对路径、SHA-256、size、signer key id。
- Thin Bootstrap 在执行任何已安装 Controller 前验证 bundle；禁止从用户可写目录加载 module/script。
- 安装到新 immutable release，read-back全部文件后原子更新 `controller/current.json`。
- 保留一个 previous Controller release；当前 Controller失败时由 OPSI cache bootstrap回退。
- Controller key rotation 与 runtime Artifact key rotation分离。

### 6.2 Hermes Runtime Artifact v3

在 envelope v2 基础上增加：

- archive entry allowlist/full file manifest。
- 每个文件 path、size、SHA-256；拒绝 absolute/drive/UNC/`..`、symlink/reparse point escape。
- runtime kind、entrypoint、CLI version command、supported architecture。
- controller minimum/maximum compatible revision。

先解压到随机 staging，逐文件验证，再 move 到 immutable slot。禁止 overlay active slot。`runtime/active.json` 是唯一 active/previous SOT；所有 CLI resolver 从该文件读取 exact entrypoint/digest。

## 7. User-context Command Controller

### 7.1 Command Queue

需要用户上下文的操作：

```text
initialize-user
apply-config
start-gateway
restart-gateway
repair-l1
repair-l2
quiesce-gateway
verify-health
```

Machine Controller 写 canonical inbox command，绑定 request/client/SID/desired digest/deadline。User Controller 只消费自己 SID、未过期、digest正确的 command；输出 outbox后原子移动到 ack。duplicate幂等，tamper/wrong SID/poison command隔离到 quarantine。

### 7.2 Config Transport

- `PolicyService` 的 allowlisted keys canonicalize后以 bounded base64url payload + SHA-256 经 client-specific Product Property传输；不含 secret。
- `.opsiscript` 必须读取 payload/digest并交给 machine Controller落地 `desired/machine.json`；禁止 JSON command injection。
- SYSTEM 不写用户 HERMES_HOME。User Controller在绑定用户上下文合并 allowlisted config，保留非受管字段，运行 exact CLI `config check`。
- config failure恢复 previous user config，Gateway保持 previous healthy state，Result为 FAILED/rollback，而不是 CURRENT。

### 7.3 Gateway Control

- Task action使用 active runtime absolute entrypoint和显式 environment wrapper。
- HERMES_HOME从 SID ProfileList/approved override解析；profile、port、bind、autostart来自 desired state。
- bind在本版本只允许 loopback；端口冲突、错误 executable、错误 SID fail closed。
- restart/repair不允许回落到 SYSTEM `hermes gateway start/restart`。
- autostart=false时不注册 Gateway logon start，但手动 health语义必须明确为 STOPPED_EXPECTED。

## 8. Result、State 与服务端收敛

### 8.1 Result Relay v2

- machine和user phase都输出 lifecycle event，最终 Action Result绑定 transaction/desired/observed digest。
- status relay只发布未 ack outbox；服务端确认 parent result后，下一次 status返回 ack token并由 Endpoint归档。
- 设置 7-day retention、最大文件/command数量和 poison queue；不得无限重复旧 continuation。
- command execution success与endpoint health分离：Action可 SUCCEEDED，但 state health仍可 WARNING/OFFLINE；Rollout只按 TargetVerification规则推进。

### 8.2 Endpoint Controller State v2

`smc.opsi.endpoint-controller-state.v2` 至少包含：

- controller revision/manifest digest/integrity。
- transaction phase/open request/recovery status。
- real owner/previous owner/ownership revision。
- desired/observed/runtime/config/task digests和drift。
- active/previous runtime slot、CLI version/entrypoint。
- bound SID source（普通响应脱敏）、profile/HERMES_HOME validity。
- Gateway desired/running/port/executable/health。
- pending/failed/quarantined command count和last reconcile。

服务端 `/clients/{id}/state` 只返回fresh persisted Controller Evidence。ProductOnClient installed只能表示package coarse state，不能推断 owner、Gateway reachable或 HEALTHY。缺fresh state返回 UNKNOWN/stale，不构造假值。

## 9. Update、Rollback、Repair 与 Uninstall

### 9.1 Update

- Controller update与runtime update为独立transaction step。
- 新 Controller先安装并验证，再用于runtime update；compatibility不满足时禁止激活。
- 新 runtime进入immutable slot，用户config/Gateway healthy后才切commit；旧slot在观察/retention期保留。
- locked file不覆盖；旧 Gateway quiesce与新slot activation使用user command handoff。

### 9.2 Rollback

- Controller rollback由thin OPSI bootstrap执行；runtime/config/Gateway rollback由Controller journal执行。
- 恢复exact previous slot、entrypoint、config、task、owner和desired digest。
- rollback result必须重新验证Gateway executable/health和Work smoke evidence。
- rollback failure进入 MANUAL_BLOCKED + global Production freeze，不循环重试。

### 9.3 Repair

- L0：observe/reconcile only。
- L1：用户上下文 restart exact Gateway task。
- L2：CLI/config/task integrity repair + doctor + restart。
- L3+继续人工，Controller不得自行重装、迁移owner或删除用户数据。

### 9.4 Two-phase Uninstall

1. machine Controller创建 `quiesce-gateway` user command；用户在线时停止exact managed Gateway。
2. deadline内用户不在线时，禁用/删除受管Tasks，不终止未知进程；记录 residual process evidence。
3. 删除Controller/runtime/desired/managed config/tasks；保留用户 `.hermes`、Profiles、Memory、Sessions、Credentials、Workspace。
4. 恢复frozen previous owner；若previous为空则原子删除`hermes`键/owner文件，而不是保留`opsi`。
5. OPSI cache wrapper在Controller退出后执行self-cleanup，并保留最小tombstone/result直到服务端read-back。
6. final status证明tasks/managed files/owner已收敛；残留未知时UNINSTALL_BLOCKED，不写SUCCEEDED。

## 10. API、契约与 Product 演进

### 10.1 API

新增/调整：

```text
POST /api/v1/opsi/actions                         支持 reconcile-controller
GET  /api/v1/opsi/clients/{client_id}/controller
POST /api/v1/opsi/clients/{client_id}/controller/reconcile
GET  /api/v1/opsi/clients/{client_id}/state       只读 Controller Evidence v2
POST /api/v1/opsi/clients/{client_id}/state-refresh
```

- reconcile仍通过OPSI `custom` Action，不直连Endpoint。
- state-refresh创建status Action并返回request，不在HTTP请求内同步等待Endpoint。
- mutation需要Idempotency-Key、reason/change ticket、RBAC和client binding revision。
- `opsiControlApi`升至`1.6.0`；OpenAPI/Pydantic仍为SOT。

### 10.2 Contracts

- `endpoint-controller-manifest.schema.json` → Controller bundle/file integrity。
- `runtime-artifact-manifest.schema.json` → tolerant-reader v2，新producer envelope v3/full files。
- `endpoint-controller-state.schema.json` → observed state v2。
- `endpoint-command.schema.json` → machine/user command v1。
- `endpoint-transaction.schema.json` → journal v2。
- `action-result.schema.json`增加optional transaction/desired/observed/ack fields，保持v1 reader兼容。
- `Operation`增加`reconcile-controller`，旧Controller收到未知operation必须fail closed。

### 10.3 Product Revision 3

- `control.toml` package revision提升到3，新增`controller_revision`和bounded config payload transport property。
- setup/update/uninstall/custom `.opsiscript`只负责读取client-specific properties、调用thin bootstrap、转发exit/result。
- Thin bootstrap负责安装/验证/回退Controller；业务状态机从`.opsiscript`迁入已安装Controller。
- package smoke必须包含可执行Controller fixture，不能只做字符串断言。

## 11. 安全与可靠性

- Controller不监听端口，不存OPSI凭据，不向opsi-control主动连接。
- 所有Endpoint输入均来自client-specific Product Property并绑定property digest；不接受global default作为request identity。
- command/config不得包含secret；发现secret canary立即失败并redact。
- Controller/runtime/public key/active pointer/task action执行ACL和hash read-back。
- Windows user只能写自己outbox；SYSTEM只接受matching SID/request/digest/deadline的结果。
- named mutex、per-request journal、bounded retry、disk quota和retention防止并发破坏/磁盘膨胀。
- OPSI/Control/PostgreSQL离线不停止健康Gateway；Controller本地recovery不需要服务端在线。

## 12. 验收标准

### AC-01 Controller Persistence

真实`.opsi`安装后清理OPSI cache并reboot，Controller recovery/user tasks仍指向受信持久路径，manifest/ACL/digest read-back通过。

### AC-02 Clean Install End-to-End

一台Windows 10从ABSENT开始，经controller install、runtime verify/stage、user pending/logon、config、Gateway health、owner commit和Result relay最终READY；任一phase失败不写owner/HEALTHY。

### AC-03 Crash Recovery

在Controller install、runtime stage、active switch、user pending、config、Gateway start、owner commit各checkpoint强制终止/reboot；下一次reconcile确定性resume或rollback且不重复副作用。

### AC-04 User-context Commands

apply-config/restart/repair/update quiesce全部在绑定SID上下文执行。SYSTEM fallback、wrong SID、systemprofile、wrong profile/port均fail closed。

### AC-05 Config Transport

Control policy keys经Property→thin bootstrap→desired→user config完整相关；payload/digest/revision tamper失败；用户非受管配置保留，失败恢复previous config。

### AC-06 Runtime Integrity and Activation

archive traversal、extra/missing/tampered file、wrong entrypoint/version/controller compatibility全部在activation前失败。update不overlay旧slot，所有动作解析active manifest entrypoint。

### AC-07 State Truth

owner pending/absent、Gateway offline、task tamper、stale evidence、open transaction在Endpoint State v2和服务端API中如实呈现；Product installed不再等价HEALTHY。

### AC-08 Result Ack and Retention

duplicate/late/wrong SID/wrong parent/tampered outbox不会重复终结Action；ack后归档，7天/数量上限清理，poison command可诊断。

### AC-09 Update/Rollback/Repair

Controller-only update、runtime update、config update和L0-L2 repair通过；每个失败点恢复exact previous runtime/config/task/owner并验证Gateway/Work。

### AC-10 Uninstall/Reinstall

在线/离线用户两种场景完成two-phase uninstall；Tasks/Controller/runtime/owner清理，用户数据保留，随后可从ABSENT重新安装。残留未知进程时不假成功。

### AC-11 Offline Continuity

OPSI Server、opsi-control或PostgreSQL停机时，已健康Gateway/Work继续可用；reboot后本地Controller/Gateway Tasks可在无Control连接时恢复。

### AC-12 Production Gate

缺`v1.6-endpoint-controller proven/GO`时stable promotion、Production start和next Ring保持412；test fixture/env/body不能绕过。

## 13. 自动化与人工验证

自动化必须从静态字符串测试升级为Controller行为测试：

```text
PowerShell 5.1 Windows 10 behavior tests with temp ProgramData root
Mocked ScheduledTask/SID/ProfileList/ACL/process/health tests
Controller transaction crash-point and replay matrix
Artifact v3 archive/file negative vectors
Machine/User command queue and result ack tests
Control Action→Property→Controller State fixture tests
API 1.6/OpenAPI/Schema tolerant-reader tests
OPSI Control PostgreSQL restart/migration tests
Work Direct Hermes availability regression
Salt/Runtime isolation diff gates
```

人工Windows 10矩阵：

1. Clean endpoint、无Hermes/owner/task。
2. 绑定用户未登录安装，随后登录完成。
3. 全Action：status、apply-config、restart、repair L0-L2、diagnose/collect-log。
4. Controller update、Hermes runtime update、失败rollback、成功rollback。
5. setup/user phase/reboot等crash recovery。
6. OPSI/Control offline + reboot + Work reconnect。
7. 在线用户uninstall、离线用户uninstall、reinstall。
8. Artifact/config/task/outbox tamper negative cases。

Windows 11不新增独立人工用例，也不新增拒绝逻辑。

## 14. 发布阶段

```text
Phase 0  Truth Freeze + ADR-035 + Lifecycle Red Tests
Phase 1  Persistent Controller Bundle + Integrity/ACL/Atomic Upgrade
Phase 2  Desired/Observed State + Mutex + Transaction Journal v2/Recovery
Phase 3  Immutable Hermes Runtime Slot + Artifact Envelope v3
Phase 4  SID User Command Queue + Config/Gateway Controller
Phase 5  Thin OPSI Bootstrap + Complete Property/Action Transport
Phase 6  State v2 + Result Ack/Retention + Server Truth API
Phase 7  Update/Rollback/Repair + Two-phase Uninstall/Owner Restore
Phase 8  API 1.6/Product Revision 3/Contracts/Behavior CI/Runbooks
Phase 9  Windows 10 Install-to-Control Live Proof（人工）
Phase 10 v1.6 Endpoint Controller Go/No-Go + v1.5 Re-entry prerequisite
```

Engineering PR可在Live Gate未通过时合并，但Production保持冻结。Phase 9/10只能由Operator Evidence推进。

## 15. Definition of Done

- [ ] Controller bundle持久安装、版本化、完整性/ACL验证、atomic activate/rollback。
- [ ] OPSI cache清理/reboot后Controller和Tasks仍可运行。
- [ ] per-request journal v2、endpoint mutex、checkpoint resume/rollback真实生效。
- [ ] Controller/runtime版本分离，runtime immutable slot无overlay/stale file。
- [ ] Artifact v3验证完整archive/file manifest、entrypoint/version/compatibility。
- [ ] setup/update/config/restart/repair/uninstall的用户操作全部经SID command queue，无SYSTEM Gateway fallback。
- [ ] config payload/digest/revision从Control到用户Hermes config完整相关并可rollback。
- [ ] Gateway Task绑定exact CLI/HERMES_HOME/profile/bind/port/autostart并read-back。
- [ ] owner只在READY提交；failure/rollback/uninstall恢复frozen previous owner。
- [ ] continuation/result具备ack、retention、poison/tamper/replay处理。
- [ ] Endpoint State v2与服务端API不再根据Product installed构造HEALTHY。
- [ ] Controller/runtime/config/task/Gateway update/rollback/reboot recovery行为测试通过。
- [ ] two-phase uninstall保留用户数据并可clean reinstall。
- [ ] API 1.6.0、Product revision 3、Schema/OpenAPI/behavior tests/migration通过。
- [ ] Work Direct Hermes、offline continuity、Salt/Runtime isolation无回归。
- [ ] 一台Windows 10完成真实`.opsi` install-to-control全矩阵并由Operator签为`proven/GO`。
- [ ] 缺v1.6 Gate时v1.5 Production Re-entry继续冻结。
