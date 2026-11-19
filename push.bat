@echo off
setlocal
cd /d "%~dp0"
if errorlevel 1 goto failed

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 goto failed

git add --all
if errorlevel 1 goto failed

git diff --cached --quiet
if errorlevel 2 goto failed
if errorlevel 1 goto commit

echo No new changes to commit. Checking remote upload...
goto upload

:commit
set "pixelEditCommitMsg="
for /f "delims=" %%I in ('powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss'"') do set "pixelEditCommitMsg=%%I"
if not defined pixelEditCommitMsg set "pixelEditCommitMsg=Update pixel editor"
git commit -m "%pixelEditCommitMsg%"
if errorlevel 1 goto failed

:upload
git push origin main
if errorlevel 1 goto failed
echo Upload completed.
if /i "%~1"=="--no-pause" exit /b 0
pause
exit /b 0

:failed
echo Upload failed. Check the Git message above.
if /i "%~1"=="--no-pause" exit /b 1
pause
exit /b 1
