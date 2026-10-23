; Copy templates before the old uninstaller removes the installation directory.
; This also protects the first update from versions which saved templates there.
!macro customInit
  Push $R0
  StrCpy $R0 "$INSTDIR\zpl_templates"
  IfFileExists "$R0\*.zpl" backup_templates 0
  IfFileExists "$R0\*.txt" backup_templates backup_done
  backup_templates:
    CreateDirectory "$APPDATA\MATZ Label Print App\template-upgrade-backup"
    ClearErrors
    IfFileExists "$R0\*.zpl" 0 backup_txt
    CopyFiles /SILENT "$R0\*.zpl" "$APPDATA\MATZ Label Print App\template-upgrade-backup"
    IfErrors backup_failed
  backup_txt:
    ClearErrors
    IfFileExists "$R0\*.txt" 0 backup_done
    CopyFiles /SILENT "$R0\*.txt" "$APPDATA\MATZ Label Print App\template-upgrade-backup"
    IfErrors backup_failed backup_done
  backup_failed:
    MessageBox MB_OK|MB_ICONSTOP "Unable to back up label templates. Update cancelled to protect your files."
    Abort
  backup_done:
  Pop $R0
!macroend
