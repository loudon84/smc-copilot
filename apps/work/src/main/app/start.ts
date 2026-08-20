import { app, BrowserWindow, nativeTheme, session, shell } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import icon from "../../../resources/icon.png?asset";
import { getPublicConnectionConfig } from "../config";
import { stopHealthPolling } from "../hermes";
import { stopAllDashboards } from "../dashboard";
import { cleanupTempMediaFiles } from "../media";
import { runFilesCleanupBestEffort } from "../files/file-cleanup-service";
import { closeDbConnection } from "../db";
import { stopSshTunnel } from "../ssh-tunnel";
import {
  hardenAttachedWebContents,
  hardenWebviewPreferences,
  isAllowedAppNavigationUrl,
  isAllowedExternalUrl,
  isAllowedWebviewUrl,
} from "../security";
import { registerIpcHandlers } from "../ipc/register";
import { registerAuthIpc } from "../auth/auth-ipc";
import { setGatewayPromptParent } from "../gatewayPrompt";
import { showChatContextMenu } from "./context-menu";
import { buildMenu } from "./menu";
import { createAppTray, type AppTray } from "./tray";
import { setupUpdater } from "./updater";
import { registerArtifactProtocolHandler } from "../artifact-protocol";
import { logWorkStartupIdentity } from "../build-info";
import { readControlOwnerSnapshot } from "../hermes/control-owner";

const APP_NAME = process.env.HERMES_DESKTOP_APP_NAME?.trim() || "SMC-Copilot";
const OPEN_DEVTOOLS_ON_START =
  process.env.HERMES_OPEN_DEVTOOLS === "1" ||
  process.env.HERMES_DESKTOP_OPEN_DEVTOOLS === "1";

/** Close-to-tray applies on Windows (and Linux); macOS keeps dock hide semantics. */
const CLOSE_TO_TRAY =
  process.platform === "win32" || process.platform === "linux";

let mainWindow: BrowserWindow | null = null;
let appTray: AppTray | null = null;
let isQuitting = false;
const activeRuns = new Map<string, () => void>();

function requestQuit(): void {
  isQuitting = true;
  appTray?.destroy();
  appTray = null;
  app.quit();
}

export function startMainProcess(): void {
  process.on("uncaughtException", (err) => {
    console.error("[MAIN UNCAUGHT]", err);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[MAIN UNHANDLED REJECTION]", reason);
  });

  registerIpcHandlers({
    activeRuns,
    getMainWindow: () => mainWindow,
    notifyConnectionConfigChanged,
    notifyModelLibraryChanged,
    notifyCustomProvidersChanged,
    openExternalUrl,
    requestQuit,
  });
  registerAuthIpc();

  setupUpdater({ getMainWindow: () => mainWindow });

  app.whenReady().then(() => {
    electronApp.setAppUserModelId("com.smc.copilot");
    logWorkStartupIdentity(readControlOwnerSnapshot().owner);

    registerArtifactProtocolHandler();

    app.on("browser-window-created", (_, window) => {
      optimizer.watchWindowShortcuts(window);
    });

    app.on("web-contents-created", (_event, contents) => {
      if (contents.getType() === "webview") {
        // The web preview webview is the only one allowed to load remote HTTPS.
        // Identify it reliably by its session: a <webview partition="web-preview">
        // shares the singleton in-memory session returned by fromPartition().
        // The partition session is the only dependable signal available in
        // web-contents-created — without it, post-attach redirects/navigations
        // (e.g. google.com -> www.google.com) are wrongly blocked.
        const isWebPreview =
          contents.session === session.fromPartition("web-preview");
        hardenAttachedWebContents(contents, isWebPreview);
      }
    });

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders: Record<string, string[]> = {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: blob: file: https:; " +
            "media-src 'self' data: blob: file: https:; " +
            "connect-src 'self' blob: http://127.0.0.1:* ws://127.0.0.1:* http://localhost:* ws://localhost:* https: wss:; " +
            "font-src 'self' data:; " +
            "frame-src 'self' https: http://127.0.0.1:* http://localhost:*; " +
            "object-src 'none'; " +
            "base-uri 'self';",
        ],
      };
      // Registry MCP icons are immutable, content-addressed SVGs. Rewrite their
      // Cache-Control to a year (immutable ⇒ no revalidation) so each is fetched
      // at most once and served from the on-disk HTTP cache thereafter.
      if (
        details.url.startsWith("https://registry.hermesone.org/registry-icon/")
      ) {
        for (const key of Object.keys(responseHeaders)) {
          if (key.toLowerCase() === "cache-control") {
            delete responseHeaders[key];
          }
        }
        responseHeaders["Cache-Control"] = [
          "public, max-age=31536000, immutable",
        ];
      }
      callback({ responseHeaders });
    });

    createWindow();
    buildMenu({
      getMainWindow: () => mainWindow,
      openExternalUrl,
      requestQuit,
    });
    // Ensure the menu bar stays visible after the template is installed
    // (Windows can still hide it if autoHide was previously true on a reused
    // BrowserWindow options path).
    if (process.platform !== "darwin" && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAutoHideMenuBar(false);
      mainWindow.setMenuBarVisibility(true);
    }

    if (CLOSE_TO_TRAY) {
      appTray = createAppTray({
        getMainWindow: () => mainWindow,
        iconPath: icon,
        tooltip: APP_NAME,
        onQuit: requestQuit,
      });
    }

    // Best-effort File Platform orphan/temp retention (PR-17).
    try {
      runFilesCleanupBestEffort();
    } catch {
      // Never block startup on cleanup failures.
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
        return;
      }
      // Restore a tray-hidden window when the dock/taskbar activates the app.
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });
  });

  app.on("window-all-closed", () => {
    // Close-to-tray keeps the BrowserWindow alive (hidden); only quit when
    // there are truly no windows and we are not parking in the tray.
    if (process.platform === "darwin") return;
    if (CLOSE_TO_TRAY && appTray?.isCreated() && !isQuitting) return;
    app.quit();
  });

  app.on("before-quit", () => {
    isQuitting = true;
    appTray?.destroy();
    appTray = null;
    stopHealthPolling();
    for (const abort of activeRuns.values()) abort();
    activeRuns.clear();
    cleanupTempMediaFiles();
    stopAllDashboards();
    // Kill the SSH tunnel process on quit — otherwise the `ssh -N -L` child is
    // orphaned (reparented to PID 1) and keeps holding its local port, so each
    // relaunch leaks another tunnel and the port drifts (18642 → 61799 → …).
    stopSshTunnel();
    closeDbConnection();
  });
}

function notifyConnectionConfigChanged(): void {
  mainWindow?.webContents.send(
    "connection-config-changed",
    getPublicConnectionConfig(),
  );
}

function notifyModelLibraryChanged(): void {
  mainWindow?.webContents.send("model-library-changed");
}

function notifyCustomProvidersChanged(): void {
  mainWindow?.webContents.send("custom-providers-changed");
}

function openExternalUrl(rawUrl: unknown): void {
  if (!isAllowedExternalUrl(rawUrl)) {
    console.warn("[SECURITY] Blocked unsafe external URL");
    return;
  }
  shell.openExternal(rawUrl).catch((err) => {
    console.error("[SECURITY] Failed to open external URL:", err);
  });
}

function createWindow(): void {
  const rendererHtmlPath = join(__dirname, "../renderer/index.html");
  // Default the vibrancy material to dark (the app's default theme) so the
  // first paint isn't a light, milky frost; the renderer overrides this to
  // match the stored theme as soon as ThemeProvider mounts.
  nativeTheme.themeSource = "dark";
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 850,
    minWidth: 900,
    title: APP_NAME,
    minHeight: 600,
    show: false,
    // Windows/Linux: keep the native application menu (Chat / Edit / View / …)
    // visible on the main window. Alt-to-reveal (auto-hide) made the menu easy
    // to miss and broke discoverability of Cmd/Ctrl+N / Cmd/Ctrl+K.
    autoHideMenuBar: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : undefined,
    // macOS: translucent window material so the sidebar reads as frosted glass.
    // The material's light/dark tone follows `nativeTheme.themeSource`, which
    // the renderer keeps in step with the app theme (default dark below) — so a
    // dark theme never renders a light, milky sidebar.
    ...(process.platform === "darwin"
      ? {
          trafficLightPosition: { x: 16, y: 16 },
          vibrancy: "under-window" as const,
          visualEffectState: "active" as const,
          backgroundColor: "#00000000",
        }
      : {}),
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: true,
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow?.show());
  // Windows/Linux: title-bar [X] hides to the tray instead of quitting.
  // Real quit comes from tray "Quit", menu Quit, or quit-app IPC.
  mainWindow.on("close", (event) => {
    if (isQuitting || !CLOSE_TO_TRAY) return;
    if (!appTray?.isCreated()) return;
    event.preventDefault();
    mainWindow?.hide();
  });
  mainWindow.webContents.once("did-finish-load", () => {
    if (OPEN_DEVTOOLS_ON_START) {
      mainWindow?.webContents.openDevTools({ mode: "detach" });
    }
  });

  // Let mid-turn gateway sudo/secret prompts parent their modal to this window.
  setGatewayPromptParent(() => mainWindow);

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(
      "[CRASH] Renderer process gone:",
      details.reason,
      details.exitCode,
    );
  });
  mainWindow.webContents.on("console-message", (details) => {
    // Electron ≥35 passes a single event object (level is now a string);
    // the old positional `(event, level, message, line, sourceId)` signature
    // is deprecated.
    if (details.level === "error") {
      console.error(
        `[RENDERER ERROR] ${details.message} (${details.sourceId}:${details.lineNumber})`,
      );
    }
  });
  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription) => {
      console.error("[LOAD FAIL]", errorCode, errorDescription);
    },
  );
  mainWindow.webContents.setWindowOpenHandler((details) => {
    openExternalUrl(details.url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (
      isAllowedAppNavigationUrl(
        url,
        rendererHtmlPath,
        is.dev ? process.env["ELECTRON_RENDERER_URL"] : undefined,
      )
    )
      return;
    event.preventDefault();
    openExternalUrl(url);
  });
  mainWindow.webContents.on(
    "will-attach-webview",
    (event, webPreferences, params) => {
      const isWebPreview = params.partition === "web-preview";
      if (!isAllowedWebviewUrl(params.src, isWebPreview)) {
        event.preventDefault();
        console.warn("[SECURITY] Blocked webview attachment for untrusted URL");
        return;
      }
      hardenWebviewPreferences(webPreferences);
    },
  );
  mainWindow.webContents.on("context-menu", (_event, params) => {
    showChatContextMenu(mainWindow, params);
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(rendererHtmlPath);
  }
}
