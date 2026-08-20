# PRD-OPSI-v2.1.1 — Hermes Windows Runtime Integrity & Browser Setup Closure

**项目**：SMC Copilot  
**版本**：v2.1.1  
**基线分支**：`opsi/prd-2.0`  
**前置版本**：PRD-OPSI-v2.1  
**目标平台**：Windows 10 / Windows 11 x64  
**目标 Hermes**：内部 Hermes Agent v0.20.x  
**版本定位**：Windows Runtime / Local Browser / Gateway Production Closure

---

## 1. 版本目标

v2.1.1 在 v2.1 Managed Hermes 安装模型上关闭两个 P0 Runtime 缺口：

1. Embedded Python 3.12.8 当前链接 SQLite 3.45.3，Hermes Gateway 检测到 WAL-reset corruption 风险并降级到 `journal_mode=DELETE`。
2. `hermes setup → Local Browser` 仍按 Hermes 源码 checkout 推导 Node Workspace，导致在 `C:\ProgramData\SMC\Hermes\hermes-agent` 执行 `npm install`，与 Program/Data 分离及普通用户只读 ProgramRoot 的模型冲突。

目标运行链：

```text
MSI Install
   ↓
Self-contained Hermes Runtime
   ├── Python 3.12.8
   ├── Safe SQLite
   ├── Node >= 22.22.0
   ├── Hermes Python Runtime
   └── Hermes Browser Node Workspace
   ↓
HERMES_HOME = C:\ProgramData\SMC\Hermes
   ↓
hermes gateway run       PASS
hermes setup             PASS
Local Browser            PASS
Chromium on-demand       PASS
```

v2.1.1 不重新设计 MSI、WiX 或 Release Pipeline，只修复 Runtime 内容、Managed Path Contract 和 Local Browser 运行闭环。

## 2. 当前状态与问题分类

当前 `tools/release/hermes/windows_runtime.py` 已实现 CPython Embedded、Node Windows Runtime、Python wheels materialization、Hermes PE launcher、Endpoint scripts 和 AMD64 PE 校验；`build_runtime.py` 已把 Windows Runtime 纳入正式 Release Pipeline，并执行真实 `hermes.exe --version` Gate。

当前固定版本：

```python
PYTHON_VERSION = "3.12.8"
NODE_VERSION = "22.11.0"
```

### 2.1 P0-01 — Embedded SQLite 不满足 Production Integrity

Gateway 当前报告：

```text
linked SQLite 3.45.3 is vulnerable to the WAL-reset corruption bug
using journal_mode=DELETE
```

Hermes 的 DELETE mode fallback 可避免立即启动失败，但 Production Runtime 不得长期依赖该降级。安全基线为：

```text
3.45.x   vulnerable
3.50.7+  safe backport
3.51.3+  safe
```

### 2.2 P0-02 — Hermes Node Workspace 推导错误

Hermes v0.20.x 当前以 `Path(__file__).parent.parent.resolve()` 作为 `PROJECT_ROOT`，符合源码 checkout，却不符合 MSI 中 Python Package Root 与 Node Workspace Root 分离的布局。由此导致 Local Browser 把 DataRoot 或 Profile 目录误当 npm cwd。

## 3. Managed Runtime Path Contract

v2.1.1 冻结四个路径角色：

```text
SMC_HERMES_PROGRAM_ROOT = D:\Programs\SMC\Hermes
HERMES_HOME             = C:\ProgramData\SMC\Hermes
HERMES_AGENT_ROOT       = D:\Programs\SMC\Hermes\node\hermes-agent
HERMES_NODE_ROOT        = D:\Programs\SMC\Hermes\node
```

职责边界：

- Program Root：Executable、Python、Node、Scripts、Runtime。
- Hermes Data Root：config、`.env`、auth、profiles、sessions、skills、workspace、memory、state、logs。
- Hermes Node Workspace：`package.json`、`package-lock.json`、`node_modules`、Browser Node tools。
- Hermes Node Root：SMC 私有 `node.exe`、`npm.cmd`、`npx.cmd` 解析根。

禁止下列推导：

```text
HERMES_HOME → hermes-agent
C:\ProgramData\SMC\Hermes\hermes-agent
C:\ProgramData\SMC\Hermes\profiles\<profile>\hermes-agent
```

Node Workspace 不属于 Profile、Session 或 User Data。

## 4. FR-211-01 — SQLite Runtime Overlay

保持 Python 3.12.8 / cp312 ABI，在 `windows_runtime.py` 中增加 SQLite Runtime Overlay：

```text
CPython 3.12.8 Embedded
        ↓
Extract
        ↓
Overlay safe sqlite3.dll
        ↓
Validate _sqlite3.pyd
        ↓
Validate sqlite3.sqlite_version
```

目标文件：

```text
D:\Programs\SMC\Hermes\python\
├── python.exe
├── python312.dll
├── _sqlite3.pyd
└── sqlite3.dll
```

固定发布契约：

```python
SQLITE_MIN_SAFE_VERSION = (3, 51, 3)
SQLITE_VERSION = "<pinned-version>"
SQLITE_DIST_URL = "<official-win-x64-distribution>"
SQLITE_DIST_SHA256 = "<pinned-sha256>"
```

URL、Version、SHA256 和 x64 Architecture 必须固定。禁止 `latest`、动态解析、客户端运行时下载或 Repair 联网替换。

## 5. FR-211-02 — SQLite Build Gate 与 Manifest

新增 `verify_sqlite_runtime()`，使用刚生成的 Embedded Python 执行：

```text
python.exe -c "import sqlite3; print(sqlite3.sqlite_version)"
```

Gate 必须满足：

- `import sqlite3` 成功。
- `sqlite3.sqlite_version >= 3.51.3`。
- `_sqlite3.pyd` 与 `sqlite3.dll` 存在于最终 Runtime。

任一失败必须中止 Release Build，不得生成 MSI。

`runtime/windows-runtime.json` 升级为 `smc.hermes.windows-runtime.v2`，至少记录 platform、architecture、Python、SQLite 和 Node 版本；`release-manifest.json` inventory 必须包含 `python/sqlite3.dll`、`python/_sqlite3.pyd` 及 SHA256。

## 6. FR-211-03 — Hermes Node Workspace Builder

新增：

```text
tools/release/hermes/build_node_workspace.py
```

职责：

```text
Hermes Source Freeze
        ↓
package.json + package-lock.json
        ↓
Pinned Node/npm
        ↓
npm ci --omit=dev --workspaces=false
        ↓
work/hermes-node-workspace
```

输出：

```text
work/hermes-node-workspace/
├── package.json
├── package-lock.json
└── node_modules/
    ├── agent-browser/
    ├── @streamdown/
    └── transitive dependencies
```

Node Workspace 必须来自与 Hermes Python Wheel 相同的 Git Source Freeze：

```text
Hermes Python Wheel Git SHA
= Node package.json Git SHA
= Node package-lock.json Git SHA
```

禁止从另一个 checkout 获取 manifest、使用 npm latest 或单独手工维护 `agent-browser` 版本。

## 7. FR-211-04 — Node 版本升级

当前 Node 22.11.0 不满足 Hermes 根 `package.json` 的 `Node >= 22.22.0` 要求。Runtime 必须升级到固定的 Node 22.x 且不低于 22.22.0，并同步固定：

```python
NODE_VERSION
NODE_DIST_URL
NODE_DIST_SHA256
```

禁止继续打包 Node 22.11.0。

## 8. FR-211-05 — Node Runtime Gate

Windows Runtime Build 必须真实执行：

```text
node.exe --version
npm.cmd --version
npx.cmd --version
```

并验证：

```text
Node >= 22.22.0
node/hermes-agent/package.json          EXISTS
node/hermes-agent/package-lock.json     EXISTS
node/hermes-agent/node_modules/agent-browser EXISTS
```

任一失败必须中止 Release Build。

现有 `build_node_packages.py` 保持独立 Managed Node Dependency 职责，不得改造成 Hermes Root Workspace Builder：

```text
Layer A: build_node_packages.py
         SMC managed MCP/runtime packages

Layer B: build_node_workspace.py
         Hermes native root workspace / agent-browser / browser dependencies
```

## 9. FR-211-06 — Windows Runtime Layout

最终 Release Tree：

```text
windows-runtime/
├── bin/
│   └── hermes.exe
├── python/
│   ├── python.exe
│   ├── python312.dll
│   ├── _sqlite3.pyd
│   ├── sqlite3.dll
│   └── Lib/site-packages/
├── node/
│   ├── node.exe
│   ├── npm.cmd
│   ├── npx.cmd
│   ├── node_modules/
│   │   └── SMC managed packages
│   └── hermes-agent/
│       ├── package.json
│       ├── package-lock.json
│       └── node_modules/
│           └── agent-browser/
├── scripts/
└── runtime/
```

## 10. FR-211-07 — Hermes Runtime Path Resolver

内部 Hermes Repository 新增 `hermes_cli/runtime_paths.py`，集中提供：

```python
get_agent_root()
get_managed_node_root()
```

Agent Root 解析顺序：

1. 非空 `HERMES_AGENT_ROOT`。
2. Upstream/source checkout fallback：`Path(__file__).parent.parent.resolve()`。

Node Root 解析顺序：

1. `HERMES_NODE_ROOT`。
2. `HERMES_AGENT_ROOT.parent`。
3. Upstream `HERMES_HOME/node` fallback。
4. System PATH。

该 resolver 必须同时兼容 SMC MSI Managed Mode、Hermes source mode 和 Hermes upstream installer。

## 11. FR-211-08 — Local Browser Workspace

`hermes_cli/tools_config.py` 不再直接定义源码路径 `PROJECT_ROOT`，改由 `get_agent_root()` 解析。

Local Browser 的 npm cwd 必须统一为 `HERMES_AGENT_ROOT`。失败提示必须使用实际 resolved root：

```text
npm install failed - run manually:
cd D:\Programs\SMC\Hermes\node\hermes-agent && npm install --workspaces=false
```

删除 `display_hermes_home()/hermes-agent` 及 Profile 派生提示。

## 12. FR-211-09 — Embedded Node Resolver

`find_node_executable("node"|"npm"|"npx")` 必须按以下顺序查找：

1. `HERMES_NODE_ROOT`。
2. `HERMES_AGENT_ROOT.parent`。
3. Upstream `HERMES_HOME/node`。
4. System PATH。

SMC Managed Mode 必须优先使用 `D:\Programs\SMC\Hermes\node`，不得先访问 `C:\ProgramData\SMC\Hermes\node` 或系统 Node。

## 13. FR-211-10 — `hermes setup` Local Browser 行为

```text
hermes setup
  ↓
Local Browser
  ↓
Resolve HERMES_AGENT_ROOT
  ↓
node_modules/agent-browser exists?
  ├── YES → skip npm install
  └── NO  → npm install, cwd=HERMES_AGENT_ROOT
  ↓
Chromium installed?
  └── NO → agent-browser install → Chromium download
```

Production MSI 正常路径必须已包含 `agent-browser`，客户端不应再次执行 Browser Node Dependency 的 `npm install`。

## 14. FR-211-11 — Installer Machine Environment

Installer 必须设置 Machine 环境变量，并同步当前安装/修复进程：

```text
HERMES_HOME       = C:\ProgramData\SMC\Hermes
HERMES_AGENT_ROOT = D:\Programs\SMC\Hermes\node\hermes-agent
HERMES_NODE_ROOT  = D:\Programs\SMC\Hermes\node
```

Machine PATH 仅维护：

```text
D:\Programs\SMC\Hermes\bin
D:\Programs\SMC\Hermes\scripts
```

Node Runtime 不进入全局 PATH。Uninstall 必须清除 Installer 所有的三个 Machine 变量和两个 PATH entry，同时保留 Hermes Data Root。

## 15. Gateway Scheduled Task 与生命周期

Gateway 不得依赖安装管理员的 User Environment。Task Action 必须显式具备 `HERMES_HOME`、`HERMES_AGENT_ROOT` 和 `HERMES_NODE_ROOT`；推荐收敛到 `scripts/Start-HermesGateway.ps1` 后调用 `bin/hermes.exe gateway run`。

Upgrade/Repair 优先执行 graceful gateway stop，失败时再停止 Scheduled Task/ProgramRoot 进程，避免 `_rust.pyd` 等 Runtime 文件锁阻塞原子替换。

以下 Warning 不属于 v2.1.1 Blocking Failure：

- `Previous gateway exited UNCLEANLY`：升级、重启或关机留下的生命周期提示。
- `No env user allowlists configured`：Messaging Platform 安全提示。
- `No messaging platforms enabled`：当前未启用 Telegram、Discord、Slack Messaging Gateway 时允许存在。

## 16. Chromium 策略

Chromium 不进入 MSI、Burn EXE 或 Hermes Release ZIP，继续由首次 `hermes setup → Local Browser` 按需下载：

```text
Node Runtime        bundled
npm/npx             bundled
agent-browser       bundled
Node dependencies   bundled
Chromium            on-demand
```

## 17. ACL 基线

v2.1 ACL 基线继续生效：

```text
D:\Programs\SMC\Hermes
SYSTEM          FullControl
Administrators  FullControl
Users           ReadAndExecute

C:\ProgramData\SMC\Hermes
SYSTEM          FullControl
Administrators  FullControl
Users           Modify
```

普通员工不得通过 `npm install` 修改 ProgramRoot；因此 Browser Node Dependency 必须在 Build-Time 完成。

## 18. Release Pipeline

```text
Hermes Git Source Freeze
  ├── Python Wheel
  ├── Windows Wheelhouse
  ├── Root package.json
  └── Root package-lock.json
        ↓
Pinned Runtime Resolve
  ├── Python 3.12.8
  ├── Safe SQLite
  └── Node >= 22.22.0
        ↓
Hermes Node Workspace Build
        ↓
Windows Runtime Assembly
        ↓
Runtime Functional Gate
        ↓
release-manifest.json
        ↓
MSI / Burn EXE
```

`scripts/build-client-release.ps1` 仍是唯一人工发版入口。Build Pipeline 可以联网解析固定发行物，Endpoint 安装、Repair 和首次 Gateway 启动不得联网补 Python、SQLite、Node、npm 或 Node Workspace。

## 19. 仓库改造范围

### 19.1 SMC Repository

- 修改 `tools/release/hermes/windows_runtime.py`：SQLite overlay/Gate、Node 版本/Gate、Workspace assembly、manifest。
- 新增 `tools/release/hermes/build_node_workspace.py`：从 Hermes source freeze 构建原生 Node Workspace。
- 修改 `tools/release/hermes/build_runtime.py`：串联 source freeze、workspace 和 Windows Runtime。
- 修改 `infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1`：补齐 v2.1 ACL、`HERMES_AGENT_ROOT`、`HERMES_NODE_ROOT`。
- 修改 `infra/windows/hermes-agent/installer/InstallerCore.psm1`：Gateway 环境、graceful stop、Upgrade/Repair/Uninstall。

### 19.2 Internal Hermes Repository

- 新增 `hermes_cli/runtime_paths.py`。
- 修改 `hermes_cli/tools_config.py` 与 `hermes_constants.py`：Managed Agent Root、Managed Node Root、Local Browser cwd、npm/npx resolver 和错误提示。

两仓必须以同一 Hermes Source Freeze Git SHA 构建，但分别提交和验证；SMC Release 不得从未声明或不同 revision 的 Hermes checkout 拼装产物。

### 19.3 隔离边界

本版本不修改 `infra/salt`、`services/salt-control`、`contracts/salt-control-api`、`services/runtime`、`contracts/runtime-api` 或 `apps/work`。不改变 Gateway Protocol、OPSI Control Plane API 或 Work Direct Gateway 数据面。

## 20. Runtime Test Matrix

| ID | 验证 | 要求 |
| --- | --- | --- |
| RT-01 | `hermes --version` | PASS |
| RT-02 | Python | 3.12.8 |
| RT-03 | `import sqlite3` | PASS |
| RT-04 | SQLite | >= 3.51.3 |
| RT-05 | Node | >= 22.22.0 |
| RT-06 | `npm.cmd --version` | PASS |
| RT-07 | `npx.cmd --version` | PASS |
| RT-08 | `agent-browser` | bundled |
| RT-09 | `HERMES_AGENT_ROOT` | ProgramRoot workspace |
| RT-10 | `HERMES_NODE_ROOT` | private Node root |
| RT-11 | Gateway | starts |
| RT-12 | WAL warning | absent |
| RT-13 | Local Browser npm path | ProgramRoot only |
| RT-14 | Chromium | on-demand |

## 21. Acceptance Criteria

- **AC-21101**：Gateway 不再出现 `linked SQLite 3.45.3 is vulnerable`。
- **AC-21102**：`sqlite3.sqlite_version >= 3.51.3`。
- **AC-21103**：Node `>= 22.22.0`。
- **AC-21104**：`HERMES_AGENT_ROOT = D:\Programs\SMC\Hermes\node\hermes-agent`。
- **AC-21105**：`HERMES_NODE_ROOT = D:\Programs\SMC\Hermes\node`。
- **AC-21106**：Local Browser 不解析 `C:\ProgramData\SMC\Hermes\hermes-agent`。
- **AC-21107**：Local Browser 不把 `profiles\<profile>\hermes-agent` 作为 npm cwd。
- **AC-21108**：MSI 包含 `node\hermes-agent\package.json`、`package-lock.json`、`node_modules\agent-browser`。
- **AC-21109**：标准员工账号执行 `hermes setup`，Local Browser PASS。
- **AC-21110**：普通客户端不在线执行 Browser Node Dependency 的 `npm install`。
- **AC-21111**：Chromium 不进入 MSI。
- **AC-21112**：首次 Local Browser setup 允许按需下载 Chromium。
- **AC-21113**：Gateway 仅使用 `C:\ProgramData\SMC\Hermes` 作为 Machine Hermes Home。

## 22. No-Go 条件

以下任一存在，不允许发布：

- SQLite `< 3.51.3` 或 Gateway 继续出现 WAL-reset vulnerability warning。
- Node `< 22.22.0`。
- Browser setup 使用 `HERMES_HOME/hermes-agent` 或 `profiles/<profile>/hermes-agent`。
- 普通员工必须写 ProgramRoot 才能完成 setup。
- 客户端首次使用必须 `npm install` 才能获得 `agent-browser`。
- Hermes 忽略 Embedded Node 而使用系统 Node。
- Node manifests 与 Python Hermes 来自不同 Git revision。
- Chromium 被加入 MSI。
- Runtime Build 未真实执行 SQLite、Node、npm、npx、Hermes Gate。
- 自动化 fixture/smoke 被当作 Windows Live Evidence 或 Release GO。

## 23. Definition of Done

最终 ProgramRoot：

```text
D:\Programs\SMC\Hermes
├── bin\hermes.exe
├── python\
│   ├── python.exe       3.12.8
│   └── sqlite3.dll      SAFE
├── node\
│   ├── node.exe         >= 22.22.0
│   ├── npm.cmd
│   ├── npx.cmd
│   └── hermes-agent\
│       ├── package.json
│       ├── package-lock.json
│       └── node_modules\agent-browser\
└── scripts\
```

标准 Windows 用户无需人工补 Python、SQLite、Node、npm 或 Node Workspace，即可直接启动 Gateway 并完成 Local Browser Setup；Gateway 使用安全 SQLite，Browser 使用 bundled `agent-browser`，Chromium 保持首次使用按需下载。自动化 Gate 全部通过，且 Windows 10/11 人工矩阵由 Release Owner 签署后，v2.1.1 才可判定完成。
