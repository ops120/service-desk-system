@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

echo ========================================
echo   通用报修系统 - 安装脚本
echo ========================================
echo.

echo [1/3] 正在检查 Node.js 环境...
where node >nul 2>&1
if errorlevel 1 (
    echo   [错误] 未找到 Node.js，请先安装 https://nodejs.org/
    echo.
    pause
    exit /b 1
)
for /f "delims=" %%i in ('node -v') do set NODE_VERSION=%%i
echo   Node.js 版本: !NODE_VERSION!

echo.
echo [2/3] 正在安装后端依赖...
cd /d "%~dp0backend"
if exist node_modules (
    echo   后端依赖已存在，跳过安装
) else (
    npm install
    if errorlevel 1 (
        echo   [错误] 后端依赖安装失败
        pause
        exit /b 1
    )
)

echo.
echo [3/3] 正在创建必要目录...
if not exist "%~dp0uploads" (
    mkdir "%~dp0uploads"
    echo   已创建 uploads 目录
) else (
    echo   uploads 目录已存在
)

echo.
echo ========================================
echo   安装完成！
echo ========================================
echo.
echo 下一步：双击运行 start.bat 启动系统
echo.
pause
