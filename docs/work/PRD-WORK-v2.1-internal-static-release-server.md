# PRD-WORK-v2.1 — Internal Generic Release Server Deployment & Publish Pipeline

**项目**：SMC Copilot
**模块**：`apps/work`
**PRD 版本**：Work 2.1
**源码基线**：`work/prd-v2.0`
**基线应用版本**：`0.7.4`
**目标平台**：Windows 10/11 AMD64
**发布组件**：electron-builder + electron-updater + NSIS
**服务端模式**：Internal Generic HTTPS Release Server
**服务端实现**：Nginx Static Hosting + Release Publish Scripts
**不引入**：FastAPI / PostgreSQL / Redis / 独立 Update Service / OPSI Work Product

---

## 1. v2.1 定位

Work 2.0 已完成客户端 Updater Core 的主体改造。

`work/prd-v2.0` 当前已经存在统一 `AppUpdateState`、带 `revision` 的 Main Process Snapshot、启动与周期检查、手工下载、手工安装、Preload v2 IPC 和全局 `AppUpdateProvider`。

Preload 已经将新的：

```text
app-update:get-state
app-update:check
app-update:download
app-update:install
app-update:state-changed
```

协议暴露给 Renderer，并暂时保留旧 updater 事件兼容。

`AppUpdateProvider` 已挂载到应用全局生命周期，而不是依赖 Settings 打开后才初始化。

Updater Core 也已经具备对应单元测试。

因此 **Work 2.1 不重新设计客户端 Updater**。

Work 2.1 负责补齐：

```text
Windows Build
      ↓
Code Signing
      ↓
Release Validation
      ↓
Release Upload
      ↓
Immutable Archive
      ↓
Atomic Stable Promotion
      ↓
Nginx HTTPS Distribution
      ↓
electron-updater
```

形成完整生产发布闭环。

---

# 2. 当前源码缺口

当前分支仍有以下未实施项。

### 2.1 应用打包身份仍是旧配置

`apps/work/package.json` 当前仍为：

```json
{
  "name": "copilot-desktop",
  "version": "0.7.4"
}
```

`electron-builder.yml` 当前仍为：

```yaml
appId: com.nousresearch.hermes
productName: Copilot Desktop

win:
  executableName: copilot-desktop
  target:
    - nsis
    - portable

nsis:
  oneClick: true
  perMachine: false

publish:
  provider: github
  owner: fathah
  repo: hermes-desktop
```

因此当前 `work/prd-v2.0` 的 Updater Core **尚不能连接 SMC Internal Generic Release Server**。

---

### 2.2 Release Build / Publish Script 尚不存在

当前：

```text
apps/work/scripts/
```

已有开发、测试、guard、sandbox 等脚本，但没有：

```text
build-work-release.ps1
validate-work-release.ps1
publish-work-release.ps1
```

---

### 2.3 Release Server Infrastructure 尚不存在

当前：

```text
infra/
└── salt/
```

没有：

```text
infra/release-server/
```

---

### 2.4 v2.0 只有 Release Server 逻辑定义

现有 Work 2.0 实施文档已经定义：

```text
/work/stable/
/work/releases/{version}/
HTTPS
latest.yml
blockmap
signed setup.exe
latest.yml 最后发布
```

但没有 Docker Compose、Nginx、TLS、Publisher、Promotion、Rollback 等可执行基础设施。

这部分由 Work 2.1 补齐。

---

# 3. v2.1 目标

v2.1 完成以下工程能力：

| 能力                     | 目标                                |
| ---------------------- | --------------------------------- |
| Release Server         | Docker + Nginx                    |
| Transport              | HTTPS                             |
| Artifact Storage       | Linux Local Persistent Storage    |
| Update Provider        | electron-updater Generic Provider |
| Build                  | Windows x64 NSIS                  |
| Signing                | Authenticode                      |
| Upload                 | SSH/SFTP/SCP                      |
| Archive                | Immutable Version Directory       |
| Stable                 | Atomic Pointer                    |
| Metadata               | `latest.yml`                      |
| Delta Metadata         | `.blockmap`                       |
| Validation             | Hash + Signature + Metadata       |
| Rollback               | Stable Pointer Rollback           |
| Audit                  | Release Manifest                  |
| Client Authentication  | 无                                 |
| Publish Authentication | SSH Key                           |
| Backend API            | 无                                 |
| Database               | 无                                 |

electron-updater 的 Generic Provider 本身只要求普通 HTTP(S) 文件托管；Generic Server 的 application artifacts 和 update metadata 需要由自己的发布流程上传，因此不需要开发专用 Update Backend。([Electron Builder][1])

---

# 4. 非目标

Work 2.1 不实现：

```text
Release Management Web UI

Release PostgreSQL

FastAPI Release Service

Client Device Policy API

强制升级

部门灰度

用户级 Release Policy

客户端升级统计平台

OPSI 推送 Work

静默安装

自动 downgrade
```

上述能力如果未来出现明确需求，再升级 Release Control Plane。

---

# 5. 总体架构

```text
┌─────────────────────────────────────────────┐
│              Windows Build Machine          │
│                                             │
│ smc-copilot                                │
│ apps/work                                  │
│                                             │
│ npm / electron-builder                     │
│ Code Signing                               │
│ build-work-release.ps1                     │
│ validate-work-release.ps1                  │
└──────────────────────┬──────────────────────┘
                       │
                       │ SSH / SFTP
                       ▼
┌─────────────────────────────────────────────┐
│         Internal Generic Release Server     │
│                                             │
│ /data/smc-release/work                     │
│                                             │
│ staging/                                    │
│ releases/0.7.5/                             │
│ stable -> releases/0.7.5                    │
│                                             │
│ promote-work-release.sh                    │
│ rollback-work-stable.sh                    │
└──────────────────────┬──────────────────────┘
                       │ read-only volume
                       ▼
┌─────────────────────────────────────────────┐
│                   Nginx                     │
│                                             │
│ HTTPS :443                                  │
│ static GET/HEAD                             │
│ cache control                               │
│ TLS                                         │
└──────────────────────┬──────────────────────┘
                       │
                       │ HTTPS
                       ▼
┌─────────────────────────────────────────────┐
│                 SMC Work                    │
│                                             │
│ electron-updater                            │
│                                             │
│ latest.yml                                  │
│       ↓                                     │
│ setup.exe / blockmap                        │
└─────────────────────────────────────────────┘
```

---

# 6. Repository 结构

v2.1 新增：

```text
smc-copilot/
│
├── apps/
│   └── work/
│       ├── scripts/
│       │   ├── build-work-release.ps1
│       │   ├── validate-work-release.ps1
│       │   └── publish-work-release.ps1
│       │
│       └── electron-builder.yml
│
├── infra/
│   └── release-server/
│       ├── docker-compose.yml
│       ├── .env.example
│       │
│       ├── nginx/
│       │   └── default.conf
│       │
│       ├── scripts/
│       │   ├── promote-work-release.sh
│       │   ├── rollback-work-stable.sh
│       │   └── healthcheck.sh
│       │
│       └── README.md
│
└── docs/
    └── work/
        └── PRD-WORK-v2.1-release-server-pipeline.md
```

不建立：

```text
services/work-release-server/
```

因为本阶段不存在需要业务服务承载的 API。

---

# 7. Release Server Host

服务器运行：

```text
Linux
+
Docker Engine
+
Docker Compose
```

主机持久化目录：

```text
/data/smc-release/
└── work/
```

Docker Container 不拥有 Release Artifact 写权限。

Nginx 使用：

```text
read-only bind mount
```

发布操作由 Host 上的独立 Publisher User 完成。

---

# 8. Release Storage Model

目标目录：

```text
/data/smc-release/work/
│
├── staging/
│   └── <release-id>/
│
├── releases/
│   ├── 0.7.4/
│   ├── 0.7.5/
│   └── 0.7.6/
│
└── stable -> releases/0.7.5
```

其中：

### staging

发布临时区：

```text
/data/smc-release/work/staging/<release-id>/
```

仅用于上传和验证。

---

### releases

正式不可变归档：

```text
/data/smc-release/work/releases/0.7.5/
```

内容：

```text
smc-work-0.7.5-setup.exe
smc-work-0.7.5-setup.exe.blockmap
latest.yml
SHA256SUMS.txt
release-manifest.json
```

Release 一旦进入：

```text
releases/<version>
```

禁止覆盖。

如果同版本 Artifact 错误：

```text
禁止重传 0.7.5
```

必须：

```text
0.7.6
```

重新发布。

---

# 9. stable 采用原子指针

v2.0 原方案是：

```text
stable/
├── latest.yml
├── setup.exe
└── blockmap
```

v2.1 改成：

```text
stable
  ↓ symbolic link
releases/0.7.5
```

例如：

```bash
stable -> releases/0.7.5
```

这样：

```text
/work/stable/latest.yml
/work/stable/smc-work-0.7.5-setup.exe
/work/stable/smc-work-0.7.5-setup.exe.blockmap
```

仍然可以直接访问。

优势是一次原子切换整个 Release：

```text
0.7.5
 ↓
0.7.6
```

不再存在：

```text
latest.yml 已更新
但 EXE 尚未完成上传
```

的中间状态。

---

# 10. Atomic Promotion

服务器发布：

```text
staging/<release-id>
        ↓
validate
        ↓
releases/0.7.5
        ↓
stable.new -> releases/0.7.5
        ↓
atomic rename
        ↓
stable -> releases/0.7.5
```

Linux：

```bash
ln -s releases/0.7.5 stable.new
mv -Tf stable.new stable
```

整个 stable 版本集一次完成切换。

---

# 11. Release Server URL

正式客户端配置：

```text
https://<INTERNAL-RELEASE-HOST>/work/stable/
```

例如可以部署为：

```text
https://release.<company-domain>/work/stable/
```

不将具体域名硬编码到源码设计文档。

正式 Build 通过：

```text
SMC_WORK_UPDATE_URL
```

注入：

```text
https://<INTERNAL-RELEASE-HOST>/work/stable/
```

---

# 12. electron-builder Generic Provider

最终配置：

```yaml
publish:
  provider: generic
  url: ${env.SMC_WORK_UPDATE_URL}
  channel: latest
```

Windows 自动更新继续使用：

```text
NSIS
```

electron-builder 官方支持 Windows NSIS 作为 auto-updatable target，并支持 Generic HTTP(S) Provider。([Electron Builder][1])

Release Build 必须拒绝：

```text
http://
localhost
example.com
空 URL
未展开的环境变量
GitHub Provider
```

进入 Production Release。

---

# 13. Docker Compose

新增：

```text
infra/release-server/docker-compose.yml
```

目标结构：

```yaml
services:

  release-server:

    image: nginx:<approved-version>-alpine

    container_name: smc-release-server

    restart: unless-stopped

    ports:
      - "443:443"

    volumes:
      - /data/smc-release:/srv/releases:ro

      - ./nginx/default.conf:
        /etc/nginx/conf.d/default.conf:ro

      - ./certs:
        /etc/nginx/certs:ro
```

生产实现中镜像应固定到经批准版本或 digest，而不是永久依赖浮动 tag。

---

# 14. Nginx Root

Nginx：

```text
root /srv/releases;
```

因此：

```text
/data/smc-release/work/stable/latest.yml
```

映射：

```text
https://<host>/work/stable/latest.yml
```

---

# 15. Nginx Endpoint

只有两个逻辑 Endpoint：

```text
GET  /healthz

GET  /work/...
HEAD /work/...
```

不实现：

```text
POST
PUT
PATCH
DELETE
WebDAV
Directory Upload
```

---

# 16. Nginx Cache Policy

## latest.yml

必须：

```http
Cache-Control: no-cache, no-store, must-revalidate
```

原因：

```text
latest.yml
=
当前 stable version pointer
```

客户端必须能够及时获取最新 metadata。

---

## Versioned Artifact

例如：

```text
smc-work-0.7.5-setup.exe
smc-work-0.7.5-setup.exe.blockmap
```

使用：

```http
Cache-Control:
public, max-age=31536000, immutable
```

因为同版本 Artifact 禁止修改。

---

# 17. Nginx 配置规格

目标配置：

```nginx
server {
    listen 443 ssl;
    server_name <INTERNAL-RELEASE-HOST>;

    root /srv/releases;

    autoindex off;
    server_tokens off;

    ssl_certificate
        /etc/nginx/certs/release.crt;

    ssl_certificate_key
        /etc/nginx/certs/release.key;

    location = /healthz {
        default_type text/plain;
        return 200 "OK\n";
    }

    location ~* /latest\.yml$ {
        limit_except GET HEAD {
            deny all;
        }

        add_header Cache-Control
            "no-cache, no-store, must-revalidate"
            always;

        try_files $uri =404;
    }

    location ~* \.(exe|blockmap)$ {
        limit_except GET HEAD {
            deny all;
        }

        add_header Cache-Control
            "public, max-age=31536000, immutable"
            always;

        try_files $uri =404;
    }

    location / {
        limit_except GET HEAD {
            deny all;
        }

        try_files $uri =404;
    }
}
```

实际部署前执行：

```bash
nginx -t
```

作为 Server Deployment Gate。

---

# 18. TLS

客户端必须：

```text
HTTPS
```

Windows 10 客户机必须能够验证完整证书链。

如果使用企业内部 CA：

```text
Corporate Root CA
    ↓
Windows Trusted Root
```

必须在安装 Work 之前已经受信任。

测试：

```powershell
Invoke-WebRequest `
  "https://<release-host>/healthz"
```

不得使用：

```text
-skip-certificate-check
忽略 TLS
自签证书临时绕过
```

进入生产。

---

# 19. Network Boundary

Release Server 仅要求：

```text
Windows Client
      ↓ TCP/443
Release Server
```

不要求：

```text
Release Server
      ↓
Windows Client
```

主动连接。

因此防火墙模型非常简单：

```text
Client → Release Server : 443
```

---

# 20. Client Authentication

v2.1 不要求客户端登录 Release Server。

读取：

```text
anonymous HTTPS GET
```

但网络层限制为企业网络/VPN范围。

客户端因此不保存：

```text
Release username
Release password
Bearer token
API key
```

如果未来需要授权下载，electron-updater 支持为 Generic Provider 配置 request headers，但不属于 v2.1。([Electron Builder][1])

---

# 21. Publisher Security

客户端访问和发布访问完全分离。

### Client

```text
HTTPS GET
```

### Publisher

```text
SSH / SFTP
```

建立服务器账号：

```text
smc-release-publisher
```

使用：

```text
SSH Public Key
```

禁止：

```text
共享 root 密码
HTTP PUT
Nginx Upload API
```

---

# 22. Release Build

新增：

```text
apps/work/scripts/build-work-release.ps1
```

输入：

```text
Work source
SMC_WORK_UPDATE_URL
Signing credential reference
Output directory
```

执行：

```text
Git State Check
      ↓
package.json Version
      ↓
npm ci
      ↓
npm run guard
      ↓
npm run typecheck
      ↓
npm test
      ↓
electron-builder
      ↓
NSIS x64 Build
      ↓
Authenticode Check
      ↓
Metadata Validation
      ↓
Release Directory
```

---

# 23. Production Build Artifact

假设：

```text
version = 0.7.5
```

输出：

```text
release/work/0.7.5/
├── smc-work-0.7.5-setup.exe
├── smc-work-0.7.5-setup.exe.blockmap
├── latest.yml
├── SHA256SUMS.txt
└── release-manifest.json
```

electron-updater 的 Windows auto-update 依赖构建生成的 metadata 和 NSIS Artifact；Generic Server 场景需要自行上传这些文件。([Electron Builder][1])

---

# 24. release-manifest.json

该文件不提供给 electron-updater 解析。

用于 SMC 发布审计。

格式：

```json
{
  "schema": "smc.work.release.v1",

  "version": "0.7.5",

  "gitCommit": "<sha>",

  "platform": "windows",

  "arch": "x64",

  "updateChannel": "stable",

  "updateUrl":
    "https://<release-host>/work/stable/",

  "installer":
    "smc-work-0.7.5-setup.exe",

  "sha256": "<sha256>",

  "signed": true,

  "createdAt":
    "2026-08-18T00:00:00Z"
}
```

---

# 25. Code Signing

正式 Build 必须进行 Windows Authenticode Signing。

electron-builder 支持 Windows Code Signing，并且 electron-updater Windows 更新支持代码签名校验。([Electron Builder][2])

签名必须位于：

```text
electron-builder build chain
```

中。

禁止：

```text
Generate latest.yml
        ↓
Generate blockmap
        ↓
最后再修改/重新签名 EXE
```

因为这样会改变 Installer 内容，使 metadata 与最终 Artifact 不再对应。

现有 Work 2.0 实施文档已经将这一顺序列为签名门禁。

---

# 26. Release Validation

新增：

```text
apps/work/scripts/validate-work-release.ps1
```

必须检查：

### Version

```text
package.json.version
=
latest.yml.version
=
installer filename version
```

### Artifact

```text
setup.exe EXISTS
blockmap EXISTS
latest.yml EXISTS
```

### Signature

PowerShell：

```powershell
Get-AuthenticodeSignature
```

结果必须：

```text
Status = Valid
```

### Hash

生成：

```text
SHA256SUMS.txt
```

### Metadata

验证：

```text
latest.yml
```

指向的 Installer 必须存在。

不得：

```text
latest.yml = 0.7.5

installer = 0.7.4
```

---

# 27. Publish Script

新增：

```text
apps/work/scripts/publish-work-release.ps1
```

职责：

```text
Local Validation
       ↓
Create release-id
       ↓
SFTP Upload
       ↓
Remote Staging
       ↓
Remote Promote
       ↓
Public Verification
```

Build Script 和 Publish Script 必须分开。

即：

```text
build
≠
publish
```

避免普通开发构建意外更新 Production Stable。

---

# 28. Staging Upload

例如：

```text
version:
0.7.5

release-id:
0.7.5-20260818-001
```

上传：

```text
/data/smc-release/work/
staging/
└── 0.7.5-20260818-001/
```

完整上传后才允许 Promote。

---

# 29. Server Promotion Script

新增：

```text
infra/release-server/scripts/
promote-work-release.sh
```

输入：

```text
VERSION
STAGING_ID
```

步骤：

```text
Validate version syntax
       ↓
Validate staging exists
       ↓
Validate required files
       ↓
Validate SHA256SUMS
       ↓
Check releases/<version> not exists
       ↓
Move staging → releases/<version>
       ↓
Create stable.new symlink
       ↓
Atomic swap
       ↓
Post-promotion health check
```

如果：

```text
releases/0.7.5
```

已经存在：

```text
PROMOTION_FAILED
RELEASE_ALREADY_EXISTS
```

不得覆盖。

---

# 30. Stable Verification

Promotion 后：

```text
GET /work/stable/latest.yml
```

验证：

```text
HTTP 200
version = 0.7.5
```

然后：

```text
HEAD /work/stable/
smc-work-0.7.5-setup.exe
```

验证：

```text
HTTP 200
Content-Length > 0
```

再从真实 Windows 10 Client Network 验证一次。

---

# 31. Rollback

新增：

```text
rollback-work-stable.sh
```

例如：

```bash
rollback-work-stable.sh 0.7.4
```

执行：

```text
validate releases/0.7.4
        ↓
stable.new -> releases/0.7.4
        ↓
atomic switch
```

但必须明确：

> **Stable rollback 只停止尚未升级的客户端继续获取坏版本。**

它不是：

```text
0.7.5 Client
     ↓
自动变回 0.7.4
```

v2.1 不实现自动 downgrade。

已经升级的客户端发生问题时采用：

```text
forward fix
```

例如：

```text
0.7.5 faulty
   ↓
0.7.6 hotfix
```

---

# 32. Release Immutability

以下路径：

```text
/work/releases/0.7.5/
```

一旦发布禁止修改。

原因：

```text
version
=
artifact identity
```

同版本重新覆盖会破坏：

```text
Cache
Hash
Audit
Troubleshooting
Reproducibility
```

需要修复只能增加版本。

---

# 33. Current Stable Metadata

客户端唯一使用：

```text
/work/stable/latest.yml
```

不读取：

```text
/work/releases/
```

目录列表。

`autoindex` 必须关闭。

客户端不自己扫描版本。

---

# 34. Bridge / Cutover

这是当前源码必须处理的一个迁移问题。

当前 `electron-builder.yml` 仍然指向：

```text
fathah/hermes-desktop
```

GitHub Provider。

因此已经安装的旧版客户端：

```text
0.7.4
```

无法自动知道：

```text
Internal Generic Release Server
```

的存在。

现有 Work 2.0 实施文档已经将此定义为 `CUTOVER-01`。

v2.1 固定两种迁移路径。

### 场景 A：客户机尚未部署 Work

直接安装第一个包含：

```text
Generic Provider
```

的新 Work Installer。

不需要 Bridge。

### 场景 B：已经部署旧 0.7.4

执行一次：

```text
Bridge Release
```

或者：

```text
人工/企业安装迁移包
```

Bridge 完成后：

```text
app-update.yml
```

必须只指向企业 Internal Generic Provider。

禁止长期：

```text
GitHub
+
Internal Release Server
```

双源运行。

---

# 35. Application Identity Gate

Release Server 与 Work Brand Migration 分离。

当前：

```text
appId:
com.nousresearch.hermes

productName:
Copilot Desktop

executableName:
copilot-desktop
```

Work 2.0 实施文档已经指出直接改变这些值会影响：

```text
installer identity
uninstall identity
shortcut
userData
upgrade continuity
```

因此 Work 2.1 不要求 Release Server 项目同时完成 Identity Migration。

必须分别验收：

```text
RELEASE-INFRA
```

和：

```text
APP-IDENTITY
```

避免两个高风险迁移同时发生而无法定位问题。

---

# 36. Server Health

提供：

```text
GET /healthz
```

只验证：

```text
Nginx alive
HTTPS alive
```

另外执行深度健康检查：

```text
GET /work/stable/latest.yml
HEAD current installer
```

Server Script：

```text
infra/release-server/scripts/
healthcheck.sh
```

返回非零 Exit Code 时 Release Server Deployment Gate 失败。

---

# 37. Logging

Nginx 保留：

```text
access.log
error.log
```

至少能够识别：

```text
timestamp
client IP
method
path
status
bytes
user agent
```

不记录：

```text
Release signing credential
SSH private key
certificate private key
```

客户端仍继续使用现有：

```text
<userData>/logs/updater.log
```

当前 Updater 已经在 Main 中建立结构化事件记录能力。

---

# 38. Client Request Pattern

正常客户端请求：

```text
GET
/work/stable/latest.yml
```

如果：

```text
latest.version
>
app.version
```

用户确认下载后才请求：

```text
GET
/work/stable/
smc-work-<version>-setup.exe
```

以及需要的：

```text
blockmap
```

Work 2.0 当前已经将：

```text
autoDownload = false
autoInstallOnAppQuit = false
```

写入 Updater Core。

因此 Release Server 不需要处理：

```text
下载授权 Session
安装 Session
用户审批
```

这些状态属于客户端。

---

# 39. Package Scripts

`package.json` 增加：

```json
{
  "scripts": {
    "release:build:win":
      "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-work-release.ps1",

    "release:validate":
      "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validate-work-release.ps1",

    "release:publish":
      "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/publish-work-release.ps1"
  }
}
```

正式发布入口统一，不再依赖人工寻找 `dist/` 文件。

---

# 40. Release Build Environment

Windows Build Machine 必须具备：

```text
Node
npm
Windows SDK / Signing Toolchain
Code Signing Credential
Git
PowerShell
SSH/SCP
```

Secret：

```text
Signing credential
SSH private key
```

只能存在于：

```text
Windows Credential Store
CI Secret Store
Protected local secret path
```

不得提交：

```text
Git
.env committed file
Release Artifact
```

---

# 41. Release Server Deployment

第一次部署：

```text
1. DNS
2. TLS certificate
3. Host directories
4. Publisher user
5. Docker Compose
6. Nginx configuration
7. Firewall TCP 443
8. Start container
9. healthz
10. Windows client TLS validation
```

部署完成时：

```text
/work/stable
```

可以暂时不存在。

Nginx 本身仍需：

```text
/healthz = 200
```

---

# 42. First Release

第一次正式 Release：

```text
Build 0.7.x
      ↓
Sign
      ↓
Validate
      ↓
Upload staging
      ↓
Promote releases/<version>
      ↓
stable pointer
      ↓
Windows test client
      ↓
check update
```

如果当前是首次客户机部署，则直接使用这一正式 Installer 手工安装。

后续：

```text
electron-updater
```

接管 Work 升级。

---

# 43. Testing Matrix

## Infrastructure

```text
Docker start
Nginx config
TLS
DNS
GET
HEAD
404
Cache-Control
No autoindex
Write methods denied
Container restart
Host restart
```

## Release Pipeline

```text
Missing EXE
Missing blockmap
Missing latest.yml
Version mismatch
Invalid signature
Hash mismatch
Version already exists
Incomplete staging
Promotion failure
Atomic switch
Rollback stable
```

## Client

```text
same version
newer version
server unavailable
metadata unavailable
installer unavailable
download interruption
signature failure
user declines download
user downloads
user delays install
user confirms install
restart
version verification
```

---

# 44. Packaged Live Update Gate

必须使用两个真实安装版本。

例如：

```text
Installed:
0.7.5

Stable:
0.7.6
```

测试：

```text
Launch Work
       ↓
15–60 second startup check
       ↓
AVAILABLE 0.7.6
       ↓
No installer GET yet
       ↓
User Download
       ↓
DOWNLOADING
       ↓
READY
       ↓
User Install
       ↓
Restart
       ↓
Work 0.7.6
```

当前 Updater Core 已实现启动检查抖动和 6 小时周期检查。

---

# 45. Implementation Phases

### Phase 1 — Release Infrastructure

新增：

```text
infra/release-server
```

完成：

```text
Docker Compose
Nginx
TLS
Storage
Health Check
```

---

### Phase 2 — Builder Generic Provider

修改：

```text
electron-builder.yml
```

完成：

```text
Generic Provider
Windows NSIS release target
Production update URL
```

Identity Migration 按已有 IDM-01 独立执行。

---

### Phase 3 — Release Build

新增：

```text
build-work-release.ps1
validate-work-release.ps1
```

完成：

```text
Build
Sign
Validate
Release Manifest
```

---

### Phase 4 — Publish

新增：

```text
publish-work-release.ps1
promote-work-release.sh
```

完成：

```text
staging
archive
atomic stable
post-check
```

---

### Phase 5 — Recovery

新增：

```text
rollback-work-stable.sh
```

验证：

```text
stable N
→
stable N-1
```

并确认已升级客户端不做自动 downgrade。

---

### Phase 6 — Live Update

执行：

```text
Windows 10 previous version
       ↓
new stable release
       ↓
electron-updater
       ↓
upgrade PASS
```

---

# 46. Source Change Matrix

| 位置                                            | v2.1 操作                                |
| --------------------------------------------- | -------------------------------------- |
| `apps/work/src/shared/app-update.ts`          | 保留                                     |
| `apps/work/src/main/app/updater.ts`           | 保留主体，仅做 Generic Provider 联调            |
| `apps/work/src/preload/index.ts`              | 保留 v2 Contract                         |
| `AppUpdateProvider.tsx`                       | 保留                                     |
| `updater.test.ts`                             | 保留并扩展 Integration                      |
| `package.json`                                | 增加 Release scripts                     |
| `electron-builder.yml`                        | 改 Generic Provider / Release Packaging |
| `apps/work/scripts/build-work-release.ps1`    | 新增                                     |
| `apps/work/scripts/validate-work-release.ps1` | 新增                                     |
| `apps/work/scripts/publish-work-release.ps1`  | 新增                                     |
| `infra/release-server/docker-compose.yml`     | 新增                                     |
| `infra/release-server/nginx/default.conf`     | 新增                                     |
| `promote-work-release.sh`                     | 新增                                     |
| `rollback-work-stable.sh`                     | 新增                                     |
| `healthcheck.sh`                              | 新增                                     |
| Work 2.1 文档                                   | 新增                                     |

---

# 47. Acceptance Criteria

| ID     | Gate                                                         |
| ------ | ------------------------------------------------------------ |
| W21-01 | `infra/release-server` 可通过 Docker Compose 启动                 |
| W21-02 | `/healthz` HTTPS 200                                         |
| W21-03 | Windows 10 信任 Release Server TLS                             |
| W21-04 | Nginx Artifact Volume 为 read-only                            |
| W21-05 | HTTP Write Method 不可使用                                       |
| W21-06 | Directory Listing 关闭                                         |
| W21-07 | Generic Provider 指向 Internal HTTPS                           |
| W21-08 | Production 不访问旧 GitHub Feed                                  |
| W21-09 | Production Windows Artifact 仅 NSIS update target             |
| W21-10 | Installer Authenticode Valid                                 |
| W21-11 | `latest.yml` version 与 package version 一致                    |
| W21-12 | blockmap 与 Installer 同 Release                               |
| W21-13 | SHA256SUMS PASS                                              |
| W21-14 | incomplete staging 不能 Promote                                |
| W21-15 | 已存在 Release Version 不能覆盖                                     |
| W21-16 | Release Archive immutable                                    |
| W21-17 | Stable Switch 为原子操作                                          |
| W21-18 | stable rollback PASS                                         |
| W21-19 | Stable rollback 不触发客户端自动 downgrade                           |
| W21-20 | Client 能获取 `latest.yml`                                      |
| W21-21 | AVAILABLE 状态不自动请求 Installer                                  |
| W21-22 | 用户点击下载后 Installer GET                                        |
| W21-23 | Download → READY PASS                                        |
| W21-24 | 用户确认安装后 Work Upgrade PASS                                    |
| W21-25 | Upgrade 后用户数据完整                                              |
| W21-26 | Release Server Offline 不影响 Work 正常启动                         |
| W21-27 | Bridge/Cutover 场景完成并关闭旧 Feed                                 |
| W21-28 | Production Publish 必须经过 Build → Validate → Publish 三个独立 Gate |

---

# 48. Definition of Done

Work 2.1 完成后整体链路为：

```text
Source
=
smc-copilot/apps/work

Version
=
package.json

Build
=
electron-builder

Windows Package
=
NSIS x64

Signing
=
Authenticode

Build Output
=
setup.exe
+
blockmap
+
latest.yml

Build Validation
=
validate-work-release.ps1

Upload Transport
=
SSH / SFTP

Release Staging
=
/work/staging

Release Archive
=
/work/releases/<version>

Stable
=
atomic symlink

Distribution
=
Nginx HTTPS

Update Provider
=
electron-updater Generic Provider

Client Authentication
=
None

Publish Authentication
=
SSH Key

Update Backend
=
None

Database
=
None

OPSI Dependency
=
None

Automatic Check
=
Enabled

Automatic Download
=
Disabled

Automatic Install
=
Disabled

Download
=
User Confirmed

Install
=
User Confirmed
```

最终生产链：

```text
Developer
   ↓
build-work-release.ps1
   ↓
Signed Work Release
   ↓
validate-work-release.ps1
   ↓
publish-work-release.ps1
   ↓
Release Server staging
   ↓
promote-work-release.sh
   ↓
releases/0.x.x
   ↓
stable atomic switch
   ↓
Nginx HTTPS
   ↓
latest.yml
   ↓
electron-updater
   ↓
User Download
   ↓
User Install
   ↓
SMC Work New Version
```

**Work 2.1 的工程边界固定为：在现有 Work 2.0 Updater Core 之上补齐 `Windows Release Build + Internal Static Release Server + Signed Artifact Validation + Atomic Publish Pipeline`。不增加独立业务服务端。**

[1]: https://www.electron.build/docs/features/auto-update/?utm_source=chatgpt.com "Auto Update | electron-builder"
[2]: https://www.electron.build/docs/features/code-signing/code-signing-win/?utm_source=chatgpt.com "Code Signing for Windows | electron-builder"
