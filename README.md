# Antigravity 2.0 AutoAccept

> **Tired of clicking "Allow", "Run", and "Yes" every few seconds while your AI agent works?**  
> This tool does it for you — automatically, silently, in the background.

---

## 🎬 What Does It Do?

When you're using **Antigravity 2.0** as your AI coding assistant, it frequently pauses and asks for your permission before running commands or editing files. This tool watches for those pop-ups and clicks them for you automatically — so your agent can work uninterrupted while you focus on other things.

**Before**: Agent pauses → you switch windows → click "Run" → agent continues  
**After**: Agent pauses → ✅ auto-clicked → agent continues (you didn't have to do anything)

---

## ✅ Requirements

- **[Node.js](https://nodejs.org/)** 18 or newer must be installed on your computer *(the current LTS installer is recommended)*
- **Antigravity 2.0** IDE must be open and running

---

## 🚀 Getting Started

### Step 1 — Download

Click the green **`<> Code`** button at the top of this page → **Download ZIP** → Extract the folder anywhere on your computer (e.g. your Desktop or Documents).

### Step 2 — Run It

#### 🪟 Windows
Double-click **`run-autoaccept.bat`**

- **First time?** It will automatically download the one small dependency it needs, then start up.
- A terminal window will open showing live activity. **Keep it open** while you work.

#### 🍎 Mac / 🐧 Linux
Open Terminal, navigate to the extracted folder, and run:
```
npm ci --ignore-scripts --no-audit --no-fund
npm start
```

That's it. The tool is now watching your IDE. Keep the terminal open while you work.

---

## 🔄 Run Automatically on Startup (Optional)

Don't want to remember to launch it every time you restart your computer? Here's how to make it start automatically:

### 🪟 Windows (3 steps, no scripting)

1. Press **`Win + R`** on your keyboard, type `shell:startup`, and hit **Enter**.  
   *(A folder will open — this is your Windows Startup folder)*

2. Go back to the extracted AutoAccept folder and find `run-autoaccept.bat`.

3. **Right-click** `run-autoaccept.bat` → **Send to** → **Desktop (create shortcut)**.  
   Then **drag that shortcut** into the Startup folder from Step 1.

Done! The tool will now start silently every time Windows boots. To stop it from auto-starting, just delete the shortcut from the Startup folder.

### 🍎 macOS & 🐧 Linux

Open Terminal, navigate to the extracted folder, and run:
```
bash ./run-autoaccept.sh
```

The launcher installs any missing dependency, starts the daemon, and sets up boot persistence for you:
- **macOS**: installs a LaunchAgent that starts on login
- **Linux**: registers a systemd user service that starts on boot

`npm start` only runs the daemon in the current terminal. It does not install startup persistence.

---

## 🛑 How to Stop It

- **Windows**: Close the terminal window, or press `Ctrl + C` inside it.
- **Mac/Linux one-time run**: Press `Ctrl + C` in the terminal.
- **macOS startup service**: Run `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.arative.autoaccept.plist 2>/dev/null || launchctl unload ~/Library/LaunchAgents/com.arative.autoaccept.plist`, then delete that plist file if you no longer want it to start on login.
- **Linux startup service**: Run `systemctl --user disable --now autoaccept.service`.

---

## ⚙️ Optional: Customize What Gets Auto-Clicked

By default, the tool auto-clicks the most common approval buttons (`Run`, `Allow`, `Accept`, `Yes`, `Continue`). You can customize this behavior in your Antigravity **Settings** (`Ctrl+,` or `Cmd+,`):

```json
{
  "autoAcceptV2.autoAcceptFileEdits": true,
  "autoAcceptV2.autoRetryEnabled": true,
  "autoAcceptV2.blockedCommands": [
    "rm -rf",
    "drop database"
  ]
}
```

| Setting | What it does | Default |
|---|---|---|
| `autoAcceptFileEdits` | Auto-accept when the agent edits or saves files | `true` |
| `autoRetryEnabled` | Auto-retry when a command fails | `true` |
| `blockedCommands` | Commands that should **never** be auto-approved | *(none)* |
| `allowedCommands` | If set, **only** these commands will be auto-approved | *(none)* |
| `customButtonTexts` | Extra button labels you want to auto-click | *(none)* |
| `cdpPort` | Advanced: the debug port Antigravity runs on | `9334` |

---

## 🛡️ Is It Safe?

Yes. A few things worth knowing:

- **It only works locally.** After the first dependency install, the daemon connects only to your own computer (via `localhost`) and does not send page content or settings to an external service.
- **No system-wide installation required.** Windows runs directly from the folder. Optional macOS/Linux startup persistence writes a user-level LaunchAgent or systemd service only when you run `run-autoaccept.sh`.
- **Open source.** Everything this tool does is visible in `autoaccept-daemon.js`. No obfuscation, no surprises.
- **Safety circuit breaker.** If the agent starts failing repeatedly (3+ failures in 60 seconds), the tool stops clicking automatically to prevent infinite loops.
- **Filter protection.** You can blocklist specific dangerous commands (like `rm -rf`) so they are never auto-approved, even if the agent asks.

---

## 🙋 Troubleshooting

**"I double-clicked the .bat file and nothing happened / it closed immediately"**

- Make sure Node.js is installed. [Download it here](https://nodejs.org/) and try again.
- If Windows opens the Microsoft Store, disable the **Node.js App Execution Alias** in Windows Settings, or install Node.js LTS from the link above.
- If the terminal says `npm was not found`, reinstall Node.js LTS and keep the **npm package manager** option selected.

**"Dependency installation failed" / "Cannot find module 'ws'"**

- Use the latest `run-autoaccept.bat`. It must install dependencies inside this AutoAccept folder, even when launched from a shortcut or the Windows Startup folder.
- If it still fails, open Command Prompt in the extracted folder and run:
```
npm ci --ignore-scripts --no-audit --no-fund
node autoaccept-daemon.js
```

**"It's running but the agent is still pausing for approval"**

- Make sure Antigravity is open and you have an active conversation. The tool only activates when a session is detected.
- If the terminal says it is waiting for Antigravity, open or focus an Antigravity conversation and wait a few seconds.
- If you changed Antigravity's debug port, set `autoAcceptV2.cdpPort` in Antigravity Settings to the matching port.

**"I got a Windows Defender warning"**  
→ Windows can warn on downloaded `.bat` files. Only run it if you downloaded this repo from the expected source and trust the folder contents. The launcher is plain text, so you can right-click it → **Edit** before choosing **Run anyway**.

**"The terminal window keeps closing / crashing"**  
→ Try running it from the command line manually: open a terminal, `cd` into the folder, run `npm ci --ignore-scripts --no-audit --no-fund`, then run `npm start` to see the full error message.

---

<details>
<summary>🔧 Technical Details (for developers)</summary>

### How It Works

This daemon uses the **Chrome DevTools Protocol (CDP)** to communicate with the Antigravity IDE webview:

1. It polls the CDP port (default `9334`) every 2 seconds to discover active page targets.
2. When an Antigravity session is found, it injects a **throttled DOM MutationObserver** (max 4 scans/sec) into the page's execution context via `Runtime.evaluate`.
3. The observer uses a mature matching engine with Shadow DOM traversal, leaf-node preference, sidebar isolation guards, and ambiguous-word disambiguation to find and click valid permission buttons.
4. On page reload or navigation, `Runtime.executionContextsCleared` triggers automatic re-injection — no polling gaps.
5. The MutationObserver is throttled with a 250ms minimum scan interval to prevent main-thread starvation in large IDE DOM trees.

### Startup Persistence (Windows)
The Windows launcher (`run-autoaccept.bat`) does **not** programmatically modify your Startup folder or use COM objects/VBScript — by design, to avoid antivirus false positives. Manual shortcut setup is described above.

</details>

---

## 📄 License

MIT © [Arative](https://arative.com)
