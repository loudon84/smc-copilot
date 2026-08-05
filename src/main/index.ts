import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  Menu,
  Notification,
} from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "./utils/electron-toolkit-wrapper";
import type { AppUpdater } from "electron-updater";
import icon from "../../resources/icon.png?asset";
import {
  checkInstallStatus,
  verifyInstall,
  runInstall,
  runInstallWithSource,
  getHermesVersion,
  clearVersionCache,
  runHermesDoctor,
  runHermesUpdate,
  checkOpenClawExists,
  runClawMigrate,
  runHermesBackup,
  runHermesImport,
  runHermesDump,
  listMcpServers,
  discoverMemoryProviders,
  readLogs,
  InstallProgress,
} from "./installer";
import {
  isRemoteMode,
  isRemoteOnlyMode,
  sendMessage,
  startGateway,
  stopGateway,
  isGatewayRunning,
  restartGateway,
  setHealthStatusCallback,
  ensureSshTunnelIfNeeded,
  setSshRemoteApiKey,
  stopHealthPolling,
  testRemoteConnection,
} from "./hermes";
import {
  startSshTunnel,
  stopSshTunnel,
  testSshConnection,
  isSshTunnelActive,
  isSshTunnelHealthy,
} from "./ssh-tunnel";
import {
  getClaw3dStatus,
  setupClaw3d,
  startDevServer,
  stopDevServer,
  startAdapter,
  stopAdapter,
  startAll as startClaw3dAll,
  stopAll as stopClaw3d,
  getClaw3dLogs,
  setClaw3dPort,
  getClaw3dPort,
  setClaw3dWsUrl,
  getClaw3dWsUrl,
  Claw3dSetupProgress,
} from "./claw3d";
import {
  readEnv,
  setEnvValue,
  getConfigValue,
  setConfigValue,
  getHermesHome,
  getModelConfig,
  setModelConfig,
  getCredentialPool,
  setCredentialPool,
  getConnectionConfig,
  getFullConnectionConfig,
  setConnectionConfig,
  getPlatformEnabled,
  setPlatformEnabled,
} from "./config";
import { listSessions, getSessionMessages, searchSessions } from "./sessions";
import {
  syncSessionCache,
  listCachedSessions,
  updateSessionTitle,
} from "./session-cache";
import { listModels, addModel, removeModel, updateModel } from "./models";
import { syncCustomProvidersFromModels } from "./hermes-config/hermes-config-yaml";
import {
  listProfiles,
  createProfile,
  deleteProfile,
  setActiveProfile,
} from "./profiles";
import {
  readMemory,
  addMemoryEntry,
  updateMemoryEntry,
  removeMemoryEntry,
  writeMemoryContent,
  writeUserProfile,
} from "./memory";
import { readSoul, writeSoul, resetSoul } from "./soul";
import { getToolsets, setToolsetEnabled } from "./tools";
import {
  listInstalledSkills,
  listBundledSkills,
  getSkillContent,
  installSkill,
  uninstallSkill,
} from "./skills";
import {
  listCronJobs,
  createCronJob,
  removeCronJob,
  pauseCronJob,
  resumeCronJob,
  triggerCronJob,
} from "./cronjobs";
import { getAppLocale, setAppLocale } from "./locale";
import type { AppLocale } from "../shared/i18n/types";
import { ShellBrowserViewAdapter } from "./browser/shell-browser-view-adapter";
import { BrowserSecurityGuard } from "./browser/browser-security";
import { BrowserAuditLogger } from "./browser/browser-audit";
import { BrowserController } from "./browser/browser-controller";
import { BrowserIPC } from "./browser/browser-ipc";
import { setupCrmBridge, teardownCrmBridge } from "./crm-bridge";
import { registerWebOperatorCrmPreloadSession } from "./crm-bridge/register-web-operator-preload";
import { BrowserToolBridge } from "./browser/browser-tool-bridge";
import { BrowserToolServer } from "./browser/browser-tool-server";
import { profileHome } from "./utils";
import {
  sshListInstalledSkills,
  sshGetSkillContent,
  sshInstallSkill,
  sshUninstallSkill,
  sshListBundledSkills,
  sshReadMemory,
  sshAddMemoryEntry,
  sshUpdateMemoryEntry,
  sshRemoveMemoryEntry,
  sshWriteUserProfile,
  sshReadSoul,
  sshWriteSoul,
  sshResetSoul,
  sshGetToolsets,
  sshSetToolsetEnabled,
  sshReadEnv,
  sshSetEnvValue,
  sshGetConfigValue,
  sshSetConfigValue,
  sshGetHermesHome,
  sshGetModelConfig,
  sshSetModelConfig,
  sshListSessions,
  sshGetSessionMessages,
  sshSearchSessions,
  sshListProfiles,
  sshCreateProfile,
  sshDeleteProfile,
  sshGatewayStatus,
  sshStartGateway,
  sshStopGateway,
  sshReadRemoteApiKey,
  sshGetHermesVersion,
  sshReadLogs,
  sshGetPlatformEnabled,
  sshSetPlatformEnabled,
  sshListCachedSessions,
  sshRunDoctor,
  sshListModels,
  sshRunUpdate,
  sshRunDump,
  sshDiscoverMemoryProviders,
} from "./ssh-remote";
import { bindMainBrowserWindow, registerWindowIpc } from "./window/window-ipc";
import { setupProfileRuntimeIPC } from "./profile-runtime-ipc";
import { generateId, getProfileByName, insertAuditEvent } from "./profile-runtime-db";
import { setupWorkspacesIPC } from "./workspaces-ipc";
import { registerWorkspaceChatIpc } from "./workspace-chat/workspace-chat-ipc";
import { registerHermesDefaultChatIpc } from "./hermes-default-chat/hermes-default-chat-ipc";
import {
  registerChatRuntimeIpc,
  shutdownChatRuntimeIpc,
} from "./chat-runtime/chat-runtime-ipc";
import { registerChatFilesIpc } from "./chat-files/chat-files-ipc";
import { registerWebOperatorTaskSessionIpc } from "./web-operator-task-session-ipc";
import { setupProfileRoleIPC } from "./profile-role-ipc";
import { registerFirstRunWizardIPC } from "./enterprise/first-run-wizard";
import { setupEnterpriseInstallIpcEarly, setupEnterpriseInstallIPC } from "./enterprise/enterprise-ipc";
import { registerAiosIpc } from "./aios/aios-ipc";
import { mergeRuntimeConfig } from "./enterprise/desktop-runtime-config";
import {
  autoStartCopilotServeIfReady,
  registerCopilotServeIpc,
} from "./copilot-serve/copilot-serve-ipc";
import { registerAuthIpc } from "./auth/auth-ipc";
import { installTokenHeaderInjector } from "./auth/token-header-injector";
import { setupStartupIPC } from "./startup/startup-ipc";
import { registerUserConfigIpc } from "./user-config/user-config-ipc";
import { getAiOsEnvConfig } from "./aios/aios-config";
import { ShellViewManager } from "./shell/views/shell-view-manager";
import { registerShellViewIpc, destroyShellViews } from "./shell/shell-view-ipc";
import { bindShellViewManager, unbindShellViewManager } from "./shell/portal-view-coordinator";
import { bindShellViewEventForwarder } from "./shell/shell-view-event-forwarder";
import { registerMainPageStateIpc } from "./shell/main-page-state-ipc";
import { buildAppMenu } from "./shell/shell-menu";
import { ModalManager } from "./shell/overlays/modal-manager";
import { DropdownManager } from "./shell/overlays/dropdown-manager";
import { createTrayManager, destroyTrayManager } from "./shell/tray-manager";
import { createShortcutManager, destroyShortcutManager, getShortcutManager } from "./shell/shortcut-manager";
import { runDesktopMigrations } from "./migrations/migration-runner";
import { ensureShims } from "./enterprise/shim-manager";
import { registerBrowserToolServerStop } from "./update/update-lifecycle";
import { initializeProfileRuntime, onBeforeQuit as profileRuntimeBeforeQuit } from "./profile-runtime-manager";
import { onBeforeQuit as aiosBeforeQuit } from "./aios/aios-runtime-supervisor";
import { registerMcpIpc, seedDefaultMcpServers, stopMcpRuntimeProxy } from "./mcp";
import {
  autoStartMcpSkillGatewayIfReady,
  registerMcpSkillGatewayRuntimeIpc,
  stopMcpSkillGatewayProxy,
} from "./mcp-skill-gateway-runtime";
import {
  autoInitializeGeneHubIfReady,
  registerGeneHubIpc,
  stopGeneHubScheduler,
} from "./genehub";
import { registerHermesExpertsIpc, shutdownHermesExpertsIpc } from "./hermes-experts";
import { registerHermesMcpConfigIpc } from "./hermes-mcp-config/hermes-mcp-config-ipc";
import { registerWorkIpc } from "./work/work-ipc";

process.on("uncaughtException", (err) => {
  console.error("[MAIN UNCAUGHT]", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[MAIN UNHANDLED REJECTION]", reason);
});

let mainWindow: BrowserWindow | null = null;
let currentChatAbort: (() => void) | null = null;
let browserIPC: BrowserIPC | null = null;
let browserToolServer: BrowserToolServer | null = null;
let modalManager: import("./shell/overlays/modal-manager").ModalManager | null = null;
let dropdownManager: import("./shell/overlays/dropdown-manager").DropdownManager | null = null;
let trayManager: import("./shell/tray-manager").TrayManager | null = null;
let isQuitting = false;

function quitApp(): void {
  isQuitting = true;
  app.quit();
}

// 启动参数
const launchArgs = {
  hidden: process.argv.includes("--hidden") || process.argv.includes("--tray"),
};

// Debug flag to show native menu bar (for testing menu template)
const showNativeMenuBar = false ; // process.env.SMC_SHOW_NATIVE_MENU_BAR === "1";

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: !showNativeMenuBar,
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 16, y: 16 },
        }
      : showNativeMenuBar
        ? {
            frame: true,
          }
        : {
            frame: false,
            titleBarStyle: "hidden" as const,
          }),
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      webviewTag: true,
    },
  });

  mainWindow.on("ready-to-show", () => {
    // Phase 5: Support --hidden/--tray flag for launching minimized to tray
    if (launchArgs.hidden) {
      // Don't show window on startup when --hidden is set
      if (process.platform === "darwin") {
        app.dock?.hide(); // Hide dock icon on macOS
      }
      console.log("[TRAY] Started hidden (--hidden flag detected)");
    } else {
      mainWindow!.show();
    }
  });

  // Phase 5: Close to tray instead of quitting
  mainWindow.on("close", (event) => {
    if (isQuitting) return;

    if (trayManager?.isCreated()) {
      event.preventDefault();
      mainWindow!.hide();
      console.log("[TRAY] Window hidden to tray");
      return;
    }

    console.warn("[TRAY] Tray is not available, window close will quit the app");
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(
      "[CRASH] Renderer process gone:",
      details.reason,
      details.exitCode,
    );
  });

  mainWindow.webContents.on(
    "console-message",
    (_event, level, message, line, sourceId) => {
      if (level >= 2) {
        console.error(`[RENDERER ERROR] ${message} (${sourceId}:${line})`);
      }
    },
  );

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      console.error("[LOAD FAIL]", {
        errorCode,
        errorDescription,
        validatedURL,
        isMainFrame,
      });
    },
  );

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  try {
    bindMainBrowserWindow(mainWindow);
    mainWindow.on("closed", () => {
      bindMainBrowserWindow(null);
    });
  } catch (err) {
    console.error("[WINDOW] Failed to bind main window:", err);
  }
}


/**
 * Internal View IPC handlers
 *
 * 处理 Modal 内部渲染进程的 IPC 消息
 */
function setupInternalViewIpc(): void {
  // 获取数据
  ipcMain.handle("internal-view:get-data", async (_event) => {
    if (!modalManager) return null;
    const current = (modalManager as unknown as { currentModal: { entry: { data: unknown } } | null }).currentModal;
    return current?.entry?.data ?? null;
  });

  // 关闭 Modal
  ipcMain.on("internal-view:close", (_event, result?: unknown) => {
    modalManager?.closeModal(result);
  });

  // 确认 Modal
  ipcMain.on("internal-view:confirm", (_event, result?: unknown) => {
    modalManager?.closeModal(result);
  });

  // 取消 Modal
  ipcMain.on("internal-view:cancel", (_event, reason?: string) => {
    modalManager?.dismissModal(reason);
  });

  // Modal 就绪
  ipcMain.on("internal-view:ready", (event) => {
    const webContents = event.sender;
    const current = (modalManager as unknown as { currentModal: { view: { markReady: () => void; getNativeView: () => { webContents: Electron.WebContents } | null } } | null }).currentModal;
    if (current?.view?.getNativeView()?.webContents === webContents) {
      current.view.markReady();
    }
  });
}

function setupIPC(): void {
  console.log("[SETUP] Setting up IPC handlers...");
  
  // Register window controls IPC handlers directly (fallback)
  try {
    console.log("[SETUP] Registering window control handlers directly...");
    
    ipcMain.handle("window:minimize", () => {
      const win = BrowserWindow.getFocusedWindow();
      if (win) win.minimize();
    });
    
    ipcMain.handle("window:maximize-or-restore", () => {
      const win = BrowserWindow.getFocusedWindow();
      if (win) {
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
      }
    });
    
    ipcMain.handle("window:close", () => {
      const win = BrowserWindow.getFocusedWindow();
      if (win) win.close();
    });
    
    ipcMain.handle("window:is-maximized", () => {
      const win = BrowserWindow.getFocusedWindow();
      return win ? win.isMaximized() : false;
    });

    ipcMain.handle("app:quit", () => {
      quitApp();
    });
    
    console.log("[SETUP] Window control handlers registered directly");
  } catch (err) {
    console.error("[SETUP] Failed to register window handlers directly:", err);
  }
  
  try {
    registerWindowIpc();
  } catch (err) {
    console.error("[WINDOW] Failed to register window IPC:", err);
  }

  // Internal View IPC (for Modal system)
  try {
    setupInternalViewIpc();
  } catch (err) {
    console.error("[MODAL] Failed to setup internal view IPC:", err);
  }

  // Profile Runtime IPC
  try {
    setupProfileRuntimeIPC();
    setupProfileRoleIPC();
    setupWorkspacesIPC();
    registerWorkspaceChatIpc(() => mainWindow);
    registerHermesDefaultChatIpc(() => mainWindow, {
      get current() {
        return currentChatAbort;
      },
      set current(v: (() => void) | null) {
        currentChatAbort = v;
      },
    });
    registerChatRuntimeIpc(() => mainWindow);
    registerChatFilesIpc();
    registerMcpIpc(() => mainWindow);
    seedDefaultMcpServers();
    registerMcpSkillGatewayRuntimeIpc();
    registerGeneHubIpc();
    registerHermesExpertsIpc();
    registerHermesMcpConfigIpc();
    registerWorkIpc(() => mainWindow);
  } catch { /* profile-runtime not available in early setup */ }

  try {
    registerWebOperatorTaskSessionIpc();
  } catch (err) {
    console.error("[WEB-OPERATOR-TASK-SESSION] Failed to register IPC:", err);
  }

  try {
    registerMainPageStateIpc();
  } catch (err) {
    console.error("[MAIN-PAGE] Failed to register main page state IPC:", err);
  }

  try {
    registerAuthIpc();
  } catch (err) {
    console.error("[AUTH] Failed to register auth IPC:", err);
  }

  try {
    setupStartupIPC();
  } catch (err) {
    console.error("[STARTUP] Failed to register startup IPC:", err);
  }

  try {
    installTokenHeaderInjector();
  } catch (err) {
    console.error("[AUTH] Failed to install token header injector:", err);
  }

  // First Run Wizard IPC
  try {
    registerFirstRunWizardIPC();
  } catch { /* first-run wizard not available in early setup */ }

  // Enterprise Install IPC (early — handlers that don't need mainWindow)
  try {
    setupEnterpriseInstallIpcEarly();
  } catch (err) {
    console.error("[ENTERPRISE-EARLY] Failed to register early enterprise IPC:", err);
  }

  // NOTE: Enterprise IPC handlers that need mainWindow (install/reinstall),
  // AIOS IPC, and ShellView IPC are registered after createWindow().

  // Installation
  ipcMain.handle("check-install", () => {
    return checkInstallStatus();
  });

  ipcMain.handle("verify-install", () => verifyInstall());

  ipcMain.handle("start-install", async (event) => {
    try {
      await runInstall((progress: InstallProgress) => {
        event.sender.send("install-progress", progress);
      }, mainWindow);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(
    "start-install-with-source",
    async (event, sourceConfig: unknown, options?: { force?: boolean }) => {
      try {
        await runInstallWithSource(
          sourceConfig,
          (progress: InstallProgress) => {
            event.sender.send("install-progress", progress);
          },
          mainWindow,
          options,
        );
        return { success: true };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    },
  );

  ipcMain.handle("show-open-dialog", async (_event, opts: Electron.OpenDialogOptions) => {
    const { dialog } = await import("electron");
    return dialog.showOpenDialog(opts);
  });

  // Hermes engine info
  ipcMain.handle("get-hermes-version", async () => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshGetHermesVersion(conn.ssh);
    return getHermesVersion();
  });
  ipcMain.handle("refresh-hermes-version", async () => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshGetHermesVersion(conn.ssh);
    clearVersionCache();
    return getHermesVersion();
  });
  ipcMain.handle("run-hermes-doctor", () => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshRunDoctor(conn.ssh);
    return runHermesDoctor();
  });
  ipcMain.handle("run-hermes-update", async (event) => {
    try {
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh) {
        event.sender.send("install-progress", {
          step: 1,
          totalSteps: 1,
          title: "Updating remote Hermes Agent",
          detail: "Running hermes update over SSH...",
          log: "Running hermes update over SSH...\n",
        });
        await sshRunUpdate(conn.ssh);
        await sshStartGateway(conn.ssh);
        await startSshTunnel(conn.ssh);
        const key = await sshReadRemoteApiKey(conn.ssh);
        setSshRemoteApiKey(key);
        return { success: true };
      }
      await runHermesUpdate((progress: InstallProgress) => {
        event.sender.send("install-progress", progress);
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // OpenClaw migration
  ipcMain.handle("check-openclaw", () => checkOpenClawExists());
  ipcMain.handle("run-claw-migrate", async (event) => {
    try {
      await runClawMigrate((progress: InstallProgress) => {
        event.sender.send("install-progress", progress);
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // Configuration (profile-aware)
  ipcMain.handle("get-locale", () => getAppLocale());
  ipcMain.handle("set-locale", (_event, locale: AppLocale) =>
    setAppLocale(locale),
  );

  ipcMain.handle("get-env", (_event, profile?: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshReadEnv(conn.ssh, profile);
    return readEnv(profile);
  });

  ipcMain.handle(
    "set-env",
    async (_event, key: string, value: string, profile?: string) => {
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh) {
        await sshSetEnvValue(conn.ssh, key, value, profile);
        return true;
      }
      setEnvValue(key, value, profile);
      // Restart gateway so it picks up the new API key
      if (
        (isGatewayRunning() && key.endsWith("_API_KEY")) ||
        key.endsWith("_TOKEN") ||
        key === "HF_TOKEN"
      ) {
        restartGateway(profile);
      }
      return true;
    },
  );

  ipcMain.handle("get-config", (_event, key: string, profile?: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshGetConfigValue(conn.ssh, key, profile);
    return getConfigValue(key, profile);
  });

  ipcMain.handle(
    "set-config",
    async (_event, key: string, value: string, profile?: string) => {
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh) {
        await sshSetConfigValue(conn.ssh, key, value, profile);
        return true;
      }
      setConfigValue(key, value, profile);
      return true;
    },
  );

  ipcMain.handle("get-hermes-home", (_event, profile?: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshGetHermesHome(conn.ssh, profile);
    return getHermesHome(profile);
  });

  ipcMain.handle("get-model-config", (_event, profile?: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshGetModelConfig(conn.ssh, profile);
    return getModelConfig(profile);
  });

  ipcMain.handle(
    "set-model-config",
    async (
      _event,
      provider: string,
      model: string,
      baseUrl: string,
      profile?: string,
    ) => {
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh) {
        const prev = await sshGetModelConfig(conn.ssh, profile);
        await sshSetModelConfig(conn.ssh, provider, model, baseUrl, profile);
        if (
          await sshGatewayStatus(conn.ssh) &&
          (prev.provider !== provider ||
            prev.model !== model ||
            prev.baseUrl !== baseUrl)
        ) {
          await sshStopGateway(conn.ssh);
          await sshStartGateway(conn.ssh);
        }
        return true;
      }
      const prev = getModelConfig(profile);
      setModelConfig(provider, model, baseUrl, profile);

      // Restart gateway when provider, model, or endpoint changes so it picks up new config
      if (
        isGatewayRunning() &&
        (prev.provider !== provider ||
          prev.model !== model ||
          prev.baseUrl !== baseUrl)
      ) {
        restartGateway(profile);
      }

      return true;
    },
  );

  // Connection mode (local / remote / ssh)
  ipcMain.handle("is-remote-mode", () => isRemoteMode());
  ipcMain.handle("is-remote-only-mode", () => isRemoteOnlyMode());
  ipcMain.handle("get-connection-config", () => getConnectionConfig());
  ipcMain.handle("is-ssh-tunnel-active", () => isSshTunnelActive());

  ipcMain.handle(
    "set-connection-config",
    (_event, mode: "local" | "remote" | "ssh", remoteUrl: string, apiKey?: string) => {
      setConnectionConfig({
        mode,
        remoteUrl,
        apiKey: apiKey || "",
        ssh: getFullConnectionConfig().ssh, // preserve existing ssh config
      });
      return true;
    },
  );

  ipcMain.handle(
    "set-ssh-config",
    (
      _event,
      host: string,
      port: number,
      username: string,
      keyPath: string,
      remotePort: number,
      localPort: number,
    ) => {
      const current = getFullConnectionConfig();
      setConnectionConfig({
        ...current,
        mode: "ssh",
        ssh: { host, port, username, keyPath, remotePort, localPort },
      });
      return true;
    },
  );

  ipcMain.handle(
    "test-remote-connection",
    (_event, url: string, apiKey?: string) => testRemoteConnection(url, apiKey),
  );

  ipcMain.handle(
    "test-ssh-connection",
    (_event, host: string, port: number, username: string, keyPath: string, remotePort: number) =>
      testSshConnection({ host, port, username, keyPath, remotePort, localPort: 19642 }),
  );

  ipcMain.handle("start-ssh-tunnel", async () => {
    const conn = getConnectionConfig();
    if (conn.mode !== "ssh") return false;
    if (conn.ssh && !await sshGatewayStatus(conn.ssh)) {
      await sshStartGateway(conn.ssh);
    }
    await startSshTunnel(conn.ssh);
    // Cache the remote API key so chat auth works through the tunnel
    if (conn.ssh) {
      const key = await sshReadRemoteApiKey(conn.ssh);
      setSshRemoteApiKey(key);
    }
    return true;
  });

  ipcMain.handle("stop-ssh-tunnel", () => {
    stopSshTunnel();
    return true;
  });

  // Chat — lazy-start gateway on first message
  ipcMain.handle(
    "send-message",
    async (
      event,
      message: string,
      profile?: string,
      resumeSessionId?: string,
      history?: Array<{ role: string; content: string }>,
    ) => {
      if (!isRemoteMode() && !isGatewayRunning()) {
        startGateway(profile);
      }

      await ensureSshTunnelIfNeeded();
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh) {
        const gatewayRunning = await sshGatewayStatus(conn.ssh);
        const tunnelHealthy = await isSshTunnelHealthy();
        if (!gatewayRunning || !tunnelHealthy) {
          await sshStartGateway(conn.ssh);
          await startSshTunnel(conn.ssh);
          const key = await sshReadRemoteApiKey(conn.ssh);
          setSshRemoteApiKey(key);
        }
      }

      if (currentChatAbort) {
        currentChatAbort();
      }

      let fullResponse = "";
      const chatStartTime = Date.now();
      let resolveChat: (v: { response: string; sessionId?: string }) => void;
      let rejectChat: (reason?: unknown) => void;
      const promise = new Promise<{ response: string; sessionId?: string }>(
        (res, rej) => {
          resolveChat = res;
          rejectChat = rej;
        },
      );

      const handle = await sendMessage(
        message,
        {
          onChunk: (chunk) => {
            fullResponse += chunk;
            event.sender.send("chat-chunk", chunk);
          },
          onDone: (sessionId) => {
            currentChatAbort = null;
            event.sender.send("chat-done", sessionId || "");
            resolveChat({ response: fullResponse, sessionId });
            // Desktop notification when window is not focused and response took >10s
            if (
              mainWindow &&
              !mainWindow.isFocused() &&
              Date.now() - chatStartTime > 10000
            ) {
              const preview = fullResponse
                .replace(/[#*_`~\n]+/g, " ")
                .trim()
                .slice(0, 80);
              new Notification({
                title: "Hermes Agent",
                body: preview || "Response ready",
              }).show();
            }
          },
          onError: (error) => {
            currentChatAbort = null;
            event.sender.send("chat-error", error);
            rejectChat(new Error(error));
            // Notify on error too if window not focused
            if (mainWindow && !mainWindow.isFocused()) {
              new Notification({
                title: "Hermes Agent — Error",
                body: error.slice(0, 100),
              }).show();
            }
          },
          onToolProgress: (tool) => {
            event.sender.send("chat-tool-progress", tool);
          },
          onUsage: (usage) => {
            event.sender.send("chat-usage", usage);
          },
        },
        profile,
        resumeSessionId,
        history,
      );

      currentChatAbort = handle.abort;
      return promise;
    },
  );

  ipcMain.handle("abort-chat", () => {
    if (currentChatAbort) {
      currentChatAbort();
      currentChatAbort = null;
    }
  });

  // Gateway
  ipcMain.handle("start-gateway", async () => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) { await sshStartGateway(conn.ssh); return true; }
    return startGateway();
  });
  ipcMain.handle("stop-gateway", async () => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) { await sshStopGateway(conn.ssh); return true; }
    stopGateway(true);
    return true;
  });
  ipcMain.handle("gateway-status", () => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshGatewayStatus(conn.ssh);
    return isGatewayRunning();
  });

  // Platform toggles (config.yaml platforms section)
  ipcMain.handle("get-platform-enabled", (_event, profile?: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshGetPlatformEnabled(conn.ssh, profile);
    return getPlatformEnabled(profile);
  });
  ipcMain.handle(
    "set-platform-enabled",
    async (_event, platform: string, enabled: boolean, profile?: string) => {
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh) {
        await sshSetPlatformEnabled(conn.ssh, platform, enabled, profile);
        return true;
      }
      setPlatformEnabled(platform, enabled, profile);
      // Restart gateway so it picks up the new platform config
      if (isGatewayRunning()) {
        restartGateway(profile);
      }
      return true;
    },
  );

  // Sessions
  ipcMain.handle("list-sessions", (_event, limit?: number, offset?: number) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshListSessions(conn.ssh, limit, offset);
    return listSessions(limit, offset);
  });

  ipcMain.handle("get-session-messages", (_event, sessionId: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshGetSessionMessages(conn.ssh, sessionId);
    return getSessionMessages(sessionId);
  });

  // Profiles
  ipcMain.handle("list-profiles", async () => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshListProfiles(conn.ssh);
    return listProfiles();
  });
  ipcMain.handle("create-profile", (_event, name: string, clone: boolean) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshCreateProfile(conn.ssh, name, clone);
    return createProfile(name, clone);
  });
  ipcMain.handle("delete-profile", (_event, name: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshDeleteProfile(conn.ssh, name);
    return deleteProfile(name);
  });
  ipcMain.handle("set-active-profile", (_event, name: string) => {
    if (getConnectionConfig().mode !== "ssh") setActiveProfile(name);
    return true;
  });

  // Memory
  ipcMain.handle("read-memory", (_event, profile?: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshReadMemory(conn.ssh, profile);
    return readMemory(profile);
  });
  ipcMain.handle(
    "add-memory-entry",
    (_event, content: string, profile?: string) => {
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh) return sshAddMemoryEntry(conn.ssh, content, profile);
      return addMemoryEntry(content, profile);
    },
  );
  ipcMain.handle(
    "update-memory-entry",
    (_event, index: number, content: string, profile?: string) => {
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh) return sshUpdateMemoryEntry(conn.ssh, index, content, profile);
      return updateMemoryEntry(index, content, profile);
    },
  );
  ipcMain.handle(
    "remove-memory-entry",
    (_event, index: number, profile?: string) => {
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh) return sshRemoveMemoryEntry(conn.ssh, index, profile);
      return removeMemoryEntry(index, profile);
    },
  );
  ipcMain.handle(
    "write-user-profile",
    (_event, content: string, profile?: string) => {
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh) return sshWriteUserProfile(conn.ssh, content, profile);
      return writeUserProfile(content, profile);
    },
  );
  ipcMain.handle(
    "write-memory-content",
    (_event, content: string, profile?: string) => {
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh) {
        return { success: false, error: "SSH mode: use local profile home" };
      }
      const result = writeMemoryContent(content, profile);
      if (result.success && profile) {
        try {
          const rec = getProfileByName(profile);
          if (rec) {
            insertAuditEvent({
              id: generateId(),
              event_type: "memory",
              profile_id: rec.id,
              source: "user",
              action: "memory_save",
              payload_json: JSON.stringify({ file: "MEMORY.md" }),
              status: "success",
              error_message: null,
            });
          }
        } catch {
          /* audit best-effort */
        }
      }
      return result;
    },
  );

  // Soul
  ipcMain.handle("read-soul", (_event, profile?: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshReadSoul(conn.ssh, profile);
    return readSoul(profile);
  });
  ipcMain.handle("write-soul", (_event, content: string, profile?: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshWriteSoul(conn.ssh, content, profile);
    return writeSoul(content, profile);
  });
  ipcMain.handle("reset-soul", (_event, profile?: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshResetSoul(conn.ssh, profile);
    return resetSoul(profile);
  });

  // Tools
  ipcMain.handle("get-toolsets", (_event, profile?: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshGetToolsets(conn.ssh, profile);
    return getToolsets(profile);
  });
  ipcMain.handle(
    "set-toolset-enabled",
    (_event, key: string, enabled: boolean, profile?: string) => {
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh) return sshSetToolsetEnabled(conn.ssh, key, enabled, profile);
      return setToolsetEnabled(key, enabled, profile);
    },
  );

  // Skills
  ipcMain.handle("list-installed-skills", (_event, profile?: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshListInstalledSkills(conn.ssh, profile);
    return listInstalledSkills(profile);
  });
  ipcMain.handle("list-bundled-skills", () => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshListBundledSkills(conn.ssh);
    return listBundledSkills();
  });
  ipcMain.handle("get-skill-content", (_event, skillPath: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshGetSkillContent(conn.ssh, skillPath);
    return getSkillContent(skillPath);
  });
  ipcMain.handle(
    "install-skill",
    (_event, identifier: string, _profile?: string) => {
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh) return sshInstallSkill(conn.ssh, identifier);
      return installSkill(identifier, _profile);
    },
  );
  ipcMain.handle("uninstall-skill", (_event, name: string, _profile?: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshUninstallSkill(conn.ssh, name);
    return uninstallSkill(name, _profile);
  });

  // Session cache (fast local cache with generated titles)
  ipcMain.handle(
    "list-cached-sessions",
    (_event, limit?: number, offset?: number) => {
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh) return sshListCachedSessions(conn.ssh, limit, offset);
      return listCachedSessions(limit, offset);
    },
  );
  ipcMain.handle("sync-session-cache", () => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshListCachedSessions(conn.ssh, 50);
    return syncSessionCache();
  });
  ipcMain.handle(
    "update-session-title",
    (_event, sessionId: string, title: string) =>
      updateSessionTitle(sessionId, title),
  );

  // Session search
  ipcMain.handle("search-sessions", (_event, query: string, limit?: number) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshSearchSessions(conn.ssh, query, limit);
    return searchSessions(query, limit);
  });

  // Credential Pool
  ipcMain.handle("get-credential-pool", () => getCredentialPool());
  ipcMain.handle(
    "set-credential-pool",
    (
      _event,
      provider: string,
      entries: Array<{ key: string; label: string }>,
    ) => {
      setCredentialPool(provider, entries);
      return true;
    },
  );

  // Models
  ipcMain.handle("list-models", () => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshListModels(conn.ssh);
    return listModels();
  });
  ipcMain.handle(
    "add-model",
    (
      _event,
      name: string,
      provider: string,
      model: string,
      baseUrl: string,
      opts?: { apiKeyEnv?: string; apiKeyLiteral?: string },
    ) => {
      const entry = addModel(name, provider, model, baseUrl, opts);
      syncCustomProvidersFromModels();
      return entry;
    },
  );
  ipcMain.handle("remove-model", (_event, id: string) => {
    const ok = removeModel(id);
    if (ok) syncCustomProvidersFromModels();
    return ok;
  });
  ipcMain.handle(
    "update-model",
    (_event, id: string, fields: Record<string, string>) => {
      const ok = updateModel(id, fields);
      if (ok) syncCustomProvidersFromModels();
      return ok;
    },
  );

  // Claw3D
  ipcMain.handle("claw3d-status", () => getClaw3dStatus());

  ipcMain.handle("claw3d-setup", async (event) => {
    try {
      await setupClaw3d((progress: Claw3dSetupProgress) => {
        event.sender.send("claw3d-setup-progress", progress);
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle("claw3d-get-port", () => getClaw3dPort());
  ipcMain.handle("claw3d-set-port", (_event, port: number) => {
    setClaw3dPort(port);
    return true;
  });
  ipcMain.handle("claw3d-get-ws-url", () => getClaw3dWsUrl());
  ipcMain.handle("claw3d-set-ws-url", (_event, url: string) => {
    setClaw3dWsUrl(url);
    return true;
  });

  ipcMain.handle("claw3d-start-all", () => startClaw3dAll());
  ipcMain.handle("claw3d-stop-all", () => {
    stopClaw3d();
    return true;
  });
  ipcMain.handle("claw3d-get-logs", () => getClaw3dLogs());

  ipcMain.handle("claw3d-start-dev", () => startDevServer());
  ipcMain.handle("claw3d-stop-dev", () => {
    stopDevServer();
    return true;
  });
  ipcMain.handle("claw3d-start-adapter", () => startAdapter());
  ipcMain.handle("claw3d-stop-adapter", () => {
    stopAdapter();
    return true;
  });

  // Cron Jobs
  ipcMain.handle(
    "list-cron-jobs",
    (_event, includeDisabled?: boolean, profile?: string) =>
      listCronJobs(includeDisabled, profile),
  );
  ipcMain.handle(
    "create-cron-job",
    (
      _event,
      schedule: string,
      prompt?: string,
      name?: string,
      deliver?: string,
      profile?: string,
    ) => createCronJob(schedule, prompt, name, deliver, profile),
  );
  ipcMain.handle("remove-cron-job", (_event, jobId: string, profile?: string) =>
    removeCronJob(jobId, profile),
  );
  ipcMain.handle("pause-cron-job", (_event, jobId: string, profile?: string) =>
    pauseCronJob(jobId, profile),
  );
  ipcMain.handle("resume-cron-job", (_event, jobId: string, profile?: string) =>
    resumeCronJob(jobId, profile),
  );
  ipcMain.handle(
    "trigger-cron-job",
    (_event, jobId: string, profile?: string) => triggerCronJob(jobId, profile),
  );

  // Shell
  ipcMain.handle("open-external", (_event, url: string) => {
    shell.openExternal(url);
  });

  // Backup / Import
  ipcMain.handle("run-hermes-backup", (_event, profile?: string) =>
    runHermesBackup(profile),
  );
  ipcMain.handle(
    "run-hermes-import",
    (_event, archivePath: string, profile?: string) =>
      runHermesImport(archivePath, profile),
  );

  // Debug dump
  ipcMain.handle("run-hermes-dump", () => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshRunDump(conn.ssh);
    return runHermesDump();
  });

  // MCP servers
  ipcMain.handle("list-mcp-servers", (_event, profile?: string) =>
    listMcpServers(profile),
  );

  // Memory providers
  ipcMain.handle("discover-memory-providers", (_event, profile?: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshDiscoverMemoryProviders(conn.ssh, profile);
    return discoverMemoryProviders(profile);
  });

  // Log viewer
  ipcMain.handle("read-logs", (_event, logFile?: string, lines?: number) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshReadLogs(conn.ssh, logFile, lines);
    return readLogs(logFile, lines);
  });

  // Shortcut Manager IPC (Phase 5)
  ipcMain.handle("shortcut:get-all", () => {
    return getShortcutManager()?.getAllShortcuts() ?? [];
  });
  ipcMain.handle("shortcut:update", (_event, id: string, updates: Partial<import("./shell/shortcut-manager").ShortcutConfig>) => {
    return getShortcutManager()?.updateShortcut(id, updates) ?? false;
  });
  ipcMain.handle("shortcut:reset", () => {
    getShortcutManager()?.resetToDefaults();
    return true;
  });
  ipcMain.handle("shortcut:validate", (_event, accelerator: string) => {
    return getShortcutManager()?.validateAccelerator(accelerator) ?? false;
  });
  ipcMain.handle("shortcut:check-conflicts", (_event, accelerator: string, excludeId?: string) => {
    return getShortcutManager()?.checkConflicts(accelerator, excludeId) ?? [];
  });
}

function setupUpdater(): void {
  // IPC handlers must always be registered to avoid invoke errors
  ipcMain.handle("get-app-version", () => app.getVersion());

  if (!app.isPackaged) {
    // Skip auto-update in dev mode
    ipcMain.handle("check-for-updates", async () => null);
    ipcMain.handle("download-update", () => true);
    ipcMain.handle("install-update", () => {});
    return;
  }

  // Dynamic import to avoid electron-updater issues in dev mode
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { autoUpdater } = require("electron-updater") as {
    autoUpdater: AppUpdater;
  };

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", async (info) => {
    // Try to show modal using new ModalManager (Phase 3)
    if (modalManager && mainWindow) {
      try {
        const result = await modalManager.showModal<"install" | "later">(
          "update-ready",
          {
            version: info.version,
            currentVersion: app.getVersion(),
            releaseNotes: typeof info.releaseNotes === "string" ? info.releaseNotes : "",
          },
          {
            priority: 5,
            showBackdrop: true,
          }
        );

        if (result === "install") {
          autoUpdater.downloadUpdate();
        }
        // "later" - do nothing
        return;
      } catch (err) {
        console.error("[UPDATE] Failed to show update modal:", err);
        // Fallback to legacy IPC
      }
    }

    // Legacy: send IPC to Renderer
    mainWindow?.webContents.send("update-available", {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    mainWindow?.webContents.send("update-download-progress", {
      percent: Math.round(progress.percent),
    });
  });

  autoUpdater.on("update-downloaded", () => {
    mainWindow?.webContents.send("update-downloaded");
  });

  autoUpdater.on("error", (err) => {
    mainWindow?.webContents.send("update-error", err.message);
  });

  ipcMain.handle("check-for-updates", async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return result?.updateInfo?.version || null;
    } catch {
      return null;
    }
  });

  ipcMain.handle("download-update", () => {
    autoUpdater.downloadUpdate();
    return true;
  });

  ipcMain.handle("install-update", async () => {
    const { prepareForAppUpdate } = await import("./update/update-lifecycle");
    await prepareForAppUpdate();
    autoUpdater.quitAndInstall(false, true);
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 5000);
}

app.whenReady().then(async () => {
  app.name = "SMC-Copilot";
  electronApp.setAppUserModelId("com.smc.smc-ai-copilot");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  try {
    runDesktopMigrations();
  } catch (err) {
    console.error("[MIGRATION] Failed:", err);
  }

  try {
    ensureShims();
  } catch (err) {
    console.error("[SHIM] Failed to ensure shims:", err);
  }

  // Initialize Profile Runtime DB (creates tables if needed)
  try {
    initializeProfileRuntime();
    console.log("[DB] Profile runtime database initialized");
  } catch (err) {
    console.error("[DB] Failed to initialize profile runtime database:", err);
  }

  // Build app menu via shell-menu.ts
  try {
    buildAppMenu(() => mainWindow);
  } catch (err) {
    console.error("[MENU] Failed to build app menu, falling back to minimal menu:", err);
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([{ label: "File", submenu: [{ role: "quit" as const }] }])
    );
  }

  setupIPC();

  createWindow();

  if (mainWindow) {
    try {
      trayManager = createTrayManager(
        mainWindow,
        undefined,
        undefined,
        () => {
          quitApp();
        },
      );
      trayManager.create();
      setHealthStatusCallback((running) => {
        trayManager?.setGatewayRunning(running);
        console.log(`[TRAY] Gateway status changed: ${running ? "running" : "stopped"}`);
      });
      trayManager.setGatewayRunning(isGatewayRunning());
      console.log("[TRAY] Tray initialized");
    } catch (err) {
      console.error("[TRAY] Failed to initialize tray:", err);
    }
  }

  let shellViewManager: ShellViewManager | null = null;

  // Register IPC handlers that require mainWindow (must be after createWindow)
  if (mainWindow) {
    // Portal Runtime IPC
    try {
      registerAiosIpc(mainWindow);
      console.log("[AIOS] IPC handlers registered successfully");
    } catch (err) {
      console.error("[AIOS] Failed to register IPC:", err);
    }

    try {
      mergeRuntimeConfig({});
      registerCopilotServeIpc(() => mainWindow);
      console.log("[COPILOT-SERVE] IPC handlers registered");
      void autoStartCopilotServeIfReady()
        .then((status) => {
          console.log("[COPILOT-SERVE] auto-start status:", status.status);
        })
        .catch((err) => {
          console.warn("[COPILOT-SERVE] auto-start skipped:", err);
        });
    } catch (err) {
      console.error("[COPILOT-SERVE] Failed to register IPC:", err);
    }

    try {
      void autoStartMcpSkillGatewayIfReady()
        .then(() => {
          console.log("[MCP-SKILL-GATEWAY] auto-start completed");
        })
        .catch((err) => {
          console.warn("[MCP-SKILL-GATEWAY] auto-start skipped:", err);
        });
    } catch (err) {
      console.error("[MCP-SKILL-GATEWAY] Failed to auto-start:", err);
    }

    try {
      void autoInitializeGeneHubIfReady()
        .then(() => {
          console.log("[GENEHUB] auto-init completed");
        })
        .catch((err) => {
          console.warn("[GENEHUB] auto-init skipped:", err);
        });
    } catch (err) {
      console.error("[GENEHUB] Failed to auto-init:", err);
    }

    try {
      registerUserConfigIpc(mainWindow);
    } catch (err) {
      console.error("[USER-CONFIG] Failed to register user-config IPC:", err);
    }

    // Enterprise Install IPC (late — handlers that need mainWindow)
    try {
      setupEnterpriseInstallIPC(mainWindow);
    } catch (err) {
      console.error("[ENTERPRISE] Failed to register enterprise IPC:", err);
    }

    // Initialize ShellViewManager
    try {
      shellViewManager = new ShellViewManager(mainWindow);
      console.log("[SHELL] ShellViewManager initialized");
      registerWebOperatorCrmPreloadSession();
    } catch (err) {
      console.error("[SHELL] Failed to initialize ShellViewManager:", err);
    }

    // ShellView IPC + renderer event forwarder
    if (shellViewManager) {
      try {
        bindShellViewManager(shellViewManager);
        registerShellViewIpc(shellViewManager);
        void import("./shell/portal-view-coordinator")
          .then(({ refreshPortalView }) => refreshPortalView())
          .catch((err) => {
            console.warn("[SHELL] Initial portal view setup failed:", err);
          });
        const unbindShellViewEvents = bindShellViewEventForwarder(mainWindow);
        mainWindow.on("closed", () => {
          unbindShellViewEvents();
          unbindShellViewManager();
        });
      } catch (err) {
        console.error("[SHELL-IPC] Failed to register ShellView IPC:", err);
      }
    } else {
      console.warn("[SHELL-IPC] ShellViewManager not available, ShellView IPC not registered");
    }

    // Note: aios-home view is now lazy-loaded when Renderer requests it via shell:view:set-bounds
    // This avoids startup errors when Portal frontend is not yet running
  }

  // Initialize ModalManager and DropdownManager (Phase 3)
  if (mainWindow) {
    try {
      const preloadPath = join(__dirname, "../preload/index.js");
      modalManager = new ModalManager(mainWindow, preloadPath);
      dropdownManager = new DropdownManager(mainWindow);
      console.log("[MODAL] ModalManager and DropdownManager initialized");
    } catch (err) {
      console.error("[MODAL] Failed to initialize managers:", err);
    }
  }

  // Initialize Shortcut Manager (Phase 5)
  if (mainWindow) {
    try {
      const shortcutManager = createShortcutManager();
      shortcutManager.setMainWindow(mainWindow);
      shortcutManager.registerAll();
      console.log("[SHORTCUT] Shortcut manager initialized");
      
      // Listen for shortcut actions
      shortcutManager.on("action", (action: string, data: unknown) => {
        console.log("[SHORTCUT] Action triggered:", action, data);
        // 可以在这里处理自定义动作
      });
    } catch (err) {
      console.error("[SHORTCUT] Failed to initialize shortcut manager:", err);
    }
  }

  // Initialize Web Operator browser module
  if (mainWindow) {
    try {
      const webOperatorDir = join(profileHome(), "desktop", "web-operator");
      const configPath = join(webOperatorDir, "web-operator.config.json");
      const logDir = join(webOperatorDir, "logs");

      if (!shellViewManager) {
        throw new Error("ShellViewManager is required by Web Operator");
      }

      const viewManager = new ShellBrowserViewAdapter(shellViewManager);
      const securityGuard = new BrowserSecurityGuard(configPath);
      const auditLogger = new BrowserAuditLogger(logDir);
      const controller = new BrowserController(viewManager, securityGuard, auditLogger);
      controller.setMainWindow(mainWindow);

      browserIPC = new BrowserIPC(controller, viewManager);
      browserIPC.register();

      setupCrmBridge(controller, viewManager, mainWindow, shellViewManager);

      const toolBridge = new BrowserToolBridge(controller, viewManager);
      browserToolServer = new BrowserToolServer(toolBridge);
      browserToolServer.start().catch((err) => {
        console.error("[BROWSER] Tool server failed to start:", err);
      });

      registerBrowserToolServerStop(() => {
        if (browserToolServer) browserToolServer.stop();
      });

      auditLogger.onLog((record) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("browser.on_audit_update", record);
        }
      });
    } catch (err) {
      console.error("[BROWSER] Failed to initialize Web Operator:", err);
    }
  }

  setupUpdater();

  // Auto-start SSH tunnel if configured
  const conn = getConnectionConfig();
  if (conn.mode === "ssh" && conn.ssh.host) {
    (async () => {
      if (!await sshGatewayStatus(conn.ssh)) {
        await sshStartGateway(conn.ssh);
      }
      await startSshTunnel(conn.ssh);
      const key = await sshReadRemoteApiKey(conn.ssh);
      setSshRemoteApiKey(key);
    })().catch((err) => {
      console.error("[SSH TUNNEL] Failed to start on launch:", err);
    });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform === "darwin") return;

  if (trayManager?.isCreated() && !isQuitting) {
    console.log("[TRAY] window-all-closed ignored because tray is active");
    return;
  }

  stopGateway();
  stopSshTunnel();
  stopClaw3d();
  if (browserToolServer) browserToolServer.stop();
  teardownCrmBridge();
  app.quit();
});

app.on("before-quit", () => {
  // Phase 5: Set quitting flag so window close handler knows to actually quit
  isQuitting = true;

  stopHealthPolling();
  try {
    stopGeneHubScheduler();
  } catch { /* best effort */ }
  try {
    shutdownHermesExpertsIpc();
  } catch { /* best effort */ }
  if (currentChatAbort) {
    currentChatAbort();
    currentChatAbort = null;
  }
  try {
    shutdownChatRuntimeIpc();
  } catch { /* best effort */ }
  try {
    profileRuntimeBeforeQuit();
  } catch { /* best effort */ }
  try {
    aiosBeforeQuit();
  } catch { /* best effort */ }
  // Cleanup ShellViewManager views
  try {
    destroyShellViews();
  } catch { /* best effort */ }
  // Cleanup Overlay Managers (Phase 3)
  try {
    modalManager?.destroyAll();
    dropdownManager?.destroyAll();
  } catch { /* best effort */ }
  // Cleanup Tray Manager (Phase 5)
  try {
    destroyTrayManager();
    console.log("[TRAY] Tray destroyed");
  } catch { /* best effort */ }

  // Cleanup Shortcut Manager (Phase 5)
  try {
    destroyShortcutManager();
    console.log("[SHORTCUT] Shortcut manager destroyed");
  } catch { /* best effort */ }
  stopGateway();
  stopSshTunnel();
  stopClaw3d();
  if (browserToolServer) browserToolServer.stop();
  try {
    stopMcpRuntimeProxy();
  } catch {
    /* best effort */
  }
  try {
    stopMcpSkillGatewayProxy();
  } catch {
    /* best effort */
  }
});
