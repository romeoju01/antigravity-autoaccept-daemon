/**
 * Antigravity AutoAccept 2.0 Daemon (Standalone Portable Edition)
 * 
 * A zero-configuration, self-contained background daemon designed for easy sharing.
 * Dynamically resolves system folders (works on any coworker's PC), checks/installs
 * local dependencies automatically, and requires no external extension folder.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// Resolve settings path dynamically across Windows, macOS, and Linux
const HOME = process.env.HOME || process.env.USERPROFILE || 'C:\\Users\\Default';
let RESOLVED_SETTINGS_PATH = '';

if (process.platform === 'win32') {
    const APPDATA = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');
    RESOLVED_SETTINGS_PATH = path.join(APPDATA, 'Antigravity', 'User', 'settings.json');
} else if (process.platform === 'darwin') {
    RESOLVED_SETTINGS_PATH = path.join(HOME, 'Library', 'Application Support', 'Antigravity', 'User', 'settings.json');
} else {
    RESOLVED_SETTINGS_PATH = path.join(HOME, '.config', 'Antigravity', 'User', 'settings.json');
}


// Import ws module locally
let WebSocket;
try {
    WebSocket = require('ws');
} catch (e) {
    console.log('\x1b[33m[Warning] Local "ws" module not found. The launcher batch file should automatically install this on first run.\x1b[0m');
    console.log('To install manually, run: npm install ws');
    process.exit(1);
}

// ANSI Colors for premium terminal output
const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
    gray: '\x1b[90m'
};

// Global state
let config = {
    cdpPort: 9334,
    customButtonTexts: [],
    blockedCommands: [],
    allowedCommands: [],
    autoAcceptFileEdits: true,
    autoRetryEnabled: true
};

let lastSettingsMTime = 0;
const activeConnections = new Map(); // targetId -> WebSocket instance

function log(module, message, color = COLORS.cyan) {
    const ts = new Date().toLocaleTimeString();
    console.log(`${COLORS.gray}[${ts}]${COLORS.reset} ${color}[${module}]${COLORS.reset} ${message}`);
}

// Load settings.json dynamically
function loadSettings() {
    try {
        if (fs.existsSync(RESOLVED_SETTINGS_PATH)) {
            const stats = fs.statSync(RESOLVED_SETTINGS_PATH);
            if (stats.mtimeMs > lastSettingsMTime) {
                lastSettingsMTime = stats.mtimeMs;
                const raw = fs.readFileSync(RESOLVED_SETTINGS_PATH, 'utf8');
                const parsed = JSON.parse(raw);
                
                const newConfig = {
                    cdpPort: parsed['autoAcceptV2.cdpPort'] !== undefined ? parsed['autoAcceptV2.cdpPort'] : 9334,
                    customButtonTexts: parsed['autoAcceptV2.customButtonTexts'] || [],
                    blockedCommands: parsed['autoAcceptV2.blockedCommands'] || [],
                    allowedCommands: parsed['autoAcceptV2.allowedCommands'] || [],
                    autoAcceptFileEdits: parsed['autoAcceptV2.autoAcceptFileEdits'] !== undefined ? parsed['autoAcceptV2.autoAcceptFileEdits'] : true,
                    autoRetryEnabled: parsed['autoAcceptV2.autoRetryEnabled'] !== undefined ? parsed['autoAcceptV2.autoRetryEnabled'] : true
                };

                // Check for config changes
                const changes = [];
                if (newConfig.cdpPort !== config.cdpPort) changes.push(`Port: ${config.cdpPort} -> ${newConfig.cdpPort}`);
                if (newConfig.autoAcceptFileEdits !== config.autoAcceptFileEdits) changes.push(`FileEdits: ${config.autoAcceptFileEdits} -> ${newConfig.autoAcceptFileEdits}`);
                if (newConfig.autoRetryEnabled !== config.autoRetryEnabled) changes.push(`AutoRetry: ${config.autoRetryEnabled} -> ${newConfig.autoRetryEnabled}`);
                if (JSON.stringify(newConfig.blockedCommands) !== JSON.stringify(config.blockedCommands)) changes.push(`Blocked: ${newConfig.blockedCommands.length} items`);
                if (JSON.stringify(newConfig.allowedCommands) !== JSON.stringify(config.allowedCommands)) changes.push(`Allowed: ${newConfig.allowedCommands.length} items`);

                config = newConfig;

                if (changes.length > 0) {
                    log('Config', `Loaded changes: ${changes.join(' | ')}`, COLORS.green);
                    reinjectAll();
                } else {
                    log('Config', 'Loaded settings (no changes)', COLORS.gray);
                }
            }
        } else {
            if (lastSettingsMTime === 0) {
                lastSettingsMTime = 1; // Prevent repeated warnings
                log('Config', `Global settings.json not found at ${RESOLVED_SETTINGS_PATH}. Using standard defaults.`, COLORS.yellow);
            }
        }
    } catch (e) {
        log('Config', `Error loading settings.json: ${e.message}`, COLORS.red);
    }
}

// Dynamically resolve target CDP Port
function resolveCdpPort() {
    try {
        let portFile = process.env.AGY_BROWSER_ACTIVE_PORT_FILE;
        if (!portFile) {
            if (process.platform === 'win32') {
                const APPDATA = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');
                portFile = path.join(APPDATA, 'Antigravity', 'DevToolsActivePort');
            } else if (process.platform === 'darwin') {
                portFile = path.join(HOME, 'Library', 'Application Support', 'Antigravity', 'DevToolsActivePort');
            } else {
                portFile = path.join(HOME, '.config', 'Antigravity', 'DevToolsActivePort');
            }
        }
        if (fs.existsSync(portFile)) {
            const raw = fs.readFileSync(portFile, 'utf8').trim().split('\n')[0].trim();
            const port = parseInt(raw, 10);
            if (!isNaN(port) && port > 0) {
                return port;
            }
        }
    } catch (e) {
        // Fallback
    }
    return config.cdpPort;
}


// Fetch active pages from target port
function getTargetList() {
    return new Promise((resolve) => {
        const activePort = resolveCdpPort();
        const req = http.get(`http://127.0.0.1:${activePort}/json`, { timeout: 1500 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve([]);
                }
            });
        });
        req.on('error', () => resolve([]));
        req.on('timeout', () => {
            req.destroy();
            resolve([]);
        });
    });
}

// Check if target is a legitimate candidate for injection
function isCandidate(target) {
    const type = target.type;
    const url = target.url || '';
    if (!url) return false;
    if (type === 'service_worker' || type === 'worker' || type === 'shared_worker') return false;
    
    // Safety check: ensure it is a local loopback address, file, or active conversation frame
    const isLocal = url.includes('127.0.0.1') || url.includes('localhost') || url.startsWith('vscode-webview:') || url.startsWith('chrome-extension:') || url.startsWith('file:') || url.includes('/c/');
    if (!isLocal) return false;
    
    return type === 'page' || type === 'iframe' || url.includes('vscode-webview') || url.includes('webview') || url.includes('/c/');
}

// Inject DOMObserver to a target WS
function injectDOMObserver(wsUrl, title, targetId) {
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
        log('CDP', `Connected to target [${targetId.substring(0, 6)}] "${title || 'Untitled'}"`, COLORS.blue);
        
        // 1. Enable Console API notifications
        ws.send(JSON.stringify({
            id: 1,
            method: 'Runtime.enable'
        }));

        // 2. Check if observer is already active (force cleanup of any old observer to ensure fresh injection)
        ws.send(JSON.stringify({
            id: 2,
            method: 'Runtime.evaluate',
            params: {
                expression: 'if (typeof window !== "undefined" && window.__AA_CLEANUP) { try { window.__AA_CLEANUP(); } catch(e){} window.__AA_OBSERVER_ACTIVE = false; } typeof window !== "undefined" && window.__AA_OBSERVER_ACTIVE',
                returnByValue: true
            }
        }));
    });

    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw);

            if (msg.id === 2) {
                const isActive = msg.result?.result?.value;
                if (isActive) {
                    log('AutoAccept', `[${targetId.substring(0, 6)}] Observer already active.`, COLORS.gray);
                } else {
                    log('AutoAccept', `[${targetId.substring(0, 6)}] Observer inactive. Injecting...`, COLORS.yellow);
                    ws.send(JSON.stringify({
                        id: 3,
                        method: 'Runtime.evaluate',
                        params: {
                            expression: buildDOMObserverScript(
                                config.customButtonTexts,
                                config.blockedCommands,
                                config.allowedCommands,
                                config.autoAcceptFileEdits,
                                config.autoRetryEnabled
                            )
                        }
                    }));
                }
            }

            if (msg.id === 3) {
                const result = msg.result?.result?.value;
                if (result === 'observer-installed' || result === 'already-active') {
                    log('AutoAccept', `\x1b[32m✔ Successfully installed observer on [${targetId.substring(0, 6)}]\x1b[0m`, COLORS.green);
                } else {
                    log('AutoAccept', `\x1b[31m✘ Failed observer install: ${result || JSON.stringify(msg.result)}\x1b[0m`, COLORS.red);
                }
            }

            // Execution context cleared (page reload/navigation)
            if (msg.method === 'Runtime.executionContextsCleared') {
                log('AutoAccept', `[${targetId.substring(0, 6)}] Execution context cleared (page reload/navigation). Re-verifying observer...`, COLORS.yellow);
                ws.send(JSON.stringify({
                    id: 2,
                    method: 'Runtime.evaluate',
                    params: {
                        expression: 'typeof window !== "undefined" && window.__AA_OBSERVER_ACTIVE',
                        returnByValue: true
                    }
                }));
            }

            // Real-time Console Log Streaming
            if (msg.method === 'Runtime.consoleAPICalled') {
                const args = msg.params?.args || [];
                const logParts = args.map(a => a.value || '').filter(Boolean);
                const fullLog = logParts.join(' ');
                
                if (fullLog.includes('[AA]')) {
                    if (fullLog.includes('clicking:')) {
                        console.log(`\n${COLORS.bright}${COLORS.green}⚡ [AUTO-CLICKED] ${fullLog.replace('[AA] clicking:', '').trim()}${COLORS.reset}\n`);
                    } else if (fullLog.includes('Blocked by Filter')) {
                        console.log(`\n${COLORS.bright}${COLORS.red}⛔ [FILTER-BLOCKED] ${fullLog.replace('[AA]', '').trim()}${COLORS.reset}\n`);
                    } else {
                        log('Observer', fullLog.replace('[AA]', '').trim(), COLORS.gray);
                    }
                }
            }
        } catch (e) {
            log('CDP', `Message parse error: ${e.message}`, COLORS.red);
        }
    });

    ws.on('close', () => {
        log('CDP', `Disconnected target [${targetId.substring(0, 6)}]`, COLORS.yellow);
        activeConnections.delete(targetId);
    });

    ws.on('error', (err) => {
        log('CDP', `Error on target [${targetId.substring(0, 6)}]: ${err.message}`, COLORS.red);
    });

    activeConnections.set(targetId, { ws, title, wsUrl });
}

function reinjectAll() {
    log('AutoAccept', `Re-injecting script to all ${activeConnections.size} active sessions...`, COLORS.yellow);
    for (const [targetId, conn] of activeConnections) {
        try {
            conn.ws.send(JSON.stringify({
                id: 2,
                method: 'Runtime.evaluate',
                params: {
                    expression: 'window.__AA_CLEANUP(); window.__AA_OBSERVER_ACTIVE = false; "cleaned";',
                    returnByValue: true
                }
            }));
            setTimeout(() => {
                if (activeConnections.has(targetId)) {
                    conn.ws.send(JSON.stringify({
                        id: 2,
                        method: 'Runtime.evaluate',
                        params: {
                            expression: 'typeof window !== "undefined" && window.__AA_OBSERVER_ACTIVE',
                            returnByValue: true
                        }
                    }));
                }
            }, 250);
        } catch (e) {
            log('AutoAccept', `Reinject failed on [${targetId.substring(0, 6)}]: ${e.message}`, COLORS.red);
        }
    }
}

async function runLoop() {
    loadSettings();
    const targets = await getTargetList();
    
    if (targets.length > 0) {
        const candidates = targets.filter(isCandidate);
        
        const activeTargetIds = new Set(targets.map(t => t.id));
        for (const [targetId, conn] of activeConnections) {
            if (!activeTargetIds.has(targetId)) {
                log('CDP', `Target [${targetId.substring(0, 6)}] closed, cleaning up connection`, COLORS.yellow);
                try { conn.ws.close(); } catch(e) {}
                activeConnections.delete(targetId);
            }
        }

        for (const target of candidates) {
            if (!activeConnections.has(target.id) && target.webSocketDebuggerUrl) {
                injectDOMObserver(target.webSocketDebuggerUrl, target.title, target.id);
            }
        }
    }
}

// ─── Mature Matching Engine DOMObserver Script Inlined (Zero Dependencies) ───────────────────
function buildDOMObserverScript(customTexts, blockedCommands, allowedCommands, autoAcceptFileEdits, autoRetryEnabled) {
    blockedCommands = blockedCommands || [];
    allowedCommands = allowedCommands || [];
    if (autoAcceptFileEdits === undefined) autoAcceptFileEdits = true;
    if (autoRetryEnabled === undefined) autoRetryEnabled = true;

    const allTexts = [
        'run',  
        ...(autoAcceptFileEdits ? ['accept', 'accept change', 'accept changes', 'accept edit', 'accept edits', 'write file', 'save changes'] : []),  
        'always allow', 'allow this conversation', 'allow',
        'confirm', 'approve', 'execute', 'allow always', 'yes',
        'yes, allow this time', 'yes, allow always', 'allow this time', 'yes, allow', 'yes, allow for this session', 'yes, run command', 'run command',
        ...(autoRetryEnabled ? ['retry', 'continue'] : []),  
        ...customTexts
    ];
    const expandTexts = ['requires input', 'expand'];

    return `
(function() {
    if (window.__AA_OBSERVER_ACTIVE) return 'already-active';
    window.__AA_OBSERVER_ACTIVE = true;

    function isAgentPanel() { return true; }

    var AMBIGUOUS_TEXTS = { 
        'run': true, 'accept': true, 'allow': true, 'retry': true, 'continue': true,
        'yes': true, 'confirm': true, 'approve': true, 'execute': true
    };
    var SIDEBAR_SELECTORS = '[role="tree"], [role="treeitem"], [role="listbox"], [role="option"], .monaco-list, .conversation-list, .chat-list, .sidebar-list, [data-testid*="convo"], [data-testid*="trajectory"], [class*="conversation-list"], [class*="trajectory"], [class*="history"], [class*="past-chat"], [class*="chat-history"]';
    var LIST_CONTAINER_SELECTORS = SIDEBAR_SELECTORS + ', [class*="overflow-y"][class*="cursor-pointer"], nav, [role="navigation"], [role="menu"], [role="menubar"]';
    var CHAT_PROSE_SELECTORS = 'pre, code, .monaco-editor';

    function isChatProseElement(el) {
        if (!el || !el.closest) return false;
        return !!el.closest(CHAT_PROSE_SELECTORS);
    }

    function isSidebarElement(el) {
        if (!el || !el.closest) return false;
        if (el.closest(SIDEBAR_SELECTORS)) return true;
        return isConversationListItem(el);
    }

    function isConversationListItem(el) {
        if (!el || !el.parentElement) return false;
        var tag = (el.tagName || '').toLowerCase();
        if (tag !== 'div') return false;
        var classes = el.className || '';
        if (typeof classes === 'string' && classes.indexOf('select-none') !== -1 && classes.indexOf('cursor-pointer') !== -1 && classes.indexOf('rounded') !== -1) {
            return true;
        }
        return false;
    }

    var BUTTON_TEXTS = ${JSON.stringify(allTexts)};
    var EXPAND_TEXTS = ${JSON.stringify(expandTexts)};
    var BLOCKED_COMMANDS = ${JSON.stringify(blockedCommands)};
    var ALLOWED_COMMANDS = ${JSON.stringify(allowedCommands)};
    var HAS_FILTERS = BLOCKED_COMMANDS.length > 0 || ALLOWED_COMMANDS.length > 0;

    if (typeof window.__AA_CLEANUP === 'function') window.__AA_CLEANUP();
    window.__AA_CLEANUP = function() {
        if (window.__AA_OBSERVER) { window.__AA_OBSERVER.disconnect(); window.__AA_OBSERVER = null; }
        if (window.__AA_FALLBACK_INTERVAL) { clearInterval(window.__AA_FALLBACK_INTERVAL); window.__AA_FALLBACK_INTERVAL = null; }
    };

    window.__AA_LAST_SCAN = Date.now();
    window.__AA_CLICK_COUNT = window.__AA_CLICK_COUNT || 0;
    window.__AA_BLOCKED = BLOCKED_COMMANDS;
    window.__AA_ALLOWED = ALLOWED_COMMANDS;
    window.__AA_HAS_FILTERS = HAS_FILTERS;
    window.__AA_PAUSED = false; 

    if (!window.__AA_ACTIVITY_TRACKED) {
        window.__AA_ACTIVITY_TRACKED = true;
        window.__AA_LAST_USER_INPUT = Date.now();
        var _trackActivity = function() { window.__AA_LAST_USER_INPUT = Date.now(); };
        document.addEventListener('keydown', _trackActivity, true);
        document.addEventListener('mousedown', _trackActivity, true);
        document.addEventListener('touchstart', _trackActivity, true);
    }

    var DEBUG = true;
    function _log() {
        if (!DEBUG) return; var args = ['[AA]'];
        for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
        console.log.apply(console, args);
    }

    var COOLDOWN_MS = 5000;
    var EXPAND_COOLDOWN_MS = 10000; 
    var clickCooldowns = {};

    function _domPath(el) {
        var parts = []; var curr = el;
        while (curr && curr !== document.body) {
            var parent = curr.parentElement;
            if (!parent && curr.parentNode && curr.parentNode.nodeType === 11) { // 11 is ShadowRoot
                parent = curr.parentNode.host;
            }
            var idx = 0;
            var sibling = curr.previousElementSibling;
            while (sibling) { idx++; sibling = sibling.previousElementSibling; }
            parts.unshift((curr.tagName || '') + '[' + idx + ']');
            curr = parent;
        }
        return parts.join('/');
    }

    function closestClickable(node) {
        var el = node;
        while (el && el !== document.body) {
            var tag = (el.tagName || '').toLowerCase();
            if (tag === 'button' || tag === 'a' || tag === 'label' || tag.includes('button') || tag.includes('btn') ||
                el.getAttribute('role') === 'button' || el.getAttribute('role') === 'link' ||
                el.classList.contains('cursor-pointer') ||
                el.onclick || el.getAttribute('tabindex') === '0') { return el; }
            el = el.parentElement;
        }
        return node;
    }

    function simulateClick(el) {
        if (!el) return;
        try {
            if (typeof el.focus === 'function') el.focus();
        } catch (e) {}
        
        var targetEl = el;
        if ((el.tagName || '').toLowerCase() === 'label') {
            if (el.htmlFor) {
                var associated = document.getElementById(el.htmlFor);
                if (associated) {
                    targetEl = associated;
                }
            } else {
                var innerInput = el.querySelector('input, button');
                if (innerInput) {
                    targetEl = innerInput;
                }
            }
        }
        
        var mouseDownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window });
        targetEl.dispatchEvent(mouseDownEvent);
        var mouseUpEvent = new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window });
        targetEl.dispatchEvent(mouseUpEvent);
        
        if (typeof targetEl.click === 'function') {
            try {
                targetEl.click();
                if (targetEl !== el && typeof el.click === 'function') {
                    el.click();
                }
                return;
            } catch (e) {}
        }
        
        var clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
        targetEl.dispatchEvent(clickEvent);
    }

    var _wordBoundaryRegex = /[a-z0-9_\\\\-\\\\.]/i;
    function isWordBoundary(str, keyLen) {
        if (str.length === keyLen) return true;
        return !_wordBoundaryRegex.test(str.charAt(keyLen));
    }

    function findButton(root, texts) {
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
        var wNode; var best = null; 
        while ((wNode = walker.nextNode())) {
            if (wNode.shadowRoot) {
                var result = findButton(wNode.shadowRoot, texts);
                if (result) {
                    var isDeeperMatch = (best !== null && result.priority === best.priority && best.matchedNode.contains(wNode));
                    if (best === null || result.priority < best.priority || isDeeperMatch) {
                        best = result;
                    }
                }
            }
            var testId = (wNode.getAttribute('data-testid') || wNode.getAttribute('data-action') || '').toLowerCase();
            if (testId.includes('alwaysallow') || testId.includes('always-allow') || testId.includes('allow')) {
                var tag1 = (wNode.tagName || '').toLowerCase();
                if (tag1 === 'button' || tag1.includes('button') || wNode.getAttribute('role') === 'button' || tag1.includes('btn')) {
                    var allowIdx = texts.indexOf('allow');
                    if (allowIdx === -1) allowIdx = texts.length;
                    var isDeeperMatch = (best !== null && allowIdx === best.priority && best.matchedNode.contains(wNode));
                    if (best === null || allowIdx < best.priority || isDeeperMatch) {
                        best = { matchedNode: wNode, node: wNode, matchedText: 'allow', priority: allowIdx };
                    }
                    continue;
                }
            }
            var rawText = (wNode.textContent || '').trim().toLowerCase();
            var nodeText = rawText.replace(/^[^a-z0-9]*(?:(?:alt|ctrl|shift|cmd|meta|opt|option|\\u2318|\\u2325|\\u21E7|\\u2303)\\+?)*\\d+[^a-z0-9]*/i, '').trim();
            if (nodeText.length > 50) {
                if (!window.__AA_SKIP_COUNT) window.__AA_SKIP_COUNT = 0;
                if (window.__AA_SKIP_COUNT < 3) {
                    for (var lt = 0; lt < texts.length; lt++) {
                        if (nodeText.indexOf(texts[lt]) !== -1) { window.__AA_SKIP_COUNT++; break; }
                    }
                }
                continue;
            }

            for (var t = 0; t < texts.length; t++) {
                if (best !== null && t > best.priority) break;
                var text = texts[t];
                var isExpandKeyword = (text === 'expand' || text === 'requires input');
                var isMatch = false;

                if (isExpandKeyword) {
                    if (text === 'expand') {
                        isMatch = nodeText.replace(/[^a-z]/g, '') === 'expand';
                        if (isMatch) {
                            var hasContext = false; var p = wNode;
                            for (var up = 0; up < 6 && p && p !== document.body; up++) {
                                p = p.parentElement;
                                if (p && (p.textContent || '').toLowerCase().indexOf('requires input') !== -1) { hasContext = true; break; }
                            }
                            isMatch = hasContext;
                        }
                    } else if (text === 'requires input') {
                        isMatch = nodeText.indexOf('requires input') !== -1 && nodeText.length <= 80;
                    }
                } else {
                    isMatch = nodeText === text ||
                        (text.length >= 3 && nodeText.startsWith(text) && isWordBoundary(nodeText, text.length) && nodeText.length <= text.length * 3) ||
                        (nodeText.startsWith(text + ' ') && nodeText.length <= text.length * 5) ||
                        (text.length >= 3 && nodeText.startsWith(text) && nodeText.length <= text.length * 5 &&
                            /^(alt|ctrl|shift|cmd|meta|\\u2318|\\u2325|\\u21E7|\\u2303)/.test(nodeText.substring(text.length)));
                }
                if (!isMatch) continue;

                // Skip parent elements if a child also matches to prefer the deepest leaf match
                var hasMatchingChild = false;
                var children = wNode.children;
                if (children && children.length > 0) {
                    for (var ci = 0; ci < children.length; ci++) {
                        var childText = (children[ci].textContent || '').trim().toLowerCase();
                        if (childText.indexOf(text) !== -1) {
                            hasMatchingChild = true;
                            break;
                        }
                    }
                }
                if (hasMatchingChild) continue;

                if (AMBIGUOUS_TEXTS[text]) {
                    var chain = ''; var p = wNode;
                    for (var d = 0; d < 5 && p; d++) { chain += ' > ' + (p.tagName || '?') + '.' + ((p.className || '').substring(0,40)); p = p.parentElement; }
                    _log('DIAG MATCH text="' + text + '" nodeText="' + nodeText.substring(0,50) + '" chain=' + chain);
                }

                var clickable = closestClickable(wNode);
                if (!clickable) { continue; }

                // Chat Prose Isolation Guard: Skip elements in message history/markdown
                if (isChatProseElement(clickable) || isChatProseElement(wNode)) {
                    continue;
                }

                var tag2 = (clickable.tagName || '').toLowerCase();
                var isExpandType = (text === 'expand' && nodeText === 'expand') || text === 'requires input';

                var isSemanticTag2 = (tag2 === 'button' || tag2 === 'a' || tag2 === 'label');
                if (!isSemanticTag2 && AMBIGUOUS_TEXTS[text] && isSidebarElement(clickable)) {
                    _log('DIAG SIDEBAR BLOCKED text="' + text + '" tag2="' + tag2 + '"');
                    continue;
                }

                if (AMBIGUOUS_TEXTS[text] && nodeText === text && !isSemanticTag2) {
                    var hasButtonRole = (clickable.getAttribute('role') === 'button') ||
                        (clickable.getAttribute('role') === 'link') ||
                        clickable.classList.contains('cursor-pointer');
                    if (!hasButtonRole) {
                        _log('DIAG BARE-WORD BLOCKED text="' + text + '" tag2="' + tag2 + '"');
                        continue;
                    }
                }

                if (tag2 === 'button' || tag2 === 'a' || tag2 === 'label' || tag2.includes('button') || tag2.includes('btn') ||
                    clickable.getAttribute('role') === 'button' || clickable.getAttribute('role') === 'link' ||
                    clickable.classList.contains('cursor-pointer') ||
                    clickable.onclick || clickable.getAttribute('tabindex') === '0') {
                    
                    if (clickable.disabled || clickable.getAttribute('aria-disabled') === 'true' ||
                        clickable.classList.contains('loading') || clickable.querySelector('.codicon-loading') ||
                        clickable.getAttribute('data-aa-blocked')) { continue; }

                    if (isExpandKeyword) {
                        var isAlreadyExpanded =
                            clickable.getAttribute('aria-expanded') === 'true' ||
                            clickable.getAttribute('data-state') === 'open' ||
                            clickable.getAttribute('data-state') === 'expanded';
                        if (isAlreadyExpanded) continue;
                    }

                    var btnKey = isExpandType
                        ? _domPath(clickable) + ':expand:' + (clickable.textContent || '').trim().toLowerCase().substring(0, 30)
                        : _domPath(clickable) + ':' + (clickable.textContent || '').trim().toLowerCase().substring(0, 30);
                    var cooldown = isExpandType ? EXPAND_COOLDOWN_MS : COOLDOWN_MS;
                    var lastClick = clickCooldowns[btnKey] || 0;
                    if (lastClick && (Date.now() - lastClick < cooldown)) continue;
                    
                    var isDeeperMatch = (best !== null && t === best.priority && best.matchedNode.contains(wNode));
                    if (best === null || t < best.priority || isDeeperMatch) {
                        best = { matchedNode: wNode, node: clickable, matchedText: text, priority: t };
                    }
                    break; 
                }
            }
        }
        return best;
    }

    var lastPrune = Date.now();
    var PRUNE_INTERVAL_MS = 30000;
    function pruneCooldowns() {
        var now = Date.now(); if (now - lastPrune < PRUNE_INTERVAL_MS) return; lastPrune = now;
        var maxAge = EXPAND_COOLDOWN_MS * 2; var keys = Object.keys(clickCooldowns);
        for (var i = 0; i < keys.length; i++) { if (now - clickCooldowns[keys[i]] > maxAge) { delete clickCooldowns[keys[i]]; } }
    }

    function extractCommandText(btn) {
        try {
            var el = btn;
            for (var i = 0; i < 8 && el && el !== document.body; i++) {
                el = el.parentElement; if (!el) break;
                var codes = el.querySelectorAll('pre, code');
                if (codes.length > 0) {
                    var allText = '';
                    for (var j = 0; j < codes.length; j++) { allText += ' ' + (codes[j].textContent || '').trim(); }
                    return allText.trim();
                }
            }
        } catch (e) { } return null;
    }

    function isCommandAllowed(commandText) {
        var blockedList = window.__AA_BLOCKED || BLOCKED_COMMANDS;
        var allowedList = window.__AA_ALLOWED || ALLOWED_COMMANDS;
        var hasFilters = window.__AA_HAS_FILTERS !== undefined ? window.__AA_HAS_FILTERS : HAS_FILTERS;
        if (!hasFilters) return true;
        if (!commandText) return false; 

        var cmdLower = commandText.toLowerCase();

        function matchesPattern(cmd, pattern) {
            var patLower = pattern.toLowerCase(); var cmdLower = cmd.toLowerCase(); var idx = cmdLower.indexOf(patLower);
            while (idx !== -1) {
                var before = idx === 0 ? ' ' : cmdLower.charAt(idx - 1);
                var after = idx + patLower.length >= cmdLower.length ? ' ' : cmdLower.charAt(idx + patLower.length);
                var delimiters = ${JSON.stringify(' \t\r\n|;&/()[]{}\"\'`$=<>,\\:')};
                if ((idx === 0 || delimiters.indexOf(before) !== -1) && (idx + patLower.length >= cmdLower.length || delimiters.indexOf(after) !== -1)) { return true; }
                idx = cmdLower.indexOf(patLower, idx + 1);
            }
            return false;
        }

        for (var b = 0; b < blockedList.length; b++) { if (matchesPattern(cmdLower, blockedList[b])) { return false; } }
        if (allowedList.length > 0) {
            var allowed = false;
            for (var a = 0; a < allowedList.length; a++) { if (matchesPattern(cmdLower, allowedList[a])) { allowed = true; break; } }
            if (!allowed) return false;
        }
        return true;
    }

    function scanAndClick() {
        window.__AA_LAST_SCAN = Date.now(); 
        window.__AA_SKIP_COUNT = 0; 
        if (window.__AA_PAUSED || window.__AA_SWARM_PAUSED) return null;
        pruneCooldowns();

        if (!isAgentPanel()) return null;

        var allTexts = BUTTON_TEXTS.concat(EXPAND_TEXTS);
        var currentHasFilters = window.__AA_HAS_FILTERS !== undefined ? window.__AA_HAS_FILTERS : HAS_FILTERS;

        var MAX_SCANS = 5;
        for (var scan = 0; scan < MAX_SCANS; scan++) {
            var match = findButton(document.body, allTexts);
            if (!match) return null;

            var btn = match.node; var matchedText = match.matchedText;
            var isExpandBtn = (matchedText === 'expand' || matchedText === 'requires input');

            if (window.__AA_SWARM_PAUSED && (matchedText === 'allow' || matchedText === 'always allow')) {
                continue;
            }

            if (currentHasFilters && !isExpandBtn) {
                var cmdText = extractCommandText(btn);
                if (cmdText !== null) {
                    if (!isCommandAllowed(cmdText)) {
                        btn.setAttribute('data-aa-blocked', 'true');
                        btn.style.cssText += ';background:#4a1c1c !important;opacity:0.6;cursor:not-allowed;';
                        btn.textContent = '\\uD83D\\uDEAB Blocked by Filter';
                        var blockKey = _domPath(btn) + ':' + (btn.textContent || '').trim().toLowerCase().substring(0, 30);
                        clickCooldowns[blockKey] = Date.now() + 10000;
                        continue; 
                    }
                }
            }

            var isRecovery = matchedText === 'retry' || matchedText === 'continue';
            if (isRecovery) {
                window.__AA_RECOVERY_TS = window.__AA_RECOVERY_TS || []; var now = Date.now();
                window.__AA_RECOVERY_TS = window.__AA_RECOVERY_TS.filter(function(ts) { return now - ts < 60000; });
                if (window.__AA_RECOVERY_TS.length >= 3) { return 'blocked:circuit_breaker'; }
                window.__AA_RECOVERY_TS.push(now);
            } else { window.__AA_RECOVERY_TS = []; }

            var key = isExpandBtn 
                ? _domPath(btn) + ':expand:' + (btn.textContent || '').trim().toLowerCase().substring(0, 30)
                : _domPath(btn) + ':' + (btn.textContent || '').trim().toLowerCase().substring(0, 30);
            clickCooldowns[key] = Date.now();
            
            if (!window.__AA_CLICK_LOG) window.__AA_CLICK_LOG = [];
            window.__AA_CLICK_LOG.push({ text: matchedText, tag: (btn.tagName || '').toLowerCase(), path: _domPath(btn), time: Date.now() });
            
            _log('clicking:', matchedText, 'tag:', (btn.tagName || ''), 'path:', _domPath(btn));
            simulateClick(btn);
            window.__AA_CLICK_COUNT = (window.__AA_CLICK_COUNT || 0) + 1;

            // 2-step dialog: after clicking a radio label, find and click Submit globally
            var isPermissionLabel = (btn.tagName || '').toLowerCase() === 'label' ||
                ((btn.tagName || '').toLowerCase() === 'input' && btn.type === 'radio');
            var isPermissionText = matchedText === 'yes, allow this time' || matchedText === 'yes, allow always' ||
                matchedText === 'allow this time' || matchedText === 'yes, allow' ||
                matchedText === 'yes, allow for this session' || matchedText === 'allow' ||
                matchedText === 'always allow' || matchedText === 'allow this conversation';
            if (isPermissionLabel || isPermissionText) {
                setTimeout(function() {
                    try {
                        // Look specifically for BUTTON (not DIV[role=button]) to avoid the chat send button
                        // which also has "Submit" text but is not the permission dialog submit
                        var allBtns = Array.from(document.querySelectorAll('button'));
                        var found = allBtns.find(function(el) {
                            var t = (el.innerText || el.textContent || '').trim().toLowerCase();
                            return t === 'submit' || t.indexOf('submit') === 0;
                        });
                        if (found && found.offsetParent !== null) {
                            _log('clicking: submit (2-step)', 'tag:', (found.tagName || ''), 'type:', (found.type || ''), 'text:', (found.innerText || '').trim().slice(0, 30));
                            simulateClick(found);
                            window.__AA_CLICK_COUNT = (window.__AA_CLICK_COUNT || 0) + 1;
                        } else {
                            _log('submit-followup: no visible submit button found');
                        }
                    } catch(e2) { _log('submit-followup error:', e2.message); }
                }, 120);
            }

            return 'clicked:' + matchedText;
        }
        return null; 
    }

    try { scanAndClick(); } catch(e) { _log('initial scan error:', e.message); }

    var __AA_SCAN_QUEUED = false;
    var observer = new MutationObserver(function() {
        if (__AA_SCAN_QUEUED || window.__AA_PAUSED || window.__AA_SWARM_PAUSED) return;
        __AA_SCAN_QUEUED = true;
        setTimeout(function() {
            try { scanAndClick(); } catch(e) { _log('scan error:', e.message); } finally { __AA_SCAN_QUEUED = false; }
        }, 0);
    });

    observer.observe(document.documentElement, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-expanded', 'data-state']
    });

    // Post-observe immediate scan: catches dialogs that appeared between initial scan and observer attach
    setTimeout(function() { try { scanAndClick(); } catch(e) {} }, 0);

    if (window.__AA_FALLBACK_INTERVAL) { clearInterval(window.__AA_FALLBACK_INTERVAL); }
    window.__AA_FALLBACK_INTERVAL = setInterval(function() {
        if (window.__AA_PAUSED || window.__AA_SWARM_PAUSED) return; window.__AA_LAST_SCAN = Date.now();
        setTimeout(function() { try { scanAndClick(); } catch(e) { } }, 0);
    }, 10000);

    window.__AA_OBSERVER = observer;
    return 'observer-installed';
})()
`;
}

// Print startup banner
console.clear();
console.log(`${COLORS.bright}${COLORS.green}══════════════════════════════════════════════════════════════`);
console.log(`                ANTIGRAVITY AUTOACCEPT DAEMON v2.0`);
console.log(`         Out-of-Process Background Agent for Antigravity`);
console.log(`══════════════════════════════════════════════════════════════${COLORS.reset}`);
log('System', 'Initializing background daemon...', COLORS.green);

loadSettings();
log('System', `Targeting Chrome DevTools Port: ${COLORS.bright}${resolveCdpPort()}${COLORS.reset}`, COLORS.green);

// Startup polling loop
setInterval(runLoop, 2000);
runLoop();
log('System', 'Daemon active & polling every 2s. Press Ctrl+C to stop.', COLORS.green);
