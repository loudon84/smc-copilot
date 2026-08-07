!pragma warning disable 6001
!pragma warning disable 6010

!include LogicLib.nsh
!include WinMessages.nsh
!include "nsis\Include\AddToPathSafe.nsh"
!include "nsis\Include\RuntimePrecheck.nsh"

!define SMC_COPILOT_REG_KEY "Software\SMC\copilot"
!define SMC_COPILOT_LEGACY_REG_KEY "Software\SMC\Copilot"
!define SMC_COPILOT_DEFAULT_DIR "$LOCALAPPDATA\Programs\SMC-Copilot"

Var ExistingInstallDir
Var RuntimeRoot
Var BinDir
Var LegacyInstallDir
Var PreviousAppVersion

!macro preInit
  SetRegView 64

  ; 1. Primary normalized registry (HKCU)
  ReadRegStr $ExistingInstallDir HKCU "${SMC_COPILOT_REG_KEY}" "InstallLocation"

  ; 2. Primary normalized registry (HKLM)
  ${If} $ExistingInstallDir == ""
    ReadRegStr $ExistingInstallDir HKLM "${SMC_COPILOT_REG_KEY}" "InstallLocation"
  ${EndIf}

  ; 3. Legacy SMC Copilot registry (record only, do not reuse as INSTDIR)
  ReadRegStr $LegacyInstallDir HKCU "${SMC_COPILOT_LEGACY_REG_KEY}" "InstallLocation"

  ; 4. Legacy CopilotSMC
  ${If} $LegacyInstallDir == ""
    ReadRegStr $LegacyInstallDir HKCU "Software\SMC\CopilotSMC" "InstallLocation"
  ${EndIf}

  ; 5. Legacy HermesDesktop
  ${If} $LegacyInstallDir == ""
    ReadRegStr $LegacyInstallDir HKCU "Software\SMC\HermesDesktop" "InstallLocation"
  ${EndIf}

  ; 6. Legacy com.nousresearch.hermes uninstall entry
  ${If} $LegacyInstallDir == ""
    ReadRegStr $LegacyInstallDir HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.nousresearch.hermes" "InstallLocation"
  ${EndIf}

  ; 7. Default first-install directory (no spaces)
  ${If} $ExistingInstallDir == ""
    StrCpy $ExistingInstallDir "${SMC_COPILOT_DEFAULT_DIR}"
  ${EndIf}

  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$ExistingInstallDir"
  SetRegView 32
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$ExistingInstallDir"

  StrCpy $INSTDIR "$ExistingInstallDir"
!macroend

!macro customInit
  ; --- Blocking checks ---

  ; VC++ Runtime: block if missing and user refuses install
  !insertmacro EnsureVCRuntime

  ; --- Non-blocking advisory checks (logged, not blocking) ---
  ; Git/Python/uv status and port check are written to precheck JSON
  ; in customInstall after $INSTDIR is finalized.
!macroend

!macro customInstall
  DetailPrint "Preparing SMC-Copilot upgrade-safe directories..."

  StrCpy $RuntimeRoot "$INSTDIR\runtime"
  StrCpy $BinDir "$INSTDIR\bin"

  ; Read previous version for upgrade tracking (primary then legacy)
  ReadRegStr $PreviousAppVersion HKCU "${SMC_COPILOT_REG_KEY}" "AppVersion"
  ${If} $PreviousAppVersion == ""
    ReadRegStr $PreviousAppVersion HKCU "${SMC_COPILOT_LEGACY_REG_KEY}" "AppVersion"
  ${EndIf}

  CreateDirectory "$INSTDIR\bin"
  CreateDirectory "$INSTDIR\runtime"
  CreateDirectory "$INSTDIR\runtime\hermes-agent"
  CreateDirectory "$INSTDIR\runtime\logs"
  CreateDirectory "$INSTDIR\runtime\cache"
  CreateDirectory "$INSTDIR\runtime\downloads"
  CreateDirectory "$INSTDIR\runtime\copilot-serve"
  CreateDirectory "$INSTDIR\runtime\copilot-serve-cache"

  ; Deploy copilot-serve script (team_v1.7)
  SetOutPath "$INSTDIR\runtime"
  File "${BUILD_RESOURCES_DIR}\scripts\deploy-copilot-serve.ps1"

  ; Run precheck and write installer-precheck.json + install log
  DetailPrint "Running environment precheck..."
  !insertmacro RunRuntimePrecheck "$INSTDIR"

  ; Primary desktop launcher shim
  FileOpen $0 "$INSTDIR\bin\desktop.cmd" w
  FileWrite $0 "@echo off$\r$\n"
  FileWrite $0 '"%~dp0..\desktop.exe" %*$\r$\n'
  FileClose $0

  ; Alias shims (compat)
  FileOpen $0 "$INSTDIR\bin\smc-copilot.cmd" w
  FileWrite $0 "@echo off$\r$\n"
  FileWrite $0 '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" %*$\r$\n'
  FileClose $0

  FileOpen $0 "$INSTDIR\bin\hermes-desktop.cmd" w
  FileWrite $0 "@echo off$\r$\n"
  FileWrite $0 '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" %*$\r$\n'
  FileClose $0

  ; Hermes CLI placeholder (refreshed by Electron ensureShims after agent install)
  FileOpen $1 "$INSTDIR\bin\hermes.cmd" w
  FileWrite $1 "@echo off$\r$\n"
  FileWrite $1 "set HERMES_HOME=%USERPROFILE%\.hermes$\r$\n"
  FileWrite $1 'set SMC_COPILOT_HOME=%~dp0..$\r$\n'
  FileWrite $1 '"%SMC_COPILOT_HOME%\runtime\hermes-agent\venv\Scripts\hermes.exe" %*$\r$\n'
  FileClose $1

  ; desktop-runtime.json (hybrid identity) — preserve on upgrade
  IfFileExists "$INSTDIR\runtime\desktop-runtime.json" skip_desktop_runtime_json 0
    FileOpen $2 "$INSTDIR\runtime\desktop-runtime.json" w
    FileWrite $2 '{$\r$\n'
    FileWrite $2 '  "productName": "SMC-Copilot",$\r$\n'
    FileWrite $2 '  "appId": "com.smc.smc-ai-copilot",$\r$\n'
    FileWrite $2 '  "executableName": "desktop",$\r$\n'
    FileWrite $2 '  "registryKey": "HKCU\\Software\\SMC\\copilot",$\r$\n'
    FileWrite $2 '  "legacyProductNames": ["SMC Copilot", "CopilotSMC", "HermesDesktop"],$\r$\n'
    FileWrite $2 '  "installDir": "$INSTDIR",$\r$\n'
    FileWrite $2 '  "runtimeRoot": "$INSTDIR\\runtime",$\r$\n'
    FileWrite $2 '  "binDir": "$INSTDIR\\bin",$\r$\n'
    FileWrite $2 '  "agentDir": "$INSTDIR\\runtime\\hermes-agent",$\r$\n'
    FileWrite $2 '  "copilotServeDir": "$INSTDIR\\runtime\\copilot-serve",$\r$\n'
    FileWrite $2 '  "copilotServeDeployScript": "$INSTDIR\\runtime\\deploy-copilot-serve.ps1",$\r$\n'
    FileWrite $2 '  "copilotServePort": 8765,$\r$\n'
    FileWrite $2 '  "legacyAppIds": ["com.nousresearch.hermes"]$\r$\n'
    FileWrite $2 '}$\r$\n'
    FileClose $2
  skip_desktop_runtime_json:

  WriteRegExpandStr HKCU "${SMC_COPILOT_REG_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegExpandStr HKCU "${SMC_COPILOT_REG_KEY}" "RuntimeRoot" "$INSTDIR\runtime"
  WriteRegExpandStr HKCU "${SMC_COPILOT_REG_KEY}" "BinDir" "$INSTDIR\bin"
  WriteRegStr HKCU "${SMC_COPILOT_REG_KEY}" "AppVersion" "${VERSION}"
  WriteRegStr HKCU "${SMC_COPILOT_REG_KEY}" "InstallMode" "per-user"
  ${If} $PreviousAppVersion != ""
    WriteRegStr HKCU "${SMC_COPILOT_REG_KEY}" "PreviousVersion" "$PreviousAppVersion"
  ${EndIf}
  WriteRegStr HKCU "${SMC_COPILOT_REG_KEY}" "LastUpdatedAt" "${__DATE__} ${__TIME__}"

  !insertmacro AddToPathSafe "$INSTDIR\bin"

  ; Remove legacy shortcuts
  Delete "$DESKTOP\Hermes Agent.lnk"
  Delete "$DESKTOP\Hermes Desktop.lnk"
  Delete "$SMPROGRAMS\Hermes Agent.lnk"
  Delete "$SMPROGRAMS\Hermes Desktop.lnk"

  ; Log install completion (include legacy dir when present)
  FileOpen $3 "$INSTDIR\runtime\logs\nsis-install.log" a
  FileSeek $3 0 END
  FileWrite $3 "[install] version=${VERSION} dir=$INSTDIR date=${__DATE__} ${__TIME__}$\r$\n"
  ${If} $LegacyInstallDir != ""
    FileWrite $3 "[install] legacyDir=$LegacyInstallDir$\r$\n"
  ${EndIf}
  FileClose $3

  System::Call 'user32::SendMessageTimeout(i 0xffff, i ${WM_SETTINGCHANGE}, i 0, t "Environment", i 0, i 5000, *i .r0)'
!macroend

!macro customUnInstall
  ReadRegStr $RuntimeRoot HKCU "${SMC_COPILOT_REG_KEY}" "RuntimeRoot"
  ReadRegStr $BinDir HKCU "${SMC_COPILOT_REG_KEY}" "BinDir"
  DetailPrint "Removing SMC-Copilot from user PATH ($BinDir)..."

  !insertmacro RemoveFromPathSafe "$INSTDIR\bin"

  DeleteRegKey HKCU "${SMC_COPILOT_REG_KEY}"
  DeleteRegKey HKCU "${SMC_COPILOT_LEGACY_REG_KEY}"
  DeleteRegKey HKCU "Software\SMC\CopilotSMC"

  System::Call 'user32::SendMessageTimeout(i 0xffff, i ${WM_SETTINGCHANGE}, i 0, t "Environment", i 0, i 5000, *i .r0)'
!macroend
