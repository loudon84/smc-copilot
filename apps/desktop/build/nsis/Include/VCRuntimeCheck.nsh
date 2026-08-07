; VCRuntimeCheck.nsh — Check VC++ 2015-2022 Redistributable (x64)

!ifndef VCRUNTIMECHECK_INCLUDED
!define VCRUNTIMECHECK_INCLUDED

!include LogicLib.nsh

!macro CheckVCRuntime RESULT_VAR
  StrCpy ${RESULT_VAR} "missing"

  ; VC++ 2015-2022 Redistributable registry key (x64)
  SetRegView 64
  ReadRegDWORD $1 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64" "Installed"
  ${If} $1 == 1
    StrCpy ${RESULT_VAR} "pass"
  ${EndIf}

  ; Fallback: check ucrtbase.dll in system32
  ${If} ${RESULT_VAR} == "missing"
    IfFileExists "$SYSDIR\ucrtbase.dll" 0 +2
      StrCpy ${RESULT_VAR} "pass"
  ${EndIf}

  SetRegView 32
!macroend

!macro EnsureVCRuntime
  Var /GLOBAL _vcResult
  !insertmacro CheckVCRuntime $_vcResult

  ${If} $_vcResult == "missing"
    MessageBox MB_YESNO|MB_ICONEXCLAMATION \
      "Microsoft Visual C++ Runtime is required but not detected.$\r$\n$\r$\nWould you like to download and install it now?" \
      IDYES _vcDownload IDNO _vcSkip

    _vcDownload:
      DetailPrint "Downloading VC++ Runtime..."
      NSISdl::download "https://aka.ms/vs/17/release/vc_redist.x64.exe" "$TEMP\vc_redist.x64.exe"
      Pop $0
      ${If} $0 == "success"
        DetailPrint "Installing VC++ Runtime..."
        ExecWait '"$TEMP\vc_redist.x64.exe" /install /quiet /norestart' $0
        ${If} $0 != 0
          MessageBox MB_OK|MB_ICONSTOP "VC++ Runtime installation failed (exit code: $0).$\r$\nPlease install it manually and retry."
          Abort
        ${EndIf}
        Delete "$TEMP\vc_redist.x64.exe"
      ${Else}
        MessageBox MB_OK|MB_ICONSTOP "Failed to download VC++ Runtime.$\r$\nPlease install it manually and retry."
        Abort
      ${EndIf}
      Goto _vcDone

    _vcSkip:
      MessageBox MB_OK|MB_ICONSTOP "SMC Copilot requires VC++ Runtime. Installation cannot continue."
      Abort

    _vcDone:
  ${EndIf}
!macroend

!endif
