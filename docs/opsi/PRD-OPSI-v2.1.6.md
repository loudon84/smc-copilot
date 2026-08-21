# PRD-OPSI-v2.1.6 — Hermes MSI Config Integrity & Release Validation Hardening

**项目**：SMC Copilot  
**文档类型**：工程解决方案 PRD  
**版本**：v2.1.6  
**目标分支**：`opsi/prd-2.0`  
**适用范围**：Hermes Agent Windows Runtime、MSI Installer、Release Pipeline  
**目标平台**：Windows 10 / Windows 11 x64  
**核心修改文件**：`infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1`、`tools/release/simple_yaml.py`  
**状态**：Implementation Ready  
**日期**：2026-08-21

---

## 1. 版本目标

v2.1.6 建立 Hermes Config Integrity Contract，并把 Release Validation 从 Stub/Mock/结构验证提升为真实 Windows Runtime、真实 MSI 和完整生命周期认证。

近期实际生成的 `C:\ProgramData\SMC\Hermes\config.yaml` 包含：

```yaml
mcp_servers:
  workspace:
    args:
      - @modelcontextprotocol/server-filesystem
```

Hermes 标准 YAML Parser 报错：

```text
found character that cannot start any token
line 61, column 9
```

原始 Runtime Profile 中该值是合法 quoted scalar：

```yaml
- "@modelcontextprotocol/server-filesystem"
```

错误来自 SMC 自研 Serializer 在 Build-Time/Endpoint merge 后移除必要引号。更严重的是，自研 Writer 使用同源自研 Reader 验证，导致错误输出通过 Unit Test，直到客户端 Hermes Native Parser 才失败。

正式不变式：

> 任何进入 `C:\ProgramData\SMC\Hermes\config.yaml` 的配置，都必须同时通过独立标准 YAML Parser 与 Hermes 自身 `config check`；否则 Install、Upgrade、Repair 均不得成功。

## 2. 问题不是单点 `@` Bug

当前存在三个结构性缺口：

```text
1. Python Build-Time 与 PowerShell Endpoint 各维护一套自研 YAML Codec
2. 自研 Writer 使用自研 Reader 证明正确性
3. 最终 Release 没有把 Hermes Native Config Parser 作为强制 Gate
```

由此产生：

```text
错误 Serializer
  ↓
同源 Parser 接受
  ↓
Unit/Smoke PASS
  ↓
非法 config.yaml 写入 Endpoint
  ↓
Hermes PyYAML FAIL / fallback default config
```

本版本不能只给 `_needs_quotes()` 增加一个 `@` 分支；必须同时整改 Serializer、独立 Oracle、Endpoint merge、Installer readiness 和 Release Certification。

## 3. 已知验证缺口

### 3.1 Stub Runtime

部分 builder tests 使用伪造 `python.exe`、`node.exe`、`sqlite3.dll` PE header，并可设置 `skip_functional_gates=True`。这只能证明目录、inventory、manifest 和 PE header，不能证明 Hermes/config/Gateway 可运行。

### 3.2 Installer 跳过 Native Validation

Pester 使用 `SMC_HERMES_INSTALLER_SKIP_GATEWAY=1`，而当前 Config Check 也受该变量影响直接 return，导致 Gateway skip 意外变成 Config skip。

### 3.3 Smoke Fixture 漂移

Smoke fixture 手写简化 `managed.defaults.yaml`，没有覆盖 scoped npm package、Windows path、URL、Unicode、复杂 nested list/map 和保留 scalar，因此无法发现生产 Profile 编译错误。

### 3.4 Health 掩盖 Config Fallback

Hermes 可能在 config parse 失败后 fallback 到 default config，仍然让 `hermes --version`、Gateway `/health` 或 `/v1/models` 返回成功。Config Validity 必须独立于 Version/Gateway Gate。

## 4. Config Integrity Pipeline

```text
Runtime Profile
  ↓
Managed Config Compile
  ↓
Independent Standard YAML Parse + Semantic Equality
  ↓
Windows Managed Merge
  ↓
Independent Standard YAML Parse
  ↓
Hermes Native config check
  ↓
Gateway Health/Auth
  ↓
Installer READY
```

Config Valid、Runtime Valid、Gateway Valid 是三个独立条件，必须同时成立。

## 5. 非目标

本版本不修改：

- Hermes upstream config schema。
- Model/Provider、Work Runtime readiness、OPSI control boundary 或 Gateway API protocol。
- v2.1.4 Capability Matrix 与 v2.1.5 PATH immutability 语义。

禁止用扩大 try/catch、warning 或 fallback 掩盖配置错误。Hermes fallback 到 default config 不得视为成功。

## 6. FR-216-01 — Python Scalar Quoting Hotfix

`tools/release/simple_yaml.py::_needs_quotes()` 至少必须覆盖 YAML plain scalar 禁止首字符：

```text
- ? : , [ ] { } # & * ! | > ' " % @ `
```

并处理：

- empty string、reserved literals、numeric/bool/null-looking strings。
- leading/trailing whitespace、newline/control chars。
- comment/mapping/flow delimiters。
- Windows path、URL、`${ENV}`、quote/apostrophe 和 escaped content。

`@modelcontextprotocol/server-filesystem` 必须序列化为 quoted scalar，且独立标准 Parser 恢复后的语义值与输入完全相等。

## 7. FR-216-02 — PowerShell Scalar Quoting Hotfix

`SmcHermesManaged.psm1::ConvertTo-SmcYamlScalar()` 在迁移完成前必须同步修复。至少保证以下前缀不会裸输出：

```text
@ ` # : ! & * %
```

Python 与 PowerShell Hotfix 都必须使用同一 regression corpus；不能只修一层，因为配置经历 Build-Time serialize 和 Endpoint merge/serialize 两次转换。

## 8. FR-216-03 — Production Serializer 迁移

Managed Config 的正式生产写入从 `simple_yaml.dump_yaml()` 迁移到标准 YAML serializer：

```python
yaml.safe_dump(
    payload,
    allow_unicode=True,
    sort_keys=True,
    default_flow_style=False,
)
```

输出固定：UTF-8、LF、确定性 key order、block style。语义 indentation 由标准 serializer 管理，不再扩展自研 grammar。

`simple_yaml.py` v2.1.6 后降级为 legacy profile compatibility reader/helper，不再承担 Production YAML Serializer 或最终 validity oracle。

## 9. FR-216-04 — Standard YAML Build Dependency

Build/Release 环境必须显式固定 PyYAML 兼容版本和 lock，禁止依赖偶然安装。所有 Release 相关 YAML 和生成 artifact 必须使用 `yaml.safe_load()` 验证。

如果 Endpoint Managed Config Tool 使用 Embedded Python + PyYAML，则 PyYAML 必须作为正式 Runtime dependency 进入 Wheelhouse、inventory 和 import gate，不允许 Endpoint 在线安装。

## 10. FR-216-05 — Independent YAML Oracle

所有 Serializer certification 必须形成：

```text
SMC Serializer → PyYAML safe_load → semantic equality
```

禁止只使用：

```text
SMC Writer → SMC Reader
```

同源 parser 可以继续做内部 subset unit test，但不得成为 Release Config Validity Oracle。

## 11. FR-216-06 — Managed Defaults Semantic Gate

`managed_config.py` 对生成的 `managed.defaults.yaml` 必须验证：

- Standard parse PASS，root 是 mapping。
- schema/profile/profileVersion/profileDigest 精确匹配。
- defaults/enforced 与 compiler 输入做深层语义 equality。
- scoped npm package、Windows path、URL、Unicode 等值无损。
- dump 再 load 后没有字符串转 bool/null/number 的类型漂移。

只检查 metadata 字段不足以通过 Gate。

## 12. FR-216-07 — PowerShell YAML 子系统退场

`SmcHermesManaged.psm1` 不应长期维护完整 YAML AST：

```text
Read-SmcYamlBlock/Map/List
ConvertFrom-SmcYamlScalar/Subset
ConvertTo-SmcYamlScalar/Subset
Write-SmcYamlValue
```

v2.1.6 采用两阶段：

1. P0 Hotfix：修复 scalar quoting，确保当前链路不再生成非法 YAML。
2. Production Closure：Managed merge 移至 Embedded Python + PyYAML 工具；PowerShell 只负责事务编排、调用和错误映射。

DoD 要求 Production merge 不再依赖 PowerShell 自研 YAML AST。

## 13. FR-216-08 — Managed Config Apply Tool

Runtime 携带单一工具，例如：

```text
D:\Programs\SMC\Hermes\scripts\managed_config_apply.py
```

职责限定为：

- 读取 existing `config.yaml` 与 `managed.defaults.yaml`。
- 标准 YAML parse。
- deep merge defaults/existing/enforced。
- 保护 Instance/Secret keys。
- 强制 terminal.cwd 等 managed keys。
- 标准 safe_dump + read-back semantic validation。
- 写入同目录 candidate/backup并执行原子替换协议。
- 通过明确 exit code/structured local diagnostic 返回结果。

工具必须离线、自包含，不访问 Registry、网络或远程 Secret Provider。

## 14. FR-216-09 — Merge Semantics 不变

保持：

```text
defaults: existing value wins
enforced: enterprise value wins
```

Protected keys 至少包括：

```text
model / models
provider / providers
auxiliary
delegation
API_SERVER_KEY / api_server_key
```

Managed Baseline 不覆盖 Instance Model/Provider；Secret 最终属于 `.env`/Secret Provider。Codec 迁移不得改变 merge precedence。

## 15. FR-216-10 — Atomic Config Transaction

配置事务使用：

```text
config.yaml
config.yaml.tmp.smc
config.yaml.bak.smc
```

流程：

```text
1. Read existing config
2. Parse existing + managed defaults with standard parser
3. Build candidate in memory
4. safe_dump candidate to same-directory tmp
5. Standard parse tmp + semantic assertions
6. Stop/hold Gateway from reading half transaction when required
7. Backup existing config
8. Atomic promote tmp → config.yaml
9. Run Hermes native config check against final managed home
10. PASS → delete backup / continue Gateway
11. FAIL → restore backup atomically and report failure
```

禁止先覆盖正式 config 再做结构验证。Native check 失败必须恢复原文件；rollback 失败使用独立错误码并保留受控 evidence。

## 16. FR-216-11 — Unchanged Config 仍需 Validate

`Changed` 只决定是否写文件，不决定是否验证。

当 terminal.cwd/defaults/enforced 已正确且不需写入时，仍必须执行：

- Standard YAML parse/semantic validation。
- Hermes Native `config check`（Production/Certification）。

不得 early return 跳过 config validity。

## 17. FR-216-12 — Native Config Oracle

`Invoke-SmcHermesConfigCheck()` 成为独立 Native Config Oracle：

```powershell
$env:HERMES_HOME = $HermesHome
& $CliPath config check
```

要求 exit code 0，且输出不得出现 parse/fallback/ignored-config warning。失败映射为 `CONFIG_NATIVE_CHECK_FAILED` 或 `CONFIG_FALLBACK_DETECTED`，不得降级 warning。

`hermes --version` 只做 Version Probe，不能替代 Native Config Probe。

## 18. FR-216-13 — Test Mode 解耦

`SMC_HERMES_INSTALLER_SKIP_GATEWAY=1` 只允许跳过 Gateway、Scheduled Task 和 network probes，不能跳过 YAML structural validation。

Smoke PE Stub 无法运行 Native CLI 时，可以使用明确的 unit-only config native-skip mechanism，但必须：

- 仅在 test harness 中注入。
- 命名与 Gateway skip 分离。
- Standard YAML validation 永远执行。
- Release Certification 检测到任何 skip 变量立即失败。

禁止 production path 把 `SKIP_GATEWAY` 等同于 `SKIP_CONFIG`。

## 19. FR-216-14 — Installer Config Gate

Installer readiness 正式顺序：

```text
CLI exists/version valid
  ↓
Managed Home exists
  ↓
config.yaml exists
  ↓
Standard YAML valid + managed semantic assertions
  ↓
Hermes native config check
  ↓
Workspace/Temp contract
  ↓
Gateway Task contract
  ↓
Gateway start / TCP /health /v1/models auth
  ↓
PATH immutability
  ↓
READY commit
```

Config invalid 时，Gateway 即使 fallback 后 Health/Auth 成功，Installer 仍必须失败并 rollback；不得提交 control-owner READY/state success。

## 20. FR-216-15 — Fallback Detection

以下文字或等价 diagnostic 即使 exit code 0 也必须失败：

```text
Failed to parse
Falling back to default config
every user override ... IGNORED
```

Fallback patterns 必须集中定义、大小写/版本差异可测试，并避免把无关 warning 误判。Certification 保存脱敏原始输出作为 evidence。

## 21. FR-216-16 — YAML Regression Corpus

固定 corpus 至少覆盖：

```yaml
strings:
  scoped_npm: "@modelcontextprotocol/server-filesystem"
  at_user: "@foo"
  backtick: "`command"
  windows_path: "C:\\ProgramData\\SMC\\Hermes\\workspace"
  url: "https://example.com/api:v1"
  hash: "#value"
  colon: "a:b"
  bool_string: "true"
  null_string: "null"
  number_string: "123"
  leading_space: " value"
  trailing_space: "value "
  unicode: "智能体工作空间"
  env: "${API_SERVER_KEY}"
  quote: "a\"b"
  apostrophe: "it's"
```

每项执行 dump → independent safe_load → value/type equality，并覆盖 nested list/map、empty list/object 和 unexpected indent failure。

## 22. FR-216-17 — Real Bug Regression Discipline

本次真实故障必须固化：

```python
value = "@modelcontextprotocol/server-filesystem"
result = dump_yaml(...)
loaded = yaml.safe_load(result)
assert loaded == original
```

Regression Test 必须证明旧实现 RED、修复后 GREEN。新增测试若旧代码本来就通过，不算该真实 Bug 的有效回归证据。

## 23. FR-216-18 — Complex Managed Config Fixture

新增生产级复杂 fixture，至少包含 scoped npm package、Windows path、Baidu backend、URL with colon、hash/at-prefixed string、Unicode、env placeholder、nested map/list、empty collection。

PowerShell Pester、Python compiler tests、Installer smoke 和 Artifact certification 复用同一语义 corpus，不允许各自维护互不一致的简化样例。

## 24. FR-216-19 — Smoke Fixture 单一 SOT

`build_installer_smoke_fixture.py` 不再手写简化 `managed.defaults.yaml`。必须使用：

```text
release/hermes-runtime-profiles.yaml
  ↓
load/validate real profile
  ↓
compile_managed_defaults()
  ↓
fixture managed.defaults.yaml
```

Runtime Build、Installer Smoke、Config Fixture 和 E2E 都从真实 Profile Compiler 派生，消除 fixture drift。

## 25. FR-216-20 — Test Architecture 分层

测试层级：

| Level | 类型 | 证明范围 |
| --- | --- | --- |
| T0 | Syntax/Static | YAML/source/file syntax |
| T1 | Unit | scalar/merge/control logic |
| T2 | Contract | module boundaries/transactions |
| T3 | Artifact | actual Runtime artifacts |
| T4 | Installer | actual MSI build/install |
| T5 | Runtime E2E | Hermes/Gateway Health/Auth |
| T6 | Lifecycle | Install/Repair/Upgrade/Uninstall |

Mock/Fake tests 名称和报告必须显式标注 MOCK/UNIT，不能计为 Artifact/Installer/E2E certification。

## 26. FR-216-21 — YAML T0 Gate

所有 Release YAML、Runtime Profile、generated managed defaults、generated config fixtures 使用标准 `yaml.safe_load()`。`simple_yaml._parse_block()` 不得作为唯一 syntax certification。

新增 `tools/release/tests/test_yaml_compatibility.py` 覆盖 YAML-Q01–Q15 corpus 与语义 equality。

## 27. FR-216-22 — Runtime Artifact Certification

真实 Runtime 构建后必须使用最终文件执行：

```text
python/python.exe → import yaml, aiohttp, mcp and enabled capability modules
bin/hermes.exe config check
bin/hermes.exe --version/version warning scan
Gateway functional smoke
```

T3 Certification 不得使用 PE Stub、`skip_functional_gates=True` 或 Fake Gateway。

## 28. FR-216-23 — MSI Build 与 Certification 分离

`windows-installer-build` 仅表示 EXE/MSI 生成、header/size/signature/read-back 正确。

`windows-installer-certification` 必须对本次 build freeze 后的同一个 MSI artifact 执行 `msiexec /i`。禁止重新生成另一套 smoke MSI 代替认证对象；artifact SHA256 必须贯穿 build、install 和 evidence。

## 29. FR-216-24 — Clean Windows Certification

最低真实环境：Clean Windows 11 x64 + Windows PowerShell 5.1；目标矩阵扩展到 Windows 10/11。

每次从可证明的 clean snapshot 开始，Certification 前拒绝：

```text
SMC_HERMES_INSTALLER_SKIP_GATEWAY
SMC_HERMES_MANAGED_TEST_ROOT
config/native/functional skip flags
```

禁止使用开发机残留 Python/Node/Hermes config 掩盖 Runtime 缺口。

## 30. FR-216-25 — Fresh Install Certification

对实际 MSI：

```text
Capture Machine/User PATH
msiexec /i → exit 0
Verify ProgramRoot/HermesHome
Read final config.yaml with PyYAML
Run hermes config check
Run hermes version and scan warnings
Verify Gateway Task/TCP
GET /health 200
Bearer GET /v1/models 200
Verify PATH unchanged
```

任一失败，Artifact 不得标记 certified。

## 31. FR-216-26 — Repair Certification

Fresh Install PASS 后增加用户 Instance Config 与 Workspace marker，再执行 MSI Repair。验证：

- config 标准/native valid。
- User/Protected config 与 Workspace 保留。
- Managed enforced keys 恢复。
- Gateway READY。
- Machine/User PATH bit-for-bit unchanged。

## 32. FR-216-27 — Upgrade Certification

至少执行 previous certified RC → current RC。验证 HermesHome/config/workspace/secrets 保留、Managed enforced keys 更新、标准/native config valid、Gateway READY、PATH unchanged。

不得用 fresh install current RC 代替 upgrade proof。

## 33. FR-216-28 — Uninstall Certification

验证 ProgramRoot/Task/Installer-owned env removed，HermesHome/Workspace 按 preserve policy 保留，Machine/User PATH unchanged；Config/backup/temp transaction artifacts没有泄露到 ProgramRoot 或用户目录。

## 34. FR-216-29 — CI Jobs

`.github/workflows/opsi-package-ci.yml` 增加并区分：

- `yaml-compatibility`：PyYAML independent corpus/oracle。
- `windows-runtime-certification`：真实 Python/Hermes/Node/config/Gateway，不允许 functional skip。
- `windows-installer-build`：artifact generation only。
- `windows-installer-certification`：self-hosted clean Windows VM 对 frozen MSI 执行 install/lifecycle。

推荐 self-hosted labels：`self-hosted`, `windows`, `smc-hermes-cert`。Runner 必须有 snapshot/reset 和互斥，避免并行污染端口、Task、ProgramData。

## 35. FR-216-30 — Build Success 与 Release Certified

定义：

```text
BUILD SUCCESS = artifacts generated and structural gates passed

RELEASE CERTIFIED = exact frozen artifacts installed on clean Windows and T3–T6 gates passed
```

不能继续用一个 “Tests Passed” 同时表示两个状态。Release manifest/catalog 必须记录 certification status、artifact digest、runner image/snapshot ID、evidence locator 和时间，不允许 build success 自动变成 release GO。

## 36. FR-216-31 — Release Pipeline Gate

正式链：

```text
build-client-release.ps1
  ↓
Source/Profile validation
  ↓
Managed Config compile + YAML compatibility
  ↓
Runtime build + real functional gates
  ↓
MSI build
  ↓
Artifact freeze/digest
  ↓
Windows install/lifecycle certification
  ↓
Release verify/certified decision
```

Certification 必须消费 frozen artifact，不得在安装前再次 build。

## 37. FR-216-32 — Error Codes

标准化：

```text
CONFIG_YAML_PARSE_FAILED
CONFIG_NATIVE_CHECK_FAILED
CONFIG_MANAGED_MERGE_FAILED
CONFIG_ROLLBACK_FAILED
CONFIG_FALLBACK_DETECTED
```

错误包含 stage、config path、error code、parser source、line/column（可得时）和脱敏 detail。不得输出 config 全文、API key、provider secret、auth.json 或 `.env` values。

## 38. FR-216-33 — Installer Logging

成功至少记录：

```text
config.standard_yaml=PASS
config.hermes_native=PASS
config.fallback_detected=false
gateway.health=PASS
gateway.auth=PASS
environment.path.unchanged=true
install.readiness=PASS
```

失败日志要能区分 build artifact、standard parser、managed merge、native parser、Gateway 和 rollback stage。

## 39. 自动化回归矩阵

| ID | 场景 | 预期 |
| --- | --- | --- |
| REG-YAML-001 | `@modelcontextprotocol/server-filesystem` | quoted + semantic equality |
| REG-YAML-002 | Windows Workspace path | roundtrip PASS |
| REG-YAML-003 | unexpected nested indent | standard parser FAIL |
| REG-YAML-004 | URL with colon | semantic equality |
| REG-YAML-005 | `#` prefixed string | quoted + equality |
| REG-YAML-006 | Unicode | equality |
| REG-CFG-001 | terminal.cwd unchanged but sibling invalid | Native/standard FAIL |
| REG-CFG-002 | config invalid but Gateway fallback starts | Installer FAIL |
| REG-CFG-003 | version exit 0 with fallback warning | Certification FAIL |
| REG-INSTALL-001 | actual MSI config generation | standard/native PASS |
| REG-INSTALL-002 | actual MSI Gateway startup | Health/Auth PASS |
| REG-LIFE-001 | Repair preserves user config/workspace | PASS |
| REG-LIFE-002 | Previous RC upgrade | PASS |
| REG-LIFE-003 | Uninstall preserve/PATH policy | PASS |

## 40. Acceptance Criteria

- **AC-21601**：Scoped npm、Windows path、URL/hash/colon/Unicode/env 等 corpus 可由生产 serializer 正确 roundtrip。
- **AC-21602**：generated `managed.defaults.yaml` 通过独立标准 Parser 和深层语义 equality。
- **AC-21603**：Endpoint merged `config.yaml` 通过标准 Parser。
- **AC-21604**：`hermes config check` exit 0 且无 fallback/ignored-config warning。
- **AC-21605**：terminal.cwd/managed config 未变化时仍执行 config validation。
- **AC-21606**：SKIP_GATEWAY 不跳过 structural config validation；Certification 禁止所有 skip mode。
- **AC-21607**：Config invalid 时 Installer FAIL，即使 Gateway Health/Auth 成功。
- **AC-21608**：Smoke fixture 从真实 Runtime Profile compiler 派生。
- **AC-21609**：Mock/Stub/Smoke 与 Runtime/MSI/E2E Certification 报告明确分层。
- **AC-21610**：真实 Runtime Artifact 使用 final Embedded Python/Hermes/Node 完成 import/config/Gateway gates。
- **AC-21611**：同一个 frozen MSI 完成 Fresh Install、Repair、Upgrade、Uninstall certification。
- **AC-21612**：实际 config 通过 PyYAML 和 Hermes Native Parser，Gateway `/health`/Bearer `/v1/models` 返回 200。
- **AC-21613**：Machine/User PATH 在全生命周期 bit-for-bit unchanged。
- **AC-21614**：Build Success 与 Release Certified 状态、evidence 和 digest 明确分离。

## 41. No-Go 条件

以下任一存在，不允许发布：

- 只给 `@` 打补丁但仍以自研 YAML Codec 作为 Production writer/oracle。
- SMC Writer 只由 SMC Reader 验证，没有 PyYAML independent oracle。
- PowerShell 继续长期承担完整 YAML AST 编解码。
- Config unchanged 时 early return 跳过 Standard/Native validation。
- SKIP_GATEWAY 连带跳过 Config Validation，或 Certification 环境含任何 skip/test-root flag。
- Gateway 200、`hermes --version` exit 0 或 fallback default config 被视为 Config Valid。
- Smoke fixture 手写不同于真实 Profile 的简化 baseline。
- PE Stub/Fake Gateway/Mock tests 被标记为 Runtime/MSI Certified。
- MSI Build Success 被直接标记 Release Certified。
- Certification 安装的不是 build freeze 的同一个 digest artifact。
- Native/standard config failure只 warning不 rollback，或 rollback failure 被隐藏。
- 实际 Windows Fresh/Repair/Upgrade/Uninstall、PATH immutability、Gateway Auth 未验证。

## 42. 源码改造范围

### P0

- `tools/release/simple_yaml.py`：完整 plain scalar legality hotfix、独立 corpus。
- `infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1`：PowerShell scalar hotfix、always validate、skip 解耦、错误映射。
- `tools/release/hermes/managed_config.py`：PyYAML safe_dump/safe_load/semantic equality。
- `build_installer_smoke_fixture.py`：使用真实 Profile compiler。
- Python/Pester tests：真实 bug fixture、complex config、standard oracle。

### Production Closure

- 新增并打包 Embedded Python Managed Config Apply Tool。
- PowerShell YAML AST 退出生产 merge。
- InstallerCore 增加独立 Config Gate 与 fallback detection。
- CI 增加 YAML/Runtime/Installer certification jobs。
- Client Release metadata 区分 Build Success 与 Release Certified。

## 43. Definition of Done

v2.1.6 完成必须同时满足：

1. Python 与 PowerShell Hotfix 不再产生 `@xxx`/保留前缀非法 plain scalar。
2. Production Managed Config serializer 使用标准 YAML；`simple_yaml` 不再是 Production writer/final oracle。
3. Build-Time Config 使用 PyYAML 独立 parse 和深层语义 equality。
4. Endpoint merge 使用 Embedded Python + PyYAML；PowerShell 不再承担生产 YAML AST。
5. defaults/existing/enforced 和 protected key semantics 保持，配置事务原子且失败回滚。
6. Config unchanged 仍执行 structural/native checks。
7. SKIP_GATEWAY 与 Config validation 完全解耦；Certification 不允许 test mode。
8. Hermes Native config check 是独立 Installer Gate；fallback default config 永不进入 READY。
9. Smoke fixture 与所有 E2E config 从真实 Runtime Profile compiler 派生。
10. YAML corpus 和真实 scoped npm regression 在旧代码 RED、修复后 GREEN。
11. Mock/Stub/Smoke 仅标记 T0–T2；T3–T6 使用真实 Runtime、Gateway 和 frozen MSI。
12. 实际安装后的 config 同时通过 PyYAML 与 Hermes Native Parser，version 输出无 fallback warning。
13. Gateway `/health` 与 Bearer `/v1/models` PASS。
14. Fresh Install、Repair、previous RC Upgrade、Uninstall 全生命周期 certification PASS。
15. Machine/User PATH 全生命周期 bit-for-bit unchanged。
16. Build Success 与 Release Certified 独立记录，包含 exact artifact digest/evidence。
17. Windows 10/11 真实 certification 由 Release Owner、Endpoint Ops、Security Owner 签署；自动化/fixture 不替代人工 Gate。

## 44. 最终架构

```text
release/hermes-runtime-profiles.yaml
              │
              ▼
    Runtime Profile Object
              │
              ▼
    Managed Config Compiler
              │
        PyYAML safe_dump
              │
              ▼
    managed.defaults.yaml
              │
       PyYAML safe_load
       semantic equality
              │
              ▼
        Windows Runtime/MSI
              │
              ▼
    Managed Config Apply Tool
              │
       PyYAML deep merge
              │
              ▼
      candidate config.yaml
              │
       Standard Parser
              │
              ▼
    Atomic promote + Hermes config check
              │
       ┌──────┴──────┐
     FAIL           PASS
       │              │
    Rollback          ▼
                  Gateway
              /health + auth
                      │
                      ▼
                    READY
```

## 45. 工程基线

v2.1.6 冻结三条规则：

> 配置文件的正确性必须由独立标准 Parser 和 Hermes Native Parser 共同判定，不允许由生成配置的自研 Codec 自行证明正确。

> Mock、Stub、Smoke Test 只能证明局部逻辑；最终 MSI 必须经过真实 Windows Artifact Certification 后才能认定可发布。

> Installer READY 必须建立在 Config Valid、Runtime Valid、Gateway Valid 三个独立条件同时成立的基础上，任何 fallback 行为均不得进入 READY。
