---
title: "smc-copilot Work + Hermes Native Enterprise Fork Runtime v2.1.1 工程级解决方案 PRD"
prd_id: "PRD-WORK-HERMES-NATIVE-ENTERPRISE-RUNTIME-V2"
version: "2.1.1"
status: "APPROVED_FOR_PLAN"
status_reason: "v2.1.1 independent re-review PASS (M-01 closed). Plan authorized on work/prd-v6.0 @ 1ad1af60. Filename kept for continuity."
approved_for_plan_at: "2026-09-18"
product: "smc-copilot / apps/work"
repository: "loudon84/smc-copilot"
branch: "work/prd-v6.0"
baseline_commit: "1ad1af60a2ab13d93da92cb06cb3b7aff7a08e31"
implementation_workspace: "work/prd-v6.0 @ 1ad1af60a2ab13d93da92cb06cb3b7aff7a08e31"
owner: "SMC Copilot Team"
reviewers:
  - "Work Tech Lead"
  - "Hermes Enterprise Fork Maintainer"
  - "Release Engineer"
  - "QA"
created_at: "2026-09-18"
updated_at: "2026-09-18"
grill_freeze_at: "2026-09-18"
blocker_closure_at: "2026-09-18"
target_release: "Work Runtime Architecture v2"
change_type:
  - "ARCHITECTURE_CHANGE"
  - "INTEGRATION"
  - "GOVERNANCE"
golden_consumer:
  - "smc-copilot/apps/work @ work/prd-v6.0"
  - "Hermes Enterprise Fork origin http://git.superic.com/aiplatform/hermes-agent.git (canonical identity from release/client-release.yaml hermes.source)"
related_docs:
  - "需求PRD工程模板.md / template_version=1.0"
  - "docs/adr/ADR-031-opsi-parallel-endpoint-control-plane.md"
  - "docs/adr/ADR-038-hermes-native-enterprise-lifecycle.md"
  - "docs/work/reviews/prd-work-hermes-native-enterprise-fork-runtime-v2.1.0-initial-review.md"
  - "docs/work/reviews/prd-work-hermes-native-enterprise-fork-runtime-v2.1.1-revision-review.md"
  - "docs/work/reviews/prd-work-hermes-native-enterprise-fork-runtime-v2.1.1-m01-closure-review.md"
  - "release/hermes-runtime-profiles.yaml"
  - "scripts/build-client-release.ps1"
  - "tools/release/client/build_client_release.py"
  - "release/client-release.yaml"
  - "apps/work/src/main/runtime/*"
  - "apps/work/src/main/hermes.ts"
  - "apps/work/src/main/hermes/control-owner.ts"
  - "apps/work/src/shared/runtime/control-owner.ts"
  - "apps/work/src/main/utils.ts"
  - "apps/work/src/main/skills.ts"
  - "apps/work/src/main/run-stream.ts"
  - "e:\\git\\hermes-agent (company fork working copy)"
supersedes:
  - "SMC Managed Hermes Runtime + Custom Windows Installer + OPSI distribution architecture"
  - "ADR-031 Decision 2 and Decision 4 (Hermes lifecycle) via ADR-038"
  - "PRD v2.0.0 APPROVED_FOR_PLAN claim (invalid)"
  - "PRD v2.1.0 DRAFT (BLOCKERs open)"
template: "工程级需求 PRD 严格模板 v1.0"
---

# 0. Document Meta / PRD 使用约束

本 PRD 是 **Engineering Contract PRD**。其目标不是描述一个方向性方案，而是定义可直接编译为实施计划的唯一语义合同。

本 PRD 使用 `MUST / MUST NOT / SHOULD / SHOULD NOT / MAY` 作为规范关键词：

- `MUST`：必须实现、必须测试、必须有 Evidence。
- `MUST NOT`：违反即 Requirement FAIL。
- `SHOULD`：默认应满足，偏离必须有 Evidence 说明。
- `SHOULD NOT`：原则上禁止，偏离必须有明确批准记录。
- `MAY`：可选，不影响主 Release Gate。

任何 Plan Agent / Coding Agent 如果无法唯一确定状态源、默认行为、所有权、失败处理、验收 Oracle，必须输出 `SPEC_SEMANTIC_GAP` 并阻止对应 Plan Todo 进入 `implemented`。

本文件 v2.0.0 曾标注 `APPROVED_FOR_PLAN` 且「无 SPEC_SEMANTIC_GAP」。该声明无效。v2.1.0 写入 grilling freeze。v2.1.1 关闭独立 review BLOCKER，经 revision review + M-01 closure review PASS。**冲突条款以 §0.1 然后 §0.2 为准。** 当前 status = `APPROVED_FOR_PLAN`。实现工作区固定为 `work/prd-v6.0 @ 1ad1af60a2ab13d93da92cb06cb3b7aff7a08e31`。

---

# 0.1 Grilling Freeze (2026-09-18) — 覆盖合同

本节覆盖下文任何相反条款。Plan / Coding Agent MUST 先读本节。

```text
F-001  ADR-031：Hermes 生命周期 Owner 不再是 opsi。本地生产永远 Native/direct。
       残留 control-owner.json hermes=opsi|salt MUST NOT BLOCK READY；Doctor MAY 警告。
       runtime Owner 仅显式 lab，不是生产默认。OPSI MUST NOT 再参与 Hermes
       install/update/distribution/lifecycle。OPSI 仍可管理非 Hermes 产品。

F-002  生产 Hermes Root = %LOCALAPPDATA%\hermes。
       Work 现网「禁止 LOCALAPPDATA hermes」的校验 MUST 删除。
       Work/Bootstrap 进程环境 MUST 钉 HERMES_HOME=%LOCALAPPDATA%\hermes，
       以免开发机 HKLM HERMES_* 劫持 Native 默认。

F-003  唯一源半径 = Hermes Git only。
       MUST NOT：clone / fetch / ZIP / 添加 upstream / banner 更新探测 指向
       NousResearch/hermes-agent 或 github.com 上的该仓。
       MAY：uv、Node、Git for Windows 走公网安装器。

F-004  Official Identity 两层：
       (a) 企业 fork 的 install.ps1 与 OFFICIAL_REPO_* 默认 = 企业仓 URL；
       (b) Bootstrap 按 release/client-release.yaml#hermes.source 写入
           Hermes Root/official-source.json（无凭据）。
       hermes update / banner 的 official 检测 MUST 读该 identity。
       企业 origin MUST 被当作 official distribution origin，MUST NOT 再走
       fork→NousResearch upstream。
       Maintainer 同步公开 upstream 仅允许在服务端 / 显式环境变量覆盖。

F-005  Native Profile：Hermes Root 恒定；Active Profile Home 可以是
       Root 或 Root\profiles\<name>。允许按 Native 设置进程 HERMES_HOME =
       Active Profile Home。禁止把 Root 改成 profiles\<name> 来「换 Home」。

F-006  安装钉 approvedCommit。之后 hermes update 跟随企业
       origin/<defaultBranch>（hermes.update.policy=follow-defaultBranch）。
       Work 只做 version + required-capability 门禁。
       Work 启动 MUST NOT 自动 hermes update。

F-007  单交互用户设备。不按 Windows 用户分配 API 端口。
       默认 Gateway = 127.0.0.1:8642。
       同一用户 named profile：Work 分配并持久化
       platforms.api_server.extra.port 到该 profile 的 config.yaml。
       Policy MUST NOT 覆盖 named profile 已写入的非冲突端口。

F-008  Gateway Owner = 当前用户 Native 计划任务（hermes gateway install，
       /SC ONLOGON，不是 Windows SCM Service，不是 SYSTEM/AtStartup）。
       Work MAY 在未就绪时调用 hermes gateway start。
       Work 退出 MUST NOT 杀死 Gateway。

F-009  干净机第一次安装 = Work 首次启动用户态 Bootstrap。
       捆绑物 = 企业 fork install.ps1 + hermes-native-manifest.json。
       MUST NOT 捆绑 Hermes runtime ZIP / embedded Python / Node / wheelhouse。
       clone 仍走企业 Git。install.ps1 MUST 接受企业 RepoUrl 且无 GitHub ZIP fallback。

F-010  authMode 生产默认 = anonymous-internal。
       当前 golden origin = http://git.superic.com/aiplatform/hermes-agent.git。
       allowedHosts 含 git.superic.com。YAML MUST 显式列出 http 与 https
       为同一 repositoryIdentity。实现者 MUST NOT 猜测跨协议等价。

F-011  Chat READY 的 required capabilities SOT = Work 代码
       （apps/work/src/main/run-stream.ts 及同等门禁）。
       YAML 只保留 hermes.compatibility.minVersion / testedVersion。
       可选能力缺失只关对应 UI，不拉倒 READY。

F-012  首次 Bootstrap：主窗口可开；状态 INSTALLING/ABSENT/FAIL 时
       MUST 禁用本地 chat。MUST NOT 对未就绪 Gateway 发聊天。

F-013  SMC Policy 跟 Work 发版走：包内 hermes-policy/<version>.json，无密钥。
       API_SERVER_KEY = create-if-absent，不进 policy 文件。

F-014  smc-managed 拆两半：
       Install extras → 企业 fork Native setup（python extras / node packages /
       lazyInstall=false），SOT = release/hermes-runtime-profiles.yaml#smc-managed
       直至迁入 fork。Work MUST NOT pip install。
       Config policy → Work 包内 JSON，来源为同一 yaml 的 gateway +
       managedConfig.defaults + enforced；路径 MUST 使用 Hermes Root
       相对/展开路径，MUST NOT 写死 C:\ProgramData\SMC\Hermes。

F-015  无生产存量、无用户数据迁移产品。
       REQ-MIGRATE / A-MIGRATE / RG-011 / Phase 6 迁移事务 = NON-GOAL。
       MUST NOT 实现 MIGRATION_REQUIRED 状态机或 elevated repair。
       Doctor MAY 提示 ProgramData / SYSTEM 任务 / HKLM HERMES_*。
       仓库仍 MUST 删除 Managed bundle / WiX installer / OPSI smc-hermes-agent。
       LOCALAPPDATA 错误 origin 走 Repair（F-016），不是 legacy migration。

F-016  已有 Native checkout 且 origin identity ≠ 企业 identity：
       BLOCK = HERMES_REPO_ORIGIN_MISMATCH。
       仅当用户显式确认 Repair：T0 备份后按企业 identity + approvedCommit 重装。
       MUST NOT 静默 git remote set-url。

F-017  绿场失败回滚仍有效（clone/install/policy/gateway 中途失败不得报 READY）。
       这不是用户数据迁移。
```

---

# 0.2 v2.1.1 BLOCKER Closures — 覆盖合同

本节关闭 `docs/work/reviews/prd-work-hermes-native-enterprise-fork-runtime-v2.1.0-initial-review.md` 的 BLOCKER。覆盖下文相反条款。优先级：§0.2 > §0.1 > 其余章节。

```text
C-001  Hermes Git URL 选择（关闭 F-01）
  hermes.source.installUrl = YES。Bootstrap 与 install.ps1 -RepoUrl 只使用该 URL。
  repositoryHttp / repositoryHttps / repositorySsh 至少出现一个。
  未出现的协议字段 MUST 省略（不要填假 URL）。
  installUrl MUST 等于其中一个已列 URL（canonical identity 比较）。
  HTTP-only 合法。schemeAliases 只允许在「已列出的 URL」之间声明等价。
  当前 golden：installUrl = http://git.superic.com/aiplatform/hermes-agent.git
  residual HTTP 风险：内网匿名、allowedHosts、无公开 fallback；批准主体 = 本 PRD freeze Q15。
  MUST NOT 因缺少 HTTPS/SSH 字段而 RELEASE_CONFIG_INVALID。

C-002  Git 前置（关闭 F-02）
  Bootstrap MUST 在 ls-remote 之前确保 Git。
  方法：bundled install.ps1 -Stage git -NonInteractive -HermesHome <Root>
        （fork 已有 Stage-Git / PortableGit）。
  随后 git 命令 MUST 使用该 Git（刷新 User PATH，或显式
        %LOCALAPPDATA%\hermes\git\cmd\git.exe）。
  无系统 Git 的干净机 MUST 能完成预检。AC: A-INSTALL-004。

C-003  official-source.json（关闭 F-03）
  路径 = Hermes Root\official-source.json（不是 checkout 内）。
  解析 Root：若进程 HERMES_HOME 以 \profiles\<name> 结尾，Root = 其祖先 Hermes Root；
             否则 Root = 进程 HERMES_HOME（default）。
  Schema 见 §9.3。原子写：同目录 tempfile + rename。
  缺失/schemaVersion 不支持/identity 与 YAML 不一致
        → HERMES_OFFICIAL_IDENTITY_INVALID；禁止 update；禁止公开 fallback。
  update_cmd.py / banner.py MUST 按上述 Root 解析读取，不得只看 PROJECT_ROOT。

C-004  Named profile Gateway（关闭 F-04）
  default：Bootstrap 调 `hermes gateway install` 然后必要时 `hermes gateway start`。
           任务 = 当前用户 ONLOGON。端口 8642。
  named profile 第一次被 Work 选为 active 或对其发本地 chat 之前：
           1) getProfilePort 持久化非冲突端口
           2) hermes -p <name> gateway install
           3) 若 /health 非 200 → hermes -p <name> gateway start
  删除 named profile：hermes -p <name> gateway uninstall。
  Work 退出 MUST NOT stop/uninstall 任一 profile Gateway。
  单交互用户约束仍适用（多 Windows 用户不支持）。
  AC: A-GW-003, A-GW-004。

C-005  ADR SOT（关闭 F-05）
  仓库交付物 docs/adr/ADR-038-hermes-native-enterprise-lifecycle.md。
  ADR-031 Decision 2 与 4 已被 ADR-038 supersede。
  Plan MUST 修改 apps/work/src/main/hermes/control-owner.ts
        与 apps/work/src/shared/runtime/control-owner.ts，不得虚构 src/main/control-owner.ts。

C-006  Policy 字段映射（关闭 F-07）见 §9.4。Plan MUST NOT 猜测键名。

C-007  Electron Bootstrap 执行（关闭 F-08）
  仅 connectionMode=local（含缺省）执行 Bootstrap。remote/ssh：零本地 Runtime mutation。
  切回 local 且 ABSENT → 再 Bootstrap。
  可执行文件: %SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe
  固定参数: -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <bundled install.ps1>
  互斥: Local\SMC-Work-HermesBootstrap-<WindowsUserName>；第二窗口等待，不得并行 installer。
  超时: 1800s → FAIL，杀进程树，不 READY。
  取消: 杀进程树，INSTALLING→FAIL。
  日志: app.getPath("userData")/logs/hermes-bootstrap-<operationId>.log
        MUST NOT 含凭据或 credential-bearing URL。
  AC: A-INSTALL-005, A-INSTALL-006。

C-008  HTTP 残留风险（F-06 非 BLOCKER）
  不强制 HTTPS。补偿：allowedHosts、identity alias、禁止公开 GitHub、匿名内网。
```

---

# 1. Goal

让 `smc-copilot/apps/work` 在 Windows 端 **不再构建、不再分发、不再拥有 Hermes Agent Runtime**，而是通过公司自有 Git 仓库维护的 **Hermes Native Enterprise Fork** 完成 Hermes 的原生安装、原生 Gateway 生命周期和原生更新；Work 仅通过 Native CLI + Gateway HTTP API + HERMES_HOME 文件契约集成 Hermes，同时彻底移除 OPSI 对 Hermes 发布更新的职责，并保证所有终端设备的 Hermes 安装源与更新源只指向公司自有 Hermes Git 仓库。

可观察最终结果：

```text
Work Desktop
    │
    ├── Hermes Runtime Adapter
    │      ├── Native CLI
    │      ├── Gateway HTTP API
    │      └── Native HERMES_HOME
    │
    └── 不包含 Hermes Runtime

Hermes Native Enterprise Fork
    │
    ├── Company Git Repository = endpoint 唯一 Hermes Git 安装源
    ├── Company Git Repository = endpoint 唯一 Hermes Git 更新源
    ├── Native Installer（默认企业 Official Identity；无 GitHub ZIP fallback）
    ├── Native Gateway（用户 ONLOGON 计划任务，不是 SCM Service）
    ├── Native Plugin / Skill / Profile / Memory
    ├── smc-managed extras（fork setup 预装）
    └── Native Update（official = 企业 origin）

OPSI
    └── 不参与 Hermes install / update / distribution / lifecycle
        （ADR-031 hermes=opsi 对 Hermes 作废）
```

---

# 2. Background

## 2.1 Current Capability Inventory

基线：`loudon84/smc-copilot`，分支 `work/prd-v6.0`，基线 commit：

```text
1ad1af60a2ab13d93da92cb06cb3b7aff7a08e31
```

后续代码变动 MUST 在该工作区进行。

当前工程事实：

| Current Capability | Current Implementation | Current Owner | Problem |
|---|---|---|---|
| Work Windows Build | `npx nx run work:package-win` | smc-copilot | KEEP |
| Hermes Runtime Build | `tools/release/hermes/build_runtime.py` | smc-copilot | Work 构建 Hermes Python/Node/runtime，Owner 重叠 |
| Hermes Windows Installer | `infra/windows/hermes-agent/installer` | smc-copilot | 自定义 WiX/MSI/Burn 与 upstream installer 并存 |
| Hermes Runtime ProgramRoot | `D:\Programs\SMC\Hermes` | SMC Managed Runtime | 与 Hermes Native Home 分裂 |
| Managed HERMES_HOME | `C:\ProgramData\SMC\Hermes` | SMC Managed Runtime | 与 Native CLI 实际 `%LOCALAPPDATA%\hermes` 分裂 |
| Hermes Plugins | Hermes Native `HERMES_HOME\plugins` | Hermes | 当前 Work/Managed Runtime Home 与 CLI Home 不一致 |
| Gateway Process | Managed endpoint/runtime service ownership | SMC Runtime Service | Work 源码明确不拥有 Gateway，但依赖 endpoint management service |
| Release Pipeline | Work + Hermes + Installer + OPSI | smc-copilot | 发布链过重、耦合、升级复杂 |
| OPSI | Hermes package / endpoint distribution | OPSI | 本决策要求彻底退出 Hermes 管理 |
| Hermes Source | `release/client-release.yaml` 指向本地 `D:/git/hermes-agent` | Release machine | 不是终端安装/更新的企业 Source Contract |

当前 `build-client-release.ps1` 暴露的 stage 包含：

```text
preflight
work
hermes
hermes-installer
runtime
opsi-stage
opsi-package
assemble
verify
all
```

当前 `tools/release/client/build_client_release.py` 同时负责：

```text
build_managed_bundle()
run_hermes_installer()
run_opsi_pipeline()
capture_opsi_client_installer()
assemble()
verify()
```

当前 `release/client-release.yaml` 仍是 `schema: smc.client-release.config.v1`，Hermes 字段为本地路径而非企业 Source Contract：

```text
hermes.repo: D:/git/hermes-agent
hermes.profile: smc-managed
```

当前 Work 生产默认：

```text
HERMES_HOME   = C:\ProgramData\SMC\Hermes
programRoot   = D:\Programs\SMC\Hermes
cliPath       = D:\Programs\SMC\Hermes\bin\hermes.exe
gateway       = http://127.0.0.1:8642
```

`legacy-local-runtime-adapter` 在 home 等于 `%LOCALAPPDATA%\hermes` 时判定 `configuration_error`。**v2.1 必须删除该禁令。**

当前 `control-owner.json` 允许 `direct | salt | opsi | runtime`。ADR-031 在 `hermes: opsi` 时把生命周期交给 OPSI。**v2.1 本地生产忽略该分发，永远 Native/direct。**

## 2.2 Hermes Native Baseline

Hermes Native Windows Installer 默认：

```text
HERMES_HOME = %LOCALAPPDATA%\hermes
InstallDir  = %LOCALAPPDATA%\hermes\hermes-agent
```

Native Plugin 目录遵循：

```text
HERMES_HOME\plugins
```

Native Gateway 提供：

```text
hermes gateway start
hermes gateway stop
hermes gateway restart
hermes gateway status
hermes gateway install
hermes gateway uninstall
```

对照公司 fork 工作副本 `e:\git\hermes-agent`（origin = `http://git.superic.com/aiplatform/hermes-agent.git`）的**当前代码事实**：

```text
scripts/install.ps1
  - 无 -RepoUrl 参数
  - RepoUrlSsh / RepoUrlHttps 写死 NousResearch/hermes-agent
  - Git clone 失败则 ZIP 回退到 github.com/NousResearch/hermes-agent
  - HERMES_HOME 默认 %LOCALAPPDATA%\hermes
  - InstallDir 默认 %LOCALAPPDATA%\hermes\hermes-agent
  - 另从公网拉取 uv / Git for Windows / Node（本 PRD 允许，不属于 Hermes Git 唯一源）

hermes_cli/update_cmd.py   （不是 update_cmd_git.py）
  - OFFICIAL_REPO_URLS = 四个 NousResearch URL
  - 企业 origin 会被判为 fork，可添加/fetch upstream → 公开 GitHub

hermes_cli/banner.py
  - 更新探测打 NousResearch ls-remote / GitHub compare API

Gateway（hermes_cli/subcommands/gateway.py + gateway_windows.py）
  - CLI：start/stop/restart/status/install/uninstall 存在
  - Windows 持久化 = 当前用户 Scheduled Task /SC ONLOGON（任务名默认 Hermes_Gateway）
  - 不是 Windows SCM Service；不是现网 SYSTEM / AtStartup 的「SMC Hermes Gateway」
  - 默认 127.0.0.1:8642；GET /health 无认证；GET /v1/capabilities 在设置 API_SERVER_KEY 时需 bearer

Profiles（hermes_cli/profiles.py + main.py）
  - named profile 将进程 HERMES_HOME 设为 <root>\profiles\<name>
  - git checkout 仍在 <root>\hermes-agent
```

本机对 `http://git.superic.com/aiplatform/hermes-agent.git` 的 `git ls-remote` 可匿名成功，对应 `authMode=anonymous-internal`。

**公司 fork 的 origin 已是企业仓，但源码仍把 NousResearch 当 Official。该默认行为不能用于生产终端。**

## 2.3 Problem

当前存在以下可验证问题：

1. Work 构建系统、SMC Hermes Installer、OPSI、Hermes Native Installer 同时参与 Hermes 生命周期，无法形成唯一 Runtime Owner。
2. Work 当前 Managed HERMES_HOME 与 Hermes Native CLI 实际 HERMES_HOME 可分裂；Work 甚至禁止生产使用 `%LOCALAPPDATA%\hermes`。
3. 公司 fork origin 已是 `git.superic.com`，但 `install.ps1` / `update_cmd.py` / `banner.py` 仍把 NousResearch 当 Official，并带 GitHub ZIP 回退。
4. 当前 release pipeline 仍包含 Hermes Runtime build、WiX installer、OPSI stage/package。
5. `release/client-release.yaml` v1 只有 `hermes.repo` 本地路径，不是终端 Source Contract。
6. Named profile 的 Native 语义是改进程 `HERMES_HOME`；PRD v2.0.0 误写成禁止该行为。
7. 现网 `smc-managed` extras（pip/node/hindsight 等）由 Managed 安装器提供；去掉 bundle 后必须迁入 fork setup。

产品现状：smc-copilot **尚未正式上线**，不存在历史客户端安装残留，也没有用户数据迁移问题。因此 v2.1 **不做** fleet migration 产品；仍须从仓库删除 Managed/OPSI/WiX 代码。

## 2.4 Impact

```text
业务影响：
- Work 的 Agent 能力依赖 Hermes，路径或 Gateway Source 分裂会直接导致功能不可用。

工程影响：
- SMC 重复维护 Python/Node/runtime/installer/update。
- upstream Hermes 版本升级需要同步修改 SMC build_runtime 与 installer。

安全影响：
- 若终端 update 仍可访问公开 upstream，则企业 fork 不能成为唯一受控软件供应链入口。
- 若私有 Git 凭据进入命令行、日志或 manifest，会产生 credential exposure。

运维影响：
- OPSI、SMC Runtime Service、Native Hermes 同时参与生命周期，故障定位存在多 Owner。

AI Coding 影响：
- 当前 Runtime Source / Home / Lifecycle 多源，Plan Agent 无法通过单一 SOT 推导正确修改范围。
```

---

# 3. Scope / Non-goal

## 3.1 In Scope

```text
SCOPE-001  Work Runtime 访问路径改为 Hermes Native Runtime。
SCOPE-002  Hermes 安装源改为公司自有 Hermes Git 仓库。
SCOPE-003  Hermes 更新源改为同一公司自有 Hermes Git 仓库。
SCOPE-004  终端禁止自动建立或使用公开 NousResearch upstream remote；禁止 GitHub ZIP 回退与 banner 公开更新探测。
SCOPE-005  HERMES_HOME Root 统一到 Hermes Native Home（%LOCALAPPDATA%\hermes）。
SCOPE-006  Gateway 生命周期归用户会话 Native Gateway 计划任务。
SCOPE-007  Plugins / Skills / Profiles / Memory 与 Native Profile 语义对齐。
SCOPE-008  Work 自有配置写入 Electron userData，不写 Hermes Root 的 desktop.json。
SCOPE-009  SMC 企业 Policy 以 Work 包内 JSON structural merge 应用到 Native Hermes。
SCOPE-010  移除 Hermes Runtime Builder、SMC Hermes Installer、OPSI Hermes 发布链（代码删除，不是用户迁移）。
SCOPE-011  绿场 Bootstrap 失败语义 + 错误 origin 的显式 Repair。MUST NOT 做存量用户数据迁移。
SCOPE-012  新建 Native Bootstrap + Enterprise Repository Preflight。
SCOPE-013  Version + Capability Compatibility Contract（capability SOT = Work 代码）。
SCOPE-014  新建 Runtime Diagnostics / Evidence。
SCOPE-015  企业 fork Native setup 预装 smc-managed extras。
SCOPE-016  ADR-031 Hermes=opsi 作废；本地 control-owner 忽略，永远 native/direct。
```

## 3.2 Out of Scope

```text
NON-GOAL-001 本 PRD MUST NOT 重新开发 Hermes Agent Runtime。
NON-GOAL-002 本 PRD MUST NOT 修改 Hermes Agent 的业务 Agent 逻辑。
NON-GOAL-003 Work MUST NOT 自己实现 Python / Node / venv 管理，也 MUST NOT pip install extras。
NON-GOAL-004 Work MUST NOT 自己 spawn `python -m hermes_cli.main gateway run` 作为生产 Gateway。
NON-GOAL-005 Endpoint MUST NOT 从公开 NousResearch GitHub 直接安装或更新 Hermes。
NON-GOAL-006 OPSI MUST NOT 保留任何 Hermes install/update fallback。
NON-GOAL-007 本 PRD不负责公司 Hermes Fork 与公开 upstream 的服务端同步流程；该同步属于 Hermes Fork Maintainer / CI。
NON-GOAL-008 本 PRD不定义企业 Git 帐号发放流程。生产默认 anonymous-internal。
NON-GOAL-009 本 PRD MUST NOT 实现存量客户端用户数据迁移、MIGRATION_REQUIRED 状态机或 elevated repair。产品尚未上线，无历史安装残留。
NON-GOAL-010 本 PRD MUST NOT 为并发 Windows 用户分配独立 Gateway 端口。生产约束 = 单交互用户设备。
NON-GOAL-011 uv / Node / Git for Windows 公网安装器不在「Hermes 唯一源」半径内，本 PRD 不建设空气间隙镜像。
```

## 3.3 Architecture Boundary

| Domain | Owner | Input | Output | 不负责 |
|---|---|---|---|---|
| Work Desktop | SMC Copilot | User action / Hermes API | UI / Runtime commands | Hermes Runtime internals |
| Runtime Adapter | Work | Native discovery / CLI / API | normalized runtime state | Python/Node provisioning |
| Hermes Runtime | Hermes Enterprise Fork | config / profile / CLI | Agent / Gateway | Work UI |
| Hermes Distribution Source | Company Git | immutable commit / branch policy | clone/fetch | Work release |
| Hermes Fork Upstream Sync | Hermes Fork CI | public upstream | approved enterprise commits | endpoint update |
| SMC Policy | SMC Copilot | Work 包内 policy JSON | managed config fields | extras pip / user-owned config / named profile 端口 |
| Work Release | SMC Copilot | Work source + bootstrap metadata | Work installer / bootstrap + policy JSON | Hermes runtime ZIP |
| OPSI | None for Hermes | None | None | Hermes install/update/lifecycle |

---

# 4. Architecture Boundary / Target End-State

## 4.1 Target Architecture

```text
┌──────────────────────────────────────────────────────────┐
│                    SMC Copilot Work                      │
│                                                          │
│ Chat / Knowledge / Skill UI / Plugin UI / Expert / Files │
└──────────────────────────┬───────────────────────────────┘
                           │
                    Runtime Adapter
                           │
           ┌───────────────┼────────────────┐
           │               │                │
      Native CLI       Gateway HTTP      Filesystem
           │          127.0.0.1:8642     HERMES_HOME
           │               │                │
           └───────────────┴────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────┐
│              Hermes Native Enterprise Fork              │
│                                                         │
│ Agent / Gateway / Plugins / Skills / Profiles / Memory │
│ Native Installer / Native Update / Python / Node       │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
                 Company Hermes Git Repository
                 (endpoint唯一 install/update source)
```

## 4.2 Runtime Ownership Invariant

```text
INV-ARCH-001
Hermes Runtime executable/runtime files 的唯一 Owner = Hermes Native Installer。

INV-ARCH-002
Hermes Gateway process lifecycle 的唯一 Owner = 当前用户的 Hermes Native Gateway 计划任务（ONLOGON），不是 Windows SCM Service，不是 SYSTEM「SMC Hermes Gateway」。

INV-ARCH-003
Work 只拥有 Runtime Adapter，不拥有 Hermes Python/Node/runtime。

INV-SOURCE-001
Endpoint 的 Hermes install source 与 update source MUST resolve 到同一 Enterprise Repository Identity。

INV-SOURCE-002
Endpoint runtime MUST NOT 自动 fetch / pull / add remote 到公开 NousResearch/hermes-agent。
```

---

# 5. Terminology / Domain Model

| Term | Definition |
|---|---|
| Hermes Enterprise Fork | 公司自有 Git 仓库中的 Hermes Agent fork，终端唯一受控 Hermes Git 软件源。当前 golden origin：`http://git.superic.com/aiplatform/hermes-agent.git` |
| Enterprise Repository Identity | `release/client-release.yaml` 中 `hermes.source` 的 canonical repo identity；HTTP/HTTPS 仅当 YAML 显式 alias 时视为同一 identity |
| Official Identity | endpoint 上视为 official 的仓身份。企业 origin MUST 是 official，MUST NOT 被当成需同步 NousResearch 的 fork |
| Public Upstream | `NousResearch/hermes-agent`，仅允许公司 Fork CI / Maintainer 使用 |
| Hermes Root | Windows 生产默认 `%LOCALAPPDATA%\hermes`。含 `hermes-agent/` checkout。生产不变 |
| Active Profile Home | Native 为当前 profile 设置的进程 `HERMES_HOME`。default = Hermes Root；named = `Hermes Root\profiles\<name>` |
| Native Checkout | `${Hermes Root}\hermes-agent` 中由 Hermes Native Installer 管理的 Git checkout |
| Runtime Adapter | Work Main Process 对 Hermes Native CLI、Gateway API、filesystem 的适配层 |
| Bootstrap | Work 首次启动的用户态入口：repo preflight、执行捆绑 install.ps1、Policy、Gateway readiness。不携带 Hermes runtime |
| Repair | 用户显式确认后，对错误 origin 的 Native checkout 做 T0 备份并以企业 identity 重装。不是 legacy migration |
| Enterprise Policy | Work 发版包内 JSON 所管理的 Hermes 配置字段集合 |
| User-owned Config | Enterprise Policy scope 之外的 Hermes config / .env / profile 内容 |
| smc-managed extras | `release/hermes-runtime-profiles.yaml#smc-managed` 规定的 python extras / node packages；由 fork Native setup 预装 |
| Compatible | Hermes version 与 Work 代码 required capabilities 同时满足 |
| Ready | Native Runtime 存在、Repo identity 正确、Gateway health 成功、Work required capabilities 存在 |
| Adopt | 明确验证并接受一个已有 Native Hermes checkout 进入 Work 管理视图，不表示 Work 获得 Runtime ownership |
| Golden Consumer | 真实 `smc-copilot/apps/work` 与真实公司 Hermes Fork 的组合验收环境 |

---

# 6. System Context

## 6.1 Context Diagram

```text
User
 ↓
SMC Copilot Work
 ↓
Native Runtime Adapter
 ├──────────────────→ hermes CLI
 ├──────────────────→ Hermes Gateway HTTP
 └──────────────────→ HERMES_HOME
                         │
                         ▼
                Hermes Enterprise Fork
                         │
               clone / fetch / update
                         │
                         ▼
                Company Git Repository

Company Hermes Fork CI
        ↑
        │ server-side sync only
        │
NousResearch/hermes-agent
```

## 6.2 System Boundary

```text
Inside boundary:
- smc-copilot Work runtime adapter
- Native bootstrap
- SMC Policy merge
- wrong-origin Repair
- release pipeline v2
- endpoint repository identity enforcement
- compatibility / diagnostics

Outside boundary:
- Hermes Agent core business behavior
- enterprise Git user/device account issuance
- public upstream → company fork merge/rebase approval process

External dependency:
- Company Hermes Git Repository
- Git client（anonymous-internal；GCM/SSH 非生产默认）
- Hermes Native Installer
- Hermes Native Gateway HTTP API

Trusted input:
- signed Work release
- release/client-release.yaml
- hermes-native-manifest.json
- company Git repository identity
- approved Hermes commit SHA

Untrusted input:
- user-modified Hermes config outside managed scope
- arbitrary environment variable values
- arbitrary Git remote on pre-existing checkout
- downloaded data not covered by digest
```

---

# 7. Authoritative State / Source of Truth

| State | Role | Type | Authoritative? | Writer | Reader | 可否自动覆盖 |
|---|---|---|---:|---|---|---:|
| `hermes.source.installUrl` | Bootstrap clone/ls-remote URL | DESIRED_STATE | YES | Release config | Bootstrap / `install.ps1 -RepoUrl` | NO |
| `hermes.source.repositoryHttp` | Enterprise Git Source (HTTP) | DESIRED_STATE | ONE-OF | Release config | identity / Verify | NO |
| `hermes.source.repositoryHttps` | Enterprise Git Source (HTTPS) | DESIRED_STATE | ONE-OF | Release config | identity / Verify | NO |
| `hermes.source.repositorySsh` | Enterprise Git Source (SSH) | DESIRED_STATE | ONE-OF | Release config | identity / Verify | NO |
| `hermes.source.schemeAliases` | 已列 URL 间显式等价 | DESIRED_STATE | YES iff ≥2 protocols listed | Release config | identity algorithm | NO |
| `hermes.source.approvedCommit` | install pin | DESIRED_STATE | YES | Release config | Bootstrap | NO |
| `hermes.source.defaultBranch` | update follow target | DESIRED_STATE | YES | Release config | `hermes update` | NO |
| `hermes.update.policy` | update identity | DESIRED_STATE | YES | Release config | Work / CLI | NO |
| `hermes.source.identity` | canonical repo id | RESOLVED_STATE | YES | release tool | Bootstrap / Work | NO |
| `official-source.json` | endpoint Official Identity | RESOLVED_STATE | YES | Bootstrap | update / banner | only Bootstrap rewrite on same identity |
| Native checkout `origin` | actual update source | OBSERVED_STATE | YES for runtime observation | Git | Work diagnostics | only explicit Repair |
| Native checkout HEAD | installed runtime identity | OBSERVED_STATE | YES | Git/Hermes update | Work | NO |
| `%LOCALAPPDATA%\hermes` | production Hermes Root | DESIRED_STATE | YES | Native installer contract | Work/Hermes | NO |
| process `HERMES_HOME` | Active Profile Home or Root | RUNTIME_STATE | YES | Native profile / Work adapter | Hermes/Work | profile switch only |
| `config.yaml` | Hermes runtime config | RUNTIME_STATE | YES | Hermes/User/SMC Policy/Work port allocator | Hermes/Work | managed fields + named-profile ports |
| `.env` | Hermes secrets/runtime env | RUNTIME_STATE | YES | Hermes/User/Bootstrap | Hermes/Work | API_SERVER_KEY create-if-absent only |
| `plugins/` | plugin state | RUNTIME_STATE | YES | Hermes Plugin CLI | Hermes/Work | via CLI only |
| `profiles/` | profile state | RUNTIME_STATE | YES | Hermes CLI/Work via CLI | Hermes/Work | via Hermes semantics |
| `work-settings.json` | Work desktop settings | RUNTIME_STATE | YES | Work | Work | YES by Work |
| Work-bundled `hermes-policy/<version>.json` | SMC Policy | DESIRED_STATE | YES | Work release | Bootstrap | NO |
| `hermes-native-manifest.json` | release provenance | EVIDENCE_STATE | YES | Release CI | Bootstrap/QA | NO |

Priority rule:

```text
Production Hermes Root:
1. Native installer resolved root MUST equal %LOCALAPPDATA%\hermes.
2. Work/Bootstrap 进程环境 MUST 设置 HERMES_HOME=%LOCALAPPDATA%\hermes（profile 切换前）。
3. HKLM/Machine HERMES_* 若存在：Doctor MAY 警告；MUST NOT 进入 MIGRATION_REQUIRED；进程钉值优先。
4. Work MUST NOT 使用 runtime.json 把生产 Hermes 指到 D:\Programs\SMC\Hermes。
5. Work MUST NOT 因 home 等于 %LOCALAPPDATA%\hermes 报 configuration_error。
6. Dev/test override MAY 仅在显式 dev/test mode 下存在，且 MUST 出现在 diagnostics。
```

---

# 8. State Machine

## 8.1 Runtime State Machine

```text
ABSENT
  │ Work first-launch bootstrap
  ▼
INSTALLING          ← 主窗口可开，本地 chat 禁用
  │ native install success
  ▼
DISCOVERED
  │ repo identity check
  ├──────── mismatch ───────→ REPO_MISMATCH  → 仅显式 Repair 可离开
  │
  ▼
SOURCE_VERIFIED
  │ version + Work-code capability check
  ├──────── incompatible ───→ INCOMPATIBLE
  │
  ▼
COMPATIBLE
  │ gateway health
  ├──────── stopped ────────→ GATEWAY_STOPPED  → Work MAY hermes gateway start
  │
  ├──────── unreachable ────→ GATEWAY_UNREACHABLE
  │
  ▼
READY               ← 才允许本地 chat
```

## 8.2 Repair State Machine（错误 origin，不是 legacy migration）

```text
REPO_MISMATCH
  ↓ user confirms Repair
BACKUP_T0
  ↓ native reinstall from enterprise identity + approvedCommit
VALIDATING
  ├── FAIL → 保留备份；READY=false
  └── PASS → READY
```

## 8.3 已取消的 Migration State Machine

v2.0.0 的 LEGACY_DETECTED → MIGRATION_COMMITTED 状态机 **MUST NOT 实现**（F-015）。

非法转移：

```text
MUST NOT:
REPO_MISMATCH → READY           （无显式 Repair）
REPO_MISMATCH → 静默改 origin
INCOMPATIBLE → READY
INSTALLING → 本地 chat
ABSENT → 本地 chat
ProgramData 残留 → MIGRATION_REQUIRED
```

---

# 9. Data / Schema Contract

## 9.1 Release Config v2 Schema

目标文件：

```text
release/client-release.yaml
```

必须升级为：

```text
schema = smc.client-release.config.v2
```

字段语义：

| Field | Type | Required | Default | Authority | Meaning |
|---|---|---:|---|---|---|
| `release.version` | string | YES | none | Release | Work release version |
| `release.channel` | enum | YES | none | Release | lab/stable |
| `work.enabled` | bool | YES | true | Release | Work build |
| `hermes.distribution` | enum | YES | `enterprise-native` | Release | Hermes distribution mode |
| `hermes.source.installUrl` | string | YES | none | Release | Bootstrap / `install.ps1 -RepoUrl` 唯一使用的 URL |
| `hermes.source.repositoryHttp` | string | ONE-OF | none | Release | HTTP clone URL；golden 使用此项 |
| `hermes.source.repositoryHttps` | string | ONE-OF | none | Release | HTTPS clone URL；可省略 |
| `hermes.source.repositorySsh` | string | ONE-OF | none | Release | SSH clone URL；可省略 |
| `hermes.source.schemeAliases` | object[] | YES iff 列出 ≥2 协议 | none | Release | 仅在**已列出** URL 间声明同一 identity |
| `hermes.source.allowedHosts` | string[] | YES | none | Release | 须含 `git.superic.com` |
| `hermes.source.defaultBranch` | string | YES | `main` | Release | update follow target |
| `hermes.source.approvedCommit` | 40-char SHA | YES | none | Release | **安装** immutable pin |
| `hermes.update.policy` | enum | YES | `follow-defaultBranch` | Release | 跟随 `origin/<defaultBranch>` |
| `hermes.source.publicUpstreamAllowedOnEndpoint` | bool | YES | false | Security | MUST be false |
| `hermes.compatibility.minVersion` | semver/string | YES | none | Work | minimum supported |
| `hermes.compatibility.testedVersion` | semver/string | YES | none | Work | release tested |
| `hermes.gateway.host` | string | YES | `127.0.0.1` | Policy | default profile bind |
| `hermes.gateway.port` | int | YES | `8642` | Policy | default profile port |
| `hermes.policy.version` | string | YES | none | Policy | SMC policy revision |
| `hermes.bootstrap.authMode` | enum | YES | `anonymous-internal` | Release | `anonymous-internal` \| `git-credential-manager` \| `ssh-agent` |

ONE-OF：`repositoryHttp`、`repositoryHttps`、`repositorySsh` **至少一个**非空。`installUrl` MUST 等于其中一个。HTTP-only（仅 `repositoryHttp` + 同值 `installUrl`）合法。缺少 HTTPS 或 SSH **不是** `RELEASE_CONFIG_INVALID`。

`additionalProperties` MUST be false for `hermes.source`, `hermes.compatibility`, `hermes.gateway`, `hermes.bootstrap`, `hermes.update`.

`hermes.compatibility` MUST NOT 列出 required capability 名字。Chat READY 门禁在 Work 代码。

缺少任何 required field 或 ONE-OF 全空或 `installUrl` 不在已列 URL 中：

```text
error = RELEASE_CONFIG_INVALID
release gate = FAIL
process exit != 0
```

## 9.2 Hermes Native Manifest

目标文件：

```text
hermes-native-manifest.json
```

Schema：

```json
{
  "schemaVersion": 1,
  "distribution": "enterprise-native",
  "repositoryIdentity": "sha256:<digest>",
  "approvedCommit": "40-char-git-sha",
  "installerSha256": "sha256",
  "policyVersion": "string",
  "compatibility": {
    "minVersion": "string",
    "testedVersion": "string"
  }
}
```

`repositoryIdentity` 计算规则见 §12。`installUrl` 参与 identity 计算前 MUST 去掉 userinfo。

## 9.3 official-source.json Schema

路径：`%LOCALAPPDATA%\hermes\official-source.json`（Hermes Root）。

```json
{
  "schemaVersion": 1,
  "repositoryIdentity": "sha256:<hex>",
  "installUrl": "http://git.superic.com/aiplatform/hermes-agent.git",
  "originUrls": {
    "http": "http://git.superic.com/aiplatform/hermes-agent.git",
    "https": null,
    "ssh": null
  },
  "defaultBranch": "main",
  "approvedCommitAtInstall": "40-char-sha",
  "writtenAt": "ISO-8601"
}
```

规则：

```text
schemaVersion MUST = 1。
installUrl MUST 无 userinfo。
originUrls 仅包含 YAML 已列出的协议；未列出者为 JSON null，不得填假 URL。
repositoryIdentity MUST 等于 YAML 计算值。
update/banner 读此文件判定 official；不读则 ENTERPRISE_DISTRIBUTION_PATCH_MISSING。
损坏/缺失 → HERMES_OFFICIAL_IDENTITY_INVALID。
```

## 9.4 Policy 字段映射（关闭 F-07）

源：Work 包内 `hermes-policy/<version>.json`，由 `release/hermes-runtime-profiles.yaml#smc-managed` 生成。目标：Hermes `config.yaml`（default = Hermes Root；named = Active Profile Home）。

| 源路径（profile yaml / policy JSON） | 目标 config.yaml | 规则 |
|---|---|---|
| `gateway.enabled` | `platforms.api_server.enabled` | bool |
| `gateway.bind` | `platforms.api_server.extra.host` | string；default profile |
| `gateway.port` | `platforms.api_server.extra.port` | int；**仅 default**。named 端口由 Work getProfilePort 写入后 Policy MUST NOT 覆盖 |
| `gateway.authRequired` | 无直接键 | true ⇒ `API_SERVER_KEY` create-if-absent |
| `managedConfig.defaults.terminal.*` | `terminal.*` | 同名嵌套 |
| `managedConfig.defaults.code_execution.*` | `code_execution.*` | 同名 |
| `managedConfig.defaults.web.*` | `web.*` | 同名 |
| `managedConfig.defaults.gateway.strict` | `gateway.strict` | bool |
| `managedConfig.defaults.logging.*` | `logging.*` | 同名 |
| `managedConfig.defaults.sessions.*` | `sessions.*` | 同名 |
| `managedConfig.defaults.timezone` | `timezone` | string |
| `managedConfig.defaults.memory.*` | `memory.*` | 同名 |
| `managedConfig.defaults.stt.*` | `stt.*` | 同名 |
| `managedConfig.defaults.lsp.*` | `lsp.*` | 同名 |
| `managedConfig.defaults.secrets.*` | `secrets.*` | 同名 |
| `managedConfig.defaults.platform_toolsets.*` | `platform_toolsets.*` | 同名 |
| `managedConfig.defaults.toolsets` | `toolsets` | string[] |
| `managedConfig.enforced.terminal.cwd` | `terminal.cwd` | default=`%LOCALAPPDATA%\hermes\workspace`；named=`<Active Profile Home>\workspace`。MUST NOT `C:\ProgramData\SMC\Hermes` |
| `managedConfig.enforced.security.*` | `security.*` | 同名 |
| `managedConfig.enforced.mcp_servers.workspace.enabled` | `mcp_servers.workspace.enabled` | bool |
| `managedConfig.enforced.mcp_servers.workspace.command` | `mcp_servers.workspace.command` | MUST NOT `managed-node`。MUST 为 Native Node：`%LOCALAPPDATA%\hermes` 下 installer 解析的 `node.exe`（与 `install.ps1` Stage-Node 布局一致） |
| `managedConfig.enforced.mcp_servers.workspace.args` | `mcp_servers.workspace.args` | `["-y", "@modelcontextprotocol/server-filesystem@2025.8.21", "<workspace>"]` 若使用 npx；或 `[<server-filesystem 入口>, "<workspace>"]`。最后一项 = 展开后的 workspace 路径 |

未出现在本表的 yaml 键：MUST NOT 写入 config.yaml（避免猜测）。

---

# 10. Requirements

## REQ-ARCH-001 — Hermes Runtime Ownership

### Goal
删除 Work/SMC 对 Hermes Runtime 二次构建和生命周期 ownership。

### Normative Requirement

```text
MUST:
- Work 通过 RuntimeManagementBackend 接口访问 Native Hermes。
- Hermes Runtime 文件、Python、Node、venv 由 Native Hermes Installer / fork setup 管理。
- Gateway lifecycle 由当前用户 Native Gateway 计划任务管理。
- 本地生产忽略 control-owner.json 的 opsi/salt/runtime 分发，永远 native/direct（ADR-038）。
- IPC `get-control-owner` MUST 返回 `{ observed, effective }`。Update/Doctor/RuntimePane/ConnectionErrorScreen MUST 使用 **effective**。observed=opsi|salt 时 Doctor MAY 警告，MUST NOT 禁用 Update。

MUST NOT:
- Work 生产路径直接 spawn `python -m hermes_cli.main gateway run`。
- Work 构建 Hermes wheelhouse / embedded Python / embedded Node。
- Work pip install smc-managed extras。
```

### Inputs
`NativeHermesRuntimeDescriptor`

### Preconditions
- Windows endpoint
- release config v2 valid

### Authoritative State
`Hermes Native Runtime`

### State Transition
`ABSENT/DISCOVERED → READY`

### Allowed Side Effects
- Work may invoke Hermes CLI.
- Work may read Native Home.
- Bootstrap may invoke Native Installer.

### Forbidden Side Effects
- Work MUST NOT mutate Hermes runtime package files.
- Work MUST NOT patch `hermes_cli/*.py` on endpoint.

### Ownership Scope
`RESOURCE`: Runtime Adapter only.

### Idempotency
Repeated Work startup MUST NOT reinstall Hermes when compatible Native Hermes is READY.

### Failure Semantics
`RUNTIME_NATIVE_NOT_FOUND`, `RUNTIME_NATIVE_INVALID`, `GATEWAY_START_FAILED`.

### Invariants
`INV-ARCH-001..003`

### Acceptance
`A-ARCH-001`, `A-ARCH-002`, `A-OWNER-001`

### Evidence
- process tree
- installed file inventory
- runtime backend test

---

## REQ-SOURCE-001 — Company Hermes Git Repository Is the Sole Endpoint Source

### Goal
保证企业 fork 是终端安装和更新的唯一 Hermes Git Source。

### Normative Requirement

```text
MUST:
- Bootstrap clone source = release config hermes.source enterprise repository.
- Installed checkout origin = enterprise repository.
- `hermes update` fetch target = installed enterprise origin.
- Company fork source code MUST treat enterprise origin as official distribution origin.

MUST NOT:
- endpoint 自动添加 NousResearch/hermes-agent 为 upstream。
- endpoint install/update 访问公开 NousResearch/hermes-agent。
- public upstream URL 成为 endpoint runtime fallback。
```

### Inputs
- `installUrl`（Bootstrap 唯一使用）
- `repositoryHttp` / `repositoryHttps` / `repositorySsh`（ONE-OF）
- `schemeAliases`（仅当列出 ≥2 协议）
- `allowedHosts`
- `defaultBranch`
- `approvedCommit`

### Preconditions
`git ls-remote enterprise-repository` succeeds non-interactively.

### Authoritative State
release config `hermes.source`.

### State Transition
`DISCOVERED → SOURCE_VERIFIED` only if remote identity matches.

### Allowed Side Effects
- Git clone/fetch from approved enterprise host.
- Native checkout origin creation.

### Forbidden Side Effects
- add public upstream
- rewrite origin silently on an existing mismatched checkout

### Ownership Scope
`RESOURCE`: endpoint Hermes Git remote configuration.

### Idempotency
Same source + same commit produces no remote mutation.

### Failure Semantics

```text
HERMES_ENTERPRISE_REPO_UNREACHABLE
HERMES_ENTERPRISE_REPO_AUTH_FAILED
HERMES_REPO_ORIGIN_MISMATCH
HERMES_REPO_HOST_NOT_ALLOWED
HERMES_APPROVED_COMMIT_NOT_FOUND
```

All are non-retryable by Work until environment/source changes; network transient MAY be re-run by user, but Work MUST NOT switch to public fallback.

### Invariants
`INV-SOURCE-001`, `INV-SOURCE-002`

### Acceptance
`A-SOURCE-001`, `A-SOURCE-002`, `A-SOURCE-003`, `A-SOURCE-004`, `A-OFFICIAL-001`

### Evidence
- `git remote -v`
- `git remote get-url origin`
- endpoint network trace or mocked network deny test
- source scan for forbidden runtime upstream behavior

---

## REQ-FORK-001 — Enterprise Fork Distribution Patch

### Goal
让公司 fork 保留 Hermes Native Installer / Native Update 机制，但默认 Source Contract 改为企业仓库。

### Normative Requirement

公司 Hermes Fork MUST 形成最小 Enterprise Distribution Patch Set：

```text
1. scripts/install.ps1
   - 新增受控 RepoUrl 参数（当前脚本无此参数，必须添加）。
   - 默认 RepoUrlHttps / RepoUrlSsh / RepoUrlHttp 指向 Enterprise Repository。
   - SMC Bootstrap MUST 强制传入 Enterprise Repository + approvedCommit。
   - MUST NOT fallback 到 NousResearch public repo。
   - MUST NOT 使用 https://github.com/NousResearch/hermes-agent ZIP 回退。
     ZIP 若保留，MUST 仅指向企业仓或直接 FAIL。

2. hermes_cli/update_cmd.py   （文件名不是 update_cmd_git.py）
   - Enterprise Repository / official-source.json MUST 被视为 official distribution origin。
   - 企业 origin MUST NOT 被判为 fork。
   - Enterprise endpoint mode MUST disable automatic public upstream add/sync/push。
   - `hermes update` MUST update from origin/<defaultBranch> where origin is Enterprise Repository。

3. hermes_cli/banner.py 与任何 update check
   - update comparison MUST use Official Identity / enterprise origin。
   - MUST NOT ls-remote 或调用 api.github.com 针对 NousResearch/hermes-agent。

4. smc-managed extras（fork Native setup，Work 不 pip）
   在 checkout 上 MUST 成功执行（失败 = 安装 FAIL，禁止降级 core 仍报成功）：
   ```
   uv sync --extra messaging --extra mcp --extra web --extra google --extra voice --extra edge-tts --extra hindsight
   ```
   extras 名与 `e:\git\hermes-agent\pyproject.toml` `[project.optional-dependencies]` 一致。
   Node：`@modelcontextprotocol/server-filesystem@2025.8.21` 装入 Native Node prefix（Stage-Node / Stage-NodeDeps）。
   lazyInstall.allowed = false。
   MUST NOT 把 `uv sync --extra all` 失败后的 core-only 当作 PASS。

5. tests
   - installer E2E 与 update E2E MUST 对着 enterprise-repository fixture / local mirrored fixture。
   - 负例：企业仓不可达且公网可达时，零次 NousResearch Git 请求。
```

### Inputs
Enterprise Repository identity.

### Preconditions
Company Hermes Fork maintainers can merge upstream changes into fork.

### Authoritative State
Company Hermes Fork source.

### State Transition
`enterprise fork build → approved distribution commit`

### Allowed Side Effects
Source code changes only inside Enterprise Fork.

### Forbidden Side Effects
Endpoint patching of installed Python source.

### Ownership Scope
`REPOSITORY`: Company Hermes Fork.

### Idempotency
Reapplying distribution config to same commit changes 0 bytes.

### Failure Semantics
`ENTERPRISE_DISTRIBUTION_PATCH_MISSING` → release blocked.

### Acceptance
`A-FORK-001`, `A-FORK-002`, `A-FORK-003`

### Evidence
- fork commit SHA
- unit/E2E tests
- source scan

---

## REQ-INSTALL-001 — Native Bootstrap

### Goal
保留 Hermes Native 安装规则，只替换为公司 fork Source，并移除 SMC Runtime packaging。

### Normative Requirement

Bootstrap MUST execute（仅 `connectionMode=local` 或未设置）：

```text
PRECHECK                         (release v2 + installUrl + allowedHosts；不需要 git)
→ ENSURE_GIT                     (install.ps1 -Stage git -NonInteractive -HermesHome <Root>)
→ ENTERPRISE_REPO_AUTH_CHECK     (用 ENSURE_GIT 得到的 git.exe ls-remote installUrl)
→ NATIVE_RUNTIME_DISCOVERY
→ 若 origin mismatch → REPO_MISMATCH（仅显式 Repair）
→ NATIVE_INSTALL(if absent)      (同一 install.ps1：-RepoUrl installUrl -Commit approvedCommit -NonInteractive -HermesHome <Root>；后续 stages 含 repository/venv/dependencies)
→ WRITE official-source.json     (§9.3)
→ SOURCE_VERIFY
→ SMC_POLICY_APPLY               (§9.4)
→ GATEWAY_INSTALL/START          (default profile)
→ HEALTH_CHECK
→ CAPABILITY_CHECK
→ RECEIPT
```

PowerShell 调用合同见 §0.2 C-007。remote/ssh MUST NOT 跑上述步骤。

Work 首次启动：

```text
MUST 打开主窗口。
MUST 在 INSTALLING / ABSENT / FAIL / 非 READY 时禁用本地 chat。
MUST 将进程 HERMES_HOME 钉为 %LOCALAPPDATA%\hermes（profile 切换前）。
MUST NOT 因 home 等于 LOCALAPPDATA\hermes 报 configuration_error。
```

Native install MUST pin `approvedCommit`.

Bootstrap MUST NOT include:

```text
Hermes runtime ZIP
embedded Python
embedded Node
wheelhouse
SMC Hermes MSI
OPSI package
```

### Inputs
release config v2 + enterprise fork Native installer.

### Preconditions
- enterprise repo reachable
- approved commit exists

### Allowed Side Effects
- Native Hermes Home creation
- Native checkout creation
- Hermes-owned dependencies
- policy managed fields
- Native Gateway service/task

### Forbidden Side Effects
- `C:\ProgramData\SMC\Hermes` new runtime creation
- `D:\Programs\SMC\Hermes` new runtime creation
- Machine-level HERMES_HOME creation

### Idempotency
Second run on READY runtime returns success with no reinstall.

### Failure Semantics
Before first persistent mutation: 0 mutation.
After Native Installer mutation: retain installer/native diagnostics; do not fabricate READY.

### Acceptance
`A-INSTALL-001`, `A-INSTALL-002`, `A-INSTALL-003`, `A-INSTALL-004`, `A-INSTALL-005`, `A-INSTALL-006`

### Evidence
bootstrap receipt + file inventory + health output.

---

## REQ-UPDATE-001 — Enterprise Native Update

### Goal
Hermes 更新独立于 Work 更新，并只从企业 origin 获取。

### Normative Requirement

```text
MUST:
- Work "更新 Hermes" 调用 Native `hermes update`。
- preflight 验证 origin == configured enterprise repository identity。
- update 后再次验证 origin、HEAD、health、Work-code capabilities。
- Work 与 Hermes 可独立升级。
- hermes.update.policy=follow-defaultBranch：成功后 HEAD 为 origin/<defaultBranch>，不必等于 approvedCommit。

MUST NOT:
- Work release 自动替换 Hermes runtime。
- update 失败时切换到 public upstream。
- Work startup 默认自动执行 Hermes update。
```

### Inputs
Native checkout, enterprise origin.

### Preconditions
`SOURCE_VERIFIED`.

### State Transition
```text
READY(old) → UPDATING → READY(new) or UPDATE_FAILED.
A-UPDATE-003 expected revision = origin/<defaultBranch> HEAD，不是 approvedCommit。
```

### Allowed Side Effects
Native Hermes update-defined files.

### Forbidden Side Effects
Work application files.

### Idempotency
When origin branch has no newer commit, update returns no-op.

### Failure Semantics
`HERMES_UPDATE_SOURCE_MISMATCH`, `HERMES_UPDATE_FAILED`, `HERMES_UPDATE_POSTCHECK_FAILED`.

### Acceptance
`A-UPDATE-001`, `A-UPDATE-002`, `A-UPDATE-003`

### Evidence
pre/post HEAD SHA, remote URL, CLI exit code, health.

---

## REQ-STATE-001 — Single Native HERMES_HOME

### Goal
消除 Managed Home 与 Native Home 分裂。

### Normative Requirement

Production Windows MUST resolve:

```text
Hermes Root = %LOCALAPPDATA%\hermes
Native Checkout = %LOCALAPPDATA%\hermes\hermes-agent
plugins (default profile) = %LOCALAPPDATA%\hermes\plugins
config (default profile)  = %LOCALAPPDATA%\hermes\config.yaml
named profile home        = %LOCALAPPDATA%\hermes\profiles\<name>
```

Work、CLI、Gateway diagnostics MUST 报告同一 Hermes Root。

进程 HERMES_HOME 在 named profile 下可以等于 Active Profile Home。这不是 Root 分裂。

检测到 `C:\ProgramData\SMC\Hermes` 或 HKLM HERMES_*：Doctor MAY 警告；MUST NOT 选为生产 Root；MUST NOT 进入迁移状态机。

### Failure Semantics
`RUNTIME_HOME_MISMATCH`

### Acceptance
`A-STATE-001`, `A-STATE-002`

---

## REQ-RUNTIME-001 — Native Runtime Locator / Backend

### Goal
复用 Work 当前 `RuntimeManagementBackend` abstraction，替换 SMC Runtime Service implementation。

### Normative Requirement

Target structure:

```text
RuntimeManager
  ↓
RuntimeManagementBackend
  ↓
NativeHermesRuntimeBackend
  ├─ Runtime Locator
  ├─ Hermes CLI Runner
  ├─ Gateway Probe
  └─ Native Filesystem Reader
```

`HttpRuntimeManagementBackend → @smc/runtime-client → services/runtime` MUST exit Local Native production path.

Locator resolution:

```text
production:
1. Native default home %LOCALAPPDATA%\hermes
2. native CLI under resolved home / PATH 校验
3. 进程 HERMES_HOME 钉到 Hermes Root（profile 切换前）
4. MUST 删除「home 不得为 LOCALAPPDATA\hermes」的 configuration_error
```

Dev/test override MUST be explicit and diagnostics-visible.

### Acceptance
`A-RUNTIME-001`, `A-RUNTIME-002`, `A-RUNTIME-003`

---

## REQ-GW-001 — Native Gateway Lifecycle

### Goal
Work 可以管理 Gateway，但不拥有 Gateway process。

### Normative Requirement

```text
start   → hermes gateway start     （Work MAY 在 GATEWAY_STOPPED 时调用）
stop    → hermes gateway stop
restart → hermes gateway restart
status  → hermes gateway status --deep or compatible native status
install → hermes gateway install   （用户 ONLOGON 计划任务，不是 SCM Service）
doctor  → hermes doctor
```

Work MUST use `/health` and `/v1/capabilities` as readiness evidence。
`/v1/capabilities` 用于探测；READY 判定使用 Work 代码 required feature 集合。
Work 退出 MUST NOT 杀死 Native Gateway。

Named profile 生命周期见 §0.2 C-004。

### Acceptance
`A-GW-001`, `A-GW-002`, `A-GW-003`, `A-GW-004`

---

## REQ-PROFILE-001 — Native Profile Semantics

### Goal
对齐 Hermes Native Profile：Root 恒定，Active Profile Home 可变。避免再次把 Root 指到 `profiles\<name>` 当作「换了一套 Runtime」。

### Normative Requirement

```text
Hermes Root MUST 保持 %LOCALAPPDATA%\hermes。

Named profile MUST 使用 Native 语义：
- 进程 HERMES_HOME = Hermes Root\profiles\<name>
- 和/或 CLI --profile / Native active_profile
- checkout 仍在 Hermes Root\hermes-agent

Work MUST NOT 把 Hermes Root 本身改成 Hermes Root\profiles\<name>
来代表 named profile。

Default profile Gateway MUST 钉 127.0.0.1:8642（policy）。

Named profile 端口：
- Work MUST 分配不冲突端口并写入该 profile 的
  platforms.api_server.extra.port（维持现网 getProfilePort 行为）。
- 已有不冲突端口 MUST NOT 改写。
- Policy MUST NOT 覆盖 named profile 已持久化的非冲突端口。
```

### Acceptance
`A-PROFILE-001`, `A-PROFILE-002`, `A-PROFILE-003`

---

## REQ-CONFIG-001 — Work Settings Separation

### Goal
Work Desktop 配置与 Hermes Runtime 配置分离。

### Normative Requirement

Work-owned：

```text
connection mode
remote URL
SSH config
Work UI state
Work runtime adapter preferences
```

MUST 存储于 Electron `app.getPath("userData")` 下的 `work-settings.json` 或等价 Work-owned store。

Work MUST NOT 继续把自身 desktop configuration 写入 Hermes Native Home 的 `desktop.json`。

无生产存量：Required Gate MUST NOT 依赖「从旧 desktop.json 迁用户」。新安装直接写 userData。开发机若仍有 desktop.json，Doctor MAY 提示；MAY 一次性复制，但不是 Release Gate。

### Acceptance
`A-CONFIG-001`

---

## REQ-POLICY-001 — SMC Enterprise Policy Merge

### Goal
取消 SMC Runtime bundle 后仍保留必要的企业默认设置。

### Normative Requirement

SMC Policy MUST 使用 structural merge，只管理明确字段。

Policy 发行：Work 包内 `hermes-policy/<version>.json`，由 `hermes.policy.version` 对账。无密钥。

v1 字段集合 SOT = `release/hermes-runtime-profiles.yaml#smc-managed` 的：

```text
gateway bind/port/authRequired
managedConfig.defaults
managedConfig.enforced
```

路径改写规则：

```text
MUST NOT 写死 C:\ProgramData\SMC\Hermes 或 D:\Programs\SMC\Hermes。
terminal.cwd 与 MCP filesystem 根 MUST 展开为 Hermes Root 下的 workspace
（default profile）或 Active Profile Home 下的等价目录。
```

User-owned fields MUST be preserved。

Named profile 已持久化的 `platforms.api_server.extra.port`：Policy MUST NOT 覆盖（除非与 8642 / 其它 profile 冲突且 Work 分配器正在修复）。

`API_SERVER_KEY`：

```text
if absent:
  create cryptographically random value
if exists:
  preserve exact value
MUST NOT 进入 policy JSON。
```

### Acceptance
`A-POLICY-001`, `A-POLICY-002`, `A-POLICY-003`

---

## REQ-MIGRATE-001 — Legacy Runtime Migration — CANCELLED

### Goal
明确取消存量用户数据迁移。产品未上线，无历史客户端残留。

### Normative Requirement

```text
MUST NOT:
- 实现 MIGRATION_REQUIRED 状态机
- 实现 elevated repair / 用户数据从 ProgramData 迁到 LOCALAPPDATA
- 把 ProgramData / SYSTEM 任务 / HKLM HERMES_* 当作 READY 阻断条件

MAY:
- Doctor 警告上述残留路径（开发机卫生）

MUST:
- 仓库删除 Managed bundle / WiX / OPSI smc-hermes-agent 生产依赖（REQ-REMOVE-001）
- 错误 origin 走 REQ 级 Repair（F-016），不是本需求
```

### Acceptance
None. `A-MIGRATE-*` 退出 Required Gate。

---

## REQ-RELEASE-001 — Release Pipeline v2 / Remove OPSI

### Goal
smc-copilot release 只构建 Work 与轻量 Hermes Native Bootstrap 元数据，不构建 Runtime。

### Normative Requirement

Target stages:

```text
preflight
work
hermes-bootstrap
assemble
verify
all
```

MUST remove from main release pipeline:

```text
hermes
hermes-installer
runtime
opsi-stage
opsi-package
```

MUST remove required arguments:

```text
OpsiClientInstaller
HermesZip
OpsiPackage
Wheelhouse
NodeRoot
OpsiTooling
```

MUST NOT require OPSI client agent for Work/Hermes release.

### Acceptance
`A-RELEASE-001`, `A-RELEASE-002`

---

## REQ-COMPAT-001 — Version + Capability Contract

### Goal
Work 与 Hermes 独立升级而不是精确版本强绑定。

### Normative Requirement

Work MUST evaluate：

```text
version >= minVersion
AND
Work-code required features 均在 /v1/capabilities 中为真
  （SOT: apps/work/src/main/run-stream.ts 及同等门禁，含
   run_submission / run_events_sse / run_stop /
   run_approval_response / tool_progress_events 与对应 /v1/runs*）
AND
source == enterprise repository identity
```

YAML MUST NOT 重复列出 required capability 名字。

状态：

```text
READY
INCOMPATIBLE_VERSION
MISSING_REQUIRED_CAPABILITY
SOURCE_MISMATCH
```

Optional capability missing MUST degrade only corresponding UI feature and MUST NOT report full runtime failure.

### Acceptance
`A-COMPAT-001`, `A-COMPAT-002`

---

## REQ-SEC-001 — Git Authentication / Supply Chain Security

### Goal
支持私有公司 Git，同时不把凭据嵌入 SMC artifacts。

### Normative Requirement

Bootstrap MUST use release config `hermes.bootstrap.authMode`。
取值仅：

```text
anonymous-internal | git-credential-manager | ssh-agent
```

生产默认 `anonymous-internal`。MUST NOT 运行时改 mode。

`git ls-remote` 分类：

```text
网络/DNS/超时          → HERMES_ENTERPRISE_REPO_UNREACHABLE
HTTP 401/403 或 git 提示 auth / credential helper 失败 → HERMES_ENTERPRISE_REPO_AUTH_FAILED
host 不在 allowedHosts → HERMES_REPO_HOST_NOT_ALLOWED（0 请求）
```

A-SOURCE-004 仅在 fixture `authMode=git-credential-manager` 或 `ssh-agent` 下执行，不是 anonymous-internal 生产默认。

MUST NOT:

```text
- embed PAT/password/private key in release/client-release.yaml
- embed credential in repository URL
- print credential-bearing URL
- persist credential in hermes-native-manifest.json
- fallback to public upstream when auth fails
```

Repository host MUST belong to `allowedHosts`.

### Acceptance
`A-SEC-001`, `A-SEC-002`, `A-SEC-003`

---

## REQ-OBS-001 — Runtime Diagnostics

### Goal
永久防止 HERMES_HOME / Repo / Gateway split-brain。

### Normative Requirement

Diagnostics MUST expose：

```text
Work resolved HERMES_HOME
CLI resolved HERMES_HOME
Native checkout path
origin URL identity/digest
HEAD SHA
Hermes version
Gateway endpoint
Gateway health
required capabilities
plugin root
active profile
runtime backend = native
```

Secret fields MUST be redacted.

### Acceptance
`A-OBS-001`

---

## REQ-REMOVE-001 — Remove Legacy Ownership Components

### Goal
在 Native Pilot 通过后删除旧 Runtime ownership。

### Normative Requirement

Final state MUST remove production dependency on：

```text
tools/release/hermes/build_runtime.py
infra/windows/hermes-agent/installer
infra/opsi/products/smc-hermes-agent
SMC Hermes Gateway scheduled-task lifecycle
@smc/runtime-client for local Hermes lifecycle
D:\Programs\SMC\Hermes as production ProgramRoot
C:\ProgramData\SMC\Hermes as active home
isForbiddenSelfInstallHome() rejecting %LOCALAPPDATA%\hermes
```

MUST NOT 以「等待存量迁移窗口」为删除条件。产品无存量；代码删除与绿场 Native 验收绑定。

### Acceptance
`A-REMOVE-001`

---

# 11. Side-Effect Contract

| Operation | File Write | Git Network | Gateway | Work Data | Hermes User Data | Public Upstream |
|---|---:|---:|---:|---:|---:|---:|
| runtime probe | NO | NO | read | NO | NO | NO |
| source preflight | NO | YES enterprise only | NO | NO | NO | NO |
| native install | YES Native Home | YES enterprise only | MAY | NO | Native installer | NO |
| policy apply | YES managed fields | NO | MAY restart | NO | managed subset | NO |
| Work settings migrate | YES Work userData | NO | NO | YES | legacy read only | NO |
| Hermes update | YES Hermes-owned | YES enterprise only | MAY restart | NO | preserve per Native contract | NO |
| Repair (wrong origin) | YES Native Home | YES enterprise only | MAY | NO | backup then reinstall | NO |
| diagnostics | NO except log/evidence | NO | read | NO | NO | NO |
| release build | artifact write | company Git/CI allowed | NO | NO | NO | server-side only |

---

# 12. Ownership / Identity / Hash Contract

## 12.1 Ownership

| Resource | Ownership Type | Owner |
|---|---|---|
| Work executable | WHOLE_RESOURCE | SMC Copilot |
| Runtime Adapter | WHOLE_RESOURCE | SMC Copilot |
| Native Hermes checkout | WHOLE_RESOURCE | Hermes Enterprise Fork |
| Hermes config managed fields | FIELD | SMC Policy |
| Hermes config remaining fields | USER_OWNED / Hermes | User/Hermes |
| Work settings | WHOLE_RESOURCE | Work |
| plugins | Hermes Native semantics | Hermes CLI |
| Repair backup | GENERATED_ONLY | Repair |
| official-source.json | GENERATED_ONLY | Bootstrap |
| release manifest | GENERATED_ONLY | Release CI |

## 12.2 Repository Identity

Canonical repository identity MUST NOT include credentials.

Algorithm：

```text
1. Parse URL.
2. Remove userinfo/token.
3. Host → lowercase.
4. Normalize SSH SCP form git@host:path to ssh://host/path.
5. Strip trailing slash.
6. Strip optional ".git".
7. Path preserve case unless enterprise Git contract explicitly defines case-insensitive path.
8. canonical = "<scheme-class>|<host>|<path>"
   where scheme-class = "git" so HTTPS/SSH forms of same configured repo may map through explicit alias list.
9. repositoryIdentity = SHA256(UTF-8 canonical repository key)
```

Production config MUST NOT 猜测跨协议等价。`schemeAliases` 只允许在 YAML **已列出** 的 URL 之间声明同一 identity。HTTP-only golden（仅 `repositoryHttp` + 同值 `installUrl`）MUST NOT 编造 HTTPS/SSH URL，也 MUST NOT 因缺少 HTTPS alias 而 `RELEASE_CONFIG_INVALID`。

若同时列出 HTTP 与 HTTPS，MUST 用 `schemeAliases` 声明二者同一 identity：

```text
http://git.superic.com/aiplatform/hermes-agent.git
https://git.superic.com/aiplatform/hermes-agent.git
```

当前 golden 只列 HTTP，故不需要 alias 条目。

## 12.3 Installer Hash

```text
installerSha256 = SHA256(exact bytes of bundled enterprise-fork install.ps1)
```

## 12.4 Evidence Digest

Repair T0 backup 与绿场失败证据：

```text
SHA256(
  sorted relative_path UTF-8
  + NUL
  + file_bytes
)
```

User secrets MUST NOT be emitted as raw evidence; evidence stores digest only.

---

# 13. Transaction Contract

## 13.1 Native Install Transaction

```text
TXN includes:
- source preflight
- native installer execution
- policy apply
- native gateway setup
- postcheck

TXN excludes:
- enterprise Git credential provisioning
- public upstream sync
- Work application update
```

Commit point：

```text
SOURCE_VERIFIED
+
health = HTTP 200
+
required capabilities present
+
bootstrap receipt persisted
```

If commit not reached, Bootstrap MUST NOT report READY.
INSTALLING 期间 MUST 禁用本地 chat。

## 13.2 Repair Transaction（错误 origin）

T0：用户确认 Repair 后、第一次破坏性 mutation 前备份现有 Native checkout。

```text
backup T0
→ native reinstall from enterprise identity + approvedCommit
→ official-source.json
→ policy
→ gateway install/start
→ source/version/Work-capability/health verify
```

MUST NOT 静默改 origin。失败则保留备份，READY=false。

## 13.3 已取消的 Migration Transaction

v2.0.0 §13.2 存量迁移事务 MUST NOT 实现。

---

# 14. Failure Contract

| Error Code | Trigger | Expected State | Mutation Rule | Retry |
|---|---|---|---|---|
| `RELEASE_CONFIG_INVALID` | release v2 missing/invalid field | build blocked | artifact not assembled | after config fix |
| `HERMES_ENTERPRISE_REPO_UNREACHABLE` | ls-remote network fail | source not verified | no public fallback | user retry |
| `HERMES_ENTERPRISE_REPO_AUTH_FAILED` | non-interactive auth fail | source not verified | no credential write | after auth fix |
| `HERMES_REPO_HOST_NOT_ALLOWED` | host not allowlisted | blocked | 0 clone/update | no |
| `HERMES_APPROVED_COMMIT_NOT_FOUND` | pin absent | blocked | no install commit | after release fix |
| `HERMES_REPO_ORIGIN_MISMATCH` | installed origin != desired | REPO_MISMATCH | no silent rewrite | explicit Repair |
| `RUNTIME_HOME_MISMATCH` | Work/CLI Root 不一致（profile Home 不同不算） | blocked/degraded | no install/update | after locator fix |
| `RUNTIME_NATIVE_NOT_FOUND` | no native runtime | ABSENT | offer install | yes |
| `GATEWAY_START_FAILED` | native CLI start fails | GATEWAY_STOPPED | preserve runtime | yes |
| `MISSING_REQUIRED_CAPABILITY` | Work-code required feature 缺失 | INCOMPATIBLE | no destructive mutation | after update |
| `HERMES_UPDATE_FAILED` | native update non-zero | previous runtime state | preserve native recovery | user retry |
| `HERMES_UPDATE_POSTCHECK_FAILED` | update completes but health/source invalid | UPDATE_FAILED | no READY | rollback/manual |
| `ENTERPRISE_DISTRIBUTION_PATCH_MISSING` | fork still behaves as public fork | release blocked | no endpoint release | after fork fix |

---

# 15. Conflict Contract

| Conflict | Detection | Default Behavior | Error | Mutation |
|---|---|---|---|---:|
| existing origin differs from enterprise repo | canonical identity compare | BLOCK | `HERMES_REPO_ORIGIN_MISMATCH` | 0 until explicit Repair |
| public upstream remote exists | `git remote -v` | BLOCK update/READY | `PUBLIC_UPSTREAM_REMOTE_PRESENT` | 0 by probe; Repair MAY 删除 |
| Machine HKLM HERMES_* or ProgramData 残留 | env / path inspection | Doctor warning only | none | 0 |
| control-owner.json hermes=opsi\|salt\|runtime | file/env | 忽略；本地 native/direct | Doctor MAY warn | 0 |
| user config conflicts with SMC managed field | policy field compare | MERGE managed field only | receipt warning | managed field |
| named profile port already unique | getProfilePort | PRESERVE | none | 0 |
| named profile port missing or collides with 8642 | getProfilePort | allocate + persist | none | named profile config.yaml |
| user config outside managed field | field scope | PRESERVE | none | 0 |
| dirty Native checkout | native update semantics | do not force from Work | native error | 0 by Work |
| approved commit missing from enterprise repo | ls-remote/fetch | BLOCK | commit error | 0 |

No `last writer wins` behavior is allowed.

---

# 16. Compatibility / Removal（无用户迁移）

## 16.1 仓库内旧路径 — 仅代码删除，不是 endpoint 迁移

```text
C:\ProgramData\SMC\Hermes
D:\Programs\SMC\Hermes
C:\ProgramData\SMC\HermesInstaller
HKLM HERMES_HOME / HERMES_AGENT_ROOT / HERMES_NODE_ROOT / HERMES_INSTALL_ROOT
SYSTEM 任务 SMC Hermes Gateway
```

Doctor MAY 列出这些路径。MUST NOT 选为生产 Root。MUST NOT 实现迁移状态机。

生产目标：

```text
%LOCALAPPDATA%\hermes
```

## 16.2 Repair Data Set

仅 Q14 / F-016：错误 origin 的已有 Native checkout。备份整个 Hermes Root 后按企业 identity 重装。不是从 ProgramData 拷用户数据。

## 16.3 Compatibility Contract

| Current Consumer | Compatibility Mechanism | Reason | Removal Condition | Removal Version |
|---|---|---|---|---|
| `HttpRuntimeManagementBackend` local path | 本地忽略；仅显式 lab `runtime` | 冻结 Runtime 控制面 | Native backend E2E PASS | v2 cleanup |
| `legacy-local-runtime-adapter.ts` | 替换为 NativeHermesRuntimeBackend | 现网 Connection Ready | Native backend E2E PASS | v2 |
| `isForbiddenSelfInstallHome` LOCALAPPDATA 禁令 | 删除 | 与 Native Home 冲突 | 本 PRD | v2.1 |
| SMC Hermes Installer | 从 release pipeline 删除 | 架构决策 | Native bootstrap PASS | v2 |
| OPSI `smc-hermes-agent` | 立即停止构建 | F-001 | Release v2 PASS | v2 |
| ADR-031 `hermes: opsi` | 本地忽略 | F-001 / F-011 | 文档 supersede | v2 |
| `release/hermes-runtime-profiles.yaml` smc-managed extras | 迁入 fork Native setup | F-014 | fork extras E2E PASS | v2 |
| `desktop.json` in Hermes Root | 改为 Work userData | F / REQ-CONFIG | A-CONFIG-001 | v2 |

---

# 17. External Dependency Contract

## 17.1 Company Hermes Git Repository

```text
name:
  Enterprise Hermes Repository

repo identity:
  release/client-release.yaml hermes.source is SOT

immutable identity:
  approvedCommit (40-char SHA)

required capabilities:
  clone
  fetch
  ls-remote

authentication:
  hermes.bootstrap.authMode = anonymous-internal (production default)
  YAML MUST 写死，禁止运行时猜测

offline behavior:
  existing READY runtime may continue running
  install/update MUST fail without network
  MUST NOT switch to public source

failure behavior:
  explicit source/auth/network error
```

## 17.2 Public Upstream

```text
name:
  NousResearch/hermes-agent

endpoint role:
  NONE

company CI role:
  optional upstream sync input

endpoint network:
  MUST NOT be required for install/update
```

## 17.3 Git Ref Rule

Every production Native install MUST pin immutable SHA.

Branch name alone MUST NOT be production install identity.

---

# 18. Security Contract

| Threat | Control | Acceptance |
|---|---|---|
| public upstream bypass | endpoint allowlist + enterprise origin invariant | `A-SOURCE-003` |
| credential in URL/log | canonical URL sanitizer + log redaction | `A-SEC-001` |
| malicious repo host | `allowedHosts` | `A-SEC-002` |
| tampered installer | installer SHA256 | `A-INSTALL-002` |
| arbitrary runtime path | production Native Home contract | `A-STATE-001` |
| config overwrite | field-level policy ownership | `A-POLICY-001` |
| source patching on endpoint | Work local patch forbidden | `A-ARCH-002` |
| secret evidence leakage | digest-only evidence | `A-SEC-001` |
| path traversal in Repair/install | containment under Hermes Root | `A-REPAIR-001` |
| symlink/junction escape | write target outside Hermes Root rejected | `A-SEC-003` |
| unauthorized Git | non-interactive auth preflight | `A-SOURCE-004` |

---

# 19. Observability

Stages：

```text
DISCOVER
SOURCE_CHECK
INSTALL
POLICY
GATEWAY
COMPATIBILITY
REPAIR
UPDATE
VERIFY
REMOVE
```

每次操作 MUST 记录：

```json
{
  "operationId": "uuid",
  "stage": "SOURCE_CHECK",
  "status": "PASS|FAIL|BLOCKED",
  "timestamp": "ISO-8601",
  "workVersion": "string",
  "workCommit": "sha",
  "hermesHome": "redacted-safe-path",
  "repositoryIdentity": "sha256",
  "hermesHead": "sha",
  "gatewayEndpoint": "127.0.0.1:8642",
  "result": {},
  "errorCode": null
}
```

MUST NOT log：

```text
PAT
password
private key
API_SERVER_KEY
credential-bearing repository URL
```

---

# 20. Acceptance

## A-ARCH-001 — Work does not own Hermes runtime

**Requirement Refs:** `REQ-ARCH-001`

**Given** clean Windows endpoint with Native Hermes installed.  
**When** Work starts and performs local chat.  
**Then** Work connects through Native Adapter; Work package does not contain embedded Hermes Python/Node runtime.  
**Oracle:** release artifact inventory contains no forbidden runtime payload.  
**Evidence:** `TEST-A-ARCH-001`, artifact file list, SHA.

## A-ARCH-002 — Work does not patch local Hermes source

**Given** Native checkout hash before Work startup.  
**When** Work starts, uses chat/settings/doctor.  
**Then** `hermes_cli/*.py` tree digest unchanged.  
**Oracle:** pre/post digest equal.  
**Evidence:** `TEST-A-ARCH-002`.

## A-SOURCE-001 — Install origin is enterprise repository

**Given** valid release config and clean endpoint.  
**When** Bootstrap installs Hermes.  
**Then** `git remote get-url origin` canonical identity equals configured enterprise identity.  
**Oracle:** identity equal.  
**Evidence:** `TEST-A-SOURCE-001`.

## A-SOURCE-002 — Update remains enterprise origin

**Given** installed Native checkout.  
**When** `hermes update --check` and `hermes update` execute.  
**Then** all fetch/update references use enterprise origin.  
**Oracle:** git trace contains no non-enterprise remote request.  
**Evidence:** `TEST-A-SOURCE-002`.

## A-SOURCE-003 — Public upstream is not endpoint fallback

**Given** enterprise Git intentionally unreachable while public internet is reachable.  
**When** install/update executes.  
**Then** operation fails with enterprise repo error and no public Git request occurs.  
**Oracle:** expected error code + public request count = 0.  
**Evidence:** `TEST-A-SOURCE-003`.

## A-SOURCE-004 — Auth failure is deterministic (non-anonymous fixture)

**Given** `hermes.bootstrap.authMode` 为 `git-credential-manager` 或 `ssh-agent`，且 credential provider 无凭据。  
**When** source preflight executes.  
**Then** `HERMES_ENTERPRISE_REPO_AUTH_FAILED`；无公开 fallback；非 READY。  
**Oracle:** error equals + runtime state != READY.  
**Evidence:** `TEST-A-SOURCE-004`.

匿名生产默认的网络失败走 A-SOURCE-003 / `HERMES_ENTERPRISE_REPO_UNREACHABLE`。

## A-FORK-001 — Enterprise fork is not treated as public fork on endpoint

**Given** checkout origin is enterprise repository.  
**When** update logic inspects origin.  
**Then** it does not offer/add NousResearch upstream.  
**Oracle:** remote set contains no public upstream after update.  
**Evidence:** `TEST-A-FORK-001`.

## A-FORK-002 — Fork source contains distribution patch

**Given** approved enterprise fork commit.  
**When** source contract tests run.  
**Then** installer repo source and update official-source logic both satisfy enterprise policy.  
**Oracle:** source contract test exit=0.  
**Evidence:** `TEST-A-FORK-002`.

## A-INSTALL-001 — Clean Native install

**Given** no Hermes runtime.  
**When** Bootstrap runs.  
**Then** Native Hermes exists under `%LOCALAPPDATA%\hermes`, source verified, Gateway health 200.  
**Oracle:** path exists + source identity equal + HTTP 200.  
**Evidence:** `TEST-A-INSTALL-001`.

## A-INSTALL-002 — Installer integrity

**Given** bundled enterprise install script.  
**When** preflight computes SHA256.  
**Then** digest equals manifest.  
**Oracle:** hash equal.  
**Evidence:** `TEST-A-INSTALL-002`.

## A-INSTALL-003 — Chat blocked until READY

**Given** 干净机首次启动 Work，Bootstrap 进行中或失败。  
**When** 用户尝试本地 chat。  
**Then** 主窗口可用；本地 chat 发送被拒绝；状态不是 READY。  
**Oracle:** UI 可开 + send blocked + state != READY.  
**Evidence:** `TEST-A-INSTALL-003`.

## A-INSTALL-004 — Git ensure before ls-remote

**Given** PATH 上没有 git 的干净 Windows。  
**When** Bootstrap 运行。  
**Then** 先成功 `install.ps1 -Stage git`，再用该 git.exe `ls-remote` 企业 `installUrl`；不因「git not found」在 clone 前失败。  
**Oracle:** Stage-Git PASS + ls-remote uses PortableGit path.  
**Evidence:** `TEST-A-INSTALL-004`.

## A-INSTALL-005 — Bootstrap mutex and timeout

**Given** 同一用户已有 Bootstrap 在跑。  
**When** 第二 Work 窗口启动。  
**Then** 不并行跑第二 installer；等待或加入同一 mutex。超时 1800s 后状态 FAIL 且无 READY。  
**Oracle:** concurrent installer process count ≤ 1 + timeout FAIL.  
**Evidence:** `TEST-A-INSTALL-005`.

## A-INSTALL-006 — remote/ssh skips local Bootstrap

**Given** `connectionMode=remote` 或 `ssh`。  
**When** Work 启动。  
**Then** 不 clone、不写 Hermes Root、不跑 install.ps1。  
**Oracle:** 0 git clone + 0 install.ps1.  
**Evidence:** `TEST-A-INSTALL-006`.

## A-FORK-003 — smc-managed extras preinstalled

**Given** fork Native setup 完成。  
**When** 检查 venv/node 包。  
**Then** `release/hermes-runtime-profiles.yaml#smc-managed` 的 python extras 与 node packages 已安装；无 Work 进程 pip。  
**Oracle:** `uv sync --extra messaging --extra mcp --extra web --extra google --extra voice --extra edge-tts --extra hindsight` exit 0；core-only after `--extra all` fail ≠ PASS；Work process tree 无 pip.  
**Evidence:** `TEST-A-FORK-003`.

## A-UPDATE-001 — Work update does not update Hermes

**Given** Work vN + Hermes HEAD X.  
**When** Work upgrades to vN+1.  
**Then** Hermes HEAD remains X.  
**Oracle:** SHA equal.  
**Evidence:** `TEST-A-UPDATE-001`.

## A-UPDATE-002 — Hermes update does not update Work

**Given** Work binary digest W + Hermes old HEAD.  
**When** Hermes update succeeds.  
**Then** Work binary digest remains W.  
**Oracle:** digest equal.  
**Evidence:** `TEST-A-UPDATE-002`.

## A-UPDATE-003 — Update postcheck

**Given** enterprise origin `defaultBranch` 上有比当前 HEAD 更新的 commit。  
**When** Hermes update succeeds.  
**Then** source identity equal；HEAD 等于 `origin/<defaultBranch>`（不必等于 `approvedCommit`）；health 200；Work-code required capabilities pass.  
**Oracle:** all predicates true.  
**Evidence:** `TEST-A-UPDATE-003`.

## A-STATE-001 — Single Hermes Root

**Given** 绿场 Native 安装成功。  
**When** diagnostics runs.  
**Then** Work/CLI/Gateway 报告的 Hermes Root 均等于 `%LOCALAPPDATA%\hermes`.  
**Oracle:** 3-way equality.  
**Evidence:** `TEST-A-STATE-001`.

## A-STATE-002 — Plugin root

**Given** plugin installed through Native CLI.  
**When** Work refreshes Plugin state.  
**Then** plugin resolves under Native `HERMES_HOME\plugins`.  
**Oracle:** resolved path prefix equals Native Home + `plugins`.  
**Evidence:** `TEST-A-STATE-002`.

## A-RUNTIME-001 — Native backend active

**Given** local mode.  
**When** Work runtime manager resolves backend.  
**Then** backend id = `native-hermes`.  
**Oracle:** exact enum equal.  
**Evidence:** `TEST-A-RUNTIME-001`.

## A-RUNTIME-002 — SMC runtime service unavailable does not break Native mode

**Given** SMC Runtime Service absent.  
**When** Native Hermes is READY.  
**Then** Work local chat remains READY.  
**Oracle:** chat smoke PASS + no request to SMC runtime service.  
**Evidence:** `TEST-A-RUNTIME-002`.

## A-RUNTIME-003 — LOCALAPPDATA home is valid

**Given** Hermes Root = `%LOCALAPPDATA%\hermes` 且 origin 为企业 identity。  
**When** Work locates runtime.  
**Then** 不是 `configuration_error`；可进入 SOURCE_VERIFIED / READY。  
**Oracle:** error code != configuration_error (LOCALAPPDATA forbid).  
**Evidence:** `TEST-A-RUNTIME-003`.

## A-GW-001 — Gateway lifecycle delegated

**Given** Gateway stopped.  
**When** Work requests start.  
**Then** Work invokes Native Gateway CLI and health becomes 200.  
**Oracle:** CLI command evidence + HTTP 200.  
**Evidence:** `TEST-A-GW-001`.

## A-GW-002 — Work exit does not kill Native Gateway unless explicitly requested

**Given** running Native Gateway.  
**When** Work exits normally.  
**Then** Gateway 按 Native ONLOGON 计划任务继续运行。  
**Oracle:** gateway status running.  
**Evidence:** `TEST-A-GW-002`.

## A-GW-003 — Named profile gateway install

**Given** READY 的 default Gateway 在 8642，用户第一次切到 named profile。  
**When** Work 使该 profile 可本地 chat。  
**Then** 该 profile 已分配非 8642 端口；`hermes -p <name> gateway install` 已执行；health 200。  
**Oracle:** port != 8642 + CLI evidence + HTTP 200.  
**Evidence:** `TEST-A-GW-003`.

## A-GW-004 — Named profile uninstall on delete

**Given** named profile Gateway 已 install。  
**When** Work 删除该 profile。  
**Then** `hermes -p <name> gateway uninstall` 执行；default 8642 Gateway 仍运行。  
**Oracle:** CLI evidence + default health 200.  
**Evidence:** `TEST-A-GW-004`.

## A-PROFILE-001 — Profile does not mutate Hermes Root

**Given** default and named profile.  
**When** switch active profile.  
**Then** Hermes Root 仍为 `%LOCALAPPDATA%\hermes`。  
**Oracle:** Root path equal before/after.  
**Evidence:** `TEST-A-PROFILE-001`.

## A-PROFILE-002 — Native profile sets Active Profile Home

**Given** named profile.  
**When** Work invokes Hermes CLI for that profile.  
**Then** 进程 `HERMES_HOME` 等于 `Hermes Root\profiles\<name>`，且 checkout 仍在 `Hermes Root\hermes-agent`。  
**Oracle:** env/args + checkout path.  
**Evidence:** `TEST-A-PROFILE-002`.

## A-PROFILE-003 — Named profile unique port

**Given** default 使用 8642，新建 named profile 未配端口。  
**When** Work 解析该 profile 的 Gateway 端口。  
**Then** 写入非 8642 端口到该 profile `config.yaml`；再次调用不改写。  
**Oracle:** port != 8642 + second call no file mutation.  
**Evidence:** `TEST-A-PROFILE-003`.

## A-CONFIG-001 — Work settings outside Hermes Home

**Given** new Work install.  
**When** connection settings are saved.  
**Then** Work-owned settings file exists under Electron userData and Hermes `desktop.json` is not used as Work SOT.  
**Oracle:** expected file exists; forbidden write absent.  
**Evidence:** `TEST-A-CONFIG-001`.

## A-POLICY-001 — Policy preserves user-owned fields

**Given** config containing user model/MCP/custom fields.  
**When** SMC Policy applies.  
**Then** only managed field set changes.  
**Oracle:** diff paths subset_of managed paths.  
**Evidence:** `TEST-A-POLICY-001`.

## A-POLICY-002 — Existing API_SERVER_KEY preserved

**Given** existing key.  
**When** policy applies twice.  
**Then** key digest unchanged.  
**Oracle:** digest equal.  
**Evidence:** `TEST-A-POLICY-002`.

## A-POLICY-003 — Policy paths use Hermes Root

**Given** policy apply on Native install.  
**When** 读取 `terminal.cwd` 与 MCP filesystem 根。  
**Then** 路径位于 `%LOCALAPPDATA%\hermes` 之下，不含 `C:\ProgramData\SMC\Hermes`。  
**Oracle:** prefix match + forbidden prefix count = 0.  
**Evidence:** `TEST-A-POLICY-003`.

## A-REPAIR-001 — Wrong origin requires explicit Repair

**Given** `%LOCALAPPDATA%\hermes` 已存在且 origin 不是企业 identity。  
**When** Work 首次启动。  
**Then** 状态=`REPO_MISMATCH`；origin 未改；未 READY。用户确认 Repair 后才按企业 identity + approvedCommit 重装。  
**Oracle:** origin unchanged until confirm + post-repair identity equal.  
**Evidence:** `TEST-A-REPAIR-001`.

## A-RELEASE-001 — OPSI absent from release

**Given** Release Pipeline v2.  
**When** `all` build completes.  
**Then** no OPSI package/client installer artifact and no OPSI stage executed.  
**Oracle:** artifact inventory + stage log.  
**Evidence:** `TEST-A-RELEASE-001`.

## A-RELEASE-002 — No Hermes Runtime bundle

**Given** Release Pipeline v2.  
**When** release assembled.  
**Then** no Hermes runtime ZIP/wheelhouse/Python/Node payload exists.  
**Oracle:** forbidden artifact count = 0.  
**Evidence:** `TEST-A-RELEASE-002`.

## A-COMPAT-001 — Required capability gate

**Given** version valid but one required capability missing.  
**When** runtime probe executes.  
**Then** state=`MISSING_REQUIRED_CAPABILITY`, not READY.  
**Oracle:** exact state=`MISSING_REQUIRED_CAPABILITY`；required set = `apps/work/src/main/run-stream.ts` `supportsHermesRunsTransport` 当前实现。本 AC MUST NOT 复制 feature/path 名。与任何文档枚举冲突时以该函数为准。  
**Evidence:** `TEST-A-COMPAT-001`.

## A-COMPAT-002 — Optional capability degradation

**Given** required capabilities present and optional capability absent.  
**When** Work starts.  
**Then** Runtime READY; only optional UI feature disabled.  
**Oracle:** READY + feature flag false.  
**Evidence:** `TEST-A-COMPAT-002`.

## A-SEC-001 — No secret in artifacts/logs

**Given** authenticated private repo install/update.  
**When** scan artifacts/logs.  
**Then** no credential value or credential-bearing URL present.  
**Oracle:** secret scan count = 0.  
**Evidence:** `TEST-A-SEC-001`.

## A-SEC-002 — Host allowlist enforced

**Given** source URL host not in allowedHosts.  
**When** preflight executes.  
**Then** `HERMES_REPO_HOST_NOT_ALLOWED`, network request count to that host=0.  
**Oracle:** error exact + request count 0.  
**Evidence:** `TEST-A-SEC-002`.

## A-SEC-003 — Junction/symlink write escape rejected

**Given** Hermes Root 下存在指向 Root 外的 junction 或 symlink。  
**When** Bootstrap / Policy 尝试写入该目标。  
**Then** 拒绝写入；状态 FAIL；Root 外路径 0 字节变更。  
**Oracle:** write rejected + external path digest unchanged.  
**Evidence:** `TEST-A-SEC-003`.

## A-OWNER-001 — Observed opsi/salt does not block Native

**Given** `%ProgramData%\SMC\control-owner.json` 含 `hermes=opsi` 或 `salt`。  
**When** Work 本地启动、Update、Doctor。  
**Then** `get-control-owner` 返回 `{ observed: "opsi"|"salt", effective: "direct" }`；READY 不被阻断；Update/Doctor 不因 observed 禁用。Doctor MAY 警告。  
**Oracle:** effective=direct + Update callable.  
**Evidence:** `TEST-A-OWNER-001`.

## A-OFFICIAL-001 — official-source.json schema and Root resolution

**Given** Native install 成功。  
**When** 读取 `%LOCALAPPDATA%\hermes\official-source.json`；named profile 进程 `HERMES_HOME` 为 `...\profiles\<name>`。  
**Then** schemaVersion=1；installUrl 无 userinfo；identity 与 YAML 相等；update/banner 解析到 Hermes Root 文件而非仅 checkout PROJECT_ROOT。缺失或损坏 → `HERMES_OFFICIAL_IDENTITY_INVALID`，禁止公开 fallback。  
**Oracle:** schema valid + Root path equal + error exact on corruption.  
**Evidence:** `TEST-A-OFFICIAL-001`.

## A-OBS-001 — Runtime diagnostics exposes one coherent runtime

**Given** READY endpoint.  
**When** diagnostics runs.  
**Then** home/source/head/gateway/plugin/profile/backend fields are present and secrets absent.  
**Oracle:** schema validation PASS.  
**Evidence:** `TEST-A-OBS-001`.

## A-REMOVE-001 — Legacy components no longer required

**Given** 当前 Work + Bootstrap 绿场安装。  
**When** 检查 release 与运行时依赖。  
**Then** 无 OPSI Hermes 包、SMC Hermes Installer、SMC Runtime Service 本地生命周期或 `D:\Programs\SMC\Hermes` 生产依赖。  
**Oracle:** dependency scan count=0 + e2e smoke PASS.  
**Evidence:** `TEST-A-REMOVE-001`.

---

# 21. Edge-case / Acceptance Input Matrix

| Case | Native | ProgramData 残留 | Enterprise Git | Origin | Auth | Expected |
|---|---:|---:|---|---|---|---|
| clean install | NO | NO | reachable | none | anonymous-internal | install → READY |
| native ready | YES | NO | reachable | enterprise | n/a | no-op startup |
| native source mismatch | YES | NO | reachable | public/other | n/a | REPO_MISMATCH；显式 Repair |
| enterprise offline | NO | NO | offline | none | n/a | install fail, no fallback；chat 禁用 |
| enterprise offline existing runtime | YES | NO | offline | enterprise | cached local | runtime may continue, update unavailable |
| approved commit missing | NO | NO | reachable | none | anonymous-internal | block before commit |
| ProgramData 残留 + Native ready | YES | YES | reachable | enterprise | n/a | READY；Doctor MAY warn；无迁移状态机 |
| dirty native checkout | YES | NO | reachable | enterprise | n/a | Work MUST NOT force |
| public upstream remote present | YES | NO | reachable | enterprise + public upstream | n/a | source policy violation |
| required capability missing | YES | NO | reachable | enterprise | n/a | incompatible |
| optional capability missing | YES | NO | reachable | enterprise | n/a | READY with feature degrade |
| policy user drift outside managed fields | YES | NO | n/a | enterprise | n/a | preserve |
| named profile no port | YES | NO | n/a | enterprise | n/a | allocate != 8642 |
| INSTALLING | partial | NO | reachable | enterprise | n/a | UI 开；chat 禁用 |

---

# 22. Negative Acceptance

```text
N-A-001
Enterprise Git auth failure
→ MUST NOT contact public upstream.

N-A-002
Installed origin != configured enterprise repo
→ MUST NOT silently rewrite origin.
→ MUST NOT run update.

N-A-003
allowedHosts mismatch
→ MUST NOT send a network request to rejected host.

N-A-004
Work startup
→ MUST NOT mutate hermes_cli source.

N-A-005
Profile switch
→ MUST NOT change Hermes Root。
→ MAY 改变进程 HERMES_HOME 为 Active Profile Home。

N-A-006
Release Pipeline v2
→ MUST NOT invoke OPSI stage/package.

N-A-007
Release Pipeline v2
→ MUST NOT invoke build_managed_bundle.

N-A-008
Policy apply
→ MUST NOT overwrite user-owned config paths。
→ MUST NOT 覆盖 named profile 非冲突端口。
→ MUST NOT 写死 C:\ProgramData\SMC\Hermes。

N-A-009
ProgramData / SYSTEM 任务 / HKLM HERMES_* 存在
→ MUST NOT 进入 MIGRATION_REQUIRED。
→ MUST NOT 自动删除用户文件。

N-A-010
Production endpoint
→ MUST NOT auto-add NousResearch upstream remote。
→ MUST NOT GitHub ZIP fallback。
→ MUST NOT banner ls-remote NousResearch。

N-A-011
INSTALLING / 非 READY
→ MUST NOT 发送本地 chat。

N-A-012
Work
→ MUST NOT pip install smc-managed extras。

N-A-013
connectionMode=remote 或 ssh
→ MUST NOT clone、MUST NOT 写 Hermes Root、MUST NOT 跑 install.ps1。

N-A-014
junction/symlink 指向 Hermes Root 外
→ MUST NOT 跟随写入。
```

---

# 23. Failure Injection

| Injection Point | Expected Postcondition |
|---|---|
| before repo preflight | 0 runtime mutation |
| after repo auth success / before clone | 0 runtime mutation |
| during clone | partial staging may exist; READY=false; source receipt FAIL |
| after Native install / before policy | Native exists; READY=false; retry policy/postcheck |
| after policy first field write | transaction restores managed fields or reports policy rollback error |
| before gateway install | Native runtime preserved; READY=false |
| after gateway start / before health | Gateway may run; READY only after health/capability |
| during update fetch | previous checkout preserved per Native update contract; Work reports FAIL |
| after update / health fail | UPDATE_FAILED; no READY |
| INSTALLING 时发 chat | 请求被拒绝；不标 READY |
| REPO_MISMATCH 未确认 Repair | origin 不变；READY=false |
| Repair 后 health fail | 备份保留；READY=false |

---

# 24. Evidence Contract

每个 Required Acceptance 的 Evidence JSON MUST 至少包含：

```json
{
  "acceptance_id": "A-SOURCE-001",
  "status": "PASS",
  "requirement_ids": ["REQ-SOURCE-001"],
  "test_ids": ["TEST-A-SOURCE-001"],
  "repo": "loudon84/smc-copilot",
  "work_commit": "git-sha",
  "hermes_repository_identity": "sha256",
  "hermes_commit": "git-sha",
  "branch": "work/prd-v6.0",
  "command": "test command",
  "exit_code": 0,
  "timestamp": "ISO-8601",
  "tool_version": "string",
  "oracle": {
    "type": "exact|hash_equal|http_status|set_empty|subset",
    "expected": "value",
    "actual": "value"
  },
  "evidence_files": []
}
```

Evidence MUST bind：

```text
smc-copilot repo
smc-copilot commit SHA
enterprise Hermes repository identity
enterprise Hermes commit SHA
test command
timestamp
tool version
```

Secrets MUST be digest/redacted，不能原文进入 Evidence。

---

# 25. Requirement Traceability Matrix

| Requirement | Invariant | Acceptance | Test | Evidence | Release Gate |
|---|---|---|---|---|---|
| REQ-ARCH-001 | INV-ARCH-001..003 | A-ARCH-001,002; A-OWNER-001 | TEST-A-ARCH-* / TEST-A-OWNER-001 | EVID-A-ARCH-* / EVID-A-OWNER-001 | REQUIRED |
| REQ-SOURCE-001 | INV-SOURCE-001,002 | A-SOURCE-001..004; A-OFFICIAL-001 | TEST-A-SOURCE-* / TEST-A-OFFICIAL-001 | EVID-A-SOURCE-* / EVID-A-OFFICIAL-001 | REQUIRED |
| REQ-FORK-001 | INV-SOURCE-002 | A-FORK-001..003 | TEST-A-FORK-* | EVID-A-FORK-* | REQUIRED |
| REQ-INSTALL-001 | INV-ARCH-001 | A-INSTALL-001..006 | TEST-A-INSTALL-* | EVID-A-INSTALL-* | REQUIRED |
| REQ-UPDATE-001 | INV-SOURCE-001 | A-UPDATE-001..003 | TEST-A-UPDATE-* | EVID-A-UPDATE-* | REQUIRED |
| REQ-STATE-001 | INV-ARCH-001 | A-STATE-001,002 | TEST-A-STATE-* | EVID-A-STATE-* | REQUIRED |
| REQ-RUNTIME-001 | INV-ARCH-003 | A-RUNTIME-001..003 | TEST-A-RUNTIME-* | EVID-A-RUNTIME-* | REQUIRED |
| REQ-GW-001 | INV-ARCH-002 | A-GW-001..004 | TEST-A-GW-* | EVID-A-GW-* | REQUIRED |
| REQ-PROFILE-001 | INV-ARCH-001 | A-PROFILE-001..003 | TEST-A-PROFILE-* | EVID-A-PROFILE-* | REQUIRED |
| REQ-CONFIG-001 | INV-ARCH-003 | A-CONFIG-001 | TEST-A-CONFIG-001 | EVID-A-CONFIG-001 | REQUIRED |
| REQ-POLICY-001 | INV-ARCH-001 | A-POLICY-001..003 | TEST-A-POLICY-* | EVID-A-POLICY-* | REQUIRED |
| REQ-MIGRATE-001 | F-015 | none | none | none | **CANCELLED** |
| REQ-RELEASE-001 | INV-ARCH-001 | A-RELEASE-001,002 | TEST-A-RELEASE-* | EVID-A-RELEASE-* | REQUIRED |
| REQ-COMPAT-001 | INV-ARCH-003 | A-COMPAT-001,002 | TEST-A-COMPAT-* | EVID-A-COMPAT-* | REQUIRED |
| REQ-SEC-001 | INV-SOURCE-002 | A-SEC-001..003 | TEST-A-SEC-* | EVID-A-SEC-* | REQUIRED |
| REQ-OBS-001 | INV-SOURCE-001 | A-OBS-001 | TEST-A-OBS-001 | EVID-A-OBS-001 | REQUIRED |
| REQ-REMOVE-001 | INV-ARCH-001..003 | A-REMOVE-001 | TEST-A-REMOVE-001 | EVID-A-REMOVE-001 | REQUIRED |
| Repair F-016 | INV-SOURCE-001 | A-REPAIR-001 | TEST-A-REPAIR-001 | EVID-A-REPAIR-001 | REQUIRED |

---

# 26. Release Gate

状态：

```text
PASS
FAIL
SKIPPED
BLOCKED
```

规则：

```text
SKIPPED != PASS
BLOCKED != PASS
```

Release REQUIRED Gate：

```text
RG-001 Work package passes.
RG-002 Enterprise repo source contract passes.
RG-003 Hermes Enterprise Fork distribution patch tests pass.
RG-004 Clean Native install passes.
RG-005 Enterprise-only update passes.
RG-006 No-public-fallback negative test passes.
RG-007 Single Hermes Root test passes.
RG-008 Native Gateway lifecycle passes.
RG-009 Plugin root/profile/port semantics pass.
RG-010 Policy preserve + Native path test passes.
RG-011 CANCELLED（无存量迁移）。
RG-012 OPSI absent test passes.
RG-013 Runtime bundle absent test passes.
RG-014 Secret scan passes.
RG-015 Golden Consumer E2E passes.
RG-016 Chat blocked until READY.
RG-017 smc-managed extras preinstalled by fork setup.
RG-018 Wrong-origin explicit Repair.
RG-019 LOCALAPPDATA home is not configuration_error.
RG-020 No GitHub ZIP / banner / upstream on endpoint.
```

任何 Required Gate：

```text
status != PASS
```

则：

```text
Release Gate = FAIL
process exit != 0
```

---

# 27. Golden Consumer / Real-world Acceptance

必须同时使用：

```text
Synthetic Fixture
+
Real Golden Consumer
```

Golden Consumer 记录：

```text
smc-copilot repo identity
smc-copilot HEAD SHA
clean / dirty
enterprise Hermes repo identity
enterprise Hermes HEAD SHA
enterprise Hermes origin
before runtime snapshot
after runtime snapshot
Work settings digest
```

MUST NOT 要求 legacy ProgramData 用户数据 digest。Synthetic fixture MUST NOT 替代真实公司 Hermes Fork 与真实 Work Desktop 组合验收。

---

# 28. Change Classification / File Modification Inventory

## 28.1 Work

| File / Module | Classification | Target |
|---|---|---|
| `apps/work/src/main/runtime/hermes-runtime-config.ts` | REPLACE | Native runtime contract |
| `apps/work/src/main/runtime/hermes-runtime-locator.ts` | MODIFY | `%LOCALAPPDATA%\hermes` + native CLI |
| `apps/work/src/main/runtime/hermes-runtime-paths.ts` | MODIFY | remove `D:\Programs\SMC\Hermes` production assumption |
| `apps/work/src/main/runtime/hermes-cli-runner.ts` | MODIFY | Native CLI resolution |
| `apps/work/src/main/runtime/runtime-management-backend.ts` | MODIFY | add/select Native backend |
| `apps/work/src/main/runtime/native-hermes-runtime-backend.ts` | ADD | CLI/API/filesystem backend |
| `apps/work/src/main/runtime/runtime-manager.ts` | MODIFY | native production default |
| `apps/work/src/main/hermes.ts` | MODIFY | native lifecycle/capability integration |
| `apps/work/src/main/utils.ts` | MODIFY | profile semantics review |
| `apps/work/src/main/config.ts` | MODIFY | Work settings move out of HERMES_HOME |
| `apps/work/src/main/skills.ts` | MODIFY | Native CLI/profile contract |
| Plugin management module | ADD/MODIFY | Native Plugin CLI |
| `apps/work/src/main/hermes-agent-compat.ts` | REMOVE local patch path | no endpoint source patch |
| `legacy-local-runtime-adapter.ts` | REPLACE | NativeHermesRuntimeBackend；删除 LOCALAPPDATA 禁令 |
| `apps/work/src/main/hermes/control-owner.ts` | MODIFY | effective=direct；observed 不阻断 |
| `apps/work/src/shared/runtime/control-owner.ts` | MODIFY | 同 ADR-038 |
| `apps/work/src/main/ipc/register.ts` | MODIFY | Update/Doctor 用 effective owner；local-only Bootstrap |
| `apps/work/src/main/app/start.ts` | MODIFY | 触发 Bootstrap mutex |
| RuntimePane / ConnectionErrorScreen | MODIFY | 不以 observed=opsi 禁用本地能力 |
| `apps/work/src/main/gateway-ports.ts` | KEEP behavior | named profile 端口分配 |
| `apps/work/src/main/run-stream.ts` | KEEP as SOT | required capabilities |
| Work-bundled hermes-policy JSON | ADD | F-013 / F-014 config half |
| Native bootstrap in Work | ADD | 用户态首次启动 |
| runtime diagnostics | ADD | source/home/head/gateway diagnostics |
| migration module | MUST NOT ADD | F-015 |

## 28.2 Release

| File / Module | Classification | Target |
|---|---|---|
| `release/client-release.yaml` | REPLACE schema | v2 enterprise native |
| `scripts/build-client-release.ps1` | MODIFY | remove runtime/OPSI args/stages |
| `tools/release/client/build_client_release.py` | MODIFY | Work + bootstrap + manifest only |
| `tools/release/hermes/build_runtime.py` | REMOVE from production | no managed runtime bundle |
| `infra/windows/hermes-agent/installer` | REMOVE from production | no SMC Hermes MSI |
| `docs/adr/ADR-038-hermes-native-enterprise-lifecycle.md` | ADD | Hermes Native lifecycle SOT |
| `docs/adr/ADR-031-opsi-parallel-endpoint-control-plane.md` | MODIFY | Decision 2/4 superseded note |
| Native bootstrap scripts | ADD | enterprise repo/native install |
| `hermes-native-manifest.json` generator | ADD | provenance |

## 28.3 Company Hermes Fork

| File / Module | Classification | Target |
|---|---|---|
| `scripts/install.ps1` | MODIFY | 企业默认 URL + RepoUrl 参数；删除 GitHub ZIP fallback |
| `hermes_cli/update_cmd.py` | MODIFY | 企业 origin official；读 official-source.json；禁用公开 upstream |
| `hermes_cli/banner.py` | MODIFY | 更新探测走 Official Identity |
| Native setup extras | MODIFY | 预装 smc-managed python/node packages |
| `official-source.json` writer | ADD | Bootstrap 写入无凭据 identity |
| update/installer E2E | ADD/MODIFY | enterprise fixture + 无公开 fallback 负例 |

---

# 29. Replacement / Removal Matrix

| Old Component | Replacement | Removal Condition |
|---|---|---|
| SMC Managed Hermes Runtime | Hermes Native Enterprise Fork | Native clean install PASS |
| SMC WiX Hermes Installer | Work Bootstrap + Hermes Native Installer | Installer E2E PASS |
| OPSI Hermes package | none | Release v2 PASS |
| SMC Runtime Service local lifecycle | NativeHermesRuntimeBackend | Native backend E2E PASS |
| SYSTEM `SMC Hermes Gateway` | 用户 ONLOGON Native 计划任务 | Gateway lifecycle PASS |
| `C:\ProgramData\SMC\Hermes` 作为生产 Home | `%LOCALAPPDATA%\hermes` | 代码路径删除 + 绿场 PASS |
| `D:\Programs\SMC\Hermes` ProgramRoot | Native checkout | 同上 |
| Work local source patch | Enterprise Fork source changes | Fork patch PASS |
| Work config in Hermes Home | Work userData store | A-CONFIG-001 |
| ADR-031 `hermes: opsi` | 本地忽略 / native-direct | F-001 |
| `smc-managed` extras via Managed installer | fork Native setup | A-FORK-003 |

---

# 30. Implementation Phases

```text
Phase 0 — Contract Freeze
- release config v2 schema + schemeAliases + update.policy
- Official Identity
- Work-code capability SOT
- Error codes
- 独立 PRD review → status APPROVED_FOR_PLAN（已完成）

Phase 1 — Enterprise Hermes Fork
- install.ps1 RepoUrl + 无 GitHub ZIP
- update_cmd.py official identity
- banner.py enterprise-only
- smc-managed extras in setup
- fork E2E + 公开源负例

Phase 2 — Work Native Runtime Adapter
- locator 默认 LOCALAPPDATA
- 删除 LOCALAPPDATA 禁令
- CLI runner / native backend / gateway probe / diagnostics
- 本地忽略 control-owner opsi

Phase 3 — Work State Separation
- Hermes Root vs Active Profile Home
- named profile 端口分配保持
- Work settings → userData
- Plugin native root

Phase 4 — Native Bootstrap + SMC Policy
- Work 首次启动用户态 Bootstrap
- anonymous-internal preflight
- install pin + official-source.json
- policy JSON merge（路径 = Hermes Root）
- gateway install ONLOGON
- INSTALLING 禁用 chat
- Repair for wrong origin

Phase 5 — Release Pipeline v2
- 断开生产调用：`all` 不再执行 hermes/hermes-installer/runtime/opsi-* stages
- assemble 不再要求 HermesZip / OpsiPackage
- 源码树 MAY 留在仓库但 MUST NOT 被 main pipeline 调用

Phase 6 — CANCELLED（无存量用户迁移）

Phase 7 — Pilot
- synthetic
- real Golden Consumer（git.superic.com + Work）
- failure injection（绿场 + Repair）

Phase 8 — 物理删除（仅 Phase 7 Required AC 全 PASS 之后）
- 删除 tools/release/hermes/build_runtime.py
- 删除 infra/windows/hermes-agent/installer
- 删除 infra/opsi/products/smc-hermes-agent
```

Phase 5 ≠ 物理删除。Phase 8 才删除文件。Phase 6 MUST NOT 实现。

---

# 31. Plan Generation Gate

status 已为 `APPROVED_FOR_PLAN`（v2.1.1 revision review + M-01 closure review PASS）。Plan 可在 `work/prd-v6.0 @ 1ad1af60a2ab13d93da92cb06cb3b7aff7a08e31` 生成。v2.0.0 的同名声明仍无效。

v2.1.1 Plan Generation Gate：

```text
[x] Goal 唯一
[x] Scope / Non-goal 完整（含 NON-GOAL-009 无存量迁移）
[x] Runtime Owner 唯一
[x] Enterprise Git Source SOT 明确
[x] Hermes Root SOT 明确
[x] Gateway Owner 明确（用户 ONLOGON 任务）
[x] Mutation side-effect scope 明确
[x] Install/update failure semantics 明确
[x] Repair T0 明确；存量迁移明确取消
[x] Public upstream endpoint policy 明确（含 ZIP/banner）
[x] authMode 生产默认 anonymous-internal
[x] required capabilities SOT = Work 代码
[x] Acceptance Oracle machine-readable
[x] Evidence contract 明确
[x] Requirement Traceability 完整
[x] grilling freeze 写入 §0.1
[x] 独立 PRD review PASS
[x] status = APPROVED_FOR_PLAN
```

实际公司 Git URL **不是 PRD 常量**（除 golden 示例）。生产 SOT 是 `release/client-release.yaml#hermes.source`；缺失即 `RELEASE_CONFIG_INVALID`。Plan 不得自行硬编码 Git URL。

---

# 32. PRD Quality Gate

## Architecture

```text
[x] Goal 唯一明确
[x] Scope / Non-goal 完整
[x] Owner 不重叠
[x] System Boundary 明确
```

## State

```text
[x] 所有持久状态有 SOT
[x] Desired / Observed / Resolved / Applied 分离
[x] State transition 明确
```

## Semantics

```text
[x] default 行为明确
[x] optional / required 语义明确
[x] conflict 行为明确
[x] ownership 明确
[x] hash scope 明确
```

## Side Effects

```text
[x] 每个 operation 有 mutation contract
[x] read-only 作用域明确
```

## Failure

```text
[x] failure 有 error code
[x] rollback 有 postcondition
[x] rollback failure 有恢复方案
[x] retryable / non-retryable 已区分
```

## Acceptance

```text
[x] 每个 MUST 有 AC
[x] MUST NOT 有 Negative AC
[x] 绿场 install/update/Repair 有 failure injection
[x] 高风险需求有输入矩阵
[x] Oracle 可机器判断
[x] 存量迁移已从 Required Gate 移除
```

## Evidence

```text
[x] required AC 有 Evidence schema
[x] Evidence 绑定 Work + Hermes commit
[x] BLOCKED/SKIPPED 不算 PASS
[x] Release Gate 与 process exit code 一致
```

---

# 33. Definition of Done

只有以下全部满足，本 PRD 才可进入 `VERIFIED`：

```text
[ ] Company Hermes Fork installer source = enterprise repo；无 GitHub ZIP fallback
[ ] Company Hermes Fork update/banner official = 企业 origin
[ ] Endpoint 不存在自动 public upstream sync
[ ] smc-managed extras 由 fork setup 预装
[ ] Native install / update E2E PASS
[ ] Work Native Runtime Backend PASS；LOCALAPPDATA 不再是 configuration_error
[ ] Work/CLI/Gateway Hermes Root 一致
[ ] Plugin root 与 Native default Home 一致
[ ] Profile：Root 不变；进程 HERMES_HOME 可为 Active Profile Home
[ ] named profile 端口由 Work 分配且不覆盖已有非冲突值
[ ] Work settings 写入 userData，不以 desktop.json 为 SOT
[ ] SMC Policy 只修改 managed fields；路径在 Hermes Root 下
[ ] Work update 与 Hermes update 相互独立；update HEAD = origin/<defaultBranch>
[ ] 未实现存量用户迁移状态机
[ ] OPSI 已退出 Hermes release
[ ] SMC Hermes Runtime bundle 不再生成
[ ] SMC Hermes MSI 不再生成
[ ] 错误 origin 显式 Repair PASS
[ ] INSTALLING 时本地 chat 禁用 PASS
[ ] named profile Gateway install/uninstall PASS
[ ] 无系统 Git 干净机 ENSURE_GIT PASS
[ ] official-source.json schema + Root 解析 PASS
[ ] Bootstrap mutex/timeout + remote skip PASS
[ ] observed opsi/salt 不阻断 Native PASS
[ ] Secret scan PASS
[ ] Golden Consumer PASS
[ ] Traceability Evidence 完整
[ ] Required Acceptance 全部 PASS（不含 A-MIGRATE）
```

---

# 34. Final Engineering Decision

本 PRD v2.1.0 固化以下架构决策（grilling freeze）：

```text
1. Work Desktop 是 Hermes Native Runtime 的 Consumer，不是 Runtime Owner。

2. Hermes Agent 使用公司自有 Git 仓库维护的 Enterprise Fork
   （golden：http://git.superic.com/aiplatform/hermes-agent.git）。

3. 终端 Hermes Git 安装源 = 公司仓。
   终端 Hermes Git 更新源 = 同一公司仓。
   uv/Node/Git for Windows 公网安装器允许。

4. NousResearch/hermes-agent 仅作为公司 Fork 在服务端同步的 upstream。
   endpoint MUST NOT clone/fetch/ZIP/banner/upstream 指向它。

5. Official Identity 两层：fork 默认企业 URL + official-source.json。
   企业 origin 是 official，不是 fork。

6. Native Installer / Native Update 保留。
   Gateway = 用户 ONLOGON 计划任务，不是 SCM Service，不是 SYSTEM 任务。
   Work 首次启动 Bootstrap；可补 gateway start；退出不杀 Gateway。

7. Hermes Root = %LOCALAPPDATA%\hermes。
   Active Profile Home 可以是 Root\profiles\<name>。

8. OPSI 完全退出 Hermes 生命周期。ADR-031 hermes=opsi 作废。
   本地永远 native/direct。

9. SMC 不再构建 Hermes Runtime ZIP/Python/Node/Wheelhouse/WiX。
   smc-managed extras 由 fork setup 预装。
   Policy JSON 跟 Work 发版走。

10. Work 与 Hermes 独立升级：安装 pin approvedCommit；
    日常 update 跟 origin/<defaultBranch>；
    READY 门禁 = version + Work-code capabilities + source identity。

11. 无生产存量：不做用户数据迁移。
    错误 origin 走显式 Repair。
    仓库仍删除 Managed/OPSI/WiX 代码。

12. 单交互用户设备；default Gateway 8642；
    named profile 端口由 Work 写入该 profile config.yaml。

13. status=APPROVED_FOR_PLAN（v2.1.1 independent review PASS）。
```

---

# 35. Source Evidence Baseline

本 PRD v2.1.1 BLOCKER 关闭使用的代码基线（后续代码变动 MUST 在此工作区）：

```text
smc-copilot:
repository = loudon84/smc-copilot
branch     = work/prd-v6.0
HEAD       = 1ad1af60a2ab13d93da92cb06cb3b7aff7a08e31

key current files:
- apps/work/src/main/runtime/hermes-runtime-config.ts
- apps/work/src/main/runtime/legacy-local-runtime-adapter.ts
- apps/work/src/main/runtime/runtime-management-backend.ts
- apps/work/src/main/hermes.ts
- apps/work/src/main/hermes/control-owner.ts
- apps/work/src/shared/runtime/control-owner.ts
- apps/work/src/main/ipc/register.ts
- apps/work/src/main/app/start.ts
- apps/work/src/main/utils.ts
- apps/work/src/main/config.ts
- apps/work/src/main/gateway-ports.ts
- apps/work/src/main/run-stream.ts
- scripts/build-client-release.ps1
- tools/release/client/build_client_release.py
- release/client-release.yaml          (仍为 v1；hermes.repo=D:/git/hermes-agent)
- release/hermes-runtime-profiles.yaml (smc-managed extras + managedConfig)
- infra/windows/hermes-agent/installer/*
- infra/opsi/products/smc-hermes-agent/*
- docs/adr/ADR-031-opsi-parallel-endpoint-control-plane.md
- docs/adr/ADR-038-hermes-native-enterprise-lifecycle.md (v2.1.1 交付物)

Company Hermes fork working copy:
path   = e:\git\hermes-agent
origin = http://git.superic.com/aiplatform/hermes-agent.git
HEAD   = 29112bef0 chore: release v0.21.0
files  =
- scripts/install.ps1
- hermes_cli/update_cmd.py
- hermes_cli/banner.py
- hermes_cli/profiles.py
- hermes_cli/gateway_windows.py
- gateway/platforms/api_server.py

Important:
公开 upstream 只作为必须打掉的 Native 默认行为参考，不是生产 endpoint source。
生产 Hermes Git Source 的事实源始终是公司 Enterprise Repository。
v2.0.0 的 APPROVED_FOR_PLAN 声明无效。
```
