# Antigravity AutoAccept 2.0 (Standalone Portable Edition)

A highly robust, zero-configuration background daemon designed for Antigravity 2.0. This standalone package can be zipped and shared directly with coworkers. 

It handles automatic dependency bootstrapping, works under any Windows user account without hardcoded paths, and does not require local VS Code extension files.

---

## ⚡ Quick Start

1. **Prerequisite**: Ensure **[Node.js](https://nodejs.org/)** is installed on your computer.
2. **Launch**: Double-click **`run-autoaccept.bat`** to start the tool.
   * *First run:* It will automatically fetch and install its lightweight WebSocket client library (`ws`).
   * *Subsequent runs:* It launches instantly with zero overhead.

---

## ⚙️ How It Works (Antigravity 2.0 CDP Architecture)

Antigravity 2.0 has completely removed the standard extension host. This daemon works out-of-process using the **Chrome DevTools Protocol (CDP)**:

1. It periodically polls the configured CDP port (default: `9334`).
2. When an active Antigravity session is found, it automatically injects a sophisticated, non-intrusive **DOM MutationObserver** directly into the IDE interface.
3. This observer intercepts action confirmation screens and automatically triggers clicks on approved buttons (e.g., `Run`, `Accept`, `Allow`, `Continue`, `Retry`) based on your rules.

---

## 🛠️ Configuration Settings

The daemon automatically monitors and dynamically hot-reloads your configuration directly from your global settings! 

To customize settings, open your active Antigravity workspace, press `Ctrl + ,` (or open user `settings.json`), and append the following configuration parameters:

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
