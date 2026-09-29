/**
 * Portal Auth IPC for apps/work (Login-only Phase 5).
 * Stripped of Portal view / MCP / GeneHub hooks from apps/desktop.
 */
import { ipcMain, type BrowserWindow } from "electron";
import type {
  AuthEndpointConfig,
  LoginInput,
} from "../../shared/auth/auth-contract";
import {
  AUTH_STATE_CHANGED_CHANNEL,
  toPublicState,
} from "../../shared/auth/auth-contract";
import { getAuthClient } from "./auth-client";
import {
  getDefaultAuthEndpointConfig,
  readAuthEndpointConfig,
  writeAuthEndpointConfig,
} from "./auth-endpoint-config-store";
import {
  ensureFreshAccessToken,
  refreshStoredAccessToken,
} from "./ensure-access-token";
import {
  clearStoredSession,
  readStoredSession,
  readStoredSessionSync,
  subscribeStoredSessionChanges,
  writeStoredSession,
} from "./token-store";
import {
  disposeExpertSubsystem,
  restoreExpertSubsystemAfterAuth,
} from "../expert/expert-ipc";
import { disposeSkillRunSubsystem } from "../skill-run/skill-run-ipc";
import { runFilesCleanupBestEffort } from "../files/file-cleanup-service";
import { getConnectionConfig } from "../config";
import {
  bootstrapRuntimeProvider,
  clearRuntimeProvider,
  getRuntimeProviderPublicState,
  type RuntimeProviderPublicState,
} from "../runtime-provider/runtime-provider-orchestrator";
import {
  notifyAcceptedRuntimeBootstrap,
  stopRuntimeReconcile,
} from "../runtime-provider/runtime-provider-reconcile-bindings";

export type RegisterAuthIpcOptions = {
  getMainWindow?: () => BrowserWindow | null;
};

let unsubscribeSessionChanges: (() => void) | null = null;

async function buildAuthState(): Promise<ReturnType<typeof toPublicState>> {
  const endpointConfig = readAuthEndpointConfig();
  try {
    await ensureFreshAccessToken();
  } catch {
    /* missing session or refresh failed — session already cleared */
  }
  const session = await readStoredSession();
  return toPublicState(session, endpointConfig);
}

function pushPublicAuthState(getMainWindow: () => BrowserWindow | null): void {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send(
    AUTH_STATE_CHANGED_CHANNEL,
    toPublicState(readStoredSessionSync(), readAuthEndpointConfig()),
  );
}

export function registerAuthIpc(options: RegisterAuthIpcOptions = {}): void {
  const getMainWindow = options.getMainWindow ?? (() => null);
  unsubscribeSessionChanges?.();
  unsubscribeSessionChanges = subscribeStoredSessionChanges(() => {
    pushPublicAuthState(getMainWindow);
    if (!readStoredSessionSync()) stopRuntimeReconcile();
  });

  ipcMain.handle("auth:get-state", async () => buildAuthState());

  ipcMain.handle(
    "auth:save-endpoint-config",
    async (_event, config: AuthEndpointConfig) => {
      const stored = writeAuthEndpointConfig(config);
      return {
        backendUrl: stored.backendUrl,
        authPrefix: stored.authPrefix,
        aiosHomeUrl: stored.aiosHomeUrl,
      };
    },
  );

  ipcMain.handle("auth:login", async (_event, input: LoginInput) => {
    const endpoint = writeAuthEndpointConfig(input.endpointConfig);
    const session = await getAuthClient().login({
      ...input,
      endpointConfig: endpoint,
    });
    await writeStoredSession(session);
    try {
      if (getConnectionConfig().mode === "local") {
        const result = await bootstrapRuntimeProvider("login");
        notifyAcceptedRuntimeBootstrap(result);
      }
    } catch {
      /* scheduler failure must not fail portal login */
    }
    restoreExpertSubsystemAfterAuth();
    return toPublicState(session, endpoint);
  });

  ipcMain.handle("auth:logout", async () => {
    stopRuntimeReconcile();
    await clearRuntimeProvider("logout");
    const endpointConfig =
      readAuthEndpointConfig() ?? getDefaultAuthEndpointConfig();
    const session = await readStoredSession();
    if (session?.accessToken) {
      try {
        await getAuthClient().logout(endpointConfig, session.accessToken);
      } catch {
        /* ignore remote logout errors */
      }
    }
    // Same idempotent Expert dispose path as before-quit; File Platform
    // cleans temp/preview caches that replaced Expert artifact temps.
    try {
      runFilesCleanupBestEffort();
    } catch {
      // Best-effort — never block logout.
    }
    disposeExpertSubsystem();
    disposeSkillRunSubsystem();
    const endpoint = readAuthEndpointConfig();
    await clearStoredSession();
    return toPublicState(null, endpoint);
  });

  ipcMain.handle("auth:refresh", async () => {
    const endpointConfig = readAuthEndpointConfig();
    if (!endpointConfig) {
      return toPublicState(null, null);
    }
    try {
      await refreshStoredAccessToken();
      const session = await readStoredSession();
      return toPublicState(session, endpointConfig);
    } catch {
      return toPublicState(null, endpointConfig);
    }
  });
}

let restoreInFlight: Promise<RuntimeProviderPublicState> | null = null;

/**
 * Cold-start restore owned by the splash screen. Skips the bootstrap request
 * when the desktop is not local or no portal session is in memory.
 * Overlapping callers share one bootstrap so a double splash start cannot
 * supersede itself.
 */
export function restoreRuntimeProviderForSplash(): Promise<RuntimeProviderPublicState> {
  if (restoreInFlight) return restoreInFlight;
  restoreInFlight = restoreRuntimeProviderOnce().finally(() => {
    restoreInFlight = null;
  });
  return restoreInFlight;
}

async function restoreRuntimeProviderOnce(): Promise<RuntimeProviderPublicState> {
  if (getConnectionConfig().mode !== "local" || !readStoredSessionSync()) {
    return getRuntimeProviderPublicState();
  }
  try {
    const result = await bootstrapRuntimeProvider("restore");
    if (result.accepted) {
      try {
        notifyAcceptedRuntimeBootstrap(result);
      } catch {
        /* scheduler failure must not fail session restore */
      }
    }
    return result.state;
  } catch {
    return getRuntimeProviderPublicState();
  }
}

/** Test-only: drop session-change forwarder. */
export function resetAuthIpcSessionForwarderForTests(): void {
  unsubscribeSessionChanges?.();
  unsubscribeSessionChanges = null;
}
