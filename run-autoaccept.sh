#!/usr/bin/env bash

# Antigravity 2.0 AutoAccept Launcher (macOS/Linux)
# Zero-configuration bootstrapping script

# Resolve directory context immediately, even when launched from another folder.
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if [ -z "$SCRIPT_DIR" ] || ! cd "$SCRIPT_DIR"; then
    echo "[ERROR] Could not open the AutoAccept folder."
    echo "Move the extracted folder to a local path you can access and try again."
    echo ""
    exit 1
fi
SCRIPT_PATH="$SCRIPT_DIR/run-autoaccept.sh"
STARTED_BY_MANAGER=0

# launchd and systemd often start user services with a minimal PATH.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

if { ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; } && [ -s "$HOME/.nvm/nvm.sh" ]; then
    . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
fi

xml_escape() {
    printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'
}

# Print Banner
echo "=============================================================="
echo "       LAUNCHING ANTIGRAVITY 2.0 AUTOACCEPT DAEMON..."
echo "=============================================================="
echo ""

# Check for Node.js and npm
if ! command -v node &> /dev/null; then
    echo -e "\033[0;31m[ERROR] Node.js is not installed on this system.\033[0m"
    echo "Please install Node.js from https://nodejs.org/ before running this tool."
    echo ""
    exit 1
fi

if ! node --version > /dev/null 2>&1; then
    echo -e "\033[0;31m[ERROR] A node command was found, but it did not run correctly.\033[0m"
    echo "Please install the Node.js LTS version from https://nodejs.org/ and try again."
    echo ""
    exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null)"
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 18 ] 2>/dev/null; then
    echo -e "\033[0;31m[ERROR] Node.js 18 or newer is required. Installed version: $(node --version 2>/dev/null || echo unknown)\033[0m"
    echo "Install the current Node.js LTS version from https://nodejs.org/ and try again."
    echo ""
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "\033[0;31m[ERROR] npm was not found.\033[0m"
    echo "Reinstall Node.js LTS from https://nodejs.org/ and make sure npm is included."
    echo ""
    exit 1
fi

if ! npm --version > /dev/null 2>&1; then
    echo -e "\033[0;31m[ERROR] npm was found, but it did not run correctly.\033[0m"
    echo "Reinstall Node.js LTS from https://nodejs.org/ and try again."
    echo ""
    exit 1
fi

# Check for local dependencies
if [ ! -f "node_modules/ws/package.json" ]; then
    echo "[Info] First-run detected. Installing required dependencies..."
    if [ -f "package-lock.json" ]; then
        echo "Running: npm ci --ignore-scripts --no-audit --no-fund ..."
        npm ci --ignore-scripts --no-audit --no-fund
    else
        echo "Running: npm install --ignore-scripts --no-audit --no-fund ..."
        npm install --ignore-scripts --no-audit --no-fund
    fi
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
        ESCAPED_SCRIPT_PATH="$(xml_escape "$SCRIPT_PATH")"
        ESCAPED_PATH="$(xml_escape "$PATH")"
        cat <<EOF > "$PLIST_FILE"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.arative.autoaccept</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>$ESCAPED_PATH</string>
    </dict>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$ESCAPED_SCRIPT_PATH</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
EOF
        if launchctl bootstrap "gui/$(id -u)" "$PLIST_FILE" 2>/dev/null || launchctl load "$PLIST_FILE" 2>/dev/null; then
            STARTED_BY_MANAGER=1
            echo "[Success] LaunchAgent installed and loaded. Daemon will run silently on boot."
        else
            echo "[Warning] LaunchAgent was created, but macOS did not start it automatically."
            echo "Continuing in this terminal instead."
        fi
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
WorkingDirectory="$SCRIPT_DIR"
ExecStart=/bin/bash "$SCRIPT_PATH"
Environment="PATH=$PATH"
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF
        systemctl --user daemon-reload 2>/dev/null
        systemctl --user enable autoaccept.service 2>/dev/null
        if systemctl --user start autoaccept.service 2>/dev/null; then
            STARTED_BY_MANAGER=1
            echo "[Success] Systemd user service installed and enabled. Daemon will run on system boot."
        else
            echo "[Warning] Systemd service was created, but Linux did not start it automatically."
            echo "Continuing in this terminal instead."
        fi
        echo ""
    fi
fi

if [ "$STARTED_BY_MANAGER" = "1" ]; then
    echo "[Info] Startup service started the daemon. You can close this terminal."
    exit 0
fi

# Start the daemon
echo "[Info] Launching background daemon..."
echo ""
node "$SCRIPT_DIR/autoaccept-daemon.js"
