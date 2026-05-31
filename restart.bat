@echo off
chcp 65001 > nul
echo ========================================
echo   通用报修系统 - 重启脚本
echo ========================================
echo.

echo [1/3] 停止现有服务...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
    echo   已停止 PID %%a
)
timeout /t 1 /nobreak > nul

echo.
echo [2/3] 启动后端服务...
cd /d "%~dp0backend"
start "报修系统后端" cmd /k "title 报修系统后端 && node server.js"
echo   等待服务就绪...

for /L %%i in (1,1,15) do (
    timeout /t 1 /nobreak > nul
    curl -s http://localhost:3000 >nul 2>&1
    if not errorlevel 1 goto :ready
)

echo.
echo   [错误] 启动失败
pause & exit /b

:ready
echo.
echo ========================================
echo   系统已就绪！访问 http://localhost:3000
echo ========================================
start http://localhost:3000
pause
