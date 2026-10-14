@echo off
title NoirWrite
cd /d "%~dp0"

set "PY="
where python >nul 2>nul && set "PY=python"
if not defined PY where py >nul 2>nul && set "PY=py -3"
if not defined PY (
  echo Python was not found. Install it from https://www.python.org/downloads/
  echo and tick "Add python.exe to PATH" during setup.
  pause
  exit /b 1
)

echo Starting NoirWrite... keep this window open while you write.
echo Close this window to stop NoirWrite.
echo.
%PY% server.py
pause
