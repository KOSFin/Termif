!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCR "Directory\\shell\\TermifHere" "" "Open Termif Here"
  WriteRegStr HKCR "Directory\\shell\\TermifHere" "Icon" "$INSTDIR\\termif.exe"
  WriteRegStr HKCR "Directory\\shell\\TermifHere\\command" "" '"$INSTDIR\\termif.exe" --new-tab "%1"'

  WriteRegStr HKCR "Directory\\shell\\TermifHereWindow" "" "Open Termif Here in New Window"
  WriteRegStr HKCR "Directory\\shell\\TermifHereWindow" "Icon" "$INSTDIR\\termif.exe"
  WriteRegStr HKCR "Directory\\shell\\TermifHereWindow\\command" "" '"$INSTDIR\\termif.exe" --new-window "%1"'

  WriteRegStr HKCR "Directory\\Background\\shell\\TermifHere" "" "Open Termif Here"
  WriteRegStr HKCR "Directory\\Background\\shell\\TermifHere" "Icon" "$INSTDIR\\termif.exe"
  WriteRegStr HKCR "Directory\\Background\\shell\\TermifHere\\command" "" '"$INSTDIR\\termif.exe" --new-tab "%V"'

  WriteRegStr HKCR "Directory\\Background\\shell\\TermifHereWindow" "" "Open Termif Here in New Window"
  WriteRegStr HKCR "Directory\\Background\\shell\\TermifHereWindow" "Icon" "$INSTDIR\\termif.exe"
  WriteRegStr HKCR "Directory\\Background\\shell\\TermifHereWindow\\command" "" '"$INSTDIR\\termif.exe" --new-window "%V"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCR "Directory\\shell\\TermifHere"
  DeleteRegKey HKCR "Directory\\shell\\TermifHereWindow"
  DeleteRegKey HKCR "Directory\\Background\\shell\\TermifHere"
  DeleteRegKey HKCR "Directory\\Background\\shell\\TermifHereWindow"
!macroend
