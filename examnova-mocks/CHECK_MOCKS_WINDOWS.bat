@echo off
cd /d "%~dp0"
echo [1] Checking Node.js...
node --version
if errorlevel 1 (echo Install Node.js 22 or higher from nodejs.org & pause & exit /b 1)
echo [2] Checking port 3000 for an older server...
netstat -ano | findstr ":3000"
echo.
echo If port 3000 is occupied by your old ExamNova, close its terminal with Ctrl+C.
echo This check will start the NEW version at port 3100 to avoid old servers.
set PORT=3100
start "" "http://localhost:3100/api/status"
node server.js
pause
