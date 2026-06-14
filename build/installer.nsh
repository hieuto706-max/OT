!macro preInit
    # Force kill any running instances of the app to avoid file locking issues during installation
    nsExec::Exec 'taskkill /F /IM "ot-manager.exe" /T'
!macroend

!macro customUnInit
    # Force kill any running instances of the app to avoid file locking issues during uninstallation
    nsExec::Exec 'taskkill /F /IM "ot-manager.exe" /T'
!macroend
