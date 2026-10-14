@echo off
title NoirWrite tests
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

echo Running NoirWrite's tests. Your own projects are not touched.
echo A browser tab opens for the app checks: keep it in front until it finishes.
echo.
%PY% tests\run_tests.py %*
echo.
pause
