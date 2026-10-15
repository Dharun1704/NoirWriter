#!/bin/sh
# NoirWrite for macOS and Linux: double-click this file (macOS) or run ./NoirWriter.command.
# Keep the window open while you write; close it to stop NoirWrite.
cd "$(dirname "$0")" || exit 1

if command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  echo "Python 3 was not found. Install it from https://www.python.org/downloads/"
  echo "Press Enter to close this window."
  read -r _
  exit 1
fi

echo "Starting NoirWrite... keep this window open while you write."
echo "Close this window to stop NoirWrite."
echo
"$PY" server.py
