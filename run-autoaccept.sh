#!/usr/bin/env bash

# Antigravity 2.0 AutoAccept Launcher (macOS/Linux)
# Zero-configuration bootstrapping script

# Resolve directory context immediately
cd "$(dirname "$0")"

# Print Banner
echo "=============================================================="
echo "       LAUNCHING ANTIGRAVITY 2.0 AUTOACCEPT DAEMON..."
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

# Setup persistent startup survival for macOS LaunchAgent
if [ "$(uname)" = "Darwin" ]; then
    PLIST_DIR="$HOME/Library/LaunchAgents"
    PLIST_FILE="$PLIST_DIR/com.arative.autoaccept.plist"
    if [ ! -f "$PLIST_FILE" ]; then
        echo "[Info] Setting up persistent startup survival for macOS..."
        mkdir -p "$PLIST_DIR"
        cat <<EOF > "$PLIST_FILE"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.arative.autoaccept</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$(pwd)/run-autoaccept.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
EOF
        launchctl load "$PLIST_FILE" 2>/dev/null
        echo "[Success] LaunchAgent installed and loaded. Daemon will run silently on boot."
        echo ""
    fi
fi

# Setup persistent startup survival for Linux systemd unit
if [ "$(uname)" = "Linux" ]; then
    SYSTEMD_DIR="$HOME/.config/systemd/user"
    SERVICE_FILE="$SYSTEMD_DIR/autoaccept.service"
    if [ ! -f "$SERVICE_FILE" ]; then
        echo "[Info] Setting up persistent startup survival for Linux..."
        mkdir -p "$SYSTEMD_DIR"
        cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=Antigravity 2.0 AutoAccept Daemon
After=network.target

[Service]
Type=simple
WorkingDirectory=$(pwd)
ExecStart=/bin/bash $(pwd)/run-autoaccept.sh
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF
        systemctl --user daemon-reload 2>/dev/null
        systemctl --user enable autoaccept.service 2>/dev/null
        systemctl --user start autoaccept.service 2>/dev/null
        echo "[Success] Systemd user service installed and enabled. Daemon will run on system boot."
        echo ""
    fi
fi

# Start the daemon
echo "[Info] Launching background daemon..."
echo ""
node ./autoaccept-daemon.js
