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

:: Setup standard shortcut in Startup folder (100% AV-Safe, replaces unsafe VBS launcher)
set "STARTUP_LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\antigravity-autoaccept.lnk"
set "OLD_STARTUP_VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\antigravity-autoaccept.vbs"

:: Proactively clean up old VBS to clear any local antivirus quarantines
if exist "%OLD_STARTUP_VBS%" (
    echo [Info] Cleaning up old high-risk VBScript launcher...
    del /f /q "%OLD_STARTUP_VBS%" >nul 2>&1
)

if not exist "%STARTUP_LNK%" (
    echo [Info] Setting up persistent startup shortcut...
    powershell -NoProfile -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%STARTUP_LNK%'); $Shortcut.TargetPath = '%~dp0run-autoaccept.bat'; $Shortcut.WorkingDirectory = '%~dp0'; $Shortcut.WindowStyle = 7; $Shortcut.Save()" >nul 2>&1
    if exist "%STARTUP_LNK%" (
        echo [Success] Safely configured minimized startup shortcut.
    ) else (
        echo [Warning] Startup shortcut bypassed (permissions or profile restriction).
    )
    echo.
)

:: Start the daemon
echo [Info] Launching background daemon...
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
