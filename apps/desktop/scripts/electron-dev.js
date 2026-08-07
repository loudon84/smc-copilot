const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..');

// Get electron executable path
const electronPath = path.join(
  projectRoot, 
  'node_modules', 
  'electron', 
  'dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron'
);

// Main entry
const mainEntry = path.join(projectRoot, 'out', 'main', 'index.js');

console.log('[electron-dev] Project root:', projectRoot);
console.log('[electron-dev] Electron path:', electronPath);
console.log('[electron-dev] Main entry:', mainEntry);

// Start electron from a temp directory to avoid node_modules resolution
const tempCwd = path.resolve(process.env.TEMP || process.env.TMP || '/tmp');

console.log('[electron-dev] Starting from:', tempCwd);

const child = spawn(electronPath, [mainEntry], {
  cwd: tempCwd,
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: undefined, // Make sure we're not running as Node
  },
});

child.on('close', (code) => {
  console.log(`[electron-dev] Electron exited with code ${code}`);
  process.exit(code || 0);
});

child.on('error', (err) => {
  console.error('[electron-dev] Failed to start Electron:', err);
  process.exit(1);
});
