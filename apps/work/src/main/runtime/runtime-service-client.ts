/**
 * Main-only factory for @smc/runtime-client (same OpenAPI contract as apps/desktop).
 * Never construct this client from Renderer.
 */
// @lat: [[runtime-connection#Runtime Service Client]]
import {
  createRuntimeClient,
  type RuntimeClient,
} from "@smc/runtime-client";

export const DEFAULT_RUNTIME_SERVICE_URL = "http://127.0.0.1:8765";

export function resolveRuntimeServiceUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const fromEnv =
    env.HERMES_RUNTIME_SERVICE_URL?.trim() ||
    env.COPILOT_RUNTIME_URL?.trim() ||
    env.COPILOT_SERVE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  return DEFAULT_RUNTIME_SERVICE_URL;
}

let cached: { baseUrl: string; client: RuntimeClient } | null = null;

export function getRuntimeServiceClient(
  baseUrl = resolveRuntimeServiceUrl(),
): RuntimeClient {
  if (cached && cached.baseUrl === baseUrl) {
    return cached.client;
  }
  const client = createRuntimeClient({
    baseUrl,
    desktopVersion: process.env.npm_package_version ?? "work",
    runtimeApiVersion: "3.1.0",
  });
  cached = { baseUrl, client };
  return client;
}

/** Test helper — clear the singleton. */
export function resetRuntimeServiceClientForTests(): void {
  cached = null;
}
