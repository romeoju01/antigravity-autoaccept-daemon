@echo off
setlocal

title Antigravity 2.0 AutoAccept Launcher
color 0A

set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%" >nul 2>nul
if errorlevel 1 (
    color 0C
    echo [ERROR] Could not open the AutoAccept folder:
    echo "%SCRIPT_DIR%"
    echo.
    echo Move the extracted folder to a local path you can access and try again.
    echo.
    pause
    exit /b 1
)

echo ==============================================================
echo         ANTIGRAVITY 2.0 AUTOACCEPT STANDALONE LAUNCHER
echo ==============================================================
echo.
echo [Info] Launcher folder: %CD%
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if errorlevel 1 (
    color 0C
    echo [ERROR] Node.js is not installed on this system.
    echo Please install Node.js from https://nodejs.org/ before running this tool.
    echo.
    pause
    exit /b 1
)

node --version >nul 2>nul
if errorlevel 1 (
    color 0C
    echo [ERROR] A node command was found, but it did not run correctly.
    echo If Windows opened the Microsoft Store, disable the Node.js App Execution Alias
    echo or install the Node.js LTS version from https://nodejs.org/.
    echo.
    pause
    exit /b 1
)

set "NODE_MAJOR="
for /f "delims=" %%v in ('node -p "process.versions.node.split('.')[0]" 2^>nul') do set "NODE_MAJOR=%%v"
if not defined NODE_MAJOR (
    color 0C
    echo [ERROR] Could not determine the installed Node.js version.
    echo Please install Node.js LTS from https://nodejs.org/ and try again.
    echo.
    pause
    exit /b 1
)
if %NODE_MAJOR% lss 18 (
    color 0C
    echo [ERROR] Node.js 18 or newer is required. Your installed version is:
    node --version
    echo.
    echo Install the current Node.js LTS version from https://nodejs.org/ and try again.
    echo.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    color 0C
    echo [ERROR] npm was not found. Reinstall Node.js LTS from https://nodejs.org/
    echo and make sure "npm package manager" is selected during setup.
    echo.
    pause
    exit /b 1
)

npm --version >nul 2>nul
if errorlevel 1 (
    color 0C
    echo [ERROR] npm was found, but it did not run correctly.
    echo Reinstall Node.js LTS from https://nodejs.org/ and try again.
    echo.
    pause
    exit /b 1
)

:: Check if node_modules/ws is already installed
if not exist "node_modules\ws\package.json" (
    echo [Info] First-run detected. Installing required dependencies...
    if exist "package-lock.json" (
        echo Running: npm ci --ignore-scripts --no-audit --no-fund ...
        call npm ci --ignore-scripts --no-audit --no-fund
    ) else (
        echo Running: npm install --ignore-scripts --no-audit --no-fund ...
        call npm install --ignore-scripts --no-audit --no-fund
    )
    if errorlevel 1 (
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
node "%SCRIPT_DIR%autoaccept-daemon.js"


if errorlevel 1 (
    color 0C
    echo.
    echo ==============================================================
    echo  [CRASH] Daemon exited with non-zero exit code: %errorlevel%
    echo ==============================================================
    pause
)
