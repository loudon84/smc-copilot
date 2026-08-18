; Default install directory for SMC-Copilot.
; Keep an existing InstallLocation (upgrades). Fresh install prefers
; D:\Programs\SMC\Copilot and falls back to $PROGRAMFILES\SMC\Copilot.
!include "LogicLib.nsh"

!macro preInit
  SetRegView 64
  ReadRegStr $0 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $0 == ""
    ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${EndIf}
  ${If} $0 == ""
    ${If} ${FileExists} "D:\"
      StrCpy $0 "D:\Programs\SMC\Copilot"
    ${Else}
      StrCpy $0 "$PROGRAMFILES\SMC\Copilot"
    ${EndIf}
  ${EndIf}
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$0"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$0"
!macroend
