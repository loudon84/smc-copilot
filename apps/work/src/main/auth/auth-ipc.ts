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
  hydrateTokenStore,
  readStoredSession,
  readStoredSessionSync,
  subscribeStoredSessionChanges,
  writeStoredSession,
} from "./token-store";
import {
  disposeExpertSubsystem,
  restoreExpertSubsystemAfterAuth,
} from "../expert/expert-ipc";
import { cleanupExpertArtifactTemps } from "../expert/expert-artifact-download";

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
  void hydrateTokenStore();

  const getMainWindow = options.getMainWindow ?? (() => null);
  unsubscribeSessionChanges?.();
  unsubscribeSessionChanges = subscribeStoredSessionChanges(() => {
    pushPublicAuthState(getMainWindow);
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
    restoreExpertSubsystemAfterAuth();
    return toPublicState(session, endpoint);
  });

  ipcMain.handle("auth:logout", async () => {
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
    // Same idempotent Expert dispose path as before-quit.
    cleanupExpertArtifactTemps();
    disposeExpertSubsystem();
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

/** Test-only: drop session-change forwarder. */
export function resetAuthIpcSessionForwarderForTests(): void {
  unsubscribeSessionChanges?.();
  unsubscribeSessionChanges = null;
}
