@echo off
chcp 65001 > nul
cd /d "%~dp0backend"

echo ========================================
echo   通用报修系统 - 启动脚本
echo ========================================
echo.

:: 检查 .env 是否存在
if not exist ".env" (
    echo [.env 不存在，正在创建...]
    powershell -Command "[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))" > .env.tmp
    set /p _SECRET=<.env.tmp
    del .env.tmp
    echo JWT_SECRET=!_SECRET! > .env
    echo   JWT_SECRET 已生成
) else (
    echo   JWT_SECRET 已配置
)

echo.
echo [1/2] 检查端口占用...
netstat -ano ^| findstr ":3000" ^| findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo   [警告] 端口已被占用，正在关闭...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
        taskkill /F /PID %%a >nul 2>&1
    )
    timeout /t 2 /nobreak > nul
)

echo.
echo [2/2] 启动后端服务...
start "报修系统后端" cmd /k "title 报修系统后端 && node server.js"
echo   等待服务就绪...

for /L %%i in (1,1,15) do (
    timeout /t 1 /nobreak > nul
    curl -s http://localhost:3000 >nul 2>&1
    if not errorlevel 1 goto :ready
)

echo   [错误] 启动失败
pause & exit /b

:ready
echo.
echo ========================================
echo   系统已就绪！访问 http://localhost:3000
echo ========================================
start http://localhost:3000
pause
