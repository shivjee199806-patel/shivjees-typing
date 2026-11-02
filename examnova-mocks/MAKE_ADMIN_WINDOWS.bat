@echo off
cd /d "%~dp0"
echo ==============================================
echo      ExamNova Local Admin Access Setup
 echo ==============================================
echo Run this only on your own computer and account.
set /p OWNER_EMAIL=Enter your existing ExamNova login EMAIL: 
if "%OWNER_EMAIL%"=="" goto end
node MAKE_ADMIN.js "%OWNER_EMAIL%"
:end
echo.
pause
