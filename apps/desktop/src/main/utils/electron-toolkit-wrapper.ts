// Wrapper for @electron-toolkit/utils that ensures electron module is loaded correctly
// This file should be used as an external module in electron-vite config

let electron: typeof import('electron');

function getElectron() {
  if (!electron) {
    // Try to get electron module
    // In Electron runtime, require('electron') should return the built-in module
    // but in some cases (npm package present), it returns the path string
    const mod = require('electron');
    if (typeof mod === 'object' && mod.app) {
      electron = mod;
    } else {
      // Force reload by clearing require cache and trying again
      const electronPath = require.resolve('electron');
      delete require.cache[electronPath];
      // The second require should work if we're in Electron runtime
      electron = require('electron');
      if (typeof electron !== 'object' || !electron.app) {
        throw new Error(
          'Failed to load Electron module. ' +
          'Make sure this code is running in Electron runtime, not Node.js. ' +
          'Current require("electron") returned: ' + typeof electron
        );
      }
    }
  }
  return electron;
}

export const is = {
  get dev() {
    return !getElectron().app.isPackaged;
  },
};

export const platform = {
  get isWindows() {
    return process.platform === 'win32';
  },
  get isMacOS() {
    return process.platform === 'darwin';
  },
  get isLinux() {
    return process.platform === 'linux';
  },
};

export const electronApp = {
  setAppUserModelId(id: string) {
    if (platform.isWindows) {
      getElectron().app.setAppUserModelId(is.dev ? process.execPath : id);
    }
  },
  setAutoLaunch(auto: boolean) {
    if (platform.isWindows) {
      getElectron().app.setLoginItemSettings({ openAtLogin: auto, openAsHidden: true });
    } else if (platform.isMacOS) {
      getElectron().app.setLoginItemSettings({ openAtLogin: auto, openAsHidden: true });
    }
  },
};

export const optimizer = {
  watchWindowShortcuts(window: import('electron').BrowserWindow) {
    // No-op for now - this is a dev tool optimization
  },
};
