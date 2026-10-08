; El backend corre con el mismo ejecutable (ELECTRON_RUN_AS_NODE), así que basta una regla
; por programa. Solo redes privadas y de dominio: en una red pública (Wi-Fi de un centro
; comercial, por ejemplo) el servidor no queda expuesto.
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Karbon POS"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Karbon POS" dir=in action=allow program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" enable=yes profile=private,domain'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Karbon POS"'
!macroend
