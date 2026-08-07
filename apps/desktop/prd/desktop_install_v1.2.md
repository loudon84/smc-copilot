## 结论

你们当前 `ai-os-desktop / hermes-desktop` 源码已经具备 **Electron 内部安装 hermes-agent 的基础能力**，但还没有完成“标准 Windows 安装器级别”的能力。

当前缺口集中在 4 个点：

1. **NSIS 仍是 oneClick 模式**，用户不能选择安装目录。当前 `electron-builder.yml` 中 `nsis.oneClick: true`、`perMachine: false`，没有启用 assisted installer，也没有 `allowToChangeInstallationDirectory` 和 `include` 自定义脚本。
2. **Windows runtime 路径仍硬编码到 `%LOCALAPPDATA%`**，例如 `HermesDesktop/hermes-agent`、`Programs/HermesDesktop` 等，没有基于用户选择的安装目录动态解析。
3. **本地 zip / git clone 安装 hermes-agent 已经有主逻辑**，`UserSourceType` 已支持 `local-zip` 和 `git-clone`，并且有解压、clone、pyproject/setup.py 校验。
4. **Renderer / Main IPC 已经打通**，`start-install-with-source`、`show-open-dialog` 已经暴露，说明“安装源选择 UI”更适合放在 Electron 首次运行向导，而不是强行塞进 NSIS。 

---

# 1. NSIS assisted installer 改造点

Electron Builder 官方 NSIS 配置里，`oneClick: false` 就是切换到 assisted installer；官方文档也明确“允许用户配置 user/machine 安装需要切到 assisted installer”。([electron.build][1])
`allowToChangeInstallationDirectory` 是 assisted installer 专用配置，用于允许用户选择安装目录，默认值是 `false`。([electron.build][1])
`include` 可以指定自定义 NSIS 脚本，默认会找 `build/installer.nsh`。([electron.build][1])

## 建议修改 `electron-builder.yml`

```yaml
win:
  executableName: smc-ai-copilot
  target:
    - target: nsis
      arch:
        - x64

nsis:
  artifactName: ${productName}-${version}-setup.${ext}
  shortcutName: ${productName}
  uninstallDisplayName: ${productName}

  # 关键：从一键安装切换为标准向导安装
  oneClick: false

  # 关键：允许用户选择安装目录
  allowToChangeInstallationDirectory: true

  # 公司 Windows 10 Home 场景建议默认当前用户安装
  perMachine: false
  selectPerMachineByDefault: false

  # 标准 Windows 程序入口
  createDesktopShortcut: always
  createStartMenuShortcut: true

  # 自定义 NSIS 脚本：PATH、注册表、初始化目录
  include: build/installer.nsh

  # 可选：安装器视觉资源
  installerIcon: build/icon.ico
  uninstallerIcon: build/icon.ico
  installerSidebar: build/installerSidebar.bmp
```

---

# 2. PATH 写入方案

不要直接用简单字符串拼接改 PATH。NSIS Wiki 明确提示，普通 EnvVarUpdate 方式在 PATH 很长时可能触发 `${NSIS_MAX_STRLEN}` 截断/损坏风险，并建议处理 PATH 时使用 EnVar 插件。([NSIS Wiki][2])
`GsNSIS/EnVar` 插件提供环境变量检查、添加、删除、更新能力，并支持 HKCU / HKLM。([GitHub][3])

## 推荐策略

Windows 10 Home 内网电脑场景，默认用：

```text
HKCU PATH
```

不要默认写 HKLM PATH，避免管理员权限、UAC、杀软拦截、域策略问题。

PATH 中不要直接写 hermes-agent 的 venv 路径，因为 venv 是后置安装生成的。应写一个稳定 shim 目录：

```text
%LOCALAPPDATA%\HermesDesktop\bin
```

或在“安装到 hermes-desktop 目录”的模式下写：

```text
$INSTDIR\bin
```

该目录内放：

```text
hermes.cmd
hermes-desktop.cmd
ai-os-desktop.cmd
```

`hermes.cmd` 内容由 Electron 首次初始化后生成：

```bat
@echo off
set HERMES_HOME=%USERPROFILE%\.hermes
"%~dp0..\runtime\hermes-agent\venv\Scripts\hermes.exe" %*
```

---

# 3. 新增 `build/installer.nsh`

推荐采用 **NSIS 自定义 include + EnVar 插件或 AddToPath_safe fallback**。

目录结构：

```text
build/
  installer.nsh
  icon.ico
  installerSidebar.bmp
  nsis/
    Plugins/
      x86-unicode/
        EnVar.dll
      x86-ansi/
        EnVar.dll
    Include/
      AddToPathSafe.nsh
```

## `build/installer.nsh` 样例

```nsh
!include LogicLib.nsh
!include WinMessages.nsh

!macro preInit
  SetRegView 64
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$LOCALAPPDATA\Programs\HermesDesktop"
  SetRegView 32
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$LOCALAPPDATA\Programs\HermesDesktop"
!macroend

!macro customInstall
  DetailPrint "Preparing Hermes Desktop runtime directories..."

  CreateDirectory "$INSTDIR\bin"
  CreateDirectory "$INSTDIR\runtime"
  CreateDirectory "$INSTDIR\runtime\logs"
  CreateDirectory "$INSTDIR\runtime\downloads"
  CreateDirectory "$INSTDIR\runtime\cache"

  FileOpen $0 "$INSTDIR\bin\hermes-desktop.cmd" w
  FileWrite $0 "@echo off$\r$\n"
  FileWrite $0 '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" %*$\r$\n'
  FileClose $0

  FileOpen $1 "$INSTDIR\bin\hermes.cmd" w
  FileWrite $1 "@echo off$\r$\n"
  FileWrite $1 'set HERMES_HOME=%USERPROFILE%\.hermes$\r$\n'
  FileWrite $1 '"$INSTDIR\runtime\hermes-agent\venv\Scripts\hermes.exe" %*$\r$\n'
  FileClose $1

  DetailPrint "Adding Hermes Desktop bin directory to user PATH..."

  EnVar::SetHKCU
  EnVar::AddValue "PATH" "$INSTDIR\bin"
  Pop $2
  DetailPrint "EnVar::AddValue PATH result: $2"

  System::Call 'user32::SendMessageTimeout(i 0xffff, i ${WM_SETTINGCHANGE}, i 0, t "Environment", i 0, i 5000, *i .r0)'

  WriteRegExpandStr HKCU "Software\SMC\CopilotSMC" "InstallLocation" "$INSTDIR"
  WriteRegExpandStr HKCU "Software\SMC\CopilotSMC" "RuntimeRoot" "$INSTDIR\runtime"
  WriteRegExpandStr HKCU "Software\SMC\CopilotSMC" "BinDir" "$INSTDIR\bin"
!macroend

!macro customUnInstall
  DetailPrint "Removing Hermes Desktop bin directory from user PATH..."

  EnVar::SetHKCU
  EnVar::DeleteValue "PATH" "$INSTDIR\bin"
  Pop $3
  DetailPrint "EnVar::DeleteValue PATH result: $3"

  DeleteRegKey HKCU "Software\SMC\CopilotSMC"
!macroend
```

---

# 4. Electron 源码需要补的模块

## 4.1 新增 Windows 安装目录解析

当前 `path-resolver.ts` 主要基于 `%LOCALAPPDATA%` 推导 runtime 路径。
要支持用户选择安装目录，需要新增：

```text
src/main/enterprise/windows/install-location.ts
```

职责：

```ts
export interface DesktopInstallLocation {
  installDir: string
  runtimeRoot: string
  binDir: string
  agentDir: string
  source: "registry" | "process-exec-path" | "dev-default"
}
```

解析顺序：

```text
1. HERMES_DESKTOP_INSTALL_DIR 环境变量
2. HKCU\Software\SMC\CopilotSMC\InstallLocation
3. dirname(process.execPath)
4. dev 模式 fallback：%LOCALAPPDATA%\Programs\HermesDesktop
```

然后把 `getDesktopAgentDir()` 从：

```ts
return join(localAppData, "HermesDesktop", "hermes-agent")
```

调整为：

```ts
return join(getRuntimeRoot(), "hermes-agent")
```

目标路径变为：

```text
$INSTDIR\runtime\hermes-agent
$INSTDIR\runtime\logs
$INSTDIR\runtime\cache
$INSTDIR\runtime\downloads
$INSTDIR\bin
```

---

## 4.2 修正 git clone / unzip 的命令执行安全

当前 `installHermesAgentFromUserSource()` 已经支持 `local-zip` 和 `git-clone`。
但这里有一个需要修正的工程问题：

```ts
execSync(`git ${cloneArgs.join(" ")}`, ...)
```

这会把用户输入的 git URL / branch 拼进 shell 字符串。应改成：

```ts
import { execFileSync } from "node:child_process"

execFileSync("git", cloneArgs, {
  encoding: "utf-8",
  timeout: 300000,
  env: process.env as Record<string, string>,
})
```

PowerShell 解压也建议从：

```ts
execSync(`powershell -ExecutionPolicy Bypass -Command "Expand-Archive -Path '${zipPath}' ...`)
```

改为：

```ts
execFileSync("powershell", [
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-Command",
  "Expand-Archive",
  "-LiteralPath", zipPath,
  "-DestinationPath", targetDir,
  "-Force",
], {
  encoding: "utf-8",
  timeout: 300000,
})
```

原因：Windows 路径、中文路径、空格路径、单引号路径都更安全。

---

## 4.3 安装源选择不建议放 NSIS，建议放首次运行向导

虽然可以用 NSIS `nsDialogs` 做自定义页面，但这里不推荐把 git clone、zip 选择、Python venv、pip install 放进 NSIS 安装器。

原因：

```text
1. Git 私有仓库认证复杂，NSIS 不适合处理 token、ssh key、代理、证书。
2. pip install 日志很长，NSIS UI 展示和失败恢复能力弱。
3. 你们源码里 Electron IPC 已经有 start-install-with-source。
4. Main 里 runInstallWithSource 已经有完整 4 步安装流程。
```

`runInstallWithSource()` 已经包含：安装源码、创建 Python venv、安装 Python 依赖、生成 `.env`。

推荐流程改为：

```text
NSIS 安装器：
  1. 选择安装目录
  2. 写入 HKCU PATH
  3. 创建 $INSTDIR\bin 和 $INSTDIR\runtime
  4. 安装 Electron App
  5. 完成后启动 Electron

Electron 首次运行向导：
  1. 检测 hermes-agent 是否存在
  2. 选择 local-zip / git-clone
  3. 输入 git url / branch / shallow clone
  4. 选择本地 zip
  5. 调用 startInstallWithSource
  6. 展示 install-progress
  7. 完成后生成 hermes.cmd shim
```

---

# 5. 需要新增的文件清单

```text
build/
  installer.nsh
  nsis/
    Plugins/
      x86-unicode/
        EnVar.dll
    Include/
      AddToPathSafe.nsh

src/main/enterprise/windows/
  install-location.ts
  path-manager.ts
  shim-writer.ts

src/renderer/src/components/install/
  FirstRunInstallWizard.tsx
  AgentSourceSelector.tsx
  GitSourceForm.tsx
  LocalZipSourceForm.tsx
  InstallProgressPanel.tsx

src/shared/install/
  agent-source.schema.ts
```

---

# 6. 推荐数据结构

```ts
export type AgentSourceType = "local-zip" | "git-clone"

export interface AgentSourceConfig {
  sourceType: AgentSourceType
  localZipPath?: string
  gitUrl?: string
  gitBranch?: string
  gitShallow?: boolean
}

export interface DesktopRuntimeConfig {
  installDir: string
  runtimeRoot: string
  binDir: string
  agentDir: string
  hermesHome: string
  addToPath: boolean
  agentSource?: AgentSourceConfig
}
```

本地保存位置：

```text
$INSTDIR\runtime\desktop-runtime.json
```

内容示例：

```json
{
  "installDir": "D:\\AIOS\\HermesDesktop",
  "runtimeRoot": "D:\\AIOS\\HermesDesktop\\runtime",
  "binDir": "D:\\AIOS\\HermesDesktop\\bin",
  "agentDir": "D:\\AIOS\\HermesDesktop\\runtime\\hermes-agent",
  "hermesHome": "C:\\Users\\user\\.hermes",
  "addToPath": true,
  "agentSource": {
    "sourceType": "git-clone",
    "gitUrl": "http://git.superic.com/aiplatform/hermes-agent.git",
    "gitBranch": "main",
    "gitShallow": true
  }
}
```

---

# 7. Cursor 执行任务拆分

## Task 1：切换 NSIS assisted installer

修改：

```text
electron-builder.yml
build/installer.nsh
```

验收：

```text
1. Windows 安装器不再是一键安装。
2. 安装过程中可选择目录。
3. 安装后开始菜单 / 桌面快捷方式正常。
4. HKCU PATH 包含 $INSTDIR\bin。
5. 卸载后 PATH 移除 $INSTDIR\bin。
```

## Task 2：安装路径从 LocalAppData 改为 InstallDir runtime

修改：

```text
src/main/enterprise/windows/path-resolver.ts
src/main/enterprise/windows/install-location.ts
```

验收：

```text
1. 用户安装到 D:\AIOS\HermesDesktop 时，hermes-agent 位于 D:\AIOS\HermesDesktop\runtime\hermes-agent。
2. 不再强制写入 %LOCALAPPDATA%\HermesDesktop\hermes-agent。
3. dev 模式不受影响。
```

## Task 3：强化 hermes-agent source installer

修改：

```text
src/main/enterprise/hermes-agent-source-installer.ts
src/main/installer.ts
```

验收：

```text
1. local zip 支持中文路径、空格路径。
2. git clone 使用 execFileSync，不再拼 shell 命令。
3. git branch / git url 做基础校验。
4. clone 失败、zip 解压失败、pyproject 缺失均有明确错误码。
```

## Task 4：首次运行安装向导

修改：

```text
src/renderer/src/components/install/*
src/preload/index.ts
src/main/index.ts
```

验收：

```text
1. 首次启动时自动检测 hermes-agent。
2. 未安装时进入安装向导。
3. 支持 local zip / git clone 两种来源。
4. 安装进度复用 install-progress。
5. 安装完成后自动执行 verifyInstall。
```

---

# 8. 两个需要确认的实现分歧

## 分歧 A：hermes-agent 是否必须安装到 `$INSTDIR`

推荐：

```text
$INSTDIR\runtime\hermes-agent
```

前提：

```text
默认 perMachine: false
默认安装到用户可写目录
```

不推荐安装到：

```text
C:\Program Files\...
```

原因是后续 `git pull / pip install / venv 更新 / profile 写入` 都需要写权限。

## 分歧 B：安装源选择放 NSIS 还是 Electron 首次运行

推荐：

```text
Electron 首次运行向导
```

不推荐：

```text
NSIS 自定义页面直接做 git clone / unzip / pip install
```

NSIS 只负责标准 Windows 安装器能力：目录选择、快捷方式、PATH、注册表、卸载清理。Hermes Agent 的源码下载、依赖安装、Profile 初始化应交给 Electron Runtime。

[1]: https://www.electron.build/nsis.html "NSIS - electron-builder"
[2]: https://nsis.sourceforge.io/Environmental_Variables%3A_append%2C_prepend%2C_and_remove_entries "Environmental Variables: append, prepend, and remove entries - NSIS"
[3]: https://github.com/GsNSIS/EnVar "GitHub - GsNSIS/EnVar: EnVar plugin for NSIS · GitHub"
