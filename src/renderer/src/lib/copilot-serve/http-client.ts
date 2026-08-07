/**
 * Legacy Renderer Serve HTTP helpers.
 * v9.0: JSON requests go through Main `window.copilotRuntime.proxyFetch`
 * so Device Token never enters Renderer. Prefer domain IPC in later phases.
 */
export interface CopilotServeHttpConfig {
  baseUrl: string;
  /**
   * @deprecated Device Token is Main-only (v9.0). Always undefined in Renderer.
   * Kept optional for call-site compatibility during migration.
   */
  token?: string;
}

export async function copilotServeFetch<T>(
  _config: CopilotServeHttpConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  if (!window.copilotRuntime?.proxyFetch) {
    throw new Error("copilotRuntime.proxyFetch unavailable — preload not loaded");
  }

  const method = (init?.method?.toUpperCase() ?? "GET") as
    | "GET"
    | "POST"
    | "PUT"
    | "PATCH"
    | "DELETE";
  let body: unknown;
  if (init?.body != null) {
    if (typeof init.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    } else {
      body = init.body;
    }
  }

  const result = await window.copilotRuntime.proxyFetch({
    path,
    method,
    body,
  });

  if (!result.ok) {
    const message = result.error?.message || `HTTP ${result.status ?? "error"}`;
    const err = new Error(message) as Error & { code?: string };
    if (result.error?.code) err.code = result.error.code;
    throw err;
  }

  return result.data as T;
}
