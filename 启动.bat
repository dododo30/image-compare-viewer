@echo off
cd /d "%~dp0"

set "RT=C:\Users\wgdl\AppData\Local\Programs\kimi-desktop\resources\resources\runtime"
set "NODE=%RT%\node.exe"
set "NPM_CLI=%RT%\node_modules\npm\bin\npm-cli.js"

where node >nul 2>nul
if %errorlevel%==0 (
  set "NODE=node"
  set "NPM_CLI="
)

if not exist node_modules (
  echo First run: installing dependencies, please wait...
  if defined NPM_CLI (
    "%NODE%" "%NPM_CLI%" install --no-audit --no-fund
  ) else (
    call npm install --no-audit --no-fund
  )
)

echo Starting dev server at http://localhost:3000/
if defined NPM_CLI (
  "%NODE%" "%NPM_CLI%" run dev
) else (
  call npm run dev
)
pause
