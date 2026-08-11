/**
 * Portal Auth IPC for apps/work (Login-only Phase 5).
 * Stripped of Portal view / MCP / GeneHub hooks from apps/desktop.
 */
import { ipcMain } from "electron";
import type {
  AuthEndpointConfig,
  LoginInput,
} from "../../shared/auth/auth-contract";
import { toPublicState } from "../../shared/auth/auth-contract";
import { getAuthClient } from "./auth-client";
import {
  getDefaultAuthEndpointConfig,
  readAuthEndpointConfig,
  writeAuthEndpointConfig,
} from "./auth-endpoint-config-store";
import {
  clearStoredSession,
  hydrateTokenStore,
  readStoredSession,
  writeStoredSession,
} from "./token-store";

async function buildAuthState() {
  const endpointConfig = readAuthEndpointConfig();
  const session = await readStoredSession();
  return toPublicState(session, endpointConfig);
}

export function registerAuthIpc(): void {
  void hydrateTokenStore();

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
    const endpoint = readAuthEndpointConfig();
    await clearStoredSession();
    return toPublicState(null, endpoint);
  });

  ipcMain.handle("auth:refresh", async () => {
    const endpointConfig = readAuthEndpointConfig();
    if (!endpointConfig) {
      return toPublicState(null, null);
    }
    const session = await readStoredSession();
    if (!session?.refreshToken) {
      return toPublicState(session, endpointConfig);
    }
    try {
      const refreshed = await getAuthClient().refresh(
        endpointConfig,
        session.refreshToken,
      );
      await writeStoredSession(refreshed);
      return toPublicState(refreshed, endpointConfig);
    } catch {
      await clearStoredSession();
      return toPublicState(null, endpointConfig);
    }
  });
}
