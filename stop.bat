@echo off
echo Stopping service-desk-system...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
    echo Killed PID %%a
)
echo Done.
