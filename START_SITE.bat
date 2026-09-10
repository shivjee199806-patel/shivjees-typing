@echo off
setlocal
cd /d "%~dp0"
title Shivjee's Typing

echo ==========================================
echo        Shivjee's Typing - Local Start
echo ==========================================

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: Node.js is not installed or not in PATH.
  echo Please install Node.js first.
  pause
  exit /b 1
)

if not exist "node_modules\express\package.json" (
  echo.
  echo First run detected. Installing required packages...
  echo This is needed only once for this extracted folder.
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. Check internet connection and try again.
    pause
    exit /b 1
  )
)

rem IMPORTANT: stop any OLD Shivjee's Typing server still listening on port 3000.
rem Otherwise Windows keeps showing the old ZIP even after a new ZIP is extracted.
echo.
echo Closing any old local server on port 3000...
for /f "tokens=5" %%P in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
  taskkill /F /PID %%P >nul 2>nul
)
>nul 2>&1 timeout /t 1 /nobreak

echo.
echo Starting THIS extracted version of Shivjee's Typing...
echo Open: http://localhost:3000
start "" http://localhost:3000
call npm start

endlocal
