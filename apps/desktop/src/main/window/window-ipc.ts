import { BrowserWindow, ipcMain } from "electron";

let registered = false;
let mainBrowserWindow: BrowserWindow | null = null;

function resolveTargetWindow(): BrowserWindow | null {
  if (mainBrowserWindow && !mainBrowserWindow.isDestroyed()) {
    return mainBrowserWindow;
  }

  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) {
    return focused;
  }

  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      return win;
    }
  }

  return null;
}

/** Bind the primary app window for frameless window controls (Windows/Linux). */
export function bindMainBrowserWindow(win: BrowserWindow | null): void {
  mainBrowserWindow = win;
}

export function registerWindowIpc(): void {
  console.log("[WINDOW-IPC] registerWindowIpc called, registered =", registered);
  if (registered) {
    console.log("[WINDOW-IPC] Already registered, skipping");
    return;
  }
  registered = true;
  console.log("[WINDOW-IPC] Registering window IPC handlers...");

  // Helper to safely register handler (ignore if already registered)
  const safeHandle = (channel: string, handler: () => void | boolean | Promise<void | boolean>) => {
    try {
      ipcMain.handle(channel, handler);
      console.log(`[WINDOW-IPC] Registered handler for ${channel}`);
    } catch (err) {
      // Handler might already be registered
      console.log(`[WINDOW-IPC] Handler for ${channel} already exists or error:`, err);
    }
  };

  safeHandle("window:minimize", () => {
    const win = resolveTargetWindow();
    if (!win) {
      console.warn("[WINDOW-IPC] minimize: no target window found");
      return;
    }
    win.minimize();
  });

  safeHandle("window:maximize-or-restore", () => {
    const win = resolveTargetWindow();
    if (!win) {
      console.warn("[WINDOW-IPC] maximize-or-restore: no target window found");
      return;
    }

    if (win.isMaximized()) {
      win.unmaximize();
      return;
    }

    win.maximize();
  });

  safeHandle("window:close", () => {
    const win = resolveTargetWindow();
    if (!win) {
      console.warn("[WINDOW-IPC] close: no target window found");
      return;
    }
    win.close();
  });

  safeHandle("window:is-maximized", () => {
    const win = resolveTargetWindow();
    if (!win) {
      console.warn("[WINDOW-IPC] is-maximized: no target window found");
      return false;
    }
    return win.isMaximized();
  });

  console.log("[WINDOW-IPC] All window IPC handlers registered successfully");
}
