@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)
if not exist node_modules call npm install
if not exist dist\index.html call npm run build
if not exist electron\api-server.cjs call npm run build:api
call npx electron .
if errorlevel 1 (
  echo.
  echo Electron window closed or unavailable. Launching Standalone GPU runner...
  node scripts/standalone-runner.js
)
