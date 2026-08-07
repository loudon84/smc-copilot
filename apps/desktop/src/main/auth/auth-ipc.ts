import { ipcMain } from "electron";
import type { AuthEndpointConfig, LoginInput } from "../../shared/auth/auth-contract";
import { toPublicState } from "../../shared/auth/auth-contract";
import { getAuthClient } from "./auth-client";
import {
  getDefaultAuthEndpointConfig,
  readAuthEndpointConfig,
  writeAuthEndpointConfig,
} from "./auth-endpoint-config-store";
import { updateTokenInjectionPolicy } from "./token-injection-policy";
import { refreshPortalView } from "../shell/portal-view-coordinator";
import {
  clearPortalSession,
  signInPortalWithCredentials,
} from "./portal-session-bridge";
import {
  clearStoredSession,
  hydrateTokenStore,
  readStoredSession,
  writeStoredSession,
} from "./token-store";
import {
  onMcpSkillGatewayLoginSuccess,
  onMcpSkillGatewayLogout,
} from "../mcp-skill-gateway-runtime";
import { onGeneHubLoginSuccess, onGeneHubLogout } from "../genehub";

async function buildAuthState() {
  const endpointConfig = readAuthEndpointConfig();
  const session = await readStoredSession();
  updateTokenInjectionPolicy(endpointConfig, Boolean(session?.accessToken));
  return toPublicState(session, endpointConfig);
}

export function registerAuthIpc(): void {
  void hydrateTokenStore().then((session) => {
    const endpointConfig = readAuthEndpointConfig();
    updateTokenInjectionPolicy(endpointConfig, Boolean(session?.accessToken));
  });

  ipcMain.handle("auth:get-state", async () => buildAuthState());

  ipcMain.handle("auth:save-endpoint-config", async (_, config: AuthEndpointConfig) => {
    const stored = writeAuthEndpointConfig(config);
    const session = await readStoredSession();
    updateTokenInjectionPolicy(stored, Boolean(session?.accessToken));
    await refreshPortalView();
    return {
      backendUrl: stored.backendUrl,
      authPrefix: stored.authPrefix,
      aiosHomeUrl: stored.aiosHomeUrl,
    };
  });

  ipcMain.handle("auth:login", async (_, input: LoginInput) => {
    const endpoint = writeAuthEndpointConfig(input.endpointConfig);
    const session = await getAuthClient().login({
      ...input,
      endpointConfig: endpoint,
    });
    await writeStoredSession(session);
    updateTokenInjectionPolicy(endpoint, true);
    await signInPortalWithCredentials(
      endpoint.aiosHomeUrl,
      input.account ?? input.email ?? "",
      input.password,
    );
    await refreshPortalView();
    void onMcpSkillGatewayLoginSuccess();
    void onGeneHubLoginSuccess();
    return toPublicState(session, endpoint);
  });

  ipcMain.handle("auth:logout", async () => {
    const endpointConfig = readAuthEndpointConfig() ?? getDefaultAuthEndpointConfig();
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
    await clearPortalSession(endpoint?.aiosHomeUrl);
    void onMcpSkillGatewayLogout();
    onGeneHubLogout();
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
      const refreshed = await getAuthClient().refresh(endpointConfig, session.refreshToken);
      await writeStoredSession(refreshed);
      updateTokenInjectionPolicy(endpointConfig, true);
      return toPublicState(refreshed, endpointConfig);
    } catch {
      await clearStoredSession();
      return toPublicState(null, endpointConfig);
    }
  });
}
