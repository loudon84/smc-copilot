import { ipcMain, BrowserWindow, dialog } from "electron";
import { join } from "node:path";

import { resolveInstallLocation } from "./windows/install-location-resolver";
import { resolveRuntimeState } from "./runtime-state-resolver";
import { ensureShims } from "./shim-manager";
import { refreshAllRuntimePathCaches } from "../runtime/refresh-runtime-paths";
import {
  writeRuntimeConfig,
  mergeRuntimeConfig,
  createDefaultRuntimeConfig,
  type AgentSourceConfig,
} from "./desktop-runtime-config";
import {
  installHermesAgentFromUserSource,
  type UserSourceConfig,
  type AgentInstallResult,
  type AgentInstallProgress,
} from "./hermes-agent-source-installer";

export type WizardStage =
  | "detect"
  | "select-source"
  | "installing"
  | "verifying"
  | "completed"
  | "error";

export interface WizardState {
  stage: WizardStage;
  agentInstalled: boolean;
  agentPath?: string;
  error?: string;
  errorCode?: string;
}

const CHANNELS = {
  DETECT_AGENT: "first-run-wizard:detect-agent",
  SELECT_SOURCE: "first-run-wizard:select-source",
  START_INSTALL: "first-run-wizard:start-install",
  CANCEL_INSTALL: "first-run-wizard:cancel-install",
  SELECT_ZIP_FILE: "first-run-wizard:select-zip-file",
  ON_PROGRESS: "first-run-wizard:on-progress",
  ON_STATE_CHANGE: "first-run-wizard:on-state-change",
  GET_STATE: "first-run-wizard:get-state",
} as const;

let currentState: WizardState = {
  stage: "detect",
  agentInstalled: false,
};

let installCancelled = false;
let wizardWindow: BrowserWindow | null = null;

export function detectAgentInstallation(): boolean {
  return resolveRuntimeState().agentSourceExists;
}

function broadcastState(win: BrowserWindow | null): void {
  const target = win || wizardWindow;
  if (target && !target.isDestroyed()) {
    target.webContents.send(CHANNELS.ON_STATE_CHANGE, currentState);
  }
}

function broadcastProgress(
  win: BrowserWindow | null,
  progress: AgentInstallProgress,
): void {
  const target = win || wizardWindow;
  if (target && !target.isDestroyed()) {
    target.webContents.send(CHANNELS.ON_PROGRESS, progress);
  }
}

export function registerFirstRunWizardIPC(): void {
  ipcMain.handle(CHANNELS.DETECT_AGENT, async () => {
    const installed = detectAgentInstallation();
    const loc = resolveInstallLocation();
    currentState = {
      stage: installed ? "completed" : "select-source",
      agentInstalled: installed,
      agentPath: installed ? loc.agentDir : undefined,
    };
    return currentState;
  });

  ipcMain.handle(CHANNELS.SELECT_SOURCE, async () => {
    currentState = { ...currentState, stage: "select-source" };
    broadcastState(wizardWindow);
    return currentState;
  });

  ipcMain.handle(
    CHANNELS.START_INSTALL,
    async (_event, sourceConfig: UserSourceConfig, options?: { force?: boolean }) => {
      const runtimeState = resolveRuntimeState();
      if (!options?.force && runtimeState.runtimeReady) {
        refreshAllRuntimePathCaches();
        ensureShims();
        mergeRuntimeConfig(createDefaultRuntimeConfig());
        const loc = resolveInstallLocation();
        currentState = {
          stage: "completed",
          agentInstalled: true,
          agentPath: loc.agentDir,
        };
        broadcastState(wizardWindow);
        return { success: true, skipped: true, agentPath: loc.agentDir };
      }

      installCancelled = false;
      currentState = { ...currentState, stage: "installing", error: undefined };
      broadcastState(wizardWindow);

      const onProgress = (progress: AgentInstallProgress) => {
        if (installCancelled) return;
        broadcastProgress(wizardWindow, progress);
      };

      try {
        const result: AgentInstallResult =
          await installHermesAgentFromUserSource(sourceConfig, onProgress);

        if (installCancelled) {
          currentState = { ...currentState, stage: "select-source" };
          broadcastState(wizardWindow);
          return { success: false, error: "Install cancelled" };
        }

        if (!result.ok) {
          currentState = {
            ...currentState,
            stage: "error",
            error: result.message,
            errorCode: result.errorCode,
          };
          broadcastState(wizardWindow);
          return { success: false, error: result.message };
        }

        currentState = { ...currentState, stage: "verifying" };
        broadcastState(wizardWindow);

        refreshAllRuntimePathCaches();
        ensureShims();

        const runtimeConfig = createDefaultRuntimeConfig(
          sourceConfig as AgentSourceConfig,
        );
        writeRuntimeConfig(runtimeConfig);

        currentState = {
          stage: "completed",
          agentInstalled: true,
          agentPath: result.agentPath,
        };
        broadcastState(wizardWindow);

        return { success: true, agentPath: result.agentPath };
      } catch (err) {
        currentState = {
          ...currentState,
          stage: "error",
          error: err instanceof Error ? err.message : String(err),
        };
        broadcastState(wizardWindow);
        return { success: false, error: currentState.error };
      }
    },
  );

  ipcMain.handle(CHANNELS.CANCEL_INSTALL, async () => {
    installCancelled = true;
    currentState = { ...currentState, stage: "select-source" };
    broadcastState(wizardWindow);
    return true;
  });

  ipcMain.handle(CHANNELS.SELECT_ZIP_FILE, async () => {
    const result = await dialog.showOpenDialog({
      title: "Select Hermes Agent ZIP",
      filters: [{ name: "ZIP Archives", extensions: ["zip"] }],
      properties: ["openFile"],
    });
    return result;
  });

  ipcMain.handle(CHANNELS.GET_STATE, async () => {
    return currentState;
  });
}

export async function openWizardWindow(
  parent: BrowserWindow,
): Promise<BrowserWindow> {
  if (wizardWindow && !wizardWindow.isDestroyed()) {
    wizardWindow.focus();
    return wizardWindow;
  }

  wizardWindow = new BrowserWindow({
    width: 640,
    height: 520,
    parent: parent || undefined,
    modal: true,
    resizable: false,
    frame: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    wizardWindow.loadURL(
      `${process.env.ELECTRON_RENDERER_URL}#/install-wizard`,
    );
  } else {
    wizardWindow.loadFile(join(__dirname, "../renderer/index.html"), {
      hash: "/install-wizard",
    });
  }

  wizardWindow.on("closed", () => {
    wizardWindow = null;
  });

  return wizardWindow;
}

export function closeWizardWindow(): void {
  if (wizardWindow && !wizardWindow.isDestroyed()) {
    wizardWindow.close();
    wizardWindow = null;
  }
}

export { CHANNELS as FIRST_RUN_WIZARD_CHANNELS };
