---
name: OPSI v2.0.2 Real Windows Runtime Release
overview: 把现有 stub Release v2 替换为包含真实 CPython、Hermes wheel/dependencies、Node runtime/modules、Windows PE launcher 与 Endpoint scripts 的可执行 Windows Runtime，并由 release_v2 只负责 inventory、ZIP、manifest 和签名；本切片不重做 WiX Installer 或切换最终 all stage。
todos:
  - id: resolve-release-version
    content: 建立唯一 Hermes releaseVersion 解析入口并删除当前 installer orchestration 的硬编码 fallback
    status: completed
  - id: build-real-windows-runtime
    content: 复用现有 wheel、wheelhouse 和 Node cache 构建真实离线 Windows Runtime tree 与 Hermes PE launcher
    status: completed
  - id: package-real-release-v2
    content: 删除 Release v2 stub 生成逻辑，打包真实 Runtime、Endpoint scripts、完整 inventory、manifest 与签名
    status: completed
  - id: manual-windows-runtime-proof
    content: 人工执行 Windows 10/11 真实 Runtime 的 Hermes CLI、Python、Node 与离线启动验证；Cursor 不得自动完成
    status: pending
isProject: false
---

# Cursor Implementation Plan — OPSI v2.0.2 Real Windows Runtime Release

## 结果与边界

要实现：
- 一个 resolved `<hermesVersion>-smc.<revision>` 贯穿 runtime、Release v2、manifest 与后续 Installer input，不再使用 `0.22.0-smc.1` fallback。
- Runtime tree 包含真实 `bin/hermes.exe`、CPython 3.12 embedded x64、materialized Hermes/site-packages、Node.js 22 x64/modules 和运行所需 Endpoint scripts。
- `release_v2.py` 不再创建 fake executable，只对完整 Runtime tree 做安全扫描、inventory、ZIP、`smc.hermes.release.v2` manifest 与 Ed25519 signature。
- Build-time 可以下载/缓存并验证 Python/Node 发行物；Endpoint 不执行 pip/npm/uv，不依赖系统 Python、Node、.NET、Git 或网络。

明确不做：
- 不重构现有 Product.wxs/Bundle.wxs/build.ps1，不改 Managed Root、Gateway lifecycle、Artifact/Operations 或 OPSI contracts。
- 不在本切片修改 PowerShell wrapper、`client-release.yaml`、`all` 语义、Work/legacy OPSI pipeline 或 Production signing。

## 上下文路由

立即读取：
- [`AGENTS.md`](AGENTS.md)：OPSI、release 与 provider isolation 路由。
- [`docs/opsi/PRD-OPSI-v2.0.2.md`](docs/opsi/PRD-OPSI-v2.0.2.md)：`4–15、`21、`26–31。
- [`tools/release/hermes/release_v2.py`](tools/release/hermes/release_v2.py)：`assemble_self_contained_tree` 与 `build_hermes_release_v2` stub 根因。
- [`tools/release/hermes/build_runtime.py`](tools/release/hermes/build_runtime.py)：`build_managed_bundle` 和现有 wheel/cache 产物。

按触发读取：
- 版本解析时读取 Hermes repo `pyproject.toml` 的 project version 与 `build_client_release.py::build_hermes_installer_release` 直接调用方。
- Python/Node materialization 时只读取现有 `build_wheelhouse.py`、`build_node_packages.py` 的公开产物 contract。
- 只有 API/event 变化时读取 `docs/architecture/contract-flow.md`；本切片预期不触发。

禁止预加载：
- 历史 PRD/evidence、无关 ADR/子项目、Installer build output、legacy Product 全树、references、运行时数据和归档内容。

## 最小方案判定

- 复用：`build_managed_bundle` 的 Hermes wheel、Windows wheelhouse、Node package cache、runtime metadata，以及现有 Release v2 inventory/signature helper。
- 根因锚点：`tools/release/hermes/release_v2.py::assemble_self_contained_tree`；检查 `build_hermes_release_v2` 与 client release orchestration 的直接调用方。
- 最小方案：新增一个 Windows Runtime assembler 消费现有 build artifacts；Release v2 改为只消费该 tree，不平行重写 wheel/cache builder。
- 跳过：PyInstaller/NativeAOT、大型 native Hermes binary、在线 installer、系统 Python/Node、第二套 manifest 或新构建框架。
- 下列候选触碰均为探索上限，不是必须修改清单。

## Todo — Unified Release Version

### 结果
- 从 Hermes `pyproject.toml` version 与配置 `smcRevision` 解析唯一 releaseVersion；非法/空版本 fail closed。
- runtime metadata、Release v2 和 client orchestration 只接收解析结果，删除所有独立 hardcode/fallback。

### 实施锚点
- 主锚点：[`tools/release/client/build_client_release.py`](tools/release/client/build_client_release.py) 的 `build_hermes_installer_release`。
- 候选触碰：`tools/release/hermes/release_version.py`、[`tools/release/tests/test_client_release.py`](tools/release/tests/test_client_release.py)；新 helper 是多个现有消费者共享同一版本规则所必需。

### 变更预算
- 新增生产文件最多 1；新增依赖/公共 API/抽象层 0；候选修改文件最多 3；新增测试文件 0。
- 最小验证：`python -m pytest tools/release/tests/test_client_release.py -k "hermes_installer or stage_all" -q`
- 停止条件：[ ] 无 releaseVersion hardcode；同一输入在 runtime/release/client 三处结果一致；条件成立后不切换 wrapper/config。

## Todo — Real Windows Runtime Builder

### 结果
- 新 assembler 验证并展开 CPython embedded x64、materialize Hermes/wheelhouse 到 site-packages、展开 Node x64 并从 cache 生成 node_modules。
- 生成真正的 Windows console-script `bin/hermes.exe`，其目标是私有 `python.exe + hermes_cli.main:main`；禁止 batch 内容伪装 `.exe`。
- 复制 allowlisted Endpoint scripts，输出确定性 tree 与 runtime metadata；缺失 wheel、错误架构、hash mismatch 或 online install attempt 失败。

### 实施锚点
- 主锚点：`tools/release/hermes/windows_runtime.py::build_windows_runtime`。
- 候选触碰：[`tools/release/hermes/build_runtime.py`](tools/release/hermes/build_runtime.py)、[`tools/release/tests/test_hermes_builder.py`](tools/release/tests/test_hermes_builder.py)。

### 变更预算
- 新增生产文件最多 1；新增 repository dependency/公共抽象层 0；候选修改文件最多 3；新增测试文件 0。
- Build cache/download 可复用标准库与现有 digest policy；禁止把 Build Server 工具写入 Endpoint runtime。
- 最小验证：`python -m pytest tools/release/tests/test_hermes_builder.py -q`
- 停止条件：[ ] tree 中 Python/Node/launcher 为真实 AMD64 PE；Hermes/site-packages/modules/scripts 齐全；无 pip/npm/uv 客户端动作。

## Todo — Package Real Release v2

### 结果
- 删除 `_write_stub_exe` 和 `_write_embedded_runtime`；`build_hermes_release_v2` 只接收已完成 Runtime tree。
- Manifest inventory 覆盖 launcher、Python、Node 与 scripts，记录 runtime versions；ZIP digest、files SHA256 与 Ed25519 验证继续 fail closed。

### 实施锚点
- 主锚点：[`tools/release/hermes/release_v2.py`](tools/release/hermes/release_v2.py) 的 `build_hermes_release_v2`。
- 候选触碰：[`tools/release/tests/test_hermes_builder.py`](tools/release/tests/test_hermes_builder.py)。

### 变更预算
- 新增生产文件/依赖/公共抽象层/测试文件：0；候选修改文件最多 2。
- 最小验证：`python -m pytest tools/release/tests/test_hermes_builder.py -k "release_v2 or runtime" -q`
- 停止条件：[ ] release tree 无 stub；manifest/version/runtime inventory 与 ZIP 内容一致；tamper/wrong architecture/missing script 均拒绝。

## Manual Windows Runtime Proof

### 人工 Runbook
1. 在 Windows 10/11 x64 解压非 Smoke Release v2，验证 `bin/hermes.exe`、`python/python.exe`、`node/node.exe` 均为 AMD64 PE。
2. 禁网运行 `bin/hermes.exe --version`、私有 Python import Hermes 及 `node.exe --version`，核对版本与 manifest 完全一致。
3. 记录 source revision、release digest、命令 exit code、无系统 Python/Node/.NET 依赖证据并由 Release Owner 签署。

### Cursor 约束
- 不使用 Production signing key，不自动完成 manual todo，不把 fixture/stub/Dry Run 写成 Live Evidence；不改 `not_proven/proven/GO` 或历史 evidence，不执行未授权发布。

### 停止条件
- [ ] Win10/Win11 真实 Runtime 证据齐备并由 Release Owner 签署。

## 跳过 / 何时再加

- Runtime Release 通过后，另建计划切换 wrapper/config/`all`、收敛 `release/` 输出并强化 InstallerCore Gateway readiness。
