import { session } from "electron";
import { getCachedAccessToken } from "./token-store";
import { shouldInjectTokenForUrl, TOKEN_INJECT_PARTITIONS } from "./token-inject-url";

/**
 * Injects Authorization for portal layer only (partition `persist:aios-home`), on whitelisted origins.
 * Does NOT attach to web-operator, external-browser, office, or workspaces.
 */
// @lat: [[domain/auth#Token vault and injection]]
export function installTokenHeaderInjector(): void {
  for (const partition of TOKEN_INJECT_PARTITIONS) {
    const ses = session.fromPartition(partition);
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      if (!shouldInjectTokenForUrl(details.url)) {
        callback({ requestHeaders: details.requestHeaders });
        return;
      }

      const token = getCachedAccessToken();
      if (!token) {
        callback({ requestHeaders: details.requestHeaders });
        return;
      }

      const headers = { ...details.requestHeaders };
      headers.Authorization = `Bearer ${token}`;
      callback({ requestHeaders: headers });
    });
  }

  console.log("[auth] Token header injector installed for portal partition (persist:aios-home)");
}

export async function beforeLoadAiosHome(): Promise<void> {
  const { readAuthEndpointConfig } = await import("./auth-endpoint-config-store");
  const { readStoredSession, hydrateTokenStore } = await import("./token-store");
  const { updateTokenInjectionPolicy } = await import("./token-injection-policy");
  const { ensurePortalSessionBeforeAiosHome } = await import("./portal-session-bridge");

  await hydrateTokenStore();
  const endpointConfig = readAuthEndpointConfig();
  const stored = await readStoredSession();
  updateTokenInjectionPolicy(endpointConfig, Boolean(stored?.accessToken));

  if (endpointConfig?.aiosHomeUrl && stored?.accessToken) {
    await ensurePortalSessionBeforeAiosHome(endpointConfig.aiosHomeUrl);
  }
}
