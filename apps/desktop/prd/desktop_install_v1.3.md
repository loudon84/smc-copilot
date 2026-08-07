# SMC Copilot Windows 升级覆盖方案

## 0. 固定应用身份

从本版本开始冻结以下字段，后续版本禁止变更：

```yaml
appId: com.smc.copilot
productName: SMC Copilot
win:
  executableName: smc-copilot
```

NSIS 固定 GUID：

```yaml
nsis:
  guid: "7D7C5222-4F0C-4BD0-B877-6D62ED5B941A"
```

说明：

```text
appId       = Windows / Electron Builder 应用身份
productName = 安装器、快捷方式、卸载项显示名
executableName = 主程序 exe 文件名
nsis.guid   = NSIS 升级识别核心字段，首个正式版本发布后不得修改
```

---

# 1. 功能目标

## 1.1 安装覆盖目标

```text
1. 新版本安装包可覆盖旧版本 SMC Copilot。
2. 用户原安装目录不变。
3. Electron App 本体被覆盖更新。
4. hermes-agent runtime 不被删除。
5. ~/.hermes 用户数据不被删除。
6. PATH 中的 bin 目录不重复写入。
7. 桌面快捷方式、开始菜单快捷方式自动更新。
8. 卸载默认不删除用户数据。
```

## 1.2 兼容旧版本目标

如果员工电脑上已经安装过旧版 Hermes Desktop / Hermes Agent，需要一次性迁移：

```text
旧身份：
  appId: com.nousresearch.hermes
  productName: Hermes Agent
  executableName: hermes-agent

新身份：
  appId: com.smc.copilot
  productName: SMC Copilot
  executableName: smc-copilot
```

新安装器负责检测旧目录并复用，避免装成第二套应用。

---

# 2. 目录规范

## 2.1 可覆盖目录

安装器升级时可覆盖：

```text
$INSTDIR\
  SMC Copilot.exe
  resources\
  locales\
  *.dll
  *.pak
  *.bin
```

## 2.2 必须保留目录

升级、修复安装、自动更新时必须保留：

```text
$INSTDIR\bin\
$INSTDIR\runtime\
$INSTDIR\runtime\hermes-agent\
$INSTDIR\runtime\logs\
$INSTDIR\runtime\cache\
$INSTDIR\runtime\downloads\
%USERPROFILE%\.hermes\
```

禁止覆盖：

```text
%USERPROFILE%\.hermes\.env
%USERPROFILE%\.hermes\config.yaml
%USERPROFILE%\.hermes\SOUL.md
%USERPROFILE%\.hermes\state.db
%USERPROFILE%\.hermes\profiles\
%USERPROFILE%\.hermes\skills\
%USERPROFILE%\.hermes\desktop\
```

---

# 3. electron-builder.yml 修改

```yaml
appId: com.smc.copilot
productName: SMC Copilot

directories:
  buildResources: build
  output: dist

files:
  - out/**
  - package.json
  - "!**/.vscode/*"
  - "!src/*"
  - "!electron.vite.config.{js,ts,mjs,cjs}"
  - "!{.eslintcache,eslint.config.mjs,.prettierrc.yaml,.prettierignore,README.md,CHANGELOG.md}"
  - "!{.env,.env.*,.npmrc,pnpm-lock.yaml}"
  - "!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}"

extraResources:
  - from: resources/defaults
    to: defaults
  - from: resources/bootstrap
    to: bootstrap
  - from: resources/scripts/windows
    to: scripts/windows

asarUnpack:
  - resources/**
  - node_modules/better-sqlite3/**

win:
  executableName: smc-copilot
  target:
    - target: nsis
      arch:
        - x64

nsis:
  guid: "7D7C5222-4F0C-4BD0-B877-6D62ED5B941A"

  artifactName: smc-copilot-${version}-setup.${ext}
  shortcutName: SMC Copilot
  uninstallDisplayName: SMC Copilot

  oneClick: false
  allowToChangeInstallationDirectory: true

  perMachine: false
  selectPerMachineByDefault: false

  createDesktopShortcut: always
  createStartMenuShortcut: true
  deleteAppDataOnUninstall: false

  include: build/installer.nsh

publish:
  provider: generic
  url: https://your-internal-update-server/smc-copilot/
```

---

# 4. NSIS 安装器逻辑

新增文件：

```text
build/installer.nsh
```

## 4.1 注册表路径

统一使用：

```text
HKCU\Software\SMC\Copilot
```

字段：

```text
InstallLocation
RuntimeRoot
BinDir
AppVersion
InstallMode
PreviousVersion
LastUpdatedAt
```

## 4.2 升级识别顺序

```text
1. HKCU\Software\SMC\Copilot\InstallLocation
2. HKLM\Software\SMC\Copilot\InstallLocation
3. Legacy: HKCU\Software\SMC\HermesDesktop\InstallLocation
4. Legacy: HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\com.nousresearch.hermes\InstallLocation
5. 默认目录：%LOCALAPPDATA%\Programs\SMC Copilot
```

---

# 5. build/installer.nsh 骨架

```nsh
!include LogicLib.nsh
!include WinMessages.nsh

Var ExistingInstallDir
Var RuntimeRoot
Var BinDir
Var LegacyInstallDir

!macro preInit
  SetRegView 64

  ; 1. 新版安装目录
  ReadRegStr $ExistingInstallDir HKCU "Software\SMC\Copilot" "InstallLocation"

  ; 2. 旧版 Hermes Desktop 目录
  ${If} $ExistingInstallDir == ""
    ReadRegStr $LegacyInstallDir HKCU "Software\SMC\HermesDesktop" "InstallLocation"
    ${If} $LegacyInstallDir != ""
      StrCpy $ExistingInstallDir "$LegacyInstallDir"
    ${EndIf}
  ${EndIf}

  ; 3. 旧版 com.nousresearch.hermes 卸载项目录
  ${If} $ExistingInstallDir == ""
    ReadRegStr $LegacyInstallDir HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.nousresearch.hermes" "InstallLocation"
    ${If} $LegacyInstallDir != ""
      StrCpy $ExistingInstallDir "$LegacyInstallDir"
    ${EndIf}
  ${EndIf}

  ; 4. 首次安装默认目录
  ${If} $ExistingInstallDir == ""
    StrCpy $ExistingInstallDir "$LOCALAPPDATA\Programs\SMC Copilot"
  ${EndIf}

  ; 5. 让安装器默认使用已安装目录
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$ExistingInstallDir"

  SetRegView 32
!macroend

!macro customInstall
  DetailPrint "Preparing SMC Copilot upgrade-safe directories..."

  StrCpy $RuntimeRoot "$INSTDIR\runtime"
  StrCpy $BinDir "$INSTDIR\bin"

  ; 保留型目录：升级时只 ensure，不删除
  CreateDirectory "$INSTDIR\bin"
  CreateDirectory "$INSTDIR\runtime"
  CreateDirectory "$INSTDIR\runtime\hermes-agent"
  CreateDirectory "$INSTDIR\runtime\logs"
  CreateDirectory "$INSTDIR\runtime\cache"
  CreateDirectory "$INSTDIR\runtime\downloads"

  ; CLI shim：每次升级重写，保证指向新 exe
  FileOpen $0 "$INSTDIR\bin\smc-copilot.cmd" w
  FileWrite $0 "@echo off$\r$\n"
  FileWrite $0 'set SMC_COPILOT_HOME=%~dp0..$\r$\n'
  FileWrite $0 '"%SMC_COPILOT_HOME%\SMC Copilot.exe" %*$\r$\n'
  FileClose $0

  FileOpen $1 "$INSTDIR\bin\hermes.cmd" w
  FileWrite $1 "@echo off$\r$\n"
  FileWrite $1 "set HERMES_HOME=%USERPROFILE%\.hermes$\r$\n"
  FileWrite $1 'set SMC_COPILOT_HOME=%~dp0..$\r$\n'
  FileWrite $1 '"%SMC_COPILOT_HOME%\runtime\hermes-agent\venv\Scripts\hermes.exe" %*$\r$\n'
  FileClose $1

  ; 写入安装信息
  FileOpen $2 "$INSTDIR\runtime\desktop-runtime.json" w
  FileWrite $2 '{$\r$\n'
  FileWrite $2 '  "appId": "com.smc.copilot",$\r$\n'
  FileWrite $2 '  "productName": "SMC Copilot",$\r$\n'
  FileWrite $2 '  "executableName": "smc-copilot",$\r$\n'
  FileWrite $2 '  "installDir": "$INSTDIR",$\r$\n'
  FileWrite $2 '  "runtimeRoot": "$INSTDIR\\runtime",$\r$\n'
  FileWrite $2 '  "binDir": "$INSTDIR\\bin",$\r$\n'
  FileWrite $2 '  "agentDir": "$INSTDIR\\runtime\\hermes-agent"$\r$\n'
  FileWrite $2 '}$\r$\n'
  FileClose $2

  ; 注册表：供 Electron Main Process 读取
  WriteRegExpandStr HKCU "Software\SMC\Copilot" "InstallLocation" "$INSTDIR"
  WriteRegExpandStr HKCU "Software\SMC\Copilot" "RuntimeRoot" "$INSTDIR\runtime"
  WriteRegExpandStr HKCU "Software\SMC\Copilot" "BinDir" "$INSTDIR\bin"
  WriteRegStr HKCU "Software\SMC\Copilot" "AppVersion" "${VERSION}"
  WriteRegStr HKCU "Software\SMC\Copilot" "InstallMode" "per-user"

  ; PATH 写入交给 EnVar 或自定义 path-manager，要求幂等
  Call AddSmcCopilotBinToUserPath

  ; 删除旧版快捷方式
  Delete "$DESKTOP\Hermes Agent.lnk"
  Delete "$SMPROGRAMS\Hermes Agent.lnk"
!macroend

Function AddSmcCopilotBinToUserPath
  ReadRegStr $0 HKCU "Environment" "Path"

  ; 简化版：先判断是否已包含 $INSTDIR\bin
  Push "$0"
  Push "$INSTDIR\bin"
  Call StrContains
  Pop $1

  ${If} $1 == "1"
    DetailPrint "PATH already contains $INSTDIR\bin"
  ${Else}
    ${If} $0 == ""
      WriteRegExpandStr HKCU "Environment" "Path" "$INSTDIR\bin"
    ${Else}
      WriteRegExpandStr HKCU "Environment" "Path" "$0;$INSTDIR\bin"
    ${EndIf}

    System::Call 'user32::SendMessageTimeout(i 0xffff, i ${WM_SETTINGCHANGE}, i 0, t "Environment", i 0, i 5000, *i .r0)'
  ${EndIf}
FunctionEnd

Function StrContains
  Exch $R1
  Exch
  Exch $R0
  Push $R2
  Push $R3

  StrLen $R2 $R1
  StrCpy $R3 0

  loop:
    StrCpy $R4 $R0 $R2 $R3
    StrCmp $R4 $R1 found
    StrCmp $R4 "" notfound
    IntOp $R3 $R3 + 1
    Goto loop

  found:
    StrCpy $R0 "1"
    Goto done

  notfound:
    StrCpy $R0 "0"

  done:
    Pop $R3
    Pop $R2
    Exch $R0
FunctionEnd

!macro customUnInstall
  ; 卸载只删除程序，不默认删除 runtime / ~/.hermes
  DeleteRegKey HKCU "Software\SMC\Copilot"

  ; PATH 移除建议后续接 EnVar 插件实现精确删除
!macroend
```

---

# 6. PATH 策略

默认写入：

```text
User PATH:
  HKCU\Environment\Path
```

写入内容：

```text
$INSTDIR\bin
```

不要写：

```text
$INSTDIR
$INSTDIR\runtime\hermes-agent
$INSTDIR\runtime\hermes-agent\venv\Scripts
```

原因：

```text
1. $INSTDIR\bin 是稳定入口。
2. hermes-agent venv 可能重建。
3. 后续升级只需重写 shim，不需要修改 PATH。
```

最终命令：

```bash
smc-copilot
hermes
```

---

# 7. Electron Main Process 新增安装路径解析

新增文件：

```text
src/main/enterprise/windows/install-location.ts
```

```ts
import { dirname, join } from "node:path";
import { app } from "electron";
import { execFileSync } from "node:child_process";

export interface SmcInstallLocation {
  installDir: string;
  runtimeRoot: string;
  binDir: string;
  agentDir: string;
  source: "env" | "registry" | "execPath" | "dev";
}

function readRegistryValue(name: string): string | null {
  try {
    const output = execFileSync(
      "reg",
      [
        "query",
        "HKCU\\Software\\SMC\\Copilot",
        "/v",
        name,
      ],
      { encoding: "utf-8" },
    );

    const match = output.match(new RegExp(`${name}\\s+REG_\\w+\\s+(.+)`));
    return match?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

export function getSmcInstallLocation(): SmcInstallLocation {
  const envDir = process.env.SMC_COPILOT_INSTALL_DIR;
  if (envDir) {
    return {
      installDir: envDir,
      runtimeRoot: join(envDir, "runtime"),
      binDir: join(envDir, "bin"),
      agentDir: join(envDir, "runtime", "hermes-agent"),
      source: "env",
    };
  }

  const registryDir = readRegistryValue("InstallLocation");
  if (registryDir) {
    return {
      installDir: registryDir,
      runtimeRoot: join(registryDir, "runtime"),
      binDir: join(registryDir, "bin"),
      agentDir: join(registryDir, "runtime", "hermes-agent"),
      source: "registry",
    };
  }

  if (app.isPackaged) {
    const installDir = dirname(process.execPath);
    return {
      installDir,
      runtimeRoot: join(installDir, "runtime"),
      binDir: join(installDir, "bin"),
      agentDir: join(installDir, "runtime", "hermes-agent"),
      source: "execPath",
    };
  }

  const devDir = join(app.getPath("userData"), "dev-runtime");
  return {
    installDir: devDir,
    runtimeRoot: join(devDir, "runtime"),
    binDir: join(devDir, "bin"),
    agentDir: join(devDir, "runtime", "hermes-agent"),
    source: "dev",
  };
}
```

所有原来写死到 `%LOCALAPPDATA%\HermesDesktop` 的逻辑，要改为读取：

```ts
const location = getSmcInstallLocation();
location.runtimeRoot;
location.agentDir;
location.binDir;
```

---

# 8. 升级前关闭本地运行时

自动更新和手动覆盖安装前都必须关闭：

```text
1. Hermes Gateway
2. Profile Runtime gateway
3. Browser Tool Server
4. Claw3D dev server
5. SQLite 写连接
6. 日志文件句柄
```

新增文件：

```text
src/main/update/update-lifecycle.ts
```

```ts
export async function prepareForAppUpdate(): Promise<void> {
  try {
    stopHealthPolling();
  } catch {}

  try {
    stopGateway();
  } catch {}

  try {
    stopSshTunnel();
  } catch {}

  try {
    stopClaw3d();
  } catch {}

  try {
    if (browserToolServer) {
      browserToolServer.stop();
    }
  } catch {}
}
```

在 `install-update` 前调用：

```ts
ipcMain.handle("install-update", async () => {
  await prepareForAppUpdate();
  autoUpdater.quitAndInstall(false, true);
});
```

---

# 9. 升级后迁移

新增：

```text
src/main/migrations/
  migration-runner.ts
  001-install-location.ts
  002-runtime-layout.ts
  003-web-operator-config.ts
```

## 9.1 migration-runner.ts

```ts
import { app } from "electron";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getSmcInstallLocation } from "../enterprise/windows/install-location";

interface DesktopRuntimeState {
  schemaVersion: number;
  appVersion: string;
  installDir: string;
  runtimeRoot: string;
  migratedAt?: string;
}

const CURRENT_SCHEMA_VERSION = 3;

export function runDesktopMigrations(): void {
  const location = getSmcInstallLocation();

  mkdirSync(location.runtimeRoot, { recursive: true });

  const statePath = join(location.runtimeRoot, "desktop-runtime-state.json");

  let state: DesktopRuntimeState = {
    schemaVersion: 0,
    appVersion: "0.0.0",
    installDir: location.installDir,
    runtimeRoot: location.runtimeRoot,
  };

  if (existsSync(statePath)) {
    try {
      state = JSON.parse(readFileSync(statePath, "utf-8")) as DesktopRuntimeState;
    } catch {
      // 保留旧文件，重新生成状态
    }
  }

  if (state.schemaVersion < 1) {
    migrateInstallLocation(location);
    state.schemaVersion = 1;
  }

  if (state.schemaVersion < 2) {
    migrateRuntimeLayout(location);
    state.schemaVersion = 2;
  }

  if (state.schemaVersion < 3) {
    migrateWebOperatorConfig(location);
    state.schemaVersion = 3;
  }

  state.appVersion = app.getVersion();
  state.installDir = location.installDir;
  state.runtimeRoot = location.runtimeRoot;
  state.migratedAt = new Date().toISOString();

  writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
}
```

启动时调用：

```ts
app.whenReady().then(() => {
  runDesktopMigrations();
  buildMenu();
  setupIPC();
  createWindow();
});
```

---

# 10. 旧版本迁移规则

## 10.1 检测旧 runtime

旧目录可能存在：

```text
%LOCALAPPDATA%\HermesDesktop\
%LOCALAPPDATA%\Programs\HermesDesktop\
%LOCALAPPDATA%\Programs\Hermes Agent\
```

迁移规则：

```text
1. 不移动 ~/.hermes。
2. 如果旧 runtime/hermes-agent 存在，新 runtime 不存在，则复制到新 runtime。
3. 如果新 runtime/hermes-agent 已存在，不覆盖。
4. 复制前写 migration log。
5. 复制失败不阻塞主程序启动，但设置 Runtime Setup 状态为 warning。
```

## 10.2 旧快捷方式清理

安装器清理：

```text
Desktop:
  Hermes Agent.lnk
  Hermes Desktop.lnk

Start Menu:
  Hermes Agent.lnk
  Hermes Desktop.lnk
```

重建：

```text
SMC Copilot.lnk
```

---

# 11. package.json 调整

```json
{
  "name": "smc-copilot",
  "version": "1.0.0",
  "description": "SMC Copilot Desktop",
  "main": "./out/main/index.js",
  "author": "SMC",
  "homepage": "https://your-internal-site/smc-copilot",
  "scripts": {
    "format": "prettier --write .",
    "lint": "eslint --cache .",
    "test": "vitest run",
    "typecheck:node": "tsc --noEmit -p tsconfig.node.json --composite false",
    "typecheck:web": "tsc --noEmit -p tsconfig.web.json --composite false",
    "typecheck": "npm run typecheck:node && npm run typecheck:web",
    "dev": "electron-vite dev",
    "start": "electron-vite preview",
    "build": "npm run typecheck && electron-vite build",
    "build:win": "npm run build && electron-builder --win nsis",
    "build:win:dir": "npm run build && electron-builder --win --dir",
    "release:win": "npm run build:win",
    "postinstall": "electron-builder install-app-deps"
  }
}
```

版本规则：

```text
1.0.0  首个 SMC Copilot 正式安装身份版本
1.0.1  修复版本
1.1.0  功能版本
1.2.0  多 Profile / WebOperator 大版本
```

---

# 12. 发布包命名

```text
smc-copilot-1.0.0-setup.exe
smc-copilot-1.0.1-setup.exe
smc-copilot-1.1.0-setup.exe
```

更新源目录：

```text
https://your-internal-update-server/smc-copilot/
  latest.yml
  smc-copilot-1.0.0-setup.exe
  smc-copilot-1.0.1-setup.exe
  smc-copilot-1.1.0-setup.exe
```

---

# 13. Cursor 执行任务

## Task 1：固定 SMC Copilot 应用身份

修改：

```text
electron-builder.yml
package.json
src/main/index.ts
```

要求：

```text
1. appId = com.smc.copilot
2. productName = SMC Copilot
3. executableName = smc-copilot
4. app.name = SMC Copilot
5. AppUserModelId = com.smc.copilot
```

验收：

```text
安装后任务栏、快捷方式、卸载项均显示 SMC Copilot。
```

---

## Task 2：实现 assisted installer 覆盖升级

新增：

```text
build/installer.nsh
```

要求：

```text
1. oneClick=false
2. allowToChangeInstallationDirectory=true
3. 固定 nsis.guid
4. 读取旧 InstallLocation
5. 升级时复用旧目录
6. 写入 HKCU\Software\SMC\Copilot
7. 创建 $INSTDIR\bin
8. PATH 幂等写入 $INSTDIR\bin
```

验收：

```text
1. 安装 1.0.0 到 D:\SMC\Copilot。
2. 安装 1.0.1。
3. 安装器默认目录仍为 D:\SMC\Copilot。
4. PATH 只有一条 D:\SMC\Copilot\bin。
```

---

## Task 3：运行时目录迁移

新增：

```text
src/main/enterprise/windows/install-location.ts
src/main/enterprise/windows/shim-writer.ts
src/main/migrations/migration-runner.ts
```

修改：

```text
src/main/enterprise/windows/path-resolver.ts
src/main/installer.ts
```

要求：

```text
1. hermes-agent 安装到 $INSTDIR\runtime\hermes-agent。
2. 不再强制写入 %LOCALAPPDATA%\HermesDesktop\hermes-agent。
3. dev 模式不受影响。
4. packaged 模式优先读取 HKCU\Software\SMC\Copilot。
```

验收：

```text
安装到 D:\SMC\Copilot 后：
  D:\SMC\Copilot\runtime\hermes-agent 存在
  D:\SMC\Copilot\bin\hermes.cmd 存在
  ~/.hermes 不丢失
```

---

## Task 4：自动更新前释放运行时进程

新增：

```text
src/main/update/update-lifecycle.ts
```

修改：

```text
src/main/index.ts
```

要求：

```text
1. install-update 前调用 prepareForAppUpdate。
2. 停止 gateway。
3. 停止 profile runtime。
4. 停止 browser tool server。
5. 停止 claw3d。
```

验收：

```text
自动更新时没有文件占用错误。
```

---

## Task 5：旧 Hermes Desktop 兼容迁移

新增：

```text
src/main/migrations/legacy-hermes-migration.ts
```

要求：

```text
1. 检测旧注册表。
2. 检测旧默认目录。
3. 保留 ~/.hermes。
4. 旧 runtime 只在新 runtime 不存在时复制。
5. 写入 migration log。
```

验收：

```text
旧版 Hermes Agent 已安装时，安装 SMC Copilot 后不会丢失 profiles / skills / config。
```

---

# 14. 测试矩阵

## 14.1 首次安装

```text
系统：Windows 10 Home
安装包：smc-copilot-1.0.0-setup.exe
安装目录：D:\SMC\Copilot

验收：
  1. SMC Copilot 可启动
  2. 桌面快捷方式存在
  3. 开始菜单快捷方式存在
  4. D:\SMC\Copilot\bin 存在
  5. User PATH 包含 D:\SMC\Copilot\bin
```

## 14.2 覆盖升级

```text
先安装：1.0.0
再安装：1.0.1

验收：
  1. 安装目录不变
  2. exe 版本变更
  3. runtime 不被删除
  4. ~/.hermes 不被删除
  5. PATH 不重复
```

## 14.3 自动更新

```text
当前版本：1.0.0
更新版本：1.0.1
更新源：generic provider

验收：
  1. 检测到更新
  2. 下载成功
  3. quitAndInstall 成功
  4. 启动后版本为 1.0.1
  5. Gateway 可重新启动
```

## 14.4 旧版本迁移

```text
旧版：Hermes Agent / Hermes Desktop
新版：SMC Copilot

验收：
  1. 新版不新建第二套无关 runtime
  2. ~/.hermes 数据保留
  3. 旧快捷方式被清理
  4. 新快捷方式为 SMC Copilot
```

---

# 15. 发布冻结项

首个正式版本发布前确认并冻结：

```text
appId: com.smc.copilot
productName: SMC Copilot
executableName: smc-copilot
nsis.guid: 7D7C5222-4F0C-4BD0-B877-6D62ED5B941A
默认安装模式: per-user
默认 PATH: User PATH
默认 runtime: $INSTDIR\runtime
默认 hermes-agent: $INSTDIR\runtime\hermes-agent
```

以上字段冻结后，后续版本只修改：

```text
package.json version
release notes
应用代码
migration 脚本
默认配置模板
```
