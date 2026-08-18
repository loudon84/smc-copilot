import { app, ipcMain, type BrowserWindow } from "electron";
import type { AppUpdater, ProgressInfo, UpdateInfo } from "electron-updater";
import { updaterLogger } from "../updater-log";
import {
  APP_UPDATE_CHANNELS,
  type AppUpdateError,
  type AppUpdateErrorCode,
  type AppUpdateOperation,
  type AppUpdateSource,
  type AppUpdateState,
} from "../../shared/app-update";

interface UpdaterDeps {
  getMainWindow: () => BrowserWindow | null;
  loadAutoUpdater?: () => AppUpdater;
}

type UpdateStatePatch = Partial<AppUpdateState>;

const STARTUP_DELAY_MS = 15_000;
const STARTUP_JITTER_MS = 45_000;
const SCHEDULE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const SCHEDULE_JITTER_RATIO = 0.1;

let autoUpdaterInstance: AppUpdater | null = null;
let appUpdateState: AppUpdateState = createInitialState(false);
let scheduledCheckTimer: ReturnType<typeof setTimeout> | null = null;
let startupCheckTimer: ReturnType<typeof setTimeout> | null = null;
let checkPromise: Promise<AppUpdateState> | null = null;
let downloadPromise: Promise<AppUpdateState> | null = null;
let installRequested = false;

function isoNow(): string {
  return new Date().toISOString();
}

function createInitialState(supported: boolean): AppUpdateState {
  return {
    schemaVersion: 2,
    revision: 0,
    supported,
    status: "idle",
    currentVersion: app.getVersion(),
    availableVersion: null,
    releaseDate: null,
    releaseNotes: null,
    percent: null,
    transferred: null,
    total: null,
    bytesPerSecond: null,
    error: null,
    checkedAt: null,
    updatedAt: isoNow(),
  };
}

function normalizeReleaseNotes(value: UpdateInfo["releaseNotes"]): string | null {
  if (typeof value === "string") {
    return value.slice(0, 8_000) || null;
  }
  if (Array.isArray(value)) {
    const text = value
      .map((item) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return "";
        const note = "note" in item && typeof item.note === "string" ? item.note : "";
        const version =
          "version" in item && typeof item.version === "string" ? item.version : "";
        return version && note ? `${version}\n${note}` : note || version;
      })
      .filter(Boolean)
      .join("\n\n");
    return text.slice(0, 8_000) || null;
  }
  return null;
}

function finiteNonNegative(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

function clampPercent(value: unknown): number | null {
  const numeric = finiteNonNegative(value);
  if (numeric === null) return null;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function structuredError(
  code: AppUpdateErrorCode,
  operation: AppUpdateOperation,
  source: AppUpdateSource,
  message: string,
  retryable = true,
): AppUpdateError {
  return {
    code,
    operation,
    source,
    message,
    retryable,
    at: isoNow(),
  };
}

function logUpdaterEvent(
  event: string,
  extra: Record<string, unknown> = {},
): void {
  updaterLogger.info({
    event,
    currentVersion: appUpdateState.currentVersion,
    availableVersion: appUpdateState.availableVersion,
    providerKind: "electron-updater",
    revision: appUpdateState.revision,
    result: appUpdateState.status,
    errorCode: appUpdateState.error?.code ?? null,
    ...extra,
  });
}

function emitLegacyEvents(win: BrowserWindow | null, prev: AppUpdateState, next: AppUpdateState): void {
  if (!win) return;
  if (next.status === "available" && prev.availableVersion !== next.availableVersion) {
    win.webContents.send("update-available", {
      version: next.availableVersion,
      releaseNotes: next.releaseNotes ?? "",
    });
  }
  if (next.status === "downloading") {
    win.webContents.send("update-download-progress", {
      percent: next.percent ?? 0,
    });
  }
  if (next.status === "ready" && prev.status !== "ready") {
    win.webContents.send("update-downloaded");
  }
  if (next.status === "error" && next.error && prev.error?.at !== next.error.at) {
    win.webContents.send("update-error", next.error.message);
  }
}

function updateState(
  patch: UpdateStatePatch,
  getMainWindow: () => BrowserWindow | null,
): AppUpdateState {
  const previous = appUpdateState;
  const next: AppUpdateState = {
    ...previous,
    ...patch,
    revision: previous.revision + 1,
    updatedAt: isoNow(),
  };
  appUpdateState = next;
  const mainWindow = getMainWindow();
  mainWindow?.webContents.send(APP_UPDATE_CHANNELS.stateChanged, next);
  emitLegacyEvents(mainWindow, previous, next);
  return next;
}

function clearTimers(): void {
  if (startupCheckTimer) clearTimeout(startupCheckTimer);
  if (scheduledCheckTimer) clearTimeout(scheduledCheckTimer);
  startupCheckTimer = null;
  scheduledCheckTimer = null;
}

function scheduleNextBackgroundCheck(run: () => Promise<void>): void {
  if (scheduledCheckTimer) clearTimeout(scheduledCheckTimer);
  const jitter = SCHEDULE_INTERVAL_MS * SCHEDULE_JITTER_RATIO;
  const offset = Math.round((Math.random() * 2 - 1) * jitter);
  scheduledCheckTimer = setTimeout(() => {
    void run();
  }, SCHEDULE_INTERVAL_MS + offset);
  scheduledCheckTimer.unref?.();
}

function shouldSkipBackgroundCheck(): boolean {
  return ["available", "downloading", "ready", "installing"].includes(
    appUpdateState.status,
  );
}

async function performCheck(
  autoUpdater: AppUpdater,
  getMainWindow: () => BrowserWindow | null,
  source: AppUpdateSource,
): Promise<AppUpdateState> {
  if (checkPromise) return checkPromise;
  checkPromise = (async () => {
    if (!appUpdateState.supported) return appUpdateState;
    if (shouldSkipBackgroundCheck()) return appUpdateState;
    updateState(
      {
        status: "checking",
        error:
          appUpdateState.error?.operation === "check" ? null : appUpdateState.error,
      },
      getMainWindow,
    );
    logUpdaterEvent("check.started", { source });
    try {
      const result = await autoUpdater.checkForUpdates();
      const version = result?.updateInfo?.version ?? null;
      if (!version) {
        const next = updateState(
          {
            status: "uptodate",
            checkedAt: isoNow(),
            error: null,
            percent: null,
            transferred: null,
            total: null,
            bytesPerSecond: null,
          },
          getMainWindow,
        );
        logUpdaterEvent("check.uptodate", { source });
        return next;
      }
      return appUpdateState;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logUpdaterEvent("check.failed", { source, message });
      if (source === "manual") {
        return updateState(
          {
            status: "error",
            error: structuredError("CHECK_FAILED", "check", source, message, true),
          },
          getMainWindow,
        );
      }
      if (appUpdateState.status === "checking" || appUpdateState.status === "idle") {
        return updateState(
          {
            status: "idle",
            error: appUpdateState.error?.operation === "check" ? null : appUpdateState.error,
          },
          getMainWindow,
        );
      }
      return appUpdateState;
    } finally {
      checkPromise = null;
    }
  })();
  return checkPromise;
}

async function performDownload(
  autoUpdater: AppUpdater,
  getMainWindow: () => BrowserWindow | null,
): Promise<AppUpdateState> {
  if (downloadPromise) return downloadPromise;
  downloadPromise = (async () => {
    if (appUpdateState.status !== "available" && !(
      appUpdateState.status === "error" &&
      appUpdateState.error?.operation === "download" &&
      appUpdateState.availableVersion
    )) {
      return appUpdateState;
    }
    updateState(
      {
        status: "downloading",
        error: null,
        percent: 0,
        transferred: 0,
        total: null,
        bytesPerSecond: null,
      },
      getMainWindow,
    );
    logUpdaterEvent("download.started", { source: "manual" });
    try {
      await autoUpdater.downloadUpdate();
      return appUpdateState;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logUpdaterEvent("download.failed", { source: "manual", message });
      return updateState(
        {
          status: "error",
          error: structuredError(
            "DOWNLOAD_FAILED",
            "download",
            "manual",
            message,
            true,
          ),
        },
        getMainWindow,
      );
    } finally {
      downloadPromise = null;
    }
  })();
  return downloadPromise;
}

function supportsRealUpdater(): boolean {
  const isPortableBuild = !!process.env.PORTABLE_EXECUTABLE_DIR;
  return process.platform === "win32" && app.isPackaged && !isPortableBuild;
}

export function setupUpdater({
  getMainWindow,
  loadAutoUpdater,
}: UpdaterDeps): void {
  clearTimers();
  installRequested = false;
  appUpdateState = createInitialState(supportsRealUpdater());

  ipcMain.handle("get-app-version", () => app.getVersion());
  ipcMain.handle(APP_UPDATE_CHANNELS.getState, () => appUpdateState);
  ipcMain.handle(APP_UPDATE_CHANNELS.check, async () => {
    if (!autoUpdaterInstance) return appUpdateState;
    return performCheck(autoUpdaterInstance, getMainWindow, "manual");
  });
  ipcMain.handle(APP_UPDATE_CHANNELS.download, async () => {
    if (!autoUpdaterInstance) return appUpdateState;
    return performDownload(autoUpdaterInstance, getMainWindow);
  });
  ipcMain.handle(APP_UPDATE_CHANNELS.install, async () => {
    if (!autoUpdaterInstance || appUpdateState.status !== "ready") {
      return appUpdateState;
    }
    installRequested = true;
    const next = updateState(
      {
        status: "installing",
        error: null,
      },
      getMainWindow,
    );
    logUpdaterEvent("install.started", { source: "manual" });
    updaterLogger.info(
      "User confirmed installation — calling quitAndInstall(isSilent=false, isForceRunAfter=true)",
    );
    autoUpdaterInstance.quitAndInstall(false, true);
    return next;
  });

  ipcMain.handle("check-for-updates", async () => {
    const state = autoUpdaterInstance
      ? await performCheck(autoUpdaterInstance, getMainWindow, "manual")
      : appUpdateState;
    return state.availableVersion;
  });
  ipcMain.handle("download-update", async () => {
    const before = appUpdateState.revision;
    const state = autoUpdaterInstance
      ? await performDownload(autoUpdaterInstance, getMainWindow)
      : appUpdateState;
    return state.status !== "error" || state.revision === before;
  });
  ipcMain.handle("install-update", async () => {
    if (!autoUpdaterInstance || appUpdateState.status !== "ready") return;
    installRequested = true;
    updateState({ status: "installing", error: null }, getMainWindow);
    logUpdaterEvent("install.started", { source: "manual", legacy: true });
    autoUpdaterInstance.quitAndInstall(false, true);
  });

  ipcMain.handle("get-auto-upgrade-enabled", () => false);
  ipcMain.handle("set-auto-upgrade-enabled", () => false);

  if (!supportsRealUpdater()) {
    autoUpdaterInstance = null;
    return;
  }

  const autoUpdater = loadAutoUpdater
    ? loadAutoUpdater()
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      ((require("electron-updater") as { autoUpdater: AppUpdater }).autoUpdater);
  autoUpdaterInstance = autoUpdater;
  autoUpdater.logger = updaterLogger;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    logUpdaterEvent("event.checking");
  });
  autoUpdater.on("update-available", (info: UpdateInfo) => {
    updateState(
      {
        status: "available",
        availableVersion: info.version,
        releaseDate: info.releaseDate ? new Date(info.releaseDate).toISOString() : null,
        releaseNotes: normalizeReleaseNotes(info.releaseNotes),
        checkedAt: isoNow(),
        error: null,
        percent: null,
        transferred: null,
        total: null,
        bytesPerSecond: null,
      },
      getMainWindow,
    );
    logUpdaterEvent("event.available", { availableVersion: info.version });
  });
  autoUpdater.on("update-not-available", () => {
    updateState(
      {
        status: "uptodate",
        availableVersion: null,
        releaseDate: null,
        releaseNotes: null,
        checkedAt: isoNow(),
        error: null,
        percent: null,
        transferred: null,
        total: null,
        bytesPerSecond: null,
      },
      getMainWindow,
    );
    logUpdaterEvent("event.not-available");
  });
  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    updateState(
      {
        status: "downloading",
        percent: clampPercent(progress.percent),
        transferred: finiteNonNegative(progress.transferred),
        total: finiteNonNegative(progress.total),
        bytesPerSecond: finiteNonNegative(progress.bytesPerSecond),
        error: null,
      },
      getMainWindow,
    );
  });
  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    updateState(
      {
        status: "ready",
        availableVersion: info.version,
        releaseDate: info.releaseDate ? new Date(info.releaseDate).toISOString() : null,
        releaseNotes: normalizeReleaseNotes(info.releaseNotes),
        error: null,
        percent: null,
      },
      getMainWindow,
    );
    logUpdaterEvent("event.downloaded", { availableVersion: info.version });
  });
  autoUpdater.on("error", (error: Error) => {
    const message = error?.message || "Unknown updater error";
    logUpdaterEvent("event.error", { message });
    if (appUpdateState.status === "downloading" || installRequested) {
      updateState(
        {
          status: "error",
          error: structuredError(
            installRequested ? "INSTALL_FAILED" : "DOWNLOAD_FAILED",
            installRequested ? "install" : "download",
            "manual",
            message,
            true,
          ),
        },
        getMainWindow,
      );
      installRequested = false;
      return;
    }
    if (appUpdateState.status === "checking" || appUpdateState.status === "idle") {
      updateState(
        {
          status: "idle",
        },
        getMainWindow,
      );
    }
  });

  const runBackgroundCheck = async (): Promise<void> => {
    if (!autoUpdaterInstance) return;
    try {
      await performCheck(autoUpdaterInstance, getMainWindow, "scheduled");
    } finally {
      scheduleNextBackgroundCheck(runBackgroundCheck);
    }
  };

  startupCheckTimer = setTimeout(() => {
    void performCheck(autoUpdater, getMainWindow, "startup").finally(() => {
      scheduleNextBackgroundCheck(runBackgroundCheck);
    });
  }, STARTUP_DELAY_MS + Math.round(Math.random() * STARTUP_JITTER_MS));
  startupCheckTimer.unref?.();

  app.once("before-quit", () => {
    clearTimers();
  });
}
