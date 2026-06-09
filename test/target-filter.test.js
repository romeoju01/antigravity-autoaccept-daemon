const assert = require('node:assert/strict');

const {
    isCandidate,
    isLocalDebuggerUrl,
    isLoopbackHostname,
    isTrustedTargetUrl
} = require('../autoaccept-daemon');

assert.equal(isLoopbackHostname('localhost'), true);
assert.equal(isLoopbackHostname('127.0.0.1'), true);
assert.equal(isLoopbackHostname('127.10.20.30'), true);
assert.equal(isLoopbackHostname('127.999.999.999'), false);
assert.equal(isLoopbackHostname('[::1]'), true);
assert.equal(isLoopbackHostname('notlocalhost.example'), false);

assert.equal(isTrustedTargetUrl('https://127.0.0.1:48983/c/session-id'), true);
assert.equal(isTrustedTargetUrl('http://localhost:3000/c/session-id'), true);
assert.equal(isTrustedTargetUrl('https://example.com/c/session-id'), false);
assert.equal(isTrustedTargetUrl('https://notlocalhost.example/c/session-id'), false);

assert.equal(isCandidate({ type: 'page', url: 'https://127.0.0.1:48983/c/session-id' }), true);
assert.equal(isCandidate({ type: 'iframe', url: 'vscode-webview://frame' }), true);
assert.equal(isCandidate({ type: 'worker', url: 'https://127.0.0.1:48983/c/session-id' }), false);
assert.equal(isCandidate({ type: 'page', url: 'https://example.com/c/session-id' }), false);

assert.equal(isLocalDebuggerUrl('ws://127.0.0.1:9334/devtools/page/id'), true);
assert.equal(isLocalDebuggerUrl('ws://localhost:9334/devtools/page/id'), true);
assert.equal(isLocalDebuggerUrl('wss://example.com/devtools/page/id'), false);

console.log('target-filter tests passed');
