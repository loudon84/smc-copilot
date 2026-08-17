# SMC Copilot OPSI Endpoint Control Plane v1.7 PRD

**Real Hermes Release Pipeline + Windows Client Deployment Proof**

- 基线分支：`opsi/prd-v1.0`
- 规划基线：`a448eb4`（OPSI v1.6 Endpoint Controller engineering implementation）
- 前置版本：`PRD-OPSI-v1.6`
- 目标 API：`opsiControlApi 1.7.0`
- 目标 Product：`smc-hermes-agent 1.7.0-1`
- Controller Contract：`smc.opsi.endpoint-controller.v1`
- Runtime Artifact：`smc.opsi.runtime-artifact.v3`
- 新增 Release Contract：`smc.opsi.product-release.v1`
- 状态：Engineering implemented；v1.6/v1.7 Windows 10 Live Evidence 仍为 `not_proven/NO-GO`

## 1. 文档定位

v1.6 已经实现 ProgramData Controller 目录、per-request journal v2、immutable runtime slot、SID command queue、Controller State v2、Result ack 与 two-phase uninstall 的工程骨架，自动化门禁通过；但它尚未证明一个由真实 Hermes Windows 构建产出的、外部签名的 `.opsi` 包能够在 Clean Windows 10 上完成安装、用户续跑、Gateway、更新、回滚、重启恢复和卸载。

用户提供的 v1.7 草案方向正确，但混合了三类内容：

1. v1.6 已经实现的结构，不应在 v1.7 重复建设；
2. 当前代码仍缺失的真实 Release、Controller trust bootstrap、cache-independent dispatch 与 Gateway 环境闭环；
3. `2 → 10 → 30 → ≤100` Production Rollout，属于既有 v1.5 Re-entry/Ring Gate 的后续运营，不应在本版重新定义或提前授权。

因此 v1.7 的唯一主题是：

> 把真实 Hermes Windows Release 变成可复现、可签名、可审计的 OPSI Product；让 thin bootstrap 验证并安装可信 Controller，随后只由 installed Controller 完成 Hermes 生命周期；最后在 Windows 10-only 真实环境中形成可签署证据。

```text
Hermes Windows build
        ↓
Runtime Artifact v3 + external Ed25519 signature
        ↓
Controller bundle + manifest + external signature
        ↓
Product Release Index + deterministic staging
        ↓ Linux opsi-makepackage
Real smc-hermes-agent_1.7.0-1.opsi
        ↓ operator publish + Depot read-back
opsiclientd thin bootstrap
        ↓ verify/install
Persistent installed Controller
        ↓ cache-independent dispatch
Hermes runtime + bound-user Gateway
        ↓
Windows 10 live evidence / Operator Gate
```

## 2. 冻结边界

- OPSI 是 Salt 的平行可选 Provider；默认 SOT 仍是 Salt。不得修改 `infra/salt/**`、`services/salt-control/**` 或 Salt contract。
- 不向 `services/runtime` 或 `contracts/runtime-api` 增加 OPSI 能力。
- Work 保持 Direct Hermes `127.0.0.1:8642`，不新增 OPSI UI、RPC client、credentials 或 `window.opsiApi`。
- `opsi-control` 只通过 TLS JSON-RPC 连接 opsiconfd，不直连 Endpoint、Gateway 或 Work。
- Endpoint Controller 是 short-lived reconcile engine：无 listener、无 inbound port、非 Windows Service、不承载 Chat。
- Windows Endpoint 本地状态仍是文件/SQLite 责任域；OPSI Server 使用其既有数据库；`opsi-control` 使用公司内部既有 PostgreSQL 隔离 schema。v1.7 不向 OPSI Server 增加 PostgreSQL。
- Live 验证仅要求 Windows 10。不得新增 Windows 11 独立认证用例，也不得因未验证 Windows 11 创建产品拒绝逻辑。
- CI/Cursor 只能写 `implemented/verified`，不能写 Live `proven/GO`。

## 3. 当前代码与草案对比

### 3.1 已由 v1.6 实现，本版只做回归

- `controller/releases`、`controller/current.json` 与 Controller/runtime 版本分层目录已存在。
- `runtime/versions/<version>-<digest>`、`runtime/active.json` 和完整文件 hash read-back 已存在。
- per-request `transactions/<requestId>.json`、startup recovery task、SID inbox/outbox/ack 已存在。
- `USER_CONTEXT_PENDING` 与 exit code `10` 已存在。
- Controller State v2、Result relay/ack、two-phase uninstall 与 `reconcile-controller` 契约已存在。
- Artifact v3 已定义 archive digest、签名 payload 与 `files[]`。

这些不是 v1.7 的新交付物；只有在真实 Release/Endpoint 路径中发现行为缺口时才修正。

### 3.2 当前代码真实缺口

#### A. Release build 只是“接受输入”

`packaging/makepackage.py::build_release()` 目前只验证 ZIP/key reference 存在并复制 ZIP；没有生成正式 runtime manifest/signature、Controller manifest/signature、release index、完整 staged Product tree、checksums/provenance，也没有驱动 `.opsi` build。

`build-real.sh` 只是直接执行 `opsi-makepackage`，没有验证 stage 完整性、私钥泄漏、source tree drift、release metadata 或输出 read-back。

#### B. Product version 与 Hermes version 仍被错误绑定

当前 `control.toml` 的 `productVersion = 0.22.0` 实际等同 Hermes runtime version；`action_dispatcher._require_product()` 还把 Depot `productVersion` 与 Action `hermesVersion` 直接比较。这与草案要求的 Product/Controller/Hermes 三维版本模型冲突。

#### C. Controller manifest 没有进入安装信任链

- `Install-SmcHermesAgent.ps1` 用 `SHA256(controller_revision)` 作为 Controller digest。
- `Install-SmcControllerBundle` 只遍历文件并调用 `Get-FileHash | Out-Null`，没有和 manifest 的 path/size/hash 对比，也没有验签、ACL/read-back/atomic verified pointer。
- `controller_manifest.py::verify_manifest()` 只验 schema、简单 `..` 和签名；没有重算 `canonicalDigest`、验证真实 bundle 文件、entrypoint/min revision、重复路径或完整 containment。

#### D. Clean Windows 验签依赖系统 Python

`Assert-SmcArtifactSignature` 通过 `python`/`py` 执行 `verify_ed25519.py`。Clean Windows 10 不保证预装 Python，当前链路可能在解压前直接失败。生产 Endpoint 必须使用随 Product 交付、digest pinned 的 self-contained verifier，不能依赖 PATH、在线 pip 或系统 Python。

#### E. 首次 mutation 仍由 Product Cache 执行

thin adapter 安装 Controller 后，仍从 `$here\install`、`$here\health`、`$here\diagnostics`、`$here\transaction` 调用 cache 内脚本；installed `Invoke-SmcEndpointController.ps1` 也会回调 cache/root scripts。删除 Product Cache 后，recover 脚本可以存在，但 setup/update/status/rollback 等 mutation 尚非 installed-controller-only。

#### F. Gateway Task 记录了 HERMES_HOME，但实际 Action 未注入

`Register-UserBootstrap.ps1` 计算了 `$envPrefix`，却没有把它放入 Scheduled Task Action；Task 仍直接执行 Hermes CLI。记录的 `hermesHome` 与实际进程环境不等价。Gateway 需要固定 wrapper 并从 `runtime/active.json` 解析 exact executable。

#### G. Artifact/Controller contract 仍有 fail-closed 缺口

- Runtime ZIP 未显式拒绝 duplicate normalized path；reparse-point 与 compatibility range 未完整验证。
- Runtime JSON Schema 对 v3 未条件要求 `files[]`，标题/entrypoint 约束与实现存在 drift。
- Controller schema 的 signature 可选，path/digest/size/entrypoint/revision 语义验证不足。
- Runtime slot pointer 在部分路径没有保存 manifest entrypoint，后续 resolver 可能回退为 `hermes.exe`。

## 4. 产品目标

v1.7 完成后应满足：

1. 从一个真实 Hermes Windows ZIP 和外部 signing key reference，可确定性地产生 runtime envelope、Controller envelope、release index 和 `.opsi`。
2. OPSI Product version、package revision、Controller revision、Hermes runtime version 独立可追踪。
3. Clean Windows 10 不依赖系统 Python/PATH 即可验证 Controller/runtime Ed25519 envelope。
4. Product Cache 只负责 request validation、Controller verify/install/rollback 和 installed-controller dispatch。
5. Controller 安装成功后，所有 Hermes mutation/recovery/status 从 verified installed release 执行。
6. Gateway task 通过 wrapper 显式设置 HERMES_HOME，并绑定 exact active runtime/profile/port/bind/SID。
7. Operator 能将真实 `.opsi` 发布到 Lab Depot，read-back exact Product release，并在 Windows 10 上完成可审计证据矩阵。

## 5. 非目标

- 不执行或授权 `≤100` Production rollout；仍使用 v1.5 的既有范围、Ring 与 Re-entry Gate。
- 不新增 `2/10/30/remaining` 第二套 Ring 编排。
- 不做 Windows 11 独立认证、500 台并发、Master HA、多 Config Server、多地域/多 Depot。
- 不增加 S3、MinIO、CDN、P2P、独立 Artifact HTTP service 或 Endpoint downloader。
- 不自动向 Lab/Production Depot publish；build 与 publish 权限分离。
- 不新增 Controller daemon/listener/service、remote shell、Chat proxy 或 Work OPSI UI。

## 6. 独立版本与 Product Release SOT

### 6.1 版本维度

```text
OPSI Product      1.7.0 / package 1
Controller        revision 2（示例；单调递增）
Hermes Runtime    0.22.0（精确版本）
```

- `productVersion` 表示 Product/Adapter release，不再等于 Hermes version。
- `packageVersion` 表示同 Product version 的 OPSI packaging revision。
- `controller_revision` 表示 Controller bundle revision。
- `hermes_version` 表示 package 内 release catalog 已声明的 exact runtime。

`action_dispatcher` 不得再比较 `ProductOnDepot.productVersion == hermesVersion`。它必须：

1. read-back 所需 Product/package release；
2. 验证 release index/attestation 为 verified；
3. 验证 requested Hermes version 在该 release catalog 中；
4. 验证 Controller/runtime compatibility；
5. 再设置 client-specific Product Property 与 ActionRequest。

### 6.2 `smc.opsi.product-release.v1`

新增 canonical release index，至少包含：

```json
{
  "schema": "smc.opsi.product-release.v1",
  "productId": "smc-hermes-agent",
  "productVersion": "1.7.0",
  "packageVersion": "1",
  "controller": {
    "revision": "2",
    "manifestSha256": "...",
    "bundleDigest": "..."
  },
  "runtimes": [
    {
      "version": "0.22.0",
      "manifestSha256": "...",
      "artifactSha256": "...",
      "controllerCompat": ">=2"
    }
  ],
  "verifier": {
    "platform": "windows-amd64",
    "sha256": "..."
  },
  "sourceRevision": "<git sha>",
  "buildId": "...",
  "createdAt": "..."
}
```

release index 必须被外部 key 签名，并进入 `.opsi`、CI artifact inventory、Depot attestation 与 Live evidence。

## 7. Real Release Pipeline

### 7.1 输入

- exact Hermes Windows ZIP 与 exact `--hermes-version`；
- Product version/package version；
- Controller source 与 monotonic revision；
- release signing key reference（文件、HSM/secret provider adapter 均可；不得自动生成生产 key）；
- source revision/build id 与干净的独立 staging/output 目录。

### 7.2 阶段

1. **Runtime envelope**：拒绝 `latest`、invalid ZIP、duplicate/escape/reparse path、missing entrypoint；生成 `files[]`、archive/CLI digest、compatibility，外部签名并回验。
2. **Controller envelope**：生成完整 file inventory、canonical digest、entrypoints/min product revision，外部签名并对 staging 文件逐项回验。
3. **Verifier trust root**：打包 self-contained Windows verifier；builder 固定其 digest，bootstrap 在执行前先校验 pinned digest。生产链不得调用系统 Python。
4. **Release index**：绑定 Product、Controller、Runtime、Verifier、source/build provenance，并签名。
5. **Deterministic stage**：复制最小 Product tree 到新的 staging 目录；禁止修改 source `CLIENT_DATA/artifacts`、禁止包含 private key/credential、禁止未声明文件。
6. **Linux package build**：只对完整 stage 执行 `opsi-makepackage`；生成 `.opsi`、SHA256、release inventory、provenance 和 SBOM。
7. **Reproducibility/read-back**：相同输入产生相同 canonical manifests/inventory；允许容器/opsi 工具写入的时间字段必须单独记录，不进入身份 digest。

### 7.3 Build/Publish 边界

CI/build job 只产出，不自动 publish。Operator 使用 `opsi-package-manager -i` 导入 Lab/Production，并通过 `productOnDepot_getObjects` read-back exact `productId/productVersion/packageVersion`。Publish audit 绑定 `.opsi` digest 与 release index digest。

## 8. Controller Trust Bootstrap

Product Cache 中只保留最小 bootstrap、pinned verifier/public keys、Controller envelope 与 dispatch wrapper。

安装顺序：

```text
validate request/release index
→ verify pinned verifier digest
→ verify release-index signature
→ verify Controller manifest signature/canonical digest
→ reject invalid/duplicate/absolute/drive/UNC/../reparse paths
→ copy to random staging
→ verify exact file set/size/hash/entrypoints
→ apply/read-back ACL
→ atomic move to controller/releases/<revision>-<digest>
→ atomic current.json with previous
→ invoke exact installed entrypoint
```

`digest` 必须来自 verified canonical Controller bundle，不得由 revision 文本派生。新 Controller 执行失败时，bootstrap 只能回退到已验证的 `previous` release；不能调用未验证 cache business scripts。

## 9. Installed-controller-only Dispatch

完成 trust bootstrap 后：

- setup/update/uninstall/custom 的业务参数以 canonical command 传给 installed entrypoint；
- runtime install/activation、config、Gateway、transaction、owner、state/result 逻辑随 Controller bundle 安装；
- installed Controller 不引用 `%ScriptPath%`、Product Cache 或 `versions/current`；
- recovery/status 在 cache 删除、Product cache refresh、reboot 后仍可运行；
- cache 只在 Controller 缺失/升级/损坏且存在 verified previous 时参与恢复。

需把当前散落在 `scripts/install|health|diagnostics|transaction` 与 `bootstrap` 中的 runtime dependencies 纳入 Controller bundle 或稳定的 installed library layout，并对每个调用路径增加 cache-independence 行为测试。

## 10. Runtime Envelope 与 Activation 修正

- Runtime v3 schema 对 `files[]` 做条件必填，拒绝重复 normalized path、zero/negative size（如允许空文件需明确规则）、额外/缺失文件、symlink/reparse escape。
- `controllerCompat` 使用可解析的最小 compatibility grammar，并在 activation 前验证。
- Endpoint verifier验证 manifest、signature、archive SHA256、完整展开文件、entrypoint/CLI digest 与 exact `--version`。
- `runtime/active.json` 始终保存 entrypoint、manifest digest、active/previous slot；所有 Gateway/status/doctor 从它解析 executable。
- pointer 更新只能发生在新 slot 完整验证后；Gateway/user health 未通过时恢复 previous runtime/task/config/owner。

## 11. Gateway Wrapper 与 Task Contract

Controller bundle 新增 `Start-SmcHermesGateway.ps1`：

```powershell
$env:HERMES_HOME = $HermesHome
& $HermesExe gateway start --bind 127.0.0.1 --port $Port --profile $Profile
```

Scheduled Task 必须调用 wrapper，而不是直接调用 Hermes CLI。注册后 read-back 并比较：SID/account、wrapper 与 exact CLI、active runtime digest、HERMES_HOME、profile、bind、port、autostart/restart policy。`state/tasks.json` 保存 desired/observed/task digest；只有 Task action、实际进程 executable 与 `active.json` 一致且 health 通过，才能进入 `gateway_healthy`。

## 12. opsi-control 1.7 Contract

- 新增 product release schema、signed release/Depot verification record 与 API read model。
- Product/Runtime 版本校验改为 release catalog membership，不再直接比较两者版本号。
- `/products` 或等价 release view 返回 Product version/package、Controller revision/digest、可用 Runtime exact versions、release verification/Depot read-back 状态。
- setup/update Action 记录 release index digest、Controller digest 与 Runtime manifest digest，Result/Controller State 可关联同一 release identity。
- v1.7 Gate 只消费真实 Depot read-back 与 Windows Evidence；fixture/smoke release 不能满足 Live Gate。
- Production `stable/start/next Ring` 必须同时满足既有 v1.5 Re-entry Gate、v1.6 Endpoint Controller Gate 与新增 v1.7 Client Deployment Release Gate。

## 13. 自动化验收

### 13.1 Packaging/contract negative matrix

- real builder 不生成生产私钥、不接受 `latest`、不修改 source artifacts/key；
- wrong/missing/unknown key、manifest/canonical digest/artifact/file/entrypoint/compatibility mismatch fail closed；
- duplicate path、case-fold collision、absolute/drive/UNC/`..`、symlink/reparse 与 extra file fail closed；
- Controller bundle/release index/runtime envelope 均支持 sign→verify→tamper failure；
- stage 不含 private key、secret、undeclared file；`.opsi` inventory 与 release index 一致。

### 13.2 PowerShell 5.1 behavior

- 无 Python/PATH Hermes 的 Clean Windows fixture 可使用 bundled verifier；
- Controller manifest verified 后才写 pointer；失败保留 previous；
- installed Controller 完整处理 setup/update/status/recover/uninstall；删除 fake Product Cache 后仍通过；
- Gateway wrapper 实际设置 HERMES_HOME，Task read-back 与 process identity 一致；
- runtime/controller rollback 恢复 exact previous state；owner 只在 full READY commit。

### 13.3 Repo gates

```text
cd services/opsi-control
uv run pytest -q
uv run ruff check .
uv run ruff format --check .
uv run alembic upgrade head / downgrade -1 / upgrade head

python -m pytest infra/opsi/tests -q
Invoke-Pester infra/opsi/tests/SmcHermesAgent.Tests.ps1 -EnableExit
npm run contracts:check
python scripts/check-opsi-isolation.py --base <merge-base>

cd apps/work
lat check
npm run typecheck
npm test
npm run build
```

若仓库没有 `lat.md/`，记录 `lat` unavailable，不得伪造通过结果；仍需执行 Work Direct Hermes 的可用门禁。

## 14. Windows 10-only Live Evidence

开发验收是 **5 个真实场景**，可使用 1～5 台 Windows 10 Endpoint；不是五种操作系统，也不要求 Windows 11。

| Scenario | Windows 10 live proof |
| --- | --- |
| W10-01 Fresh release/install | 真实 Hermes ZIP→signed `.opsi`→Depot read-back→Clean Endpoint setup→Controller/runtime/user/Gateway/owner READY |
| W10-02 User pending/resume | profile/用户未登录→RUNNING/USER_CONTEXT_PENDING→登录→同 request/digest user continuation→READY |
| W10-03 Update/rollback | Controller-only update、Runtime A→B、health fault injection、exact previous rollback、A READY |
| W10-04 Cache/reboot/offline recovery | 删除 OPSI Product Cache、reboot、open transaction resume/rollback；Control/PostgreSQL/OPSI 暂时离线时现有 Gateway 连续性 |
| W10-05 Tamper/uninstall/reinstall | runtime/controller/release tamper fail closed；在线/离线 two-phase uninstall、owner restore、用户数据保留、clean reinstall |

每个场景归档同一 release identity 下的 `.opsi` SHA256、release index、Controller/runtime manifests、Depot read-back、journal timeline、Task action/process executable/HERMES_HOME/port、Controller State v2、Action Result、owner transition 与 sanitized logs。

## 15. Gate 与 Production 关系

新增 `v1.7-client-deployment-release` Gate：

- Engineering 完成时最多为 `implemented/verified`；
- 五个 Windows 10 场景均由 Operator/Security/Endpoint Ops 复核同一 Evidence manifest 后，才可设为 `proven/GO`；
- v1.7 Evidence 可同时补充 v1.6 尚缺的 Controller Live proof，但不能由代码自动修改 v1.6 GO；
- v1.7 GO 不是 Production rollout 授权。后续必须重新进入 v1.5 既有 Production Re-entry/Ring 流程；不得使用本 PRD 的场景数量替代 Pilot/Ring 审批。

## 16. 实施阶段

1. Truth freeze、ADR-036、red behavior tests 与 v1.7 Evidence skeleton。
2. Product/Controller/Runtime 三维版本分离，release index 与 API 1.7 contracts。
3. Production runtime envelope builder 与 contract hardening。
4. Controller builder、self-contained Windows verifier、manifest/file/ACL verification。
5. Deterministic release staging、Linux `.opsi` build、checksums/provenance/SBOM。
6. Thin trust bootstrap 与 installed-controller-only dispatch/cache independence。
7. Gateway wrapper、Task read-back 与 exact active runtime/HERMES_HOME binding。
8. Depot publish/read-back、release attestation 与 Action release binding。
9. Automated negative/behavior/recovery/isolation gates 与 runbooks。
10. Windows 10-only live scenarios 和 Operator Gate。

## 17. Definition of Done

- [ ] Product `1.7.0-1`、Controller revision、Hermes version 独立，Dispatcher 不再比较 Product version 与 Hermes version。
- [ ] 真实 Hermes ZIP 产生 externally signed Runtime v3、Controller envelope 与 signed release index。
- [ ] deterministic stage 与 Linux builder 产出真实 `.opsi`、SHA256、provenance/SBOM；source tree 与生产 key 不被改写/泄漏。
- [ ] Clean Windows 10 验签不依赖系统 Python、PATH Hermes 或在线下载。
- [ ] Controller canonical digest、signature、exact file set/size/hash/ACL/read-back 全部 fail closed。
- [ ] thin bootstrap 安装后只 dispatch verified installed Controller；删除 Product Cache/reboot 后 lifecycle 仍可管理。
- [ ] Runtime v3 duplicate/path/reparse/compatibility/schema drift 关闭，active pointer 保存 exact entrypoint/manifest。
- [ ] Gateway wrapper 实际注入 HERMES_HOME，Task recorded/observed/process identity 完全一致。
- [ ] API 1.7 release view、Depot read-back、Action/Result/State release identity 与 Gate 完成。
- [ ] 自动化、contracts、OPSI isolation 与 Work Direct Hermes 回归通过。
- [ ] W10-01～W10-05 由 Operator 归档并签署 `v1.7-client-deployment-release=proven/GO`。
- [ ] GO 前 v1.5 Production stable/start/next Ring 保持冻结；v1.7 不自行授权 ≤100 rollout。

## 18. 最终责任边界

```text
Release Pipeline     负责可复现、可签名的 Product/Controller/Runtime 交付物
OPSI                 负责 Endpoint Enrollment、Product 分发与 Action 触发
Endpoint Controller  负责本地 desired/observed、transaction、runtime/user/Gateway 收敛
Hermes Gateway       负责 127.0.0.1:8642 Data Plane
Work                 直接连接 Hermes Gateway
```

v1.7 的验收核心不是 Endpoint 数量，而是一个真实 release identity 能在 Windows 10 上从 build、Depot、安装到恢复/卸载全程被验证，且任何阶段都不能以 smoke、fixture、Product installed 或 revision 字符串替代真实证据。
