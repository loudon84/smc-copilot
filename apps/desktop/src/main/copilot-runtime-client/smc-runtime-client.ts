/**
 * Main-process factory for @smc/runtime-client (contract-generated types).
 * Token-bearing clients must stay in Main — never construct in Renderer.
 */
import {
  createRuntimeClient,
  type RuntimeClient,
  type RuntimeStatus,
  type RuntimeCapabilities,
} from "@smc/runtime-client";
import {
  getDeviceTokenSync,
  getLegacySharedTokenSync,
} from "./runtime-auth-store";
import {
  DESKTOP_RUNTIME_API_VERSION,
  DESKTOP_VERSION,
  resolveServeBaseUrl,
} from "./runtime-mode";

export type { RuntimeStatus, RuntimeCapabilities };

export function getSmcRuntimeClient(baseUrl = resolveServeBaseUrl()): RuntimeClient {
  return createRuntimeClient({
    baseUrl,
    desktopVersion: DESKTOP_VERSION,
    runtimeApiVersion: DESKTOP_RUNTIME_API_VERSION,
    getDeviceToken: () => getDeviceTokenSync(),
    getLegacyToken: () => getLegacySharedTokenSync(),
  });
}

export async function fetchRuntimeStatusViaGeneratedClient(): Promise<RuntimeStatus> {
  return getSmcRuntimeClient().getStatus();
}
