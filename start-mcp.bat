@echo off
setlocal
cd /d "%~dp0"
node hub.mjs %*
pause
