@ECHO OFF
@SETLOCAL EnableDelayedExpansion

:: Delete node_modules
RMDIR /S /Q "%~dp0node_modules"

:: Delete package-lock.json
DEL /F /Q "%~dp0package-lock.json"

@ECHO Cleanup complete!
PAUSE