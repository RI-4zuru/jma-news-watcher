@echo off
cd /d "%~dp0"
title JMA News Watcher - press Ctrl+C to stop
:loop
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0collect.ps1"
if errorlevel 1 (
  echo.
  echo [ERROR] News collection could not run. Check the error above.
  echo [ERROR] Monitor has stopped to avoid silently repeating failures.
  pause
  exit /b 1
)
echo.
echo Checking again in 30 minutes. Close this window to stop.
timeout /t 1800 /nobreak >nul
goto loop
