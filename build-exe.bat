@echo off
setlocal
cd /d "%~dp0"
echo ==== THE UNBOX APP : build Windows .exe ====
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)
call npm install
if errorlevel 1 goto :err
call npm run dist:win
if errorlevel 1 goto :err
echo.
echo DONE. Your app is here:  release\Unbox-Studio.exe
echo (portable - double-click it, no installer needed)
pause
exit /b 0
:err
echo.
echo Build failed - scroll up to read the error.
pause
exit /b 1
