---
name: Salt v2.4.2 Loader & Binding Contract Fix
overview: 修复 Salt 3008.2 Windows Minion 无法加载 SMC Utils、External Pillar 与 Salt Control 契约错位、Job 参数不匹配及既有 Minion 身份接管缺口，使 `inspect`、`doctor`、绑定解析和 Hermes 管理具备可验证的端到端代码路径。范围仅限缺陷修复、自动化回归和发布候选生成；不执行客户端绑定、Hermes 安装、Control Owner 切换、Runtime 停用或 Ring 0 推进。
todos:
  - id: phase-0
    content: 建立真实缺陷回归基线并让 Migration Inventory 对未验证 P0/P1 正确返回 NO-GO
    status: completed
  - id: phase-1
    content: 重构 SMC Salt Utils 和调用方以符合 Salt 3008.2 独立插件 Loader 契约
    status: completed
  - id: phase-2
    content: 统一 External Pillar、Salt Control Desired State、Artifact 与 SLS 字段和认证契约
    status: completed
  - id: phase-3
    content: 修复 Salt Control Job Payload 到 smc_hermes Execution Module 的逐字段调用契约
    status: completed
  - id: phase-4
    content: 加固既有 Minion Identity Adoption 与 Endpoint User Binding 的失败关闭规则
    status: completed
  - id: phase-5
    content: 完成 v2.4.2 Release Candidate、全量回归、契约生成和运维文档
    status: completed
  - id: phase-6-manual
    content: 人工执行 Master 发版、ITBJB0676 实机 Loader/Pillar 验证与签署；Cursor 不得自动完成
    status: pending
isProject: false
---

# Cursor Implementation Plan — Salt v2.4.2 Loader & Binding Contract Fix

## 1. 执行依据

- 修复需求基线：本计划第 2–8 节；来源版本为 `v2.4.1`，无需预读历史 PRD/ADR
- Cursor Plan 规范：[`CURSOR_PLAN_SPEC.md`](.cursor/plans/CURSOR_PLAN_SPEC.md)
- 基线 Commit：`5ba7ec8`
- 唯一 Salt Master：`192.168.102.104`，Docker 容器 `salt-master`
- Salt Master / Salt Minion：`3008.2 (Argon)`
- 当前实机 Minion ID：`ITBJB0676`
- 当前决策：`NO-GO`；代码单元测试通过不能替代 Salt 3008.2 实机 Loader 证据

开始前仅阅读仓库执行约束：

- [`AGENTS.md`](AGENTS.md)
- [`services/salt-control/AGENTS.md`](services/salt-control/AGENTS.md)

本计划已包含本次修复所需的架构边界、接口字段和验收条件。不要预读历史 PRD/ADR；仅当具体实现与本计划发生冲突时，按相关 Phase 中的文件链接定向查阅。

固定边界：

- 不部署第二 Master，不实施 MultiMaster-PKI 或故障转移。
- 不执行 `ITBJB0676` 的 `ITBJB0676 -> ep_*` 身份切换；仅修复并验证 Adoption 代码和 Dry Run。
- 不创建真实 Endpoint/User Binding，不从当前登录用户、Grain、Salt Service Account 推断绑定用户。
- 不安装、升级或接管真实 Hermes Agent，不写 `control-owner=salt`，不停止 Runtime。
- 不执行 `state.highstate`、Handover、Ring 0 Advance 或 Runtime Decommission。
- 不把 Bearer Token、Device Credential、Artifact 私钥或 Secret 写入仓库、Pillar、日志和测试快照。
- Cursor/CI 只能标记代码 `implemented`；Salt 3008.2 实机结果保持 `not_proven`，只能由人工验证后签署。
- 现有未跟踪文件属于用户，禁止清理、覆盖或纳入无关提交。

## 2. 当前基线与缺陷判定

已确认事实：

- `test.ping`、`service.status salt-minion`、`saltutil.sync_all` 和 Extension 文件下发已通过。
- `sys.list_functions smc_hermes` 与 `sys.list_state_functions smc_hermes` 能列出函数，仅证明 Execution/State Module 文件已注册，不证明依赖的 Salt Utils 已注册。
- `smc_hermes.inspect` 与 `smc_hermes.doctor` 在 `ITBJB0676` 上抛出 `ModuleNotFoundError: No module named '_utils'`。
- Minion 日志存在 `Failed to import utils paths`，并在 [`paths.py`](infra/salt/extensions/_utils/paths.py) 的 `@dataclass` 初始化处触发 Salt Lazy Loader 异常。
- 定向自动化基线：Salt Infra `11 passed`；Salt Control `9 passed`。这些测试通过 pytest 的包路径加载 Extension，未覆盖 Salt 独立插件 Loader。
- [`salt-migration-inventory.py`](scripts/salt-migration-inventory.py) 当前输出 API `92.1%`、Service `87.5%`、LOC `93.5%`、Decision `GO`，但 `p0_p1 = 0` 为硬编码，结论无效。
- External Pillar、Salt Control API、SLS 与 Job Invocation 的实机端到端状态为 `not_proven`。

必须先新增并观察失败的回归点：

1. 在没有 `_utils` Python 包的独立插件加载环境中，`smc_paths`、`smc_artifact`、`config_revision` 等 Utils 无法全部加载。
2. `smc_hermes.inspect`、`doctor` 在缺少目标 `__utils__` key 时尝试导入 `_utils.dunder`。
3. Grain、Returner、Secret 和 Handover 模块仍包含 `_utils.*` fallback import。
4. External Pillar 忽略配置中的 `backend_url`，请求路径与 `/salt/v1/endpoints/{endpoint_id}/desired-state` 不一致，且未发送 Bearer Token。
5. Salt Control 输出 camelCase 和 `artifactRef`，SLS 读取 snake_case 与完整 `artifact.url/sha256/signature`，无法渲染可安装状态。
6. `install` Job 发送 `url/sha256`，Execution Module 要求 `artifact_url/artifact_sha256/artifact_signature`。
7. `configure` Job 发送 `revision/desired`，Execution Module 要求 `config/hermes_home/note`。
8. `UpgradePayload` 已存在，但 Job Operation、Worker 和 OpenAPI 未形成可调用的 `smc_hermes.upgrade` 路径。
9. `ITBJB0676` 与 Backend `ep_*` 身份尚未接管；普通 Job 可同时接受不一致的 `endpoint_id/minion_id`。
10. Backend 返回 System 或字段不完整的 Binding 时，部分路径未统一失败关闭。

## 3. Phase 0 — Regression Baseline & Inventory Gate

### 目标

先用自动化测试固定缺陷，并使迁移盘点不再把未通过真实 Loader/Pillar 验证的能力统计为可上线 `GO`。

### 修改

- 修改：[`salt-migration-inventory.py`](scripts/salt-migration-inventory.py)
  - 删除硬编码 `p0_p1 = 0`。
  - 从 Capability Manifest 读取 `blockers[]`，字段固定为 `id`、`severity`、`implementationStatus`、`verificationStatus`、`affectedCapabilities`、`tests`。
  - `severity=P0|P1` 且 `implementationStatus!=fixed`，或要求实机验证但 `verificationStatus!=proven` 时，Production Decision 必须为 `NO-GO`。
  - 报告分别输出 `codeGate` 与 `liveGate`；自动化可关闭 `codeGate`，不得自动关闭 `liveGate`。
- 修改：[`migration-capabilities.yaml`](infra/salt/migration-capabilities.yaml)
  - 登记 `SALT-LOADER-001`、`PILLAR-CONTRACT-001`、`JOB-CONTRACT-001`、`IDENTITY-BINDING-001`。
  - 初始 `implementationStatus: broken`、`verificationStatus: not_proven`。
  - Cursor 修复并通过自动化后只允许把 `implementationStatus` 改为 `fixed`；不得把 `verificationStatus` 改为 `proven`。
- 新增：[`test_migration_inventory.py`](infra/salt/tests/test_migration_inventory.py)
- 更新生成物：[`migration-inventory.json`](migration-inventory.json)、[`migration-inventory.md`](migration-inventory.md)

### 测试

- [`test_migration_inventory.py`](infra/salt/tests/test_migration_inventory.py)
  - 场景：存在 P0/P1 `broken` blocker 时 `codeGate=FAIL` 且 Decision=`NO-GO`。
  - 场景：代码状态为 `fixed`、实机状态为 `not_proven` 时 `codeGate=PASS`、`liveGate=FAIL`、Decision 仍为 `NO-GO`。
  - 场景：测试文件或 Salt Source 不存在时，Capability 不得保持 `verified FULL`。
  - 场景：脚本输出不得再出现无来源的固定 P0/P1 数值。

### 退出条件

- [ ] 上述十个缺陷至少各有一个先失败的回归断言。
- [ ] Migration Inventory 能区分代码已修复与实机已证明。
- [ ] Phase 6 未人工完成前，生成报告稳定保持 Production `NO-GO`。

## 4. Phase 1 — Salt 3008.2 Loader Closure

### 目标

让每个发布到 `_utils` 的插件均能被 Salt 3008.2 作为独立模块加载，所有生产调用只使用 Salt 注入的 `__utils__` / `__salt__`。

### 关键决策

- `_utils` 是 Salt Loader 插件目录，不是 Python package；禁止 `_utils.*`、`from .x` 和测试路径 fallback。
- Loader 公共命名固定为 `smc_paths.*`、`smc_control_owner.*`、`smc_redact.*`、`smc_artifact.*`、`config_revision.*`、`smc_handover_hooks.*`。
- Helper 必须内聚到对应公共插件，或通过注入的 `__utils__` 调用；不得依赖同目录相对导入。
- `smc_paths` 不使用触发 Salt Lazy Loader `sys.modules` 假设的 `@dataclass`；Layout 继续提供现有属性和 `is_installed()` 行为。
- 缺失 Utils 时返回稳定的 `smc_utils_unavailable`/missing keys 诊断，不得再产生 `ModuleNotFoundError`。

### 修改

- 重构：[`smc_paths.py`](infra/salt/extensions/_utils/smc_paths.py)
- 重构：[`smc_control_owner.py`](infra/salt/extensions/_utils/smc_control_owner.py)
- 重构：[`smc_redact.py`](infra/salt/extensions/_utils/smc_redact.py)
- 新增或重命名：[`smc_artifact.py`](infra/salt/extensions/_utils/smc_artifact.py)
- 重构：[`config_revision.py`](infra/salt/extensions/_utils/config_revision.py)
- 重构：[`smc_handover_hooks.py`](infra/salt/extensions/_utils/smc_handover_hooks.py)
- 删除测试 fallback：[`dunder.py`](infra/salt/extensions/_utils/dunder.py)
- 删除或迁出 Loader 目录中的包式 Helper：[`artifact.py`](infra/salt/extensions/_utils/artifact.py)、[`atomic_write.py`](infra/salt/extensions/_utils/atomic_write.py)、[`control_owner.py`](infra/salt/extensions/_utils/control_owner.py)、[`paths.py`](infra/salt/extensions/_utils/paths.py)、[`redact.py`](infra/salt/extensions/_utils/redact.py)、[`semver.py`](infra/salt/extensions/_utils/semver.py)
- 修改调用方：[`smc_hermes.py`](infra/salt/extensions/_modules/smc_hermes.py)、[`smc_handover.py`](infra/salt/extensions/_modules/smc_handover.py)、[`smc_secret.py`](infra/salt/extensions/_modules/smc_secret.py)、[`smc_endpoint.py`](infra/salt/extensions/_grains/smc_endpoint.py)、[`smc_hermes_health.py`](infra/salt/extensions/_beacons/smc_hermes_health.py)、[`smc_backend.py`](infra/salt/extensions/_returners/smc_backend.py)
- 在 [`smc_hermes.py`](infra/salt/extensions/_modules/smc_hermes.py) 新增只读 `loader_status()`：返回 required/available/missing Utils key，不返回环境变量、Token 或 Secret。
- 修改 State 参数透传：[`smc_hermes.py`](infra/salt/extensions/_states/smc_hermes.py)
- 更新发布脚本保护：[`publish-salt-release.py`](infra/salt/scripts/publish-salt-release.py)
  - 发布前拒绝 `_utils` 中包含相对导入、`from _utils` 或公共模块名不匹配的 Release。

### 测试

- 新增：[`test_salt_loader_contract.py`](infra/salt/tests/test_salt_loader_contract.py)
  - 场景：逐文件独立加载 `_utils/*.py`，不创建 `_utils` package、不修改 `sys.path`，所有插件成功加载。
  - 场景：注入真实 key 形状的 `__utils__` 后，`loader_status()` 无 missing key。
  - 场景：移除任意必需 key 后，返回稳定诊断且 traceback 不含 `ModuleNotFoundError: _utils`。
- 修改：[`test_loader_dunder.py`](infra/salt/tests/test_loader_dunder.py)
  - 改为生产 Loader Source Guard；删除对 `dunder.call_util` fallback 的成功预期。
- 修改：[`test_smc_hermes_module.py`](infra/salt/tests/test_smc_hermes_module.py)
  - 场景：`inspect`、`doctor`、`health` 使用注入 Utils 完成，不依赖 pytest package path。
- 修改：[`test_artifact_lifecycle.py`](infra/salt/tests/test_artifact_lifecycle.py)、[`test_config_revision.py`](infra/salt/tests/test_config_revision.py)、[`test_control_owner.py`](infra/salt/tests/test_control_owner.py)、[`test_home_adoption.py`](infra/salt/tests/test_home_adoption.py)、[`test_desired_state.py`](infra/salt/tests/test_desired_state.py)
  - 全部改用发布后的 Salt 公共 Util 名称。

### 退出条件

- [ ] `infra/salt/extensions` 中不存在 `from _utils`、`from .`、`sys.path.insert` 或 `sys.path.append`。
- [ ] `_utils` 每个 Python 文件均通过独立加载测试。
- [ ] `smc_hermes.inspect` 与 `doctor` 的自动化路径不再使用任何 fallback import。
- [ ] Release 中存在且仅存在调用方声明的公共 Utils 命名。

## 5. Phase 2 — External Pillar, Binding & Artifact Contract

### 目标

建立 Master 到 Salt Control 的单一 Desired State 契约，把 API 响应规范化为 SLS 可直接消费且可验证签名的 `smc` Pillar。

### 固定 Pillar Schema

`smc` 根对象固定包含：

- `endpoint_id`、`revision`
- `user.user_id`、`user.windows_account`、`user.windows_sid`、`user.profile_dir`
- `hermes.home`、`hermes.version`、`hermes.artifact_ref`、`hermes.migrate_mode`
- `hermes.artifact.url`、`sha256`、`signature`、`key_id`、`public_key`
- `profiles`、`mcp`、`secrets`
- `rollout.ring`、`rollout.desired_owner`

### 修改

- 重构：[`smc_external.py`](infra/salt/extensions/_pillar/smc_external.py)
  - 配置名称统一为 `salt_control_url`、`token_file`、`trusted_key_id`、`trusted_public_key_file`。
  - 从 Salt External Pillar 传入参数读取上述配置，不再假定自定义参数存在于全局 `__opts__`；测试注入 Resolver 仅限 test/lab。
  - Desired State 请求固定为 `GET /salt/v1/endpoints/{endpoint_id}/desired-state`。
  - Artifact Metadata 请求固定为 `GET /salt/v1/artifacts/hermes/{version}?platform=windows&arch={arch}`。
  - 每次请求从受控 Token File 读取短期 Bearer Token，支持外部轮换；Token 不进入返回值、异常和日志。
  - Production 仅接受 HTTPS Salt Control URL；网络、认证、Schema、Binding、Artifact 或 Key 校验失败时返回空 `smc` 和稳定错误码，禁止回退 Mock 或空配置覆盖。
  - 将 Salt Control camelCase 响应显式转换为上述 snake_case Pillar Schema。
  - Artifact `keyId` 必须等于 `trusted_key_id`，再把对应公钥注入 Pillar；私钥永不进入 Master、Pillar 或 Minion。
  - Minion ID 非 `ep_*` 时返回 `identity_adoption_required`，不得把主机名当 Backend Endpoint ID。
- 修改 Master 配置模板：[`ext-pillar.conf`](infra/salt/master/master.d/ext-pillar.conf)
- 修改 SLS：[`hermes.sls`](infra/salt/states/hermes.sls)、[`gateway.sls`](infra/salt/states/gateway.sls)、[`profiles.sls`](infra/salt/states/profiles.sls)、[`mcp.sls`](infra/salt/states/mcp.sls)
  - 对动态字符串使用安全 YAML/JSON 序列化，避免 Windows 反斜杠、空格和特殊字符破坏渲染。
  - `hermes.sls` 透传 `key_id/public_key`，缺少签名字段时失败关闭，不执行下载。
  - `gateway.sls` 继续拒绝空用户和 System，不创建 System Scheduled Task。
- 修改 State 签名：[`smc_hermes.py`](infra/salt/extensions/_states/smc_hermes.py)
- 更新 Salt Control Desired State 校验：[`desired_state_service.py`](services/salt-control/src/services/desired_state_service.py)
- 更新 Schema：[`desired_state.py`](services/salt-control/src/schemas/desired_state.py)

### 测试

- 新增：[`test_external_pillar_contract.py`](infra/salt/tests/test_external_pillar_contract.py)
  - 场景：验证 URL、Bearer Header、camelCase 到 snake_case 转换和 Artifact Metadata 合并。
  - 场景：Token、响应内容和错误对象均不泄露 Credential。
  - 场景：HTTP URL、401/403、404、超时、坏 JSON、Key ID 不匹配、签名缺失均失败关闭。
  - 场景：`ITBJB0676` 返回 `identity_adoption_required`；`ep_*` 才允许请求 Desired State。
- 修改：[`test_user_binding.py`](infra/salt/tests/test_user_binding.py)
  - 场景：完整非 System Binding 生成可渲染 Gateway State；缺失 Account/SID/Profile 时等待绑定。
- 修改：[`test_profile_mcp_states.py`](infra/salt/tests/test_profile_mcp_states.py)、[`test_state_wrappers.py`](infra/salt/tests/test_state_wrappers.py)、[`test_gateway_wrapper.py`](infra/salt/tests/test_gateway_wrapper.py)
  - 场景：Windows Account、Hermes Home 与特殊字符经安全序列化后仍保持原值。
- 修改：[`test_desired_state.py`](services/salt-control/tests/test_desired_state.py)
  - 场景：Binding 字段完整、非 System；响应保持既有 OpenAPI camelCase，规范化只发生在 External Pillar 边界。

### 退出条件

- [ ] External Pillar 的配置名、URL、认证头与 Salt Control API 完全一致。
- [ ] 一个合法响应能生成完整签名 Artifact Pillar；SLS 不再读取不存在的字段。
- [ ] 非 `ep_*`、System Binding、空 Binding、坏 Artifact 和认证失败均不会触发 Hermes/Gateway 变更。
- [ ] Pillar、日志、测试输出中不存在 Bearer Token、Device Credential 或私钥。

## 6. Phase 3 — Salt Control Job Invocation Contract

### 目标

保证每个 Control Job 生成的 Function、Arg 和 Kwarg 与 Execution Module 的真实 Python 签名逐字段一致，并补齐 Hermes Upgrade。

### 固定映射

- `install -> smc_hermes.install`
- `upgrade -> smc_hermes.upgrade`
- `configure -> smc_hermes.apply_config`
- `start -> smc_hermes.gateway_start`
- `stop -> smc_hermes.gateway_stop`
- `restart -> smc_hermes.restart`
- `health -> smc_hermes.health`
- `diagnose -> smc_hermes.doctor`
- `rollback -> smc_handover.rollback`
- `handover -> smc_handover.migrate`
- `remigrate -> smc_handover.remigrate`

### 修改

- 修改 Payload：[`job_payload.py`](services/salt-control/src/schemas/job_payload.py)
  - `InstallPayload/UpgradePayload` 对外仅接受 `version`、`component=hermes` 和可选 `hermes_home`；禁止调用方提交 Artifact URL、Digest、Signature、Key ID 或 Public Key。
  - `ConfigurePayload` 固定字段：`config`、可选 `hermes_home`、`config_revision`；`config_revision` 仅写审计 note，不冒充本地 Snapshot Revision。
  - Mutation Payload 缺少必需字段时在 API/Worker 发布前拒绝。
- 修改 Operation：[`job.py`](services/salt-control/src/schemas/job.py)、[`job_service.py`](services/salt-control/src/services/job_service.py)
  - 增加 `upgrade`。
  - 普通 Endpoint Job 要求 `endpoint_id == minion_id` 且匹配 `ep_*`；既有 hostname 到 `ep_*` 的变更只能走独立 Adoption Runbook。
- 修改编解码：[`job_payload_codec.py`](services/salt-control/src/services/job_payload_codec.py)
- 新增服务端解析器：[`artifact_invocation.py`](services/salt-control/src/services/artifact_invocation.py)
  - 使用 Endpoint Platform/Arch、请求 Version 与可信 Artifact Store 解析 URL、SHA-256、Manifest Signature 和 Key ID。
  - Artifact Metadata `key_id` 必须等于 Production Settings 中固定的 `artifact_key_id`；Public Key 只从 `artifact_public_key` 读取。
  - 解析失败或 Key ID 不一致时，在 Salt Publish 前失败关闭。
- 修改 Invocation：[`invocation.py`](services/salt-control/src/services/invocation.py)
  - 仅接收服务端已解析的可信 Artifact Invocation 数据，并发送 Execution Module 声明的参数名。
  - `install/upgrade` 发送由服务端解析的 `artifact_url/artifact_sha256/artifact_signature/key_id/public_key/hermes_home/version`。
  - `configure` 发送 `config/hermes_home/note`。
- 修改 Worker 依赖与组装：[`job_worker.py`](services/salt-control/src/workers/job_worker.py)、[`app.py`](services/salt-control/src/app.py)
- 核对 Execution 签名：[`smc_hermes.py`](infra/salt/extensions/_modules/smc_hermes.py)
- 更新 eAuth 明确 allowlist：[`eauth.conf`](infra/salt/master/master.d/eauth.conf)
- 更新生成契约：[`openapi.yaml`](contracts/salt-control-api/openapi.yaml)

### 测试

- 新增：[`test_invocation_contract.py`](services/salt-control/tests/test_invocation_contract.py)
  - 场景：通过 `inspect.signature` 对比 Invocation Kwarg 与 `smc_hermes`/`smc_handover` 真实函数参数。
  - 场景：Install、Upgrade 使用服务端 Artifact Metadata 和固定 Public Key；Configure 的字段值保持不变且无旧 `url/sha256/revision/desired` key。
  - 场景：API 拒绝调用方提交 Artifact URL/Signature/Public Key；缺少可信 Metadata、Key ID 不匹配或 Config 为空时 Job 在 Publish 前失败。
  - 场景：`endpoint_id != minion_id` 或 hostname Minion ID 被拒绝。
- 修改：[`test_v241_jobs.py`](services/salt-control/tests/test_v241_jobs.py)、[`test_v241_regressions.py`](services/salt-control/tests/test_v241_regressions.py)、[`test_v24_ring0.py`](services/salt-control/tests/test_v24_ring0.py)、[`test_returner_contract.py`](services/salt-control/tests/test_returner_contract.py)
  - 场景：所有 Operation 具有唯一 allowlisted Function、正确 Timeout 与 Mutation 标记。
- 修改：[`test_openapi_export.py`](services/salt-control/tests/test_openapi_export.py)
  - 场景：OpenAPI 包含 Upgrade 和新的 Payload 字段，无生成漂移。

### 退出条件

- [ ] Invocation Contract Test 对全部 Operation 通过。
- [ ] 不再发送 Execution Module 不接受的 Kwarg。
- [ ] Install/Upgrade 无服务端可信 Metadata 或完整签名材料时不会发布 Salt Job，调用方不能替换信任根。
- [ ] OpenAPI、Pydantic、Worker、eAuth 与 Execution Module 使用同一 Function/字段集合。

## 7. Phase 4 — Existing Minion Identity Adoption & Binding Guards

### 目标

使既有 hostname Minion 可安全准备为 Backend `ep_*` 身份，同时保证真正切换、Key Accept、Binding 和旧 Key Revoke 仍是人工门禁。

### 修改

- 加固：[`adopt-existing-minion.ps1`](infra/salt/client/windows/adopt-existing-minion.ps1)
  - 去除对系统 `python`、仓库 `client` import 和当前工作目录的运行时依赖。
  - 使用 PowerShell 原子写入 Adoption Snapshot；失败恢复原 Minion ID、配置和服务启动类型。
  - 脚本只准备新身份，不调用 Master Accept、不撤销旧 Key、不执行 Highstate。
  - 旧 Key 只有在新 `ep_*` 完成 fingerprint compare、accept、ping、sync、inspect/doctor 与 Pillar Gate 后才允许人工撤销。
- 加固：[`minion_identity.py`](infra/salt/client/minion_identity.py)
  - 保留纯逻辑验证；Snapshot Schema 与 PowerShell 输出一致并带 schema/version。
- 修改：[`configure-minion.ps1`](infra/salt/client/windows/configure-minion.ps1)
  - 原子写入单 Master 配置；失败恢复；禁止隐式第二 Master。
- 修改 Backend Binding 校验：[`desired_state_service.py`](services/salt-control/src/services/desired_state_service.py)、[`target_resolver.py`](services/salt-control/src/services/target_resolver.py)、[`management_backend_http.py`](services/salt-control/src/integrations/management_backend_http.py)
  - `windows_account/windows_sid/profile_dir/user_id/revision` 任一为空即失败关闭。
  - 无论 Binding 来自数据库还是 Backend，System/LocalSystem 均拒绝。
  - Minion ID、Endpoint ID 与 Binding Endpoint ID 必须一致。

### 测试

- 修改：[`test_minion_identity.py`](infra/salt/tests/test_minion_identity.py)
  - 场景：Snapshot Schema、原身份恢复条件、旧 Key 撤销门禁。
- 修改：[`ExistingMinionAdoption.Tests.ps1`](infra/salt/tests/canary/ExistingMinionAdoption.Tests.ps1)
  - 场景：无 Python PATH 仍能完成 Dry Run；Dry Run 不写配置、不停止服务、不调用 Master。
  - 场景：配置写入失败时恢复原 ID 和单 Master 配置。
  - 保留 Live Case 为 `Skipped / Manual Gate`。
- 修改：[`test_desired_state.py`](services/salt-control/tests/test_desired_state.py)、[`test_v24_ring0.py`](services/salt-control/tests/test_v24_ring0.py)
  - 场景：数据库和 Backend 两种来源的 System/空 Binding 均被拒绝。
  - 场景：Endpoint/Minion/Binding 身份不一致时不得进入 Job 或 Rollout。

### 退出条件

- [ ] Adoption Dry Run 不依赖外部 Python package，不产生系统变更。
- [ ] 脚本无法自动 Accept/Revoke Key 或执行 Highstate。
- [ ] 所有 Binding 来源共享相同的完整性与非 System 校验。
- [ ] 代码修复完成后，`ITBJB0676` 仍保持原 Minion ID，等待人工 Adoption。

## 8. Phase 5 — Release Candidate & Documentation

### 目标

形成可发布但未自动上线的 v2.4.2 Release Candidate，并同步测试、契约、盘点与操作说明。

### 修改

- 更新 Extension 包 Patch Version `0.2.3` 与说明：[`pyproject.toml`](infra/salt/pyproject.toml)、[`README.md`](infra/salt/README.md)、[`README.md`](infra/salt/master/README.md)、[`README.md`](services/salt-control/README.md)
- 新增未签署状态模板：[`STATUS.md`](docs/salt/evidence/v2.4.2/STATUS.md)
  - 初始状态固定为 `NO-GO / not_proven`，仅记录 v2.4.2 Loader/Contract 修复范围和人工验证入口，不复制或改写历史 Evidence。
- 更新 Production Guard：[`check-production-guards.py`](infra/salt/scripts/check-production-guards.py)
  - 禁止 `_utils` package import、相对 import、HMAC Production、明文 Token、System Gateway 和 hostname Desired State。
- 更新 Release 发布验证：[`publish-salt-release.py`](infra/salt/scripts/publish-salt-release.py)
- 更新 Capability 状态：[`migration-capabilities.yaml`](infra/salt/migration-capabilities.yaml)
  - 自动化通过后四个 blocker 的 `implementationStatus` 可改为 `fixed`。
  - `verificationStatus` 必须保持 `not_proven`，等待 Phase 6。
- 重新生成：[`migration-inventory.json`](migration-inventory.json)、[`migration-inventory.md`](migration-inventory.md)、[`openapi.yaml`](contracts/salt-control-api/openapi.yaml)

### 测试

- [`test_forbidden_guards.py`](infra/salt/tests/test_forbidden_guards.py)
  - 场景：Release Source 中无 package fallback、私钥、明文 Token、Mock Production 或 System Gateway。
- [`test_master_security.py`](infra/salt/tests/test_master_security.py)
  - 场景：External Pillar 使用 Salt Control URL/Token File/Trusted Public Key 配置，且无 Secret 值。
- [`test_production_composition.py`](services/salt-control/tests/test_production_composition.py)
  - 场景：Production 继续 fail closed，不启用 Fake Backend/Artifact/Secret/Master。
- [`test_migration_inventory.py`](infra/salt/tests/test_migration_inventory.py)
  - 场景：代码 Gate 可通过，但 Live Gate 在人工签署前保持失败。

### 退出条件

- [ ] Salt Infra、Salt Control、Contract 和 Guard 全量自动化通过。
- [ ] v2.4.2 Release Candidate 可生成，未自动切换 Master `current`。
- [ ] Inventory 显示 `codeGate=PASS`、`liveGate=FAIL/not_proven`、Production Decision=`NO-GO`。
- [ ] 没有修改历史 Live Evidence，也没有生成伪造 `proven` 结果。

## 9. Phase 6 — Manual Master & ITBJB0676 Verification

### 目标

由操作员验证同一 v2.4.2 Release Candidate 在真实 Salt 3008.2 Master/Minion 上可加载并失败关闭；本 Phase 不执行 Endpoint Identity Adoption 或任何 Hermes 变更。

### 修改

- 人工记录：[`STATUS.md`](docs/salt/evidence/v2.4.2/STATUS.md)
  - 仅操作员写入无 Secret 的 Release Version、Git Commit、执行时间、命令结果摘要和签署状态。
  - 若验证失败，保持 `NO-GO / not_proven` 并记录失败码；禁止修改历史 Evidence。

### 测试

- 实机目标：[`smc_hermes.py`](infra/salt/extensions/_modules/smc_hermes.py)、[`smc_external.py`](infra/salt/extensions/_pillar/smc_external.py)
  - 场景：真实 Salt 3008.2 Loader 下 `loader_status/inspect/doctor/grains` 无异常，hostname 身份在 Adoption 前严格失败关闭。

### 人工 Runbook

以下命令由操作员在服务器仓库根目录执行；Cursor 不得执行或据此自动修改 todo 状态。

1. 发布不可变 Release Candidate：

```text
python3 infra/salt/scripts/publish-salt-release.py --repo-salt infra/salt --releases-root ../../srv/salt/releases publish --version v2.4.2-loader-binding-contract-fix
```

2. 同步 Master External Pillar 并重启唯一 Master：

```text
docker exec salt-master salt-run saltutil.sync_pillar saltenv=base
docker restart salt-master
```

3. 确认原 Minion 连接未受影响：

```text
docker exec salt-master salt 'ITBJB0676' test.ping
docker exec salt-master salt 'ITBJB0676' service.status salt-minion
```

4. 同步 Extension 并验证真实 Loader：

```text
docker exec salt-master salt 'ITBJB0676' saltutil.sync_all refresh=True
docker exec salt-master salt 'ITBJB0676' smc_hermes.loader_status
docker exec salt-master salt 'ITBJB0676' smc_hermes.inspect
docker exec salt-master salt 'ITBJB0676' smc_hermes.doctor
docker exec salt-master salt 'ITBJB0676' grains.item smc_endpoint
```

5. 在尚未进行 Identity Adoption 时验证 Pillar 失败关闭：

```text
docker exec salt-master salt 'ITBJB0676' pillar.get smc_pillar_source
docker exec salt-master salt 'ITBJB0676' pillar.get smc_pillar_error
```

预期：`loader_status.missing=[]`；`inspect/doctor/grains` 不出现 `_utils`、relative import 或 Loader traceback；hostname 身份只允许返回 `identity_adoption_required` 或明确的 Backend unavailable，不得生成可变更 Hermes/Gateway 的 `smc` Desired State。

6. 若任一项失败，人工回滚 Salt Release：

```text
python3 infra/salt/scripts/publish-salt-release.py --releases-root ../../srv/salt/releases rollback
docker restart salt-master
docker exec salt-master salt 'ITBJB0676' saltutil.sync_all refresh=True
docker exec salt-master salt 'ITBJB0676' test.ping
```

### Cursor 约束

- 不替操作员发布 Release、重启容器、同步生产 Extension 或运行实机命令。
- 不执行 Identity Adoption、Key Accept/Revoke、Binding、Hermes Install、Highstate 或 Handover。
- 不把本 Phase todo 自动改为 `in_progress` 或 `completed`。
- 不把 Template、自动化测试或 Dry Run 写成 Live Evidence。
- 不把任何 `not_proven` 自动改为 `proven`。
- 不读取、输出或提交 Master Token File、Trusted Key File 之外的 Secret Material。

### 退出条件

- [ ] `test.ping` 和 Salt Minion Service 保持正常。
- [ ] `loader_status` 无缺失 Utils，`inspect`、`doctor`、Grain 无 Loader 异常。
- [ ] hostname Minion 在 Adoption 前严格失败关闭，不产生 Hermes/Gateway 变更。
- [ ] 操作员保存无 Secret 的命令输出、时间、Release Version 和 Git Commit，并完成人工签署。
- [ ] 仅人工签署后才允许把对应 `verificationStatus` 更新为 `proven`；客户端 Binding 仍需独立后续变更窗口。

## 10. CI / 验证命令

Salt Infra，在 `infra/salt` 执行：

```text
uv run ruff check .
uv run ruff format --check .
uv run pytest -q
uv run python scripts/check-production-guards.py
```

Salt Control，在 `services/salt-control` 执行：

```text
uv run ruff check .
uv run ruff format --check .
uv run pytest -q
```

仓库根目录执行：

```text
uv run --project services/salt-control python tools/contract-generate/export_salt_control_openapi.py
npm run contracts:check
python scripts/salt-migration-inventory.py
git diff --check
```

Windows 自动化环境在仓库根目录执行：

```text
Invoke-Pester -Path infra/salt/tests/canary/ExistingMinionAdoption.Tests.ps1
```

人工 Phase 6 完成并签署后，仓库根目录执行 Production Gate：

```text
python scripts/salt-migration-inventory.py --check
```

## 11. 风险与回滚

- 风险：Utils 重命名后旧 Minion Cache 同时存在新旧文件。缓解：不可变 Release 不携带旧 Helper；`sync_all refresh=True` 后检查 `loader_status`；失败立即切回 previous Release。
- 风险：External Pillar Schema 错误导致 Highstate 误删配置。缓解：任何网络、认证、Binding、Artifact、Key 或 Schema 错误均返回空 `smc` 和稳定错误码；SLS 不对空 `smc` 执行变更。
- 风险：调用方替换 Artifact 信任根，或公钥/Token 泄露。缓解：Job API 不接受 URL、Signature、Key ID 或 Public Key；Salt Control 只使用可信 Artifact Store 和固定 Public Key；私钥永不分发；Token/File 内容禁止进入返回、日志和测试。
- 风险：Job Contract 改动破坏旧调用方。缓解：OpenAPI 与 Payload Discriminator 同步更新，Mutation Payload 缺失字段在 Publish 前明确失败，不做静默兼容映射。
- 风险：身份接管导致当前 Accepted Key 中断。缓解：Phase 4 只修脚本，Phase 6 不执行 Adoption；未来独立窗口必须在新身份全验证后才人工撤销旧 Key。

## 12. DoD

- [ ] 以本计划第 2–8 节为唯一实施需求基线；历史 PRD/ADR 不作为 Cursor 前置阅读任务。
- [ ] 每个工程 Phase 单独提交，并包含对应测试与文档；禁止一次提交混入生产操作结果。
- [ ] Salt Extension 生产路径完全移除 `_utils` package fallback 和相对导入。
- [ ] External Pillar、Desired State、Artifact、SLS 的 URL、认证和字段契约端到端一致。
- [ ] Salt Control Job Payload、Invocation、OpenAPI、eAuth 与 Execution Module 签名一致。
- [ ] `ITBJB0676` 在本计划工程阶段保持原身份；Binding、Hermes Install 和 Handover 均未执行。
- [ ] Migration Inventory 不再硬编码 P0/P1，并在人工验证前保持 Production `NO-GO`。
- [ ] Manual Phase 仅在操作员完成真实 Salt 3008.2 证据和签署后才允许完成。
- [ ] 未达门禁不得进入 Endpoint Binding、Highstate、Hermes 接管、Ring 0、HA 或 Runtime Decommission。
