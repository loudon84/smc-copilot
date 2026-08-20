---
name: OPSI v2.1.1 Runtime Integrity & Browser Closure
overview: 在 v2.1 Managed Environment 基线上，以固定 Safe SQLite、Node >=22.22、同源 Hermes Node Workspace、Managed Path Resolver 和 Installer Machine Environment 关闭 Gateway WAL 警告与 Local Browser npm cwd 两个 P0 缺口；Chromium继续首次按需下载。
todos:
  - id: safe-sqlite-node-runtime
    content: 在 SMC Windows Runtime Builder 落地固定 Safe SQLite overlay、Node >=22.22 与真实 sqlite/node/npm/npx build gates
    status: completed
  - id: hermes-node-workspace
    content: 从同一 Hermes source freeze 构建 node/hermes-agent production workspace，捆绑 agent-browser 且排除 Chromium
    status: completed
  - id: hermes-managed-path-resolver
    content: 在内部 Hermes 仓新增 Agent/Node Root resolver，并修复 Local Browser cwd、Node executable lookup 与错误提示
    status: completed
  - id: installer-managed-runtime-env
    content: 在 SMC Installer 补齐 HERMES_NODE_ROOT、Gateway 显式环境、ACL 与 Upgrade/Repair graceful stop 生命周期
    status: completed
  - id: automated-runtime-release-gates
    content: 扩展两仓自动化测试、runtime manifest、release inventory 与 fail-closed gates，验证同源 revision 和禁止路径
    status: completed
  - id: manual-win10-win11-browser-proof
    content: 人工执行 Windows 10/11 标准用户 Gateway、SQLite、Local Browser、Chromium on-demand 与离线 Node Workspace 矩阵并签署；Cursor 不得自动完成
    status: pending
isProject: false
---

# Cursor Implementation Plan — OPSI v2.1.1 Runtime Integrity & Browser Closure

## 结果与边界

要实现：

- 保持 Embedded Python 3.12.8/cp312，以官方固定 x64 SQLite overlay 使 `sqlite3.sqlite_version >= 3.51.3`，Gateway 不再触发 WAL-reset vulnerability fallback。
- 将私有 Node 固定升级到 `>=22.22.0`，真实验证 `node.exe`、`npm.cmd`、`npx.cmd`。
- 从构建 Python Wheel 的同一 Hermes Git source freeze 执行 `npm ci --omit=dev --workspaces=false`，生成 `node/hermes-agent` production workspace 并捆绑 `agent-browser`。
- 冻结 `HERMES_HOME`、`HERMES_AGENT_ROOT`、`HERMES_NODE_ROOT` 分域；Local Browser 只在 ProgramRoot workspace 工作，Managed Mode 优先使用私有 Node。
- Installer/Gateway 在 Machine/Task 环境显式提供三个路径变量，ProgramRoot Users=ReadAndExecute、DataRoot Users=Modify；Upgrade/Repair 先优雅停止 Gateway 再替换 Runtime。
- Runtime manifest、Release inventory 和自动化 Gate 对 SQLite、Node、Workspace、同源 Git SHA 与 Chromium 排除 fail closed。

明确不做：

- 不升级 Python 主版本，不改 Gateway Protocol、OPSI Control API 或 Work Direct Gateway 数据面。
- 不把 Chromium 放入 Runtime ZIP、MSI 或 Burn EXE；只允许首次 Local Browser setup 按需下载。
- 不把 `build_node_packages.py` 改造成 Hermes Root Workspace builder；SMC managed packages 与 Hermes native workspace 保持两层。
- 不修改 `infra/salt`、`services/salt-control`、`contracts/salt-control-api`、`services/runtime`、`contracts/runtime-api` 或 `apps/work`。
- 不自动完成 Windows Live Evidence、Release GO、Production signing 或发布。

## 仓库与交付边界

本计划包含两个独立仓库的协同变更：

1. SMC Repository：当前工作区 `E:\git\smc-copilot`，负责 Runtime、Release、Installer、Machine Environment 和 gates。
2. Internal Hermes Repository：实施时由操作者提供/确认 checkout（当前开发机候选为 `D:\Programs\hermes-agent-src`），负责 `runtime_paths.py`、Local Browser cwd 和 Node resolver。

两仓分别提交和验证；SMC builder 必须显式接收 Hermes source path/revision 并证明 Python Wheel、`package.json`、`package-lock.json` 来自同一 Git SHA。没有 Hermes checkout 或无权写入时，Hermes todo 不得伪装完成。

## 上下文路由

立即读取：

- [`AGENTS.md`](AGENTS.md)：OPSI provider isolation 与跨项目规则。
- [`docs/opsi/PRD-OPSI-v2.1.1.md`](docs/opsi/PRD-OPSI-v2.1.1.md)：全部 FR、AC、No-Go、DoD。
- [`docs/opsi/PRD-OPSI-v2.1.md`](docs/opsi/PRD-OPSI-v2.1.md)：Machine Environment、PATH、ACL 与 Standard User 基线。
- [`tools/release/hermes/windows_runtime.py`](tools/release/hermes/windows_runtime.py)：固定 Python/Node、runtime assembly 与 PE gate。
- [`tools/release/hermes/build_runtime.py`](tools/release/hermes/build_runtime.py)：source freeze、wheel/wheelhouse、Node cache 与正式 Release 串联。
- [`infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1`](infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1)：Managed layout/env/PATH/ACL。
- [`infra/windows/hermes-agent/installer/InstallerCore.psm1`](infra/windows/hermes-agent/installer/InstallerCore.psm1)：Install/Upgrade/Repair/Uninstall/Gateway lifecycle。

按触发读取：

- Node Workspace 实施时读取 Hermes source freeze 根 `package.json`、`package-lock.json`，以及 [`tools/release/hermes/build_node_packages.py`](tools/release/hermes/build_node_packages.py) 的公开边界。
- Hermes resolver 实施时只读取内部仓 `hermes_cli/tools_config.py`、`hermes_constants.py`、相关 tests 和 Node executable resolver 的直接调用方。
- Manifest 变更时读取 `release_v2.py`、`verify_runtime.py` 与现有 manifest schema/消费者。
- Installer Task wrapper 收敛时读取 `infra/windows/hermes-agent/scripts` 中已有脚本和 Pester，不读取 Salt/Runtime 实现。

禁止预加载：

- 历史 PRD/evidence、references、构建输出、Runtime 数据、旧 OPSI Product 全树、无关子项目。

## 最小方案判定

- SQLite：复用 CPython embed 的 `_sqlite3.pyd`，只 overlay 与 cp312/x64 ABI 兼容的官方 `sqlite3.dll`；固定 URL/version/SHA256，不引入客户端 updater。
- Node：沿用现有 Node archive materialization，只更新 pinned dist 并增加 semantic version/runtime gates。
- Workspace：新增一个专用 builder 运行 pinned embedded npm；不让 `windows_runtime.py` 自己联网，也不复用 Layer A tgz 解压来伪造完整 Hermes workspace。
- Hermes 路径：新增单一 `runtime_paths.py`，不在每个 tool/provider 中复制环境变量判断。
- Gateway：优先复用/新增单一 `Start-HermesGateway.ps1` 显式注入环境；不把 Node 加入 Machine PATH。

## Todo — Safe SQLite & Node Runtime

### 结果

- `windows_runtime.py` 固定 `SQLITE_VERSION`、官方 x64 URL、SHA256 与 `SQLITE_MIN_SAFE_VERSION=(3,51,3)`；cache/download 仍只发生在 Build Pipeline。
- overlay 后使用最终 `python.exe` 真实 import sqlite3 并按数字 tuple 比较版本；缺 DLL、ABI/architecture 不匹配、import 失败或版本过低立即失败。
- 固定 Node 22.x 且 `>=22.22.0`，更新 URL/SHA256；真实运行 Node/npm/npx Gate，禁止 22.11.0。
- runtime metadata 记录实际解析到的 Python/SQLite/Node/npm 版本，而不是只回写配置常量。

### 实施锚点

- 主锚点：[`tools/release/hermes/windows_runtime.py`](tools/release/hermes/windows_runtime.py) 的 `build_windows_runtime`。
- 候选触碰：[`tools/release/hermes/verify_runtime.py`](tools/release/hermes/verify_runtime.py)、[`tools/release/tests/test_hermes_builder.py`](tools/release/tests/test_hermes_builder.py)。

### 变更预算与验证

- 新增生产依赖 0；SQLite/Node 发行物必须进入现有 digest/cache policy；不新增第二套 downloader。
- 最小验证：`python -m pytest tools/release/tests/test_hermes_builder.py -k "sqlite or node or windows_runtime" -q`
- 停止条件：[ ] 实际 embed Python 报告 SQLite >=3.51.3；Node >=22.22；npm/npx 可执行；tamper/wrong architecture/低版本均 fail closed。

## Todo — Hermes Node Workspace

### 结果

- 新增 `tools/release/hermes/build_node_workspace.py`，从同一 clean Hermes source freeze 复制 root manifests，并以 pinned embedded npm 执行 `npm ci --omit=dev --workspaces=false`。
- 输出独立 `work/hermes-node-workspace`，最终复制到 `node/hermes-agent`；`node_modules/agent-browser` 必须存在。
- 明确排除 Playwright/Chromium/browser cache 等下载产物；构建阶段禁止触发 Chromium install hook，最终 ZIP 扫描也必须拒绝 Chromium。
- `build_node_packages.py` 保持 Layer A，最终 `node/node_modules` 与 `node/hermes-agent/node_modules` 两层并存且来源清晰。

### 实施锚点

- 主锚点：新增 `tools/release/hermes/build_node_workspace.py`。
- 串联锚点：[`tools/release/hermes/build_runtime.py`](tools/release/hermes/build_runtime.py) 的 `build_managed_bundle`。
- 候选测试：[`tools/release/tests/test_hermes_builder.py`](tools/release/tests/test_hermes_builder.py)。

### 变更预算与验证

- 新增生产文件最多 1；新增 repository dependency 0；使用现有 subprocess、digest、source metadata helpers。
- 最小验证：`python -m pytest tools/release/tests/test_hermes_builder.py -k "workspace or agent_browser or source_freeze" -q`
- 停止条件：[ ] manifests/wheel revision 一致；agent-browser bundled；客户端无需 npm install；Chromium 不在 tree/ZIP。

## Todo — Hermes Managed Path Resolver

### 结果

- 内部 Hermes 仓新增 `hermes_cli/runtime_paths.py::get_agent_root/get_managed_node_root`，环境变量 trim/resolve 后使用，未设置时保持 upstream/source fallback。
- `tools_config.py` 的 Browser workspace、npm cwd、agent-browser/camofox lookup 和失败提示统一使用 resolved agent root。
- Node/npm/npx lookup 顺序固定为 `HERMES_NODE_ROOT → HERMES_AGENT_ROOT.parent → HERMES_HOME/node → PATH`。
- 测试禁止 Managed Mode 解析到 DataRoot/Profile；同时证明未设置环境变量时 source checkout/upstream installer 不回归。

### 实施锚点

- 主锚点：内部 Hermes `hermes_cli/runtime_paths.py`。
- 候选触碰：内部 Hermes `hermes_cli/tools_config.py`、`hermes_constants.py` 及其现有 tests。

### 变更预算与验证

- 新增公共 resolver 文件 1；不新增 SMC-specific hardcoded drive/path 到 Hermes upstream fallback。
- 最小验证：运行内部 Hermes 仓相关 path/tools_config tests，并用一个临时 Managed layout 验证 npm cwd 与 Node resolver。
- 停止条件：[ ] Managed Mode 无 `HERMES_HOME/hermes-agent`/Profile 路径；source/upstream mode 保持兼容；错误提示显示真实 root。

## Todo — Installer Managed Runtime Environment

### 结果

- Managed layout 增加 `NodeRoot`；Install/Upgrade/Repair 写 Machine `HERMES_NODE_ROOT` 并同步 process env；Uninstall 只清 Installer-owned env/PATH，保留 DataRoot。
- Machine PATH 只含 ProgramRoot `bin`/`scripts`，NodeRoot 永不进入全局 PATH。
- Gateway Task 显式获得三个变量；优先收敛到可测试的 `Start-HermesGateway.ps1`，避免安装管理员或 Task Scheduler 旧 Environment Block。
- Upgrade/Repair 优先 graceful gateway stop；超时后停止 Task 和 ProgramRoot 进程并重试原子替换，避免 `_rust.pyd` 锁文件导致 MSI 1722。
- v2.1 Program/Data ACL 和 Standard User 权限保持不回退。

### 实施锚点

- 主锚点：[`infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1`](infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1) 的 layout/environment functions。
- 生命周期锚点：[`infra/windows/hermes-agent/installer/InstallerCore.psm1`](infra/windows/hermes-agent/installer/InstallerCore.psm1) 的 Install/Repair/Uninstall/Gateway functions。
- 候选测试：`infra/windows/hermes-agent/tests/SmcHermesManaged.Tests.ps1`、`Installer.Tests.ps1`。

### 变更预算与验证

- 新 Gateway wrapper 最多 1；新增 Service/Controller/依赖 0；不改 WiX 参数 contract。
- 最小验证：在 Windows PowerShell 5.1 运行两个 Pester suite，并执行 installer smoke build/read-back。
- 停止条件：[ ] 三变量 Machine/Task 生效且 uninstall clean；Node 不在 PATH；ACL 正确；锁文件升级不再产生 1722。

## Todo — Automated Runtime & Release Gates

### 结果

- `windows-runtime.json` 使用 `smc.hermes.windows-runtime.v2` 并记录实际 SQLite/Node/npm versions 与 Hermes source revision。
- `release-manifest.json` inventory 覆盖 `sqlite3.dll`、`_sqlite3.pyd`、Node/npm/npx、Workspace manifests 和 `agent-browser`。
- Runtime functional gate 真实执行 `hermes --version`、sqlite import/version、node/npm/npx versions；fixtures 只能测结构，不能代替真实 PE Gate。
- 增加负向测试：低 SQLite/Node、hash mismatch、wrong architecture、缺 agent-browser、revision mismatch、DataRoot npm cwd、system Node 抢占、Chromium 泄漏均拒绝。
- Client Release 仍由 `scripts/build-client-release.ps1` 单一入口串联，Installer 只消费通过 gates 的 Release v2 payload。

### 实施锚点

- 主锚点：[`tools/release/hermes/verify_runtime.py`](tools/release/hermes/verify_runtime.py) 与 `release_v2.py`。
- 候选触碰：[`tools/release/tests/test_hermes_builder.py`](tools/release/tests/test_hermes_builder.py)、`tools/release/tests/test_client_release.py`、现有 runtime manifest schema。

### 变更预算与验证

- 不新增平行 manifest 或 release entrypoint；扩展现有 schema/consumer。
- 最小验证：`python -m pytest tools/release/tests/test_hermes_builder.py tools/release/tests/test_client_release.py -q`，随后执行非 Smoke Client Release dry run/read-back。
- 停止条件：[ ] 所有 AC 可映射到自动 gate 或明确 manual gate；No-Go 均 fail closed；Salt/Runtime/Work isolation diff 为空。

## Manual Windows 10/11 Standard User Proof

### 人工 Runbook

1. 用正式 Client Release Pipeline 和同一 Hermes source freeze 生成 Runtime、MSI/Burn EXE，记录两仓 Git SHA、artifact digest、SQLite/Node/npm versions。
2. 在 Clean Windows 10/11 x64 由管理员 Fresh Install；重登标准员工账号，确认三个 Machine 环境变量、Program/Data ACL 与 PATH。
3. 标准员工执行 `hermes --version`、SQLite version、Node/npm/npx private-path checks 和 `hermes gateway run`；确认无 WAL vulnerability warning。
4. 执行 `hermes setup → Local Browser`；证明 `agent-browser` 已 bundled、未执行 npm install、cwd 不在 DataRoot/Profile、首次仅下载 Chromium并可启动 Browser。
5. 执行 Upgrade/Repair/Reboot/Uninstall/Reinstall；确认 graceful stop/锁文件替换、Gateway Task 环境、DataRoot 保留、env/PATH 清理。
6. 断网重复 Gateway 和 bundled Node Workspace 验证；Chromium 首次下载步骤单独在联网条件完成并记录边界。

### Cursor 约束

- 不使用 Production signing key，不自动完成 manual todo，不把 unit/Pester/smoke/fixture 写成 Windows Live Evidence。
- 不改 `not_proven/proven/GO`、不伪造签署、不自动触发 OPSI Depot/Endpoint/Pilot/Production 发布。

### 停止条件

- [ ] Windows 10/11 真实 MSI、标准用户、Gateway、Local Browser、Chromium on-demand、Upgrade/Repair/Uninstall 证据由 Release Owner、Endpoint Ops 和 Security Owner 签署。

## 交付顺序与合并门禁

1. 先完成 Safe SQLite/Node Runtime 和 Hermes Node Workspace，产出可验证 Runtime tree。
2. 再完成 Hermes resolver；以 source/upstream compatibility tests 和 SMC Managed Mode tests 双向验证。
3. 再接 Installer environment/lifecycle，避免 Installer 指向尚未存在的 Workspace contract。
4. 最后收敛 manifest、Release gates 和完整非 Smoke pipeline。
5. 自动化完成不等于 Release GO；Manual todo 必须保持 pending 直到操作员签署。

## 跳过 / 何时再加

- Messaging allowlist、Telegram/Discord/Slack Gateway warning 不在本版；有对应产品需求时另立 PRD。
- Chromium 离线企业镜像、浏览器缓存代理或预装策略不在本版；只有 on-demand 策略被正式否决时再设计。
- 完整 CPython、PyInstaller、NativeAOT、系统 Node fallback 禁用策略等替代架构不在本版；仅在 pinned embed/overlay 无法满足 Gate 时重新评审。
