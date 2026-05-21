@echo off
setlocal enabledelayedexpansion

title Antigravity 2.0 AutoAccept Launcher
color 0A

echo ==============================================================
echo         ANTIGRAVITY 2.0 AUTOACCEPT STANDALONE LAUNCHER
echo ==============================================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js is not installed on this system.
    echo Please install Node.js from https://nodejs.org/ before running this tool.
    echo.
    pause
    exit /b 1
)

:: Check if node_modules/ws is already installed
if not exist "node_modules\ws" (
    echo [Info] First-run detected. Installing required dependencies...
    echo Running: npm install --no-audit --no-fund ...
    call npm install --no-audit --no-fund
    if !errorlevel! neq 0 (
        color 0C
        echo [ERROR] Dependency installation failed.
        echo Please ensure you have an active internet connection and npm is configured correctly.
        echo.
        pause
        exit /b 1
    )
    echo [Success] Dependencies installed successfully.
    echo.
)

:: Start the daemon
echo [Info] Launching background daemon...
echo [Tip]  To auto-start on Windows boot, see the README for manual Startup folder setup.
echo.
node "%~dp0autoaccept-daemon.js"


if %errorlevel% neq 0 (
    color 0C
    echo.
    echo ==============================================================
    echo  [CRASH] Daemon exited with non-zero exit code: %errorlevel%
    echo ==============================================================
    pause
)
