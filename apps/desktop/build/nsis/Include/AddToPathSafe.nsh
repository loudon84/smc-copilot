; AddToPathSafe.nsh — HKCU PATH updates without external NSIS plugins

!ifndef ADDTOPATHSAFE_INCLUDED
!define ADDTOPATHSAFE_INCLUDED

!include LogicLib.nsh
!include WordFunc.nsh

!macro _BroadcastEnvironment
  System::Call 'user32::SendMessageTimeout(p 0xffff, i 0x1a, i 0, t "Environment", i 0, i 0, *i .r0)'
!macroend

!macro AddToPathSafe PATH_ADDITION
  ReadRegStr $0 HKCU "Environment" "PATH"
  ${If} $0 == ""
    WriteRegExpandStr HKCU "Environment" "PATH" "${PATH_ADDITION}"
  ${ElseIf} $0 == "${PATH_ADDITION}"
  ${Else}
    StrLen $2 "${PATH_ADDITION}"
    StrCpy $3 0
    AddToPathSafe_loop:
      StrCpy $4 $0 $2 $3
      StrCmp $4 "${PATH_ADDITION}" AddToPathSafe_found
      StrCmp $4 "" AddToPathSafe_append
      IntOp $3 $3 + 1
      Goto AddToPathSafe_loop
    AddToPathSafe_append:
      WriteRegExpandStr HKCU "Environment" "PATH" "$0;${PATH_ADDITION}"
    AddToPathSafe_found:
  ${EndIf}
  !insertmacro _BroadcastEnvironment
!macroend

!macro RemoveFromPathSafe PATH_REMOVAL
  ReadRegStr $0 HKCU "Environment" "PATH"
  ${If} $0 != ""
    ${WordReplace} $0 ";" "${PATH_REMOVAL};" "+" $0
    ${WordReplace} $0 ";" ";${PATH_REMOVAL}" "+" $0
    ${WordReplace} $0 ";" "${PATH_REMOVAL}" "+" $0
    WriteRegExpandStr HKCU "Environment" "PATH" "$0"
    !insertmacro _BroadcastEnvironment
  ${EndIf}
!macroend

!endif
