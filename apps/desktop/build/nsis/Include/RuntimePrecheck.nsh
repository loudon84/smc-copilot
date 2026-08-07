; RuntimePrecheck.nsh — Pre-install environment checks and precheck JSON output

!ifndef RUNTIMEPRECHECK_INCLUDED
!define RUNTIMEPRECHECK_INCLUDED

!include LogicLib.nsh
!include "nsis\Include\VCRuntimeCheck.nsh"

Var _precheckGit
Var _precheckPython
Var _precheckUv
Var _precheckPort
Var _precheckPort8765
Var _precheckWinVer
Var _precheckVcrt

!macro WriteJsonField HANDLE KEY VALUE
  FileWrite ${HANDLE} '  "${KEY}": "${VALUE}",$\r$\n'
!macroend

!macro WriteJsonFieldLast HANDLE KEY VALUE
  FileWrite ${HANDLE} '  "${KEY}": "${VALUE}"$\r$\n'
!macroend

!macro DetectTool TOOL_NAME RESULT_VAR
  nsExec::ExecToStack 'where ${TOOL_NAME}'
  Pop $0
  Pop $1
  ${If} $0 == 0
    StrCpy ${RESULT_VAR} "pass"
  ${Else}
    StrCpy ${RESULT_VAR} "missing"
  ${EndIf}
!macroend

!macro CheckPortAvailable PORT RESULT_VAR
  nsExec::ExecToStack 'netstat -an | findstr ":${PORT} "'
  Pop $0
  Pop $1
  ${If} $0 == 0
    StrCpy ${RESULT_VAR} "occupied"
  ${Else}
    StrCpy ${RESULT_VAR} "available"
  ${EndIf}
!macroend

!macro RunRuntimePrecheck INSTDIR_PATH
  ; Windows version string (e.g. 10.0.19045) from registry
  SetRegView 64
  ReadRegStr $R0 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentVersion"
  ReadRegStr $R1 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentBuildNumber"
  StrCpy $_precheckWinVer $R0
  ${If} $R1 != ""
    StrCpy $_precheckWinVer "$R0.$R1"
  ${EndIf}
  ${If} $_precheckWinVer == ""
    StrCpy $_precheckWinVer "unknown"
  ${EndIf}

  ; VC++ Runtime
  !insertmacro CheckVCRuntime $_precheckVcrt

  ; Git
  !insertmacro DetectTool "git" $_precheckGit

  ; Python
  !insertmacro DetectTool "python" $_precheckPython

  ; uv
  !insertmacro DetectTool "uv" $_precheckUv

  ; Port 8642
  !insertmacro CheckPortAvailable "8642" $_precheckPort

  ; Port 8765 (copilot-serve)
  !insertmacro CheckPortAvailable "8765" $_precheckPort8765

  ; Determine overall result
  Var /GLOBAL _precheckResult
  StrCpy $_precheckResult "pass"
  ${If} $_precheckGit == "missing"
  ${OrIf} $_precheckPython == "missing"
  ${OrIf} $_precheckUv == "missing"
  ${OrIf} $_precheckPort == "occupied"
  ${OrIf} $_precheckPort8765 == "occupied"
    StrCpy $_precheckResult "warning"
  ${EndIf}
  ${If} $_precheckVcrt == "missing"
    StrCpy $_precheckResult "error"
  ${EndIf}

  ; Write installer-precheck.json
  CreateDirectory "${INSTDIR_PATH}\runtime"
  FileOpen $9 "${INSTDIR_PATH}\runtime\installer-precheck.json" w
  FileWrite $9 '{$\r$\n'
  !insertmacro WriteJsonField $9 "schemaVersion" "1.3.1"
  !insertmacro WriteJsonField $9 "windowsVersion" "$_precheckWinVer"
  !insertmacro WriteJsonField $9 "vcRuntime" "$_precheckVcrt"
  !insertmacro WriteJsonField $9 "git" "$_precheckGit"
  !insertmacro WriteJsonField $9 "python" "$_precheckPython"
  !insertmacro WriteJsonField $9 "uv" "$_precheckUv"
  !insertmacro WriteJsonField $9 "port8642" "$_precheckPort"
  !insertmacro WriteJsonField $9 "port8765" "$_precheckPort8765"
  !insertmacro WriteJsonField $9 "installDir" "${INSTDIR_PATH}"
  !insertmacro WriteJsonField $9 "runtimeRoot" "${INSTDIR_PATH}\runtime"
  !insertmacro WriteJsonField $9 "binDir" "${INSTDIR_PATH}\bin"
  !insertmacro WriteJsonFieldLast $9 "result" "$_precheckResult"
  FileWrite $9 '}$\r$\n'
  FileClose $9

  ; Write to install log
  CreateDirectory "${INSTDIR_PATH}\runtime\logs"
  FileOpen $8 "${INSTDIR_PATH}\runtime\logs\nsis-install.log" a
  FileSeek $8 0 END
  FileWrite $8 "[precheck] vcRuntime=$_precheckVcrt git=$_precheckGit python=$_precheckPython uv=$_precheckUv port8642=$_precheckPort port8765=$_precheckPort8765 result=$_precheckResult$\r$\n"
  FileClose $8
!macroend

!endif
