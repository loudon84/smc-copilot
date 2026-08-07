/**
 * Main-process factory for @smc/runtime-client (contract-generated types).
 * Token-bearing clients must stay in Main — never construct in Renderer.
 * Uses DesktopRuntimeTransport so auth / idempotency / error mapping are preserved.
 */
import {
  createRuntimeClient,
  type RuntimeClient,
  type RuntimeStatus,
  type RuntimeCapabilities,
} from "@smc/runtime-client";
import { createDesktopRuntimeTransport } from "./desktop-runtime-transport";
import {
  DESKTOP_RUNTIME_API_VERSION,
  DESKTOP_VERSION,
  resolveServeBaseUrl,
} from "./runtime-mode";

export type { RuntimeStatus, RuntimeCapabilities, RuntimeClient };

let cached: { baseUrl: string; client: RuntimeClient } | null = null;

export function getSmcRuntimeClient(baseUrl = resolveServeBaseUrl()): RuntimeClient {
  if (cached && cached.baseUrl === baseUrl) {
    return cached.client;
  }
  const client = createRuntimeClient({
    baseUrl,
    desktopVersion: DESKTOP_VERSION,
    runtimeApiVersion: DESKTOP_RUNTIME_API_VERSION,
    transport: createDesktopRuntimeTransport(),
  });
  cached = { baseUrl, client };
  return client;
}

export async function fetchRuntimeStatusViaGeneratedClient(): Promise<RuntimeStatus> {
  return getSmcRuntimeClient().runtime.getStatus();
}
