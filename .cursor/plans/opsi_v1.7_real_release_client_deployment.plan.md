---
name: OPSI v1.7 Real Hermes Release + Windows Client Deployment
overview: 基于a448eb4已实现的v1.6 Endpoint Controller工程骨架，关闭真实Hermes Release Builder、Product/Controller/Runtime三维版本、Controller签名安装、自包含Windows验签、installed-controller-only dispatch、Gateway HERMES_HOME和真实.opsi/Depot/Windows 10证据链；不重复实现v1.6结构，不新增Windows 11独立验证，也不以本计划授权≤100台Production Rollout。
todos:
  - id: opsi-v17-phase0-truth-red-gates
    content: "Phase 0: 冻结a448eb4代码与v1.6 Live NO-GO真值，新增ADR-036、v1.7 Evidence skeleton和行为red tests，覆盖release builder空壳、版本误绑定、假Controller digest、Python依赖、cache mutation与Gateway HERMES_HOME未注入"
    status: completed
  - id: opsi-v17-phase1-release-contract-version-model
    content: "Phase 1: 分离Product 1.7.0/package 1、Controller revision与Hermes exact version，新增signed product-release.v1 schema/API 1.7 release view，并把Action preflight从ProductVersion=HermesVersion改为release catalog membership+compatibility"
    status: completed
  - id: opsi-v17-phase2-runtime-release-builder
    content: "Phase 2: 实现production Runtime v3 builder/external signing/read-back，强化duplicate/case collision/path/reparse/files/entrypoint/compatibility和JSON Schema fail-closed，不生成生产私钥、不修改source artifacts"
    status: completed
  - id: opsi-v17-phase3-controller-verifier
    content: "Phase 3: 实现Controller canonical manifest/full file verification、external signing、self-contained Windows Ed25519 verifier/pinned digest、staging/ACL/read-back/atomic current+previous和verified rollback"
    status: completed
  - id: opsi-v17-phase4-deterministic-opsi-build
    content: "Phase 4: 实现独立deterministic Product staging、signed release index、secret/undeclared-file scan、checksums/provenance/SBOM与Linux opsi-makepackage build；CI build-only，禁止自动publish"
    status: completed
  - id: opsi-v17-phase5-installed-controller-dispatch
    content: "Phase 5: 将OPSI cache Adapter收敛为request validation+trust bootstrap+installed dispatch，迁移runtime/config/health/transaction/uninstall依赖到Controller release，证明删除fake cache/reboot后mutation/status/recovery不引用ScriptPath"
    status: completed
  - id: opsi-v17-phase6-gateway-runtime-binding
    content: "Phase 6: 新增Start-SmcHermesGateway wrapper并显式注入HERMES_HOME，Task绑定SID/exact active CLI/profile/bind/port/restart policy，read-back desired=observed=process identity；补齐active entrypoint与rollback commit point"
    status: completed
  - id: opsi-v17-phase7-depot-release-control
    content: "Phase 7: 实现Operator Depot publish/read-back runbook、release attestation persistence、Product/Controller/Runtime digest到Action/Result/State关联和v1.7-client-deployment-release Gate；smoke/fixture不得满足Live Gate"
    status: completed
  - id: opsi-v17-phase8-automated-runbooks
    content: "Phase 8: 完成pytest/Pester/PowerShell 5.1 supply-chain negative、cache/reboot/update/rollback/uninstall行为、PostgreSQL migration cycle、contracts/isolation/Work Direct Hermes回归及Release/Depot/Windows证据runbooks"
    status: completed
  - id: opsi-v17-phase9-live-win10
    content: "Phase 9（人工门禁）: 用真实Hermes ZIP、外部签名、真实.opsi、OPSI 4.3和Windows 10执行W10-01～W10-05 Fresh/User Pending/Update-Rollback/Cache-Reboot-Offline/Tamper-Uninstall-Reinstall场景；Cursor不得自动完成"
    status: pending
  - id: opsi-v17-phase10-gate
    content: "Phase 10（人工门禁）: Release Owner、Endpoint Ops、Security Owner复核同一Evidence manifest并签署v1.7-client-deployment-release Go/No-Go；GO仍需回到v1.5 Re-entry/Ring流程，不自动授权≤100 Production"
    status: pending
isProject: false
---

# Cursor Implementation Plan — OPSI v1.7

## 1. 执行依据

- PRD：[`docs/opsi/PRD-OPSI-v1.7.md`](../../docs/opsi/PRD-OPSI-v1.7.md)
- v1.6 PRD：[`docs/opsi/PRD-OPSI-v1.6.md`](../../docs/opsi/PRD-OPSI-v1.6.md)
- v1.6 Evidence：[`docs/opsi/evidence/v1.6/STATUS.md`](../../docs/opsi/evidence/v1.6/STATUS.md)
- ADR-031：[`docs/adr/ADR-031-opsi-parallel-endpoint-control-plane.md`](../../docs/adr/ADR-031-opsi-parallel-endpoint-control-plane.md)
- ADR-035：[`docs/adr/ADR-035-opsi-windows-endpoint-controller.md`](../../docs/adr/ADR-035-opsi-windows-endpoint-controller.md)
- Contract Flow：[`docs/architecture/contract-flow.md`](../../docs/architecture/contract-flow.md)
- 基线分支：`opsi/prd-v1.0`
- 规划基线：`a448eb4aca963024771335de1e37fd0053b438c3`
- 建议实现分支：`opsi/prd-v1.7`

实现前必须读取根 `AGENTS.md`、`apps/work/AGENTS.md`（仅 Direct Hermes 回归）、`contracts/opsi/**`、`docs/opsi/**`、Product packaging/controller/scripts 和 `services/opsi-control` contracts/actions/releases。

固定边界：

- 不修改 Salt 或 Runtime Control Plane；Work 不新增 OPSI 能力。
- opsi-control 只连接 opsiconfd JSON-RPC；公司内部既有 PostgreSQL 使用独立 schema，不改变 OPSI Server 数据库。
- Endpoint Controller 无 listener/service/Chat，仍是短生命周期 reconcile engine。
- Live 是 Windows 10-only；不创建 Windows 11 独立用例/拒绝逻辑。
- Phase 9/10 只有 Operator 可完成；Cursor/CI 不写 `proven/GO`。
- 不在本版实现或授权新的 `2/10/30/≤100` Rollout；后续沿用 v1.5 Re-entry/Ring。

## 2. 基线与先失败测试

当前基线：

```text
opsi-control pytest       96 passed / 1 skipped
ruff / format             passed
infra/opsi pytest         24 passed
Product Pester            13 passed
contracts:check           passed
v1.6 Windows 10 Live      not_proven / NO-GO
```

先写行为测试证明以下缺口，不能只做字符串搜索：

1. `build_release` 只复制 ZIP，不能形成正式 envelope/stage/`.opsi`。
2. Depot Product `productVersion` 被错误要求等于 `hermesVersion`。
3. Controller digest 是 `sha256(revision)`；Controller manifest tamper 不阻止 pointer。
4. Clean Windows fixture 无 Python 时 runtime signature verification 失败。
5. Controller 安装后 setup/update/status 仍从 fake Product Cache 执行；删除 cache 即失败。
6. Gateway Task manifest 写了 HERMES_HOME，但实际 Action 没有设置环境变量。
7. Runtime/controller manifest duplicate/path/reparse/schema/compatibility negative cases未 fail closed。

## 3. Phase 0 — Truth Freeze / ADR-036

- 将 v1.6 PRD状态改为 Engineering implemented；保留 Live NO-GO。
- 新增 ADR-036，冻结 Release trust root、self-contained verifier、三维版本、installed-controller-only dispatch、build/publish separation 与 v1.7 Gate。
- 新增 `docs/opsi/evidence/v1.7/STATUS.md`，初始 `Engineering: not_implemented / Windows 10: not_proven / Decision: NO-GO`。
- 为上述七类缺口增加 red tests，记录当前失败证据。

## 4. Phase 1 — Version Model / Release Contract / API 1.7

### 4.1 Product model

- `control.toml`: Product `1.7.0`, package `1`; `hermes_version`仍是 exact runtime property；Controller revision独立单调递增。
- 修正 `action_dispatcher._require_product`、preflight、rollout snapshot/attestation 中 Product与Runtime混用。
- Action所需的是 exact Product release + release catalog内 exact Hermes runtime，不是同一版本号。

### 4.2 Contract

- 新增 `product-release.schema.json` 与 signature/envelope；绑定 Product/package、Controller、Runtime(s)、verifier、source/build identity。
- 升级 `contracts/version.json`、generated OpenAPI与 tolerant-reader fixtures 到 `opsiControlApi 1.7.0`。
- 增加 release view/read-back API model；Action/Result/Controller State 保存 release index/controller/runtime manifest digest。
- 如需持久化 release/Depot verification，新增 `0008_v17_product_release` migration、unique constraints 与 Alembic cycle test。

## 5. Phase 2 — Production Runtime Builder

在 `infra/opsi/products/smc-hermes-agent/packaging/` 中重构为清晰阶段，可保留单 CLI，但至少分离：runtime envelope、controller envelope、release stage、OPSI build。

- 输入必须指定 Hermes ZIP/version/signing provider；禁止 `latest` 与生产 key autogeneration。
- 生成 Runtime v3 manifest/full files/archive+CLI digest/signature，立即使用 public key回验。
- 强化 `artifact_v3.py` 与 schema：duplicate normalized/case-fold collision、absolute/drive/UNC/`..`、symlink/reparse、extra/missing、entrypoint、arch、compatibility。
- 明确空文件规则和 zip bomb/总 bytes/file count上限。
- smoke继续使用 TEST-ONLY key、输出 `.smoke.zip`，绝不满足正式 release/Gate。

## 6. Phase 3 — Controller Builder / Endpoint Verifier

- 修正 `controller_manifest.py` canonical digest算法并在verify时重算。
- manifest signature在生产为required；验证exact file set/path/size/hash、entrypoint/recovery/user entrypoint、min Product revision与duplicate/reparse。
- 构建 self-contained `smc-artifact-verify.exe`（Windows amd64），统一验证 release index、Controller与Runtime Ed25519 envelopes。
- thin bootstrap在执行 verifier前先比对 release index/pinned bootstrap digest；不得使用系统 Python/PATH/online package install。
- Controller安装使用random staging、ACL apply/read-back、atomic directory/current pointer；保留 verified previous，失败回滚。
- 移除 `sha256(controller_revision)` 与 `Get-FileHash | Out-Null` 假验证。

## 7. Phase 4 — Deterministic Stage / Real `.opsi`

- 新 staging directory，不修改 source `CLIENT_DATA/artifacts`/keys。
- stage只包含 control、thin bootstrap、verified Controller/runtime/verifier/public keys、release index与声明文件。
- 扫描 private key、credential、secret与undeclared file；build log不打印敏感 signing reference。
- 生成 `.opsi` SHA256、file inventory、source/build provenance与 CycloneDX SBOM（或仓库统一SBOM格式）。
- Linux `opsi-makepackage` 只接受 `stage-release --verify` 成功目录；输出路径与文件名固定。
- build job禁止 `opsi-package-manager`；publish是独立Operator步骤。

## 8. Phase 5 — Thin Bootstrap / Installed Controller

- `.opsiscript`仍只读取/校验client-specific properties并调用bootstrap。
- bootstrap只负责 release/controller verify、install/upgrade/previous rollback、canonical command与installed entrypoint dispatch。
- 把 Controller运行期需要的 install/health/diagnostics/transaction/bootstrap modules纳入 Controller release；installed脚本不得向 `%ScriptPath%` 回调。
- setup/update/uninstall/custom/status/recover均读取 verified `controller/current.json`，验证path/digest后调用exact entrypoint。
- 删除 fake cache、刷新 cache、reboot行为测试必须覆盖 mutation/read-only/recovery；Controller损坏时只回退 verified previous。

## 9. Phase 6 — Gateway / Runtime Commit

- 新增 installed `Start-SmcHermesGateway.ps1`，参数化 HermesExe/HermesHome/Profile/Port/Bind并显式设置 `$env:HERMES_HOME`。
- Task Action调用 wrapper；不直接执行Hermes CLI，不依赖 `cmd set` 或 PATH。
- `state/tasks.json`保存desired/observed、SID/account、wrapper、exact executable、runtime digest、home/profile/bind/port/restart policy和task digest。
- 注册后读取 Task Scheduler action/principal/trigger/settings，health时验证实际process executable来自active slot。
- active pointer始终包含entrypoint/manifest digest；update commit前验证user result/task/process/health，失败恢复previous runtime/task/config/owner。

## 10. Phase 7 — Depot / Control / Gate

- Runbook使用Operator `opsi-package-manager -i`，记录命令、`.opsi` digest、actor/time/depot。
- `productOnDepot_getObjects` read-back exact Product/package，Control持久化release index/attestation digest。
- setup/update preflight验证requested runtime属于verified release且compatibility成立。
- 新增 `v1.7-client-deployment-release` Gate；v1.5 stable/start/next Ring同时要求v1.5/v1.6/v1.7 Gate。
- smoke/fixture/FakeOpsiJsonRpc/ProductOnClient=installed不能把release或Live Gate设为verified/proven。

## 11. Phase 8 — Automated Gates / Runbooks

自动化至少执行：

```text
cd services/opsi-control
uv run pytest -q
uv run ruff check .
uv run ruff format --check .
uv run alembic upgrade head
uv run alembic downgrade -1
uv run alembic upgrade head

cd <repo>
python -m pytest infra/opsi/tests -q
Invoke-Pester -Path infra/opsi/tests/SmcHermesAgent.Tests.ps1 -EnableExit
npm run contracts:check
python scripts/check-opsi-isolation.py --base <merge-base>

cd apps/work
lat check
npm run typecheck
npm test
npm run build
```

Pester要运行fake ProgramData/cache/task behavior；Python测试要实际构建/sign/verify/tamper/stage inventory。若无 `lat.md/`，明确记录 unavailable，不能伪造结果。

新增/更新 Runbooks：

- release key/provider与key rotation；
- real Hermes runtime/controller/release build；
- Linux `.opsi` build与artifact inventory；
- Lab Depot publish/read-back/rollback；
- Clean Windows 10 fresh/user pending/cache reboot/update rollback/tamper/uninstall；
- v1.7 Evidence capture、redaction、Gate NO-GO。

## 12. Phase 9 — Windows 10 Live（人工）

使用同一真实 release identity 完成：

1. `W10-01`：真实 ZIP→signature→`.opsi`→Depot→Clean Windows 10 Fresh READY。
2. `W10-02`：未登录/无profile→USER_CONTEXT_PENDING→绑定用户登录→同transaction READY。
3. `W10-03`：Controller-only update、Runtime A→B、health fault、exact rollback A READY。
4. `W10-04`：删除 Product Cache、reboot/open journal recovery；OPSI/Control/PostgreSQL暂时离线连续性。
5. `W10-05`：release/controller/runtime tamper fail closed；在线/离线uninstall、owner restore、用户数据保留、clean reinstall。

可用1～5台Windows 10执行五个场景。不得以Windows 11或mock替代，也不要求Windows 11。

## 13. Phase 10 — Operator Gate

- Evidence manifest必须引用 `.opsi`、release index、Controller/runtime manifests、Depot read-back、Endpoint journal/task/process/state/result/owner digests。
- Release Owner、Endpoint Ops、Security Owner签署；只有他们可设 `proven/GO`。
- v1.7 Evidence可支持v1.6 Controller Gate人工复核，但每个Gate仍需显式Operator签署。
- GO后只获得回到v1.5 Production Re-entry的资格，不自动开始/扩大任何Ring。

## 14. 建议 PR 拆分

1. `test(opsi): add v1.7 release and cache-independence red gates`
2. `feat(opsi): separate product controller and runtime versions`
3. `feat(opsi): build signed runtime and product release envelopes`
4. `feat(opsi): build verified controller bundle and windows verifier`
5. `build(opsi): add deterministic release staging and real opsi output`
6. `refactor(opsi): dispatch lifecycle only through installed controller`
7. `fix(opsi): bind gateway task to exact runtime and hermes home`
8. `feat(opsi-control): add release catalog depot verification and api 1.7`
9. `test(opsi): add supply-chain recovery and isolation gates`
10. `docs(opsi): add v1.7 release depot and windows runbooks`
11. `test(opsi): archive windows 10 release evidence`（Operator PR）

依赖顺序：contract/version→runtime/controller envelopes→verifier→stage/build→installed dispatch→Gateway/runtime commit→Depot/control→Live。工程PR不包含Operator GO。

## 15. 完成检查表

- [ ] 三维版本与release catalog生效，Action不再把Product version当Hermes version。
- [ ] 正式Runtime/Controller/release index外部签名且tamper fail closed。
- [ ] Clean Windows 10使用self-contained verifier，无Python/PATH/online依赖。
- [ ] Controller真实digest/files/ACL/read-back/current+previous完整。
- [ ] deterministic stage与真实`.opsi`/SHA256/provenance/SBOM完成，private key不进Package。
- [ ] 删除Product Cache/reboot后installed Controller继续处理全生命周期。
- [ ] Gateway wrapper实际设置HERMES_HOME并绑定exact active runtime。
- [ ] API 1.7/Depot release read-back/Action release identity/Gate完成。
- [ ] 自动化、migration、contracts、isolation与Work Direct Hermes回归通过。
- [ ] W10-01～W10-05由Operator完成并签署；在此之前保持NO-GO。
- [ ] v1.7 GO不绕过v1.5 Production Re-entry，也不授权≤100 rollout。
