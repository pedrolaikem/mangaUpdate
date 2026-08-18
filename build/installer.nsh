!ifndef BUILD_UNINSTALLER

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Var FinishDialog
Var CheckDesktop
Var CheckTaskbar
Var CheckRun
Var CheckDesktopState
Var CheckTaskbarState
Var CheckRunState

!macro customFinishPage
  Page custom ShowCustomFinishPage LeaveCustomFinishPage
!macroend

Function ShowCustomFinishPage
  nsDialogs::Create 1018
  Pop $FinishDialog
  ${If} $FinishDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "Manga Update foi instalado.$\r$\nSelecione as opcoes desejadas e clique em Concluir."

  ${NSD_CreateCheckbox} 0 40u 100% 12u "Criar atalho na area de trabalho"
  Pop $CheckDesktop
  ${NSD_Check} $CheckDesktop

  ${NSD_CreateCheckbox} 0 56u 100% 12u "Fixar Manga Update na barra de tarefas"
  Pop $CheckTaskbar
  ${NSD_Check} $CheckTaskbar

  ${NSD_CreateCheckbox} 0 72u 100% 12u "Executar Manga Update"
  Pop $CheckRun
  ${NSD_Check} $CheckRun

  nsDialogs::Show
FunctionEnd

Function LeaveCustomFinishPage
  ${NSD_GetState} $CheckDesktop $CheckDesktopState
  ${NSD_GetState} $CheckTaskbar $CheckTaskbarState
  ${NSD_GetState} $CheckRun $CheckRunState

  ${If} $CheckDesktopState == ${BST_CHECKED}
    CreateShortcut "$DESKTOP\${PRODUCT_FILENAME}.lnk" "$INSTDIR\${APP_FILENAME}.exe" "" "$INSTDIR\${APP_FILENAME}.exe" 0
  ${EndIf}

  ${If} $CheckTaskbarState == ${BST_CHECKED}
    Call PinAppToTaskbar
  ${EndIf}

  ${If} $CheckRunState == ${BST_CHECKED}
    Exec '"$INSTDIR\${APP_FILENAME}.exe"'
  ${EndIf}
FunctionEnd

Function PinAppToTaskbar
  FileOpen $0 "$TEMP\pin.ps1" w
  FileWrite $0 '$$shell = New-Object -COM "Shell.Application"$\r$\n'
  FileWrite $0 '$$appPath = "$INSTDIR\${APP_FILENAME}.exe"$\r$\n'
  FileWrite $0 '$$verb = "Pin to Taskbar"$\r$\n'
  FileWrite $0 '$$folder = $$shell.Namespace([System.IO.Path]::GetDirectoryName($$appPath))$\r$\n'
  FileWrite $0 '$$file = $$folder.ParseName([System.IO.Path]::GetFileName($$appPath))$\r$\n'
  FileWrite $0 '$$verbs = $$file.Verbs()$\r$\n'
  FileWrite $0 'foreach ($$v in $$verbs) {$\r$\n'
  FileWrite $0 '  if($$v.Name.Replace("&","") -eq $$verb) {$\r$\n'
  FileWrite $0 '    $$v.DoIt()$\r$\n'
  FileWrite $0 '  }$\r$\n'
  FileWrite $0 '}$\r$\n'
  FileClose $0

  ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$TEMP\pin.ps1"'
  Delete "$TEMP\pin.ps1"
FunctionEnd

!endif
