!macro NSIS_HOOK_POSTUNINSTALL
  RMDir /r "$PROFILE\.config\opencli"
  RMDir /r "$PROFILE\.config\opencli-dev"
  RMDir /r "$APPDATA\com.opencli.app"
  RMDir /r "$LOCALAPPDATA\com.opencli.app"
  RMDir /r "$LOCALAPPDATA\OpenCLI"
!macroend
