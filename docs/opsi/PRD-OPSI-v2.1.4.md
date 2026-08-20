# PRD-OPSI-v2.1.4 — Hermes Runtime Capability Closure & Managed Config Baseline

**项目**：SMC Copilot  
**文档类型**：工程解决方案 PRD  
**版本**：v2.1.4  
**目标分支**：`opsi/prd-2.0`  
**适用范围**：Hermes Windows Runtime 构建、Release Profile、Installer、OPSI Endpoint Deployment  
**目标平台**：Windows 10 / Windows 11 x64  
**状态**：Implementation Ready  
**日期**：2026-08-20

---

## 1. 版本目标

v2.1.4 将 Hermes Windows Release 从“CLI 可以启动”升级为“Profile 声明并由 Managed Baseline 启用的企业能力全部能够离线运行”。

当前 Windows Runtime 使用 CPython Embedded Distribution，并在 Build Host 直接把已锁定 Wheel 展开到：

```text
D:\Programs\SMC\Hermes\python\Lib\site-packages
```

Endpoint 不安装 `pip`。因此客户端执行 `python.exe -m pip install` 返回 `No module named pip` 属于预期架构，不是 Runtime 故障。

当前真正缺口是：

```text
Release Profile 声明的能力
        ≠
Managed config.yaml 启用的能力
        ≠
Windows Runtime 实际携带的依赖
```

典型故障：API Server 被配置启用，但 `aiohttp` 未进入 Runtime，Gateway 无法监听 `127.0.0.1:8642`，最终 Work 显示 `gateway_unreachable`。

目标链路：

```text
Runtime Capability Profile
        +
Managed Config Baseline
        ↓
Dependency Resolution / Closure
        ↓
Wheelhouse + Node Packages + Binaries
        ↓
Windows Runtime Assembly
        ↓
Capability / Import / Gateway Functional Gates
        ↓
Signed Release → Installer → OPSI Endpoint
```

## 2. 当前状态

当前 `release/hermes-runtime-profiles.yaml` 仍为：

```yaml
schema: smc.hermes.runtime-profile.v1
profiles:
  smc-managed:
    version: 1
    python:
      extras: [mcp, web, google]
      lazyInstall:
        allowed: false
```

当前缺口：

- API Server 的 `messaging`/`aiohttp` 没有进入标准 Profile。
- `build_runtime.py` 生成的 `managed.defaults.yaml` 仍是空 `keys: {}`。
- Wheelhouse required package Gate 尚未由 Profile 驱动。
- Runtime functional gate 主要验证 `hermes --version`，没有 capability import matrix。
- Release build 没有真实启动 Gateway 并验证 `/health` 与 Bearer `/v1/models`。
- Installer 仍可能把 Task 存在等同于 Gateway Ready。

## 3. 核心工程原则

### 3.1 Endpoint 禁止动态安装依赖

正式 Runtime：

```text
pip = NOT REQUIRED
Runtime dependency resolution = Build Time only
```

禁止生产链：

```text
ModuleNotFoundError → pip/npm/npx/uv/winget/choco online install
```

所有 Python、Node、MCP 和 Binary dependency 必须在 Build Host 解析、锁定、下载、校验、打包和验证。

### 3.2 Release Profile 是 Capability SOT

`release/hermes-runtime-profiles.yaml` 负责声明：

- Runtime 支持哪些能力。
- 能力需要哪些 Python extras/packages、Node packages 和 native binaries。
- 标准企业配置的 defaults/enforced baseline。
- 哪些能力禁止 lazy/auto install。

Profile 不负责业务模型、Provider endpoint、用户 secret、Agent persona、具体 memory bank、业务 MCP endpoint。

### 3.3 Config Enabled 必须等于 Runtime Available

任何 Managed Baseline 启用的能力都必须有可执行的 Build Gate。任何 capability/config/dependency mismatch 都必须使 Release Build 失败，不得只记录 warning 或推迟到 Endpoint。

## 4. 配置四层模型

| 层级 | 内容 | SOT |
| --- | --- | --- |
| Runtime Capability | aiohttp、MCP、STT、TTS、Hindsight、binary dependency | `hermes-runtime-profiles.yaml` |
| Managed Baseline | terminal/workspace、安全、toolset、Gateway policy | Profile `managedConfig` → `managed.defaults.yaml` |
| Instance Config | model、provider、delegation、auxiliary、业务 MCP/环境 endpoint | `HERMES_HOME\config.yaml` / 管理配置 |
| Secret | API_SERVER_KEY、模型 Key、Credential | `.env` / Secret Provider |

禁止把四层重新混成一个随 Runtime 发布的完整静态 `config.yaml`。

## 5. FR-214-01 — Runtime Profile Schema v2

Profile 升级为：

```yaml
schema: smc.hermes.runtime-profile.v2

profiles:
  smc-managed:
    version: 2

    capabilities:
      apiServer: true
      mcp: true
      filesystemMcp: true
      web: true
      localStt: true
      edgeTts: true
      hindsight: true
      tirith: false
      lspAutoInstall: false

    python:
      extras:
        - messaging
        - mcp
        - web
        - google
        - voice
        - edge-tts
        - hindsight
      requiredPackages:
        - aiohttp
        - mcp
      lazyInstall:
        allowed: false

    node:
      required: true
      packages:
        - name: "@modelcontextprotocol/server-filesystem"
          version: "2025.8.21"

    gateway:
      enabled: true
      bind: "127.0.0.1"
      port: 8642
      authRequired: true

    managedConfig:
      defaults: {}
      enforced: {}
```

Schema parser 必须拒绝 unknown schema、非布尔 capability、缺少精确版本的 Node package、`latest/main/master` 和互相矛盾的 capability/config。

## 6. FR-214-02 — Capability Dependency Matrix

构建器必须维护并验证固定矩阵：

| Capability | Trigger | Required Runtime |
| --- | --- | --- |
| API Server | `apiServer=true` | `messaging` extra、`aiohttp` |
| MCP | `mcp=true` | `mcp` extra/package |
| Filesystem MCP | `filesystemMcp=true` | private Node/npm/npx、filesystem server package |
| Web | `web=true` | `web` extra、配置 backend 可加载 |
| Local STT | `localStt=true` | `voice` extra |
| Edge TTS | `edgeTts=true` | `edge-tts` extra/package |
| Hindsight | `hindsight=true` | hindsight client dependency |
| Tirith | `tirith=true` | pinned Tirith executable |
| LSP auto install | enabled | 每个声明的 language server 已打包 |

Profile 加载阶段应先验证 capability → declaration；Runtime assembly 后再验证 declaration → actual artifact/import。任一方向 mismatch 均 Build FAIL。

## 7. FR-214-03 — API Server Capability

Work 本地主链依赖：

```text
apps/work → http://127.0.0.1:8642 → Hermes API Server
```

因此标准 Profile 的 `apiServer=true` 必须自动要求 `messaging` extra 与 `aiohttp`。Wheelhouse 或最终 Runtime 缺失时输出明确错误并停止：

```text
Release FAILED: capability apiServer requires Python package aiohttp
```

API Server 必须绑定 `127.0.0.1:8642`，不得默认暴露 `0.0.0.0`。

## 8. FR-214-04 — MCP 与 Filesystem MCP

标准 Runtime 必须携带：

```text
Python mcp
Private Node.js
npm.cmd / npx.cmd
@modelcontextprotocol/server-filesystem@2025.8.21
```

Windows Managed Baseline 的 Workspace MCP 必须编译为：

```yaml
mcp_servers:
  workspace:
    command: <managed-node-command>
    args:
      - "@modelcontextprotocol/server-filesystem"
      - "C:\\ProgramData\\SMC\\Hermes\\workspace"
    enabled: true
```

生产配置不得依赖 `npx -y` 或 npm registry。构建后的命令解析必须优先使用 Runtime 私有 Node package，并在断网环境可执行。

Linux 路径 `/data/hermes/workspace` 不得进入 Windows artifact。

## 9. FR-214-05 — Web Capability

Managed Baseline 启用 `web` toolset/backend 时，Profile 必须声明 `web=true` 和 `web` extra。

若 `baidu` 是 SMC 自定义 Hermes Plugin，则 Plugin 必须进入 Release inventory，并增加实际 backend load Gate：

```text
web=true
+ configured backend=baidu
+ baidu backend loadable
```

缺少 custom backend 不得以 generic `web` extra 已存在为由放行。

## 10. FR-214-06 — Local STT

配置：

```yaml
stt:
  enabled: true
  provider: local
```

必须映射：

```text
capabilities.localStt=true → python extra voice
```

若标准 Runtime 不打包 voice，则 Managed Baseline 必须关闭 local STT。禁止配置启用但 Runtime 缺 dependency。

## 11. FR-214-07 — Edge TTS

若标准 Endpoint 支持用户主动调用 Edge TTS：

```text
capabilities.edgeTts=true → edge-tts dependency bundled/importable
```

若不纳入标准能力，则 Managed Baseline 不得默认指定 `tts.provider=edge`。`voice.auto_tts=false` 不足以消除主动调用的 dependency contract。

## 12. FR-214-08 — Hindsight Memory

Runtime Profile 可声明：

```yaml
capabilities:
  hindsight: true
managedConfig:
  defaults:
    memory:
      memory_enabled: true
      provider: hindsight
      mode: local_external
```

Profile 负责 Hindsight client dependency，但以下环境/业务值不得固化：

```text
memory.api_url
memory.bank_id
```

它们属于 Instance Config，由 OPSI/SMC Configuration Desired State 下发。

## 13. FR-214-09 — Dynamic Install Policy

企业 Windows Runtime 统一：

```yaml
python:
  lazyInstall:
    allowed: false
managedConfig:
  enforced:
    security:
      allow_lazy_installs: false
```

Profile declaration 与 Managed Baseline 必须一致；任何一侧允许 lazy install 都应使标准 Profile validation 失败。

## 14. FR-214-10 — LSP Auto Install

标准 Baseline：

```yaml
lsp:
  enabled: false
  install_strategy: manual
```

只有明确列出 language servers、打入 Runtime inventory 并通过 Gate 后才可启用。禁止 Endpoint 自动下载 LSP。

## 15. FR-214-11 — Bitwarden、Tirith 与可选 Binary

Bitwarden 标准 Baseline：

```yaml
secrets:
  bitwarden:
    enabled: false
    auto_install: false
```

Tirith 硬规则：

```text
tirith_enabled=true → pinned executable exists + digest/architecture Gate
```

当前未打包 Tirith 时，Profile `tirith=false` 且 Baseline `security.tirith_enabled=false`。禁止 Config Enabled / Binary Missing。

## 16. FR-214-12 — 平台无效 MCP 配置

以下 Linux/instance-specific 配置不得进入 Windows Managed Baseline：

- `/usr/local/bin/gbrain` 与默认启用的 GBrain MCP。
- `/data/hermes/obsidian-vault` 或其他 Linux vault path。
- 未进入 Runtime inventory 的业务 MCP command/path。

若未来提供 Windows binary/package，必须先注册 Runtime Capability、固定版本/digest 并通过 Build Gate。

## 17. FR-214-13 — Managed Config Baseline

标准 Windows baseline 至少包含：

```yaml
terminal:
  backend: local
  cwd: "C:\\ProgramData\\SMC\\Hermes\\workspace"
  timeout: 180
  persistent_shell: true

code_execution:
  mode: project

web:
  backend: baidu
  search_backend: baidu
  extract_backend: baidu

security:
  allow_private_urls: false
  redact_secrets: true
  allow_lazy_installs: false

gateway:
  strict: false

logging:
  level: INFO
  max_size_mb: 5
  backup_count: 3

sessions:
  auto_prune: false
  retention_days: 90

timezone: Asia/Shanghai
```

若 Baidu backend 尚未进入 Runtime inventory/load Gate，则 `web` baseline 必须改用已验证 backend 或禁用，不能留下不可运行配置。

## 18. FR-214-14 — Platform Toolset Baseline

Work 通过 Gateway 消费 Hermes，标准 Baseline 至少保证：

```yaml
platform_toolsets:
  api:
    - web
    - file
    - skills
    - session_search
    - todo
    - clarify
    - terminal
  gateway:
    - web
    - file
    - skills
    - session_search
    - todo
    - clarify
    - terminal

toolsets:
  - web
  - file
  - skills
  - session_search
  - todo
  - clarify
  - terminal
```

每个启用 toolset 都必须由 capability matrix 证明其 Runtime dependency 可用。

## 19. FR-214-15 — Instance Config 与 Secret 边界

以下不得进入 Runtime Capability Profile/Managed Defaults：

- model、providers、custom/fallback providers、credential pools。
- auxiliary/delegation model routing。
- Provider base URL、key env、model catalog URL。
- memory API URL/bank ID、业务 MCP endpoint、企业内部服务器地址。
- Agent persona、用户偏好或业务数据。

Release Profile 只允许声明 `gateway.authRequired=true`，禁止写入 API_SERVER_KEY、模型 Key 或共享 Secret。

## 20. FR-214-16 — Endpoint Gateway Secret

Installer 必须为每台 Endpoint 生成独立、加密安全的随机 Gateway Key，并写入受 ACL 保护的 Secret 层：

```ini
API_SERVER_ENABLED=true
API_SERVER_HOST=127.0.0.1
API_SERVER_PORT=8642
API_SERVER_KEY=<random-32-byte-or-stronger-secret>
```

禁止固定 Key、仓库 Key、所有终端共享 Key或日志输出 Secret。Upgrade/Repair 默认保留现有有效 Key；Fresh Install 缺失时生成。

## 21. FR-214-17 — managed.defaults.yaml 编译

当前空 artifact：

```yaml
schema: smc.opsi.managed-config.v1
keys: {}
```

必须改为：

```text
runtime profile v2 managedConfig
        ↓
validate platform/capability consistency
        ↓
compile deterministic managed.defaults.yaml
```

输出必须区分：

```yaml
schema: smc.opsi.managed-config.v2
profile: smc-managed
profileVersion: 2
defaults: {}
enforced: {}
```

生成结果必须确定性、可 read-back，并记录 source profile digest/version。

## 22. FR-214-18 — Managed Config Merge

Installer 初始化/升级：

```text
Existing Instance Config
        +
Managed Defaults（existing value wins）
        +
Managed Enforced Keys（enterprise value wins）
        ↓
Resolved config.yaml
```

示例：logging level、session retention 为 defaults；terminal.cwd、lazy install policy、Gateway bind/port/auth policy 为 enforced。

Merge 必须结构化、原子、可回滚并通过 `hermes config check`。不得覆盖 models/providers/secrets/未知字段，也不得将 secret material 写回 baseline artifact。

## 23. FR-214-19 — Wheelhouse Required Package Gate

`tools/release/hermes/build_wheelhouse.py` 的 required wheel verification 必须正式由 Profile 驱动：

```python
required = profile["python"]["requiredPackages"]
verify_required_wheels(inventory_wheels(wheelhouse), required)
```

Gate 必须处理 distribution name normalization（如 `_`/`-`/case）、版本/平台兼容性和 duplicate ambiguity。缺 required package、错误 Windows/CPython ABI 或 source-only artifact 必须失败。

## 24. FR-214-20 — Windows Runtime Import Gate

Runtime assembly 后，根据 capabilities 动态生成并使用最终 Embedded Python 执行 import probes：

```text
apiServer=true  → import aiohttp
mcp=true        → import mcp
localStt=true   → import selected voice modules
edgeTts=true    → import edge_tts
hindsight=true  → import actual hindsight client module
web=true        → import/load configured backend
```

Import module name必须由受控 capability matrix 声明，不能直接把不可信 Profile 文本拼接为 Python code。任何 import 失败均停止 Release Build。

## 25. FR-214-21 — Node/MCP/Binary Gates

Build 必须真实验证：

- 私有 Node、npm、npx 可执行并满足固定版本。
- Filesystem MCP package 与 bin entry 存在，可在离线环境解析。
- 禁止 `npx -y` 或 registry fallback。
- 每个 enabled binary capability 的 PE architecture、digest、version 符合 profile。
- disabled capability 的 baseline 不得引用对应 command/provider。

## 26. FR-214-22 — Gateway Functional Release Gate

构建后的最终 Runtime 必须执行真实 Gateway smoke：

```text
temporary managed HERMES_HOME
  ↓
compile managed baseline + generate test-only random key
  ↓
start final hermes.exe gateway run
  ↓
wait for process/TCP with bounded timeout
  ↓
GET /health == 200
  ↓
Bearer GET /v1/models == 200
  ↓
graceful terminate; force fallback; verify no orphan process
```

要求：

- 使用随机可用端口或隔离固定端口，避免与 Build Host 现有 Gateway 冲突。
- Secret 只存在临时目录/进程环境，不进入日志、manifest 或 artifact。
- timeout、早退、401/403、非 200、端口未监听、orphan process 都必须 Build FAIL。

## 27. FR-214-23 — Installer Readiness

Installer 成功条件升级为：

```text
CLI exists/version valid
+ Gateway Task registered and contract valid
+ Gateway Task/process started
+ TCP endpoint listening
+ GET /health == 200
+ Bearer GET /v1/models == 200
```

Task 存在不等于 Ready。Installer 必须使用 Endpoint Secret 完成 Auth probe，采用 bounded retry/backoff；失败触发现有 rollback/repair，不提交 READY/control-owner 成功状态。

## 28. FR-214-24 — Endpoint 无 pip Contract

最终 Runtime：

```text
python.exe          REQUIRED
Lib/site-packages   REQUIRED
pip                 NOT REQUIRED
```

CI 必须证明 CLI、Gateway、Doctor 和 capability paths 不调用 Endpoint pip。Build Host 可以继续使用 pip/download tooling 生成 Wheelhouse，但这些工具不成为 Endpoint dependency。

## 29. FR-214-25 — Offline Runtime Contract

当 `lazyInstall.allowed=false`：

```text
Python dependency complete
Node dependency complete
MCP package complete
Binary dependency complete
```

客户端 Fresh Install、Gateway start、Work READY 和标准 Chat 不得访问 PyPI/npm/uv/winget/choco registry。Chromium 等其他 PRD 明确为 on-demand 的独立能力不应被本版误计为标准 Gateway/Chat dependency。

## 30. FR-214-26 — Manifest 与 Provenance

`runtime-build.json`/Runtime metadata 至少增加：

```json
{
  "capabilities": {
    "apiServer": true,
    "mcp": true,
    "filesystemMcp": true,
    "web": true,
    "localStt": true,
    "edgeTts": true,
    "hindsight": true,
    "tirith": false,
    "lspAutoInstall": false
  },
  "managedConfigVersion": 2,
  "runtimeProfileVersion": 2,
  "runtimeProfile": "smc-managed",
  "runtimeProfileDigest": "<sha256>"
}
```

Release inventory 必须覆盖 managed defaults、required Python/Node/Binary artifacts；Installer、Doctor、OPSI 和 CI 均从 manifest read-back，不自行猜测 capability。

## 31. FR-214-27 — Doctor

Doctor 增加 `Hermes Runtime Capabilities`，至少报告：

```text
API Server / aiohttp
MCP / Filesystem MCP
Web backend
Local STT
Edge TTS
Hindsight
Tirith/LSP disabled policy
Workspace
Gateway Health/Auth
Offline/lazy install policy
```

每项输出 PASS/FAIL/DISABLED，并显示 profile/version/digest。Doctor 只诊断，不现场安装缺失组件或泄露 Secret。

## 32. Build Pipeline

```text
Hermes Source Freeze
        ↓
Read/Validate Runtime Profile v2
        ↓
Resolve Capability Matrix
        ↓
Resolve Python Extras / Node Packages / Binaries
        ↓
Build Wheelhouse + Required Package Gate
        ↓
Build Windows Runtime
        ↓
Python Import + Node/MCP/Binary Gates
        ↓
Compile managed.defaults.yaml
        ↓
Gateway Functional Smoke (/health + /v1/models Auth)
        ↓
Manifest + Signature
        ↓
Installer Readiness
        ↓
Client Release / OPSI Endpoint
```

`scripts/build-client-release.ps1` 继续作为人工正式发布入口；不存在第二套 bypass capability gates 的 Windows release path。

## 33. 源码改造范围

### P0

- `release/hermes-runtime-profiles.yaml`：Schema v2、capabilities、dependencies、managedConfig。
- `tools/release/hermes/build_wheelhouse.py`：Profile-driven required package Gate。
- `tools/release/hermes/build_runtime.py`：Capability resolution、managed defaults compile、import/Gateway functional gates。
- `tools/release/hermes/windows_runtime.py`：继续 self-contained assembly；不增加 Endpoint pip。
- `tools/release/hermes/verify_runtime.py`、`release_v2.py`：capability/manifest/read-back gates。
- `infra/windows/hermes-agent/installer/InstallerCore.psm1`：真实 Gateway readiness/auth probe。

### P1（进入本版本 DoD）

- `infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1`：Managed defaults/enforced merge。
- `HostOperations.ps1/.psm1`、Doctor/Repair：Capability diagnostics 与 reconcile。
- Release/Installer tests 与真实 Windows acceptance runbook。

## 34. 测试矩阵

| ID | 场景 | 结果 |
| --- | --- | --- |
| DEP-001 | 删除 aiohttp wheel | Build FAIL |
| DEP-002 | API Server enabled、无 messaging | Build FAIL |
| DEP-003 | Hindsight enabled、无 dependency | Build FAIL |
| DEP-004 | Local STT enabled、无 voice | Build FAIL |
| DEP-005 | Edge TTS enabled、无 edge-tts | Build FAIL |
| DEP-006 | Tirith enabled、无 binary | Build FAIL |
| CFG-001 | Linux workspace/MCP path | Windows compile reject/replace |
| CFG-002 | lazy install=true | Profile/compile FAIL 或 enforced=false |
| CFG-003 | LSP auto install | 标准 Runtime reject |
| CFG-004 | Instance model/provider/secret | 不进入 baseline artifact |
| MCP-001 | Filesystem MCP 断网执行 | PASS |
| GW-001 | `/health` | HTTP 200 |
| GW-002 | `/v1/models` + Bearer | HTTP 200 |
| GW-003 | Task exists but endpoint down | Installer FAIL |
| WORK-001 | Work startup | READY |
| WORK-002 | Chat | PASS |
| OFFLINE-001 | 无公网 Fresh Install/Gateway/Chat | PASS |
| SEC-001 | Secret in logs/manifest | FAIL |

## 35. Fresh Install 验收

空 Windows Client 安装后不得执行 pip/npm install 或在线 package fetch：

```text
OPSI Install
  ↓
Gateway Start
  ↓
/health 200
  ↓
/v1/models Bearer 200
  ↓
apps/work READY
  ↓
Chat PASS
```

同时验证 Runtime 使用 private Python/Node，Machine 上是否安装系统 Python/Node 不影响结果。

## 36. Upgrade 验收

从缺 `aiohttp` 的旧 Runtime 升级：

```text
Program tree replaced
HermesHome/config/workspace/secrets preserved
Managed defaults/enforced keys merged
Gateway restarted
/health + Auth PASS
Work reconnect + Chat PASS
```

Upgrade 不得通过现场安装缺失 dependency 修复，也不得覆盖 Instance Config/Secret。

## 37. Acceptance Criteria

- **AC-21401**：Runtime Profile 升级为 schema v2、capability-driven，并通过 strict validation。
- **AC-21402**：API Server capability 自动闭包 messaging/aiohttp。
- **AC-21403**：MCP/Filesystem MCP、Local STT、Edge TTS、Hindsight enabled 时依赖完整且 Gate 可执行。
- **AC-21404**：Tirith/LSP/Bitwarden 配置与实际 Runtime 能力一致，不触发自动下载。
- **AC-21405**：Windows baseline 不包含 Linux/instance-specific 路径或 endpoint。
- **AC-21406**：Managed Config 从 Profile 编译为 defaults/enforced v2 artifact，确定性且可 read-back。
- **AC-21407**：Model、Provider、Secret、业务 endpoint 不进入 Runtime Profile/baseline。
- **AC-21408**：Wheelhouse required package、final Runtime import、Node/MCP/Binary gates 全部生效。
- **AC-21409**：最终 Runtime 不依赖 Endpoint pip 或在线 package registry。
- **AC-21410**：Release Gateway smoke 的 `/health` 与 Bearer `/v1/models` 均返回 200。
- **AC-21411**：Installer 以真实 Gateway Health/Auth 判定 READY，失败不提交成功状态。
- **AC-21412**：Fresh Install 与 Upgrade 后 Work 达到 READY 并完成 Chat。
- **AC-21413**：Offline Client 标准 Gateway/Chat E2E 通过。
- **AC-21414**：Doctor 与 manifest 对 capability/profile/config 的报告一致。

## 38. No-Go 条件

以下任一存在，不允许发布：

- 给 Embedded Python 增加 pip 作为 dependency repair，或 Endpoint 自动 pip/npm/npx/uv/winget/choco install。
- Capability enabled 但 Profile declaration、Wheel/Node/Binary 或 final import/load Gate 缺失。
- API Server 缺 aiohttp、Gateway 未监听或仅凭 Scheduled Task 存在判 READY。
- Filesystem MCP 依赖 `npx -y`/npm registry，或 Windows baseline 保留 Linux path。
- `security.allow_lazy_installs=true`、LSP auto install、Bitwarden auto install 或未打包 Tirith 被启用。
- 把完整现有 config、model/provider、业务 endpoint 或 Secret 写入 Profile/Release artifact。
- 所有 Endpoint 共用固定 Gateway Key，或 Secret 出现在日志、manifest、测试输出。
- Gateway Release Gate 未真实验证 `/health` 和 Bearer `/v1/models`。
- 仅以 `hermes --version`、unit fixture 或 installer Task 存在代替 Runtime/Windows functional proof。
- Offline Fresh Install/Gateway/Work Chat 仍需公网 package registry。

## 39. Definition of Done

v2.1.4 完成必须同时满足：

1. Runtime Profile v2 成为 Capability SOT，Managed Baseline 编译为 v2 defaults/enforced artifact。
2. API Server、MCP、Filesystem MCP、Web、Local STT、Edge TTS、Hindsight 的 dependency closure 与 final gates 一致。
3. Tirith、LSP、Bitwarden 等可选能力在未打包时保持禁用且不能自动安装。
4. Runtime 不依赖 Endpoint pip；标准能力不依赖在线 Python/Node/Binary registry。
5. Instance model/provider/environment endpoint 与 Secret 不进入 Runtime artifact。
6. Wheelhouse、Python import、Node/MCP/Binary、Gateway Health/Auth gates 全部 fail closed。
7. Manifest/Doctor/Installer 对 profile、capabilities、managed config version 和实际 Runtime 得出一致结果。
8. Installer 只有在 CLI、Task、TCP、Health、Bearer Auth 全部成功后才提交 READY。
9. Fresh Install、Upgrade、断网启动后 Gateway `/health` 和 `/v1/models` PASS，Work READY，Chat E2E PASS。
10. Windows 10/11 真实 Endpoint 证据由 Release Owner、Endpoint Ops、Security Owner 签署；自动化 fixture 不替代 Live Gate。

## 40. 最终架构基线

```text
                 Release Engineering
                         │
                         ▼
        release/hermes-runtime-profiles.yaml
                         │
              ┌──────────┴──────────┐
              │                     │
       Runtime Capability     Managed Baseline
              │                     │
              ▼                     ▼
       Dependency Closure     managed.defaults.yaml
              │                     │
              └──────────┬──────────┘
                         ▼
               Windows Runtime Build
                         │
         Python / Node / MCP / Binary
                         │
                         ▼
               Functional Release Gate
                  /health + /v1/models
                         │
                         ▼
                    Signed Release
                         │
                         ▼
                       OPSI
                         │
                         ▼
                    Windows PC
          ┌──────────────┴─────────────┐
          ▼                            ▼
D:\Programs\SMC\Hermes       C:\ProgramData\SMC\Hermes
Self-contained Runtime       Managed Config / Workspace
          │
          ▼
     Hermes Gateway :8642
          │
          ▼
       apps/work
```

v2.1.4 冻结后的核心不变式：

> Hermes Runtime 中所有启用能力必须在 Release Build 阶段完成依赖闭包；Endpoint 只负责运行已经验证完成的 Runtime，不承担依赖解析和软件包安装职责。
