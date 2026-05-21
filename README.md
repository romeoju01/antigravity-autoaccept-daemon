# Antigravity 2.0 AutoAccept (Cross-Platform Daemon)

A highly robust, zero-configuration background daemon designed for Antigravity 2.0. This out-of-process utility automatically clicks standard permission and confirmation prompts in your IDE, providing a completely hands-free development experience.

It handles automatic dependency bootstrapping, works cross-platform (Windows, macOS, Linux) without hardcoded paths, and does not require local VS Code extension files.

---

## ⚡ Quick Start

### Prerequisites
* Ensure **[Node.js](https://nodejs.org/)** is installed on your computer.

### Launch Instructions

#### 🪟 Windows
Double-click **`run-autoaccept.bat`** to start:
* **First run:** Automatically installs the local dependency (`ws`) and starts the daemon.
* **Subsequent runs:** Launches instantly. Keep the terminal window open — it streams live activity logs.

#### 🍎 macOS & 🐧 Linux
Open your terminal inside this folder and run:
1. **Install dependencies**: `npm install`
2. **Start the daemon**: `npm start`

---

## 🔄 Automatic Boot/Startup Survival (Optional)

To have the daemon start automatically every time Windows boots, follow these **safe, one-time manual steps** — no scripts required:

1. Press **`Win + R`**, type `shell:startup`, and hit **Enter**.  
   *(This opens your personal Startup folder in Windows Explorer.)*
2. In a separate Explorer window, navigate to this folder (`antigravity-autoaccept-standalone`).
3. **Right-click** `run-autoaccept.bat` → **Send to** → **Desktop (create shortcut)**.
4. Move (drag) that desktop shortcut into the Startup folder you opened in step 1.

> **That's it.** The daemon will now launch silently minimized on every Windows boot.  
> To remove it later, just delete the shortcut from `shell:startup`.

### 🍎 macOS & 🐧 Linux Startup
The included `run-autoaccept.sh` script **automatically** configures boot persistence:
- **macOS**: Creates and loads a `LaunchAgent` plist (`~/Library/LaunchAgents/com.arative.autoaccept.plist`).
- **Linux**: Creates and enables a `systemd` user service (`~/.config/systemd/user/autoaccept.service`).

---

## ⚙️ How It Works (CDP Architecture)

Antigravity 2.0 does not run in-process extensions. This daemon runs as a lightweight out-of-process utility using the **Chrome DevTools Protocol (CDP)**:

1. It polls the configured CDP port (default: `9334`).
2. When an active Antigravity session is discovered, it dynamically injects a sophisticated, non-intrusive **DOM MutationObserver** into the IDE webview frame.
3. The observer intercepts action confirmation modals and triggers immediate clicks on approved buttons (`Run`, `Accept`, `Allow`, `Continue`, `Yes, allow this time`) based on your rules, including advanced 2-step radio submission sequences.

---

## 🛠️ Configuration Settings

The daemon automatically monitors and dynamically hot-reloads your settings in real time!

Open your global Antigravity `settings.json` (`Ctrl + ,` or `Cmd + ,`) and append the following configuration parameters:

```json
{
  "autoAcceptV2.cdpPort": 9334,
  "autoAcceptV2.autoAcceptFileEdits": true,
  "autoAcceptV2.autoRetryEnabled": true,
  "autoAcceptV2.customButtonTexts": [
    "approve review",
    "bypass safety"
  ],
  "autoAcceptV2.blockedCommands": [
    "rm -rf",
    "git push origin master",
    "drop database"
  ],
  "autoAcceptV2.allowedCommands": [
    "npm run test",
    "python test.py"
  ]
}
```

### Configuration Keys:
* **`autoAcceptV2.cdpPort`** *(number, default: `9334`)*: The debug port your Antigravity client is running on.
* **`autoAcceptV2.autoAcceptFileEdits`** *(boolean, default: `true`)*: Auto-accept and save agent file modifications.
* **`autoAcceptV2.autoRetryEnabled`** *(boolean, default: `true`)*: Auto-retry on terminal command failures or compilation hangs.
* **`autoAcceptV2.customButtonTexts`** *(array of strings)*: Custom UI button phrases you want to automatically click.
* **`autoAcceptV2.blockedCommands`** *(array of strings)*: Prevent auto-accepting any terminal execution containing these keywords. The daemon will dynamically overwrite the UI and label the button `⛔ Blocked by Filter` to protect your environment.
* **`autoAcceptV2.allowedCommands`** *(array of strings)*: If defined, the daemon will *only* auto-accept command executions matching these specific phrases.

---

## 🛡️ Safety Features
* **Circuit Breaker**: Prevents infinite click-loops by halting automatically if the agent triggers 3 failures/retries within a rolling 60-second window.
* **Bare-Word Protection**: Evaluates DOM hierarchy to prevent accidentally clicking normal sidebar links, conversation items, or plain text containing terms like "run" or "accept".
* **Real-Time Stream Logging**: The terminal window streams active DOM actions and audit notifications as they occur in your IDE!
