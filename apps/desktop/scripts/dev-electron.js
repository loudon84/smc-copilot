const { spawn } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname);
const electronExe = path.join(projectRoot, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
const mainEntry = path.join(projectRoot, 'out', 'main', 'index.js');

const child = spawn(electronExe, [mainEntry, ...process.argv.slice(2)], {
  cwd: path.resolve('/'),
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_DEV: '1',
  },
});

child.on('close', (code) => process.exit(code || 0));
child.on('error', (err) => {
  console.error('Failed to start Electron:', err);
  process.exit(1);
});
