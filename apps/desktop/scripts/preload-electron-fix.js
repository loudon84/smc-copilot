// preload-electron-fix.js
// Get built-in electron module and inject it into require cache before npm package gets resolved

const Module = require('module');
const path = require('path');
const projectRoot = path.resolve(__dirname, '..');

// Get the built-in electron module by temporarily clearing module.paths
const originalPaths = module.paths.slice();
module.paths.length = 0;

let builtinElectron;
try {
  builtinElectron = require('electron');
} finally {
  module.paths.length = 0;
  module.paths.push(...originalPaths);
}

console.log('[PRELOAD] Built-in electron:', typeof builtinElectron, 'app:', typeof builtinElectron?.app);

if (typeof builtinElectron === 'object' && builtinElectron.app) {
  // Intercept Module._resolveFilename to inject built-in electron
  const originalResolveFilename = Module._resolveFilename;
  
  Module._resolveFilename = function(request, parent, isMain, options) {
    if (request === 'electron') {
      // Return a fake path that we'll use for caching
      return 'electron-builtin';
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
  
  // Create a fake module for electron
  const electronModule = new Module('electron-builtin');
  electronModule.exports = builtinElectron;
  electronModule.loaded = true;
  Module._cache['electron-builtin'] = electronModule;
  
  console.log('[PRELOAD] Electron module injected');
} else {
  console.error('[PRELOAD] Failed to get built-in electron module');
  process.exit(1);
}
