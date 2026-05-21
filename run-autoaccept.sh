#!/usr/bin/env bash

# Antigravity AutoAccept 2.0 Launcher (macOS/Linux)
# Zero-configuration bootstrapping script

# Print Banner
echo "=============================================================="
echo "       LAUNCHING ANTIGRAVITY AUTOACCEPT 2.0 DAEMON..."
echo "=============================================================="
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "\033[0;31m[ERROR] Node.js is not installed on this system.\033[0m"
    echo "Please install Node.js from https://nodejs.org/ before running this tool."
    echo ""
    exit 1
fi

# Check for local dependencies
if [ ! -d "node_modules/ws" ]; then
    echo "[Info] First-run detected. Installing required dependencies..."
    echo "Running: npm install --no-audit --no-fund ..."
    npm install --no-audit --no-fund
    if [ $? -ne 0 ]; then
        echo -e "\033[0;31m[ERROR] Dependency installation failed.\033[0m"
        echo "Please ensure you have an active internet connection."
        echo ""
        exit 1
    fi
    echo "[Success] Dependencies installed successfully."
    echo ""
fi

# Start the daemon
echo "[Info] Launching background daemon..."
echo ""
node "$(dirname "$0")/autoaccept-daemon.js"
