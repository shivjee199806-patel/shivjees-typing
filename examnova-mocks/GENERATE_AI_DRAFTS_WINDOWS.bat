@echo off
cd /d "%~dp0"
echo ExamNova AI Question Drafts - Admin review required
if "%OPENAI_API_KEY%"=="" (
  echo OPENAI_API_KEY is not set. Set an API key in your own Windows environment.
  pause
  exit /b 1
)
node GENERATE_QUESTIONS.js all
pause
