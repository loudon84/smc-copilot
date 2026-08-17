你批评得对。上一版把一个 **Hotfix PRD** 写成了技术说明书，重复解释背景、运行链、验收逻辑，信息密度明显不合格。

这个 Hotfix 实际只有 **3 个问题、4 个改动点、5 个验收项**。下面按工程团队可直接实施的格式重做。

# PRD-OPSI-v1.7.2 Hotfix

**基线**：v1.7.1
**目标**：修复 `smc-hermes-agent` 无法通过 OPSI 4.3 native `opsi-makepackage` 打包的问题。
**范围**：仅 Release / Packaging Pipeline。
**不修改**：Endpoint Controller、Hermes 安装逻辑、Managed User、Gateway、OPSI Client Deployment。

---

## 1. 当前问题

实际 OPSI Server：

```text
uibmz/opsi-server:4.3
Debian 13

opsi-makepackage 4.3.30.7
python-opsi 4.3.12.0
```

执行：

```bash
opsi-makepackage
```

失败：

```text
Product version is required
```

当前 `control.toml`：

```toml
[Package]
version = "1"

[Product]
id = "smc-hermes-agent"
productVersion = "1.7.1"
packageVersion = "1"
```

根因：

### P1. OPSI 4.3 Product Version 字段错误

当前：

```toml
[Product]
productVersion = "1.7.1"
```

应为：

```toml
[Product]
version = "1.7.2"
```

Package Version 已由：

```toml
[Package]
version = "1"
```

定义。

---

### P2. ProductProperty schema 错误

当前：

```toml
[ProductProperty.unicode.hermes_version]
```

应转换为 OPSI 4.3 标准结构：

```toml
[[ProductProperty]]
type = "unicode"
name = "hermes_version"
```

全部 Product Property 统一转换。

---

### P3. Release Builder 错误理解 OPSI Runtime

实际：

```text
/opt/python312/bin/python3.12
    → 仅运行 SMC packaging/signing

/usr/lib/opsi-utils/*
    → OPSI 自包含 native tooling
```

禁止再通过：

```bash
python3 -c "import opsi"
python3.12 -c "import opsi"
```

判断 OPSI 环境。

---

# 2. 修改要求

## FR-01 control.toml 修复

修改：

```text
infra/opsi/products/smc-hermes-agent/OPSI/control.toml
```

目标：

```toml
[Package]
version = "1"
depends = []

[Product]
type = "localboot"
id = "smc-hermes-agent"
name = "SMC Hermes Agent"
version = "1.7.2"

priority = 0
licenseRequired = false

setupScript = "setup.opsiscript"
uninstallScript = "uninstall.opsiscript"
updateScript = "update.opsiscript"
customScript = "custom.opsiscript"

windowsSoftwareIds = []
```

删除：

```toml
productVersion = "..."
packageVersion = "..."
```

---

## FR-02 ProductProperty 全量转换

以下属性全部转换成 `[[ProductProperty]]`：

```text
gateway_autostart
diagnostics_enabled
hermes_version
release_channel
gateway_port
managed_profile
config_revision
diagnostic_log_lines
auto_repair_level
custom_operation
request_id
client_id
managed_user_sid
managed_user_account
config_digest
config_payload
controller_revision
```

格式：

```toml
[[ProductProperty]]
type = "unicode"
name = "hermes_version"
multivalue = false
editable = true
default = ["0.20.0"]
```

bool：

```toml
[[ProductProperty]]
type = "bool"
name = "gateway_autostart"
default = [true]
```

---

## FR-03 Builder 增加 Schema Precheck

修改：

```text
packaging/makepackage.py
```

native build 前检查：

```text
[Package].version exists
[Product].id exists
[Product].version exists
[Product].type == localboot
```

同时禁止：

```text
Product.productVersion
Product.packageVersion
ProductProperty.unicode.*
ProductProperty.bool.*
```

发现即退出：

```text
CONTROL_SCHEMA_INVALID
```

---

## FR-04 固定 Runtime Boundary

Builder：

```text
/opt/python312/bin/python3.12
```

只要求：

```text
cryptography
SMC packaging dependencies
```

OPSI：

```text
opsi-makepackage
opsi-package-manager
opsi-cli
```

只通过 CLI 调用。

不得要求 Python 3.12 安装：

```text
python-opsi
opsiutils
```

不得修改：

```text
/usr/lib/opsi-utils/_internal
/usr/bin/python3
```

---

# 3. 版本

本 Hotfix：

```text
Product ID       smc-hermes-agent
Product Version  1.7.2
Package Version  1
Controller Rev   2
```

产物：

```text
smc-hermes-agent_1.7.2-1.opsi
```

Hermes Runtime Version 继续独立管理，不跟随 Product Version。

---

# 4. Release Pipeline

最终流程固定为：

```text
Hermes Bundle
      ↓
SMC packaging.py
      ↓
Schema Precheck
      ↓
Signing
      ↓
Signed Product Stage
      ↓
opsi-makepackage
      ↓
smc-hermes-agent_1.7.2-1.opsi
      ↓
opsi-cli package extract
      ↓
Read-back
      ↓
opsi-package-manager -i
      ↓
ProductOnDepot
```

---

# 5. 验收标准

### AC-01 Native Build

```bash
opsi-makepackage
```

PASS，不再出现：

```text
Product version is required
```

### AC-02 Package

生成：

```text
smc-hermes-agent_1.7.2-1.opsi
```

### AC-03 Read-back

```bash
opsi-cli package extract
```

PASS，并确认：

```toml
[Package]
version = "1"

[Product]
id = "smc-hermes-agent"
version = "1.7.2"
```

### AC-04 Depot Install

```bash
opsi-package-manager -i smc-hermes-agent_1.7.2-1.opsi
```

PASS。

### AC-05 ProductOnDepot

必须：

```text
productId      = smc-hermes-agent
productVersion = 1.7.2
packageVersion = 1
```

---

# 6. 本 Hotfix 不做

明确排除：

```text
不修改 Hermes Bundle Format
不修改 Controller Revision 2
不修改 setup/update/uninstall 业务逻辑
不修改 Managed User Binding
不修改 Gateway 8642
不修改 opsiclientd
不修改 Windows Client prerequisite
不重构 OPSI Docker 镜像
```

---

## Definition of Done

```text
control.toml schema PASS
        +
opsi-makepackage PASS
        +
package extract PASS
        +
opsi-package-manager PASS
        +
ProductOnDepot = 1.7.2-1
```

达到以上条件，**v1.7.2 Hotfix 完成**。

这才是这个 Hotfix 应有的粒度：开发人员看完可以直接改代码，不重复讲已经确定的架构背景。
