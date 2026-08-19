; Default install directory for SMC-Copilot.
; Keep an existing InstallLocation (upgrades). Fresh install prefers
; D:\Programs\SMC\Copilot and falls back to $PROGRAMFILES\SMC\Copilot.
; Search order: 64 HKLM, 64 HKCU, 32 HKLM, 32 HKCU, then legacy identity.
!include "LogicLib.nsh"

!define SMC_LEGACY_APP_ID "com.nousresearch.hermes"
!define SMC_LEGACY_INSTALL_KEY "Software\${SMC_LEGACY_APP_ID}"
!define SMC_LEGACY_UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${SMC_LEGACY_APP_ID}"

!macro SMC_TryCurrentInstallLocation hive
  ${If} $0 == ""
    ReadRegStr $1 ${hive} "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${If} $1 != ""
      ${If} ${FileExists} "$1"
        StrCpy $0 $1
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

!macro SMC_TryLegacyInstallLocation hive
  ${If} $0 == ""
    ReadRegStr $1 ${hive} "${SMC_LEGACY_INSTALL_KEY}" InstallLocation
    ${If} $1 != ""
      ${If} ${FileExists} "$1"
        StrCpy $0 $1
      ${EndIf}
    ${EndIf}
  ${EndIf}
  ${If} $0 == ""
    ReadRegStr $1 ${hive} "${SMC_LEGACY_UNINSTALL_KEY}" InstallLocation
    ${If} $1 != ""
      ${If} ${FileExists} "$1"
        StrCpy $0 $1
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

!macro SMC_UninstallLegacyIfPresent hive
  ReadRegStr $R7 ${hive} "${SMC_LEGACY_UNINSTALL_KEY}" UninstallString
  ReadRegStr $R8 ${hive} "${SMC_LEGACY_UNINSTALL_KEY}" InstallLocation
  ${If} $R7 != ""
    ${If} $R8 != "$INSTDIR"
      ExecWait '$R7 /S'
    ${EndIf}
  ${EndIf}
!macroend

!macro preInit
  StrCpy $0 ""

  SetRegView 64
  !insertmacro SMC_TryCurrentInstallLocation HKLM
  !insertmacro SMC_TryCurrentInstallLocation HKCU

  SetRegView 32
  !insertmacro SMC_TryCurrentInstallLocation HKLM
  !insertmacro SMC_TryCurrentInstallLocation HKCU

  SetRegView 64
  !insertmacro SMC_TryLegacyInstallLocation HKLM
  !insertmacro SMC_TryLegacyInstallLocation HKCU

  SetRegView 32
  !insertmacro SMC_TryLegacyInstallLocation HKLM
  !insertmacro SMC_TryLegacyInstallLocation HKCU

  ${If} $0 == ""
    ${If} ${FileExists} "D:\"
      StrCpy $0 "D:\Programs\SMC\Copilot"
    ${Else}
      StrCpy $0 "$PROGRAMFILES\SMC\Copilot"
    ${EndIf}
  ${EndIf}

  SetRegView 64
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$0"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$0"
!macroend

!macro customInstall
  SetRegView 64
  !insertmacro SMC_UninstallLegacyIfPresent HKCU
  !insertmacro SMC_UninstallLegacyIfPresent HKLM
  SetRegView 32
  !insertmacro SMC_UninstallLegacyIfPresent HKCU
  !insertmacro SMC_UninstallLegacyIfPresent HKLM
  SetRegView 64
!macroend
