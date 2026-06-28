!macro preInit
    # Force kill any running instances of the app to avoid file locking issues during installation
    nsExec::Exec 'taskkill /F /IM "ot-manager.exe" /T'
!macroend

!macro customUnInit
    # Force kill any running instances of the app to avoid file locking issues during uninstallation
    nsExec::Exec 'taskkill /F /IM "ot-manager.exe" /T'
!macroend

!macro customInstall
    # Extract the public certificate to a temporary directory
    File "/oname=$PLUGINSDIR\certificate.cer" "${BUILD_RESOURCES_DIR}\certificate.cer"
    # Import the certificate into Trusted Root and Trusted Publishers stores
    nsExec::Exec 'certutil -addstore -f "Root" "$PLUGINSDIR\certificate.cer"'
    nsExec::Exec 'certutil -addstore -f "TrustedPublisher" "$PLUGINSDIR\certificate.cer"'
!macroend
