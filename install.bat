@echo off
setlocal
cd /d "%~dp0"
set "NO_PAUSE=0"
if /i "%~1"=="--no-pause" set "NO_PAUSE=1"

call :check_node
if errorlevel 1 (
  echo Node.js 22.18+ is not installed or is outdated.
  where winget >nul 2>&1
  if errorlevel 1 (
    echo winget was not found. Install Node.js 22.18+ LTS from https://nodejs.org
    if "%NO_PAUSE%"=="0" start "" "https://nodejs.org"
    goto failed
  )
  echo Installing / updating Node.js LTS automatically via winget...
  where node >nul 2>&1
  if errorlevel 1 (
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  ) else (
    winget upgrade -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements || winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  )
  if errorlevel 1 (
    echo Automatic Node.js setup failed or was cancelled. Install from https://nodejs.org
    if "%NO_PAUSE%"=="0" start "" "https://nodejs.org"
    goto failed
  )
  if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
  call :check_node
  if errorlevel 1 (
    echo Node.js was installed, but its version check failed. Open a new terminal and re-run install.bat.
    goto failed
  )
)

call npm ci --omit=dev
if errorlevel 1 goto failed
node setup.mjs
if errorlevel 1 goto failed
if "%NO_PAUSE%"=="0" pause
exit /b 0

:check_node
if exist "%ProgramFiles%\nodejs\node.exe" (
  where node >nul 2>&1 || set "PATH=%ProgramFiles%\nodejs;%PATH%"
)
where node >nul 2>&1
if errorlevel 1 exit /b 1
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)"
exit /b %errorlevel%

:failed
echo Installation failed. See the message above.
if "%NO_PAUSE%"=="0" pause
exit /b 1
