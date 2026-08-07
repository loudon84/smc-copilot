// Safe wrapper for electron module
// Resolves the npm electron package issue where require('electron') returns a string path

type ElectronModule = typeof import('electron');

let _electron: ElectronModule | null = null;

function getElectronModule(): ElectronModule {
  if (_electron) return _electron;
  
  // Try to get the real electron module
  const mod = require('electron');
  
  if (typeof mod === 'object' && mod.app) {
    _electron = mod as ElectronModule;
    return _electron;
  }
  
  // If we got a string (npm package), we need to get the built-in module
  // This happens when node_modules/electron is resolved before the built-in
  if (typeof mod === 'string') {
    // Use process.binding to get the real electron module
    try {
      // @ts-ignore - process.binding is internal
      const binding = process.binding('electron') as ElectronModule;
      if (binding && typeof binding === 'object') {
        _electron = binding;
        return _electron;
      }
    } catch {}
    
    // Alternative: try to access electron through global
    try {
      // @ts-ignore
      const globalElectron = globalThis.__electron__ as ElectronModule;
      if (globalElectron && typeof globalElectron === 'object' && globalElectron.app) {
        _electron = globalElectron;
        return _electron;
      }
    } catch {}
    
    throw new Error(
      `Electron module resolution failed. require('electron') returned: ${mod}. ` +
      `This usually happens when the npm electron package is found before the built-in module. ` +
      `Working directory: ${process.cwd()}`
    );
  }
  
  _electron = mod as ElectronModule;
  return _electron;
}

// Export getters that ensure electron is loaded
export const app = new Proxy({} as import('electron').App, {
  get(_, prop) {
    return getElectronModule().app[prop as keyof import('electron').App];
  },
});

export const BrowserWindow = new Proxy({} as typeof import('electron').BrowserWindow, {
  get(_, prop) {
    return getElectronModule().BrowserWindow[prop as keyof typeof import('electron').BrowserWindow];
  },
  apply(_, thisArg, args) {
    return new (getElectronModule().BrowserWindow)(...args);
  },
  construct(_, args) {
    return new (getElectronModule().BrowserWindow)(...args);
  },
}) as typeof import('electron').BrowserWindow;

export const ipcMain = new Proxy({} as typeof import('electron').ipcMain, {
  get(_, prop) {
    return getElectronModule().ipcMain[prop as keyof typeof import('electron').ipcMain];
  },
}) as typeof import('electron').ipcMain;

export const Menu = new Proxy({} as typeof import('electron').Menu, {
  get(_, prop) {
    return getElectronModule().Menu[prop as keyof typeof import('electron').Menu];
  },
}) as typeof import('electron').Menu;

export const Notification = new Proxy({} as typeof import('electron').Notification, {
  get(_, prop) {
    return getElectronModule().Notification[prop as keyof typeof import('electron').Notification];
  },
  construct(_, args) {
    return new (getElectronModule().Notification)(...args);
  },
}) as typeof import('electron').Notification;

export const shell = new Proxy({} as typeof import('electron').shell, {
  get(_, prop) {
    return getElectronModule().shell[prop as keyof typeof import('electron').shell];
  },
}) as typeof import('electron').shell;

export const dialog = new Proxy({} as typeof import('electron').dialog, {
  get(_, prop) {
    return getElectronModule().dialog[prop as keyof typeof import('electron').dialog];
  },
}) as typeof import('electron').dialog;

export const Tray = new Proxy({} as typeof import('electron').Tray, {
  construct(_, args: ConstructorParameters<typeof import('electron').Tray>) {
    return new (getElectronModule().Tray)(...args);
  },
}) as typeof import('electron').Tray;

export const nativeImage = new Proxy({} as typeof import('electron').nativeImage, {
  get(_, prop) {
    return getElectronModule().nativeImage[prop as keyof typeof import('electron').nativeImage];
  },
}) as typeof import('electron').nativeImage;

export const screen = new Proxy({} as typeof import('electron').screen, {
  get(_, prop) {
    return getElectronModule().screen[prop as keyof typeof import('electron').screen];
  },
}) as typeof import('electron').screen;

export const clipboard = new Proxy({} as typeof import('electron').clipboard, {
  get(_, prop) {
    return getElectronModule().clipboard[prop as keyof typeof import('electron').clipboard];
  },
}) as typeof import('electron').clipboard;

// Export the full module getter for advanced use
export { getElectronModule };
