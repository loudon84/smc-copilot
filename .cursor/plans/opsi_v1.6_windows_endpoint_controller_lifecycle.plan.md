---
name: OPSI v1.6 Windows Endpoint Controller + Hermes Agent Lifecycle
overview: 基于52d9679已实现的v1.5服务端Production Re-entry能力，停止继续扩大Fleet，先把当前从OPSI cache运行的短生命周期Adapter重构为安装在ProgramData、无监听端口、由opsiclientd/SYSTEM恢复任务/绑定用户任务触发的可恢复Endpoint Controller；完成Controller自安装、Hermes runtime immutable slot、SID用户命令、config/Gateway控制、State/Result真值、crash recovery、update/rollback和two-phase uninstall的全过程，并在Windows 10真实.opsi上人工证明。
todos:
  - id: opsi-v16-phase0-truth-red-tests
    content: "Phase 0: 固化v1.5 engineering与Live NO-GO真值，新增ADR-035和生命周期red tests，证明当前缺持久Controller、journal不恢复、config payload未落地、SYSTEM用户命令、假state和owner残留"
    status: completed
  - id: opsi-v16-phase1-controller-bundle
    content: "Phase 1: 实现签名Controller manifest、ProgramData immutable releases、ACL/file digest、current pointer、thin OPSI bootstrap安装/验证/回退和SYSTEM recovery task"
    status: completed
  - id: opsi-v16-phase2-state-transaction
    content: "Phase 2: 实现desired/observed/ownership state、endpoint named mutex、per-request transaction journal v2、checkpoint/CAS、startup/next-action resume或deterministic rollback"
    status: completed
  - id: opsi-v16-phase3-runtime-slots
    content: "Phase 3: 升级Artifact envelope v3/full file manifest和安全展开，安装Hermes Agent到immutable runtime slot，以active/previous pointer激活并从manifest解析所有CLI"
    status: completed
  - id: opsi-v16-phase4-user-controller
    content: "Phase 4: 实现SID-scoped inbox/outbox/ack、User Controller和Gateway task，使config/start/restart/repair/quiesce只在绑定用户上下文执行并绑定HERMES_HOME/profile/bind/port/autostart"
    status: completed
  - id: opsi-v16-phase5-opsi-transport
    content: "Phase 5: 将setup/update/uninstall/custom收敛为thin bootstrap，补齐config payload/digest、binding/profile/Gateway参数和reconcile-controller的client-specific Property→Controller transport/read-back"
    status: completed
  - id: opsi-v16-phase6-state-result
    content: "Phase 6: 定义Endpoint Controller State v2和lifecycle Result v2，完成continuation ack/retention/quarantine，服务端state只消费fresh Controller Evidence并移除Product installed=HEALTHY假值"
    status: completed
  - id: opsi-v16-phase7-lifecycle-closure
    content: "Phase 7: 完成Controller/runtime/config update、exact rollback、L0-L2 repair、reboot/offline recovery和two-phase uninstall/self-cleanup/previous owner restore/clean reinstall"
    status: completed
  - id: opsi-v16-phase8-contracts-ci
    content: "Phase 8: 升级opsiControlApi 1.6.0、Product revision 3、Schemas/OpenAPI/fixtures，增加PowerShell 5.1行为、crash matrix、artifact negative、PostgreSQL restart、Work/isolation与Runbooks"
    status: completed
  - id: opsi-v16-phase9-live-win10
    content: "Phase 9（人工门禁）: 在真实OPSI 4.3和一台Clean Windows 10执行真实.opsi、未登录→登录、全Action、controller/runtime update/rollback、crash/reboot/offline、在线/离线uninstall与reinstall；Cursor不得自动完成"
    status: pending
  - id: opsi-v16-phase10-gate
    content: "Phase 10（人工门禁）: 三方复核Evidence并签署v1.6-endpoint-controller Go/No-Go；未GO时v1.5 stable/start/next Ring继续冻结"
    status: pending
isProject: false
---

# Cursor Implementation Plan — OPSI v1.6

## 1. 执行依据

- PRD：[`docs/opsi/PRD-OPSI-v1.6.md`](../../docs/opsi/PRD-OPSI-v1.6.md)
- v1.5 PRD：[`docs/opsi/PRD-OPSI-v1.5.md`](../../docs/opsi/PRD-OPSI-v1.5.md)
- v1.5 Evidence：[`docs/opsi/evidence/v1.5/STATUS.md`](../../docs/opsi/evidence/v1.5/STATUS.md)
- OPSI Provider：[`docs/adr/ADR-031-opsi-parallel-endpoint-control-plane.md`](../../docs/adr/ADR-031-opsi-parallel-endpoint-control-plane.md)
- Runtime Trust：[`docs/adr/ADR-033-opsi-real-lab-runtime-trust.md`](../../docs/adr/ADR-033-opsi-real-lab-runtime-trust.md)
- Production Re-entry：[`docs/adr/ADR-034-opsi-production-reentry-authoritative-rings.md`](../../docs/adr/ADR-034-opsi-production-reentry-authoritative-rings.md)
- Machine/User：[`docs/opsi/decisions/machine-user-bootstrap.md`](../../docs/opsi/decisions/machine-user-bootstrap.md)
- Result Transport：[`docs/opsi/decisions/action-result-transport.md`](../../docs/opsi/decisions/action-result-transport.md)
- Contract Flow：[`docs/architecture/contract-flow.md`](../../docs/architecture/contract-flow.md)
- 基线分支：`opsi/prd-v1.0`
- 规划基线：`52d9679`

开始实现前读取：

- [`AGENTS.md`](../../AGENTS.md)
- [`apps/work/AGENTS.md`](../../apps/work/AGENTS.md)（仅Direct Hermes回归）
- [`contracts/opsi`](../../contracts/opsi)
- [`infra/opsi/products/smc-hermes-agent`](../../infra/opsi/products/smc-hermes-agent)
- [`services/opsi-control`](../../services/opsi-control)

建议实现分支：`opsi/prd-v1.6`。

固定边界：

- 不修改`infra/salt/**`、`services/salt-control/**`、`contracts/salt-control-api/**`。
- 不向`services/runtime/**`、`contracts/runtime-api/**`增加OPSI能力。
- Work保持Direct Hermes `localhost:8642`，不新增OPSI UI/API/credentials。
- opsi-control仍只连接opsiconfd JSON-RPC；不得直连Endpoint/Gateway/Work。
- Endpoint Controller不监听端口、不常驻为Windows Service、不承载Chat；它是按需运行的durable reconcile engine。
- Windows Endpoint SQLite、OPSI Server自有数据库不变；opsi-control继续使用公司内部既有PostgreSQL隔离schema。
- Windows 10是人工验证矩阵；不新增Windows 11独立用例或拒绝分支。
- Phase 9/10只有Operator可完成；Cursor/CI/fixture不能写`proven/GO`。

## 2. 基线与必须先失败的测试

当前工程门禁：

```text
opsi-control pytest       91 passed / 1 skipped
ruff / format             passed
infra/opsi pytest         12 passed
Pester                    11 passed
contracts:check           passed
Live Endpoint Controller  not_proven / NO-GO
```

先为以下缺口写行为red tests，不得只检查字符串：

1. 清理OPSI cache后Bootstrap Task目标脚本不存在。
2. Start transaction未捕获previous owner/version，Resume不执行恢复，pending user success不commit journal。
3. update overlay `current`留下旧文件，later resolver忽略manifest entrypoint。
4. `config_payload/config_digest`虽由服务端写Property，但custom.opsiscript不读取，incoming config不存在。
5. apply-config/restart/repair在SYSTEM上下文执行且custom未传SID/profile。
6. Gateway Task缺HERMES_HOME/profile/bind/port；user health硬编码8642。
7. Endpoint status和服务端state构造`owner=opsi/HEALTHY`。
8. continuation不ack/retention，重复relay。
9. uninstall不恢复owner，Controller无法安全self-delete。

任何red test未关闭时不得创建`v1.6-endpoint-controller` GO。

## 3. Phase 0 — Truth Freeze 与 ADR-035

新增`ADR-035-opsi-windows-endpoint-controller.md`，冻结：

- Controller是安装在ProgramData的短生命周期reconcile engine，不是Service/listener。
- opsiclientd、SYSTEM recovery task、SID user task三类触发器。
- Controller/runtime独立版本与immutable release/slot。
- desired/observed/transaction journal v2和owner commit条件。
- Machine不写HERMES_HOME，不运行用户Gateway命令。
- Result ack/state truth/two-phase uninstall。
- `v1.6-endpoint-controller`为Production新增强制Gate。

新增`docs/opsi/evidence/v1.6/STATUS.md`，初始为`Engineering: not_implemented / Live: not_proven / Decision: NO-GO`。

## 4. Phase 1 — Persistent Controller Bundle

### 4.1 Controller Manifest

新增Controller bundle SOT，至少包含：

```text
schema/revision/platform/architecture
files[path,size,sha256]
entrypoint/recoveryEntrypoint/userEntrypoint
signerKeyId/minProductRevision
canonicalDigest/signature
```

- release build签名；smoke使用TEST-ONLY key且不覆盖source key。
- Thin Bootstrap从OPSI cache运行，只负责验证/安装/切换/回退Controller。
- 所有relative path做containment；拒绝absolute/UNC/drive/../reparse escape。

### 4.2 Install/Upgrade

- staging到`controller/releases/<revision>-<digest>`，逐文件hash/read-back。
- ACL：SYSTEM/Administrators write，Users read/execute only；trusted key/active pointer不可被用户写。
- atomic更新`controller/current.json`并保留previous release。
- 注册`SMC-Hermes-Controller-Recover` SYSTEM startup task，action使用exact installed path。
- OPSI cache删除和reboot行为测试证明Controller仍可运行。

## 5. Phase 2 — State、Mutex 与 Transaction v2

### 5.1 State SOT

实现：

```text
desired/machine.json
observed/endpoint.json
state/ownership.json
state/tasks.json
transactions/<requestId>.json
```

- desired由client-specific Property canonical payload产生。
- observed只能由本地read-back产生。
- ownership保存previous/current/pending owner和revision。
- 每个mutation持有global named mutex；status/diagnose只读。

### 5.2 Journal v2

Phase checkpoints：controller verified/installed、runtime verified/staged/activated、user pending/configured、gateway healthy、owner committed、finalized。

- journal记录input/output digest、attempt、context、deadline和recovery policy。
- same request/same digest幂等；different digest conflict。
- open mutation阻止后续mutation覆盖。
- Controller startup/next action扫描open journals，从verified checkpoint resume；不可证明时rollback或MANUAL_BLOCKED。
- user outbox完成原machine transaction并commit同一request。

## 6. Phase 3 — Immutable Hermes Runtime

### 6.1 Artifact Envelope v3

- 扩展runtime manifest为full file list/path/size/hash、entrypoint、CLI version command、controller compatibility。
- 先验证archive digest/signature，再安全展开到随机staging，最后逐文件验证。
- 拒绝extra/missing/tampered file、path traversal、symlink/reparse和unsupported arch。

### 6.2 Runtime Slots

- 安装到`runtime/versions/<version>-<digest>`，永不overlay active slot。
- `runtime/active.json`保存active/previous slot和manifest digest。
- 所有status/config/gateway/doctor resolver读取active manifest exact entrypoint/hash，不再默认`hermes.exe`。
- active switch、rollback、locked files、disk-full、crash checkpoints行为测试。

## 7. Phase 4 — SID User Controller

### 7.1 Task与Command Queue

- `SMC-Hermes-Controller-User-{SID}`消费`commands/<SID>/inbox`。
- command绑定request/client/SID/desired digest/deadline/operation；wrong/tamper/expired进入quarantine。
- outbox写final digest，SYSTEM status relay后ack/archive；duplicate幂等。
- 用户只可写自己SID outbox，不能改inbox/desired/controller/runtime。

### 7.2 Config/Gateway

- SYSTEM仅保存desired config；User Controller合并allowlisted fields到真实HERMES_HOME。
- config check失败恢复previous config。
- Gateway Task使用exact active CLI、HERMES_HOME、managed profile、loopback bind、configured port、autostart/restart settings。
- registration后read-backprincipal/action/trigger/settings与task digest。
- user health同时验证HTTP、port、process executable active slot和config revision。
- restart/repair/quiesce禁止SYSTEM CLI fallback。

## 8. Phase 5 — Thin OPSI Bootstrap 与 Transport

### 8.1 Product Scripts

setup/update/uninstall/custom `.opsiscript`收敛为：

1. 读取request/client/user/config/controller/runtime Properties。
2. 校验client-specific value存在，禁止request identity使用global default。
3. 调用thin bootstrap安装/验证Controller。
4. 将canonical desired command交给Controller。
5. 输出bounded exit/result marker。

### 8.2 Config Property

- Policy canonical keys编码为bounded base64url，不把raw JSON直接拼接为PowerShell表达式。
- Property包含payload/digest/revision；Endpoint decode后recompute digest。
- custom.opsiscript必须读取并传输payload/digest；不再依赖预先存在的`incoming.json`。
- config secrets/key names fail closed；最大payload和Product Property行为在真实OPSI fixture测试。

### 8.3 Operation

- 新增`reconcile-controller` custom operation。
- setup/update可返回USER_CONTEXT_PENDING；apply-config/restart/repair/uninstall也可进入用户pending，而不是SYSTEM假成功。
- 每个operation定义deadline、retry、cancel和terminal status。

## 9. Phase 6 — State v2、Result Ack 与 Server Truth

### 9.1 Endpoint State

实现`endpoint-controller-state.v2`，包含Controller/transaction/owner/runtime/config/tasks/Gateway/queue/recovery/drift。

- Endpoint status读取真实owner file/pointer/task/process/health；不得硬编码opsi。
- Action command success与Endpoint health分字段表达。
- stale/open transaction/pending user/expected stop有独立状态。

### 9.2 Relay/Ack

- lifecycle event/result绑定transaction/desired/observed digest和sequence。
- status只relay未ack记录；Control parent result终结后返回ack token。
- Endpoint归档ack，7天/数量/bytes retention，poison queue可诊断。
- duplicate/late/wrong parent/client/SID/digest/reorder/reboot矩阵。

### 9.3 Control API

- Inventory Collector解析Controller State Evidence并持久化。
- `/clients/{id}/state`移除Product installed→HEALTHY逻辑；无fresh evidence返回UNKNOWN/stale。
- `/clients/{id}/controller`返回脱敏Controller详情。
- state-refresh异步创建status Action，不同步直连Endpoint。

## 10. Phase 7 — Lifecycle Closure

### 10.1 Update/Rollback

- Controller-only和runtime-only update分别测试。
- compatibility gate先于activation。
- user quiesce→slot switch→config/task→health→commit。
- failure恢复exact previousController/runtime/config/task/owner。
- rollback failure为MANUAL_BLOCKED并触发Production freeze。

### 10.2 Repair

- L0 reconcile only。
- L1 SID user restart exact task。
- L2 integrity/config/task repair + doctor + restart。
- L3+返回MANUAL_ACTION_REQUIRED，不自动重装/迁移/删用户数据。

### 10.3 Two-phase Uninstall

- 在线用户先quiesce exact Gateway；离线用户禁用/删除Tasks并记录residual evidence。
- 删除Controller/runtime/desired/managed files，但保留用户`.hermes`等数据。
- 恢复previous owner或删除空owner key/file。
- thin OPSI wrapper在Controller退出后self-cleanup，保留tombstone/result直至read-back。
- unknown residual → UNINSTALL_BLOCKED；不得写SUCCEEDED。
- clean reinstall从ABSENT重新建立全链。

## 11. Phase 8 — API 1.6、Product 3 与自动化

### 11.1 Contracts/API

- `opsiControlApi=1.6.0`。
- controller manifest、runtime artifact v3、controller state v2、command v1、transaction v2、result v2 optional fields。
- Operation增加reconcile-controller，consumer tolerant-reader fixtures。
- 如果需要持久化Controller Evidence/ack，新增`0007_v16_endpoint_controller` migration和索引。

### 11.2 Product

- package revision 3、controller revision property、config payload base64url property。
- release builder产出真实Controller bundle与runtime artifact；`.opsi`仍在Linux用opsi-makepackage。
- smoke Controller具备可执行fixture，不允许README-only。

### 11.3 Automated Gates

```text
cd services/opsi-control
uv run pytest -q
uv run ruff check .
uv run ruff format --check .
uv run alembic upgrade head / downgrade -1 / upgrade head

python -m pytest infra/opsi/tests -q
Invoke-Pester infra/opsi/tests/SmcHermesAgent.Tests.ps1
npm run contracts:check
python scripts/check-opsi-isolation.py --base <merge-base>
cd apps/work && lat check && npm run typecheck && npm test && npm run build
```

Pester必须实际执行fake ProgramData行为和mocked task/SID/health/crash tests；静态字符串断言不能作为主要证明。

新增Runbooks：Controller package/build、clean install、user pending、config transport、crash recovery、update/rollback、offline continuity、two-phase uninstall、NO-GO。

## 12. Phase 9 — Windows 10 Live Proof（人工）

在真实OPSI 4.3、真实`.opsi`和一台Clean Windows 10执行：

1. ABSENT baseline、无owner/task/controller/runtime。
2. 用户未登录setup → Controller/runtime stage → USER_CONTEXT_PENDING。
3. 清理OPSI cache并reboot，验证installed Controller recovery。
4. 用户登录 → config/Gateway/health → owner commit → parent Result final。
5. status/apply-config/restart/repair L0-L2/diagnose/collect-log/reconcile-controller。
6. Controller-only update、runtime update、config update和exact rollback。
7. 每个transaction checkpoint crash/reboot恢复抽样。
8. OPSI/Control/PostgreSQL offline，Gateway/Work持续并在reboot后本地恢复。
9. 在线用户uninstall、reinstall、离线用户uninstall；验证owner恢复和用户数据保留。
10. Artifact/config/task/outbox tamper fail closed。

归档Evidence：controller/runtime manifests、journal timeline、task/process/port identity、state/result digests、owner transitions、Work reconnect、uninstall/reinstall。

## 13. Phase 10 — Gate 与发布

- Release Owner、Endpoint Ops、Security Owner复核同一Evidence digest。
- 只有Operator可签`v1.6-endpoint-controller=proven/GO`。
- service/Cursor/CI最多写`implemented/verified`。
- v1.5 Re-entry Gate必须同时引用v1.6 Controller GO；缺任一Gate，stable/start/next Ring返回412。
- v1.6不自动授权51～500/3～8 Depot或Windows 11独立认证。

## 14. 建议PR拆分

1. `test(opsi): add endpoint controller lifecycle red gates`
2. `feat(opsi): install versioned endpoint controller bundle`
3. `feat(opsi): add durable desired observed transaction state`
4. `feat(opsi): activate immutable hermes runtime slots`
5. `feat(opsi): add sid user command and gateway controller`
6. `fix(opsi): complete property config and action transport`
7. `feat(opsi-control): ingest controller state and ack results`
8. `fix(opsi): close update rollback repair uninstall lifecycle`
9. `feat(opsi-control): add api 1.6 controller contracts`
10. `test(opsi): add windows controller behavior and crash matrix`
11. `docs(opsi): add v1.6 controller runbooks`
12. `test(opsi): archive windows 10 install-to-control evidence`（Operator PR）

依赖顺序：Controller bundle→transaction SOT→runtime slot→user commands→transport→state/result→lifecycle cleanup。工程PR不包含Operator GO。

## 15. Definition of Done

- [ ] Controller bundle可在OPSI cache删除/reboot后持续运行且完整性/ACL正确。
- [ ] Controller/runtime独立版本、immutable release/slot、atomic active/previous pointer。
- [ ] transaction journal v2真实resume/rollback，不被status/custom覆盖。
- [ ] all user operations使用SID Controller，无SYSTEM Gateway/config fallback。
- [ ] config payload从Policy Property到用户config完整相关、验证并可rollback。
- [ ] Gateway Task exact CLI/HERMES_HOME/profile/bind/port/autostart/integrity通过。
- [ ] owner只在full READY提交，rollback/uninstall恢复previous owner。
- [ ] Endpoint State v2/Control API不构造opsi/HEALTHY假值。
- [ ] Result relay具备ack/retention/quarantine/replay处理。
- [ ] Controller/runtime/config/task update/rollback与crash/reboot/offline recovery通过。
- [ ] two-phase uninstall和clean reinstall通过且用户数据保留。
- [ ] API 1.6.0、Product revision 3、Schemas/Migration/behavior CI通过。
- [ ] Work Direct Hermes和Salt/Runtime isolation无回归。
- [ ] 一台Windows 10真实install-to-control全矩阵由Operator签署proven/GO。
- [ ] v1.6 GO前v1.5 Production mutation保持冻结。
