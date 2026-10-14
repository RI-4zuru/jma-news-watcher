@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0collect.ps1"
if errorlevel 1 (
  echo.
  echo [ERROR] News collection failed. Check the message above.
  pause
  exit /b 1
)
echo.
echo Finished. Open site\index.html to view news.
pause
