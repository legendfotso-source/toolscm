@echo off
REM Double-click this. It runs push-toolscm.ps1 and leaves push-log.txt beside it.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push-toolscm.ps1"
echo.
echo Finished. The result is in push-log.txt
pause
