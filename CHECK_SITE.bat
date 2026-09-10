@echo off
setlocal
cd /d "%~dp0"
echo Checking server syntax...
node --check server.js
if errorlevel 1 (
  echo ERROR: server.js has a syntax problem.
  pause
  exit /b 1
)
echo Server syntax OK.
echo package.json start script:
node -e "console.log(require('./package.json').scripts.start)"
pause
endlocal
